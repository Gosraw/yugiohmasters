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
-- the live database, outside the deploy pipeline).
--
-- CONFIRMED LIVE (2026-09-02): duelist_circle_formats.season_1 IS
-- active (release_cutoff 2020-12-31); duelist_circle_classic_v1 is
-- still inactive (release_cutoff 2014-12-31). card_catalog currently
-- reports 8,954 of 13,931 rows as format_eligible = true - far above
-- the 6,181-card intended Classic pool, and not season_1-shaped
-- either. Separate diagnostics (supabase/manual_deploy/20260902_
-- release_stage_and_eligibility_diagnosis.sql) trace this to
-- card_catalog.release_stage never having been populated, combined
-- with the current 8,954 figure matching the ORIGINAL, much broader
-- eligibility rule from 202608190005 (every card except Synchro/
-- Pendulum/Link/Skill Cards/Tokens - no era cutoff at all) rather
-- than any output of recompute_format_eligibility().
--
-- This script answers the "what is currently eligible, and is it
-- internally consistent" question directly and safely: it makes no
-- writes, so it is safe to run against live at any time, as many
-- times as needed.
--
-- 2026-09-02 CORRECTIONS TO THIS SCRIPT (read-only, no data changed):
--   - Section 4 had an operator-precedence bug: the WHERE clause
--     parsed as "(format_eligible = true AND card_type ilike
--     '%fusion%') OR card_type ilike '%xyz%' OR ... ", which leaked
--     every Xyz/Synchro/Pendulum/Link card in the WHOLE catalog into
--     the report regardless of format_eligible. Fixed by
--     parenthesizing the mechanic-type conditions so format_eligible
--     ANDs across all of them.
--   - Section 5's two "leak" checks only measured overlap between
--     the static format_eligible flag and the Stage 4 / route-
--     exclusive tables. That overlap is expected and is NOT itself
--     evidence of leakage, because pick_shop_pack_card() and
--     create_next_draft_offer() apply the Stage 4 / route-exclusive
--     exclusion as a SEPARATE filter on top of format_eligible - a
--     card can be format_eligible = true and still never be offered
--     through Draft or Shop. Section 5 is now split into 5A
--     (relabeled as a flag-overlap check, informational only) and
--     5B (a new, real leak check against actual card_instances rows
--     filtered to original_acquisition_type in ('draft','shop') -
--     i.e. whether the runtime exclusion has actually held).
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
-- inert for real players. Live production currently shows 8,954 -
-- see the header note above and the dedicated release_stage
-- diagnostic script for why.

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
--
-- FIXED 2026-09-02: the mechanic-type conditions are now
-- parenthesized as a single group, so format_eligible = true ANDs
-- across ALL of them. The original version parsed as
-- "(format_eligible = true AND fusion) OR xyz OR synchro OR
-- pendulum OR link", which leaked every Xyz/Synchro/Pendulum/Link
-- card in the entire catalog into this report, regardless of
-- format_eligible.
-- ---------------------------------------------------------
select
  card_type,
  count(*) as card_count
from public.card_catalog
where format_eligible = true
  and (
    card_type ilike '%fusion%'
    or card_type ilike '%xyz%'
    or card_type ilike '%synchro%'
    or card_type ilike '%pendulum%'
    or card_type ilike '%link%'
  )
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
-- 5A. FORMAT_ELIGIBLE / BOSS-ROUTE FLAG OVERLAP (INFORMATIONAL
--     ONLY - NOT ITSELF A LEAK)
--
-- RELABELED 2026-09-02. This only checks whether a card's static
-- format_eligible flag happens to be true for a card that is also a
-- Stage 4 boss evolution or a route-exclusive grant. That overlap,
-- by itself, is NOT evidence of leakage: pick_shop_pack_card() and
-- create_next_draft_offer() apply the Stage 4 / route-exclusive
-- exclusion as a SEPARATE filter on top of format_eligible, so a
-- card can correctly show format_eligible = true here and still
-- never actually be offered through Draft or Shop. A nonzero count
-- below is expected and does not by itself indicate a bug - see
-- Section 5B for the real, evidence-based leak check.
-- ---------------------------------------------------------
select
  count(*) as format_eligible_and_stage4_flag_overlap
from public.card_catalog c
where c.format_eligible = true
  and exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = c.id
      and brs.stage_number = 4
  );

select
  count(*) as format_eligible_and_route_exclusive_flag_overlap
from public.card_catalog c
where c.format_eligible = true
  and exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = c.id
      and brg.is_route_exclusive = true
  );

-- A nonzero count above is expected and NOT a bug on its own - it
-- only means some boss/route cards are also flagged as generally
-- format-eligible. Only Section 5B below, which looks at actual
-- card_instances acquired via draft or shop, can show a real leak.

-- ---------------------------------------------------------
-- 5B. REAL LEAK CHECK: HAS ANY PLAYER ACTUALLY ACQUIRED A STAGE 4
--     OR ROUTE-EXCLUSIVE CARD THROUGH DRAFT OR SHOP?
--
-- NEW 2026-09-02. This checks actual card_instances rows - i.e.
-- whether pick_shop_pack_card() / create_next_draft_offer()'s
-- exclusion has actually held in practice - rather than the static
-- format_eligible flag checked in 5A. Both counts should be 0. A
-- nonzero count here IS a real, independent bug: it means a Stage 4
-- boss card or a route-exclusive card was actually handed out
-- through Draft or Shop despite the exclusion those functions are
-- supposed to enforce, regardless of format-engine activation state
-- and regardless of what Section 5A shows.
-- ---------------------------------------------------------
select
  count(*) as stage4_cards_actually_acquired_via_draft_or_shop
from public.card_instances ci
where ci.original_acquisition_type in ('draft', 'shop')
  and exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = ci.card_catalog_id
      and brs.stage_number = 4
  );

select
  count(*) as route_exclusive_cards_actually_acquired_via_draft_or_shop
from public.card_instances ci
where ci.original_acquisition_type in ('draft', 'shop')
  and exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = ci.card_catalog_id
      and brg.is_route_exclusive = true
  );

-- Both should be 0. A nonzero count here means real players hold
-- real card_instances of boss-exclusive cards acquired through the
-- wrong channel - independent of format-engine activation state,
-- and independent of whatever Section 5A shows.
