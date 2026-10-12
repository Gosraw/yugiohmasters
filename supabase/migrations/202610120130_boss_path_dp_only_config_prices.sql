-- =========================================================
-- 2.0 rewards, part 4: Boss Path = DP only, prices from config
--
-- 1. Boss achievement gates are REMOVED in 2.0 (docs/V2_PLAN.md,
--    Balance + Duels): evolve_boss_stage now only checks order and
--    DP. boss_route_achievement_requirements / events stay as data;
--    confirm_boss_achievement_event stays callable (the live app
--    still calls it after duels) but no longer influences anything.
-- 2. Prices are configuration, not code:
--      * stage prices: boss_route_stages.dp_cost_to_reach (already
--        read by evolve_boss_stage). The check constraint that froze
--        them at 900/1400/2400 is replaced by a shape check, so the
--        owner can change them with one UPDATE.
--      * route-slot prices: new columns on the single-row
--        league_economy_defaults table (slot 2 / slot 3).
--    Seeded with the CURRENT live values (900/1400/2400 and
--    7000/10000). The simulator proposal waits for owner approval in
--    supabase/proposals/season2_numbers.sql (NOT a migration).
-- 3. DP moves go through _debit_duel_points with an English
--    description.
-- 4. _boss_route_grant_stage hands out Boss cards with no ownership
--    or DP check; it was executable by every API role, so anyone
--    could grant themselves Stage 4. It is internal now.
-- =========================================================

-- ---------------------------------------------------------
-- Config
-- ---------------------------------------------------------

alter table public.league_economy_defaults
  add column if not exists boss_route_slot_2_unlock_dp integer not null default 7000,
  add column if not exists boss_route_slot_3_unlock_dp integer not null default 10000;

alter table public.league_economy_defaults
  drop constraint if exists league_economy_defaults_boss_slot_prices_check;

alter table public.league_economy_defaults
  add constraint league_economy_defaults_boss_slot_prices_check
  check (boss_route_slot_2_unlock_dp > 0 and boss_route_slot_3_unlock_dp > 0);

comment on column public.league_economy_defaults.boss_route_slot_2_unlock_dp is
  'DP price to unlock the 2nd Boss Route slot (stage 1 of the chosen route is granted). Read by unlock_second_third_boss_path.';
comment on column public.league_economy_defaults.boss_route_slot_3_unlock_dp is
  'DP price to unlock the 3rd Boss Route slot (stage 1 of the chosen route is granted). Read by unlock_second_third_boss_path.';

alter table public.boss_route_stages
  drop constraint if exists boss_route_stages_dp_cost_matches_locked_economy;

alter table public.boss_route_stages
  drop constraint if exists boss_route_stages_dp_cost_shape;

alter table public.boss_route_stages
  add constraint boss_route_stages_dp_cost_shape
  check (
    (stage_number = 1 and dp_cost_to_reach is null)
    or (stage_number > 1 and dp_cost_to_reach is not null and dp_cost_to_reach > 0)
  );

comment on column public.boss_route_stages.dp_cost_to_reach is
  'DP price to evolve INTO this stage (null for stage 1). Configuration: change with an UPDATE, no code change needed.';

-- ---------------------------------------------------------
-- evolve_boss_stage: DP only
-- ---------------------------------------------------------

