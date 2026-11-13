-- Boss Paths the players chose (202611131000): Legendary Ocean starts at
-- Fisherman II and ends at Fisherman III, Earthbound Immortals is the
-- 15th route, and starting either one grants its Stage 1 like any route.

select pg_temp.reset_players();

select pg_temp.assert_eq(
  (
    select string_agg(c.name, ' > ' order by s.stage_number)
    from public.boss_route_stages s
    join public.boss_routes r on r.id = s.route_id
    join public.card_catalog c on c.id = s.evolution_card_catalog_id
    where r.code = 's2_atlantean_ocean'
  ),
  'The Legendary Fisherman II > Poseidra, the Atlantean Dragon > Levia-Dragon - Daedalus > The Legendary Fisherman III',
  'Legendary Ocean skips The Legendary Fisherman and ends at Fisherman III'
);

select pg_temp.assert_eq(
  (
    select string_agg(c.name, ' > ' order by s.stage_number)
    from public.boss_route_stages s
    join public.boss_routes r on r.id = s.route_id
    join public.card_catalog c on c.id = s.evolution_card_catalog_id
    where r.code = 's2_earthbound' and r.is_active
  ),
  'Earthbound Immortal Cusillu > Earthbound Immortal Aslla piscu > Earthbound Immortal Uru > Earthbound Immortal Ccapac Apu',
  'Earthbound Immortals is an active route with its four Immortals'
);

select pg_temp.assert_eq(
  (
    select count(*)::integer
    from public.boss_route_stage_grants g
    join public.boss_route_stages s on s.id = g.stage_id
    join public.boss_routes r on r.id = s.route_id
    where r.code = 's2_atlantean_ocean'
      and g.card_catalog_id = (select id from public.card_catalog where name = 'Citadel Whale')
  ),
  0,
  'Citadel Whale left Legendary Ocean'
);

-- fardin starts Earthbound Immortals: Cusillu + the three Stage 1 grants.
set local session_replication_role = replica;

delete from public.player_boss_paths
where profile_id = pg_temp.uid_of('fardin');

set local session_replication_role = origin;

select pg_temp.act_as('fardin');

select public.choose_boss_path((select id from public.boss_routes where code = 's2_earthbound'));

select pg_temp.assert_eq(
  (
    select string_agg(c.name, ', ' order by c.name)
    from public.card_instances ci
    join public.card_catalog c on c.id = ci.card_catalog_id
    join public.player_boss_paths p on p.id = ci.original_source_id
    where p.profile_id = pg_temp.uid_of('fardin')
  ),
  'Double Coston, Earthbound Immortal Cusillu, Earthbound Linewalker, Mound of the Bound Creator',
  'Earthbound Stage 1 grants arrive'
);
