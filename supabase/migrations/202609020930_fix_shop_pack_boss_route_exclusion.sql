begin;

-- =========================================================
-- FIX: Shop pack card selection did not exclude Boss-Route
-- content (Season 1 audit, Boss/Shop item)
--
-- WHY
-- Draft has excluded Boss-Route-exclusive content (a route's
-- evolution monster in any stage of any route, or any support card
-- flagged is_route_exclusive = true) since
-- 202609011700_draft_boss_route_exclusion.sql - go-live spec
-- section 11. No Shop pack-purchase function was ever given the
-- same exclusion: public.pick_shop_pack_card() (last redefined in
-- 202608311400_phase2_special_pack_rotation_and_legendary_odds.sql)
-- only filters on format_eligible, master_duel_offerable, rarity,
-- theme and per-player/league copy limits across all four of its
-- fallback tiers (exact rarity+theme, exact rarity, themed any
-- rarity, final any-card fallback) - meaning a Normal/Premium/
-- Deluxe/Special Pack pull could hand a player a route's Stage 4
-- Boss monster (or any other route-exclusive card) before they ever
-- reach that stage on that route, undermining the entire "Boss
-- cards are earned, not pulled" design.
--
-- WHAT THIS CHANGES
-- Reissues pick_shop_pack_card() with the identical
-- "not exists (... boss_route_stages ...) and not exists
-- (... boss_route_stage_grants where is_route_exclusive ...)"
-- clause already used by Draft, added to card.format_eligible in
-- all four candidate queries (byte-for-byte the same predicate
-- shape as 202609011700's, just aliased to this function's `card`
-- table instead of Draft's `c`). Every other line - theme
-- matching, copy-limit logic, league-wide Legendary handling,
-- fallback ordering - is untouched, reproduced exactly from the
-- live version.
--
-- Non-exclusive Boss Route support grants (most of each route's
-- 12-15 permanent cards) are NOT affected and remain normally
-- purchasable, matching Draft's existing behavior for the same
-- cards.
--
-- SAFETY
-- purchase_shop_pack() itself is untouched - it only calls this
-- function and already handles a null/exception result from it.
-- Fully reversible by re-running
-- 202608311400_phase2_special_pack_rotation_and_legendary_odds.sql's
-- own CREATE OR REPLACE for this function.
-- =========================================================

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
  current_league_id uuid;
begin
  -- =======================================================
  -- LEAGUE-WIDE LEGENDARY SCARCITY FIX (2026-08-31, Phase 2
  -- special-pack rebuild): this function's own candidate queries
  -- previously excluded a card only if THIS player individually
  -- already held it at copy_limit - for Legendary (limit=1
  -- league-wide, per shop_card_copy_limit()) this meant an
  -- already-league-owned Legendary (owned by a DIFFERENT player)
  -- was still offered as a "candidate" here, relying entirely on
  -- purchase_shop_pack()'s own outer retry loop to catch and
  -- reject it. For a narrow special-pack theme with only one
  -- matching Legendary, every one of that loop's up to 25 retries
  -- could keep re-selecting the SAME already-owned card (this
  -- function has no memory of previous attempts), causing a false
  -- 'Could not find an eligible card for this pack' failure even
  -- when other, unclaimed Legendaries existed under a broader
  -- filter. Every copy-limit check below now excludes an
  -- already-league-owned Legendary directly (matching the same
  -- Legendary-is-league-wide / everything-else-is-per-player
  -- branch already used in purchase_shop_pack's own 2026-08-30
  -- fix), so this function's existing theme -> no-theme -> any-
  -- rarity fallback chain does its job correctly on the first
  -- attempt instead of depending on the caller's retry loop.
  -- =======================================================
  select lm.league_id
  into current_league_id
  from public.league_members lm
  where lm.profile_id = target_profile_id
  limit 1;
  -- =======================================================
  -- SPECIAL THEME
  -- =======================================================
  if target_rotation_id is not null then
    select
      theme_category,
      shop_special_pack_rotations.theme_value
    into
      theme_type,
      theme_value
    from public.shop_special_pack_rotations
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
  -- THEMED CARD OF ANY RARITY
  -- =======================================================
  if theme_type is not null and theme_value is not null then
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

commit;
