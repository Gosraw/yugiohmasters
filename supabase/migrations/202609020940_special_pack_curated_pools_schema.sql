begin;

-- =========================================================
-- SPECIAL PACK REBUILD, PART 1: CURATED PACK IDENTITIES + POOLS
-- (Season 1 audit, Shop item - "Special Pack" is fundamentally
-- broken and needs a full rebuild)
--
-- THE BUG THIS FIXES
-- shop_special_pack_slots (202608311400) already gave Special
-- Packs a fixed, deterministically-cycling 15-theme structure (5
-- slots x 3 categories, one active category-row at a time = "3
-- active"), which was real progress over the fully-random original
-- (202608230021). But every slot's theme_value is still a RAW
-- card_catalog.archetype / attribute / monster_type STRING, chosen
-- at migration time by `group by ... having count(*) >= 12` -
-- count(*) >= 12 is enough to pass that bar while still being a
-- near-empty, degenerate archetype (the audit's own example:
-- "@Ignister" - a real archetype tag in the catalog, but one with
-- almost no eligible, non-boss-route, Master-Duel-offerable cards
-- once every OTHER filter pick_shop_pack_card also applies is
-- layered on top). And even for a healthy theme, the filter is
-- still a LIVE `ILIKE '%'||theme_value||'%'` re-evaluated against
-- card_catalog at every single pull (pick_shop_pack_card,
-- 202609020930) - never a fixed, curated, storable set of cards,
-- and vulnerable to any future catalog edit silently changing what
-- a named pack can produce.
--
-- THE FIX (this file - schema + seed; see the companion
-- 202609020950 migration for the pick_shop_pack_card /
-- refresh_shop_special_pack_rotation_if_needed rewrite that
-- actually switches pulls over to reading these tables)
--
--   1. shop_special_pack_definitions - exactly 15 fixed, named,
--      human-designed Special Packs (NOT regenerated from a live
--      query - see seed section 2 below for the full roster and
--      the reasoning behind each one).
--   2. shop_special_pack_pool_cards - the curated ~200-300 card
--      pool for each pack, SNAPSHOTTED into this table by the seed
--      inserts below (real card_catalog rows, filtered by the
--      exact same format_eligible + is_master_duel_offerable +
--      not-Boss-Route-exclusive rule already proven by
--      202609020930, plus each pack's own thematic condition -
--      never invented, never re-computed at pull time going
--      forward).
--   3. shop_special_pack_slots gets a new pack_definition_id column
--      pointing every one of its 15 existing (theme_category,
--      slot_order) rows at the matching curated pack, via an
--      idempotent `on conflict (theme_category, slot_order) do
--      update` - the table's own comment already documents that a
--      human is expected to freely edit these rows later, so
--      overwriting the (previously live-query-derived, possibly
--      "@Ignister"-tainted) theme_value/theme_label content here is
--      exactly the anticipated use, not a surprise destructive
--      change.
--   4. shop_special_pack_rotations gets a new pack_definition_id
--      column (nullable - historical rows predate curated packs)
--      so a currently-active rotation can be resolved straight to
--      its pack's pool without an extra join through slots.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT CHANGE
-- The 3-categories-x-5-slots structure, the "one active row per
-- category = 3 active at once" invariant, the 48h cadence, and the
-- deterministic wrap-around cycling logic from 202608311400 are ALL
-- kept exactly as-is - they already satisfy the "15 configured, 3
-- active, deterministic 48h rotation" requirement and every existing
-- caller (purchase_shop_pack, get_active_special_pack_rotation, the
-- shop UI) is keyed off theme_category, so reusing that shape is the
-- smallest change that gets curated pools in place. theme_category,
-- theme_value and theme_label are all kept populated (see part 2)
-- for backward compatibility and historical rows; going forward
-- theme_label is set to each pack's curated `name` so it stays a
-- correct, human-readable display string even though it is no
-- longer literally an archetype/attribute/monster_type value.
--
-- WHY 15 CURATED IDENTITIES INSTEAD OF ONE PER "CATEGORY MEANING"
-- Once the pool - not the theme string - is the pull-time filter,
-- theme_category stops needing to describe what KIND of filter is
-- applied (that information now lives entirely in each pack's
-- stored pool) and becomes just a rotation bucket label. This lets
-- each of the eventual 15 identities be picked purely for being a
-- distinct, coherent, broad "themed booster set" with a real
-- ~200-300 card pool spanning multiple related archetypes/packages
-- plus generic support - NOT a single narrow archetype slice. An
-- earlier draft of sections 4-7 (since removed - see the DEFERRED
-- note below) picked 15 single-Type/single-archetype-cluster names
-- ("Warrior's Code", "Aqua Depths", "Golden Age Archetypes", etc.)
-- seeded via an alphabetical `order by name limit N` slice; that
-- was rejected on review as not real curation and too narrow, and
-- none of those names or pools are part of this file anymore. The
-- actual 15 identities and their pools are pending a new, broader
-- proposal (see the audit report) and are not decided here.
--
-- BOSS ROUTE AVOIDANCE (applies to whichever 15 packs are ultimately
-- approved)
-- No approved pack should be centered on a single one of the 20
-- Boss Route archetypes (chaos_bls, dark_magician, elemental_hero,
-- blue_eyes, cyber_dragon, jinzo, armed_dragon_ojama, crystal_beast,
-- red_eyes, zombie, dinosaur, legendary_fisherman, machina, toon,
-- harpie, ancient_gear, galaxy_photon, destiny_hero, vampire,
-- cubic) to the exclusion of that Type/theme's other archetypes - a
-- Type-wide or multi-archetype pool that happens to also cover a
-- Boss Route archetype among several others is fine. Whatever pools
-- are eventually seeded, the boss-route-exclusion clause (copied
-- verbatim from 202609020930/202609020950) strips any individually
-- Stage-4 or route-exclusive card from every pool regardless.
--
-- SAFETY / IDEMPOTENCY
-- Every DDL statement is CREATE TABLE IF NOT EXISTS / ADD COLUMN IF
-- NOT EXISTS. Every seed INSERT uses ON CONFLICT DO NOTHING/DO
-- UPDATE against a real unique constraint, so re-running this file
-- never duplicates a pack, a pool row, or reshuffles an already-
-- populated slot. Nothing is deleted. No existing table's rows are
-- altered outside the 15 (theme_category, slot_order) slot rows
-- this system already owns and whose comment already invites this
-- exact kind of curation edit.
-- =========================================================


-- ---------------------------------------------------------
-- 1. shop_special_pack_definitions - the 15 fixed packs.
-- ---------------------------------------------------------

create table if not exists public.shop_special_pack_definitions (
  id uuid primary key default gen_random_uuid(),

  code text not null unique,
  name text not null,
  theme_description text not null,

  display_order integer not null unique
    check (display_order between 1 and 15),

  is_active boolean not null default true,

  created_at timestamptz not null default now()
);

comment on table public.shop_special_pack_definitions is
  'The 15 fixed, human-designed Special Pack identities (Season 1 audit rebuild, 2026-09-02) - never regenerated from a live query. Each row''s curated card pool lives in shop_special_pack_pool_cards. is_active lets a pack be pulled out of the shop_special_pack_slots rotation later (see refresh_shop_special_pack_rotation_if_needed) without deleting its history or pool.';

alter table public.shop_special_pack_definitions enable row level security;

drop policy if exists shop_special_pack_definitions_select_authenticated
  on public.shop_special_pack_definitions;

create policy shop_special_pack_definitions_select_authenticated
  on public.shop_special_pack_definitions
  for select
  to authenticated
  using (true);

revoke insert, update, delete
  on public.shop_special_pack_definitions
  from authenticated;

grant select
  on public.shop_special_pack_definitions
  to authenticated;


-- ---------------------------------------------------------
-- 2. shop_special_pack_pool_cards - curated pool membership.
-- ---------------------------------------------------------

create table if not exists public.shop_special_pack_pool_cards (
  id uuid primary key default gen_random_uuid(),

  pack_definition_id uuid not null
    references public.shop_special_pack_definitions(id)
    on delete cascade,

  card_catalog_id uuid not null
    references public.card_catalog(id)
    on delete cascade,

  created_at timestamptz not null default now(),

  unique (pack_definition_id, card_catalog_id)
);

comment on table public.shop_special_pack_pool_cards is
  'Snapshotted pool of eligible card_catalog rows for one shop_special_pack_definitions pack - the ONLY thing that decides which cards a Special Pack pull can produce as of the 2026-09-02 rebuild (pick_shop_pack_card no longer runs a live ILIKE theme match against card_catalog for special packs; see 202609020950). Populated once by this migration''s seed inserts from real, currently-eligible, non-Boss-Route-exclusive cards - never computed dynamically at pull time. A human can freely add/remove rows here later to curate a pack further.';

create index if not exists shop_special_pack_pool_cards_pack_idx
  on public.shop_special_pack_pool_cards (pack_definition_id);

create index if not exists shop_special_pack_pool_cards_card_idx
  on public.shop_special_pack_pool_cards (card_catalog_id);

alter table public.shop_special_pack_pool_cards enable row level security;

drop policy if exists shop_special_pack_pool_cards_select_authenticated
  on public.shop_special_pack_pool_cards;

create policy shop_special_pack_pool_cards_select_authenticated
  on public.shop_special_pack_pool_cards
  for select
  to authenticated
  using (true);

revoke insert, update, delete
  on public.shop_special_pack_pool_cards
  from authenticated;

grant select
  on public.shop_special_pack_pool_cards
  to authenticated;


-- ---------------------------------------------------------
-- 3. Link shop_special_pack_slots / shop_special_pack_rotations
--    to the new curated packs (additive columns only).
-- ---------------------------------------------------------

alter table public.shop_special_pack_slots
  add column if not exists pack_definition_id uuid
    references public.shop_special_pack_definitions(id);

comment on column public.shop_special_pack_slots.pack_definition_id is
  'Which curated shop_special_pack_definitions pack this configured slot activates (2026-09-02 rebuild) - resolves the slot straight to its stored pool instead of the slot''s own theme_value ever being live-ILIKE-matched against card_catalog again. Null only on a slot a human has not yet assigned a curated pack to (refresh_shop_special_pack_rotation_if_needed skips such a slot - see 202609020950).';

alter table public.shop_special_pack_rotations
  add column if not exists pack_definition_id uuid
    references public.shop_special_pack_definitions(id);

comment on column public.shop_special_pack_rotations.pack_definition_id is
  'The curated pack (shop_special_pack_definitions) this active/historical rotation row was generated from - lets pick_shop_pack_card resolve straight to shop_special_pack_pool_cards without a join through shop_special_pack_slots. Null on historical rows created before curated pools existed.';


-- =========================================================
-- 4-7. SEED DATA - DEFERRED, NOT YET APPROVED (2026-09-02 review)
--
-- An earlier draft of this migration included sections 4-7 here:
-- 15 hardcoded pack definitions, their curated card pools (seeded
-- via "order by name limit N", which was correctly called out on
-- review as an arbitrary alphabetical slice, not real curation),
-- the slot-to-pack assignment, and a pool-size verification block.
-- All of that has been REMOVED from this file pending a new,
-- broader 15-pack proposal (booster-style pools blending multiple
-- related archetypes/themes + generic support, ~200-300 cards
-- each, not single-archetype slices) - see the audit report for
-- the new proposal awaiting approval.
--
-- What stays in THIS file (sections 1-3 above) is the approved
-- architecture only: the shop_special_pack_definitions and
-- shop_special_pack_pool_cards TABLES, and the additive
-- pack_definition_id columns on shop_special_pack_slots /
-- shop_special_pack_rotations. These tables are empty until a
-- follow-up migration seeds the approved 15 packs and their pools -
-- pick_shop_pack_card (202609020950) already treats an empty/
-- unassigned pool correctly (v_pack_definition_id ends up null for
-- any rotation that isn't linked to a pack yet, which makes every
-- pool-membership check in that function a no-op, same as a
-- Normal/Premium/Deluxe pack) - so deploying this schema-only file
-- now is safe and doesn't change any current pack-pull behavior
-- until the pool data actually exists.
-- =========================================================

commit;
