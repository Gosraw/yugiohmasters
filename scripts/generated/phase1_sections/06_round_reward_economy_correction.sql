-- =========================================================
-- PHASE 1 DEPLOYMENT - SECTION 06 of 08
-- Corrects install_default_round_rewards_v2()'s placeholder numbers
-- (0/850) to the human-approved participation value (250 DP + 1
-- Premium Pack) and the closest-fitting round_winner value (150 DP +
-- 1 Standard/normal_pack). Depends on section 05. Idempotent: the
-- UPDATE only touches rows matching the exact old placeholder values,
-- so re-running after it has already applied is a no-op.
-- SOURCE (unmodified): supabase/migrations/202608310000_round_reward_economy_correction.sql
-- =========================================================

begin;

-- =========================================================
-- ROUND REWARD ECONOMY CORRECTION (human-approved baseline)
--
-- WHY
-- 202608301500_round_reward_settlement_and_auto_finalize.sql
-- shipped install_default_round_rewards_v2() with placeholder
-- values (participation = 0 DP + 1 premium_pack, round_winner =
-- 850 DP + 1 normal_pack) because no round-reward economy decision
-- existed yet at the time - see that migration's own header and the
-- prior session's final report, both of which explicitly flagged
-- these as needing human confirmation before going live.
--
-- The human has since approved a baseline for the "every player who
-- played a match in the round" (participation) tier: 250 DP + 1
-- Premium Pack. That maps cleanly onto the existing two-role
-- schema (role in ('participation','round_winner')) and is applied
-- here.
--
-- The human's supplied baseline also described a 3-tier per-round
-- placement shape (1st/2nd/3rd) for what it called "round" rewards.
-- That does NOT fit the currently-implemented round_reward schema
-- or settlement logic (a round-robin round can have multiple
-- simultaneous match winners - see settle_round_rewards_v2's own
-- comments - so there is no single per-round 1st/2nd/3rd ranking to
-- grant against, only "played in the round" and "won your match in
-- the round"). Building real 2nd/3rd-place round tiers would need a
-- genuine schema/settlement change (e.g. a per-round ranking
-- concept), which is out of scope for a database-readiness pass -
-- see the rollout report's economy-conflicts section for the exact
-- flag. This migration applies only the one number that maps
-- 1:1 onto the existing round_winner role (the "1st place" figure,
-- 150 DP + 1 Standard/normal_pack) as the best-available single
-- value for "won your match in the round," and does not attempt to
-- invent 2nd/3rd-place round tiers that the schema cannot express.
--
-- This is purely additive/corrective, following this repo's own
-- established convention (see 202608231030_special_pack_price_900.sql)
-- of layering a correction on top of an already-shipped migration
-- file rather than editing it in place.
--
-- SAFETY
-- - CREATE OR REPLACE FUNCTION: byte-identical to the 202608301500
--   version except for the two corrected literal values, so every
--   future competition (install_default_round_rewards_v2 is only
--   ever called from create_competition_v2 at creation time) seeds
--   the corrected numbers.
-- - The UPDATE below is a no-op unless a competition already has
--   round-reward rules seeded with the OLD placeholder values
--   (participation=0/premium_pack, round_winner=850/normal_pack) -
--   defensive only, in case 202608301500 was already applied once
--   live before this correction existed. It will never touch a row
--   a human has since hand-edited to a different value (the WHERE
--   clause matches the exact old placeholder numbers, nothing else).
-- =========================================================

create or replace function public.install_default_round_rewards_v2(
  target_competition_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.competition_round_reward_rules (
    competition_id, role, duel_points, voucher_type, voucher_quantity
  ) values
    (target_competition_id, 'participation', 250, 'premium_pack', 1),
    (target_competition_id, 'round_winner', 150, 'normal_pack', 1)
  on conflict (competition_id, role) do nothing;
end;
$function$;

revoke all on function public.install_default_round_rewards_v2(uuid) from public;
grant execute on function public.install_default_round_rewards_v2(uuid) to authenticated;

-- Defensive correction for any competition that already has the old
-- placeholder rules seeded (no-op if none exist).
update public.competition_round_reward_rules
set
  duel_points = 250,
  voucher_type = 'premium_pack',
  voucher_quantity = 1
where
  role = 'participation'
  and duel_points = 0
  and voucher_type = 'premium_pack'
  and voucher_quantity = 1;

update public.competition_round_reward_rules
set
  duel_points = 150,
  voucher_type = 'normal_pack',
  voucher_quantity = 1
where
  role = 'round_winner'
  and duel_points = 850
  and voucher_type = 'normal_pack'
  and voucher_quantity = 1;

commit;
