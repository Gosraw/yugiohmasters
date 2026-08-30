begin;

-- =========================================================
-- ARCHETYPE REGISTRY - SCHEMA
--
-- WHY
-- Every prior Duelist Circle Classic pass (eligibility, valuation,
-- rarity calibration, 2015-2018 legacy support) produced either a
-- computed score or a curated whitelist, but nothing the app itself
-- can query to answer "what does the Blue-Eyes deck actually look
-- like, and what's still missing?" This is that layer: a real,
-- app-queryable classification of which eligible cards belong to
-- which archetype, what ROLE they play, which are Extra Deck bosses
-- (and how hard those are to actually summon in THIS format), which
-- curated deckbuilding package tier they fall into, and where each
-- archetype sits on the early/mid/late/signature boss progression
-- ladder this project is building toward.
--
-- Two tables, config/reference data (same class as
-- duelist_circle_formats / format_card_overrides, NOT player data -
-- no profile_id anywhere here):
--
--   archetype_registry - one row per archetype. Carries the
--     descriptive + viability-profile fields (consistency, removal,
--     defense, recovery, boss_power, summoning_speed,
--     nostalgia_relevance, overall_health, deck_reality) plus a
--     small structured `gaps` array (jsonb: [{category, description}])
--     naming EXACTLY what's missing (a searcher, a Fusion spell, a
--     Level 4 body, Xyz access, etc.) rather than a vague prose note.
--
--   archetype_cards - one row per (archetype, card) relationship.
--     card_catalog_id is a real foreign key (not a name string) -
--     every seeding migration resolves it via
--     `select c.id from card_catalog c where c.name = '<exact name>'`
--     at apply time, the same safe pattern every prior migration in
--     this repo uses, so the STORED relationship is always the real
--     id even though this sandbox never has a live connection to look
--     one up ahead of time.
--
-- APP-READY SHAPE
-- lib/archetype-registry.mjs's getArchetype() joins these two tables
-- (plus card_catalog for name/card_type/game_rarity) into the exact
-- object shape section 12 of the brief describes. This migration is
-- the storage; that module is the read API - see its own header.
--
-- VALIDATION
-- The Node-side generator/test suite (scripts/generate-archetype-
-- registry-migration.mjs, lib/archetype-registry.regression.test.mjs)
-- checks "every referenced card exists" and "no Synchro/Link/
-- Pendulum card in a BOSS/FUSION/XYZ slot" against the real catalog
-- BEFORE any SQL is generated - the cheapest place to catch a mistake
-- is before it becomes a migration. The trigger below is a second,
-- independent DB-level guard for the mechanic check specifically,
-- since that invariant is cheap to enforce declaratively and matters
-- enough to defend twice.
-- =========================================================

