-- =========================================================
-- DASHBOARD DUELIST COACH - persisted, cached insights
--
-- WHY
-- The product spec is explicit: "NO live AI call during dashboard
-- render" and "Only regenerate when: user explicitly requests
-- refresh, OR relevant collection/deck fingerprint changed. Do not
-- regenerate simply because dashboard was opened." That requires
-- somewhere to persist a computed insight between visits - this
-- table is that cache, not a general-purpose analytics table.
--
-- SAFETY
-- - Purely additive: one new table, no existing table touched.
-- - Player-scoped, unlike card_mechanics/card_synergy_edges (which
--   are public reference data): each row belongs to exactly one
--   profile_id and is only ever readable/writable by that same
--   profile via RLS (`profile_id = auth.uid()`), same isolation
--   guarantee the rest of this app already gives player-owned data
--   (see card_instances). No service-role key is required to write
--   this table - a signed-in player's own request can insert/update/
--   delete only their OWN rows, and nothing else.
-- - Nothing in this migration changes any existing table, RLS
--   policy, function, rarity, format, or economy behavior.
-- - This migration does NOT compute or write any insight rows -
--   the table starts empty. A dashboard visit computes and caches
--   an insight only when there's no fresh cached row for the
--   player's current state fingerprint (see
--   src/lib/ai/dashboard-coach.ts) - a disclosed, separate,
--   application-code change.
-- =========================================================

begin;

create table if not exists public.dashboard_coach_insights (
  id uuid primary key default gen_random_uuid(),

  profile_id uuid not null
    references public.profiles(id)
    on delete cascade,

  league_id uuid not null
    references public.leagues(id)
    on delete cascade,

  -- e.g. 'newly_available_synergy', 'owned_package', 'collection_gap',
  -- 'normal_summon_competition', 'gy_imbalance', 'unused_package',
  -- 'extra_deck_opportunity', 'trade_opportunity', 'deck_weakness',
  -- 'owned_improvement' - see DASHBOARD_INSIGHT_TYPES in
  -- src/lib/ai/dashboard-coach.ts for the authoritative list.
  insight_type text not null,

  -- Structured evidence (card ids, counts, edge references) backing
  -- this insight - never AI-generated, always traceable to real
  -- deterministic data.
  evidence jsonb not null default '{}'::jsonb,

  -- Short, human-readable, non-jargon sentence - exactly what the
  -- dashboard shows by default (see the product spec's Dutch tone
  -- examples). Deterministic, computed without any AI call.
  deterministic_summary text not null,

  confidence text not null
    check (confidence in ('high', 'medium', 'low')),

  -- A hash of the player+league state this insight was computed
  -- from (collection contents, active deck contents, engine
  -- version) - see computeStateFingerprint() in dashboard-coach.ts.
  -- A dashboard visit only recomputes when the freshly-computed
  -- fingerprint differs from the stored one for this insight_type,
  -- or the player explicitly asks for a refresh.
  state_fingerprint text not null,

  engine_version text not null,

  -- Optional AI-phrased explanation of the deterministic_summary
  -- above (Section 6 - grounded, optional, never required for the
  -- dashboard to function). Null until/unless a player explicitly
  -- asks "Leg dit uit" for this insight.
  ai_explanation text,

  generated_at timestamptz not null default now(),

  -- One current row per (player, league, insight type) - a new
  -- fingerprint overwrites the old row via upsert rather than
  -- accumulating history, since only the LATEST insight per type is
  -- ever shown.
  unique (profile_id, league_id, insight_type)
);

create index if not exists dashboard_coach_insights_profile_league_idx
  on public.dashboard_coach_insights (profile_id, league_id);

alter table public.dashboard_coach_insights enable row level security;

drop policy if exists dashboard_coach_insights_owner_select
  on public.dashboard_coach_insights;

create policy dashboard_coach_insights_owner_select
  on public.dashboard_coach_insights
  for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists dashboard_coach_insights_owner_insert
  on public.dashboard_coach_insights;

create policy dashboard_coach_insights_owner_insert
  on public.dashboard_coach_insights
  for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists dashboard_coach_insights_owner_update
  on public.dashboard_coach_insights;

create policy dashboard_coach_insights_owner_update
  on public.dashboard_coach_insights
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists dashboard_coach_insights_owner_delete
  on public.dashboard_coach_insights;

create policy dashboard_coach_insights_owner_delete
  on public.dashboard_coach_insights
  for delete
  to authenticated
  using (profile_id = auth.uid());

commit;
