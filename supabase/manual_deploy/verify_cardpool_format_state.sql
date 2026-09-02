-- =========================================================
-- READ-ONLY: CARDPOOL / FORMAT ELIGIBILITY STATE VERIFICATION
-- (Season 1 audit, Priority 5 - cardpool/format integrity)
--
-- WHY THIS SCRIPT EXISTS
-- Static analysis of the repo's migration history found that the
-- configurable Duelist Circle Classic format engine
-- (202608231500_duelist_circle_format_engine.sql:
-- duelist_circle_formats / format_card_overrides /
-- recompute_format_eligibility()) is real and fully built, and that
-- a "duelist_circle_classic_v1" format row exists with exactly the
-- parameters that should produce the expected 6,181-card eligible
-- Classic pool (2014-12-31 core cutoff, curated 2015-2018 whitelist,
-- Fusion+Xyz-only Extra Deck, per 202608300900). Two later
-- migrations (202609012100, superseded by 202609012110) already
-- calibrated card_catalog.game_rarity for exactly that 6,181-card
-- pool (6,165 auto-computed rows + 16 manually-overridden rows =
-- 6,181).
--
-- HOWEVER: no committed migration, and no step in the combined
-- release script (supabase/manual_deploy/20260902_season1_release.sql),
-- ever sets duelist_circle_formats.is_active = true or calls
-- recompute_format_eligibility(). Every migration that touches this
-- area explicitly documents activating the format as "a separate,
-- deliberate operator decision" (see docs/SEASON_1_RUNBOOK.md,
-- which frames it as a manual admin SQL command run directly against
-- the live database, outside the deploy pipeline). This sandbox has
-- no live database access, so it is NOT POSSIBLE to determine from
-- the repo alone whether this activation step has already been
-- performed live at some point, or whether Draft/Shop/Deckbuilder
-- are still running on the ORIGINAL, much broader eligibility rule
-- from 202608190005 (every card except Synchro/Pendulum/Link/Skill
-- Cards/Tokens - no era cutoff at all).
--
-- This script answers that question directly and safely: it makes
-- no writes, so it is safe to run against live at any time,
-- including before or after go-live, as many times as needed.
-- =========================================================

-- ---------------------------------------------------------
-- 1. IS THE FORMAT ENGINE EVEN ACTIVATED?
-- ---------------------------------------------------------
select
  code,
  name,
  is_active,
  release_cutoff,
  allow_fusion,
  allow_xyz,
  allow_synchro,
  allow_pendulum,
  allow_link
from public.duelist_circle_formats
order by is_active desc, code;

-- ---------------------------------------------------------
-- 2. TOTAL FORMAT-ELIGIBLE COUNT (what Draft/Shop/Deckbuilder
--    actually see right now, regardless of which mechanism set it)
-- ---------------------------------------------------------
select
  count(*) filter (where format_eligible = true) as total_eligible,
  count(*) filter (where format_eligible = false) as total_ineligible,
  count(*) as total_cards
from public.card_catalog;

-- Expected if the Classic format IS active and recomputed: 6,181
-- eligible. A number far above that (e.g. into the 13,000+ range)
-- means Draft/Shop are still running the old, broader,
-- no-era-cutoff rule from 202608190005, and every card of this
-- round's careful cardpool/rarity calibration work is currently
-- inert for real players.

-- ---------------------------------------------------------
-- 3. RARITY DISTRIBUTION ACROSS THE CURRENTLY-ELIGIBLE POOL
-- ---------------------------------------------------------
select
  game_rarity,
  count(*) as card_count
from public.card_catalog
where format_eligible = true
group by game_rarity
order by
  case game_rarity
    when 'Legendary' then 1
    when 'Secret Rare' then 2
    when 'Ultra Rare' then 3
    when 'Super Rare' then 4
    when 'Rare' then 5
    when 'Normal' then 6
    else 7
  end;

-- Expected (per this round's spec, sums to 6,181): Legendary 46,
-- Secret 199, Ultra 1112, Super 1412, Rare 1519, Normal 1893. If
-- section 2 shows the old broad pool is still active, this
-- distribution will not match - that alone is not new information,
-- it is a symptom of the same activation gap.

-- ---------------------------------------------------------
-- 4. EXTRA DECK MECHANIC COMPOSITION OF THE ELIGIBLE POOL
--    (Fusion + Xyz allowed; Synchro/Pendulum/Link/Illusion excluded)
-- ---------------------------------------------------------
select
  card_type,
  count(*) as card_count
from public.card_catalog
where format_eligible = true
  and card_type ilike '%fusion%'
   or card_type ilike '%xyz%'
   or card_type ilike '%synchro%'
   or card_type ilike '%pendulum%'
   or card_type ilike '%link%'
group by card_type
order by card_count desc;

-- Expect a healthy nonzero Fusion and Xyz count, and ZERO rows
-- whose card_type contains Synchro, Pendulum, or Link among
-- eligible cards (the original 202608190005 exclusion already
-- covers this regardless of era-cutoff activation, so this
-- particular check should already pass even before the Classic
-- format is activated - a failure here would be a separate,
-- more basic regression).

-- ---------------------------------------------------------
-- 5. STAGE 4 BOSS / ROUTE-EXCLUSIVE LEAK CHECK AGAINST THE
--    CURRENTLY-ELIGIBLE POOL (should always be zero, independent
--    of format activation - Draft/Shop apply this exclusion as an
--    ADDITIONAL filter on top of format_eligible, not a substitute
--    for it)
-- ---------------------------------------------------------
select
  count(*) as stage4_leak_count
from public.card_catalog c
where c.format_eligible = true
  and exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = c.id
      and brs.stage_number = 4
  );

select
  count(*) as route_exclusive_leak_count
from public.card_catalog c
where c.format_eligible = true
  and exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = c.id
      and brg.is_route_exclusive = true
  );

-- Both should be 0. A nonzero count here is a real, independent bug
-- regardless of format-engine activation state (this exclusion is
-- applied separately by pick_shop_pack_card / create_next_draft_offer
-- at pull/offer time - this query just checks the underlying flag
-- combination those functions rely on is never contradictory).
