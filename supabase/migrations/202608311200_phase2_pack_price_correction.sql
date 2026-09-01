begin;

-- =========================================================
-- PHASE 2 - ECONOMY CENTRALIZATION (2/3): PACK PRICE CORRECTION
--
-- Approved baseline (Phase 2 directive, Section 2): Standard=300,
-- Premium=900, Special=1200, Deluxe=1500.
--
-- shop_pack_types is already the pre-existing, live-read
-- authoritative config for Standard/Premium/Deluxe - the shop page
-- and purchase_shop_pack() both already read price_dp straight from
-- it (confirmed: no hardcoded price literal exists anywhere in
-- src/app/(app)/shop/page.tsx or purchase_shop_pack - every price
-- shown or charged is `pack.price_dp` / `slot.price_dp` read live
-- from the DB). So centralizing Standard/Premium/Deluxe means
-- correcting the THREE STORED VALUES in that table, not building a
-- new config layer - a new table would just be a second, competing
-- "source of truth" for the same three numbers, which is exactly
-- what Phase 2 Section 5 says not to do ("do not create unnecessary
-- complexity").
--
-- Old -> new: normal ("Standard Pack" in the UI - see VOUCHER_LABEL
-- in src/lib/match-settlement-summary.ts) 100 -> 300, premium 250 ->
-- 900, deluxe 500 -> 1500.
--
-- Special Pack price was already corrected once before, from its
-- original 250 to 900, by 202608231030_special_pack_price_900.sql -
-- a real, deliberate, already-shipped decision with its own
-- migration history (not a placeholder). The Phase 2 baseline
-- raises it again, 900 -> 1200. Following that same migration's own
-- convention (an additive follow-up that reissues the affected
-- function body in full rather than editing the already-shipped
-- file), this section corrects both the currently-stored rows and
-- the generation default for all future rotations.
--
-- SAFE TO RE-RUN: every UPDATE below is a plain idempotent price
-- correction (WHERE price_dp <> the new value - already a no-op
-- once applied), and the function re-issue is a plain CREATE OR
-- REPLACE FUNCTION.
-- =========================================================


-- ---------------------------------------------------------
-- 1. shop_pack_types: Standard(normal)/Premium/Deluxe.
-- ---------------------------------------------------------

update public.shop_pack_types
set price_dp = 300, updated_at = now()
where code = 'normal' and price_dp <> 300;

update public.shop_pack_types
set price_dp = 900, updated_at = now()
where code = 'premium' and price_dp <> 900;

update public.shop_pack_types
set price_dp = 1500, updated_at = now()
where code = 'deluxe' and price_dp <> 1500;


-- ---------------------------------------------------------
-- 2. shop_special_pack_rotations: correct any currently active
--    rotation's stored price (a rotation generated under the old
--    900 default, still active, must not keep charging 900 for the
--    rest of its 48h window).
-- ---------------------------------------------------------

update public.shop_special_pack_rotations
set price_dp = 1200, updated_at = now()
where price_dp <> 1200
  and status = 'active'
  and ends_at > now();


-- ---------------------------------------------------------
-- 3. Re-issue refresh_shop_special_pack_rotation_if_needed with the
--    corrected default generation price (1200, was 900). Function
--    body is byte-for-byte identical to
--    202608231030_special_pack_price_900.sql's version except for
--    that single literal - theme selection, Master Duel filtering,
--    cards_per_pack, and the 48h duration are all untouched.
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
    1200,
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

commit;
