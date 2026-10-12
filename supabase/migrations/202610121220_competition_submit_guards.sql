-- =========================================================
-- submit_competition_match_result_v2: status guards.
--
-- Security review: a player of a duel could submit a result for
-- a match in a competition that is not running (draft /
-- completed / cancelled) or for a match that was cancelled or
-- declined. For NON-admins the competition must now be 'active'
-- and the match must not be cancelled / declined / completed.
-- League admins keep their existing behaviour.
--
-- Body copied verbatim from 202610120600_tap_winner_duels.sql;
-- the only change is the guard block right after the
-- player-or-admin check.
-- =========================================================

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

  if is_admin is not true then
    if competition_row.status is distinct from 'active' then
      raise exception 'This competition is not active.';
    end if;

    if match_row.status = 'completed' then
      -- Same message as the check below: round-play-flow.tsx and
      -- the economy e2e spec match on "already has a result".
      raise exception 'This match already has a result - use correct_competition_match_result_v2 to change it.';
    end if;

    if match_row.status in ('cancelled', 'declined') then
      raise exception 'This match can no longer take a result.';
    end if;
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
