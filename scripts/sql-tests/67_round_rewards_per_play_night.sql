-- Round rewards once per play night (202611271000):
--  * reward_rounds_per_payout = 3: nothing is paid after round 1 or
--    2; after round 3 one payout, numbered "Round 3", with the
--    placement counted over all 9 duels
--  * reward_grouping_from_round: rounds before it still pay one by
--    one, so a running season can switch over; the last block of a
--    season is shorter when the rounds don't divide evenly
--  * an admin correction inside a block re-settles that block

select pg_temp.reset_players();

update public.league_economy_defaults
set
  round_participation_dp = 300,
  round_first_dp = 400,
  round_second_dp = 300,
  round_third_dp = 200;

create function pg_temp.grant_count(target_competition_id uuid, target_round integer default null)
returns integer
language sql
stable
as $$
  select count(*)::integer
  from public.competition_round_reward_grants
  where competition_id = target_competition_id
    and status = 'granted'
    and (target_round is null or round_number = target_round);
$$;

create function pg_temp.holder(target_competition_id uuid, target_round integer, target_role text)
returns text
language sql
stable
as $$
  select p.username
  from public.competition_round_reward_grants g
  join public.profiles p on p.id = g.profile_id
  where g.competition_id = target_competition_id
    and g.round_number = target_round
    and g.reward_role = target_role
    and g.status = 'granted';
$$;

do $$
declare
  comp_id uuid;
begin
  -- ---------- A. three rounds = one payout ----------
  comp_id := pg_temp.new_competition(6);

  update public.competitions
  set reward_rounds_per_payout = 3,
      reward_grouping_from_round = 1
  where id = comp_id;

  -- Round 1: fardin 2 wins, bossg 1, samo 0.
  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg', 1);
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo', 1);
  perform pg_temp.submit_winner(comp_id, 'fardin', 'samo', 1);
  perform pg_temp.assert_eq(pg_temp.grant_count(comp_id), 0, 'no payout after round 1');

  -- Round 2: the same.
  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg', 2);
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo', 2);
  perform pg_temp.submit_winner(comp_id, 'fardin', 'samo', 2);
  perform pg_temp.assert_eq(pg_temp.grant_count(comp_id), 0, 'no payout after round 2');

  -- Round 3: samo wins 2, bossg 1, fardin 0 (samo would win this
  -- round alone). Over 9 duels: fardin 4, bossg 3, samo 2.
  perform pg_temp.submit_winner(comp_id, 'samo', 'fardin', 3);
  perform pg_temp.submit_winner(comp_id, 'samo', 'bossg', 3);
  perform pg_temp.submit_winner(comp_id, 'bossg', 'fardin', 3);

  perform pg_temp.assert_eq(pg_temp.grant_count(comp_id), 6, 'one payout after round 3 (3 participation + 3 places)');
  perform pg_temp.assert_eq(pg_temp.grant_count(comp_id, 3), 6, 'the payout is numbered Round 3');
  perform pg_temp.assert_eq(pg_temp.holder(comp_id, 3, 'round_winner'), 'fardin', '1st over all 9 duels: fardin');
  perform pg_temp.assert_eq(pg_temp.holder(comp_id, 3, 'round_runner_up'), 'bossg', '2nd over all 9 duels: bossg');
  perform pg_temp.assert_eq(pg_temp.holder(comp_id, 3, 'round_third'), 'samo', '3rd over all 9 duels: samo');
  perform pg_temp.assert_eq(pg_temp.active_grant(comp_id, 3, 'samo', 'participation'), 300, 'participation is the normal amount');

  -- ---------- C. a correction inside the block re-settles it ----------
  -- Round 1 fardin-bossg now goes to bossg: fardin 3, bossg 4, samo 2.
  perform pg_temp.correct_winner(comp_id, 'bossg', 'fardin', 'Wrong winner tapped.', 1);

  perform pg_temp.assert_eq(pg_temp.holder(comp_id, 3, 'round_winner'), 'bossg', 'after correction: bossg 1st');
  perform pg_temp.assert_eq(pg_temp.holder(comp_id, 3, 'round_runner_up'), 'fardin', 'after correction: fardin 2nd');
  perform pg_temp.assert_eq(pg_temp.grant_count(comp_id), 6, 'still exactly one active payout');

  -- Rounds 4-6 are the next block.
  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg', 4);
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo', 4);
  perform pg_temp.submit_winner(comp_id, 'fardin', 'samo', 4);
  perform pg_temp.assert_eq(pg_temp.grant_count(comp_id), 6, 'round 4 alone pays nothing');

  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg', 5);
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo', 5);
  perform pg_temp.submit_winner(comp_id, 'fardin', 'samo', 5);
  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg', 6);
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo', 6);
  perform pg_temp.submit_winner(comp_id, 'fardin', 'samo', 6);
  perform pg_temp.assert_eq(pg_temp.grant_count(comp_id, 6), 6, 'second payout is Round 6');
  perform pg_temp.assert_eq(pg_temp.grant_count(comp_id), 12, 'two payouts in six rounds');

  -- ---------- B. switching over in a running season ----------
  comp_id := pg_temp.new_competition(6);

  -- Round 1 still pays alone (old behaviour)...
  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg', 1);
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo', 1);
  perform pg_temp.submit_winner(comp_id, 'fardin', 'samo', 1);
  perform pg_temp.assert_eq(pg_temp.grant_count(comp_id, 1), 6, 'round 1 paid one by one');

  -- ...then the owner switches to 3 rounds per payout from round 2.
  update public.competitions
  set reward_rounds_per_payout = 3,
      reward_grouping_from_round = 2
  where id = comp_id;

  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg', 2);
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo', 2);
  perform pg_temp.submit_winner(comp_id, 'fardin', 'samo', 2);
  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg', 3);
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo', 3);
  perform pg_temp.submit_winner(comp_id, 'fardin', 'samo', 3);
  perform pg_temp.assert_eq(pg_temp.grant_count(comp_id), 6, 'rounds 2-3 wait for round 4');

  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg', 4);
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo', 4);
  perform pg_temp.submit_winner(comp_id, 'fardin', 'samo', 4);
  perform pg_temp.assert_eq(pg_temp.grant_count(comp_id, 4), 6, 'rounds 2-4 pay out as Round 4');
  perform pg_temp.assert_eq(pg_temp.grant_count(comp_id, 1), 6, 'round 1 payout untouched');

  -- Rounds 5-6: the season ends after 6, so the last block is 5-6.
  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg', 5);
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo', 5);
  perform pg_temp.submit_winner(comp_id, 'fardin', 'samo', 5);
  perform pg_temp.assert_eq(pg_temp.grant_count(comp_id), 12, 'round 5 alone pays nothing');

  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg', 6);
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo', 6);
  perform pg_temp.submit_winner(comp_id, 'fardin', 'samo', 6);
  perform pg_temp.assert_eq(pg_temp.grant_count(comp_id, 6), 6, 'shorter last block (5-6) pays as Round 6');
end;
$$;
