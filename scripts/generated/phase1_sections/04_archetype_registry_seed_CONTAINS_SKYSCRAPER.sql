-- =========================================================
-- PHASE 1 DEPLOYMENT - SECTION 04 of 08
--
-- *** THIS IS THE FILE THAT PRODUCED THE LIVE "relation Skyscraper
-- *** does not exist" ERROR WHEN PASTED AS PART OF THE FULL 300KB
-- *** COMBINED ROLLOUT. See phase1_sections/README.md for the full
-- *** incident note. This file's SQL has been independently verified
-- *** quote-safe by three separate methods (a custom tokenizer trace,
-- *** the project's automated check:sql quote-balance guard, and a
-- *** byte-for-byte diff against a freshly regenerated copy) and no
-- *** corruption could be found in the committed source - the leading
-- *** theory is that the SUPABASE SQL EDITOR'S PASTE/CLIPBOARD PATH
-- *** truncated or mis-handled the large combined paste, not that
-- *** this SQL is wrong. Pasting this ~200KB section on its own
-- *** (instead of inside the ~300KB combined file) is the mitigation.
--
-- 10 archetypes, 255 card relationships (Elemental HERO, Skyscraper-
-- support cards included). Depends on section 03's tables and on
-- card_catalog. Regenerated fresh from
-- scripts/generate-archetype-registry-migration.mjs immediately
-- before this split and reconfirmed BYTE-FOR-BYTE IDENTICAL to the
-- committed migration. Idempotent: safe to re-run (ON CONFLICT DO
-- NOTHING/DO UPDATE throughout).
-- SOURCE (unmodified): supabase/migrations/202608301400_seed_archetype_registry.sql
-- =========================================================

begin;

-- =========================================================
-- ARCHETYPE REGISTRY - SEED DATA
--
-- GENERATED FILE - do not hand-edit. Regenerate with:
--   node scripts/generate-archetype-registry-migration.mjs
-- from data/archetype-registry.mjs, the human-maintained source of
-- truth. See that file's own header for the role/tier/difficulty
-- definitions and the confidence discipline behind needsReview.
--
-- Upsert-safe: archetype_registry is keyed on `code`, archetype_cards
-- on (archetype_id, card_catalog_id) - re-running this file after
-- regenerating it from an updated data file is always safe.
-- =========================================================

