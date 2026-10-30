-- Boss Routes v3 (202610301000): the 14 Season 2 Boss Paths replace the
-- 20 Season 1 routes. Checks the data (14 routes x 4 stages, 11 grants
-- each, names resolve, no Synchro/Link/Pendulum, prices copied from
-- config), that retired routes cannot be chosen, and the tightened
-- Boss-route exemption: a pool-external route card is deck-legal for
-- the route's owner only, and in-pool route cards keep their banlist
-- limit.

create function pg_temp.card(target_name text)
returns uuid
language sql
stable
as $$
  select id from public.card_catalog where name = target_name;
$$;

create function pg_temp.expect_error(statement text, expected_fragment text, label text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
  exception
    when others then
      if position(expected_fragment in sqlerrm) = 0 then
        raise exception 'FAILED: % (wrong error: %)', label, sqlerrm;
      end if;
      raise notice 'ok: %', label;
      return;
  end;
  raise exception 'FAILED: % (no error raised)', label;
end;
$$;

-- ---------------------------------------------------------
-- 1. Data
-- ---------------------------------------------------------
do $$
declare
  v_bad text;
begin
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.boss_routes where is_active),
    14, '14 active Boss Paths');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.boss_routes where is_active and code like 's2\_%' and how_it_plays is not null),
    14, 'all 14 are Season 2 routes (s2_*) with a how-it-plays line');
  perform pg_temp.assert_eq(
    (select string_agg(display_order::text, ',' order by display_order) from public.boss_routes where is_active),
    '1,2,3,4,5,6,7,8,9,10,11,12,13,14', 'display order 1-14');
  perform pg_temp.assert_true(
    exists (select 1 from public.boss_routes where code = 's2_six_samurai' and is_active)
      and exists (select 1 from public.boss_routes where code = 's2_crystal_beast' and is_active)
      and exists (select 1 from public.boss_routes where code = 's2_ancient_gear' and is_active),
    'the three newest routes exist (Six Samurai, Crystal Beast, Ancient Gear)');
  -- Owner decision 2026-10-30: the routes the players already used in
  -- Season 1 are not Season 2 routes.
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.boss_routes
     where code in ('s2_dark_magician', 's2_cyber_dragon', 's2_armed_ojama')),
    0, 'no Dark Magician / Cyber Dragon / Armed Dragon & Ojama route in Season 2');

  select string_agg(r.code, ', ') into v_bad
  from public.boss_routes r
  where r.is_active
    and (select count(*) from public.boss_route_stages s where s.route_id = r.id) <> 4;
  perform pg_temp.assert_eq(v_bad, null::text, 'every route has exactly 4 stages');

  select string_agg(r.code || '/' || s.stage_number, ', ') into v_bad
  from public.boss_route_stages s
  join public.boss_routes r on r.id = s.route_id
  where r.is_active
    and ((s.stage_number = 1 and s.dp_cost_to_reach is not null)
      or (s.stage_number > 1 and coalesce(s.dp_cost_to_reach, 0) <= 0));
  perform pg_temp.assert_eq(v_bad, null::text, 'stage 1 is free, stages 2-4 have a configured price');

  -- Prices copied from the config that was live when the migration ran
  -- (the Season 1 seed: 900 / 1,400 / 2,400 on a fresh database).
  perform pg_temp.assert_eq(
    (select string_agg(distinct s.stage_number || '=' || s.dp_cost_to_reach, ',' order by s.stage_number || '=' || s.dp_cost_to_reach)
     from public.boss_route_stages s join public.boss_routes r on r.id = s.route_id
     where r.is_active and s.stage_number > 1),
    '2=900,3=1400,4=2400', 'stage prices copied from config, one price per stage number');

  select string_agg(r.code, ', ') into v_bad
  from public.boss_routes r
  where r.is_active
    and (select count(*)
         from public.boss_route_stage_grants g
         join public.boss_route_stages s on s.id = g.stage_id
         where s.route_id = r.id) <> 11;
  perform pg_temp.assert_eq(v_bad, null::text, 'every route has 11 support grants');

  perform pg_temp.assert_eq(
    (select count(*)::integer
     from public.boss_route_stage_grants g
     join public.boss_route_stages s on s.id = g.stage_id
     join public.boss_routes r on r.id = s.route_id
     where r.is_active and g.quantity <> 1),
    0, 'every grant is 1 copy');

  -- Every grant / evolution resolves to a catalog card (inner joins) and
  -- none is a Synchro, Link or Pendulum card.
  select string_agg(distinct c.name, ', ') into v_bad
  from (
    select s.evolution_card_catalog_id as card_id
    from public.boss_route_stages s join public.boss_routes r on r.id = s.route_id where r.is_active
    union all
    select g.card_catalog_id
    from public.boss_route_stage_grants g
    join public.boss_route_stages s on s.id = g.stage_id
    join public.boss_routes r on r.id = s.route_id
    where r.is_active
  ) x
  join public.card_catalog c on c.id = x.card_id
  where coalesce(c.card_type, '') ~* '(synchro|link|pendulum)'
     or coalesce(c.frame_type, '') ~* '(synchro|link|pendulum)';
  perform pg_temp.assert_eq(v_bad, null::text, 'no Synchro / Link / Pendulum route card');

  perform pg_temp.assert_eq(
    (select count(*)::integer
     from (
       select s.evolution_card_catalog_id from public.boss_route_stages s join public.boss_routes r on r.id = s.route_id where r.is_active
       union all
       select g.card_catalog_id
       from public.boss_route_stage_grants g
       join public.boss_route_stages s on s.id = g.stage_id
       join public.boss_routes r on r.id = s.route_id
       where r.is_active
     ) x
     join public.card_catalog c on c.id = x.evolution_card_catalog_id),
    14 * 15, '210 route cards (14 x (4 evolutions + 11 grants)) all resolve to card_catalog rows');

  perform pg_temp.assert_eq(
    (select count(distinct x.card_id)::integer
     from (
       select s.evolution_card_catalog_id as card_id from public.boss_route_stages s join public.boss_routes r on r.id = s.route_id where r.is_active
       union all
       select g.card_catalog_id
       from public.boss_route_stage_grants g
       join public.boss_route_stages s on s.id = g.stage_id
       join public.boss_routes r on r.id = s.route_id
       where r.is_active
     ) x),
    210, 'no card is used twice (within or across routes)');

  -- Season 1 routes nobody holds are gone; v3 routes have no
  -- achievement gates (2.0 evolution is DP only).
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.boss_routes r
     where not r.is_active and not exists (select 1 from public.player_boss_paths p where p.route_id = r.id)),
    0, 'retired routes without a player path are deleted');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.boss_route_achievement_events e join public.boss_routes r on r.id = e.route_id where r.is_active),
    0, 'v3 routes have no achievement events');
