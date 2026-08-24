-- =========================================================
-- CARD SYNERGY GRAPH (precomputed, deterministic)
--
-- WHY
-- The existing card-synergy feature (lib/ai/card-synergy-candidates.ts,
-- shipped earlier this project) already avoids "same archetype = good
-- together" as a sole signal, which is good - but two real problems
-- remain, found by reading the actual code, not guessed:
--   1. Its candidate pool is a FULL `card_catalog` scan on every
--      request for a card that isn't cached (see
--      lib/ai/card-synergy-context.ts: `.select(CATALOG_COLUMNS).neq
--      ("id", cardId)` - no limit, ~14k rows every time). This is
--      exactly the "no request-time scan of the full ~14k catalog"
--      violation this task explicitly calls out.
--   2. Its mechanic tagging (lib/ai/card-mechanics.ts) is a small,
--      flat set of regex tests with no requirement/payoff distinction,
--      no named-material precision, and no evidence trail beyond the
--      matched tag name - much shallower than the classification
--      already built and validated in lib/valuation-engine.mjs
--      (classifyReference/parseExtraDeckMaterials/clauseAround), which
--      already distinguishes mandatory_requirement / mandatory_target /
--      search_target / optional_bonus / self_reference / ambiguous,
--      and generic/constrained/named Extra Deck materials.
--
-- This migration adds storage for a NEW, richer, precomputed layer
-- (scripts/compute-synergy-graph.mjs, lib/synergy-engine.mjs) that
-- reuses valuation-engine.mjs's semantic parsing instead of
-- duplicating it, and that a request handler can query cheaply by
-- indexed card id instead of scanning the whole catalog.
--
-- SAFETY
-- - Purely additive: two new tables, no existing table touched.
-- - RLS: readable by any authenticated user (same as card_catalog
--   itself - this is public game-reference data, not player data).
--   Writes are NEVER granted to `authenticated` - only a
--   service-role script (scripts/compute-synergy-graph.mjs) can
--   populate these tables, same pattern as the valuation engine's
--   proposal columns.
-- - Nothing in this migration changes any existing table, RLS
--   policy, function, rarity, format, or economy behavior.
-- - This migration does NOT run the precompute script. Both tables
--   start empty. Existing card-synergy code paths are unaffected
--   until the application code is explicitly changed to read from
--   them (a separate, disclosed application-code change, not a
--   side effect of this migration).
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1. card_mechanics - one row per card_catalog row, the
--    structured "what does this card actually do" profile.
-- ---------------------------------------------------------

