-- Fix 1: ad-hoc / practice duels give NO DP in 2.0; competition
-- matches still pay win 100 / loss 75 (league_economy_defaults),
-- each with a readable description naming the opponent.

select pg_temp.reset_players();

do $$
declare
  adhoc_id uuid;
  practice_id uuid;
  comp_id uuid;
  comp_match_id uuid;
  league uuid;
  ledger_rows integer;
  win_description text;
begin
  select league_id into league from public.league_members where profile_id = pg_temp.uid_of('samo');

  -- An ad-hoc league duel that has been completed (samo beat fardin).
  insert into public.matches (
    league_id, created_by, player_one_id, player_two_id,
    match_type, status, result, winner_id, completed_at
  )
  values (
    league, pg_temp.uid_of('samo'), pg_temp.uid_of('samo'), pg_temp.uid_of('fardin'),
    'league', 'completed', 'player_one_win', pg_temp.uid_of('samo'), now()
  )
  returning id into adhoc_id;

  -- The live app calls this after every completed match.
  perform pg_temp.act_as('samo');
  perform public.award_match_duel_points(adhoc_id);
  perform public.award_match_duel_points(adhoc_id);

  select count(*) into ledger_rows from public.duel_point_transactions where match_id = adhoc_id;
  perform pg_temp.assert_eq(ledger_rows, 0, 'ad-hoc league duel writes no DP ledger rows');
  perform pg_temp.assert_eq(pg_temp.balance('samo'), 0, 'ad-hoc duel winner gets 0 DP');
  perform pg_temp.assert_eq(pg_temp.balance('fardin'), 0, 'ad-hoc duel loser gets 0 DP');

  -- Practice duel: also nothing.
  insert into public.matches (
    league_id, created_by, player_one_id, player_two_id,
    match_type, status, result, winner_id, completed_at
  )
  values (
    league, pg_temp.uid_of('samo'), pg_temp.uid_of('samo'), pg_temp.uid_of('fardin'),
    'practice', 'completed', 'player_two_win', pg_temp.uid_of('fardin'), now()
  )
  returning id into practice_id;

  perform public.award_match_duel_points(practice_id);
  perform pg_temp.assert_eq(pg_temp.balance('fardin'), 0, 'practice duel gives 0 DP');

  -- Competition match: still pays, exactly once.
  comp_id := pg_temp.new_competition();
  comp_match_id := pg_temp.submit_winner(comp_id, 'fardin', 'bossg');

  perform pg_temp.assert_eq(pg_temp.balance('fardin'), 100, 'competition match winner gets 100 DP');
  perform pg_temp.assert_eq(pg_temp.balance('bossg'), 75, 'competition match loser gets 75 DP');

  perform pg_temp.act_as('fardin');
  perform public.award_match_duel_points(comp_match_id);
  perform pg_temp.assert_eq(pg_temp.balance('fardin'), 100, 'award_match_duel_points is idempotent for a paid competition match');

  select description into win_description
  from public.duel_point_transactions
  where match_id = comp_match_id
    and profile_id = pg_temp.uid_of('fardin');

  perform pg_temp.assert_eq(
    win_description,
    'Won a competition duel vs bossg (SQL test season)',
    'match reward has a readable description naming the opponent'
  );
end;
$$;

-- The internal award helper is not reachable from the API.
do $$
begin
  begin
    set local role authenticated;
    perform public._award_match_duel_points_internal(gen_random_uuid());
    raise exception 'FAILED: authenticated could call _award_match_duel_points_internal';
  exception
    when insufficient_privilege then
      raise notice 'ok: authenticated cannot execute _award_match_duel_points_internal';
  end;
end;
$$;
