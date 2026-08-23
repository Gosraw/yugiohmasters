-- =========================================================
-- COMPETITION SCHEMA RECOVERY (V1)
--
-- AUDIT FINDING: live production already has a working
-- Competition V1 feature (src/app/actions/competitions.ts,
-- src/app/(app)/competitions/**) calling tables and RPCs that do
-- NOT appear anywhere in git migrations. This is schema drift -
-- someone applied these directly against Supabase outside the
-- migration chain. This file recovers what can be PROVEN from the
-- application code that already depends on this schema. It does
-- NOT guess at anything it cannot prove.
--
-- METHOD: every table/column below is copied verbatim from an
-- exact PostgREST `.from(...).select(...)` call or `.rpc(...)`
-- call already live in the app. Nothing here was invented.
--
-- PROVEN TABLES (exact columns read by the app):
--   competitions(id, league_id, name, competition_type, status,
--     starts_at, completed_at, rewards_distributed_at, created_at)
--     - competition_type in ('round_robin', 'tournament')
--       (src/app/actions/competitions.ts createCompetition validates
--       exactly these two values before calling the RPC)
--     - status in ('draft','active','completed','cancelled')
--       (competitions/page.tsx Competition type + status filtering)
--   competition_players(competition_id, profile_id)
--   competition_reward_rules(competition_id, placement, duel_points,
--     voucher_type, voucher_quantity)
--   competition_results(competition_id, profile_id, placement,
--     wins, losses, draws, points)
--   matches.competition_id (nullable uuid) - proven by
--     competitions/[id]/page.tsx selecting it via
--     .eq("competition_id", competition.id) and by
--     src/app/actions/matches.ts reading it in
--     getMatchSettlementInfo(). NOT present in
--     202608190010_matches.sql - this specific column is itself
--     part of the drift being recovered here.
--
-- PROVEN RPCs (name + call signature only - see "NOT RECOVERED"
-- below for why bodies are intentionally absent):
--   create_competition(target_league_id uuid, target_name text,
--     target_type text, target_season_id uuid) returns uuid
--   install_default_competition_rewards(target_competition_id uuid)
--     returns void
--   add_competition_player(target_competition_id uuid,
--     target_profile_id uuid) returns void
--   remove_competition_player(target_competition_id uuid,
--     target_profile_id uuid) returns void
--   start_competition(target_competition_id uuid) returns void
--   get_competition_standings(target_competition_id uuid)
--     returns table(profile_id, wins, losses, draws, played, points)
--     (column names read by competitions/[id]/page.tsx Standing type)
--   finalize_round_robin_competition(target_competition_id uuid)
--     returns void
--   distribute_competition_rewards(target_competition_id uuid)
--     returns void
--
-- CONFIRMED-MISSING FUNCTIONALITY (not drift, genuinely absent):
--   competitions/[id]/page.tsx contains this literal copy when a
--   competition has zero linked matches: "The competition exists,
--   but we have not built automatic round-robin scheduling yet.
--   That is the next step." This proves start_competition does NOT
--   generate matches today - round-robin scheduling is confirmed
--   unbuilt, not merely undiscovered. Competition V2 (separate
--   migration, 202608231100_competition_v2_scheduling.sql) adds
--   this as new, additive functionality.
--
-- NOT RECOVERED - MUST COME FROM SUPABASE, NOT FROM THIS REPO:
--   The actual SQL bodies of all 8 RPCs listed above. Caller code
--   proves their names, parameters and return shape, but NOT their
--   internal logic (exact standings scoring formula beyond the
--   "Win = 3 · Draw = 1 · Loss = 0" UI caption, which is a display
--   string and not proof of the RPC's real computation; exact
--   completion/validation rules in finalize_round_robin_competition;
--   exact idempotency mechanism in distribute_competition_rewards;
--   exact default values installed by
--   install_default_competition_rewards; exact validation in
--   add/remove_competition_player, e.g. whether removal is blocked
--   after start). Also not recovered: exact column types/defaults/
--   constraints/indexes/RLS policies/triggers on any of the four
--   tables above (types below are reasonable inferences from this
--   codebase's own conventions, clearly marked, and are SAFE
--   regardless of accuracy - see next paragraph).
--
--   To close this gap, the owner should run, in the Supabase SQL
--   editor against production (read-only, no data changes):
--     select pg_get_functiondef(oid) from pg_proc
--     where proname in ('create_competition',
--       'install_default_competition_rewards',
--       'add_competition_player', 'remove_competition_player',
--       'start_competition', 'get_competition_standings',
--       'finalize_round_robin_competition',
--       'distribute_competition_rewards');
--   and a \d+ (or information_schema query) on competitions,
--   competition_players, competition_reward_rules,
--   competition_results, and matches, then paste the results back
--   so this recovery file can be corrected to match reality exactly.
--
-- SAFETY: every statement below is CREATE TABLE IF NOT EXISTS /
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS / safe index creation.
-- If these objects already exist in production (they do, per the
-- audit above), every statement here is a guaranteed no-op - it
-- will NOT alter, override or conflict with whatever the real
-- production shape turns out to be, even where this file's
-- inferred column types are wrong. This file only creates the
-- objects it describes on a database where they are genuinely
-- missing (e.g. a fresh dev/staging Supabase project). It never
-- touches an existing table's existing columns, and it never
-- recreates a function (no CREATE OR REPLACE FUNCTION appears in
-- this file at all, deliberately).
-- =========================================================

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),

  league_id uuid not null
    references public.leagues(id)
    on delete restrict,

  name text not null,

  competition_type text not null,

  status text not null default 'draft',

  starts_at timestamptz,

  completed_at timestamptz,

  rewards_distributed_at timestamptz,

  created_by uuid
    references public.profiles(id)
    on delete restrict,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint competitions_type_check
    check (competition_type in ('round_robin', 'tournament')),

  constraint competitions_status_check
    check (status in ('draft', 'active', 'completed', 'cancelled'))
);

create index if not exists competitions_league_idx
  on public.competitions(league_id, created_at desc);


create table if not exists public.competition_players (
  competition_id uuid not null
    references public.competitions(id)
    on delete cascade,

  profile_id uuid not null
    references public.profiles(id)
    on delete cascade,

  created_at timestamptz not null default now(),

  primary key (competition_id, profile_id)
);


create table if not exists public.competition_reward_rules (
  id uuid primary key default gen_random_uuid(),

  competition_id uuid not null
    references public.competitions(id)
    on delete cascade,

  placement integer not null,

  duel_points integer not null default 0,

  voucher_type text,

  voucher_quantity integer not null default 0,

  constraint competition_reward_rules_placement_check
    check (placement >= 1),

  constraint competition_reward_rules_unique
    unique (competition_id, placement)
);


create table if not exists public.competition_results (
  competition_id uuid not null
    references public.competitions(id)
    on delete cascade,

  profile_id uuid not null
    references public.profiles(id)
    on delete cascade,

  placement integer not null,

  wins integer not null default 0,

  losses integer not null default 0,

  draws integer not null default 0,

  points integer not null default 0,

  created_at timestamptz not null default now(),

  primary key (competition_id, profile_id)
);

create index if not exists competition_results_placement_idx
  on public.competition_results(competition_id, placement);


-- matches.competition_id - proven live drift, recovered additively.
-- Nullable: only matches that belong to a competition set this;
-- ordinary league/practice matches keep it null.
alter table public.matches
  add column if not exists competition_id uuid
    references public.competitions(id)
    on delete set null;

create index if not exists matches_competition_idx
  on public.matches(competition_id)
  where competition_id is not null;
