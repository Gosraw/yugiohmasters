begin;

-- =========================================================
-- Admin plays in the duel = the opponent has to say OK (2026-10-15)
--
-- Owner decision B (QA fix round). A league admin used to be able to
-- overrule a duel they PLAY in: correct a finished season duel,
-- resolve a disputed practice duel (wagers included) or enter a
-- tiebreak result, all final at once. New rule:
--
--   * the admin is one of the two players -> the correction /
--     resolution / tiebreak result becomes a PROPOSAL
--     (public.match_result_proposals). Nothing changes until the
--     opponent accepts it; the opponent can also reject it, and the
--     admin can withdraw it. A new proposal for the same duel
--     replaces the open one ('superseded').
--   * the admin does NOT play in the duel -> unchanged, instant.
--
-- How it is built (no signature changes, backwards compatible with
-- the live main app):
--   * the old bodies of correct_competition_match_result_v2 and
--     submit_competition_tiebreak_match_result (live definitions,
--     202610120120 / 202608301500) move unchanged - minus their
--     auth.uid() admin check - into internal functions
--     _apply_competition_match_correction / _apply_competition_
--     tiebreak_result. The public RPCs keep their names, arguments
--     and admin check, validate, and then either apply (referee) or
--     store a proposal (admin plays).
--   * resolve_disputed_match is re-created the same way (including
--     the season-duel guard 202610121800 patched into it), with the
--     update moved into _apply_practice_dispute_resolution.
--   * accept_ / reject_ / withdraw_match_result_proposal(uuid): the
--     opponent's answer. Accepting runs the same internal function
--     the referee path runs, so DP, round rewards, standings, wagers
--     (settled by the app right after, like a normal confirm) work
--     exactly the same.
--
-- On the live main app an admin who corrects their own duel now
-- sees "saved" while it is only a proposal (main has no screen to
-- accept it). That is the intended new rule; v2 shows and handles
-- the proposals.
--
-- Small fix in the same place (QA low): _apply_competition_match_
-- result clears disputed_by / disputed_at / dispute_reason when a
-- duel completes (a settled dispute no longer shows as disputed in
-- old screens / exports).
-- =========================================================

-- ---------------------------------------------------------
-- 1. Proposals table
-- ---------------------------------------------------------

create table if not exists public.match_result_proposals (
  id uuid primary key default gen_random_uuid(),

  match_id uuid not null
    references public.matches(id)
    on delete cascade,

  league_id uuid not null
    references public.leagues(id)
    on delete cascade,

  competition_id uuid
    references public.competitions(id)
    on delete cascade,

  kind text not null
    check (kind in ('competition_correction', 'tiebreak_result', 'practice_resolution')),

  -- The admin who plays in the duel.
  proposed_by uuid not null
    references public.profiles(id)
    on delete cascade,

  -- The opponent: the only one who can accept / reject.
  respond_by uuid not null
    references public.profiles(id)
    on delete cascade,

  -- competition_correction / tiebreak_result
  player_one_duel_wins integer,
  player_two_duel_wins integer,

  -- practice_resolution (a practice duel can end in a draw)
  proposed_result public.match_result_type,

  reason text,

  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'withdrawn', 'superseded')),

  response_note text,

  created_at timestamptz not null default now(),
  decided_at timestamptz,

  constraint match_result_proposals_two_people
    check (proposed_by <> respond_by),

  constraint match_result_proposals_payload
    check (
      (kind = 'practice_resolution' and proposed_result is not null)
      or (
        kind <> 'practice_resolution'
        and player_one_duel_wins is not null
        and player_two_duel_wins is not null
      )
    )
);

comment on table public.match_result_proposals is
  'A result change proposed by a league admin for a duel they play in (correction, tiebreak result, disputed practice duel). Takes effect only when the opponent (respond_by) accepts it. Written only by SECURITY DEFINER functions (202610152010).';

create unique index if not exists match_result_proposals_one_open
  on public.match_result_proposals (match_id)
  where status = 'pending';

