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
-- SAFETY - WHY THIS IS ONE UPDATE STATEMENT
-- boss_route_stages has a UNIQUE (route_id, evolution_card_catalog_id)
-- constraint. Several of these 16 routes reassign a card that is
-- CURRENTLY sitting at a different stage of the SAME route to a new
-- stage number (e.g. jinzo: the card currently at stage 2 ("Jinzo")
-- moves to stage 3; legendary_fisherman rotates three cards down one
-- stage each). Running these as separate UPDATE statements (or as
-- per-route statements that only partially overlap) risks a
-- transient uniqueness violation on the value that has not yet
-- moved. Postgres resolves this safely for a UNIQUE btree constraint
-- when every row that could conflict is updated by the SAME UPDATE
-- command - the conflict check does not see the old value of a row
-- also being changed by that command. This migration therefore
-- performs all 53 changed (route, stage) cells across all 16 routes
-- in exactly one UPDATE statement, sourced from one VALUES list, so
-- every rotation/swap is safe regardless of row order.
--
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
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from target_values tv
join public.boss_routes r on r.code = tv.route_code
join public.card_catalog c on c.name = tv.card_name
where brs.route_id = r.id
  and brs.stage_number = tv.stage_number;

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
