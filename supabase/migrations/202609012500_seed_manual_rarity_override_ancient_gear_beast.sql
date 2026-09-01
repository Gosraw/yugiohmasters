begin;

-- =========================================================
-- MANUAL RARITY OVERRIDE - ANCIENT GEAR BEAST (16th override)
--
-- WHY
-- 202609012110_final_rarity_distribution_fix.sql's own header
-- documents this card as "the 16 manual overrides (the original 15
-- plus Ancient Gear Beast -> Ultra Rare)" and its generating
-- script's exclusion list correctly left this card's id untouched
-- by that migration's bulk UPDATE pass - but no migration ever
-- actually wrote the Ultra Rare value or set
-- rarity_manually_overridden = true for it. Its game_rarity was
-- last set by 202609012100_apply_final_season1_rarities.sql (the
-- superseded 2026-09-01.1 engine pass), which put it at Legendary
-- from a stale Aug 25 snapshot that predates the tribute-penalty
-- scoreCard fix - exactly the gap 202609012110's own commit message
-- (d78cb6a) describes fixing "the same way this project has always
-- handled this class of gap - added as a 16th manual override
-- rather than further gate surgery on one card." This migration is
-- that missing statement, applied the same way as the original 15
-- (202608301000 / 202608301100): UPDATE ... WHERE name = '<exact
-- name>', matching the round 2 override migration's own note that
-- Ancient Gear Beast's Ultra Rare value is the project's established,
-- human-approved (HUMAN_CALIBRATION_ROUND2) value for this card.
--
-- Without this fix the live card_catalog has 47 Legendary cards
-- (the intended 46 from LEGENDARY_NAMES.txt, plus this one sitting
-- at Legendary by accident) instead of the documented, sanity-
-- checked 46.
--
-- SAFETY
-- - UPDATE ... WHERE name = '<exact name>', same convention as the
--   two prior override migrations (no live database to look up a
--   real UUID from in this sandbox).
-- - Purely a data change on already-migrated columns - no schema
--   change, nothing to roll back structurally.
-- - Sets rarity_manually_overridden = true so no future automated
--   pass can silently move it again, matching every other override.
-- =========================================================

do $$
declare
  v_count integer;
begin
  -- Ancient Gear Beast = Ultra Rare (16th manual override)
  update public.card_catalog
  set game_rarity = 'Ultra Rare',
      rarity_manually_overridden = true,
      rarity_needs_review = false,
      rarity_confidence = 1.0,
      rarity_reason = 'HUMAN_CALIBRATION_ROUND2-approved value (Ultra Rare). The 2026-09-01.1 engine pass (202609012100) incorrectly promoted this card to Legendary from a stale Aug 25 snapshot predating the tribute-penalty scoreCard fix; 202609012110 excluded it from its bulk re-pass as a planned 16th manual override but the corresponding UPDATE was never committed until now.',
      rarity_reviewed_at = now()
  where name = 'Ancient Gear Beast';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise notice 'Manual rarity override: no card_catalog row found for "Ancient Gear Beast" - check the name.'; end if;
  if v_count > 1 then raise exception 'Manual rarity override: % rows matched "Ancient Gear Beast" - expected exactly 1.', v_count; end if;

  raise notice 'Manual rarity override (16th, Ancient Gear Beast -> Ultra Rare) complete.';
end $$;

commit;
