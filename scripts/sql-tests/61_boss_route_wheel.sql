-- Boss Path wheel (202610301400): a new player's first Boss Path is
-- a random route that nobody in the league holds yet, decided by
-- spin_boss_path_wheel() on the server, once and for good.
--   1. the wheel only lands on free, active routes (and it is random)
--   2. one spin = your path: calling again returns the same route,
--      Stage 1 is granted exactly once
--   3. players never share a route; the claim lock is taken; no free
--      route left gives a friendly error
--   4. choose_boss_path refuses a new slot-1 route from the API role
--      (no bypassing the wheel) but stays backwards compatible
--   5. slots 2 / 3: only routes nobody holds, refused before DP moves
--   6. before the Season 2 reset (players on retired routes)
--   7. the welcome flow after the wheel: Initial Draft + 3 packs
-- No route codes are hardcoded: the test works for any set of active
-- routes (it needs at least 4).

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

-- Like an API call: PostgREST switches to the authenticated role.
create function pg_temp.api_error(statement text)
returns text
language plpgsql
as $$
declare
  message text;
begin
  perform set_config('role', 'authenticated', true);
  begin
    execute statement;
  exception
    when others then
      message := sqlerrm;
  end;
  perform set_config('role', 'none', true);
  return message;
end;
$$;

create function pg_temp.api_uuid(statement text)
returns uuid
language plpgsql
as $$
declare
  result uuid;
begin
  perform set_config('role', 'authenticated', true);
  execute statement into result;
  perform set_config('role', 'none', true);
  return result;
end;
$$;

create function pg_temp.slot1(target_username text)
returns public.player_boss_paths
language sql
stable
as $$
  select * from public.player_boss_paths
  where profile_id = pg_temp.uid_of(target_username) and route_slot = 1;
$$;

create function pg_temp.league()
returns uuid
language sql
stable
as $$
  select league_id from public.league_members where profile_id = pg_temp.uid_of('bossg');
$$;

-- Test fixture (rolled back): exactly four active routes R1-R4 (the
-- first four by display order), all other routes inactive, nobody in
-- the league holds a Boss Path, plus one retired route with a Stage 1.
create temporary table wheel_routes (n integer primary key, id uuid not null) on commit drop;

do $$
declare
  league uuid := pg_temp.league();
  retired uuid;
begin
  perform pg_temp.assert_true(league is not null, 'test setup: bossg is in a league');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.league_members where league_id = league and profile_id in (
      pg_temp.uid_of('bossg'), pg_temp.uid_of('samo'), pg_temp.uid_of('fardin'))),
    3, 'test setup: bossg, samo and fardin share the league');

  insert into wheel_routes (n, id)
  select row_number() over (order by r.display_order), r.id
  from public.boss_routes r
  where r.is_active
    and exists (select 1 from public.boss_route_stages s where s.route_id = r.id and s.stage_number = 1)
  order by r.display_order
  limit 4;

  perform pg_temp.assert_eq((select count(*)::integer from wheel_routes), 4, 'test setup: at least 4 active routes');

  delete from public.player_boss_paths
  where profile_id in (select profile_id from public.league_members where league_id = league);

  update public.boss_routes set is_active = false
  where is_active and id not in (select id from wheel_routes);

  -- R4 stays out of the way until section 5.
  update public.boss_routes set is_active = false where id = (select id from wheel_routes where n = 4);

  insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)
  values ('test_wheel_retired', 'Retired test route', 990, 'gone', '{}'::jsonb, 'A', false)
  returning id into retired;

  insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
  select retired, 1, s.evolution_card_catalog_id, null
  from public.boss_route_stages s
  where s.route_id = (select id from wheel_routes where n = 1) and s.stage_number = 1;

  insert into wheel_routes (n, id) values (99, retired);
end;
$$;

-- ---------------------------------------------------------
-- 1. Only free, active routes - and it really is random
-- ---------------------------------------------------------
do $$
declare
  r1 uuid := (select id from wheel_routes where n = 1);
  r2 uuid := (select id from wheel_routes where n = 2);
  r3 uuid := (select id from wheel_routes where n = 3);
  picked uuid;
  seen uuid[] := '{}';