create index if not exists match_result_proposals_respond_idx
  on public.match_result_proposals (respond_by)
  where status = 'pending';

create index if not exists match_result_proposals_competition_idx
  on public.match_result_proposals (competition_id)
  where competition_id is not null;

create index if not exists match_result_proposals_proposed_by_idx
  on public.match_result_proposals (proposed_by);

alter table public.match_result_proposals enable row level security;

drop policy if exists match_result_proposals_read_league on public.match_result_proposals;

create policy match_result_proposals_read_league
on public.match_result_proposals
for select
to authenticated
using (
  (select public.is_league_member(league_id))
);

revoke all on public.match_result_proposals from anon, authenticated;
grant select on public.match_result_proposals to authenticated;

-- ---------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------

-- Same score rules as submit_competition_match_result_v2.
create or replace function public._check_competition_duel_score(
  target_match_format text,
  target_player_one_duel_wins integer,
  target_player_two_duel_wins integer
)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if target_match_format = 'single_duel' then
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
end;
$$;

revoke all on function public._check_competition_duel_score(text, integer, integer) from public, anon, authenticated;

-- Store a proposal from an admin who plays in the duel. Replaces an
-- open proposal for the same duel. Returns the new proposal id.
create or replace function public._propose_match_result(
  target_match_id uuid,
  target_kind text,
  target_proposed_by uuid,
  target_player_one_duel_wins integer,
  target_player_two_duel_wins integer,
  target_result public.match_result_type,
  target_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  match_row public.matches%rowtype;
  opponent_id uuid;
  new_id uuid;
begin
  select * into match_row from public.matches where id = target_match_id;

  if not found then
    raise exception 'Match not found.';
  end if;

  if target_proposed_by = match_row.player_one_id then
    opponent_id := match_row.player_two_id;
  elsif target_proposed_by = match_row.player_two_id then
    opponent_id := match_row.player_one_id;
  else
    raise exception 'Only a player in this duel can propose a result for it.';
  end if;

  update public.match_result_proposals
  set
    status = 'superseded',
    decided_at = now()
  where match_id = target_match_id
    and status = 'pending';

  insert into public.match_result_proposals (
    match_id,
    league_id,
    competition_id,
    kind,
    proposed_by,
    respond_by,
    player_one_duel_wins,
    player_two_duel_wins,
    proposed_result,
    reason
  )
  values (
    target_match_id,
    match_row.league_id,
    match_row.competition_id,
    target_kind,
    target_proposed_by,
    opponent_id,
    target_player_one_duel_wins,
    target_player_two_duel_wins,
    target_result,
    nullif(trim(target_reason), '')
  )
  returning id
  into new_id;

  return new_id;
end;
$$;

revoke all on function public._propose_match_result(uuid, text, uuid, integer, integer, public.match_result_type, text)
  from public, anon, authenticated;

-- A referee decision (admin not in the duel) makes any open
-- proposal for that duel obsolete.
create or replace function public._supersede_match_result_proposals(target_match_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.match_result_proposals
  set
    status = 'superseded',
    decided_at = now()
  where match_id = target_match_id
    and status = 'pending';
$$;

revoke all on function public._supersede_match_result_proposals(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------
-- 3. Completion path: also clears the dispute fields.
-- Body = 202610121800_season_result_confirmation.sql + 3 columns.
-- ---------------------------------------------------------

create or replace function public._apply_competition_match_result(
  target_match_id uuid,
  target_player_one_duel_wins integer,
  target_player_two_duel_wins integer,
  target_submitted_by uuid,
  target_confirmed_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  match_row public.matches%rowtype;
begin
  select * into match_row from public.matches where id = target_match_id for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if match_row.status = 'completed' then
    return;
  end if;

  update public.matches
  set
    player_one_duel_wins = target_player_one_duel_wins,
    player_two_duel_wins = target_player_two_duel_wins,
    winner_id = case
      when target_player_one_duel_wins > target_player_two_duel_wins then match_row.player_one_id
      else match_row.player_two_id
    end,
    result = case
      when target_player_one_duel_wins > target_player_two_duel_wins then 'player_one_win'::public.match_result_type
      else 'player_two_win'::public.match_result_type
    end,
    status = 'completed',
    result_submitted_by = target_submitted_by,
    result_submitted_at = case
      when match_row.result_submitted_by = target_submitted_by
        then coalesce(match_row.result_submitted_at, now())
      else now()
    end,
    result_confirmed_by = target_confirmed_by,
    result_confirmed_at = now(),
    disputed_by = null,
    disputed_at = null,
    dispute_reason = null,
    completed_at = now(),
    updated_at = now()
  where id = target_match_id;

  perform public._award_match_duel_points_internal(target_match_id);

  perform public.refresh_competition_current_round_v2(match_row.competition_id);

  perform public.settle_round_rewards_v2(match_row.competition_id, match_row.round_number);
  perform public.settle_competition_if_complete_v2(match_row.competition_id);
end;
$$;

revoke all on function public._apply_competition_match_result(uuid, integer, integer, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------
-- 4. Season duel correction.
-- 4a. The old body (live definition from 202610120120), unchanged
--     except: no auth.uid() / admin check (the callers below do it).
-- ---------------------------------------------------------

create or replace function public._apply_competition_match_correction(target_match_id uuid, target_player_one_duel_wins integer, target_player_two_duel_wins integer, target_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  match_row public.matches%rowtype;
  competition_row public.competitions%rowtype;
  computed_winner uuid;
  computed_result public.match_result_type;
  new_standing record;
  old_result_row record;
  old_grant record;
  rule_row public.competition_reward_rules%rowtype;
  new_tx_id uuid;
  new_grant_id uuid;
  debit_row record;
  actual_dp_reversal integer;
  dp_unrecovered integer;
  reversal_tx_id uuid;
  voucher_row record;
  voucher_recovered integer;
  voucher_unrecovered integer;
  match_dp_row record;
  match_dp_new_reward integer;
  match_dp_prior_total integer;
  match_dp_delta integer;
  match_dp_correction_reason text;
  match_dp_opponent text;
  match_dp_result_label text;
begin
  if target_reason is null or length(trim(target_reason)) = 0 then
    raise exception 'A correction reason is required.';
  end if;

  select *
  into match_row
  from public.matches
  where id = target_match_id
  for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if match_row.competition_id is null then
    raise exception 'This match is not part of a competition.';
  end if;

  if match_row.status <> 'completed' then
    raise exception 'Only a completed match can be corrected - use submit_competition_match_result_v2 first.';
  end if;

  perform pg_advisory_xact_lock(hashtext('competition_reward_lifecycle_' || match_row.competition_id::text));

  select *
  into competition_row
  from public.competitions
  where id = match_row.competition_id
  for update;

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
    notes = coalesce(notes || E'\n', '') || '[correction] ' || target_reason,
    updated_at = now()
  where id = target_match_id;

  -- ------------------------------------------------
  -- MATCH-LEVEL DP: delta against the ACTUAL ledger total for this
  -- match/player ('match_reward' + every 'match_reward_correction_N'),
  -- so repeated corrections stay exact. Each correction gets its own
  -- numbered reason because of duel_point_transactions_match_reason_
  -- unique (match_id, profile_id, reason).
  -- ------------------------------------------------
  if match_row.match_type = 'league' then
    for match_dp_row in
      select *
      from (
        values
          (match_row.player_one_id, match_row.player_two_id),
          (match_row.player_two_id, match_row.player_one_id)
      ) as t(player_id, other_id)
    loop
      match_dp_new_reward := public._compute_league_match_reward(
        computed_winner,
        match_dp_row.player_id,
        match_dp_row.other_id
      );

      match_dp_prior_total := coalesce((
        select sum(amount)
        from public.duel_point_transactions
        where match_id = target_match_id
          and profile_id = match_dp_row.player_id
          and (reason = 'match_reward' or reason like 'match_reward_correction%')
      ), 0);

      match_dp_delta := match_dp_new_reward - match_dp_prior_total;

      if match_dp_delta = 0 then
        continue;
      end if;

      match_dp_correction_reason := 'match_reward_correction_' || (
        1 + (
          select count(*)
          from public.duel_point_transactions
          where match_id = target_match_id
            and profile_id = match_dp_row.player_id
            and reason like 'match_reward_correction%'
        )
      )::text;

      select p.username
      into match_dp_opponent
      from public.profiles p
      where p.id = match_dp_row.other_id;

      match_dp_result_label := case
        when computed_winner = match_dp_row.player_id then 'a win'
        else 'a loss'
      end;

      if match_dp_delta > 0 then
        perform public._credit_duel_points(
          match_dp_row.player_id,
          match_dp_delta,
          match_dp_correction_reason,
          target_match_id,
          'Competition match result corrected.',
          jsonb_build_object(
            'correction_reason', target_reason,
            'delta', match_dp_delta,
            'competition_id', match_row.competition_id
          ),
          'Duel result corrected — now ' || match_dp_result_label
            || ' vs ' || coalesce(match_dp_opponent, 'your opponent')
        );
      else
        perform public._debit_duel_points(
          match_dp_row.player_id,
          -match_dp_delta,
          match_dp_correction_reason,
          target_match_id,
          'Competition match result corrected.',
          jsonb_build_object(
            'correction_reason', target_reason,
            'requested_delta', match_dp_delta,
            'competition_id', match_row.competition_id
          ),
          'Duel result corrected — now ' || match_dp_result_label
            || ' vs ' || coalesce(match_dp_opponent, 'your opponent'),
          true
        );
      end if;
    end loop;
  end if;

  -- ------------------------------------------------
  -- FULL-CYCLE ROUND REWARDS: re-settle the cycle this match belongs
  -- to (reverses grants that no longer match, grants the new ones).
  -- Tiebreak matches are not part of any cycle.
  -- ------------------------------------------------
  if match_row.tiebreak_id is null and match_row.round_number is not null then
    perform public._settle_round_cycle(
      match_row.competition_id,
      match_row.round_number,
      target_reason
    );
  end if;

  if competition_row.status <> 'completed' then
    -- Not finalized yet: live standings simply reflect the corrected
    -- match on the next read.
    return;
  end if;

  -- ------------------------------------------------
  -- END-OF-COMPETITION PLACEMENT (finalized competitions only).
  -- ------------------------------------------------
  for new_standing in
    select *
    from public.get_competition_standings_v2(match_row.competition_id)
  loop
    select *
    into old_result_row
    from public.competition_results
    where competition_id = match_row.competition_id
      and profile_id = new_standing.profile_id;

    update public.competition_results
    set
      placement = new_standing.placement,
      wins = new_standing.wins,
      losses = new_standing.losses,
      draws = new_standing.draws,
      points = new_standing.points
    where competition_id = match_row.competition_id
      and profile_id = new_standing.profile_id;

    if old_result_row is null or old_result_row.placement is distinct from new_standing.placement then
      select *
      into old_grant
      from public.competition_reward_grants
      where competition_id = match_row.competition_id
        and profile_id = new_standing.profile_id
        and status = 'granted';

      if found then
        reversal_tx_id := null;
        actual_dp_reversal := 0;
        dp_unrecovered := 0;
        voucher_recovered := 0;
        voucher_unrecovered := 0;

        if old_grant.duel_points_granted > 0 then
          select *
          into debit_row
          from public._debit_duel_points(
            new_standing.profile_id,
            old_grant.duel_points_granted,
            'competition_reward_reversal',
            null,
            target_reason,
            jsonb_build_object(
              'competition_id', match_row.competition_id,
              'previous_placement', old_grant.placement,
              'reason', target_reason,
              'grant_id', old_grant.id
            ),
            competition_row.name || ' result corrected — '
              || public._ordinal_label(old_grant.placement) || ' place reward taken back',
            true
          );

          actual_dp_reversal := debit_row.debited;
          dp_unrecovered := debit_row.unrecovered;
          reversal_tx_id := debit_row.transaction_id;
        end if;

        if old_grant.voucher_type is not null and old_grant.voucher_quantity > 0 then
          for voucher_row in
            select id, quantity
            from public.reward_vouchers
            where competition_reward_grant_id = old_grant.id
            for update
          loop
            voucher_recovered := voucher_recovered + voucher_row.quantity;
          end loop;

          voucher_unrecovered := greatest(0, old_grant.voucher_quantity - voucher_recovered);

          delete from public.reward_vouchers
          where competition_reward_grant_id = old_grant.id;
        end if;

        update public.competition_reward_grants
        set
          status = 'reversed',
          reversed_at = now(),
          reversal_reason = target_reason,
          duel_points_recovered = actual_dp_reversal,
          duel_points_unrecovered = dp_unrecovered,
          voucher_quantity_recovered = voucher_recovered,
          voucher_quantity_unrecovered = voucher_unrecovered
        where id = old_grant.id;
      end if;

      select *
      into rule_row
      from public.competition_reward_rules
      where competition_id = match_row.competition_id
        and placement = new_standing.placement;

      if found then
        new_tx_id := null;

        insert into public.competition_reward_grants (
          competition_id,
          profile_id,
          placement,
          duel_points_granted,
          voucher_type,
          voucher_quantity,
          duel_point_transaction_id,
          status
        )
        values (
          match_row.competition_id,
          new_standing.profile_id,
          new_standing.placement,
          coalesce(rule_row.duel_points, 0),
          rule_row.voucher_type,
          coalesce(rule_row.voucher_quantity, 0),
          null,
          'granted'
        )
        returning id
        into new_grant_id;

        if rule_row.duel_points > 0 then
          new_tx_id := public._credit_duel_points(
            new_standing.profile_id,
            rule_row.duel_points,
            'competition_reward',
            null,
            competition_row.name,
            jsonb_build_object(
              'competition_id', match_row.competition_id,
              'placement', new_standing.placement,
              'correction_reason', target_reason,
              'grant_id', new_grant_id
            ),
            competition_row.name || ' finished — '
              || public._ordinal_label(new_standing.placement::integer)
              || ' place (after a result correction)'
          );

          update public.competition_reward_grants
          set duel_point_transaction_id = new_tx_id
          where id = new_grant_id;
        end if;

        if rule_row.voucher_type is not null and rule_row.voucher_quantity > 0 then
          insert into public.reward_vouchers (
            profile_id,
            voucher_type,
            quantity,
            source_type,
            source_id,
            competition_reward_grant_id
          )
          values (
            new_standing.profile_id,
            rule_row.voucher_type,
            rule_row.voucher_quantity,
            'competition_reward_correction',
            match_row.competition_id,
            new_grant_id
          );
        end if;
      end if;
    end if;
  end loop;
end;
$function$
;

revoke all on function public._apply_competition_match_correction(uuid, integer, integer, text) from public, anon, authenticated;

-- 4b. The public RPC: same name, arguments and admin check as before.
create or replace function public.correct_competition_match_result_v2(
  target_match_id uuid,
  target_player_one_duel_wins integer,
  target_player_two_duel_wins integer,
  target_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  match_row public.matches%rowtype;
  is_admin boolean;
begin
  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  if target_reason is null or length(trim(target_reason)) = 0 then
    raise exception 'A correction reason is required.';
  end if;

  select * into match_row from public.matches where id = target_match_id for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if match_row.competition_id is null then
    raise exception 'This match is not part of a competition.';
  end if;

  if match_row.status <> 'completed' then
    raise exception 'Only a completed match can be corrected - use submit_competition_match_result_v2 first.';
  end if;

  select (lm.role = 'admin')
  into is_admin
  from public.competitions c
  join public.league_members lm
    on lm.league_id = c.league_id
   and lm.profile_id = current_user_id
  where c.id = match_row.competition_id;

  if is_admin is not true then
    raise exception 'Only a league admin can correct competition results.';
  end if;

  perform public._check_competition_duel_score(
    match_row.match_format,
    target_player_one_duel_wins,
    target_player_two_duel_wins
  );

  -- The admin plays in this duel: only a proposal.
  if current_user_id in (match_row.player_one_id, match_row.player_two_id) then
    if match_row.player_one_duel_wins = target_player_one_duel_wins
       and match_row.player_two_duel_wins = target_player_two_duel_wins then
      raise exception 'That is already the result of this duel.';
    end if;

    perform public._propose_match_result(
      target_match_id,
      'competition_correction',
      current_user_id,
      target_player_one_duel_wins,
      target_player_two_duel_wins,
      null,
      target_reason
    );
    return;
  end if;

  -- Referee: final at once.
  perform public._supersede_match_result_proposals(target_match_id);

  perform public._apply_competition_match_correction(
    target_match_id,
    target_player_one_duel_wins,
    target_player_two_duel_wins,
    target_reason
  );
end;
$$;

revoke all on function public.correct_competition_match_result_v2(uuid, integer, integer, text) from public, anon;
grant execute on function public.correct_competition_match_result_v2(uuid, integer, integer, text) to authenticated;

-- ---------------------------------------------------------
-- 5. Tiebreak result.
-- 5a. The old body (live definition from 202608301500), unchanged
--     except: no auth.uid() / admin check.
-- ---------------------------------------------------------

create or replace function public._apply_competition_tiebreak_result(target_match_id uuid, target_player_one_duel_wins integer, target_player_two_duel_wins integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  match_row public.matches%rowtype;
  tiebreak_row public.competition_tiebreaks%rowtype;
  competition_row public.competitions%rowtype;
  computed_winner uuid;
  computed_loser uuid;
  computed_result public.match_result_type;
  most_recent_opponent uuid;
  second_most_recent_opponent uuid;
  tiebreak_resolved boolean := false;
begin
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
$function$
;

revoke all on function public._apply_competition_tiebreak_result(uuid, integer, integer) from public, anon, authenticated;

-- 5b. The public RPC: same name, arguments and admin check.
create or replace function public.submit_competition_tiebreak_match_result(
  target_match_id uuid,
  target_player_one_duel_wins integer,
  target_player_two_duel_wins integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  match_row public.matches%rowtype;
  tiebreak_row public.competition_tiebreaks%rowtype;
  is_admin boolean;
begin
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

  select * into tiebreak_row from public.competition_tiebreaks where id = match_row.tiebreak_id;

  select (lm.role = 'admin')
  into is_admin
  from public.competitions c
  join public.league_members lm
    on lm.league_id = c.league_id
   and lm.profile_id = current_user_id
  where c.id = tiebreak_row.competition_id;

  if is_admin is not true then
    raise exception 'Only a league admin can submit tiebreak results.';
  end if;

  if tiebreak_row.status = 'resolved' then
    raise exception 'This tiebreak has already been resolved.';
  end if;

  perform public._check_competition_duel_score(
    match_row.match_format,
    target_player_one_duel_wins,
    target_player_two_duel_wins
  );

  -- The admin plays in this tiebreak duel: only a proposal.
  if current_user_id in (match_row.player_one_id, match_row.player_two_id) then
    perform public._propose_match_result(
      target_match_id,
      'tiebreak_result',
      current_user_id,
      target_player_one_duel_wins,
      target_player_two_duel_wins,
      null,
      null
    );
    return;
  end if;

  perform public._supersede_match_result_proposals(target_match_id);

  perform public._apply_competition_tiebreak_result(
    target_match_id,
    target_player_one_duel_wins,
    target_player_two_duel_wins
  );

  update public.matches
  set
    result_submitted_by = current_user_id,
    result_submitted_at = now(),
    result_confirmed_by = current_user_id,
    result_confirmed_at = now()
  where id = target_match_id;
end;
$$;

revoke all on function public.submit_competition_tiebreak_match_result(uuid, integer, integer) from public, anon;
grant execute on function public.submit_competition_tiebreak_match_result(uuid, integer, integer) to authenticated;

-- ---------------------------------------------------------
-- 6. Disputed PRACTICE duel (wagers included).
-- 6a. The final update of resolve_disputed_match
--     (202608190011), as an internal function.
-- ---------------------------------------------------------

create or replace function public._apply_practice_dispute_resolution(
  target_match_id uuid,
  target_result public.match_result_type,
  target_notes text,
  target_resolved_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  match_row public.matches%rowtype;
  resolved_winner_id uuid;
begin
  select * into match_row from public.matches where id = target_match_id for update;

  if not found then
    raise exception 'Match not found';
  end if;

  if match_row.competition_id is not null then
    raise exception 'Set a disputed season duel''s result on its competition page.';
  end if;

  if match_row.status <> 'disputed' then
    raise exception 'Only disputed matches can be resolved';
  end if;

  if target_result = 'player_one_win' then
    resolved_winner_id := match_row.player_one_id;
  elsif target_result = 'player_two_win' then
    resolved_winner_id := match_row.player_two_id;
  elsif target_result = 'draw' then
    resolved_winner_id := null;
  else
    raise exception 'Invalid match result';
  end if;

  update public.matches
  set
    status = 'completed',
    result = target_result,
    winner_id = resolved_winner_id,
    notes = coalesce(nullif(trim(target_notes), ''), notes),
    result_confirmed_by = target_resolved_by,
    result_confirmed_at = now(),
    completed_at = now(),
    updated_at = now()
  where id = target_match_id;
end;
$$;

revoke all on function public._apply_practice_dispute_resolution(uuid, public.match_result_type, text, uuid)
  from public, anon, authenticated;

-- 6b. resolve_disputed_match: same name / arguments / admin check
-- (and the 202610121800 season-duel guard). The wager itself is
-- settled by the app right after (settle_match_wagers), as before.
create or replace function public.resolve_disputed_match(
  target_match_id uuid,
  target_result public.match_result_type,
  admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  match_row public.matches%rowtype;
  is_admin boolean;
begin
  -- season-result-confirmation guard (202610121800)
  if exists (select 1 from public.matches where id = target_match_id and competition_id is not null) then
    raise exception 'Set a disputed season duel''s result on its competition page.';
  end if;

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into match_row from public.matches where id = target_match_id for update;

  if not found then
    raise exception 'Match not found';
  end if;

  if match_row.status <> 'disputed' then
    raise exception 'Only disputed matches can be resolved';
  end if;

  select exists (
    select 1
    from public.league_members lm
    where lm.league_id = match_row.league_id
      and lm.profile_id = current_user_id
      and lm.role = 'admin'
  )
  into is_admin;

  if not is_admin then
    raise exception 'Only a league admin may resolve a disputed match';
  end if;

  if target_result is null
     or target_result not in ('player_one_win', 'player_two_win', 'draw') then
    raise exception 'Invalid match result';
  end if;

  -- The admin plays in this duel: only a proposal.
  if current_user_id in (match_row.player_one_id, match_row.player_two_id) then
    perform public._propose_match_result(
      target_match_id,
      'practice_resolution',
      current_user_id,
      null,
      null,
      target_result,
      admin_notes
    );
    return;
  end if;

  perform public._supersede_match_result_proposals(target_match_id);

  perform public._apply_practice_dispute_resolution(
    target_match_id,
    target_result,
    admin_notes,
    current_user_id
  );
end;
$$;

revoke all on function public.resolve_disputed_match(uuid, public.match_result_type, text) from public, anon;
grant execute on function public.resolve_disputed_match(uuid, public.match_result_type, text) to authenticated;

-- ---------------------------------------------------------
-- 7. The opponent's answer (and the admin's withdraw).
-- ---------------------------------------------------------

create or replace function public.accept_match_result_proposal(target_proposal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  proposal_row public.match_result_proposals%rowtype;
  match_row public.matches%rowtype;
begin
  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select * into proposal_row from public.match_result_proposals where id = target_proposal_id for update;

  if not found then
    raise exception 'Proposal not found.';
  end if;

  if proposal_row.respond_by <> current_user_id then
    raise exception 'Only the opponent in this duel can accept this proposal.';
  end if;

  if proposal_row.status <> 'pending' then
    raise exception 'This proposal was already answered or replaced.';
  end if;

  select * into match_row from public.matches where id = proposal_row.match_id for update;

  if proposal_row.kind = 'competition_correction' then
    if match_row.status <> 'completed' then
      raise exception 'This duel changed since the proposal was made. Ask for a new one.';
    end if;

    perform public._apply_competition_match_correction(
      proposal_row.match_id,
      proposal_row.player_one_duel_wins,
      proposal_row.player_two_duel_wins,
      coalesce(proposal_row.reason, 'Result corrected')
    );
  elsif proposal_row.kind = 'tiebreak_result' then
    perform public._apply_competition_tiebreak_result(
      proposal_row.match_id,
      proposal_row.player_one_duel_wins,
      proposal_row.player_two_duel_wins
    );

    update public.matches
    set
      result_submitted_by = proposal_row.proposed_by,
      result_submitted_at = proposal_row.created_at,
      result_confirmed_by = current_user_id,
      result_confirmed_at = now()
    where id = proposal_row.match_id;
  else
    perform public._apply_practice_dispute_resolution(
      proposal_row.match_id,
      proposal_row.proposed_result,
      proposal_row.reason,
      current_user_id
    );
  end if;

  update public.match_result_proposals
  set
    status = 'accepted',
    decided_at = now()
  where id = proposal_row.id;

  return proposal_row.match_id;
end;
$$;

revoke all on function public.accept_match_result_proposal(uuid) from public, anon;
grant execute on function public.accept_match_result_proposal(uuid) to authenticated;

create or replace function public.reject_match_result_proposal(
  target_proposal_id uuid,
  target_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  proposal_row public.match_result_proposals%rowtype;
begin
  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select * into proposal_row from public.match_result_proposals where id = target_proposal_id for update;

  if not found then
    raise exception 'Proposal not found.';
  end if;

  if proposal_row.respond_by <> current_user_id then
    raise exception 'Only the opponent in this duel can reject this proposal.';
  end if;

  if proposal_row.status <> 'pending' then
    raise exception 'This proposal was already answered or replaced.';
  end if;

  update public.match_result_proposals
  set
    status = 'rejected',
    response_note = nullif(trim(left(target_note, 500)), ''),
    decided_at = now()
  where id = proposal_row.id;

  return proposal_row.match_id;
end;
$$;

revoke all on function public.reject_match_result_proposal(uuid, text) from public, anon;
grant execute on function public.reject_match_result_proposal(uuid, text) to authenticated;

create or replace function public.withdraw_match_result_proposal(target_proposal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  proposal_row public.match_result_proposals%rowtype;
begin
  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select * into proposal_row from public.match_result_proposals where id = target_proposal_id for update;

  if not found then
    raise exception 'Proposal not found.';
  end if;

  if proposal_row.proposed_by <> current_user_id then
    raise exception 'Only the admin who proposed this can withdraw it.';
  end if;

  if proposal_row.status <> 'pending' then
    raise exception 'This proposal was already answered or replaced.';
  end if;

  update public.match_result_proposals
  set
    status = 'withdrawn',
    decided_at = now()
  where id = proposal_row.id;

  return proposal_row.match_id;
end;
$$;

revoke all on function public.withdraw_match_result_proposal(uuid) from public, anon;
grant execute on function public.withdraw_match_result_proposal(uuid) to authenticated;

commit;
