-- =========================================================
-- DUELIST CIRCLE 2.0 - SEASON RESULT CONFIRMATION
--
-- Owner decision (2026-10-12): a competition result entered by a
-- PLAYER only counts once the OPPONENT confirms it.
--
--   pending --(player taps winner)--> result_submitted
--   result_submitted --(opponent confirms)--> completed (DP, round,
--                                             bounty, XP, goals)
--   result_submitted --(opponent disputes)--> disputed (admin decides)
--   result_submitted --(submitter withdraws)--> pending
--   result_submitted --(opponent submits the SAME result)--> completed
--   result_submitted --(opponent submits a DIFFERENT result)--> disputed
--
-- A league admin who is NOT one of the two players is the referee:
-- their submission completes the duel at once (also for a duel that
-- is waiting for confirmation or disputed). An admin who plays in the
-- duel is just a player here - no self-refereeing.
--
-- Nothing is paid until the duel is 'completed': match DP, round
-- settlement and season finalize run in _apply_competition_match_result
-- below; bounty / catch-up come from the matches_season_bonus_after_update
-- trigger (fires only on status = 'completed'); XP and weekly goals
-- only count completed duels.
--
-- Backwards compatible with the live main app: the practice
-- confirm_match_result / dispute_match_result RPCs route a competition
-- duel to the new functions, and complete_match / resolve_disputed_match
-- refuse competition duels (they would skip the payout path).
-- =========================================================

-- ---------------------------------------------------------
-- 1. The one completion path (internal).
-- Body = the tail of submit_competition_match_result_v2 from
-- 202610121500_play_season_fixes.sql. Idempotent: an already
-- completed duel is left alone.
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
-- 2. submit_competition_match_result_v2: a player's tap is a claim.
-- Body copied from 202610121500_play_season_fixes.sql; only the
-- final update + payout block changed.
-- ---------------------------------------------------------

create or replace function public.submit_competition_match_result_v2(
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
  current_user_id uuid;
  match_row public.matches%rowtype;
  competition_row public.competitions%rowtype;
  is_admin boolean;
  is_player boolean;
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

  is_player := current_user_id in (match_row.player_one_id, match_row.player_two_id);

  if is_admin is not true and not is_player then
    raise exception 'Only a player in this duel or a league admin can submit its result.';
  end if;

  if competition_row.status is distinct from 'active' then
    raise exception 'This competition is not active.';
  end if;

  if match_row.status in ('cancelled', 'declined') then
    raise exception 'This match can no longer take a result.';
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

  -- The referee (an admin who does not play in this duel): final.
  if not is_player then
    perform public._apply_competition_match_result(
      target_match_id,
      target_player_one_duel_wins,
      target_player_two_duel_wins,
      current_user_id,
      current_user_id
    );
    return;
  end if;

  -- The opponent already sent a claim (two phones).
  if match_row.status = 'result_submitted'
     and match_row.result_submitted_by is distinct from current_user_id then
    if match_row.player_one_duel_wins = target_player_one_duel_wins
       and match_row.player_two_duel_wins = target_player_two_duel_wins then
      -- Same result: this counts as the confirmation.
      perform public._apply_competition_match_result(
        target_match_id,
        target_player_one_duel_wins,
        target_player_two_duel_wins,
        match_row.result_submitted_by,
        current_user_id
      );
    else
      update public.matches
      set
        status = 'disputed',
        disputed_by = current_user_id,
        disputed_at = now(),
        dispute_reason = 'Both players submitted a different result.',
        result_confirmed_by = null,
        result_confirmed_at = null,
        completed_at = null,
        updated_at = now()
      where id = target_match_id;
    end if;

    return;
  end if;

  -- A player's claim (first one, a change of their own claim, or a
  -- new claim after a dispute): waits for the opponent.
  update public.matches
  set
    player_one_duel_wins = target_player_one_duel_wins,
    player_two_duel_wins = target_player_two_duel_wins,
    winner_id = computed_winner,
    result = computed_result,
    status = 'result_submitted',
    result_submitted_by = current_user_id,
    result_submitted_at = now(),
    result_confirmed_by = null,
    result_confirmed_at = null,
    disputed_by = null,
    disputed_at = null,
    dispute_reason = null,
    completed_at = null,
    updated_at = now()
  where id = target_match_id;
end;
$$;

revoke all on function public.submit_competition_match_result_v2(uuid, integer, integer) from public, anon;
grant execute on function public.submit_competition_match_result_v2(uuid, integer, integer) to authenticated;

-- ---------------------------------------------------------
-- 3. Opponent confirms / disputes; submitter withdraws.
-- ---------------------------------------------------------

create or replace function public._lock_claimed_competition_match(target_match_id uuid)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  match_row public.matches%rowtype;
  competition_status text;
