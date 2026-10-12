-- Play / season fixes (migration 202610121500):
--  * duel_point_transactions.seq orders rows that share created_at,
--    so balance_after reads as a running balance even after a
--    correction (reversal + new credit in one transaction)
--  * competitions.is_season: only the flagged season pays bounty /
--    counts for weekly goals; a custom V2 round robin does not; one
--    open season per league; only an admin can flag one
--  * submit_competition_match_result_v2 refuses a cancelled duel or
--    a competition that is not active, for admins too
--  * settle_match_wagers marks the loser's DP escrow 'lost'

select pg_temp.reset_players();

-- ---------- A. ledger order after a correction ----------
do $$
declare
  comp_id uuid;
  seq_before bigint;
  breaks integer;
  rows_after integer;
begin
  select coalesce(max(seq), 0) into seq_before from public.duel_point_transactions;

  comp_id := pg_temp.new_competition(1);
  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg');
  perform pg_temp.submit_winner(comp_id, 'fardin', 'samo');
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo');
  -- Correction: round rewards are reversed and paid again in the
  -- same transaction (same created_at).
  perform pg_temp.correct_winner(comp_id, 'samo', 'bossg', 'SQL test: wrong winner tapped');

  select count(*) into rows_after
  from public.duel_point_transactions
  where seq > seq_before;
  perform pg_temp.assert_true(rows_after > 6, 'the round and its correction wrote ledger rows');

  select count(*) into breaks
  from (
    select
      balance_after,
      amount,
      lag(balance_after) over (partition by profile_id order by created_at, seq) as previous
    from public.duel_point_transactions
    where seq > seq_before
  ) chain
  where previous is not null
    and balance_after - amount <> previous;
  perform pg_temp.assert_eq(breaks, 0, 'ordered by created_at, seq every balance_after continues the previous row');

  perform pg_temp.assert_true(
    not exists (select 1 from public.duel_point_transactions where seq is null),
    'every ledger row has a seq'
  );
end;
$$;

-- ---------- B. explicit season flag ----------
do $$
declare
  season_id uuid;
  custom_id uuid;
  league uuid;
  raised boolean;
  played_before integer;
  played_after integer;
begin
  season_id := pg_temp.new_competition(2);

  perform pg_temp.assert_true(public._is_season_competition(season_id), 'the flagged season counts as the season');

  -- A custom competition: same shape, but never flagged.
  perform pg_temp.act_as('bossg');
  select league_id into league from public.competitions where id = season_id;
  custom_id := public.create_competition_v2(league, 'SQL test cup', 1, 'single_duel');
  perform public.add_competition_player_v2(custom_id, pg_temp.uid_of(u))
  from unnest(array['bossg', 'samo', 'fardin']) as u;
  perform public.generate_round_robin_matches_v2(custom_id);

  perform pg_temp.assert_true(not public._is_season_competition(custom_id), 'a custom V2 round robin is not the season');

  -- Weekly goals: a custom-competition duel does not count.
  played_before := public._weekly_goal_progress_count(
    'competition_matches_played', '{}'::jsonb, pg_temp.uid_of('fardin'), league,
    now() - interval '1 day', now() + interval '1 day'
  );
  perform pg_temp.submit_winner(custom_id, 'fardin', 'bossg');
  played_after := public._weekly_goal_progress_count(
    'competition_matches_played', '{}'::jsonb, pg_temp.uid_of('fardin'), league,
    now() - interval '1 day', now() + interval '1 day'
  );
  perform pg_temp.assert_eq(played_after, played_before, 'a custom-competition duel does not count for weekly goals');

  perform pg_temp.submit_winner(season_id, 'fardin', 'bossg');
  played_after := public._weekly_goal_progress_count(
    'competition_matches_played', '{}'::jsonb, pg_temp.uid_of('fardin'), league,
    now() - interval '1 day', now() + interval '1 day'
  );
  perform pg_temp.assert_eq(played_after, played_before + 1, 'a season duel counts for weekly goals');

  -- Custom competition: fardin leads 1-0, samo beats him -> no bounty.
  perform pg_temp.submit_winner(custom_id, 'samo', 'fardin');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.season_bonus_grants where competition_id = custom_id),
    0,
    'no bounty / catch-up in a custom competition'
  );

  -- A second season while one is open: refused.
  raised := false;
  begin
    perform pg_temp.act_as('bossg');
    perform public.mark_competition_as_season(custom_id);
  exception when others then
    raised := sqlerrm like 'A season is already running%';
  end;
  perform pg_temp.assert_true(raised, 'cannot start a second season while one is running');

  -- Only an admin can flag a season.
  update public.competitions set status = 'completed' where id = season_id;
  raised := false;
  begin
    perform pg_temp.act_as('samo');
    perform public.mark_competition_as_season(custom_id);
  exception when others then
    raised := sqlerrm like 'Only a league admin%';
  end;
  perform pg_temp.assert_true(raised, 'a player cannot flag a season');

  -- With the old season finished, the admin can.
  perform pg_temp.act_as('bossg');
  perform public.mark_competition_as_season(custom_id);
  perform pg_temp.assert_true(public._is_season_competition(custom_id), 'admin starts the next season once the last one is finished');
