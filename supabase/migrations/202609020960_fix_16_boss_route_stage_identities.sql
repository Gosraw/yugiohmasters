begin;

-- =========================================================
-- FIX-FORWARD: 16 BOSS ROUTE STAGE IDENTITY CORRECTIONS
--
-- WHY
-- The Season 1 audit correction pass (2026-09-02) found that
-- 202609011900_seed_boss_routes.sql's stage identities do not match
-- the authoritative "FINAL 20 BOSS STAGE IDENTITIES" design for 16
-- of the 20 routes. That seed migration is already deployed, so per
-- the fix-forward rule this migration corrects the data with new
-- UPDATE statements rather than editing the deployed seed file.
--
-- Dark Magician (dark_magician) is NOT included here - it was
-- already corrected by 202609020910_fix_dark_magician_and_cubic_route_data.sql
-- earlier in this same correction pass.
--
-- Cubic (cubic) is NOT included here - its evolution chain (Dark
-- Garnex -> Duza -> Buster Gundil -> Crimson Nova the Dark Cubic
-- Lord) is already identical to the final spec. Its unresolved
-- Stage 4 support card ("Crimson Nova Boss EX") does not exist in
-- the card catalog under that name and is intentionally left
-- unresolved per instruction - see the migration 202609020910 header
-- and the Season 1 correction report.
--
-- Dinosaur (dinosaur) is explicitly NOT touched. The final spec
-- flags Stage 4 as "verify the final approved Stage 4 against
-- project history before changing. Do NOT guess if source
-- conflicts" - this migration makes no changes to the dinosaur
-- route and the ambiguity is reported separately, unresolved.
--
-- Harpie (harpie) is explicitly NOT touched, in whole. Stages 1-3
-- of its final chain (Harpie Lady -> Harpie Channeler -> Harpie's
-- Pet Phantasmal Dragon) resolve to real card_catalog rows, but its
-- Stage 4 card, "Harpie's Pet Dragon - Fearsome Fire Blast", does
-- NOT exist in the catalog under that exact name (only the plain
-- "Harpie's Pet Dragon" exists, which is a different, non-equivalent
-- card and must not be silently substituted). Per the explicit rule
-- "For any final evolution card whose exact card_catalog row does
-- not exist: STOP for that individual route and report it. Do not
-- substitute a different card" - this STOPS the entire Harpie route,
-- not just its Stage 4, so Stages 1-3 are also left unchanged here
-- pending the user's decision. Reported separately, unresolved.
--
-- SAFETY - FIX-FORWARD 2026-09-02 (POST-DEPLOY-FAILURE CORRECTION)
-- boss_route_stages has a UNIQUE (route_id, evolution_card_catalog_id)
-- constraint, scoped per route. The original version of this
-- migration performed all 53 changed (route, stage) cells in a
-- SINGLE UPDATE statement sourced from one VALUES list, on the
-- theory that Postgres resolves a same-statement rotation/swap
-- safely regardless of row order. That theory does not hold in
-- general: a single UPDATE ... FROM (VALUES ...) join gives Postgres
-- no guarantee over which underlying row it processes first, and a
-- live deploy attempt failed with "ERROR 23505: duplicate key value
-- violates unique constraint
-- boss_route_stages_route_id_evolution_card_catalog_id_key" on the
-- elemental_hero route: the statement tried to assign "Elemental
-- HERO The Shining" to Stage 3 while Stage 4 still held it (Stage 4
-- had not yet been processed to move it to "Elemental HERO Absolute
-- Zero").
--
-- Root cause, confirmed: 12 of the 16 routes touched by this
-- migration reassign a card that is CURRENTLY sitting at a different
-- stage of the SAME route - chaos_bls, elemental_hero, cyber_dragon,
-- jinzo, crystal_beast, red_eyes, legendary_fisherman, machina,
-- toon, ancient_gear, galaxy_photon, and destiny_hero. In every one
-- of those 12 routes the dependency (which stage currently holds a
-- card another stage now wants) forms a simple acyclic chain, not a
-- true cycle, so no temporary placeholder value is required.
-- evolution_card_catalog_id is `uuid not null`
-- (202609011600_boss_route_schema.sql:107), which also rules out a
-- NULL-placeholder strategy for this fix.
--
-- FIX: replace the single multi-row UPDATE with 53 separate,
-- single-row UPDATE statements - one per (route, stage) cell -
-- issued in an explicit, topologically-sorted order per route, so
-- that whenever stage B currently holds the card stage A's target
-- wants, stage B's own UPDATE statement runs (and its effect is
-- fully committed within this transaction) before stage A's UPDATE
-- statement runs. Because each statement now touches exactly one
-- row, there is no intra-statement row-processing order left to
-- depend on: Postgres's immediate uniqueness check for each
-- statement only ever sees the fully-applied result of every earlier
-- statement in this transaction, never a partially-applied one. The
-- 4 routes with no such dependency (armed_dragon_ojama, blue_eyes,
-- vampire, zombie) are written in the same one-statement-per-cell
-- form for consistency; their relative order does not matter.
--
-- Preserved unchanged by this correction: player_boss_paths,
-- current_stage, and existing player inventories/rewards are never
-- touched by this migration (it only ever updates
-- boss_route_stages.evolution_card_catalog_id, the stage's own
-- evolution-monster identity - never a player-facing table), and no
-- stage grants are replayed. The post-migration structural assertion
-- below is unchanged - it re-verifies all 53 cells against the same
-- final spec after every statement above has run, and still confirms
-- dinosaur/harpie were left untouched.
-- WHAT CHANGES (route: stage -> new evolution card)
--   chaos_bls            (Chaos / Black Luster Soldier): stage 1 -> D.D. Warrior, stage 2 -> D.D. Warrior Lady, stage 4 -> Black Luster Soldier - Envoy of the Beginning
--   elemental_hero       (Elemental HERO): stage 1 -> Elemental HERO Bubbleman, stage 2 -> Elemental HERO Blazeman, stage 3 -> Elemental HERO The Shining, stage 4 -> Elemental HERO Absolute Zero
--   blue_eyes            (Blue-Eyes): stage 1 -> Kaibaman, stage 3 -> Blue-Eyes Alternative White Dragon, stage 4 -> Blue-Eyes Jet Dragon
--   cyber_dragon         (Cyber Dragon): stage 1 -> Proto-Cyber Dragon, stage 2 -> Cyber Dragon, stage 3 -> Cyber Dragon Nova, stage 4 -> Cyber Dragon Infinity
--   jinzo                (Jinzo): stage 1 -> Jinzo - Returner, stage 2 -> Jinzo - Jector, stage 3 -> Jinzo, stage 4 -> Jinzo the Machine Menace
--   armed_dragon_ojama   (Chazz / Armed Dragon / Ojama): stage 4 -> Armed Dragon Thunder LV10
--   crystal_beast        (Crystal Beast): stage 3 -> Rainbow Dragon, stage 4 -> Rainbow Overdragon
--   red_eyes             (Red-Eyes): stage 1 -> Black Metal Dragon, stage 2 -> Red-Eyes Black Dragon, stage 3 -> Red-Eyes Flare Metal Dragon, stage 4 -> Meteor Black Comet Dragon
--   zombie               (Zombie): stage 3 -> Red-Eyes Zombie Dragon, stage 4 -> Doomking Balerdroch
--   legendary_fisherman  (Legendary Fisherman): stage 1 -> Warrior of Atlantis, stage 2 -> The Legendary Fisherman, stage 3 -> The Legendary Fisherman II, stage 4 -> The Legendary Fisherman III
--   machina              (Machina): stage 1 -> Machina Gearframe, stage 2 -> Machina Fortress, stage 3 -> Machina Citadel, stage 4 -> Machina Ruinforce
--   toon                 (Toon): stage 1 -> Toon Mermaid, stage 2 -> Toon Dark Magician Girl, stage 3 -> Toon Dark Magician, stage 4 -> Toon Black Luster Soldier
--   ancient_gear         (Ancient Gear): stage 1 -> Ancient Gear Hunting Hound, stage 2 -> Ancient Gear Golem, stage 3 -> Ultimate Ancient Gear Golem, stage 4 -> Chaos Ancient Gear Giant
--   galaxy_photon        (Galaxy / Photon): stage 3 -> Number 62: Galaxy-Eyes Prime Photon Dragon, stage 4 -> Number C62: Neo Galaxy-Eyes Prime Photon Dragon
--   destiny_hero         (Destiny HERO): stage 1 -> Destiny HERO - Diamond Dude, stage 2 -> Destiny HERO - Plasma, stage 3 -> Destiny HERO - Dystopia, stage 4 -> Destiny HERO - Destroyer Phoenix Enforcer
--   vampire              (Vampire): stage 1 -> Vampire Familiar, stage 2 -> Shadow Vampire, stage 3 -> Dhampir Vampire Sheridan, stage 4 -> The Zombie Vampire
--
-- dp_cost_to_reach is intentionally left untouched for every row -
-- the final spec does not redefine DP costs, only stage identities.
-- =========================================================
-- ---- chaos_bls (Chaos / Black Luster Soldier): order matters - see root-cause note above ----
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'chaos_bls'
  and brs.stage_number = 1
  and c.name = 'D.D. Warrior';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'chaos_bls'
  and brs.stage_number = 2
  and c.name = 'D.D. Warrior Lady';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'chaos_bls'
  and brs.stage_number = 4
  and c.name = 'Black Luster Soldier - Envoy of the Beginning';

