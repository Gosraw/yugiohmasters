begin;

-- =========================================================
-- Round rewards once per play night (2026-11-27)
--
-- Owner: "we play everyone 3 times against each other every time,
-- but now we get rewards after every 1 time - so we get way too
-- many packs and coins." Decision: ONE payout per play night = per
-- 3 full rounds (9 duels with 3 players); the placement counts over
-- all those duels together.
--
-- Until now _settle_round_cycle (202610120120) paid after every
-- full round (cycle: every pair plays once). New, per competition:
--   * competitions.reward_rounds_per_payout (default 1 = unchanged)
--     - how many full rounds make one payout.
--   * competitions.reward_grouping_from_round (default 1) - the
--     first full round that is grouped. Rounds before it keep the
--     old one-round payout, so a season that is already running can
--     switch over without touching anything already paid.
--
-- A payout block of rounds first..last is settled when ALL its duels
-- are completed. The grant rows (and the ledger / reward pop-up /
-- wallet "Round N") use the LAST round of the block as round_number:
-- rounds 7-9 pay out as "Round 9". That keeps every other piece
-- unchanged and correct:
--   * old per-round grants all have numbers below the grouping
--     start, so nothing collides;
--   * _sync_round_catch_up(round N) measures wins "through round N"
--     = through the end of the block;
--   * _season_bonus_after_match_update re-syncs every settled
--     round_number >= the corrected duel's round: the block's last
--     round is always >= it;
--   * an admin correction re-settles through _settle_round_cycle,
--     which maps the duel's schedule round to its block.
-- The last block of a season is shorter when the season's round
-- count does not divide evenly.
--
-- Season Path "round completed" XP is paid per participation grant,
-- so it now comes once per payout as well.
--
-- Signatures of every RPC the live app calls are unchanged.
-- =========================================================

alter table public.competitions
  add column if not exists reward_rounds_per_payout integer not null default 1,
  add column if not exists reward_grouping_from_round integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'competitions_reward_rounds_per_payout_check'
  ) then
    alter table public.competitions
      add constraint competitions_reward_rounds_per_payout_check
      check (reward_rounds_per_payout between 1 and 20);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'competitions_reward_grouping_from_round_check'
  ) then
    alter table public.competitions
      add constraint competitions_reward_grouping_from_round_check
      check (reward_grouping_from_round >= 1);
  end if;
end;
$$;

comment on column public.competitions.reward_rounds_per_payout is
  'Full rounds (everyone plays everyone once) per round-reward payout. 1 = after every round. 202611271000.';

comment on column public.competitions.reward_grouping_from_round is
  'First full round that is grouped by reward_rounds_per_payout; earlier rounds paid one by one. 202611271000.';

-- ---------------------------------------------------------
-- The payout block a schedule round belongs to.
-- ---------------------------------------------------------

create or replace function public._competition_reward_block(
  target_competition_id uuid,
  target_schedule_round integer
)
returns table (
  reward_round integer,
  block_start integer,
  block_end integer,
  rounds_in_block integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  player_count integer;
  cycle_size integer;
  logical_round integer;
  per_payout integer;
  grouping_from integer;
  total_rounds integer;
  first_round integer;
  last_round integer;
begin
  if target_schedule_round is null or target_schedule_round < 1 then
    return;
  end if;

  select count(*)
  into player_count
  from public.competition_players
  where competition_id = target_competition_id;

  if player_count < 2 then
    return;
  end if;

  cycle_size := case
    when mod(player_count, 2) = 0 then player_count - 1
    else player_count
  end;

  logical_round := ((target_schedule_round - 1) / cycle_size) + 1;

  select
    greatest(coalesce(c.reward_rounds_per_payout, 1), 1),
    greatest(coalesce(c.reward_grouping_from_round, 1), 1)
  into per_payout, grouping_from
  from public.competitions c
  where c.id = target_competition_id;

  if per_payout is null or per_payout = 1 or logical_round < grouping_from then
    first_round := logical_round;
    last_round := logical_round;
  else
    first_round := grouping_from
      + ((logical_round - grouping_from) / per_payout) * per_payout;
    last_round := first_round + per_payout - 1;

    select ((max(m.round_number) - 1) / cycle_size) + 1
    into total_rounds
    from public.matches m
    where m.competition_id = target_competition_id
      and m.tiebreak_id is null
      and m.round_number is not null;

    if total_rounds is not null and total_rounds >= logical_round then
      last_round := least(last_round, total_rounds);
    end if;
  end if;

  reward_round := last_round;
  block_start := ((first_round - 1) * cycle_size) + 1;
  block_end := last_round * cycle_size;
  rounds_in_block := last_round - first_round + 1;
  return next;
end;
$$;

revoke all on function public._competition_reward_block(uuid, integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------
-- _settle_round_cycle: body from 202610120120, only the block
-- calculation changed (one round -> the payout block).
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
  expected_matches integer;
  logical_round_number integer;
  block_start integer;
  block_end integer;
  block_rounds integer;
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

  select b.reward_round, b.block_start, b.block_end, b.rounds_in_block
  into logical_round_number, block_start, block_end, block_rounds
  from public._competition_reward_block(target_competition_id, target_round_number) b;

  if logical_round_number is null then
    return 0;
  end if;

  -- Every pair once per full round, times the rounds in this block.
  expected_matches := ((player_count * (player_count - 1)) / 2) * block_rounds;

  select
    count(*),
    count(*) filter (where status <> 'completed')
  into match_count, incomplete_count
  from public.matches
  where competition_id = target_competition_id
    and tiebreak_id is null
    and round_number between block_start and block_end;

  -- Never settle an incomplete/partial block.
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
        'duel_wins', expected_row.duel_wins,
        'rounds_in_payout', block_rounds
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

revoke all on function public._settle_round_cycle(uuid, integer, text)
  from public, anon, authenticated;

commit;
