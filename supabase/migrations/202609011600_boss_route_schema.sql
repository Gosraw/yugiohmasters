-- =========================================================
-- BOSS ROUTE SYSTEM - DATA MODEL (go-live spec sections 15-17, 22)
--
-- Greenfield schema for the 20-route Boss Path progression system.
-- Deliberately NOT a single flat card list (spec section 22 is
-- explicit about this): route/stage/evolution-card/support-grants/
-- achievement-requirements/dp-cost/story/star-profile are each
-- their own table so "what did this player unlock at Stage 2?" is
-- answerable with a direct join, never by inferring from a generic
-- list.
--
-- Config tables (author once, read by everyone):
--   boss_routes                       - one row per route (20 total)
--   boss_route_stages                 - one row per route per stage (1-4)
--   boss_route_stage_grants           - support cards granted at a stage
--                                        (NOT the evolution monster itself -
--                                        that lives directly on the stage
--                                        row, matching the spec's rule that
--                                        evolution monsters don't count
--                                        against the 12-15 permanent
--                                        support limit)
--   boss_route_achievement_events     - the ~3 confirmable event types per
--                                        route (seeded in a later migration)
--   boss_route_achievement_requirements - how many of which event unlocks
--                                          which stage
--
-- Runtime tables (per player, written only via SECURITY DEFINER RPCs
-- added in a later migration - task 140):
--   player_boss_paths                 - a player's route slot (1st/2nd/3rd)
--   player_boss_stage_unlocks         - when a player reached each stage
--   player_boss_achievement_events    - idempotent, opponent-confirmed
--                                        event log (unique on
--                                        match_id + player_boss_path_id +
--                                        event_id, matching the spec's
--                                        "max once per match" rule)
--
-- The Stage 1-4 DP costs are locked by the spec (900 / 1400 / 2400,
-- section 15) and are enforced structurally via a CHECK constraint
-- on boss_route_stages, not just application logic.
-- =========================================================

begin;

-- =========================================================
-- 1. CONFIG: BOSS_ROUTES
-- =========================================================

create table if not exists public.boss_routes (
  id uuid primary key default gen_random_uuid(),

  code text not null unique,
  name text not null,

  display_order integer not null,

  -- Nostalgic flavor text (spec section 24). Must never name or
  -- reveal the Stage 4 Boss.
  teaser_story text not null,

  -- {"start_strength": 1-5, "growth": 1-5, "boss_power": 1-5,
  --  "synergy": 1-5, "flexibility": 1-5} - descriptive, not a
  -- strict tier list (spec section 23).
  star_profile jsonb not null default '{}'::jsonb,

  -- 'A' or 'A+' - every route targets this range (spec sections
  -- 15 and 23).
  target_power_grade text not null,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),

  constraint boss_routes_display_order_range check (
    display_order between 1 and 20
  ),

  constraint boss_routes_code_format check (
    code ~ '^[a-z0-9_]{2,40}$'
  ),

  constraint boss_routes_target_power_grade_valid check (
    target_power_grade in ('A', 'A+')
  )
);

create unique index if not exists boss_routes_display_order_idx
  on public.boss_routes (display_order);


-- =========================================================
-- 2. CONFIG: BOSS_ROUTE_STAGES
-- =========================================================

create table if not exists public.boss_route_stages (
  id uuid primary key default gen_random_uuid(),

  route_id uuid not null
    references public.boss_routes(id)
    on delete cascade,

  stage_number integer not null,

  -- The evolution monster the player receives AT this stage (for
  -- stage 1, the starting Boss monster; for stage 4, the final
  -- Boss - always route-exclusive per spec section 16). Does not
  -- count against the 12-15 permanent-support limit.
  evolution_card_catalog_id uuid not null
    references public.card_catalog(id)
    on delete restrict,

  -- Locked economy (spec section 15): null at stage 1 (first route
  -- is free to choose), then exactly 900 / 1400 / 2400 to evolve
  -- into stages 2 / 3 / 4.
  dp_cost_to_reach integer,

  created_at timestamptz not null default now(),

  constraint boss_route_stages_stage_number_range check (
    stage_number between 1 and 4
  ),

  constraint boss_route_stages_dp_cost_matches_locked_economy check (
    (stage_number = 1 and dp_cost_to_reach is null)
    or (stage_number = 2 and dp_cost_to_reach = 900)
    or (stage_number = 3 and dp_cost_to_reach = 1400)
    or (stage_number = 4 and dp_cost_to_reach = 2400)
  ),

  unique (route_id, stage_number),
  unique (route_id, evolution_card_catalog_id)
);

