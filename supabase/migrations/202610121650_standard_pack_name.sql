-- =========================================================
-- One user-facing name: "Standard Pack" (2026-10-12)
--
-- The voucher UI already calls normal_pack vouchers "Standard Pack",
-- while the shop and the DP ledger ("Bought a Normal Pack", from
-- _log_shop_purchase_dp reading shop_pack_types.name) said "Normal
-- Pack". Only the display name changes; the pack code stays
-- 'normal' and the voucher type stays 'normal_pack'. Older ledger
-- rows keep their text (history). Backwards compatible.
-- =========================================================

update public.shop_pack_types
set name = 'Standard Pack'
where code = 'normal'
  and name = 'Normal Pack';
