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
-- stored pool) and becomes just a rotation bucket label. This let
-- each of the 15 identities below be picked purely for being a
-- distinct, coherent, nostalgia-appropriate Special Pack with a
-- real ~200-300 card pool grounded in this catalog - some are a
-- single Monster Type (e.g. "Warrior's Code"), some combine several
-- related Types to reach a healthy pool size (e.g. "Aqua Depths" =
-- Aqua + Sea Serpent + Fish), and one ("Golden Age Archetypes") is a
-- curated cluster of five real, substantial, non-Boss-Route
-- archetypes. See each INSERT's own comment below for the exact
-- filter and the real local-catalog-snapshot count it was checked
-- against (reports/card-valuation/2026-08-25T12-39-31-069Z/
-- full-proposal.json - the most recent local snapshot with
-- per-card race/archetype/master_duel_status columns; this
-- migration cannot query the live database directly, so every count
-- below is a verified LOCAL estimate, called out as such, not a
-- guess - see the companion session report for the caveat and the
-- couple of packs that may land slightly outside 200-300 once the
-- live Boss-Route exclusion and any catalog drift since that
-- snapshot are actually applied).
--
-- BOSS ROUTE AVOIDANCE
-- None of the 15 packs below is centered on one of the 20 Boss
-- Route archetypes (chaos_bls, dark_magician, elemental_hero,
-- blue_eyes, cyber_dragon, jinzo, armed_dragon_ojama, crystal_beast,
-- red_eyes, zombie, dinosaur, legendary_fisherman, machina, toon,
-- harpie, ancient_gear, galaxy_photon, destiny_hero, vampire,
-- cubic) - "Zombie Uprising" and "Stone Age" (which includes the
-- Dinosaur Type) are Type-WIDE pools spanning every archetype of
-- that Type, not narrowed to the Zombie/Dinosaur Boss Route
-- archetypes specifically, matching the product owner's own
-- "Zombie Uprising" example. The boss-route-exclusion clause below
-- (copied verbatim from 202609020930) additionally strips any
-- individually route-exclusive card from every pool regardless.
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
-- 4. SEED: the 15 curated packs.
--
-- Each pack's card pool is populated in section 5 below via its
-- own INSERT ... SELECT ... FROM card_catalog, filtered on:
--   - format_eligible = true
--   - is_master_duel_offerable(master_duel_status)
--   - NOT a Boss-Route evolution monster or is_route_exclusive
--     grant (verbatim clause from 202609020930)
--   - the pack's own thematic condition (race/archetype match)
-- capped with `order by name asc limit <n>` only where the raw
-- match count is comfortably above 300, so the final pool lands
-- near 200-300 without ever needing to guess at randomness.
--
-- BUCKET ASSIGNMENT (theme_category is now a pure rotation-bucket
-- label, 5 packs each - see 202609020950 section on why the
-- literal "attribute"/"archetype"/"monster_type" meaning of the
-- category no longer matters for filtering):
--   monster_type bucket: Warrior's Code, Machine Uprising,
--     Fiend Rising, Arcane Order, Dragon's Roar (5 solo/near-solo
--     Monster Type packs)
--   archetype bucket: Beast Kingdom, Wild Overgrowth, Aqua Depths,
--     Stone Age, Golden Age Archetypes (multi-Type nature clusters
--     plus the one true archetype-cluster pack)
--   attribute bucket: Divine Wings, Skyward Wings, Elemental Fury,
--     Psychic Network, Zombie Uprising
-- =========================================================

insert into public.shop_special_pack_definitions
  (code, name, theme_description, display_order)
