-- Mini game catalog (migrations 202610142000 + 202610142010):
--  * _mini_game_max_score / _mini_game_title read the catalog and
--    give exactly the old numbers / names for the two old games
--  * start_game_run accepts catalog games (incl. pyramid_stack),
--    keeps the per-game "already played" message and seed prefix,
--    refuses unknown and inactive games
--  * default rewards exist for pyramid_stack
--  * game_runs.game must be a catalog game (FK)
--  * players can read the catalog, never write it; only the service
--    role may call register_mini_game
--  * submit_game_run applies the stack bound ceil(ticks * 0.1) + 2

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

-- Start clean for bossg today (rolled back with the test).
delete from public.game_runs
where profile_id = pg_temp.uid_of('bossg')
  and day = public._mini_game_today();

do $$
declare
  boss uuid;
  climb_seed text;
  arena_seed text;
  stack_daily record;
  stack_practice record;
  verdict record;
  visible integer;
begin
  -- Same max-score numbers as the hard-coded CASE had.
  perform pg_temp.assert_eq(public._mini_game_max_score('pyramid_climb', 1000), 2730, 'climb max score 1000 ticks');
  perform pg_temp.assert_eq(public._mini_game_max_score('pyramid_climb', 7), 49, 'climb max score rounds up like ceil(t*27/10.0)');
  perform pg_temp.assert_eq(public._mini_game_max_score('pyramid_climb', 108000), ceil(108000 * 27 / 10.0)::integer + 30, 'climb max score at the cap');
  perform pg_temp.assert_eq(public._mini_game_max_score('auto_battler', 1), 122012, 'arena max score');
  perform pg_temp.assert_eq(public._mini_game_max_score('auto_battler', 108000), 122012, 'arena max score is flat');
  perform pg_temp.assert_eq(public._mini_game_max_score('pyramid_stack', 600), 62, 'stack max score 600 ticks');
  perform pg_temp.assert_eq(public._mini_game_max_score('no_such_game', 10), 2147483647, 'unknown game keeps the old no-bound');

  perform pg_temp.assert_eq(public._mini_game_title('pyramid_climb'), 'Pyramid Climb', 'climb title');
  perform pg_temp.assert_eq(public._mini_game_title('auto_battler'), 'Shadow Arena', 'arena title');
  perform pg_temp.assert_eq(public._mini_game_title('pyramid_stack'), 'Pyramid Stack', 'stack title');
  perform pg_temp.assert_eq(public._mini_game_title('some_new_thing'), 'Some New Thing', 'fallback title');

  perform pg_temp.assert_eq(
    (select count(*)::integer from public.mini_game_reward_config where game = 'pyramid_stack'),
    2,
    'pyramid_stack has default day + week rewards'
  );

  boss := pg_temp.act_as('bossg');

  -- Old games still start with their old seed formats.
  select r.run_seed into climb_seed from public.start_game_run('pyramid_climb', 'practice', 3) r;
  perform pg_temp.assert_true(climb_seed like 'practice:%', 'climb practice seed has no prefix');

  select r.run_seed into arena_seed from public.start_game_run('auto_battler', 'practice', 2) r;
  perform pg_temp.assert_true(arena_seed like 'arena-practice:%', 'arena practice seed keeps arena- prefix');

  -- The new game, daily + practice.
  select * into stack_daily from public.start_game_run('pyramid_stack', 'daily', 1);
  perform pg_temp.assert_true(stack_daily.run_seed like 'stack-daily:%', 'stack daily seed');

  select * into stack_practice from public.start_game_run('pyramid_stack', 'practice', 1);
  perform pg_temp.assert_true(stack_practice.run_seed like 'stack-practice:%', 'stack practice seed');

  perform pg_temp.expect_error(
    $q$select * from public.start_game_run('pyramid_stack', 'daily', 1)$q$,
    'Daily Stack',
    'second Daily Stack refused with its own message'
  );

  perform pg_temp.expect_error(
    $q$select * from public.start_game_run('pyramid_climb', 'daily', 3); select * from public.start_game_run('pyramid_climb', 'daily', 3)$q$,
    'Daily Climb',
    'second Daily Climb still uses the climb message'
  );

  perform pg_temp.expect_error(
    $q$select * from public.start_game_run('tetris', 'practice', 1)$q$,
    'Unknown game.',
    'unknown game refused'
  );

  update public.mini_game_catalog set active = false where game = 'pyramid_stack';
  perform pg_temp.expect_error(
    $q$select * from public.start_game_run('pyramid_stack', 'practice', 1)$q$,
    'Unknown game.',
    'inactive game refused'
  );
  update public.mini_game_catalog set active = true where game = 'pyramid_stack';

  -- FK: only catalog games can have runs.
  perform pg_temp.expect_error(
    format(
      $q$insert into public.game_runs (league_id, profile_id, game, mode, seed, day, iso_week, engine_version)
         select league_id, %L, 'tetris', 'practice', 'x', current_date, '2026-W42', 1
         from public.league_members where profile_id = %L limit 1$q$,
      boss,
      boss
    ),
    'game_runs_game_fkey',
    'game_runs.game must be in the catalog'
  );

  -- Submit (service role path): the bound applies, honest scores pass.
  update public.game_runs set started_at = now() - interval '2 minutes' where id = stack_practice.run_id;

  select * into verdict from public.submit_game_run(boss, stack_practice.run_id, 63, 600, '{"v":1,"e":[],"end":"miss","ticks":600}'::jsonb);
  perform pg_temp.assert_eq(verdict.run_status, 'rejected', 'stack score above ceil(ticks*0.1)+2 rejected');

  update public.game_runs set started_at = now() - interval '2 minutes' where id = stack_daily.run_id;

  select * into verdict from public.submit_game_run(boss, stack_daily.run_id, 40, 600, '{"v":1,"e":[],"end":"miss","ticks":600}'::jsonb);
  perform pg_temp.assert_eq(verdict.run_status, 'validated', 'stack score within the bound validated');

  perform pg_temp.assert_eq(
    (select best_score from public.mini_game_leaderboard('pyramid_stack', 'day', null) where profile_id = boss),
    40,
    'stack daily run shows on the leaderboard'
  );
end;
$$;

-- Players read the catalog but cannot write it or register games.
do $$
declare
  visible integer;
begin
  perform pg_temp.act_as('samo');

  set local role authenticated;
  select count(*)::integer into visible from public.mini_game_catalog;
  reset role;

  perform pg_temp.assert_true(visible >= 3, 'authenticated can read the catalog');

  begin
    set local role authenticated;
    insert into public.mini_game_catalog (game, title) values ('hacked', 'Hacked');
    raise exception 'FAILED: authenticated could insert into the catalog';
  exception
    when insufficient_privilege then
      raise notice 'ok: authenticated cannot write the catalog';
  end;

  begin
    set local role authenticated;
    update public.mini_game_catalog set max_score_flat = 999999 where game = 'pyramid_stack';
    raise exception 'FAILED: authenticated could update the catalog';
  exception
    when insufficient_privilege then
      raise notice 'ok: authenticated cannot change max scores';
  end;

  begin
    set local role authenticated;
    perform public.register_mini_game('hacked', 'Hacked', '', 99, 99, 1, 'x');
    raise exception 'FAILED: authenticated could call register_mini_game';
  exception
    when insufficient_privilege then
      raise notice 'ok: authenticated cannot call register_mini_game';
  end;
end;
$$;
