begin;

-- =========================================================
-- DUELIST CIRCLE 2.0 - SHADOW ARENA v2: "ghost" PvP vs friends
--
-- Engine v2 (src/lib/games/autobattler/engine.ts): 12 waves,
-- 20 health, Fusion + Xyz, and async PvP:
--
--   * arena_board_snapshots: after a run VALIDATES, the server
--     action stores the board of every turn from ITS OWN replay
--     (never from client data) via record_arena_snapshots().
--   * When a run STARTS, the server action asks
--     arena_ghost_candidates() for the best board per league-mate
--     per turn (same engine version), picks one per turn
--     (src/lib/games/autobattler/ghosts.ts, seeded by the run) and
--     freezes that list with assign_arena_ghosts() into
--     arena_run_ghosts (a COPY of each board, so later pruning or
--     deletes can never change a run that is being played). The
--     server replay loads exactly those frozen rows.
--
-- Security: no client writes at all. RLS lets a league member
-- READ league-mates' snapshots (to render them) and the frozen
-- ghosts of their OWN runs (resume). The three functions are
-- SECURITY DEFINER and executable by service_role only; the
-- server action passes the SESSION user's id (requireUser()),
-- never an id from the browser.
--
-- `board` is a jsonb object ({"units":[...]}) so later phases can
-- add positions / a spell-trap zone without a schema change.
--
-- Backwards compatible: only new tables / functions, plus the
-- auto_battler max score (12 waves, 20 health:
-- 12*10000 + 20*100 + 12 = 122012). The live main app does not
-- use the Shadow Arena.
-- =========================================================

create table if not exists public.arena_board_snapshots (
  id uuid primary key default gen_random_uuid(),

  run_id uuid not null
    references public.game_runs(id)
    on delete cascade,

  league_id uuid not null
    references public.leagues(id)
    on delete cascade,

  profile_id uuid not null
    references public.profiles(id)
    on delete cascade,

  engine_version integer not null,

  turn smallint not null
    check (turn between 1 and 50),

  run_score integer not null
    check (run_score >= 0),

  board jsonb not null
    check (
      jsonb_typeof(board) = 'object'
      and jsonb_typeof(board -> 'units') = 'array'
      and jsonb_array_length(board -> 'units') <= 7
      and octet_length(board::text) <= 8000
    ),

  created_at timestamptz not null default now(),

  constraint arena_board_snapshots_one_per_turn
    unique (run_id, turn)
);

comment on table public.arena_board_snapshots is
  'Shadow Arena: the board of every turn of a VALIDATED run (from the server replay). Friends fight these as ghosts. Written only by record_arena_snapshots().';

-- arena_ghost_candidates(): league + version + turn, best per friend.
create index if not exists arena_board_snapshots_pick_idx
  on public.arena_board_snapshots (league_id, engine_version, profile_id, turn, run_score desc, created_at desc);

-- FK + pruning per player.
create index if not exists arena_board_snapshots_profile_idx
  on public.arena_board_snapshots (profile_id, engine_version);

create table if not exists public.arena_run_ghosts (
  run_id uuid not null
    references public.game_runs(id)
    on delete cascade,

  turn smallint not null
    check (turn between 1 and 50),

  -- Frozen copy: deliberately NOT a foreign key (the snapshot may
  -- be pruned later; this run must keep fighting the same board).
  snapshot_id uuid not null,

  ghost_profile_id uuid
    references public.profiles(id)
    on delete set null,

  ghost_name text not null,

  board jsonb not null
    check (
      jsonb_typeof(board) = 'object'
      and jsonb_typeof(board -> 'units') = 'array'
      and jsonb_array_length(board -> 'units') <= 7
      and octet_length(board::text) <= 8000
    ),

  created_at timestamptz not null default now(),

  primary key (run_id, turn)
);

comment on table public.arena_run_ghosts is
  'Shadow Arena: the ghost boards frozen into a run when it started (one per turn, missing turn = Boss wave). Written only by assign_arena_ghosts().';

