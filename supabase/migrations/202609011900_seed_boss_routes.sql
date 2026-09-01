begin;

-- =========================================================
-- BOSS ROUTE SEED DATA - ALL 20 ROUTES
--
-- GENERATED FILE - do not hand-edit. Regenerate with:
--   node scripts/generate-boss-route-seed-migration.mjs
-- from data/boss-route-registry.mjs, the human-maintained source of
-- truth. See that file's own header for card-name validation notes
-- and the substitutions made for cards that could not be confirmed
-- real or turned out to use an excluded mechanic.
--
-- Upsert-safe: every table is keyed so re-running this file after
-- regenerating it from an updated data file is always safe.
-- =========================================================

-- ================= ROUTE: Chaos / Black Luster Soldier (chaos_bls) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('chaos_bls', 'Chaos / Black Luster Soldier', 1, 'Light and dark bend to a warrior who owes allegiance to neither. Every card sent to the graveyard is fuel; every empty banish zone is a threat waiting to be spent.', '{"startStrength":3,"growth":4,"bossPower":5,"synergy":4,"flexibility":3}'::jsonb, 'A+', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'chaos_bls' and c.name = 'Chaos Command Magician'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'chaos_bls' and c.name = 'Black Luster Soldier - Envoy of the Beginning'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'chaos_bls' and c.name = 'Chaos Sorcerer'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'chaos_bls' and c.name = 'Chaos Emperor Dragon - Envoy of the End'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'chaos_bls' and s.stage_number = 1 and c.name = 'Beast of Talwar'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'chaos_bls' and s.stage_number = 1 and c.name = 'D.D. Warrior Lady'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'chaos_bls' and s.stage_number = 1 and c.name = 'The Cheerful Coffin'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'chaos_bls' and s.stage_number = 2 and c.name = 'Djinn Releaser of Rituals'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'chaos_bls' and s.stage_number = 2 and c.name = 'Sonic Bird'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'chaos_bls' and s.stage_number = 2 and c.name = 'Different Dimension Dragon'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'chaos_bls' and s.stage_number = 3 and c.name = 'Banisher of the Radiance'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'chaos_bls' and s.stage_number = 3 and c.name = 'Trap Hole'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'chaos_bls' and s.stage_number = 3 and c.name = 'Charge of the Light Brigade'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'chaos_bls' and s.stage_number = 4 and c.name = 'Dimension Fusion'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'chaos_bls' and s.stage_number = 4 and c.name = 'Card of Safe Return'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'chaos_bls' and s.stage_number = 4 and c.name = 'Return from the Different Dimension'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'Chaos on the field', 'Have Chaos Sorcerer, Chaos Command Magician, or a Chaos Fusion/Ritual monster on your field at the end of a match you win.', false
from public.boss_routes r
where r.code = 'chaos_bls'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Mass banishment', 'Banish 4 or more cards from either graveyard in a single turn using your Chaos monsters, then win the match.', false
from public.boss_routes r
where r.code = 'chaos_bls'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'Chaos finishes it', 'Win the match with damage dealt by a Chaos-named monster.', true
from public.boss_routes r
where r.code = 'chaos_bls'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'chaos_bls' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'chaos_bls' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'chaos_bls' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'chaos_bls' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'chaos_bls' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Dark Magician / Magician Girl (dark_magician) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('dark_magician', 'Dark Magician / Magician Girl', 2, 'The Kaiba Corp museum piece has a whole family standing behind it. Search, protect, and resurrect the same iconic spellcaster until the opponent can''t answer it a third time.', '{"startStrength":3,"growth":4,"bossPower":5,"synergy":5,"flexibility":3}'::jsonb, 'A+', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Apprentice Magician'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Magician Girl'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Magician'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Magician of Chaos'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dark_magician' and s.stage_number = 1 and c.name = 'Skilled Dark Magician'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dark_magician' and s.stage_number = 1 and c.name = 'Old Vindictive Magician'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dark_magician' and s.stage_number = 1 and c.name = 'Magical Dimension'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dark_magician' and s.stage_number = 2 and c.name = 'Dark Magic Attack'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dark_magician' and s.stage_number = 2 and c.name = 'Dedication through Light and Darkness'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dark_magician' and s.stage_number = 2 and c.name = 'Magician''s Circle'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dark_magician' and s.stage_number = 3 and c.name = 'Eternal Soul'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dark_magician' and s.stage_number = 3 and c.name = 'Sage''s Stone'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dark_magician' and s.stage_number = 3 and c.name = 'Diffusion Wave-Motion'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dark_magician' and s.stage_number = 4 and c.name = 'Thousand Knives'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dark_magician' and s.stage_number = 4 and c.name = 'Dark Renewal'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dark_magician' and s.stage_number = 4 and c.name = 'Magical Stone Excavation'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'The icon endures', 'Win a match with Dark Magician or Dark Magician Girl on your field at the end.', false
from public.boss_routes r
where r.code = 'dark_magician'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Spellcaster synergy', 'Search or Special Summon 3 or more Spellcaster-Type cards in a single duel, then win.', false
from public.boss_routes r
where r.code = 'dark_magician'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'Dark Magic strikes true', 'Win the match with damage dealt by Dark Magician, Dark Magician Girl, or Dark Magician of Chaos.', true
from public.boss_routes r
where r.code = 'dark_magician'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'dark_magician' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'dark_magician' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'dark_magician' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'dark_magician' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'dark_magician' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Elemental HERO (elemental_hero) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('elemental_hero', 'Elemental HERO', 3, 'Every HERO is stronger fused than alone. Stack the right two names on top of Polymerization and the sky itself becomes a weapon.', '{"startStrength":3,"growth":4,"bossPower":4,"synergy":5,"flexibility":4}'::jsonb, 'A+', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Sparkman'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Flame Wingman'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Great Tornado'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO The Shining'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'elemental_hero' and s.stage_number = 1 and c.name = 'Elemental HERO Avian'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'elemental_hero' and s.stage_number = 1 and c.name = 'Elemental HERO Burstinatrix'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'elemental_hero' and s.stage_number = 1 and c.name = 'Polymerization'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'elemental_hero' and s.stage_number = 2 and c.name = 'Fusion Gate'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'elemental_hero' and s.stage_number = 2 and c.name = 'Elemental HERO Necroshade'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'elemental_hero' and s.stage_number = 2 and c.name = 'Miracle Fusion'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'elemental_hero' and s.stage_number = 3 and c.name = 'Skyscraper'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'elemental_hero' and s.stage_number = 3 and c.name = 'E - Emergency Call'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'elemental_hero' and s.stage_number = 3 and c.name = 'Elemental HERO Prisma'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'elemental_hero' and s.stage_number = 4 and c.name = 'Elemental HERO Wildheart'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'elemental_hero' and s.stage_number = 4 and c.name = 'HERO''s Bond'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'elemental_hero' and s.stage_number = 4 and c.name = 'Reinforcement of the Army'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'Fusion Summon and win', 'Fusion Summon any Elemental HERO Fusion Monster during a match you win.', false
from public.boss_routes r
where r.code = 'elemental_hero'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Skyscraper standing', 'Win a match with Skyscraper active on your field for 3 or more of your turns.', false
from public.boss_routes r
where r.code = 'elemental_hero'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'HERO finish', 'Win the match with damage dealt by an Elemental HERO Fusion Monster.', true
from public.boss_routes r
where r.code = 'elemental_hero'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'elemental_hero' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'elemental_hero' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'elemental_hero' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'elemental_hero' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'elemental_hero' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Blue-Eyes (blue_eyes) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('blue_eyes', 'Blue-Eyes', 4, 'It starts as a single white stone. By the time it''s finished evolving, three dragon heads are staring down whatever''s left on the other side of the field.', '{"startStrength":2,"growth":5,"bossPower":5,"synergy":4,"flexibility":3}'::jsonb, 'A+', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'The White Stone of Legend'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Blue-Eyes White Dragon'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Blue-Eyes Ultimate Dragon'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Blue-Eyes Shining Dragon'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'blue_eyes' and s.stage_number = 1 and c.name = 'Maiden with Eyes of Blue'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'blue_eyes' and s.stage_number = 1 and c.name = 'Trade-In'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'blue_eyes' and s.stage_number = 1 and c.name = 'Cards of Consonance'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'blue_eyes' and s.stage_number = 2 and c.name = 'The Melody of Awakening Dragon'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'blue_eyes' and s.stage_number = 2 and c.name = 'Dragon''s Mirror'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'blue_eyes' and s.stage_number = 2 and c.name = 'Return of the Dragon Lords'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'blue_eyes' and s.stage_number = 3 and c.name = 'Burst Stream of Destruction'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'blue_eyes' and s.stage_number = 3 and c.name = 'Dragon Spirit of White'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'blue_eyes' and s.stage_number = 3 and c.name = 'Silver''s Cry'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'blue_eyes' and s.stage_number = 4 and c.name = 'Chorus of Sanctuary'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'blue_eyes' and s.stage_number = 4 and c.name = 'Dragon Shrine'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'blue_eyes' and s.stage_number = 4 and c.name = 'Sage with Eyes of Blue'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'White dragon on the field', 'Win a match with a Blue-Eyes dragon on your field at the end.', false
from public.boss_routes r
where r.code = 'blue_eyes'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Ultimate Fusion', 'Fusion Summon Blue-Eyes Ultimate Dragon during a match you win.', false
from public.boss_routes r
where r.code = 'blue_eyes'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'Burst Stream finish', 'Win the match with damage dealt by a Blue-Eyes dragon with 3000 or more ATK.', true
from public.boss_routes r
where r.code = 'blue_eyes'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'blue_eyes' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'blue_eyes' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'blue_eyes' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'blue_eyes' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'blue_eyes' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Cyber Dragon (cyber_dragon) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('cyber_dragon', 'Cyber Dragon', 5, 'Special Summoned for free the moment the opponent commits a monster, then fused into something with more heads than the duel can handle.', '{"startStrength":4,"growth":4,"bossPower":4,"synergy":4,"flexibility":4}'::jsonb, 'A', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber Dragon'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber Twin Dragon'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber End Dragon'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Chimeratech Fortress Dragon'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cyber_dragon' and s.stage_number = 1 and c.name = 'Cyber Dragon Core'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cyber_dragon' and s.stage_number = 1 and c.name = 'Cyber Valley'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cyber_dragon' and s.stage_number = 1 and c.name = 'Machine Duplication'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cyber_dragon' and s.stage_number = 2 and c.name = 'Power Bond'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cyber_dragon' and s.stage_number = 2 and c.name = 'Limiter Removal'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cyber_dragon' and s.stage_number = 2 and c.name = 'Chimeratech Rampage Dragon'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cyber_dragon' and s.stage_number = 3 and c.name = 'Overload Fusion'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cyber_dragon' and s.stage_number = 3 and c.name = 'Different Dimension Capsule'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cyber_dragon' and s.stage_number = 3 and c.name = 'Photon Generator Unit'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cyber_dragon' and s.stage_number = 4 and c.name = 'Chimeratech Overdragon'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cyber_dragon' and s.stage_number = 4 and c.name = 'Cyber Kirin'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cyber_dragon' and s.stage_number = 4 and c.name = 'Cyber Larva'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'Free Special Summon', 'Special Summon Cyber Dragon (or an evolution) during a match you win.', false
from public.boss_routes r
where r.code = 'cyber_dragon'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Fusion overload', 'Fusion Summon a Cyber/Chimeratech Fusion Monster using 3 or more materials, then win.', false
from public.boss_routes r
where r.code = 'cyber_dragon'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'Mechanical finish', 'Win the match with damage dealt by a Cyber Dragon-line Fusion Monster.', true
from public.boss_routes r
where r.code = 'cyber_dragon'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'cyber_dragon' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'cyber_dragon' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'cyber_dragon' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'cyber_dragon' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'cyber_dragon' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Jinzo (jinzo) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('jinzo', 'Jinzo', 6, 'The moment it hits the field, every Trap Card on the table turns into a dead piece of cardboard. Duelists who lean on Traps learn to fear this silhouette.', '{"startStrength":3,"growth":3,"bossPower":4,"synergy":3,"flexibility":3}'::jsonb, 'A', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'jinzo' and c.name = 'Jinzo #7'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'jinzo' and c.name = 'Jinzo'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'jinzo' and c.name = 'Jinzo - Lord'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'jinzo' and c.name = 'Jinzo - Returner'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'jinzo' and s.stage_number = 1 and c.name = 'Skill Drain'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'jinzo' and s.stage_number = 1 and c.name = 'Trap Stun'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'jinzo' and s.stage_number = 1 and c.name = 'Different Dimension Capsule'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'jinzo' and s.stage_number = 2 and c.name = 'Blast Held by a Tribute'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'jinzo' and s.stage_number = 2 and c.name = 'Ring of Destruction'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'jinzo' and s.stage_number = 2 and c.name = 'Metalmorph'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'jinzo' and s.stage_number = 3 and c.name = 'Chain Energy'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'jinzo' and s.stage_number = 3 and c.name = 'Jar of Greed'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'jinzo' and s.stage_number = 3 and c.name = 'Fiend''s Sanctuary'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'jinzo' and s.stage_number = 4 and c.name = 'Fissure'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'jinzo' and s.stage_number = 4 and c.name = 'Raigeki Break'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'jinzo' and s.stage_number = 4 and c.name = 'Fiend Comedian'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'Trap lockdown', 'Win a match with Jinzo (or an evolution) on your field at the end.', false
from public.boss_routes r
where r.code = 'jinzo'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Negated', 'Have an opponent''s Trap Card negated by Jinzo''s effect during a match you win.', false
from public.boss_routes r
where r.code = 'jinzo'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'Silent finish', 'Win the match with damage dealt while Jinzo negates all Trap Cards on the field.', true
from public.boss_routes r
where r.code = 'jinzo'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'jinzo' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'jinzo' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'jinzo' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'jinzo' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'jinzo' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Chazz / Armed Dragon / Ojama (armed_dragon_ojama) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('armed_dragon_ojama', 'Chazz / Armed Dragon / Ojama', 7, 'Level up, level up! What starts as a joke deck full of purple blockers ends with a dragon devouring the opponent''s whole hand.', '{"startStrength":3,"growth":4,"bossPower":4,"synergy":4,"flexibility":3}'::jsonb, 'A', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'armed_dragon_ojama' and c.name = 'Armed Dragon LV3'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'armed_dragon_ojama' and c.name = 'Armed Dragon LV5'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'armed_dragon_ojama' and c.name = 'Armed Dragon LV7'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'armed_dragon_ojama' and c.name = 'Armed Dragon LV10'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'armed_dragon_ojama' and s.stage_number = 1 and c.name = 'Level Up!'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'armed_dragon_ojama' and s.stage_number = 1 and c.name = 'Ojamagic'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'armed_dragon_ojama' and s.stage_number = 1 and c.name = 'Ojama Yellow'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'armed_dragon_ojama' and s.stage_number = 2 and c.name = 'Ojama Trio'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'armed_dragon_ojama' and s.stage_number = 2 and c.name = 'Ojama Country'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'armed_dragon_ojama' and s.stage_number = 2 and c.name = 'Ojama Green'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'armed_dragon_ojama' and s.stage_number = 3 and c.name = 'Ojama King'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'armed_dragon_ojama' and s.stage_number = 3 and c.name = 'Ojama Black'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'armed_dragon_ojama' and s.stage_number = 3 and c.name = 'Ojama Delta Hurricane!!'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'armed_dragon_ojama' and s.stage_number = 4 and c.name = 'Big Bang Shot'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'armed_dragon_ojama' and s.stage_number = 4 and c.name = 'Card Destruction'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'armed_dragon_ojama' and s.stage_number = 4 and c.name = 'Enemy Controller'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'Level up and win', 'Win a match with Armed Dragon LV7 or LV10 on your field at the end.', false
from public.boss_routes r
where r.code = 'armed_dragon_ojama'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Ojama swarm', 'Control 3 or more Ojama monsters at once during a match you win.', false
from public.boss_routes r
where r.code = 'armed_dragon_ojama'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'LV10 finish', 'Win the match with damage dealt by Armed Dragon LV10 or its flip effect.', true
from public.boss_routes r
where r.code = 'armed_dragon_ojama'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'armed_dragon_ojama' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'armed_dragon_ojama' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'armed_dragon_ojama' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'armed_dragon_ojama' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'armed_dragon_ojama' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Crystal Beast (crystal_beast) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('crystal_beast', 'Crystal Beast', 8, 'Seven gemstones, one Spell Card, and a rainbow that comes together the moment they''re all on the field at once.', '{"startStrength":3,"growth":4,"bossPower":4,"synergy":4,"flexibility":4}'::jsonb, 'A', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beast Ruby Carbuncle'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beast Sapphire Pegasus'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beast Amber Mammoth'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Rainbow Dragon'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'crystal_beast' and s.stage_number = 1 and c.name = 'Crystal Beast Amethyst Cat'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'crystal_beast' and s.stage_number = 1 and c.name = 'Crystal Beast Topaz Tiger'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'crystal_beast' and s.stage_number = 1 and c.name = 'Rare Value'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'crystal_beast' and s.stage_number = 2 and c.name = 'Crystal Beast Emerald Tortoise'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'crystal_beast' and s.stage_number = 2 and c.name = 'Crystal Beast Cobalt Eagle'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'crystal_beast' and s.stage_number = 2 and c.name = 'Crystal Blessing'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'crystal_beast' and s.stage_number = 3 and c.name = 'Crystal Release'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'crystal_beast' and s.stage_number = 3 and c.name = 'Crystal Tree'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'crystal_beast' and s.stage_number = 3 and c.name = 'Spell Shattering Arrow'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'crystal_beast' and s.stage_number = 4 and c.name = 'Rainbow Path'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'crystal_beast' and s.stage_number = 4 and c.name = 'Rainbow Gravity'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'crystal_beast' and s.stage_number = 4 and c.name = 'Trade-In'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'Gemstones assembled', 'Control 4 or more Crystal Beast monsters at once during a match you win.', false
from public.boss_routes r
where r.code = 'crystal_beast'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Rainbow rises', 'Special Summon Rainbow Dragon during a match you win.', false
from public.boss_routes r
where r.code = 'crystal_beast'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'Rainbow finish', 'Win the match with damage dealt by Rainbow Dragon.', true
from public.boss_routes r
where r.code = 'crystal_beast'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'crystal_beast' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'crystal_beast' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'crystal_beast' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'crystal_beast' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'crystal_beast' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Red-Eyes (red_eyes) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('red_eyes', 'Red-Eyes', 9, 'Jonouchi''s dragon never needed to be the strongest thing on the field - just the loudest. Fuse it, fireball with it, and let the crowd go wild.', '{"startStrength":3,"growth":4,"bossPower":4,"synergy":4,"flexibility":3}'::jsonb, 'A', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Black Dragon'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Wyvern'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Darkness Metal Dragon'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Slash Dragon'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'red_eyes' and s.stage_number = 1 and c.name = 'Ties of the Brethren'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'red_eyes' and s.stage_number = 1 and c.name = 'Molten Destruction'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'red_eyes' and s.stage_number = 1 and c.name = 'Masked Dragon'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'red_eyes' and s.stage_number = 2 and c.name = 'Red-Eyes Fusion'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'red_eyes' and s.stage_number = 2 and c.name = 'Return of the Dragon Lords'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'red_eyes' and s.stage_number = 2 and c.name = 'Enemy Controller'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'red_eyes' and s.stage_number = 3 and c.name = 'Inferno Fire Blast'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'red_eyes' and s.stage_number = 3 and c.name = 'Metalmorph'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'red_eyes' and s.stage_number = 4 and c.name = 'Burial from a Different Dimension'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'red_eyes' and s.stage_number = 4 and c.name = 'Trade-In'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'red_eyes' and s.stage_number = 1 and c.name = 'The Cheerful Coffin'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'red_eyes' and s.stage_number = 4 and c.name = 'Call of the Haunted'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'The dragon returns', 'Win a match with a Red-Eyes dragon on your field at the end.', false
from public.boss_routes r
where r.code = 'red_eyes'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Fusion firepower', 'Fusion Summon a Red-Eyes Fusion Monster during a match you win.', false
from public.boss_routes r
where r.code = 'red_eyes'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'Inferno finish', 'Win the match with damage dealt by a Red-Eyes dragon with 2400 or more ATK.', true
from public.boss_routes r
where r.code = 'red_eyes'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'red_eyes' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'red_eyes' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'red_eyes' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'red_eyes' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'red_eyes' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Zombie (zombie) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('zombie', 'Zombie', 10, 'Nothing in this graveyard stays down. Every monster the opponent destroys is just another body for the horde to reanimate.', '{"startStrength":3,"growth":4,"bossPower":4,"synergy":5,"flexibility":3}'::jsonb, 'A', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'zombie' and c.name = 'Pyramid Turtle'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'zombie' and c.name = 'Zombie Master'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'zombie' and c.name = 'Ryu Kokki'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'zombie' and c.name = 'Despair from the Dark'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'zombie' and s.stage_number = 1 and c.name = 'Book of Life'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'zombie' and s.stage_number = 1 and c.name = 'Mezuki'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'zombie' and s.stage_number = 1 and c.name = 'Plaguespreader Zombie'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'zombie' and s.stage_number = 2 and c.name = 'Il Blud'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'zombie' and s.stage_number = 2 and c.name = 'Shutendoji'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'zombie' and s.stage_number = 2 and c.name = 'Zombie World'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'zombie' and s.stage_number = 3 and c.name = 'Necrovalley'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'zombie' and s.stage_number = 3 and c.name = 'Patrician of Darkness'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'zombie' and s.stage_number = 3 and c.name = 'Regenerating Mummy'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'zombie' and s.stage_number = 4 and c.name = 'Card of Safe Return'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'zombie' and s.stage_number = 4 and c.name = 'Pumpking the King of Ghosts'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'zombie' and s.stage_number = 4 and c.name = 'Goblin Zombie'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'The horde rises', 'Control 3 or more Zombie-Type monsters at once during a match you win.', false
from public.boss_routes r
where r.code = 'zombie'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Reanimated', 'Special Summon Doomkaiser Dragon and use its effect to destroy an opponent''s monster, then win.', false
from public.boss_routes r
where r.code = 'zombie'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'Undead finish', 'Win the match with damage dealt by a Zombie-Type monster.', true
from public.boss_routes r
where r.code = 'zombie'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'zombie' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'zombie' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'zombie' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'zombie' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'zombie' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Dinosaur (dinosaur) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('dinosaur', 'Dinosaur', 11, 'Fossils, evolution pills, and a prehistoric arms race. Every turn this deck skips a stage of development that should have taken millions of years.', '{"startStrength":3,"growth":4,"bossPower":4,"synergy":4,"flexibility":3}'::jsonb, 'A', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'dinosaur' and c.name = 'Babycerasaurus'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'dinosaur' and c.name = 'Kabazauls'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'dinosaur' and c.name = 'Super Conductor Tyranno'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'dinosaur' and c.name = 'Ultimate Conductor Tyranno'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dinosaur' and s.stage_number = 1 and c.name = 'Petiteranodon'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dinosaur' and s.stage_number = 1 and c.name = 'Fossil Excavation'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dinosaur' and s.stage_number = 1 and c.name = 'Ancient Forest'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dinosaur' and s.stage_number = 2 and c.name = 'Big Evolution Pill'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dinosaur' and s.stage_number = 2 and c.name = 'Terraforming'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dinosaur' and s.stage_number = 2 and c.name = 'Fossil Dyna Pachycephalo'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dinosaur' and s.stage_number = 3 and c.name = 'Black Tyranno'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dinosaur' and s.stage_number = 3 and c.name = 'Jurrac Guaiba'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dinosaur' and s.stage_number = 3 and c.name = 'Jurrac Velo'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dinosaur' and s.stage_number = 3 and c.name = 'Jurrac Aeolo'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dinosaur' and s.stage_number = 4 and c.name = 'Ultra Evolution Pill'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dinosaur' and s.stage_number = 4 and c.name = 'Sabersaurus'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'Prehistoric pressure', 'Control a Dinosaur-Type monster with 2400 or more ATK during a match you win.', false
from public.boss_routes r
where r.code = 'dinosaur'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Evolution complete', 'Special Summon Ultimate Conductor Tyranno using an Evolution Pill effect, then win.', false
from public.boss_routes r
where r.code = 'dinosaur'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'Double-attack finish', 'Win the match with damage dealt by Ultimate Conductor Tyranno''s double attack.', true
from public.boss_routes r
where r.code = 'dinosaur'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'dinosaur' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'dinosaur' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'dinosaur' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'dinosaur' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'dinosaur' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Legendary Fisherman (legendary_fisherman) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('legendary_fisherman', 'Legendary Fisherman', 12, 'The ocean itself becomes a Field Spell, and everything that swims beneath it gets bigger, meaner, and harder to burn.', '{"startStrength":3,"growth":4,"bossPower":4,"synergy":4,"flexibility":3}'::jsonb, 'A', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'legendary_fisherman' and c.name = 'The Legendary Fisherman'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'legendary_fisherman' and c.name = 'The Legendary Fisherman II'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'legendary_fisherman' and c.name = 'The Legendary Fisherman III'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'legendary_fisherman' and c.name = 'Levia-Dragon - Daedalus'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'legendary_fisherman' and s.stage_number = 1 and c.name = 'Umi'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'legendary_fisherman' and s.stage_number = 1 and c.name = 'Mother Grizzly'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'legendary_fisherman' and s.stage_number = 1 and c.name = 'Fortress Whale'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'legendary_fisherman' and s.stage_number = 1 and c.name = 'Terrorking Salmon'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'legendary_fisherman' and s.stage_number = 2 and c.name = 'Citadel Whale'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'legendary_fisherman' and s.stage_number = 2 and c.name = 'Deep Sea Diva'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'legendary_fisherman' and s.stage_number = 2 and c.name = 'Fishborg Blaster'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'legendary_fisherman' and s.stage_number = 3 and c.name = 'Torrential Tribute'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'legendary_fisherman' and s.stage_number = 3 and c.name = 'Big Wave Small Wave'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'legendary_fisherman' and s.stage_number = 3 and c.name = 'Deepsea Shark'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'legendary_fisherman' and s.stage_number = 4 and c.name = 'Umiiruka'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'legendary_fisherman' and s.stage_number = 4 and c.name = 'Atlantean Marksman'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'The sea provides', 'Win a match with Umi active on your field for 3 or more of your turns.', false
from public.boss_routes r
where r.code = 'legendary_fisherman'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Full evolution', 'Have Citadel Whale on your field (evolved from Fortress Whale) during a match you win.', false
from public.boss_routes r
where r.code = 'legendary_fisherman'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'Depths finish', 'Win the match with damage dealt by Legendary Fisherman II or Levia-Dragon - Daedalus.', true
from public.boss_routes r
where r.code = 'legendary_fisherman'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'legendary_fisherman' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'legendary_fisherman' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'legendary_fisherman' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'legendary_fisherman' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'legendary_fisherman' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Machina (machina) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('machina', 'Machina', 13, 'A search chain of soldiers and snipers that ends with the whole squad detonating into one overwhelming Fortress.', '{"startStrength":3,"growth":4,"bossPower":4,"synergy":4,"flexibility":3}'::jsonb, 'A', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'machina' and c.name = 'Machina Soldier'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'machina' and c.name = 'Machina Sniper'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'machina' and c.name = 'Machina Fortress'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'machina' and c.name = 'Machina Force'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'machina' and s.stage_number = 1 and c.name = 'Limiter Removal'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'machina' and s.stage_number = 1 and c.name = 'Different Dimension Capsule'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'machina' and s.stage_number = 1 and c.name = 'Machina Peacekeeper'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'machina' and s.stage_number = 2 and c.name = 'Machine Duplication'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'machina' and s.stage_number = 2 and c.name = 'Overload Fusion'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'machina' and s.stage_number = 2 and c.name = 'Machina Armored Unit'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'machina' and s.stage_number = 3 and c.name = 'Pot of Avarice'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'machina' and s.stage_number = 3 and c.name = 'Heavy Mech Support Armor'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'machina' and s.stage_number = 3 and c.name = 'Pot of Duality'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'machina' and s.stage_number = 4 and c.name = 'Machina Gearframe'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'machina' and s.stage_number = 4 and c.name = 'Fiendish Engine Omega'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'machina' and s.stage_number = 4 and c.name = 'United We Stand'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'Squad tactics', 'Control 3 or more Machina monsters at once during a match you win.', false
from public.boss_routes r
where r.code = 'machina'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Fortress flip', 'Destroy an opponent''s monster with Machina Fortress''s flip effect, then win.', false
from public.boss_routes r
where r.code = 'machina'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'Force finish', 'Win the match with damage dealt by Machina Force.', true
from public.boss_routes r
where r.code = 'machina'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'machina' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'machina' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'machina' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'machina' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'machina' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Toon (toon) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('toon', 'Toon', 14, 'Once Toon World hits the field, nothing on the other side of the table can fight back the same way ever again. Silly, unfair, and impossible to take seriously until it wins.', '{"startStrength":2,"growth":3,"bossPower":4,"synergy":4,"flexibility":2}'::jsonb, 'A', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'toon' and c.name = 'Toon Goblin Attack Force'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'toon' and c.name = 'Toon Mermaid'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'toon' and c.name = 'Toon Dark Magician Girl'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'toon' and c.name = 'Toon Summoned Skull'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'toon' and s.stage_number = 1 and c.name = 'Toon World'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'toon' and s.stage_number = 1 and c.name = 'Toon Table of Contents'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'toon' and s.stage_number = 1 and c.name = 'Toon Kingdom'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'toon' and s.stage_number = 2 and c.name = 'Different Dimension Capsule'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'toon' and s.stage_number = 2 and c.name = 'Toon Cannon Soldier'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'toon' and s.stage_number = 2 and c.name = 'Toon Masked Sorcerer'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'toon' and s.stage_number = 3 and c.name = 'Toon Defense'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'toon' and s.stage_number = 3 and c.name = 'Enemy Controller'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'toon' and s.stage_number = 3 and c.name = 'Book of Moon'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'toon' and s.stage_number = 4 and c.name = 'Manga Ryu-Ran'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'toon' and s.stage_number = 4 and c.name = 'Card Destruction'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'toon' and s.stage_number = 4 and c.name = 'Ring of Destruction'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'Toon World standing', 'Win a match with Toon World active on your field.', false
from public.boss_routes r
where r.code = 'toon'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Cartoon swarm', 'Control 2 or more Toon monsters at once during a match you win.', false
from public.boss_routes r
where r.code = 'toon'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'Slapstick finish', 'Win the match with damage dealt by Toon Summoned Skull.', true
from public.boss_routes r
where r.code = 'toon'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'toon' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'toon' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'toon' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'toon' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'toon' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Harpie (harpie) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('harpie', 'Harpie', 15, 'Mai Valentine''s signature squad - swarm the field with sisters, then clear whatever''s left standing with a gust of wind.', '{"startStrength":3,"growth":4,"bossPower":4,"synergy":4,"flexibility":3}'::jsonb, 'A', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'harpie' and c.name = 'Harpie Lady'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'harpie' and c.name = 'Harpie Lady Sisters'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'harpie' and c.name = 'Harpie Queen'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'harpie' and c.name = 'Harpie''s Pet Dragon'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'harpie' and s.stage_number = 1 and c.name = 'Elegant Egotist'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'harpie' and s.stage_number = 1 and c.name = 'Harpie''s Feather Duster'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'harpie' and s.stage_number = 1 and c.name = 'Hysteric Party'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'harpie' and s.stage_number = 2 and c.name = 'Harpies'' Hunting Ground'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'harpie' and s.stage_number = 2 and c.name = 'Harpie Lady Phoenix Formation'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'harpie' and s.stage_number = 2 and c.name = 'Harpie Lady 1'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'harpie' and s.stage_number = 3 and c.name = 'Hysteric Sign'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'harpie' and s.stage_number = 3 and c.name = 'Cyber Harpie Lady'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'harpie' and s.stage_number = 3 and c.name = 'Harpie''s Pet Baby Dragon'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'harpie' and s.stage_number = 3 and c.name = 'Ties of the Brethren'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'harpie' and s.stage_number = 4 and c.name = 'Icarus Attack'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'harpie' and s.stage_number = 4 and c.name = 'Different Dimension Capsule'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'Flock assembled', 'Control 3 or more Harpie Lady-type monsters at once during a match you win.', false
from public.boss_routes r
where r.code = 'harpie'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Icarus Attack', 'Destroy 2 or more of an opponent''s cards with Icarus Attack, then win.', false
from public.boss_routes r
where r.code = 'harpie'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'Talon finish', 'Win the match with damage dealt by Harpie''s Pet Dragon.', true
from public.boss_routes r
where r.code = 'harpie'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'harpie' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'harpie' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'harpie' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'harpie' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'harpie' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Ancient Gear (ancient_gear) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('ancient_gear', 'Ancient Gear', 16, 'A forgotten civilization''s war machine, dug up piece by piece until the whole battlefield shakes when it walks.', '{"startStrength":3,"growth":4,"bossPower":5,"synergy":4,"flexibility":3}'::jsonb, 'A+', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Soldier'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Golem'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Reactor Dragon'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'ancient_gear' and s.stage_number = 1 and c.name = 'Ancient Gear Wyvern'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'ancient_gear' and s.stage_number = 1 and c.name = 'Ancient Gear Beast'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'ancient_gear' and s.stage_number = 1 and c.name = 'Geartown'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'ancient_gear' and s.stage_number = 2 and c.name = 'Ancient Gear Castle'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'ancient_gear' and s.stage_number = 2 and c.name = 'Ancient Gear Golem - Ultimate Pound'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'ancient_gear' and s.stage_number = 2 and c.name = 'Limiter Removal'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'ancient_gear' and s.stage_number = 3 and c.name = 'Ancient Gear Fusion'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'ancient_gear' and s.stage_number = 3 and c.name = 'Overload Fusion'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'ancient_gear' and s.stage_number = 3 and c.name = 'Machine Duplication'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'ancient_gear' and s.stage_number = 4 and c.name = 'Different Dimension Capsule'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'ancient_gear' and s.stage_number = 4 and c.name = 'Enemy Controller'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'ancient_gear' and s.stage_number = 4 and c.name = 'United We Stand'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'The gears turn', 'Win a match with an Ancient Gear Field Spell active on your field.', false
from public.boss_routes r
where r.code = 'ancient_gear'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Iron swarm', 'Control 2 or more Ancient Gear monsters at once during a match you win.', false
from public.boss_routes r
where r.code = 'ancient_gear'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'Reactor finish', 'Win the match with damage dealt by Ancient Gear Reactor Dragon or Ancient Gear Golem.', true
from public.boss_routes r
where r.code = 'ancient_gear'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'ancient_gear' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'ancient_gear' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'ancient_gear' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'ancient_gear' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'ancient_gear' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Galaxy / Photon (galaxy_photon) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('galaxy_photon', 'Galaxy / Photon', 17, 'Two Level 8 monsters, one Xyz Summon, and a dragon with eyes that see clean through the opponent''s board. Rank it up and there''s nothing left to see through.', '{"startStrength":3,"growth":5,"bossPower":5,"synergy":4,"flexibility":3}'::jsonb, 'A+', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'galaxy_photon' and c.name = 'Photon Thrasher'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'galaxy_photon' and c.name = 'Galaxy-Eyes Photon Dragon'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'galaxy_photon' and c.name = 'Galaxy-Eyes Cipher Dragon'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'galaxy_photon' and c.name = 'Number 62: Galaxy-Eyes Prime Photon Dragon'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'galaxy_photon' and s.stage_number = 1 and c.name = 'Photon Vanisher'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'galaxy_photon' and s.stage_number = 1 and c.name = 'Photon Sabre Tiger'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'galaxy_photon' and s.stage_number = 1 and c.name = 'Galaxy Soldier'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'galaxy_photon' and s.stage_number = 1 and c.name = 'Galaxy Wizard'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'galaxy_photon' and s.stage_number = 2 and c.name = 'Photon Stream of Destruction'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'galaxy_photon' and s.stage_number = 2 and c.name = 'Number 107: Galaxy-Eyes Tachyon Dragon'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'galaxy_photon' and s.stage_number = 3 and c.name = 'Xyz Reborn'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'galaxy_photon' and s.stage_number = 3 and c.name = 'Photon Lead'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'galaxy_photon' and s.stage_number = 3 and c.name = 'Different Dimension Capsule'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'galaxy_photon' and s.stage_number = 4 and c.name = 'Galaxy Cyclone'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'galaxy_photon' and s.stage_number = 4 and c.name = 'Photon Sanctuary'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'galaxy_photon' and s.stage_number = 4 and c.name = 'Enemy Controller'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'Eyes in the sky', 'Win a match with a Galaxy-Eyes Xyz Monster on your field at the end.', false
from public.boss_routes r
where r.code = 'galaxy_photon'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Rank up', 'Rank-Up Summon Galaxy-Eyes Cipher Dragon or Prime Photon Dragon, then win.', false
from public.boss_routes r
where r.code = 'galaxy_photon'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'Prime finish', 'Win the match with damage dealt by Galaxy-Eyes Prime Photon Dragon.', true
from public.boss_routes r
where r.code = 'galaxy_photon'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'galaxy_photon' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'galaxy_photon' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'galaxy_photon' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'galaxy_photon' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'galaxy_photon' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Destiny HERO (destiny_hero) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('destiny_hero', 'Destiny HERO', 18, 'Aster Phoenix''s rivals to the HERO name - a gamble-and-punish deck that gets more dangerous the lower your Life Points go.', '{"startStrength":3,"growth":4,"bossPower":4,"synergy":4,"flexibility":3}'::jsonb, 'A', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Malicious'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Diamond Dude'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Plasma'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Dystopia'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'destiny_hero' and s.stage_number = 1 and c.name = 'Destiny Draw'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'destiny_hero' and s.stage_number = 1 and c.name = 'Destiny HERO - Defender'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'destiny_hero' and s.stage_number = 1 and c.name = 'Fusion Gate'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'destiny_hero' and s.stage_number = 1 and c.name = 'Destiny HERO - Fear Monger'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'destiny_hero' and s.stage_number = 2 and c.name = 'Destiny HERO - Dasher'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'destiny_hero' and s.stage_number = 2 and c.name = 'HERO''s Bond'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'destiny_hero' and s.stage_number = 2 and c.name = 'Different Dimension Capsule'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'destiny_hero' and s.stage_number = 3 and c.name = 'Destiny HERO - Departed'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'destiny_hero' and s.stage_number = 3 and c.name = 'Destiny Signal'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'destiny_hero' and s.stage_number = 4 and c.name = 'Destiny HERO - Doom Lord'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'destiny_hero' and s.stage_number = 4 and c.name = 'Polymerization'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'destiny_hero' and s.stage_number = 4 and c.name = 'Destiny HERO - Dogma'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'Destiny fulfilled', 'Fusion Summon a Destiny HERO Fusion Monster during a match you win.', false
from public.boss_routes r
where r.code = 'destiny_hero'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Low-life gamble', 'Win a match after your Life Points dropped to 1000 or below at some point.', false
from public.boss_routes r
where r.code = 'destiny_hero'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'Dystopia finish', 'Win the match with damage dealt by Destiny HERO - Dystopia or Destiny HERO - Dogma.', true
from public.boss_routes r
where r.code = 'destiny_hero'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'destiny_hero' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'destiny_hero' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'destiny_hero' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'destiny_hero' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'destiny_hero' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Vampire (vampire) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('vampire', 'Vampire', 19, 'A bloodline of DARK nobles that keeps coming back from the graveyard - the more the opponent destroys, the hungrier the next one gets.', '{"startStrength":3,"growth":4,"bossPower":4,"synergy":4,"flexibility":3}'::jsonb, 'A', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Sorcerer'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Lord'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Genesis'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Fraulein'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'vampire' and s.stage_number = 1 and c.name = 'Vampire''s Curse'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'vampire' and s.stage_number = 1 and c.name = 'Book of Life'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'vampire' and s.stage_number = 1 and c.name = 'Card of Safe Return'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'vampire' and s.stage_number = 2 and c.name = 'Vampire Lady'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'vampire' and s.stage_number = 2 and c.name = 'Vampire Grace'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'vampire' and s.stage_number = 2 and c.name = 'Pot of Avarice'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'vampire' and s.stage_number = 3 and c.name = 'Vampire Vamp'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'vampire' and s.stage_number = 3 and c.name = 'Il Blud'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'vampire' and s.stage_number = 3 and c.name = 'Mezuki'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'vampire' and s.stage_number = 4 and c.name = 'Mask of Darkness'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'vampire' and s.stage_number = 4 and c.name = 'Different Dimension Capsule'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'vampire' and s.stage_number = 4 and c.name = 'Compulsory Evacuation Device'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'Bloodline rises', 'Special Summon a Zombie or Vampire monster from your graveyard during a match you win.', false
from public.boss_routes r
where r.code = 'vampire'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Coven assembled', 'Control 2 or more Vampire archetype monsters at once during a match you win.', false
from public.boss_routes r
where r.code = 'vampire'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'Fraulein''s finish', 'Win the match with damage dealt by Vampire Fraulein or Vampire Genesis.', true
from public.boss_routes r
where r.code = 'vampire'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'vampire' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'vampire' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'vampire' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'vampire' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'vampire' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- ================= ROUTE: Cubic (cubic) =================

insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
values ('cubic', 'Cubic', 20, 'Six-sided monsters that search, revive and re-search each other in an endless loop, escalating from a lone seed into an overwhelming toolbox of Cubic Lords.', '{"startStrength":3,"growth":4,"bossPower":5,"synergy":4,"flexibility":3}'::jsonb, 'A+', true)
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = excluded.is_active;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 1, c.id, null
from public.boss_routes r, public.card_catalog c
where r.code = 'cubic' and c.name = 'Dark Garnex the Cubic Beast'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 2, c.id, 900
from public.boss_routes r, public.card_catalog c
where r.code = 'cubic' and c.name = 'Duza the Meteor Cubic Vessel'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 3, c.id, 1400
from public.boss_routes r, public.card_catalog c
where r.code = 'cubic' and c.name = 'Buster Gundil the Cubic Behemoth'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, 4, c.id, 2400
from public.boss_routes r, public.card_catalog c
where r.code = 'cubic' and c.name = 'Crimson Nova the Dark Cubic Lord'
on conflict (route_id, stage_number) do update set
  evolution_card_catalog_id = excluded.evolution_card_catalog_id,
  dp_cost_to_reach = excluded.dp_cost_to_reach;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cubic' and s.stage_number = 1 and c.name = 'Cubic Karma'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cubic' and s.stage_number = 1 and c.name = 'Cubic Wave'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cubic' and s.stage_number = 1 and c.name = 'Cubic Rebirth'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cubic' and s.stage_number = 2 and c.name = 'Vijam the Cubic Seed'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cubic' and s.stage_number = 2 and c.name = 'Unification of the Cubic Lords'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cubic' and s.stage_number = 2 and c.name = 'Indiora Doom Volt the Cubic Emperor'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cubic' and s.stage_number = 3 and c.name = 'Blade Garoodia the Cubic Beast'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cubic' and s.stage_number = 3 and c.name = 'Geira Guile the Cubic King'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cubic' and s.stage_number = 3 and c.name = 'Cubic Ascension'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cubic' and s.stage_number = 4 and c.name = 'Cubic Dharma'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cubic' and s.stage_number = 4 and c.name = 'Cubic Causality'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cubic' and s.stage_number = 4 and c.name = 'Cubic Mandala'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_win', 'The seed searches', 'Win a match after searching or Special Summoning a Cubic monster from your Deck.', false
from public.boss_routes r
where r.code = 'cubic'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'signature_move', 'Lords unified', 'Win a duel after having 2 or more Cubic monsters on the field at once.', false
from public.boss_routes r
where r.code = 'cubic'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'finishing_blow', 'Dark Cubic Lord''s judgment', 'Win the match with damage dealt by Crimson Nova the Dark Cubic Lord.', true
from public.boss_routes r
where r.code = 'cubic'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 3
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'cubic' and s.stage_number = 2
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 10
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'cubic' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_move'
where r.code = 'cubic' and s.stage_number = 3
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 22
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'signature_win'
where r.code = 'cubic' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)
select s.id, e.id, 2
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = 'finishing_blow'
where r.code = 'cubic' and s.stage_number = 4
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

commit;
