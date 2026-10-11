begin;
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

commit;
