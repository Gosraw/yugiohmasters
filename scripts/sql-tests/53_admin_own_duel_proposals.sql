-- Admin plays in the duel = the opponent has to say OK
-- (202610152010_admin_own_duel_needs_opponent_ok, owner decision B):
--  * a correction of the admin's OWN season duel is only a proposal:
--    nothing (result, DP, round grants) changes until the opponent
--    accepts; reject / withdraw / a newer proposal leave it unchanged
--  * only the opponent can accept or reject, only the admin withdraw
--  * a correction of a duel the admin does NOT play in stays instant
--  * a tiebreak result in the admin's own tiebreak duel waits too
--  * resolving the admin's own disputed PRACTICE duel (wager) waits
--    for the opponent; the wager then settles normally

select pg_temp.reset_players();

-- ---------- A. season correction ----------
do $$
declare
  comp_id uuid;
  own uuid;     -- bossg vs fardin (fardin won)
  other uuid;   -- samo vs fardin (samo won)
  m public.matches%rowtype;
  proposal public.match_result_proposals%rowtype;
  bossg_one integer;
  bossg_two integer;
  raised text;
  bossg_before integer;
  fardin_before integer;
begin
  comp_id := pg_temp.new_competition(1);
  own := pg_temp.submit_winner(comp_id, 'fardin', 'bossg');
  other := pg_temp.submit_winner(comp_id, 'samo', 'fardin');

  select * into m from public.matches where id = own;
  bossg_one := case when m.player_one_id = pg_temp.uid_of('bossg') then 1 else 0 end;
  bossg_two := 1 - bossg_one;

  bossg_before := pg_temp.balance('bossg');
  fardin_before := pg_temp.balance('fardin');

  perform pg_temp.act_as('bossg');
  perform public.correct_competition_match_result_v2(own, bossg_one, bossg_two, 'I actually won');

  select * into m from public.matches where id = own;
  perform pg_temp.assert_eq(m.winner_id, pg_temp.uid_of('fardin'), 'own duel: the result is NOT changed yet');
  perform pg_temp.assert_eq(pg_temp.balance('bossg'), bossg_before, 'own duel: no DP moved for bossg');
  perform pg_temp.assert_eq(pg_temp.balance('fardin'), fardin_before, 'own duel: no DP moved for fardin');

  select * into proposal from public.match_result_proposals where match_id = own and status = 'pending';
  perform pg_temp.assert_true(proposal.id is not null, 'a pending proposal exists');
  perform pg_temp.assert_eq(proposal.kind, 'competition_correction', 'proposal kind');
  perform pg_temp.assert_eq(proposal.respond_by, pg_temp.uid_of('fardin'), 'the opponent has to answer');
  perform pg_temp.assert_eq(proposal.reason, 'I actually won', 'the reason is stored');

  -- Same result again (the current one) is refused.
  raised := null;
  begin
    perform public.correct_competition_match_result_v2(own, 1 - bossg_one, 1 - bossg_two, 'no-op');
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_eq(raised, 'That is already the result of this duel.', 'a no-op proposal is refused');

  -- The admin cannot accept their own proposal; an outsider neither.
  raised := null;
  begin
    perform public.accept_match_result_proposal(proposal.id);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_true(raised like 'Only the opponent%', 'the admin cannot accept their own proposal');

  perform pg_temp.act_as('samo');
  raised := null;
  begin
    perform public.accept_match_result_proposal(proposal.id);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_true(raised like 'Only the opponent%', 'a player outside the duel cannot accept');

  -- Every league member can SEE it (RLS), samo included.
  perform pg_temp.assert_true(
    exists (select 1 from public.match_result_proposals where id = proposal.id),
    'league members can read the proposal'
  );

  -- Reject: nothing changes.
  perform pg_temp.act_as('fardin');
  perform public.reject_match_result_proposal(proposal.id, 'No, I won that one');
  perform pg_temp.assert_eq(
    (select status from public.match_result_proposals where id = proposal.id), 'rejected',
    'the opponent can reject'
  );
  perform pg_temp.assert_eq(
    (select winner_id from public.matches where id = own), pg_temp.uid_of('fardin'),
    'a rejected proposal changes nothing'
  );

  raised := null;
  begin
    perform public.accept_match_result_proposal(proposal.id);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_true(raised like 'This proposal was already answered%', 'a rejected proposal cannot be accepted later');

  -- Withdraw.
  perform pg_temp.act_as('bossg');
  perform public.correct_competition_match_result_v2(own, bossg_one, bossg_two, 'Second try');
  select * into proposal from public.match_result_proposals where match_id = own and status = 'pending';

  perform pg_temp.act_as('fardin');
  raised := null;
  begin
    perform public.withdraw_match_result_proposal(proposal.id);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_true(raised like 'Only the admin who proposed%', 'only the proposer can withdraw');

  perform pg_temp.act_as('bossg');
  perform public.withdraw_match_result_proposal(proposal.id);
  perform pg_temp.assert_eq(
    (select status from public.match_result_proposals where id = proposal.id), 'withdrawn',
    'the admin can withdraw'
  );

  -- A newer proposal replaces the open one.
  perform public.correct_competition_match_result_v2(own, bossg_one, bossg_two, 'Third try');
  select * into proposal from public.match_result_proposals where match_id = own and status = 'pending';
  perform public.correct_competition_match_result_v2(own, bossg_one, bossg_two, 'Fourth try');
  perform pg_temp.assert_eq(
    (select status from public.match_result_proposals where id = proposal.id), 'superseded',
    'a newer proposal supersedes the open one'
  );
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.match_result_proposals where match_id = own and status = 'pending'), 1,
    'at most one open proposal per duel'
  );

  -- Accept: applied exactly like a referee correction.
  select * into proposal from public.match_result_proposals where match_id = own and status = 'pending';
  perform pg_temp.act_as('fardin');
  perform public.accept_match_result_proposal(proposal.id);

  select * into m from public.matches where id = own;
  perform pg_temp.assert_eq(m.winner_id, pg_temp.uid_of('bossg'), 'accepted: bossg is now the winner');
  perform pg_temp.assert_eq(
    (select status from public.match_result_proposals where id = proposal.id), 'accepted',
    'the proposal is marked accepted'
  );
  perform pg_temp.assert_eq(pg_temp.balance('bossg') - bossg_before, 25, 'accepted: bossg match DP 75 -> 100');
  perform pg_temp.assert_true(pg_temp.balance('fardin') < fardin_before, 'accepted: fardin loses the win DP');
  perform pg_temp.assert_true(m.notes like '%Fourth try%', 'the correction note uses the proposal reason');

  -- Referee: bossg corrects samo vs fardin - instant, no proposal.
  select * into m from public.matches where id = other;
  perform pg_temp.act_as('bossg');
  perform public.correct_competition_match_result_v2(
    other,
    case when m.player_one_id = pg_temp.uid_of('fardin') then 1 else 0 end,
    case when m.player_two_id = pg_temp.uid_of('fardin') then 1 else 0 end,
    'Referee fix'
  );
  perform pg_temp.assert_eq(
    (select winner_id from public.matches where id = other), pg_temp.uid_of('fardin'),
    'a duel the admin does not play in is corrected at once'
  );
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.match_result_proposals where match_id = other), 0,
    'no proposal for a referee correction'
  );
