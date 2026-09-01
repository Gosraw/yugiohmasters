begin;

-- =========================================================
-- BOSS ROUTE SYSTEM - RUNTIME RPCS (go-live spec section 17, 20-21)
--
-- All writes to the Boss Route runtime tables (player_boss_paths,
-- player_boss_stage_unlocks, player_boss_achievement_events) happen
-- exclusively through the four SECURITY DEFINER RPCs below, per the
-- "NO DIRECT CLIENT MUTATIONS" note in 202609011600_boss_route_schema.sql:
--
--   choose_boss_path                 - pick the FIRST (free) route
--   unlock_second_third_boss_path    - buy the 2nd (7000 DP) or
--                                       3rd (10000 DP) route slot
--   evolve_boss_stage                - pay 900/1400/2400 DP to advance
--                                       to stage 2/3/4, gated on the
--                                       stage's achievement requirements
--   confirm_boss_achievement_event   - opponent-confirmed, idempotent
--                                       per (match, path, event)
--
-- A shared private helper, _boss_route_grant_stage, actually grants
-- the evolution monster + that stage's permanent support cards into
-- card_instances. It is idempotent (gated on inserting the
-- player_boss_stage_unlocks row - ON CONFLICT DO NOTHING - so a
-- retried/duplicate call never double-grants).
--
-- SCARCITY DECISION (flagged as open in the schema migration): Boss
-- Route grants are curated, structural, story-locked rewards, not
-- random competitive pulls - a player who has earned Stage 3 of
-- their route must always receive that stage's cards, even if the
-- normal draft/shop pool has already exhausted that card's
-- league-wide copy limit (card_copy_limit()/validate_new_card_instance).
-- Route-exclusive cards never enter the draft/shop pool at all (see
-- 202609011700_draft_boss_route_exclusion.sql) so this only matters
-- for the small set of non-exclusive support grants. validate_new_
-- card_instance is re-issued below with a narrow, transaction-local
-- bypass (the "app.boss_route_grant" GUC, set only inside
-- _boss_route_grant_stage, reset automatically at transaction end)
-- so Boss Route grants can never fail on scarcity while every other
-- insert path (draft/shop/trade/admin) keeps the exact same
-- enforcement it has today.
-- =========================================================


-- =========================================================
-- 1. SCARCITY BYPASS FOR STRUCTURAL BOSS ROUTE GRANTS
-- =========================================================

create or replace function public.validate_new_card_instance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_copies integer;
  existing_copies integer;
  owner_is_member boolean;
  bypass_scarcity boolean;
begin

  -- Serialize creatie van dezelfde kaart.
  perform 1
  from public.card_catalog
  where id = new.card_catalog_id
  for update;

  if not found then
    raise exception 'Card catalog entry does not exist';
  end if;


  bypass_scarcity :=
    coalesce(
      current_setting('app.boss_route_grant', true),
      'false'
    ) = 'true';


  allowed_copies :=
    public.card_copy_limit(
      new.card_catalog_id
    );


  if allowed_copies is null then
    raise exception 'Unable to determine card copy limit';
  end if;


  if not bypass_scarcity then

    select count(*)
    into existing_copies
    from public.card_instances
    where league_id = new.league_id
      and card_catalog_id = new.card_catalog_id;


    if existing_copies >= allowed_copies then
      raise exception
        'Card scarcity limit reached. Maximum copies: %',
        allowed_copies;
    end if;

  end if;


  -- Automatisch eerstvolgende copy number.
  if new.copy_number is null
     or new.copy_number <= 0
  then

    select
      coalesce(max(copy_number), 0) + 1
    into new.copy_number
    from public.card_instances
    where league_id = new.league_id
      and card_catalog_id = new.card_catalog_id;

  end if;


  if not bypass_scarcity and new.copy_number > allowed_copies then
    raise exception
      'Invalid copy number. Maximum is %',
      allowed_copies;
  end if;


  select exists (
    select 1
    from public.league_members
    where league_id = new.league_id
      and profile_id = new.current_owner_id
  )
  into owner_is_member;


  if not owner_is_member then
    raise exception
      'Current owner is not a member of this league';
  end if;


  select exists (
    select 1
    from public.league_members
    where league_id = new.league_id
      and profile_id = new.original_owner_id
  )
  into owner_is_member;


  if not owner_is_member then
    raise exception
      'Original owner is not a member of this league';
  end if;


  new.updated_at := now();

  return new;
