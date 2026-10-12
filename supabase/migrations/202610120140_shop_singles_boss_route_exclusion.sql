-- =========================================================
-- 2.0 rewards, part 5: shop singles never sell Boss Route cards,
-- and shop spending shows up in the DP ledger
--
-- 1. refresh_shop_singles_rotation_if_needed (202609202000) picked
--    from the whole eligible catalog, so it could offer a Boss
--    Route's Stage-4 evolution monster or an is_route_exclusive
--    support card. Packs (pick_shop_pack_card) and the draft already
--    exclude exactly these; the singles generator now uses the same
--    rule through one shared helper, is_boss_route_reserved_card().
-- 2. purchase_shop_rotation_card refuses a reserved card (defence in
--    depth for a rotation generated before this fix), and unsold
--    reserved cards in the current rotation are swapped out now.
-- 3. Shop purchases paid with DP (packs, special packs, singles)
--    lowered profiles.duel_points without a ledger row, so the
--    wallet could not explain them. An AFTER INSERT trigger on
--    shop_purchases now records a 'shop_purchase' ledger row (the
--    purchase RPCs themselves are unchanged; the balance was already
--    debited by them, the trigger only logs it).
-- =========================================================

create or replace function public.is_boss_route_reserved_card(
  target_card_catalog_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = target_card_catalog_id
      and brs.stage_number = 4
  )
  or exists (
    select 1
    from public.boss_route_stage_grants brg
    where brg.card_catalog_id = target_card_catalog_id
      and brg.is_route_exclusive = true
  );
$$;

comment on function public.is_boss_route_reserved_card(uuid) is
  'True for a Boss Route Stage-4 evolution monster or an is_route_exclusive support card: these only come from the Boss Path, never from packs, draft or shop singles.';

create or replace function public.refresh_shop_singles_rotation_if_needed()
returns void
language plpgsql
security definer
set search_path = public
as $$
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
    candidate_id := null;
    candidate_rarity := null;

    select cc.id, cc.game_rarity
    into candidate_id, candidate_rarity
    from public.card_catalog cc
    where
      cc.format_eligible = true
      and public.is_master_duel_offerable(cc.master_duel_status)
      and not public.is_boss_route_reserved_card(cc.id)
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
        and not public.is_boss_route_reserved_card(cc.id)
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
  candidate_id := null;
  candidate_rarity := null;

  select cc.id, cc.game_rarity
  into candidate_id, candidate_rarity
  from public.card_catalog cc
  where
    cc.format_eligible = true
    and public.is_master_duel_offerable(cc.master_duel_status)
    and not public.is_boss_route_reserved_card(cc.id)
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
$$;

-- ---------------------------------------------------------
-- Swap reserved cards out of any rotation that is live right now
-- (unsold slots only; sold slots are history and stay as they are).
-- ---------------------------------------------------------

do $swap$
declare
  slot_row record;
  replacement_id uuid;
  replacement_rarity text;
begin
  for slot_row in
    select src.id, src.rotation_id, cc.game_rarity
    from public.shop_rotation_cards src
    join public.shop_rotations sr on sr.id = src.rotation_id
    join public.card_catalog cc on cc.id = src.card_catalog_id
    where sr.status = 'active'
      and sr.ends_at > now()
      and src.sold_at is null
      and public.is_boss_route_reserved_card(src.card_catalog_id)
  loop
    replacement_id := null;
    replacement_rarity := null;

    select cc.id, cc.game_rarity
    into replacement_id, replacement_rarity
    from public.card_catalog cc
    where cc.format_eligible = true
      and public.is_master_duel_offerable(cc.master_duel_status)
      and not public.is_boss_route_reserved_card(cc.id)
      and cc.game_rarity = slot_row.game_rarity
      and not exists (
        select 1
        from public.shop_rotation_cards other
        where other.rotation_id = slot_row.rotation_id
          and other.card_catalog_id = cc.id
      )
    order by random()
    limit 1;

    if replacement_id is not null then
      update public.shop_rotation_cards
      set
        card_catalog_id = replacement_id,
        price_dp = public.shop_single_card_price(replacement_rarity),
        slot_tier = public.shop_single_card_slot_tier(replacement_rarity)
      where id = slot_row.id
        and sold_at is null;
    end if;
  end loop;
end;
$swap$;

-- ---------------------------------------------------------
-- purchase_shop_rotation_card: same as 202609202000's live version
-- plus the reserved-card guard.
-- ---------------------------------------------------------

