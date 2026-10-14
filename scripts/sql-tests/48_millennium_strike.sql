-- Millennium Strike (migration 202610142020), through the catalog:
--  * catalog row, title, bound ceil(ticks * 0.4) + 40, default rewards
--  * start_game_run: 'strike-' seeds, own Daily message, 1 Daily per day
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
  and game = 'millennium_strike'
  and day = public._mini_game_today();

do $$
declare
  player uuid;
  strike_daily record;
  strike_practice record;
  verdict record;
begin
  perform pg_temp.assert_eq(public._mini_game_title('millennium_strike'), 'Millennium Strike', 'strike title');
  perform pg_temp.assert_eq(public._mini_game_max_score('millennium_strike', 600), 280, 'strike max score 600 ticks');
  perform pg_temp.assert_eq(public._mini_game_max_score('millennium_strike', 1), 41, 'strike max score rounds up');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.mini_game_reward_config where game = 'millennium_strike'),
    2,
    'millennium_strike has default day + week rewards'
  );

  player := pg_temp.act_as('fardin');

  select * into strike_daily from public.start_game_run('millennium_strike', 'daily', 1);
  perform pg_temp.assert_true(strike_daily.run_seed like 'strike-daily:%', 'strike daily seed');

  select * into strike_practice from public.start_game_run('millennium_strike', 'practice', 1);
  perform pg_temp.assert_true(strike_practice.run_seed like 'strike-practice:%', 'strike practice seed');

  perform pg_temp.expect_error(
    $q$select * from public.start_game_run('millennium_strike', 'daily', 1)$q$,
    'Daily Strike',
    'second Daily Strike refused with its own message'
  );

  update public.game_runs set started_at = now() - interval '2 minutes' where id = strike_practice.run_id;

  select * into verdict from public.submit_game_run(player, strike_practice.run_id, 281, 600, '{"v":1,"e":[],"end":"clash","ticks":600}'::jsonb);
  perform pg_temp.assert_eq(verdict.run_status, 'rejected', 'strike score above ceil(ticks*0.4)+40 rejected');

  update public.game_runs set started_at = now() - interval '2 minutes' where id = strike_daily.run_id;

  select * into verdict from public.submit_game_run(player, strike_daily.run_id, 57, 600, '{"v":1,"e":[],"end":"clash","ticks":600}'::jsonb);
  perform pg_temp.assert_eq(verdict.run_status, 'validated', 'strike score within the bound validated');

  perform pg_temp.assert_eq(
    (select best_score from public.mini_game_leaderboard('millennium_strike', 'day', null) where profile_id = player),
    57,
    'strike daily run shows on the leaderboard'
  );
end;
$$;
