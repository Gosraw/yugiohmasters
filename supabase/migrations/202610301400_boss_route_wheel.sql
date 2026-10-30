-- =========================================================
-- 2.0: BOSS PATH WHEEL (owner decision 2026-10-30)
--
-- A new player no longer chooses their first Boss Path. They spin a
-- wheel and get a RANDOM route, decided here on the server:
--
--   * spin_boss_path_wheel()  picks a random active route that no
--     member of the player's league holds yet, creates the slot-1
--     player_boss_paths row and grants Stage 1 - in one transaction.
--     One spin = your path, permanently: calling it again (reload,
--     double tap, a second tab) returns the route already assigned,
--     never a new one.
--   * Every route at most once per league. All three writers
--     (spin_boss_path_wheel, choose_boss_path,
--     unlock_second_third_boss_path) take the same per-league
--     advisory lock (_boss_route_claim_lock) before they look at
--     which routes are free, so two players spinning at the same
--     moment are serialised and can never land on the same route.
--   * choose_boss_path keeps its signature (the live main app still
--     has a call site) but refuses a NEW slot-1 route when called
--     from the API (role anon / authenticated): the wheel is the
--     only way in. A retry for the route a player already holds
--     still returns that path, exactly like before. Trusted database
--     sessions (psql, SQL tests: no API role) keep the old behaviour
--     plus the league-wide uniqueness check.
--   * unlock_second_third_boss_path (slots 2 and 3, bought with DP)
--     is still a free choice, but only among routes nobody in the
--     league holds yet. Checked before any DP is taken.
--   * boss_path_free_routes() lets the app draw the wheel and grey
--     out taken routes in the slot 2/3 grid from the same rule.
--
-- "Held" means: a player_boss_paths row (any slot, any route state)
-- of a profile that is CURRENTLY a member of the league. Only active
-- routes with a Stage 1 row can be handed out, so retired Season 1
-- routes (is_active = false, still held by players between the
-- 202610301000 migration and the Season 2 reset) never appear on the
-- wheel. No unique index: before the reset two players may legally
-- share a retired Season 1 route, and an index would abort this
-- migration there.
--
-- Stage 1 is granted by the existing _boss_route_grant_stage through
-- one shared internal helper, _boss_path_start, which is exactly the
-- insert + grant that choose_boss_path always did.
--
-- Idempotent (create or replace only), no data changes, nothing
-- dropped, same signatures for every existing function.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1. Internal helpers (not callable by API roles)
-- ---------------------------------------------------------

