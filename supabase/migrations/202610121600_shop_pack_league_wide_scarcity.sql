-- =========================================================
-- Shop packs: league-wide copy counting (2026-10-12 bug hunt)
--
-- Bug: opening a pack randomly failed with "Card scarcity limit
-- reached. Maximum copies: 3" (Normal ~1/10, Deluxe ~4/10, Special
-- ~1/3) and the WHOLE purchase rolled back.
--
-- Cause: pick_shop_pack_card() and purchase_shop_pack()'s retry loop
-- counted only the BUYER's copies of a non-Legendary card, while the
-- validate_new_card_instance() trigger (latest:
-- 202609012000_boss_route_rpcs.sql) caps copies LEAGUE-WIDE via
-- card_copy_limit(). So a card the league already had 3 copies of
-- (spread over the players) could still be picked, and the insert
-- then raised.
--
-- Fix: both now count every copy in the league, like the trigger and
-- create_next_draft_offer() already do. Full cards are skipped
-- instead of aborting the purchase. Nothing else about the pick
-- (rarity tiers, pools, Boss Route exclusion) changes.
--
-- Also (small, same function): Legendary luck only resets when a
-- Legendary was actually pulled. Before, a pack whose peak rolled
-- (or was guaranteed) Legendary reset luck to 0 even when no
-- Legendary was left in the league and the slot fell back to
-- another rarity.
--
-- Also: shop_pack_openings_pack_code_check (202608230021) never
-- allowed 'special_monster_type', so EVERY Monster Type Special Pack
-- purchase failed on insert. Widened below (additive, idempotent).
--
-- Based on the LIVE definitions (pick_shop_pack_card from
-- manual_deploy/20260902_season1_release.sql, purchase_shop_pack from
-- 202609011400_final_legendary_luck_pity_system.sql). Signatures are
-- unchanged - including target_voucher_id uuid default null - so
-- every caller and every grant stays as it is. Backwards compatible
-- with the live main app.
-- =========================================================

alter table public.shop_pack_openings
  drop constraint if exists shop_pack_openings_pack_code_check;

alter table public.shop_pack_openings
  add constraint shop_pack_openings_pack_code_check
  check (
    pack_code = any (array[
      'normal', 'premium', 'deluxe', 'special',
      'special_attribute', 'special_archetype', 'special_monster_type'
    ])
  );

create or replace function public.pick_shop_pack_card(target_profile_id uuid, target_rarity text, target_rotation_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pack_definition_id uuid;
  chosen_card_id uuid;
  current_league_id uuid;
begin
  select lm.league_id
  into current_league_id
  from public.league_members lm
  where lm.profile_id = target_profile_id
  limit 1;

  -- =======================================================
  -- SPECIAL PACK: resolve the purchased rotation straight to its
  -- curated pack pool - no theme_category / theme_value read here
  -- at all, since the pool membership check below is the entire
  -- special-pack filter now. Null for a Normal/Premium/Deluxe pack.
  -- =======================================================
  if target_rotation_id is not null then
    select rotation.pack_definition_id
    into v_pack_definition_id
    from public.shop_special_pack_rotations rotation
    where rotation.id = target_rotation_id;
  end if;

  -- =======================================================
  -- TIER 1: exact rolled rarity, and in-pool if this is a Special
  -- Pack pull (no-op pool check otherwise).
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and public.is_master_duel_offerable(card.master_duel_status)
    -- Boss-Route exclusion (Season 1 audit, corrected 2026-09-02):
    -- only a route's Stage 4 (final Boss) evolution monster is
    -- automatically excluded; Stage 1-3 evolution monsters are
    -- ordinary cards. Explicitly is_route_exclusive support grants
    -- are excluded at every stage.
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
    and card.game_rarity = target_rarity
    and (
      select count(*)
      from public.card_instances instance
      where
        instance.card_catalog_id = card.id
        -- League-wide for EVERY rarity, exactly like the
        -- validate_new_card_instance() trigger that enforces the cap
        -- (202610121600): full cards are skipped, not picked.
        and instance.league_id = current_league_id
    ) < public.shop_card_copy_limit(card.game_rarity)
    -- Pool membership: mandatory for a Special Pack pull, a no-op
    -- for Normal/Premium/Deluxe (v_pack_definition_id is null).
    -- Never relaxed in tier 2 below either.
    and (
      v_pack_definition_id is null
      or exists (
        select 1
        from public.shop_special_pack_pool_cards spc
        where spc.pack_definition_id = v_pack_definition_id
          and spc.card_catalog_id = card.id
      )
    )
  order by random()
  limit 1;

  if chosen_card_id is not null then
    return chosen_card_id;
  end if;

  -- =======================================================
  -- TIER 2 (final fallback): rarity relaxed to "any" - pool
  -- membership (for a Special Pack) is NOT relaxed, matching the
  -- rule that a pull may never leave the purchased pack's curated
  -- pool. For a Normal/Premium/Deluxe pack this is simply "any
  -- eligible, non-Boss-Route card below its copy limit," unchanged
  -- from historical behavior.
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and public.is_master_duel_offerable(card.master_duel_status)
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
    and (
      select count(*)
      from public.card_instances instance
      where
        instance.card_catalog_id = card.id
        -- League-wide for EVERY rarity, exactly like the
        -- validate_new_card_instance() trigger that enforces the cap
        -- (202610121600): full cards are skipped, not picked.
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
  order by random()
  limit 1;

  if chosen_card_id is null then
    raise exception 'No eligible cards remain for this player.';
  end if;

  return chosen_card_id;
end;
$function$;

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
  -- (Normal/Rare foundation only, via roll_shop_pack_filler_rarity())
  -- so filler slots can never independently reproduce a top-tier hit.
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