-- ---- elemental_hero (Elemental HERO): order matters - see root-cause note above ----
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'elemental_hero'
  and brs.stage_number = 1
  and c.name = 'Elemental HERO Bubbleman';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'elemental_hero'
  and brs.stage_number = 2
  and c.name = 'Elemental HERO Blazeman';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'elemental_hero'
  and brs.stage_number = 4
  and c.name = 'Elemental HERO Absolute Zero';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'elemental_hero'
  and brs.stage_number = 3
  and c.name = 'Elemental HERO The Shining';

-- ---- blue_eyes (Blue-Eyes): no intra-route dependency - order does not matter ----
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'blue_eyes'
  and brs.stage_number = 1
  and c.name = 'Kaibaman';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'blue_eyes'
  and brs.stage_number = 3
  and c.name = 'Blue-Eyes Alternative White Dragon';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'blue_eyes'
  and brs.stage_number = 4
  and c.name = 'Blue-Eyes Jet Dragon';

-- ---- cyber_dragon (Cyber Dragon): order matters - see root-cause note above ----
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'cyber_dragon'
  and brs.stage_number = 1
  and c.name = 'Proto-Cyber Dragon';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'cyber_dragon'
  and brs.stage_number = 3
  and c.name = 'Cyber Dragon Nova';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'cyber_dragon'
  and brs.stage_number = 4
  and c.name = 'Cyber Dragon Infinity';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'cyber_dragon'
  and brs.stage_number = 2
  and c.name = 'Cyber Dragon';

