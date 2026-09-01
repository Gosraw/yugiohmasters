begin;

-- =========================================================
-- SPECIAL PACK REBUILD, PART 2: SWITCH PULLS OVER TO THE
-- CURATED POOLS (see the companion 202609020940 migration for the
-- schema + the 15 curated packs/pools this reissues against)
--
-- WHAT CHANGES
--
--   1. refresh_shop_special_pack_rotation_if_needed(text) -
--      reissued, byte-for-byte identical deterministic
--      sequential-slot-advance / 48h-duration / 1200 DP / 10-card
--      logic from 202609011300, with exactly one addition: it now
--      also reads and carries forward each slot's
--      pack_definition_id onto the new shop_special_pack_rotations
--      row, and skips a slot whose curated pack has been marked
--      is_active = false (same "return early, no exception" safety
--      pattern already used for "no configured slots at all").
--
--   2. pick_shop_pack_card(uuid, text, uuid) - reissued. The ONLY
--      behavioral change: every special-pack candidate query used
--      to theme-match with
--        `coalesce(card.archetype/attribute/monster_type, '')
--         ilike '%' || theme_value || '%'`
--      evaluated LIVE against card_catalog at pull time. That is
--      replaced with
--        `exists (select 1 from shop_special_pack_pool_cards spc
--                 where spc.pack_definition_id = v_pack_definition_id
--                   and spc.card_catalog_id = card.id)`
--      i.e. "is this card in the purchased pack's stored, curated
--      pool" - a fixed set decided at design time, never
--      recomputed from live card_catalog data, and immune to a
--      near-empty/degenerate theme value ever being selected again
--      (the pool itself is what was curated - there is no longer a
--      raw string to be near-empty). Every other line - the league-
--      wide Legendary handling, per-player/league copy-limit logic,
--      the Boss-Route-exclusion clause (202609020930), the 4-tier
--      fallback ORDERING (exact rarity+theme -> exact rarity ->
--      themed any rarity -> any card) - is reproduced exactly. The
--      rarity odds themselves (roll_shop_pack_peak_rarity) are
--      completely untouched by this migration.
--
-- TIER-BY-TIER MAPPING (old theme filter -> new pool filter)
--   Tier 1 (exact rarity + theme)   -> exact rarity + in pool
--   Tier 2 (exact rarity, no theme) -> UNCHANGED (already theme-
--                                      agnostic - dropping the
--                                      pool constraint here too on
--                                      purpose, so a Special Pack
--                                      pull still degrades to "any
--                                      card of the right rarity"
--                                      before ever falling back to
--                                      the wrong rarity, same as
--                                      the live behavior today)
--   Tier 3 (themed, any rarity)     -> in pool, any rarity
--   Tier 4 (final: any card at all) -> UNCHANGED, still pool-
--                                      agnostic. JUDGMENT CALL: kept
--                                      as the live, unconditional
--                                      final fallback rather than
--                                      re-scoped to the pack's pool,
--                                      so a Special Pack purchase
--                                      can never hard-fail even in
--                                      the practically-impossible
--                                      case that a 200+ card pool is
--                                      fully exhausted by copy
--                                      limits - matching this
--                                      function's own existing
--                                      "never leave the player with
--                                      nothing" design intent for
--                                      every other pack type.
--
-- SAFETY
-- Purely CREATE OR REPLACE against two existing function
-- signatures - no schema change in this file, nothing deleted.
-- purchase_shop_pack, get_active_special_pack_rotation, and every
-- shop UI caller are completely untouched: they already only pass a
-- target_rotation_id through to pick_shop_pack_card and read
-- theme_category/price_dp/cards_per_pack/theme_label/theme_value
-- off shop_special_pack_rotations, none of which change shape here.
-- =========================================================


-- ---------------------------------------------------------
-- 1. refresh_shop_special_pack_rotation_if_needed - reissued to
--    carry pack_definition_id forward. Reproduced from the live
--    202609011300 version.
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
    1200,
    10,
    now(),
    now() + interval '48 hours',
    'active'
  );
end;
$function$;

revoke all on function public.refresh_shop_special_pack_rotation_if_needed(text) from public;
grant execute on function public.refresh_shop_special_pack_rotation_if_needed(text) to authenticated;