begin
  -- fardin holds R1. A bare row is enough here (no Stage 1 cards):
  -- every Stage grant adds a numbered copy and a card may only have
  -- copies 1-3 per league, so the test grants each route as rarely
  -- as possible.
  insert into public.player_boss_paths (profile_id, league_id, route_slot, route_id)
  values (pg_temp.uid_of('fardin'), pg_temp.league(), 1, r1);

  perform pg_temp.act_as('samo');
  perform pg_temp.assert_eq(public.boss_path_free_routes(), array[r2, r3],
    'boss_path_free_routes: only active routes nobody holds (R1 held, R4 + retired inactive)');

  -- 30 spins, each rolled back right away.
  for i in 1..30 loop
    picked := null;
    begin
      picked := (public.spin_boss_path_wheel()->>'route_id')::uuid;
      raise exception 'undo spin';
    exception
      when others then
        if sqlerrm <> 'undo spin' then
          raise;
        end if;
    end;
    seen := seen || picked;
  end loop;

  perform pg_temp.assert_true(r1 <> all(seen), 'the wheel never lands on a route another player holds');
  perform pg_temp.assert_true((select id from wheel_routes where n = 99) <> all(seen), 'the wheel never lands on a retired route');
  perform pg_temp.assert_true((select id from wheel_routes where n = 4) <> all(seen), 'the wheel never lands on an inactive route');
  perform pg_temp.assert_true(r2 = any(seen) and r3 = any(seen), 'the wheel is random (both free routes came up in 30 spins)');
  perform pg_temp.assert_eq(pg_temp.slot1('samo') is null, true, 'rolled-back spins left nothing behind');
end;
$$;

-- ---------------------------------------------------------
-- 2. One spin = your path; Stage 1 granted once
-- ---------------------------------------------------------
do $$
declare
  first_spin jsonb;
  second_spin jsonb;
  path public.player_boss_paths;
  expected_cards integer;
  cards_after_first integer;
begin
  perform pg_temp.act_as('samo');

  first_spin := public.spin_boss_path_wheel();
  path := pg_temp.slot1('samo');

  perform pg_temp.assert_eq((first_spin->>'newly_assigned')::boolean, true, 'first spin assigns a route');
  perform pg_temp.assert_eq((first_spin->>'player_boss_path_id')::uuid, path.id, 'the spin returns the new slot-1 path');
  perform pg_temp.assert_eq((first_spin->>'route_id')::uuid, path.route_id, 'the spin returns the assigned route');
  perform pg_temp.assert_true(path.route_id in (select id from wheel_routes where n in (2, 3)), 'samo got a free route');
  perform pg_temp.assert_eq(
    first_spin->>'route_code',
    (select code from public.boss_routes where id = path.route_id),
    'the spin returns the route code (for the wheel animation)');
  perform pg_temp.assert_eq(path.current_stage, 1, 'the new path starts at Stage 1');
  perform pg_temp.assert_eq(path.dp_charged_for_unlock, 0, 'the first Boss Path is free');

  perform pg_temp.assert_eq(
    (select count(*)::integer from public.player_boss_stage_unlocks where player_boss_path_id = path.id),
    1, 'Stage 1 is unlocked');

  select 1 + coalesce(sum(g.quantity), 0)::integer
  into expected_cards
  from public.boss_route_stages s
  left join public.boss_route_stage_grants g on g.stage_id = s.id
  where s.route_id = path.route_id and s.stage_number = 1;

  select count(*)::integer into cards_after_first
  from public.card_instances
  where original_source_id = path.id and current_owner_id = pg_temp.uid_of('samo');

  perform pg_temp.assert_eq(cards_after_first, expected_cards, 'Stage 1 grants arrive (Boss monster + every Stage 1 grant)');
  perform pg_temp.assert_true(
    exists (
      select 1 from public.card_instances ci
      join public.boss_route_stages s on s.evolution_card_catalog_id = ci.card_catalog_id
      where ci.original_source_id = path.id and s.route_id = path.route_id and s.stage_number = 1
    ),
    'the Stage 1 Boss monster is in samo''s collection');

  -- Reload / double tap / a second tab.
  second_spin := public.spin_boss_path_wheel();
  perform pg_temp.assert_eq((second_spin->>'newly_assigned')::boolean, false, 'a second spin does not roll again');
  perform pg_temp.assert_eq((second_spin->>'route_id')::uuid, path.route_id, 'a second spin returns the same route');
  perform pg_temp.assert_eq((second_spin->>'player_boss_path_id')::uuid, path.id, 'a second spin returns the same path');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.player_boss_paths where profile_id = pg_temp.uid_of('samo')),
    1, 'still exactly one Boss Path');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.card_instances where original_source_id = path.id),
    cards_after_first, 'Stage 1 is not granted twice');

  -- Through the API role too (the grant the app uses).
  perform pg_temp.assert_eq(
    pg_temp.api_uuid('select (public.spin_boss_path_wheel()->>''route_id'')::uuid'),
    path.route_id, 'the API role can spin and gets the same route back');
