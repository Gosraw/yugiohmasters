-- =========================================================
-- Boss Paths the players chose themselves (owner decision, 2026-11-13)
--
-- 1. New route s2_earthbound "Earthbound Immortals" (display order 15),
--    chosen by faro: Cusillu -> Aslla piscu -> Uru -> Ccapac Apu (Boss).
-- 2. Legendary Ocean (s2_atlantean_ocean), chosen by bossg: The Legendary
--    Fisherman is skipped. Stage 1 Fisherman II, 2 Poseidra, 3 Daedalus,
--    4 (Boss) The Legendary Fisherman III; the support grants are
--    re-spread and Citadel Whale leaves the route.
--
-- Source: data/boss-route-registry-v3.mjs (validated with
-- scripts/generate-boss-routes-v3-migration.mjs --check, scored with
-- scripts/boss-route-balance.mjs; Ocean 81.0 / Earthbound 76.8, mean 78.6).
-- Written by hand instead of regenerating 202610301000: that file would
-- also drop Chaos Soldier's Breaker grant (202611041000).
--
-- Stage prices are copied from the live Blue-Eyes route, like the
-- generator does. Refuses to touch Legendary Ocean while a player holds
-- it (the stage layout would change underneath their path).
--
-- One transaction. Safe to run twice. Backwards compatible.
-- =========================================================

begin;

do $routes$
declare
  v_route uuid;
  v_missing text;
