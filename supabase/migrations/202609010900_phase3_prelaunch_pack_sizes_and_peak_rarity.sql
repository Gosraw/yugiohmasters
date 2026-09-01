begin;

-- =========================================================
-- PHASE 3 - FINAL PRE-LAUNCH ECONOMY REBUILD (2026-09-01)
--
-- Implements the human-approved FINAL Season 1 economy from the
-- pre-launch release-sprint directive, superseding the odds/pack-
-- size choices from the Phase 2 follow-up pass (202608311400) where
-- they conflict. Match DP, round rewards, and pack PRICES are
-- already correct from Phase 2 and are NOT touched here (Win 100 /
-- Loss 75; round participation 250+Premium, 1st 150+Standard, 2nd
-- 75, 3rd nothing extra; Standard 300 / Premium 900 / Special 1200 /
-- Deluxe 1500 DP) - this migration is scoped to exactly the two
-- things the final directive changed: PACK SIZES and the RARITY
-- ODDS MODEL.
--
-- =======================================================
-- 1. PACK SIZES
-- =======================================================
-- Target: Standard 5 / Premium 7 / Special 7 / Deluxe 10 cards.
-- Verified current live values first (202608231510_basic_pack_
-- five_cards.sql's own header already documents a full audit):
-- Standard is ALREADY 5 (bumped 4->5 by that migration, chrono-
-- logically after the 202608230021 migration that had set it to 4 -
-- the Phase 2 follow-up pass's simulation incorrectly assumed 4,
-- having stopped at 202608230021 without walking the full
-- chronological chain; this migration is the correction and the
-- Phase 3 report flags the discrepancy explicitly). Premium is
-- currently 5 (needs +2 -> 7). Deluxe is currently 7 (needs +3 ->
-- 10). Special is currently 5 across all rotation categories (needs
-- +2 -> 7).
--
-- =======================================================
-- 2. RARITY ODDS MODEL - PACK-LEVEL PEAK HIT, NOT PER-CARD
-- =======================================================
-- The directive is explicit and unambiguous: "these are PACK-LEVEL
-- highest-hit probabilities, NOT independent odds on every card
-- slot" and "do not accidentally make a 10-card Deluxe pack roll
-- Legendary at 5% ten separate times." The Phase 2 follow-up's
-- per-card-independent roll_shop_pack_rarity() table (plus its
-- separate always-on "guaranteed floor card" mechanic on the last
-- slot) is architecturally the wrong shape for this requirement -
-- every additional card in a pack multiplicatively raised that
-- pack's real chance of hitting a top rarity, and the floor card
-- added yet another independent chance on top. That table and
-- mechanic are retired below (roll_shop_pack_rarity keeps existing,
-- byte-unchanged, as it is potentially still referenced by other
-- code paths/tests, but purchase_shop_pack no longer calls it).
--
-- New model, exactly matching the exact per-pack top-end
-- percentages given (interpreted as MUTUALLY EXCLUSIVE exact-tier
-- buckets, not cumulative "at least" thresholds - see this
-- migration's roll_shop_pack_peak_rarity() function comment for why
-- the Deluxe numbers specifically rule out a cumulative reading):
-- exactly ONE random roll per pack purchase decides the pack's
-- single "peak" (most exciting) card - Legendary, Secret Rare, Ultra
-- Rare, Super Rare, or no notable hit at all - at EXACTLY the
-- approved per-tier probability. If there is a peak, exactly one
-- randomly-positioned card slot in the pack receives it; every other
-- slot is a "filler" card drawn only from Normal/Rare (never
-- independently capable of producing a second Legendary/Secret/
-- Ultra/Super hit, so the realized per-pack odds are now identical
-- to the approved numbers by construction, not merely close to them
-- after simulation).
--
-- PITY is preserved in spirit but reworked to fit: after a
-- configured cold-streak length with no qualifying pull, the pack's
-- peak is upgraded (never downgraded) to at least a guaranteed tier
-- - Ultra Rare for Standard/Premium/Special, Secret Rare for Deluxe
-- - so a bad run of luck is bounded without ever guaranteeing a
-- Legendary. See purchase_shop_pack's own inline comment for the
-- exact thresholds (unchanged packs-since-good-pull counts from the
-- live system) and why Deluxe's guarantee tier now correctly matches
-- its own reset condition (a pre-existing inconsistency fixed as a
-- byproduct, not a separate redesign).
--
-- LEGENDARY LEAGUE-WIDE UNIQUENESS is completely unaffected by this
-- migration: pick_shop_pack_card's league-wide copy-limit check and
-- safe reroll/fallback chain (theme+rarity -> rarity only -> theme
-- any rarity -> any card) are untouched and still apply identically
-- regardless of how rolled_rarity for a given slot was produced.
--
-- SAFETY: every UPDATE below is additive/idempotent (guarded by a
-- WHERE clause on the pre-change value, same pattern as every prior
-- pack-price/size correction in this repo). Every CREATE is OR
-- REPLACE. Existing card_instances, ownership, and completed
-- purchases/openings are never touched.
-- =========================================================

-- ---------------------------------------------------------
-- Pack sizes: shop_pack_types (Standard/Premium/Deluxe)
-- ---------------------------------------------------------

update public.shop_pack_types
set cards_per_pack = 7, updated_at = now()
where code = 'premium' and cards_per_pack = 5;

update public.shop_pack_types
set cards_per_pack = 10, updated_at = now()
where code = 'deluxe' and cards_per_pack = 7;

-- Standard/normal is already 5 cards (see header) - no update
-- needed, but assert it below as a structural check rather than
-- silently assuming.
do $$
begin
  if not exists (
    select 1 from public.shop_pack_types where code = 'normal' and cards_per_pack = 5
  ) then
    raise exception 'PHASE 3 MIGRATION ABORTED: expected shop_pack_types.normal.cards_per_pack = 5 already (per 202608231510), found a different value - the pack-size baseline this migration assumes has changed; update this migration''s assumptions before proceeding.';
  end if;
end $$;

-- ---------------------------------------------------------
-- Pack size: Special packs (shop_special_pack_rotations), both any
-- currently-active rotation rows and future ones via the generator
-- function reissued further below.
-- ---------------------------------------------------------

update public.shop_special_pack_rotations
set cards_per_pack = 7, updated_at = now()
where status = 'active' and cards_per_pack = 5;

-- ---------------------------------------------------------
-- refresh_shop_special_pack_rotation_if_needed - reissued only to
-- change the hardcoded cards_per_pack literal for FUTURE rotations
-- from 5 to 7. Everything else (deterministic sequential slot
-- advance, 48h duration, price 1200) is byte-for-byte identical to
-- the 202608311400 version.
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

  -- Deterministic sequential advance (replaces order by random()):
  -- wraps back to slot 1 after the last configured slot. With 5
  -- slots per category and a 48h rotation, this is a 10-day full
  -- cycle per category.
  next_slot_order := case
    when previous_slot_order is null then 1
    else (previous_slot_order % total_slots) + 1
  end;

  select theme_value, theme_label
  into next_theme_value, next_theme_label
  from public.shop_special_pack_slots
  where theme_category = target_theme_category
    and slot_order = next_slot_order;

  if next_theme_value is null then
    return;
  end if;

  insert into public.shop_special_pack_rotations (
    theme_category,
    slot_order,
    theme_value,
    theme_label,
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
    1200,
    7,
    now(),
    now() + interval '48 hours',
    'active'
  );
end;
$function$;

revoke all on function public.refresh_shop_special_pack_rotation_if_needed(text) from public;
grant execute on function public.refresh_shop_special_pack_rotation_if_needed(text) to authenticated;

-- ---------------------------------------------------------
-- roll_shop_pack_peak_rarity - THE Phase 3 rarity model.
--
-- Exactly one call per pack purchase (not per card). Returns the
-- pack's single "peak" rarity - Legendary, Secret Rare, Ultra Rare,
-- or Super Rare - or null when this pack has no notable hit at all.
--
-- INTERPRETATION NOTE (why exact/exclusive buckets, not cumulative
-- "at least" thresholds): the approved numbers for Deluxe are
-- Legendary 5.0%, Secret 30%, Ultra 45%, Super 18%. If these were
-- cumulative "probability of at least this tier" thresholds, Super's
-- threshold (the most inclusive - it must cover Super-or-better)
-- would have to be the LARGEST of the four, but 18% is smaller than
-- Ultra's 45% - a cumulative reading is mathematically impossible
-- for the numbers as given. Read as exact, mutually-exclusive
-- buckets (the probability the pack's peak is precisely that tier),
-- every pack tier's numbers work cleanly with no contradiction, and
-- this exactly matches the directive's own framing: "the pack first
-- determines its meaningful rarity hit."
--
-- Standard:  Legendary 0.25% / Secret 2.5% / Ultra 10% / Super 30%
--            (42.75% chance of any notable hit; 57.25% plain)
-- Premium:   Legendary 1.5%  / Secret 12%  / Ultra 30% / Super 42%
--            (85.5% chance of any notable hit; 14.5% plain)
-- Special:   Legendary 1.0%  / Secret 10%  / Ultra 28% / Super 42%
--            (81% chance of any notable hit; 19% plain) - slightly
--            below Premium's hit rate by design, matching the
--            directive's own pack-strategy note that Special's
--            advantage is thematic targeting, not raw rarity
--            superiority.
-- Deluxe:    Legendary 5.0%  / Secret 30%  / Ultra 45% / Super 18%
--            (98% chance of any notable hit; 2% plain) - the
--            "premium high-end gamble... still useful even when
--            Legendary does not hit" pack, by design almost always
--            delivers something.
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
      legendary_pct := 0.25; secret_pct := 2.5; ultra_pct := 10; super_pct := 30;
    when 'premium' then
      legendary_pct := 1.5; secret_pct := 12; ultra_pct := 30; super_pct := 42;
    when 'special_attribute', 'special_archetype', 'special_monster_type', 'special' then
      legendary_pct := 1.0; secret_pct := 10; ultra_pct := 28; super_pct := 42;
    when 'deluxe' then
      legendary_pct := 5.0; secret_pct := 30; ultra_pct := 45; super_pct := 18;
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
-- roll_shop_pack_filler_rarity - every non-peak card slot. Deals
-- only in the "collection and deck foundation" tiers (Normal/Rare)
-- so a filler slot can never independently reproduce a top-tier hit
-- and inflate the pack's real odds above roll_shop_pack_peak_rarity's
-- exact numbers. The Normal:Rare split is a Phase 3 design choice
-- (not specified by the directive, which only fixed the top-end
-- numbers) chosen to reinforce each pack's stated strategic role:
-- Standard is the cheap volume/collection-builder pack (mostly
-- Normal filler), Deluxe is the premium pack where even non-peak
-- cards should feel worthwhile (mostly Rare filler), Premium/Special
-- sit in between with Special very slightly better than Premium to
-- match its higher price without out-competing it on raw odds.
-- ---------------------------------------------------------

create or replace function public.roll_shop_pack_filler_rarity(
  target_pack_code text
)
returns text
language plpgsql
as $function$
declare
  roll numeric;
  rare_pct numeric;
begin
  case target_pack_code
    when 'normal' then rare_pct := 35;
    when 'premium' then rare_pct := 60;
    when 'special_attribute', 'special_archetype', 'special_monster_type', 'special' then rare_pct := 70;
    when 'deluxe' then rare_pct := 85;
    else
      raise exception 'Unknown pack code.';
  end case;

  roll := random() * 100;
  if roll < rare_pct then
    return 'Rare';
  end if;
  return 'Normal';
end;
$function$;

-- ---------------------------------------------------------
-- purchase_shop_pack - reissued to use the new pack-level
-- peak-rarity model above instead of the old per-card
-- roll_shop_pack_rarity()/minimum_rarity_rank floor mechanic.
-- Payment, purchase/opening records, the PICK CARD retry loop
-- (with its existing league-wide Legendary copy-limit check and
-- safe reroll/fallback chain), first-pull tracking, card
-- instance creation, and voucher consumption are all
-- byte-for-byte identical to the 202608311400 version - only
-- the rarity-determination and pity sections changed. See the
-- inline comments in the GENERATE CARDS section below.
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
  pack_peak_rarity text;
  pack_peak_position integer;
  pity_guarantee_rarity text;
  pity_threshold integer;
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
  -- PACK-LEVEL PEAK RARITY (Phase 3 rebuild, 2026-09-01)
  --
  -- Replaces the old per-card-independent roll_shop_pack_rarity()
  -- table entirely (see this migration's header for why: the old
  -- model let a pack's Legendary/Secret/Ultra chance compound across
  -- every card slot, and separately carried an always-on "guaranteed
  -- floor card" with its own embedded Legendary tail, which together
  -- made the REALIZED odds materially higher and harder to reason
  -- about than the intended per-pack top-end numbers). Exactly ONE
  -- roll per pack determines its single meaningful/exciting hit
  -- (Legendary, Secret Rare, Ultra Rare, Super Rare, or none) via
  -- roll_shop_pack_peak_rarity() - the mutually-exclusive buckets
  -- documented on that function match this pack tier's approved
  -- top-end odds exactly, as a real per-pack probability, not a
  -- per-card one. Every other card in the pack is "filler" (Normal/
  -- Rare foundation only, via roll_shop_pack_filler_rarity()) so
  -- filler slots can never independently reproduce a Legendary/
  -- Secret/Ultra/Super hit and silently inflate the pack's real odds
  -- above the approved numbers.
  --
  -- PITY: unchanged in spirit (guarantee a decent pull after a cold
  -- streak, tracked in the pre-existing shop_pack_pity table/columns
  -- - no schema change), but now upgrades the PACK'S PEAK to at
  -- least a guaranteed tier instead of forcing only the last card
  -- via a separate high-Legendary-tail table. Pity never grants
  -- Legendary - its ceiling is Ultra Rare (Standard/Premium/Special)
  -- or Secret Rare (Deluxe) - so a cold streak buys real value
  -- without turning into a Legendary farm. Thresholds are the same
  -- packs-without-a-good-pull counts the live system already used;
  -- the guarantee tier now consistently matches its own reset
  -- condition (the old Deluxe pity checked for a Secret+ pull to
  -- reset the counter but only ever forced an Ultra-Rare-caliber
  -- floor - a pre-existing inconsistency, fixed here as a byproduct
  -- of the rebuild, not a separate change).
  -- =======================================================
  pack_peak_rarity := public.roll_shop_pack_peak_rarity(target_pack_code);

  pity_threshold := case target_pack_code
    when 'normal' then 8
    when 'premium' then 7
    when 'deluxe' then 5
    when 'special_attribute', 'special_archetype', 'special_monster_type' then 6
  end;
  pity_guarantee_rarity := case target_pack_code
    when 'deluxe' then 'Secret Rare'
    else 'Ultra Rare'
  end;

  if pity_count >= pity_threshold
    and (
      pack_peak_rarity is null
      or public.shop_rarity_rank(pack_peak_rarity) < public.shop_rarity_rank(pity_guarantee_rarity)
    )
  then
    pack_peak_rarity := pity_guarantee_rarity;
  end if;

  hit_pity_target := pack_peak_rarity is not null
    and public.shop_rarity_rank(pack_peak_rarity) >= public.shop_rarity_rank(pity_guarantee_rarity);

  -- One randomly chosen slot in the pack carries the peak hit (when
  -- there is one this pack) so the exciting card isn't predictably
  -- always the last one opened.
  pack_peak_position := 1 + floor(random() * pack_card_count)::integer;

  -- =======================================================
  -- GENERATE CARDS
  -- =======================================================
  for position_number in 1..pack_card_count loop
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
      if chosen_card_rarity = 'Legendary' then
        select count(*)
        into current_owned_count
        from public.card_instances
        where
          league_id = current_league_id
          and card_catalog_id = chosen_card_id;
      else
        select count(*)
        into current_owned_count
        from public.card_instances
        where
          league_id = current_league_id
          and current_owner_id = current_user_id
          and card_catalog_id = chosen_card_id;
      end if;

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

-- ---------------------------------------------------------
-- _phase3_verify_introspect() - narrow read-only RPC backing
-- scripts/verify-phase3-live.mjs, same pattern as _phase2_verify_
-- introspect(). Kept separate from the Phase 2 helper rather than
-- extended in place, so an already-tested Phase 2 check surface is
-- never modified by this pass.
-- ---------------------------------------------------------

create or replace function public._phase3_verify_introspect()
returns jsonb
language plpgsql
security definer
set search_path to 'public, pg_catalog'
as $function$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'functions', (
      select jsonb_object_agg(fn, exists(select 1 from pg_proc where proname = fn))
      from unnest(array[
        'roll_shop_pack_peak_rarity',
        'roll_shop_pack_filler_rarity',
        'refresh_shop_special_pack_rotation_if_needed',
        'purchase_shop_pack'
      ]) as fn
    ),
    'purchase_shop_pack_uses_peak_model', (
      select p.prosrc ilike '%roll_shop_pack_peak_rarity%'
        and p.prosrc ilike '%roll_shop_pack_filler_rarity%'
        and p.prosrc not ilike '%minimum_rarity_rank%'
      from pg_proc p
      where p.proname = 'purchase_shop_pack'
      limit 1
    ),
    'shop_pack_types_cards_per_pack', (
      select jsonb_object_agg(code, cards_per_pack)
      from public.shop_pack_types
      where code in ('normal', 'premium', 'deluxe')
    ),
    'shop_pack_types_price_dp', (
      select jsonb_object_agg(code, price_dp)
      from public.shop_pack_types
      where code in ('normal', 'premium', 'deluxe')
    ),
    'active_special_pack_cards_per_pack', (
      select coalesce(jsonb_agg(distinct cards_per_pack), '[]'::jsonb)
      from public.shop_special_pack_rotations
      where status = 'active'
    ),
    'active_special_pack_prices', (
      select coalesce(jsonb_agg(distinct price_dp), '[]'::jsonb)
      from public.shop_special_pack_rotations
      where status = 'active'
    )
  ) into result;

  return result;
end;
$function$;

revoke all on function public._phase3_verify_introspect() from public;
grant execute on function public._phase3_verify_introspect() to service_role;

-- =========================================================
-- POST-MIGRATION STRUCTURAL ASSERTIONS
-- =========================================================

do $$
declare
  v_normal_cards integer;
  v_premium_cards integer;
  v_deluxe_cards integer;
  v_purchase_src text;
begin
  select cards_per_pack into v_normal_cards from public.shop_pack_types where code = 'normal';
  select cards_per_pack into v_premium_cards from public.shop_pack_types where code = 'premium';
  select cards_per_pack into v_deluxe_cards from public.shop_pack_types where code = 'deluxe';

  if v_normal_cards <> 5 or v_premium_cards <> 7 or v_deluxe_cards <> 10 then
    raise exception 'PHASE 3 MIGRATION ABORTED: shop_pack_types.cards_per_pack does not match the approved final sizes (normal=5, premium=7, deluxe=10). Found normal=%, premium=%, deluxe=%.',
      v_normal_cards, v_premium_cards, v_deluxe_cards;
  end if;

  if exists (
    select 1 from public.shop_special_pack_rotations
    where status = 'active' and cards_per_pack <> 7
  ) then
    raise exception 'PHASE 3 MIGRATION ABORTED: an active shop_special_pack_rotations row still has a cards_per_pack other than 7.';
  end if;

  if to_regprocedure('public.roll_shop_pack_peak_rarity(text)') is null then
    raise exception 'PHASE 3 MIGRATION ABORTED: roll_shop_pack_peak_rarity(text) function was not created.';
  end if;

  if to_regprocedure('public.roll_shop_pack_filler_rarity(text)') is null then
    raise exception 'PHASE 3 MIGRATION ABORTED: roll_shop_pack_filler_rarity(text) function was not created.';
  end if;

  select p.prosrc into v_purchase_src from pg_proc p where p.proname = 'purchase_shop_pack' limit 1;
  if v_purchase_src is null
     or v_purchase_src not ilike '%roll_shop_pack_peak_rarity%'
     or v_purchase_src not ilike '%roll_shop_pack_filler_rarity%' then
    raise exception 'PHASE 3 MIGRATION ABORTED: purchase_shop_pack does not use the new pack-level peak-rarity model.';
  end if;

  if v_purchase_src ilike '%minimum_rarity_rank%' then
    raise exception 'PHASE 3 MIGRATION ABORTED: purchase_shop_pack still references the old minimum_rarity_rank per-card floor mechanic - it should have been fully replaced by the pack-level peak model.';
  end if;

  if to_regprocedure('public._phase3_verify_introspect()') is null then
    raise exception 'PHASE 3 MIGRATION ABORTED: _phase3_verify_introspect() helper function was not created.';
  end if;

  raise notice 'PHASE 3 MIGRATION: all structural assertions passed (pack sizes = 5/7/7/10; purchase_shop_pack uses the new pack-level peak-rarity model with no leftover per-card floor mechanic; verification helper installed).';
end $$;

commit;