-- ---- jinzo (Jinzo): order matters - see root-cause note above ----
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'jinzo'
  and brs.stage_number = 2
  and c.name = 'Jinzo - Jector';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'jinzo'
  and brs.stage_number = 4
  and c.name = 'Jinzo the Machine Menace';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'jinzo'
  and brs.stage_number = 1
  and c.name = 'Jinzo - Returner';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'jinzo'
  and brs.stage_number = 3
  and c.name = 'Jinzo';

-- ---- armed_dragon_ojama (Chazz / Armed Dragon / Ojama): no intra-route dependency - order does not matter ----
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'armed_dragon_ojama'
  and brs.stage_number = 4
  and c.name = 'Armed Dragon Thunder LV10';

-- ---- crystal_beast (Crystal Beast): order matters - see root-cause note above ----
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'crystal_beast'
  and brs.stage_number = 4
  and c.name = 'Rainbow Overdragon';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'crystal_beast'
  and brs.stage_number = 3
  and c.name = 'Rainbow Dragon';

-- ---- red_eyes (Red-Eyes): order matters - see root-cause note above ----
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'red_eyes'
  and brs.stage_number = 1
  and c.name = 'Black Metal Dragon';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'red_eyes'
  and brs.stage_number = 3
  and c.name = 'Red-Eyes Flare Metal Dragon';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'red_eyes'
  and brs.stage_number = 4
  and c.name = 'Meteor Black Comet Dragon';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'red_eyes'
  and brs.stage_number = 2
  and c.name = 'Red-Eyes Black Dragon';

-- ---- zombie (Zombie): no intra-route dependency - order does not matter ----
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'zombie'
  and brs.stage_number = 3
  and c.name = 'Red-Eyes Zombie Dragon';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'zombie'
  and brs.stage_number = 4
  and c.name = 'Doomking Balerdroch';

-- ---- legendary_fisherman (Legendary Fisherman): order matters - see root-cause note above ----
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'legendary_fisherman'
  and brs.stage_number = 1
  and c.name = 'Warrior of Atlantis';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'legendary_fisherman'
  and brs.stage_number = 2
  and c.name = 'The Legendary Fisherman';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'legendary_fisherman'
  and brs.stage_number = 3
  and c.name = 'The Legendary Fisherman II';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'legendary_fisherman'
  and brs.stage_number = 4
  and c.name = 'The Legendary Fisherman III';