end;
$$;

-- ---------- C. submit guards apply to admins too ----------
do $$
declare
  comp_id uuid;
  m uuid;
  raised text;
begin
  comp_id := pg_temp.new_competition(1);

  m := pg_temp.match_between(comp_id, 'samo', 'fardin');
  update public.matches set status = 'cancelled' where id = m;

  raised := null;
  begin
    perform pg_temp.act_as('bossg');
    perform public.submit_competition_match_result_v2(m, 1, 0);
  exception when others then
    raised := sqlerrm;
  end;
  perform pg_temp.assert_eq(raised, 'This match can no longer take a result.', 'admin cannot record a result for a cancelled duel');

  m := pg_temp.match_between(comp_id, 'bossg', 'samo');
  update public.competitions set status = 'cancelled' where id = comp_id;

  raised := null;
  begin
    perform pg_temp.act_as('bossg');
    perform public.submit_competition_match_result_v2(m, 1, 0);
  exception when others then
    raised := sqlerrm;
  end;
  perform pg_temp.assert_eq(raised, 'This competition is not active.', 'admin cannot record a result in a competition that is not active');
end;
$$;

-- ---------- D. wager escrow status after settlement ----------
do $$
declare
  league uuid;
  practice_id uuid;
  samo_status text;
  fardin_status text;
begin
  select lm.league_id into league
  from public.league_members lm
  where lm.profile_id = pg_temp.uid_of('samo');

  insert into public.matches (
    league_id, created_by, player_one_id, player_two_id,
    match_type, status, result, winner_id, completed_at,
    wager_type, wager_dp_amount, wager_status
  )
  values (
    league, pg_temp.uid_of('samo'), pg_temp.uid_of('samo'), pg_temp.uid_of('fardin'),
    'practice', 'completed', 'player_two_win', pg_temp.uid_of('fardin'), now(),
    'dp', 50, 'funded'
  )
  returning id into practice_id;

  insert into public.match_dp_escrows (match_id, profile_id, amount, status)
  values
    (practice_id, pg_temp.uid_of('samo'), 50, 'funded'),
    (practice_id, pg_temp.uid_of('fardin'), 50, 'funded');

  perform pg_temp.act_as('fardin');
  perform public.settle_match_wagers(practice_id);

  select status into samo_status from public.match_dp_escrows
  where match_id = practice_id and profile_id = pg_temp.uid_of('samo');
  select status into fardin_status from public.match_dp_escrows
  where match_id = practice_id and profile_id = pg_temp.uid_of('fardin');

  perform pg_temp.assert_eq(fardin_status, 'won', 'winner escrow is won');
  perform pg_temp.assert_eq(samo_status, 'lost', 'loser escrow is lost (was won)');
  perform pg_temp.assert_eq(
    (select wager_status from public.matches where id = practice_id),
    'settled',
    'match wager is settled'
  );
end;
$$;
