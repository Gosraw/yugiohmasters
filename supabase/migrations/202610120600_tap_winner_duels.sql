-- =========================================================
-- 2.0 duels: record a result by TAPPING THE WINNER
-- (docs/V2_PLAN.md, "Duels & competition", plan step 8)
--
-- 1. record_practice_duel(opponent, winner)
--    A practice duel that was already played at the table, recorded
--    on one screen: pick the opponent, tap the winner. It skips the
--    challenge/accept steps (there is nothing to escrow without a
--    wager) and lands directly in 'result_submitted', so the
--    opponent confirms it with one tap via the existing
--    confirm_match_result (or disputes it). Practice duels give no
--    DP in 2.0 and have no wager here, so nothing is paid out.
--    Wagered practice duels keep the existing challenge -> accept
--    (escrow) -> result -> confirm flow untouched.
--    No decks are attached: validate_match re-checks attached decks
--    on every UPDATE, so a deck edited between recording and
--    confirming would otherwise block the confirmation.
--
-- 2. submit_competition_match_result_v2: either PLAYER of the duel
--    may now submit it (before: league admin only). Rounds are
--    played on different days (~3 per week), so the season round
--    must not depend on the admin being at the table. Admins keep
--    the right to submit any duel and remain the only ones who can
--    correct a result (correct_competition_match_result_v2).
--    Everything else (validation, match DP, round settlement,
--    auto-finalize) is unchanged from the live definition.
--
-- Backwards compatible with the live main app: no existing
-- signature changes; the main app only ever called the submit RPC
-- as an admin, which still works.
-- =========================================================

create or replace function public.record_practice_duel(
  target_opponent_id uuid,
  target_winner_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  current_league_id uuid;
  computed_result public.match_result_type;
  existing_match_id uuid;
  new_match_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  if target_opponent_id is null or target_opponent_id = current_user_id then
    raise exception 'Pick an opponent other than yourself.';
  end if;

  if target_winner_id is null
     or target_winner_id not in (current_user_id, target_opponent_id) then
    raise exception 'The winner must be one of the two duelists.';
  end if;

  select lm.league_id
  into current_league_id
  from public.league_members lm
  where lm.profile_id = current_user_id
  limit 1;

  if current_league_id is null then
    raise exception 'You are not a member of a league.';
  end if;

  if not exists (
    select 1
    from public.league_members lm
    where lm.league_id = current_league_id
      and lm.profile_id = target_opponent_id
  ) then
    raise exception 'That opponent is not in your league.';
  end if;

  computed_result := case
    when target_winner_id = current_user_id then 'player_one_win'
    else 'player_two_win'
  end::public.match_result_type;

  -- Double-tap guard: the same result between the same two players,
  -- recorded by the same person in the last minute, is returned
  -- instead of duplicated.
  perform pg_advisory_xact_lock(
    hashtext('record_practice_duel_' || current_user_id::text)
  );

  select m.id
  into existing_match_id
  from public.matches m
  where m.created_by = current_user_id
    and m.player_one_id = current_user_id
    and m.player_two_id = target_opponent_id
    and m.match_type = 'practice'
    and m.wager_type = 'none'
    and m.competition_id is null
    and m.status = 'result_submitted'
    and m.winner_id = target_winner_id
    and m.created_at > now() - interval '1 minute'
  order by m.created_at desc
  limit 1;

  if existing_match_id is not null then
    return existing_match_id;
  end if;

  insert into public.matches (
    league_id,
    created_by,
    player_one_id,
    player_two_id,
    status,
    match_type,
    wager_type,
    wager_dp_amount,
    wager_status,
    match_format,
    result,
    winner_id,
    accepted_at,
    result_submitted_by,
    result_submitted_at
  )
  values (
    current_league_id,
    current_user_id,
    current_user_id,
    target_opponent_id,
    'result_submitted',
    'practice',
    'none',
    0,
    'none',
    'single_duel',
    computed_result,
    target_winner_id,
    now(),
    current_user_id,
    now()
  )
  returning id
  into new_match_id;

  return new_match_id;
end;
$$;

comment on function public.record_practice_duel(uuid, uuid) is
  '2.0 tap-the-winner: records an already-played practice duel (no wager, no DP) straight into result_submitted; the opponent confirms with confirm_match_result.';

revoke all on function public.record_practice_duel(uuid, uuid) from public, anon;
grant execute on function public.record_practice_duel(uuid, uuid) to authenticated;

-- ---------------------------------------------------------
-- submit_competition_match_result_v2: players of the duel OR an
-- admin. Body otherwise identical to the live definition.
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

  if is_admin is not true
     and current_user_id not in (match_row.player_one_id, match_row.player_two_id) then
    raise exception 'Only a player in this duel or a league admin can submit its result.';
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
    result_submitted_by = current_user_id,
    result_submitted_at = now(),
    completed_at = now(),
    updated_at = now()
  where id = target_match_id;

  perform public._award_match_duel_points_internal(target_match_id);

  perform public.refresh_competition_current_round_v2(match_row.competition_id);

  perform public.settle_round_rewards_v2(match_row.competition_id, match_row.round_number);
  perform public.settle_competition_if_complete_v2(match_row.competition_id);
end;
$$;

revoke all on function public.submit_competition_match_result_v2(uuid, integer, integer) from public, anon;
grant execute on function public.submit_competition_match_result_v2(uuid, integer, integer) to authenticated;
