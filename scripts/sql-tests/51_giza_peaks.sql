-- Giza Peaks (migration 202610142060), through the catalog:
--  * catalog row, title, bound ceil(ticks * 27) + 4200, default rewards
--  * start_game_run: 'peaks-' seeds, own Daily message, 1 Daily per day
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
  and game = 'giza_peaks'
  and day = public._mini_game_today();

do $$
declare
  player uuid;
  peaks_daily record;
  peaks_practice record;
  verdict record;
begin
  perform pg_temp.assert_eq(public._mini_game_title('giza_peaks'), 'Giza Peaks', 'peaks title');
  perform pg_temp.assert_eq(public._mini_game_max_score('giza_peaks', 600), 20400, 'peaks max score 600 ticks');
  perform pg_temp.assert_eq(public._mini_game_max_score('giza_peaks', 1), 4227, 'peaks max score 1 tick');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.mini_game_reward_config where game = 'giza_peaks'),
    2,
    'giza_peaks has default day + week rewards'
  );

  player := pg_temp.act_as('fardin');

  select * into peaks_daily from public.start_game_run('giza_peaks', 'daily', 1);
  perform pg_temp.assert_true(peaks_daily.run_seed like 'peaks-daily:%', 'peaks daily seed');

  select * into peaks_practice from public.start_game_run('giza_peaks', 'practice', 1);
  perform pg_temp.assert_true(peaks_practice.run_seed like 'peaks-practice:%', 'peaks practice seed');

  perform pg_temp.expect_error(
    $q$select * from public.start_game_run('giza_peaks', 'daily', 1)$q$,
    'Daily Peaks',
    'second Daily Peaks refused with its own message'
  );

  update public.game_runs set started_at = now() - interval '2 minutes' where id = peaks_practice.run_id;

  select * into verdict from public.submit_game_run(player, peaks_practice.run_id, 20401, 600, '{"v":1,"e":[],"end":"quit","ticks":600}'::jsonb);
  perform pg_temp.assert_eq(verdict.run_status, 'rejected', 'peaks score above ceil(ticks*27)+4200 rejected');

  update public.game_runs set started_at = now() - interval '2 minutes' where id = peaks_daily.run_id;

  select * into verdict from public.submit_game_run(player, peaks_daily.run_id, 2340, 600, '{"v":1,"e":[],"end":"nomoves","ticks":600}'::jsonb);
  perform pg_temp.assert_eq(verdict.run_status, 'validated', 'peaks score within the bound validated');

  perform pg_temp.assert_eq(
    (select best_score from public.mini_game_leaderboard('giza_peaks', 'day', null) where profile_id = player),
    2340,
    'peaks daily run shows on the leaderboard'
  );
end;
$$;
