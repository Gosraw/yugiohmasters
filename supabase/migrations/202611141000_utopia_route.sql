-- =========================================================
-- Utopia Boss Path (owner decision, 2026-11-14)
--
-- New route s2_utopia "Utopia" (display order 16), a preview for Samo
-- (removed again by 202611141100: Samo keeps Ancient Gear):
-- Number 39: Utopia -> Number C39: Utopia Ray V -> Number 39: Utopia
-- Beyond -> Number S39: Utopia the Lightning (Boss).
--
-- Source: data/boss-route-registry-v3.mjs (validated with
-- scripts/generate-boss-routes-v3-migration.mjs --check, scored with
-- scripts/boss-route-balance.mjs; Utopia 79.8, mean 78.7).
-- Written by hand instead of regenerating 202610301000: that file would
-- also drop Chaos Soldier's Breaker grant (202611041000).
--
-- Only adds a route; nothing else changes. Stage prices are copied from
-- the live Blue-Eyes route, like the generator does.
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
    ('Halfway to Forever'),
    ('Number 39: Utopia'),
    ('Number 39: Utopia Beyond'),
    ('Number C39: Utopia Ray V'),
    ('Number S39: Utopia the Lightning'),
    ('Rank-Up-Magic Astral Force'),
    ('Rank-Up-Magic Limited Barian''s Force'),
    ('Reverse Breaker'),
    ('Rising Sun Slash'),
    ('Utopia Buster'),
    ('Xyz Change Tactics'),
    ('ZS - Armed Sage'),
    ('ZW - Lightning Blade'),
    ('ZW - Sleipnir Mail'),
    ('ZW - Tornado Bringer')
  ) as v(card_name)
  where (select count(*) from public.card_catalog c where c.name = v.card_name) <> 1;

  if v_missing is not null then
    raise exception 'Utopia route aborted: card name not found exactly once: %', v_missing;
  end if;

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
    's2_utopia',
    'Utopia',
    16,
    'A boy who never gives up, and the warrior of hope who answers when he calls. Every time it looks lost, the armour gets one piece heavier and the sword one piece brighter.',
    'Stack two Level 4 monsters into Utopia, stop attacks with it, then rank it up and strap ZW armour onto it until one warrior hits harder than anything your opponent can put in front of it.',
    '{"startStrength":3,"growth":3,"bossPower":4,"synergy":4,"flexibility":4}'::jsonb,
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

  select id into strict v_route from public.boss_routes where code = 's2_utopia';

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
    (1, 'Number 39: Utopia'),
    (2, 'Number C39: Utopia Ray V'),
    (3, 'Number 39: Utopia Beyond'),
    (4, 'Number S39: Utopia the Lightning')
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
    (1, 'ZS - Armed Sage', true),
    (1, 'ZW - Sleipnir Mail', false),
    (1, 'Xyz Change Tactics', false),
    (2, 'Rank-Up-Magic Limited Barian''s Force', false),
    (2, 'ZW - Tornado Bringer', false),
    (2, 'Utopia Buster', false),
    (3, 'Rank-Up-Magic Astral Force', false),
    (3, 'ZW - Lightning Blade', false),
    (3, 'Rising Sun Slash', false),
    (4, 'Halfway to Forever', true),
    (4, 'Reverse Breaker', false)
  ) as v(stage_number, card_name, is_route_exclusive)
  join public.boss_route_stages s on s.route_id = v_route and s.stage_number = v.stage_number
  join public.card_catalog c on c.name = v.card_name;
end;
$routes$;

commit;
