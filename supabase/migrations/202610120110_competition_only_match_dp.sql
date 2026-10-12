-- =========================================================
-- 2.0 rewards, part 2: only COMPETITION matches pay match DP
--
-- 2.0 decision (docs/V2_PLAN.md, Rewards): ad-hoc / practice duels
-- outside a competition give NO DP anymore. Wagers on practice duels
-- stay (settle_match_wagers is untouched).
--
-- Before this migration an ad-hoc "league" duel (match_type =
-- 'league', competition_id is null) paid 100 to the winner + 75 to
-- the loser via award_match_duel_points, with no cap - 175 DP per
-- tap. award_match_duel_points keeps its signature (the live app
-- still calls it after every completed match); it is now a harmless
-- no-op for anything that is not part of a competition.
--
-- Also: the ledger rows now carry an English description that names
-- the opponent, and the internal helper is no longer callable by
-- API roles.
-- =========================================================

create or replace function public._award_match_duel_points_internal(
  target_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_match public.matches%rowtype;
  competition_name text;
  reward_player record;
  reward_amount integer;
  result_label text;
  opponent_name text;
begin
  select *
  into target_match
  from public.matches
  where id = target_match_id
  for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if target_match.match_type = 'practice' then
    return;
  end if;

  if target_match.match_type <> 'league' then
    raise exception 'Unknown match type.';
  end if;

  -- 2.0: no DP for duels outside a competition.
  if target_match.competition_id is null then
    return;
  end if;

  select c.name
  into competition_name
  from public.competitions c
  where c.id = target_match.competition_id;

  for reward_player in
    select *
    from (
      values
        (target_match.player_one_id, target_match.player_two_id),
        (target_match.player_two_id, target_match.player_one_id)
    ) as t(player_id, other_id)
  loop
    reward_amount := public._compute_league_match_reward(
      target_match.winner_id,
      reward_player.player_id,
      reward_player.other_id
    );

    if reward_amount is null then
      raise exception 'Invalid winner for this match.';
    end if;

    if exists (
      select 1
      from public.duel_point_transactions
      where match_id = target_match_id
        and profile_id = reward_player.player_id
        and reason = 'match_reward'
    ) then
      continue;
    end if;

    if reward_amount <= 0 then
      continue;
    end if;

    result_label := case
      when target_match.winner_id is null then 'draw'
      when target_match.winner_id = reward_player.player_id then 'win'
      else 'loss'
    end;

    select p.username
    into opponent_name
    from public.profiles p
    where p.id = reward_player.other_id;

    perform public._credit_duel_points(
      reward_player.player_id,
      reward_amount,
      'match_reward',
      target_match_id,
      'Official League Duel reward.',
      jsonb_build_object(
        'match_type', 'league',
        'competition_id', target_match.competition_id,
        'round_number', target_match.round_number,
        'result', result_label
      ),
      case result_label
        when 'win' then 'Won a competition duel vs '
        when 'loss' then 'Played a competition duel vs '
        else 'Drew a competition duel vs '
      end
      || coalesce(opponent_name, 'an opponent')
      || coalesce(' (' || competition_name || ')', '')
    );
  end loop;
end;
$$;

comment on function public.award_match_duel_points(uuid) is
  '2.0: pays match DP only for competition matches (via _award_match_duel_points_internal). Ad-hoc and practice duels get no DP; it is a no-op for them.';

revoke all on function public._award_match_duel_points_internal(uuid)
  from public, anon, authenticated;
