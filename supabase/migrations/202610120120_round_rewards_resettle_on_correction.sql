-- =========================================================
-- 2.0 rewards, part 3: full-cycle round rewards that stay correct
--
-- Fixes (docs/V2_PLAN.md, Rewards):
--
-- A. settle_round_rewards_v2 (live def from 202609042200 + 0210)
--    crashed on every placement grant: the 0210 text patch missed
--    one `reward_reason` reference (indentation mismatch), so the
--    last result of every full cycle raised "column reward_reason
--    does not exist" and the whole submit rolled back.
-- B. It called install_default_round_rewards_v2 on EVERY settlement,
--    which upserts the league defaults over any per-competition
--    custom rules. Settlement now installs defaults only when the
--    competition has no round rules at all.
-- C. install_default_round_rewards_v2 had no admin guard and was
--    executable by every API role. It is now league-admin only (an
--    explicit "reset this competition's round rules to defaults").
-- D. correct_competition_match_result_v2 never re-settled the
--    full-cycle placement grants. A correction now re-settles that
--    cycle: grants that no longer match the corrected standings are
--    reversed (status 'reversed' + a negative ledger row; history is
--    never deleted), the new ones are granted, idempotently.
-- E. All DP in these paths goes through _credit_duel_points /
--    _debit_duel_points (no more direct profiles.duel_points
--    writes), and every ledger row gets an English description.
--
-- Settlement model (unchanged): one "round" = one full cycle in
-- which every pair plays once. 3 players -> schedule rounds 1-3 are
-- round 1, 4-6 are round 2, ... Rewards per round come from
-- competition_round_reward_rules (participation / round_winner /
-- round_runner_up / round_third).
--
-- Signatures of every RPC the live app calls are unchanged.
-- =========================================================

-- ---------------------------------------------------------
-- Schema: reversal bookkeeping on round grants, and a precise link
-- from a voucher to the round grant that created it.
-- ---------------------------------------------------------

alter table public.competition_round_reward_grants
  add column if not exists duel_points_recovered integer not null default 0,
  add column if not exists duel_points_unrecovered integer not null default 0,
  add column if not exists voucher_quantity_recovered integer not null default 0,
  add column if not exists voucher_quantity_unrecovered integer not null default 0,
  add column if not exists reversal_duel_point_transaction_id uuid
    references public.duel_point_transactions(id) on delete set null;

create index if not exists competition_round_reward_grants_cycle_idx
  on public.competition_round_reward_grants (competition_id, round_number)
  where status = 'granted';

alter table public.reward_vouchers
  add column if not exists round_reward_grant_id uuid
    references public.competition_round_reward_grants(id) on delete set null;

create index if not exists reward_vouchers_round_grant_idx
  on public.reward_vouchers (round_reward_grant_id)
  where round_reward_grant_id is not null;

-- Existing round vouchers were written in the same transaction as
-- their grant, so created_at = granted_at identifies them exactly.
update public.reward_vouchers v
set round_reward_grant_id = g.id
from public.competition_round_reward_grants g
where v.round_reward_grant_id is null
  and v.source_type = 'round_reward'
  and v.source_id = g.competition_id
  and v.profile_id = g.profile_id
  and v.voucher_type = g.voucher_type
  and v.created_at = g.granted_at;

-- ---------------------------------------------------------
-- Default round rules
-- ---------------------------------------------------------