begin
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

  if current_user_id not in (match_row.player_one_id, match_row.player_two_id) then
    raise exception 'Only a player in this duel can do this.';
  end if;

  if match_row.status = 'completed' then
    raise exception 'This duel already has a confirmed result.';
  end if;

  if match_row.status <> 'result_submitted' then
    raise exception 'This duel is not waiting for a confirmation.';
  end if;

  select status::text into competition_status from public.competitions where id = match_row.competition_id;

  if competition_status is distinct from 'active' then
    raise exception 'This competition is not active.';
  end if;

  return match_row;
end;
$$;

revoke all on function public._lock_claimed_competition_match(uuid) from public, anon, authenticated;

create or replace function public.confirm_competition_match_result(target_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  match_row public.matches%rowtype;
begin
  match_row := public._lock_claimed_competition_match(target_match_id);

  if match_row.result_submitted_by = auth.uid() then
    raise exception 'You sent this result - your opponent has to confirm it.';
  end if;

  perform public._apply_competition_match_result(
    target_match_id,
    match_row.player_one_duel_wins,
    match_row.player_two_duel_wins,
    match_row.result_submitted_by,
    auth.uid()
  );
end;
$$;

revoke all on function public.confirm_competition_match_result(uuid) from public, anon;
grant execute on function public.confirm_competition_match_result(uuid) to authenticated;

create or replace function public.dispute_competition_match_result(
  target_match_id uuid,
  target_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  match_row public.matches%rowtype;
begin
  match_row := public._lock_claimed_competition_match(target_match_id);

  if match_row.result_submitted_by = auth.uid() then
    raise exception 'You sent this result - withdraw it instead of disputing it.';
  end if;

  update public.matches
  set
    status = 'disputed',
    disputed_by = auth.uid(),
    disputed_at = now(),
    dispute_reason = nullif(trim(target_reason), ''),
    result_confirmed_by = null,
    result_confirmed_at = null,
    completed_at = null,
    updated_at = now()
  where id = target_match_id;
end;
$$;

revoke all on function public.dispute_competition_match_result(uuid, text) from public, anon;
grant execute on function public.dispute_competition_match_result(uuid, text) to authenticated;

create or replace function public.withdraw_competition_match_result(target_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  match_row public.matches%rowtype;
begin
  match_row := public._lock_claimed_competition_match(target_match_id);

  if match_row.result_submitted_by is distinct from auth.uid() then
    raise exception 'Only the player who sent this result can withdraw it.';
  end if;

  update public.matches
  set
    status = 'pending',
    player_one_duel_wins = 0,
    player_two_duel_wins = 0,
    winner_id = null,
    result = null,
    result_submitted_by = null,
    result_submitted_at = null,
    updated_at = now()
  where id = target_match_id;
end;
$$;

revoke all on function public.withdraw_competition_match_result(uuid) from public, anon;
grant execute on function public.withdraw_competition_match_result(uuid) to authenticated;

-- ---------------------------------------------------------
-- 4. Practice-duel RPCs vs competition duels.
-- confirm/dispute route to the competition versions (so the live
-- /matches/[id] buttons still pay out correctly); complete_match and
-- resolve_disputed_match refuse (no duel scores / no draw in a season).
-- Patched in place (same technique as 202610121500 section 2): a guard
-- is inserted right after the first "begin".
-- ---------------------------------------------------------

do $$
declare
  target record;
  def text;
  patched text;
begin
  for target in
    select *
    from (
      values
        (
          'public.confirm_match_result(uuid)'::regprocedure,
          'perform public.confirm_competition_match_result(target_match_id); return;'
        ),
        (
          'public.dispute_match_result(uuid,text)'::regprocedure,
          'perform public.dispute_competition_match_result(target_match_id, reason); return;'
        ),
        (
          'public.complete_match(uuid,public.match_result_type,text)'::regprocedure,
          'raise exception ''Season duels are recorded on the round screen.'';'
        ),
        (
          'public.resolve_disputed_match(uuid,public.match_result_type,text)'::regprocedure,
          'raise exception ''Set a disputed season duel''''s result on its competition page.'';'
        )
    ) as t(fn, action)
  loop
    def := pg_get_functiondef(target.fn);

    if position('season-result-confirmation guard' in def) > 0 then
      continue;
    end if;

    patched := regexp_replace(
      def,
      E'\\nbegin\\n',
      E'\nbegin\n  -- season-result-confirmation guard (202610121800)\n'
        || E'  if exists (select 1 from public.matches where id = target_match_id and competition_id is not null) then\n    '
        || target.action
        || E'\n  end if;\n'
    );

    if patched = def then
      raise exception 'season result confirmation: could not patch %', target.fn;
    end if;

    execute patched;
  end loop;
end;
$$;
