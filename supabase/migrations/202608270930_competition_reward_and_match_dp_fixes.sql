-- =========================================================
-- COMPETITION REWARD DISTRIBUTION + MATCH DP FIXES (2026-08-27)
-- Track 2 audit findings
--
-- BUG A (false-success reward distribution) - distribute_competition_
-- rewards_v2 unconditionally set rewards_distributed_at = now() even
-- when it granted NOTHING, and the app/UI treated that timestamp
-- alone as "success". The underlying reason it granted nothing is
-- BUG B below. This file fixes both the symptom (the function now
-- reports how many grants it actually created) and the root cause
-- (every V2 competition now gets default reward rules seeded, same
-- as V1 always has via install_default_competition_rewards).
--
-- BUG B (missing reward rules) - create_competition_v2 never seeded
-- any competition_reward_rules rows (V1's create_competition calls
-- install_default_competition_rewards; V2 never called an
-- equivalent). Every V2 competition - which is the ONLY competition
-- flow actually wired up in the UI (competition-create-form-v2.tsx)
-- - was created with zero reward rules, permanently, unless someone
-- hand-inserted rows via SQL. Fixed by adding
-- install_default_competition_rewards_v2() and calling it from
-- create_competition_v2, plus defensively from inside
-- distribute_competition_rewards_v2 itself (covers every V2
-- competition already created before this migration).
--
-- BUG C (missing match-level DP) - award_match_duel_points (100 win /
-- 50 draw / 25 loss for 'league' matches) is only ever called from
-- the peer-to-peer confirm/dispute-resolution flow
-- (src/app/actions/matches.ts). Competition V2 matches are created
-- with match_type = 'league' (202608231100_competition_v2_
-- scheduling.sql) but submit_competition_match_result_v2 /
-- correct_competition_match_result_v2 never called it - every match
-- played inside a competition awarded zero per-match DP, silently.
-- Fixed by extracting the core award logic into a new internal
-- helper (_award_match_duel_points_internal, no participant check)
-- shared by both the original participant-gated wrapper AND the two
-- admin-gated competition V2 functions - award_match_duel_points
-- itself keeps its original signature/behavior/grant exactly as-is
-- for the peer-to-peer flow, this is purely additive.
--
-- BUG D (correction never touched match DP) - correct_competition_
-- match_result_v2 already reverses/re-grants PLACEMENT rewards when
-- a corrected match changes final standings, but had nothing to
-- adjust for match-level DP (since nothing granted it in the first
-- place - BUG C). Fixed by adding a delta-based correction: for each
-- of the two players, compare what has ACTUALLY been paid so far for
-- this specific match (summed straight from the duel_point_
-- transactions ledger, not recomputed from memory) against what the
-- corrected result computes to, and credit/debit only the
-- difference - auditable, idempotent under repeated corrections, and
-- correct even for a match that predates this migration (never paid
-- => full new amount is credited, not double-counted).
--
-- Every DP mutation below reuses the existing _credit_duel_points
-- helper for positive amounts and the same "cap the debit at the
-- player's current balance, record any unrecovered remainder
-- explicitly" pattern already established in
-- 202608231400_competition_v2_reward_correction_hardening.sql for
-- negative amounts - duel_points can never go negative
-- (profiles_duel_points_check), and the ledger is never silently
-- wrong relative to the real balance.
-- =========================================================


-- ---------------------------------------------------------
-- 1. DEFAULT V2 REWARD RULES (BUG B)
--
-- Values are a new, documented default (V1's install_default_
-- competition_rewards is a black-box RPC not in this repo - its
-- actual values could not be recovered, so this is not a claim of
-- parity with V1, just a real, non-empty, League-Points-scale-
-- appropriate default): 1st = 300 DP + 1 premium pack voucher,
-- 2nd = 150 DP + 1 normal pack voucher, 3rd = 75 DP only. There is
-- still no admin UI to customize these per competition (a documented
-- follow-up, out of scope here) - `on conflict do nothing` below
-- means re-running this never clobbers a manually-edited rule row.
-- ---------------------------------------------------------