-- Internal: fills in only the roles a competition is missing; never
-- overwrites a rule the owner customised.
create or replace function public._install_default_round_rewards(
  target_competition_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.league_economy_defaults%rowtype;
begin
  select *
  into d
  from public.league_economy_defaults
  where id = true;

  if not found then
    raise exception 'league_economy_defaults is missing.';
  end if;

  insert into public.competition_round_reward_rules (
    competition_id,
    role,
    duel_points,
    voucher_type,
    voucher_quantity
  )
  values
    (
      target_competition_id,
      'participation',
      d.round_participation_dp,
      d.round_participation_voucher_type,
      d.round_participation_voucher_quantity
    ),
    (
      target_competition_id,
      'round_winner',
      d.round_first_dp,
      d.round_first_voucher_type,
      d.round_first_voucher_quantity
    ),
    (target_competition_id, 'round_runner_up', d.round_second_dp, null, 0),
    (target_competition_id, 'round_third', d.round_third_dp, null, 0)
  on conflict (competition_id, role) do nothing;
end;
$$;

-- Public, league-admin only: reset a competition's round rules to the
-- current league defaults (overwrites customisations on purpose).
create or replace function public.install_default_round_rewards_v2(
  target_competition_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  competition_row public.competitions%rowtype;
  d public.league_economy_defaults%rowtype;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select *
  into competition_row
  from public.competitions
  where id = target_competition_id;

  if not found then
    raise exception 'Competition not found.';
  end if;

  if not public.is_league_admin(competition_row.league_id) then
    raise exception 'Only a league admin can install round reward rules.';
  end if;

  select *
  into d
  from public.league_economy_defaults
  where id = true;

  if not found then
    raise exception 'league_economy_defaults is missing.';
  end if;

  insert into public.competition_round_reward_rules (
    competition_id,
    role,
    duel_points,
    voucher_type,
    voucher_quantity
  )
  values
    (
      target_competition_id,
      'participation',
      d.round_participation_dp,
      d.round_participation_voucher_type,
      d.round_participation_voucher_quantity
    ),
    (
      target_competition_id,
      'round_winner',
      d.round_first_dp,
      d.round_first_voucher_type,
      d.round_first_voucher_quantity
    ),
    (target_competition_id, 'round_runner_up', d.round_second_dp, null, 0),
    (target_competition_id, 'round_third', d.round_third_dp, null, 0)
  on conflict (competition_id, role)
  do update set
    duel_points = excluded.duel_points,
    voucher_type = excluded.voucher_type,
    voucher_quantity = excluded.voucher_quantity,
    updated_at = now();
end;
$$;

-- ---------------------------------------------------------
-- Who should hold which grant for one full cycle
-- (participation for the whole roster + placement 1..3).
-- ---------------------------------------------------------

create or replace function public._round_cycle_expected_grants(
  target_competition_id uuid,
  target_block_start integer,
  target_block_end integer
)
returns table (
  profile_id uuid,
  reward_role text,
  placement integer,
  points integer,
  wins integer,
  draws integer,
  duel_diff integer,
  duel_wins integer
)
language sql
stable
security definer
set search_path = public
as $$
  with roster as (
    select cp.profile_id
    from public.competition_players cp
    where cp.competition_id = target_competition_id
  ),
  stats as (
    select
      r.profile_id,
      count(m.id) filter (where m.winner_id = r.profile_id)::integer as wins,
      count(m.id) filter (where m.id is not null and m.winner_id is null)::integer as draws,
      coalesce(sum(
        case
          when m.player_one_id = r.profile_id then m.player_one_duel_wins
          when m.player_two_id = r.profile_id then m.player_two_duel_wins
          else 0
        end
      ), 0)::integer as duel_wins,
      coalesce(sum(
        case
          when m.player_one_id = r.profile_id
            then m.player_one_duel_wins - m.player_two_duel_wins
          when m.player_two_id = r.profile_id
            then m.player_two_duel_wins - m.player_one_duel_wins
          else 0
        end
      ), 0)::integer as duel_diff
    from roster r
    left join public.matches m
      on m.competition_id = target_competition_id
     and m.tiebreak_id is null
     and m.round_number between target_block_start and target_block_end
     and r.profile_id in (m.player_one_id, m.player_two_id)
    group by r.profile_id
  ),
  ranked as (
    select
      s.*,
      (s.wins * 3 + s.draws)::integer as points,
      row_number() over (
        order by
          (s.wins * 3 + s.draws) desc,
          s.wins desc,
          s.duel_diff desc,
          s.duel_wins desc,
          s.profile_id
      )::integer as placement
    from stats s
  )
  select
    ranked.profile_id,
    'participation'::text,
    ranked.placement,
    ranked.points,
    ranked.wins,
    ranked.draws,
    ranked.duel_diff,
    ranked.duel_wins
  from ranked
  union all
  select
    ranked.profile_id,
    case ranked.placement
      when 1 then 'round_winner'
      when 2 then 'round_runner_up'
      else 'round_third'
    end,
    ranked.placement,
    ranked.points,
    ranked.wins,
    ranked.draws,
    ranked.duel_diff,
    ranked.duel_wins
  from ranked
  where ranked.placement <= 3;
$$;

-- ---------------------------------------------------------
-- Grant one round reward (grant row + DP + voucher), all linked.
-- Returns the grant id, or null when the competition has no rule
-- for that role.
-- ---------------------------------------------------------

create or replace function public._grant_round_reward(
  target_competition_id uuid,
  target_logical_round integer,
  target_block_start integer,
  target_block_end integer,
  target_profile_id uuid,
  target_reward_role text,
  target_placement integer,
  target_stats jsonb,
  target_correction_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  rule_row public.competition_round_reward_rules%rowtype;
  competition_name text;
  new_grant_id uuid;
  new_tx_id uuid;
  reward_description text;
begin
  select *
  into rule_row
  from public.competition_round_reward_rules
  where competition_id = target_competition_id
    and role = target_reward_role;

  if not found then
    return null;
  end if;

  select c.name
  into competition_name
  from public.competitions c
  where c.id = target_competition_id;

  insert into public.competition_round_reward_grants (
    competition_id,
    round_number,
    profile_id,
    reward_role,
    duel_points_granted,
    voucher_type,
    voucher_quantity,
    status
  )
  values (
    target_competition_id,
    target_logical_round,
    target_profile_id,
    target_reward_role,
    rule_row.duel_points,
    rule_row.voucher_type,
    rule_row.voucher_quantity,
    'granted'
  )
  returning id
  into new_grant_id;

  reward_description :=
    'Round ' || target_logical_round || ' complete — '
    || public._round_reward_role_label(target_reward_role)
    || case
      when target_correction_reason is not null then ' (after a result correction)'
      else ''
    end;

  if rule_row.duel_points > 0 then
    new_tx_id := public._credit_duel_points(
      target_profile_id,
      rule_row.duel_points,
      case target_reward_role
        when 'participation' then 'round_participation'
        when 'round_winner' then 'round_winner_bonus'
        when 'round_runner_up' then 'round_runner_up_bonus'
        else 'round_third_bonus'
      end,
      null,
      competition_name,
      coalesce(target_stats, '{}'::jsonb) || jsonb_build_object(
        'competition_id', target_competition_id,
        'logical_round_number', target_logical_round,
        'schedule_round_start', target_block_start,
        'schedule_round_end', target_block_end,
        'reward_role', target_reward_role,
        'placement', target_placement,
        'grant_id', new_grant_id,
        'correction_reason', target_correction_reason
      ),
      reward_description
    );

    update public.competition_round_reward_grants
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
      note,
      round_reward_grant_id
    )
    values (
      target_profile_id,
      rule_row.voucher_type,
      rule_row.voucher_quantity,
      'round_reward',
      target_competition_id,
      reward_description,
      new_grant_id
    );
  end if;

  return new_grant_id;
end;
$$;

-- ---------------------------------------------------------
-- Reverse one round grant. Never deletes the grant or ledger rows:
-- the grant is marked 'reversed' with what was actually recovered,
-- and the DP comes back via a negative 'round_reward_reversal'
-- ledger row (capped at the current balance - a balance never goes
-- negative; the shortfall is stored as unrecovered). Unspent
-- vouchers created by this exact grant are taken back; spent ones
-- are recorded as unrecovered. Idempotent: a reversed grant is a
-- no-op.
-- ---------------------------------------------------------

create or replace function public._reverse_round_reward_grant(
  target_grant_id uuid,
  target_reversal_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  grant_row public.competition_round_reward_grants%rowtype;
  debit_row record;
  dp_recovered integer := 0;
  dp_unrecovered integer := 0;
  reversal_tx_id uuid;
  voucher_row record;
  vouchers_recovered integer := 0;
  vouchers_unrecovered integer := 0;
begin
  select *
  into grant_row
  from public.competition_round_reward_grants
  where id = target_grant_id
  for update;

  if not found or grant_row.status <> 'granted' then
    return;
  end if;

  if grant_row.duel_points_granted > 0 then
    select *
    into debit_row
    from public._debit_duel_points(
      grant_row.profile_id,
      grant_row.duel_points_granted,
      'round_reward_reversal',
      null,
      target_reversal_reason,
      jsonb_build_object(
        'competition_id', grant_row.competition_id,
        'logical_round_number', grant_row.round_number,
        'reward_role', grant_row.reward_role,
        'grant_id', grant_row.id,
        'correction_reason', target_reversal_reason
      ),
      'Round ' || grant_row.round_number || ' corrected — '
        || public._round_reward_role_label(grant_row.reward_role)
        || ' reward taken back',
      true
    );

    dp_recovered := debit_row.debited;
    dp_unrecovered := debit_row.unrecovered;
    reversal_tx_id := debit_row.transaction_id;
  end if;

  if grant_row.voucher_type is not null and grant_row.voucher_quantity > 0 then
    for voucher_row in
      select id, quantity
      from public.reward_vouchers
      where round_reward_grant_id = grant_row.id
      for update
    loop
      vouchers_recovered := vouchers_recovered + voucher_row.quantity;
    end loop;

    delete from public.reward_vouchers
    where round_reward_grant_id = grant_row.id;

    vouchers_unrecovered := greatest(0, grant_row.voucher_quantity - vouchers_recovered);
  end if;

  update public.competition_round_reward_grants
  set
    status = 'reversed',
    reversed_at = now(),
    reversal_reason = target_reversal_reason,
    duel_points_recovered = dp_recovered,
    duel_points_unrecovered = dp_unrecovered,
    voucher_quantity_recovered = vouchers_recovered,
    voucher_quantity_unrecovered = vouchers_unrecovered,
    reversal_duel_point_transaction_id = reversal_tx_id
  where id = grant_row.id;
end;
$$;

-- ---------------------------------------------------------
-- Settle (or re-settle) the full cycle containing a schedule round.
-- Makes the active grants equal the expected grants:
--   1. grant every expected (player, role) that has no active grant
--   2. reverse every active grant that is no longer expected
-- New grants go first so a player who moves from 1st to 2nd is paid
-- the 2nd-place DP before the 1st-place DP is taken back (better
-- recovery when they already spent most of their balance).
-- Running it again changes nothing. Returns the number of grants
-- created.
-- ---------------------------------------------------------

create or replace function public._settle_round_cycle(
  target_competition_id uuid,
  target_round_number integer,
  target_correction_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  player_count integer;
  cycle_size integer;
  expected_matches integer;
  logical_round_number integer;
  block_start integer;
  block_end integer;
  match_count integer;
  incomplete_count integer;
  expected_row record;
  stale_row record;
  grants_created integer := 0;
begin
  if target_round_number is null or target_round_number < 1 then
    return 0;
  end if;

  -- Same lock as finalize/distribute/correct: one reward writer per
  -- competition at a time, always taken in the same order.
  perform pg_advisory_xact_lock(
    hashtext('competition_reward_lifecycle_' || target_competition_id::text)
  );

  select count(*)
  into player_count
  from public.competition_players
  where competition_id = target_competition_id;

  if player_count < 2 then
    return 0;
  end if;

  -- Schedule rounds needed for everyone to face everyone once.
  cycle_size := case
    when mod(player_count, 2) = 0 then player_count - 1
    else player_count
  end;

  expected_matches := (player_count * (player_count - 1)) / 2;

  logical_round_number := ((target_round_number - 1) / cycle_size) + 1;
  block_start := ((logical_round_number - 1) * cycle_size) + 1;
  block_end := logical_round_number * cycle_size;

  select
    count(*),
    count(*) filter (where status <> 'completed')
  into match_count, incomplete_count
  from public.matches
  where competition_id = target_competition_id
    and tiebreak_id is null
    and round_number between block_start and block_end;

  -- Never settle an incomplete/partial cycle.
  if match_count <> expected_matches or incomplete_count > 0 then
    return 0;
  end if;

  -- Defaults only when the competition has no round rules at all -
  -- never overwrite per-competition custom rules.
  if not exists (
    select 1
    from public.competition_round_reward_rules
    where competition_id = target_competition_id
  ) then
    perform public._install_default_round_rewards(target_competition_id);
  end if;

  for expected_row in
    select *
    from public._round_cycle_expected_grants(target_competition_id, block_start, block_end) e
    order by e.placement, e.reward_role
  loop
    if exists (
      select 1
      from public.competition_round_reward_grants g
      where g.competition_id = target_competition_id
        and g.round_number = logical_round_number
        and g.profile_id = expected_row.profile_id
        and g.reward_role = expected_row.reward_role
        and g.status = 'granted'
    ) then
      continue;
    end if;

    if public._grant_round_reward(
      target_competition_id,
      logical_round_number,
      block_start,
      block_end,
      expected_row.profile_id,
      expected_row.reward_role,
      expected_row.placement,
      jsonb_build_object(
        'points', expected_row.points,
        'wins', expected_row.wins,
        'draws', expected_row.draws,
        'duel_diff', expected_row.duel_diff,
        'duel_wins', expected_row.duel_wins
      ),
      target_correction_reason
    ) is not null then
      grants_created := grants_created + 1;
    end if;
  end loop;

  for stale_row in
    select g.id
    from public.competition_round_reward_grants g
    where g.competition_id = target_competition_id
      and g.round_number = logical_round_number
      and g.status = 'granted'
      and not exists (
        select 1
        from public._round_cycle_expected_grants(target_competition_id, block_start, block_end) e
        where e.profile_id = g.profile_id
          and e.reward_role = g.reward_role
      )
    order by g.granted_at
  loop
    perform public._reverse_round_reward_grant(
      stale_row.id,
      coalesce(target_correction_reason, 'Round standings changed.')
    );
  end loop;

  return grants_created;
end;
$$;

-- Kept for the live app / submit_competition_match_result_v2.
create or replace function public.settle_round_rewards_v2(
  target_competition_id uuid,
  target_round_number integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._settle_round_cycle(target_competition_id, target_round_number, null);
end;
$$;

-- ---------------------------------------------------------
-- End-of-competition placement rewards: same logic as before, DP
-- now via _credit_duel_points with a description.
-- ---------------------------------------------------------

create or replace function public.distribute_competition_rewards_v2(
  target_competition_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  competition_row public.competitions%rowtype;
  is_admin boolean;
  result_row record;
  rule_row public.competition_reward_rules%rowtype;
  new_tx_id uuid;
  new_grant_id uuid;
  grants_created integer := 0;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  perform pg_advisory_xact_lock(hashtext('competition_reward_lifecycle_' || target_competition_id::text));

  select *
  into competition_row
  from public.competitions
  where id = target_competition_id
  for update;

  if not found then
    raise exception 'Competition not found.';
  end if;

  if competition_row.meetings_per_pairing is null then
    raise exception 'This is a V1 competition.';
  end if;

  if competition_row.status <> 'completed' then
    raise exception 'Competition must be finalized before rewards can be distributed.';
  end if;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can distribute rewards.';
  end if;

  if not exists (
    select 1
    from public.competition_reward_rules
    where competition_id = target_competition_id
  ) then
    perform public.install_default_competition_rewards_v2(target_competition_id);
  end if;

  for result_row in
    select profile_id, placement
    from public.competition_results
    where competition_id = target_competition_id
  loop
    if exists (
      select 1
      from public.competition_reward_grants
      where competition_id = target_competition_id
        and profile_id = result_row.profile_id
        and status = 'granted'
    ) then
      continue;
    end if;

    select *
    into rule_row
    from public.competition_reward_rules
    where competition_id = target_competition_id
      and placement = result_row.placement;

    if not found then
      continue;
    end if;

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
      target_competition_id,
      result_row.profile_id,
      result_row.placement,
      coalesce(rule_row.duel_points, 0),
      rule_row.voucher_type,
      coalesce(rule_row.voucher_quantity, 0),
      null,
      'granted'
    )
    returning id
    into new_grant_id;

    grants_created := grants_created + 1;

    if rule_row.duel_points > 0 then
      new_tx_id := public._credit_duel_points(
        result_row.profile_id,
        rule_row.duel_points,
        'competition_reward',
        null,
        competition_row.name,
        jsonb_build_object(
          'competition_id', target_competition_id,
          'placement', result_row.placement,
          'grant_id', new_grant_id
        ),
        competition_row.name || ' finished — '
          || public._ordinal_label(result_row.placement) || ' place'
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
        result_row.profile_id,
        rule_row.voucher_type,
        rule_row.voucher_quantity,
        'competition_reward',
        target_competition_id,
        new_grant_id
      );
    end if;
  end loop;

  update public.competitions
  set rewards_distributed_at = coalesce(rewards_distributed_at, now())
  where id = target_competition_id;

  return grants_created;
end;
$$;

-- ---------------------------------------------------------
-- Admin correction of a completed competition match.
-- Same validation and match-DP delta logic as 202608270930, plus:
--   * re-settles the full round cycle the match belongs to
--   * every DP move via _credit_duel_points / _debit_duel_points
--   * English descriptions on every ledger row
-- ---------------------------------------------------------

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
  current_user_id uuid;
  match_row public.matches%rowtype;
  competition_row public.competitions%rowtype;
  is_admin boolean;
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
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

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

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can correct competition results.';
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
$$;

-- ---------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------

-- Internal helpers + settlement: only reachable through the admin
-- RPCs (submit / correct), never directly from the API.
revoke all on function public._install_default_round_rewards(uuid) from public, anon, authenticated;
revoke all on function public._round_cycle_expected_grants(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public._grant_round_reward(uuid, integer, integer, integer, uuid, text, integer, jsonb, text)
  from public, anon, authenticated;
revoke all on function public._reverse_round_reward_grant(uuid, text) from public, anon, authenticated;
revoke all on function public._settle_round_cycle(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.settle_round_rewards_v2(uuid, integer) from public, anon, authenticated;

-- Admin-guarded public RPCs: signed-in users only (the body checks
-- the league-admin role).
revoke all on function public.install_default_round_rewards_v2(uuid) from public, anon;
grant execute on function public.install_default_round_rewards_v2(uuid) to authenticated;
revoke all on function public.correct_competition_match_result_v2(uuid, integer, integer, text) from public, anon;
grant execute on function public.correct_competition_match_result_v2(uuid, integer, integer, text) to authenticated;
revoke all on function public.distribute_competition_rewards_v2(uuid) from public, anon;
grant execute on function public.distribute_competition_rewards_v2(uuid) to authenticated;
