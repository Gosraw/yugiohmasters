-- =========================================================
-- DUELIST CIRCLE 2.0 - Boss grants may exceed copy #3 (2026-10-30)
--
-- Bug (found by the Boss wheel agent): _boss_route_grant_stage hands
-- out copy number max+1 and deliberately bypasses the league-wide
-- scarcity trigger (app.boss_route_grant = 'true'), so a guaranteed
-- Boss grant can never fail on draft/shop scarcity. But the table
-- still had the old CHECK (copy_number between 1 and 3) from
-- 202608190004. If 3 copies of an in-pool route card already exist
-- in the league (from packs, draft or singles), the spin / evolve /
-- slot unlock fails with a raw "card_instances_copy_number_valid"
-- error - the player can't reach their own Boss.
--
-- Fix: the CHECK only requires copy_number >= 1. The real scarcity
-- rule (Legendary 1, everything else 3 per league) keeps being
-- enforced for every other source by the card_copy_limit trigger,
-- which is unchanged; only the Boss grant path skips it, as designed.
-- The unique (league, card, copy_number) key is unchanged.
--
-- Idempotent. Backwards compatible with the live main app.
-- =========================================================

begin;

alter table public.card_instances
  drop constraint if exists card_instances_copy_number_valid;

alter table public.card_instances
  add constraint card_instances_copy_number_valid
  check (
    copy_number >= 1
  );

commit;
