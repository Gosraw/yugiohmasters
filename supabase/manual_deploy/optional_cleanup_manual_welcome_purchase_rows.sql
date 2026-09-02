-- =========================================================
-- OPTIONAL, READ-ONLY-FIRST CLEANUP: stray manual welcome-bonus
-- shop_purchases history rows (Season 1 audit, Priority 3)
--
-- WHY
-- Before claim_welcome_packs() existed (202609020920), bossg/samo/
-- fardin's welcome bonus was granted by hand. That manual process
-- appears to have also written directly into public.shop_purchases
-- to make a "Pack" line show up in the Shop's Recent Purchases
-- history (purchase_type = 'pack', dp_spent = 0, voucher_type_used
-- is not null, used_voucher_id is null) - a shape that never occurs
-- through purchase_shop_pack() itself, which always sets
-- used_voucher_id to the real voucher row it consumed whenever
-- voucher_type_used is set.
--
-- IMPACT ASSESSED (this round): NONE FUNCTIONALLY. The Shop page's
-- "Recent Purchases" list (src/app/(app)/shop/page.tsx) only reads
-- purchase_type and dp_spent off each row directly - it does not
-- join to shop_pack_openings or link anywhere, so a shop_purchases
-- row with no matching opening behind it renders exactly like a
-- real one ("Pack" / "Voucher") with no crash, no broken link, no
-- 404. The only issue is that the row is cosmetically inaccurate:
-- it implies a real pack was opened through the Shop when actually
-- the cards were granted by whatever manual process ran instead.
--
-- This script does NOT delete anything by itself. Section 1 is a
-- read-only diagnostic to see exactly which rows this describes,
-- for how many players, and whether each one has a real
-- shop_pack_openings row behind it (if it does, it isn't one of
-- these synthetic rows and this script leaves it alone). Section 2
-- is a commented-out, narrowly-scoped DELETE - uncomment and run it
-- yourself ONLY if you've reviewed section 1's output and want
-- these specific cosmetic rows removed. It is filtered tightly
-- enough (purchase_type/dp_spent/voucher_type_used/used_voucher_id
-- AND "no matching shop_pack_openings row exists") that it cannot
-- touch a real purchase or pack-opening, but it is still presented
-- as opt-in rather than run automatically, per "do not touch live
-- user progress/data" - this only ever touches a history log row,
-- never a card, voucher, or DP balance.
-- =========================================================

-- ---------------------------------------------------------
-- 1. DIAGNOSTIC (read-only) - run this first
-- ---------------------------------------------------------

select
  sp.id as purchase_id,
  sp.profile_id,
  p.username,
  sp.purchase_type,
  sp.dp_spent,
  sp.voucher_type_used,
  sp.used_voucher_id,
  sp.created_at,
  exists (
    select 1
    from public.shop_pack_openings spo
    where spo.purchase_id = sp.id
  ) as has_real_opening
from public.shop_purchases sp
join public.profiles p on p.id = sp.profile_id
where sp.purchase_type = 'pack'
  and sp.dp_spent = 0
  and sp.voucher_type_used is not null
  and sp.used_voucher_id is null
order by sp.created_at asc;

-- ---------------------------------------------------------
-- 2. OPTIONAL CLEANUP (commented out - opt-in only)
--
-- Only deletes a row matching the exact diagnostic shape above AND
-- confirmed to have no real shop_pack_openings behind it, so a
-- genuine purchase can never be caught by this even if some other,
-- unrelated flow happens to leave used_voucher_id null one day.
-- ---------------------------------------------------------

-- delete from public.shop_purchases sp
-- where sp.purchase_type = 'pack'
--   and sp.dp_spent = 0
--   and sp.voucher_type_used is not null
--   and sp.used_voucher_id is null
--   and not exists (
--     select 1
--     from public.shop_pack_openings spo
--     where spo.purchase_id = sp.id
--   );
