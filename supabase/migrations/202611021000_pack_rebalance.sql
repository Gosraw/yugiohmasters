begin;

-- =========================================================
-- Pack rebalance (owner decisions, 2026-11-02)
--
-- Why: Standard packs were far better value than the others.
--
--   Pack       Price  Cards  Peak L / S / U / Su    Filler N / R / Su / U
--   Standard     400      5  0.25 / 2 / 8 / 25      75 / 25
--   Special     1000     10  1.75 / 13 / 30 / 44    35 / 50 / 15
--   Premium      900     10  2.25 / 15 / 32 / 43    30 / 60 / 10
--   Deluxe      1500     14  8 / 38 / 44 / 10       5 / 60 / 30 / 5
--
-- Luck gain per pack is unchanged.
--
-- Special Pack archetype cap: at most 2 cards with the same
-- card_catalog.archetype in one Special Pack, peak included. A null or
-- empty archetype doesn't count. Standard, Premium and Deluxe have no
-- cap. A purchase never fails because of the cap: a slot that cannot
-- be filled within it gives way (see _pick_shop_pack_card_constrained).
--
-- Also: no second copy of a card inside one pack (every pack type),
-- unless the pool leaves no other choice. The old code allowed it.
--
-- Also: the last-resort step of the card pick (nothing left at or
-- below the rolled rarity) used to take a random card of ANY rarity.
-- A pool without Normals (beast_kingdom has none) therefore turned
-- every Normal slot into a random Super, Ultra or Secret Rare, and
-- could turn a filler slot into a Legendary. It now takes the nearest
-- rarity ABOVE the rolled one.
--
-- Signatures are unchanged: purchase_shop_pack(target_pack_code,
-- target_voucher_id default null), pick_shop_pack_card(target_profile_id,
-- target_rarity, target_rotation_id default null). The extra inputs go
-- through a new internal helper, because adding a defaulted parameter
-- to pick_shop_pack_card would leave two overloads and make every
-- existing 3-argument call ambiguous.
--
-- Safe to run twice. Works with the live main app, which reads prices
-- and sizes from these tables.
--
-- supabase/manual_deploy/20261102_pack_rebalance.sql is this same text
-- plus a verification SELECT, built by
-- scripts/season2/build-pack-rebalance-manual.mjs. Change this file,
-- then rebuild that one.
-- =========================================================


-- ---------------------------------------------------------
-- 1. Prices and sizes
-- ---------------------------------------------------------

update public.shop_pack_types
set
  price_dp = 400,
  cards_per_pack = 5,
  updated_at = now()
where code = 'normal'
  and (price_dp, cards_per_pack) is distinct from (400, 5);

update public.shop_pack_types
set
  price_dp = 900,
  cards_per_pack = 10,
  updated_at = now()
where code = 'premium'
  and (price_dp, cards_per_pack) is distinct from (900, 10);

update public.shop_pack_types
set
  price_dp = 1500,
  cards_per_pack = 14,
  updated_at = now()
where code = 'deluxe'
  and (price_dp, cards_per_pack) is distinct from (1500, 14);

-- Special Packs take their price from the rotation row. The only row
-- statuses are 'active' and 'completed'; there are no scheduled rows,
-- so "future" rotations are whatever the generator below inserts.
-- Completed rows stay as they were: they are history.
update public.shop_special_pack_rotations
set
  price_dp = 1000,
  cards_per_pack = 10,
  updated_at = now()
where status = 'active'
  and (price_dp, cards_per_pack) is distinct from (1000, 10);


-- ---------------------------------------------------------
-- 2. refresh_shop_special_pack_rotation_if_needed: the price of every
--    new rotation (1200 -> 1000). Otherwise identical to 202609020950.
-- ---------------------------------------------------------