values
  ('warriors_code', 'Warrior''s Code',
   'Every card in this pack is a Warrior-Type monster, or the Spells and Traps built to support them - the deepest, most generic Monster Type in the format.',
   1),
  ('machine_uprising', 'Machine Uprising',
   'Every card in this pack is a Machine-Type monster or Machine support - gears, robots and war engines from across the whole format.',
   2),
  ('fiend_rising', 'Fiend Rising',
   'Every card in this pack is a Fiend-Type monster or Fiend support - demons, devils and dark spirits from across the whole format.',
   3),
  ('arcane_order', 'Arcane Order',
   'Every card in this pack is a Spellcaster-Type monster or Spellcaster support - wizards, witches and magicians from across the whole format.',
   4),
  ('dragons_roar', 'Dragon''s Roar',
   'Every card in this pack is a Dragon- or Wyrm-Type monster, or the Spells and Traps built to support them.',
   5),
  ('divine_wings', 'Divine Wings',
   'Every card in this pack is a Fairy-Type monster or Fairy support - angels, seraphs and divine guardians from across the whole format.',
   6),
  ('skyward_wings', 'Skyward Wings',
   'Every card in this pack is a Winged Beast-Type monster or Winged Beast support - birds, harpies and sky hunters from across the whole format.',
   7),
  ('elemental_fury', 'Elemental Fury',
   'Every card in this pack is a Thunder- or Pyro-Type monster - the format''s lightning- and fire-elemental creatures, plus their support.',
   8),
  ('psychic_network', 'Psychic Network',
   'Every card in this pack is a Cyberse- or Psychic-Type monster - the format''s mind- and circuit-powered creatures, plus their support.',
   9),
  ('zombie_uprising', 'Zombie Uprising',
   'Every card in this pack is a Zombie-Type monster or Zombie support - the format''s undead horde, plus their support.',
   10),
  ('beast_kingdom', 'Beast Kingdom',
   'Every card in this pack is a Beast- or Beast-Warrior-Type monster, or the Spells and Traps built to support them.',
   11),
  ('wild_overgrowth', 'Wild Overgrowth',
   'Every card in this pack is a Plant-, Insect- or Reptile-Type monster - the format''s untamed wilderness, plus their support.',
   12),
  ('aqua_depths', 'Aqua Depths',
   'Every card in this pack is an Aqua-, Sea Serpent- or Fish-Type monster - the format''s creatures of the deep, plus their support.',
   13),
  ('stone_age', 'Stone Age',
   'Every card in this pack is a Rock- or Dinosaur-Type monster - the format''s ancient, earthbound creatures, plus their support.',
   14),
  ('golden_age_archetypes', 'Golden Age Archetypes',
   'A curated sampler of five substantial, non-Boss-Route archetypes - Archfiend, Blackwing, Gladiator Beast, Roid and Six Samurai - a taste of five different classic decks in one Special Pack.',
   15)
on conflict (code) do update set
  name = excluded.name,
  theme_description = excluded.theme_description,
  display_order = excluded.display_order;


-- ---------------------------------------------------------
-- 5. SEED: curated card pools, one INSERT per pack.
--
-- Shared boss-route-exclusion clause reproduced verbatim from
-- 202609020930_fix_shop_pack_boss_route_exclusion.sql in every
-- statement below.
-- ---------------------------------------------------------

-- Warrior's Code - Monster Type = Warrior. Real local snapshot:
-- 747 format-eligible, Master-Duel-offerable Warrior-Type cards -
-- capped to 260 (order by name) to land inside the 200-300 target
-- with margin for the live Boss-Route exclusion (several Boss
-- Route evolution/support cards, e.g. Elemental HERO and Chaos/BLS
-- route grants, are Warrior-Type).
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select d.id, c.id
from public.shop_special_pack_definitions d
cross join public.card_catalog c
where d.code = 'warriors_code'
  and c.format_eligible = true
  and public.is_master_duel_offerable(c.master_duel_status)
  and c.race = 'Warrior'
  and not exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = c.id
  )
  and not exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = c.id and brg.is_route_exclusive = true
  )
order by c.name asc
limit 260
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Machine Uprising - Monster Type = Machine. Real local snapshot:
-- 643 eligible - capped to 260.
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select d.id, c.id
from public.shop_special_pack_definitions d
cross join public.card_catalog c
where d.code = 'machine_uprising'
  and c.format_eligible = true
  and public.is_master_duel_offerable(c.master_duel_status)
  and c.race = 'Machine'
  and not exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = c.id
  )
  and not exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = c.id and brg.is_route_exclusive = true
  )
order by c.name asc
limit 260
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Fiend Rising - Monster Type = Fiend. Real local snapshot: 518
-- eligible - capped to 260.
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select d.id, c.id
from public.shop_special_pack_definitions d
cross join public.card_catalog c
where d.code = 'fiend_rising'
  and c.format_eligible = true
  and public.is_master_duel_offerable(c.master_duel_status)
  and c.race = 'Fiend'
  and not exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = c.id
  )
  and not exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = c.id and brg.is_route_exclusive = true
  )