-- ---------------------------------------------------------
-- 2. pick_shop_pack_card - reissued. Reproduced from the live
--    202609020930 version, with the theme_type/theme_value ILIKE
--    match replaced by a shop_special_pack_pool_cards membership
--    check in tiers 1 and 3 (see header for the full mapping).
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
  -- curated pack pool (2026-09-02 rebuild) - no more theme_category
  -- / theme_value read here at all, since the pool membership check
  -- below is the entire filter now.
  -- =======================================================
  if target_rotation_id is not null then
    select rotation.pack_definition_id
    into v_pack_definition_id
    from public.shop_special_pack_rotations rotation
    where rotation.id = target_rotation_id;
  end if;

  -- =======================================================
  -- TRY EXACT RARITY + POOL
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and public.is_master_duel_offerable(card.master_duel_status)
    -- Boss-Route-exclusive content never appears in the Shop
    -- (Season 1 audit fix, matching the exclusion already
    -- enforced in Draft since 202609011700_draft_boss_route_
    -- exclusion.sql): a route's evolution monster or any
    -- support grant flagged is_route_exclusive = true is never
    -- a valid candidate here. Non-exclusive support grants stay
    -- purchasable normally.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = card.id
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
        and (
          case
            when card.game_rarity = 'Legendary' then instance.league_id = current_league_id
            else instance.current_owner_id = target_profile_id
          end
        )
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

  if chosen_card_id is not null then
    return chosen_card_id;
  end if;

  -- =======================================================
  -- FALLBACK:
  -- EXACT RARITY WITHOUT POOL (unchanged from the live version -
  -- already theme/pool-agnostic)
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and public.is_master_duel_offerable(card.master_duel_status)
    -- Boss-Route-exclusive content never appears in the Shop
    -- (Season 1 audit fix, matching the exclusion already
    -- enforced in Draft since 202609011700_draft_boss_route_
    -- exclusion.sql): a route's evolution monster or any
    -- support grant flagged is_route_exclusive = true is never
    -- a valid candidate here. Non-exclusive support grants stay
    -- purchasable normally.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = card.id
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
        and (
          case
            when card.game_rarity = 'Legendary' then instance.league_id = current_league_id
            else instance.current_owner_id = target_profile_id
          end
        )
    ) < public.shop_card_copy_limit(card.game_rarity)
  order by random()
  limit 1;

  if chosen_card_id is not null then
    return chosen_card_id;
  end if;

  -- =======================================================
  -- FALLBACK:
  -- ANY CARD IN THE PACK'S POOL, ANY RARITY
  -- =======================================================
  if v_pack_definition_id is not null then
    select
      card.id
    into chosen_card_id
    from public.card_catalog card
    where
      card.format_eligible = true
      and public.is_master_duel_offerable(card.master_duel_status)
    -- Boss-Route-exclusive content never appears in the Shop
    -- (Season 1 audit fix, matching the exclusion already
    -- enforced in Draft since 202609011700_draft_boss_route_
    -- exclusion.sql): a route's evolution monster or any
    -- support grant flagged is_route_exclusive = true is never
    -- a valid candidate here. Non-exclusive support grants stay
    -- purchasable normally.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = card.id
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
          and (
            case
              when card.game_rarity = 'Legendary' then instance.league_id = current_league_id
              else instance.current_owner_id = target_profile_id
            end
          )
      ) < public.shop_card_copy_limit(card.game_rarity)
      and exists (
        select 1
        from public.shop_special_pack_pool_cards spc
        where spc.pack_definition_id = v_pack_definition_id
          and spc.card_catalog_id = card.id
      )
    order by random()
    limit 1;
  end if;

  if chosen_card_id is not null then
    return chosen_card_id;
  end if;

  -- =======================================================
  -- FINAL FALLBACK:
  -- ANY CARD BELOW OWNERSHIP CAP (unchanged - deliberately NOT
  -- pool-scoped, see this migration's header)
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and public.is_master_duel_offerable(card.master_duel_status)
    -- Boss-Route-exclusive content never appears in the Shop
    -- (Season 1 audit fix, matching the exclusion already
    -- enforced in Draft since 202609011700_draft_boss_route_
    -- exclusion.sql): a route's evolution monster or any
    -- support grant flagged is_route_exclusive = true is never
    -- a valid candidate here. Non-exclusive support grants stay
    -- purchasable normally.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = card.id
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
        and (
          case
            when card.game_rarity = 'Legendary' then instance.league_id = current_league_id
            else instance.current_owner_id = target_profile_id
          end
        )
    ) < public.shop_card_copy_limit(card.game_rarity)
  order by random()
  limit 1;

  if chosen_card_id is null then
    raise exception 'No eligible cards remain for this player.';
  end if;

  return chosen_card_id;
end;
$function$;

revoke all on function public.pick_shop_pack_card(uuid, text, uuid) from public;
grant execute on function public.pick_shop_pack_card(uuid, text, uuid) to authenticated;

commit;