end;
$$;

-- ---------- B. tiebreak result in the admin's own tiebreak duel ----------
select pg_temp.reset_players();

do $$
declare
  comp_id uuid;
  tb public.competition_tiebreaks%rowtype;
  tb_match public.matches%rowtype;
  proposal public.match_result_proposals%rowtype;
  opponent uuid;
  bossg_one integer;
begin
  comp_id := pg_temp.new_competition(1);

  -- A full 3-way tie: everyone wins once.
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo');
  perform pg_temp.submit_winner(comp_id, 'samo', 'fardin');
  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg');

  perform pg_temp.act_as('bossg');
  perform public.detect_and_create_competition_tiebreaks(comp_id);
  select * into tb from public.competition_tiebreaks where competition_id = comp_id;
  perform pg_temp.assert_eq(tb.tie_size, 3, 'a 3-way tiebreak exists');

  perform public.start_competition_tiebreak(tb.id);
  select * into tb_match from public.matches where tiebreak_id = tb.id and status <> 'completed';

  -- bossg sits out the first deciding duel? Referee it (instant),
  -- then the next duel is the streak holder vs bossg.
  if pg_temp.uid_of('bossg') not in (tb_match.player_one_id, tb_match.player_two_id) then
    perform public.submit_competition_tiebreak_match_result(tb_match.id, 1, 0);
    perform pg_temp.assert_eq(
      (select status::text from public.matches where id = tb_match.id), 'completed',
      'a tiebreak duel without the admin is final at once'
    );

    perform public.start_competition_tiebreak(tb.id);
    select * into tb_match from public.matches where tiebreak_id = tb.id and status <> 'completed';
  end if;

  perform pg_temp.assert_true(
    pg_temp.uid_of('bossg') in (tb_match.player_one_id, tb_match.player_two_id),
    'bossg plays in this tiebreak duel'
  );

  bossg_one := case when tb_match.player_one_id = pg_temp.uid_of('bossg') then 1 else 0 end;
  opponent := case when bossg_one = 1 then tb_match.player_two_id else tb_match.player_one_id end;

  perform public.submit_competition_tiebreak_match_result(tb_match.id, bossg_one, 1 - bossg_one);

  perform pg_temp.assert_eq(
    (select status::text from public.matches where id = tb_match.id), 'pending',
    'the admin''s own tiebreak result waits for the opponent'
  );

  select * into proposal from public.match_result_proposals where match_id = tb_match.id and status = 'pending';
  perform pg_temp.assert_eq(proposal.kind, 'tiebreak_result', 'tiebreak proposal stored');
  perform pg_temp.assert_eq(proposal.respond_by, opponent, 'the tiebreak opponent answers');

  perform set_config('request.jwt.claims', json_build_object('sub', opponent, 'role', 'authenticated')::text, true);
  perform public.accept_match_result_proposal(proposal.id);

  select * into tb_match from public.matches where id = tb_match.id;
  perform pg_temp.assert_eq(tb_match.status::text, 'completed', 'accepted: the tiebreak duel is completed');
  perform pg_temp.assert_eq(tb_match.winner_id, pg_temp.uid_of('bossg'), 'accepted: bossg won it');
  perform pg_temp.assert_eq(tb_match.result_confirmed_by, opponent, 'the opponent is recorded as confirming');
  perform pg_temp.assert_eq(
    (select streak_holder_id from public.competition_tiebreaks where id = tb.id),
    pg_temp.uid_of('bossg'),
    'the tiebreak streak moved to bossg'
  );