-- ---- Dark Magician (dark_magician) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('dark_magician', 'Dark Magician', 'Duel Monsters'' most recognizable Spellcaster lineup: Yugi''s own Dark Magician and Dark Magician Girl, their Ritual/Fusion upgrades, and the Spell/Trap support that lets the deck find, protect, and rebuild around them.', 1, 'HIGH', 'MEDIUM', 'MEDIUM', 'LOW', 'HIGH', 'HIGH', 'MEDIUM', 'HEALTHY', 'FULL_DECK', '[{"category":"searcher","description":"No generic card adds ''Dark Magician'' by name to hand outside Sage''s Stone''s Level-2-Spellcaster condition (which itself needs a specific small monster on board) - a bad opening hand has no reliable way to find the deck''s own namesake."},{"category":"defensive_card","description":"No wall or protection Spell/Trap exists in the eligible pool; the deck has no answer to being out-tempo''d before its Fusion bosses come online."}]'::jsonb, 'Eternal Soul (2015-2018 whitelist, migration 202608301200) directly fixes part of the recovery/protection gap by reviving a destroyed Dark Magician - already reflected in the recovery=HIGH rating above.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Namesake Normal Monster; every build needs it.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Magician'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Iconic co-lead; gains ATK per Dark Magician/Magician-named card in GY.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Magician Girl'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', 'EARLY', false, 'Banishes itself from GY to return a Spell to hand; strong recursion engine, real downside cost.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Magician of Chaos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Accumulates Spell Counters toward Special Summoning a follow-up threat; a real Level-4 consistency body.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Skilled Dark Magician'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Special Summons Dark Magician from hand when you control a Level 2 or lower Spellcaster - the deck''s best consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Sage''s Stone'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Destroys an opponent''s monster while you control Dark Magician - the archetype''s real removal answer.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Thousand Knives'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Pays 1000 LP to Special Summon Dark Magician from Deck, then can Special Summon a listed Fusion Monster without the Fusion procedure - directly enables the Fusion bosses below.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Magic Curtain'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Tributes a Dark Magician/Magician of Black Chaos to summon Dark Magician of Chaos banished-until-return; costly but real value.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dedication through Light and Darkness'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Special Summons a Spellcaster from GY at the cost of banishing a card from GY - real recovery piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Miracle Restoring'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Gains 300 ATK per Dark Magician-named card in GY; a scaling beater.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Magician Knight'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Ritual Summons Magician of Black Chaos, the deck''s Ritual Monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Black Magic Ritual'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Ritual Monster enabled by Black Magic Ritual; strong body with a hand-cost removal effect.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Magician of Black Chaos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Special Summons Buster Blader or Dark Paladin under conditions - exact wording not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Knight''s Title'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, 'EXPANSION', null, false, 'GX-movie Equip Spell boosting a Spellcaster''s ATK; situational.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'The Eye of Timaeus'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Destroys a Set Trap Card while you control Dark Magician - narrow, matchup-dependent removal.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Magic Attack'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'UTILITY', null, null, 'EXPANSION', null, false, 'Equip Spell granting ATK to a Spellcaster and drawing a card on destruction.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Magic Formula'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, 'EXPANSION', null, false, 'Negates an opponent''s flip effect whenever a Spell resolves - narrow disruption.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Eradicator Warlock'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, 'EXPANSION', null, true, 'GY-effect tied to reviving Magician of Black Chaos; combo-specific, exact text not fully re-verified.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Sage'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'RECOMMENDED', 'LATE', false, 'Fusion of 1 Spellcaster-Type + 1 Dragon-Type monster - generic-ish materials, real accessible boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Amulet Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'RECOMMENDED', 'SIGNATURE', false, 'Fusion of Dark Magician + Buster Blader - the classic named 2-card anime combo; the archetype''s signature capstone.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Paladin'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'RECOMMENDED', 'MID', false, 'Fusion of Dark Magician Girl + 1 Dragon-Type monster - the first realistically accessible Fusion boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Magician Girl the Dragon Knight'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', 'FUSION', 'HARD', null, null, true, 'Catalogued under Dark Magician but this pass could not confidently verify a real functional tie to Dark Magician synergy (its known materials involve Flame Swordsman); held for human review rather than asserted.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Flare Knight'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Magician Girl-archetype beater/support; the brief''s own model whitelist example (already included via the base format''s own override seed, migration 202608300900).'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Chocolate Magician Girl'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- ---- Elemental HERO (elemental_hero) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('elemental_hero', 'Elemental HERO', 'Jaden Yuki''s HERO lineup: five foundational Normal Monsters that combine into one of the deepest Fusion boss lineups of any archetype in this format, backed by best-in-class searchers (Stratos, E - Emergency Call, Bubbleman) and the Skyscraper Field Spell package.', 2, 'HIGH', 'HIGH', 'MEDIUM', 'LOW', 'MEDIUM', 'HIGH', 'FAST', 'STRONG', 'FULL_DECK', '[{"category":"removal","description":"No unconditional single-card removal Spell/Trap - R - Righteous Justice and Wrath of Neos both require a specific board setup, leaving the deck without a clean answer to an opposing floodgate before its own plan comes online."},{"category":"other","description":"A long tail of 2010-2011 Fusion Monsters (Absolute Zero, Electrum, The Shining, Divine Neos, Magma Neos, Nova Master, Wildedge, Necroid Shaman, Darkbright, Plasma Vice, Tempest, Neos Knight, Steam Healer) have exact Fusion-material text this pass could not independently verify with confidence - flagged needsReview rather than asserted, and held out of ESSENTIAL/RECOMMENDED until a human confirms the real card text."}]'::jsonb, 'overallHealth is set to STRONG rather than HEALTHY on purpose: this is genuinely the best-supported archetype in the current eligible pool (best consistency, deepest Fusion lineup, fastest starts) and the brief explicitly warns not to under-report that just to flatten the archetype list - the honest read is that this is where power-level attention should focus if the format needs rebalancing later, not that individual cards need nerfing now.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Foundational Normal Monster; Fusion material for Flame Wingman.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Avian'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Foundational Normal Monster; Fusion material for Flame Wingman.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Burstinatrix'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Foundational Normal Monster; Fusion material for Thunder Giant.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Sparkman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Foundational Normal Monster; Fusion material for Thunder Giant/Gaia line.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Clayman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Foundational Normal Monster; base of the entire Neos-Fusion sub-line.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'On-summon search for any HERO card or draw - the deck''s single best consistency card.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Stratos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Special Summonable from hand with no other cards on board, draws 2 alone - key opener/consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Bubbleman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Banishes itself to add a Fusion Monster, or fuels Fusion Summons as material fuel - strong Fusion enabler.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Prisma'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Gemini Monster; searches a HERO Spell/Trap once treated as Normal Summoned again.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Neos Alius'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Strong Main Deck beater dealing damage equal to the ATK difference in battle.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Bladedge'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Adds any Elemental HERO monster from GY or Deck to hand - one of the format''s most efficient archetype searchers.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'E - Emergency Call'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Banishes Elemental HERO materials from field/GY to Fusion Summon - the single card that makes the whole Fusion lineup function.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Miracle Fusion'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Iconic Field Spell boosting HERO ATK vs higher-ATK monsters in battle - archetype-defining.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Skyscraper'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Special Summons two HERO monsters from hand if you control none - real consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'HERO''s Bond'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'If this is your only card in hand, Special Summon a Level 4 or lower HERO from Deck - strong opener.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'A Hero Lives'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Upgrade tying into Skyscraper; real ongoing support.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Skyscraper 2 - Hero City'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Quick-Play Special Summon of a Fusion Monster from the Extra Deck by banishing its materials - instant-speed alternate Fusion access.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Hero Flash!!'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'EASY', 'ESSENTIAL', 'EARLY', false, 'Fusion of Avian + Burstinatrix - the deck''s most accessible boss, deals piercing-adjacent burn on battle destruction.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Flame Wingman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'EASY', 'ESSENTIAL', null, false, 'Fusion of Sparkman + Clayman - accessible boss with a destroy-and-remove-defense effect.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Thunder Giant'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'RECOMMENDED', 'MID', false, 'Fusion of 1 Elemental HERO + 1 Warrior-Type monster - generic-ish materials, real mid-game upgrade.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Gaia'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'RECOMMENDED', 'LATE', false, 'Special Summoned via Mask Change (2015-2018 whitelist) using any face-up HERO you control - real instant-speed upgrade path.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Masked HERO Goka'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'RECOMMENDED', null, false, 'Same Mask Change access pattern as Goka; a defensive/control-oriented Masked HERO option.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Masked HERO Vapor'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'RECOMMENDED', null, false, 'Same Mask Change access pattern as Goka; a LP-recovery-oriented Masked HERO option.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Masked HERO Dian'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'RECOMMENDED', 'SIGNATURE', false, 'Named upgrade of Flame Wingman - iconic anime capstone, picked as the archetype''s SIGNATURE boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Shining Flare Wingman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'RECOMMENDED', null, false, 'Requires a LIGHT and a DARK Elemental HERO as material - constrained-but-not-fully-named; a real signature-tier alternative capstone (see the human calibration brief''s own worked example).'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Chaos Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'VERY_HARD', 'EXPANSION', null, true, 'Big multi-material HERO Fusion; exact required materials not independently re-verified this pass with full confidence.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Phoenix Enforcer'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'EXPANSION', null, false, 'Upgrade requiring multiple Elemental HERO monsters as material - accessible in a HERO-heavy build.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Shining Phoenix Enforcer'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'RECOMMENDED', null, false, 'Fusion of Neos + Neo-Spacian Flare Scarab - real, well-supported Neos sub-line boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Flare Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of Neos + a Neo-Spacian partner - Neos sub-line boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Dark Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of Neos + a Neo-Spacian partner - Neos sub-line boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Storm Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of Neos + a Neo-Spacian partner - Neos sub-line boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Glow Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of Neos + a Neo-Spacian partner - Neos sub-line boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Aqua Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of Neos + a Neo-Spacian partner - Neos sub-line boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Grand Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'VERY_HARD', 'EXPANSION', null, false, 'Requires Neos plus multiple named Neo-Spacians - an intentionally hard-to-assemble capstone, the Neos-line equivalent of Rainbow Overdragon.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Rainbow Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'VERY_HARD', 'EXPANSION', null, true, 'Historically a narrow named 2-card lock; exact required names not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Absolute Zero'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of 1 Elemental HERO + 1 Warrior-Type monster - late-game upgrade in the same generic-material family as Gaia.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Great Tornado'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of 1 Elemental HERO + 1 Warrior-Type monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Terra Firma'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of 1 Elemental HERO + 1 EARTH monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Mudballman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of 1 Elemental HERO + 1 Warrior-Type monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Wild Wingman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of 1 Elemental HERO + 1 DARK monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Escuridao'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of 1 Elemental HERO + 1 FIRE monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Inferno'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of 1 Elemental HERO + 1 EARTH monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Rampart Blaster'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of 1 Elemental HERO + 1 WATER monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Mariner'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, true, 'Likely Neos + Warrior-Type material; not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Neos Knight'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, true, 'Exact material text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Darkbright'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, true, 'Exact material text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Plasma Vice'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, true, 'Exact material text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Tempest'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, true, 'Exact material text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Necroid Shaman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'VERY_HARD', 'EXPANSION', null, true, 'Believed to require several named Elemental HERO monsters; exact list not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO The Shining'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'EXPANSION', null, true, 'Exact material text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Nova Master'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'EXPANSION', null, true, 'Exact material text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Wildedge'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'VERY_HARD', 'EXPANSION', null, true, 'Believed to require several named Elemental HERO monsters as a capstone; exact list not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Electrum'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'EXPANSION', null, true, 'Exact material text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Magma Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'EXPANSION', null, true, 'Exact material text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Divine Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, true, 'Exact material text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Steam Healer'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Lets you treat monsters in GY as banished to pay Fusion/effect costs - real enabler for the Fusion-heavy plan.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Necroshade'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Real-world print is a Fusion Monster (Yubel + Neos), but this project''s catalog tags its card_type as an Effect Monster - treated here as Main Deck per the catalog''s own field; flagged for a human to confirm which card_type is authoritative before this is trusted as a BOSS/FUSION entry.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Neos Wiseman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Cannot be targeted by Trap Cards; generic beater.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Wildheart'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'Minor mill/utility effect.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Woodsman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'Situational battle-triggered removal.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Poison Rose'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'ATK boost tied to discarding; situational damage on battle destruction.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Heat'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'Low-power utility body.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Ice Edge'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'Minor variant effect.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Lady Heat'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Bubbleman-line variant; exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Neo Bubbleman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Later-era print; exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Captain Gold'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Ocean'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Flash'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'AVOID', null, null, null, null, true, 'Tagged ''HERO'' archetype in the catalog, but this pass found no real functional connection between its effect and Elemental HERO or Destiny HERO strategies - likely a data-tagging artifact; excluded from every package and flagged for a human to check the underlying archetype tag.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Phantom Magician'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Field Spell boosting Neo-Spacians/Neos-line monsters; enables the Neos sub-line.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Neo Space'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Quick-Play version of Neo Space.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Instant Neo Space'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Recovery Spell for the Neos-line.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Reverse of Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Contact Fusion enabler for Neos-line Fusion Monsters, skipping Polymerization - key enabler for the Neos sub-line.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Miracle Contact'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Returns banished HERO/Neo-Spacian materials to fuel another Fusion Summon - real recursion/extension piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Parallel World Fusion'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Special Summons a Level 4 or lower HERO from hand, ignoring its own summoning conditions - real consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Fake Hero'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Special Summons a Normal Monster from GY - fits the deck''s five Normal Monster originals as a recovery piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'O - Oversoul'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Destroys Spell/Traps while you control an ''R''-named HERO - situational removal.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'R - Righteous Justice'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Board-wipe effect tied to the Neos-line; powerful but requires setup.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Wrath of Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'UTILITY', null, null, 'EXPANSION', null, false, 'Equip Spell granting Bubbleman extra utility.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Bubble Blaster'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Bounces a monster - situational tempo/removal.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Bubble Shuffle'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Bubbleman-line support; exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Bubble Illusion'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Bounces a card and draws for a HERO-related cost - real value Trap.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Change of Hero - Reflector Ray'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Recyclable Spell/Trap-adjacent removal.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Cyclone Boomerang'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'Equip changing an opponent monster''s battle position.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Spark Blaster'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Situational protection; exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Hero Mask'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Negates an attack targeting your HERO monster - situational protection.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Hero Barrier'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Special Summons a Level 4 or lower HERO from Deck when your monster is destroyed by battle - real defensive recovery.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Hero Signal'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Hero Counterattack'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Hero Heart'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Hero Blast'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Hero Spirit'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Feather Shot'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Feather Wind'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Edge Hammer'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Kid Guard'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Fifth Hope'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Rose Bud'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Clay Charge'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Terra Firma Gravity'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Mirror Gate'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'Bounces your own HERO(s) for a reset/value line - situational.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Burst Return'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- ---- Blue-Eyes (blue_eyes) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('blue_eyes', 'Blue-Eyes', 'Seto Kaiba''s signature dragon line: Blue-Eyes White Dragon and its Ritual/Fusion upgrades, with a small but real set of hand-summon enablers.', 3, 'HIGH', 'MEDIUM', 'LOW', 'LOW', 'LOW', 'HIGH', 'MEDIUM', 'WEAK', 'ENGINE_PLUS_GENERIC', '[{"category":"consistency","description":"Has bosses (Blue-Eyes Ultimate Dragon, Dragon Master Knight) but insufficient consistency - only 3 real enablers (The White Stone of Legend, Kaibaman, Maiden with Eyes of Blue) exist to reliably find or summon Blue-Eyes White Dragon before the deck can reach for its Fusion bosses."},{"category":"xyz_access","description":"Zero Xyz Monsters and no Level 4 generic body exist in the eligible pool - the deck cannot use the Xyz half of this format''s Extra Deck at all."},{"category":"removal","description":"Burst Stream of Destruction is the only removal card, and it requires Blue-Eyes White Dragon already on the field to activate."}]'::jsonb, null)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Namesake Normal Monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Blue-Eyes White Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Adds Blue-Eyes White Dragon from Deck to hand on Normal Summon - the archetype''s iconic searcher.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'The White Stone of Legend'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Discards itself to Special Summon Blue-Eyes White Dragon from hand - strong consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Kaibaman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Searches/Special Summons Blue-Eyes monsters - key consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Maiden with Eyes of Blue'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Destroys all opponent''s monsters while you control Blue-Eyes White Dragon - the archetype''s removal answer.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Burst Stream of Destruction'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Ritual Monster support tied to Blue-Eyes; enables a small Ritual sub-package.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Paladin of White Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Strong Main Deck beater/effect body; flagged borderline Ultra/Secret in the human calibration pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Blue-Eyes Shining Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'High-risk/high-reward body tied to a field-spell-lock condition; situational.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Malefic Blue-Eyes White Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'VERY_HARD', 'RECOMMENDED', 'MID', false, 'Fusion of 3 named Blue-Eyes White Dragon - the archetype''s iconic capstone.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Blue-Eyes Ultimate Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'VERY_HARD', 'EXPANSION', 'SIGNATURE', true, 'Ultimate crossover capstone Fusion; exact required materials not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Dragon Master Knight'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- ---- Red-Eyes (red_eyes) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('red_eyes', 'Red-Eyes', 'Joey Wheeler''s Red-Eyes Black Dragon line - a Normal Monster core with real upgrade and recursion support, now reinforced by the 2015-2018 whitelist''s Fusion package.', 4, 'HIGH', 'MEDIUM', 'LOW', 'LOW', 'MEDIUM', 'MEDIUM', 'MEDIUM', 'HEALTHY', 'ENGINE_PLUS_GENERIC', '[{"category":"fusion_spell","description":"Has Fusion identity (Meteor Black Dragon, and now Red-Eyes Fusion / Red-Eyes Black Dragon Sword from the 2015-2018 whitelist) but lacks enough reliable Main Deck setup - no searcher finds Meteor Black Dragon specifically, and the deck still has no unconditional removal."},{"category":"removal","description":"Inferno Fire Blast is the only removal-adjacent card and requires Red-Eyes Black Dragon already on the field."}]'::jsonb, 'Red-Eyes Fusion, Red-Eyes Black Dragon Sword, and The Black Stone of Legend are sourced from the 2015-2018 legacy support whitelist (migration 202608301200_seed_2015_2018_legacy_support_whitelist.sql) - included here per the brief''s instruction to integrate that whitelist into the registry.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Namesake Normal Monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Black Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'On-summon searcher for Red-Eyes Black Dragon, the Red-Eyes counterpart to White Stone of Legend. From 2015-2018 whitelist.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'The Black Stone of Legend'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Searches Red-Eyes cards on summon - consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Wyvern'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Direct upgrade of Red-Eyes Black Dragon with added protection/effect.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Black Metal Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Further upgrade requiring Red-Eyes Black Metal Dragon; exact Special Summon condition not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Darkness Metal Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Gains ATK and has GY-recovery utility - real recovery piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Darkness Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Recursive body Special-Summonable under Zombie-support conditions.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Zombie Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Classic searcher/evolution piece with a randomness element (dice-roll based).'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Black Dragon''s Chick'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Deals damage equal to Red-Eyes Black Dragon''s ATK while it''s on the field - the archetype''s reach/removal-adjacent finisher.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Inferno Fire Blast'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'RECOMMENDED', 'MID', false, 'Fusion of Red-Eyes Black Dragon + Meteor Dragon, both named - the archetype''s pre-whitelist Fusion boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Meteor Black Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Fusion Summons a named ''Red-Eyes'' Fusion Monster using materials from hand/field including 1 Dragon-Type monster - Fusion enabler. From 2015-2018 whitelist.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Fusion'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'EASY', 'RECOMMENDED', 'EARLY', false, '2-material Fusion (Red-Eyes B. Dragon line + a Warrior-Type monster) that becomes a recoverable Equip Spell after leaving the field. From 2015-2018 whitelist.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Black Dragon Sword'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- ---- Cyber Dragon (cyber_dragon) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('cyber_dragon', 'Cyber Dragon', 'A Machine-Type engine built around free Special Summons when you control no monsters and your opponent controls at least one, feeding a compact Rank-4/5 Xyz lineup.', 5, 'HIGH', 'HIGH', 'LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'FAST', 'HEALTHY', 'ENGINE_PLUS_GENERIC', '[{"category":"removal","description":"No dedicated destruction/removal Spell or Trap outside Cyber Dragon Infinity''s own negation once it is already summoned - the deck has speed and Xyz access but no answer to a board it hasn''t already beaten."},{"category":"other","description":"Only 2 real Xyz Monsters exist for the archetype (Nova, Infinity) - healthy for a Rank-4-centric engine, but the deck still needs generic Machine-Type filler to reach 40 cards, matching its ENGINE_PLUS_GENERIC classification rather than FULL_DECK."}]'::jsonb, null)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Namesake free-Special-Summon body when you control no monsters and the opponent controls one.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Smaller free-Special-Summon body and Xyz material enabler.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber Dragon Core'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Free-Special-Summon variant with an additional searcher/support effect.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber Dragon Zwei'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Free-Special-Summon variant reinforcing the archetype''s central swarm-for-Xyz gameplan.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber Dragon Drei'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Earlier, weaker free-Special-Summon variant.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Proto-Cyber Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Real searcher for Cyber Dragon cards - key consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber Network'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Recovers/searches Cyber monsters.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber Repair Plant'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Special Summons a Cyber monster and negates an attack - real defensive piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Attack Reflector Unit'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Union Monster equipping to a Machine-Type for a stat boost/protection.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Armored Cybern'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Special Summon/tutor effect for a Cyber Dragon variant under specific conditions; exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Evolution Burst'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Special Summons a Machine-Type from hand under an LP-cost condition.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Photon Generator Unit'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cybernetic Hidden Technology'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'XYZ', 'EASY', 'RECOMMENDED', 'EARLY', false, 'Rank 4/5 Xyz built from the archetype''s own generic-Level bodies - the archetype''s accessible early Xyz boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber Dragon Nova'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'XYZ', 'MODERATE', 'RECOMMENDED', 'SIGNATURE', false, 'Higher Rank Xyz with negation - the archetype''s signature boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber Dragon Infinity'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- ---- Ancient Gear (ancient_gear) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('ancient_gear', 'Ancient Gear', 'A slow, heavy-hitting Machine-Type archetype built around Ancient Gear Golem and Geartown, reinforced by a strong 2015-2018 Fusion package.', 6, 'HIGH', 'MEDIUM', 'MEDIUM', 'LOW', 'LOW', 'HIGH', 'SLOW', 'HEALTHY', 'FULL_DECK', '[{"category":"xyz_access","description":"Zero Xyz Monsters in the eligible pool - Ancient Gear''s entire Extra Deck presence is its Fusion line; the archetype cannot use the Xyz half of this format at all."},{"category":"recovery","description":"No dedicated recursion or graveyard-recovery Spell/Trap - once the deck''s few searchers and beaters are spent, it has no way to rebuild."}]'::jsonb, 'Chaos Ancient Gear Giant, Ancient Gear Fusion, and Ancient Gear Howitzer are sourced from the 2015-2018 legacy support whitelist (migration 202608301200) - integrated here per the brief''s instruction.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', 'EARLY', false, 'Namesake beater; opponent cannot activate Spell/Trap Cards during your Battle Phase while it''s on the field.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Golem'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Adds an Ancient Gear card on summon - the deck''s key consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Engineer'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Real Main Deck beater/support body.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Soldier'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Strong beater with immunity-to-targeting and extra-attack-adjacent effect; rated Ultra Rare in the human calibration pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Beast'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Burn/removal-adjacent effect.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Cannon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Cannot be destroyed by battle - strong beater.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Gadjiltron Chimera'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Strong beater line, similar role to Gadjiltron Chimera.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Gadjiltron Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Gemini Monster; searcher-ish consistency once treated as Normal Summoned again.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Knight'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'Minor Flip/trigger utility effect.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Box'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Iconic Field Spell reducing summon costs and enabling recursion - archetype-defining.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Geartown'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Repeatable Special Summon engine card.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Factory'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Continuous Spell with searcher/floodgate-ish utility.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Castle'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Removal-oriented Spell - fills part of the removal gap.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Explosive'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Cost reduction for Tribute Summons.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Workshop'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'UTILITY', null, null, 'EXPANSION', null, false, 'Equip Spell granting piercing damage.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Tank'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Fist'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Drill'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Spell Gear'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'RECOMMENDED', 'SIGNATURE', true, 'The archetype''s premier Fusion boss; exact required materials not independently re-verified this pass with full confidence.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ultimate Ancient Gear Golem'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'RECOMMENDED', 'LATE', false, 'Fusion of Ancient Gear Golem + 1 DARK monster; opponent cannot respond to its attacks - archetype-defining. From 2015-2018 whitelist.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Chaos Ancient Gear Giant'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Dedicated Fusion Summon enabler for the archetype''s Machine-Type monsters. From 2015-2018 whitelist.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Fusion'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'RECOMMENDED', 'MID', false, 'Fusion of 2 Machine-Type monsters - a lower-power, more accessible Fusion option. From 2015-2018 whitelist.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Howitzer'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- ---- Crystal Beast (crystal_beast) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('crystal_beast', 'Crystal Beast', 'Rex Raptor''s rainbow-gem monsters, which move to the Spell/Trap Zone to power a distinctive resource-recursion engine and two capstone bosses.', 7, 'MEDIUM', 'HIGH', 'MEDIUM', 'LOW', 'MEDIUM', 'HIGH', 'MEDIUM', 'HEALTHY', 'FULL_DECK', '[{"category":"xyz_access","description":"Zero Xyz Monsters in the eligible pool, the same structural gap as Ancient Gear - the archetype''s entire Extra Deck presence is its two 7-material capstone bosses."},{"category":"level_4_body","description":"No Level 4 Crystal Beast monster exists at all - the six gem beasts run outside that band, leaving no clean Xyz material even where the format would otherwise allow it."}]'::jsonb, 'Advanced Crystal Beast has zero real eligible cards in the current catalog and is not otherwise represented in this registry entry - a genuine reported gap, not an omission.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', 'EARLY', false, 'Special Summons itself and sends Crystal Beasts to the Spell/Trap Zone - the archetype''s consistency lynchpin.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beast Ruby Carbuncle'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'One of the six core gem beasts; central to the archetype''s field-to-Spell/Trap-Zone gimmick.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beast Topaz Tiger'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'One of the six core gem beasts.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beast Sapphire Pegasus'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'One of the six core gem beasts.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beast Amethyst Cat'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'One of the six core gem beasts.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beast Amber Mammoth'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'One of the six core gem beasts.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beast Emerald Tortoise'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'One of the six core gem beasts.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beast Cobalt Eagle'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', null, null, 'RECOMMENDED', 'LATE', false, 'Special Summoned by returning all 7 Crystal Beasts to hand/field - the archetype''s premier boss. Main Deck per this catalog''s card_type, not Extra Deck.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Rainbow Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Identity Field Spell; returns Crystal Beasts from GY to the Spell/Trap Zone.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Ancient City - Rainbow Ruins'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Real searcher for Crystal Beast monsters.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beacon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Tutors/searches toward the engine.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Promise'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Returns a Crystal Beast to hand from GY - recovery piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Blessing'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Board-wipe tied to controlling several Crystal Beasts in the Spell/Trap Zone - fills the removal gap.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Abundance'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Destroys monsters based on Crystal Beasts in the Spell/Trap Zone - key removal piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Raigeki'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Sets up multiple Crystal Beasts into the Spell/Trap Zone in one shot, directly enabling Rainbow Dragon.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Rainbow Gravity'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Tree'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Believed to be a rarity-based burn effect; gimmicky, exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Rare Value'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Release'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Possible catalog mistag; exact connection to Crystal Beast not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Advanced Dark'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Counter Gem'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Pair'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Rainbow Path'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'VERY_HARD', 'RECOMMENDED', 'SIGNATURE', false, 'Requires all 7 named Crystal Beast monsters as material - an intentionally hard-to-assemble capstone reward. From 2015-2018 whitelist.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Rainbow Overdragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- ---- Destiny HERO (destiny_hero) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('destiny_hero', 'Destiny HERO', 'Aster Phoenix''s dark HERO counterpart line, built around discard-for-value (Destiny Draw) and graveyard recursion, capped by a single named Fusion boss.', 8, 'MEDIUM', 'MEDIUM', 'LOW', 'MEDIUM', 'MEDIUM', 'MEDIUM', 'MEDIUM', 'HEALTHY', 'FULL_DECK', '[{"category":"removal","description":"Only conditional interaction exists (Doom Lord''s flip-negate, Captain Tenacious''s GY-banish Trap-negate) - no unconditional destruction or removal card in the eligible pool."},{"category":"boss","description":"Extra Deck presence is a single Fusion Monster (Destiny End Dragoon) that depends on the 2015-2018 whitelisted D-Fusion - until that whitelist is activated, the archetype has no working Extra Deck boss."}]'::jsonb, 'D-Fusion is sourced from the 2015-2018 legacy support whitelist (migration 202608301200) - it is the only real way to Fusion Summon Destiny End Dragoon in this format. Wroughtweiler is catalogued under the broader ''HERO'' archetype tag in card_catalog, but its real function (recurs a Destiny HERO from GY, returns Destiny Draw from GY to hand) is exclusively Destiny HERO recursion, so it is listed here rather than under Elemental HERO.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', 'EARLY', false, 'Special Summons copies of itself from GY - the archetype''s core recursion/swarm engine.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Malicious'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Discards a Destiny HERO to draw 2 - the archetype''s signature card-advantage engine.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny Draw'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Reveals the top card of the Deck and can activate Normal Spells directly from it - a unique value engine.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Diamond Dude'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Draws 2 when discarded or sent to GY - real value with a discard-heavy shell.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Disk Commander'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', 'MID', false, 'Gains ATK per Destiny HERO in GY - a real scaling beater and natural mid-game boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Blade Master'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, true, 'Large beater historically important to the archetype; exact effect text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Dogma'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Banishes an opponent''s monster from GY to steal ATK - real value body.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Plasma'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Banishes itself from GY to negate a Trap - rare real interaction/removal for the archetype.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Captain Tenacious'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Flip effect negating a Special Summon - real interaction piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Doom Lord'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Special Summons a Destiny HERO Token, generating an extra body.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Double Dude'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Defensive wall body; partially addresses the defense gap.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Defender'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Flip/trigger effect for graveyard setup.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Fear Monger'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Mills for graveyard setup value.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Dread Servant'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'On-destruction replacement token; minor value.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Departed'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'Switches an opponent monster''s battle position.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Dunker'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact effect text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Dreadmaster'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact effect text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Dasher'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'RECOMMENDED', 'SIGNATURE', false, 'Fusion of a named Destiny HERO monster + a DARK Dragon-Type monster - requires D-Fusion (whitelisted, not yet active) to summon.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny End Dragoon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Field Spell tied to Destiny HERO; conditional ATK boost and recursion.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Dark City'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Floodgate Field Spell restricting Special Summons based on Destiny HERO count - real interaction/lock piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Clock Tower Prison'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Returns a Destiny-named card from GY to hand - recovery piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Over Destiny'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'D - Formation'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Cyclone Blade'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Adds a Destiny HERO from Deck to hand - the archetype''s searcher.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny Signal'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Protection Trap for Destiny HERO monsters; exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'D - Fortune'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'D - Spirit'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny Mirage'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'D - Shield'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'D - Time'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'D - Chain'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'D - Counter'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Special Summons itself from GY when a Destiny HERO is destroyed, then returns Destiny Draw from GY to hand - real recursion engine for the archetype.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Wroughtweiler'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- ---- Vampire (vampire) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('vampire', 'Vampire', 'A DARK Zombie-Type theme built around graveyard-recursive beaters and a single Rank 4 Xyz boss; smaller and more niche than the DM/GX-era archetypes above.', 9, 'LOW', 'MEDIUM', 'LOW', 'LOW', 'LOW', 'MEDIUM', 'MEDIUM', 'WEAK', 'ENGINE_PLUS_GENERIC', '[{"category":"other","description":"Roughly half the Main Deck monsters (Vampire''s Curse, Baby, Duke, Vamp, Lady, Grace, Hunter) have real names confirmed in the catalog, but this pass could not independently verify their exact oracle text with confidence - held at EXPANSION tier and flagged needsReview rather than asserted."},{"category":"searcher","description":"Only one on-summon searcher (Vampire Sorcerer) exists for a 15-card pool split across many individual effects, leaving consistency lower than the raw card count suggests."}]'::jsonb, null)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', 'EARLY', false, 'Classic recurring-from-GY beater, discarding a card as the cost - the archetype''s earliest identity piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Lord'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', 'MID', false, 'Strong Special-Summon-from-GY beater that destroys a monster on that Special Summon - fills the removal gap.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Genesis'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Searches Vampire cards on summon - the archetype''s key consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Sorcerer'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Mills to search a Vampire monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Shadow Vampire'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Flip/return-based recursive beater.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Hunter'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire''s Curse'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Baby'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Duke'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Vamp'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Lady'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Grace'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'XYZ', 'MODERATE', 'RECOMMENDED', 'SIGNATURE', false, 'Rank 4 Xyz boss, detaches material to inflict damage - the archetype''s signature Extra Deck piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Crimson Knight Vampire Bram'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Field Spell boosting Zombie/Vampire monsters and enabling effects.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Kingdom'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Searches/Special Summons under a condition.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Takeover'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- ---- Jinzo (jinzo) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('jinzo', 'Jinzo', 'A single powerful floodgate identity (negates all Trap Cards) rather than a full archetype - the brief''s own example of a legitimate THIN_THEME.', 10, 'MEDIUM', 'LOW', 'LOW', 'LOW', 'LOW', 'MEDIUM', 'FAST', 'HEALTHY', 'THIN_THEME', '[{"category":"other","description":"Only 4 real cards exist for this identity - by design a THIN_THEME package meant to be run inside a generic Machine/DARK shell rather than a standalone 40-card deck. It has no searcher, no Extra Deck presence, and no archetype-specific removal beyond Jinzo''s own passive Trap negation."}]'::jsonb, null)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', 'EARLY', false, 'Negates all Trap Cards on the field - the archetype''s entire reason to exist.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'jinzo' and c.name = 'Jinzo'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', 'MID', false, 'Real strong upgrade to the base Jinzo identity; rated Ultra Rare in the human calibration pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'jinzo' and c.name = 'Jinzo - Lord'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Recursion piece; Special Summons Jinzo from GY under a condition.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'jinzo' and c.name = 'Jinzo - Returner'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Weaker pre-evolution/support Jinzo; minor synergy.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'jinzo' and c.name = 'Jinzo #7'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

commit;