create index if not exists boss_route_stages_route_idx
  on public.boss_route_stages (route_id);


-- =========================================================
-- 3. CONFIG: BOSS_ROUTE_STAGE_GRANTS (permanent support cards)
-- =========================================================

create table if not exists public.boss_route_stage_grants (
  id uuid primary key default gen_random_uuid(),

  stage_id uuid not null
    references public.boss_route_stages(id)
    on delete cascade,

  card_catalog_id uuid not null
    references public.card_catalog(id)
    on delete restrict,

  -- Route-exclusive cards never appear in the normal draft or shop
  -- pool. Target >=4 exclusives per route where practical (spec
  -- section 15); the Stage 4 evolution card itself is always
  -- exclusive by rule and is tracked on boss_route_stages, not here.
  is_route_exclusive boolean not null default false,

  created_at timestamptz not null default now(),

  unique (stage_id, card_catalog_id)
);

create index if not exists boss_route_stage_grants_stage_idx
  on public.boss_route_stage_grants (stage_id);

create index if not exists boss_route_stage_grants_card_idx
  on public.boss_route_stage_grants (card_catalog_id);


-- =========================================================
-- 4. CONFIG: BOSS_ROUTE_ACHIEVEMENT_EVENTS
-- =========================================================

create table if not exists public.boss_route_achievement_events (
  id uuid primary key default gen_random_uuid(),

  route_id uuid not null
    references public.boss_routes(id)
    on delete cascade,

  event_key text not null,
  label text not null,
  description text,

  -- A "finishing blow" style event (spec section 20: Stage 4
  -- includes ~2 finishing-blow milestones). Purely descriptive -
  -- confirmation and counting work identically either way.
  is_finishing_blow boolean not null default false,

  created_at timestamptz not null default now(),

  constraint boss_route_achievement_events_key_format check (
    event_key ~ '^[a-z0-9_]{2,60}$'
  ),

  unique (route_id, event_key)
);

create index if not exists boss_route_achievement_events_route_idx
  on public.boss_route_achievement_events (route_id);


-- =========================================================
-- 5. CONFIG: BOSS_ROUTE_ACHIEVEMENT_REQUIREMENTS
-- =========================================================

create table if not exists public.boss_route_achievement_requirements (
  id uuid primary key default gen_random_uuid(),

  -- The stage being unlocked by this requirement (stage_number
  -- must be 2, 3, or 4 - stage 1 has no achievement requirement,
  -- it is granted on route choice).
  target_stage_id uuid not null
    references public.boss_route_stages(id)
    on delete cascade,

  event_id uuid not null
    references public.boss_route_achievement_events(id)
    on delete cascade,

  target_count integer not null,

  created_at timestamptz not null default now(),

  constraint boss_route_achievement_requirements_count_positive check (
    target_count > 0
  ),

  unique (target_stage_id, event_id)
);

create index if not exists boss_route_achievement_requirements_stage_idx
  on public.boss_route_achievement_requirements (target_stage_id);


-- =========================================================
-- 6. RUNTIME: PLAYER_BOSS_PATHS
-- =========================================================

