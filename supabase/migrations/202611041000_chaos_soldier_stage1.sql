-- =========================================================
-- Chaos Soldier: Breaker the Magical Warrior added to Stage 1
-- (owner decision, 2026-11-04)
--
-- Why: Super Soldier Synthesis needs a LIGHT and a DARK monster with
-- exactly 8 Levels together. Stage 1 only had the LIGHT half (D.D.
-- Warrior Lady); the route's DARK half (Envoy of Chaos) arrives at
-- Stage 2. Breaker is a DARK Level 4, so Stage 1 now has both halves.
-- Nothing is removed or moved.
--
-- This makes it the one route with 12 support grants instead of 11; the
-- owner knows. data/boss-route-registry-v3.mjs keeps the launch list:
-- this later migration overrides it on a replay.
--
-- A player who already holds the route gets the card too.
--
-- One transaction. Safe to run twice. Backwards compatible.
-- =========================================================

begin;

do $chaos$
declare
  v_route uuid;
  v_stage1 uuid;
  v_breaker uuid;
  v_path public.player_boss_paths%rowtype;
  v_next_copy integer;
begin
  select id into strict v_route from public.boss_routes where code = 's2_chaos_bls';
  select id into strict v_stage1 from public.boss_route_stages where route_id = v_route and stage_number = 1;
  select id into strict v_breaker from public.card_catalog where name = 'Breaker the Magical Warrior';

  insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
  values (v_stage1, v_breaker, false, 1)
  on conflict (stage_id, card_catalog_id) do nothing;

  -- A guaranteed route grant never fails on scarcity, same as
  -- _boss_route_grant_stage.
  perform set_config('app.boss_route_grant', 'true', true);

  for v_path in
    select *
    from public.player_boss_paths
    where route_id = v_route
  loop
    if not exists (
      select 1
      from public.card_instances
      where original_source_id = v_path.id
        and card_catalog_id = v_breaker
    ) then
      select coalesce(max(copy_number), 0) + 1
      into v_next_copy
      from public.card_instances
      where league_id = v_path.league_id
        and card_catalog_id = v_breaker;

      insert into public.card_instances (
        league_id,
        card_catalog_id,
        current_owner_id,
        original_owner_id,
        original_acquisition_type,
        original_source_id,
        copy_number,
        acquired_at,
        locked
      )
      values (
        v_path.league_id,
        v_breaker,
        v_path.profile_id,
        v_path.profile_id,
        'achievement',
        v_path.id,
        v_next_copy,
        now(),
        false
      );
    end if;
  end loop;
end;
$chaos$;

commit;
