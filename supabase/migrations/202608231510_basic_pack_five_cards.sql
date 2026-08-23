-- =========================================================
-- BASIC/NORMAL PACK: 4 -> 5 CARDS
--
-- Explicit product decision (Season 1 prep): the Basic/Normal
-- shop pack goes from 4 cards to 5. This is the SAME pattern
-- 202608230021_shop_v2_refresh_and_specials.sql already used for
-- the prior 3 -> 4 bump (lines 118-126 of that file) - an
-- idempotent, guarded UPDATE, not a schema change.
--
-- Verified current pack_type row counts (202608230021 /
-- 20260820_shop_system.sql) against the target counts requested:
--   Basic/Normal            4 -> 5 (this migration)
--   Premium                 already 5 - untouched
--   Deluxe                  already 7 - untouched
--   Special (Attribute)     already 5 - untouched
--   Special (Archetype)     already 5 - untouched
-- Only the normal/basic pack needed a change.
--
-- SAFETY: does NOT touch roll_shop_pack_rarity() or any per-rarity
-- odds - purchase_shop_pack() already loops `for position_number in
-- 1..pack_card_count loop`, reading pack_card_count from
-- shop_pack_types.cards_per_pack at call time, so raising this
-- value alone gives 5 independently-rolled slots through the
-- EXISTING odds table, not a new/different table. Pity logic keys
-- off `position_number = pack_card_count` (the LAST slot) and
-- `pity_count`, neither of which changes meaning when
-- cards_per_pack changes - the guaranteed-minimum slot simply
-- becomes the 5th card instead of the 4th, still exactly one
-- guaranteed slot per pack, same as before this migration.
-- =========================================================

update public.shop_pack_types
set
  cards_per_pack = 5,
  updated_at = now()
where code = 'normal'
  and cards_per_pack = 4;