create table if not exists public.player_boss_paths (
  id uuid primary key default gen_random_uuid(),

  profile_id uuid not null
    references public.profiles(id)
    on delete cascade,

  league_id uuid not null
    references public.leagues(id)
    on delete cascade,

  -- 1 = first route (free), 2 = second (7000 DP), 3 = third
  -- (10000 DP) - spec section 17.
  route_slot integer not null,

  route_id uuid not null
    references public.boss_routes(id)
    on delete restrict,

  current_stage integer not null default 1,

  -- 0 for route_slot 1 (always free). Set once, idempotently, when
  -- a second/third route is purchased - never re-charged on retry
  -- or refresh.
  dp_charged_for_unlock integer not null default 0,

  chosen_at timestamptz not null default now(),
  mastered_at timestamptz,

  constraint player_boss_paths_route_slot_range check (
    route_slot between 1 and 3
  ),

  constraint player_boss_paths_current_stage_range check (
    current_stage between 1 and 4
  ),

  constraint player_boss_paths_dp_charged_nonnegative check (
    dp_charged_for_unlock >= 0
  ),

  unique (profile_id, route_slot),
  unique (profile_id, route_id)
);

create index if not exists player_boss_paths_profile_idx
  on public.player_boss_paths (profile_id);

create index if not exists player_boss_paths_league_idx
  on public.player_boss_paths (league_id);


-- =========================================================
-- 7. RUNTIME: PLAYER_BOSS_STAGE_UNLOCKS
-- =========================================================

create table if not exists public.player_boss_stage_unlocks (
  id uuid primary key default gen_random_uuid(),

  player_boss_path_id uuid not null
    references public.player_boss_paths(id)
    on delete cascade,

  stage_number integer not null,

  unlocked_at timestamptz not null default now(),

  constraint player_boss_stage_unlocks_stage_range check (
    stage_number between 1 and 4
  ),

  unique (player_boss_path_id, stage_number)
);

create index if not exists player_boss_stage_unlocks_path_idx
  on public.player_boss_stage_unlocks (player_boss_path_id);


-- =========================================================
-- 8. RUNTIME: PLAYER_BOSS_ACHIEVEMENT_EVENTS
--
-- Idempotency key is (match_id, player_boss_path_id, event_id), so
-- a refresh or double-submit of the same post-duel confirmation
-- can never double-credit progress toward a stage (spec section 21).
-- =========================================================

create table if not exists public.player_boss_achievement_events (
  id uuid primary key default gen_random_uuid(),

  player_boss_path_id uuid not null
    references public.player_boss_paths(id)
    on delete cascade,

  match_id uuid not null
    references public.matches(id)
    on delete cascade,

  event_id uuid not null
    references public.boss_route_achievement_events(id)
    on delete restrict,

  confirmed_by_profile_id uuid
    references public.profiles(id)
    on delete set null,

  created_at timestamptz not null default now(),

  unique (match_id, player_boss_path_id, event_id)
);

create index if not exists player_boss_achievement_events_path_idx
  on public.player_boss_achievement_events (player_boss_path_id);

create index if not exists player_boss_achievement_events_match_idx
  on public.player_boss_achievement_events (match_id);


-- =========================================================
-- 9. ROW LEVEL SECURITY
-- =========================================================

alter table public.boss_routes enable row level security;
alter table public.boss_route_stages enable row level security;
alter table public.boss_route_stage_grants enable row level security;
alter table public.boss_route_achievement_events enable row level security;
alter table public.boss_route_achievement_requirements enable row level security;
alter table public.player_boss_paths enable row level security;
alter table public.player_boss_stage_unlocks enable row level security;
alter table public.player_boss_achievement_events enable row level security;


-- ---- Config tables: readable by every authenticated user ----

drop policy if exists boss_routes_read_authenticated on public.boss_routes;
create policy boss_routes_read_authenticated
  on public.boss_routes
  for select
  to authenticated
  using (true);

drop policy if exists boss_route_stages_read_authenticated on public.boss_route_stages;
create policy boss_route_stages_read_authenticated
  on public.boss_route_stages
  for select
  to authenticated
  using (true);

