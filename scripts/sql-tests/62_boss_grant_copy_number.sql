-- Boss grants past copy #3 (202610301500): a guaranteed Boss stage
-- grant must work even when the league already holds 3 copies of an
-- in-pool route card, while every other source still stops at 3.

select pg_temp.reset_players();

-- Setup only: fardin has no Boss path yet, and samo already holds 3
-- copies of the Stage 1 evolution card of a route nobody holds
-- (triggers off for the setup rows).
set local session_replication_role = replica;

delete from public.player_boss_paths
where profile_id = pg_temp.uid_of('fardin');

create temp table copy_test on commit drop as
select
  r.id as route_id,
  s.evolution_card_catalog_id as card_id
from public.boss_routes r
join public.boss_route_stages s
  on s.route_id = r.id
 and s.stage_number = 1
where r.is_active
  and not exists (
    select 1
    from public.player_boss_paths p
    where p.route_id = r.id
  )
order by r.display_order
limit 1;

insert into public.card_instances (
  league_id, card_catalog_id, copy_number, current_owner_id,
  original_owner_id, original_acquisition_type
)
select lm.league_id, t.card_id, n.copy, lm.profile_id, lm.profile_id, 'development'
from copy_test t
cross join (values (1), (2), (3)) as n(copy)
join public.league_members lm on lm.profile_id = pg_temp.uid_of('samo');

set local session_replication_role = origin;

-- A normal (non-Boss) 4th copy is still refused by the scarcity trigger.
do $$
declare
  refused boolean := false;
begin
  begin
    insert into public.card_instances (
      league_id, card_catalog_id, copy_number, current_owner_id,
      original_owner_id, original_acquisition_type
    )
    select lm.league_id, t.card_id, 4, lm.profile_id, lm.profile_id, 'development'
    from copy_test t
    join public.league_members lm on lm.profile_id = pg_temp.uid_of('fardin');
  exception when others then
    refused := true;
  end;

  perform pg_temp.assert_true(refused, 'a non-Boss 4th copy is still refused');
end;
$$;

-- fardin starts that route (trusted session; the wheel uses the same
-- Stage 1 grant): the evolution card arrives as copy #4.
select pg_temp.act_as('fardin');

select public.choose_boss_path((select route_id from copy_test));

select pg_temp.assert_true(
  exists (
    select 1
    from public.card_instances ci
    join copy_test t on t.card_id = ci.card_catalog_id
    where ci.current_owner_id = pg_temp.uid_of('fardin')
      and ci.copy_number = 4
  ),
  'Boss Stage 1 grant lands as copy #4 instead of failing'
);

select pg_temp.assert_eq(
  (
    select count(*)::integer
    from public.card_instances ci
    join copy_test t on t.card_id = ci.card_catalog_id
  ),
  4,
  'exactly one extra copy was granted'
);
