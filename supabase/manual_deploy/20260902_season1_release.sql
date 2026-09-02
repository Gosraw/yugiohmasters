-- =========================================================
-- Duelist Circle - Season 1 - Combined Manual Deployment Script
-- Generated 2026-09-02. DO NOT run migration files individually
-- against production after this script has been run - this
-- script is the single source of truth for what gets applied.
--
-- This script concatenates, in exact dependency order, all 13
-- currently-pending local migrations (202609020910 through
-- 202609021030), each with its own individual `begin;` / `commit;`
-- stripped, because this script wraps EVERYTHING in ONE outer
-- transaction (see the single `begin;` below and the single
-- `commit;` at the very end of this file). This gives true
-- all-or-nothing atomicity: if any assertion anywhere in this
-- script fails, Postgres rolls back every change made by this
-- script, leaving the database exactly as it was before it ran.
--
-- This script does NOT rely on supabase_migrations.schema_migrations
-- bookkeeping (production does not have that table) and does NOT
-- assume a clean database - it assumes the Phase 1/2, Boss Route,
-- and Shop schema already exist in production (verified true as
-- of this reconciliation), and it is designed to be safe to run
-- exactly once, pasted directly into the Supabase SQL Editor.
--
-- Two of the 13 source migrations below were edited during this
-- live-safety reconciliation (2026-09-02) before being spliced
-- into this script - see their own section headers below for
-- details:
--   * 202609020910_fix_dark_magician_and_cubic_route_data.sql
--   * 202609021020_special_pack_15_definitions_and_pools.sql
-- =========================================================

begin;

-- =========================================================
-- PRE-FLIGHT ASSERTIONS
--
-- Runs before any mutation in this script. Every check either
-- confirms a required invariant or hard-fails the whole deploy
-- (this file is wrapped in ONE outer transaction - see the bottom
-- of this file - so a RAISE EXCEPTION here rolls back nothing,
-- since nothing has been written yet, and prevents every section
-- below from running at all).
--
-- Also snapshots pre-deploy state into temporary tables (dropped
-- automatically at the end of this session/transaction) so the
-- POST-DEPLOY ASSERTIONS section at the bottom of this file can
-- prove specific tables were genuinely left untouched, rather than
-- merely asserting today's expected values.
-- =========================================================

do $preflight_core_tables$
declare
  v_missing text[] := array[]::text[];
begin
  if to_regclass('public.boss_routes') is null then v_missing := v_missing || 'boss_routes'; end if;
  if to_regclass('public.boss_route_stages') is null then v_missing := v_missing || 'boss_route_stages'; end if;
  if to_regclass('public.boss_route_stage_grants') is null then v_missing := v_missing || 'boss_route_stage_grants'; end if;
  if to_regclass('public.card_catalog') is null then v_missing := v_missing || 'card_catalog'; end if;
  if to_regclass('public.profiles') is null then v_missing := v_missing || 'profiles'; end if;
  if to_regclass('public.league_members') is null then v_missing := v_missing || 'league_members'; end if;
  if to_regclass('public.player_boss_paths') is null then v_missing := v_missing || 'player_boss_paths'; end if;
  if to_regclass('public.card_instances') is null then v_missing := v_missing || 'card_instances'; end if;
  if to_regclass('public.reward_vouchers') is null then v_missing := v_missing || 'reward_vouchers'; end if;
  if to_regclass('public.drafts') is null then v_missing := v_missing || 'drafts'; end if;
  if to_regclass('public.draft_players') is null then v_missing := v_missing || 'draft_players'; end if;
  if to_regclass('public.shop_special_pack_slots') is null then v_missing := v_missing || 'shop_special_pack_slots'; end if;
  if to_regclass('public.shop_special_pack_rotations') is null then v_missing := v_missing || 'shop_special_pack_rotations'; end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'PRE-FLIGHT ABORTED: required table(s) missing: %. This script assumes the Phase 1/2/Boss-Route/Shop schema is already live - it only adds Season 1''s remaining Boss Route corrections and the new Special Pack tables on top of it.', array_to_string(v_missing, ', ');
  end if;

  raise notice 'PRE-FLIGHT: all core required tables present.';
end $preflight_core_tables$;

do $preflight_routes$
declare
  v_route_count int;
  v_dark_magician_exists boolean;
begin
  select count(*) into v_route_count from public.boss_routes;
  if v_route_count <> 20 then
    raise exception 'PRE-FLIGHT ABORTED: expected 20 boss_routes rows, found %.', v_route_count;
  end if;

  select exists(select 1 from public.boss_routes where code = 'dark_magician') into v_dark_magician_exists;
  if not v_dark_magician_exists then
    raise exception 'PRE-FLIGHT ABORTED: boss_routes row for code = ''dark_magician'' not found.';
  end if;

  raise notice 'PRE-FLIGHT: 20 boss_routes confirmed, dark_magician route confirmed present.';
end $preflight_routes$;

do $preflight_profiles$
declare
  v_found_count int;
  v_missing text[] := array[]::text[];
begin
  select count(*) into v_found_count from public.profiles where lower(username) in ('bossg', 'samo', 'fardin');
  if v_found_count <> 3 then
    select array_agg(u) into v_missing
    from unnest(array['bossg','samo','fardin']) u
    where not exists (select 1 from public.profiles where lower(username) = u);
    raise exception 'PRE-FLIGHT ABORTED: expected profiles for bossg/samo/fardin (3), found %. Missing: %.', v_found_count, coalesce(array_to_string(v_missing, ', '), '(unable to determine - check for duplicate/ambiguous usernames)');
  end if;

  raise notice 'PRE-FLIGHT: bossg/samo/fardin profiles confirmed present.';
end $preflight_profiles$;

do $preflight_no_unexpected_overlaps$
declare
  v_row record;
  v_unexpected_count int := 0;
  -- The only two evolution/support-grant overlaps this deploy is
  -- designed to fix. Any OTHER overlap found here is unexpected -
  -- possibly a manual production change this reconciliation was not
  -- told about - and must stop the deploy rather than be silently
  -- absorbed by 202609020980/202609021030's narrowly-scoped DELETEs
  -- (which only ever target these two exact rows and would leave a
  -- genuinely unexpected third overlap in place, unfixed and
  -- unreported).
begin
  for v_row in
    select r.code as route_code, c.name as card_name, brs.stage_number as evolution_stage, gs.stage_number as grant_stage
    from public.boss_route_stages brs
    join public.boss_routes r on r.id = brs.route_id
    join public.card_catalog c on c.id = brs.evolution_card_catalog_id
    join public.boss_route_stage_grants g on g.card_catalog_id = brs.evolution_card_catalog_id
    join public.boss_route_stages gs on gs.id = g.stage_id and gs.route_id = brs.route_id
  loop
    if not (
      (v_row.route_code = 'chaos_bls' and v_row.card_name = 'D.D. Warrior Lady')
      or (v_row.route_code = 'machina' and v_row.card_name = 'Machina Gearframe')
    ) then
      v_unexpected_count := v_unexpected_count + 1;
      raise warning 'PRE-FLIGHT: UNEXPECTED evolution/support-grant overlap not covered by this deploy: route=% card="%" (evolution stage %, grant stage %).',
        v_row.route_code, v_row.card_name, v_row.evolution_stage, v_row.grant_stage;
    end if;
  end loop;

  if v_unexpected_count > 0 then
    raise exception 'PRE-FLIGHT ABORTED: % unexpected evolution/support-grant overlap(s) found beyond the two this deploy fixes (chaos_bls/D.D. Warrior Lady, machina/Machina Gearframe). See WARNING lines above. This likely means a manual production change exists that this reconciliation was not told about - stop and investigate before deploying.', v_unexpected_count;
  end if;

  raise notice 'PRE-FLIGHT: no unexpected evolution/support-grant overlaps found (only the two known, expected ones - or none - are present).';
end $preflight_no_unexpected_overlaps$;

-- ---------------------------------------------------------
-- Snapshot pre-deploy state for the POST-DEPLOY "unchanged" checks.
-- Temporary table: visible only to this session, dropped
-- automatically at commit (ON COMMIT DROP) - never persists.
-- ---------------------------------------------------------

create temporary table pre_deploy_snapshot on commit drop as
select
  (select count(*) from public.league_members) as league_members_count,
  (select count(*) from public.player_boss_paths) as player_boss_paths_count,
  (select count(*) from public.drafts where status = 'completed') as drafts_completed_count,
  (select count(*) from public.draft_players) as draft_players_count,
  (
    select count(*)
    from public.reward_vouchers rv
    join public.profiles p on p.id = rv.profile_id
    where lower(p.username) in ('bossg', 'samo', 'fardin')
      and rv.source_type = 'season1_welcome_bonus'
  ) as welcome_voucher_rows_for_the_3,
  (
    select count(*)
    from public.card_instances ci
    join public.profiles p on p.id = ci.current_owner_id
    join public.card_catalog c on c.id = ci.card_catalog_id
    where lower(p.username) = 'bossg'
      and c.name in ('Berry Magician Girl', 'Lemon Magician Girl', 'Chocolate Magician Girl')
  ) as bossg_dm_starter_card_count,
  (select count(*) from public.card_instances) as total_card_instances_count,
  -- Season 1 audit round-2 (2026-09-02) hardening: the counts above
  -- only catch a row being ADDED or REMOVED - they cannot catch
  -- bossg/samo/fardin's real progress VALUES changing while the row
  -- counts stay the same (e.g. bossg's current_stage silently
  -- regressing from 3 to 1 while samo's advances from 1 to 3 - net
  -- zero change to player_boss_paths_count above, but a real data
  -- corruption). These two deterministic signature strings capture
  -- the exact (username, route_slot, route_id, current_stage,
  -- mastered_at) state and the exact (username, status,
  -- main_picks_completed, fusion_picks_completed,
  -- xyz_picks_completed) draft state for exactly the three players
  -- this deploy must never disturb, sorted so the string comparison
  -- is order-independent.
  (
    select string_agg(
      format('%s:%s:%s:%s:%s', p.username, pbp.route_slot, pbp.route_id, pbp.current_stage, coalesce(pbp.mastered_at::text, 'null')),
      '|' order by p.username, pbp.route_slot
    )
    from public.player_boss_paths pbp
    join public.profiles p on p.id = pbp.profile_id
    where lower(p.username) in ('bossg', 'samo', 'fardin')
  ) as boss_progress_signature_for_the_3,
  (
    select string_agg(
      format('%s:%s:%s:%s:%s', p.username, dp.status, dp.main_picks_completed, dp.fusion_picks_completed, dp.xyz_picks_completed),
      '|' order by p.username, dp.id
    )
    from public.draft_players dp
    join public.profiles p on p.id = dp.profile_id
    where lower(p.username) in ('bossg', 'samo', 'fardin')
  ) as draft_progress_signature_for_the_3;

do $preflight_snapshot_notice$
declare
  v_snap record;
begin
  select * into v_snap from pre_deploy_snapshot;
  raise notice 'PRE-FLIGHT SNAPSHOT: league_members=%, player_boss_paths=%, drafts_completed=%, draft_players=%, welcome_voucher_rows(bossg/samo/fardin)=%, bossg_dm_starter_cards=%, total_card_instances=%',
    v_snap.league_members_count, v_snap.player_boss_paths_count, v_snap.drafts_completed_count,
    v_snap.draft_players_count, v_snap.welcome_voucher_rows_for_the_3, v_snap.bossg_dm_starter_card_count,
    v_snap.total_card_instances_count;
end $preflight_snapshot_notice$;

-- =========================================================
-- Season 1 audit round-3 (2026-09-02) hardening: BOSS ROUTE
-- REWARD-CARD PRESERVATION SNAPSHOT (ALL existing Boss Route
-- participants, not just bossg/samo/fardin).
--
-- WHY
-- This deploy corrects boss_route_stages / boss_route_stage_grants
-- CONFIGURATION data (stage identities, duplicate support-grant
-- removals) for several routes. _boss_route_grant_stage()
-- (202609012000_boss_route_rpcs.sql) only ever grants a stage's
-- cards ONCE per (player_boss_path_id, stage_number) - gated by the
-- player_boss_stage_unlocks unique constraint, checked BEFORE any
-- card_instances insert - and is only ever invoked from
-- choose_boss_path(), unlock_second_third_boss_path(), or
-- evolve_boss_stage(), all three player-initiated, idempotent, and
-- gated on forward-only state transitions (current_stage can only
-- advance by exactly 1 per call, and a repeat call for an
-- already-reached stage is a verified no-op). Nothing in this
-- database ever re-reads boss_route_stages/boss_route_stage_grants
-- for an already-unlocked stage, and no trigger exists on either
-- table (confirmed by exhaustive repo-wide audit, 2026-09-02) - so
-- changing that configuration data cannot, by itself, grant, remove,
-- or alter any existing player's card_instances. This snapshot is
-- the independent, deploy-time proof of that claim: it captures
-- every existing Boss Route participant's exact reward-card
-- ownership before this script makes any changes; the POST-DEPLOY
-- check re-derives the same thing afterward and aborts the whole
-- deploy on any difference.
--
-- Boss Route reward cards are identified precisely as card_instances
-- rows whose original_source_id points at one of that player's own
-- player_boss_paths rows (set by _boss_route_grant_stage itself) -
-- not merely by original_acquisition_type = 'achievement' alone,
-- since that enum value could in principle be reused by a future,
-- unrelated card-granting system; the source-id join keeps this
-- check precisely scoped to Boss Route grants regardless.
-- =========================================================

create temporary table pre_deploy_boss_reward_snapshot on commit drop as
select
  pbp_all.profile_id,
  p.username,
  (
    select string_agg(
      format('%s:%s:%s:%s', pbp.route_slot, pbp.route_id, pbp.current_stage, coalesce(pbp.mastered_at::text, 'null')),
      '|' order by pbp.route_slot
    )
    from public.player_boss_paths pbp
    where pbp.profile_id = pbp_all.profile_id
  ) as route_progress_signature,
  (
    select count(*)
    from public.card_instances ci
    join public.player_boss_paths pbp2 on pbp2.id = ci.original_source_id
    where ci.original_acquisition_type = 'achievement'
      and pbp2.profile_id = pbp_all.profile_id
  ) as boss_reward_card_count,
  (
    select coalesce(
      string_agg(format('%s:%s', x.card_catalog_id, x.card_count), '|' order by x.card_catalog_id),
      ''
    )
    from (
      select ci.card_catalog_id, count(*) as card_count
      from public.card_instances ci
      join public.player_boss_paths pbp2 on pbp2.id = ci.original_source_id
      where ci.original_acquisition_type = 'achievement'
        and pbp2.profile_id = pbp_all.profile_id
      group by ci.card_catalog_id
    ) x
  ) as boss_reward_card_signature
from (select distinct profile_id from public.player_boss_paths) pbp_all
join public.profiles p on p.id = pbp_all.profile_id;

do $preflight_boss_reward_snapshot_notice$
declare
  v_player_count int;
  v_total_reward_cards int;
begin
  select count(*), coalesce(sum(boss_reward_card_count), 0)
  into v_player_count, v_total_reward_cards
  from pre_deploy_boss_reward_snapshot;

  raise notice 'PRE-FLIGHT BOSS REWARD SNAPSHOT: % existing Boss Route participant(s) captured, % total Boss Route reward card(s) owned across all of them - this exact set must be byte-identical after the deploy.',
    v_player_count, v_total_reward_cards;
end $preflight_boss_reward_snapshot_notice$;

-- =========================================================
-- SECTION: 202609020910_fix_dark_magician_and_cubic_route_data.sql
-- =========================================================

-- =========================================================
-- FIX: Dark Magician route stage chain drift + Cubic Stage 4
-- support gap (Season 1 audit, Boss Route data item)
--
-- WHY - Dark Magician
-- The route was live-corrected by hand before this migration
-- existed (bossg's route selection predated the fix, so bossg was
-- also manually granted Berry/Lemon/Chocolate Magician Girl
-- directly): the intended Stage 1-4 evolution chain is
--   Stage 1: Berry Magician Girl      (free)
--   Stage 2: Dark Magician Girl       (900 DP)
--   Stage 3: Dark Magician of Chaos   (1400 DP)
--   Stage 4: The Dark Magicians       (2400 DP, final Boss)
-- and Stage 1 permanent support is five cards: Skilled Dark
-- Magician, Old Vindictive Magician, Magical Dimension, Lemon
-- Magician Girl, Chocolate Magician Girl. The seed migration
-- (202609011900_seed_boss_routes.sql) and data/boss-route-
-- registry.mjs were never updated to match and still show the old
-- Apprentice Magician -> Dark Magician Girl -> Dark Magician ->
-- Dark Magician of Chaos chain with only 3 of the 5 Stage 1
-- support cards. This migration is the missing update, applied the
-- same idempotent way as the original seed (on conflict do
-- update), so it is safe to run against a database that already
-- has the old OR the manually-corrected data.
--
-- LIVE-SAFETY RECONCILIATION (2026-09-02, pre-deploy review):
-- production already has Lemon Magician Girl and Chocolate
-- Magician Girl as Stage 1 grants, both manually set
-- is_route_exclusive = true. This file originally hardcoded both
-- inserts to is_route_exclusive = false, which the `on conflict do
-- update set is_route_exclusive = excluded.is_route_exclusive`
-- clause would have silently flipped back to false on deploy -
-- clobbering an intended live fix and, worse, reopening a Special
-- Pack pool leak (both cards had been curated into the
-- arcane_circle pool on the false assumption that they were
-- ordinary, non-exclusive support - removed from that pool in
-- 202609021020 as part of this same reconciliation). Both inserts
-- below now use true, matching the confirmed-correct live state;
-- the on-conflict clause is therefore idempotent in both directions
-- (true -> true) rather than clobbering true -> false. Skilled Dark
-- Magician / Old Vindictive Magician / Magical Dimension are
-- unaffected - they are already false in the original seed and stay
-- that way; nothing about this reconciliation changes them.
--
-- The plain "Dark Magician" card (previously Stage 3's evolution
-- monster) is no longer an evolution stage in the corrected chain.
-- CORRECTED 2026-09-02: an earlier draft of this migration re-added
-- it as a Stage 3 support grant on its own initiative - reverted.
-- The authoritative Stage 1 support list (below) is exactly the 5
-- named cards and nothing else; no placement is invented for Dark
-- Magician (plain) here. See the bottom of this file for the
-- explicit revert note.
--
-- Existing card ownership already granted to players (bossg's
-- manual Berry/Lemon/Chocolate grant, and any cards already
-- awarded on stage advancement) is untouched - this migration only
-- changes the boss_routes/boss_route_stages/boss_route_stage_grants
-- CONFIGURATION that drives what the route displays and what
-- future stage advancements grant.
--
-- WHY - Cubic
-- Stage 4 (Crimson Nova the Dark Cubic Lord) currently grants only
-- 3 support cards (Cubic Dharma, Cubic Causality, Cubic Mandala)
-- against the spec's own 4th named card, "Crimson Nova Boss EX".
-- CORRECTED 2026-09-02: an earlier draft of this migration
-- substituted "Crimson Nova Trinity the Dark Cubic Lord" for that
-- card without approval - reverted. "Crimson Nova Boss EX" does not
-- exist as an exact row in card_catalog (verified against the local
-- card-valuation snapshot). This migration does NOT add a 4th Stage
-- 4 support card - see the bottom of this file for the explicit
-- flag-not-guess note.
--
-- SAFETY
-- The Stage 1-4 evolution chain fix is one multi-row UPDATE keyed
-- on (route, stage_number) - safe to re-run any number of times,
-- since it always sets the same final values regardless of the
-- table's current contents (see the note directly above that
-- statement for why it must be one statement, not four). The Stage
-- 1 support additions below use the same on-conflict-do-update
-- shape as the original seed migration - also fully idempotent. No
-- table shape changes. No deletes.
-- =========================================================

-- ---- Dark Magician: corrected evolution chain ----
--
-- SAFETY: this is deliberately ONE multi-row UPDATE (not 4 separate
-- single-row UPDATEs). boss_route_stages has a UNIQUE (route_id,
-- evolution_card_catalog_id) constraint, and the corrected Stage 3
-- card ("Dark Magician of Chaos") is the CURRENT Stage 4 card in the
-- old/live seed data. Four separate UPDATE statements, run in
-- stage-number order, would set Stage 3 to "Dark Magician of Chaos"
-- while Stage 4 still held that exact same card - an immediate
-- unique-constraint violation, since this constraint is not
-- deferrable. A single UPDATE...FROM (VALUES...) statement changes
-- every affected row together, so Postgres only evaluates the
-- constraint against the final state of the statement and never
-- sees that transient collision.

with target_values (stage_number, card_name, new_dp_cost) as (
  values
    (1, 'Berry Magician Girl', null::integer),
    (2, 'Dark Magician Girl', 900),
    (3, 'Dark Magician of Chaos', 1400),
    (4, 'The Dark Magicians', 2400)
)
update public.boss_route_stages s
set
  evolution_card_catalog_id = c.id,
  dp_cost_to_reach = tv.new_dp_cost
from target_values tv
join public.boss_routes r on r.code = 'dark_magician'
join public.card_catalog c on c.name = tv.card_name
where s.route_id = r.id
  and s.stage_number = tv.stage_number;

-- ---- Dark Magician: Stage 1 support additions ----

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dark_magician' and s.stage_number = 1 and c.name = 'Lemon Magician Girl'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dark_magician' and s.stage_number = 1 and c.name = 'Chocolate Magician Girl'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

-- ---- Dark Magician: plain "Dark Magician" support placement ----
-- CORRECTION (2026-09-02 review): an earlier draft of this
-- migration re-added plain "Dark Magician" as a Stage 3 support
-- grant on the reasoning that it was "implicitly present" as the
-- old Stage 3 evolution card. That placement was never actually
-- specified anywhere in the authoritative route spec (only the 5
-- named Stage 1 support cards above are specified for this route)
-- and has been reverted - do not invent a support placement for a
-- card the spec doesn't mention. If Dark Magician (plain) is meant
-- to be part of this route at all, that needs an explicit decision
-- and a follow-up migration, not a guess made here.

-- ---- Cubic: Stage 4 support gap - NOT fixed, flagged instead ----
-- CORRECTION (2026-09-02 review): an earlier draft of this
-- migration added "Crimson Nova Trinity the Dark Cubic Lord" as a
-- substitute for the spec's actual 4th Stage 4 support card,
-- "Crimson Nova Boss EX" - that substitution was never approved and
-- has been reverted. "Crimson Nova Boss EX" does not exist as an
-- exact row in card_catalog (verified against the local
-- card-valuation snapshot; confirm against the live database before
-- concluding it's truly absent). Cubic's Stage 4 support stays at
-- its current 3 cards (Cubic Dharma, Cubic Causality, Cubic
-- Mandala) until the real card is identified or added - do not
-- guess a replacement.

-- =========================================================
-- SECTION: 202609020920_claim_welcome_packs.sql
-- =========================================================

-- =========================================================
-- CLAIM_WELCOME_PACKS - Season 1 welcome bonus, real entitlement
-- (Season 1 audit, shop/welcome-bonus item)
--
-- WHY
-- The spec grants each new Season 1 player 1 Normal + 1 Premium + 1
-- Deluxe pack, no DP cost, on joining. We manually discovered that
-- inserting a row directly into public.shop_purchases does NOT
-- grant an unopened pack - purchase_shop_pack() is the only
-- function that creates the actual entitlement chain
-- (shop_pack_openings -> player_pack_luck -> card_instances /
-- shop_pack_pulls, all in one transaction) - a bare shop_purchases
-- row is just a history log entry with nothing behind it.
--
-- purchase_shop_pack() already has a fully-formed "pay with a
-- voucher instead of DP" path (target_voucher_id) - this is
-- exactly the same mechanism already used to manually grant
-- bossg/samo/fardin their vouchers live. This function reuses that
-- exact path rather than inventing a second entitlement pipeline:
-- it grants three public.reward_vouchers rows (normal_pack /
-- premium_pack / deluxe_pack, quantity 1 each), which the player
-- then redeems from the existing Shop UI exactly like any other
-- voucher - purchase_shop_pack() does the rest, unmodified.
--
-- IDEMPOTENCY
-- A reward_vouchers row is deleted the moment it's redeemed (see
-- purchase_shop_pack's "CONSUME VOUCHER" step), so the voucher rows
-- themselves cannot be used as the durable "already claimed" marker
-- - a player who redeemed their welcome Normal pack would otherwise
-- look like they never received one and get re-granted. A small
-- dedicated claims table is the marker instead, following the same
-- unique-constraint-as-guard pattern already used elsewhere in this
-- schema (e.g. achievement_claims_one_success_per_period): the
-- primary key insert is the atomic "have I already run" check.
--
-- WHO CAN CALL THIS
-- Any authenticated league member, for themselves only (auth.uid()
-- - no target-profile parameter) - self-service, same shape as
-- start_personal_initial_draft(). Season 1's proxy.ts onboarding
-- gate also calls this automatically once a player's league
-- membership is confirmed, so a brand new player receives their
-- welcome packs with no manual action - but it remains safe to
-- call directly (e.g. from a support/admin tool) since it is a
-- total no-op after the first successful claim.
--
-- NOTE ON THE 3 ALREADY-LIVE PLAYERS
-- bossg/samo/fardin already received their welcome vouchers via a
-- manual live grant before this function existed. CORRECTED
-- 2026-09-02: an earlier draft of this migration deliberately did
-- NOT backfill the claims table for them (leaving it as a manual,
-- by-hand follow-up), on the theory that backfilling without a live
-- read to confirm their exact current state risked masking a real
-- problem. Per review, that is backwards: leaving them unbackfilled
-- is what actually causes a double-grant, since the very first time
-- claim_welcome_packs() runs for one of them (e.g. from proxy.ts)
-- it would find no season1_welcome_bonus_claims row and grant a
-- second set of 3 vouchers. The migration now backfills them
-- directly (see the BACKFILL block below) - inserting only the
-- claims-table marker row, granting no additional vouchers - which
-- is the safe direction regardless of whether their existing
-- reward_vouchers rows are still unredeemed, partially redeemed, or
-- fully redeemed: none of that changes whether they already went
-- through the welcome process once.
--
-- SAFETY
-- Purely additive: one new table, one new function. Does not touch
-- shop_purchases, purchase_shop_pack, or any existing voucher.
-- Fully reversible: drop function if exists
-- public.claim_welcome_packs(); drop table if exists
-- public.season1_welcome_bonus_claims; undoes this with no
-- consequence to any other table.
-- =========================================================

create table if not exists public.season1_welcome_bonus_claims (
  profile_id uuid primary key
    references public.profiles(id)
    on delete cascade,

  claimed_at timestamptz not null default now()
);

comment on table public.season1_welcome_bonus_claims is
  'Idempotency marker for claim_welcome_packs(): one row per profile that has ever received the Season 1 welcome bonus (1 Normal + 1 Premium + 1 Deluxe voucher). Vouchers themselves are deleted on redemption, so this table - not reward_vouchers - is the durable "already granted" check.';

-- =========================================================
-- BACKFILL (2026-09-02 review): bossg, samo and fardin already
-- received their normal_pack/premium_pack/deluxe_pack vouchers
-- through a manual live grant, before this function or this
-- marker table existed. Without this backfill, the very first time
-- claim_welcome_packs() ran for each of them (e.g. from proxy.ts on
-- their next request) it would find no season1_welcome_bonus_claims
-- row, insert one, and grant them a SECOND set of 3 vouchers -
-- exactly the double-grant this migration must not cause.
--
-- This marks all three as already-claimed using
-- lower(profiles.username) so it's independent of any capitalization
-- in how the usernames are actually stored, and independent of
-- whatever the current state of their reward_vouchers rows is
-- (already redeemed, partially redeemed, or still sitting unopened
-- - none of that changes whether they already went through the
-- welcome process once). Deliberately scoped to exactly these 3
-- usernames rather than "every current league member" so that a
-- genuinely new player who joins before this migration is deployed,
-- but isn't one of these 3, still gets their real automatic bonus
-- the first time the function runs for them.
--
-- Idempotent: on conflict do nothing means re-running this
-- migration (or running it after one of the three has since
-- claimed some other way) never errors and never double-inserts.
-- =========================================================

insert into public.season1_welcome_bonus_claims (profile_id)
select id
from public.profiles
where lower(username) in ('bossg', 'samo', 'fardin')
on conflict (profile_id) do nothing;

create or replace function public.claim_welcome_packs()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  claim_inserted boolean;
begin
  current_user_id := (select auth.uid());

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.league_members
    where profile_id = current_user_id
  ) then
    raise exception 'You are not a league member yet.';
  end if;

  insert into public.season1_welcome_bonus_claims (profile_id)
  values (current_user_id)
  on conflict (profile_id) do nothing;

  claim_inserted := found;

  if not claim_inserted then
    -- Already claimed previously - total no-op, safe to call
    -- repeatedly (e.g. on every proxy.ts request).
    return false;
  end if;

  insert into public.reward_vouchers (
    profile_id,
    voucher_type,
    quantity,
    source_type,
    note
  )
  values
    (current_user_id, 'normal_pack', 1, 'season1_welcome_bonus', 'Season 1 welcome bonus'),
    (current_user_id, 'premium_pack', 1, 'season1_welcome_bonus', 'Season 1 welcome bonus'),
    (current_user_id, 'deluxe_pack', 1, 'season1_welcome_bonus', 'Season 1 welcome bonus');

  return true;
end;
$$;

comment on function public.claim_welcome_packs() is
  'Self-service, idempotent: grants the calling league member their one-time Season 1 welcome bonus (1 Normal + 1 Premium + 1 Deluxe pack voucher, redeemed via the existing purchase_shop_pack voucher path). Returns true the first time it actually grants, false on every call after (already claimed). Raises if the caller is not yet a league member.';

revoke all on function public.claim_welcome_packs() from public;
grant execute on function public.claim_welcome_packs() to authenticated;

-- =========================================================
-- SECTION: 202609020930_fix_shop_pack_boss_route_exclusion.sql
-- =========================================================

-- =========================================================
-- FIX: Shop pack card selection did not exclude Boss-Route
-- content (Season 1 audit, Boss/Shop item)
--
-- WHY
-- Draft has excluded Boss-Route-exclusive content (a route's
-- evolution monster in any stage of any route, or any support card
-- flagged is_route_exclusive = true) since
-- 202609011700_draft_boss_route_exclusion.sql - go-live spec
-- section 11. No Shop pack-purchase function was ever given the
-- same exclusion: public.pick_shop_pack_card() (last redefined in
-- 202608311400_phase2_special_pack_rotation_and_legendary_odds.sql)
-- only filters on format_eligible, master_duel_offerable, rarity,
-- theme and per-player/league copy limits across all four of its
-- fallback tiers (exact rarity+theme, exact rarity, themed any
-- rarity, final any-card fallback) - meaning a Normal/Premium/
-- Deluxe/Special Pack pull could hand a player a route's Stage 4
-- Boss monster (or any other route-exclusive card) before they ever
-- reach that stage on that route, undermining the entire "Boss
-- cards are earned, not pulled" design.
--
-- WHAT THIS CHANGES
-- Reissues pick_shop_pack_card() with a
-- "not exists (... boss_route_stages where stage_number = 4 ...)
-- and not exists (... boss_route_stage_grants where
-- is_route_exclusive ...)" clause, added to card.format_eligible in
-- all four candidate queries.
--
-- CORRECTED 2026-09-02: the clause originally committed here (and
-- the equivalent, already-deployed Draft clause in
-- 202609011700_draft_boss_route_exclusion.sql it was copied from)
-- excluded a card if it was ANY stage's evolution monster, not just
-- Stage 4's. That was over-broad - the authoritative rule is only
-- "Stage 4 (final Boss) monsters are always excluded" plus
-- "explicitly is_route_exclusive-flagged support is always
-- excluded"; an ordinary Stage 1-3 evolution monster stays
-- purchasable, matching "replaced Stage 1-3 evolution monsters do
-- not count against permanent support cap" (which only makes sense
-- if those cards are otherwise ordinary). This version has
-- `and brs.stage_number = 4` added to the boss_route_stages check.
-- The equivalent fix for Draft's create_next_draft_offer() is a
-- separate migration (202609020970) since that function is already
-- deployed and must be fixed forward, not edited in place.
--
-- Non-exclusive Boss Route support grants (most of each route's
-- 12-15 permanent cards) are NOT affected and remain normally
-- purchasable, matching Draft's existing behavior for the same
-- cards.
--
-- SAFETY
-- purchase_shop_pack() itself is untouched - it only calls this
-- function and already handles a null/exception result from it.
-- Fully reversible by re-running
-- 202608311400_phase2_special_pack_rotation_and_legendary_odds.sql's
-- own CREATE OR REPLACE for this function.
-- =========================================================

create or replace function public.pick_shop_pack_card(
  target_profile_id uuid,
  target_rarity text,
  target_rotation_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  theme_type text;
  theme_value text;
  chosen_card_id uuid;
  current_league_id uuid;
begin
  -- =======================================================
  -- LEAGUE-WIDE LEGENDARY SCARCITY FIX (2026-08-31, Phase 2
  -- special-pack rebuild): this function's own candidate queries
  -- previously excluded a card only if THIS player individually
  -- already held it at copy_limit - for Legendary (limit=1
  -- league-wide, per shop_card_copy_limit()) this meant an
  -- already-league-owned Legendary (owned by a DIFFERENT player)
  -- was still offered as a "candidate" here, relying entirely on
  -- purchase_shop_pack()'s own outer retry loop to catch and
  -- reject it. For a narrow special-pack theme with only one
  -- matching Legendary, every one of that loop's up to 25 retries
  -- could keep re-selecting the SAME already-owned card (this
  -- function has no memory of previous attempts), causing a false
  -- 'Could not find an eligible card for this pack' failure even
  -- when other, unclaimed Legendaries existed under a broader
  -- filter. Every copy-limit check below now excludes an
  -- already-league-owned Legendary directly (matching the same
  -- Legendary-is-league-wide / everything-else-is-per-player
  -- branch already used in purchase_shop_pack's own 2026-08-30
  -- fix), so this function's existing theme -> no-theme -> any-
  -- rarity fallback chain does its job correctly on the first
  -- attempt instead of depending on the caller's retry loop.
  -- =======================================================
  select lm.league_id
  into current_league_id
  from public.league_members lm
  where lm.profile_id = target_profile_id
  limit 1;
  -- =======================================================
  -- SPECIAL THEME
  -- =======================================================
  if target_rotation_id is not null then
    select
      theme_category,
      shop_special_pack_rotations.theme_value
    into
      theme_type,
      theme_value
    from public.shop_special_pack_rotations
    where id = target_rotation_id;
  end if;

  -- =======================================================
  -- TRY EXACT RARITY + THEME
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and public.is_master_duel_offerable(card.master_duel_status)
    -- Boss-Route-exclusive content never appears in the Shop
    -- (Season 1 audit fix, matching the exclusion already
    -- enforced in Draft since 202609011700_draft_boss_route_
    -- exclusion.sql): a route's evolution monster or any
    -- support grant flagged is_route_exclusive = true is never
    -- a valid candidate here. Non-exclusive support grants stay
    -- purchasable normally.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = card.id
        and brs.stage_number = 4
    )
    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = card.id
        and brg.is_route_exclusive = true
    )
    and card.game_rarity = target_rarity
    and (
      select count(*)
      from public.card_instances instance
      where
        instance.card_catalog_id = card.id
        and (
          case
            when card.game_rarity = 'Legendary' then instance.league_id = current_league_id
            else instance.current_owner_id = target_profile_id
          end
        )
    ) < public.shop_card_copy_limit(card.game_rarity)
    and (
      theme_type is null
      or theme_value is null
      or case theme_type
        when 'archetype'
          then coalesce(card.archetype, '') ilike '%' || theme_value || '%'
        when 'attribute'
          then coalesce(card.attribute, '') ilike '%' || theme_value || '%'
        when 'monster_type'
          then coalesce(card.monster_type, '') ilike '%' || theme_value || '%'
        when 'card_type'
          then coalesce(card.card_type, '') ilike '%' || theme_value || '%'
        when 'frame_type'
          then coalesce(card.frame_type, '') ilike '%' || theme_value || '%'
        when 'custom'
          then true
        else true
      end
    )
  order by random()
  limit 1;

  if chosen_card_id is not null then
    return chosen_card_id;
  end if;

  -- =======================================================
  -- FALLBACK:
  -- EXACT RARITY WITHOUT THEME
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and public.is_master_duel_offerable(card.master_duel_status)
    -- Boss-Route-exclusive content never appears in the Shop
    -- (Season 1 audit fix, matching the exclusion already
    -- enforced in Draft since 202609011700_draft_boss_route_
    -- exclusion.sql): a route's evolution monster or any
    -- support grant flagged is_route_exclusive = true is never
    -- a valid candidate here. Non-exclusive support grants stay
    -- purchasable normally.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = card.id
        and brs.stage_number = 4
    )
    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = card.id
        and brg.is_route_exclusive = true
    )
    and card.game_rarity = target_rarity
    and (
      select count(*)
      from public.card_instances instance
      where
        instance.card_catalog_id = card.id
        and (
          case
            when card.game_rarity = 'Legendary' then instance.league_id = current_league_id
            else instance.current_owner_id = target_profile_id
          end
        )
    ) < public.shop_card_copy_limit(card.game_rarity)
  order by random()
  limit 1;

  if chosen_card_id is not null then
    return chosen_card_id;
  end if;

  -- =======================================================
  -- FALLBACK:
  -- THEMED CARD OF ANY RARITY
  -- =======================================================
  if theme_type is not null and theme_value is not null then
    select
      card.id
    into chosen_card_id
    from public.card_catalog card
    where
      card.format_eligible = true
      and public.is_master_duel_offerable(card.master_duel_status)
    -- Boss-Route-exclusive content never appears in the Shop
    -- (Season 1 audit fix, matching the exclusion already
    -- enforced in Draft since 202609011700_draft_boss_route_
    -- exclusion.sql): a route's evolution monster or any
    -- support grant flagged is_route_exclusive = true is never
    -- a valid candidate here. Non-exclusive support grants stay
    -- purchasable normally.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = card.id
        and brs.stage_number = 4
    )
    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = card.id
        and brg.is_route_exclusive = true
    )
      and (
        select count(*)
        from public.card_instances instance
        where
          instance.card_catalog_id = card.id
          and (
            case
              when card.game_rarity = 'Legendary' then instance.league_id = current_league_id
              else instance.current_owner_id = target_profile_id
            end
          )
      ) < public.shop_card_copy_limit(card.game_rarity)
      and case theme_type
        when 'archetype'
          then coalesce(card.archetype, '') ilike '%' || theme_value || '%'
        when 'attribute'
          then coalesce(card.attribute, '') ilike '%' || theme_value || '%'
        when 'monster_type'
          then coalesce(card.monster_type, '') ilike '%' || theme_value || '%'
        when 'card_type'
          then coalesce(card.card_type, '') ilike '%' || theme_value || '%'
        when 'frame_type'
          then coalesce(card.frame_type, '') ilike '%' || theme_value || '%'
        when 'custom'
          then true
        else true
      end
    order by random()
    limit 1;
  end if;

  if chosen_card_id is not null then
    return chosen_card_id;
  end if;

  -- =======================================================
  -- FINAL FALLBACK:
  -- ANY CARD BELOW OWNERSHIP CAP
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and public.is_master_duel_offerable(card.master_duel_status)
    -- Boss-Route-exclusive content never appears in the Shop
    -- (Season 1 audit fix, matching the exclusion already
    -- enforced in Draft since 202609011700_draft_boss_route_
    -- exclusion.sql): a route's evolution monster or any
    -- support grant flagged is_route_exclusive = true is never
    -- a valid candidate here. Non-exclusive support grants stay
    -- purchasable normally.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = card.id
        and brs.stage_number = 4
    )
    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = card.id
        and brg.is_route_exclusive = true
    )
    and (
      select count(*)
      from public.card_instances instance
      where
        instance.card_catalog_id = card.id
        and (
          case
            when card.game_rarity = 'Legendary' then instance.league_id = current_league_id
            else instance.current_owner_id = target_profile_id
          end
        )
    ) < public.shop_card_copy_limit(card.game_rarity)
  order by random()
  limit 1;

  if chosen_card_id is null then
    raise exception 'No eligible cards remain for this player.';
  end if;

  return chosen_card_id;
end;
$function$;

-- =========================================================
-- SECTION: 202609020940_special_pack_curated_pools_schema.sql
-- =========================================================

-- =========================================================
-- SPECIAL PACK REBUILD, PART 1: CURATED PACK IDENTITIES + POOLS
-- (Season 1 audit, Shop item - "Special Pack" is fundamentally
-- broken and needs a full rebuild)
--
-- THE BUG THIS FIXES
-- shop_special_pack_slots (202608311400) already gave Special
-- Packs a fixed, deterministically-cycling 15-theme structure (5
-- slots x 3 categories, one active category-row at a time = "3
-- active"), which was real progress over the fully-random original
-- (202608230021). But every slot's theme_value is still a RAW
-- card_catalog.archetype / attribute / monster_type STRING, chosen
-- at migration time by `group by ... having count(*) >= 12` -
-- count(*) >= 12 is enough to pass that bar while still being a
-- near-empty, degenerate archetype (the audit's own example:
-- "@Ignister" - a real archetype tag in the catalog, but one with
-- almost no eligible, non-boss-route, Master-Duel-offerable cards
-- once every OTHER filter pick_shop_pack_card also applies is
-- layered on top). And even for a healthy theme, the filter is
-- still a LIVE `ILIKE '%'||theme_value||'%'` re-evaluated against
-- card_catalog at every single pull (pick_shop_pack_card,
-- 202609020930) - never a fixed, curated, storable set of cards,
-- and vulnerable to any future catalog edit silently changing what
-- a named pack can produce.
--
-- THE FIX (this file - schema + seed; see the companion
-- 202609020950 migration for the pick_shop_pack_card /
-- refresh_shop_special_pack_rotation_if_needed rewrite that
-- actually switches pulls over to reading these tables)
--
--   1. shop_special_pack_definitions - exactly 15 fixed, named,
--      human-designed Special Packs (NOT regenerated from a live
--      query - see seed section 2 below for the full roster and
--      the reasoning behind each one).
--   2. shop_special_pack_pool_cards - the curated ~200-300 card
--      pool for each pack, SNAPSHOTTED into this table by the seed
--      inserts below (real card_catalog rows, filtered by the
--      exact same format_eligible + is_master_duel_offerable +
--      not-Boss-Route-exclusive rule already proven by
--      202609020930, plus each pack's own thematic condition -
--      never invented, never re-computed at pull time going
--      forward).
--   3. shop_special_pack_slots gets a new pack_definition_id column
--      pointing every one of its 15 existing (theme_category,
--      slot_order) rows at the matching curated pack, via an
--      idempotent `on conflict (theme_category, slot_order) do
--      update` - the table's own comment already documents that a
--      human is expected to freely edit these rows later, so
--      overwriting the (previously live-query-derived, possibly
--      "@Ignister"-tainted) theme_value/theme_label content here is
--      exactly the anticipated use, not a surprise destructive
--      change.
--   4. shop_special_pack_rotations gets a new pack_definition_id
--      column (nullable - historical rows predate curated packs)
--      so a currently-active rotation can be resolved straight to
--      its pack's pool without an extra join through slots.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT CHANGE
-- The 3-categories-x-5-slots structure, the "one active row per
-- category = 3 active at once" invariant, the 48h cadence, and the
-- deterministic wrap-around cycling logic from 202608311400 are ALL
-- kept exactly as-is - they already satisfy the "15 configured, 3
-- active, deterministic 48h rotation" requirement and every existing
-- caller (purchase_shop_pack, get_active_special_pack_rotation, the
-- shop UI) is keyed off theme_category, so reusing that shape is the
-- smallest change that gets curated pools in place. theme_category,
-- theme_value and theme_label are all kept populated (see part 2)
-- for backward compatibility and historical rows; going forward
-- theme_label is set to each pack's curated `name` so it stays a
-- correct, human-readable display string even though it is no
-- longer literally an archetype/attribute/monster_type value.
--
-- WHY 15 CURATED IDENTITIES INSTEAD OF ONE PER "CATEGORY MEANING"
-- Once the pool - not the theme string - is the pull-time filter,
-- theme_category stops needing to describe what KIND of filter is
-- applied (that information now lives entirely in each pack's
-- stored pool) and becomes just a rotation bucket label. This lets
-- each of the eventual 15 identities be picked purely for being a
-- distinct, coherent, broad "themed booster set" with a real
-- ~200-300 card pool spanning multiple related archetypes/packages
-- plus generic support - NOT a single narrow archetype slice. An
-- earlier draft of sections 4-7 (since removed - see the DEFERRED
-- note below) picked 15 single-Type/single-archetype-cluster names
-- ("Warrior's Code", "Aqua Depths", "Golden Age Archetypes", etc.)
-- seeded via an alphabetical `order by name limit N` slice; that
-- was rejected on review as not real curation and too narrow, and
-- none of those names or pools are part of this file anymore. The
-- actual 15 identities and their pools are pending a new, broader
-- proposal (see the audit report) and are not decided here.
--
-- BOSS ROUTE AVOIDANCE (applies to whichever 15 packs are ultimately
-- approved)
-- No approved pack should be centered on a single one of the 20
-- Boss Route archetypes (chaos_bls, dark_magician, elemental_hero,
-- blue_eyes, cyber_dragon, jinzo, armed_dragon_ojama, crystal_beast,
-- red_eyes, zombie, dinosaur, legendary_fisherman, machina, toon,
-- harpie, ancient_gear, galaxy_photon, destiny_hero, vampire,
-- cubic) to the exclusion of that Type/theme's other archetypes - a
-- Type-wide or multi-archetype pool that happens to also cover a
-- Boss Route archetype among several others is fine. Whatever pools
-- are eventually seeded, the boss-route-exclusion clause (copied
-- verbatim from 202609020930/202609020950) strips any individually
-- Stage-4 or route-exclusive card from every pool regardless.
--
-- SAFETY / IDEMPOTENCY
-- Every DDL statement is CREATE TABLE IF NOT EXISTS / ADD COLUMN IF
-- NOT EXISTS. Every seed INSERT uses ON CONFLICT DO NOTHING/DO
-- UPDATE against a real unique constraint, so re-running this file
-- never duplicates a pack, a pool row, or reshuffles an already-
-- populated slot. Nothing is deleted. No existing table's rows are
-- altered outside the 15 (theme_category, slot_order) slot rows
-- this system already owns and whose comment already invites this
-- exact kind of curation edit.
-- =========================================================


-- ---------------------------------------------------------
-- 1. shop_special_pack_definitions - the 15 fixed packs.
-- ---------------------------------------------------------

create table if not exists public.shop_special_pack_definitions (
  id uuid primary key default gen_random_uuid(),

  code text not null unique,
  name text not null,
  theme_description text not null,

  display_order integer not null unique
    check (display_order between 1 and 15),

  is_active boolean not null default true,

  created_at timestamptz not null default now()
);

comment on table public.shop_special_pack_definitions is
  'The 15 fixed, human-designed Special Pack identities (Season 1 audit rebuild, 2026-09-02) - never regenerated from a live query. Each row''s curated card pool lives in shop_special_pack_pool_cards. is_active lets a pack be pulled out of the shop_special_pack_slots rotation later (see refresh_shop_special_pack_rotation_if_needed) without deleting its history or pool.';

alter table public.shop_special_pack_definitions enable row level security;

drop policy if exists shop_special_pack_definitions_select_authenticated
  on public.shop_special_pack_definitions;

create policy shop_special_pack_definitions_select_authenticated
  on public.shop_special_pack_definitions
  for select
  to authenticated
  using (true);

revoke insert, update, delete
  on public.shop_special_pack_definitions
  from authenticated;

grant select
  on public.shop_special_pack_definitions
  to authenticated;


-- ---------------------------------------------------------
-- 2. shop_special_pack_pool_cards - curated pool membership.
-- ---------------------------------------------------------

create table if not exists public.shop_special_pack_pool_cards (
  id uuid primary key default gen_random_uuid(),

  pack_definition_id uuid not null
    references public.shop_special_pack_definitions(id)
    on delete cascade,

  card_catalog_id uuid not null
    references public.card_catalog(id)
    on delete cascade,

  created_at timestamptz not null default now(),

  unique (pack_definition_id, card_catalog_id)
);

comment on table public.shop_special_pack_pool_cards is
  'Snapshotted pool of eligible card_catalog rows for one shop_special_pack_definitions pack - the ONLY thing that decides which cards a Special Pack pull can produce as of the 2026-09-02 rebuild (pick_shop_pack_card no longer runs a live ILIKE theme match against card_catalog for special packs; see 202609020950). Populated once by this migration''s seed inserts from real, currently-eligible, non-Boss-Route-exclusive cards - never computed dynamically at pull time. A human can freely add/remove rows here later to curate a pack further.';

create index if not exists shop_special_pack_pool_cards_pack_idx
  on public.shop_special_pack_pool_cards (pack_definition_id);

create index if not exists shop_special_pack_pool_cards_card_idx
  on public.shop_special_pack_pool_cards (card_catalog_id);

alter table public.shop_special_pack_pool_cards enable row level security;

drop policy if exists shop_special_pack_pool_cards_select_authenticated
  on public.shop_special_pack_pool_cards;

create policy shop_special_pack_pool_cards_select_authenticated
  on public.shop_special_pack_pool_cards
  for select
  to authenticated
  using (true);

revoke insert, update, delete
  on public.shop_special_pack_pool_cards
  from authenticated;

grant select
  on public.shop_special_pack_pool_cards
  to authenticated;


-- ---------------------------------------------------------
-- 3. Link shop_special_pack_slots / shop_special_pack_rotations
--    to the new curated packs (additive columns only).
-- ---------------------------------------------------------

alter table public.shop_special_pack_slots
  add column if not exists pack_definition_id uuid
    references public.shop_special_pack_definitions(id);

comment on column public.shop_special_pack_slots.pack_definition_id is
  'Which curated shop_special_pack_definitions pack this configured slot activates (2026-09-02 rebuild) - resolves the slot straight to its stored pool instead of the slot''s own theme_value ever being live-ILIKE-matched against card_catalog again. Null only on a slot a human has not yet assigned a curated pack to (refresh_shop_special_pack_rotation_if_needed skips such a slot - see 202609020950).';

alter table public.shop_special_pack_rotations
  add column if not exists pack_definition_id uuid
    references public.shop_special_pack_definitions(id);

comment on column public.shop_special_pack_rotations.pack_definition_id is
  'The curated pack (shop_special_pack_definitions) this active/historical rotation row was generated from - lets pick_shop_pack_card resolve straight to shop_special_pack_pool_cards without a join through shop_special_pack_slots. Null on historical rows created before curated pools existed.';


-- =========================================================
-- 4-7. SEED DATA - DEFERRED, NOT YET APPROVED (2026-09-02 review)
--
-- An earlier draft of this migration included sections 4-7 here:
-- 15 hardcoded pack definitions, their curated card pools (seeded
-- via "order by name limit N", which was correctly called out on
-- review as an arbitrary alphabetical slice, not real curation),
-- the slot-to-pack assignment, and a pool-size verification block.
-- All of that has been REMOVED from this file pending a new,
-- broader 15-pack proposal (booster-style pools blending multiple
-- related archetypes/themes + generic support, ~200-300 cards
-- each, not single-archetype slices) - see the audit report for
-- the new proposal awaiting approval.
--
-- What stays in THIS file (sections 1-3 above) is the approved
-- architecture only: the shop_special_pack_definitions and
-- shop_special_pack_pool_cards TABLES, and the additive
-- pack_definition_id columns on shop_special_pack_slots /
-- shop_special_pack_rotations. These tables are empty until a
-- follow-up migration seeds the approved 15 packs and their pools -
-- pick_shop_pack_card (202609020950) already treats an empty/
-- unassigned pool correctly (v_pack_definition_id ends up null for
-- any rotation that isn't linked to a pack yet, which makes every
-- pool-membership check in that function a no-op, same as a
-- Normal/Premium/Deluxe pack) - so deploying this schema-only file
-- now is safe and doesn't change any current pack-pull behavior
-- until the pool data actually exists.
-- =========================================================

-- =========================================================
-- SECTION: 202609020950_special_pack_curated_pools_functions.sql
-- =========================================================

-- =========================================================
-- SPECIAL PACK REBUILD, PART 2: SWITCH PULLS OVER TO THE
-- CURATED POOLS (see the companion 202609020940 migration for the
-- schema + the 15 curated packs/pools this reissues against)
--
-- WHAT CHANGES
--
--   1. refresh_shop_special_pack_rotation_if_needed(text) -
--      reissued, byte-for-byte identical deterministic
--      sequential-slot-advance / 48h-duration / 1200 DP / 10-card
--      logic from 202609011300, with exactly one addition: it now
--      also reads and carries forward each slot's
--      pack_definition_id onto the new shop_special_pack_rotations
--      row, and skips a slot whose curated pack has been marked
--      is_active = false (same "return early, no exception" safety
--      pattern already used for "no configured slots at all").
--
--   2. pick_shop_pack_card(uuid, text, uuid) - reissued with two
--      fixes (see the detailed comment directly above that
--      function's definition below for the full rationale):
--
--      a) Boss-Route exclusion scoped to Stage 4 (final Boss)
--         evolution monsters only, plus is_route_exclusive support
--         grants - matching 202609020930/202609020970. A Stage 1-3
--         evolution monster is an ordinary card and stays
--         purchasable.
--
--      b) The old theme-string filter
--           `coalesce(card.archetype/attribute/monster_type, '')
--            ilike '%' || theme_value || '%'`
--         evaluated LIVE against card_catalog is replaced with a
--         fixed, curated-pool membership check
--           `exists (select 1 from shop_special_pack_pool_cards spc
--                    where spc.pack_definition_id = v_pack_definition_id
--                      and spc.card_catalog_id = card.id)`
--         AND the function's old 4-tier fallback structure (exact
--         rarity+theme -> exact rarity -> themed any rarity -> any
--         card at all) is collapsed to exactly 2 tiers, with pool
--         membership checked, unconditionally, in BOTH tiers. Only
--         rarity ever relaxes between tiers; pool membership never
--         does, so a Special Pack pull can no longer fall through
--         to a pool-agnostic fallback the way the previous 4-tier
--         design's own final tier allowed. For a Normal/Premium/
--         Deluxe pack (v_pack_definition_id is null) the pool check
--         is always true, so behavior there is unchanged from
--         before curated pools existed.
--
-- SAFETY
-- Purely CREATE OR REPLACE against two existing function
-- signatures - no schema change in this file, nothing deleted.
-- purchase_shop_pack, get_active_special_pack_rotation, and every
-- shop UI caller are completely untouched: they already only pass a
-- target_rotation_id through to pick_shop_pack_card and read
-- theme_category/price_dp/cards_per_pack/theme_label/theme_value
-- off shop_special_pack_rotations, none of which change shape here.
-- =========================================================


-- ---------------------------------------------------------
-- 1. refresh_shop_special_pack_rotation_if_needed - reissued to
--    carry pack_definition_id forward. Reproduced from the live
--    202609011300 version.
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
  current_row public.shop_special_pack_rotations%rowtype;
  total_slots integer;
  previous_slot_order integer;
  next_slot_order integer;
  next_theme_value text;
  next_theme_label text;
  next_pack_definition_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('shop_special_pack_rotation:' || target_theme_category));

  select *
  into current_row
  from public.shop_special_pack_rotations
  where theme_category = target_theme_category
    and status = 'active'
  order by starts_at desc
  limit 1;

  if found and current_row.ends_at > now() then
    return;
  end if;

  if found then
    update public.shop_special_pack_rotations
    set status = 'completed', updated_at = now()
    where id = current_row.id;
  end if;

  select count(*)
  into total_slots
  from public.shop_special_pack_slots
  where theme_category = target_theme_category;

  if total_slots = 0 then
    return;
  end if;

  previous_slot_order := current_row.slot_order;

  -- Deterministic sequential advance (unchanged from 202609011300):
  -- wraps back to slot 1 after the last configured slot. With up to
  -- 5 slots per category and a 48h rotation, this is up to a 10-day
  -- full cycle per category.
  next_slot_order := case
    when previous_slot_order is null then 1
    else (previous_slot_order % total_slots) + 1
  end;

  -- 2026-09-02 CURATED POOL REBUILD: also read the slot's curated
  -- pack. If the slot has no pack assigned yet, or its pack has been
  -- deliberately deactivated (shop_special_pack_definitions.is_active
  -- = false), skip this refresh exactly like the pre-existing
  -- "no configured slots at all" case - a missing rotation is safer
  -- than one pointing at a retired/unassigned pack, and the category
  -- simply shows one fewer active Special Pack until a human assigns
  -- or reactivates a pack for this slot.
  select s.theme_value, s.theme_label, s.pack_definition_id
  into next_theme_value, next_theme_label, next_pack_definition_id
  from public.shop_special_pack_slots s
  left join public.shop_special_pack_definitions d on d.id = s.pack_definition_id
  where s.theme_category = target_theme_category
    and s.slot_order = next_slot_order
    and (s.pack_definition_id is null or d.is_active = true);

  if next_theme_value is null then
    return;
  end if;

  if next_pack_definition_id is null then
    return;
  end if;

  insert into public.shop_special_pack_rotations (
    theme_category,
    slot_order,
    theme_value,
    theme_label,
    pack_definition_id,
    price_dp,
    cards_per_pack,
    starts_at,
    ends_at,
    status
  )
  values (
    target_theme_category,
    next_slot_order,
    next_theme_value,
    next_theme_label,
    next_pack_definition_id,
    1200,
    10,
    now(),
    now() + interval '48 hours',
    'active'
  );
end;
$function$;

revoke all on function public.refresh_shop_special_pack_rotation_if_needed(text) from public;
grant execute on function public.refresh_shop_special_pack_rotation_if_needed(text) to authenticated;


-- ---------------------------------------------------------
-- 2. pick_shop_pack_card - reissued.
--
-- CORRECTED 2026-09-02 (two fixes, both from the same review):
--
--  a) Boss-Route exclusion is now scoped to Stage 4 (final Boss)
--     evolution monsters only, plus explicitly is_route_exclusive
--     support grants - matching the authoritative rule and the
--     equivalent fix in 202609020930/202609020970. A Stage 1-3
--     evolution monster is an ordinary card and stays purchasable.
--
--  b) STRICTER POOL ENFORCEMENT: the previous version of this
--     function (committed, never deployed) let a Special Pack pull
--     fall through a "themed, any rarity" tier and then all the way
--     to a pool-AGNOSTIC final fallback tier if the pool ran dry -
--     meaning a tight enough pool/copy-limit combination could, in
--     theory, hand out a card from OUTSIDE the purchased pack's
--     curated pool. That is now structurally impossible: this
--     version collapses the old 4-tier design down to exactly 2
--     tiers, and the pool-membership check
--       `v_pack_definition_id is null or exists (select 1 from
--        shop_special_pack_pool_cards where pack_definition_id =
--        v_pack_definition_id and card_catalog_id = card.id)`
--     is present in BOTH tiers, unconditionally - rarity is the
--     only thing that ever relaxes between tier 1 and tier 2, pool
--     membership never does. For a Normal/Premium/Deluxe pack
--     (v_pack_definition_id is null) this check is always true, so
--     behavior there is unchanged from before curated pools
--     existed. If a Special Pack's entire pool is exhausted by
--     copy limits, the function raises the same "No eligible cards
--     remain for this player" exception it always has for any pack
--     type in that (practically impossible for a 200+ card pool)
--     situation, rather than ever stepping outside the pool.
-- ---------------------------------------------------------

create or replace function public.pick_shop_pack_card(
  target_profile_id uuid,
  target_rarity text,
  target_rotation_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pack_definition_id uuid;
  chosen_card_id uuid;
  current_league_id uuid;
begin
  select lm.league_id
  into current_league_id
  from public.league_members lm
  where lm.profile_id = target_profile_id
  limit 1;

  -- =======================================================
  -- SPECIAL PACK: resolve the purchased rotation straight to its
  -- curated pack pool - no theme_category / theme_value read here
  -- at all, since the pool membership check below is the entire
  -- special-pack filter now. Null for a Normal/Premium/Deluxe pack.
  -- =======================================================
  if target_rotation_id is not null then
    select rotation.pack_definition_id
    into v_pack_definition_id
    from public.shop_special_pack_rotations rotation
    where rotation.id = target_rotation_id;
  end if;

  -- =======================================================
  -- TIER 1: exact rolled rarity, and in-pool if this is a Special
  -- Pack pull (no-op pool check otherwise).
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and public.is_master_duel_offerable(card.master_duel_status)
    -- Boss-Route exclusion (Season 1 audit, corrected 2026-09-02):
    -- only a route's Stage 4 (final Boss) evolution monster is
    -- automatically excluded; Stage 1-3 evolution monsters are
    -- ordinary cards. Explicitly is_route_exclusive support grants
    -- are excluded at every stage.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = card.id
        and brs.stage_number = 4
    )
    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = card.id
        and brg.is_route_exclusive = true
    )
    and card.game_rarity = target_rarity
    and (
      select count(*)
      from public.card_instances instance
      where
        instance.card_catalog_id = card.id
        and (
          case
            when card.game_rarity = 'Legendary' then instance.league_id = current_league_id
            else instance.current_owner_id = target_profile_id
          end
        )
    ) < public.shop_card_copy_limit(card.game_rarity)
    -- Pool membership: mandatory for a Special Pack pull, a no-op
    -- for Normal/Premium/Deluxe (v_pack_definition_id is null).
    -- Never relaxed in tier 2 below either.
    and (
      v_pack_definition_id is null
      or exists (
        select 1
        from public.shop_special_pack_pool_cards spc
        where spc.pack_definition_id = v_pack_definition_id
          and spc.card_catalog_id = card.id
      )
    )
  order by random()
  limit 1;

  if chosen_card_id is not null then
    return chosen_card_id;
  end if;

  -- =======================================================
  -- TIER 2 (final fallback): rarity relaxed to "any" - pool
  -- membership (for a Special Pack) is NOT relaxed, matching the
  -- rule that a pull may never leave the purchased pack's curated
  -- pool. For a Normal/Premium/Deluxe pack this is simply "any
  -- eligible, non-Boss-Route card below its copy limit," unchanged
  -- from historical behavior.
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and public.is_master_duel_offerable(card.master_duel_status)
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = card.id
        and brs.stage_number = 4
    )
    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = card.id
        and brg.is_route_exclusive = true
    )
    and (
      select count(*)
      from public.card_instances instance
      where
        instance.card_catalog_id = card.id
        and (
          case
            when card.game_rarity = 'Legendary' then instance.league_id = current_league_id
            else instance.current_owner_id = target_profile_id
          end
        )
    ) < public.shop_card_copy_limit(card.game_rarity)
    and (
      v_pack_definition_id is null
      or exists (
        select 1
        from public.shop_special_pack_pool_cards spc
        where spc.pack_definition_id = v_pack_definition_id
          and spc.card_catalog_id = card.id
      )
    )
  order by random()
  limit 1;

  if chosen_card_id is null then
    raise exception 'No eligible cards remain for this player.';
  end if;

  return chosen_card_id;
end;
$function$;

revoke all on function public.pick_shop_pack_card(uuid, text, uuid) from public;
grant execute on function public.pick_shop_pack_card(uuid, text, uuid) to authenticated;

-- =========================================================
-- SECTION: 202609020960_fix_16_boss_route_stage_identities.sql
-- =========================================================

-- =========================================================
-- FIX-FORWARD: 16 BOSS ROUTE STAGE IDENTITY CORRECTIONS
--
-- WHY
-- The Season 1 audit correction pass (2026-09-02) found that
-- 202609011900_seed_boss_routes.sql's stage identities do not match
-- the authoritative "FINAL 20 BOSS STAGE IDENTITIES" design for 16
-- of the 20 routes. That seed migration is already deployed, so per
-- the fix-forward rule this migration corrects the data with new
-- UPDATE statements rather than editing the deployed seed file.
--
-- Dark Magician (dark_magician) is NOT included here - it was
-- already corrected by 202609020910_fix_dark_magician_and_cubic_route_data.sql
-- earlier in this same correction pass.
--
-- Cubic (cubic) is NOT included here - its evolution chain (Dark
-- Garnex -> Duza -> Buster Gundil -> Crimson Nova the Dark Cubic
-- Lord) is already identical to the final spec. Its unresolved
-- Stage 4 support card ("Crimson Nova Boss EX") does not exist in
-- the card catalog under that name and is intentionally left
-- unresolved per instruction - see the migration 202609020910 header
-- and the Season 1 correction report.
--
-- Dinosaur (dinosaur) is explicitly NOT touched. The final spec
-- flags Stage 4 as "verify the final approved Stage 4 against
-- project history before changing. Do NOT guess if source
-- conflicts" - this migration makes no changes to the dinosaur
-- route and the ambiguity is reported separately, unresolved.
--
-- Harpie (harpie) is explicitly NOT touched, in whole. Stages 1-3
-- of its final chain (Harpie Lady -> Harpie Channeler -> Harpie's
-- Pet Phantasmal Dragon) resolve to real card_catalog rows, but its
-- Stage 4 card, "Harpie's Pet Dragon - Fearsome Fire Blast", does
-- NOT exist in the catalog under that exact name (only the plain
-- "Harpie's Pet Dragon" exists, which is a different, non-equivalent
-- card and must not be silently substituted). Per the explicit rule
-- "For any final evolution card whose exact card_catalog row does
-- not exist: STOP for that individual route and report it. Do not
-- substitute a different card" - this STOPS the entire Harpie route,
-- not just its Stage 4, so Stages 1-3 are also left unchanged here
-- pending the user's decision. Reported separately, unresolved.
--
-- SAFETY - WHY THIS IS ONE UPDATE STATEMENT
-- boss_route_stages has a UNIQUE (route_id, evolution_card_catalog_id)
-- constraint. Several of these 16 routes reassign a card that is
-- CURRENTLY sitting at a different stage of the SAME route to a new
-- stage number (e.g. jinzo: the card currently at stage 2 ("Jinzo")
-- moves to stage 3; legendary_fisherman rotates three cards down one
-- stage each). Running these as separate UPDATE statements (or as
-- per-route statements that only partially overlap) risks a
-- transient uniqueness violation on the value that has not yet
-- moved. Postgres resolves this safely for a UNIQUE btree constraint
-- when every row that could conflict is updated by the SAME UPDATE
-- command - the conflict check does not see the old value of a row
-- also being changed by that command. This migration therefore
-- performs all 53 changed (route, stage) cells across all 16 routes
-- in exactly one UPDATE statement, sourced from one VALUES list, so
-- every rotation/swap is safe regardless of row order.
--
-- WHAT CHANGES (route: stage -> new evolution card)
--   chaos_bls            (Chaos / Black Luster Soldier): stage 1 -> D.D. Warrior, stage 2 -> D.D. Warrior Lady, stage 4 -> Black Luster Soldier - Envoy of the Beginning
--   elemental_hero       (Elemental HERO): stage 1 -> Elemental HERO Bubbleman, stage 2 -> Elemental HERO Blazeman, stage 3 -> Elemental HERO The Shining, stage 4 -> Elemental HERO Absolute Zero
--   blue_eyes            (Blue-Eyes): stage 1 -> Kaibaman, stage 3 -> Blue-Eyes Alternative White Dragon, stage 4 -> Blue-Eyes Jet Dragon
--   cyber_dragon         (Cyber Dragon): stage 1 -> Proto-Cyber Dragon, stage 2 -> Cyber Dragon, stage 3 -> Cyber Dragon Nova, stage 4 -> Cyber Dragon Infinity
--   jinzo                (Jinzo): stage 1 -> Jinzo - Returner, stage 2 -> Jinzo - Jector, stage 3 -> Jinzo, stage 4 -> Jinzo the Machine Menace
--   armed_dragon_ojama   (Chazz / Armed Dragon / Ojama): stage 4 -> Armed Dragon Thunder LV10
--   crystal_beast        (Crystal Beast): stage 3 -> Rainbow Dragon, stage 4 -> Rainbow Overdragon
--   red_eyes             (Red-Eyes): stage 1 -> Black Metal Dragon, stage 2 -> Red-Eyes Black Dragon, stage 3 -> Red-Eyes Flare Metal Dragon, stage 4 -> Meteor Black Comet Dragon
--   zombie               (Zombie): stage 3 -> Red-Eyes Zombie Dragon, stage 4 -> Doomking Balerdroch
--   legendary_fisherman  (Legendary Fisherman): stage 1 -> Warrior of Atlantis, stage 2 -> The Legendary Fisherman, stage 3 -> The Legendary Fisherman II, stage 4 -> The Legendary Fisherman III
--   machina              (Machina): stage 1 -> Machina Gearframe, stage 2 -> Machina Fortress, stage 3 -> Machina Citadel, stage 4 -> Machina Ruinforce
--   toon                 (Toon): stage 1 -> Toon Mermaid, stage 2 -> Toon Dark Magician Girl, stage 3 -> Toon Dark Magician, stage 4 -> Toon Black Luster Soldier
--   ancient_gear         (Ancient Gear): stage 1 -> Ancient Gear Hunting Hound, stage 2 -> Ancient Gear Golem, stage 3 -> Ultimate Ancient Gear Golem, stage 4 -> Chaos Ancient Gear Giant
--   galaxy_photon        (Galaxy / Photon): stage 3 -> Number 62: Galaxy-Eyes Prime Photon Dragon, stage 4 -> Number C62: Neo Galaxy-Eyes Prime Photon Dragon
--   destiny_hero         (Destiny HERO): stage 1 -> Destiny HERO - Diamond Dude, stage 2 -> Destiny HERO - Plasma, stage 3 -> Destiny HERO - Dystopia, stage 4 -> Destiny HERO - Destroyer Phoenix Enforcer
--   vampire              (Vampire): stage 1 -> Vampire Familiar, stage 2 -> Shadow Vampire, stage 3 -> Dhampir Vampire Sheridan, stage 4 -> The Zombie Vampire
--
-- dp_cost_to_reach is intentionally left untouched for every row -
-- the final spec does not redefine DP costs, only stage identities.
-- =========================================================

with target_values (route_code, stage_number, card_name) as (
  values
    ('chaos_bls', 1, 'D.D. Warrior'),
    ('chaos_bls', 2, 'D.D. Warrior Lady'),
    ('chaos_bls', 4, 'Black Luster Soldier - Envoy of the Beginning'),
    ('elemental_hero', 1, 'Elemental HERO Bubbleman'),
    ('elemental_hero', 2, 'Elemental HERO Blazeman'),
    ('elemental_hero', 3, 'Elemental HERO The Shining'),
    ('elemental_hero', 4, 'Elemental HERO Absolute Zero'),
    ('blue_eyes', 1, 'Kaibaman'),
    ('blue_eyes', 3, 'Blue-Eyes Alternative White Dragon'),
    ('blue_eyes', 4, 'Blue-Eyes Jet Dragon'),
    ('cyber_dragon', 1, 'Proto-Cyber Dragon'),
    ('cyber_dragon', 2, 'Cyber Dragon'),
    ('cyber_dragon', 3, 'Cyber Dragon Nova'),
    ('cyber_dragon', 4, 'Cyber Dragon Infinity'),
    ('jinzo', 1, 'Jinzo - Returner'),
    ('jinzo', 2, 'Jinzo - Jector'),
    ('jinzo', 3, 'Jinzo'),
    ('jinzo', 4, 'Jinzo the Machine Menace'),
    ('armed_dragon_ojama', 4, 'Armed Dragon Thunder LV10'),
    ('crystal_beast', 3, 'Rainbow Dragon'),
    ('crystal_beast', 4, 'Rainbow Overdragon'),
    ('red_eyes', 1, 'Black Metal Dragon'),
    ('red_eyes', 2, 'Red-Eyes Black Dragon'),
    ('red_eyes', 3, 'Red-Eyes Flare Metal Dragon'),
    ('red_eyes', 4, 'Meteor Black Comet Dragon'),
    ('zombie', 3, 'Red-Eyes Zombie Dragon'),
    ('zombie', 4, 'Doomking Balerdroch'),
    ('legendary_fisherman', 1, 'Warrior of Atlantis'),
    ('legendary_fisherman', 2, 'The Legendary Fisherman'),
    ('legendary_fisherman', 3, 'The Legendary Fisherman II'),
    ('legendary_fisherman', 4, 'The Legendary Fisherman III'),
    ('machina', 1, 'Machina Gearframe'),
    ('machina', 2, 'Machina Fortress'),
    ('machina', 3, 'Machina Citadel'),
    ('machina', 4, 'Machina Ruinforce'),
    ('toon', 1, 'Toon Mermaid'),
    ('toon', 2, 'Toon Dark Magician Girl'),
    ('toon', 3, 'Toon Dark Magician'),
    ('toon', 4, 'Toon Black Luster Soldier'),
    ('ancient_gear', 1, 'Ancient Gear Hunting Hound'),
    ('ancient_gear', 2, 'Ancient Gear Golem'),
    ('ancient_gear', 3, 'Ultimate Ancient Gear Golem'),
    ('ancient_gear', 4, 'Chaos Ancient Gear Giant'),
    ('galaxy_photon', 3, 'Number 62: Galaxy-Eyes Prime Photon Dragon'),
    ('galaxy_photon', 4, 'Number C62: Neo Galaxy-Eyes Prime Photon Dragon'),
    ('destiny_hero', 1, 'Destiny HERO - Diamond Dude'),
    ('destiny_hero', 2, 'Destiny HERO - Plasma'),
    ('destiny_hero', 3, 'Destiny HERO - Dystopia'),
    ('destiny_hero', 4, 'Destiny HERO - Destroyer Phoenix Enforcer'),
    ('vampire', 1, 'Vampire Familiar'),
    ('vampire', 2, 'Shadow Vampire'),
    ('vampire', 3, 'Dhampir Vampire Sheridan'),
    ('vampire', 4, 'The Zombie Vampire')
)
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from target_values tv
join public.boss_routes r on r.code = tv.route_code
join public.card_catalog c on c.name = tv.card_name
where brs.route_id = r.id
  and brs.stage_number = tv.stage_number;

-- =========================================================
-- POST-MIGRATION STRUCTURAL ASSERTION
-- =========================================================

do $verify$
declare
  v_expected int;
  v_actual int;
  v_mismatch record;
begin

  with target_values (route_code, stage_number, card_name) as (
    values
    ('chaos_bls', 1, 'D.D. Warrior'),
    ('chaos_bls', 2, 'D.D. Warrior Lady'),
    ('chaos_bls', 4, 'Black Luster Soldier - Envoy of the Beginning'),
    ('elemental_hero', 1, 'Elemental HERO Bubbleman'),
    ('elemental_hero', 2, 'Elemental HERO Blazeman'),
    ('elemental_hero', 3, 'Elemental HERO The Shining'),
    ('elemental_hero', 4, 'Elemental HERO Absolute Zero'),
    ('blue_eyes', 1, 'Kaibaman'),
    ('blue_eyes', 3, 'Blue-Eyes Alternative White Dragon'),
    ('blue_eyes', 4, 'Blue-Eyes Jet Dragon'),
    ('cyber_dragon', 1, 'Proto-Cyber Dragon'),
    ('cyber_dragon', 2, 'Cyber Dragon'),
    ('cyber_dragon', 3, 'Cyber Dragon Nova'),
    ('cyber_dragon', 4, 'Cyber Dragon Infinity'),
    ('jinzo', 1, 'Jinzo - Returner'),
    ('jinzo', 2, 'Jinzo - Jector'),
    ('jinzo', 3, 'Jinzo'),
    ('jinzo', 4, 'Jinzo the Machine Menace'),
    ('armed_dragon_ojama', 4, 'Armed Dragon Thunder LV10'),
    ('crystal_beast', 3, 'Rainbow Dragon'),
    ('crystal_beast', 4, 'Rainbow Overdragon'),
    ('red_eyes', 1, 'Black Metal Dragon'),
    ('red_eyes', 2, 'Red-Eyes Black Dragon'),
    ('red_eyes', 3, 'Red-Eyes Flare Metal Dragon'),
    ('red_eyes', 4, 'Meteor Black Comet Dragon'),
    ('zombie', 3, 'Red-Eyes Zombie Dragon'),
    ('zombie', 4, 'Doomking Balerdroch'),
    ('legendary_fisherman', 1, 'Warrior of Atlantis'),
    ('legendary_fisherman', 2, 'The Legendary Fisherman'),
    ('legendary_fisherman', 3, 'The Legendary Fisherman II'),
    ('legendary_fisherman', 4, 'The Legendary Fisherman III'),
    ('machina', 1, 'Machina Gearframe'),
    ('machina', 2, 'Machina Fortress'),
    ('machina', 3, 'Machina Citadel'),
    ('machina', 4, 'Machina Ruinforce'),
    ('toon', 1, 'Toon Mermaid'),
    ('toon', 2, 'Toon Dark Magician Girl'),
    ('toon', 3, 'Toon Dark Magician'),
    ('toon', 4, 'Toon Black Luster Soldier'),
    ('ancient_gear', 1, 'Ancient Gear Hunting Hound'),
    ('ancient_gear', 2, 'Ancient Gear Golem'),
    ('ancient_gear', 3, 'Ultimate Ancient Gear Golem'),
    ('ancient_gear', 4, 'Chaos Ancient Gear Giant'),
    ('galaxy_photon', 3, 'Number 62: Galaxy-Eyes Prime Photon Dragon'),
    ('galaxy_photon', 4, 'Number C62: Neo Galaxy-Eyes Prime Photon Dragon'),
    ('destiny_hero', 1, 'Destiny HERO - Diamond Dude'),
    ('destiny_hero', 2, 'Destiny HERO - Plasma'),
    ('destiny_hero', 3, 'Destiny HERO - Dystopia'),
    ('destiny_hero', 4, 'Destiny HERO - Destroyer Phoenix Enforcer'),
    ('vampire', 1, 'Vampire Familiar'),
    ('vampire', 2, 'Shadow Vampire'),
    ('vampire', 3, 'Dhampir Vampire Sheridan'),
    ('vampire', 4, 'The Zombie Vampire')
  )
  select count(*) into v_expected from target_values;

  if v_expected <> 53 then
    raise exception
      'BOSS ROUTE STAGE IDENTITY FIX ABORTED: expected 53 target rows, found %.', v_expected;
  end if;

  select count(*) into v_actual
  from (
    with target_values (route_code, stage_number, card_name) as (
      values
    ('chaos_bls', 1, 'D.D. Warrior'),
    ('chaos_bls', 2, 'D.D. Warrior Lady'),
    ('chaos_bls', 4, 'Black Luster Soldier - Envoy of the Beginning'),
    ('elemental_hero', 1, 'Elemental HERO Bubbleman'),
    ('elemental_hero', 2, 'Elemental HERO Blazeman'),
    ('elemental_hero', 3, 'Elemental HERO The Shining'),
    ('elemental_hero', 4, 'Elemental HERO Absolute Zero'),
    ('blue_eyes', 1, 'Kaibaman'),
    ('blue_eyes', 3, 'Blue-Eyes Alternative White Dragon'),
    ('blue_eyes', 4, 'Blue-Eyes Jet Dragon'),
    ('cyber_dragon', 1, 'Proto-Cyber Dragon'),
    ('cyber_dragon', 2, 'Cyber Dragon'),
    ('cyber_dragon', 3, 'Cyber Dragon Nova'),
    ('cyber_dragon', 4, 'Cyber Dragon Infinity'),
    ('jinzo', 1, 'Jinzo - Returner'),
    ('jinzo', 2, 'Jinzo - Jector'),
    ('jinzo', 3, 'Jinzo'),
    ('jinzo', 4, 'Jinzo the Machine Menace'),
    ('armed_dragon_ojama', 4, 'Armed Dragon Thunder LV10'),
    ('crystal_beast', 3, 'Rainbow Dragon'),
    ('crystal_beast', 4, 'Rainbow Overdragon'),
    ('red_eyes', 1, 'Black Metal Dragon'),
    ('red_eyes', 2, 'Red-Eyes Black Dragon'),
    ('red_eyes', 3, 'Red-Eyes Flare Metal Dragon'),
    ('red_eyes', 4, 'Meteor Black Comet Dragon'),
    ('zombie', 3, 'Red-Eyes Zombie Dragon'),
    ('zombie', 4, 'Doomking Balerdroch'),
    ('legendary_fisherman', 1, 'Warrior of Atlantis'),
    ('legendary_fisherman', 2, 'The Legendary Fisherman'),
    ('legendary_fisherman', 3, 'The Legendary Fisherman II'),
    ('legendary_fisherman', 4, 'The Legendary Fisherman III'),
    ('machina', 1, 'Machina Gearframe'),
    ('machina', 2, 'Machina Fortress'),
    ('machina', 3, 'Machina Citadel'),
    ('machina', 4, 'Machina Ruinforce'),
    ('toon', 1, 'Toon Mermaid'),
    ('toon', 2, 'Toon Dark Magician Girl'),
    ('toon', 3, 'Toon Dark Magician'),
    ('toon', 4, 'Toon Black Luster Soldier'),
    ('ancient_gear', 1, 'Ancient Gear Hunting Hound'),
    ('ancient_gear', 2, 'Ancient Gear Golem'),
    ('ancient_gear', 3, 'Ultimate Ancient Gear Golem'),
    ('ancient_gear', 4, 'Chaos Ancient Gear Giant'),
    ('galaxy_photon', 3, 'Number 62: Galaxy-Eyes Prime Photon Dragon'),
    ('galaxy_photon', 4, 'Number C62: Neo Galaxy-Eyes Prime Photon Dragon'),
    ('destiny_hero', 1, 'Destiny HERO - Diamond Dude'),
    ('destiny_hero', 2, 'Destiny HERO - Plasma'),
    ('destiny_hero', 3, 'Destiny HERO - Dystopia'),
    ('destiny_hero', 4, 'Destiny HERO - Destroyer Phoenix Enforcer'),
    ('vampire', 1, 'Vampire Familiar'),
    ('vampire', 2, 'Shadow Vampire'),
    ('vampire', 3, 'Dhampir Vampire Sheridan'),
    ('vampire', 4, 'The Zombie Vampire')
    )
    select 1
    from target_values tv
    join public.boss_routes r on r.code = tv.route_code
    join public.boss_route_stages brs
      on brs.route_id = r.id and brs.stage_number = tv.stage_number
    join public.card_catalog c on c.id = brs.evolution_card_catalog_id
    where c.name = tv.card_name
  ) matched;

  if v_actual <> v_expected then
    raise exception
      'BOSS ROUTE STAGE IDENTITY FIX ABORTED: % of % target (route, stage) cells do not match the final spec card after the update.', v_actual, v_expected;
  end if;

  -- Confirm Dinosaur and Harpie were left untouched (still pointing
  -- at their pre-existing seed cards, not silently altered).
  select r.code, brs.stage_number
    into v_mismatch
  from public.boss_routes r
  join public.boss_route_stages brs on brs.route_id = r.id
  join public.card_catalog c on c.id = brs.evolution_card_catalog_id
  where r.code = 'dinosaur'
    and brs.stage_number = 4
    and c.name <> 'Ultimate Conductor Tyranno';

  if found then
    raise exception
      'BOSS ROUTE STAGE IDENTITY FIX ABORTED: dinosaur stage 4 was unexpectedly modified.';
  end if;

  select r.code, brs.stage_number
    into v_mismatch
  from public.boss_routes r
  join public.boss_route_stages brs on brs.route_id = r.id
  join public.card_catalog c on c.id = brs.evolution_card_catalog_id
  where r.code = 'harpie'
    and (
      (brs.stage_number = 1 and c.name <> 'Harpie Lady') or
      (brs.stage_number = 2 and c.name <> 'Harpie Lady Sisters') or
      (brs.stage_number = 3 and c.name <> 'Harpie Queen') or
      (brs.stage_number = 4 and c.name <> 'Harpie''s Pet Dragon')
    );

  if found then
    raise exception
      'BOSS ROUTE STAGE IDENTITY FIX ABORTED: harpie route was unexpectedly modified.';
  end if;

  raise notice 'BOSS ROUTE STAGE IDENTITY FIX: 53 (route, stage) cells across 16 routes now match the final spec. dinosaur and harpie confirmed untouched.';
end $verify$;

-- =========================================================
-- SECTION: 202609020970_fix_draft_boss_route_stage4_only_exclusion.sql
-- =========================================================

-- =========================================================
-- FIX-FORWARD: DRAFT BOSS-ROUTE EXCLUSION - STAGE 4 ONLY
--
-- WHY
-- 202609011700_draft_boss_route_exclusion.sql (already deployed)
-- added a Boss-Route exclusion clause to create_next_draft_offer(),
-- but that clause excluded a card if it was the evolution monster
-- for ANY stage of ANY Boss Route (stage 1, 2, 3, or 4). The Season
-- 1 audit correction pass (2026-09-02) established the final
-- authoritative rule:
--
--   Normal Draft + Normal/Premium/Deluxe/Special Packs exclude:
--     A. every Stage 4 evolution monster
--     B. every boss_route_stage_grant where is_route_exclusive = true
--   Stage 1-3 evolution monsters are NOT automatically excluded -
--   they remain ordinary eligible cards for normal drafts/packs.
--
-- This over-excluded content: an eligible Stage 1-3 route card (for
-- example Berry Magician Girl, Dark Magician Girl, D.D. Warrior,
-- Blue-Eyes White Dragon, etc.) was being silently removed from
-- every Draft offer even though the final rule only requires
-- excluding Stage 4 bosses and explicitly-flagged route-exclusive
-- support cards.
--
-- This migration is a fix-forward, not an edit to the deployed
-- 202609011700 file: it CREATE OR REPLACEs create_next_draft_offer
-- with the same body, with `and brs.stage_number = 4` added to each
-- of the 7 boss-route-exclusion checks (6 per-rarity availability
-- counts + 1 final card-pick query), matching the same corrected
-- exclusion shape already applied to the Shop RPCs in
-- 202609020930_fix_shop_pack_boss_route_exclusion.sql and
-- 202609020950_special_pack_curated_pools_functions.sql. No other
-- logic in the function changes.
-- =========================================================

create or replace function public.create_next_draft_offer(
  target_draft_player_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_profile_id uuid;
  target_draft_id uuid;
  target_league_id uuid;

  completed_main integer;
  completed_fusion integer;
  completed_xyz integer;

  required_main integer;
  required_fusion integer;
  required_xyz integer;

  option_count integer;

  current_phase public.draft_phase;

  absolute_pick integer;
  phase_pick integer;

  new_offer_id uuid;
  existing_offer_id uuid;

  chosen_card_id uuid;
  option_index integer;

  rarity_weights jsonb;

  selected_rarity text;

  total_weight numeric;
  rarity_roll numeric;
  running_weight numeric;

  normal_available integer;
  rare_available integer;
  super_available integer;
  ultra_available integer;
  secret_available integer;
  legendary_available integer;

  normal_weight numeric;
  rare_weight numeric;
  super_weight numeric;
  ultra_weight numeric;
  secret_weight numeric;
  legendary_weight numeric;

  -- Draft fairness tracking (go-live spec section 12).
  v_secret_or_better_exposure integer;
  v_recent_offered_card_ids uuid[];
  v_min_exposure integer;
  v_max_exposure integer;
  v_offer_card_ids uuid[] := array[]::uuid[];
  v_combined_recent uuid[];
begin

  -- =====================================================
  -- PLAYER + DRAFT OPHALEN EN LOCKEN
  -- =====================================================

  select
    dp.profile_id,
    dp.draft_id,
    dp.main_picks_completed,
    dp.fusion_picks_completed,
    dp.xyz_picks_completed,
    dp.secret_or_better_exposure,
    dp.recent_offered_card_ids,

    d.league_id,
    d.main_picks_per_player,
    d.fusion_picks_per_player,
    d.xyz_picks_per_player,
    d.options_per_pick

  into
    player_profile_id,
    target_draft_id,
    completed_main,
    completed_fusion,
    completed_xyz,
    v_secret_or_better_exposure,
    v_recent_offered_card_ids,

    target_league_id,
    required_main,
    required_fusion,
    required_xyz,
    option_count

  from public.draft_players dp

  join public.drafts d
    on d.id = dp.draft_id

  where dp.id =
      target_draft_player_id

    and d.status =
      'active'

  for update of dp;


  if not found then
    raise exception
      'Active draft player not found';
  end if;


  -- Alleen speler zelf of league-admin mag
  -- een offer laten genereren.
  if player_profile_id <>
     (select auth.uid())

     and not public.is_league_admin(
       target_league_id
     )
  then
    raise exception
      'Unauthorized draft access';
  end if;


  -- =====================================================
  -- LEAGUE-WIDE DRAFT OFFER LOCK
  --
  -- Multiple players may draft at the same time, but offer
  -- generation for the shared league card pool is serialized
  -- for the duration of this transaction. This prevents two
  -- concurrent players from observing the same scarce card as
  -- available before either reservation becomes visible.
  -- =====================================================

  perform pg_advisory_xact_lock(
    hashtext('draft_offer_pool_' || target_league_id::text)
  );


  -- =====================================================
  -- BESTAAND ACTIEF OFFER?
  --
  -- Refresh mag nooit opnieuw rollen.
  -- =====================================================

  select id
  into existing_offer_id

  from public.draft_offers

  where draft_player_id =
      target_draft_player_id

    and status =
      'active'

  limit 1;


  if existing_offer_id is not null then
    return existing_offer_id;
  end if;


  -- =====================================================
  -- FASE BEPALEN
  -- =====================================================

  if completed_main <
     required_main
  then

    current_phase :=
      'main';

    phase_pick :=
      completed_main + 1;

    absolute_pick :=
      phase_pick;


  elsif completed_fusion <
        required_fusion
  then

    current_phase :=
      'fusion';

    phase_pick :=
      completed_fusion + 1;

    absolute_pick :=
      required_main
      + phase_pick;


  elsif completed_xyz <
        required_xyz
  then

    current_phase :=
      'xyz';

    phase_pick :=
      completed_xyz + 1;

    absolute_pick :=
      required_main
      + required_fusion
      + phase_pick;


  else

    update public.draft_players
    set
      status =
        'completed',

      completed_at =
        coalesce(
          completed_at,
          now()
        )

    where id =
      target_draft_player_id;


    raise exception
      'Draft already completed';

  end if;


  -- =====================================================
  -- RARITY WEIGHTS OPHALEN
  -- =====================================================

  select value
  into rarity_weights

  from public.settings

  where league_id =
      target_league_id

    and key =
      'draft.rarity_weights';


  rarity_weights :=
    coalesce(
      rarity_weights,
      '{
        "Normal": 56.0,
        "Rare": 28.0,
        "Super Rare": 11.0,
        "Ultra Rare": 3.5,
        "Secret Rare": 1.0,
        "Legendary": 0.5
      }'::jsonb
    );


  normal_weight :=
    coalesce(
      (rarity_weights ->> 'Normal')::numeric,
      56.0
    );

  rare_weight :=
    coalesce(
      (rarity_weights ->> 'Rare')::numeric,
      28.0
    );

  super_weight :=
    coalesce(
      (rarity_weights ->> 'Super Rare')::numeric,
      11.0
    );

  ultra_weight :=
    coalesce(
      (rarity_weights ->> 'Ultra Rare')::numeric,
      3.5
    );

  secret_weight :=
    coalesce(
      (rarity_weights ->> 'Secret Rare')::numeric,
      1.0
    );

  legendary_weight :=
    coalesce(
      (rarity_weights ->> 'Legendary')::numeric,
      0.5
    );


  -- =====================================================
  -- HOEVEEL KAARTEN ZIJN PER RARITY BESCHIKBAAR?
  --
  -- We tellen alleen kaarten mee die:
  --
  -- - in het Duelist Circle format zitten
  -- - bij de juiste fase horen
  -- - nog niet scarcity-capped zijn
  --
  -- Actieve draftoffers tellen als reservering.
  -- =====================================================


  -- ---------------- NORMAL ----------------

  select count(*)
  into normal_available

  from public.card_catalog c

  where
    c.format_eligible = true

    and public.is_master_duel_offerable(c.master_duel_status)

    -- Boss-Route exclusion (Season 1 audit correction,
    -- 2026-09-02): only the Stage 4 (final Boss) evolution monster
    -- of any route is automatically excluded from the normal draft
    -- pool - a Stage 1-3 evolution monster is an ordinary card once
    -- support can unlock at Stage 2/3 too (go-live spec section 11
    -- as corrected) and must stay draftable. Explicitly flagged
    -- is_route_exclusive support grants remain excluded at every
    -- stage. The original version of this clause (this same file,
    -- pre-correction) excluded EVERY stage's evolution monster,
    -- which was over-broad and has never been deployed against a
    -- seeded route in that broken form - see the audit report for
    -- the analysis.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = c.id
        and brs.stage_number = 4
    )

    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = c.id
        and brg.is_route_exclusive = true
    )

    and c.game_rarity =
      'Normal'

    and (
      (
        current_phase =
          'main'

        and lower(c.card_type)
          not like '%fusion%'

        and lower(c.card_type)
          not like '%xyz%'
      )

      or

      (
        current_phase =
          'fusion'

        and lower(c.card_type)
          like '%fusion%monster%'
      )

      or

      (
        current_phase =
          'xyz'

        and lower(c.card_type)
          like '%xyz%monster%'
      )
    )

    and (
      (
        select count(*)

        from public.card_instances ci

        where ci.league_id =
            target_league_id

          and ci.card_catalog_id =
            c.id
      )

      +

      (
        select count(*)

        from public.draft_offer_cards reserved

        join public.draft_offers reserved_offer
          on reserved_offer.id =
            reserved.offer_id

        join public.draft_players reserved_player
          on reserved_player.id =
            reserved_offer.draft_player_id

        join public.drafts reserved_draft
          on reserved_draft.id =
            reserved_player.draft_id

        where reserved.card_catalog_id =
            c.id

          and reserved_offer.status =
            'active'

          and reserved.status =
            'available'

          and reserved_draft.league_id =
            target_league_id
      )

    ) < public.card_copy_limit(
      c.id
    );


  -- ---------------- RARE ----------------

  select count(*)
  into rare_available

  from public.card_catalog c

  where
    c.format_eligible = true

    and public.is_master_duel_offerable(c.master_duel_status)

    -- Boss-Route exclusion (Season 1 audit correction,
    -- 2026-09-02): only the Stage 4 (final Boss) evolution monster
    -- of any route is automatically excluded from the normal draft
    -- pool - a Stage 1-3 evolution monster is an ordinary card once
    -- support can unlock at Stage 2/3 too (go-live spec section 11
    -- as corrected) and must stay draftable. Explicitly flagged
    -- is_route_exclusive support grants remain excluded at every
    -- stage. The original version of this clause (this same file,
    -- pre-correction) excluded EVERY stage's evolution monster,
    -- which was over-broad and has never been deployed against a
    -- seeded route in that broken form - see the audit report for
    -- the analysis.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = c.id
        and brs.stage_number = 4
    )

    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = c.id
        and brg.is_route_exclusive = true
    )

    and c.game_rarity =
      'Rare'

    and (
      (
        current_phase =
          'main'

        and lower(c.card_type)
          not like '%fusion%'

        and lower(c.card_type)
          not like '%xyz%'
      )

      or

      (
        current_phase =
          'fusion'

        and lower(c.card_type)
          like '%fusion%monster%'
      )

      or

      (
        current_phase =
          'xyz'

        and lower(c.card_type)
          like '%xyz%monster%'
      )
    )

    and (
      (
        select count(*)
        from public.card_instances ci

        where ci.league_id =
            target_league_id

          and ci.card_catalog_id =
            c.id
      )

      +

      (
        select count(*)

        from public.draft_offer_cards reserved

        join public.draft_offers reserved_offer
          on reserved_offer.id =
            reserved.offer_id

        join public.draft_players reserved_player
          on reserved_player.id =
            reserved_offer.draft_player_id

        join public.drafts reserved_draft
          on reserved_draft.id =
            reserved_player.draft_id

        where reserved.card_catalog_id =
            c.id

          and reserved_offer.status =
            'active'

          and reserved.status =
            'available'

          and reserved_draft.league_id =
            target_league_id
      )

    ) < public.card_copy_limit(
      c.id
    );


  -- ---------------- SUPER RARE ----------------

  select count(*)
  into super_available

  from public.card_catalog c

  where
    c.format_eligible = true

    and public.is_master_duel_offerable(c.master_duel_status)

    -- Boss-Route exclusion (Season 1 audit correction,
    -- 2026-09-02): only the Stage 4 (final Boss) evolution monster
    -- of any route is automatically excluded from the normal draft
    -- pool - a Stage 1-3 evolution monster is an ordinary card once
    -- support can unlock at Stage 2/3 too (go-live spec section 11
    -- as corrected) and must stay draftable. Explicitly flagged
    -- is_route_exclusive support grants remain excluded at every
    -- stage. The original version of this clause (this same file,
    -- pre-correction) excluded EVERY stage's evolution monster,
    -- which was over-broad and has never been deployed against a
    -- seeded route in that broken form - see the audit report for
    -- the analysis.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = c.id
        and brs.stage_number = 4
    )

    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = c.id
        and brg.is_route_exclusive = true
    )

    and c.game_rarity =
      'Super Rare'

    and (
      (
        current_phase =
          'main'

        and lower(c.card_type)
          not like '%fusion%'

        and lower(c.card_type)
          not like '%xyz%'
      )

      or

      (
        current_phase =
          'fusion'

        and lower(c.card_type)
          like '%fusion%monster%'
      )

      or

      (
        current_phase =
          'xyz'

        and lower(c.card_type)
          like '%xyz%monster%'
      )
    )

    and (
      (
        select count(*)
        from public.card_instances ci

        where ci.league_id =
            target_league_id

          and ci.card_catalog_id =
            c.id
      )

      +

      (
        select count(*)

        from public.draft_offer_cards reserved

        join public.draft_offers reserved_offer
          on reserved_offer.id =
            reserved.offer_id

        join public.draft_players reserved_player
          on reserved_player.id =
            reserved_offer.draft_player_id

        join public.drafts reserved_draft
          on reserved_draft.id =
            reserved_player.draft_id

        where reserved.card_catalog_id =
            c.id

          and reserved_offer.status =
            'active'

          and reserved.status =
            'available'

          and reserved_draft.league_id =
            target_league_id
      )

    ) < public.card_copy_limit(
      c.id
    );


  -- ---------------- ULTRA RARE ----------------

  select count(*)
  into ultra_available

  from public.card_catalog c

  where
    c.format_eligible = true

    and public.is_master_duel_offerable(c.master_duel_status)

    -- Boss-Route exclusion (Season 1 audit correction,
    -- 2026-09-02): only the Stage 4 (final Boss) evolution monster
    -- of any route is automatically excluded from the normal draft
    -- pool - a Stage 1-3 evolution monster is an ordinary card once
    -- support can unlock at Stage 2/3 too (go-live spec section 11
    -- as corrected) and must stay draftable. Explicitly flagged
    -- is_route_exclusive support grants remain excluded at every
    -- stage. The original version of this clause (this same file,
    -- pre-correction) excluded EVERY stage's evolution monster,
    -- which was over-broad and has never been deployed against a
    -- seeded route in that broken form - see the audit report for
    -- the analysis.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = c.id
        and brs.stage_number = 4
    )

    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = c.id
        and brg.is_route_exclusive = true
    )

    and c.game_rarity =
      'Ultra Rare'

    and (
      (
        current_phase =
          'main'

        and lower(c.card_type)
          not like '%fusion%'

        and lower(c.card_type)
          not like '%xyz%'
      )

      or

      (
        current_phase =
          'fusion'

        and lower(c.card_type)
          like '%fusion%monster%'
      )

      or

      (
        current_phase =
          'xyz'

        and lower(c.card_type)
          like '%xyz%monster%'
      )
    )

    and (
      (
        select count(*)
        from public.card_instances ci

        where ci.league_id =
            target_league_id

          and ci.card_catalog_id =
            c.id
      )

      +

      (
        select count(*)

        from public.draft_offer_cards reserved

        join public.draft_offers reserved_offer
          on reserved_offer.id =
            reserved.offer_id

        join public.draft_players reserved_player
          on reserved_player.id =
            reserved_offer.draft_player_id

        join public.drafts reserved_draft
          on reserved_draft.id =
            reserved_player.draft_id

        where reserved.card_catalog_id =
            c.id

          and reserved_offer.status =
            'active'

          and reserved.status =
            'available'

          and reserved_draft.league_id =
            target_league_id
      )

    ) < public.card_copy_limit(
      c.id
    );


  -- ---------------- SECRET RARE ----------------

  select count(*)
  into secret_available

  from public.card_catalog c

  where
    c.format_eligible = true

    and public.is_master_duel_offerable(c.master_duel_status)

    -- Boss-Route exclusion (Season 1 audit correction,
    -- 2026-09-02): only the Stage 4 (final Boss) evolution monster
    -- of any route is automatically excluded from the normal draft
    -- pool - a Stage 1-3 evolution monster is an ordinary card once
    -- support can unlock at Stage 2/3 too (go-live spec section 11
    -- as corrected) and must stay draftable. Explicitly flagged
    -- is_route_exclusive support grants remain excluded at every
    -- stage. The original version of this clause (this same file,
    -- pre-correction) excluded EVERY stage's evolution monster,
    -- which was over-broad and has never been deployed against a
    -- seeded route in that broken form - see the audit report for
    -- the analysis.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = c.id
        and brs.stage_number = 4
    )

    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = c.id
        and brg.is_route_exclusive = true
    )

    and c.game_rarity =
      'Secret Rare'

    and (
      (
        current_phase =
          'main'

        and lower(c.card_type)
          not like '%fusion%'

        and lower(c.card_type)
          not like '%xyz%'
      )

      or

      (
        current_phase =
          'fusion'

        and lower(c.card_type)
          like '%fusion%monster%'
      )

      or

      (
        current_phase =
          'xyz'

        and lower(c.card_type)
          like '%xyz%monster%'
      )
    )

    and (
      (
        select count(*)
        from public.card_instances ci

        where ci.league_id =
            target_league_id

          and ci.card_catalog_id =
            c.id
      )

      +

      (
        select count(*)

        from public.draft_offer_cards reserved

        join public.draft_offers reserved_offer
          on reserved_offer.id =
            reserved.offer_id

        join public.draft_players reserved_player
          on reserved_player.id =
            reserved_offer.draft_player_id

        join public.drafts reserved_draft
          on reserved_draft.id =
            reserved_player.draft_id

        where reserved.card_catalog_id =
            c.id

          and reserved_offer.status =
            'active'

          and reserved.status =
            'available'

          and reserved_draft.league_id =
            target_league_id
      )

    ) < public.card_copy_limit(
      c.id
    );


  -- ---------------- LEGENDARY ----------------

  select count(*)
  into legendary_available

  from public.card_catalog c

  where
    c.format_eligible = true

    and public.is_master_duel_offerable(c.master_duel_status)

    -- Boss-Route exclusion (Season 1 audit correction,
    -- 2026-09-02): only the Stage 4 (final Boss) evolution monster
    -- of any route is automatically excluded from the normal draft
    -- pool - a Stage 1-3 evolution monster is an ordinary card once
    -- support can unlock at Stage 2/3 too (go-live spec section 11
    -- as corrected) and must stay draftable. Explicitly flagged
    -- is_route_exclusive support grants remain excluded at every
    -- stage. The original version of this clause (this same file,
    -- pre-correction) excluded EVERY stage's evolution monster,
    -- which was over-broad and has never been deployed against a
    -- seeded route in that broken form - see the audit report for
    -- the analysis.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = c.id
        and brs.stage_number = 4
    )

    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = c.id
        and brg.is_route_exclusive = true
    )

    and c.game_rarity =
      'Legendary'

    and (
      (
        current_phase =
          'main'

        and lower(c.card_type)
          not like '%fusion%'

        and lower(c.card_type)
          not like '%xyz%'
      )

      or

      (
        current_phase =
          'fusion'

        and lower(c.card_type)
          like '%fusion%monster%'
      )

      or

      (
        current_phase =
          'xyz'

        and lower(c.card_type)
          like '%xyz%monster%'
      )
    )

    and (
      (
        select count(*)
        from public.card_instances ci

        where ci.league_id =
            target_league_id

          and ci.card_catalog_id =
            c.id
      )

      +

      (
        select count(*)

        from public.draft_offer_cards reserved

        join public.draft_offers reserved_offer
          on reserved_offer.id =
            reserved.offer_id

        join public.draft_players reserved_player
          on reserved_player.id =
            reserved_offer.draft_player_id

        join public.drafts reserved_draft
          on reserved_draft.id =
            reserved_player.draft_id

        where reserved.card_catalog_id =
            c.id

          and reserved_offer.status =
            'active'

          and reserved.status =
            'available'

          and reserved_draft.league_id =
            target_league_id
      )

    ) < public.card_copy_limit(
      c.id
    );


  -- =====================================================
  -- RARITIES ZONDER MINIMAAL 3 KAARTEN UITZETTEN
  --
  -- Als options_per_pick ooit via admin verandert,
  -- gebruiken we automatisch dat aantal.
  -- =====================================================

  if normal_available <
     option_count
  then
    normal_weight := 0;
  end if;


  if rare_available <
     option_count
  then
    rare_weight := 0;
  end if;


  if super_available <
     option_count
  then
    super_weight := 0;
  end if;


  if ultra_available <
     option_count
  then
    ultra_weight := 0;
  end if;


  if secret_available <
     option_count
  then
    secret_weight := 0;
  end if;


  if legendary_available <
     option_count
  then
    legendary_weight := 0;
  end if;


  -- =====================================================
  -- LEGENDARY IS NEVER OFFERED IN THE DRAFT
  --
  -- Go-live spec section 11: "NO Legendary in initial draft."
  -- Legendary cards are earned through packs/Luck and Boss Routes
  -- only. This overrides the availability-based weight entirely,
  -- not just when supply is short.
  -- =====================================================

  legendary_weight := 0;


  -- =====================================================
  -- DRAFT FAIRNESS: SOFT OUTLIER CORRECTION (main phase only)
  --
  -- Go-live spec section 12: limit extremes, don't identical-ify
  -- players. We track each player's cumulative count of Secret/
  -- Ultra offers this draft (secret_or_better_exposure) and only
  -- nudge weights for a player sitting at the exact low or high
  -- end of a genuinely wide spread (>= 2 offers apart) across the
  -- draft's players. A normal 1/2/2 or 2/2/3 spread never triggers
  -- this - it only catches a real 1/1/4-style extreme.
  -- =====================================================

  if current_phase = 'main' then

    select
      min(dp2.secret_or_better_exposure),
      max(dp2.secret_or_better_exposure)
    into
      v_min_exposure,
      v_max_exposure
    from public.draft_players dp2
    where dp2.draft_id = target_draft_id;

    if v_max_exposure - v_min_exposure >= 2 then

      if v_secret_or_better_exposure <= v_min_exposure then
        secret_weight := secret_weight * 1.6;
        ultra_weight := ultra_weight * 1.3;
      elsif v_secret_or_better_exposure >= v_max_exposure then
        secret_weight := secret_weight * 0.5;
        ultra_weight := ultra_weight * 0.7;
      end if;

    end if;

  end if;


  -- =====================================================
  -- EXTRA DECK TARGETING: 1 SUPER + 1 ULTRA OPPORTUNITY
  --
  -- Go-live spec section 13: each 2-pick Fusion/Xyz mini-phase
  -- should give the player one Super Rare-tier opportunity and one
  -- Ultra Rare-tier opportunity, and never a mechanically dead
  -- trio. Rather than leave this to the weighted roll, pick 1
  -- targets Super Rare and pick 2 targets Ultra Rare directly,
  -- cascading through the other non-Normal, non-Legendary tiers
  -- only if the target tier doesn't have enough cards this phase.
  -- Setting selected_rarity here makes every check in the general
  -- weighted roll below a no-op (they all guard on
  -- "selected_rarity is null"), so the main-phase roll logic is
  -- untouched.
  -- =====================================================

  if current_phase in ('fusion', 'xyz') then

    if phase_pick = 1 then

      if super_available >= option_count then
        selected_rarity := 'Super Rare';
      elsif ultra_available >= option_count then
        selected_rarity := 'Ultra Rare';
      elsif secret_available >= option_count then
        selected_rarity := 'Secret Rare';
      elsif rare_available >= option_count then
        selected_rarity := 'Rare';
      end if;

    else

      if ultra_available >= option_count then
        selected_rarity := 'Ultra Rare';
      elsif secret_available >= option_count then
        selected_rarity := 'Secret Rare';
      elsif super_available >= option_count then
        selected_rarity := 'Super Rare';
      elsif rare_available >= option_count then
        selected_rarity := 'Rare';
      end if;

    end if;

  end if;


  total_weight :=
      normal_weight
    + rare_weight
    + super_weight
    + ultra_weight
    + secret_weight
    + legendary_weight;


  if total_weight <= 0 then
    raise exception
      'No rarity has enough available cards for this draft phase';
  end if;


  -- =====================================================
  -- ÉÉN RARITY ROLL
  -- =====================================================

  rarity_roll :=
    random()
    * total_weight;

  running_weight := 0;


  running_weight :=
    running_weight
    + normal_weight;

  if selected_rarity is null
     and rarity_roll <
         running_weight
  then
    selected_rarity :=
      'Normal';
  end if;


  running_weight :=
    running_weight
    + rare_weight;

  if selected_rarity is null
     and rarity_roll <
         running_weight
  then
    selected_rarity :=
      'Rare';
  end if;


  running_weight :=
    running_weight
    + super_weight;

  if selected_rarity is null
     and rarity_roll <
         running_weight
  then
    selected_rarity :=
      'Super Rare';
  end if;


  running_weight :=
    running_weight
    + ultra_weight;

  if selected_rarity is null
     and rarity_roll <
         running_weight
  then
    selected_rarity :=
      'Ultra Rare';
  end if;


  running_weight :=
    running_weight
    + secret_weight;

  if selected_rarity is null
     and rarity_roll <
         running_weight
  then
    selected_rarity :=
      'Secret Rare';
  end if;


  if selected_rarity is null then
    selected_rarity :=
      'Legendary';
  end if;


  -- =====================================================
  -- OFFER OPSLAAN
  -- =====================================================

  insert into public.draft_offers (
    draft_player_id,
    pick_number,
    phase_pick_number,
    phase,
    status,
    rolled_rarity
  )
  values (
    target_draft_player_id,
    absolute_pick,
    phase_pick,
    current_phase,
    'active',
    selected_rarity
  )
  returning id
  into new_offer_id;


  -- Draft fairness: count this offer toward the player's cumulative
  -- Secret/Ultra exposure (main phase only - Extra Deck targeting
  -- above is already deterministic, not something to correct).
  if current_phase = 'main'
     and selected_rarity in ('Ultra Rare', 'Secret Rare')
  then
    update public.draft_players
    set secret_or_better_exposure = secret_or_better_exposure + 1
    where id = target_draft_player_id;
  end if;


  -- =====================================================
  -- 3 KAARTEN VAN EXACT DEZELFDE RARITY
  -- =====================================================

  for option_index
    in 1..option_count
  loop

    chosen_card_id :=
      null;


    select c.id
    into chosen_card_id

    from public.card_catalog c

    where
      c.format_eligible =
        true

      and public.is_master_duel_offerable(c.master_duel_status)

    -- Boss-Route exclusion (Season 1 audit correction,
    -- 2026-09-02): only the Stage 4 (final Boss) evolution monster
    -- of any route is automatically excluded from the normal draft
    -- pool - a Stage 1-3 evolution monster is an ordinary card once
    -- support can unlock at Stage 2/3 too (go-live spec section 11
    -- as corrected) and must stay draftable. Explicitly flagged
    -- is_route_exclusive support grants remain excluded at every
    -- stage. The original version of this clause (this same file,
    -- pre-correction) excluded EVERY stage's evolution monster,
    -- which was over-broad and has never been deployed against a
    -- seeded route in that broken form - see the audit report for
    -- the analysis.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = c.id
        and brs.stage_number = 4
    )

    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = c.id
        and brg.is_route_exclusive = true
    )

      and c.game_rarity =
        selected_rarity


      -- ================================================
      -- JUISTE FASE
      -- ================================================

      and (
        (
          current_phase =
            'main'

          and lower(c.card_type)
            not like '%fusion%'

          and lower(c.card_type)
            not like '%xyz%'
        )

        or

        (
          current_phase =
            'fusion'

          and lower(c.card_type)
            like '%fusion%monster%'
        )

        or

        (
          current_phase =
            'xyz'

          and lower(c.card_type)
            like '%xyz%monster%'
        )
      )


      -- ================================================
      -- GEEN DUPLICATE BINNEN DEZELFDE 3
      -- ================================================

      and not exists (
        select 1

        from public.draft_offer_cards same_offer

        where same_offer.offer_id =
            new_offer_id

          and same_offer.card_catalog_id =
            c.id
      )


      -- ================================================
      -- SCARCITY + ACTIEVE RESERVERINGEN
      -- ================================================

      and (
        (
          select count(*)

          from public.card_instances ci

          where ci.league_id =
              target_league_id

            and ci.card_catalog_id =
              c.id
        )

        +

        (
          select count(*)

          from public.draft_offer_cards reserved

          join public.draft_offers reserved_offer
            on reserved_offer.id =
              reserved.offer_id

          join public.draft_players reserved_player
            on reserved_player.id =
              reserved_offer.draft_player_id

          join public.drafts reserved_draft
            on reserved_draft.id =
              reserved_player.draft_id

          where reserved.card_catalog_id =
              c.id

            and reserved_offer.status =
              'active'

            and reserved.status =
              'available'

            and reserved_draft.league_id =
              target_league_id
        )

      ) < public.card_copy_limit(
        c.id
      )


    -- Light recent-offer penalty (spec section 12): a card shown
    -- in this player's last few trios sorts last, so it is only
    -- offered again when nothing fresher clears every other filter
    -- above. This is a soft ordering preference, not an exclusion.
    order by
      (
        v_recent_offered_card_ids is not null
        and c.id = any(v_recent_offered_card_ids)
      ) asc,
      random()

    limit 1;


    if chosen_card_id is null then
      raise exception
        'Unable to create % offer with enough available cards',
        selected_rarity;
    end if;


    insert into public.draft_offer_cards (
      offer_id,
      card_catalog_id,
      display_order,
      status
    )
    values (
      new_offer_id,
      chosen_card_id,
      option_index,
      'available'
    );

    v_offer_card_ids := v_offer_card_ids || chosen_card_id;

  end loop;


  -- Draft fairness: remember this trio in a short trailing window
  -- (last 9 offered card ids = last 3 trios) so future offers can
  -- softly avoid repeating them.
  v_combined_recent :=
    coalesce(v_recent_offered_card_ids, array[]::uuid[])
    || v_offer_card_ids;

  update public.draft_players
  set recent_offered_card_ids =
    v_combined_recent[
      greatest(1, array_length(v_combined_recent, 1) - 8)
      : array_length(v_combined_recent, 1)
    ]
  where id = target_draft_player_id;


  return new_offer_id;
end;
$$;

revoke all on function public.create_next_draft_offer(uuid) from public;
grant execute on function public.create_next_draft_offer(uuid) to authenticated;

-- =========================================================
-- POST-MIGRATION STRUCTURAL ASSERTION
-- =========================================================

do $verify$
declare
  v_src text;
  v_stage4_count int;
begin

  select p.prosrc into v_src
  from pg_proc p
  where p.proname = 'create_next_draft_offer'
  limit 1;

  if v_src is null then
    raise exception
      'DRAFT STAGE-4-ONLY EXCLUSION FIX ABORTED: create_next_draft_offer not found.';
  end if;

  if v_src not ilike '%boss_route_stages%' then
    raise exception
      'DRAFT STAGE-4-ONLY EXCLUSION FIX ABORTED: create_next_draft_offer no longer excludes route evolution monsters at all.';
  end if;

  if v_src not ilike '%boss_route_stage_grants%' then
    raise exception
      'DRAFT STAGE-4-ONLY EXCLUSION FIX ABORTED: create_next_draft_offer no longer excludes route-exclusive support grants.';
  end if;

  select count(*) into v_stage4_count
  from regexp_matches(v_src, 'brs\.stage_number\s*=\s*4', 'g');

  if v_stage4_count <> 7 then
    raise exception
      'DRAFT STAGE-4-ONLY EXCLUSION FIX ABORTED: expected exactly 7 occurrences of the stage_number = 4 restriction, found %.', v_stage4_count;
  end if;

  raise notice 'DRAFT STAGE-4-ONLY EXCLUSION FIX: create_next_draft_offer now excludes only Stage 4 boss evolution monsters (plus route-exclusive grants), matching the Shop RPCs.';
end $verify$;

-- =========================================================
-- SECTION: 202609020980_remove_chaos_bls_dd_warrior_lady_duplicate_grant.sql
-- =========================================================

-- =========================================================
-- FIX-FORWARD: remove chaos_bls's duplicate D.D. Warrior Lady
-- Stage 1 support grant (Season 1 audit, approved correction)
--
-- WHY
-- 202609020960_fix_16_boss_route_stage_identities.sql makes D.D.
-- Warrior Lady the chaos_bls Stage 2 EVOLUTION card. The already-
-- deployed seed (202609011900_seed_boss_routes.sql) also grants
-- D.D. Warrior Lady as a chaos_bls Stage 1 SUPPORT card (quantity
-- 1, is_route_exclusive = false). _boss_route_grant_stage() (see
-- 202609012000_boss_route_rpcs.sql) grants the Stage N evolution
-- card and every Stage N support grant as independent, unconditional
-- card_instances inserts with no de-duplication between the two -
-- so without this fix, a player advancing chaos_bls from Stage 1 to
-- Stage 2 would receive 2 separate copies of D.D. Warrior Lady (1
-- from the Stage 1 support grant, 1 from the Stage 2 evolution
-- grant), purely as a side effect of the stage-identity correction.
--
-- This migration removes only that one now-redundant Stage 1
-- support grant row. It does not touch any other chaos_bls support
-- card, does not touch any other route, and does not touch any
-- already-existing player's card_instances (a player who already
-- has D.D. Warrior Lady from a past Stage 1 grant keeps that card -
-- this only prevents a NEW double-grant going forward).
--
-- SAFETY
-- Single, narrowly-scoped DELETE keyed on the exact (route, stage,
-- card) triple. Fully idempotent - deleting an already-deleted row
-- is a no-op. Deploy this migration strictly after 202609020960 (so
-- the Stage 2 evolution reassignment is already in place) though the
-- DELETE itself does not actually depend on it having run.
-- =========================================================

delete from public.boss_route_stage_grants g
using public.boss_route_stages s, public.boss_routes r, public.card_catalog c
where g.stage_id = s.id
  and s.route_id = r.id
  and r.code = 'chaos_bls'
  and s.stage_number = 1
  and g.card_catalog_id = c.id
  and c.name = 'D.D. Warrior Lady';

do $verify$
declare
  v_remaining int;
begin
  select count(*)
  into v_remaining
  from public.boss_route_stage_grants g
  join public.boss_route_stages s on s.id = g.stage_id
  join public.boss_routes r on r.id = s.route_id
  join public.card_catalog c on c.id = g.card_catalog_id
  where r.code = 'chaos_bls'
    and s.stage_number = 1
    and c.name = 'D.D. Warrior Lady';

  if v_remaining <> 0 then
    raise exception
      'CHAOS_BLS DEDUP FIX ABORTED: D.D. Warrior Lady is still granted as chaos_bls Stage 1 support (% row(s)).', v_remaining;
  end if;

  raise notice 'CHAOS_BLS DEDUP FIX: D.D. Warrior Lady Stage 1 support grant removed - now granted exactly once, as the Stage 2 evolution card.';
end $verify$;

-- =========================================================
-- SECTION: 202609020990_fix_dinosaur_stage_identities.sql
-- =========================================================

-- =========================================================
-- FIX-FORWARD: Dinosaur route stage-identity correction (Season 1
-- audit - RESOLVED this round, previously explicitly held back)
--
-- WHY
-- The Dinosaur route was withheld from 202609020960 because the
-- final spec text only said "verify the final approved Stage 4
-- against project history before changing, do NOT guess if source
-- conflicts" - the exact Stage 4 identity was unresolved. This round
-- the full, final chain has been explicitly confirmed and approved:
--   Stage 1: Babycerasaurus              (unchanged)
--   Stage 2: Souleating Oviraptor        (was: Kabazauls)
--   Stage 3: Ultimate Conductor Tyranno  (was: Super Conductor Tyranno -
--                                         this is the route's OLD Stage 4
--                                         card, now confirmed to belong
--                                         at Stage 3 instead)
--   Stage 4: Transcendosaurus Gigantozowler (new - a real Fusion Monster,
--                                         compatible with this format's
--                                         Fusion/Xyz-only Extra Deck rule;
--                                         verified present in card_catalog
--                                         as a real, already-existing row -
--                                         not a new import, unlike Harpie's
--                                         Stage 4 card)
--
-- Both "Souleating Oviraptor" and "Transcendosaurus Gigantozowler"
-- were verified as exact, existing card_catalog rows before writing
-- this migration (unlike Harpie's Stage 4 card, no catalog import is
-- needed here).
--
-- SAFETY - WHY ONE STATEMENT
-- Stage 3's corrected card ("Ultimate Conductor Tyranno") is the
-- route's CURRENT Stage 4 card. Running these as separate per-stage
-- UPDATEs in Stage 1->4 order would hit boss_route_stages' UNIQUE
-- (route_id, evolution_card_catalog_id) constraint the moment Stage
-- 3 is set, since Stage 4 would not yet have moved off that value -
-- the same issue already identified and fixed for Dark Magician
-- (202609020910) and the other 16 routes (202609020960). This
-- migration uses the identical single multi-row UPDATE...FROM
-- (VALUES...) technique so Postgres only evaluates the constraint
-- against this statement's final state.
--
-- dp_cost_to_reach is left untouched - the spec does not redefine
-- DP costs for this route, only stage identities.
-- =========================================================

with target_values (stage_number, card_name) as (
  values
    (1, 'Babycerasaurus'),
    (2, 'Souleating Oviraptor'),
    (3, 'Ultimate Conductor Tyranno'),
    (4, 'Transcendosaurus Gigantozowler')
)
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from target_values tv
join public.boss_routes r on r.code = 'dinosaur'
join public.card_catalog c on c.name = tv.card_name
where brs.route_id = r.id
  and brs.stage_number = tv.stage_number;

do $verify$
declare
  v_actual int;
begin
  select count(*) into v_actual
  from (
    with target_values (stage_number, card_name) as (
      values
        (1, 'Babycerasaurus'),
        (2, 'Souleating Oviraptor'),
        (3, 'Ultimate Conductor Tyranno'),
        (4, 'Transcendosaurus Gigantozowler')
    )
    select 1
    from target_values tv
    join public.boss_routes r on r.code = 'dinosaur'
    join public.boss_route_stages brs
      on brs.route_id = r.id and brs.stage_number = tv.stage_number
    join public.card_catalog c on c.id = brs.evolution_card_catalog_id
    where c.name = tv.card_name
  ) matched;

  if v_actual <> 4 then
    raise exception
      'DINOSAUR STAGE IDENTITY FIX ABORTED: % of 4 target stage cells do not match the approved final chain.', v_actual;
  end if;

  raise notice 'DINOSAUR STAGE IDENTITY FIX: all 4 stages now match the approved final chain.';
end $verify$;

-- =========================================================
-- SECTION: 202609021000_import_harpies_pet_dragon_fearsome_fire_blast.sql
-- =========================================================

-- =========================================================
-- IMPORT: Harpie's Pet Dragon - Fearsome Fire Blast (Season 1
-- audit - Harpie route Stage 4, RESOLVED this round)
--
-- WHY
-- The Harpie route's final Stage 4 card really is this card - a
-- real, official Yu-Gi-Oh card (Dragon/Effect, WIND, Level 7,
-- 2000/2500 ATK/DEF, archetype "Harpie") - confirmed against
-- multiple independent card-database sources (Yugipedia,
-- YGOPRODeck, and Konami's own official Yu-Gi-Oh! Neuron database),
-- not against this app's local card-valuation snapshot, which does
-- NOT contain it. The problem was always that this specific card
-- had never been imported into this app's card_catalog, not that
-- the spec'd name was wrong or fictional - so per the "Stage 4 Boss
-- cards are explicitly allowed to be newer than the normal cardpool
-- cutoff" rule, it is imported here directly as a Boss-Route-only
-- card, rather than substituting the plain, older "Harpie's Pet
-- Dragon" (a different, non-equivalent real card).
--
-- Verified real metadata (OCG release 2021-05-21, TCG release
-- 2022-07-21; confirmed obtainable in Yu-Gi-Oh Master Duel at Super
-- Rare from the "Cosmic Ocean"/"Glory on Wings" secret packs, so
-- master_duel_status = 'unlimited' is accurate, not a guess):
--   Card type   : Effect Monster
--   Attribute   : WIND
--   Type/Race   : Dragon
--   Level       : 7
--   ATK / DEF   : 2000 / 2500
--   Archetype   : Harpie
--   Effect      : "Monsters cannot target Level 6 or lower 'Harpie'
--                 monsters for attacks. You can only use each of the
--                 following effects of this card once per turn. If
--                 you control a Level 6 or lower WIND monster: You
--                 can Special Summon this card from your hand in
--                 Defense Position. If this card is sent from the
--                 field to the GY: You can send 1 WIND Winged Beast
--                 monster from your Deck to the GY."
--   Printings   : Legendary Duelists: Season 3 (LDS3-EN138),
--                 Speed Duel: Battle City Finals (SBC2-ENH01) -
--                 among others; not an exhaustive print list.
--
-- external_card_id: RESOLVED, real passcode confirmed
-- Real passcode 04991081 (stored as bigint 4991081 - no leading
-- zero, matching this app's existing external_card_id convention
-- for every other card_catalog row). Independently re-confirmed
-- this round against YGOPRODeck's own card page (which surfaces the
-- passcode field directly) and cross-checked against Konami's
-- Yu-Gi-Oh! Neuron database entry (cid=16622), which matches this
-- card's name and full metadata exactly. The out-of-range 9-digit
-- placeholder used in the prior round has been fully replaced with
-- this real, verified value - no placeholder remains anywhere in
-- this migration.
--
-- format_eligible = false, with format_exclusion_reason set
-- (matching the existing Synchro-exclusion pattern in
-- 202608190005_draft_system.sql): this card is a 2021/2022 release,
-- after this format's normal era cutoff, so it would never earn
-- format_eligible = true through the ordinary recompute rule -
-- exactly the "newer than the normal cardpool cutoff" case the go-
-- live spec calls out. This is on top of, not instead of, the
-- existing Stage-4-evolution-monster exclusion already enforced in
-- Draft/Shop/Special Pack pulls (202609020930/202609020950/202609020970) -
-- belt and suspenders, not a replacement for that mechanism.
--
-- SAFETY
-- Single INSERT, guarded by NOT EXISTS on the exact name, so
-- re-running this migration after it has already succeeded is a
-- no-op rather than a duplicate-row error (external_card_id's own
-- UNIQUE constraint would also catch a re-run, but the NOT EXISTS
-- guard makes the intent explicit and keeps this migration safe to
-- re-run even if a human later corrects external_card_id in place).
-- =========================================================

insert into public.card_catalog (
  external_card_id,
  name,
  card_type,
  frame_type,
  monster_type,
  race,
  attribute,
  level,
  atk,
  def,
  description,
  archetype,
  set_information,
  source,
  format_eligible,
  format_exclusion_reason,
  game_rarity,
  rarity_needs_review,
  rarity_reason
)
select
  4991081,
  'Harpie''s Pet Dragon - Fearsome Fire Blast',
  'Effect Monster',
  'effect',
  'Dragon / Effect',
  'Dragon',
  'WIND',
  7,
  2000,
  2500,
  'Monsters cannot target Level 6 or lower "Harpie" monsters for attacks. You can only use each of the following effects of "Harpie''s Pet Dragon - Fearsome Fire Blast" once per turn. If you control a Level 6 or lower WIND monster: You can Special Summon this card from your hand in Defense Position. If this card is sent from the field to the GY: You can send 1 WIND Winged Beast monster from your Deck to the GY.',
  'Harpie',
  '[{"set_name": "Legendary Duelists: Season 3", "set_code": "LDS3-EN138"}, {"set_name": "Speed Duel: Battle City Finals", "set_code": "SBC2-ENH01"}]'::jsonb,
  'manual_import_verified',
  false,
  'Boss Route (Harpie) Stage 4 exclusive card - 2021/2022 release, after this format''s normal era cutoff; available only through boss_route_stages, never through Draft/Shop/Special Packs.',
  null,
  false,
  'Boss-Route-exclusive Stage 4 card - never enters the normal pack/draft rarity pool, so this app''s Duelist Circle rarity calibration does not apply and no review is needed.'
where not exists (
  select 1 from public.card_catalog
  where name = 'Harpie''s Pet Dragon - Fearsome Fire Blast'
);

do $verify$
declare
  v_id uuid;
  v_format_eligible boolean;
  v_external_card_id bigint;
begin
  select id, format_eligible, external_card_id
  into v_id, v_format_eligible, v_external_card_id
  from public.card_catalog
  where name = 'Harpie''s Pet Dragon - Fearsome Fire Blast';

  if v_id is null then
    raise exception
      'HARPIE CARD IMPORT ABORTED: Harpie''s Pet Dragon - Fearsome Fire Blast was not found in card_catalog after insert.';
  end if;

  if v_format_eligible is distinct from false then
    raise exception
      'HARPIE CARD IMPORT ABORTED: format_eligible is not false for the imported card - it would leak into normal Draft/Shop/Special Pack pulls.';
  end if;

  if v_external_card_id is distinct from 4991081 then
    raise exception
      'HARPIE CARD IMPORT ABORTED: external_card_id is % , expected the real verified passcode 4991081.', v_external_card_id;
  end if;

  raise notice 'HARPIE CARD IMPORT: Harpie''s Pet Dragon - Fearsome Fire Blast now exists in card_catalog (id %), format_eligible = false, external_card_id = 4991081 (real, verified passcode - no placeholder remains).', v_id;
end $verify$;

-- =========================================================
-- SECTION: 202609021010_fix_harpie_stage_identities.sql
-- =========================================================

-- =========================================================
-- FIX-FORWARD: Harpie route stage-identity correction (Season 1
-- audit - RESOLVED this round, previously fully blocked)
--
-- WHY
-- The Harpie route was withheld entirely from 202609020960 because
-- its Stage 4 card, "Harpie's Pet Dragon - Fearsome Fire Blast",
-- did not exist in card_catalog and the "stop the whole route,
-- don't substitute" rule applied to all 4 stages, not just Stage 4.
-- That card now exists (202609021000_import_harpies_pet_dragon_
-- fearsome_fire_blast.sql, which MUST run before this migration).
-- The full, final chain is now applied:
--   Stage 1: Harpie Lady                              (unchanged)
--   Stage 2: Harpie Channeler                         (was: Harpie Lady Sisters)
--   Stage 3: Harpie's Pet Phantasmal Dragon            (was: Harpie Queen)
--   Stage 4: Harpie's Pet Dragon - Fearsome Fire Blast (was: Harpie's Pet Dragon - newly imported)
--
-- SAFETY
-- None of the 3 new names collides with any of this route's other
-- current stage values, so there is no unique-constraint ordering
-- risk here the way there was for several other routes - still
-- written as one multi-row UPDATE...FROM (VALUES...) for consistency
-- with every other stage-identity fix this pass, not because this
-- specific route requires it.
--
-- dp_cost_to_reach is left untouched - the spec does not redefine
-- DP costs for this route, only stage identities.
-- =========================================================

with target_values (stage_number, card_name) as (
  values
    (1, 'Harpie Lady'),
    (2, 'Harpie Channeler'),
    (3, 'Harpie''s Pet Phantasmal Dragon'),
    (4, 'Harpie''s Pet Dragon - Fearsome Fire Blast')
)
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from target_values tv
join public.boss_routes r on r.code = 'harpie'
join public.card_catalog c on c.name = tv.card_name
where brs.route_id = r.id
  and brs.stage_number = tv.stage_number;

do $verify$
declare
  v_actual int;
begin
  select count(*) into v_actual
  from (
    with target_values (stage_number, card_name) as (
      values
        (1, 'Harpie Lady'),
        (2, 'Harpie Channeler'),
        (3, 'Harpie''s Pet Phantasmal Dragon'),
        (4, 'Harpie''s Pet Dragon - Fearsome Fire Blast')
    )
    select 1
    from target_values tv
    join public.boss_routes r on r.code = 'harpie'
    join public.boss_route_stages brs
      on brs.route_id = r.id and brs.stage_number = tv.stage_number
    join public.card_catalog c on c.id = brs.evolution_card_catalog_id
    where c.name = tv.card_name
  ) matched;

  if v_actual <> 4 then
    raise exception
      'HARPIE STAGE IDENTITY FIX ABORTED: % of 4 target stage cells do not match the approved final chain (did 202609021000 run first?).', v_actual;
  end if;

  raise notice 'HARPIE STAGE IDENTITY FIX: all 4 stages now match the approved final chain.';
end $verify$;

-- =========================================================
-- SECTION: 202609021020_special_pack_15_definitions_and_pools.sql
-- =========================================================

-- =========================================================
-- SPECIAL PACK REBUILD, PART 3: THE 15 APPROVED PACK DEFINITIONS
-- AND THEIR CURATED POOLS (Season 1 audit - approved this round
-- with 3 revisions: Psychic Frontier -> Energy Frontier (drops
-- Cyberse, adds Thunder+Pyro), Dragon's Roar drops Ojama as an
-- anchor, Stone Age drops Crystal Beast/Cubic as anchors)
--
-- WHY / METHOD
-- Every pool below was built from EXPLICIT PACKAGE RULES, never
-- `order by name limit N`: a fixed archetype allow-list and/or a
-- fixed card_catalog.race (Monster Type) allow-list per pack,
-- evaluated against the local card-valuation snapshot
-- (reports/card-valuation/2026-08-25T12-39-31-069Z/full-proposal.json,
-- filtered to format_eligible_proxy = true - the closest available
-- proxy for the live format_eligible flag, since this migration was
-- written with no live database connection). Every one of the 20
-- Boss Routes' Stage 4 evolution cards (post all corrections in this
-- pass, including the new Dinosaur and Harpie chains) and all 70
-- is_route_exclusive = true support grants were computed and
-- excluded from every pool BEFORE any pack was built - not
-- filtered out afterward.
--
-- Where a pack's raw matching pool exceeded its target range, it
-- was trimmed by descending relevance (draftValue, falling back to
-- power) from the local valuation snapshot's own scoring - never
-- alphabetically - and every card matched by a pack's own named
-- archetype list was preferred over generic Type filler during that
-- trim, so a pack's headline archetypes are never the first things
-- cut. Where a pack's raw pool fell short of a real booster-set feel
-- (Zombie Uprising, at 172-185 cards from Zombie-Type/Vampire alone),
-- the theme was broadened (Reptile-Type added) rather than accepted
-- narrow, per instruction.
--
-- This migration's per-pack pool sizes, type/rarity breakdowns, top
-- archetypes, and 10-card samples are reported in full in this
-- round's chat report, not duplicated here as comments (this file
-- would be enormous). The do $verify$ block at the end re-derives
-- the Stage-4/route-exclusive exclusion directly from
-- boss_route_stages/boss_route_stage_grants against the actually-
-- inserted shop_special_pack_pool_cards rows - a real, independent
-- safety check, not a re-statement of this migration's own python-
-- side computation.
--
-- LIVE-SAFETY RECONCILIATION (2026-09-02, pre-deploy review):
-- 'Lemon Magician Girl' and 'Chocolate Magician Girl' were
-- originally included in the arcane_circle pool below, computed
-- against 202609020910's ORIGINAL (buggy) is_route_exclusive =
-- false value for both. Production already has both cards manually
-- set to is_route_exclusive = true (202609020910 has been corrected
-- to match, see that file's own reconciliation note), which means
-- both cards are actually Boss-Route-exclusive and must not appear
-- in any Special Pack pool. Both have been removed from
-- arcane_circle's card list below (280 -> 278 cards); no other pack
-- referenced either card. The do $verify$ block's live
-- is_route_exclusive leak check would have caught this at deploy
-- time regardless (that check re-derives exclusivity from the live
-- boss_route_stage_grants table, not from this migration's own
-- assumptions) - this edit removes the leak at the source instead
-- of relying on the deploy-time check to merely detect it.
--
-- SAFETY
-- Every pack definition and every pool row uses on conflict do
-- nothing - re-running this migration never duplicates a pack or a
-- pool row. Slot linking (section 3) uses a plain UPDATE keyed on
-- (theme_category, slot_order), which is a safe no-op if that slot
-- row does not exist in the live shop_special_pack_slots table
-- (already the documented behavior of refresh_shop_special_pack_
-- rotation_if_needed for an unassigned slot - see 202609020950).
-- theme_category is now a purely structural rotation bucket, not a
-- description of the pool's filter (see 202609020950's own header
-- comment) - the assignment of packs 1-5 / 6-10 / 11-15 to
-- archetype / attribute / monster_type below is arbitrary and
-- carries no remaining semantic meaning.
-- =========================================================

-- ---------------------------------------------------------
-- 1. THE 15 PACK DEFINITIONS
-- ---------------------------------------------------------

insert into public.shop_special_pack_definitions (code, name, theme_description, display_order, is_active)
values ('chaos_shadows', 'Chaos & Shadows', 'DARK/Chaos monsters, banishment, and graveyard attrition - the Black Luster Soldier / Chaos lineage, the D.D. banish package, and a broad layer of Fiend-Type support (Archfiend, Dark World, and generic DARK removal/recursion cards).', 1, true)
on conflict (code) do update set
  name = excluded.name,
  theme_description = excluded.theme_description,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

insert into public.shop_special_pack_definitions (code, name, theme_description, display_order, is_active)
values ('arcane_circle', 'Arcane Circle', 'Classic Spellcaster magic-users - the Dark Magician lineage, Spellbook, Gravekeeper''s, and the format''s broader Spellcaster-Type support suite.', 2, true)
on conflict (code) do update set
  name = excluded.name,
  theme_description = excluded.theme_description,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

insert into public.shop_special_pack_definitions (code, name, theme_description, display_order, is_active)
values ('iron_legion', 'Iron Legion', 'The format''s largest Type, Machine - Cyber Dragon, Ancient Gear, Machina, Gadget, Geargia, and Jinzo, backed by the full breadth of generic Machine-Type monsters and support.', 3, true)
on conflict (code) do update set
  name = excluded.name,
  theme_description = excluded.theme_description,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

insert into public.shop_special_pack_definitions (code, name, theme_description, display_order, is_active)
values ('dragons_roar', 'Dragon''s Roar', 'Blue-Eyes- and Red-Eyes-adjacent Dragon support, Galaxy/Photon, Armed Dragon, and the format''s generic Dragon-Type monsters, Fusion/Xyz enablers, and support suite.', 4, true)
on conflict (code) do update set
  name = excluded.name,
  theme_description = excluded.theme_description,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

insert into public.shop_special_pack_definitions (code, name, theme_description, display_order, is_active)
values ('elemental_vanguard', 'Elemental Vanguard', 'The HERO archetypes - Elemental HERO, Destiny HERO, Evil HERO, Vision HERO, Masked HERO, Neo-Spacian - plus Fusion-support Spells/Traps and the format''s Warrior-Type monster pool.', 5, true)
on conflict (code) do update set
  name = excluded.name,
  theme_description = excluded.theme_description,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

insert into public.shop_special_pack_definitions (code, name, theme_description, display_order, is_active)
values ('zombie_uprising', 'Zombie Uprising', 'Type-wide undead: every eligible Zombie-Type archetype (including Vampire), broadened with Reptile-Type support to reach a real booster-set breadth rather than one narrow archetype.', 6, true)
on conflict (code) do update set
  name = excluded.name,
  theme_description = excluded.theme_description,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

insert into public.shop_special_pack_definitions (code, name, theme_description, display_order, is_active)
values ('stone_age', 'Stone Age', 'Rock- and Dinosaur-Type monsters, Type-wide - Jurrac, Dinowrestler, Chronomaly, and every other eligible archetype of either Type, without treating Crystal Beast or Cubic as thematic anchors.', 7, true)
on conflict (code) do update set
  name = excluded.name,
  theme_description = excluded.theme_description,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

insert into public.shop_special_pack_definitions (code, name, theme_description, display_order, is_active)
values ('winged_sovereigns', 'Winged Sovereigns', 'Winged Beast-Type, Type-wide - Harpie, Blackwing, Raidraptor, Simorgh, and the format''s broader Wind-aligned monster support.', 8, true)
on conflict (code) do update set
  name = excluded.name,
  theme_description = excluded.theme_description,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

insert into public.shop_special_pack_definitions (code, name, theme_description, display_order, is_active)
values ('aqua_depths', 'Aqua Depths', 'Aqua, Fish, and Sea Serpent Type-wide - Mermail, Atlantean, Gishki, and the format''s full WATER-aligned monster pool.', 9, true)
on conflict (code) do update set
  name = excluded.name,
  theme_description = excluded.theme_description,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

insert into public.shop_special_pack_definitions (code, name, theme_description, display_order, is_active)
values ('beast_kingdom', 'Beast Kingdom', 'Beast and Beast-Warrior Type-wide - Gladiator Beast, Naturia, Amazoness, Fire Fist, and the format''s broader Beast-aligned monster pool. No direct Boss Route tie-in.', 10, true)
on conflict (code) do update set
  name = excluded.name,
  theme_description = excluded.theme_description,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

insert into public.shop_special_pack_definitions (code, name, theme_description, display_order, is_active)
values ('six_samurai_warlords', 'Six Samurai & Warlords', 'The format''s classic non-HERO Warrior decks - Six Samurai foremost - plus the broader generic Warrior-Type monster pool, deliberately separate from Elemental Vanguard''s HERO focus.', 11, true)
on conflict (code) do update set
  name = excluded.name,
  theme_description = excluded.theme_description,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

insert into public.shop_special_pack_definitions (code, name, theme_description, display_order, is_active)
values ('sanctuary_fairies', 'Sanctuary of the Fairies', 'Fairy-Type, Type-wide - Madolche, Heraldic, Darklord, and the format''s full LIGHT-aligned Fairy monster pool. No direct Boss Route tie-in.', 12, true)
on conflict (code) do update set
  name = excluded.name,
  theme_description = excluded.theme_description,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

insert into public.shop_special_pack_definitions (code, name, theme_description, display_order, is_active)
values ('verdant_swarm', 'Verdant Swarm', 'Insect- and Plant-Type, Type-wide - Naturia, Predaplant, Sylvan, Inzektor, and the format''s two most overlooked Types given a real dedicated home.', 13, true)
on conflict (code) do update set
  name = excluded.name,
  theme_description = excluded.theme_description,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

insert into public.shop_special_pack_definitions (code, name, theme_description, display_order, is_active)
values ('fiends_domain', 'Fiend''s Domain', 'The format''s single largest Type, Fiend, Type-wide - Archfiend, Ghostrick, Dark World, Burning Abyss, Fabled, and the format''s full Fiend-Type monster pool.', 14, true)
on conflict (code) do update set
  name = excluded.name,
  theme_description = excluded.theme_description,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

insert into public.shop_special_pack_definitions (code, name, theme_description, display_order, is_active)
values ('energy_frontier', 'Energy Frontier', 'Psychic, Thunder, and Pyro Type-wide - Watt, Volcanic, Flamvell, Batteryman, and the format''s broader Psychic/Thunder/Pyro-aligned monster pool. Replaces the earlier Cyberse-anchored ''Psychic Frontier'' concept, which leaned too heavily on the Link era for this format.', 15, true)
on conflict (code) do update set
  name = excluded.name,
  theme_description = excluded.theme_description,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

-- ---------------------------------------------------------
-- 2. CURATED POOL MEMBERSHIP - one INSERT per pack, from an
--    explicit card name list (not a live query, not alphabetical).
-- ---------------------------------------------------------

-- Chaos & Shadows (240 cards)
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select
  (select id from public.shop_special_pack_definitions where code = 'chaos_shadows'),
  c.id
from public.card_catalog c
where c.name in (
    'D.D. Esper Star Sparrow',
    'D.D. Unicorn Knight',
    'Chaos Command Magician',
    'Chaos Valkyria',
    'Chaos End',
    'Chaos Space',
    'Chaos Betrayer',
    'D.D. Seeker',
    'Chaos Sorcerer',
    'D.D. Crow',
    'D.D. Warrior Lady',
    'D.D. Assailant',
    'D.D. Warrior',
    'Chaos Infinity',
    'Phantom of Chaos',
    'D.D. Telepon',
    'D.D. Patrol Plane',
    'Chaos Emperor Dragon - Envoy of the End',
    'Sphere of Chaos',
    'Chaos Trap Hole',
    'Phantasm Emperor Trilojig',
    'Chaos Daedalus',
    'Chaos Zone',
    'Number C9: Chaos Dyson Sphere',
    'Chaos Seed',
    'Number C6: Chronomaly Chaos Atlandis',
    'Chaos Hunter',
    'Tachyon Chaos Hole',
    'The Chaos Creator',
    'Number C5: Chaos Chimera Dragon',
    'D.D. Crazy Beast',
    'Chaos-End Master',
    'D.D. Survivor',
    'D.D. Guide',
    'Chaosrider Gustaph',
    'D.D. Designator',
    'D.D. Borderline',
    'Sargasso the D.D. Battlefield',
    'Rank-Up-Magic Argent Chaos Force',
    'D.D. Destroyer',
    'Chaos Burst',
    'D.D. Scout Plane',
    'Eternal Chaos',
    'D.D. Sprite',
    'Chaos Necromancer',
    'D.D. Trainer',
    'D.D.M. - Different Dimension Master',
    'D.D. Dynamite',
    'Marshalling Field',
    'D.D.R. - Different Dimension Reincarnation',
    'Witch Doctor of Chaos',
    'Rank-Up-Magic Quick Chaos',
    'D.D. Jet Iron',
    'Armityle the Chaos Phantasm',
    'Gemini Imps',
    'Darkness Neosphere',
    'Caius the Mega Monarch',
    'Ultimate Obedient Fiend',
    'Red-Eyes Archfiend of Lightning',
    'Garlandolf, King of Destruction',
    'Dark Spirit of Malice',
    'Reign-Beaux, Overlord of Dark World',
    'Brain Golem',
    'Holding Arms',
    'Dark Master - Zorc',
    'Evilswarm Exciton Knight',
    'Alich, Malebranche of the Burning Abyss',
    'Libic, Malebranche of the Burning Abyss',
    'Dark Lucius LV8',
    'Steelswarm Caucastag',
    'Skull Meister',
    'Ido the Supreme Magical Force',
    'Dark Spirit of Banishment',
    'The Wicked Eraser',
    'Shadowknight Archfiend',
    'Vilepawn Archfiend',
    'Element Doom',
    'Dark Hunter',
    'Grapha, Dragon Lord of Dark World',
    'Demise, Supreme King of Armageddon',
    'Archfiend Emperor, the First Lord of Horror',
    'Number 77: The Seven Sins',
    'Infernalqueen Archfiend',
    'Darkbishop Archfiend',
    'Poly-Chemicritter Dioxogre',
    'Tuning Gum',
    'Djinn Cursenchanter of Rituals',
    'Element Soldier',
    'Twin-Headed Wolf',
    'Curse Necrofear',
    'Ms. Judge',
    'Angmarl the Fiendish Monarch',
    'Desrook Archfiend',
    'Malicevorous Spoon',
    'Red Familiar',
    'The Suppression Pluto',
    'Dark Lucius LV4',
    'Tour Guide From the Underworld',
    'Abominable Unchained Soul',
    'Koa''ki Meiru Doom',
    'Demise, King of Armageddon',
    'Dark Lucius LV6',
    'Guardian Baou',
    'Obsessive Uvualoop',
    'Prufinesse, the Tactical Trapper',
    'Byser Shock',
    'Infernity General',
    'Terrorking Archfiend',
    'Eater of Millions',
    'Infernity Conjurer',
    'Serziel, Watcher of the Evil Eye',
    'Farfa, Malebranche of the Burning Abyss',
    'Rainbow Kuriboh',
    'Number 80: Rhapsody in Berserk',
    'The End of Anubis',
    'Magical Musketeer Wild',
    'Battle Fader',
    'Caius the Shadow Monarch',
    'Infernity Wildcat',
    'Prometheus, King of the Shadows',
    'Blue Duston',
    'Umbramirage the Elemental Lord',
    'Diskblade Rider',
    'Mirror Resonator',
    'D/D Pandora',
    'Santa Claws',
    'Plunder Patrollship Moerk',
    'Broww, Huntsman of Dark World',
    'Coach Goblin',
    'Flame Ogre',
    'Calcab, Malebranche of the Burning Abyss',
    'Number C80: Requiem in Berserk',
    'Capshell',
    'Steelswarm Longhorn',
    'Lesser Fiend',
    'Newdoria',
    'Tlakalel, His Malevolent Majesty',
    'Steelswarm Sting',
    'D/D Lamia',
    'Relinkuriboh',
    'Ghostrick Specter',
    'Tongue Twister',
    'Ghostrick Lantern',
    'Lava Golem',
    'D/D/D Dragon King Pendragon',
    'Kahkki, Guerilla of Dark World',
    'Kryuel',
    'Doom Donuts',
    'Gren, Tactician of Dark World',
    'Sinister Sprocket',
    'Archfiend Commander',
    'Holding Legs',
    'Sky Scourge Norleras',
    'Earthbound Immortal Ccapac Apu',
    'Scarm, Malebranche of the Burning Abyss',
    'Earthbound Greater Linewalker',
    'Gorz the Emissary of Darkness',
    'Grinder Golem',
    'Gishki Psychelone',
    'Dark Mimic LV3',
    'The Wicked Dreadroot',
    'Doomsday Horror',
    'Green Duston',
    'Wandering King Wildwind',
    'Steelswarm Girastag',
    'Yellow Duston',
    'Grave Squirmer',
    'Night Assailant',
    'Number 41: Bagooska the Terribly Tired Tapir',
    'Edge Imp Saw',
    'Evil HERO Infernal Prodigy',
    'Infernal Incinerator',
    'Archfiend Empress',
    'Tour Bus From the Underworld',
    'Magical Musketeer Kidbrave',
    'Wall of Illusion',
    'Number 60: Dugares the Timeless',
    'Koa''ki Meiru Valafar',
    'Number 65: Djinn Buster',
    'Snipe Hunter',
    'Fabled Gallabas',
    'Djinn Demolisher of Rituals',
    'Subterror Behemoth Speleogeist',
    'Bluebeard, the Plunder Patroll Shipwright',
    'The Masked Beast',
    'Sangan',
    'Fiendish Rhino Warrior',
    'Dotedotengu',
    'Grave Protector',
    'Archfiend''s Awakening',
    'Magical Musketeer Caspar',
    'Belial - Marquis of Darkness',
    'Evil HERO Malicious Edge',
    'Red Mirror',
    'Supay',
    'Emissary from Pandemonium',
    'Tragoedia',
    'Infernity Guardian',
    'Catoblepas, Familiar of the Evil Eye',
    'Fire Cracker',
    'Black Potan',
    'Magical Musket Mastermind Zakiel',
    'Danger! Chupacabra!',
    'Unchained Twins - Sarama',
    'Medusa, Watcher of the Evil Eye',
    'Red Blossoms from Underroot',
    'Mad Reloader',
    'Dragon Seeker',
    'Performapal Kuribohble',
    'Bearblocker',
    'Unchained Twins - Aruha',
    'Fabled Grimro',
    'Archfiend General',
    'Unchained Twins - Rakea',
    'Doomdog Octhros',
    'Barrier Resonator',
    'Infernity Archfiend',
    'Snoww, Unlight of Dark World',
    'Clock Resonator',
    'Edge Imp Chain',
    'Cagna, Malebranche of the Burning Abyss',
    'Illusory Snatcher',
    'Ahrima, the Wicked Warden',
    'Radian, the Multidimensional Kaiju',
    'Zera the Mant',
    'Giant Kozaky',
    'Trance Archfiend',
    'Infernity Avenger',
    'Ogre of the Scarlet Sorrow',
    'Stygian Street Patrol',
    'Xyz Avenger',
    'Goldd, Wu-Lord of Dark World',
    'Stray Asmodian',
    'Lucent, Netherlord of Dark World',
    'Infinity Dark',
    'Latinum, Exarch of Dark World',
    'Sillva, Warlord of Dark World',
    'Dark Necrofear',
    'Reshef the Dark Being',
    'Viser Des'
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Arcane Circle (280 cards)
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select
  (select id from public.shop_special_pack_definitions where code = 'arcane_circle'),
  c.id
from public.card_catalog c
where c.name in (
    'Dark Magician of Chaos',
    'Prophecy Destroyer',
    'Gravekeeper''s Watcher',
    'Spellbook of Fate',
    'World of Prophecy',
    'Dark Burning Attack',
    'Dark Magic Inheritance',
    'Magician Navigation',
    'Dark Burning Magic',
    'Spellbook of Life',
    'Chaos Scepter Blast',
    'Gravekeeper''s Oracle',
    'Magicians'' Combination',
    'The Grand Spellbook Tower',
    'Magician''s Robe',
    'Imperial Tombs of Necrovalley',
    'Spellbook of Knowledge',
    'Thousand Knives',
    'Spellbook Library of the Heliosphere',
    'Wheel of Prophecy',
    'Apprentice Illusion Magician',
    'Reaper of Prophecy',
    'Palladium Oracle Mahad',
    'Spellbook Star Hall',
    'Dark Magician',
    'Hidden Spellbook',
    'The Transmigration Prophecy',
    'Magician of Black Chaos',
    'Necrovalley Throne',
    'Spellbook of Judgment',
    'Spellbook of Power',
    'Charm of Shabti',
    'Gravekeeper''s Descendant',
    'Gravekeeper''s Commandant',
    'Gravekeeper''s Recruiter',
    'Emperor of Prophecy',
    'Gravekeeper''s Guard',
    'Gravekeeper''s Spear Soldier',
    'Gravekeeper''s Spiritualist',
    'Spellbook of Secrets',
    'Spellbook Library of the Crescent',
    'Gravekeeper''s Stele',
    'Spellbook Magician of Prophecy',
    'Stoic of Prophecy',
    'Magician of Chaos',
    'Spellbook of Wisdom',
    'Spellbook Organization',
    'Gravekeeper''s Servant',
    'Secrets of Dark Magic',
    'Gravekeeper''s Vassal',
    'Gravekeeper''s Curse',
    'Charioteer of Prophecy',
    'Gravekeeper''s Assailant',
    'Hermit of Prophecy',
    'Gravekeeper''s Heretic',
    'Strength of Prophecy',
    'Dark Magician Girl',
    'Dark Magic Curtain',
    'Black Magic Ritual',
    'Gravekeeper''s Ambusher',
    'Magician of Dark Illusion',
    'Gravekeeper''s Nobleman',
    'Magic Formula',
    'Amores of Prophecy',
    'Justice of Prophecy',
    'Magicians'' Souls',
    'Spellbook of Eternity',
    'Sage''s Stone',
    'Magician''s Rod',
    'Gravekeeper''s Priestess',
    'Gravekeeper''s Visionary',
    'Necrovalley Temple',
    'Royal Tribute',
    'Spellbook of the Master',
    'Spellbook of Miracles',
    'Miracle Restoring',
    'Fool of Prophecy',
    'Gravekeeper''s Spy',
    'Temperance of Prophecy',
    'Soul Servant',
    'Skilled Dark Magician',
    'Gravekeeper''s Cannonholder',
    'Bond Between Teacher and Student',
    'Illusion Magic',
    'Empress of Prophecy',
    'Knight''s Title',
    'The Eye of Timaeus',
    'Dark Cavalry',
    'Dark Paladin',
    'Gravekeeper''s Headman',
    'Gravekeeper''s Chief',
    'Dark Magic Twin Burst',
    'Rite of Spirit',
    'Dark Magician Girl the Dragon Knight',
    'Dark Magician the Dragon Knight',
    'Amulet Dragon',
    'Dark Sage',
    'Gravekeeper''s Supernaturalist',
    'Dark Flare Knight',
    'Dogmatika Fleurdelis, the Knighted',
    'Great Dezard',
    'Witchcrafter Madame Verre',
    'Morgan, the Enchantress of Avalon',
    'High Priestess of Prophecy',
    'Norito the Moral Leader',
    'Nekroz of Valkyrus',
    'Secret Sect Druid Dru',
    'Doom Shaman',
    'Performapal Sky Pupil',
    'Magical Broker',
    'Eccentric Boy',
    'Altergeist Kunquery',
    'Legendary Flame Lord',
    'Time Wizard',
    'Fairy Tail - Luna',
    'Effect Veiler',
    'Chaos Command Magician',
    'Matriarch of Nephthys',
    'Dogmatika Maximus',
    'Wiz, Sage Fur Hire',
    'Doomstar Magician',
    'Ebon Illusion Magician',
    'Nekroz of Unicore',
    'Gagagaga Magician',
    'Sand Gambler',
    'Endymion, the Master Magician',
    'Performage Flame Eater',
    'Performapal Sky Magician',
    'Lyla, Twilightsworn Enchantress',
    'Angraecum Umbrella',
    'Elemental Grace Doriado',
    'Ice Master',
    'Delg the Dark Monarch',
    'Gambler of Legend',
    'Chaos Sorcerer',
    'Subterror Fiendess',
    'Blast Magician',
    'Magical Marionette',
    'SPYGAL Misty',
    'Lyla, Lightsworn Sorceress',
    'Anarchist Monk Ranshin',
    'Clear Effector',
    'Zoroa, the Magistus of Flame',
    'Witchcrafter Golem Aruru',
    'Master with Eyes of Blue',
    'Fortune Fairy Swee',
    'Miracle Flipper',
    'Evilswarm Kerykeion',
    'Mathematician',
    'Star Drawing',
    'Fortune Lady Wind',
    'Defender of Nephthys',
    'Disciple of Nephthys',
    'Hannibal Necromancer',
    'Breaker the Magical Warrior',
    'Fortune Lady Fire',
    'Frontier Wiseman',
    'Card Ejector',
    'Toon Masked Sorcerer',
    'Divine Grace - Northwemko',
    'Featherizer',
    'Witchcrafter Pittore',
    'Masked Sorcerer',
    'Tuning Magician',
    'Fortune Fairy Ann',
    'Devotee of Nephthys',
    'Dogmatika Theo, the Iron Punch',
    'Fortune Lady Water',
    'Strategist of the Ice Barrier',
    'Royal Magical Library',
    'Number 78: Number Archive',
    'Fortune Fairy Chee',
    'Chronicler of Nephthys',
    'Jester Confit',
    'Disenchanter',
    'Super Quantum Green Layer',
    'Sorciere de Fleur',
    'Priestess with Eyes of Blue',
    'Dogmatika Ecclesia, the Virtuous',
    'Great Sorcerer of the Nekroz',
    'Familiar-Possessed - Dharc',
    'Familiar-Possessed - Lyna',
    'Madolche Butlerusk',
    'Dogmatika Adin, the Enlightened',
    'Wynn the Wind Channeler',
    'Ghostrick Socuteboss',
    'Witch of the Black Forest',
    'Madolche Marmalmaide',
    'Fortune Lady Past',
    'Magidog',
    'Fairy Tail - Snow',
    'Blue Dragon Summoner',
    'Gagaga Head',
    'Fortune Fairy Hu',
    'Cosmo Queen',
    'Hexe Trude',
    'Aleister the Invoker',
    'Kiwi Magician Girl',
    'Trance the Magic Swordsman',
    'Megistric Maginician',
    'Lumina, Twilightsworn Shaman',
    'Ghostrick Fairy',
    'Damage Mage',
    'Toon Dark Magician',
    'Berry Magician Girl',
    'Violet Witch',
    'Galaxy Mirror Sage',
    'Altergeist Multifaker',
    'Number 83: Galaxy Queen',
    'Altergeist Silquitous',
    'Fairy Tail - Rella',
    'Lightray Madoor',
    'Endymion, the Magistus of Mastery',
    'Impcantation Bookstone',
    'Dimension Shifter',
    'Mei-Kou, Master of Barriers',
    'Old Vindictive Magician',
    'Mysterious Guard',
    'Madolche Magileine',
    'Windwitch - Glass Bell',
    'SPYRAL Master Plan',
    'Element Magician',
    'Kazejin',
    'Number 11: Big Eye',
    'Windwitch - Ice Bell',
    'R-Genex Oracle',
    'Engraver of the Mark',
    'Breaker the Dark Magical Warrior',
    'Legion the Fiend Jester',
    'Magical Something',
    'Shaddoll Dragon',
    'Crusader of Endymion',
    'Maiden with Eyes of Blue',
    'Magical Exemplar',
    'Minerva, Lightsworn Maiden',
    'Extra Veiler',
    'The Stern Mystic',
    'Oracle of the Sun',
    'Altergeist Meluseek',
    'Ebon High Magician',
    'Genex Doctor',
    'Emissary of the Oasis',
    'Apprentice Magician',
    'The Unhappy Girl',
    'Magic Hand',
    'Sunny Pixie',
    'Performage Hat Tricker',
    'Supreme Arcanite Magician',
    'Stardust Phantom',
    'Genex Blastfan',
    'Familiar-Possessed - Wynn',
    'Shaddoll Beast',
    'Familiar-Possessed - Eria',
    'Familiar-Possessed - Hiita',
    'Familiar-Possessed - Aussa',
    'Fortune Lady Dark',
    'Spellstone Sorcerer Karood',
    'Eidos the Underworld Squire',
    'Herald of Creation',
    'Synchro Fusionist',
    'Ebon Magician Curran',
    'Pixie Knight',
    'Lady of D.',
    'Medium of the Ice Barrier',
    'Allure Queen LV7',
    'Witchcrafter Schmietta',
    'Magician''s Valkyria',
    'Red Sparrow Summoner',
    'Rapid-Fire Magician',
    'Kycoo the Ghost Destroyer',
    'Invitation to a Dark Sleep',
    'Maiden of Macabre',
    'The Tricky',
    'White Magician Pikeru',
    'Droll & Lock Bird',
    'Dance Princess of the Ice Barrier',
    'Maha Vailo',
    'Merlin'
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Iron Legion (300 cards)
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select
  (select id from public.shop_special_pack_definitions where code = 'iron_legion'),
  c.id
from public.card_catalog c
where c.name in (
    'Everlasting Alloy',
    'Cyber Network',
    'Machina Citadel',
    'Cyberse Gadget',
    'Cyber Energy Shock',
    'Machina Overdrive',
    'Ancient Gear Reactor Dragon',
    'Geargiano Mk-III',
    'Ancient Gear Hydra',
    'Spell Gear',
    'Machina Fortress',
    'Machina Air Raider',
    'Ancient Gear Factory',
    'Cosmos Channelling',
    'Machina Irradiator',
    'Geargiano',
    'Jinzo - Lord',
    'Machina Megaform',
    'Geargiattacker',
    'Evolution Burst',
    'Jinzo',
    'Cybernetic Overflow',
    'Machina Metalcruncher',
    'Cyber Dragon Nova',
    'Machina Defense Perimeter',
    'Ancient Gear Box',
    'Machina Peacekeeper',
    'Cyber Repair Plant',
    'Machina Force',
    'Psychic Wave',
    'Cybernetic Hidden Technology',
    'Geargiauger',
    'Jinzo - Layered',
    'Ancient Gear Wyvern',
    'Psychic Bounder',
    'Ancient Gear Gadjiltron Chimera',
    'Cyber Revsystem',
    'Machina Possesstorage',
    'Cyber Dragon Vier',
    'Armored Cybern',
    'Yellow Gadget',
    'Green Gadget',
    'Red Gadget',
    'Silver Gadget',
    'Machina Redeployment',
    'Gold Gadget',
    'Unauthorized Bootup Device',
    'Cyber Dragon',
    'Cyber Dragon Core',
    'Cyber Pharos',
    'Cyberload Fusion',
    'Law of the Cosmos',
    'Cyber Dragon Herz',
    'Geargiaccelerator',
    'Geargiarmor',
    'Jinzo #7',
    'Ancient Gear Gadget',
    'Gadget Soldier',
    'Machina Sniper',
    'Machina Soldier',
    'Ancient Gear Catapult',
    'Cyber Dragon Nachster',
    'Geargianchor',
    'Gadget Hauler',
    'Cyber Dragon Zwei',
    'Cyber Dragon Drei',
    'Ancient Gear Fist',
    'Ancient Gear Tank',
    'Machina Cannon',
    'Ancient Gear Fusion',
    'Proto-Cyber Dragon',
    'Gadget Driver',
    'Jinzo - Returner',
    'Machina Resavenger',
    'Jinzo - Jector',
    'Ancient Gear Workshop',
    'Gadget Arms',
    'Cyber Emergency',
    'Boot-Up Soldier - Dread Dynamo',
    'Machina Defender',
    'Geargiagear',
    'Geargia Change',
    'Commander Covington',
    'Ancient Gear Drill',
    'Psychic Megacyber',
    'Stronghold the Moving Fortress',
    'Ancient Gear Explosive',
    'Geargiano Mk-II',
    'Geargiarsenal',
    'Cybernetic Revolution',
    'Photon Generator Unit',
    'Ancient Gear Reborn',
    'Attack Reflector Unit',
    'Cross-Dimensional Duel',
    'Gear Gigant X',
    'Cyber Eternity Dragon',
    'Ancient Gear Howitzer',
    'Drytron Meteonis Quadrantids',
    'Junkuriboh',
    'Orbital Hydralander',
    'Crystron Rion',
    'Armoroid',
    'Desperado Barrel Dragon',
    'Delta Tri',
    'Genex Ally Reliever',
    'Flying Pegasus Railroad Stampede',
    'Snow Plow Hustle Rustle',
    'Genex Ally Birdman',
    'Aegaion the Sea Castrum',
    'Super Anti-Kaiju War Machine Mecha-Thunder-King',
    'Crystron Citree',
    'Crystron Quan',
    'Skypalace Gangaridai',
    'Number C40: Gimmick Puppet of Dark Strings',
    'Infinitrack Tunneller',
    'Ally of Justice Nullfier',
    'Bri Synchron',
    'Superheavy Samurai Soulbang Cannon',
    'Arcjet Lightcraft',
    'Buster Blaster',
    'Goldilocks the Battle Landscaper',
    'Vic Viper T301',
    'T.G. Halberd Cannon/Assault Mode',
    'B.E.S. Big Core MK-3',
    'A-Team: Trap Disposal Unit',
    'Black Salvo',
    'Phantom Fortress Enterblathnir',
    'Crystron Thystvern',
    'Number C1: Numeron Chaos Gate Sunya',
    'B.E.S. Tetran',
    'Quillbolt Hedgehog',
    'Super Express Bullet Train',
    'Crystron Smiger',
    'Super Quantal Mech King Great Magnus',
    'Powered Crawler',
    'World Legacy - "World Crown"',
    'Superheavy Samurai Flutist',
    'Infinitrack Brutal Dozer',
    'Cracking Dragon',
    'Mecha Phantom Beast Coltwing',
    'Number 9: Dyson Sphere',
    'Gizmek Orochi, the Serpentron Sky Slasher',
    'Snowman Creator',
    'Carrierroid',
    'Hyper Synchron',
    'Mecha Phantom Beast Aerosguin',
    'Gimmick Puppet Twilight Joker',
    'Superheavy Samurai Soulshield Wall',
    'Kozmo Dark Destroyer',
    'Card Trooper',
    'Oilman',
    'Gizmek Makami, the Ferocious Fanged Fortress',
    'Kozmo Landwalker',
    'Helping Robo for Combat',
    'Ally of Justice Omni-Weapon',
    'Cyber Phoenix',
    'Victory Viper XX03',
    'Fantastic Striborg',
    'B.E.S. Blaster Cannon Core',
    'B.E.S. Covered Core',
    'Constellar Ptolemy M7',
    'Cyber Valley',
    'World Legacy - "World Armor"',
    'Drytron Meteonis Draconids',
    'Cyber Raider',
    'Divine Arsenal AA-ZEUS - Sky Thunder',
    'Chronomaly Nebra Disk',
    'Cyber Eltanin',
    'Gizmek Kaku, the Supreme Shining Sky Stag',
    'Blowback Dragon',
    'Shreddder',
    'Tuningware',
    'D.D. Patrol Plane',
    'Crystron Prasiortle',
    'Jet Synchron',
    'Heavy Freight Train Derricrane',
    'Gimmick Puppet Dreary Doll',
    'Morphtronic Remoten',
    'Drill Synchron',
    'Crystron Rosenix',
    'Scrap Recycler',
    'Orichalcos Shunoros',
    'Blast Juggler',
    'Kozmo Forerunner',
    'Photon Pirate',
    'Number 81: Superdreadnought Rail Cannon Super Dora',
    'Lord British Space Fighter',
    'Stealthroid',
    'Genex Army',
    'Roulette Barrel',
    'Time Thief Chronocorder',
    'Boot-Up Admiral - Destroyer Dynamo',
    'Sphere of Chaos',
    'Swift Scarecrow',
    'Nitro Synchron',
    'Spell Canceller',
    'Cyber Dinosaur',
    'Infinitrack Crab Crane',
    'F.A. Dark Dragster',
    'Infinitrack Drag Shovel',
    'Shovel Crusher',
    'Digvorzhak, King of Heavy Industry',
    'Number 40: Gimmick Puppet of Strings',
    'Number 88: Gimmick Puppet of Leo',
    'Superdreadnought Rail Cannon Juggernaut Liebe',
    'Mecha Phantom Beast Dracossack',
    'World Legacy - "World Lance"',
    'Genex Ally Solid',
    'B-Buster Drake',
    'Ruffian Railcar',
    'Superheavy Samurai Soulbreaker Armor',
    'Photon Orbital',
    'Starship Spy Plane',
    'Synchron Explorer',
    'Magical Hound',
    'Crystron Sulfefnir',
    'Morphtronic Celfon',
    'Mecha Phantom Beast Sabre Hawk',
    'Malefic Cyber End Dragon',
    'Jade Knight',
    'R-Genex Ultimum',
    'Morphtronic Staplen',
    'Wind-Up Carrier Zenmaity',
    'B.E.S. Big Core MK-2',
    'Number C9: Chaos Dyson Sphere',
    'CXyz Skypalace Babylon',
    'Morphtronic Boomboxen',
    'Cyber Ouroboros',
    'Speedroid CarTurbo',
    'B.E.S. Crystal Core',
    'SPYRAL Quik-Fix',
    'Biofalcon',
    'Minefieldriller',
    'Superdreadnought Rail Cannon Gustav Max',
    'World Legacy - "World Ark"',
    'Ally of Justice Thunder Armor',
    'Summon Reactor SK',
    'Emes the Infinity',
    'Speedroid Rubberband Plane',
    'Perfect Machine King',
    'Fusilier Dragon, the Dual-Mode Beast',
    'Genex Neutron',
    'Fiendish Engine Omega',
    'Toon Barrel Dragon',
    'Drill Driver Vespenato',
    'Superheavy Samurai Gigagloves',
    'Orcust Knightmare',
    'Barrel Dragon',
    'Cyber-Tech Alligator',
    'Speedroid Skull Marbles',
    'Vylon Cube',
    'Number C6: Chronomaly Chaos Atlandis',
    'Morphtronic Cameran',
    'B.E.S. Big Core',
    'Time Thief Regulator',
    'Drytron Delta Altais',
    'Ally of Justice Cyclone Creator',
    'Mecha Phantom Beast Stealthray',
    'Super Defense Robot Lio',
    'Ally of Justice Cosmic Gateway',
    'Trifortressops',
    'Turbo Booster',
    'Dekoichi the Battlechanted Locomotive',
    'Karakuri Watchdog mdl 313 "Saizan"',
    'Genex Solar',
    'Morphtronic Slingen',
    'Infinitrack River Stormer',
    'Speedroid Terrortop',
    'Superheavy Samurai Wagon',
    'Galaxy Soldier',
    'Ally Mind',
    'Falchion Beta',
    'Karakuri Ninja mdl 339 "Sazank"',
    'Mecha Phantom Beast Blue Impala',
    'Genex Ally Bellflame',
    'Infinitrack Anchor Drill',
    'Junk Giant',
    'Reflect Bounder',
    'Jumbo Drill',
    'Blast Sphere',
    'Gizmek Yata, the Gleaming Vanguard',
    'Wind-Up Arsenal Zenmaioh',
    'Mixeroid',
    'Mecha Sea Dragon Plesion',
    'Vylon Pentachloro',
    'Number C15: Gimmick Puppet Giant Hunter',
    'Appliancer Socketroll',
    'Superheavy Samurai Thief',
    'BM-4 Blast Spider',
    'Scanner',
    'C-Crush Wyvern',
    'A-Assault Core',
    'Monster Express',
    'Union Driver',
    'Superheavy Samurai Blue Brawler',
    'Karakuri Barrel mdl 96 "Shinkuro"',
    'Gyroid',
    'Construction Train Signal Red',
    'Synchro Magnet',
    'Morphtronic Boarden'
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Dragon's Roar (260 cards)
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select
  (select id from public.shop_special_pack_definitions where code = 'dragons_roar'),
  c.id
from public.card_catalog c
where c.name in (
    'Dark Armed Dragon',
    'Armed Dragon LV7',
    'Armed Dragon LV10',
    'Tachyon Transmigration',
    'Photon Wyvern',
    'Galaxy-Eyes Photon Dragon',
    'Photon Veil',
    'Photon Vanisher',
    'Armed Dragon LV5',
    'Photon Pirate',
    'Number 62: Galaxy-Eyes Prime Photon Dragon',
    'Photon Leo',
    'Ojama Pajama',
    'Photon Orbital',
    'Number 95: Galaxy-Eyes Dark Matter Dragon',
    'Galaxy-Eyes Full Armor Photon Dragon',
    'Metaphys Armed Dragon',
    'Photon Trident',
    'Galaxy Trance',
    'Kuriphoton',
    'Ojamatch',
    'Photon Crusher',
    'Photon Slasher',
    'Photon Thrasher',
    'Photon Token',
    'Paladin of Photon Dragon',
    'Luminous Dragon Ritual',
    'Photon Lead',
    'Photon Booster',
    'Galaxy Zero',
    'Photon Sabre Tiger',
    'Photon Circle',
    'Photon Change',
    'Armed Dragon LV3',
    'Photon Chargeman',
    'Photon Papilloperative',
    'Photon Sanctuary',
    'Photon Hand',
    'Photon Advancer',
    'Galaxy Expedition',
    'Accellight',
    'Orbital 7',
    'Dimension Wanderer',
    'Photon Current',
    'Photon Caesar',
    'Galaxy Knight',
    'Photon Lizard',
    'Starliege Photon Blast Dragon',
    'Galaxy-Eyes Cloudragon',
    'Photon Satellite',
    'Tachyon Spiral Galaxy',
    'Galaxy Brave',
    'Cyber Laser Dragon',
    'Lillybot',
    'Starliege Lord Galaxion',
    'Twin Photon Lizard',
    'Noctovision Dragon',
    'Blue-Eyes Shining Dragon',
    'White Night Dragon',
    'Fantastical Dragon Phantazmay',
    'Judgment Dragon',
    'Tidal, Dragon Ruler of Waterfalls',
    'World Chalice Guardragon',
    'Amorphactor Pain, the Imagination Dracoverlord',
    'Punishment Dragon',
    'Hieratic Dragon of Sutekh',
    'Iron Dragon Tiamaton',
    'Nebula Dragon',
    'Darkstorm Dragon',
    'Redox, Dragon Ruler of Boulders',
    'Tempest, Dragon Ruler of Storms',
    'Prime Material Dragon',
    'World Legacy Guardragon Mardark',
    'Rafale, Champion Fur Hire',
    'Queen Dragun Djinn',
    'Evilswarm Ouroboros',
    'Metalrokket Dragon',
    'Galaxy Dragon',
    'Odd-Eyes Advance Dragon',
    'Dragonmaid Ernus',
    'Debris Dragon',
    'Deep-Eyes White Dragon',
    'Anesthrokket Dragon',
    'Lightray Diabolos',
    'Arkbrave Dragon',
    'World Chalice Guardragon Almarduke',
    'Dragon Queen of Tragic Endings',
    'Rokket Synchron',
    'Dragonmaid Lorpar',
    'Dragonmaid Nudyarl',
    'Dark Armed, the Dragon of Annihilation',
    'Koa''ki Meiru Maximus',
    'Galactic Spiral Dragon',
    'Silverrokket Dragon',
    'Number 91: Thunder Spark Dragon',
    'Heraldic Beast Aberconway',
    'Curse of Dragon, the Cursed Dragon',
    'Trishula, the Dragon of Icy Imprisonment',
    'Genesis Dragon',
    'Xyz-Raypierce',
    'Saffira, Queen of Dragons',
    'Number 99: Utopic Dragon',
    'Pandemic Dragon',
    'Darkflare Dragon',
    'Feedran, the Winds of Mischief',
    'Dragonmaid Tinkhec',
    'Guardragon Promineses',
    'Defrag Dragon',
    'Seleglare the Luminous Lunar Dragon',
    'Chamber Dragonmaid',
    'Kitchen Dragonmaid',
    'Shelrokket Dragon',
    'Eclipse Wyvern',
    'Triggering Wurm',
    'Kaiser Glider',
    'Odd-Eyes Absolute Dragon',
    'Poly-Chemicritter Hydragon',
    'Cyberdark Cannon',
    'Awakening of the Possessed - Rasenryu',
    'Dragon Spirit of White',
    'Gravi-Crush Dragon',
    'Five-Headed Dragon',
    'Magna-Slash Dragon',
    'Evilswarm Zahak',
    'Dragon Knight Draco-Equiste',
    'Dragonecro Nethersoul Dragon',
    'DMZ Dragon',
    'Chaos Dragon Levianeer',
    'Gandora-X the Dragon of Demolition',
    'Chaos Emperor Dragon - Envoy of the End',
    'Krystal Dragon',
    'Dark Horus',
    'Omni Dragon Brotaur',
    'Dragunity Arma Leyvaten',
    'Jormungardr the Nordic Serpent',
    'Blue-Eyes Chaos MAX Dragon',
    'Hieratic Sun Dragon Overlord of Heliopolis',
    'Odd-Eyes Saber Dragon',
    'Borreload eXcharge Dragon',
    'Chobham Armor Dragon',
    'Dragonic Knight',
    'Blue-Eyes White Dragon',
    'Starliege Seyfert',
    'Blue-Eyes Alternative White Dragon',
    'Aether, the Empowering Dragon',
    'Laundry Dragonmaid',
    'Parlor Dragonmaid',
    'Lightpulsar Dragon',
    'Stardust Dragon/Assault Mode',
    'Red-Eyes Darkness Metal Dragon',
    'Wattaildragon',
    'Malefic Rainbow Dragon',
    'Evolzar Dolkka',
    'Blue-Eyes Chaos Dragon',
    'Checksum Dragon',
    'Hibernation Dragon',
    'Strong Wind Dragon',
    'Malefic Paradigm Dragon',
    'Number 97: Draglubion',
    'Totem Dragon',
    'Guardragon Garmides',
    'Meteor Dragon Red-Eyes Impact',
    'Absorouter Dragon',
    'Snowdust Dragon',
    'Odd-Eyes Dragon',
    'Yamata Dragon',
    'Dwarf Star Dragon Planeter',
    'Different Dimension Dragon',
    'Rabidragon',
    'Armed Protector Dragon',
    'Tri-Horned Dragon',
    'Seiyaryu',
    'Poki Draco',
    'Flamvell Dragnov',
    'Dread Dragon',
    'Greedy Venom Fusion Dragon',
    'Dragunity Arma Mystletainn',
    'Magnarokket Dragon',
    'Exploderokket Dragon',
    'Autorokket Dragon',
    'Majester Paladin, the Ascending Dracoslayer',
    'Sniffer Dragon',
    'Speedburst Dragon',
    'Black Dragon Collapserpent',
    'White Dragon Wyverburster',
    'Evilswarm Ophion',
    'White Rose Dragon',
    'Interplanetarypurplythorny Dragon',
    'Phantom Dragon',
    'Gaia Dragon, the Thunder Charger',
    'Rokket Tracer',
    'Dark Rebellion Xyz Dragon',
    'Hieratic Dragon of Su',
    'Hieratic Dragon of Nebthet',
    'Divine Dragon - Excelion',
    'Dragon Core Hexer',
    'Darkest Diabolos, Lord of the Lair',
    'Spear Dragon',
    'Vanguard of the Dragon',
    'Dragonic Guard',
    'Guardragon Andrake',
    'Handcuffs Dragon',
    'Chthonian Emperor Dragon',
    'Ranryu',
    'Hieratic Dragon of Tefnuit',
    'Odd-Eyes Vortex Dragon',
    'Linkbelt Wall Dragon',
    'Kabuki Dragon',
    'Hundred Dragon',
    'Red-Eyes Black Flare Dragon',
    'Leng Ling',
    'Harpie''s Pet Baby Dragon',
    'Red Rose Dragon',
    'Rider of the Storm Winds',
    'Evolzar Laggia',
    'Soldier Dragons',
    'Gragonith, Lightsworn Dragon',
    'Red-Eyes Baby Dragon',
    'Hieratic Dragon of Gebeb',
    'Dragunity Pilum',
    'Number C5: Chaos Chimera Dragon',
    'Destrudo the Lost Dragon''s Frisson',
    'Trigon',
    'Nurse Dragonmaid',
    'Kidmodo Dragon',
    'Mahaama the Fairy Dragon',
    'Overflow Dragon',
    'Magna Drago',
    'Des Volstgalph',
    'Lancer Lindwurm',
    'Bright Star Dragon',
    'White-Horned Dragon',
    'Ten Thousand Dragon',
    'Powered Tuner',
    'Twin-Headed Behemoth',
    'Rare Metal Dragon',
    'Darkblaze Dragon',
    'Lava Dragon',
    'Lancer Dragonute',
    'Radius, the Half-Moon Dragon',
    'Hieratic Dragon of Eset',
    'Lord of the Red',
    'Schwarzschild Limit Dragon',
    'Snow Dragon',
    'Red-Eyes Toon Dragon',
    'Ancient Dragon',
    'Vice Dragon',
    'Cave Dragon',
    'Tiger Dragon',
    'Element Dragon',
    'Axe Dragonute',
    'Flamvell Grunika',
    'Dweller in the Depths',
    'Red-Eyes Flare Metal Dragon',
    'Delta Flyer',
    'Blizzard Dragon',
    'Curse of Dragonfire',
    'Subterror Guru',
    'Gateway Dragon',
    'Tyrant Dragon'
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Elemental Vanguard (250 cards)
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select
  (select id from public.shop_special_pack_definitions where code = 'elemental_vanguard'),
  c.id
from public.card_catalog c
where c.name in (
    'Destiny HERO - Drawhand',
    'NEXT',
    'Vision HERO Witch Raider',
    'Wrath of Neos',
    'Destiny HERO - Plasma',
    'Cyclone Boomerang',
    'Destiny HERO - Departed',
    'Destiny HERO - Dreadmaster',
    'Destiny HERO - Doom Lord',
    'Destiny HERO - Dark Angel',
    'Vision HERO Vyon',
    'Feather Wind',
    'Evil Mind',
    'Fifth Hope',
    'Elemental HERO Bubbleman',
    'Destiny HERO - Disk Commander',
    'Space Gift',
    'Convert Contact',
    'Cyclone Blade',
    'Neos Force',
    'Evil HERO Infernal Prodigy',
    'Destiny HERO - Dread Servant',
    'Destiny HERO - Celestial',
    'Elemental HERO Ice Edge',
    'Miracle Contact',
    'D - Fortune',
    'Fake Hero',
    'Evil HERO Malicious Edge',
    'Elemental HERO Bladedge',
    'Elemental HERO Neos',
    'Hero Counterattack',
    'Elemental HERO Captain Gold',
    'Elemental HERO Stratos',
    'Vision HERO Minimum Ray',
    'Destiny HERO - Decider',
    'Burst Return',
    'Hero Blast',
    'Elemental HERO Nebula Neos',
    'Cross Porter',
    'Destiny HERO - Diamond Dude',
    'Evil HERO Adusted Gold',
    'Elemental HERO Shadow Mist',
    'Destiny Mirage',
    'Neo-Spacian Glow Moss',
    'Elemental HERO Neos Alius',
    'Elemental HERO Wildheart',
    'Destiny HERO - Drilldark',
    'E - Emergency Call',
    'Neo Space',
    'Bubble Blaster',
    'Instant Neo Space',
    'Common Soul',
    'Neos Fusion',
    'Vision Fusion',
    'D - Formation',
    'Elemental HERO Prisma',
    'D-Fusion',
    'Favorite Hero',
    'Clock Tower Prison',
    'Destiny HERO - Malicious',
    'Destiny HERO - Defender',
    'Neo-Spacian Grand Mole',
    'Neo-Spacian Flare Scarab',
    'Elemental HERO Liquid Soldier',
    'Elemental HERO Heat',
    'Destiny HERO - Dunker',
    'Elemental HERO Lady Heat',
    'Elemental HERO Necroshade',
    'Elemental HERO Sparkman',
    'Neo-Spacian Dark Panther',
    'Neo-Spacian Air Hummingbird',
    'D - Shield',
    'Contact Gate',
    'D Cubed',
    'D - Tactics',
    'Fusion Destiny',
    'Elemental HERO Flash',
    'Evil HERO Sinister Necrom',
    'Elemental HERO Burstinatrix',
    'Evil HERO Infernal Gainer',
    'Hero Mask',
    'Spark Blaster',
    'NEX',
    'Dark City',
    'D - Spirit',
    'A Hero Lives',
    'R - Righteous Justice',
    'Parallel World Fusion',
    'Vision HERO Faris',
    'Bubble Illusion',
    'Supreme King''s Castle',
    'Elemental HERO Avian',
    'Elemental HERO Ocean',
    'Elemental HERO Clayman',
    'Elemental HERO Knospe',
    'Destiny HERO - Blade Master',
    'Elemental HERO Woodsman',
    'Edge Hammer',
    'Neo-Spacian Aqua Dolphin',
    'D - Time',
    'Generation Next',
    'Vision Release',
    'Elemental Recharge',
    'Reverse of Neos',
    'Destiny HERO - Dynatag',
    'Elemental HERO Honest Neos',
    'Kid Guard',
    'Destiny HERO - Fear Monger',
    'Destiny HERO - Dasher',
    'Skydive Scorcher',
    'Apparition',
    'Elemental HERO Blazeman',
    'Mask Change II',
    'Hero Spirit',
    'Terra Firma Gravity',
    'Clay Charge',
    'Hero Signal',
    'D - Counter',
    'Change of Hero - Reflector Ray',
    'Hero Barrier',
    'Elemental HERO Storm Neos',
    'Elemental HERO Chaos Neos',
    'Feather Shot',
    'Destiny HERO - Dreamer',
    'Vision HERO Poisoner',
    'Vision HERO Multiply Guy',
    'Elemental HERO Solid Soldier',
    'Hero Flash!!',
    'Hero Heart',
    'O - Oversoul',
    'Over Destiny',
    'Evil HERO Malicious Bane',
    'Skyscraper 2 - Hero City',
    'Elemental HERO Voltic',
    'Destiny End Dragoon',
    'Vision HERO Increase',
    'Destiny HERO - Captain Tenacious',
    'Mirror Gate',
    'Rose Bud',
    'D - Chain',
    'Elemental HERO Dark Neos',
    'Elemental HERO Magma Neos',
    'Bubble Shuffle',
    'Form Change',
    'Elemental HERO Nova Master',
    'Double Hero Attack',
    'Wroughtweiler',
    'Vision HERO Gravito',
    'Destiny HERO - Dusktopia',
    'Elemental HERO Marine Neos',
    'Elemental HERO Glow Neos',
    'Neo Space Connector',
    'Elemental HERO Grand Neos',
    'Masked HERO Blast',
    'Evil HERO Malicious Fiend',
    'Elemental HERO Aqua Neos',
    'Magistery Alchemist',
    'Elemental HERO Neos Knight',
    'Elemental HERO Flare Neos',
    'Masked HERO Vapor',
    'Vision HERO Trinity',
    'Masked HERO Anki',
    'Elemental HERO Brave Neos',
    'Elemental HERO Sunrise',
    'Masked HERO Dian',
    'Elemental HERO Grandmerge',
    'Destiny HERO - Dangerous',
    'Masked HERO Goka',
    'Destiny HERO - Dominance',
    'Elemental HERO Neo Bubbleman',
    'Destiny HERO - Dystopia',
    'Neo-Spacian Twinkle Moss',
    'Vision HERO Adoration',
    'Neo-Spacian Marine Dolphin',
    'Tenma the Sky Star',
    'Black Luster Soldier - Sacred Soldier',
    'Nekroz of Clausolas',
    'Phoenix Gearfried',
    'D.D. Esper Star Sparrow',
    'Infernoble Knight Maugis',
    'Buster Blader, the Destruction Swordmaster',
    'Big Shield Gardna',
    'Number 86: Heroic Champion - Rhongomyniad',
    'Sky Striker Ace - Roze',
    'Orgoth the Relentless',
    'Future Samurai',
    'D.D. Unicorn Knight',
    'Photon Strike Bounzer',
    'Divine Dragon Knight Felgrand',
    'Gagaga Caesar',
    'Elementsaber Lapauila',
    'Nekroz of Trishula',
    'Marmiting Captain',
    'Freed the Brave Wanderer',
    'Flower Cardian Paulownia',
    'U.A. Blockbacker',
    'Koa''ki Meiru War Arms',
    'Tatakawa Knight',
    'Cyber Prima',
    'Junk Breaker',
    'Junk Synchron',
    'Justice Bringer',
    'Legendary Knight Timaeus',
    'Legendary Knight Critias',
    'Legendary Six Samurai - Enishi',
    'Legendary Knight Hermos',
    'Rose Archer',
    'Motivating Captain',
    'The Phantom Knights of Cursed Javelin',
    'Coach King Giantrainer',
    'Mid Shield Gardna',
    'Beginning Knight',
    'Evening Twilight Knight',
    'Gilford the Lightning',
    'Aqua Armor Ninja',
    'Dual Avatar Feet - Kokoku',
    'Valkyrian Knight',
    'Laval Judgment Lord',
    'Strike Ninja',
    'Dark Blade the Captain of the Evil World',
    'General Raiho of the Ice Barrier',
    'U.A. Perfect Ace',
    'Madolche Messengelato',
    'Nekroz of Brionac',
    'Kuraz the Light Monarch',
    'Gearfried the Swordmaster',
    'Yamato-no-Kami',
    'Silver Sentinel',
    'Power Breaker',
    'Evocator Chevalier',
    'Great Shogun Shien',
    'Jain, Twilightsworn General',
    'D.D. Warrior Lady',
    'D.D. Assailant',
    'Divine Knight Ishzark',
    'D.D. Warrior',
    'Gaia, the Polar Knight',
    'Goblin Decoy Squad',
    'Gaia, the Mid-Knight Sun',
    'XX-Saber Fulhelmknight',
    'Legendary Secret of the Six Samurai',
    'Garoth, Lightsworn Warrior',
    'Flower Cardian Cherry Blossom with Curtain',
    'Extraceratops',
    'Idaten the Conqueror Star',
    'Samurai of the Ice Barrier',
    'Photon Vanisher',
    'The Six Samurai - Zanji',
    'The Six Samurai - Irou',
    'U.A. Libero Spiker'
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Zombie Uprising (250 cards)
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select
  (select id from public.shop_special_pack_definitions where code = 'zombie_uprising'),
  c.id
from public.card_catalog c
where c.name in (
    'Ghost Belle & Haunted Mansion',
    'Astra Ghouls',
    'Divine Serpent Geh',
    'Earthbound Immortal Ccarayhua',
    'Shutendoji',
    'Ghost Reaper & Winter Cherries',
    'Vampire Domination',
    'Masked Chameleon',
    'Revendread Slayer',
    'Yajiro Invader',
    'Ash Blossom & Joyous Spring',
    'Il Blud',
    'Shinobi Necro',
    'Zombowwow',
    'Umbral Soul',
    'Radiant Spirit',
    'Reptilianne Scylla',
    'Firestorm Prominence',
    'Raging Earth',
    'Destruction Cyclone',
    'Worm Warlord',
    'Silent Abyss',
    'Vendread Striges',
    'Necroface',
    'Number 45: Crumble Logos the Prophet of Demolition',
    'Vampire Retainer',
    'Number 23: Lancelot, Dark Knight of the Underworld',
    'Ghost Mourner & Moonlit Chill',
    'Reptilianne Vaskii',
    'Alien Mars',
    'Vampire Familiar',
    'Jack-o-Bolan',
    'Vendread Revenants',
    'Sinister Serpent',
    'Heavy Knight of the Flame',
    'Gozuki',
    'Shiranui Samurai',
    'Danger!? Tsuchinoko?',
    'Evil Dragon Ananta',
    'Red Ogre',
    'Evoltile Casinerio',
    'King of the Skull Servants',
    'Shiranui Spiritmaster',
    'Loud Cloud the Storm Serpent',
    'Shafu, the Wheeled Mayakashi',
    'Shiranui Swordmaster',
    'Revendread Executor',
    'Eldlich the Golden Lord',
    'Plaguespreader Zombie',
    'Subterror Behemoth Umastryx',
    'Bone Crusher',
    'Kasha',
    'Alien Hypno',
    'Vampire Grimson',
    'Vendread Core',
    'Erebus the Underworld Monarch',
    'Alien Mother',
    'Skull Flame',
    'Vampire Kingdom',
    'Ipiria',
    'Sacred Spirit of the Ice Barrier',
    'Tatsunecro',
    'Vendread Houndhorde',
    'Regenerating Mummy',
    'Alien Telepath',
    'Jar Turtle',
    'Oshaleon',
    'Shiranui Squire',
    'Worm Victory',
    'Ghostrick Alucard',
    'Bacon Saver',
    'Wicked Acolyte Chilam Sabak',
    'Cobraman Sakuzy',
    'Vampire Fraulein',
    'Guard Ghost',
    'Evoltile Elginero',
    'Vampire Sorcerer',
    'Ghostrick Stein',
    'Tristan, Knight of the Underworld',
    'Vampire Dragon',
    'Despair from the Dark',
    'Shiranui Smith',
    'Cosmic Horror Gangi''el',
    'Gogiga Gagagigo',
    'Crimson Knight Vampire Bram',
    'Dhampir Vampire Sheridan',
    'Alien Grey',
    'Ghostrick Jiangshi',
    'Goblin Zombie',
    'Worm Prince',
    'Koa''ki Meiru Ghoulungulate',
    'Worm Linx',
    'Goka, the Pyre of Malice',
    'Reborn Zombie',
    'Awakening of the Possessed - Gagigobyte',
    'Alien Overlord',
    'Gentlemander',
    'Supersonic Skull Flame',
    'Des Lacooda',
    'Gagagigo the Risen',
    'Worm Apocalypse',
    'King of the Feral Imps',
    'Jormungandr, Generaider Boss of Eternity',
    'Red-Headed Oni',
    'Giant Axe Mummy',
    'Jigabyte',
    'Samurai Skull',
    'Skelesaurus',
    'Majioshaleon',
    'Shiranui Spectralsword Shade',
    'Necroworld Banshee',
    'Worm Yagan',
    'Reptilianne Naga',
    'Ghost Sister & Spooky Dogwood',
    'Malevolent Mech - Goku En',
    'Gale Lizard',
    'Des Feral Imp',
    'Vampire Lord',
    'Kagetokage',
    'Alien Dog',
    'Yellow-Bellied Oni',
    'Pumprincess the Princess of Ghosts',
    'Iron Chain Snake',
    'Shadow Vampire',
    'Bravo, Fighter Fur Hire',
    'Shiranui Spectralsword',
    'Ghost Charon, the Underworld Boatman',
    'Evilswarm Azzathoth',
    'Mezuki',
    'Pumpking the King of Ghosts',
    'Gernia',
    'Zombina',
    'Bitelon',
    'Patrician of Darkness',
    'Alien Hunter',
    'Ghostrick Skeleton',
    'Razor Lizard',
    'Fear from the Dark',
    'Worm Rakuyeh',
    'Red-Eyes Zombie Dragon',
    'Lich Lord, King of the Underworld',
    'Zombie Mammoth',
    'Lightserpent',
    'Ghostrick Mummy',
    'Endless Decay',
    'Ghostrick Warwolf',
    'Ryu Kokki',
    'Worm Illidan',
    'Blood Sucker',
    'Skreech',
    'Lion Alligator',
    'Vampire Hunter',
    'Worm Xex',
    'Double Coston',
    'Spawn Alligator',
    'Reptilianne Gorgon',
    'Skull Conductor',
    'The Kick Man',
    'Worm Gulse',
    'Shadow Ghoul',
    'Pyramid Turtle',
    'The Lady in Wight',
    'Terrene Toothed Tsuchinoko',
    'Worm Barses',
    'Wandering Mummy',
    'Serpentine Princess',
    'Pilgrim Reaper',
    'Nine-Lives Cat',
    'Glow-Up Bloom',
    'Worm Ugly',
    'Reptilianne Lamia',
    'Venom Boa',
    'Venom Snake',
    'Paladin of the Cursed Dragon',
    'Performapal Whip Snake',
    'Zombie Master',
    'Royal Keeper',
    'Giga Gagagigo',
    'Dakki, the Graceful Mayakashi',
    'Worm Hope',
    'Vampire''s Domain',
    'Spirit Reaper',
    'Overlay Eater',
    'Return Zombie',
    'Soul-Absorbing Bone Tower',
    'Balloon Lizard',
    'Wightprincess',
    'Reptilianne Servant',
    'Zombino',
    'Nightmare Horse',
    'Malice Ascendant',
    'Vampire Baby',
    'Pain Painter',
    'Beast of the Pharaoh',
    'Hajun, the Winged Mayakashi',
    'Gagagigo',
    'Alien Shocktrooper',
    'Master Kyonshee',
    'Dokurorider',
    'Alien Kid',
    'Alien Warrior',
    'Dragon Zombie',
    'Plague Wolf',
    'Venom Serpent',
    'Sea Monster of Theseus',
    'Bayonater, the Baneful Barrel',
    'Alien Infiltrator',
    'Number 48: Shadow Lich',
    'Uni-Zombie',
    'Reptilianne Gardna',
    'Armored Lizard',
    'Armored Zombie',
    'The Snake Hair',
    'T.G. Metal Skeleton',
    'Ancient Lizard Warrior',
    'Worm Drake',
    'Tsukahagi, the Poisonous Mayakashi',
    'Clown Zombie',
    'Magical Ghost',
    'Performapal Bot-Eyes Lizard',
    'Worm Tentacles',
    'Yaranzo',
    'Worm Erokin',
    'The 13th Grave',
    'Dark Assailant',
    'Three-Legged Zombies',
    'Corroding Shark',
    'Yuki-Musume, the Ice Mayakashi',
    'Interplanetary Invader "A"',
    'Reptilianne Viper',
    'Worm Queen',
    'Blue-Eyed Silver Zombie',
    'Pharaonic Protector',
    'Temple of Skulls',
    'Drooling Lizard',
    'Pharaoh''s Servant',
    'Toon Alligator',
    'Wightprince',
    'Gladiator Beast Secutor',
    'Burning Skull Head',
    'Evoltile Odonto',
    'Fire Reaper',
    'Alien Ammonite',
    'Evoltile Pleuro',
    'Evoltile Najasho',
    'Worm Solid',
    'Wightmare',
    'Subterror Behemoth Dragossuary',
    'Shadow Specter',
    'Evoltile Lagosucho'
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Stone Age (260 cards)
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select
  (select id from public.shop_special_pack_definitions where code = 'stone_age'),
  c.id
from public.card_catalog c
where c.name in (
    'Ultimate Conductor Tyranno',
    'Dogoran, the Mad Flame Kaiju',
    'Megalith Aratron',
    'Koa''ki Meiru Sandman',
    'Koa''ki Meiru Wall',
    'Gigastone Omega',
    'Prank-Kids Rocksies',
    'Number 106: Giant Hand',
    'Granmarg the Mega Monarch',
    'Gigantes',
    'Element Saurus',
    'Beatraptor',
    'Daigusto Emeral',
    'Obsidian Dragon',
    'Gate Blocker',
    'Super-Ancient Dinobeast',
    'Crystal Rose',
    'Medium Piece Golem',
    'Miscellaneousaurus',
    'Koa''ki Meiru Guardian',
    'Dinowrestler Martial Ankylo',
    'Small Piece Golem',
    'Primineral Kongreat',
    'Cyber Jar',
    'Evilswarm Salamandra',
    'Nemeses Keystone',
    'Block Dragon',
    'Dogu',
    'The Despair Uranus',
    'Delta The Magnet Warrior',
    'Granmarg the Rock Monarch',
    'Absorbing Jar',
    'Evilswarm Golem',
    'Avatar of The Pot',
    'Mormolith',
    'Totem Five',
    'Guardian Sphinx',
    'Adamancipator Crystal - Dragite',
    'Evolsaur Diplo',
    'Hyper Hammerhead',
    'Megalith Och',
    'Jurrac Iguanon',
    'Gorgonic Guardian',
    'Fossil Dragon Skullgar',
    'Ultimate Tyranno',
    'Souleating Oviraptor',
    'Utgarda, Generaider Boss of Delusion',
    'Megalith Phul',
    'Gladiator Beast Hoplomus',
    'Genex Gaia',
    'Gaia Plate the Earth Giant',
    'Dodododwarf Gogogoglove',
    'Gem-Elephant',
    'Black Ptera',
    'Jurrac Ptera',
    'Dinowrestler Martial Ampelo',
    'Pyrorex the Elemental Lord',
    'Fossil Dragon Skullgios',
    'Rock Band Xenoguitar',
    'Landrobe the Rock Vassal',
    'Kayenn, the Master Magma Blacksmith',
    'Evolsaur Cerato',
    'Number 30: Acid Golem of Destruction',
    'Nibiru, the Primal Being',
    'Dinowrestler Capoeiraptor',
    'Adamancipator Analyzer',
    'Megalith Ophiel',
    'Subterror Behemoth Stalagmo',
    'Megalith Hagith',
    'Number 55: Gogogo Goliath',
    'Gallant Granite',
    'Black Tyranno',
    'Megalith Phaleg',
    'Number 61: Volcasaurus',
    'Frostosaurus',
    'Adamancipator Researcher',
    'Gem-Knight Lazuli',
    'Adamancipator Seeker',
    'Galaxy Tyranno',
    'Gogogo Golem',
    'Koa''ki Meiru Supplier',
    'Naturia Rock',
    'Gem-Knight Pearl',
    'Dinowrestler Martial Anga',
    'Guardian Grarl',
    'Jurrac Spinos',
    'Morphing Jar #2',
    'Power Giant',
    'Megarock Dragon',
    'Elephant Statue of Blessing',
    'Maharaghi',
    'Goggle Golem',
    'Aroma Jar',
    'Medusa Worm',
    'Evolsaur Pelta',
    'Primineral Mandstrong',
    'Gorgonic Ghoul',
    'Jurrac Dino',
    'Gorgonic Gargoyle',
    'Charm of Shabti',
    'Jurrac Brachis',
    'Fossil Warrior Skull King',
    'Jurrac Herra',
    'The Light - Hex-Sealed Fusion',
    'The Dark - Hex-Sealed Fusion',
    'The Earth - Hex-Sealed Fusion',
    'Gem-Armadillo',
    'Gogogo Gigas',
    'Destroyersaurus',
    'Megalith Bethor',
    'Rockstone Warrior',
    'Duoterion',
    'Dinowrestler Valeonyx',
    'Cairngorgon, Antiluminescent Knight',
    'Carboneddon',
    'Beta The Electromagnet Warrior',
    'Weeping Idol',
    'Big Piece Golem',
    'Monk Fighter',
    'Hydrogeddon',
    'Black Veloci',
    'Mad Sword Beast',
    'Chronomaly Tula Guardian',
    'Dinowrestler Capaptera',
    'Gem-Knight Obsidian',
    'Gonogo',
    'Black Brachios',
    'Jurrac Monoloph',
    'Dark Driceratops',
    'Elephant Statue of Disaster',
    'Criosphinx',
    'Fossil Tusker',
    'Koa''ki Meiru Boulder',
    'Gorgonic Cerberus',
    'Gilasaurus',
    'The Rock Spirit',
    'Oxygeddon',
    'Weathering Soldier',
    'Tyranno Infinity',
    'Seismic Crasher',
    'Black Stego',
    'Hieracosphinx',
    'Jurrac Protops',
    'Re: EX',
    'Enraged Muka Muka',
    'Legendary Jujitsu Master',
    'Triamid Dancer',
    'Dinowrestler Pankratops',
    'Golem Sentry',
    'Number 52: Diamond Crab King',
    'Super Conductor Tyranno',
    'Giant Rex',
    'Earthquake Giant',
    'Sentry Soldier of Stone',
    'Gem-Knight Crystal',
    'Dinowrestler Coelasilat',
    'Chronomaly Crystal Skull',
    'Fossil Warrior Skull Bone',
    'Chronomaly Colossal Head',
    'Chronomaly Moai Carrier',
    'Stone Dragon',
    'Lost Guardian',
    'Babycerasaurus',
    'T.G. Booster Raptor',
    'Koa''ki Meiru Prototype',
    'Muka Muka',
    'Petiteranodon',
    'Rocket Jumper',
    'Revival Golem',
    'Millennium Golem',
    'Neo-Spacian Grand Mole',
    'Mine Golem',
    'Barrier Statue of the Drought',
    'Megalosmasher X',
    'Stone Statue of the Aztecs',
    'Sand Moth',
    'Earth Effigy',
    'Sabersaurus',
    'Sword Arm of Dragon',
    'Megazowler',
    'Evolsaur Darwino',
    'Chronomaly Moai',
    'Jurrac Guaiba',
    'Gogogo Goram',
    'Chronomaly Mud Golem',
    'Chronomaly Aztec Mask Golem',
    'Kabazauls',
    'Chronomaly Crystal Bones',
    'Naturia Cliff',
    'Jurrac Velo',
    'Evolsaur Terias',
    'Beta The Magnet Warrior',
    'Moai Interceptor Cannons',
    'Stone Ogre Grotto',
    'Two-Headed King Rex',
    'Gachi Gachi Gantetsu',
    'Grenosaurus',
    'Crawling Dragon #2',
    'Fossil Warrior Skull Knight',
    'Destroyer Golem',
    'Uraby',
    'Gamma the Magnet Warrior',
    'Adamancipator Crystal - Raptite',
    'Adamancipator Crystal - Leonite',
    'Alpha The Magnet Warrior',
    'Sand Stone',
    'Trakodon',
    'Giant Soldier of Stone',
    'Mammoth Graveyard',
    'Gem-Knight Lapis',
    'Stegocyber',
    'Number 19: Freezadon',
    'The Statue of Easter Island',
    'Little D',
    'Grandram',
    'Anthrosaurus',
    'Chronomaly Tuspa Rocket',
    'Jurrac Tyrannus',
    'Dissolverock',
    'Ninaruru, the Magistus Glass Goddess',
    'Two-Mouth Darkruler',
    'Prisman',
    'Rock Ogre Grotto #1',
    'Stone Armadiller',
    'Evolsaur Elias',
    'Chronomaly Gordian Knot',
    'Magic Hole Golem',
    'Evilswarm Heliotrope',
    'Tomozaurus',
    'Haniwa',
    'Spherous Lady',
    'Ceremonial Token',
    'Dinowrestler Rambrachio',
    'Jurrac Gallim',
    'Labyrinth Wall',
    'Alpha The Electromagnet Warrior',
    'Koa''ki Meiru Overload',
    'Jurrac Stauriko',
    'Ironhammer the Giant',
    'Dinowrestler Systegosaur',
    'Hazy Flame Hydra',
    'Armor Exe',
    'Gamma The Electromagnet Warrior',
    'Grave Ohja',
    'Dinowrestler Eskrimamenchi',
    'Block Golem',
    'Triamid Hunter',
    'Triamid Master',
    'Castle Gate',
    'Dice Jar',
    'Dummy Golem',
    'Miracle Jurassic Egg',
    'Guardian Statue',
    'Great Spirit',
    'Gem-Turtle',
    'Chronomaly Winged Sphinx',
    'Gogogo Giant',
    'Gem-Knight Emerald',
    'Gogogo Aristera & Dexia',
    'Scrap Golem'
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Winged Sovereigns (260 cards)
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select
  (select id from public.shop_special_pack_definitions where code = 'winged_sovereigns'),
  c.id
from public.card_catalog c
where c.name in (
    'Dark Simorgh',
    'Cards for Black Feathers',
    'Simorgh, Bird of Protection',
    'Harpie Harpist',
    'Harpie''s Feather Duster',
    'Blackboost',
    'Harpie Lady 2',
    'Blackwing - Shura the Blue Flame',
    'Blackwing - Hillen the Tengu-wind',
    'Blackwing - Vayu the Emblem of Honor',
    'Simorgh, Bird of Bringing',
    'Simorgh, Bird of Calamity',
    'Blackbird Close',
    'Blackwing - Backlash',
    'Delta Crow - Anti Reverse',
    'Blackwing - Tornado the Reverse Wind',
    'Simorgh, Lord of the Storm',
    'Blackwing - Simoon the Poison Wind',
    'Simorgh, Bird of Beginning',
    'Blackwing - Pinaki the Waxing Moon',
    'Simorgh Repulsion',
    'Blackwing - Zephyros the Elite',
    'Simorgh, Bird of Divinity',
    'Simorgh, Bird of Ancestry',
    'Simorgh Sky Battle',
    'Harpie Dancer',
    'Blackwing - Boobytrap',
    'Blackwing - Kogarashi the Wanderer',
    'Against the Wind',
    'Raptor Wing Strike',
    'Simorgh Onslaught',
    'Blackwing - Breeze the Zephyr',
    'Elborz, the Sacred Lands of Simorgh',
    'Black Return',
    'Birdface',
    'Assault Blackwing - Kunai the Drizzle',
    'Blackwing - Gale the Whirlwind',
    'Blackwing - Kris the Crack of Dawn',
    'Blackwing - Gladius the Midnight Sun',
    'Black Whirlwind',
    'Harpie Oracle',
    'Blackwing - Ghibli the Searing Wind',
    'Blackwing - Oroshi the Squall',
    'Harpie Lady Elegance',
    'Harpie Queen',
    'Harpie Perfumer',
    'Blackwing - Jin the Rain Shadow',
    'Blackwing - Mistral the Silver Shield',
    'Phantom Gryphon',
    'Blackwing - Fane the Steel Chain',
    'Blackwing - Kochi the Daybreak',
    'Harpie''s Feather Rest',
    'Blackwing - Brisote the Tailwind',
    'Cyber Harpie Lady',
    'Blackwing - Elphin the Raven',
    'Harpie''s Pet Dragon',
    'Harpie Lady 3',
    'Blackwing - Kalut the Moon Shadow',
    'Blackwing - Bora the Spear',
    'Harpie Lady 1',
    'Harpie Lady Sisters',
    'Harpie Lady',
    'Black-Winged Strafe',
    'Blackwing - Jetstream the Blue Sky',
    'Blackwing - Etesian of Two Swords',
    'Blackwing - Gust the Backblast',
    'Cyber Shield',
    'Blackwing - Hurricane the Tornado',
    'Harpie Girl',
    'Blackwing - Decay the Ill Wind',
    'Glowing Crossbow',
    'Blackwing - Calima the Haze',
    'Blackwing - Steam the Cloak',
    'Harpie Channeler',
    'Harpie''s Feather Storm',
    'Black Thunder',
    'Fake Feather',
    'Black Feather Beacon',
    'Black Wing Revenge',
    'Blackwing - Sirocco the Dawn',
    'Blackwing - Harmattan the Dust',
    'Blackwing - Damascus the Polar Night',
    'Harpie Lady Phoenix Formation',
    'Blackwing - Boreas the Sharp',
    'Blackback',
    'Alluring Mirror Split',
    'Blackwing - Bombardment',
    'Blackwing - Gofu the Vague Shadow',
    'Harpie''s Pet Phantasmal Dragon',
    'Windrose the Elemental Lord',
    'Fire King High Avatar Garunix',
    'Mist Valley Apex Avian',
    'Dark Nephthys',
    'Prime Material Falcon',
    'Scrap Searcher',
    'Alector, Sovereign of Birds',
    'Speed Bird',
    'Danger! Thunderbird!',
    'Sacred Phoenix of Nephthys',
    'Cerulean Sacred Phoenix of Nephthys',
    'Raidraptor - Napalm Dragonius',
    'Koa''ki Meiru Tornado',
    'Crane Crane',
    'Gladiator Beast Octavius',
    'Gladiator Beast Bestiari',
    'Earthbound Immortal Aslla piscu',
    'Gladiator Beast Sagittarii',
    'Raiza the Mega Monarch',
    'Raidraptor - Strangle Lanius',
    'Cockadoodledoo',
    'Garum the Storm Vassal',
    'D.D. Crow',
    'Toon Harpie Lady',
    'Gladiator Beast Augustus',
    'Tri-Brigade Nervall',
    'Raidraptor - Last Strix',
    'Soaring Eagle Above the Searing Land',
    'ZW - Eagle Claw',
    'Sacred Crane',
    'Gladiator Beast Lanista',
    'Battlestorm',
    'Bujingi Crow',
    'Castel, the Skyblaster Musketeer',
    'Raidraptor - Mimicry Lanius',
    'Mist Valley Falcon',
    'Swift Birdman Joe',
    'Mist Valley Shaman',
    'Raider''s Wing',
    'Earthbound Immortal Wiraqocha Rasca',
    'Gladiator Beast Equeste',
    'Kikinagashi Fucho',
    'Spiritual Whisper',
    'Totem Bird',
    'Dragunity Senatus',
    'Bujingi Peacock',
    'Blizzard Thunderbird',
    'Hazy Flame Mantikor',
    'Lyrilusc - Recital Starling',
    'Phoenix Beast Gairuda',
    'Raidraptor - Fuzzy Lanius',
    'Dragunity Legionnaire',
    'Duck Dummy',
    'Lyrilusc - Cobalt Sparrow',
    'Sonic Chick',
    'Raidraptor - Force Strix',
    'Raidraptor - Arsenal Falcon',
    'Glife the Phantom Bird',
    'Fushi No Tori',
    'Garuda the Wind Spirit',
    'Sirenorca',
    'Ghost Bird of Bewitchment',
    'Shield Wing',
    'Storm Shooter',
    'Lyrilusc - Assembled Nightingale',
    'Raidraptor - Tribute Lanius',
    'Mist Condor',
    'Raidraptor - Avenge Vulture',
    'Rallis the Star Bird',
    'Heraldic Beast Twin-Headed Eagle',
    'Bujingi Pavo',
    'Bujingi Crane',
    'The Atmosphere',
    'Raidraptor - Blaze Falcon',
    'Evilswarm Hraesvelg',
    'Guard Penguin',
    'Fire King Avatar Garunix',
    'Raiza the Storm Monarch',
    'Eagle Eye',
    'Roc from the Valley of Haze',
    'Wind Effigy',
    'Aurora Wing',
    'T.G. Jet Falcon',
    'Mist Valley Soldier',
    'Sonic Shooter',
    'Winged Sage Falcos',
    'Kujakujaku',
    'Troposphere',
    'Blizzard Falcon',
    'Sonic Bird',
    'Hazy Flame Griffin',
    'Raidraptor - Singing Lanius',
    'Heraldic Beast Berners Falcon',
    'Mist Valley Baby Roc',
    'Mahjong Munia Maidens',
    'Firebird',
    'Lyrilusc - Turquoise Warbler',
    'Gusto Codor',
    'Star Staring Starling',
    'Barrier Statue of the Stormwinds',
    'Caligo Claw Crow',
    'Unibird',
    'Hunter Owl',
    'Dragunity Tribus',
    'Sky Scout',
    'Sonic Duck',
    'Dragunity Primus Pilus',
    'Dragunity Angusticlavii',
    'Peacock',
    'Bujingi Raven',
    'Performapal Spikeagle',
    'Mist Valley Windmaster',
    'Blue-Winged Crown',
    'Neo-Spacian Air Hummingbird',
    'Skull Red Bird',
    'Takuhee',
    'Faith Bird',
    'Spirit of the Books',
    'Raidraptor - Heel Eagle',
    'Dragunity Militum',
    'Raidraptor - Vanishing Lanius',
    'Queen Bird',
    'Winged Dragon, Guardian of the Fortress #2',
    'Chemicritter Hydron Hawk',
    'Tyhone',
    'Fiend Reflection #2',
    'Dark Bat',
    'Niwatori',
    'Raidraptor - Skull Eagle',
    'Kurama',
    'Gusto Egul',
    'Gusto Griffin',
    'Gusto Falco',
    'Gusto Gulldo',
    'Droll Bird',
    'Transforming Sphere',
    'Raidraptor - Revolution Falcon - Air Raid',
    'Sagitta, Maverick Fur Hire',
    'Raidraptor - Sharp Lanius',
    'Crystal Beast Cobalt Eagle',
    'Overlay Owl',
    'Ice Princess Zereort',
    'ZW - Phoenix Bow',
    'Raidraptor - Booster Strix',
    'Cheepcheepcheep',
    'Tornado Bird',
    'Raidraptor - Pain Lanius',
    'Lyrilusc - Sapphire Swallow',
    'Stealth Bird',
    'Bujingi Ophidian',
    'Bujingi Ibis',
    'Bujingi Swallow',
    'Dragunity Dux',
    'Raidraptor - Stranger Falcon',
    'Raidraptor - Rudder Strix',
    'Filo, Messenger Fur Hire',
    'Raidraptor - Blade Burner Falcon',
    'Raidraptor - Wild Vulture',
    'An Owl of Luck',
    'Raidraptor - Rise Falcon',
    'Raidraptor - Revolution Falcon',
    'Performapal Springoose',
    'Chrysalis Chicky',
    'Raidraptor - Necro Vulture',
    'Raidraptor - Fiend Eagle',
    'Lyrilusc - Independent Nightingale',
    'Skullbird',
    'Mavelus',
    'Crimson Sunbird',
    'Punished Eagle',
    'Gladiator Beast Gyzarus'
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Aqua Depths (280 cards)
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select
  (select id from public.shop_special_pack_definitions where code = 'aqua_depths'),
  c.id
from public.card_catalog c
where c.name in (
    'Gameciel, the Sea Turtle Kaiju',
    'Armed Sea Hunter',
    'Mermail Abyssnerei',
    'Fishborg Archer',
    'Levia-Dragon - Daedalus',
    'Koa''ki Meiru Hydro Barrier',
    'Citadel Whale',
    'Nopenguin',
    'Gishki Zielgigas',
    'Glacial Beast Blizzard Wolf',
    'Double Fin Shark',
    'Xyz Remora',
    'Gazer Shark',
    'Penguin Torpedo',
    'Deep Sea Sentry',
    'Gora Turtle of Illusion',
    'Poseidra, the Atlantean Dragon',
    'Number 21: Frozen Lady Justice',
    'Deep Sea Artisan',
    'Gladiator Beast Torax',
    'Vortex Trooper',
    'Fishborg Launcher',
    'Abyss-scale of Cetus',
    'Abyss-scale of the Mizuchi',
    'Abyss-scale of the Kraken',
    'Hyper-Ancient Shark Megalodon',
    'Fishborg Doctor',
    'Deep Sea Minstrel',
    'Gladiator Beast Murmillo',
    'Piwraithe the Ghost Pirate',
    'Tribe-Infecting Virus',
    'Evigishki Levianima',
    'Lifeless Leaffish',
    'Big Jaws',
    'Maryokutai',
    'T.G. Screw Serpent',
    'Lappis Dragon',
    'Abyss-sphere',
    'Silent Wobby',
    'Ronintoadin',
    'Danger! Ogopogo!',
    'Evigishki Mind Augus',
    'Gladiator Beast Vespasius',
    'Atlantean Marksman',
    'Danger! Nessie!',
    'Freezing Beast',
    'Atlantean Heavy Infantry',
    'Spiritual Beast Pettlephin',
    'Blizzed, Defender of the Ice Barrier',
    'Poison Draw Frog',
    'Imairuka',
    'Cloudian - Eye of the Typhoon',
    'Blue Dragon Ninja',
    'Big Whale',
    'Glacial Beast Polar Penguin',
    'Lady of the Lake',
    'Friller Rabca',
    'Gladiator Beast Retiari',
    'Skull Kraken',
    'Gishki Mollusk',
    'Snowman Eater',
    'Suijin',
    'Kaiser Sea Snake',
    'Nemeses Umbrella',
    'Nightmare Penguin',
    'Orca Mega-Fortress of Darkness',
    'Koa''ki Meiru Ice',
    'Wind-Up Snail',
    'Unifrog',
    'Swap Frog',
    'Chaos Daedalus',
    'Evigishki Merrowgeist',
    'Evigishki Soul Ogre',
    'Evigishki Gustkraken',
    'Number C101: Silent Honor DARK',
    'Chemicritter Carbo Crab',
    'Airorca',
    'Number C32: Shark Drake Veiss',
    'Xyz Slidolphin',
    'Gishki Chain',
    'Atlantean Dragoons',
    'Paleozoic Anomalocaris',
    'Abyss-squall',
    'Gishki Diviner',
    'Earthbound Immortal Chacu Challhua',
    'Spiral Serpent',
    'Phantasm Spiral Dragon',
    'Helmer, Helmsman Fur Hire',
    'Mermail Abyssmander',
    'Number 32: Shark Drake',
    'Cranium Fish',
    'Abyssal Kingshark',
    'Caravan of the Ice Barrier',
    'Mermaid Shark',
    'Paleozoic Opabinia',
    'Abyss Soldier',
    'Reese the Ice Mistress',
    'Guardian Slime',
    'Ocean''s Keeper',
    'Subterror Behemoth Phospheroglacier',
    'Wingtortoise',
    'Wind-Up Shark',
    'Golden Flying Fish',
    'Egyptian God Slime',
    'Deep Sweeper',
    'Lost Blue Breaker',
    'Crab Turtle',
    'Evilswarm Ketos',
    'Graydle Eagle',
    'Saber Shark',
    'Cutter Shark',
    'Phantom Dragonray Bronto',
    'Gemini Lancer',
    'Treeborn Frog',
    'Aqua Spirit',
    'Moulinglacia the Elemental Lord',
    'T.G. Drill Fish',
    'Mermaid Archer',
    'Buzzsaw Shark',
    'Lantern Shark',
    'White Stingray',
    'King of the Swamp',
    'Shark Stickers',
    'Secret Guards of the Ice Barrier',
    'Mermail Abyssturge',
    'Graydle Alligator',
    'Brinegir',
    'Magical Reflect Slime',
    'Graydle Cobra',
    'Warrior of Atlantis',
    'Genex Undine',
    'Gishki Shadow',
    'Toon Mermaid',
    'Metallizing Parasite - Lunatite',
    'Gluttonous Reptolphin Greethys',
    'Penguin Soldier',
    'Crystal Beast Emerald Tortoise',
    'Metallizing Parasite - Soltite',
    'Evigishki Tetrogre',
    'Mermail Abysspike',
    'Aquaactress Arowana',
    'Creeping Doom Manta',
    'Mobius the Frost Monarch',
    'Double Shark',
    'Metabo-Shark',
    'Atlantean Attack Squad',
    'Unshaven Angler',
    'Uminotaurus',
    'Needle Sunfish',
    'Shark Cruiser',
    'Shocktopus',
    'Sharkraken',
    'Dewdark of the Ice Barrier',
    'Mermail Abysslung',
    'Cyber Shark',
    'Spearfish Soldier',
    'Royal Swamp Eel',
    'Spear Shark',
    'The Dragon Dwelling in the Deep',
    'Spined Gillman',
    'Kaiser Sea Horse',
    'Cure Mermaid',
    'Koa''ki Meiru Sea Panther',
    'Submarine Frog',
    'Number 47: Nightmare Shark',
    'Number 101: Silent Honor ARK',
    'Ice Hand',
    'Mucus Yolk',
    'Hammer Shark',
    'Depth Shark',
    'Gishki Abyss',
    'Gishki Vision',
    'Terrorking Salmon',
    'Call of the Atlanteans',
    'Amphibian Beast',
    'Impcantation Chalislime',
    'Slushy',
    'Aquaactress Tetra',
    'Servant of Catabolism',
    'Gem-Knight Iolite',
    'Silent Angler',
    'Tripod Fish',
    'Prank-Kids Dropsies',
    'Performapal Sword Fish',
    'Water Spirit',
    'Drill Barnacle',
    'White Moray',
    'Water Dragon Cluster',
    'Deepsea Macrotrema',
    'Zone Eater',
    'Beastking of the Swamps',
    'Yomi Ship',
    'Deep Sea Diva',
    'Ooguchi',
    'Deep Diver',
    'Star Boy',
    'Piranha Army',
    'Penguin Knight',
    'Nimble Sunfish',
    'Ameba',
    'Yado Karu',
    'Escher the Frost Vassal',
    'Nimble Manta',
    'Gora Turtle',
    'Turtle Bird',
    'Gishki Reliever',
    'Giant Red Seasnake',
    'Sea Serpent Warrior of Darkness',
    '7 Colored Fish',
    'Kairyu-Shin',
    'Mermaid Knight',
    'Fortress Whale',
    'Bottom Dweller',
    'Space Mambo',
    'Scrap Shark',
    'Oyster Meister',
    'High Tide Gyojin',
    'Beelze Frog',
    'Cryomancer of the Ice Barrier',
    'Codarus',
    'Des Frog',
    'Mermail Abysshilde',
    'Mad Lobster',
    'Mermail Abysslinde',
    'Great White',
    'Weather Report',
    'Octoberser',
    'Spike Seadra',
    'Aquarian Alessa',
    'Fishborg Planter',
    'Fire Kraken',
    'Crazy Fish',
    'Performapal Stamp Turtle',
    'Starfish',
    'Hyosube',
    'Takriminos',
    'Violent Rain',
    'Tongyo',
    'Water Omotics',
    'Giant Turtle Who Feeds on Flames',
    'Atlantean Pikeman',
    'Water Magician',
    'Misairuzame',
    'Behegon',
    'Red Archery Girl',
    'Amazon of the Seas',
    'Gruesome Goo',
    'Neptabyss, the Atlantean Prince',
    'Sentinel of the Seas',
    'Wow Warrior',
    'Shark Fortress',
    'Leviair the Sea Dragon',
    'Enchanting Mermaid',
    'Lavalval Chain',
    'Unformed Void',
    'Flying Penguin',
    'Souleater',
    'Jellyfish',
    'Submersible Carrier Aero Shark',
    'Shark Caesar',
    'Island Turtle',
    'Fishborg Blaster',
    'Sea Kamen',
    'Liquid Beast',
    'Wetha',
    'Dupe Frog',
    'T.A.D.P.O.L.E.',
    'Squirt Squid',
    'Rage of the Deep Sea',
    'Turtle Tiger',
    'Boneheimer',
    'Twin Long Rods #2',
    'Armored Starfish',
    'Root Water',
    'The Furious Sea King',
    'Humanoid Slime',
    'Flying Fish',
    'Cannonball Spear Shellfish',
    'Torpedo Fish',
    'Slime Toad'
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Beast Kingdom (280 cards)
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select
  (select id from public.shop_special_pack_definitions where code = 'beast_kingdom'),
  c.id
from public.card_catalog c
where c.name in (
    'Fire King Avatar Arvata',
    'Lunalight Emerald Bird',
    'Mosaic Manticore',
    'Ancient Warriors - Graceful Zhou Gong',
    'Chow Chow Chan',
    'King Beast Barbaros',
    'Rescue Ferret',
    'Melffy of the Forest',
    'Madolche Chickolates',
    'Awakening of the Possessed - Nefariouser Archfiend',
    'Danger! Bigfoot!',
    'Aloof Lupine',
    'Chain Dog',
    'Lock Cat',
    'Beast King Barbaros',
    'Ancient Warriors - Ingenious Zhuge Kong',
    'Naglfar, Generaider Boss of Fire',
    'Gravity Behemoth',
    'Coach Soldier Wolfbark',
    'Naturia Forest',
    'Alpha, the Master of Beasts',
    'Vivid Knight',
    'Zoodiac Whiptail',
    'Gladiator Beast Torax',
    'Alpacaribou, Mystical Beast of the Forest',
    'Madolche Hootcake',
    'Heraldic Beast Unicorn',
    'Yokotuner',
    'Number 56: Gold Rat',
    'Gladiator Beast Darius',
    'Flame Tiger',
    'Rescue Cat',
    'Naturia Butterfly',
    'Gladiator Beast Octavius',
    'Gladiator Beast Bestiari',
    'Zoodiac Bunnyblast',
    'Gladiator Beast Sagittarii',
    'Leodrake''s Mane',
    'Zoodiac Kataroost',
    'Naturia Stinkbug',
    'Gladiator Beast''s Battle Halberd',
    'Lunalight Crimson Fox',
    'Ancient Warriors - Fearsome Zhang Yuan',
    'Tri-Brigade Fraktall',
    'Gladiator Beast Murmillo',
    'Performapal Flip Hippo',
    'Melffy Catty',
    'Hunter of Black Feathers',
    'Gladiator Beast Samnite',
    'Fire King Avatar Yaksha',
    'Zoodiac Ramram',
    'Gladiator Beast Augustus',
    'Yosenju Kama 3',
    'Tri-Brigade Kerass',
    'Danger! Dogman!',
    'Sea Lancer',
    'Mine Mole',
    'Gladiator Beast''s Battle Manica',
    'The Fabled Ganashia',
    'Sky Cavalry Centaurea',
    'Melffy Pony',
    'ZW - Unicorn Spear',
    'Melffy Puppy',
    'Melffy Fenny',
    'Parry',
    'Amazoness Shamanism',
    'Disarm',
    'Gladiator Beast War Chariot',
    'Shogi Knight',
    'Brotherhood of the Fire Fist - Snake',
    'Naturia Ragweed',
    'Ancient Warriors - Ambitious Cao De',
    'Gladiator Beast Vespasius',
    'Performapal Uni',
    'Gladiator Beast Lanista',
    'Brotherhood of the Fire Fist - Gorilla',
    'Brotherhood of the Fire Fist - Bear',
    'Amazoness Sage',
    'Hypnocorn',
    'Fencing Fire Ferret',
    'Yosenju Misak',
    'Naturia Marron',
    'Gladiator''s Return',
    'Performapal Elephammer',
    'Prominence, Molten Swordsman',
    'Danger!? Jackalope?',
    'Bujinki Amaterasu',
    'Bujingi Turtle',
    'Ancient Warriors - Masterful Sun Mou',
    'Scrap Orthros',
    'Hinezumi Hanabi',
    'Zoodiac Chakanine',
    'Rodenut',
    'The Fabled Catsith',
    'Heraldic Beast Basilisk',
    'Bujin Arasuda',
    'Blade Rabbit',
    'Kalantosa, Mystical Beast of the Forest',
    'Bujingi Centipede',
    'Gladiator Beast Noxious',
    'Bujingi Quilin',
    'Full Armored Black Ray Lancer',
    'Gladiator Beast Laquari',
    'Gladiator Beast Retiari',
    'Gladiator Beast Dimacari',
    'Ryko, Twilightsworn Fighter',
    'Gladiator Beast''s Respite',
    'Photon Leo',
    'Fenrir the Nordic Wolf',
    'Winged Rhynos',
    'Yosenju Kama 2',
    'Vola-Chemicritter Methydraco',
    'Spiritual Beast Rampengu',
    'Yosenju Kama 1',
    'X-Saber Axel',
    'Gladiator Beast United',
    'Three Thousand Needles',
    'Beast Machine King Barbaros Ür',
    'Bujingi Sinyou',
    'Yellow Baboon, Archer of the Forest',
    'Regulus',
    'Armored White Bear',
    'Zoodiac Thoroughblade',
    'Ancient Warriors - Virtuous Liu Xuan',
    'Naturia Vein',
    'Gladiator Beast Hoplomus',
    'Naturia Sunflower',
    'Gladiator Beast Attorix',
    'Exterio''s Fang',
    'Ancient Crimson Ape',
    'Gladiator Beast Equeste',
    'Behemoth the King of All Animals',
    'Melffy Mommy',
    'Wind-Up Kitten',
    'Brotherhood of the Fire Fist - Eland',
    'Garmr of the Nordic Beasts',
    'Scrap Goblin',
    'Coach Captain Bearman',
    'Grandsoil the Elemental Lord',
    'Wind-Up Rabbit',
    'Nefarious Archfiend Eater of Nefariousness',
    'Hop Ear Squadron',
    'Yosenju Magat',
    'Brotherhood of the Fire Fist - Swan',
    'Brotherhood of the Fire Fist - Buffalo',
    'Black Ray Lancer',
    'Fire King Avatar Barong',
    'Chiron the Mage',
    'Wrecker Panda',
    'Gladiator Beast''s Battle Gladius',
    'Desmanian Devil',
    'Yosenju Oyam',
    'Bujin Mikazuchi',
    'Valiant Shark Lancer',
    'Ancient Warriors - Valiant Zhang De',
    'The Fabled Kokkator',
    'Bonfire Colossus',
    'Mystical Knight of Jackal',
    'Performapal Handsamuraiger',
    'Sunlight Unicorn',
    'Subterror Nemesis Defender',
    'Performapal Rain Goat',
    'Number 72: Shogi Rook',
    'Trojan Gladiator Beast',
    'Sengenjin',
    'Big Koala',
    'Naturia Pineapple',
    'Felis, Lightsworn Archer',
    'Key Mouse',
    'Moja',
    'Elephun',
    'Brotherhood of the Fire Fist - Swallow',
    'Cat Shark',
    'Scrap Kong',
    'XX-Saber Garsem',
    'Amazoness Princess',
    'Bujingi Wolf',
    'Snyffus',
    'Shiba-Warrior Taro',
    'Andro Sphinx',
    'Manticore of Darkness',
    'Naturia Rock',
    'T.G. Warwolf',
    'Performapal Corn',
    'Amazoness Spy',
    'Amazoness Queen',
    'Bujingi Warg',
    'Naturia Dragonfly',
    'Ryko, Lightsworn Hunter',
    'Watch Cat',
    'Heraldic Beast Leo',
    'Crystal Beast Topaz Tiger',
    'Egotistical Ape',
    'Dynatherium',
    'Crystal Beast Amethyst Cat',
    'Great Long Nose',
    '3-Hump Lacooda',
    'Fire King Avatar Kirin',
    'Performapal Secondonkey',
    'Naturia Eggplant',
    'Red Hared Hasty Horse',
    'Caninetaur',
    'Hazy Flame Sphynx',
    'Jabbing Panda',
    'Flying Elephant',
    'Naturia Beans',
    'Tanngnjostr of the Nordic Beasts',
    'Brotherhood of the Fire Fist - Caribou',
    'Gallis the Star Beast',
    'Brotherhood of the Fire Fist - Panda',
    'Naturia Cosmobeet',
    'Lunalight Yellow Marten',
    'Madolche Cruffssant',
    'Koa''ki Meiru Crusader',
    'XX-Saber Gardestrike',
    'Naturia Hydrangea',
    'Baby Raccoon Ponpoko',
    'Gyaku-Gire Panda',
    'Gladiator Beast''s Comeback',
    'Explossum',
    'Nimble Musasabi',
    'Playful Possum',
    'Monoceros',
    'Ancient Warriors - Loyal Guan Yun',
    'Joyous Melffys',
    'Brotherhood of the Fire Fist - Rooster',
    'Amazoness Onslaught',
    'Hazy Flame Cerbereus',
    'Assault Beast',
    'Crystal Beast Amber Mammoth',
    'Crystal Beast Sapphire Pegasus',
    'Scrap Chimera',
    'Yosenju Tsujik',
    'Brotherhood of the Fire Fist - Spirit',
    'Amazoness Heirloom',
    'Sphinx Teleia',
    'Performapal Longphone Bull',
    'Performapal Salutiger',
    'Amazoness Fighter',
    'Enraged Battle Ox',
    'Leotaur',
    'Boar Soldier',
    'Twinheaded Beast',
    'Fenrir',
    'Wulf, Lightsworn Beast',
    'The Trojan Horse',
    'King Tiger Wanghu',
    'D.D. Crazy Beast',
    'Des Kangaroo',
    'Naturia Guardian',
    'Guldfaxe of the Nordic Beasts',
    'Naturia Spiderfang',
    'Voltic Kong',
    'Exarion Universe',
    'Big-Tusked Mammoth',
    'Lady Panther',
    'Kaiser Vorse Raider',
    'Flamvell Firedog',
    'Berserk Gorilla',
    'Ghost Knight of Jackal',
    'Phantom Beast Wild-Horn',
    'Mother Grizzly',
    'Giant Rat',
    'Amazoness Chain Master',
    'Wind-Up Dog',
    'Reborn Tengu',
    'Two Thousand Needles',
    'Ape Fighter',
    'Amazoness Swords Woman',
    'Cybernetic Cyclopean',
    'Des Wombat',
    'Dark Zebra',
    'Vampiric Koala',
    'Amazoness Trainee',
    'The Wicked Worm Beast',
    'Indomitable Fighter Lei Lei',
    'T.G. Rush Rhino',
    'Assault Dog',
    'Rhinotaurus',
    'Goblin Black Ops'
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Six Samurai & Warlords (260 cards)
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select
  (select id from public.shop_special_pack_definitions where code = 'six_samurai_warlords'),
  c.id
from public.card_catalog c
where c.name in (
    'Legendary Six Samurai - Enishi',
    'Six Strike - Triple Impact',
    'Great Shogun Shien',
    'Legendary Secret of the Six Samurai',
    'Musakani Magatama',
    'The Six Samurai - Zanji',
    'The Six Samurai - Irou',
    'The Six Samurai - Kamon',
    'The Six Samurai - Yaichi',
    'The Six Samurai - Nisashi',
    'Six Samurai United',
    'Enishi, Shien''s Chancellor',
    'The Six Samurai - Yariza',
    'Secret Six Samurai - Kizaru',
    'Spirit of the Six Samurai',
    'Six Style - Dual Wield',
    'Hand of the Six Samurai',
    'Secret Six Samurai - Doji',
    'Shien''s Squire',
    'Shien''s Smoke Signal',
    'Kagemusha of the Six Samurai',
    'Secret Six Samurai - Fuma',
    'Breakthrough!',
    'Grandmaster of the Six Samurai',
    'Legendary Six Samurai - Mizuho',
    'Elder of the Six Samurai',
    'Shien''s Dojo',
    'Shien''s Advisor',
    'Legendary Six Samurai - Kizan',
    'Temple of the Six',
    'Shien''s Castle of Mist',
    'Legendary Ebon Steed',
    'Legendary Six Samurai - Kageki',
    'Shien''s Footsoldier',
    'Chamberlain of the Six Samurai',
    'Secret Six Samurai - Genba',
    'Backs to the Wall',
    'Shien''s Scheme',
    'Swift Samurai Storm!',
    'The Six Shinobi',
    'Swiftstrike Armor',
    'Secret Six Samurai - Hatsume',
    'Legendary Six Samurai - Shinai',
    'Secret Skills of the Six Samurai',
    'Asceticism of the Six Samurai',
    'Cunning of the Six Samurai',
    'Six Scrolls of the Samurai',
    'Double-Edged Sword Technique',
    'Return of the Six Samurai',
    'Gateway of the Six',
    'Shadow of the Six Samurai - Shien',
    'Secret Six Samurai - Rihan',
    'Tenma the Sky Star',
    'Black Luster Soldier - Sacred Soldier',
    'Nekroz of Clausolas',
    'Phoenix Gearfried',
    'D.D. Esper Star Sparrow',
    'Destiny HERO - Drawhand',
    'Vision HERO Witch Raider',
    'Infernoble Knight Maugis',
    'Buster Blader, the Destruction Swordmaster',
    'Big Shield Gardna',
    'Number 86: Heroic Champion - Rhongomyniad',
    'Sky Striker Ace - Roze',
    'Orgoth the Relentless',
    'Future Samurai',
    'D.D. Unicorn Knight',
    'Photon Strike Bounzer',
    'Divine Dragon Knight Felgrand',
    'Destiny HERO - Plasma',
    'Gagaga Caesar',
    'Elementsaber Lapauila',
    'Nekroz of Trishula',
    'Marmiting Captain',
    'Freed the Brave Wanderer',
    'Flower Cardian Paulownia',
    'U.A. Blockbacker',
    'Koa''ki Meiru War Arms',
    'Tatakawa Knight',
    'Cyber Prima',
    'Junk Breaker',
    'Junk Synchron',
    'Destiny HERO - Departed',
    'Justice Bringer',
    'Legendary Knight Timaeus',
    'Legendary Knight Critias',
    'Legendary Knight Hermos',
    'Destiny HERO - Dreadmaster',
    'Rose Archer',
    'Motivating Captain',
    'The Phantom Knights of Cursed Javelin',
    'Coach King Giantrainer',
    'Mid Shield Gardna',
    'Beginning Knight',
    'Evening Twilight Knight',
    'Gilford the Lightning',
    'Aqua Armor Ninja',
    'Dual Avatar Feet - Kokoku',
    'Valkyrian Knight',
    'Laval Judgment Lord',
    'Strike Ninja',
    'Dark Blade the Captain of the Evil World',
    'General Raiho of the Ice Barrier',
    'U.A. Perfect Ace',
    'Madolche Messengelato',
    'Nekroz of Brionac',
    'Kuraz the Light Monarch',
    'Gearfried the Swordmaster',
    'Yamato-no-Kami',
    'Silver Sentinel',
    'Power Breaker',
    'Evocator Chevalier',
    'Destiny HERO - Doom Lord',
    'Jain, Twilightsworn General',
    'D.D. Warrior Lady',
    'D.D. Assailant',
    'Divine Knight Ishzark',
    'D.D. Warrior',
    'Gaia, the Polar Knight',
    'Goblin Decoy Squad',
    'Gaia, the Mid-Knight Sun',
    'XX-Saber Fulhelmknight',
    'Destiny HERO - Dark Angel',
    'Garoth, Lightsworn Warrior',
    'Flower Cardian Cherry Blossom with Curtain',
    'Extraceratops',
    'Vision HERO Vyon',
    'Idaten the Conqueror Star',
    'Samurai of the Ice Barrier',
    'Photon Vanisher',
    'U.A. Libero Spiker',
    'Armor Breaker',
    'Number 39: Utopia',
    'Dark Scorpion - Cliff the Trap Remover',
    'Heroic Champion - Kusanagi',
    'Junk Blader',
    'Amazoness Sage',
    'Number 59: Crooked Cook',
    'Satellarknight Sirius',
    'Flower Cardian Zebra Grass',
    'Sword Hunter',
    'Elementsaber Lapauila Mana',
    'Hayate the Earth Star',
    'Number C73: Abyss Supra Splash',
    'Elemental HERO Bubbleman',
    'Destiny HERO - Disk Commander',
    'Flower Cardian Pine',
    'Vengeful Shinobi',
    'CXyz Comics Hero Legend Arthur',
    'Infernity Randomizer',
    'Arcane Archer of the Forest',
    'Satellarknight Procyon',
    'Noble Knight Drystan',
    'Noble Knight Medraut',
    'The Phantom Knights of Fragile Armor',
    'Gaia the Fierce Knight Origin',
    'G.B. Hunter',
    'Number XX: Utopic Dark Infinity',
    'Gouki Guts',
    'Assault Mercenary',
    'Puppet King',
    'Dododo Warrior',
    'Altitude Knight',
    'Freed the Matchless General',
    'Ehren, Lightsworn Monk',
    'Lightray Grepher',
    'Soldier Gaia the Fierce Knight',
    'Gouki Iron Claw',
    'Destiny HERO - Dread Servant',
    'Knight Day Grepher',
    'The Phantom Knights of Torn Scales',
    'The Immortal Bushi',
    'Destiny HERO - Celestial',
    'Dark Scorpion - Chick the Yellow',
    'Elemental HERO Ice Edge',
    'Stinging Swordsman',
    'Lady Ninja Yae',
    'Wind-Up Knight',
    'Number 39: Utopia Roots',
    'Igknight Champion',
    'Igknight Lancer',
    'ZS - Vanish Sage',
    'Goyo Emperor',
    'Triple Star Trion',
    'Codebreaker Zero Day',
    'Scrap Soldier',
    'Black Luster Soldier',
    'Beat, Bladesman Fur Hire',
    'Gouki Bearhug',
    'Infernoble Knight - Renaud',
    'Sword Master',
    'Tasuke Knight',
    'Cyber Tutubon',
    'Gouki Suprex',
    'U.A. Playmaker',
    'U.A. Dreadnought Dunker',
    'Gouki Riscorpio',
    'Ventdra, the Empowered Warrior',
    'Laval Lancelord',
    'Stellarknight Triverr',
    'One-Eyed Skill Gainer',
    'Gouki Moonsault',
    'Buster Blader',
    'Knight of the Red Lotus',
    'Elemental HERO Bladedge',
    'Energy Bravery',
    'Pilgrim of the Ice Barrier',
    'Obnoxious Celtic Guard',
    'Elementsaber Nalu',
    'Black Luster Soldier - Super Soldier',
    'Sword Breaker',
    'Number 10: Illumiknight',
    'Infernoble Knight Ogier',
    'Cyber Gymnast',
    'Flower Cardian Cherry Blossom',
    'Number 54: Lion Heart',
    'White Ninja',
    'Elemental HERO Neos',
    'Elementsaber Makani',
    'Fire Flint Lady',
    'Infernoble Knight Oliver',
    'Infernoble Knight Astolfo',
    'Shurit, Strategist of the Nekroz',
    'The Legendary Fisherman II',
    'Number S39: Utopia Prime',
    'Daruma Dropper',
    'Infernoble Knight - Roland',
    'Kaiki the Unity Star',
    'Rocket Warrior',
    'Gearfried the Red-Eyes Iron Knight',
    'The Phantom Knights of Stained Greaves',
    'Elemental HERO Captain Gold',
    'Elemental HERO Stratos',
    'Number 39: Utopia Double',
    'Vision HERO Minimum Ray',
    'Destiny HERO - Decider',
    'Koa''ki Meiru Rooklord',
    'Amazoness Princess',
    'Battlin'' Boxer Big Bandage',
    'Noble Knight Joan',
    'X-Saber Pashuul',
    'Heroic Challenger - Assault Halberd',
    'Flower Cardian Willow',
    'Parry Knights',
    'Achacha Chanbara',
    'Amazoness Spy',
    'Amazoness Queen',
    'Garma Sword',
    'Nomadic Force',
    'General Grunard of the Ice Barrier',
    'Toon Buster Blader',
    'Elementsaber Molehu',
    'Crimson Ninja',
    'Number C39: Utopia Ray V',
    'Number C105: Battlin'' Boxer Comet Cestus',
    'Armed Ninja',
    'Gouki Octostretch',
    'Battlin'' Boxer Veil',
    'Swordsman of Revealing Light',
    'Charging Gaia the Fierce Knight'
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Sanctuary of the Fairies (280 cards)
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select
  (select id from public.shop_special_pack_definitions where code = 'sanctuary_fairies'),
  c.id
from public.card_catalog c
where c.name in (
    'Master Hyperion',
    'Madolche Chickolates',
    'Herald of Green Light',
    'Herald of Orange Light',
    'Herald of Purple Light',
    'Herald of Perfection',
    'Madolche Hootcake',
    'Heraldic Beast Unicorn',
    'Number 18: Heraldry Patriarch',
    'Madolche Puddingcess',
    'Heraldic Beast Aberconway',
    'Madolche Messengelato',
    'Heraldry Record',
    'Madolche Chateau',
    'Madolche Promenade',
    'Madolche Nights',
    'Madolche Petingcessoeur',
    'Herald of Pure Light',
    'Heraldic Beast Basilisk',
    'The Agent of Wisdom - Mercury',
    'Madolche Butlerusk',
    'Madolche Marmalmaide',
    'Madolche Ticket',
    'Zeradias, Herald of Heaven',
    'Madolche Anjelly',
    'Madolche Magileine',
    'Heraldic Beast Leo',
    'The Agent of Mystery - Earth',
    'Madolchepalooza',
    'Madolche Cruffssant',
    'Heraldic Beast Twin-Headed Eagle',
    'Herald of Creation',
    'Dawn of the Herald',
    'The Sanctuary in the Sky',
    'Augmented Heraldry',
    'Madolche Salon',
    'Heraldic Beast Berners Falcon',
    'The Agent of Creation - Venus',
    'The Agent of Entropy - Uranus',
    'Madolche Mewfeuille',
    'Heraldic Beast Amphisbaena',
    'The Agent of Force - Mars',
    'Madolche Lesson',
    'The Agent of Miracles - Jupiter',
    'Madolche Chouxvalier',
    'Heraldic Beast Eale',
    'Madolche Waltz',
    'Heraldry Change',
    'The Agent of Judgment - Saturn',
    'Charged-Up Heraldry',
    'Heraldry Reborn',
    'Advanced Heraldry Art',
    'Madolche Baaple',
    'Madolche Puddingcess Chocolat-a-la-Mode',
    'Number 8: Heraldic King Genom-Heritage',
    'Madolche Teacher Glassouffle',
    'Madolche Queen Tiaramisu',
    'Clear Kuriboh',
    'Sky Scourge Invicil',
    'Tualatin',
    'Sephylon, the Ultimate Timelord',
    'Darklord Zerato',
    'Phosphorage the Elemental Lord',
    'Artifact Vajra',
    'Darknight Parshath',
    'Moisture Creature',
    'Power Angel Valkyria',
    'Ehther the Heavenly Monarch',
    'Tiras, Keeper of Genesis',
    'Cyber Angel Natasha',
    'Number C103: Ragnafinity',
    'Chaos Valkyria',
    'Artifact Chakram',
    'Vylon Ohm',
    'Mystical Beast of Serket',
    'CXyz Dark Fairy Cheer Girl',
    'Lucky Pied Piper',
    'Cloudian - Acid Cloud',
    'Artifact Durendal',
    'Cloudian - Cirrostratus',
    'Dark Valkyria',
    'Artifact Moralltach',
    'Ret-time Reviver Emit-ter',
    'Winged Kuriboh LV10',
    'Honest',
    'Knightmare Incarnation Idlee',
    'Artifact Caduceus',
    'Star Seraph Scepter',
    'Darklord Ixchel',
    'Constellar Sombre',
    'Airknight Parshath',
    'Star Seraph Scale',
    'Bountiful Artemis',
    'Number 76: Harmonizer Gradielle',
    'Iris, the Earth Mother',
    'Tethys, Goddess of Light',
    'Vylon Vanguard',
    'Izanagi',
    'Number 103: Ragnazero',
    'Dark Voltanis',
    'Goddess of Sweet Revenge',
    'Star Seraph Sovereignty',
    'Trickstar Mandrake',
    'Vennu, Bright Bird of Divinity',
    'Majestic Mech - Senku',
    'Neo-Parshath, the Sky Paladin',
    'Cataclysmic Cryonic Coldo',
    'Cataclysmic Scorching Sunburner',
    'Cataclysmic Crusted Calcifida',
    'Cataclysmic Circumpolar Chilblainia',
    'Darklord Nergal',
    'Valkyrie Vierte',
    'Meltiel, Sage of the Sky',
    'Subterror Nemesis Archer',
    'Trickstar Nightshade',
    'Winged Kuriboh LV9',
    'Shinato, King of a Higher Plane',
    'Kelbek',
    'Arcana Force XXI - The World',
    'Valkyrie Zweite',
    'Valkyrie of the Nordic Ascendant',
    'Kotodama',
    'Number 7: Lucky Straight',
    'Ruin, Supreme Queen of Oblivion',
    'Guardian Eatos',
    'Guardian Angel Joan',
    'Cyber Angel Izana',
    'Trickstar Corobane',
    'Cyber Angel Benten',
    'Harvest Angel of Wisdom',
    'Arcana Force XVIII - The Moon',
    'Spirit of the Fall Wind',
    'Fluffal Penguin',
    'Splendid Venus',
    'Majestic Mech - Goryu',
    'Fluffal Sheep',
    'Darklord Superbia',
    'Angel O7',
    'Trickstar Lycoris',
    'Shopina the Melodious Maestra',
    'Prediction Princess Tarotrei',
    'Vylon Disigma',
    'Wingweaver',
    'Mozarta the Melodious Maestra',
    'Arcana Force 0 - The Fool',
    'Athena',
    'Valkyrie Brunhilde',
    'Opera the Melodious Diva',
    'Prediction Princess Astromorrigan',
    'Silent Paladin',
    'Watapon',
    'Cupid Fore',
    'Gellenduo',
    'Mechquipped Angineer',
    'Artifact Labrys',
    'Trickstar Narkissus',
    'Skelengel',
    'CXyz Mechquipped Djinn Angeneral',
    'Ghostrick Angel of Mischief',
    'Cupid Dunk',
    'Vylon Hept',
    'Valkyrie Erste',
    'Aria the Melodious Diva',
    'Trust Guardian',
    'Capricious Darklord',
    'Silpheed',
    'Royal Knight',
    'Agido',
    'Artifact Scythe',
    'Arcana Force XIV - Temperance',
    'Marshmallon',
    'White Potan',
    'Cloudian - Storm Dragon',
    'Consecrated Light',
    'Dimensional Alchemist',
    'Sky Scourge Enrise',
    'Elegy the Melodious Diva',
    'Izanami',
    'Fluffal Octopus',
    'Artifact Beagalltach',
    'Lee the World Chalice Fairy',
    'Hanewata',
    'Cyber Angel Dakini',
    'Cupid Volley',
    'Cloudian - Turbulence',
    'Elder Entity N''tss',
    'Hecatrice',
    'Darklord Amdusc',
    'Trickstar Candina',
    'Valkyrie Erda',
    'Valkyrie Sigrun',
    'Artifact Aegis',
    'Solo the Melodious Songstress',
    'Cupid Serve',
    'Eva',
    'Number 63: Shamoji Soldier',
    'Valkyrie Chariot',
    'Fluffal Dog',
    'Whirlwind Prodigy',
    'Light Effigy',
    'Layard the Liberator',
    'Darklord Edeh Arae',
    'Arcana Force VII - The Chariot',
    'Soul of Purity and Light',
    'Zolga',
    'Shining Angel',
    'Vanadis of the Nordic Ascendant',
    'Absorbing Kid from the Sky',
    'Banisher of the Radiance',
    'The Weather Painter Rain',
    'Majestic Mech - Ohka',
    'Dancing Fairy',
    'Fairy Archer',
    'The Weather Painter Thunder',
    'Vylon Soldier',
    'Keldo',
    'Indulged Darklord',
    'Darklord Nurse Reficule',
    'Goddess with the Third Eye',
    'The Weather Painter Sun',
    'Mudora',
    'Fluffal Leo',
    'Fluffal Owl',
    'Number 16: Shock Master',
    'Cloudian - Altus',
    'Number 67: Pair-a-Dice Smasher',
    'Red Nova',
    'Time Maiden',
    'Dark Angel',
    'Dark Rose Fairy',
    'Voltanis the Adjudicator',
    'Victoria',
    'Radiant Jeral',
    'Charming Resort Staff',
    'Fluffal Mouse',
    'Crystal Beast Ruby Carbuncle',
    'Serenade the Melodious Diva',
    'Gnomaterial',
    'Manju of the Ten Thousand Hands',
    'Senju of the Thousand Hands',
    'Valkyrie Dritte',
    'Cyber Egg Angel',
    'Cyber Petit Angel',
    'Fairy Cheer Girl',
    'Fortune Chariot',
    'Hoshiningen',
    'Doitsu',
    'Fairy Guardian',
    'Minerva, the Exalted Lightsworn',
    'Vylon Charger',
    'Freya, Spirit of Victory',
    'Bonze Alone',
    'Condemned Maiden',
    'Tenshin',
    'Winged Kuriboh',
    'Arcana Force I - The Magician',
    'Barrier Statue of the Heavens',
    'Valkyrie Funfte',
    'Banisher of the Light',
    'Koitsu',
    'The Forgiving Maiden',
    'Kuribon',
    'Soprano the Melodious Songstress',
    'Gyakutenno Megami',
    'Dunames Dark Witch',
    'Darklord Nasten',
    'Dark Witch',
    'Ruin, Queen of Oblivion',
    'Minerva, Scholar of the Sky',
    'Star Seraph Scout',
    'Arcana Force IV - The Emperor',
    'Sonata the Melodious Diva',
    'Constellar Virgo',
    'Guardian Elma',
    'Arcana Force VI - The Lovers',
    'Element Valkyrie',
    'Celestia, Lightsworn Angel',
    'Cyber Angel Idaten',
    'Goddess of Whim',
    'Marshmacaron'
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Verdant Swarm (250 cards)
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select
  (select id from public.shop_special_pack_definitions where code = 'verdant_swarm'),
  c.id
from public.card_catalog c
where c.name in (
    'Super Armored Robot Armed Black Iron "C"',
    'Spore',
    'Kumongous, the Sticky String Kaiju',
    'Number 3: Cicada King',
    'Silent Insect',
    'Number 35: Ravenous Tarantula',
    'Tytannial, Princess of Camellias',
    'Number 84: Pain Gainer',
    'Sylvan Hermitree',
    'Marina, Princess of Sunflowers',
    'Fallen Angel of Roses',
    'Fire Ant Ascator',
    'Performapal Skeeter Skimmer',
    'Dark Bug',
    'Galaxy Worm',
    'Naturia Butterfly',
    'Traptrix Myrmeleo',
    'Gokipole',
    'Naturia Stinkbug',
    'Battlewasp - Sting the Poison',
    'Digital Bug LEDybug',
    'Predaplant Drosophyllum Hydra',
    'Sylvan Marshalleaf',
    'Anteatereatingant',
    'Orea, the Sylvan High Arbiter',
    'Number 70: Malevolent Sin',
    'Traptrix Mantis',
    'Aromage Jasmine',
    'Sylvan Komushroomo',
    'Baobaboon',
    'Flowerbot',
    'Naturia Ragweed',
    'Snapdragon',
    'Kanzashi the Rikka Queen',
    'Lekunga',
    'Nettles',
    '4-Starred Ladybug of Doom',
    'Magnetic Mosquito',
    'Inzektor Giga-Cricket',
    'Naturia Marron',
    'Talaya, Princess of Cherry Blossoms',
    'Relinquished Spider',
    'Shiny Black "C"',
    'Inzektor Hornet',
    'Danger! Mothman!',
    'Digital Bug Scaradiator',
    'Maxx "C"',
    'Aromage Cananga',
    'Sylvan Bladefender',
    'Number 87: Queen of the Night',
    'Naturia Vein',
    'Naturia Sunflower',
    'Cyclamen the Rikka Fairy',
    'Erica the Rikka Fairy',
    'Boycotton',
    'World Carrotweight Champion',
    'Contact "C"',
    'Predaplant Heliamphorhynchus',
    'Inzektor Centipede',
    'Botanical Girl',
    'Hundred-Footed Horror',
    'Great Poseidon Beetle',
    'Gadarla, the Mystery Dust Kaiju',
    'Teardrop the Rikka Queen',
    'Metal Armored Bug',
    'Scrap Worm',
    'Rose Girl',
    'Naturia Pineapple',
    'Aromage Laurel',
    'Mirror Ladybug',
    'Battlewasp - Pin the Bullseye',
    'Primula the Rikka Fairy',
    'Danipon',
    'Rose Fairy',
    'Gokipon',
    'Resonance Insect',
    'Ibicella Lutea',
    'Inmato',
    'Battlewasp - Twinbow the Attacker',
    'Aromaseraphy Angelica',
    'Parasite Paranoid',
    'Sylvan Sagequoia',
    'Retaliating "C"',
    'Mother Spider',
    'Rikka Petal',
    'Impcantation Talismandra',
    'Level Eater',
    'Eco, Mystical Spirit of the Forest',
    'Ultimate Insect LV7',
    'Naturia Dragonfly',
    'Nobleman-Eater Bug',
    'Mardel, Generaider Boss of Light',
    'Grasschopper',
    'Predaplant Banksiogre',
    'Digital Bug Rhinosebus',
    'Swarm of Locusts',
    'Bee List Soldier',
    'Swarm of Scarabs',
    'Naturia Eggplant',
    'Gigaplant',
    'Predaplant Moray Nepenthes',
    'Digital Bug Centibit',
    'Sylvan Guardioak',
    'Aromage Bergamot',
    'Naturia Beans',
    'Confronting the "C"',
    'Flying "C"',
    'Reed Butterfly',
    'Naturia Cosmobeet',
    'Predaplant Sarraceniant',
    'Naturia Hydrangea',
    'Predaplant Squid Drosera',
    'Great Moth',
    'Sylvan Mikorange',
    'Neo-Spacian Glow Moss',
    'Predaplant Triphyoverutum',
    'Sylvan Snapdrassinagon',
    'Koa''ki Meiru Gravirose',
    'Koa''ki Meiru Beetle',
    'Sylvan Flowerknight',
    'Predaplant Spinodionaea',
    'Digital Bug Websolder',
    'Sylvan Peaskeeper',
    'Sylvan Cherubsprout',
    'Number 28: Titanic Moth',
    'Predaplant Flytrap',
    'Predaplant Chlamydosundew',
    'Samsara Lotus',
    'Dark Verger',
    'Mystic Tomato',
    'Spyder Spider',
    'Inzektor Hopper',
    'Howling Insect',
    'Earthbound Immortal Uru',
    'Saber Beetle',
    'Millennium Scorpion',
    'Naturia Guardian',
    'Cross-Sword Beetle',
    'Lord Poison',
    'Naturia Spiderfang',
    'Insect Princess',
    'Arsenal Bug',
    'Jirai Gumo',
    'Rose Witch',
    'Parasitic Ticky',
    'Fairy King Truesdale',
    'Scary Moth',
    'Evilswarm Mandragora',
    'Chirubimé, Princess of Autumn Leaves',
    'Bird of Roses',
    'Numbing Grub in the Ice Barrier',
    'Flying Kamakiri #1',
    'Angel Trumpeter',
    'Revival Rose',
    'Papa-Corn',
    'Battlewasp - Arbalest the Rapidfire',
    'Botanical Lion',
    'Gigantic Cephalotus',
    'Chainsaw Insect',
    'Number 50: Blackship of Corn',
    'Inzektor Exa-Beetle',
    'Naturia Ladybug',
    'Fusion Parasite',
    'Hedge Guard',
    'Homunculus the Alchemic Being',
    'Primitive Butterfly',
    'Brain Crusher',
    'Armored Bee',
    'Naturia Strawberry',
    'Beetron',
    'Queen Angel of Roses',
    'Predaplant Darlingtonia Cobra',
    'Battlewasp - Dart the Hunter',
    'Horseytail',
    'Empress Mantis',
    'Interceptomato',
    'Amarylease',
    'Transcicada',
    'Puppet Plant',
    'Inzektor Earwig',
    'Inzektor Dragonfly',
    'Glow-Up Bulb',
    'Skull-Mark Ladybug',
    'Bachibachibachi',
    'Leghul',
    'Mystic Macrocarpa Seed',
    'Silent Strider',
    'Griggle',
    'Prickle Fairy',
    'Noisy Gnat',
    'Inzektor Ladybug',
    'Bite Bug',
    'Woodland Sprite',
    'Informer Spider',
    'Minar',
    'Atomic Firefly',
    'Des Mosquito',
    'Naturia Rosewhip',
    'Pinch Hopper',
    'Desert Protector',
    'Inzektor Ant',
    'Naturia Beetle',
    'Warm Worm',
    'Cursed Fig',
    'Shiny Black "C" Squadder',
    'Naturia Cherries',
    'Ultimate Insect LV3',
    'Shield Worm',
    'Dreamsprite',
    'Rainbow Flower',
    'Bladefly',
    'Cockroach Knight',
    'Grass Phantom',
    'Ultimate Insect LV5',
    'Inzektor Firefly',
    'Marionette Mite',
    'Neo-Spacian Flare Scarab',
    'Insect Soldiers of the Sky',
    'Insect Knight',
    'Dungeon Worm',
    'Jerry Beans Man',
    'Neo Bug',
    'Queen of Autumn Leaves',
    'Number 66: Master Key Beetle',
    'Traptrix Atrax',
    'Naturia Mantis',
    'Moonlit Papillon',
    'Rose Lover',
    'Naturia Pumpkin',
    'XX-Saber Emmersblade',
    'Vampiric Orchis',
    'Javelin Beetle',
    'Naturia White Oak',
    'Cactus Fighter',
    'Girochin Kuwagata',
    'Krawler Receptor',
    'Battlecruiser Dianthus',
    'Predaplant Dragostapelia',
    'Hunter Spider',
    'Digital Bug Corebage',
    '8-Claws Scorpion',
    'Trent',
    'Flying Kamakiri #2',
    'Giant Flea',
    'Hercules Beetle',
    'Ultimate Insect LV1',
    'Bean Soldier',
    'Naturia Stag Beetle',
    'Kuwagata α',
    'Predaplant Ophrys Scorpio'
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Fiend's Domain (280 cards)
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select
  (select id from public.shop_special_pack_definitions where code = 'fiends_domain'),
  c.id
from public.card_catalog c
where c.name in (
    'Gemini Imps',
    'Darkness Neosphere',
    'Caius the Mega Monarch',
    'Ultimate Obedient Fiend',
    'Red-Eyes Archfiend of Lightning',
    'Garlandolf, King of Destruction',
    'Dark Spirit of Malice',
    'Reign-Beaux, Overlord of Dark World',
    'Brain Golem',
    'Holding Arms',
    'Dark Master - Zorc',
    'Evilswarm Exciton Knight',
    'Alich, Malebranche of the Burning Abyss',
    'Libic, Malebranche of the Burning Abyss',
    'Dark Lucius LV8',
    'Steelswarm Caucastag',
    'Skull Meister',
    'Ido the Supreme Magical Force',
    'Dark Spirit of Banishment',
    'The Wicked Eraser',
    'Shadowknight Archfiend',
    'Vilepawn Archfiend',
    'Element Doom',
    'Dark Hunter',
    'Grapha, Dragon Lord of Dark World',
    'Demise, Supreme King of Armageddon',
    'Archfiend Emperor, the First Lord of Horror',
    'Number 77: The Seven Sins',
    'Infernalqueen Archfiend',
    'Darkbishop Archfiend',
    'Poly-Chemicritter Dioxogre',
    'Tuning Gum',
    'Djinn Cursenchanter of Rituals',
    'Element Soldier',
    'Twin-Headed Wolf',
    'Curse Necrofear',
    'Ms. Judge',
    'Angmarl the Fiendish Monarch',
    'Desrook Archfiend',
    'Malicevorous Spoon',
    'Red Familiar',
    'The Suppression Pluto',
    'Dark Lucius LV4',
    'Tour Guide From the Underworld',
    'Abominable Unchained Soul',
    'Koa''ki Meiru Doom',
    'Demise, King of Armageddon',
    'Dark Lucius LV6',
    'Guardian Baou',
    'Chaos Betrayer',
    'Obsessive Uvualoop',
    'Prufinesse, the Tactical Trapper',
    'Byser Shock',
    'Infernity General',
    'Terrorking Archfiend',
    'Eater of Millions',
    'Infernity Conjurer',
    'Serziel, Watcher of the Evil Eye',
    'Farfa, Malebranche of the Burning Abyss',
    'Rainbow Kuriboh',
    'Number 80: Rhapsody in Berserk',
    'The End of Anubis',
    'Magical Musketeer Wild',
    'Battle Fader',
    'Caius the Shadow Monarch',
    'Infernity Wildcat',
    'The Fabled Ganashia',
    'Prometheus, King of the Shadows',
    'Blue Duston',
    'Umbramirage the Elemental Lord',
    'Diskblade Rider',
    'Mirror Resonator',
    'Phantom of Chaos',
    'D/D Pandora',
    'Santa Claws',
    'Plunder Patrollship Moerk',
    'Broww, Huntsman of Dark World',
    'Coach Goblin',
    'Flame Ogre',
    'Calcab, Malebranche of the Burning Abyss',
    'Number C80: Requiem in Berserk',
    'Capshell',
    'Steelswarm Longhorn',
    'Lesser Fiend',
    'Newdoria',
    'Tlakalel, His Malevolent Majesty',
    'Steelswarm Sting',
    'D/D Lamia',
    'Relinkuriboh',
    'Ghostrick Specter',
    'Tongue Twister',
    'Ghostrick Lantern',
    'Lava Golem',
    'D/D/D Dragon King Pendragon',
    'Kahkki, Guerilla of Dark World',
    'Kryuel',
    'The Fabled Catsith',
    'Doom Donuts',
    'Gren, Tactician of Dark World',
    'Sinister Sprocket',
    'Archfiend Commander',
    'Holding Legs',
    'Sky Scourge Norleras',
    'Earthbound Immortal Ccapac Apu',
    'Scarm, Malebranche of the Burning Abyss',
    'Earthbound Greater Linewalker',
    'Gorz the Emissary of Darkness',
    'Grinder Golem',
    'Gishki Psychelone',
    'Dark Mimic LV3',
    'The Wicked Dreadroot',
    'Doomsday Horror',
    'Green Duston',
    'Wandering King Wildwind',
    'Steelswarm Girastag',
    'Yellow Duston',
    'Grave Squirmer',
    'Phantasm Emperor Trilojig',
    'Night Assailant',
    'Number 41: Bagooska the Terribly Tired Tapir',
    'Edge Imp Saw',
    'Evil HERO Infernal Prodigy',
    'Infernal Incinerator',
    'Archfiend Empress',
    'Ghostrick Alucard',
    'Tour Bus From the Underworld',
    'Magical Musketeer Kidbrave',
    'Wall of Illusion',
    'Number 60: Dugares the Timeless',
    'Koa''ki Meiru Valafar',
    'Number 65: Djinn Buster',
    'Snipe Hunter',
    'Fabled Gallabas',
    'Djinn Demolisher of Rituals',
    'Subterror Behemoth Speleogeist',
    'Bluebeard, the Plunder Patroll Shipwright',
    'The Masked Beast',
    'Ghostrick Socuteboss',
    'Sangan',
    'Fiendish Rhino Warrior',
    'Dotedotengu',
    'Grave Protector',
    'Archfiend''s Awakening',
    'Ghostrick Stein',
    'Magical Musketeer Caspar',
    'The Fabled Kokkator',
    'Belial - Marquis of Darkness',
    'Evil HERO Malicious Edge',
    'Red Mirror',
    'Supay',
    'Emissary from Pandemonium',
    'Tragoedia',
    'Infernity Guardian',
    'Catoblepas, Familiar of the Evil Eye',
    'Fire Cracker',
    'Black Potan',
    'Magical Musket Mastermind Zakiel',
    'Danger! Chupacabra!',
    'Unchained Twins - Sarama',
    'Medusa, Watcher of the Evil Eye',
    'Red Blossoms from Underroot',
    'Mad Reloader',
    'Dragon Seeker',
    'Ghostrick Fairy',
    'Performapal Kuribohble',
    'Ghostrick Jiangshi',
    'Bearblocker',
    'Unchained Twins - Aruha',
    'Fabled Grimro',
    'Archfiend General',
    'Unchained Twins - Rakea',
    'Chaos Hunter',
    'Doomdog Octhros',
    'Ghostrick Angel of Mischief',
    'Barrier Resonator',
    'Infernity Archfiend',
    'Snoww, Unlight of Dark World',
    'Clock Resonator',
    'Edge Imp Chain',
    'Cagna, Malebranche of the Burning Abyss',
    'Illusory Snatcher',
    'Ahrima, the Wicked Warden',
    'Radian, the Multidimensional Kaiju',
    'Zera the Mant',
    'Giant Kozaky',
    'Trance Archfiend',
    'Infernity Avenger',
    'Ogre of the Scarlet Sorrow',
    'Stygian Street Patrol',
    'Xyz Avenger',
    'Goldd, Wu-Lord of Dark World',
    'Stray Asmodian',
    'Lucent, Netherlord of Dark World',
    'Infinity Dark',
    'Latinum, Exarch of Dark World',
    'Sillva, Warlord of Dark World',
    'Dark Necrofear',
    'Reshef the Dark Being',
    'Viser Des',
    'Ghostrick Parade',
    'Adreus, Keeper of Armageddon',
    'Zoa',
    'Summoned Skull',
    'Crimson Resonator',
    'Steelswarm Scout',
    'Edge Imp Scythe',
    'Necro Defender',
    'Shadow Delver',
    'Evil HERO Adusted Gold',
    'Annihilator Archfiend',
    'Card Guard',
    'Number 31: Embodiment of Punishment',
    'Number 13: Embodiment of Crime',
    'Draghig, Malebranche of the Burning Abyss',
    'Graff, Malebranche of the Burning Abyss',
    'Malicevorous Fork',
    'Rubic, Malebranche of the Burning Abyss',
    'Ghostrick Jackfrost',
    'Kuriphoton',
    'Kuriboh',
    'Red Warg',
    'Steelswarm Moth',
    'Numeron Wall',
    'Putrid Pudding Body Buddies',
    'Kiseitai',
    'Magical King Moonstar',
    'Dark Mimic LV1',
    'Dino-Sewing',
    'Tindangle Hound',
    'D/D Necro Slime',
    'Edge Imp Tomahawk',
    'Archfiend Giant',
    'Fabled Dianaira',
    'Number 96: Dark Mist',
    'Red Resonator',
    'Diabound Kernel',
    'Imprisoned Queen Archfiend',
    'Djinn Presider of Rituals',
    'Malice Doll of Demise',
    'Possessed Dark Soul',
    'Greed Quasar',
    'Phantom King Hydride',
    'Crass Clown',
    'Ghostrick Skeleton',
    'Power Invader',
    'Dark Effigy',
    'Maju Garzett',
    'Flamvell Fiend',
    'Beiige, Vanguard of Dark World',
    'Ghostrick Mummy',
    'Dark Resonator',
    'Gren Maju Da Eiza',
    'Goblin Elite Attack Force',
    'Ghost Ship',
    'Ghostrick Warwolf',
    'Tardy Orc',
    'Fusion Devourer',
    'Tainted Wisdom',
    'Giant Orc',
    'Inferno Hammer',
    'Magical Musketeer Starfire',
    'Dark Jeroid',
    'Shadowslayer',
    'Abaki',
    'The Bistro Butcher',
    'Number C96: Dark Storm',
    'Mad Archfiend',
    'Infernity Destroyer',
    'Magical Musketeer Doc',
    'Memory Crush King',
    'Theban Nightmare',
    'Archfiend of Gilfer',
    'Nuvia the Wicked',
    'Infernity Archer',
    'Emperor Sem',
    'Emissary of the Afterlife',
    'Flash Assailant',
    'Archfiend Interceptor',
    'Perditious Puppeteer',
    'Juragedo'
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- Energy Frontier (250 cards)
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select
  (select id from public.shop_special_pack_definitions where code = 'energy_frontier'),
  c.id
from public.card_catalog c
where c.name in (
    'Volcanic Doomfire',
    'Tribe-Shocking Virus',
    'Voltester',
    'Thunderclap Skywolf',
    'Thunder Hand',
    'Super-Electromagnetic Voltech Dragon',
    'PSY-Framegear Gamma',
    'Thunder Dragonduo',
    'Virtual World Hime - Nyannyan',
    'The Blazing Mars',
    'Royal Firestorm Guards',
    'Pilica, Descendant of Gusto',
    'Thunder Dragonlord',
    'Mekk-Knight Purple Nightfall',
    'Kozmoll Dark Lady',
    'Spiritual Beast Apelio',
    'Neo Flamvell Lady',
    'Gusto Thunbolt',
    'Evilswarm Obliviwisp',
    'Number 89: Diablosis the Mind Hacker',
    'Wattsquirrel',
    'Number 18: Heraldry Patriarch',
    'Lifeforce Harmonizer',
    'Thunderclap Monk',
    'Volcanic Scattershot',
    'Infernal Flame Emperor',
    'Lightning Punisher',
    'Serene Psychic Witch',
    'Re-Cover',
    'D.D. Seeker',
    'The Dark Creator',
    'Hypnosister',
    'Mekk-Knight Yellow Star',
    'Mekk-Knight Red Moon',
    'Ghost Ogre & Snow Rabbit',
    'Space-Time Police',
    'Silent Psychic Wizard',
    'Berlineth the Firestorm Vassal',
    'Molten Zombie',
    'D.D. Telepon',
    'Sishunder',
    'Volcanic Counter',
    'Time Escaper',
    'Hazy Flame Basiltrice',
    'Burning Beast',
    'Rai-Jin',
    'Jigen Bakudan',
    'Destructotron',
    'Zaborg the Thunder Monarch',
    'Spiritual Beast Cannahawk',
    'Kozmo Strawman',
    'Nemeses Flag',
    'Electric Snake',
    'Time Thief Redoer',
    'Caam, Serenity of Gusto',
    'Guardian Ceal',
    'Thunder Dragonhawk',
    'Dragon Piper',
    'Virtual World Roshi - Laolao',
    'Thunder Dragonroar',
    'Krebons',
    'Mist Valley Executor',
    'Myutant GB-88',
    'Thunder Dragonmatrix',
    'PSY-Frame Multi-Threader',
    'Laval Lakeside Lady',
    'Super Quantum Blue Layer',
    'Sanga of the Thunder',
    'Nemeses Corridor',
    'Zaborg the Mega Monarch',
    'Mist Valley Thunderbird',
    'Mental Seeker',
    'Neo Flamvell Hedgehog',
    'Subterror Behemoth Ultramafus',
    'Thunder Dragondark',
    'Dr. Frankenderp',
    'Kozmo Farmgirl',
    'Rai-Mei',
    'Thunder Dragon',
    'Gem-Knight Amber',
    'Pyrotech Mech - Shiryu',
    'The Ascended of Thunder',
    'Brohunder',
    'Ariel, Priestess of the Nekroz',
    'Flamvell Poun',
    'Kozmoll Wickedwitch',
    'Chronomaly Crystal Chrononaut',
    'Volcanic Shell',
    'Gem-Knight Sardonyx',
    'Time Thief Winder',
    'Awakening of the Possessed - Greater Inari Fire',
    'Impcantation Penciplume',
    'Impcantation Candoll',
    'Evilswarm O''lantern',
    'Thestalos the Mega Monarch',
    'Wattkinetic Puppeteer',
    'Hino-Kagu-Tsuchi',
    'Storm Caller',
    'Armored Axon Kicker',
    'Thunder King Rai-Oh',
    'Psychic Emperor',
    'Thunder Sea Horse',
    'Psychic Tracker',
    'PSY-Frame Driver',
    'Mekk-Knight Blue Sky',
    'Genomix Fighter',
    'The Chaos Creator',
    'Inari Fire',
    'King Pyron',
    'Batteryman Micro-Cell',
    'Master Craftsman Gamil',
    'Wattkiwi',
    'Ultimate Axon Kicker',
    'Batteryman 9-Volt',
    'Gundari',
    'Helios Duo Megistus',
    'Neo Flamvell Shaman',
    'Hushed Psychic Cleric',
    'Helios Trice Megistus',
    'Myutant Ultimus',
    'Morphtronic Magnen Bar',
    'Firebrand Hymnist',
    'Psychic Wheeleder',
    'Final Psychic Ogre',
    'Tenkabito Shien',
    'Thunder Nyan Nyan',
    'Flamvell Commando',
    'Neo Flamvell Sabre',
    'Rai Rider',
    'Wind-Up Juggler',
    'Flame Ruler',
    'Spirit of Flames',
    'Prank-Kids Lampsies',
    'The Calibrator',
    'Solar Flare Dragon',
    'Psychic Commander',
    'The Calculator',
    'Fire Princess',
    'Invasion of Flames',
    'Reinforced Human Psychic Borg',
    'Helios - The Primordial Sun',
    'Laval Magma Cannoneer',
    'Photon Token',
    'Susa Soldier',
    'Kozmo Goodwitch',
    'Telekinetic Shocker',
    'Number 26: Spaceway Octobypass',
    'Fire Hand',
    'Neo Flamvell Origin',
    'Batteryman C',
    'Genetic Woman',
    'Psi-Blocker',
    'Risebell the Star Psycher',
    'Wattsychic Fighter',
    'Diana the Light Spirit',
    'Gaia Soul the Combustible Collective',
    'Volcanic Slicer',
    'Mahunder',
    'Pahunder',
    'Armored Kappa',
    'Wattcobra',
    'R-Genex Magma',
    'Mithra the Thunder Vassal',
    'Mekk-Knight Orange Sunset',
    'Master Gig',
    'Watch Dog',
    'Musto, Oracle of Gusto',
    'Mekk-Knight Green Horizon',
    'Twin-Headed Fire Dragon',
    'Volcanic Queen',
    'Mr. Volcano',
    'Doctor Cranium',
    'Inferno',
    'The Thing in the Crater',
    'Wattlemur',
    'Wattfox',
    'Kurivolt',
    'Wattpheasant',
    'Raging Flame Sprite',
    'Burning Algae',
    'Psi-Beast',
    'Wattwoodpecker',
    'Electric Lizard',
    'Psychic Ace',
    'Esper Girl',
    'Plasma Ball',
    'Fox Fire',
    'Morphtronic Magnen',
    'Flamvell Baby',
    'Wattbetta',
    'Risebell the Star Adjuster',
    'Electric Virus',
    'Spiritual Beast Tamer Winda',
    'Flame Champion',
    'Blazing Inpachi',
    'Gem-Knight Garnet',
    'Subterror Behemoth Voltelluric',
    'Virtual World Mai-Hime - Lulu',
    'Volcanic Blaster',
    'Apocatequil',
    'Laval Coatl',
    'Volcanic Rocket',
    'Elemental HERO Heat',
    'Darkfire Soldier #2',
    'Genex Furnace',
    'Elemental HERO Lady Heat',
    'Laval Phlogis',
    'Darkfire Soldier #1',
    'Laval Burner',
    'Guardian Tryce',
    'Neo Flamvell Garuda',
    'Batteryman Charger',
    'Psychic Jumper',
    'Gem-Knight Tourmaline',
    'Ghost Fairy Elfobia',
    'Cuben',
    'Chosen by the World Chalice',
    'Fireyarou',
    'Volcanic Hammerer',
    'Evilswarm Thunderbird',
    'Tripwire Beast',
    'Daigusto Phoenix',
    'Bolt Penguin',
    'Wattkid',
    'Vylon Prism',
    'Ritual Beast Tamer Elder',
    'Wattmole',
    'The Accumulator',
    'United Resistance',
    'Batteryman D',
    'Molten Behemoth',
    'Prank-Kids Fansies',
    'Kozmo Tincan',
    'Batteryman AA',
    'Batteryman AAA',
    'Flame Cerebrus',
    'Winda, Priestess of Gusto',
    'Wattdragonfly',
    'Laval Forest Sprite',
    'Laval Miller',
    'Laval Volcano Handmaiden',
    'Mekk-Knight Avram',
    'Mega Thunderball',
    'Wings of Wicked Flame',
    'Morphtronic Radion',
    'Thunder Kid',
    'Hinotama Soul',
    'People Running About',
    'Mekk-Knight Indigo Eclipse',
    'Flame Dancer'
  )
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- ---------------------------------------------------------
-- 3. LINK EXISTING SLOTS TO THE NEW CURATED PACKS
-- ---------------------------------------------------------

update public.shop_special_pack_slots
set pack_definition_id = (select id from public.shop_special_pack_definitions where code = 'chaos_shadows'),
    theme_label = (select name from public.shop_special_pack_definitions where code = 'chaos_shadows')
where theme_category = 'archetype' and slot_order = 1;

update public.shop_special_pack_slots
set pack_definition_id = (select id from public.shop_special_pack_definitions where code = 'arcane_circle'),
    theme_label = (select name from public.shop_special_pack_definitions where code = 'arcane_circle')
where theme_category = 'archetype' and slot_order = 2;

update public.shop_special_pack_slots
set pack_definition_id = (select id from public.shop_special_pack_definitions where code = 'iron_legion'),
    theme_label = (select name from public.shop_special_pack_definitions where code = 'iron_legion')
where theme_category = 'archetype' and slot_order = 3;

update public.shop_special_pack_slots
set pack_definition_id = (select id from public.shop_special_pack_definitions where code = 'dragons_roar'),
    theme_label = (select name from public.shop_special_pack_definitions where code = 'dragons_roar')
where theme_category = 'archetype' and slot_order = 4;

update public.shop_special_pack_slots
set pack_definition_id = (select id from public.shop_special_pack_definitions where code = 'elemental_vanguard'),
    theme_label = (select name from public.shop_special_pack_definitions where code = 'elemental_vanguard')
where theme_category = 'archetype' and slot_order = 5;

update public.shop_special_pack_slots
set pack_definition_id = (select id from public.shop_special_pack_definitions where code = 'zombie_uprising'),
    theme_label = (select name from public.shop_special_pack_definitions where code = 'zombie_uprising')
where theme_category = 'attribute' and slot_order = 1;

update public.shop_special_pack_slots
set pack_definition_id = (select id from public.shop_special_pack_definitions where code = 'stone_age'),
    theme_label = (select name from public.shop_special_pack_definitions where code = 'stone_age')
where theme_category = 'attribute' and slot_order = 2;

update public.shop_special_pack_slots
set pack_definition_id = (select id from public.shop_special_pack_definitions where code = 'winged_sovereigns'),
    theme_label = (select name from public.shop_special_pack_definitions where code = 'winged_sovereigns')
where theme_category = 'attribute' and slot_order = 3;

update public.shop_special_pack_slots
set pack_definition_id = (select id from public.shop_special_pack_definitions where code = 'aqua_depths'),
    theme_label = (select name from public.shop_special_pack_definitions where code = 'aqua_depths')
where theme_category = 'attribute' and slot_order = 4;

update public.shop_special_pack_slots
set pack_definition_id = (select id from public.shop_special_pack_definitions where code = 'beast_kingdom'),
    theme_label = (select name from public.shop_special_pack_definitions where code = 'beast_kingdom')
where theme_category = 'attribute' and slot_order = 5;

update public.shop_special_pack_slots
set pack_definition_id = (select id from public.shop_special_pack_definitions where code = 'six_samurai_warlords'),
    theme_label = (select name from public.shop_special_pack_definitions where code = 'six_samurai_warlords')
where theme_category = 'monster_type' and slot_order = 1;

update public.shop_special_pack_slots
set pack_definition_id = (select id from public.shop_special_pack_definitions where code = 'sanctuary_fairies'),
    theme_label = (select name from public.shop_special_pack_definitions where code = 'sanctuary_fairies')
where theme_category = 'monster_type' and slot_order = 2;

update public.shop_special_pack_slots
set pack_definition_id = (select id from public.shop_special_pack_definitions where code = 'verdant_swarm'),
    theme_label = (select name from public.shop_special_pack_definitions where code = 'verdant_swarm')
where theme_category = 'monster_type' and slot_order = 3;

update public.shop_special_pack_slots
set pack_definition_id = (select id from public.shop_special_pack_definitions where code = 'fiends_domain'),
    theme_label = (select name from public.shop_special_pack_definitions where code = 'fiends_domain')
where theme_category = 'monster_type' and slot_order = 4;

update public.shop_special_pack_slots
set pack_definition_id = (select id from public.shop_special_pack_definitions where code = 'energy_frontier'),
    theme_label = (select name from public.shop_special_pack_definitions where code = 'energy_frontier')
where theme_category = 'monster_type' and slot_order = 5;

-- ---------------------------------------------------------
-- 4. VERIFICATION - independently re-derives the exclusion rule
--    directly against the inserted pool rows.
-- ---------------------------------------------------------

do $verify$
declare
  v_def_count int;
  v_pool_count int;
  v_leaked_stage4 int;
  v_leaked_exclusive int;
  v_pack record;
begin
  select count(*) into v_def_count from public.shop_special_pack_definitions
  where code in ('chaos_shadows', 'arcane_circle', 'iron_legion', 'dragons_roar', 'elemental_vanguard', 'zombie_uprising', 'stone_age', 'winged_sovereigns', 'aqua_depths', 'beast_kingdom', 'six_samurai_warlords', 'sanctuary_fairies', 'verdant_swarm', 'fiends_domain', 'energy_frontier');

  if v_def_count <> 15 then
    raise exception 'SPECIAL PACK SEED ABORTED: expected 15 pack definitions, found %.', v_def_count;
  end if;

  select count(*) into v_pool_count from public.shop_special_pack_pool_cards;
  -- Season 1 audit round-2 (2026-09-02) hardening: was previously
  -- just a "not empty" check. Strengthened to an exact-count
  -- assertion against 3978 (not 3980), the independently-recounted
  -- true total after all pool corrections in this file (including
  -- the Lemon/Chocolate Magician Girl removal from arcane_circle) -
  -- verified by re-summing every pack's `where c.name in (...)`
  -- literal list directly against this file's own source text.
  -- A count below 3978 means at least one listed card name failed
  -- to resolve against card_catalog (silent join miss); a count
  -- above 3978 means an unexpected extra row was inserted somewhere.
  -- Either way, that is real information this deploy must not
  -- silently swallow.
  if v_pool_count = 0 then
    raise exception 'SPECIAL PACK SEED ABORTED: shop_special_pack_pool_cards is empty after seeding.';
  end if;

  if v_pool_count <> 3978 then
    raise exception 'SPECIAL PACK SEED ABORTED: expected exactly 3978 total pool rows across all 15 packs, found %. This means at least one card name in a pack''s pool list failed to resolve against card_catalog (or an unexpected extra row exists) - do not proceed without investigating which pack is short.', v_pool_count;
  end if;

  -- Real safety check: no pool row may reference a card that is any
  -- route's Stage 4 evolution monster.
  select count(*) into v_leaked_stage4
  from public.shop_special_pack_pool_cards spc
  where exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = spc.card_catalog_id
      and brs.stage_number = 4
  );

  if v_leaked_stage4 <> 0 then
    raise exception 'SPECIAL PACK SEED ABORTED: % pool row(s) reference a Stage 4 Boss evolution monster.', v_leaked_stage4;
  end if;

  -- Real safety check: no pool row may reference a card with any
  -- is_route_exclusive = true support grant.
  select count(*) into v_leaked_exclusive
  from public.shop_special_pack_pool_cards spc
  where exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = spc.card_catalog_id
      and brg.is_route_exclusive = true
  );

  if v_leaked_exclusive <> 0 then
    raise exception 'SPECIAL PACK SEED ABORTED: % pool row(s) reference an is_route_exclusive support card.', v_leaked_exclusive;
  end if;

  raise notice 'SPECIAL PACK SEED: 15 packs, % total pool rows, zero Stage-4/route-exclusive leaks confirmed live.', v_pool_count;

  for v_pack in
    select d.code, d.name, count(spc.card_catalog_id) as pool_size
    from public.shop_special_pack_definitions d
    left join public.shop_special_pack_pool_cards spc on spc.pack_definition_id = d.id
    group by d.code, d.name
    order by d.display_order
  loop
    raise notice '  % (%): % cards', v_pack.name, v_pack.code, v_pack.pool_size;
  end loop;
end $verify$;

-- =========================================================
-- SECTION: 202609021030_remove_machina_gearframe_duplicate_grant.sql
-- =========================================================

-- =========================================================
-- FIX-FORWARD: remove machina's duplicate Machina Gearframe
-- Stage 4 support grant (Season 1 audit, approved correction)
--
-- WHY
-- 202609020960_fix_16_boss_route_stage_identities.sql makes Machina
-- Gearframe the machina Stage 1 EVOLUTION card. The already-deployed
-- seed (202609011900_seed_boss_routes.sql) also grants Machina
-- Gearframe as a machina Stage 4 SUPPORT card (quantity 1,
-- is_route_exclusive = true). _boss_route_grant_stage() (see
-- 202609012000_boss_route_rpcs.sql) grants the Stage N evolution
-- card and every Stage N support grant as independent, unconditional
-- card_instances inserts with no de-duplication between the two -
-- so without this fix, a player who has already received Machina
-- Gearframe at Stage 1 (as the evolution card) would receive a
-- SECOND, fully independent copy on reaching Stage 4, purely as a
-- side effect of the stage-identity correction. This is the exact
-- same bug class as chaos_bls / D.D. Warrior Lady, fixed by
-- 202609020980, just discovered one route later by the same
-- systematic cross-check.
--
-- This migration removes only that one now-redundant Stage 4
-- support grant row. It does not touch any other machina support
-- card, does not touch any other route, and does not touch any
-- already-existing player's card_instances (a player who already
-- has a duplicate Machina Gearframe from a past Stage 4 grant keeps
-- both copies - this only prevents a NEW double-grant going
-- forward). Per instruction, machina support is not otherwise
-- redesigned: Machina Fortress, Machina Citadel, and any other
-- Stage 4 support grants for this route are untouched.
--
-- SAFETY
-- Single, narrowly-scoped DELETE keyed on the exact (route, stage,
-- card) triple. Fully idempotent - deleting an already-deleted row
-- is a no-op. Deploy this migration strictly after 202609020960 (so
-- the Stage 1 evolution reassignment is already in place) though the
-- DELETE itself does not actually depend on it having run.
-- =========================================================

delete from public.boss_route_stage_grants g
using public.boss_route_stages s, public.boss_routes r, public.card_catalog c
where g.stage_id = s.id
  and s.route_id = r.id
  and r.code = 'machina'
  and s.stage_number = 4
  and g.card_catalog_id = c.id
  and c.name = 'Machina Gearframe';

do $verify_machina$
declare
  v_remaining int;
begin
  select count(*)
  into v_remaining
  from public.boss_route_stage_grants g
  join public.boss_route_stages s on s.id = g.stage_id
  join public.boss_routes r on r.id = s.route_id
  join public.card_catalog c on c.id = g.card_catalog_id
  where r.code = 'machina'
    and s.stage_number = 4
    and c.name = 'Machina Gearframe';

  if v_remaining <> 0 then
    raise exception
      'MACHINA DEDUP FIX ABORTED: Machina Gearframe is still granted as machina Stage 4 support (% row(s)).', v_remaining;
  end if;

  raise notice 'MACHINA DEDUP FIX: Machina Gearframe Stage 4 support grant removed - now granted exactly once, as the Stage 1 evolution card.';
end $verify_machina$;

-- =========================================================
-- GLOBAL AUDIT: zero unintended evolution-card / support-grant
-- overlaps across ALL 20 routes (not just chaos_bls / machina).
--
-- For every route, for every stage's evolution_card_catalog_id,
-- check whether that same card_catalog_id also appears anywhere in
-- boss_route_stage_grants for the SAME route (any stage). This is
-- the general form of the bug fixed above and by 202609020980 - run
-- here, after both fixes, as a hard deploy-time gate so this bug
-- class cannot silently reappear (e.g. from a future stage-identity
-- edit that reintroduces an overlap without anyone re-running this
-- specific check by hand).
--
-- Expected result after the D.D. Warrior Lady + Machina Gearframe
-- fixes: ZERO rows. If this ever finds a row, that is a live
-- double-grant bug and must be triaged the same way as the two
-- above (do not blanket-delete without confirming which side -
-- evolution assignment or support grant - is the mistake).
-- =========================================================

do $verify_global_overlap$
declare
  v_overlap_count int;
  v_row record;
begin
  select count(*) into v_overlap_count
  from public.boss_route_stages brs
  join public.boss_routes r on r.id = brs.route_id
  join public.boss_route_stage_grants g on g.card_catalog_id = brs.evolution_card_catalog_id
  join public.boss_route_stages gs on gs.id = g.stage_id and gs.route_id = brs.route_id;

  if v_overlap_count <> 0 then
    for v_row in
      select
        r.code as route_code,
        brs.stage_number as evolution_stage,
        c.name as card_name,
        gs.stage_number as grant_stage,
        g.is_route_exclusive,
        g.quantity
      from public.boss_route_stages brs
      join public.boss_routes r on r.id = brs.route_id
      join public.card_catalog c on c.id = brs.evolution_card_catalog_id
      join public.boss_route_stage_grants g on g.card_catalog_id = brs.evolution_card_catalog_id
      join public.boss_route_stages gs on gs.id = g.stage_id and gs.route_id = brs.route_id
      order by r.code, brs.stage_number
    loop
      raise warning 'REMAINING OVERLAP: route=% card="%" is Stage % evolution AND a Stage % support grant (is_route_exclusive=%, qty=%)',
        v_row.route_code, v_row.card_name, v_row.evolution_stage, v_row.grant_stage, v_row.is_route_exclusive, v_row.quantity;
    end loop;

    raise exception
      'GLOBAL OVERLAP AUDIT FAILED: % evolution-card/support-grant overlap(s) remain across the 20 routes. See WARNING lines above for detail.', v_overlap_count;
  end if;

  raise notice 'GLOBAL OVERLAP AUDIT: zero evolution-card/support-grant overlaps across all 20 Boss Routes.';
end $verify_global_overlap$;

-- =========================================================
-- POST-DEPLOY ASSERTIONS
--
-- Runs after every section above. Any failure here RAISEs an
-- EXCEPTION, which - because this entire file is one outer
-- transaction (see the single BEGIN at the very top and COMMIT at
-- the very bottom) - rolls back EVERY change made by every section
-- above, atomically. Nothing partially applies: either every
-- assertion below passes and the whole deploy commits, or one fails
-- and the database ends up exactly as it was before this script
-- ran.
-- =========================================================

do $post_route_shape$
declare
  v_route_count int;
  v_stage_count int;
  v_bad_routes text[];
begin
  select count(*) into v_route_count from public.boss_routes;
  if v_route_count <> 20 then
    raise exception 'POST-DEPLOY ABORTED: expected 20 boss_routes, found %.', v_route_count;
  end if;

  select count(*) into v_stage_count from public.boss_route_stages;
  if v_stage_count <> 80 then
    raise exception 'POST-DEPLOY ABORTED: expected 80 boss_route_stages rows (20 routes x 4 stages), found %.', v_stage_count;
  end if;

  select array_agg(r.code) into v_bad_routes
  from public.boss_routes r
  where (select count(*) from public.boss_route_stages s where s.route_id = r.id) <> 4
     or not exists (select 1 from public.boss_route_stages s where s.route_id = r.id and s.stage_number in (1,2,3,4)
                     group by s.route_id having count(distinct s.stage_number) = 4);

  if v_bad_routes is not null and array_length(v_bad_routes, 1) > 0 then
    raise exception 'POST-DEPLOY ABORTED: route(s) do not have exactly stages 1,2,3,4: %.', array_to_string(v_bad_routes, ', ');
  end if;

  raise notice 'POST-DEPLOY: 80 boss_route_stages confirmed (20 x 4), every route has exactly stages 1-4.';
end $post_route_shape$;

do $post_named_chains$
declare
  v_chain text[];
  v_expected text[];
begin
  -- Dark Magician
  select array_agg(c.name order by s.stage_number)
  into v_chain
  from public.boss_route_stages s
  join public.boss_routes r on r.id = s.route_id
  join public.card_catalog c on c.id = s.evolution_card_catalog_id
  where r.code = 'dark_magician';
  v_expected := array['Berry Magician Girl','Dark Magician Girl','Dark Magician of Chaos','The Dark Magicians'];
  if v_chain is distinct from v_expected then
    raise exception 'POST-DEPLOY ABORTED: dark_magician chain is %, expected %.', v_chain, v_expected;
  end if;

  -- Cyber Dragon
  select array_agg(c.name order by s.stage_number)
  into v_chain
  from public.boss_route_stages s
  join public.boss_routes r on r.id = s.route_id
  join public.card_catalog c on c.id = s.evolution_card_catalog_id
  where r.code = 'cyber_dragon';
  v_expected := array['Proto-Cyber Dragon','Cyber Dragon','Cyber Dragon Nova','Cyber Dragon Infinity'];
  if v_chain is distinct from v_expected then
    raise exception 'POST-DEPLOY ABORTED: cyber_dragon chain is %, expected %.', v_chain, v_expected;
  end if;

  -- Chazz / Armed Dragon / Ojama
  select array_agg(c.name order by s.stage_number)
  into v_chain
  from public.boss_route_stages s
  join public.boss_routes r on r.id = s.route_id
  join public.card_catalog c on c.id = s.evolution_card_catalog_id
  where r.code = 'armed_dragon_ojama';
  v_expected := array['Armed Dragon LV3','Armed Dragon LV5','Armed Dragon LV7','Armed Dragon Thunder LV10'];
  if v_chain is distinct from v_expected then
    raise exception 'POST-DEPLOY ABORTED: armed_dragon_ojama (Chazz) chain is %, expected %.', v_chain, v_expected;
  end if;

  -- Dinosaur
  select array_agg(c.name order by s.stage_number)
  into v_chain
  from public.boss_route_stages s
  join public.boss_routes r on r.id = s.route_id
  join public.card_catalog c on c.id = s.evolution_card_catalog_id
  where r.code = 'dinosaur';
  v_expected := array['Babycerasaurus','Souleating Oviraptor','Ultimate Conductor Tyranno','Transcendosaurus Gigantozowler'];
  if v_chain is distinct from v_expected then
    raise exception 'POST-DEPLOY ABORTED: dinosaur chain is %, expected %.', v_chain, v_expected;
  end if;

  -- Harpie
  select array_agg(c.name order by s.stage_number)
  into v_chain
  from public.boss_route_stages s
  join public.boss_routes r on r.id = s.route_id
  join public.card_catalog c on c.id = s.evolution_card_catalog_id
  where r.code = 'harpie';
  v_expected := array['Harpie Lady','Harpie Channeler','Harpie''s Pet Phantasmal Dragon','Harpie''s Pet Dragon - Fearsome Fire Blast'];
  if v_chain is distinct from v_expected then
    raise exception 'POST-DEPLOY ABORTED: harpie chain is %, expected %.', v_chain, v_expected;
  end if;

  raise notice 'POST-DEPLOY: Dark Magician, Cyber Dragon, Chazz/Armed Dragon, Dinosaur, and Harpie chains all confirmed exact.';
end $post_named_chains$;

do $post_harpie_passcode$
declare
  v_external_card_id bigint;
  v_format_eligible boolean;
begin
  select external_card_id, format_eligible
  into v_external_card_id, v_format_eligible
  from public.card_catalog
  where name = 'Harpie''s Pet Dragon - Fearsome Fire Blast';

  if v_external_card_id is distinct from 4991081 then
    raise exception 'POST-DEPLOY ABORTED: Harpie''s Pet Dragon - Fearsome Fire Blast external_card_id is %, expected 4991081 (04991081).', v_external_card_id;
  end if;

  if v_format_eligible is distinct from false then
    raise exception 'POST-DEPLOY ABORTED: Harpie''s Pet Dragon - Fearsome Fire Blast format_eligible is not false - it would leak into normal Draft/Shop/Special Packs.';
  end if;

  raise notice 'POST-DEPLOY: Harpie''s Pet Dragon - Fearsome Fire Blast confirmed passcode 4991081, format_eligible = false.';
end $post_harpie_passcode$;

do $post_zero_overlaps$
declare
  v_overlap_count int;
begin
  select count(*) into v_overlap_count
  from public.boss_route_stages brs
  join public.boss_route_stage_grants g on g.card_catalog_id = brs.evolution_card_catalog_id
  join public.boss_route_stages gs on gs.id = g.stage_id and gs.route_id = brs.route_id;

  if v_overlap_count <> 0 then
    raise exception 'POST-DEPLOY ABORTED: % evolution/support-grant overlap(s) remain across the 20 routes - expected zero.', v_overlap_count;
  end if;

  raise notice 'POST-DEPLOY: zero evolution/support-grant overlaps across all 20 Boss Routes.';
end $post_zero_overlaps$;

do $post_special_packs$
declare
  v_def_count int;
  v_pool_total int;
  v_stage4_leaks int;
  v_exclusive_leaks int;
begin
  select count(*) into v_def_count from public.shop_special_pack_definitions;
  if v_def_count <> 15 then
    raise exception 'POST-DEPLOY ABORTED: expected 15 shop_special_pack_definitions, found %.', v_def_count;
  end if;

  select count(*) into v_pool_total from public.shop_special_pack_pool_cards;
  if v_pool_total <> 3978 then
    raise exception 'POST-DEPLOY ABORTED: expected 3978 total shop_special_pack_pool_cards rows, found %. (Lemon/Chocolate Magician Girl were removed from arcane_circle during pre-deploy reconciliation, bringing the total from 3980 to 3978 - see the deployment notes.)', v_pool_total;
  end if;

  select count(*) into v_stage4_leaks
  from public.shop_special_pack_pool_cards spc
  where exists (
    select 1 from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = spc.card_catalog_id and brs.stage_number = 4
  );
  if v_stage4_leaks <> 0 then
    raise exception 'POST-DEPLOY ABORTED: % Special Pack pool row(s) reference a Stage 4 Boss evolution monster.', v_stage4_leaks;
  end if;

  select count(*) into v_exclusive_leaks
  from public.shop_special_pack_pool_cards spc
  where exists (
    select 1 from public.boss_route_stage_grants brg
    where brg.card_catalog_id = spc.card_catalog_id and brg.is_route_exclusive = true
  );
  if v_exclusive_leaks <> 0 then
    raise exception 'POST-DEPLOY ABORTED: % Special Pack pool row(s) reference an is_route_exclusive support card (check Lemon/Chocolate Magician Girl in particular).', v_exclusive_leaks;
  end if;

  raise notice 'POST-DEPLOY: 15 Special Pack definitions, % total pool rows, zero Stage-4 leaks, zero route-exclusive leaks (including the reconciled Lemon/Chocolate Magician Girl check).', v_pool_total;
end $post_special_packs$;

do $post_dark_magician_starters$
declare
  v_counts record;
begin
  select
    count(*) filter (where c.name = 'Berry Magician Girl') as berry,
    count(*) filter (where c.name = 'Lemon Magician Girl') as lemon,
    count(*) filter (where c.name = 'Chocolate Magician Girl') as chocolate
  into v_counts
  from public.card_instances ci
  join public.profiles p on p.id = ci.current_owner_id
  join public.card_catalog c on c.id = ci.card_catalog_id
  where lower(p.username) = 'bossg'
    and c.name in ('Berry Magician Girl', 'Lemon Magician Girl', 'Chocolate Magician Girl');

  if v_counts.berry <> 1 or v_counts.lemon <> 1 or v_counts.chocolate <> 1 then
    raise exception 'POST-DEPLOY ABORTED: bossg owns Berry=% Lemon=% Chocolate=% - expected exactly 1 of each. This deploy must never change bossg''s existing manual card_instances.', v_counts.berry, v_counts.lemon, v_counts.chocolate;
  end if;

  raise notice 'POST-DEPLOY: bossg confirmed owning exactly 1 Berry Magician Girl, 1 Lemon Magician Girl, 1 Chocolate Magician Girl - unchanged by this deploy.';
end $post_dark_magician_starters$;

do $post_welcome_bonus$
declare
  v_marker_count int;
  v_voucher_rows_now int;
  v_snap record;
begin
  select * into v_snap from pre_deploy_snapshot;

  select count(*) into v_marker_count
  from public.season1_welcome_bonus_claims c
  join public.profiles p on p.id = c.profile_id
  where lower(p.username) in ('bossg', 'samo', 'fardin');

  if v_marker_count <> 3 then
    raise exception 'POST-DEPLOY ABORTED: expected exactly 3 season1_welcome_bonus_claims rows for bossg/samo/fardin, found %.', v_marker_count;
  end if;

  select count(*) into v_voucher_rows_now
  from public.reward_vouchers rv
  join public.profiles p on p.id = rv.profile_id
  where lower(p.username) in ('bossg', 'samo', 'fardin')
    and rv.source_type = 'season1_welcome_bonus';

  if v_voucher_rows_now <> v_snap.welcome_voucher_rows_for_the_3 then
    raise exception 'POST-DEPLOY ABORTED: season1_welcome_bonus reward_vouchers row count for bossg/samo/fardin changed from % to % - this deploy must create ZERO new welcome vouchers for these 3 already-granted players.', v_snap.welcome_voucher_rows_for_the_3, v_voucher_rows_now;
  end if;

  raise notice 'POST-DEPLOY: bossg/samo/fardin welcome-bonus marker confirmed present (3/3), zero new welcome vouchers created by this deploy (% -> %, unchanged).', v_snap.welcome_voucher_rows_for_the_3, v_voucher_rows_now;
end $post_welcome_bonus$;

do $post_unchanged_state$
declare
  v_snap record;
  v_league_members_now int;
  v_player_boss_paths_now int;
  v_drafts_completed_now int;
  v_draft_players_now int;
  v_total_card_instances_now int;
  v_boss_progress_signature_now text;
  v_draft_progress_signature_now text;
begin
  select * into v_snap from pre_deploy_snapshot;

  select count(*) into v_league_members_now from public.league_members;
  select count(*) into v_player_boss_paths_now from public.player_boss_paths;
  select count(*) into v_drafts_completed_now from public.drafts where status = 'completed';
  select count(*) into v_draft_players_now from public.draft_players;
  select count(*) into v_total_card_instances_now from public.card_instances;

  -- Season 1 audit round-2 (2026-09-02) hardening: exact per-player
  -- signature check for bossg/samo/fardin - catches a stage/route/
  -- draft-status VALUE changing even when the row counts above stay
  -- identical (see the snapshot column's own comment for why the
  -- counts alone are not sufficient).
  select string_agg(
    format('%s:%s:%s:%s:%s', p.username, pbp.route_slot, pbp.route_id, pbp.current_stage, coalesce(pbp.mastered_at::text, 'null')),
    '|' order by p.username, pbp.route_slot
  )
  into v_boss_progress_signature_now
  from public.player_boss_paths pbp
  join public.profiles p on p.id = pbp.profile_id
  where lower(p.username) in ('bossg', 'samo', 'fardin');

  select string_agg(
    format('%s:%s:%s:%s:%s', p.username, dp.status, dp.main_picks_completed, dp.fusion_picks_completed, dp.xyz_picks_completed),
    '|' order by p.username, dp.id
  )
  into v_draft_progress_signature_now
  from public.draft_players dp
  join public.profiles p on p.id = dp.profile_id
  where lower(p.username) in ('bossg', 'samo', 'fardin');

  if v_boss_progress_signature_now is distinct from v_snap.boss_progress_signature_for_the_3 then
    raise exception 'POST-DEPLOY ABORTED: bossg/samo/fardin''s exact Boss Route progress changed - before="%" after="%". This deploy must never alter an existing player''s route_slot, route_id, current_stage, or mastered_at.', v_snap.boss_progress_signature_for_the_3, v_boss_progress_signature_now;
  end if;

  if v_draft_progress_signature_now is distinct from v_snap.draft_progress_signature_for_the_3 then
    raise exception 'POST-DEPLOY ABORTED: bossg/samo/fardin''s exact Initial Draft progress changed - before="%" after="%". This deploy must never alter an existing player''s draft status or pick counts.', v_snap.draft_progress_signature_for_the_3, v_draft_progress_signature_now;
  end if;

  if v_league_members_now <> v_snap.league_members_count then
    raise exception 'POST-DEPLOY ABORTED: league_members count changed from % to % - this deploy must not change league memberships.', v_snap.league_members_count, v_league_members_now;
  end if;

  if v_player_boss_paths_now <> v_snap.player_boss_paths_count then
    raise exception 'POST-DEPLOY ABORTED: player_boss_paths count changed from % to % - this deploy must not change any player''s selected boss route/progress.', v_snap.player_boss_paths_count, v_player_boss_paths_now;
  end if;

  if v_drafts_completed_now <> v_snap.drafts_completed_count then
    raise exception 'POST-DEPLOY ABORTED: completed drafts count changed from % to % - this deploy must not reset or alter initial draft completion state.', v_snap.drafts_completed_count, v_drafts_completed_now;
  end if;

  if v_draft_players_now <> v_snap.draft_players_count then
    raise exception 'POST-DEPLOY ABORTED: draft_players row count changed from % to % - this deploy must not touch draft state.', v_snap.draft_players_count, v_draft_players_now;
  end if;

  if v_total_card_instances_now <> v_snap.total_card_instances_count then
    raise exception 'POST-DEPLOY ABORTED: total card_instances count changed from % to % - this deploy must not create, delete, or modify any card_instances row (all its changes are to route/pack CONFIGURATION tables only).', v_snap.total_card_instances_count, v_total_card_instances_now;
  end if;

  raise notice 'POST-DEPLOY: league_members (%), player_boss_paths (%), completed drafts (%), draft_players (%), and total card_instances (%) all confirmed UNCHANGED by this deploy.',
    v_league_members_now, v_player_boss_paths_now, v_drafts_completed_now, v_draft_players_now, v_total_card_instances_now;

  raise notice 'POST-DEPLOY: bossg/samo/fardin exact Boss Route and Initial Draft progress signatures confirmed UNCHANGED by this deploy.';
end $post_unchanged_state$;

-- =========================================================
-- Season 1 audit round-3 (2026-09-02) hardening: BOSS ROUTE
-- REWARD-CARD PRESERVATION CHECK (ALL existing Boss Route
-- participants). Pairs with pre_deploy_boss_reward_snapshot above.
--
-- Deliberately does NOT read boss_route_stages or
-- boss_route_stage_grants at all - only player_boss_paths (progress)
-- and card_instances (actual owned cards) - so a pure route
-- CONFIGURATION change made by this same deploy (stage-identity
-- fixes, duplicate support-grant removals, etc.) can never trip this
-- check. It fails only if an existing player's actual progress or
-- actual owned reward cards changed, which must never happen from a
-- configuration-only migration.
-- =========================================================

do $post_boss_reward_preservation$
declare
  v_changed_count int;
  v_changed_detail text;
  v_snapshot_player_count int;
begin
  select count(*) into v_snapshot_player_count from pre_deploy_boss_reward_snapshot;

  select
    count(*),
    string_agg(
      format(
        '%s (route progress before="%s" after="%s"; reward count before=%s after=%s; reward cards before="%s" after="%s")',
        snap.username,
        snap.route_progress_signature, now_state.route_progress_signature,
        snap.boss_reward_card_count, now_state.boss_reward_card_count,
        snap.boss_reward_card_signature, now_state.boss_reward_card_signature
      ),
      '; '
    )
  into v_changed_count, v_changed_detail
  from pre_deploy_boss_reward_snapshot snap
  join lateral (
    select
      (
        select string_agg(
          format('%s:%s:%s:%s', pbp.route_slot, pbp.route_id, pbp.current_stage, coalesce(pbp.mastered_at::text, 'null')),
          '|' order by pbp.route_slot
        )
        from public.player_boss_paths pbp
        where pbp.profile_id = snap.profile_id
      ) as route_progress_signature,
      (
        select count(*)
        from public.card_instances ci
        join public.player_boss_paths pbp2 on pbp2.id = ci.original_source_id
        where ci.original_acquisition_type = 'achievement'
          and pbp2.profile_id = snap.profile_id
      ) as boss_reward_card_count,
      (
        select coalesce(
          string_agg(format('%s:%s', x.card_catalog_id, x.card_count), '|' order by x.card_catalog_id),
          ''
        )
        from (
          select ci.card_catalog_id, count(*) as card_count
          from public.card_instances ci
          join public.player_boss_paths pbp2 on pbp2.id = ci.original_source_id
          where ci.original_acquisition_type = 'achievement'
            and pbp2.profile_id = snap.profile_id
          group by ci.card_catalog_id
        ) x
      ) as boss_reward_card_signature
  ) now_state on true
  where now_state.route_progress_signature is distinct from snap.route_progress_signature
     or now_state.boss_reward_card_count is distinct from snap.boss_reward_card_count
     or now_state.boss_reward_card_signature is distinct from snap.boss_reward_card_signature;

  if v_changed_count > 0 then
    raise exception 'POST-DEPLOY ABORTED: % of % existing Boss Route participant(s) had their route progress or Boss Route reward-card ownership change during this deploy. This must NEVER happen from a boss_route_stages/boss_route_stage_grants CONFIGURATION change alone - existing rewards are grandfathered. Details: %', v_changed_count, v_snapshot_player_count, v_changed_detail;
  end if;

  raise notice 'POST-DEPLOY: all % existing Boss Route participant(s) confirmed to have IDENTICAL route progress and Boss Route reward-card ownership before and after this deploy - zero retroactive grants, zero losses.',
    v_snapshot_player_count;
end $post_boss_reward_preservation$;

do $post_final_summary$
begin
  raise notice '=========================================================';
  raise notice 'ALL POST-DEPLOY ASSERTIONS PASSED. Committing.';
  raise notice '=========================================================';
end $post_final_summary$;

commit;