create or replace function public._boss_route_claim_lock(
  target_league_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(
    hashtext('boss_route_claim_' || target_league_id::text)
  );
end;
$$;

create or replace function public._boss_route_held_in_league(
  target_league_id uuid,
  target_route_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.player_boss_paths p
    join public.league_members lm
      on lm.profile_id = p.profile_id
     and lm.league_id = target_league_id
    where p.route_id = target_route_id
  );
$$;

-- Routes the wheel (and the slot 2/3 grid) may hand out in a league:
-- active, with a Stage 1, and not held by any current member.
create or replace function public._boss_route_free_ids(
  target_league_id uuid
)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.id
  from public.boss_routes r
  where r.is_active
    and exists (
      select 1
      from public.boss_route_stages s
      where s.route_id = r.id
        and s.stage_number = 1
    )
    and not public._boss_route_held_in_league(target_league_id, r.id)
  order by r.display_order;
$$;

-- True when the call comes in through the API (PostgREST switches
-- to the anon / authenticated role); false for trusted database
-- sessions such as psql or the SQL tests.
create or replace function public._boss_route_is_api_call()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated');
$$;

-- The one place a Boss Path row is created: the insert + Stage 1
-- grant choose_boss_path always did. Callers have already checked
-- membership, the route, the slot and league-wide uniqueness under
-- _boss_route_claim_lock.
create or replace function public._boss_path_start(
  target_profile_id uuid,
  target_league_id uuid,
  target_route_slot integer,
  target_route_id uuid,
  target_dp_charged integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_path_id uuid;
begin
  insert into public.player_boss_paths (
    profile_id,
    league_id,
    route_slot,
    route_id,
    current_stage,
    dp_charged_for_unlock
  )
  values (
    target_profile_id,
    target_league_id,
    target_route_slot,
    target_route_id,
    1,
    coalesce(target_dp_charged, 0)
  )
  returning id
  into new_path_id;

  perform public._boss_route_grant_stage(new_path_id, 1);

  return new_path_id;
end;
$$;

revoke all on function public._boss_route_claim_lock(uuid) from public, anon, authenticated;
revoke all on function public._boss_route_held_in_league(uuid, uuid) from public, anon, authenticated;
revoke all on function public._boss_route_free_ids(uuid) from public, anon, authenticated;
revoke all on function public._boss_route_is_api_call() from public, anon, authenticated;
revoke all on function public._boss_path_start(uuid, uuid, integer, uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------
-- 2. spin_boss_path_wheel - the first Boss Path, random, once
-- ---------------------------------------------------------

create or replace function public.spin_boss_path_wheel()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  current_league_id uuid;
  existing_path public.player_boss_paths%rowtype;
  picked_route_id uuid;
  result_path_id uuid;
  result_route public.boss_routes%rowtype;
  newly_assigned boolean := false;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select lm.league_id
  into current_league_id
  from public.league_members lm
  where lm.profile_id = current_user_id
  limit 1;

  if current_league_id is null then
    raise exception 'Current user is not a league member.';
  end if;

  -- Serialises every route claim in this league (other players'
  -- spins and slot 2/3 unlocks, and this player's own double tap).
  perform public._boss_route_claim_lock(current_league_id);

  select *
  into existing_path
  from public.player_boss_paths
  where profile_id = current_user_id
    and route_slot = 1;

  if found then
    -- One spin = your path. Never a second roll.
    result_path_id := existing_path.id;
  else
    select f.id
    into picked_route_id
    from public._boss_route_free_ids(current_league_id) as f(id)
    order by random()
    limit 1;

    if picked_route_id is null then
      raise exception
        'Every Boss Path is already taken in your league. Ask the league admin for help.';
    end if;

    result_path_id := public._boss_path_start(
      current_user_id,
      current_league_id,
      1,
      picked_route_id,
      0
    );

    newly_assigned := true;
  end if;

  select r.*
  into result_route
  from public.boss_routes r
  join public.player_boss_paths p on p.route_id = r.id
  where p.id = result_path_id;

  return jsonb_build_object(
    'player_boss_path_id', result_path_id,
    'route_id', result_route.id,
    'route_code', result_route.code,
    'route_name', result_route.name,
    'newly_assigned', newly_assigned
  );
end;
$$;

revoke all on function public.spin_boss_path_wheel() from public, anon;
grant execute on function public.spin_boss_path_wheel() to authenticated;

comment on function public.spin_boss_path_wheel() is
  'Onboarding: assigns the caller a random free active Boss Route as slot 1 and grants Stage 1. Idempotent: a second call returns the route already assigned (newly_assigned = false).';

-- ---------------------------------------------------------
-- 3. boss_path_free_routes - what the wheel / slot grid may show
-- ---------------------------------------------------------

create or replace function public.boss_path_free_routes()
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  current_league_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select lm.league_id
  into current_league_id
  from public.league_members lm
  where lm.profile_id = current_user_id
  limit 1;

  if current_league_id is null then
    return '{}'::uuid[];
  end if;

  return coalesce(
    (select array_agg(f.id order by f.ord) from public._boss_route_free_ids(current_league_id) with ordinality as f(id, ord)),
    '{}'::uuid[]
  );
end;
$$;

revoke all on function public.boss_path_free_routes() from public, anon;
grant execute on function public.boss_path_free_routes() to authenticated;

comment on function public.boss_path_free_routes() is
  'Active Boss Route ids (display order) that no member of the caller''s league holds yet: the wheel slices and the choosable slot 2/3 routes.';

-- ---------------------------------------------------------
-- 4. choose_boss_path - same signature, no wheel bypass
-- ---------------------------------------------------------

create or replace function public.choose_boss_path(
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
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select lm.league_id
  into current_league_id
  from public.league_members lm
  where lm.profile_id = current_user_id
  limit 1;

  if current_league_id is null then
    raise exception 'Current user is not a league member.';
  end if;

  select *
  into route_row
  from public.boss_routes
  where id = target_route_id
    and is_active;

  if not found then
    raise exception 'Boss route not found or inactive.';
  end if;

  perform public._boss_route_claim_lock(current_league_id);

  -- Idempotent: retrying for the route a player already holds
  -- returns that path (backwards compatible with the old app).
  select id, route_id
  into existing_path_id, existing_route_id
  from public.player_boss_paths
  where profile_id = current_user_id
    and route_slot = 1
  for update;

  if found then
    if existing_route_id <> target_route_id then
      raise exception
        'You have already chosen a different first Boss Route.';
    end if;

    return existing_path_id;
  end if;

  -- 2.0: the first Boss Path comes from the wheel only.
  if public._boss_route_is_api_call() then
    raise exception
      'Your first Boss Path is decided by the wheel. Open the Boss Path page and spin it.';
  end if;

  if exists (
    select 1
    from public.player_boss_paths
    where profile_id = current_user_id
      and route_id = target_route_id
  ) then
    raise exception
      'You have already chosen this Boss Route in another slot.';
  end if;

  if public._boss_route_held_in_league(current_league_id, target_route_id) then
    raise exception
      'Another duelist in your league already has this Boss Path. Pick one nobody holds yet.';
  end if;

  return public._boss_path_start(
    current_user_id,
    current_league_id,
    1,
    target_route_id,
    0
  );
end;
$$;

revoke all on function public.choose_boss_path(uuid) from public, anon;
grant execute on function public.choose_boss_path(uuid) to authenticated;

comment on function public.choose_boss_path(uuid) is
  '2.0: refuses a new slot-1 route from the API (use spin_boss_path_wheel). Still returns the existing path for the route a player already holds in slot 1.';

-- ---------------------------------------------------------
-- 5. unlock_second_third_boss_path - only routes nobody holds
--    (202610120130 version + claim lock + league check)
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

  perform public._boss_route_claim_lock(current_league_id);

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

  -- Every route at most once per league - checked before any DP moves.
  if public._boss_route_held_in_league(current_league_id, target_route_id) then
    raise exception
      'Another duelist in your league already has this Boss Path. Pick one nobody holds yet.';
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

  return public._boss_path_start(
    current_user_id,
    current_league_id,
    target_route_slot,
    target_route_id,
    unlock_cost
  );
end;
$$;

revoke all on function public.unlock_second_third_boss_path(integer, uuid) from public, anon;
grant execute on function public.unlock_second_third_boss_path(integer, uuid) to authenticated;

-- ---------------------------------------------------------
-- 6. Structural check
-- ---------------------------------------------------------

do $verify$
declare
  v_missing text;
begin
  select string_agg(t, ', ')
  into v_missing
  from unnest(array[
    '_boss_route_claim_lock(uuid)',
    '_boss_route_held_in_league(uuid,uuid)',
    '_boss_route_free_ids(uuid)',
    '_boss_route_is_api_call()',
    '_boss_path_start(uuid,uuid,integer,uuid,integer)',
    '_boss_route_grant_stage(uuid,integer)',
    'spin_boss_path_wheel()',
    'boss_path_free_routes()',
    'choose_boss_path(uuid)',
    'unlock_second_third_boss_path(integer,uuid)'
  ]) as t
  where to_regprocedure('public.' || t) is null;

  if v_missing is not null then
    raise exception 'BOSS ROUTE WHEEL MIGRATION ABORTED: missing function(s): %', v_missing;
  end if;

  if has_function_privilege('authenticated', 'public._boss_path_start(uuid,uuid,integer,uuid,integer)', 'execute')
     or has_function_privilege('anon', 'public.spin_boss_path_wheel()', 'execute') then
    raise exception 'BOSS ROUTE WHEEL MIGRATION ABORTED: wrong function privileges';
  end if;

  raise notice 'BOSS ROUTE WHEEL: spin_boss_path_wheel, boss_path_free_routes and the guarded choose / unlock RPCs are in place.';
end
$verify$;

commit;