end;
$$;

-- ---------------------------------------------------------
-- 3. Never the same route; claim lock; nothing left
-- ---------------------------------------------------------
do $$
declare
  league uuid := pg_temp.league();
  samo_route uuid := (pg_temp.slot1('samo')).route_id;
  bossg_spin jsonb;
begin
  -- bossg spins while samo and fardin hold two of the three routes:
  -- exactly one is left, and he must get that one.
  perform pg_temp.act_as('bossg');
  bossg_spin := public.spin_boss_path_wheel();

  perform pg_temp.assert_eq(
    (bossg_spin->>'route_id')::uuid,
    (select id from wheel_routes where n in (2, 3) and id <> samo_route),
    'the last free route goes to bossg');
  perform pg_temp.assert_eq(
    (select count(distinct p.route_id)::integer
     from public.player_boss_paths p
     join public.league_members lm on lm.profile_id = p.profile_id and lm.league_id = league),
    3, 'three players, three different routes');
  perform pg_temp.assert_eq(
    (select count(*)::integer
     from (select p.route_id
           from public.player_boss_paths p
           join public.league_members lm on lm.profile_id = p.profile_id and lm.league_id = league
           group by p.route_id
           having count(*) > 1) d),
    0, 'no route is held twice in the league');

  -- The spin took the per-league claim lock that also serialises the
  -- other players' spins and slot unlocks (held until commit).
  perform pg_temp.assert_true(
    exists (
      select 1 from pg_locks l
      where l.locktype = 'advisory'
        and l.pid = pg_backend_pid()
        and l.granted
        and l.objid::bigint = (hashtext('boss_route_claim_' || league::text)::bigint & 4294967295)
    ),
    'spinning takes the league-wide route claim lock');

  -- A 4th player when every route is taken: friendly error. (samo
  -- without a path stands in for that player; rolled back below.)
  begin
    delete from public.player_boss_paths where profile_id = pg_temp.uid_of('samo');
    update public.boss_routes set is_active = false where id = samo_route;
    perform pg_temp.act_as('samo');
    perform pg_temp.assert_eq(public.boss_path_free_routes(), '{}'::uuid[], 'no free route left');
    perform pg_temp.expect_error(
      'select public.spin_boss_path_wheel()',
      'Every Boss Path is already taken in your league',
      'no free route: the wheel refuses with a clear message');
    perform pg_temp.assert_eq(pg_temp.slot1('samo') is null, true, 'nothing was assigned');
    raise exception 'undo section 3';
  exception
    when others then
      if sqlerrm <> 'undo section 3' then
        raise;
      end if;
  end;

  perform pg_temp.assert_eq((pg_temp.slot1('samo')).route_id, samo_route, 'test setup: samo has his route back');
end;
$$;

-- ---------------------------------------------------------
-- 4. No bypassing the wheel through choose_boss_path
-- ---------------------------------------------------------
do $$
declare
  free_route uuid;
  bossg_path public.player_boss_paths := pg_temp.slot1('bossg');
  other_route uuid := (select id from wheel_routes where n = 1);
  raised text;
