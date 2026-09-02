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
--   2. pick_shop_pack_card(uuid, text, uuid) - reissued with two
--      fixes (see the detailed comment directly above that
--      function's definition below for the full rationale):
--
--      a) Boss-Route exclusion scoped to Stage 4 (final Boss)
--         evolution monsters only, plus is_route_exclusive support
--         grants - matching 202609020930/202609020970. A Stage 1-3
--         evolution monster is an ordinary card and stays
--         purchasable.
--
--      b) The old theme-string filter
--           `coalesce(card.archetype/attribute/monster_type, '')
--            ilike '%' || theme_value || '%'`
--         evaluated LIVE against card_catalog is replaced with a
--         fixed, curated-pool membership check
--           `exists (select 1 from shop_special_pack_pool_cards spc
--                    where spc.pack_definition_id = v_pack_definition_id
--                      and spc.card_catalog_id = card.id)`
--         AND the function's old 4-tier fallback structure (exact
--         rarity+theme -> exact rarity -> themed any rarity -> any
--         card at all) is collapsed to exactly 2 tiers, with pool
--         membership checked, unconditionally, in BOTH tiers. Only
--         rarity ever relaxes between tiers; pool membership never
--         does, so a Special Pack pull can no longer fall through
--         to a pool-agnostic fallback the way the previous 4-tier
--         design's own final tier allowed. For a Normal/Premium/
--         Deluxe pack (v_pack_definition_id is null) the pool check
--         is always true, so behavior there is unchanged from
--         before curated pools existed.
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
-- 2. pick_shop_pack_card - reissued.
--
-- CORRECTED 2026-09-02 (two fixes, both from the same review):
--
--  a) Boss-Route exclusion is now scoped to Stage 4 (final Boss)
--     evolution monsters only, plus explicitly is_route_exclusive
--     support grants - matching the authoritative rule and the
--     equivalent fix in 202609020930/202609020970. A Stage 1-3
--     evolution monster is an ordinary card and stays purchasable.
--
--  b) STRICTER POOL ENFORCEMENT: the previous version of this
--     function (committed, never deployed) let a Special Pack pull
--     fall through a "themed, any rarity" tier and then all the way
--     to a pool-AGNOSTIC final fallback tier if the pool ran dry -
--     meaning a tight enough pool/copy-limit combination could, in
--     theory, hand out a card from OUTSIDE the purchased pack's
--     curated pool. That is now structurally impossible: this
--     version collapses the old 4-tier design down to exactly 2
--     tiers, and the pool-membership check
--       `v_pack_definition_id is null or exists (select 1 from
--        shop_special_pack_pool_cards where pack_definition_id =
--        v_pack_definition_id and card_catalog_id = card.id)`
--     is present in BOTH tiers, unconditionally - rarity is the
--     only thing that ever relaxes between tier 1 and tier 2, pool
--     membership never does. For a Normal/Premium/Deluxe pack
--     (v_pack_definition_id is null) this check is always true, so
--     behavior there is unchanged from before curated pools
--     existed. If a Special Pack's entire pool is exhausted by
--     copy limits, the function raises the same "No eligible cards
--     remain for this player" exception it always has for any pack
--     type in that (practically impossible for a 200+ card pool)
--     situation, rather than ever stepping outside the pool.
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
        and (
          case
            when card.game_rarity = 'Legendary' then instance.league_id = current_league_id
            else instance.current_owner_id = target_profile_id
          end
        )
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

  if chosen_card_id is null then
    raise exception 'No eligible cards remain for this player.';
  end if;

  return chosen_card_id;
end;
$function$;

revoke all on function public.pick_shop_pack_card(uuid, text, uuid) from public;
grant execute on function public.pick_shop_pack_card(uuid, text, uuid) to authenticated;

commit;