create index if not exists arena_run_ghosts_ghost_profile_idx
  on public.arena_run_ghosts (ghost_profile_id);

-- ---------------------------------------------------------
-- RLS: read-only for players, no client writes.
-- ---------------------------------------------------------

alter table public.arena_board_snapshots enable row level security;
alter table public.arena_run_ghosts enable row level security;

revoke all on public.arena_board_snapshots from anon, authenticated;
revoke all on public.arena_run_ghosts from anon, authenticated;

grant select on public.arena_board_snapshots to authenticated;
grant select on public.arena_run_ghosts to authenticated;

drop policy if exists arena_board_snapshots_read_league on public.arena_board_snapshots;
create policy arena_board_snapshots_read_league
  on public.arena_board_snapshots
  for select
  to authenticated
  using (public.is_league_member(league_id));

drop policy if exists arena_run_ghosts_read_own on public.arena_run_ghosts;
create policy arena_run_ghosts_read_own
  on public.arena_run_ghosts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.game_runs r
      where r.id = arena_run_ghosts.run_id
        and r.profile_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------
-- Max score for engine v2.
-- ---------------------------------------------------------

create or replace function public._mini_game_max_score(
  target_game text,
  target_ticks integer
)
returns integer
language sql
immutable
set search_path = public
as $$
  select case target_game
    when 'pyramid_climb' then ceil(target_ticks * 27 / 10.0)::integer + 30
    -- 12 waves * 10000 + 20 health * 100 + 12 wins
    when 'auto_battler' then 122012
    else 2147483647
  end;
$$;

revoke all on function public._mini_game_max_score(text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------
-- Candidates: best board per league-mate per turn.
-- ---------------------------------------------------------

create or replace function public.arena_ghost_candidates(
  p_profile_id uuid,
  target_run_id uuid
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
  -- Only players who are still in the league.
  join public.league_members lm
    on lm.league_id = s.league_id
   and lm.profile_id = s.profile_id
  where s.league_id = run_row.league_id
    and s.engine_version = run_row.engine_version
    and s.profile_id <> p_profile_id
  order by s.profile_id, s.turn, s.run_score desc, s.created_at desc, s.id;
end;
$$;

-- ---------------------------------------------------------
-- Freeze the picked ghosts into a run (once, at start).
-- target_ghosts: [{"turn": 1, "snapshot_id": "..."}, ...]
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
    and s.engine_version = run_row.engine_version
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
-- Store a validated run's boards (from the server replay).
-- target_snapshots: [{"turn": 1, "board": {"units": [...]}}, ...]
-- Keeps per player (per engine version) only the boards of their
-- 3 best and 3 latest runs, so the table stays small.
-- ---------------------------------------------------------

create or replace function public.record_arena_snapshots(
  p_profile_id uuid,
  target_run_id uuid,
  target_snapshots jsonb
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
    turn,
    run_score,
    board
  )
  select
    run_row.id,
    run_row.league_id,
    run_row.profile_id,
    run_row.engine_version,
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
    and s.engine_version = run_row.engine_version
    and s.run_id not in (
      (
        select r.id
        from public.game_runs r
        where r.profile_id = p_profile_id
          and r.game = 'auto_battler'
          and r.validated
          and r.engine_version = run_row.engine_version
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
          and r.engine_version = run_row.engine_version
        order by r.finished_at desc
        limit 3
      )
    );

  return inserted;
end;
$$;

revoke all on function public.arena_ghost_candidates(uuid, uuid) from public, anon, authenticated;
revoke all on function public.assign_arena_ghosts(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.record_arena_snapshots(uuid, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.arena_ghost_candidates(uuid, uuid) to service_role;
grant execute on function public.assign_arena_ghosts(uuid, uuid, jsonb) to service_role;
grant execute on function public.record_arena_snapshots(uuid, uuid, jsonb) to service_role;

commit;