create table if not exists public.card_mechanics (
  card_catalog_id uuid primary key
    references public.card_catalog(id)
    on delete cascade,

  -- Structured mechanic tags - see lib/synergy-engine.mjs
  -- MECHANIC_TAGS for the authoritative list (starter, extender,
  -- searcher, tutor, draw, discard_outlet, tribute_outlet,
  -- gy_setup, mill, gy_payoff, revival, recursion, banish_setup,
  -- banish_payoff, removal, board_wipe, negate, interaction,
  -- protection_battle, protection_targeting, protection_effect,
  -- board_breaker, floodgate, token_generation,
  -- normal_summon_dependency, special_summon_enabler,
  -- fusion_enabler, xyz_enabler, synchro_enabler, link_enabler,
  -- brick_risk, hard_once_per_turn, soft_once_per_turn, self_lock,
  -- recovery, follow_up, generic_utility, build_around_payoff).
  tags text[] not null default '{}',

  -- Named cards this card can search/tutor for (from
  -- classifyReference's search_target references), lowercased for
  -- exact-match lookups.
  search_targets text[] not null default '{}',

  -- Named cards required as Extra Deck material (only when
  -- valuation-engine's materials.specificity === 'named'),
  -- lowercased.
  named_material_targets text[] not null default '{}',

  -- Named cards required as a non-material mandatory requirement/
  -- target (e.g. "banishing 1 <Name> you control"), lowercased.
  named_requirement_targets text[] not null default '{}',

  -- Extra Deck material specificity, mirrors valuation-engine's
  -- ExtraDeckMaterials shape verbatim for constrained-material
  -- matching (attribute/type/tuner text), null for non-Extra-Deck
  -- cards.
  material_specificity text,
  material_text text,

  -- Full structured evidence payload (classified references,
  -- signals used, valuation-engine numeric axes reused for
  -- confidence weighting) - deterministic data, never AI prose.
  evidence jsonb not null default '{}'::jsonb,

  engine_version text not null,
  computed_at timestamptz not null default now()
);

create index if not exists card_mechanics_tags_idx
  on public.card_mechanics using gin (tags);

create index if not exists card_mechanics_search_targets_idx
  on public.card_mechanics using gin (search_targets);

create index if not exists card_mechanics_named_material_targets_idx
  on public.card_mechanics using gin (named_material_targets);

create index if not exists card_mechanics_named_requirement_targets_idx
  on public.card_mechanics using gin (named_requirement_targets);


-- ---------------------------------------------------------
-- 2. card_synergy_edges - directional, typed, precomputed
--    relations between two SPECIFIC cards. Only emitted where a
--    real, checkable structural relation exists (an exact named
--    match, or a satisfied Extra Deck material constraint, or a
--    tag-pair with a documented directional meaning) - never from
--    archetype-alone or attribute-alone (see
--    lib/synergy-engine.mjs computeSynergyEdges() for the exact,
--    disclosed rule set and what is deliberately NOT computed as a
--    pairwise edge, e.g. generic revival/recursion and Normal
--    Summon competition are stored as card_mechanics tags instead,
--    since a fan-out edge to every eligible monster in the catalog
--    would not be a meaningful "relation", it would just be noise).
-- ---------------------------------------------------------

create table if not exists public.card_synergy_edges (
  id uuid primary key default gen_random_uuid(),

  source_card_id uuid not null
    references public.card_catalog(id)
    on delete cascade,

  target_card_id uuid not null
    references public.card_catalog(id)
    on delete cascade,

  edge_type text not null
    check (
      edge_type in (
        'searches',
        'material_supply_named',
        'material_supply_constrained',
        'requirement_satisfies',
        'gy_setup_for',
        'discard_payoff_for',
        'banish_payoff_for',
        'spell_trap_support'
      )
    ),

  -- 0-100, deterministic weighted score (see WEIGHT table in
  -- lib/synergy-engine.mjs) - never an opaque/black-box number,
  -- always traceable to `evidence` below.
  score numeric(6, 2) not null,

  confidence text not null
    check (confidence in ('high', 'medium', 'low')),

  -- Short, factual, human-readable sentence grounded only in real
  -- card fields - exactly what the AI phrasing layer is allowed to
  -- paraphrase, mirrors the existing SynergyReason.detail contract.
  deterministic_reason text not null,

  -- Structured evidence backing this edge (matched clause,
  -- reference type, material text, etc.) - never hallucinated prose.
  evidence jsonb not null default '{}'::jsonb,

  engine_version text not null,
  computed_at timestamptz not null default now(),

  unique (source_card_id, target_card_id, edge_type),

  constraint card_synergy_edges_not_self
    check (source_card_id <> target_card_id)
);

create index if not exists card_synergy_edges_source_idx
  on public.card_synergy_edges (source_card_id, score desc);

create index if not exists card_synergy_edges_target_idx
  on public.card_synergy_edges (target_card_id, score desc);

create index if not exists card_synergy_edges_type_idx
  on public.card_synergy_edges (edge_type);


-- ---------------------------------------------------------
-- 3. card_synergy_engine_runs - a small audit trail of when the
--    precompute script last ran, mirrors the spirit of
--    valuation_engine_version/valuation_computed_at on card_catalog
--    but as its own append-only log (a precompute run touches many
--    rows at once, worth its own history rather than only the last
--    timestamp).
-- ---------------------------------------------------------

create table if not exists public.card_synergy_engine_runs (
  id uuid primary key default gen_random_uuid(),

  engine_version text not null,
  cards_processed integer not null,
  edges_generated integer not null,

  started_at timestamptz not null,
  finished_at timestamptz not null default now(),

  notes text,

  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------
-- 4. RLS - readable by any authenticated user (public game-
--    reference data derived entirely from card_catalog, same
--    exposure level as card_catalog itself), never writable by
--    `authenticated` - only a service-role script populates these.
-- ---------------------------------------------------------

alter table public.card_mechanics enable row level security;
alter table public.card_synergy_edges enable row level security;
alter table public.card_synergy_engine_runs enable row level security;

drop policy if exists card_mechanics_read_authenticated
  on public.card_mechanics;

create policy card_mechanics_read_authenticated
  on public.card_mechanics
  for select
  to authenticated
  using (true);

drop policy if exists card_synergy_edges_read_authenticated
  on public.card_synergy_edges;

create policy card_synergy_edges_read_authenticated
  on public.card_synergy_edges
  for select
  to authenticated
  using (true);

drop policy if exists card_synergy_engine_runs_read_authenticated
  on public.card_synergy_engine_runs;

create policy card_synergy_engine_runs_read_authenticated
  on public.card_synergy_engine_runs
  for select
  to authenticated
  using (true);

revoke insert, update, delete on public.card_mechanics from authenticated;
revoke insert, update, delete on public.card_synergy_edges from authenticated;
revoke insert, update, delete on public.card_synergy_engine_runs from authenticated;

commit;