create or replace function public.evolve_boss_stage(
  target_player_boss_path_id uuid,
  target_stage_number integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  path_row public.player_boss_paths%rowtype;
  stage_row public.boss_route_stages%rowtype;
  route_name text;
  card_name text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  if target_stage_number not in (2, 3, 4) then
    raise exception 'target_stage_number must be 2, 3, or 4.';
  end if;

  select *
  into path_row
  from public.player_boss_paths
  where id = target_player_boss_path_id
  for update;

  if not found then
    raise exception 'Boss path not found.';
  end if;

  if path_row.profile_id <> current_user_id then
    raise exception 'This is not your Boss Path.';
  end if;

  -- Idempotent no-op: already at or past this stage (retry/refresh).
  if path_row.current_stage >= target_stage_number then
    return;
  end if;

  if target_stage_number <> path_row.current_stage + 1 then
    raise exception 'Boss Route stages must be evolved in order.';
  end if;

  select *
  into stage_row
  from public.boss_route_stages
  where route_id = path_row.route_id
    and stage_number = target_stage_number;

  if not found then
    raise exception 'Boss route stage not found.';
  end if;

  if stage_row.dp_cost_to_reach is null or stage_row.dp_cost_to_reach <= 0 then
    raise exception 'This Boss stage has no price configured.';
  end if;

  select r.name
  into route_name
  from public.boss_routes r
  where r.id = path_row.route_id;

  select c.name
  into card_name
  from public.card_catalog c
  where c.id = stage_row.evolution_card_catalog_id;

  -- 2.0: no achievement requirements - DP is the only gate.
  perform public._debit_duel_points(
    current_user_id,
    stage_row.dp_cost_to_reach,
    'boss_route_stage_evolve',
    null,
    format('Evolved Boss Path %s to stage %s', target_player_boss_path_id, target_stage_number),
    jsonb_build_object(
      'player_boss_path_id', target_player_boss_path_id,
      'route_id', path_row.route_id,
      'stage_number', target_stage_number
    ),
    'Boss evolved: ' || coalesce(route_name, 'Boss Route')
      || ' to stage ' || target_stage_number
      || coalesce(' (' || card_name || ')', ''),
    false
  );

  update public.player_boss_paths
  set current_stage = target_stage_number
  where id = target_player_boss_path_id;

  perform public._boss_route_grant_stage(
    target_player_boss_path_id,
    target_stage_number
  );
end;
$$;

-- ---------------------------------------------------------
-- unlock_second_third_boss_path: price from league_economy_defaults
-- ---------------------------------------------------------

create or replace function public.unlock_second_third_boss_path(
  target_route_slot integer,
  target_route_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  current_league_id uuid;
  route_row public.boss_routes%rowtype;
  existing_path_id uuid;
  existing_route_id uuid;
  unlock_cost integer;
  new_path_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  if target_route_slot not in (2, 3) then
    raise exception 'target_route_slot must be 2 or 3.';
  end if;

  select case target_route_slot
    when 2 then d.boss_route_slot_2_unlock_dp
    when 3 then d.boss_route_slot_3_unlock_dp
  end
  into unlock_cost
  from public.league_economy_defaults d
  where d.id = true;

  if unlock_cost is null or unlock_cost <= 0 then
    raise exception 'Boss Route slot price is not configured.';
  end if;

  select lm.league_id
  into current_league_id
  from public.league_members lm
  where lm.profile_id = current_user_id
  limit 1;

  if current_league_id is null then
    raise exception 'Current user is not a league member.';
  end if;

  if not exists (
    select 1
    from public.player_boss_paths
    where profile_id = current_user_id
      and route_slot = target_route_slot - 1
  ) then
    raise exception 'You must unlock the previous Boss Route slot first.';
  end if;

  select *
  into route_row
  from public.boss_routes
  where id = target_route_id
    and is_active;

  if not found then
    raise exception 'Boss route not found or inactive.';
  end if;

  -- Idempotent: never re-charge or regrant Stage 1 on a retry once
  -- this slot has already been purchased.
  select id, route_id
  into existing_path_id, existing_route_id
  from public.player_boss_paths
  where profile_id = current_user_id
    and route_slot = target_route_slot
  for update;

  if found then
    if existing_route_id <> target_route_id then
      raise exception 'You have already chosen a different Boss Route for this slot.';
    end if;

    return existing_path_id;
  end if;

  if exists (
    select 1
    from public.player_boss_paths
    where profile_id = current_user_id
      and route_id = target_route_id
  ) then
    raise exception 'You have already chosen this Boss Route in another slot.';
  end if;

  perform public._debit_duel_points(
    current_user_id,
    unlock_cost,
    'boss_route_unlock_slot',
    null,
    format('Unlocked Boss Route slot %s', target_route_slot),
    jsonb_build_object(
      'route_slot', target_route_slot,
      'route_id', target_route_id
    ),
    'Unlocked Boss Route slot ' || target_route_slot || ': ' || route_row.name,
    false
  );

  insert into public.player_boss_paths (
    profile_id,
    league_id,
    route_slot,
    route_id,
    current_stage,
    dp_charged_for_unlock
  )
  values (
    current_user_id,
    current_league_id,
    target_route_slot,
    target_route_id,
    1,
    unlock_cost
  )
  returning id
  into new_path_id;

  perform public._boss_route_grant_stage(new_path_id, 1);

  return new_path_id;
end;
$$;

comment on function public.confirm_boss_achievement_event(uuid, uuid, uuid) is
  'Deprecated in 2.0: Boss evolution is DP-only. Still callable (logs the event) so the live app keeps working, but nothing reads these events anymore.';

revoke all on function public._boss_route_grant_stage(uuid, integer) from public, anon, authenticated;
