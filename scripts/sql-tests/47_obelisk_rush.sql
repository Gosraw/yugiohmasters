-- Obelisk Rush (migration 202610142030), registered via the catalog:
--  * catalog row: title, seed prefix, bound ceil(ticks * 0.375) + 2
--  * default day + week rewards exist
--  * start_game_run: daily + practice seeds with the obelisk- prefix,
--    one Daily Rush per day with its own message
--  * submit_game_run (service role path) applies the bound, an honest
--    score is validated and shows on the leaderboard

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
  and game = 'obelisk_rush'
  and day = public._mini_game_today();

do $$
declare
  player uuid;
  rush_daily record;
  rush_practice record;
  verdict record;
begin
  perform pg_temp.assert_eq(public._mini_game_title('obelisk_rush'), 'Obelisk Rush', 'rush title');
  perform pg_temp.assert_eq(public._mini_game_max_score('obelisk_rush', 600), 227, 'rush max score 600 ticks = ceil(600*0.375)+2');
  perform pg_temp.assert_eq(public._mini_game_max_score('obelisk_rush', 1), 3, 'rush max score 1 tick');
  perform pg_temp.assert_eq(public._mini_game_max_score('obelisk_rush', 108000), 40502, 'rush max score at the cap');

  perform pg_temp.assert_eq(
    (select count(*)::integer from public.mini_game_reward_config where game = 'obelisk_rush'),
    2,
    'obelisk_rush has default day + week rewards'
  );

  player := pg_temp.act_as('fardin');

  select * into rush_daily from public.start_game_run('obelisk_rush', 'daily', 1);
  perform pg_temp.assert_true(rush_daily.run_seed like 'obelisk-daily:%', 'rush daily seed');

  select * into rush_practice from public.start_game_run('obelisk_rush', 'practice', 1);
  perform pg_temp.assert_true(rush_practice.run_seed like 'obelisk-practice:%', 'rush practice seed');

  perform pg_temp.expect_error(
    $q$select * from public.start_game_run('obelisk_rush', 'daily', 1)$q$,
    'Daily Rush',
    'second Daily Rush refused with its own message'
  );

  update public.game_runs set started_at = now() - interval '2 minutes' where id = rush_practice.run_id;

  select * into verdict from public.submit_game_run(player, rush_practice.run_id, 228, 600, '{"v":1,"e":[],"s":"","end":"cut","ticks":600}'::jsonb);
  perform pg_temp.assert_eq(verdict.run_status, 'rejected', 'rush score above ceil(ticks*0.375)+2 rejected');

  update public.game_runs set started_at = now() - interval '2 minutes' where id = rush_daily.run_id;

  select * into verdict from public.submit_game_run(player, rush_daily.run_id, 120, 600, '{"v":1,"e":[],"s":"","end":"cut","ticks":600}'::jsonb);
  perform pg_temp.assert_eq(verdict.run_status, 'validated', 'rush score within the bound validated');

  perform pg_temp.assert_eq(
    (select best_score from public.mini_game_leaderboard('obelisk_rush', 'day', null) where profile_id = player),
    120,
    'rush daily run shows on the leaderboard'
  );
end;
$$;