begin
  perform pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.choose_boss_path(uuid)', 'execute'),
    'choose_boss_path keeps its signature and grant (old app call site)');
  perform pg_temp.assert_true(
    not has_function_privilege('anon', 'public.spin_boss_path_wheel()', 'execute')
    and has_function_privilege('authenticated', 'public.spin_boss_path_wheel()', 'execute'),
    'spin_boss_path_wheel: players only, not anon');
  perform pg_temp.assert_true(
    not has_function_privilege('authenticated', 'public._boss_path_start(uuid,uuid,integer,uuid,integer)', 'execute')
    and not has_function_privilege('authenticated', 'public._boss_route_claim_lock(uuid)', 'execute'),
    'the internal helpers are not callable by players');

  -- A player without a Boss Path while a route is free (samo stands
  -- in, rolled back right after): the API cannot pick it directly.
  begin
    delete from public.player_boss_paths where profile_id = pg_temp.uid_of('samo');
    perform pg_temp.act_as('samo');
    free_route := (public.boss_path_free_routes())[1];
    perform pg_temp.assert_true(free_route is not null, 'test setup: a free route for samo');

    raised := pg_temp.api_error(format('select public.choose_boss_path(%L)', free_route));
    perform pg_temp.assert_true(
      position('decided by the wheel' in coalesce(raised, '')) > 0,
      'a direct API call to choose_boss_path for slot 1 is refused');
    perform pg_temp.assert_eq(pg_temp.slot1('samo') is null, true, 'the refused call assigned nothing');
    raise exception 'undo section 4';
  exception
    when others then
      if sqlerrm <> 'undo section 4' then
        raise;
      end if;
  end;

  -- Backwards compatible: a retry for the route you already hold.
  perform pg_temp.act_as('bossg');
  perform pg_temp.assert_eq(
    pg_temp.api_uuid(format('select public.choose_boss_path(%L)', bossg_path.route_id)),
    bossg_path.id,
    'choose_boss_path still returns the slot-1 path a player already holds');
  raised := pg_temp.api_error(format('select public.choose_boss_path(%L)', other_route));
  perform pg_temp.assert_true(
    position('already chosen a different first Boss Route' in coalesce(raised, '')) > 0,
    'choose_boss_path cannot swap an existing first route');

  -- Trusted sessions still have to respect "one route per league".
  begin
    delete from public.player_boss_paths where profile_id = pg_temp.uid_of('samo');
    perform pg_temp.act_as('samo');
    perform pg_temp.expect_error(
      format('select public.choose_boss_path(%L)', other_route),
      'already has this Boss Path',
      'trusted choose_boss_path refuses a route another player holds');
    raise exception 'undo section 4b';
  exception
    when others then
      if sqlerrm <> 'undo section 4b' then
        raise;
      end if;
  end;
end;
$$;

-- ---------------------------------------------------------
-- 5. Slots 2 / 3: free choice among routes nobody holds
-- ---------------------------------------------------------
select pg_temp.reset_players();

do $$
declare
  r4 uuid := (select id from wheel_routes where n = 4);
  samo_route uuid := (pg_temp.slot1('samo')).route_id;
  fardin_route uuid := (pg_temp.slot1('fardin')).route_id;
  retired uuid := (select id from wheel_routes where n = 99);
  slot2 uuid;
  slot2_price integer;
begin
  update public.boss_routes set is_active = true where id = r4;

  perform public._credit_duel_points(pg_temp.uid_of('bossg'), 50000, 'test_setup');
  select boss_route_slot_2_unlock_dp into slot2_price from public.league_economy_defaults;

  perform pg_temp.act_as('bossg');
  perform pg_temp.assert_eq(public.boss_path_free_routes(), array[r4], 'only R4 is free for slot 2');

  perform pg_temp.expect_error(
    format('select public.unlock_second_third_boss_path(2, %L)', samo_route),
    'already has this Boss Path',
    'slot 2 refuses a route another player holds');
  perform pg_temp.expect_error(
    format('select public.unlock_second_third_boss_path(2, %L)', retired),
    'not found or inactive',
    'slot 2 refuses a retired route');
  perform pg_temp.assert_eq(pg_temp.balance('bossg'), 50000, 'a refused unlock costs no DP');

  slot2 := public.unlock_second_third_boss_path(2, r4);
  perform pg_temp.assert_eq((select route_id from public.player_boss_paths where id = slot2), r4, 'slot 2: a free route can be chosen');
  perform pg_temp.assert_eq(pg_temp.balance('bossg'), 50000 - slot2_price, 'slot 2 charged its configured price once');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.player_boss_stage_unlocks where player_boss_path_id = slot2),
    1, 'slot 2: Stage 1 is unlocked');
  perform pg_temp.assert_eq(
    public.unlock_second_third_boss_path(2, r4), slot2, 'slot 2 retry returns the same path (no second charge)');
  perform pg_temp.assert_eq(pg_temp.balance('bossg'), 50000 - slot2_price, 'still charged only once');

  perform pg_temp.expect_error(
    format('select public.unlock_second_third_boss_path(3, %L)', fardin_route),
    'already has this Boss Path',
    'slot 3 refuses a route another player holds');
  perform pg_temp.assert_eq(pg_temp.balance('bossg'), 50000 - slot2_price, 'the refused slot 3 costs no DP');

  -- The slot-2 route is now off the wheel for everyone.
  perform pg_temp.act_as('samo');
  perform pg_temp.assert_true(r4 <> all(public.boss_path_free_routes()), 'a slot-2 route is no longer free for others');