create table if not exists public.archetype_registry (
  id uuid primary key default gen_random_uuid(),

  code text not null unique,
  name text not null,
  description text,

  -- Position in the "nostalgia priority" review order (brief section
  -- 1/7/9). NULL = not one of the originally-named priority
  -- archetypes; still a perfectly normal registry row.
  priority_rank integer,

  nostalgia_relevance text not null
    check (nostalgia_relevance in ('LOW', 'MEDIUM', 'HIGH')),
  consistency text not null
    check (consistency in ('LOW', 'MEDIUM', 'HIGH')),
  removal text not null
    check (removal in ('LOW', 'MEDIUM', 'HIGH')),
  defense text not null
    check (defense in ('LOW', 'MEDIUM', 'HIGH')),
  recovery text not null
    check (recovery in ('LOW', 'MEDIUM', 'HIGH')),
  boss_power text not null
    check (boss_power in ('LOW', 'MEDIUM', 'HIGH')),
  summoning_speed text not null
    check (summoning_speed in ('SLOW', 'MEDIUM', 'FAST')),
  overall_health text not null
    check (overall_health in ('TOO_WEAK', 'WEAK', 'HEALTHY', 'STRONG', 'TOO_STRONG')),

  -- "Can this realistically fill a 40-card deck on its own?" (brief
  -- section 6) - deliberately NOT forced to FULL_DECK for every
  -- archetype; Jinzo is the brief's own example of a legitimate
  -- THIN_THEME.
  deck_reality text not null
    check (deck_reality in ('FULL_DECK', 'ENGINE_PLUS_GENERIC', 'THIN_THEME')),

  -- [{ "category": "searcher" | "fusion_spell" | "recovery" |
  --    "removal" | "defensive_card" | "boss" | "level_4_body" |
  --    "xyz_access" | "consistency" | "other", "description": "..." }]
  -- Specific and actionable per the brief's section 8 - never a bare
  -- "could use more support" placeholder.
  gaps jsonb not null default '[]'::jsonb,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.archetype_registry is
  'One row per Duelist Circle archetype: description, viability profile (consistency/removal/defense/recovery/boss_power/summoning_speed/nostalgia_relevance/overall_health), deck-size reality (FULL_DECK/ENGINE_PLUS_GENERIC/THIN_THEME), and a structured gaps array. Config/reference data - admin-managed, not player data.';

comment on column public.archetype_registry.gaps is
  'Array of {category, description} objects naming a SPECIFIC missing piece (a searcher, a Fusion spell, a Level 4 body, Xyz access, etc.), never a vague "needs more support" placeholder.';

create table if not exists public.archetype_cards (
  id uuid primary key default gen_random_uuid(),

  archetype_id uuid not null
    references public.archetype_registry(id)
    on delete cascade,

  card_catalog_id uuid not null
    references public.card_catalog(id)
    on delete cascade,

  role text not null
    check (role in ('CORE', 'SUPPORT', 'BOSS', 'UTILITY', 'NICHE', 'AVOID')),

  -- NULL for Main Deck cards. Synchro/Link/Pendulum are deliberately
  -- NOT valid values here - see the trigger below, which also
  -- double-checks the card's own real card_type/frame_type agrees.
  extra_deck_kind text
    check (extra_deck_kind in ('FUSION', 'XYZ')),

  -- Based on actual required materials/setup in THIS format, not the
  -- monster's stats (brief section 3) - NULL for non-boss/non-Extra-
  -- Deck cards, where the concept doesn't apply.
  summon_difficulty text
    check (summon_difficulty in ('EASY', 'MODERATE', 'HARD', 'VERY_HARD')),

  -- NULL = not part of any curated deckbuilding package (this is the
  -- normal state for SUPPORT/UTILITY/NICHE/AVOID cards not chosen for
  -- a tier; ESSENTIAL/RECOMMENDED/EXPANSION cards are always CORE or
  -- BOSS role, never AVOID).
  package_tier text
    check (package_tier in ('ESSENTIAL', 'RECOMMENDED', 'EXPANSION')),

  -- Boss progression ladder (brief section 10). NULL for the large
  -- majority of rows - only set on the small number of cards chosen
  -- as an archetype's actual progression candidates. An archetype
  -- with fewer than 4 sensible stages simply leaves some values
  -- unused rather than forcing a bad pick into every slot.
  boss_stage text
    check (boss_stage in ('EARLY', 'MID', 'LATE', 'SIGNATURE')),

  -- true = this session's classification confidence was moderate/low
  -- (per the brief's own "if a card cannot be verified, place it in
  -- REVIEW rather than pretending certainty" instruction) - a human
  -- should double-check role/tier/difficulty before treating this row
  -- as final, even though it is already stored (not omitted).
  needs_review boolean not null default false,

  notes text,

  created_at timestamptz not null default now(),

  unique (archetype_id, card_catalog_id)
);

comment on table public.archetype_cards is
  'One row per (archetype, card) classification: role (CORE/SUPPORT/BOSS/UTILITY/NICHE/AVOID), Extra Deck kind + summon difficulty for Fusion/Xyz bosses, curated package tier (ESSENTIAL/RECOMMENDED/EXPANSION), and boss-progression stage (EARLY/MID/LATE/SIGNATURE) where applicable. needs_review=true flags a classification this session was not fully confident in.';

create index if not exists archetype_cards_archetype_idx
  on public.archetype_cards(archetype_id);

create index if not exists archetype_cards_card_idx
  on public.archetype_cards(card_catalog_id);

-- ---------------------------------------------------------
-- Defense-in-depth: an archetype_cards row claiming extra_deck_kind
-- must actually match the referenced card's real card_type/frame_type
-- - and Synchro/Link/Pendulum can never be stored as a boss/Extra
-- Deck kind here at all, independent of whatever the Node-side
-- generator already checked before producing the seed migration.
-- ---------------------------------------------------------

create or replace function public.enforce_archetype_card_extra_deck_kind()
returns trigger
language plpgsql
as $fn$
declare
  v_type text;
begin
  select lower(coalesce(c.card_type, '') || ' ' || coalesce(c.frame_type, ''))
  into v_type
  from public.card_catalog c
  where c.id = new.card_catalog_id;

  if v_type is null then
    raise exception 'archetype_cards: card_catalog_id % does not exist', new.card_catalog_id;
  end if;

  if v_type like '%synchro%' or v_type like '%link%' or v_type like '%pendulum%' then
    raise exception 'archetype_cards: card_catalog_id % is Synchro/Link/Pendulum ("%") - not a legal Duelist Circle Classic mechanic, cannot be registered as a boss/Extra Deck card', new.card_catalog_id, v_type;
  end if;

  if new.extra_deck_kind = 'FUSION' and v_type not like '%fusion%' then
    raise exception 'archetype_cards: card_catalog_id % marked extra_deck_kind=FUSION but its real card_type/frame_type ("%") is not a Fusion Monster', new.card_catalog_id, v_type;
  end if;

  if new.extra_deck_kind = 'XYZ' and v_type not like '%xyz%' then
    raise exception 'archetype_cards: card_catalog_id % marked extra_deck_kind=XYZ but its real card_type/frame_type ("%") is not an Xyz Monster', new.card_catalog_id, v_type;
  end if;

  return new;
end;
$fn$;

drop trigger if exists archetype_cards_enforce_extra_deck_kind on public.archetype_cards;

create trigger archetype_cards_enforce_extra_deck_kind
  before insert or update on public.archetype_cards
  for each row
  execute function public.enforce_archetype_card_extra_deck_kind();

alter table public.archetype_registry enable row level security;
alter table public.archetype_cards enable row level security;

drop policy if exists archetype_registry_select_authenticated on public.archetype_registry;
create policy archetype_registry_select_authenticated
  on public.archetype_registry
  for select
  to authenticated
  using (true);

drop policy if exists archetype_cards_select_authenticated on public.archetype_cards;
create policy archetype_cards_select_authenticated
  on public.archetype_cards
  for select
  to authenticated
  using (true);

-- Admin-managed config, mutated only via service-role tooling/the
-- generator script below - same pattern as duelist_circle_formats
-- and format_card_overrides.
revoke insert, update, delete on public.archetype_registry from authenticated;
revoke insert, update, delete on public.archetype_cards from authenticated;

commit;
