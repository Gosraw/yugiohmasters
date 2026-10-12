-- Fix 6: Boss evolution needs DP only (no achievement events), and
-- every price comes from configuration:
--   * stage prices: boss_route_stages.dp_cost_to_reach (seeded
--     900 / 1,400 / 2,400 - the current live values)
--   * route slot prices: league_economy_defaults (7,000 / 10,000)
-- Changing a number in those tables changes what is charged, no code
-- change needed. _boss_route_grant_stage is not callable from the API.

select pg_temp.reset_players();

do $$
declare
  route_one uuid;
  route_two uuid;
  path_id uuid;
  second_path uuid;
  tx public.duel_point_transactions%rowtype;
  wrong_stage_prices integer;
begin
  -- Seeded with the CURRENT numbers (the proposal is not applied).
  select count(*) into wrong_stage_prices
  from public.boss_route_stages
  where (stage_number = 1 and dp_cost_to_reach is not null)
     or (stage_number = 2 and dp_cost_to_reach <> 900)
     or (stage_number = 3 and dp_cost_to_reach <> 1400)
     or (stage_number = 4 and dp_cost_to_reach <> 2400);
  perform pg_temp.assert_eq(wrong_stage_prices, 0, 'stage prices are the current 900 / 1400 / 2400');
  perform pg_temp.assert_eq(
    (select boss_route_slot_2_unlock_dp from public.league_economy_defaults),
    7000,
    'slot 2 price seeded at the current 7000'
  );
  perform pg_temp.assert_eq(
    (select boss_route_slot_3_unlock_dp from public.league_economy_defaults),
    10000,
    'slot 3 price seeded at the current 10000'
  );

  -- Fresh Boss Path for bossg (test setup; rolled back).
  delete from public.player_boss_paths where profile_id = pg_temp.uid_of('bossg');

  select r.id into route_one
  from public.boss_routes r
  where r.is_active
    and exists (
      select 1
      from public.boss_route_achievement_requirements q
      join public.boss_route_stages s on s.id = q.target_stage_id
      where s.route_id = r.id and s.stage_number = 2
    )
  order by r.name
  limit 1;

  perform pg_temp.act_as('bossg');
  perform public.choose_boss_path(route_one);

  select id into path_id
  from public.player_boss_paths
  where profile_id = pg_temp.uid_of('bossg') and route_slot = 1;

  -- Not enough DP -> refused, nothing charged.
  perform public._credit_duel_points(pg_temp.uid_of('bossg'), 899, 'test_setup');
  begin
    perform public.evolve_boss_stage(path_id, 2);
    raise exception 'FAILED: evolved with too little DP';
  exception
    when raise_exception then
      if sqlerrm <> 'Not enough Duel Points.' then
        raise;
      end if;
      raise notice 'ok: evolving without enough DP is refused';
  end;

  -- Enough DP, and NO achievement events confirmed: evolves.
  perform public._credit_duel_points(pg_temp.uid_of('bossg'), 1, 'test_setup');
  perform pg_temp.assert_eq(
    (select count(*) from public.player_boss_achievement_events where player_boss_path_id = path_id)::integer,
    0,
    'no achievement events confirmed for this path'
  );
  perform public.evolve_boss_stage(path_id, 2);

  perform pg_temp.assert_eq(
    (select current_stage from public.player_boss_paths where id = path_id),
    2,
    'stage 2 reached with DP only (the route has achievement requirements for stage 2, they are ignored)'
  );
  perform pg_temp.assert_eq(pg_temp.balance('bossg'), 0, 'exactly 900 DP charged for stage 2');

  select * into tx
  from public.duel_point_transactions
  where profile_id = pg_temp.uid_of('bossg') and reason = 'boss_route_stage_evolve'
  order by seq desc
  limit 1;
  perform pg_temp.assert_eq(tx.amount, -900, 'ledger row -900');
  perform pg_temp.assert_true(tx.description like 'Boss evolved: % to stage 2 (%)', 'evolve ledger row names the route and card');

  -- The owner changes a price in the table: the next evolve uses it.
  update public.boss_route_stages set dp_cost_to_reach = 1234 where route_id = route_one and stage_number = 3;
  perform public._credit_duel_points(pg_temp.uid_of('bossg'), 2000, 'test_setup');
  perform public.evolve_boss_stage(path_id, 3);
  perform pg_temp.assert_eq(pg_temp.balance('bossg'), 2000 - 1234, 'stage 3 charged the configured 1234, not a hardcoded number');

  -- Slot 2 price from league_economy_defaults.
  update public.league_economy_defaults set boss_route_slot_2_unlock_dp = 4321;
  perform public._credit_duel_points(pg_temp.uid_of('bossg'), 4321, 'test_setup');

  select r.id into route_two
  from public.boss_routes r
  where r.is_active and r.id <> route_one
  order by r.name
  limit 1;

  second_path := public.unlock_second_third_boss_path(2, route_two);
  perform pg_temp.assert_eq(pg_temp.balance('bossg'), 2000 - 1234, 'slot 2 charged the configured 4321');
  perform pg_temp.assert_eq(
    (select dp_charged_for_unlock from public.player_boss_paths where id = second_path),
    4321,
    'path records the configured slot price'
  );
  perform pg_temp.assert_true(
    exists (
      select 1 from public.duel_point_transactions
      where profile_id = pg_temp.uid_of('bossg')
        and reason = 'boss_route_unlock_slot'
        and amount = -4321
        and description like 'Unlocked Boss Route slot 2: %'
    ),
    'slot unlock ledger row with description'
  );

  -- A price must stay a positive number.
  begin
    update public.boss_route_stages set dp_cost_to_reach = 0 where route_id = route_one and stage_number = 4;
    raise exception 'FAILED: stage price 0 accepted';
  exception
    when check_violation then
      raise notice 'ok: a stage price must be > 0';
  end;
end;
$$;

do $$
begin
  begin
    set local role authenticated;
    perform public._boss_route_grant_stage(gen_random_uuid(), 4);
    raise exception 'FAILED: authenticated could call _boss_route_grant_stage';
  exception
    when insufficient_privilege then
      raise notice 'ok: authenticated cannot grant itself Boss stages via _boss_route_grant_stage';
  end;
end;
$$;