end;
$$;

-- ---------------------------------------------------------
-- 2. Retired routes cannot be chosen
-- ---------------------------------------------------------
select pg_temp.reset_players();

do $$
declare
  retired uuid;
begin
  delete from public.player_boss_paths where profile_id = pg_temp.uid_of('bossg');

  -- A retired route as it looks on production between the migration
  -- and the Season 2 reset (rolled back).
  insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
  values ('test_retired_s1', 'Retired Season 1 route', 150, 'gone', '{}'::jsonb, 'A', false)
  returning id into retired;

  insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
  values (retired, 1, pg_temp.card('Dark Magician'), null);

  perform pg_temp.act_as('bossg');
  perform pg_temp.expect_error(
    format('select public.choose_boss_path(%L)', retired),
    'not found or inactive',
    'choose_boss_path refuses a retired route');

  perform public.choose_boss_path((select id from public.boss_routes where code = 's2_six_samurai'));
  perform pg_temp.expect_error(
    format('select public.unlock_second_third_boss_path(2, %L)', retired),
    'not found or inactive',
    'a retired route cannot be unlocked as slot 2 either');

  perform pg_temp.assert_eq(public.is_boss_route_exempt_card(pg_temp.card('The Six Samurai - Zanji')), true,
    'The Six Samurai - Zanji is exempt through the active Six Samurai route');
  perform pg_temp.assert_eq(public.is_boss_route_exempt_card(pg_temp.card('Dark Magician')), false,
    'Dark Magician (only on the retired test route) is not exempt');

  perform pg_temp.assert_eq(
    (select count(*)::integer
     from public.player_boss_stage_unlocks u
     join public.player_boss_paths p on p.id = u.player_boss_path_id
     where p.profile_id = pg_temp.uid_of('bossg')),
    1, 'choosing the Six Samurai route unlocks stage 1');
  perform pg_temp.assert_true(
    exists (
      select 1
      from public.card_instances ci
      join public.player_boss_paths p on p.id = ci.original_source_id
      where p.profile_id = pg_temp.uid_of('bossg')
        and ci.card_catalog_id = pg_temp.card('Shien''s Smoke Signal')
    ),
    'stage 1 grants arrive (Shien''s Smoke Signal)');
end;
$$;

-- ---------------------------------------------------------
-- 3. Exemption: owner only, in-pool limits stay
-- ---------------------------------------------------------
do $$
declare
  v2 public.duelist_circle_formats;
  rihan uuid := pg_temp.card('Secret Six Samurai - Rihan');  -- Six Samurai route Boss, post-2014 (outside the pool)
  kizaru uuid := pg_temp.card('Secret Six Samurai - Kizaru'); -- Six Samurai route exclusive grant, post-2014
  sorcerer uuid := pg_temp.card('Chaos Sorcerer');       -- Chaos route stage 3, IN the pool, semi-limited
  bossg_path uuid;
  bossg_deck uuid;
  samo_deck uuid;
  samo_rihan uuid;
  bossg_rihan uuid;
  samo_league uuid;
