begin;

-- =========================================================
-- Shop packs: fall back DOWN the rarity ladder (2026-10-15)
--
-- Owner decision A (QA fix round): when the guaranteed (or rolled)
-- Legendary slot of a pack finds no Legendary left in the league,
-- the slot used to fall back to a random card of ANY rarity - in
-- practice almost always a Normal or Rare. Now it walks down the
-- ladder and gives the best rarity that still has a free copy:
-- Secret Rare, then Ultra Rare, then Super Rare, then Rare, then
-- Normal. The same ladder applies to every rolled rarity (a Secret
-- Rare slot with no Secret Rare left gives an Ultra Rare, not a
-- random card).
--
-- Only when nothing at or below the rolled rarity is left does the
-- old last resort ("any eligible card under its copy limit") run,
-- unchanged.
--
-- Legendary luck is NOT touched: purchase_shop_pack (latest:
-- 202610121600) only resets luck when a Legendary was really
-- pulled, so a guaranteed slot that falls back to a Secret Rare
-- keeps the player's luck - exactly as before.
--
-- Signature unchanged (target_profile_id, target_rarity,
-- target_rotation_id default null); purchase_shop_pack and its
-- target_voucher_id default null parameter are not touched.
-- Body = 202610121600's definition with one new tier in between.
-- Backwards compatible with the live main app.
-- =========================================================

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
  target_rank integer;
begin
  select lm.league_id
  into current_league_id
  from public.league_members lm
  where lm.profile_id = target_profile_id
  limit 1;

  target_rank := public.shop_rarity_rank(target_rarity);

  -- =======================================================
  -- SPECIAL PACK: resolve the purchased rotation straight to its
  -- curated pack pool. Null for a Normal/Premium/Deluxe pack.
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
    and card.game_rarity = target_rarity
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
  order by random()
  limit 1;

  if chosen_card_id is not null then
    return chosen_card_id;
  end if;

  -- =======================================================
  -- TIER 2 (NEW, 202610152000): down the ladder. The best rarity
  -- BELOW the rolled one that still has a free copy; a random card
  -- within that rarity. Same eligibility, Boss Route, copy-limit and
  -- Special Pack pool rules as tier 1.
  -- =======================================================
  if target_rank > 1 then
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
      and public.shop_rarity_rank(card.game_rarity) between 1 and target_rank - 1
      and (
        select count(*)
        from public.card_instances instance
        where
          instance.card_catalog_id = card.id
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
    order by
      public.shop_rarity_rank(card.game_rarity) desc,
      random()
    limit 1;

    if chosen_card_id is not null then
      return chosen_card_id;
    end if;
  end if;

  -- =======================================================
  -- TIER 3 (final fallback, unchanged): rarity relaxed to "any".
  -- Only reached when nothing at or below the rolled rarity is
  -- left. Pool membership (for a Special Pack) is NOT relaxed.
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

commit;