end;
$$;

-- ---------------------------------------------------------
-- 6. Before the Season 2 reset: players still on retired routes
-- ---------------------------------------------------------
do $$
declare
  retired uuid := (select id from wheel_routes where n = 99);
  fardin_path public.player_boss_paths := pg_temp.slot1('fardin');
  spin jsonb;
begin
  -- fardin's slot 1 becomes a retired Season 1 route.
  update public.player_boss_paths set route_id = retired where id = fardin_path.id;

  perform pg_temp.act_as('fardin');
  spin := public.spin_boss_path_wheel();
  perform pg_temp.assert_eq((spin->>'player_boss_path_id')::uuid, fardin_path.id,
    'a player on a retired route keeps it (the wheel returns the existing path)');
  perform pg_temp.assert_eq((spin->>'newly_assigned')::boolean, false, 'no new roll for a player who already has a route');
  perform pg_temp.assert_true(retired <> all(public.boss_path_free_routes()), 'a retired route is never on the wheel');
  perform pg_temp.assert_true(
    (select id from wheel_routes where n = 1) = any(public.boss_path_free_routes()),
    'the active route fardin gave up is free again');
end;
$$;

-- ---------------------------------------------------------
-- 7. After the wheel: Initial Draft, then the 3 welcome packs
-- ---------------------------------------------------------
select pg_temp.reset_players();

-- Start fardin's onboarding from scratch (rolled back): no draft,
-- no Boss Path, no welcome claim.
delete from public.draft_picks where draft_player_id in (select id from public.draft_players where profile_id = pg_temp.uid_of('fardin'));
delete from public.draft_offer_cards where offer_id in (
  select o.id from public.draft_offers o
  join public.draft_players dp on dp.id = o.draft_player_id
  where dp.profile_id = pg_temp.uid_of('fardin')
);
delete from public.draft_offers where draft_player_id in (select id from public.draft_players where profile_id = pg_temp.uid_of('fardin'));
delete from public.draft_players where profile_id = pg_temp.uid_of('fardin');
delete from public.player_boss_paths where profile_id = pg_temp.uid_of('fardin');
delete from public.season1_welcome_bonus_claims where profile_id = pg_temp.uid_of('fardin');

do $$
declare
  league uuid := pg_temp.league();
  draft_id uuid;
  raised text;
begin
  perform pg_temp.act_as('fardin');

  raised := null;
  begin
    perform public.start_personal_initial_draft(league);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_true(raised is not null, 'no Initial Draft before the wheel');

  perform pg_temp.assert_eq(
    (public.spin_boss_path_wheel()->>'newly_assigned')::boolean, true, 'fardin spins the wheel');

  draft_id := public.start_personal_initial_draft(league);
  perform pg_temp.assert_true(draft_id is not null, 'after the wheel the Initial Draft starts');

  perform pg_temp.assert_eq(public.claim_welcome_packs(), true, 'the welcome bonus is granted');
  perform pg_temp.assert_eq(public.claim_welcome_packs(), false, 'the welcome bonus is granted only once');
  perform pg_temp.assert_eq(
    (select jsonb_object_agg(voucher_type, quantity)
     from (select voucher_type, sum(quantity)::integer as quantity
           from public.reward_vouchers
           where profile_id = pg_temp.uid_of('fardin')
           group by voucher_type) v),
    '{"normal_pack": 1, "premium_pack": 1, "deluxe_pack": 1}'::jsonb,
    'welcome packs: 1 Standard, 1 Premium, 1 Deluxe');
end;
$$;