begin
  -- Every card name must resolve to exactly one catalog row.
  select string_agg(v.card_name, ', ')
  into v_missing
  from (
    values
    ('A Legendary Ocean'),
    ('Atlantean Attack Squad'),
    ('Atlantean Heavy Infantry'),
    ('Atlantean Marksman'),
    ('Big Wave Small Wave'),
    ('Call of the Earthbound'),
    ('Codarus'),
    ('Double Coston'),
    ('Earthbound Immortal Aslla piscu'),
    ('Earthbound Immortal Ccapac Apu'),
    ('Earthbound Immortal Cusillu'),
    ('Earthbound Immortal Revival'),
    ('Earthbound Immortal Uru'),
    ('Earthbound Linewalker'),
    ('Earthbound Prison'),
    ('Earthbound Spirit'),
    ('Earthbound Wave'),
    ('Earthbound Whirlwind'),
    ('Levia-Dragon - Daedalus'),
    ('Mother Grizzly'),
    ('Mound of the Bound Creator'),
    ('Poseidra, the Atlantean Dragon'),
    ('Revival of the Immortals'),
    ('Roar of the Earthbound Immortal'),
    ('Salvage'),
    ('Sea Stealth Attack'),
    ('The Legendary Fisherman II'),
    ('The Legendary Fisherman III'),
    ('Torpedo Fish'),
    ('Umi')
  ) as v(card_name)
  where (select count(*) from public.card_catalog c where c.name = v.card_name) <> 1;

  if v_missing is not null then
    raise exception 'Boss path change aborted: card name not found exactly once: %', v_missing;
  end if;

  -- ---------------------------------------------------------
  -- 1. Earthbound Immortals
  -- ---------------------------------------------------------
  insert into public.boss_routes (
    code,
    name,
    display_order,
    teaser_story,
    how_it_plays,
    star_profile,
    target_power_grade,
    is_active
  )
  values (
    's2_earthbound',
    'Earthbound Immortals',
    15,
    'Lines older than any city are carved into the desert. Nobody remembers who drew them, but on the right night the giants they show climb out of the sand - and they do not walk around your defences, they step over them.',
    'Keep a Field Spell on the board and bring out one giant Level 10 Immortal at a time: your opponent cannot attack it, and it attacks your opponent directly.',
    '{"startStrength":3,"growth":3,"bossPower":4,"synergy":4,"flexibility":2}'::jsonb,
    'A',
    true
  )
  on conflict (code) do update set
    name = excluded.name,
    display_order = excluded.display_order,
    teaser_story = excluded.teaser_story,
    how_it_plays = excluded.how_it_plays,
    star_profile = excluded.star_profile,
    target_power_grade = excluded.target_power_grade,
    is_active = true;

  select id into strict v_route from public.boss_routes where code = 's2_earthbound';

  insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
  select
    v_route,
    v.stage_number,
    c.id,
    (
      select s.dp_cost_to_reach
      from public.boss_route_stages s
      join public.boss_routes r on r.id = s.route_id
      where r.code = 's2_blue_eyes'
        and s.stage_number = v.stage_number
    )
  from (
    values
    (1, 'Earthbound Immortal Cusillu'),
    (2, 'Earthbound Immortal Aslla piscu'),
    (3, 'Earthbound Immortal Uru'),
    (4, 'Earthbound Immortal Ccapac Apu')
  ) as v(stage_number, card_name)
  join public.card_catalog c on c.name = v.card_name
  on conflict (route_id, stage_number) do update set
    evolution_card_catalog_id = excluded.evolution_card_catalog_id;

  delete from public.boss_route_stage_grants g
  using public.boss_route_stages s
  where s.id = g.stage_id
    and s.route_id = v_route;

  insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
  select s.id, c.id, v.is_route_exclusive, 1
  from (
    values
    (1, 'Mound of the Bound Creator', false),
    (1, 'Double Coston', false),
    (1, 'Earthbound Linewalker', false),
    (2, 'Earthbound Prison', true),
    (2, 'Earthbound Wave', false),
    (2, 'Earthbound Spirit', false),
    (3, 'Earthbound Whirlwind', false),
    (3, 'Earthbound Immortal Revival', false),
    (3, 'Roar of the Earthbound Immortal', false),
    (4, 'Revival of the Immortals', false),
    (4, 'Call of the Earthbound', false)
  ) as v(stage_number, card_name, is_route_exclusive)
  join public.boss_route_stages s on s.route_id = v_route and s.stage_number = v.stage_number
  join public.card_catalog c on c.name = v.card_name;

  -- ---------------------------------------------------------
  -- 2. Legendary Ocean
  -- ---------------------------------------------------------
  select id into strict v_route from public.boss_routes where code = 's2_atlantean_ocean';

  if exists (select 1 from public.player_boss_paths where route_id = v_route) then
    raise exception 'Boss path change aborted: a player already holds Legendary Ocean. Nothing changed - ask Claude.';
  end if;

  update public.boss_routes
  set
    how_it_plays = 'Play around the Umi field spell: your sea serpents get stronger, your Atlanteans pop cards whenever they are used as a cost, and the old fisherman returns one last time to sweep the sea clean of enemies.',
    star_profile = '{"startStrength":4,"growth":4,"bossPower":5,"synergy":4,"flexibility":3}'::jsonb
  where id = v_route;

  -- One stage at a time, in this order, so no two stages ever hold the
  -- same monster (the unique key is checked per row in production).
  update public.boss_route_stages
  set evolution_card_catalog_id = (select id from public.card_catalog where name = 'The Legendary Fisherman III')
  where route_id = v_route
    and stage_number = 4;

  update public.boss_route_stages
  set evolution_card_catalog_id = (select id from public.card_catalog where name = 'Levia-Dragon - Daedalus')
  where route_id = v_route
    and stage_number = 3;

  update public.boss_route_stages
  set evolution_card_catalog_id = (select id from public.card_catalog where name = 'Poseidra, the Atlantean Dragon')
  where route_id = v_route
    and stage_number = 2;

  update public.boss_route_stages
  set evolution_card_catalog_id = (select id from public.card_catalog where name = 'The Legendary Fisherman II')
  where route_id = v_route
    and stage_number = 1;

  delete from public.boss_route_stage_grants g
  using public.boss_route_stages s
  where s.id = g.stage_id
    and s.route_id = v_route;

  insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
  select s.id, c.id, v.is_route_exclusive, 1
  from (
    values
    (1, 'A Legendary Ocean', false),
    (1, 'Atlantean Heavy Infantry', false),
    (1, 'Mother Grizzly', false),
    (2, 'Umi', false),
    (2, 'Codarus', false),
    (2, 'Atlantean Marksman', false),
    (3, 'Sea Stealth Attack', true),
    (3, 'Big Wave Small Wave', false),
    (3, 'Torpedo Fish', false),
    (4, 'Salvage', false),
    (4, 'Atlantean Attack Squad', false)
  ) as v(stage_number, card_name, is_route_exclusive)
  join public.boss_route_stages s on s.route_id = v_route and s.stage_number = v.stage_number
  join public.card_catalog c on c.name = v.card_name;
end;
$routes$;

commit;
