-- =========================================================
-- SPECIAL PACK PRICE FIX: 900 DP (was 250 DP)
--
-- Product decision: the Special Attribute Pack and Special
-- Archetype Pack must cost the same as Premium (900 DP), not the
-- 250 DP shipped in 202608230021_shop_v2_refresh_and_specials.sql.
--
-- This is a small, additive follow-up migration rather than an
-- edit to that earlier migration file, per explicit instruction:
-- do not rewrite an already-shipped-as-a-deploy-unit migration as
-- the sole deploy strategy - layer the correction on top instead.
--
-- Scope, deliberately narrow:
--   1. Existing active/future shop_special_pack_rotations rows:
--      price_dp corrected to 900 (a rotation created under the old
--      250 default, still active or not yet ended, must not keep
--      charging 250 for the rest of its 48h window).
--   2. refresh_shop_special_pack_rotation_if_needed(): the
--      hardcoded rotation-generation price changed from 250 to 900
--      for every future rotation from now on. Function body is
--      byte-for-byte identical to the 202608230021 version except
--      for that single literal.
--
-- Explicitly UNCHANGED (not touched anywhere in this file):
--   - rarity odds / roll_shop_pack_rarity
--   - pity logic
--   - cards_per_pack (still 5 per special pack)
--   - theme selection logic (attribute/archetype pick, exclusion
--     of the immediately-previous theme, catalog eligibility)
--   - Master Duel filtering (is_master_duel_offerable)
--   - 48h rotation duration
--   - purchase_shop_pack() itself - it already reads price_dp live
--     from shop_special_pack_rotations at purchase time (see
--     get_active_special_pack_rotation() in 202608230021), so
--     fixing the data this migration touches is sufficient; no
--     purchase logic needs to change
--   - historical shop_purchases / shop_pack_openings rows - what a
--     player actually paid in the past is never rewritten
--   - the UI - shop/page.tsx already reads special.price_dp
--     straight from shop_special_pack_rotations, so it reflects
--     this fix automatically once applied, with no frontend change
--
-- Safe to re-run: step 1 is a plain idempotent price correction
-- (a no-op once price_dp is already 900), and step 2 is a plain
-- CREATE OR REPLACE FUNCTION.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Correct existing active/future rotations already in the
--    table, so nothing keeps charging 250 for the remainder of
--    its window.
-- ---------------------------------------------------------

update public.shop_special_pack_rotations
set
  price_dp = 900,
  updated_at = now()
where
  price_dp <> 900
  and status = 'active'
  and ends_at > now();


-- ---------------------------------------------------------
-- 2. Re-issue refresh_shop_special_pack_rotation_if_needed with
--    the corrected default generation price (900, was 250).
--    Everything else in this function is unchanged from
--    202608230021_shop_v2_refresh_and_specials.sql.
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
  min_theme_eligible_cards constant integer := 12;
  previous_theme_value text;
  chosen_theme_value text;
  chosen_theme_label text;
begin
  if target_theme_category not in ('attribute', 'archetype') then
    raise exception 'Invalid special pack theme category.';
  end if;

  perform pg_advisory_xact_lock(hashtext('shop_special_refresh_' || target_theme_category));

  if exists (
    select 1
    from public.shop_special_pack_rotations
    where
      theme_category = target_theme_category
      and status = 'active'
      and starts_at <= now()
      and ends_at > now()
  ) then
    return;
  end if;

  update public.shop_special_pack_rotations
  set
    status = 'completed',
    updated_at = now()
  where
    theme_category = target_theme_category
    and status = 'active'
    and ends_at <= now();

  select theme_value
  into previous_theme_value
  from public.shop_special_pack_rotations
  where theme_category = target_theme_category
  order by created_at desc
  limit 1;

  -- =======================================================
  -- PICK A VALID THEME FROM REAL CATALOG DATA (unchanged)
  --
  -- Try excluding the immediately-previous theme first (avoid
  -- back-to-back repeats where easy); if that leaves nothing
  -- eligible, retry without the exclusion rather than leaving
  -- the category without a rotation.
  -- =======================================================
  if target_theme_category = 'attribute' then
    select cc.attribute
    into chosen_theme_value
    from public.card_catalog cc
    where
      cc.format_eligible = true
      and public.is_master_duel_offerable(cc.master_duel_status)
      and cc.attribute is not null
      and cc.attribute <> ''
      and (previous_theme_value is null or cc.attribute <> previous_theme_value)
    group by cc.attribute
    having count(*) >= min_theme_eligible_cards
    order by random()
    limit 1;

    if chosen_theme_value is null then
      select cc.attribute
      into chosen_theme_value
      from public.card_catalog cc
      where
        cc.format_eligible = true
        and public.is_master_duel_offerable(cc.master_duel_status)
        and cc.attribute is not null
        and cc.attribute <> ''
      group by cc.attribute
      having count(*) >= min_theme_eligible_cards
      order by random()
      limit 1;
    end if;
  else
    select cc.archetype
    into chosen_theme_value
    from public.card_catalog cc
    where
      cc.format_eligible = true
      and public.is_master_duel_offerable(cc.master_duel_status)
      and cc.archetype is not null
      and cc.archetype <> ''
      and (previous_theme_value is null or cc.archetype <> previous_theme_value)
    group by cc.archetype
    having count(*) >= min_theme_eligible_cards
    order by random()
    limit 1;

    if chosen_theme_value is null then
      select cc.archetype
      into chosen_theme_value
      from public.card_catalog cc
      where
        cc.format_eligible = true
        and public.is_master_duel_offerable(cc.master_duel_status)
        and cc.archetype is not null
        and cc.archetype <> ''
      group by cc.archetype
      having count(*) >= min_theme_eligible_cards
      order by random()
      limit 1;
    end if;
  end if;

  -- No valid theme exists at all for this category (e.g. a
  -- sparse/test catalog) - skip generating a rotation for it
  -- rather than raising. The shop simply shows one fewer special
  -- pack until a future refresh finds a valid theme.
  if chosen_theme_value is null then
    return;
  end if;

  chosen_theme_label := chosen_theme_value;

  insert into public.shop_special_pack_rotations (
    theme_category,
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
    chosen_theme_value,
    chosen_theme_label,
    900,
    5,
    now(),
    now() + interval '48 hours',
    'active'
  );
end;
$function$;

revoke all
  on function public.refresh_shop_special_pack_rotation_if_needed(text)
  from public;

grant execute
  on function public.refresh_shop_special_pack_rotation_if_needed(text)
  to authenticated;