drop policy if exists boss_route_stage_grants_read_authenticated on public.boss_route_stage_grants;
create policy boss_route_stage_grants_read_authenticated
  on public.boss_route_stage_grants
  for select
  to authenticated
  using (true);

drop policy if exists boss_route_achievement_events_read_authenticated on public.boss_route_achievement_events;
create policy boss_route_achievement_events_read_authenticated
  on public.boss_route_achievement_events
  for select
  to authenticated
  using (true);

drop policy if exists boss_route_achievement_requirements_read_authenticated on public.boss_route_achievement_requirements;
create policy boss_route_achievement_requirements_read_authenticated
  on public.boss_route_achievement_requirements
  for select
  to authenticated
  using (true);


-- ---- Runtime tables: readable within your own league ----
-- (matches the existing draft_players convention - all three
-- friends can see each other's Boss Path progress)

drop policy if exists player_boss_paths_read_league on public.player_boss_paths;
create policy player_boss_paths_read_league
  on public.player_boss_paths
  for select
  to authenticated
  using (
    public.is_league_member(league_id)
  );

drop policy if exists player_boss_stage_unlocks_read_league on public.player_boss_stage_unlocks;
create policy player_boss_stage_unlocks_read_league
  on public.player_boss_stage_unlocks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.player_boss_paths pbp
      where pbp.id = player_boss_path_id
        and public.is_league_member(pbp.league_id)
    )
  );

drop policy if exists player_boss_achievement_events_read_league on public.player_boss_achievement_events;
create policy player_boss_achievement_events_read_league
  on public.player_boss_achievement_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.player_boss_paths pbp
      where pbp.id = player_boss_path_id
        and public.is_league_member(pbp.league_id)
    )
  );


-- =========================================================
-- 10. GRANTS - NO DIRECT CLIENT MUTATIONS
--
-- All writes to runtime tables happen through SECURITY DEFINER
-- RPCs added in a later migration (task 140: choose_boss_path,
-- evolve_boss_stage, confirm_boss_achievement_event,
-- unlock_second_third_boss_path). Config tables are authored only
-- via migration/service-role, same as card_catalog.
-- =========================================================

revoke insert, update, delete on public.boss_routes from authenticated;
revoke insert, update, delete on public.boss_route_stages from authenticated;
revoke insert, update, delete on public.boss_route_stage_grants from authenticated;
revoke insert, update, delete on public.boss_route_achievement_events from authenticated;
revoke insert, update, delete on public.boss_route_achievement_requirements from authenticated;
revoke insert, update, delete on public.player_boss_paths from authenticated;
revoke insert, update, delete on public.player_boss_stage_unlocks from authenticated;
revoke insert, update, delete on public.player_boss_achievement_events from authenticated;

grant select on public.boss_routes to authenticated;
grant select on public.boss_route_stages to authenticated;
grant select on public.boss_route_stage_grants to authenticated;
grant select on public.boss_route_achievement_events to authenticated;
grant select on public.boss_route_achievement_requirements to authenticated;
grant select on public.player_boss_paths to authenticated;
grant select on public.player_boss_stage_unlocks to authenticated;
grant select on public.player_boss_achievement_events to authenticated;


-- =========================================================
-- 11. POST-MIGRATION STRUCTURAL ASSERTIONS
-- =========================================================

do $verify$
declare
  v_missing text;
begin

  select string_agg(t, ', ')
  into v_missing
  from unnest(array[
    'boss_routes',
    'boss_route_stages',
    'boss_route_stage_grants',
    'boss_route_achievement_events',
    'boss_route_achievement_requirements',
    'player_boss_paths',
    'player_boss_stage_unlocks',
    'player_boss_achievement_events'
  ]) as t
  where to_regclass('public.' || t) is null;

  if v_missing is not null then
    raise exception
      'BOSS ROUTE SCHEMA MIGRATION ABORTED: missing table(s): %',
      v_missing;
  end if;

  raise notice 'BOSS ROUTE SCHEMA MIGRATION: all 8 tables created and structurally verified.';
end $verify$;

commit;
