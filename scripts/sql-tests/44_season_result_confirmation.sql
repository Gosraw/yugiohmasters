-- Season result confirmation (migration 202610121800):
--  * a player's tap is a claim: no DP, no round settlement yet
--  * only the OPPONENT can confirm; confirm pays exactly once
--  * same result from both phones = confirmed, different = disputed
--  * the admin who plays in the duel still needs the opponent
--  * the submitter can withdraw / change their claim
--  * an admin who does not play is the referee (final at once)

select pg_temp.reset_players();

do $$
declare
  comp_id uuid;
  a uuid; -- samo vs fardin
  x uuid; -- bossg vs fardin
  y uuid; -- bossg vs samo
  m public.matches%rowtype;
  raised text;
  samo_won_one integer;
  samo_won_two integer;
begin
  comp_id := pg_temp.new_competition(1);
  a := pg_temp.match_between(comp_id, 'samo', 'fardin');
  x := pg_temp.match_between(comp_id, 'bossg', 'fardin');
  y := pg_temp.match_between(comp_id, 'bossg', 'samo');

  -- ---------- A. claim -> confirm by the opponent ----------
  select * into m from public.matches where id = a;
  samo_won_one := case when m.player_one_id = pg_temp.uid_of('samo') then 1 else 0 end;
  samo_won_two := 1 - samo_won_one;

  perform pg_temp.act_as('samo');
  perform public.submit_competition_match_result_v2(a, samo_won_one, samo_won_two);

  select * into m from public.matches where id = a;
  perform pg_temp.assert_eq(m.status::text, 'result_submitted', 'a player''s tap waits for the opponent');
  perform pg_temp.assert_eq(m.result_submitted_by, pg_temp.uid_of('samo'), 'the claim remembers who sent it');
  perform pg_temp.assert_eq(m.winner_id, pg_temp.uid_of('samo'), 'the claim stores the claimed winner');
  perform pg_temp.assert_eq(pg_temp.balance('samo'), 0, 'no DP for the claimed winner yet');
  perform pg_temp.assert_eq(pg_temp.balance('fardin'), 0, 'no DP for the claimed loser yet');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.duel_point_transactions where match_id = a), 0,
    'no ledger rows before the confirmation'
  );
  perform pg_temp.assert_eq(
    (select played from public.get_competition_standings_v2(comp_id) where profile_id = pg_temp.uid_of('samo')), 0,
    'an unconfirmed duel is not in the standings'
  );

  -- The submitter cannot confirm their own claim.
  raised := null;
  begin
    perform public.confirm_competition_match_result(a);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_true(raised like 'You sent this result%', 'the submitter cannot confirm (' || coalesce(raised, 'no error') || ')');

  -- An outsider (even the admin) cannot confirm.
  perform pg_temp.act_as('bossg');
  raised := null;
  begin
    perform public.confirm_competition_match_result(a);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_true(raised like 'Only a player in this duel%', 'a non-player cannot confirm');

  -- The opponent cannot withdraw it.
  perform pg_temp.act_as('fardin');
  raised := null;
  begin
    perform public.withdraw_competition_match_result(a);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_true(raised like 'Only the player who sent%', 'only the submitter can withdraw');

  -- The practice-duel RPCs cannot skip the season payout path.
  raised := null;
  begin
    perform public.complete_match(a, 'player_one_win', null);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_true(raised like 'Season duels are recorded%', 'complete_match refuses a season duel');

  -- One tap by the opponent: completed and paid.
  perform public.confirm_competition_match_result(a);

  select * into m from public.matches where id = a;
  perform pg_temp.assert_eq(m.status::text, 'completed', 'the opponent''s confirmation completes the duel');
  perform pg_temp.assert_eq(m.result_confirmed_by, pg_temp.uid_of('fardin'), 'the confirmation remembers who confirmed');
  perform pg_temp.assert_eq(pg_temp.balance('samo'), 100, 'winner gets match DP once');
  perform pg_temp.assert_eq(pg_temp.balance('fardin'), 75, 'loser gets match DP once');

  -- A second confirmation (double tap / second phone) pays nothing.
  raised := null;
  begin
    perform public.confirm_competition_match_result(a);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_true(raised like '%already has a confirmed result%', 'a second confirmation is refused');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.duel_point_transactions where match_id = a), 2,
    'exactly one ledger row per player for the duel'
  );

  -- The practice confirm RPC routes to the season path too (no-op now).
  raised := null;
  begin
    perform public.confirm_match_result(a);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_true(raised like '%already has a confirmed result%', 'confirm_match_result routes a season duel');

  -- ---------- X. the admin plays: still needs the opponent ----------
  select * into m from public.matches where id = x;

  perform pg_temp.act_as('bossg');
  perform public.submit_competition_match_result_v2(
    x,
    case when m.player_one_id = pg_temp.uid_of('bossg') then 1 else 0 end,
    case when m.player_two_id = pg_temp.uid_of('bossg') then 1 else 0 end
  );
  perform pg_temp.assert_eq(
    (select status::text from public.matches where id = x), 'result_submitted',
    'an admin who plays in the duel is not the referee'
  );
  perform pg_temp.assert_eq(pg_temp.balance('bossg'), 0, 'no DP for the admin''s own claim');

  -- Same result from fardin's phone = the confirmation.
  perform pg_temp.act_as('fardin');
  perform public.submit_competition_match_result_v2(
    x,
    case when m.player_one_id = pg_temp.uid_of('bossg') then 1 else 0 end,
    case when m.player_two_id = pg_temp.uid_of('bossg') then 1 else 0 end
  );
  select * into m from public.matches where id = x;
  perform pg_temp.assert_eq(m.status::text, 'completed', 'the same result from both phones counts as confirmed');
  perform pg_temp.assert_eq(m.result_submitted_by, pg_temp.uid_of('bossg'), 'the first phone stays the submitter');
  perform pg_temp.assert_eq(pg_temp.balance('bossg'), 100, 'bossg paid once');
  perform pg_temp.assert_eq(pg_temp.balance('fardin'), 150, 'fardin paid once more (75 + 75)');

  -- ---------- Y. withdraw, change, different results, referee ----------
  select * into m from public.matches where id = y;
  samo_won_one := case when m.player_one_id = pg_temp.uid_of('samo') then 1 else 0 end;
  samo_won_two := 1 - samo_won_one;

  perform pg_temp.act_as('samo');
  perform public.submit_competition_match_result_v2(y, samo_won_one, samo_won_two);
  perform public.withdraw_competition_match_result(y);

  select * into m from public.matches where id = y;
  perform pg_temp.assert_eq(m.status::text, 'pending', 'withdraw puts the duel back to open');
  perform pg_temp.assert_true(m.winner_id is null and m.result_submitted_by is null, 'withdraw clears the claim');

  -- Change of mind before confirmation: bossg won ... no, samo won.
  perform public.submit_competition_match_result_v2(y, 1 - samo_won_one, 1 - samo_won_two);
  perform public.submit_competition_match_result_v2(y, samo_won_one, samo_won_two);
  select * into m from public.matches where id = y;
  perform pg_temp.assert_eq(m.winner_id, pg_temp.uid_of('samo'), 'the submitter can change their claim');
  perform pg_temp.assert_eq(m.status::text, 'result_submitted', 'a changed claim still waits');

  -- bossg's phone says bossg won: disputed.
  perform pg_temp.act_as('bossg');
  perform public.submit_competition_match_result_v2(y, 1 - samo_won_one, 1 - samo_won_two);
  select * into m from public.matches where id = y;
  perform pg_temp.assert_eq(m.status::text, 'disputed', 'different results from both phones = disputed');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.competition_round_reward_grants where competition_id = comp_id), 0,
    'the round does not settle while a duel is disputed'
  );

  raised := null;
  begin
    perform public.confirm_competition_match_result(y);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_true(raised like 'This duel is not waiting%', 'a disputed duel cannot be confirmed');

  -- A second admin who does not play referees it: final at once.
  update public.league_members
  set role = 'admin'
  where profile_id = pg_temp.uid_of('fardin');

  perform pg_temp.act_as('fardin');
  perform public.submit_competition_match_result_v2(y, samo_won_one, samo_won_two);
  select * into m from public.matches where id = y;
  perform pg_temp.assert_eq(m.status::text, 'completed', 'the referee''s result is final');
  perform pg_temp.assert_eq(m.winner_id, pg_temp.uid_of('samo'), 'the referee picked samo');

  perform pg_temp.assert_eq(
    (select count(*)::integer from public.competition_round_reward_grants
      where competition_id = comp_id and reward_role = 'participation' and status = 'granted'),
    3,
    'the round settled once every duel was confirmed'
  );
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.duel_point_transactions where match_id in (a, x, y)), 6,
    'two match DP rows per duel, never more'
  );
end;
$$;
