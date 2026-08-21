-- =========================================================
-- DUELIST CIRCLE SHOP SYSTEM
-- PACK PURCHASE FUNCTION CHAIN
--
-- These functions were built and iterated on directly in the
-- Supabase SQL Editor while debugging the Normal Pack purchase
-- flow in production (Aug 2026) and were never captured in a
-- migration file, so the repository had drifted from what is
-- actually running in the database.
--
-- This migration is a sync-only checkpoint: it records the
-- exact function bodies confirmed live in production via
--   select pg_get_functiondef(oid) from pg_proc
--   where proname in (...)
-- on 2026-08-21. It intentionally makes no schema/table
-- changes. Every statement is CREATE OR REPLACE, so re-running
-- it against the live database is a safe no-op.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- RARITY RANK
--
-- Numeric ordering used to compare rarities (pity thresholds,
-- "at least this rarity" checks, etc).
-- ---------------------------------------------------------

create or replace function public.shop_rarity_rank(
  target_rarity text
)
returns integer
language sql
immutable
as $function$
  select
    case target_rarity
      when 'Normal' then 1
      when 'Rare' then 2
      when 'Super Rare' then 3
      when 'Ultra Rare' then 4
      when 'Secret Rare' then 5
      when 'Legendary' then 6
      else 0
    end;
$function$;

-- ---------------------------------------------------------
-- COPY LIMIT PER RARITY
--
-- Legendary = max 1 copy per league, everything else = max 3.
-- ---------------------------------------------------------

create or replace function public.shop_card_copy_limit(
  target_rarity text
)
returns integer
language sql
immutable
as $function$
  select
    case
      when target_rarity = 'Legendary'
        then 1
      else 3
    end;
$function$;

-- ---------------------------------------------------------
-- ROLL PACK RARITY
--
-- Rolls a rarity for one card slot in a pack. minimum_rank
-- forces a higher floor for pity-guaranteed slots.
-- ---------------------------------------------------------

create or replace function public.roll_shop_pack_rarity(
  target_pack_code text,
  minimum_rank integer default 1
)
returns text
language plpgsql
as $function$
declare
  roll numeric;
begin
  roll := random() * 100;

  -- =======================================================
  -- FORCED ULTRA+
  -- =======================================================
  if minimum_rank >= 4 then
    if roll < 72 then
      return 'Ultra Rare';
    elsif roll < 95 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- FORCED SUPER+
  -- =======================================================
  if minimum_rank = 3 then
    if roll < 65 then
      return 'Super Rare';
    elsif roll < 90 then
      return 'Ultra Rare';
    elsif roll < 98 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- FORCED RARE+
  -- =======================================================
  if minimum_rank = 2 then
    if roll < 55 then
      return 'Rare';
    elsif roll < 83 then
      return 'Super Rare';
    elsif roll < 95 then
      return 'Ultra Rare';
    elsif roll < 99 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- NORMAL PACK
  -- =======================================================
  if target_pack_code = 'normal' then
    if roll < 60 then
      return 'Normal';
    elsif roll < 88 then
      return 'Rare';
    elsif roll < 97 then
      return 'Super Rare';
    elsif roll < 99.5 then
      return 'Ultra Rare';
    elsif roll < 99.95 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- PREMIUM PACK
  -- =======================================================
  if target_pack_code = 'premium' then
    if roll < 25 then
      return 'Normal';
    elsif roll < 60 then
      return 'Rare';
    elsif roll < 85 then
      return 'Super Rare';
    elsif roll < 95 then
      return 'Ultra Rare';
    elsif roll < 99 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- DELUXE PACK
  -- =======================================================
  if target_pack_code = 'deluxe' then
    if roll < 10 then
      return 'Normal';
    elsif roll < 30 then
      return 'Rare';
    elsif roll < 60 then
      return 'Super Rare';
    elsif roll < 85 then
      return 'Ultra Rare';
    elsif roll < 97 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- SPECIAL PACK
  --
  -- Similar strength to Premium, but themed.
  -- =======================================================
  if target_pack_code = 'special' then
    if roll < 20 then
      return 'Normal';
    elsif roll < 50 then
      return 'Rare';
    elsif roll < 78 then
      return 'Super Rare';
    elsif roll < 92 then
      return 'Ultra Rare';
    elsif roll < 98 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  raise exception 'Unknown pack code.';
