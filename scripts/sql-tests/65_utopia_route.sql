-- Utopia Boss Path (202611141200): the 16th route, chosen by bossg.
-- Four Utopias, the three pool-external grants are exclusive, and starting
-- it grants Number 39: Utopia + the three Stage 1 grants.

select pg_temp.reset_players();

select pg_temp.assert_eq(
  (
    select string_agg(c.name, ' > ' order by s.stage_number)
    from public.boss_route_stages s
    join public.boss_routes r on r.id = s.route_id
    join public.card_catalog c on c.id = s.evolution_card_catalog_id
    where r.code = 's2_utopia' and r.is_active and r.display_order = 16
  ),
  'Number 39: Utopia > Number C39: Utopia Ray V > Number 39: Utopia Beyond > Number S39: Utopia the Lightning',
  'Utopia is an active route with its four Utopias'
);

select pg_temp.assert_eq(
  (
    select string_agg(c.name, ', ' order by c.name)
    from public.boss_route_stage_grants g
    join public.boss_route_stages s on s.id = g.stage_id
    join public.boss_routes r on r.id = s.route_id
    join public.card_catalog c on c.id = g.card_catalog_id
    where r.code = 's2_utopia'
      and g.is_route_exclusive
  ),
  'Halfway to Forever, ZS - Armed Sage, ZS - Ascended Sage',
  'only the three pool-external Utopia grants are exclusive'
);

select pg_temp.assert_eq(
  (
    select count(*)::integer
    from public.boss_route_stage_grants g
    join public.boss_route_stages s on s.id = g.stage_id
    join public.boss_routes r on r.id = s.route_id
    where r.code = 's2_utopia'
  ),
  11,
  'Utopia has 11 support grants'
);

-- bossg starts Utopia: Number 39: Utopia + the three Stage 1 grants.
set local session_replication_role = replica;

delete from public.player_boss_paths
where profile_id = pg_temp.uid_of('bossg');

set local session_replication_role = origin;

select pg_temp.act_as('bossg');

select public.choose_boss_path((select id from public.boss_routes where code = 's2_utopia'));

select pg_temp.assert_eq(
  (
    select string_agg(c.name, ', ' order by c.name)
    from public.card_instances ci
    join public.card_catalog c on c.id = ci.card_catalog_id
    join public.player_boss_paths p on p.id = ci.original_source_id
    where p.profile_id = pg_temp.uid_of('bossg')
  ),
  'Number 39: Utopia, ZS - Armed Sage, ZS - Ascended Sage, ZW - Sleipnir Mail',
  'Utopia Stage 1 grants arrive'
);