create or replace function public.purchase_shop_rotation_card(
  target_rotation_card_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  current_league_id uuid;
  slot_row public.shop_rotation_cards%rowtype;
  rotation_row public.shop_rotations%rowtype;
  current_dp integer;
  next_copy_number integer;
  new_instance_id uuid;
  new_purchase_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  -- Resolve the buyer's league the same way purchase_shop_pack
  -- does - card_instances.league_id is required, and the player
  -- must actually belong to it.
  select lm.league_id
  into current_league_id
  from public.league_members lm
  where lm.profile_id = current_user_id
  limit 1;

  if current_league_id is null then
    raise exception 'Current user is not a league member.';
  end if;

  select *
  into slot_row
  from public.shop_rotation_cards
  where id = target_rotation_card_id
  for update;

  if not found then
    raise exception 'Shop card not found.';
  end if;

  if slot_row.sold_at is not null then
    raise exception 'This card has already been sold.';
  end if;

  if public.is_boss_route_reserved_card(slot_row.card_catalog_id) then
    raise exception 'This card belongs to a Boss Route and cannot be bought in the shop.';
  end if;

  select *
  into rotation_row
  from public.shop_rotations
  where id = slot_row.rotation_id;

  if not found then
    raise exception 'Shop rotation not found.';
  end if;

  if
    rotation_row.status <> 'active'
    or rotation_row.starts_at > now()
    or rotation_row.ends_at <= now()
  then
    raise exception 'This shop rotation is not active.';
  end if;

  select duel_points
  into current_dp
  from public.profiles
  where id = current_user_id
  for update;

  if not found then
    raise exception 'Profile not found.';
  end if;

  if current_dp < slot_row.price_dp then
    raise exception 'Not enough Duel Points.';
  end if;

  -- The ledger row for this debit is written by the shop_purchases
  -- trigger below (same as for packs).
  update public.profiles
  set
    duel_points = duel_points - slot_row.price_dp,
    updated_at = now()
  where id = current_user_id;

  select coalesce(max(copy_number), 0) + 1
  into next_copy_number
  from public.card_instances
  where card_catalog_id = slot_row.card_catalog_id
    and league_id = current_league_id;

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
    current_league_id,
    slot_row.card_catalog_id,
    current_user_id,
    current_user_id,
    'shop',
    slot_row.id,
    next_copy_number,
    now(),
    false
  )
  returning id
  into new_instance_id;

  update public.shop_rotation_cards
  set
    sold_to_profile_id = current_user_id,
    sold_at = now()
  where id = target_rotation_card_id
    and sold_at is null;

  if not found then
    raise exception 'This card was sold before your purchase completed.';
  end if;

  insert into public.shop_purchases (
    profile_id,
    purchase_type,
    rotation_id,
    rotation_card_id,
    dp_spent
  )
  values (
    current_user_id,
    'single_card',
    slot_row.rotation_id,
    slot_row.id,
    slot_row.price_dp
  )
  returning id
  into new_purchase_id;

  return new_instance_id;
end;
$$;

-- ---------------------------------------------------------
-- Ledger row for every DP-paid shop purchase.
-- Both purchase RPCs debit profiles.duel_points BEFORE inserting the
-- shop_purchases row, so the current balance is the balance after.
-- ---------------------------------------------------------

create or replace function public._log_shop_purchase_dp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  balance_now integer;
  item_label text;
begin
  if new.dp_spent is null or new.dp_spent <= 0 then
    return null;
  end if;

  select duel_points
  into balance_now
  from public.profiles
  where id = new.profile_id;

  item_label := case new.purchase_type
    when 'single_card' then (
      select 'Bought ' || cc.name || ' from the shop'
      from public.shop_rotation_cards src
      join public.card_catalog cc on cc.id = src.card_catalog_id
      where src.id = new.rotation_card_id
    )
    when 'pack' then (
      select 'Bought a ' || spt.name
      from public.shop_pack_types spt
      where spt.id = new.pack_type_id
    )
    when 'special_pack' then (
      select 'Bought a Special Pack: ' || ssr.theme_label
      from public.shop_special_pack_rotations ssr
      where ssr.id = new.special_pack_rotation_id
    )
    else null
  end;

  insert into public.duel_point_transactions (
    profile_id,
    match_id,
    amount,
    balance_after,
    reason,
    note,
    metadata,
    description
  )
  values (
    new.profile_id,
    null,
    -new.dp_spent,
    coalesce(balance_now, 0),
    'shop_purchase',
    null,
    jsonb_build_object(
      'shop_purchase_id', new.id,
      'purchase_type', new.purchase_type,
      'pack_type_id', new.pack_type_id,
      'special_pack_rotation_id', new.special_pack_rotation_id,
      'rotation_card_id', new.rotation_card_id
    ),
    coalesce(
      item_label,
      case new.purchase_type
        when 'single_card' then 'Bought a card from the shop'
        when 'special_pack' then 'Bought a Special Pack'
        else 'Bought a pack'
      end
    )
  );

  return null;
end;
$$;

drop trigger if exists shop_purchases_log_dp on public.shop_purchases;

create trigger shop_purchases_log_dp
after insert on public.shop_purchases
for each row
execute function public._log_shop_purchase_dp();

revoke all on function public._log_shop_purchase_dp() from public, anon, authenticated;
