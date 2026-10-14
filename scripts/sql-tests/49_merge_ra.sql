-- Merge of Ra (migration 202610142040), through the catalog:
--  * catalog row, title, bound ceil(ticks * 28) + 200, default rewards
--  * start_game_run: 'merge-' seeds, own Daily message, 1 Daily per
--    day, the Daily seed is the same for every player
--  * submit_game_run applies the bound and the real-time check
--    (4 ticks per move = at most ~15 moves per second); an honest
--    score lands on the day / week boards with its own title

create function pg_temp.expect_error(statement text, expected_fragment text, label text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
  exception
    when others then
      if position(expected_fragment in sqlerrm) = 0 then
        raise exception 'FAILED: % (wrong error: %)', label, sqlerrm;
      end if;
      raise notice 'ok: %', label;
      return;
  end;
  raise exception 'FAILED: % (no error raised)', label;
end;
$$;

delete from public.game_runs
where profile_id in (pg_temp.uid_of('samo'), pg_temp.uid_of('bossg'))
  and game = 'merge_ra'
  and day = public._mini_game_today();

do $$
declare
  player uuid;
  other uuid;
  merge_daily record;
  other_daily record;
  merge_practice record;
  fast_practice record;
  verdict record;
begin
  perform pg_temp.assert_eq(public._mini_game_title('merge_ra'), 'Merge of Ra', 'merge title');
  perform pg_temp.assert_eq(public._mini_game_max_score('merge_ra', 400), 11400, 'merge max score 400 ticks (100 moves)');
  perform pg_temp.assert_eq(public._mini_game_max_score('merge_ra', 4), 312, 'merge max score for a 0-move run');
  perform pg_temp.assert_eq(public._mini_game_max_score('merge_ra', 108000), 3024200, 'merge max score at the 30 minute cap');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.mini_game_reward_config where game = 'merge_ra'),
    2,
    'merge_ra has default day + week rewards'
  );
  perform pg_temp.assert_eq(
    (select active from public.mini_game_catalog where game = 'merge_ra'),
    true,
    'merge_ra is active'
  );

  player := pg_temp.act_as('samo');

  select * into merge_daily from public.start_game_run('merge_ra', 'daily', 1);
  perform pg_temp.assert_true(merge_daily.run_seed like 'merge-daily:%', 'merge daily seed');

  select * into merge_practice from public.start_game_run('merge_ra', 'practice', 1);
  perform pg_temp.assert_true(merge_practice.run_seed like 'merge-practice:%', 'merge practice seed');

  select * into fast_practice from public.start_game_run('merge_ra', 'practice', 1);
  perform pg_temp.assert_true(fast_practice.run_seed <> merge_practice.run_seed, 'practice seeds differ per run');

  perform pg_temp.expect_error(
    $q$select * from public.start_game_run('merge_ra', 'daily', 1)$q$,
    'Daily Merge',
    'second Daily Merge refused with its own message'
  );

  -- Same Daily seed for every player.
  other := pg_temp.act_as('bossg');
  select * into other_daily from public.start_game_run('merge_ra', 'daily', 1);
  perform pg_temp.assert_eq(other_daily.run_seed, merge_daily.run_seed, 'Daily Merge seed is shared by all players');

  player := pg_temp.act_as('samo');

  -- Score above the bound.
  update public.game_runs set started_at = now() - interval '2 minutes' where id = merge_practice.run_id;

  select * into verdict from public.submit_game_run(player, merge_practice.run_id, 11401, 400, '{"v":1,"m":"","end":"over","ticks":400}'::jsonb);
  perform pg_temp.assert_eq(verdict.run_status, 'rejected', 'merge score above ceil(ticks*28)+200 rejected');

  -- 1800 moves (7204 ticks = 120 s at 15 moves/s) claimed after 10 s: faster than real time.
  update public.game_runs set started_at = now() - interval '10 seconds' where id = fast_practice.run_id;

  select * into verdict from public.submit_game_run(player, fast_practice.run_id, 100, 7204, '{"v":1,"m":"","end":"over","ticks":7204}'::jsonb);
  perform pg_temp.assert_eq(verdict.run_status, 'rejected', 'more than ~15 moves per second rejected');

  -- Honest Daily.
  update public.game_runs set started_at = now() - interval '3 minutes' where id = merge_daily.run_id;

  select * into verdict from public.submit_game_run(player, merge_daily.run_id, 2316, 1204, '{"v":1,"m":"","end":"over","ticks":1204}'::jsonb);
  perform pg_temp.assert_eq(verdict.run_status, 'validated', 'merge score within the bound validated');

  perform pg_temp.assert_eq(
    (select best_score from public.mini_game_leaderboard('merge_ra', 'day', null) where profile_id = player),
    2316,
    'merge daily run shows on the day board'
  );
end;
$$;