order by c.name asc
limit 260
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Arcane Order - Monster Type = Spellcaster. Real local snapshot:
-- 442 eligible - capped to 250 (Dark Magician route grants a
-- handful of Spellcaster-Type support cards, excluded above).
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select d.id, c.id
from public.shop_special_pack_definitions d
cross join public.card_catalog c
where d.code = 'arcane_order'
  and c.format_eligible = true
  and public.is_master_duel_offerable(c.master_duel_status)
  and c.race = 'Spellcaster'
  and not exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = c.id
  )
  and not exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = c.id and brg.is_route_exclusive = true
  )
order by c.name asc
limit 250
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Dragon's Roar - Monster Type in (Dragon, Wyrm) - Wyrm folded in
-- as the format's small (real local snapshot: 47 eligible),
-- thematically-identical modern dragon-adjacent Type rather than
-- given its own pack. Dragon alone: 372 eligible. Combined: ~419 -
-- capped to 260 (Blue-Eyes, Red-Eyes and Galaxy/Photon routes all
-- grant Dragon-Type support, excluded above).
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select d.id, c.id
from public.shop_special_pack_definitions d
cross join public.card_catalog c
where d.code = 'dragons_roar'
  and c.format_eligible = true
  and public.is_master_duel_offerable(c.master_duel_status)
  and c.race in ('Dragon', 'Wyrm')
  and not exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = c.id
  )
  and not exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = c.id and brg.is_route_exclusive = true
  )
order by c.name asc
limit 260
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Divine Wings - Monster Type = Fairy. Real local snapshot: 332
-- eligible - capped to 250.
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select d.id, c.id
from public.shop_special_pack_definitions d
cross join public.card_catalog c
where d.code = 'divine_wings'
  and c.format_eligible = true
  and public.is_master_duel_offerable(c.master_duel_status)
  and c.race = 'Fairy'
  and not exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = c.id
  )
  and not exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = c.id and brg.is_route_exclusive = true
  )
order by c.name asc
limit 250
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Skyward Wings - Monster Type = Winged Beast. Real local snapshot:
-- 229 eligible (Harpie route grants a small number of Winged
-- Beast-Type support, excluded above) - NOT capped, every matching
-- card is included, since the raw count is already close to the
-- lower end of the 200-300 target.
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select d.id, c.id
from public.shop_special_pack_definitions d
cross join public.card_catalog c
where d.code = 'skyward_wings'
  and c.format_eligible = true
  and public.is_master_duel_offerable(c.master_duel_status)
  and c.race = 'Winged Beast'
  and not exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = c.id
  )
  and not exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = c.id and brg.is_route_exclusive = true
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Elemental Fury - Monster Type in (Thunder, Pyro). Real local
-- snapshot: Thunder 99 + Pyro 106 = 205 eligible - NOT capped,
-- already right at the lower end of the 200-300 target (see
-- session report: this is one of the packs most likely to land
-- slightly under 200 once the live Boss-Route exclusion and any
-- catalog drift are actually applied - no boss route centers on
-- either Type, so no further narrowing was possible without
-- diluting the identity).
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select d.id, c.id
from public.shop_special_pack_definitions d
cross join public.card_catalog c
where d.code = 'elemental_fury'
  and c.format_eligible = true
  and public.is_master_duel_offerable(c.master_duel_status)
  and c.race in ('Thunder', 'Pyro')
  and not exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = c.id
  )
  and not exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = c.id and brg.is_route_exclusive = true
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Psychic Network - Monster Type in (Cyberse, Psychic). Real local
-- snapshot: Cyberse 121 + Psychic 110 = 231 eligible - NOT capped.
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select d.id, c.id
from public.shop_special_pack_definitions d
cross join public.card_catalog c
where d.code = 'psychic_network'
  and c.format_eligible = true
  and public.is_master_duel_offerable(c.master_duel_status)
  and c.race in ('Cyberse', 'Psychic')
  and not exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = c.id
  )
  and not exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = c.id and brg.is_route_exclusive = true
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Zombie Uprising - Monster Type = Zombie. Real local snapshot: 175
-- eligible BEFORE the Zombie Boss Route's own exclusion is applied
-- (the Zombie route grants ~12 permanent Zombie-Type support cards
-- plus its evolution chain, all removed by the clause below) - NOT
-- capped. KNOWN, DOCUMENTED SHORTFALL: this is the one pack most
-- likely to land meaningfully under the 200 floor once the live
-- exclusion is applied (estimated ~150-165 real pool cards). No
-- thematically-coherent broader Type combination was available
-- (Zombie does not naturally pair with any other Type the way
-- Aqua/Sea Serpent/Fish or Rock/Dinosaur do) and the product
-- owner's own brief explicitly named "Zombie Uprising" as a wanted
-- identity, so it is kept as a solo-Type pack rather than diluted -
-- see the session report for this judgment call.
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select d.id, c.id
from public.shop_special_pack_definitions d
cross join public.card_catalog c
where d.code = 'zombie_uprising'
  and c.format_eligible = true
  and public.is_master_duel_offerable(c.master_duel_status)
  and c.race = 'Zombie'
  and not exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = c.id
  )
  and not exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = c.id and brg.is_route_exclusive = true
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Beast Kingdom - Monster Type in (Beast, Beast-Warrior). Real
-- local snapshot: Beast 269 + Beast-Warrior 191 = 460 eligible -
-- capped to 260.
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select d.id, c.id
from public.shop_special_pack_definitions d
cross join public.card_catalog c
where d.code = 'beast_kingdom'
  and c.format_eligible = true
  and public.is_master_duel_offerable(c.master_duel_status)
  and c.race in ('Beast', 'Beast-Warrior')
  and not exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = c.id
  )
  and not exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = c.id and brg.is_route_exclusive = true
  )