create or replace function public.install_default_competition_rewards_v2(
  target_competition_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_user_id uuid;
  competition_row public.competitions%rowtype;
  is_admin boolean;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select * into competition_row from public.competitions where id = target_competition_id;

  if not found then
    raise exception 'Competition not found.';
  end if;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can install competition reward rules.';
  end if;

  insert into public.competition_reward_rules (
    competition_id, placement, duel_points, voucher_type, voucher_quantity
  ) values
    (target_competition_id, 1, 300, 'premium_pack', 1),
    (target_competition_id, 2, 150, 'normal_pack', 1),
    (target_competition_id, 3, 75, null, 0)
  on conflict (competition_id, placement) do nothing;
end;
$function$;

revoke all on function public.install_default_competition_rewards_v2(uuid) from public;
grant execute on function public.install_default_competition_rewards_v2(uuid) to authenticated;


-- ---------------------------------------------------------
-- 2. create_competition_v2 now seeds default reward rules right
--    after creating the competition - byte-for-byte identical to the
--    202608231100 version otherwise, only the new call at the end is
--    added.
-- ---------------------------------------------------------

create or replace function public.create_competition_v2(
  target_league_id uuid,
  target_name text,
  target_meetings_per_pairing integer,
  target_match_format text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_user_id uuid;
  is_admin boolean;
  new_competition_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = target_league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can create a competition.';
  end if;

  if target_name is null or length(trim(target_name)) = 0 then
    raise exception 'Competition name is required.';
  end if;

  if target_meetings_per_pairing is null or target_meetings_per_pairing < 1 then
    raise exception 'meetings_per_pairing must be at least 1.';
  end if;

  if target_match_format not in ('single_duel', 'best_of_3') then
    raise exception 'Invalid match format.';
  end if;

  insert into public.competitions (
    league_id,
    name,
    competition_type,
    status,
    meetings_per_pairing,
    match_format,
    created_by
  )
  values (
    target_league_id,
    trim(target_name),
    'round_robin',
    'draft',
    target_meetings_per_pairing,
    target_match_format,
    current_user_id
  )
  returning id
  into new_competition_id;

  -- BUG B fix: V1's create_competition always seeded reward rules
  -- via install_default_competition_rewards - V2 never had an
  -- equivalent call until now.
  perform public.install_default_competition_rewards_v2(new_competition_id);

  return new_competition_id;
end;
$function$;

revoke all on function public.create_competition_v2(uuid, text, integer, text) from public;
grant execute on function public.create_competition_v2(uuid, text, integer, text) to authenticated;


-- ---------------------------------------------------------
-- 3. MATCH-LEVEL DP - shared internal helper (BUG C).
--    Pure, reused by both the award and the correction path below,
--    so the 100/50/25 rule is defined in exactly one place.
-- ---------------------------------------------------------

create or replace function public._compute_league_match_reward(
  winner_id uuid,
  player_id uuid,
  other_player_id uuid
)
returns integer
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when winner_id is null then 50
    when winner_id = player_id then 100
    when winner_id = other_player_id then 25
    else null -- an invalid winner_id (neither player) - caller must handle
  end;
$function$;

revoke all on function public._compute_league_match_reward(uuid, uuid, uuid) from public;
-- No grant at all - pure internal helper, only ever called from
-- other SECURITY DEFINER functions in this same file/schema.


create or replace function public._award_match_duel_points_internal(
  target_match_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  target_match public.matches%rowtype;
  player_one_reward integer;
  player_two_reward integer;
begin
  select * into target_match from public.matches where id = target_match_id for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if target_match.match_type = 'practice' then
    return;
  end if;

  if target_match.match_type <> 'league' then
    raise exception 'Unknown match type.';
  end if;

  player_one_reward := public._compute_league_match_reward(
    target_match.winner_id, target_match.player_one_id, target_match.player_two_id
  );
  player_two_reward := public._compute_league_match_reward(
    target_match.winner_id, target_match.player_two_id, target_match.player_one_id
  );

  if player_one_reward is null or player_two_reward is null then
    raise exception 'Invalid winner for this match.';
  end if;

  if not exists (
    select 1 from public.duel_point_transactions
    where match_id = target_match_id
      and profile_id = target_match.player_one_id
      and reason = 'match_reward'
  ) then
    perform public._credit_duel_points(
      target_match.player_one_id,
      player_one_reward,
      'match_reward',
      target_match_id,
      'Official League Duel reward.',
      jsonb_build_object(
        'match_type', 'league',
        'result',
        case
          when target_match.winner_id is null then 'draw'
          when target_match.winner_id = target_match.player_one_id then 'win'
          else 'loss'
        end
      )
    );
  end if;

  if not exists (
    select 1 from public.duel_point_transactions
    where match_id = target_match_id
      and profile_id = target_match.player_two_id
      and reason = 'match_reward'
  ) then
    perform public._credit_duel_points(
      target_match.player_two_id,
      player_two_reward,
      'match_reward',
      target_match_id,
      'Official League Duel reward.',
      jsonb_build_object(
        'match_type', 'league',
        'result',
        case
          when target_match.winner_id is null then 'draw'
          when target_match.winner_id = target_match.player_two_id then 'win'
          else 'loss'
        end
      )
    );
  end if;
end;
$function$;

revoke all on function public._award_match_duel_points_internal(uuid) from public;
-- Deliberately NOT granted to `authenticated` - internal only. Called
-- from award_match_duel_points (which keeps its own participant
-- check, below) and from the two competition V2 match-result
-- functions (which are admin-gated). Both callers already validated
-- the end user before reaching this point.


-- ---------------------------------------------------------
-- 4. award_match_duel_points becomes a thin, behavior-identical
--    wrapper around the internal helper - same signature, same
--    grant, same participant check, same idempotency guarantee.
--    Existing callers (src/app/actions/matches.ts) are unaffected.
-- ---------------------------------------------------------

create or replace function public.award_match_duel_points(
  target_match_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  caller_id uuid;
  target_match public.matches%rowtype;
begin
  caller_id := auth.uid();

  if caller_id is null then
    raise exception 'Not authenticated.';
  end if;

  select * into target_match from public.matches where id = target_match_id;

  if not found then
    raise exception 'Match not found.';
  end if;

  if caller_id not in (target_match.player_one_id, target_match.player_two_id) then
    raise exception 'You are not part of this match.';
  end if;

  if target_match.status <> 'completed' then
    raise exception 'Match is not completed.';
  end if;

  perform public._award_match_duel_points_internal(target_match_id);
end;
$function$;

revoke all on function public.award_match_duel_points(uuid) from public;
grant execute on function public.award_match_duel_points(uuid) to authenticated;

comment on function public.award_match_duel_points(uuid) is
  'Awards automatic Duel Points only for completed League Duels. Practice Duels receive no automatic DP rewards. Core logic extracted into _award_match_duel_points_internal (2026-08-27) so competition V2 match-result functions can share it without this function''s participant-only check.';


-- ---------------------------------------------------------
-- 5. submit_competition_match_result_v2 now awards match-level DP
--    right after marking the match completed (BUG C). Everything
--    else is byte-for-byte identical to 202608231100's version.
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

  -- BUG C fix: competition matches are created with match_type =
  -- 'league' (202608231100_competition_v2_scheduling.sql) but nothing
  -- ever called the match-DP award for them until now.
  perform public._award_match_duel_points_internal(target_match_id);

  perform public.refresh_competition_current_round_v2(match_row.competition_id);
end;
$function$;

revoke all on function public.submit_competition_match_result_v2(uuid, integer, integer) from public;
grant execute on function public.submit_competition_match_result_v2(uuid, integer, integer) to authenticated;


-- ---------------------------------------------------------
-- 6. correct_competition_match_result_v2 - everything through the
--    `update public.matches` call and the existing placement-reward
--    reversal loop is UNCHANGED from 202608231400. New: a match-DP
--    correction block (BUG D) runs right after the match update,
--    unconditionally (match DP is per-match, independent of whether
--    the competition has been finalized/has placements yet - unlike
--    the placement-reward reversal loop further down, which
--    correctly only runs post-finalization).
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
set search_path to 'public'
as $function$
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
  new_balance integer;
  new_tx_id uuid;
  new_grant_id uuid;
  reversal_tx_id uuid;
  current_balance integer;
  actual_dp_reversal integer;
  dp_unrecovered integer;
  voucher_row record;
  voucher_recovered integer;
  voucher_unrecovered integer;
  match_dp_row record;
  match_dp_new_reward integer;
  match_dp_prior_total integer;
  match_dp_delta integer;
  match_dp_current_balance integer;
  match_dp_actual_debit integer;
  match_dp_new_balance integer;
  match_dp_correction_reason text;
begin
  current_user_id := auth.uid();

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

  perform pg_advisory_xact_lock(hashtext('competition_reward_lifecycle_' || match_row.competition_id::text));

  select * into competition_row from public.competitions where id = match_row.competition_id for update;

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
  -- MATCH-LEVEL DP CORRECTION (BUG D). Delta-based against the
  -- ACTUAL ledger total for this match/player (sum of every
  -- 'match_reward' + every past 'match_reward_correction%' row), not
  -- the old in-memory winner - this is what makes repeated
  -- corrections of the same match idempotent, and what makes
  -- correcting a match that predates this migration (and so was
  -- never paid at all) come out exactly right: prior total is 0, so
  -- the full new amount is credited once, never double-counted
  -- against a reward that was never actually granted.
  --
  -- duel_point_transactions_match_reason_unique is a unique index on
  -- (match_id, profile_id, reason) - a literal 'match_reward_
  -- correction' reason on every correction would make a SECOND
  -- correction of the same match fail outright. Each correction
  -- therefore gets its own numbered reason
  -- ('match_reward_correction_2', '_3', ...) so the ledger can record
  -- an arbitrary number of corrections for the same match, each as
  -- its own immutable row - `like 'match_reward_correction%'` below
  -- matches all of them when summing the running total.
  -- ------------------------------------------------
  if match_row.match_type = 'league' then
    for match_dp_row in
      select * from (values
        (match_row.player_one_id, match_row.player_two_id),
        (match_row.player_two_id, match_row.player_one_id)
      ) as t(player_id, other_id)
    loop
      match_dp_new_reward := public._compute_league_match_reward(
        computed_winner, match_dp_row.player_id, match_dp_row.other_id
      );

      match_dp_prior_total := coalesce((
        select sum(amount) from public.duel_point_transactions
        where match_id = target_match_id
          and profile_id = match_dp_row.player_id
          and (reason = 'match_reward' or reason like 'match_reward_correction%')
      ), 0);

      match_dp_delta := match_dp_new_reward - match_dp_prior_total;

      if match_dp_delta <> 0 then
        match_dp_correction_reason := 'match_reward_correction_' || (
          1 + (
            select count(*) from public.duel_point_transactions
            where match_id = target_match_id
              and profile_id = match_dp_row.player_id
              and reason like 'match_reward_correction%'
          )
        )::text;
      end if;

      if match_dp_delta > 0 then
        perform public._credit_duel_points(
          match_dp_row.player_id,
          match_dp_delta,
          match_dp_correction_reason,
          target_match_id,
          'Competition match result corrected.',
          jsonb_build_object('correction_reason', target_reason, 'delta', match_dp_delta)
        );
      elsif match_dp_delta < 0 then
        select duel_points into match_dp_current_balance
        from public.profiles
        where id = match_dp_row.player_id
        for update;

        match_dp_actual_debit := least(match_dp_current_balance, -match_dp_delta);

        if match_dp_actual_debit > 0 then
          update public.profiles
          set duel_points = duel_points - match_dp_actual_debit, updated_at = now()
          where id = match_dp_row.player_id
          returning duel_points into match_dp_new_balance;

          insert into public.duel_point_transactions (
            profile_id, match_id, amount, balance_after, reason, note, metadata
          ) values (
            match_dp_row.player_id, target_match_id, -match_dp_actual_debit, match_dp_new_balance,
            match_dp_correction_reason, 'Competition match result corrected.',
            jsonb_build_object(
              'correction_reason', target_reason,
              'requested_delta', match_dp_delta,
              'actual_delta', -match_dp_actual_debit,
              'unrecovered', (-match_dp_delta) - match_dp_actual_debit
            )
          );
        end if;
      end if;
    end loop;
  end if;

  if competition_row.status <> 'completed' then
    -- Not finalized yet - live standings will simply reflect the
    -- corrected match on next read. Nothing to reconcile for
    -- PLACEMENT rewards (match DP above already ran regardless).
    return;
  end if;

  for new_standing in
    select * from public.get_competition_standings_v2(match_row.competition_id)
  loop
    select * into old_result_row
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
      select * into old_grant
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

        -- ------------------------------------------------
        -- DP REVERSAL. duel_points can never go negative
        -- (profiles_duel_points_check) so at most the player's
        -- CURRENT balance can actually be clawed back. The
        -- transaction amount logged below always equals the real
        -- debit - never the originally-granted amount if that's
        -- not what was actually taken. Anything short of the full
        -- amount is recorded as an explicit unrecovered remainder
        -- on the grant row (see step below), never silently
        -- dropped.
        -- ------------------------------------------------
        if old_grant.duel_points_granted > 0 then
          select duel_points into current_balance
          from public.profiles
          where id = new_standing.profile_id
          for update;

          actual_dp_reversal := least(current_balance, old_grant.duel_points_granted);
          dp_unrecovered := old_grant.duel_points_granted - actual_dp_reversal;

          if actual_dp_reversal > 0 then
            update public.profiles
            set duel_points = duel_points - actual_dp_reversal, updated_at = now()
            where id = new_standing.profile_id
            returning duel_points into new_balance;

            insert into public.duel_point_transactions (
              profile_id, amount, balance_after, reason, metadata
            ) values (
              new_standing.profile_id, -actual_dp_reversal, new_balance,
              'competition_reward_reversal',
              jsonb_build_object(
                'competition_id', match_row.competition_id,
                'previous_placement', old_grant.placement,
                'reason', target_reason,
                'grant_id', old_grant.id,
                'requested_reversal', old_grant.duel_points_granted,
                'actual_reversal', actual_dp_reversal,
                'unrecovered', dp_unrecovered
              )
            )
            returning id into reversal_tx_id;
          end if;
        end if;

        -- ------------------------------------------------
        -- VOUCHER REVERSAL. Only reward_vouchers rows precisely
        -- traceable to THIS grant (competition_reward_grant_id)
        -- are touched - never "any voucher of this type", which
        -- would risk reclaiming a voucher from an unrelated
        -- source. Rows are locked first so a concurrent spend
        -- (purchase_shop_pack) can't consume one out from under
        -- this reversal. A voucher already fully spent has no row
        -- left to reclaim - recorded as an explicit unrecovered
        -- amount, never resurrected.
        -- ------------------------------------------------
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

      select * into rule_row
      from public.competition_reward_rules
      where competition_id = match_row.competition_id
        and placement = new_standing.placement;

      if found then
        new_tx_id := null;

        insert into public.competition_reward_grants (
          competition_id, profile_id, placement, duel_points_granted,
          voucher_type, voucher_quantity, duel_point_transaction_id, status
        ) values (
          match_row.competition_id, new_standing.profile_id, new_standing.placement,
          coalesce(rule_row.duel_points, 0), rule_row.voucher_type,
          coalesce(rule_row.voucher_quantity, 0), null, 'granted'
        )
        returning id into new_grant_id;

        if rule_row.duel_points > 0 then
          update public.profiles
          set duel_points = duel_points + rule_row.duel_points, updated_at = now()
          where id = new_standing.profile_id
          returning duel_points into new_balance;

          insert into public.duel_point_transactions (
            profile_id, amount, balance_after, reason, metadata
          ) values (
            new_standing.profile_id, rule_row.duel_points, new_balance, 'competition_reward',
            jsonb_build_object(
              'competition_id', match_row.competition_id,
              'placement', new_standing.placement,
              'correction_reason', target_reason,
              'grant_id', new_grant_id
            )
          )
          returning id into new_tx_id;

          update public.competition_reward_grants
          set duel_point_transaction_id = new_tx_id
          where id = new_grant_id;
        end if;

        if rule_row.voucher_type is not null and rule_row.voucher_quantity > 0 then
          insert into public.reward_vouchers (
            profile_id, voucher_type, quantity, source_type, source_id, competition_reward_grant_id
          ) values (
            new_standing.profile_id, rule_row.voucher_type, rule_row.voucher_quantity,
            'competition_reward_correction', match_row.competition_id, new_grant_id
          );
        end if;
      end if;
    end if;
  end loop;
end;
$function$;

revoke all on function public.correct_competition_match_result_v2(uuid, integer, integer, text) from public;
grant execute on function public.correct_competition_match_result_v2(uuid, integer, integer, text) to authenticated;


-- ---------------------------------------------------------
-- 7. distribute_competition_rewards_v2 - return type changes from
--    void to integer (grants actually created this call), so the
--    function must be dropped and recreated rather than replaced.
--    Adds a defensive auto-install of default reward rules for any
--    competition that somehow still has none (covers every V2
--    competition created before this migration, per BUG B).
-- ---------------------------------------------------------

drop function if exists public.distribute_competition_rewards_v2(uuid);

create function public.distribute_competition_rewards_v2(
  target_competition_id uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_user_id uuid;
  competition_row public.competitions%rowtype;
  is_admin boolean;
  result_row record;
  rule_row public.competition_reward_rules%rowtype;
  new_balance integer;
  new_tx_id uuid;
  new_grant_id uuid;
  grants_created integer := 0;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  perform pg_advisory_xact_lock(hashtext('competition_reward_lifecycle_' || target_competition_id::text));

  select * into competition_row from public.competitions where id = target_competition_id for update;

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

  -- BUG B defensive fallback: covers every V2 competition created
  -- before this migration (create_competition_v2 never used to seed
  -- rules at all) so this call can't silently no-op for them either.
  -- A no-op (on conflict do nothing) for any competition that
  -- already has rules, whether from the fix above or a prior manual
  -- SQL insert.
  if not exists (
    select 1 from public.competition_reward_rules
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
      select 1 from public.competition_reward_grants
      where competition_id = target_competition_id
        and profile_id = result_row.profile_id
        and status = 'granted'
    ) then
      continue;
    end if;

    select * into rule_row
    from public.competition_reward_rules
    where competition_id = target_competition_id
      and placement = result_row.placement;

    if not found then
      continue;
    end if;

    new_tx_id := null;

    insert into public.competition_reward_grants (
      competition_id, profile_id, placement, duel_points_granted,
      voucher_type, voucher_quantity, duel_point_transaction_id, status
    ) values (
      target_competition_id, result_row.profile_id, result_row.placement,
      coalesce(rule_row.duel_points, 0), rule_row.voucher_type,
      coalesce(rule_row.voucher_quantity, 0), null, 'granted'
    )
    returning id into new_grant_id;

    grants_created := grants_created + 1;

    if rule_row.duel_points > 0 then
      update public.profiles
      set duel_points = duel_points + rule_row.duel_points, updated_at = now()
      where id = result_row.profile_id
      returning duel_points into new_balance;

      insert into public.duel_point_transactions (
        profile_id, amount, balance_after, reason, metadata
      ) values (
        result_row.profile_id, rule_row.duel_points, new_balance, 'competition_reward',
        jsonb_build_object(
          'competition_id', target_competition_id,
          'placement', result_row.placement,
          'grant_id', new_grant_id
        )
      )
      returning id into new_tx_id;

      update public.competition_reward_grants
      set duel_point_transaction_id = new_tx_id
      where id = new_grant_id;
    end if;

    if rule_row.voucher_type is not null and rule_row.voucher_quantity > 0 then
      insert into public.reward_vouchers (
        profile_id, voucher_type, quantity, source_type, source_id, competition_reward_grant_id
      ) values (
        result_row.profile_id, rule_row.voucher_type, rule_row.voucher_quantity,
        'competition_reward', target_competition_id, new_grant_id
      );
    end if;
  end loop;

  update public.competitions
  set rewards_distributed_at = coalesce(rewards_distributed_at, now())
  where id = target_competition_id;

  return grants_created;
end;
$function$;

revoke all on function public.distribute_competition_rewards_v2(uuid) from public;
grant execute on function public.distribute_competition_rewards_v2(uuid) to authenticated;

comment on function public.distribute_competition_rewards_v2(uuid) is
  'Grants placement rewards per competition_reward_rules for every competition_results row that does not already have an active grant. Returns the number of NEW grants created this call (2026-08-27 - was void, which let a run that granted zero rewards look identical to a real success). Defensively auto-installs default reward rules if the competition somehow has none, closing the "V2 competitions never had reward rules" gap at the point of use as well as at creation time.';