-- ---- machina (Machina): order matters - see root-cause note above ----
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'machina'
  and brs.stage_number = 1
  and c.name = 'Machina Gearframe';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'machina'
  and brs.stage_number = 3
  and c.name = 'Machina Citadel';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'machina'
  and brs.stage_number = 4
  and c.name = 'Machina Ruinforce';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'machina'
  and brs.stage_number = 2
  and c.name = 'Machina Fortress';

-- ---- toon (Toon): order matters - see root-cause note above ----
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'toon'
  and brs.stage_number = 3
  and c.name = 'Toon Dark Magician';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'toon'
  and brs.stage_number = 4
  and c.name = 'Toon Black Luster Soldier';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'toon'
  and brs.stage_number = 2
  and c.name = 'Toon Dark Magician Girl';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'toon'
  and brs.stage_number = 1
  and c.name = 'Toon Mermaid';

-- ---- ancient_gear (Ancient Gear): order matters - see root-cause note above ----
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'ancient_gear'
  and brs.stage_number = 1
  and c.name = 'Ancient Gear Hunting Hound';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'ancient_gear'
  and brs.stage_number = 3
  and c.name = 'Ultimate Ancient Gear Golem';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'ancient_gear'
  and brs.stage_number = 4
  and c.name = 'Chaos Ancient Gear Giant';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'ancient_gear'
  and brs.stage_number = 2
  and c.name = 'Ancient Gear Golem';

-- ---- galaxy_photon (Galaxy / Photon): order matters - see root-cause note above ----
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'galaxy_photon'
  and brs.stage_number = 4
  and c.name = 'Number C62: Neo Galaxy-Eyes Prime Photon Dragon';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'galaxy_photon'
  and brs.stage_number = 3
  and c.name = 'Number 62: Galaxy-Eyes Prime Photon Dragon';

-- ---- destiny_hero (Destiny HERO): order matters - see root-cause note above ----
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'destiny_hero'
  and brs.stage_number = 4
  and c.name = 'Destiny HERO - Destroyer Phoenix Enforcer';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'destiny_hero'
  and brs.stage_number = 3
  and c.name = 'Destiny HERO - Dystopia';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'destiny_hero'
  and brs.stage_number = 2
  and c.name = 'Destiny HERO - Plasma';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'destiny_hero'
  and brs.stage_number = 1
  and c.name = 'Destiny HERO - Diamond Dude';

-- ---- vampire (Vampire): no intra-route dependency - order does not matter ----
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'vampire'
  and brs.stage_number = 1
  and c.name = 'Vampire Familiar';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'vampire'
  and brs.stage_number = 2
  and c.name = 'Shadow Vampire';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'vampire'
  and brs.stage_number = 3
  and c.name = 'Dhampir Vampire Sheridan';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'vampire'
  and brs.stage_number = 4
  and c.name = 'The Zombie Vampire';

-- =========================================================
-- POST-MIGRATION STRUCTURAL ASSERTION
-- =========================================================

do $verify$
declare
  v_expected int;
  v_actual int;
  v_mismatch record;
