begin;

-- =========================================================
-- DUELIST CIRCLE 2.0 - SHADOW ARENA v3: 3-lane castle battlefield
--
-- Engine v3 (src/lib/games/autobattler/engine.ts) stores ghost
-- boards with lanes, ATK/DEF positions and set traps:
--   {"units":[{id,atk,hp,golden,lane,def}], "traps":[{id,lane}]}
--
-- Ghost boards get their own BOARD_SCHEMA (1 = v2 units only,
-- 2 = lanes + traps), separate from the engine version, so a
-- balance update no longer empties the friends' ghost pool:
--   * arena_board_snapshots.board_schema (existing rows = 1; the
--     engine auto-lays-out schema-1 boards when it reads them);
--   * arena_ghost_candidates() filters on board_schema <= what
--     the server understands, NOT on engine_version;
--   * assign_arena_ghosts() no longer requires the same engine
--     version (the frozen copy is normalized by the engine);
--   * record_arena_snapshots() takes the schema of what it stores
--     and prunes per player across versions (3 best + 3 latest
--     validated runs).
-- Max score is unchanged (12 waves, 20 health = 122012).
--
-- Service-role only, RLS unchanged (players read, never write).
-- Additive for the live main app (it does not use the arena).
-- =========================================================

alter table public.arena_board_snapshots
  add column if not exists board_schema smallint not null default 1
    check (board_schema between 1 and 100);

drop index if exists public.arena_board_snapshots_pick_idx;

create index if not exists arena_board_snapshots_pick_v2_idx
  on public.arena_board_snapshots (league_id, board_schema, profile_id, turn, run_score desc, created_at desc);

-- ---------------------------------------------------------
-- Candidates: best board per league-mate per turn, any engine
-- version whose board schema the server can read.
-- ---------------------------------------------------------

drop function if exists public.arena_ghost_candidates(uuid, uuid);