end;
$function$;

-- ---------------------------------------------------------
-- PICK CARD FOR A PACK SLOT
--
-- Picks one card_catalog row matching the rolled rarity (and
-- Special Pack theme, if any), falling back progressively
-- until any card under its ownership cap is found.
-- ---------------------------------------------------------

create or replace function public.pick_shop_pack_card(
  target_profile_id uuid,
  target_rarity text,
  target_rotation_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  theme_type text;
  theme_value text;
  chosen_card_id uuid;
begin
  -- =======================================================
  -- SPECIAL THEME
  -- =======================================================
  if target_rotation_id is not null then
    select
      special_pack_theme_type,
      special_pack_theme_value
    into
      theme_type,
      theme_value
    from public.shop_rotations
    where id = target_rotation_id;
  end if;

  -- =======================================================
  -- TRY EXACT RARITY + THEME
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and card.game_rarity = target_rarity
    and (
      select count(*)
      from public.card_instances instance
      where
        instance.current_owner_id = target_profile_id
        and instance.card_catalog_id = card.id
    ) < public.shop_card_copy_limit(card.game_rarity)
    and (
      theme_type is null
      or theme_value is null
      or case theme_type
        when 'archetype'
          then coalesce(card.archetype, '') ilike '%' || theme_value || '%'
        when 'attribute'
          then coalesce(card.attribute, '') ilike '%' || theme_value || '%'
        when 'monster_type'
          then coalesce(card.monster_type, '') ilike '%' || theme_value || '%'
        when 'card_type'
          then coalesce(card.card_type, '') ilike '%' || theme_value || '%'
        when 'frame_type'
          then coalesce(card.frame_type, '') ilike '%' || theme_value || '%'
        when 'custom'
          then true
        else true
      end
    )
  order by random()
  limit 1;

  if chosen_card_id is not null then
    return chosen_card_id;
  end if;

  -- =======================================================
  -- FALLBACK:
  -- EXACT RARITY WITHOUT THEME
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and card.game_rarity = target_rarity
    and (
      select count(*)
      from public.card_instances instance
      where
        instance.current_owner_id = target_profile_id
        and instance.card_catalog_id = card.id
    ) < public.shop_card_copy_limit(card.game_rarity)
  order by random()
  limit 1;

  if chosen_card_id is not null then
    return chosen_card_id;
  end if;

  -- =======================================================
  -- FALLBACK:
  -- THEMED CARD OF ANY RARITY
  -- =======================================================
  if theme_type is not null and theme_value is not null then
    select
      card.id
    into chosen_card_id
    from public.card_catalog card
    where
      card.format_eligible = true
      and (
        select count(*)
        from public.card_instances instance
        where
          instance.current_owner_id = target_profile_id
          and instance.card_catalog_id = card.id
      ) < public.shop_card_copy_limit(card.game_rarity)
      and case theme_type
        when 'archetype'
          then coalesce(card.archetype, '') ilike '%' || theme_value || '%'
        when 'attribute'
          then coalesce(card.attribute, '') ilike '%' || theme_value || '%'
        when 'monster_type'
          then coalesce(card.monster_type, '') ilike '%' || theme_value || '%'
        when 'card_type'
          then coalesce(card.card_type, '') ilike '%' || theme_value || '%'
        when 'frame_type'
          then coalesce(card.frame_type, '') ilike '%' || theme_value || '%'
        when 'custom'
          then true
        else true
      end
    order by random()
    limit 1;
  end if;

  if chosen_card_id is not null then
    return chosen_card_id;
  end if;

  -- =======================================================
  -- FINAL FALLBACK:
  -- ANY CARD BELOW OWNERSHIP CAP
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and (
      select count(*)
      from public.card_instances instance
      where
        instance.current_owner_id = target_profile_id
        and instance.card_catalog_id = card.id
    ) < public.shop_card_copy_limit(card.game_rarity)
  order by random()
  limit 1;

  if chosen_card_id is null then
    raise exception 'No eligible cards remain for this player.';
  end if;

  return chosen_card_id;
end;
$function$;

-- ---------------------------------------------------------
-- PURCHASE SHOP PACK
--
-- Charges DP (or consumes a voucher), opens a pack of the
-- requested type, rolls + picks each card, creates the
-- physical card_instances with shop provenance, records the
-- pulls, and updates the pity counter. Returns the new
-- shop_pack_openings id so the client can redirect to the
-- reveal page.
--
-- target_voucher_id keeps its `default null` so this
-- CREATE OR REPLACE does not change the function's call
-- signature (dropping the default would break existing
-- callers using the 1-arg form and requires an explicit
-- DROP FUNCTION first, which we deliberately avoid here).
-- ---------------------------------------------------------

create or replace function public.purchase_shop_pack(
  target_pack_code text,
  target_voucher_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_user_id uuid;
  current_league_id uuid;
  active_rotation_id uuid;
  pack_price integer;
  pack_card_count integer;
  required_voucher_type text;
  current_dp integer;
  voucher_row public.reward_vouchers%rowtype;
  purchase_id uuid;
  opening_id uuid;
  pity_count integer := 0;
  position_number integer;
  minimum_rarity_rank integer;
  rolled_rarity text;
  chosen_card_id uuid;
  chosen_card_rarity text;
  copy_limit integer;
  current_owned_count integer;
  next_copy_number integer;
  new_instance_id uuid;
  hit_pity_target boolean := false;
  attempts integer;
begin
  -- =======================================================
  -- AUTH
  -- =======================================================
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  -- =======================================================
  -- CURRENT LEAGUE
  -- =======================================================
  select
    lm.league_id
  into current_league_id
  from public.league_members lm
  where lm.profile_id = current_user_id
  limit 1;

  if current_league_id is null then
    raise exception 'Current user is not a league member.';
  end if;

  -- =======================================================
  -- VALID PACK
  -- =======================================================
  if target_pack_code not in ('normal', 'premium', 'deluxe', 'special') then
    raise exception 'Invalid pack type.';
  end if;

  active_rotation_id := public.get_active_shop_rotation();

  -- =======================================================
  -- PACK CONFIG
  -- =======================================================
  if target_pack_code <> 'special' then
    select
      price_dp,
      cards_per_pack
    into
      pack_price,
      pack_card_count
    from public.shop_pack_types
    where
      code = target_pack_code
      and active = true;

    if not found then
      raise exception 'Pack is not available.';
    end if;
  else
    if active_rotation_id is null then
      raise exception 'No active shop rotation.';
    end if;

    select
      special_pack_price_dp,
      special_pack_cards_per_pack
    into
      pack_price,
      pack_card_count
    from public.shop_rotations
    where
      id = active_rotation_id
      and status = 'active'
      and starts_at <= now()
      and ends_at > now();

    if pack_price is null or pack_card_count is null then
      raise exception 'Special Pack is not configured for this rotation.';
    end if;
  end if;

  -- =======================================================
  -- VOUCHER TYPE
  -- =======================================================
  required_voucher_type :=
    case target_pack_code
      when 'normal' then 'normal_pack'
      when 'premium' then 'premium_pack'
      when 'deluxe' then 'deluxe_pack'
      when 'special' then 'special_pack'
    end;

  -- =======================================================
  -- PAYMENT
  -- =======================================================
  if target_voucher_id is not null then
    select *
    into voucher_row
    from public.reward_vouchers
    where
      id = target_voucher_id
      and profile_id = current_user_id
    for update;

    if not found then
      raise exception 'Voucher not found.';
    end if;

    if voucher_row.voucher_type <> required_voucher_type then
      raise exception 'This voucher cannot be used for this pack.';
    end if;
  else
    select
      duel_points
    into current_dp
    from public.profiles
    where id = current_user_id
    for update;

    if not found then
      raise exception 'Profile not found.';
    end if;

    if current_dp < pack_price then
      raise exception 'Not enough Duel Points.';
    end if;

    update public.profiles
    set
      duel_points = duel_points - pack_price,
      updated_at = now()
    where id = current_user_id;
  end if;

  -- =======================================================
  -- PURCHASE
  -- =======================================================
  insert into public.shop_purchases (
    profile_id,
    purchase_type,
    rotation_id,
    pack_type_id,
    used_voucher_id,
    voucher_type_used,
    dp_spent
  )
  values (
    current_user_id,
    case
      when target_pack_code = 'special' then 'special_pack'
      else 'pack'
    end,
    active_rotation_id,
    case
      when target_pack_code = 'special' then null
      else (
        select id
        from public.shop_pack_types
        where code = target_pack_code
        limit 1
      )
    end,
    target_voucher_id,
    case
      when target_voucher_id is not null then required_voucher_type
      else null
    end,
    case
      when target_voucher_id is null then pack_price
      else 0
    end
  )
  returning id
  into purchase_id;

  -- =======================================================
  -- PACK OPENING
  -- =======================================================
  insert into public.shop_pack_openings (
    profile_id,
    purchase_id,
    rotation_id,
    pack_code
  )
  values (
    current_user_id,
    purchase_id,
    active_rotation_id,
    target_pack_code
  )
  returning id
  into opening_id;

  -- =======================================================
  -- PITY STATE
  -- =======================================================
  insert into public.shop_pack_pity (
    profile_id,
    pack_code,
    packs_since_ultra_or_better
  )
  values (
    current_user_id,
    target_pack_code,
    0
  )
  on conflict (profile_id, pack_code)
  do nothing;

  select
    packs_since_ultra_or_better
  into pity_count
  from public.shop_pack_pity
  where
    profile_id = current_user_id
    and pack_code = target_pack_code
  for update;

  -- =======================================================
  -- GENERATE CARDS
  -- =======================================================
  for position_number in 1..pack_card_count loop
    minimum_rarity_rank := 1;

    -- NORMAL PITY
    if target_pack_code = 'normal'
      and pity_count >= 8
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 3;
    -- PREMIUM
    elsif target_pack_code = 'premium'
      and pity_count >= 7
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 4;
    elsif target_pack_code = 'premium'
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 2;
    -- DELUXE
    elsif target_pack_code = 'deluxe'
      and pity_count >= 5
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 5;
    elsif target_pack_code = 'deluxe'
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 3;
    -- SPECIAL
    elsif target_pack_code = 'special'
      and pity_count >= 6
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 4;
    elsif target_pack_code = 'special'
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 3;
    end if;

    rolled_rarity := public.roll_shop_pack_rarity(target_pack_code, minimum_rarity_rank);

    -- =====================================================
    -- PICK CARD
    -- =====================================================
    attempts := 0;

    loop
      attempts := attempts + 1;

      if attempts > 25 then
        raise exception 'Could not find an eligible card for this pack.';
      end if;

      chosen_card_id := public.pick_shop_pack_card(
        current_user_id,
        rolled_rarity,
        case
          when target_pack_code = 'special' then active_rotation_id
          else null
        end
      );

      if chosen_card_id is null then
        raise exception 'Could not select a card for this pack.';
      end if;

      perform pg_advisory_xact_lock(hashtext(chosen_card_id::text));

      select
        game_rarity
      into chosen_card_rarity
      from public.card_catalog
      where id = chosen_card_id;

      if chosen_card_rarity is null then
        raise exception 'Selected card has no rarity.';
      end if;

      copy_limit := public.shop_card_copy_limit(chosen_card_rarity);

      select count(*)
      into current_owned_count
      from public.card_instances
      where
        league_id = current_league_id
        and current_owner_id = current_user_id
        and card_catalog_id = chosen_card_id;

      exit when current_owned_count < copy_limit;
    end loop;

    -- =====================================================
    -- COPY NUMBER PER LEAGUE
    -- =====================================================
    select
      coalesce(max(copy_number), 0) + 1
    into next_copy_number
    from public.card_instances
    where
      league_id = current_league_id
      and card_catalog_id = chosen_card_id;

    -- =====================================================
    -- CREATE CARD INSTANCE
    --
    -- Definitive shop ownership metadata
    -- =====================================================
    insert into public.card_instances (
      league_id,
      card_catalog_id,
      copy_number,
      current_owner_id,
      original_owner_id,
      original_acquisition_type,
      original_source_id,
      acquired_at,
      locked
    )
    values (
      current_league_id,
      chosen_card_id,
      next_copy_number,
      current_user_id,
      current_user_id,
      'shop',
      opening_id,
      now(),
      false
    )
    returning id
    into new_instance_id;

    -- =====================================================
    -- RECORD PULL
    -- =====================================================
    insert into public.shop_pack_pulls (
      opening_id,
      card_catalog_id,
      card_instance_id,
      pull_position,
      pulled_rarity
    )
    values (
      opening_id,
      chosen_card_id,
      new_instance_id,
      position_number,
      chosen_card_rarity
    );

    -- =====================================================
    -- PITY RESET CHECK
    -- =====================================================
    if target_pack_code = 'normal'
      and public.shop_rarity_rank(chosen_card_rarity) >= 3
    then
      hit_pity_target := true;
    elsif target_pack_code = 'premium'
      and public.shop_rarity_rank(chosen_card_rarity) >= 4
    then
      hit_pity_target := true;
    elsif target_pack_code = 'deluxe'
      and public.shop_rarity_rank(chosen_card_rarity) >= 5
    then
      hit_pity_target := true;
    elsif target_pack_code = 'special'
      and public.shop_rarity_rank(chosen_card_rarity) >= 4
    then
      hit_pity_target := true;
    end if;
  end loop;

  -- =======================================================
  -- UPDATE PITY
  -- =======================================================
  if hit_pity_target then
    update public.shop_pack_pity
    set
      packs_since_ultra_or_better = 0,
      updated_at = now()
    where
      profile_id = current_user_id
      and pack_code = target_pack_code;
  else
    update public.shop_pack_pity
    set
      packs_since_ultra_or_better = packs_since_ultra_or_better + 1,
      updated_at = now()
    where
      profile_id = current_user_id
      and pack_code = target_pack_code;
  end if;

  -- =======================================================
  -- CONSUME VOUCHER
  -- =======================================================
  if target_voucher_id is not null then
    if voucher_row.quantity <= 1 then
      delete from public.reward_vouchers
      where id = target_voucher_id;
    else
      update public.reward_vouchers
      set
        quantity = quantity - 1,
        updated_at = now()
      where id = target_voucher_id;
    end if;
  end if;

  return opening_id;
end;
$function$;

-- ---------------------------------------------------------
-- GRANTS
--
-- purchase_shop_pack is called directly from the client via
-- supabase.rpc(...), same as purchase_shop_rotation_card.
-- The helper functions are only called internally from
-- purchase_shop_pack / pick_shop_pack_card and are not
-- granted directly, matching the consume_reward_voucher
-- pattern already used in 20260820_shop_system.sql.
-- ---------------------------------------------------------

grant execute
on function public.purchase_shop_pack(text, uuid)
to authenticated;

commit;