create or replace function public.refresh_shop_special_pack_rotation_if_needed(
  target_theme_category text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_row public.shop_special_pack_rotations%rowtype;
  total_slots integer;
  previous_slot_order integer;
  next_slot_order integer;
  next_theme_value text;
  next_theme_label text;
  next_pack_definition_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('shop_special_pack_rotation:' || target_theme_category));

  select *
  into current_row
  from public.shop_special_pack_rotations
  where theme_category = target_theme_category
    and status = 'active'
  order by starts_at desc
  limit 1;

  if found and current_row.ends_at > now() then
    return;
  end if;

  if found then
    update public.shop_special_pack_rotations
    set status = 'completed', updated_at = now()
    where id = current_row.id;
  end if;

  select count(*)
  into total_slots
  from public.shop_special_pack_slots
  where theme_category = target_theme_category;

  if total_slots = 0 then
    return;
  end if;

  previous_slot_order := current_row.slot_order;

  -- Deterministic sequential advance (unchanged from 202609011300):
  -- wraps back to slot 1 after the last configured slot. With up to
  -- 5 slots per category and a 48h rotation, this is up to a 10-day
  -- full cycle per category.
  next_slot_order := case
    when previous_slot_order is null then 1
    else (previous_slot_order % total_slots) + 1
  end;

  -- 2026-09-02 CURATED POOL REBUILD: also read the slot's curated
  -- pack. If the slot has no pack assigned yet, or its pack has been
  -- deliberately deactivated (shop_special_pack_definitions.is_active
  -- = false), skip this refresh exactly like the pre-existing
  -- "no configured slots at all" case - a missing rotation is safer
  -- than one pointing at a retired/unassigned pack, and the category
  -- simply shows one fewer active Special Pack until a human assigns
  -- or reactivates a pack for this slot.
  select s.theme_value, s.theme_label, s.pack_definition_id
  into next_theme_value, next_theme_label, next_pack_definition_id
  from public.shop_special_pack_slots s
  left join public.shop_special_pack_definitions d on d.id = s.pack_definition_id
  where s.theme_category = target_theme_category
    and s.slot_order = next_slot_order
    and (s.pack_definition_id is null or d.is_active = true);

  if next_theme_value is null then
    return;
  end if;

  if next_pack_definition_id is null then
    return;
  end if;

  insert into public.shop_special_pack_rotations (
    theme_category,
    slot_order,
    theme_value,
    theme_label,
    pack_definition_id,
    price_dp,
    cards_per_pack,
    starts_at,
    ends_at,
    status
  )
  values (
    target_theme_category,
    next_slot_order,
    next_theme_value,
    next_theme_label,
    next_pack_definition_id,
    1000,
    10,
    now(),
    now() + interval '48 hours',
    'active'
  );
end;
$function$;


-- ---------------------------------------------------------
-- 3. The pack's one peak roll. Whatever is left after these four
--    (Deluxe: nothing) means no peak this pack.
-- ---------------------------------------------------------

create or replace function public.roll_shop_pack_peak_rarity(
  target_pack_code text
)
returns text
language plpgsql
as $function$
declare
  roll numeric;
  legendary_pct numeric;
  secret_pct numeric;
  ultra_pct numeric;
  super_pct numeric;
  cursor_pct numeric;
begin
  case target_pack_code
    when 'normal' then
      legendary_pct := 0.25; secret_pct := 2; ultra_pct := 8; super_pct := 25;
    when 'premium' then
      legendary_pct := 2.25; secret_pct := 15; ultra_pct := 32; super_pct := 43;
    when 'special_attribute', 'special_archetype', 'special_monster_type', 'special' then
      legendary_pct := 1.75; secret_pct := 13; ultra_pct := 30; super_pct := 44;
    when 'deluxe' then
      legendary_pct := 8; secret_pct := 38; ultra_pct := 44; super_pct := 10;
    else
      raise exception 'Unknown pack code.';
  end case;

  roll := random() * 100;
  cursor_pct := legendary_pct;
  if roll < cursor_pct then
    return 'Legendary';
  end if;

  cursor_pct := cursor_pct + secret_pct;
  if roll < cursor_pct then
    return 'Secret Rare';
  end if;

  cursor_pct := cursor_pct + ultra_pct;
  if roll < cursor_pct then
    return 'Ultra Rare';
  end if;

  cursor_pct := cursor_pct + super_pct;
  if roll < cursor_pct then
    return 'Super Rare';
  end if;

  return null;
end;
$function$;


-- ---------------------------------------------------------
-- 4. Every non-peak slot. Never Secret Rare or Legendary, so filler
--    can't reach the Legendary luck rules and each pack keeps its one
--    peak.
-- ---------------------------------------------------------

create or replace function public.roll_shop_pack_filler_rarity(
  target_pack_code text
)
returns text
language plpgsql
as $function$
declare
  roll numeric;
  normal_pct numeric;
  rare_pct numeric;
  super_pct numeric;