create or replace function public.arena_ghost_candidates(
  p_profile_id uuid,
  target_run_id uuid,
  target_max_schema integer
)
returns table (
  snapshot_id uuid,
  profile_id uuid,
  duelist_name text,
  turn integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  run_row public.game_runs%rowtype;
begin
  select *
  into run_row
  from public.game_runs r
  where r.id = target_run_id;

  if not found
    or run_row.profile_id is distinct from p_profile_id
    or run_row.game <> 'auto_battler' then
    raise exception 'Run not found.';
  end if;

  return query
  select distinct on (s.profile_id, s.turn)
    s.id,
    s.profile_id,
    p.duelist_name,
    s.turn::integer
  from public.arena_board_snapshots s
  join public.profiles p
    on p.id = s.profile_id
  join public.league_members lm
    on lm.league_id = s.league_id
   and lm.profile_id = s.profile_id
  where s.league_id = run_row.league_id
    and s.board_schema <= coalesce(target_max_schema, 1)
    and s.profile_id <> p_profile_id
  order by s.profile_id, s.turn, s.board_schema desc, s.run_score desc, s.created_at desc, s.id;
end;
$$;

-- ---------------------------------------------------------
-- Freeze picked ghosts (same as 202610121300, minus the engine
-- version check).
-- ---------------------------------------------------------

create or replace function public.assign_arena_ghosts(
  p_profile_id uuid,
  target_run_id uuid,
  target_ghosts jsonb
)
returns table (
  turn integer,
  snapshot_id uuid,
  ghost_name text,
  board jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  run_row public.game_runs%rowtype;
  wanted integer;
  inserted integer;
begin
  select *
  into run_row
  from public.game_runs r
  where r.id = target_run_id
  for update;

  if not found
    or run_row.profile_id is distinct from p_profile_id
    or run_row.game <> 'auto_battler' then
    raise exception 'Run not found.';
  end if;

  if run_row.status <> 'started' then
    raise exception 'This run was already submitted.';
  end if;

  if exists (
    select 1
    from public.arena_run_ghosts g
    where g.run_id = target_run_id
  ) then
    raise exception 'Ghosts were already assigned to this run.';
  end if;

  if target_ghosts is null
    or jsonb_typeof(target_ghosts) <> 'array'
    or jsonb_array_length(target_ghosts) > 50 then
    raise exception 'Invalid ghost assignment.';
  end if;

  wanted := jsonb_array_length(target_ghosts);

  insert into public.arena_run_ghosts (
    run_id,
    turn,
    snapshot_id,
    ghost_profile_id,
    ghost_name,
    board
  )
  select
    target_run_id,
    pick.turn,
    s.id,
    s.profile_id,
    p.duelist_name,
    s.board
  from jsonb_to_recordset(target_ghosts) as pick(turn integer, snapshot_id uuid)
  join public.arena_board_snapshots s
    on s.id = pick.snapshot_id
   and s.turn = pick.turn
  join public.profiles p
    on p.id = s.profile_id
  where s.league_id = run_row.league_id
    and s.profile_id <> p_profile_id;

  get diagnostics inserted = row_count;

  if inserted <> wanted then
    raise exception 'Invalid ghost assignment.';
  end if;

  return query
  select
    g.turn::integer,
    g.snapshot_id,
    g.ghost_name,
    g.board
  from public.arena_run_ghosts g
  where g.run_id = target_run_id
  order by g.turn;
end;
$$;

-- ---------------------------------------------------------
-- Store a validated run's boards with their schema.
-- ---------------------------------------------------------

drop function if exists public.record_arena_snapshots(uuid, uuid, jsonb);

create or replace function public.record_arena_snapshots(
  p_profile_id uuid,
  target_run_id uuid,
  target_snapshots jsonb,
  target_board_schema integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  run_row public.game_runs%rowtype;
  inserted integer;
begin
  select *
  into run_row
  from public.game_runs r
  where r.id = target_run_id;

  if not found
    or run_row.profile_id is distinct from p_profile_id
    or run_row.game <> 'auto_battler' then
    raise exception 'Run not found.';
  end if;

  if run_row.status <> 'validated' or run_row.score is null then
    raise exception 'Only validated runs leave ghosts.';
  end if;

  if target_board_schema is null or target_board_schema not between 1 and 100 then
    raise exception 'Invalid board schema.';
  end if;

  if target_snapshots is null
    or jsonb_typeof(target_snapshots) <> 'array'
    or jsonb_array_length(target_snapshots) > 50 then
    raise exception 'Invalid snapshots.';
  end if;

  insert into public.arena_board_snapshots (
    run_id,
    league_id,
    profile_id,
    engine_version,
    board_schema,
    turn,
    run_score,
    board
  )
  select
    run_row.id,
    run_row.league_id,
    run_row.profile_id,
    run_row.engine_version,
    target_board_schema,
    snap.turn,
    run_row.score,
    snap.board
  from jsonb_to_recordset(target_snapshots) as snap(turn integer, board jsonb)
  where snap.turn between 1 and 50
    and snap.board is not null
  on conflict on constraint arena_board_snapshots_one_per_turn do nothing;

  get diagnostics inserted = row_count;

  delete from public.arena_board_snapshots s
  where s.profile_id = p_profile_id
    and s.run_id not in (
      (
        select r.id
        from public.game_runs r
        where r.profile_id = p_profile_id
          and r.game = 'auto_battler'
          and r.validated
        order by r.score desc, r.finished_at desc
        limit 3
      )
      union
      (
        select r.id
        from public.game_runs r
        where r.profile_id = p_profile_id
          and r.game = 'auto_battler'
          and r.validated
        order by r.finished_at desc
        limit 3
      )
    );

  return inserted;
end;
$$;

revoke all on function public.arena_ghost_candidates(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.assign_arena_ghosts(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.record_arena_snapshots(uuid, uuid, jsonb, integer) from public, anon, authenticated;

grant execute on function public.arena_ghost_candidates(uuid, uuid, integer) to service_role;
grant execute on function public.assign_arena_ghosts(uuid, uuid, jsonb) to service_role;
grant execute on function public.record_arena_snapshots(uuid, uuid, jsonb, integer) to service_role;

commit;
