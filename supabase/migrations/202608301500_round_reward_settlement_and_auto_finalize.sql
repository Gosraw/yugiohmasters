begin;

-- =========================================================
-- ROUND-LEVEL REWARD SETTLEMENT + AUTOMATIC COMPETITION
-- FINALIZATION (Duelist Circle autonomous work session, Priority 1/2)
--
-- WHY
-- The V2 competition engine (202608231100 onward) already awards
-- per-MATCH DP (award_match_duel_points / _award_match_duel_points_
-- internal) and per-COMPETITION placement rewards (competition_
-- reward_rules / competition_reward_grants / distribute_competition_
-- rewards_v2), both idempotently. Two things were still missing/
-- manual:
--
--   1. No ROUND-level reward exists at all. A "round" here is not a
--      table - generate_round_robin_matches_v2 tags every match
--      played in the same round-robin round with the same
--      matches.round_number (a full round = every player's match
--      for that round_number, played simultaneously - NOT a single
--      match). This migration adds that layer: once every match in
--      a (competition_id, round_number) is completed, every player
--      who played that round gets a "participation" reward and
--      whoever won THEIR OWN match that round gets an additional
--      "round_winner" reward - both config-driven, both idempotent.
--
--   2. Competition finalization (finalize_competition_v2) and reward
--      distribution (distribute_competition_rewards_v2) already
--      existed and were already idempotent, but both were admin-
--      triggered actions - nothing called them automatically when
--      the last match actually completed. This migration adds
--      settle_competition_if_complete_v2(), called right after a
--      match (or tiebreak match) completes, which attempts both in
--      sequence and safely swallows the "not ready yet" case (open
--      matches remaining, or an unresolved tiebreak) so it can never
--      roll back the match result that triggered it.
--
-- CONFIG
-- No central reward-config table existed for anything round-shaped.
-- Rather than hardcoding new magic numbers, this adds
-- competition_round_reward_rules, keyed (competition_id, role) -
-- same shape/convention as the existing competition_reward_rules
-- (keyed (competition_id, placement)). install_default_round_
-- rewards_v2() seeds it defensively, mirroring install_default_
-- competition_rewards_v2()'s exact pattern.
--
-- IMPORTANT - HUMAN REVIEW NEEDED ON THE DEFAULT VALUES BELOW.
-- The autonomous work session brief mentioned "~850 DP/round +
-- Standard Pack for winner + Premium Pack for all" only as a
-- current design-discussion reference point, explicitly NOT a
-- mandate, and explicitly warned against silently inventing economy
-- values. No prior split between "participation" and "round winner
-- bonus" DP existed anywhere in this project to reuse. The defaults
-- seeded below (participation: 0 DP + 1 premium_pack voucher;
-- round_winner: 850 DP + 1 normal_pack voucher) are a best-effort,
-- clearly-flagged placeholder that uses the one concrete number the
-- brief gave (850) without guessing how it should split between the
-- two roles - a human should confirm the real split (and whether
-- participants should also get some DP, not just a pack) before this
-- is trusted as final. Changing it is a one-row UPDATE, no code
-- change required - see "easy to reconfigure" below.
-- =========================================================

-- ---------------------------------------------------------
-- 1. CONFIG: competition_round_reward_rules
-- ---------------------------------------------------------