begin
  case target_pack_code
    when 'normal' then
      normal_pct := 75; rare_pct := 25; super_pct := 0;
    when 'premium' then
      normal_pct := 30; rare_pct := 60; super_pct := 10;
    when 'special_attribute', 'special_archetype', 'special_monster_type', 'special' then
      normal_pct := 35; rare_pct := 50; super_pct := 15;
    when 'deluxe' then
      normal_pct := 5; rare_pct := 60; super_pct := 30;
    else
      raise exception 'Unknown pack code.';
  end case;

  roll := random() * 100;

  if roll < normal_pct then
    return 'Normal';
  end if;

  if roll < normal_pct + rare_pct then
    return 'Rare';
  end if;

  if roll < normal_pct + rare_pct + super_pct then
    return 'Super Rare';
  end if;

  -- Only Deluxe gets here: the other three add up to 100 above.
  return 'Ultra Rare';
end;
$function$;


-- ---------------------------------------------------------
-- 5. The card pick, now with the pack's own constraints. Internal:
--    only purchase_shop_pack and pick_shop_pack_card call it.
--
-- Every attempt keeps the same eligibility, Boss Route exclusion,
-- league-wide copy limit and Special Pack pool rules. Only two things
-- ever give way, in this order:
--
--   within the cap, no repeat   exact rarity, lower, then higher
--   within the cap              exact rarity, lower, then higher
--   no repeat                   exact rarity, lower, then higher
--   neither                     exact rarity, lower, then higher
--
-- Lower = the best rarity below the rolled one (the 202610152000
-- ladder). Higher = the nearest rarity above it. With both arrays empty
-- this is the plain ladder. A raise is left only for a pool with no
-- free copy at all, the same failure as before; the cap can't cause it.
-- ---------------------------------------------------------

create or replace function public._pick_shop_pack_card_constrained(
  target_profile_id uuid,
  target_rarity text,
  target_rotation_id uuid default null,
  capped_archetypes text[] default '{}',
  pack_card_ids uuid[] default '{}'
)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  all_rarities constant text[] := array['Normal', 'Rare', 'Super Rare', 'Ultra Rare', 'Secret Rare', 'Legendary'];
  v_pack_definition_id uuid;
  chosen_card_id uuid;
  current_league_id uuid;
  target_rank integer;
  v_rule record;
  v_direction integer;
  v_rarities text[];
begin
  select lm.league_id
  into current_league_id
  from public.league_members lm
  where lm.profile_id = target_profile_id
  limit 1;

  target_rank := public.shop_rarity_rank(target_rarity);

  -- SPECIAL PACK: resolve the purchased rotation straight to its
  -- curated pack pool. Null for a Normal/Premium/Deluxe pack.
  if target_rotation_id is not null then
    select rotation.pack_definition_id
    into v_pack_definition_id
    from public.shop_special_pack_rotations rotation
    where rotation.id = target_rotation_id;
  end if;

  for v_rule in
    select *
    from (
      values
        (true, true),
        (true, false),
        (false, true),
        (false, false)
    ) as rule(keep_cap, keep_unique)
  loop
    -- 0 = the rolled rarity, -1 = below it (best first), 1 = above it
    -- (nearest first).
    foreach v_direction in array array[0, -1, 1] loop
      select array_agg(rarity)
      into v_rarities
      from unnest(all_rarities) as rarity
      where sign(public.shop_rarity_rank(rarity) - target_rank) = v_direction;

      continue when v_rarities is null;

      select
        card.id
      into chosen_card_id
      from public.card_catalog card
      where
        card.format_eligible = true
        and public.is_master_duel_offerable(card.master_duel_status)
        -- Boss-Route exclusion: a route's Stage 4 evolution monster and
        -- every is_route_exclusive grant are never in a pack.
        and not exists (
          select 1
          from public.boss_route_stages brs
          where brs.evolution_card_catalog_id = card.id
            and brs.stage_number = 4
        )
        and not exists (
          select 1
          from public.boss_route_stage_grants brg
          where brg.card_catalog_id = card.id
            and brg.is_route_exclusive = true
        )
        and card.game_rarity = any (v_rarities)
        and (
          select count(*)
          from public.card_instances instance
          where
            instance.card_catalog_id = card.id
            -- League-wide for EVERY rarity, like the
            -- validate_new_card_instance() trigger (202610121600).
            and instance.league_id = current_league_id
        ) < public.shop_card_copy_limit(card.game_rarity)
        and (
          v_pack_definition_id is null
          or exists (
            select 1
            from public.shop_special_pack_pool_cards spc
            where spc.pack_definition_id = v_pack_definition_id
              and spc.card_catalog_id = card.id
          )
        )
        and (
          not v_rule.keep_cap
          or coalesce(lower(btrim(card.archetype)), '') <> all (capped_archetypes)
        )
        and (
          not v_rule.keep_unique
          or card.id <> all (pack_card_ids)
        )
      order by
        v_direction * public.shop_rarity_rank(card.game_rarity),
        random()
      limit 1;

      if chosen_card_id is not null then
        return chosen_card_id;
      end if;
    end loop;
  end loop;

  raise exception 'No eligible cards remain for this player.';