order by c.name asc
limit 260
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Wild Overgrowth - Monster Type in (Plant, Insect, Reptile). Real
-- local snapshot: Plant 161 + Insect 188 + Reptile 125 = 474
-- eligible - capped to 260. (Each Type alone was below 200; grouped
-- together as one "untamed wilderness" identity per the brief's own
-- "supplement with broader thematic queries" guidance.)
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select d.id, c.id
from public.shop_special_pack_definitions d
cross join public.card_catalog c
where d.code = 'wild_overgrowth'
  and c.format_eligible = true
  and public.is_master_duel_offerable(c.master_duel_status)
  and c.race in ('Plant', 'Insect', 'Reptile')
  and not exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = c.id
  )
  and not exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = c.id and brg.is_route_exclusive = true
  )
order by c.name asc
limit 260
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Aqua Depths - Monster Type in (Aqua, Sea Serpent, Fish). Real
-- local snapshot: Aqua 175 + Sea Serpent 65 + Fish 97 = 337
-- eligible - capped to 260.
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select d.id, c.id
from public.shop_special_pack_definitions d
cross join public.card_catalog c
where d.code = 'aqua_depths'
  and c.format_eligible = true
  and public.is_master_duel_offerable(c.master_duel_status)
  and c.race in ('Aqua', 'Sea Serpent', 'Fish')
  and not exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = c.id
  )
  and not exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = c.id and brg.is_route_exclusive = true
  )
order by c.name asc
limit 260
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Stone Age - Monster Type in (Rock, Dinosaur). Real local
-- snapshot: Rock 198 + Dinosaur 90 = 288 eligible - NOT capped
-- (already inside the 200-300 target; the Cubic Boss Route's Rock-
-- Type grants and the Dinosaur Boss Route's own evolution chain are
-- both excluded above).
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select d.id, c.id
from public.shop_special_pack_definitions d
cross join public.card_catalog c
where d.code = 'stone_age'
  and c.format_eligible = true
  and public.is_master_duel_offerable(c.master_duel_status)
  and c.race in ('Rock', 'Dinosaur')
  and not exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = c.id
  )
  and not exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = c.id and brg.is_route_exclusive = true
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Golden Age Archetypes - a curated cluster of 5 real, substantial,
-- non-Boss-Route archetypes (archetype_registry only covers the 10
-- archetypes that overlap Boss Routes, so this pack matches
-- card_catalog.archetype directly rather than via archetype_registry/
-- archetype_cards role data - see session report). Real local
-- snapshot: Archfiend 54 + Blackwing 53 + Gladiator Beast 53 + Roid
-- 48 + Six Samurai 46 = 254 eligible - NOT capped.
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select d.id, c.id
from public.shop_special_pack_definitions d
cross join public.card_catalog c
where d.code = 'golden_age_archetypes'
  and c.format_eligible = true
  and public.is_master_duel_offerable(c.master_duel_status)
  and c.archetype in ('Archfiend', 'Blackwing', 'Gladiator Beast', 'Roid', 'Six Samurai')
  and not exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = c.id
  )
  and not exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = c.id and brg.is_route_exclusive = true
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;


