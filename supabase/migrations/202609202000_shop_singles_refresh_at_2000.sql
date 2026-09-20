begin;

-- =========================================================
-- SHOP SINGLES: FIXED DAILY REFRESH AT 20:00 EUROPE/AMSTERDAM
--
-- The shop stays lazy-refresh (no cron dependency): the first shop
-- page load after 20:00 generates the new six cards, but every
-- rotation is anchored to the 20:00 -> 20:00 local-time window.
-- Using Europe/Amsterdam keeps 20:00 correct across DST changes.
-- =========================================================

create or replace function public.refresh_shop_singles_rotation_if_needed()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  next_rotation_id uuid;
  next_rotation_number integer;
  picked_ids uuid[] := array[]::uuid[];
  target_rarities text[] := array['Normal', 'Rare', 'Super Rare', 'Ultra Rare', 'Secret Rare'];
  target_rarity text;
  slot_number integer := 0;
  candidate_id uuid;
  candidate_rarity text;

  local_now timestamp;
  local_window_start timestamp;
  window_start timestamptz;
  window_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('shop_singles_refresh'));

  if exists (
    select 1
    from public.shop_rotations
    where
      status = 'active'
      and starts_at <= now()
      and ends_at > now()
  ) then
    return;
  end if;

  update public.shop_rotations
  set
    status = 'completed',
    updated_at = now()
  where
    status = 'active'
    and ends_at <= now();

  -- Determine the current Dutch-local 20:00 -> 20:00 window.
  local_now := now() at time zone 'Europe/Amsterdam';

  if local_now::time >= time '20:00' then
    local_window_start := date_trunc('day', local_now) + interval '20 hours';
  else
    local_window_start := date_trunc('day', local_now) - interval '1 day' + interval '20 hours';
  end if;

  window_start := local_window_start at time zone 'Europe/Amsterdam';
  window_end := (local_window_start + interval '1 day') at time zone 'Europe/Amsterdam';

  select coalesce(max(rotation_number), 0) + 1
  into next_rotation_number
  from public.shop_rotations;

  insert into public.shop_rotations (
    starts_at,
    ends_at,
    status,
    rotation_number
  )
  values (
    window_start,
    window_end,
    'active',
    next_rotation_number
  )
  returning id
  into next_rotation_id;

  -- One slot per targeted rarity.
  foreach target_rarity in array target_rarities loop
    slot_number := slot_number + 1;

    select cc.id, cc.game_rarity
    into candidate_id, candidate_rarity
    from public.card_catalog cc
    where
      cc.format_eligible = true
      and public.is_master_duel_offerable(cc.master_duel_status)
      and cc.game_rarity = target_rarity
      and cc.id <> all(picked_ids)
    order by random()
    limit 1;

    if candidate_id is null then
      select cc.id, cc.game_rarity
      into candidate_id, candidate_rarity
      from public.card_catalog cc
      where
        cc.format_eligible = true
        and public.is_master_duel_offerable(cc.master_duel_status)
        and cc.id <> all(picked_ids)
      order by random()
      limit 1;
    end if;

    if candidate_id is not null then
      picked_ids := array_append(picked_ids, candidate_id);

      insert into public.shop_rotation_cards (
        rotation_id,
        slot_number,
        card_catalog_id,
        price_dp,
        slot_tier
      )
      values (
        next_rotation_id,
        slot_number,
        candidate_id,
        public.shop_single_card_price(candidate_rarity),
        public.shop_single_card_slot_tier(candidate_rarity)
      );
    end if;
  end loop;

  -- Wildcard slot.
  slot_number := slot_number + 1;

  select cc.id, cc.game_rarity
  into candidate_id, candidate_rarity
  from public.card_catalog cc
  where
    cc.format_eligible = true
    and public.is_master_duel_offerable(cc.master_duel_status)
    and cc.id <> all(picked_ids)
  order by random()
  limit 1;

  if candidate_id is not null then
    insert into public.shop_rotation_cards (
      rotation_id,
      slot_number,
      card_catalog_id,
      price_dp,
      slot_tier
    )
    values (
      next_rotation_id,
      slot_number,
      candidate_id,
      public.shop_single_card_price(candidate_rarity),
      public.shop_single_card_slot_tier(candidate_rarity)
    );
  end if;
end;
$function$;

revoke all
  on function public.refresh_shop_singles_rotation_if_needed()
  from public;

grant execute
  on function public.refresh_shop_singles_rotation_if_needed()
  to authenticated;

-- Re-anchor the currently active singles rotation immediately so the
-- visible countdown ends at the next 20:00 Europe/Amsterdam.
update public.shop_rotations
set
  ends_at = (
    case
      when (now() at time zone 'Europe/Amsterdam')::time < time '20:00'
        then date_trunc('day', now() at time zone 'Europe/Amsterdam') + interval '20 hours'
      else date_trunc('day', now() at time zone 'Europe/Amsterdam') + interval '1 day 20 hours'
    end
  ) at time zone 'Europe/Amsterdam',
  updated_at = now()
where
  status = 'active'
  and starts_at <= now()
  and ends_at > now();

-- If there is no active singles rotation, create the current 20:00 window now.
select public.refresh_shop_singles_rotation_if_needed();

commit;