end;
$function$;

revoke all on function public._pick_shop_pack_card_constrained(uuid, text, uuid, text[], uuid[])
  from public, anon, authenticated, service_role;


-- ---------------------------------------------------------
-- 6. pick_shop_pack_card: same signature, same rights, plain ladder. The
--    purchase itself now calls the helper directly.
-- ---------------------------------------------------------

create or replace function public.pick_shop_pack_card(target_profile_id uuid, target_rarity text, target_rotation_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return public._pick_shop_pack_card_constrained(
    target_profile_id,
    target_rarity,
    target_rotation_id
  );
end;
$function$;


-- ---------------------------------------------------------
-- 7. purchase_shop_pack: the 202610121600 definition with the slot
--    order and the pack's constraints added to GENERATE CARDS. Payment,
--    vouchers, luck and records are untouched.
-- ---------------------------------------------------------

create or replace function public.purchase_shop_pack(target_pack_code text, target_voucher_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  position_number integer;
  pack_peak_rarity text;
  pack_peak_position integer;
  v_luck_points numeric := 0;
  luck_gain numeric;
  luck_guaranteed_legendary boolean := false;
  rolled_rarity text;
  chosen_card_id uuid;
  chosen_card_rarity text;
  copy_limit integer;
  current_owned_count integer;
  next_copy_number integer;
  new_instance_id uuid;
  attempts integer;
  is_first_pull boolean;
  legendary_pulled boolean := false;
  -- 202611021000: the cards chosen so far in THIS pack.
  special_archetype_cap constant integer := 2;
  generation_order integer[];
  pack_card_ids uuid[] := '{}';
  pack_archetypes text[] := '{}';
  capped_archetypes text[] := '{}';
  chosen_card_archetype text;
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
  if target_pack_code not in ('normal', 'premium', 'deluxe', 'special_attribute', 'special_archetype', 'special_monster_type') then
    raise exception 'Invalid pack type.';
  end if;

  active_rotation_id := public.get_active_shop_rotation();

  if target_pack_code in ('special_attribute', 'special_archetype', 'special_monster_type') then
    theme_category := case target_pack_code
      when 'special_attribute' then 'attribute'
      when 'special_archetype' then 'archetype'
      when 'special_monster_type' then 'monster_type'
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
      when 'special_monster_type' then 'special_pack'
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
  -- LEGENDARY LUCK STATE (go-live rebuild, 2026-09-01)
  --
  -- Replaces the old streak-pity
  -- entirely (see this migration's header for why: the go-live spec
  -- calls for ONE minimal, hidden, Legendary-only pity mechanic, not
  -- a separate frequent Ultra/Secret floor stacked on top of it).
  -- One row per player (not per pack type - "Luck gained per pack"
  -- accumulates from every pack purchase into a single counter).
  -- =======================================================
  insert into public.player_pack_luck (
    profile_id,
    luck_points
  )
  values (
    current_user_id,
    0
  )
  on conflict (profile_id)
  do nothing;

  select
    luck_points
  into v_luck_points
  from public.player_pack_luck
  where profile_id = current_user_id
  for update;

  luck_gain := case target_pack_code
    when 'normal' then 0.25
    when 'premium' then 1
    when 'deluxe' then 2
    when 'special_attribute' then 1.25 when 'special_archetype' then 1.25 when 'special_monster_type' then 1.25
  end;

  -- =======================================================
  -- PACK-LEVEL PEAK RARITY
  --
  -- Exactly ONE roll per pack determines its single meaningful/
  -- exciting hit (Legendary, Secret Rare, Ultra Rare, Super Rare, or
  -- none) via roll_shop_pack_peak_rarity() - unchanged from the
  -- Phase 3 rebuild. Every other card in the pack is "filler"
  -- (Normal/Rare, plus Super/Ultra in the better packs since
  -- 202611021000, via roll_shop_pack_filler_rarity()), so a filler slot
  -- never rolls a Secret Rare or Legendary and never touches the
  -- Legendary luck rules below.
  --
  -- EMERGENCY LEGENDARY PROTECTION: at >=100 accumulated Luck without
  -- a natural Legendary, this pack's peak is force-upgraded to
  -- Legendary regardless of the roll above - checked against the
  -- luck accumulated BEFORE this pack's own gain is added, matching
  -- "the NEXT pack after crossing ~100 guarantees one." Every pack
  -- tier is "eligible" for this guarantee (all four have a nonzero
  -- natural Legendary chance in roll_shop_pack_peak_rarity's own
  -- table) - if a future design wants to exclude Standard from
  -- redeeming the guarantee, add `and target_pack_code <> 'normal'`
  -- to the condition below.
  -- =======================================================
  pack_peak_rarity := public.roll_shop_pack_peak_rarity(target_pack_code);

  if pack_peak_rarity is distinct from 'Legendary' and v_luck_points >= 100 then
    pack_peak_rarity := 'Legendary';
    luck_guaranteed_legendary := true;
  end if;

  -- Natural Legendary resets luck to 0; a guaranteed one (already at
  -- >=100) also resets to 0 rather than continuing to climb past the
  -- threshold. Any other outcome accumulates this pack's luck_gain.
  --
  -- 202610121600: the luck update itself now happens after the cards
  -- are generated, so a Legendary peak that could not be delivered
  -- (no Legendary left in the league) keeps the player's luck.

  -- One randomly chosen slot in the pack carries the peak hit (when
  -- there is one this pack) so the exciting card isn't predictably
  -- always the last one opened.
  pack_peak_position := 1 + floor(random() * pack_card_count)::integer;

  -- =======================================================
  -- GENERATE CARDS
  -- =======================================================
  -- 202611021000: the peak slot is filled FIRST, so the Special Pack
  -- archetype cap can never cost a player the pack's best card (or a
  -- guaranteed Legendary). Its archetype still counts towards the cap
  -- for the other slots. The reveal goes by pull_position, so the
  -- player still sees the cards in slot order.
  select array[pack_peak_position] || coalesce(array_agg(slot order by slot), '{}')
  into generation_order
  from generate_series(1, pack_card_count) as slot
  where slot <> pack_peak_position;

  foreach position_number in array generation_order loop
    if position_number = pack_peak_position and pack_peak_rarity is not null then
      rolled_rarity := pack_peak_rarity;
    else
      rolled_rarity := public.roll_shop_pack_filler_rarity(target_pack_code);
    end if;

    -- =====================================================
    -- PICK CARD
    -- =====================================================
    attempts := 0;

    loop
      attempts := attempts + 1;

      if attempts > 25 then
        raise exception 'Could not find an eligible card for this pack.';
      end if;

      -- 202611021000: same pick as pick_shop_pack_card(), plus: no second
      -- copy of a card already in this pack and (Special Packs only,
      -- capped_archetypes stays empty otherwise) no archetype past the
      -- cap. Both give way when the pool leaves no other choice.
      chosen_card_id := public._pick_shop_pack_card_constrained(
        current_user_id,
        rolled_rarity,
        special_rotation_id,
        capped_archetypes,
        pack_card_ids
      );

      if chosen_card_id is null then
        raise exception 'Could not select a card for this pack.';
      end if;

      perform pg_advisory_xact_lock(hashtext(chosen_card_id::text));

      select
        game_rarity,
        nullif(lower(btrim(archetype)), '')
      into
        chosen_card_rarity,
        chosen_card_archetype
      from public.card_catalog
      where id = chosen_card_id;

      if chosen_card_rarity is null then
        raise exception 'Selected card has no rarity.';
      end if;

      copy_limit := public.shop_card_copy_limit(chosen_card_rarity);

      -- LEAGUE-WIDE LEGENDARY SCARCITY FIX (2026-08-30):
      -- shop_card_copy_limit()'s own comment has always said
      -- "Legendary = max 1 copy per league, everything else = max
      -- 3" - but this count query used to filter by
      -- current_owner_id = current_user_id for every rarity, making
      -- the Legendary limit a max of 1 copy PER PLAYER instead of
      -- one copy total across the whole league (each of the 3
      -- friends could pull their own "only" copy of the same
      -- Legendary). Legendary now counts every instance of this
      -- card in the league regardless of owner; every other rarity
      -- keeps its original per-player cap unchanged. Race-safe
      -- under the pg_advisory_xact_lock(hashtext(chosen_card_id::text))
      -- already taken above for this exact card_catalog_id, which
      -- was always keyed league-wide (not per-player) - so this was
      -- already safe to make league-wide, nothing else needed to
      -- change for concurrency.
      --
      -- 202610121600: every rarity now counts league-wide, matching
      -- validate_new_card_instance() (the trigger that actually
      -- enforces card_copy_limit). The old per-player count for
      -- non-Legendary cards let the picker choose a card the league
      -- already had 3 copies of, and the trigger then aborted the
      -- whole purchase ("Card scarcity limit reached").
      select count(*)
      into current_owned_count
      from public.card_instances
      where
        league_id = current_league_id
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

    if chosen_card_rarity = 'Legendary' then
      legendary_pulled := true;
    end if;

    -- =====================================================
    -- REMEMBER THIS CARD FOR THE REST OF THE PACK (202611021000)
    -- A null or empty archetype never counts. Standard, Premium and
    -- Deluxe packs have no archetype cap.
    -- =====================================================
    pack_card_ids := pack_card_ids || chosen_card_id;

    if theme_category is not null and chosen_card_archetype is not null then
      pack_archetypes := pack_archetypes || chosen_card_archetype;

      if cardinality(array_positions(pack_archetypes, chosen_card_archetype)) >= special_archetype_cap
        and not chosen_card_archetype = any (capped_archetypes) then
        capped_archetypes := capped_archetypes || chosen_card_archetype;
      end if;
    end if;

  end loop;

  -- =======================================================
  -- LEGENDARY LUCK UPDATE (moved below the card loop, 202610121600)
  -- A Legendary actually pulled resets luck to 0; otherwise this
  -- pack's luck_gain accumulates - also when the peak rolled (or was
  -- guaranteed as) Legendary but no Legendary was left to give.
  -- =======================================================
  if legendary_pulled then
    v_luck_points := 0;
  else
    v_luck_points := v_luck_points + luck_gain;
  end if;

  update public.player_pack_luck
  set
    luck_points = v_luck_points,
    updated_at = now()
  where profile_id = current_user_id;

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
-- 8. Stop and undo everything if the result is not what was decided.
-- ---------------------------------------------------------

