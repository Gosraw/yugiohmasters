-- =========================================================
-- LEGENDARY FIRST-PULL FIX - RE-DEPLOY AS A NEW MIGRATION
--
-- 202608230021_shop_v2_refresh_and_specials.sql had already run
-- against production BEFORE commit 22f305c corrected
-- purchase_shop_pack()'s Legendary "first pull" check (in that same
-- file, in git) to use public.ownership_history as the source of
-- truth instead of only card_instances.original_owner_id. Since an
-- already-applied migration does not re-run automatically, that
-- fix would never actually reach production by itself - this file
-- is the real deploy vehicle for it.
--
-- This is a straight CREATE OR REPLACE FUNCTION with the exact,
-- current, correct body of purchase_shop_pack() as it stands in git
-- today (202608230021 as amended by 22f305c) - byte-for-byte the
-- same function, nothing else. No other schema object is touched.
--
-- Explicitly UNCHANGED by this migration (verify by diff against
-- 202608230021's current body if ever in doubt):
-- - rarity odds / roll_shop_pack_rarity() call sites and thresholds
-- - pity thresholds and reset logic
-- - pack prices (read live from shop_pack_types /
--   shop_special_pack_rotations, not touched here)
-- - copy limits (shop_card_copy_limit())
-- - all other Shop V2 logic (rotations, theming, voucher handling)
--
-- The ONLY behavioral change versus what is actually live today is
-- the Legendary first-pull check itself: is_first_for_player is now
-- computed from public.ownership_history.to_owner_id (has this
-- player EVER owned this card_catalog_id, via any acquisition
-- route) instead of only card_instances.original_owner_id (which
-- goes stale the moment a card_instance changes hands via trade or
-- wager).
-- =========================================================

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
  theme_category text;
  special_rotation_id uuid;
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
  is_first_pull boolean;
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
  if target_pack_code not in ('normal', 'premium', 'deluxe', 'special_attribute', 'special_archetype') then
    raise exception 'Invalid pack type.';
  end if;

  active_rotation_id := public.get_active_shop_rotation();

  if target_pack_code in ('special_attribute', 'special_archetype') then
    theme_category := case target_pack_code
      when 'special_attribute' then 'attribute'
      else 'archetype'
    end;
  end if;

  -- =======================================================
  -- PACK CONFIG
  -- =======================================================
  if theme_category is null then
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
    special_rotation_id := public.get_active_special_pack_rotation(theme_category);

    if special_rotation_id is null then
      raise exception 'No active special pack rotation for this theme.';
    end if;

    select
      price_dp,
      cards_per_pack
    into
      pack_price,
      pack_card_count
    from public.shop_special_pack_rotations
    where id = special_rotation_id;

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
      when 'special_attribute' then 'special_pack'
      when 'special_archetype' then 'special_pack'
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
    special_pack_rotation_id,
    pack_type_id,
    used_voucher_id,
    voucher_type_used,
    dp_spent
  )
  values (
    current_user_id,
    case
      when theme_category is not null then 'special_pack'
      else 'pack'
    end,
    active_rotation_id,
    special_rotation_id,
    case
      when theme_category is not null then null
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
    special_pack_rotation_id,
    pack_code
  )
  values (
    current_user_id,
    purchase_id,
    active_rotation_id,
    special_rotation_id,
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
    -- SPECIAL (both categories share the old 'special' thresholds)
    elsif target_pack_code in ('special_attribute', 'special_archetype')
      and pity_count >= 6
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 4;
    elsif target_pack_code in ('special_attribute', 'special_archetype')
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
        special_rotation_id
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
    -- FIRST-EVER PULL CHECK (Legendary only)
    --
    -- Computed here, under the pg_advisory_xact_lock already
    -- taken above for this exact card_catalog_id - race-safe
    -- against concurrent purchases of the same card by design,
    -- not a client-side guess. Checked BEFORE the new instance
    -- below is inserted.
    --
    -- IMPORTANT: this is NOT "was this player the original_owner_id
    -- of some existing instance" - that only reflects the very
    -- first acquirer of a card_instance row and goes stale the
    -- moment that instance changes hands (trade, wager, any other
    -- ownership transfer). A player who received this exact
    -- card_catalog_id via trade and later traded it away again
    -- would wrongly read as "never owned" under that check.
    --
    -- public.ownership_history is the source of truth for every
    -- acquisition of every card_instance, for both the initial
    -- acquisition (INSERT trigger, to_owner_id = acquirer) and
    -- every later transfer (UPDATE trigger, to_owner_id = new
    -- owner) - see record_card_ownership_history() in
    -- 202608190004_card_instances.sql. So "has this player ever
    -- owned this card_catalog_id, via any route" is exactly
    -- "does a row exist where to_owner_id = current_user_id for
    -- any card_instance of this card_catalog_id", regardless of
    -- whether that player still holds it today.
    -- =====================================================
    is_first_pull := null;

    if chosen_card_rarity = 'Legendary' then
      select not exists (
        select 1
        from public.card_instances ci
        join public.ownership_history oh
          on oh.card_instance_id = ci.id
        where
          ci.card_catalog_id = chosen_card_id
          and oh.to_owner_id = current_user_id
      )
      into is_first_pull;
    end if;

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
      pulled_rarity,
      is_first_for_player
    )
    values (
      opening_id,
      chosen_card_id,
      new_instance_id,
      position_number,
      chosen_card_rarity,
      is_first_pull
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
    elsif target_pack_code in ('special_attribute', 'special_archetype')
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

revoke all
  on function public.purchase_shop_pack(text, uuid)
  from public;

grant execute
  on function public.purchase_shop_pack(text, uuid)
  to authenticated;