begin
  select * into v2 from public.duelist_circle_formats where code = 'duelist_circle_classic_v2';
  update public.duelist_circle_formats set is_active = false where is_active;
  update public.duelist_circle_formats set is_active = true where id = v2.id;
  update public.card_catalog c
  set format_eligible = public.is_duelist_circle_format_eligible(c.id, v2.id);

  perform pg_temp.assert_eq((select format_eligible from public.card_catalog where id = rihan), false,
    'Secret Six Samurai - Rihan is outside the Classic pool');
  perform pg_temp.assert_eq((select format_eligible from public.card_catalog where id = kizaru), false,
    'Secret Six Samurai - Kizaru is outside the Classic pool');
  perform pg_temp.assert_eq(public.is_boss_route_reserved_card(rihan), true,
    'a stage-4 Boss is reserved (never in packs / draft / shop)');
  perform pg_temp.assert_eq(public.is_boss_route_reserved_card(kizaru), true,
    'an exclusive grant is reserved');

  -- bossg has the Six Samurai route (section 2), samo picks Ancient Gear.
  delete from public.player_boss_paths where profile_id = pg_temp.uid_of('samo');
  perform pg_temp.act_as('samo');
  perform public.choose_boss_path((select id from public.boss_routes where code = 's2_ancient_gear'));

  perform pg_temp.assert_eq(public.is_duelist_circle_deck_legal_for(rihan, pg_temp.uid_of('bossg')), true,
    'route owner: Secret Six Samurai - Rihan is deck-legal');
  perform pg_temp.assert_eq(public.is_duelist_circle_deck_legal_for(rihan, pg_temp.uid_of('samo')), false,
    'other player: Secret Six Samurai - Rihan is NOT deck-legal');
  perform pg_temp.assert_eq(public.is_duelist_circle_deck_legal_for(kizaru, pg_temp.uid_of('samo')), false,
    'other player: Secret Six Samurai - Kizaru is NOT deck-legal');
  perform pg_temp.assert_eq(public.is_duelist_circle_deck_legal_for(
      pg_temp.card('Ancient Gear Wyvern'), pg_temp.uid_of('samo')), true,
    'samo''s own pool-external grant (Ancient Gear Wyvern) is deck-legal for samo');
  perform pg_temp.assert_eq(public.is_duelist_circle_deck_legal_for(
      pg_temp.card('Ancient Gear Wyvern'), pg_temp.uid_of('bossg')), false,
    '...but not for bossg');

  -- Copy limits: waived only for route cards outside the pool.
  perform pg_temp.assert_eq(public.duelist_circle_deck_copy_limit(rihan), null::integer,
    'Secret Six Samurai - Rihan (outside the pool): no deck limit through the exemption');
  perform pg_temp.assert_eq(public.duelist_circle_deck_copy_limit(sorcerer), 2,
    'Chaos Sorcerer (route evolution, IN the pool): keeps its semi-limit of 2');

  -- Through the real deck path: bossg reaches stage 4 and decks Rihan...
  select id into bossg_path from public.player_boss_paths where profile_id = pg_temp.uid_of('bossg') and route_slot = 1;
  perform public._boss_route_grant_stage(bossg_path, 4);
  select ci.id into bossg_rihan
  from public.card_instances ci
  where ci.current_owner_id = pg_temp.uid_of('bossg') and ci.card_catalog_id = rihan
  limit 1;
  perform pg_temp.assert_true(bossg_rihan is not null, 'stage 4 grants the Boss to its owner');

  perform pg_temp.act_as('bossg');
  bossg_deck := public.create_deck(
    (select league_id from public.league_members where profile_id = pg_temp.uid_of('bossg')),
    'SQL test boss deck');
  perform public.add_card_to_deck(bossg_deck, bossg_rihan);
  perform pg_temp.assert_eq(
    (select section::text from public.deck_cards where deck_id = bossg_deck and card_instance_id = bossg_rihan),
    'extra', 'the route owner can put Secret Six Samurai - Rihan in a deck (Extra Deck)');

  -- ...while a copy in samo's hands (e.g. a trade) is refused.
  select league_id into samo_league from public.league_members where profile_id = pg_temp.uid_of('samo');
  perform set_config('app.boss_route_grant', 'true', true);
  insert into public.card_instances (league_id, card_catalog_id, copy_number, current_owner_id, original_owner_id, original_acquisition_type)
  values (samo_league, rihan, 0, pg_temp.uid_of('samo'), pg_temp.uid_of('samo'), 'development')
  returning id into samo_rihan;
  perform set_config('app.boss_route_grant', '', true);

  perform pg_temp.act_as('samo');
  samo_deck := public.create_deck(samo_league, 'SQL test samo deck');
  perform pg_temp.expect_error(
    format('select public.add_card_to_deck(%L, %L)', samo_deck, samo_rihan),
    'not legal in the Duelist Circle format',
    'another player cannot deck Secret Six Samurai - Rihan');

  -- Exemption switched off: even the owner follows the pool.
  update public.duelist_circle_formats set boss_route_exempt = false where id = v2.id;
  perform pg_temp.assert_eq(public.is_duelist_circle_deck_legal_for(rihan, pg_temp.uid_of('bossg')), false,
    'exemption off: the owner cannot deck Secret Six Samurai - Rihan either');
end;
$$;
