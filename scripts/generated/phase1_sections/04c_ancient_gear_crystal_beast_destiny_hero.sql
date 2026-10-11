begin;
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

commit;