end;
$$;


-- =========================================================
-- 2. PRIVATE HELPER: GRANT A STAGE'S CARDS (idempotent)
--
-- Not exposed to authenticated users - only called internally by
-- the four public RPCs below, same convention as
-- public._credit_duel_points.
-- =========================================================

create or replace function public._boss_route_grant_stage(
  target_player_boss_path_id uuid,
  target_stage_number integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  path_row public.player_boss_paths%rowtype;
  stage_row public.boss_route_stages%rowtype;
  grant_row record;
  copy_index integer;
  next_copy_number integer;
begin

  select *
  into path_row
  from public.player_boss_paths
  where id = target_player_boss_path_id
  for update;

  if not found then
    raise exception 'Boss path not found.';
  end if;

  select *
  into stage_row
  from public.boss_route_stages
  where route_id = path_row.route_id
    and stage_number = target_stage_number;

  if not found then
    raise exception 'Boss route stage not found.';
  end if;

  insert into public.player_boss_stage_unlocks (
    player_boss_path_id,
    stage_number
  )
  values (
    target_player_boss_path_id,
    target_stage_number
  )
  on conflict (player_boss_path_id, stage_number) do nothing;

  if not found then
    -- Already unlocked and granted by an earlier call - never
    -- double-grant cards on a retry/refresh.
    return;
  end if;

  -- Transaction-local bypass so this guaranteed structural grant
  -- can never fail on league-wide draft/shop scarcity. Reset
  -- automatically when the transaction ends (third arg = true).
  perform set_config('app.boss_route_grant', 'true', true);

  -- Grant the evolution monster itself (always exactly 1 copy;
  -- does not count against the 12-15 permanent support limit).
  select coalesce(max(copy_number), 0) + 1
  into next_copy_number
  from public.card_instances
  where league_id = path_row.league_id
    and card_catalog_id = stage_row.evolution_card_catalog_id;

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
    path_row.league_id,
    stage_row.evolution_card_catalog_id,
    path_row.profile_id,
    path_row.profile_id,
    'achievement',
    target_player_boss_path_id,
    next_copy_number,
    now(),
    false
  );

  -- Grant every permanent support card at this stage, respecting
  -- the grant's quantity (e.g. Toon World x2 on the Toon route).
  for grant_row in
    select card_catalog_id, quantity
    from public.boss_route_stage_grants
    where stage_id = stage_row.id
  loop

    for copy_index in 1..grant_row.quantity loop

      select coalesce(max(copy_number), 0) + 1
      into next_copy_number
      from public.card_instances
      where league_id = path_row.league_id
        and card_catalog_id = grant_row.card_catalog_id;

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
        path_row.league_id,
        grant_row.card_catalog_id,
        path_row.profile_id,
        path_row.profile_id,
        'achievement',
        target_player_boss_path_id,
        next_copy_number,
        now(),
        false
      );

    end loop;

  end loop;

  if target_stage_number = 4 then
    update public.player_boss_paths
    set mastered_at = now()
    where id = target_player_boss_path_id
      and mastered_at is null;
  end if;

end;
$$;

revoke all
  on function public._boss_route_grant_stage(uuid, integer)
  from public;


