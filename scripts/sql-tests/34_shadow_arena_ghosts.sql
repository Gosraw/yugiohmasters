-- Shadow Arena ghosts (migration 202610121300):
--  * record_arena_snapshots stores a VALIDATED run's boards only
--  * arena_ghost_candidates returns league-mates' boards (not yours)
--  * assign_arena_ghosts freezes a copy once, rejects own / wrong
--    turn / foreign snapshots
--  * players can read league snapshots + their own frozen ghosts,
--    never write; the RPCs are service-role only
--  * auto_battler max score = 122012

create function pg_temp.arena_run(target_username text, target_status text)
returns uuid
language plpgsql
as $$
declare
  owner uuid := pg_temp.uid_of(target_username);
  run_id uuid;
begin
  insert into public.game_runs (
    league_id, profile_id, game, mode, seed, day, iso_week, engine_version,
    status, validated, score, started_at, finished_at
  )
  values (
    (select lm.league_id from public.league_members lm where lm.profile_id = owner limit 1),
    owner,
    'auto_battler',
    'practice',
    'arena-practice:test-' || target_username,
    current_date,
    public._mini_game_iso_week(current_date),
    2,
    target_status,
    target_status = 'validated',
    case when target_status = 'validated' then 50000 end,
    now() - interval '5 minutes',
    case when target_status = 'validated' then now() end
  )
  returning id into run_id;

  return run_id;
end;
$$;

do $$
declare
  boss_run uuid := pg_temp.arena_run('bossg', 'validated');
  samo_run uuid := pg_temp.arena_run('samo', 'started');
  boss_open uuid := pg_temp.arena_run('bossg', 'started');
  snap1 uuid;
  frozen integer;
  refused boolean;
begin
  perform pg_temp.assert_eq(public._mini_game_max_score('auto_battler', 1), 122012, 'auto_battler max score is 122012');

  perform pg_temp.assert_eq(
    public.record_arena_snapshots(
      pg_temp.uid_of('bossg'),
      boss_run,
      '[{"turn":1,"board":{"units":[{"id":"kuriboh","atk":1,"hp":5,"golden":false}]}},
        {"turn":2,"board":{"units":[{"id":"sangan","atk":2,"hp":2,"golden":true}]}}]'::jsonb
    ),
    2,
    'validated run stores 2 boards'
  );

  refused := false;
  begin
    perform public.record_arena_snapshots(pg_temp.uid_of('samo'), samo_run, '[]'::jsonb);
  exception when others then
    refused := true;
  end;
  perform pg_temp.assert_true(refused, 'an unvalidated run cannot store boards');

  refused := false;
  begin
    perform public.record_arena_snapshots(pg_temp.uid_of('samo'), boss_run, '[]'::jsonb);
  exception when others then
    refused := true;
  end;
  perform pg_temp.assert_true(refused, 'cannot store boards for someone else''s run');

  perform pg_temp.assert_eq(
    (select count(*)::integer from public.arena_ghost_candidates(pg_temp.uid_of('samo'), samo_run)),
    2,
    'samo sees 2 candidate boards (bossg turns 1-2)'
  );

  perform pg_temp.assert_eq(
    (select count(*)::integer from public.arena_ghost_candidates(pg_temp.uid_of('bossg'), boss_open)),
    0,
    'your own boards are never your candidates'
  );

  select s.id into snap1
  from public.arena_board_snapshots s
  where s.run_id = boss_run and s.turn = 1;

  -- wrong turn for that snapshot
  refused := false;
  begin
    perform public.assign_arena_ghosts(
      pg_temp.uid_of('samo'), samo_run,
      jsonb_build_array(jsonb_build_object('turn', 3, 'snapshot_id', snap1))
    );
  exception when others then
    refused := true;
  end;
  perform pg_temp.assert_true(refused, 'a snapshot can only be assigned to its own turn');

  -- your own board
  refused := false;
  begin
    perform public.assign_arena_ghosts(
      pg_temp.uid_of('bossg'), boss_open,
      jsonb_build_array(jsonb_build_object('turn', 1, 'snapshot_id', snap1))
    );
  exception when others then
    refused := true;
  end;
  perform pg_temp.assert_true(refused, 'you cannot fight your own board');

  select count(*)::integer into frozen
  from public.assign_arena_ghosts(
    pg_temp.uid_of('samo'), samo_run,
    jsonb_build_array(jsonb_build_object('turn', 1, 'snapshot_id', snap1))
  );
  perform pg_temp.assert_eq(frozen, 1, 'one ghost frozen into samo''s run');

  perform pg_temp.assert_eq(
    (select g.ghost_name from public.arena_run_ghosts g where g.run_id = samo_run and g.turn = 1),
    (select p.duelist_name from public.profiles p where p.id = pg_temp.uid_of('bossg')),
    'frozen ghost carries bossg''s name'
  );

  refused := false;
  begin
    perform public.assign_arena_ghosts(pg_temp.uid_of('samo'), samo_run, '[]'::jsonb);
  exception when others then
    refused := true;
  end;
  perform pg_temp.assert_true(refused, 'ghosts are assigned only once');

  -- The frozen copy survives the snapshot being pruned.
  delete from public.arena_board_snapshots where id = snap1;
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.arena_run_ghosts g where g.run_id = samo_run),
    1,
    'frozen ghost stays after the snapshot is gone'
  );

  -- ---- as players ----
  perform pg_temp.act_as('samo');
  set local role authenticated;

  perform pg_temp.assert_eq(
    (select count(*)::integer from public.arena_board_snapshots),
    1,
    'samo can read league-mates'' boards'
  );
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.arena_run_ghosts where run_id = samo_run),
    1,
    'samo can read the ghosts of his own run'
  );

  refused := false;
  begin
    insert into public.arena_board_snapshots (run_id, league_id, profile_id, engine_version, turn, run_score, board)
    values (samo_run, gen_random_uuid(), pg_temp.uid_of('samo'), 2, 1, 1, '{"units":[]}');
  exception when insufficient_privilege then
    refused := true;
  end;
  perform pg_temp.assert_true(refused, 'players cannot write snapshots');

  refused := false;
  begin
    perform public.assign_arena_ghosts(pg_temp.uid_of('samo'), samo_run, '[]'::jsonb);
  exception when insufficient_privilege then
    refused := true;
  end;
  perform pg_temp.assert_true(refused, 'players cannot call assign_arena_ghosts');

  refused := false;
  begin
    perform public.record_arena_snapshots(pg_temp.uid_of('samo'), samo_run, '[]'::jsonb);
  exception when insufficient_privilege then
    refused := true;
  end;
  perform pg_temp.assert_true(refused, 'players cannot call record_arena_snapshots');

  reset role;

  perform pg_temp.act_as('fardin');
  set local role authenticated;

  perform pg_temp.assert_eq(
    (select count(*)::integer from public.arena_run_ghosts where run_id = samo_run),
    0,
    'fardin cannot read samo''s frozen ghosts'
  );

  reset role;
end;
$$;