do $check$
declare
  v_bad text;
  v_rolled text[];
begin
  select string_agg(code, ', ')
  into v_bad
  from public.shop_pack_types
  where (code, price_dp, cards_per_pack) not in (
    ('normal', 400, 5),
    ('premium', 900, 10),
    ('deluxe', 1500, 14)
  );

  if v_bad is not null then
    raise exception 'Pack rebalance check failed: wrong price or size on %', v_bad;
  end if;

  if exists (
    select 1
    from public.shop_special_pack_rotations
    where status = 'active'
      and (price_dp, cards_per_pack) is distinct from (1000, 10)
  ) then
    raise exception 'Pack rebalance check failed: an active special rotation is not 1000 DP / 10 cards';
  end if;

  if pg_get_function_identity_arguments('public.purchase_shop_pack(text, uuid)'::regprocedure)
    <> 'target_pack_code text, target_voucher_id uuid' then
    raise exception 'Pack rebalance check failed: purchase_shop_pack signature changed';
  end if;

  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'purchase_shop_pack') <> 1
    or (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'pick_shop_pack_card') <> 1 then
    raise exception 'Pack rebalance check failed: a pack function has a second overload';
  end if;

  if has_function_privilege('authenticated', 'public._pick_shop_pack_card_constrained(uuid, text, uuid, text[], uuid[])', 'execute')
    or has_function_privilege('anon', 'public._pick_shop_pack_card_constrained(uuid, text, uuid, text[], uuid[])', 'execute') then
    raise exception 'Pack rebalance check failed: the internal pick can be called from outside';
  end if;

  if pg_get_functiondef('public.refresh_shop_special_pack_rotation_if_needed(text)'::regprocedure) like '%1200%' then
    raise exception 'Pack rebalance check failed: the rotation generator still has the old price';
  end if;

  select array_agg(distinct public.roll_shop_pack_filler_rarity(pack))
  into v_rolled
  from unnest(array['normal', 'premium', 'deluxe', 'special_attribute', 'special_archetype', 'special_monster_type']) as pack
  cross join generate_series(1, 500);

  if v_rolled && array['Secret Rare', 'Legendary'] then
    raise exception 'Pack rebalance check failed: filler rolled %', v_rolled;
  end if;

  raise notice 'Pack rebalance checks passed.';
end;
$check$;

-- The API caches the list of database functions.
notify pgrst, 'reload schema';

commit;