end;
$$;

-- ---------- C. admin's own disputed practice duel (DP wager) ----------
select pg_temp.reset_players();

do $$
declare
  league uuid;
  practice_id uuid;
  proposal public.match_result_proposals%rowtype;
  raised text;
begin
  select lm.league_id into league
  from public.league_members lm
  where lm.profile_id = pg_temp.uid_of('bossg');

  insert into public.matches (
    league_id, created_by, player_one_id, player_two_id,
    match_type, status, result, winner_id,
    result_submitted_by, result_submitted_at,
    disputed_by, disputed_at, dispute_reason,
    wager_type, wager_dp_amount, wager_status
  )
  values (
    league, pg_temp.uid_of('bossg'), pg_temp.uid_of('bossg'), pg_temp.uid_of('samo'),
    'practice', 'disputed', 'player_two_win', pg_temp.uid_of('samo'),
    pg_temp.uid_of('samo'), now(),
    pg_temp.uid_of('bossg'), now(), 'I won',
    'dp', 100, 'funded'
  )
  returning id into practice_id;

  insert into public.match_dp_escrows (match_id, profile_id, amount, status)
  values
    (practice_id, pg_temp.uid_of('bossg'), 100, 'funded'),
    (practice_id, pg_temp.uid_of('samo'), 100, 'funded');

  perform pg_temp.act_as('bossg');
  perform public.resolve_disputed_match(practice_id, 'player_one_win', 'My win');

  perform pg_temp.assert_eq(
    (select status::text from public.matches where id = practice_id), 'disputed',
    'the admin''s own disputed duel stays disputed'
  );

  raised := null;
  begin
    perform public.settle_match_wagers(practice_id);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_true(raised like 'Match is not completed%', 'the wager cannot settle yet');

  select * into proposal from public.match_result_proposals where match_id = practice_id and status = 'pending';
  perform pg_temp.assert_eq(proposal.kind, 'practice_resolution', 'practice proposal stored');
  perform pg_temp.assert_eq(proposal.proposed_result::text, 'player_one_win', 'the proposed result');
  perform pg_temp.assert_eq(proposal.respond_by, pg_temp.uid_of('samo'), 'samo answers');

  perform pg_temp.act_as('samo');
  perform public.accept_match_result_proposal(proposal.id);
  perform public.settle_match_wagers(practice_id);

  perform pg_temp.assert_eq(
    (select winner_id from public.matches where id = practice_id), pg_temp.uid_of('bossg'),
    'accepted: bossg wins the practice duel'
  );
  perform pg_temp.assert_eq(pg_temp.balance('bossg'), 200, 'the wager pool goes to bossg');
  perform pg_temp.assert_eq(pg_temp.balance('samo'), 0, 'samo gets nothing back');
end;
$$;

-- Nobody signed out can call the new RPCs.
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.accept_match_result_proposal(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.reject_match_result_proposal(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.withdraw_match_result_proposal(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public._apply_competition_match_correction(uuid, integer, integer, text)', 'execute')
  and not has_function_privilege('authenticated', 'public._apply_competition_tiebreak_result(uuid, integer, integer)', 'execute'),
  'proposal RPCs are signed-in only; the apply functions are internal'
);