begin

  with target_values (route_code, stage_number, card_name) as (
    values
    ('chaos_bls', 1, 'D.D. Warrior'),
    ('chaos_bls', 2, 'D.D. Warrior Lady'),
    ('chaos_bls', 4, 'Black Luster Soldier - Envoy of the Beginning'),
    ('elemental_hero', 1, 'Elemental HERO Bubbleman'),
    ('elemental_hero', 2, 'Elemental HERO Blazeman'),
    ('elemental_hero', 3, 'Elemental HERO The Shining'),
    ('elemental_hero', 4, 'Elemental HERO Absolute Zero'),
    ('blue_eyes', 1, 'Kaibaman'),
    ('blue_eyes', 3, 'Blue-Eyes Alternative White Dragon'),
    ('blue_eyes', 4, 'Blue-Eyes Jet Dragon'),
    ('cyber_dragon', 1, 'Proto-Cyber Dragon'),
    ('cyber_dragon', 2, 'Cyber Dragon'),
    ('cyber_dragon', 3, 'Cyber Dragon Nova'),
    ('cyber_dragon', 4, 'Cyber Dragon Infinity'),
    ('jinzo', 1, 'Jinzo - Returner'),
    ('jinzo', 2, 'Jinzo - Jector'),
    ('jinzo', 3, 'Jinzo'),
    ('jinzo', 4, 'Jinzo the Machine Menace'),
    ('armed_dragon_ojama', 4, 'Armed Dragon Thunder LV10'),
    ('crystal_beast', 3, 'Rainbow Dragon'),
    ('crystal_beast', 4, 'Rainbow Overdragon'),
    ('red_eyes', 1, 'Black Metal Dragon'),
    ('red_eyes', 2, 'Red-Eyes Black Dragon'),
    ('red_eyes', 3, 'Red-Eyes Flare Metal Dragon'),
    ('red_eyes', 4, 'Meteor Black Comet Dragon'),
    ('zombie', 3, 'Red-Eyes Zombie Dragon'),
    ('zombie', 4, 'Doomking Balerdroch'),
    ('legendary_fisherman', 1, 'Warrior of Atlantis'),
    ('legendary_fisherman', 2, 'The Legendary Fisherman'),
    ('legendary_fisherman', 3, 'The Legendary Fisherman II'),
    ('legendary_fisherman', 4, 'The Legendary Fisherman III'),
    ('machina', 1, 'Machina Gearframe'),
    ('machina', 2, 'Machina Fortress'),
    ('machina', 3, 'Machina Citadel'),
    ('machina', 4, 'Machina Ruinforce'),
    ('toon', 1, 'Toon Mermaid'),
    ('toon', 2, 'Toon Dark Magician Girl'),
    ('toon', 3, 'Toon Dark Magician'),
    ('toon', 4, 'Toon Black Luster Soldier'),
    ('ancient_gear', 1, 'Ancient Gear Hunting Hound'),
    ('ancient_gear', 2, 'Ancient Gear Golem'),
    ('ancient_gear', 3, 'Ultimate Ancient Gear Golem'),
    ('ancient_gear', 4, 'Chaos Ancient Gear Giant'),
    ('galaxy_photon', 3, 'Number 62: Galaxy-Eyes Prime Photon Dragon'),
    ('galaxy_photon', 4, 'Number C62: Neo Galaxy-Eyes Prime Photon Dragon'),
    ('destiny_hero', 1, 'Destiny HERO - Diamond Dude'),
    ('destiny_hero', 2, 'Destiny HERO - Plasma'),
    ('destiny_hero', 3, 'Destiny HERO - Dystopia'),
    ('destiny_hero', 4, 'Destiny HERO - Destroyer Phoenix Enforcer'),
    ('vampire', 1, 'Vampire Familiar'),
    ('vampire', 2, 'Shadow Vampire'),
    ('vampire', 3, 'Dhampir Vampire Sheridan'),
    ('vampire', 4, 'The Zombie Vampire')
  )
  select count(*) into v_expected from target_values;

  if v_expected <> 53 then
    raise exception
      'BOSS ROUTE STAGE IDENTITY FIX ABORTED: expected 53 target rows, found %.', v_expected;
  end if;

  select count(*) into v_actual
  from (
    with target_values (route_code, stage_number, card_name) as (
      values
    ('chaos_bls', 1, 'D.D. Warrior'),
    ('chaos_bls', 2, 'D.D. Warrior Lady'),
    ('chaos_bls', 4, 'Black Luster Soldier - Envoy of the Beginning'),
    ('elemental_hero', 1, 'Elemental HERO Bubbleman'),
    ('elemental_hero', 2, 'Elemental HERO Blazeman'),
    ('elemental_hero', 3, 'Elemental HERO The Shining'),
    ('elemental_hero', 4, 'Elemental HERO Absolute Zero'),
    ('blue_eyes', 1, 'Kaibaman'),
    ('blue_eyes', 3, 'Blue-Eyes Alternative White Dragon'),
    ('blue_eyes', 4, 'Blue-Eyes Jet Dragon'),
    ('cyber_dragon', 1, 'Proto-Cyber Dragon'),
    ('cyber_dragon', 2, 'Cyber Dragon'),
    ('cyber_dragon', 3, 'Cyber Dragon Nova'),
    ('cyber_dragon', 4, 'Cyber Dragon Infinity'),
    ('jinzo', 1, 'Jinzo - Returner'),
    ('jinzo', 2, 'Jinzo - Jector'),
    ('jinzo', 3, 'Jinzo'),
    ('jinzo', 4, 'Jinzo the Machine Menace'),
    ('armed_dragon_ojama', 4, 'Armed Dragon Thunder LV10'),
    ('crystal_beast', 3, 'Rainbow Dragon'),
    ('crystal_beast', 4, 'Rainbow Overdragon'),
    ('red_eyes', 1, 'Black Metal Dragon'),
    ('red_eyes', 2, 'Red-Eyes Black Dragon'),
    ('red_eyes', 3, 'Red-Eyes Flare Metal Dragon'),
    ('red_eyes', 4, 'Meteor Black Comet Dragon'),
    ('zombie', 3, 'Red-Eyes Zombie Dragon'),
    ('zombie', 4, 'Doomking Balerdroch'),
    ('legendary_fisherman', 1, 'Warrior of Atlantis'),
    ('legendary_fisherman', 2, 'The Legendary Fisherman'),
    ('legendary_fisherman', 3, 'The Legendary Fisherman II'),
    ('legendary_fisherman', 4, 'The Legendary Fisherman III'),
    ('machina', 1, 'Machina Gearframe'),
    ('machina', 2, 'Machina Fortress'),
    ('machina', 3, 'Machina Citadel'),
    ('machina', 4, 'Machina Ruinforce'),
    ('toon', 1, 'Toon Mermaid'),
    ('toon', 2, 'Toon Dark Magician Girl'),
    ('toon', 3, 'Toon Dark Magician'),
    ('toon', 4, 'Toon Black Luster Soldier'),
    ('ancient_gear', 1, 'Ancient Gear Hunting Hound'),
    ('ancient_gear', 2, 'Ancient Gear Golem'),
    ('ancient_gear', 3, 'Ultimate Ancient Gear Golem'),
    ('ancient_gear', 4, 'Chaos Ancient Gear Giant'),
    ('galaxy_photon', 3, 'Number 62: Galaxy-Eyes Prime Photon Dragon'),
    ('galaxy_photon', 4, 'Number C62: Neo Galaxy-Eyes Prime Photon Dragon'),
    ('destiny_hero', 1, 'Destiny HERO - Diamond Dude'),
    ('destiny_hero', 2, 'Destiny HERO - Plasma'),
    ('destiny_hero', 3, 'Destiny HERO - Dystopia'),
    ('destiny_hero', 4, 'Destiny HERO - Destroyer Phoenix Enforcer'),
    ('vampire', 1, 'Vampire Familiar'),
    ('vampire', 2, 'Shadow Vampire'),
    ('vampire', 3, 'Dhampir Vampire Sheridan'),
    ('vampire', 4, 'The Zombie Vampire')
    )
    select 1
    from target_values tv
    join public.boss_routes r on r.code = tv.route_code
    join public.boss_route_stages brs
      on brs.route_id = r.id and brs.stage_number = tv.stage_number
    join public.card_catalog c on c.id = brs.evolution_card_catalog_id
    where c.name = tv.card_name
  ) matched;

  if v_actual <> v_expected then
    raise exception
      'BOSS ROUTE STAGE IDENTITY FIX ABORTED: % of % target (route, stage) cells do not match the final spec card after the update.', v_actual, v_expected;
  end if;

  -- Confirm Dinosaur and Harpie were left untouched (still pointing
  -- at their pre-existing seed cards, not silently altered).
  select r.code, brs.stage_number
    into v_mismatch
  from public.boss_routes r
  join public.boss_route_stages brs on brs.route_id = r.id
  join public.card_catalog c on c.id = brs.evolution_card_catalog_id
  where r.code = 'dinosaur'
    and brs.stage_number = 4
    and c.name <> 'Ultimate Conductor Tyranno';

  if found then
    raise exception
      'BOSS ROUTE STAGE IDENTITY FIX ABORTED: dinosaur stage 4 was unexpectedly modified.';
  end if;

  select r.code, brs.stage_number
    into v_mismatch
  from public.boss_routes r
  join public.boss_route_stages brs on brs.route_id = r.id
  join public.card_catalog c on c.id = brs.evolution_card_catalog_id
  where r.code = 'harpie'
    and (
      (brs.stage_number = 1 and c.name <> 'Harpie Lady') or
      (brs.stage_number = 2 and c.name <> 'Harpie Lady Sisters') or
      (brs.stage_number = 3 and c.name <> 'Harpie Queen') or
      (brs.stage_number = 4 and c.name <> 'Harpie''s Pet Dragon')
    );

  if found then
    raise exception
      'BOSS ROUTE STAGE IDENTITY FIX ABORTED: harpie route was unexpectedly modified.';
  end if;

  raise notice 'BOSS ROUTE STAGE IDENTITY FIX: 53 (route, stage) cells across 16 routes now match the final spec. dinosaur and harpie confirmed untouched.';
end $verify$;

commit;
