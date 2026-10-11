begin;
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

commit;
