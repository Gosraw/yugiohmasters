-- Tomb Blocks (migration 202610142050), through the catalog:
--  * catalog row, title, bound ceil(ticks * 125) + 100, default rewards
--  * start_game_run: 'tomb-' seeds, own Daily message, 1 Daily per day
--  * submit_game_run applies the bound; an honest score lands on the
--    day board

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
where profile_id = pg_temp.uid_of('fardin')
  and game = 'tomb_blocks'
  and day = public._mini_game_today();

do $$
declare
  player uuid;
  tomb_daily record;
  tomb_practice record;
  verdict record;
begin
  perform pg_temp.assert_eq(public._mini_game_title('tomb_blocks'), 'Tomb Blocks', 'tomb title');
  -- 12 ticks = the fastest allowed placement: 125 * 12 + 100 = 1600 >= 1464 (best single placement).
  perform pg_temp.assert_eq(public._mini_game_max_score('tomb_blocks', 12), 1600, 'tomb max score after one fastest placement');
  perform pg_temp.assert_eq(public._mini_game_max_score('tomb_blocks', 600), 75100, 'tomb max score 600 ticks');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.mini_game_reward_config where game = 'tomb_blocks'),
    2,
    'tomb_blocks has default day + week rewards'
  );

  player := pg_temp.act_as('fardin');

  select * into tomb_daily from public.start_game_run('tomb_blocks', 'daily', 1);
  perform pg_temp.assert_true(tomb_daily.run_seed like 'tomb-daily:%', 'tomb daily seed');

  select * into tomb_practice from public.start_game_run('tomb_blocks', 'practice', 1);
  perform pg_temp.assert_true(tomb_practice.run_seed like 'tomb-practice:%', 'tomb practice seed');

  perform pg_temp.expect_error(
    $q$select * from public.start_game_run('tomb_blocks', 'daily', 1)$q$,
    'Daily Tomb',
    'second Daily Tomb refused with its own message'
  );

  update public.game_runs set started_at = now() - interval '2 minutes' where id = tomb_practice.run_id;

  select * into verdict from public.submit_game_run(player, tomb_practice.run_id, 75101, 600, '{"v":1,"m":[],"t":[],"end":"over","ticks":600}'::jsonb);
  perform pg_temp.assert_eq(verdict.run_status, 'rejected', 'tomb score above ceil(ticks*125)+100 rejected');

  update public.game_runs set started_at = now() - interval '2 minutes' where id = tomb_daily.run_id;

  select * into verdict from public.submit_game_run(player, tomb_daily.run_id, 412, 600, '{"v":1,"m":[],"t":[],"end":"over","ticks":600}'::jsonb);
  perform pg_temp.assert_eq(verdict.run_status, 'validated', 'tomb score within the bound validated');

  perform pg_temp.assert_eq(
    (select best_score from public.mini_game_leaderboard('tomb_blocks', 'day', null) where profile_id = player),
    412,
    'tomb daily run shows on the leaderboard'
  );
end;
$$;