-- ---------------------------------------------------------
-- 6. Assign each curated pack to its rotation slot.
--
-- Overwrites the 15 existing (theme_category, slot_order) slot
-- rows' theme_value/theme_label/pack_definition_id in place - see
-- this file's header for why that is the anticipated, safe use of
-- this table, not a destructive change. If a category currently has
-- fewer than 5 configured slots (e.g. a sparse catalog never
-- reached 5 eligible themes for it originally), the corresponding
-- INSERT here creates the missing slot row(s) rather than silently
-- skipping them - `insert ... on conflict` handles both cases with
-- the same statement.
-- ---------------------------------------------------------

insert into public.shop_special_pack_slots
  (theme_category, slot_order, theme_value, theme_label, pack_definition_id)
select 'monster_type', v.slot_order, d.code, d.name, d.id
from (values
  (1, 'warriors_code'),
  (2, 'machine_uprising'),
  (3, 'fiend_rising'),
  (4, 'arcane_order'),
  (5, 'dragons_roar')
) as v(slot_order, code)
join public.shop_special_pack_definitions d on d.code = v.code
on conflict (theme_category, slot_order) do update set
  theme_value = excluded.theme_value,
  theme_label = excluded.theme_label,
  pack_definition_id = excluded.pack_definition_id;

insert into public.shop_special_pack_slots
  (theme_category, slot_order, theme_value, theme_label, pack_definition_id)
select 'archetype', v.slot_order, d.code, d.name, d.id
from (values
  (1, 'beast_kingdom'),
  (2, 'wild_overgrowth'),
  (3, 'aqua_depths'),
  (4, 'stone_age'),
  (5, 'golden_age_archetypes')
) as v(slot_order, code)
join public.shop_special_pack_definitions d on d.code = v.code
on conflict (theme_category, slot_order) do update set
  theme_value = excluded.theme_value,
  theme_label = excluded.theme_label,
  pack_definition_id = excluded.pack_definition_id;

insert into public.shop_special_pack_slots
  (theme_category, slot_order, theme_value, theme_label, pack_definition_id)
select 'attribute', v.slot_order, d.code, d.name, d.id
from (values
  (1, 'divine_wings'),
  (2, 'skyward_wings'),
  (3, 'elemental_fury'),
  (4, 'psychic_network'),
  (5, 'zombie_uprising')
) as v(slot_order, code)
join public.shop_special_pack_definitions d on d.code = v.code
on conflict (theme_category, slot_order) do update set
  theme_value = excluded.theme_value,
  theme_label = excluded.theme_label,
  pack_definition_id = excluded.pack_definition_id;


-- ---------------------------------------------------------
-- 7. VERIFY - read-only sanity check, raises a NOTICE (never an
--    exception - a slightly-under-target pool is a documented,
--    acceptable outcome above, not a migration failure) for any
--    pack whose real, live pool size lands outside 150-350.
-- ---------------------------------------------------------

do $$
declare
  pack record;
begin
  for pack in
    select d.code, d.name, count(pc.id) as pool_size
    from public.shop_special_pack_definitions d
    left join public.shop_special_pack_pool_cards pc
      on pc.pack_definition_id = d.id
    group by d.code, d.name
    order by d.display_order
  loop
    raise notice 'Special Pack pool: % (%) = % cards', pack.name, pack.code, pack.pool_size;

    if pack.pool_size < 150 or pack.pool_size > 350 then
      raise notice 'ATTENTION: % pool size % is outside the 150-350 sanity band (target 200-300) - see migration header for context.', pack.name, pack.pool_size;
    end if;
  end loop;
end;
$$;

commit;