-- =========================================================
-- 3. CHOOSE_BOSS_PATH - first route, free, idempotent
-- =========================================================

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
  new_path_id uuid;
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

  -- Idempotent: retrying (e.g. a page refresh right after choosing)
  -- must never charge twice or raise a confusing error.
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

  if exists (
    select 1
    from public.player_boss_paths
    where profile_id = current_user_id
      and route_id = target_route_id
  ) then
    raise exception
      'You have already chosen this Boss Route in another slot.';
  end if;

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
    1,
    target_route_id,
    1,
    0
  )
  returning id
  into new_path_id;

  perform public._boss_route_grant_stage(new_path_id, 1);

  return new_path_id;
end;
$$;

revoke all
  on function public.choose_boss_path(uuid)
  from public;

grant execute
  on function public.choose_boss_path(uuid)
  to authenticated;


-- =========================================================
-- 4. UNLOCK_SECOND_THIRD_BOSS_PATH - 7000 / 10000 DP, charge-once
-- =========================================================

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
  current_dp integer;
  new_balance integer;
  new_path_id uuid;
begin

  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  if target_route_slot not in (2, 3) then
    raise exception 'target_route_slot must be 2 or 3.';
  end if;

  unlock_cost := case target_route_slot
    when 2 then 7000
    when 3 then 10000
  end;

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
    raise exception
      'You must unlock the previous Boss Route slot first.';
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
      raise exception
        'You have already chosen a different Boss Route for this slot.';
    end if;
    return existing_path_id;
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

  select duel_points
  into current_dp
  from public.profiles
  where id = current_user_id
  for update;

  if not found then
    raise exception 'Profile not found.';
  end if;

  if current_dp < unlock_cost then
    raise exception 'Not enough Duel Points.';
  end if;

  update public.profiles
  set
    duel_points = duel_points - unlock_cost,
    updated_at = now()
  where id = current_user_id
  returning duel_points
  into new_balance;

  insert into public.duel_point_transactions (
    profile_id,
    match_id,
    amount,
    balance_after,
    reason,
    note,
    metadata
  )
  values (
    current_user_id,
    null,
    -unlock_cost,
    new_balance,
    'boss_route_unlock_slot',
    format('Unlocked Boss Route slot %s', target_route_slot),
    jsonb_build_object(
      'route_slot', target_route_slot,
      'route_id', target_route_id
    )
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

revoke all
  on function public.unlock_second_third_boss_path(integer, uuid)
  from public;

grant execute
  on function public.unlock_second_third_boss_path(integer, uuid)
  to authenticated;


-- =========================================================
-- 5. EVOLVE_BOSS_STAGE - 900/1400/2400 DP + achievement gate
-- =========================================================

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
  req_row record;
  confirmed_count integer;
  current_dp integer;
  new_balance integer;
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

  -- Achievement-requirement gate: every requirement targeting this
  -- stage must already have enough confirmed events logged.
  for req_row in
    select event_id, target_count
    from public.boss_route_achievement_requirements
    where target_stage_id = stage_row.id
  loop

    select count(*)
    into confirmed_count
    from public.player_boss_achievement_events
    where player_boss_path_id = target_player_boss_path_id
      and event_id = req_row.event_id;

    if confirmed_count < req_row.target_count then
      raise exception
        'Achievement requirements for this stage are not yet met.';
    end if;

  end loop;

  select duel_points
  into current_dp
  from public.profiles
  where id = current_user_id
  for update;

  if not found then
    raise exception 'Profile not found.';
  end if;

  if current_dp < stage_row.dp_cost_to_reach then
    raise exception 'Not enough Duel Points.';
  end if;

  update public.profiles
  set
    duel_points = duel_points - stage_row.dp_cost_to_reach,
    updated_at = now()
  where id = current_user_id
  returning duel_points
  into new_balance;

  insert into public.duel_point_transactions (
    profile_id,
    match_id,
    amount,
    balance_after,
    reason,
    note,
    metadata
  )
  values (
    current_user_id,
    null,
    -stage_row.dp_cost_to_reach,
    new_balance,
    'boss_route_stage_evolve',
    format(
      'Evolved Boss Path %s to stage %s',
      target_player_boss_path_id,
      target_stage_number
    ),
    jsonb_build_object(
      'player_boss_path_id', target_player_boss_path_id,
      'stage_number', target_stage_number
    )
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

revoke all
  on function public.evolve_boss_stage(uuid, integer)
  from public;

grant execute
  on function public.evolve_boss_stage(uuid, integer)
  to authenticated;


-- =========================================================
-- 6. CONFIRM_BOSS_ACHIEVEMENT_EVENT - opponent-confirmed, idempotent
-- =========================================================

create or replace function public.confirm_boss_achievement_event(
  target_match_id uuid,
  target_player_boss_path_id uuid,
  target_event_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  path_row public.player_boss_paths%rowtype;
  match_row public.matches%rowtype;
  event_row public.boss_route_achievement_events%rowtype;
  new_event_id uuid;
begin

  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select *
  into path_row
  from public.player_boss_paths
  where id = target_player_boss_path_id;

  if not found then
    raise exception 'Boss path not found.';
  end if;

  select *
  into match_row
  from public.matches
  where id = target_match_id;

  if not found then
    raise exception 'Match not found.';
  end if;

  if match_row.league_id <> path_row.league_id then
    raise exception 'Match does not belong to this Boss Path''s league.';
  end if;

  if match_row.status <> 'completed' then
    raise exception 'Match must be completed before confirming Boss progress.';
  end if;

  if path_row.profile_id not in (match_row.player_one_id, match_row.player_two_id) then
    raise exception 'The Boss Path owner did not play in this match.';
  end if;

  if current_user_id = path_row.profile_id then
    raise exception 'Boss progress must be confirmed by your opponent, not yourself.';
  end if;

  if current_user_id not in (match_row.player_one_id, match_row.player_two_id) then
    raise exception 'Only that match''s opponent can confirm this Boss progress.';
  end if;

  select *
  into event_row
  from public.boss_route_achievement_events
  where id = target_event_id
    and route_id = path_row.route_id;

  if not found then
    raise exception 'This achievement event does not belong to this Boss Route.';
  end if;

  insert into public.player_boss_achievement_events (
    player_boss_path_id,
    match_id,
    event_id,
    confirmed_by_profile_id
  )
  values (
    target_player_boss_path_id,
    target_match_id,
    target_event_id,
    current_user_id
  )
  on conflict (match_id, player_boss_path_id, event_id) do nothing
  returning id
  into new_event_id;

  if new_event_id is null then
    -- Already confirmed for this match - return the existing row's
    -- id so a retried confirmation is a harmless no-op, not an error.
    select id
    into new_event_id
    from public.player_boss_achievement_events
    where match_id = target_match_id
      and player_boss_path_id = target_player_boss_path_id
      and event_id = target_event_id;
  end if;

  return new_event_id;
end;
$$;

revoke all
  on function public.confirm_boss_achievement_event(uuid, uuid, uuid)
  from public;

grant execute
  on function public.confirm_boss_achievement_event(uuid, uuid, uuid)
  to authenticated;


-- =========================================================
-- 7. POST-MIGRATION STRUCTURAL ASSERTIONS
-- =========================================================

do $verify$
declare
  v_missing text;
begin

  select string_agg(t, ', ')
  into v_missing
  from unnest(array[
    'choose_boss_path(uuid)',
    'unlock_second_third_boss_path(integer,uuid)',
    'evolve_boss_stage(uuid,integer)',
    'confirm_boss_achievement_event(uuid,uuid,uuid)',
    '_boss_route_grant_stage(uuid,integer)'
  ]) as t
  where to_regprocedure('public.' || t) is null;

  if v_missing is not null then
    raise exception
      'BOSS ROUTE RPC MIGRATION ABORTED: missing function(s): %',
      v_missing;
  end if;

  raise notice 'BOSS ROUTE RPC MIGRATION: all 5 functions created and structurally verified.';
end $verify$;

commit;
