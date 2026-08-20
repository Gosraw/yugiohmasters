-- ============================================================
-- PRACTICE DUELS: NO AUTOMATIC DP REWARDS
--
-- LEAGUE DUEL
--   Win  = +100 DP
--   Draw = +50 DP
--   Loss = +25 DP
--
-- PRACTICE DUEL
--   Automatic reward = 0 DP
--
-- Practice Duels may still use:
--   - DP wagers
--   - physical card wagers
--
-- This prevents players from farming DP through repeated
-- friendly matches.
-- ============================================================


create or replace function public.award_match_duel_points(
  target_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;

  target_match public.matches%rowtype;

  player_one_reward integer;
  player_two_reward integer;
begin
  caller_id :=
    auth.uid();

  if caller_id is null then
    raise exception 'Not authenticated.';
  end if;


  -- ========================================================
  -- LOAD + LOCK MATCH
  -- ========================================================

  select *
  into target_match
  from public.matches
  where id =
    target_match_id
  for update;

  if not found then
    raise exception 'Match not found.';
  end if;


  -- ========================================================
  -- PARTICIPANT CHECK
  -- ========================================================

  if caller_id not in (
    target_match.player_one_id,
    target_match.player_two_id
  ) then
    raise exception 'You are not part of this match.';
  end if;


  -- ========================================================
  -- MUST BE FINAL
  -- ========================================================

  if target_match.status <> 'completed' then
    raise exception 'Match is not completed.';
  end if;


  -- ========================================================
  -- PRACTICE DUELS GIVE NO AUTOMATIC DP
  --
  -- Any wager settlement is handled separately by:
  -- settle_match_wagers(...)
  -- ========================================================

  if target_match.match_type = 'practice' then
    return;
  end if;


  -- ========================================================
  -- ONLY OFFICIAL LEAGUE DUELS REACH THIS POINT
  -- ========================================================

  if target_match.match_type <> 'league' then
    raise exception 'Unknown match type.';
  end if;


  -- ========================================================
  -- DETERMINE LEAGUE REWARDS
  --
  -- WIN  = 100
  -- DRAW = 50
  -- LOSS = 25
  -- ========================================================

  if target_match.winner_id is null then

    player_one_reward := 50;
    player_two_reward := 50;

  elsif target_match.winner_id =
    target_match.player_one_id
  then

    player_one_reward := 100;
    player_two_reward := 25;

  elsif target_match.winner_id =
    target_match.player_two_id
  then

    player_one_reward := 25;
    player_two_reward := 100;

  else

    raise exception 'Invalid winner for this match.';

  end if;


  -- ========================================================
  -- PLAYER ONE
  --
  -- Match row is locked, so this is safe against two
  -- simultaneous settlement attempts.
  -- ========================================================

  if not exists (
    select 1
    from public.duel_point_transactions
    where match_id =
      target_match_id
      and profile_id =
        target_match.player_one_id
      and reason =
        'match_reward'
  ) then

    perform public._credit_duel_points(
      target_match.player_one_id,
      player_one_reward,
      'match_reward',
      target_match_id,
      'Official League Duel reward.',
      jsonb_build_object(
        'match_type',
        'league',
        'result',
        case
          when target_match.winner_id is null
            then 'draw'
          when target_match.winner_id =
            target_match.player_one_id
            then 'win'
          else 'loss'
        end
      )
    );

  end if;


  -- ========================================================
  -- PLAYER TWO
  -- ========================================================

  if not exists (
    select 1
    from public.duel_point_transactions
    where match_id =
      target_match_id
      and profile_id =
        target_match.player_two_id
      and reason =
        'match_reward'
  ) then

    perform public._credit_duel_points(
      target_match.player_two_id,
      player_two_reward,
      'match_reward',
      target_match_id,
      'Official League Duel reward.',
      jsonb_build_object(
        'match_type',
        'league',
        'result',
        case
          when target_match.winner_id is null
            then 'draw'
          when target_match.winner_id =
            target_match.player_two_id
            then 'win'
          else 'loss'
        end
      )
    );

  end if;

end;
$$;


grant execute
on function public.award_match_duel_points(uuid)
to authenticated;


comment on function public.award_match_duel_points(uuid) is
  'Awards automatic Duel Points only for completed League Duels. Practice Duels receive no automatic DP rewards.';