create table if not exists public.competition_round_reward_rules (
  id uuid primary key default gen_random_uuid(),

  competition_id uuid not null
    references public.competitions(id)
    on delete cascade,

  -- 'participation' = every player who played a match in the round.
  -- 'round_winner' = the winner of each individual match in the
  -- round (there can be several per round - see header).
  role text not null
    check (role in ('participation', 'round_winner')),

  duel_points integer not null default 0
    check (duel_points >= 0),

  voucher_type text
    check (voucher_type in ('normal_pack', 'premium_pack', 'deluxe_pack', 'special_pack')),

  voucher_quantity integer not null default 0
    check (voucher_quantity >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (competition_id, role)
);

comment on table public.competition_round_reward_rules is
  'Config for automatic round-completion rewards, one row per (competition, role). Same shape/convention as competition_reward_rules (which is keyed by placement instead of role). Easy to reconfigure: UPDATE the duel_points/voucher_* columns for a competition - no code change needed. See install_default_round_rewards_v2() for the seeded defaults and this migration''s header for why they are flagged as needing human confirmation.';

-- ---------------------------------------------------------
-- 2. LEDGER: competition_round_reward_grants
--
-- Same "grants" pattern as competition_reward_grants: one row per
-- (competition, round, profile, role) actually paid out, a partial
-- unique index enforcing at most one ACTIVE grant per key, and a
-- reversed/terminal status rather than ever overwriting a row in
-- place (a reversal path is not built yet - see the final report's
-- "remaining human design decisions" - but the shape supports adding
-- one later without a further migration).
-- ---------------------------------------------------------

create table if not exists public.competition_round_reward_grants (
  id uuid primary key default gen_random_uuid(),

  competition_id uuid not null
    references public.competitions(id)
    on delete cascade,

  round_number integer not null,

  profile_id uuid not null
    references public.profiles(id)
    on delete cascade,

  reward_role text not null
    check (reward_role in ('participation', 'round_winner')),

  duel_points_granted integer not null default 0,
  voucher_type text,
  voucher_quantity integer not null default 0,

  duel_point_transaction_id uuid
    references public.duel_point_transactions(id),

  status text not null default 'granted'
    check (status in ('granted', 'reversed')),

  granted_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversal_reason text
);

comment on table public.competition_round_reward_grants is
  'One row per (competition, round, profile, role) round-completion reward actually granted. Mirrors competition_reward_grants exactly - see that table''s own comment. The partial unique index below is the idempotency guarantee: settle_round_rewards_v2() can be called any number of times (page re-render, retried RPC, re-running settlement manually) and will only ever pay out once per key.';

create unique index if not exists competition_round_reward_grants_active_unique
  on public.competition_round_reward_grants(competition_id, round_number, profile_id, reward_role)
  where status = 'granted';

create index if not exists competition_round_reward_grants_competition_idx
  on public.competition_round_reward_grants(competition_id);

-- ---------------------------------------------------------
-- 3. RLS - identical pattern to every other competition_* config/
--    ledger table (202608270900_security_hardening_rls_and_grants.sql):
--    league members can SELECT, nobody mutates directly from the
--    client - all writes happen inside SECURITY DEFINER functions.
-- ---------------------------------------------------------

alter table public.competition_round_reward_rules enable row level security;
alter table public.competition_round_reward_grants enable row level security;

drop policy if exists competition_round_reward_rules_select_league_member on public.competition_round_reward_rules;
create policy competition_round_reward_rules_select_league_member on public.competition_round_reward_rules
  for select to authenticated
  using (
    exists (
      select 1 from public.competitions c
      where c.id = competition_round_reward_rules.competition_id
        and public.is_league_member(c.league_id)
    )
  );

drop policy if exists competition_round_reward_grants_select_league_member on public.competition_round_reward_grants;
create policy competition_round_reward_grants_select_league_member on public.competition_round_reward_grants
  for select to authenticated
  using (
    exists (
      select 1 from public.competitions c
      where c.id = competition_round_reward_grants.competition_id
        and public.is_league_member(c.league_id)
    )
  );

revoke insert, update, delete on public.competition_round_reward_rules from authenticated;
revoke insert, update, delete on public.competition_round_reward_grants from authenticated;

grant select on public.competition_round_reward_rules to authenticated;
grant select on public.competition_round_reward_grants to authenticated;

-- ---------------------------------------------------------
-- 4. install_default_round_rewards_v2 - same pattern as
--    install_default_competition_rewards_v2. See the migration
--    header for why these specific numbers need human confirmation.
-- ---------------------------------------------------------

create or replace function public.install_default_round_rewards_v2(
  target_competition_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.competition_round_reward_rules (
    competition_id, role, duel_points, voucher_type, voucher_quantity
  ) values
    (target_competition_id, 'participation', 0, 'premium_pack', 1),
    (target_competition_id, 'round_winner', 850, 'normal_pack', 1)
  on conflict (competition_id, role) do nothing;
end;
$function$;

revoke all on function public.install_default_round_rewards_v2(uuid) from public;
grant execute on function public.install_default_round_rewards_v2(uuid) to authenticated;

-- ---------------------------------------------------------
-- 5. settle_round_rewards_v2 - the settlement function itself.
--
-- Called with a specific (competition_id, round_number). Returns
-- early (0 grants) if any match in that round is not yet completed,
-- or if the round has no matches at all. Otherwise grants:
--   - 'participation' to every profile who played a match in the
--     round (both players of every match)
--   - 'round_winner' to the winner_id of every match in the round
--     (each individual match's own winner - there is no single
--     round-wide winner when several matches happen in parallel)
--
-- Not admin-gated on its own: it is only ever called internally,
-- from submit_competition_match_result_v2 (already admin-gated) -
-- see section 6. It is still SECURITY DEFINER + revoked from public
-- so it can never be called directly by an authenticated client
-- either.
-- ---------------------------------------------------------

create or replace function public.settle_round_rewards_v2(
  target_competition_id uuid,
  target_round_number integer
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  incomplete_count integer;
  match_count integer;
  participant record;
  rule_row public.competition_round_reward_rules%rowtype;
  new_balance integer;
  new_tx_id uuid;
  new_grant_id uuid;
  grants_created integer := 0;
begin
  perform pg_advisory_xact_lock(
    hashtext('competition_round_settlement_' || target_competition_id::text || '_' || target_round_number::text)
  );

  select count(*) into match_count
  from public.matches
  where competition_id = target_competition_id
    and round_number = target_round_number;

  if match_count = 0 then
    return 0;
  end if;

  select count(*) into incomplete_count
  from public.matches
  where competition_id = target_competition_id
    and round_number = target_round_number
    and status <> 'completed';

  if incomplete_count > 0 then
    return 0;
  end if;

  if not exists (
    select 1 from public.competition_round_reward_rules
    where competition_id = target_competition_id
  ) then
    perform public.install_default_round_rewards_v2(target_competition_id);
  end if;

  -- ---- participation: every player who played this round ----
  for participant in
    select profile_id from (
      select player_one_id as profile_id
      from public.matches
      where competition_id = target_competition_id and round_number = target_round_number
      union
      select player_two_id as profile_id
      from public.matches
      where competition_id = target_competition_id and round_number = target_round_number
    ) players
  loop
    if exists (
      select 1 from public.competition_round_reward_grants
      where competition_id = target_competition_id
        and round_number = target_round_number
        and profile_id = participant.profile_id
        and reward_role = 'participation'
        and status = 'granted'
    ) then
      continue;
    end if;

    select * into rule_row
    from public.competition_round_reward_rules
    where competition_id = target_competition_id and role = 'participation';

    if not found then
      continue;
    end if;

    new_tx_id := null;

    insert into public.competition_round_reward_grants (
      competition_id, round_number, profile_id, reward_role,
      duel_points_granted, voucher_type, voucher_quantity, status
    ) values (
      target_competition_id, target_round_number, participant.profile_id, 'participation',
      rule_row.duel_points, rule_row.voucher_type, rule_row.voucher_quantity, 'granted'
    )
    returning id into new_grant_id;

    grants_created := grants_created + 1;

    if rule_row.duel_points > 0 then
      update public.profiles
      set duel_points = duel_points + rule_row.duel_points, updated_at = now()
      where id = participant.profile_id
      returning duel_points into new_balance;

      insert into public.duel_point_transactions (
        profile_id, amount, balance_after, reason, metadata
      ) values (
        participant.profile_id, rule_row.duel_points, new_balance, 'round_participation',
        jsonb_build_object(
          'competition_id', target_competition_id,
          'round_number', target_round_number,
          'grant_id', new_grant_id
        )
      )
      returning id into new_tx_id;

      update public.competition_round_reward_grants
      set duel_point_transaction_id = new_tx_id
      where id = new_grant_id;
    end if;

    if rule_row.voucher_type is not null and rule_row.voucher_quantity > 0 then
      insert into public.reward_vouchers (
        profile_id, voucher_type, quantity, source_type, source_id
      ) values (
        participant.profile_id, rule_row.voucher_type, rule_row.voucher_quantity,
        'round_reward', target_competition_id
      );
    end if;
  end loop;

  -- ---- round_winner: the winner of each individual match this round ----
  for participant in
    select distinct winner_id as profile_id
    from public.matches
    where competition_id = target_competition_id
      and round_number = target_round_number
      and winner_id is not null
  loop
    if exists (
      select 1 from public.competition_round_reward_grants
      where competition_id = target_competition_id
        and round_number = target_round_number
        and profile_id = participant.profile_id
        and reward_role = 'round_winner'
        and status = 'granted'
    ) then
      continue;
    end if;

    select * into rule_row
    from public.competition_round_reward_rules
    where competition_id = target_competition_id and role = 'round_winner';

    if not found then
      continue;
    end if;

    new_tx_id := null;

    insert into public.competition_round_reward_grants (
      competition_id, round_number, profile_id, reward_role,
      duel_points_granted, voucher_type, voucher_quantity, status
    ) values (
      target_competition_id, target_round_number, participant.profile_id, 'round_winner',
      rule_row.duel_points, rule_row.voucher_type, rule_row.voucher_quantity, 'granted'
    )
    returning id into new_grant_id;

    grants_created := grants_created + 1;

    if rule_row.duel_points > 0 then
      update public.profiles
      set duel_points = duel_points + rule_row.duel_points, updated_at = now()
      where id = participant.profile_id
      returning duel_points into new_balance;

      insert into public.duel_point_transactions (
        profile_id, amount, balance_after, reason, metadata
      ) values (
        participant.profile_id, rule_row.duel_points, new_balance, 'round_winner_bonus',
        jsonb_build_object(
          'competition_id', target_competition_id,
          'round_number', target_round_number,
          'grant_id', new_grant_id
        )
      )
      returning id into new_tx_id;

      update public.competition_round_reward_grants
      set duel_point_transaction_id = new_tx_id
      where id = new_grant_id;
    end if;

    if rule_row.voucher_type is not null and rule_row.voucher_quantity > 0 then
      insert into public.reward_vouchers (
        profile_id, voucher_type, quantity, source_type, source_id
      ) values (
        participant.profile_id, rule_row.voucher_type, rule_row.voucher_quantity,
        'round_reward', target_competition_id
      );
    end if;
  end loop;

  return grants_created;
end;
$function$;

revoke all on function public.settle_round_rewards_v2(uuid, integer) from public;
-- Intentionally NOT granted to authenticated - this is an internal
-- helper only ever called from within submit_competition_match_
-- result_v2 (already admin-gated), never directly by a client.

-- ---------------------------------------------------------
-- 6. settle_competition_if_complete_v2 - attempts finalize +
--    distribute in sequence and NEVER lets a "not ready yet"
--    condition (open matches, unresolved tiebreak) propagate as an
--    error - both are expected, normal states right after a single
--    match completes, not failures. Also never lets a distribute
--    failure roll back a finalize that already succeeded.
--
-- finalize_competition_v2 and distribute_competition_rewards_v2 are
-- BOTH already fully idempotent (see their own comments) - calling
-- either of them redundantly after every single match/tiebreak
-- result is always safe, just usually a fast no-op.
-- ---------------------------------------------------------

create or replace function public.settle_competition_if_complete_v2(
  target_competition_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  begin
    perform public.finalize_competition_v2(target_competition_id);
  exception when others then
    -- Expected: matches still open, or a tiebreak needs to be played
    -- first (finalize_competition_v2 raises in both cases). Not an
    -- error from this function's point of view.
    return;
  end;

  begin
    perform public.distribute_competition_rewards_v2(target_competition_id);
  exception when others then
    raise warning 'settle_competition_if_complete_v2: distribute_competition_rewards_v2 failed for competition %: %', target_competition_id, sqlerrm;
  end;
end;
$function$;

revoke all on function public.settle_competition_if_complete_v2(uuid) from public;
-- Intentionally NOT granted to authenticated - internal helper only,
-- same reasoning as settle_round_rewards_v2 above.

-- ---------------------------------------------------------
-- 7. Wire both into the two places a competition match can newly
--    reach "completed": a normal result submission, and a tiebreak
--    match result. Everything above the new two `perform` lines in
--    each function is byte-for-byte identical to the prior version
--    (202608270930 / 202608271000) - only the settlement calls at
--    the end are new.
-- ---------------------------------------------------------

create or replace function public.submit_competition_match_result_v2(
  target_match_id uuid,
  target_player_one_duel_wins integer,
  target_player_two_duel_wins integer
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_user_id uuid;
  match_row public.matches%rowtype;
  competition_row public.competitions%rowtype;
  is_admin boolean;
  computed_winner uuid;
  computed_result public.match_result_type;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select * into match_row from public.matches where id = target_match_id for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if match_row.competition_id is null then
    raise exception 'This match is not part of a competition.';
  end if;

  select * into competition_row from public.competitions where id = match_row.competition_id;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can submit competition results.';
  end if;

  if match_row.status = 'completed' then
    raise exception 'This match already has a result - use correct_competition_match_result_v2 to change it.';
  end if;

  if match_row.match_format = 'single_duel' then
    if not (
      (target_player_one_duel_wins = 1 and target_player_two_duel_wins = 0)
      or (target_player_one_duel_wins = 0 and target_player_two_duel_wins = 1)
    ) then
      raise exception 'Single Duel requires exactly one winner (1-0 or 0-1).';
    end if;
  else
    if not (
      (target_player_one_duel_wins = 2 and target_player_two_duel_wins in (0, 1))
      or (target_player_two_duel_wins = 2 and target_player_one_duel_wins in (0, 1))
    ) then
      raise exception 'Best of 3 requires a first-to-2 score (2-0 or 2-1).';
    end if;
  end if;

  if target_player_one_duel_wins > target_player_two_duel_wins then
    computed_winner := match_row.player_one_id;
    computed_result := 'player_one_win';
  else
    computed_winner := match_row.player_two_id;
    computed_result := 'player_two_win';
  end if;

  update public.matches
  set
    player_one_duel_wins = target_player_one_duel_wins,
    player_two_duel_wins = target_player_two_duel_wins,
    winner_id = computed_winner,
    result = computed_result,
    status = 'completed',
    completed_at = now(),
    updated_at = now()
  where id = target_match_id;

  perform public._award_match_duel_points_internal(target_match_id);

  perform public.refresh_competition_current_round_v2(match_row.competition_id);

  -- NEW: automatic round + competition settlement (Priority 1/2).
  perform public.settle_round_rewards_v2(match_row.competition_id, match_row.round_number);
  perform public.settle_competition_if_complete_v2(match_row.competition_id);
end;
$function$;

revoke all on function public.submit_competition_match_result_v2(uuid, integer, integer) from public;
grant execute on function public.submit_competition_match_result_v2(uuid, integer, integer) to authenticated;

create or replace function public.submit_competition_tiebreak_match_result(
  target_match_id uuid,
  target_player_one_duel_wins integer,
  target_player_two_duel_wins integer
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_user_id uuid;
  match_row public.matches%rowtype;
  tiebreak_row public.competition_tiebreaks%rowtype;
  competition_row public.competitions%rowtype;
  is_admin boolean;
  computed_winner uuid;
  computed_loser uuid;
  computed_result public.match_result_type;
  most_recent_opponent uuid;
  second_most_recent_opponent uuid;
  tiebreak_resolved boolean := false;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select * into match_row from public.matches where id = target_match_id for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if match_row.tiebreak_id is null then
    raise exception 'This match is not a tiebreak match - use submit_competition_match_result_v2.';
  end if;

  if match_row.status = 'completed' then
    raise exception 'This tiebreak match already has a result.';
  end if;

  select * into tiebreak_row from public.competition_tiebreaks where id = match_row.tiebreak_id for update;
  select * into competition_row from public.competitions where id = tiebreak_row.competition_id;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can submit tiebreak results.';
  end if;

  if tiebreak_row.status = 'resolved' then
    raise exception 'This tiebreak has already been resolved.';
  end if;

  if match_row.match_format = 'single_duel' then
    if not (
      (target_player_one_duel_wins = 1 and target_player_two_duel_wins = 0)
      or (target_player_one_duel_wins = 0 and target_player_two_duel_wins = 1)
    ) then
      raise exception 'Single Duel requires exactly one winner (1-0 or 0-1).';
    end if;
  else
    if not (
      (target_player_one_duel_wins = 2 and target_player_two_duel_wins in (0, 1))
      or (target_player_two_duel_wins = 2 and target_player_one_duel_wins in (0, 1))
    ) then
      raise exception 'Best of 3 requires a first-to-2 score (2-0 or 2-1).';
    end if;
  end if;

  if target_player_one_duel_wins > target_player_two_duel_wins then
    computed_winner := match_row.player_one_id;
    computed_loser := match_row.player_two_id;
    computed_result := 'player_one_win';
  else
    computed_winner := match_row.player_two_id;
    computed_loser := match_row.player_one_id;
    computed_result := 'player_two_win';
  end if;

  update public.matches
  set
    player_one_duel_wins = target_player_one_duel_wins,
    player_two_duel_wins = target_player_two_duel_wins,
    winner_id = computed_winner,
    result = computed_result,
    status = 'completed',
    completed_at = now(),
    updated_at = now()
  where id = target_match_id;

  if tiebreak_row.tie_size = 2 then
    update public.competition_tiebreaks
    set
      status = 'resolved',
      resolved_order = array[computed_winner, computed_loser],
      resolved_at = now()
    where id = tiebreak_row.id;
    tiebreak_resolved := true;
  else
    if tiebreak_row.streak_holder_id is null or tiebreak_row.streak_holder_id <> computed_winner then
      update public.competition_tiebreaks
      set streak_holder_id = computed_winner, streak_count = 1
      where id = tiebreak_row.id;
    elsif tiebreak_row.streak_count + 1 < 2 then
      update public.competition_tiebreaks
      set streak_count = tiebreak_row.streak_count + 1
      where id = tiebreak_row.id;
    else
      most_recent_opponent := computed_loser;

      select case when player_one_id = computed_winner then player_two_id else player_one_id end
      into second_most_recent_opponent
      from public.matches
      where tiebreak_id = tiebreak_row.id
        and status = 'completed'
        and id <> target_match_id
        and (player_one_id = computed_winner or player_two_id = computed_winner)
      order by completed_at desc
      limit 1;

      if second_most_recent_opponent is null then
        raise exception 'Could not determine the tiebreak''s prior deciding match - data inconsistency.';
      end if;

      update public.competition_tiebreaks
      set
        status = 'resolved',
        streak_count = tiebreak_row.streak_count + 1,
        resolved_order = array[computed_winner, most_recent_opponent, second_most_recent_opponent],
        resolved_at = now()
      where id = tiebreak_row.id;
      tiebreak_resolved := true;
    end if;
  end if;

  -- NEW: a resolved tiebreak means the competition may now be
  -- finalize-able (this was the exact "not ready" reason finalize_
  -- competition_v2 would otherwise raise on).
  if tiebreak_resolved then
    perform public.settle_competition_if_complete_v2(competition_row.id);
  end if;
end;
$function$;

revoke all on function public.submit_competition_tiebreak_match_result(uuid, integer, integer) from public;
grant execute on function public.submit_competition_tiebreak_match_result(uuid, integer, integer) to authenticated;

commit;
