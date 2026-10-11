-- =========================================================
-- FARDIN INITIAL DRAFT — READ-ONLY FORENSIC AUDIT
-- (Duelist Circle Season 1, requested 2026-09-02)
--
-- Player under review : fardin
-- profile_id           : 68e8922e-774e-44c0-9254-99cc03690efa
--
-- THIS SCRIPT IS 100% READ-ONLY.
-- It contains ONLY `select` / `with ... select` statements. It never
-- inserts, updates, deletes, truncates, creates, alters, drops, grants,
-- revokes, or calls any mutating function. Safe to run against
-- production at any time, as many times as needed, in any order, by
-- anyone with read access to these tables.
--
-- HOW TO RUN
-- The Supabase SQL Editor generally only shows the result grid of the
-- LAST statement in a multi-statement run. To see every section's
-- output, run this file ONE SECTION AT A TIME (select the section's
-- text, then Run) rather than the whole file in one click. Sections
-- are numbered and banner-commented to match the forensic audit
-- request this was built for.
--
-- WHAT THIS CANNOT TELL YOU
-- - It cannot prove or disprove intent - only what the database
--   actually recorded.
-- - card_catalog.format_eligible / master_duel_status / game_rarity
--   and boss_route_* flags reflect CURRENT values, not a historical
--   snapshot at the moment of each pick. If any of these changed on a
--   card AFTER a given pick, a PASS/FAIL here judges today's rules,
--   not necessarily the rules live at pick time. Cross-reference
--   anything borderline against the migration/git timeline in the
--   accompanying audit report.
-- - There is no session/IP/request-log table in this schema. This
--   script cannot show HOW a request was made (UI click vs a direct
--   RPC/API call) - only what ultimately got committed.
-- =========================================================


-- =========================================================
-- SECTION 0 — RESOLVE TARGET PLAYERS
--
-- Fardin is resolved by the exact profile_id given. BossG is resolved
-- by the profile_id that was found hardcoded into a since-removed
-- draft rarity override (see the audit report) OR by username, in
-- case that hardcoded id is stale. Samo is resolved by username only
-- (no id was supplied) - if this returns zero or multiple rows,
-- adjust the filter and re-run.
-- =========================================================

select
  'fardin' as label,
  p.id as profile_id,
  p.username,
  p.duelist_name
from public.profiles p
where p.id = '68e8922e-774e-44c0-9254-99cc03690efa'::uuid

union all

select
  'bossg' as label,
  p.id,
  p.username,
  p.duelist_name
from public.profiles p
where p.id = 'f70f60ca-85cc-4cfc-8dee-86672b296775'::uuid
   or lower(p.username) = 'bossg'
   or lower(p.duelist_name) = 'bossg'

union all

select
  'samo' as label,
  p.id,
  p.username,
  p.duelist_name
from public.profiles p
where lower(p.username) = 'samo'
   or lower(p.duelist_name) = 'samo'

order by label;


-- =========================================================
-- SECTION 1 — FARDIN'S DRAFT SESSION(S)
--
-- IDs, created/completed timestamps, status, and a running count of
-- how many draft_players rows exist for this profile_id (should be
-- exactly 1 — the Initial Draft is meant to be one-time-per-player;
-- see SECTION 5 if this is not 1).
-- =========================================================

select
  d.id as draft_id,
  d.name as draft_name,
  d.status as draft_status,
  d.created_at as draft_created_at,
  d.started_at as draft_started_at,
  d.completed_at as draft_completed_at,
  d.main_picks_per_player,
  d.fusion_picks_per_player,
  d.xyz_picks_per_player,
  d.options_per_pick,
  dp.id as draft_player_id,
  dp.status as player_status,
  dp.joined_at as player_joined_at,
  dp.completed_at as player_completed_at,
  dp.main_picks_completed,
  dp.fusion_picks_completed,
  dp.xyz_picks_completed,
  count(*) over () as total_draft_player_rows_for_fardin
from public.draft_players dp
join public.drafts d
  on d.id = dp.draft_id
where dp.profile_id = '68e8922e-774e-44c0-9254-99cc03690efa'::uuid
order by d.created_at, dp.joined_at;


-- =========================================================
-- SECTION 2 — EVERY DRAFT PICK, CHRONOLOGICAL ORDER
--
-- pick number, timestamp, phase, all 3 offered cards + their
-- rarities, the selected card, and whether the selected card was
-- actually one of the 3 offered (cross-checked against
-- draft_offer_cards, not just re-derived from this same row).
-- =========================================================

with fardin_draft_players as (
  select dp.id as draft_player_id
  from public.draft_players dp
  where dp.profile_id = '68e8922e-774e-44c0-9254-99cc03690efa'::uuid
),
offer_cards_agg as (
  select
    doc.offer_id,
    count(*) as offered_card_count,
    count(distinct doc.card_catalog_id) as distinct_card_count,
    count(distinct cc.game_rarity) as distinct_rarity_count,
    max(case when doc.display_order = 1 then cc.name end) as offer_card_1,
    max(case when doc.display_order = 1 then cc.game_rarity end) as offer_card_1_rarity,
    max(case when doc.display_order = 2 then cc.name end) as offer_card_2,
    max(case when doc.display_order = 2 then cc.game_rarity end) as offer_card_2_rarity,
    max(case when doc.display_order = 3 then cc.name end) as offer_card_3,
    max(case when doc.display_order = 3 then cc.game_rarity end) as offer_card_3_rarity
  from public.draft_offer_cards doc
  join public.card_catalog cc
    on cc.id = doc.card_catalog_id
  group by doc.offer_id
)
select
  p.pick_number,
  p.created_at as picked_at,
  p.phase,
  p.phase_pick_number,
  o.rolled_rarity as offer_rolled_rarity,
  oc.offer_card_1,
  oc.offer_card_1_rarity,
  oc.offer_card_2,
  oc.offer_card_2_rarity,
  oc.offer_card_3,
  oc.offer_card_3_rarity,
  oc.offered_card_count,
  oc.distinct_rarity_count,
  sc.name as selected_card,
  sc.game_rarity as selected_card_rarity,
  p.card_catalog_id as selected_card_id,
  exists (
    select 1
    from public.draft_offer_cards doc2
    where doc2.offer_id = p.offer_id
      and doc2.card_catalog_id = p.card_catalog_id
      and doc2.status = 'selected'
  ) as selected_card_was_in_offer,
  p.card_instance_id
from public.draft_picks p
join fardin_draft_players fp
  on fp.draft_player_id = p.draft_player_id
join public.draft_offers o
  on o.id = p.offer_id
left join offer_cards_agg oc
  on oc.offer_id = o.id
join public.card_catalog sc
  on sc.id = p.card_catalog_id
order by p.pick_number;


-- =========================================================
-- SECTION 3 — PER-PICK VALIDATION (PASS/FAIL)
--
-- One row per pick, with an explicit PASS/FAIL column for every rule
-- the Initial Draft is supposed to enforce. Remember the caveat in
-- the header: eligibility/exclusion checks use CURRENT card_catalog /
-- boss_route_* data, not a historical snapshot.
-- =========================================================

with fardin_draft_players as (
  select dp.id as draft_player_id
  from public.draft_players dp
  where dp.profile_id = '68e8922e-774e-44c0-9254-99cc03690efa'::uuid
),
offer_stats as (
  select
    doc.offer_id,
    count(*) as offered_card_count,
    count(distinct cc.game_rarity) as distinct_rarity_count
  from public.draft_offer_cards doc
  join public.card_catalog cc
    on cc.id = doc.card_catalog_id
  group by doc.offer_id
)
select
  p.pick_number,
  p.phase,
  sc.name as selected_card,
  sc.game_rarity as selected_card_rarity,

  (os.offered_card_count = 3)
    as pass_exactly_3_offered,

  (os.distinct_rarity_count = 1)
    as pass_same_rarity_offer,

  exists (
    select 1
    from public.draft_offer_cards doc2
    where doc2.offer_id = p.offer_id
      and doc2.card_catalog_id = p.card_catalog_id
      and doc2.status = 'selected'
  ) as pass_selected_was_offered,

  coalesce(sc.format_eligible, false)
    as pass_card_currently_format_eligible,

  (sc.game_rarity is distinct from 'Legendary')
    as pass_not_legendary,

  not exists (
    select 1
    from public.boss_route_stages brs
    where brs.evolution_card_catalog_id = p.card_catalog_id
      and brs.stage_number = 4
  ) as pass_not_stage4_boss,

  not exists (
    select 1
    from public.boss_route_stage_grants brg
    where brg.card_catalog_id = p.card_catalog_id
      and brg.is_route_exclusive = true
  ) as pass_not_route_exclusive

from public.draft_picks p
join fardin_draft_players fp
  on fp.draft_player_id = p.draft_player_id
join public.draft_offers o
  on o.id = p.offer_id
left join offer_stats os
  on os.offer_id = o.id
join public.card_catalog sc
  on sc.id = p.card_catalog_id
order by p.pick_number;


-- =========================================================
-- SECTION 4 — FINAL DRAFT TOTALS
--
-- Expected: Main = 60, Fusion = 2, Xyz = 2, Total = 64.
-- =========================================================

with fardin_draft_players as (
  select dp.id as draft_player_id
  from public.draft_players dp
  where dp.profile_id = '68e8922e-774e-44c0-9254-99cc03690efa'::uuid
)
select
  count(*) filter (where p.phase = 'main') as main_count,
  count(*) filter (where p.phase = 'fusion') as fusion_count,
  count(*) filter (where p.phase = 'xyz') as xyz_count,
  count(*) as total_count,
  (count(*) filter (where p.phase = 'main') = 60) as main_count_pass,
  (count(*) filter (where p.phase = 'fusion') = 2) as fusion_count_pass,
  (count(*) filter (where p.phase = 'xyz') = 2) as xyz_count_pass,
  (count(*) = 64) as total_count_pass
from public.draft_picks p
join fardin_draft_players fp
  on fp.draft_player_id = p.draft_player_id;


-- =========================================================
-- SECTION 5 — ANOMALY / ABUSE DETECTION PANEL
--
-- Every row here is a structural check with an expected finding_count
-- of 0 (status = OK). Any row showing status = FLAG deserves manual
-- follow-up — it does not by itself prove cheating, but it is
-- something the normal draft flow should never produce.
-- =========================================================

with fardin_draft_players as (
  select
    dp.id as draft_player_id,
    dp.draft_id,
    dp.status,
    dp.joined_at,
    dp.completed_at
  from public.draft_players dp
  where dp.profile_id = '68e8922e-774e-44c0-9254-99cc03690efa'::uuid
),
fardin_picks as (
  select p.*
  from public.draft_picks p
  join fardin_draft_players fp
    on fp.draft_player_id = p.draft_player_id
)
select 'Multiple draft_players rows for this profile_id (expect 1)' as check_name,
       count(*)::text as finding_count,
       case when count(*) <> 1 then 'FLAG' else 'OK' end as status
from fardin_draft_players

union all

select 'Multiple drafts rows created_by this profile_id',
       count(*)::text,
       case when count(*) > 1 then 'FLAG' else 'OK' end
from public.drafts
where created_by = '68e8922e-774e-44c0-9254-99cc03690efa'::uuid

union all

select 'draft_players rows with status = completed for this profile (expect <= 1)',
       count(*)::text,
       case when count(*) > 1 then 'FLAG' else 'OK' end
from fardin_draft_players
where status = 'completed'

union all

select 'Near-simultaneous draft_players.joined_at rows (< 5s apart) — possible double-submit start',
       count(*)::text,
       case when count(*) > 0 then 'FLAG' else 'OK' end
from (
  select joined_at,
         lag(joined_at) over (order by joined_at) as prev_joined_at
  from fardin_draft_players
) j
where prev_joined_at is not null
  and joined_at - prev_joined_at < interval '5 seconds'

union all

select 'Duplicate pick_number within a single draft_player',
       count(*)::text,
       case when count(*) > 0 then 'FLAG' else 'OK' end
from (
  select draft_player_id, pick_number, count(*) as c
  from fardin_picks
  group by draft_player_id, pick_number
  having count(*) > 1
) dup

union all

select 'Duplicate card_instance_id reused across multiple draft_picks rows',
       count(*)::text,
       case when count(*) > 0 then 'FLAG' else 'OK' end
from (
  select card_instance_id, count(*) as c
  from fardin_picks
  group by card_instance_id
  having count(*) > 1
) dup

union all

select 'draft_offers with status = expired (no code path in this repo ever sets this)',
       count(*)::text,
       case when count(*) > 0 then 'FLAG' else 'OK' end
from public.draft_offers o
join fardin_draft_players fp
  on fp.draft_player_id = o.draft_player_id
where o.status = 'expired'

union all

select 'Offers that do not have exactly 3 offer_cards',
       count(*)::text,
       case when count(*) > 0 then 'FLAG' else 'OK' end
from (
  select o.id
  from public.draft_offers o
  join fardin_draft_players fp
    on fp.draft_player_id = o.draft_player_id
  join public.draft_offer_cards doc
    on doc.offer_id = o.id
  group by o.id
  having count(*) <> 3
) bad

union all

select 'Offers whose 3 cards are not all the same rarity',
       count(*)::text,
       case when count(*) > 0 then 'FLAG' else 'OK' end
from (
  select doc.offer_id
  from public.draft_offer_cards doc
  join public.card_catalog cc
    on cc.id = doc.card_catalog_id
  join public.draft_offers o
    on o.id = doc.offer_id
  join fardin_draft_players fp
    on fp.draft_player_id = o.draft_player_id
  group by doc.offer_id
  having count(distinct cc.game_rarity) > 1
) bad

union all

select 'Picks where the selected card was not among the 3 offered',
       count(*)::text,
       case when count(*) > 0 then 'FLAG' else 'OK' end
from fardin_picks p
where not exists (
  select 1
  from public.draft_offer_cards doc
  where doc.offer_id = p.offer_id
    and doc.card_catalog_id = p.card_catalog_id
    and doc.status = 'selected'
)

union all

select 'Gaps in the pick_number sequence (1..max, per draft_player)',
       count(*)::text,
       case when count(*) > 0 then 'FLAG' else 'OK' end
from (
  select fp.draft_player_id, gs.expected_pick
  from fardin_draft_players fp
  cross join lateral generate_series(
    1,
    coalesce((select max(pick_number) from fardin_picks p2 where p2.draft_player_id = fp.draft_player_id), 0)
  ) as gs(expected_pick)
) expected
left join fardin_picks p
  on p.draft_player_id = expected.draft_player_id
  and p.pick_number = expected.expected_pick
where p.id is null

union all

select 'Picks with non-increasing created_at given pick_number order (impossible ordering)',
       count(*)::text,
       case when count(*) > 0 then 'FLAG' else 'OK' end
from (
  select *,
         lag(created_at) over (partition by draft_player_id order by pick_number) as prev_created_at
  from fardin_picks
) seq
where prev_created_at is not null
  and created_at < prev_created_at

union all

select 'card_instances (draft-acquired, currently owned by Fardin) with no matching draft_picks row',
       count(*)::text,
       case when count(*) > 0 then 'FLAG' else 'OK' end
from public.card_instances ci
left join public.draft_picks dpk
  on dpk.card_instance_id = ci.id
where ci.current_owner_id = '68e8922e-774e-44c0-9254-99cc03690efa'::uuid
  and ci.original_acquisition_type = 'draft'
  and dpk.id is null

union all

select 'Valid Fardin draft_picks rows whose card_instance row no longer exists',
       count(*)::text,
       case when count(*) > 0 then 'FLAG' else 'OK' end
from fardin_picks p
left join public.card_instances ci
  on ci.id = p.card_instance_id
where ci.id is null

union all

select 'Selected cards with game_rarity = Legendary (should be zero)',
       count(*)::text,
       case when count(*) > 0 then 'FLAG' else 'OK' end
from fardin_picks p
join public.card_catalog cc
  on cc.id = p.card_catalog_id
where cc.game_rarity = 'Legendary'

union all

select 'Selected cards that are a Stage 4 Boss Route evolution monster',
       count(*)::text,
       case when count(*) > 0 then 'FLAG' else 'OK' end
from fardin_picks p
where exists (
  select 1
  from public.boss_route_stages brs
  where brs.evolution_card_catalog_id = p.card_catalog_id
    and brs.stage_number = 4
)

union all

select 'Selected cards flagged is_route_exclusive = true',
       count(*)::text,
       case when count(*) > 0 then 'FLAG' else 'OK' end
from fardin_picks p
where exists (
  select 1
  from public.boss_route_stage_grants brg
  where brg.card_catalog_id = p.card_catalog_id
    and brg.is_route_exclusive = true
)

order by status desc, check_name;


-- =========================================================
-- SECTION 6 — INVENTORY RECONCILIATION
--
-- Every card_instance currently owned by Fardin whose
-- original_acquisition_type = 'draft', matched to the exact draft
-- pick that produced it. Anything with reconciliation_note starting
-- "FLAG" cannot be explained by a valid draft pick and deserves
-- manual review.
-- =========================================================

select
  ci.id as card_instance_id,
  cc.name as card_name,
  cc.game_rarity,
  ci.copy_number,
  ci.current_owner_id,
  ci.original_owner_id,
  ci.original_acquisition_type,
  ci.original_source_id as source_draft_id,
  ci.created_at as instance_created_at,
  dpk.id as matching_draft_pick_id,
  dpk.pick_number,
  dpk.phase,
  dpk.created_at as pick_created_at,
  case
    when dpk.id is not null
     and ci.original_owner_id = '68e8922e-774e-44c0-9254-99cc03690efa'::uuid
      then 'OK: matches a valid Fardin draft pick'
    when dpk.id is not null
     and ci.original_owner_id <> '68e8922e-774e-44c0-9254-99cc03690efa'::uuid
      then 'CHECK: originally drafted by a different player, later acquired by Fardin (trade/gift?)'
    when dpk.id is null
      then 'FLAG: no matching draft_picks row - not explained by any draft pick'
  end as reconciliation_note
from public.card_instances ci
join public.card_catalog cc
  on cc.id = ci.card_catalog_id
left join public.draft_picks dpk
  on dpk.card_instance_id = ci.id
where ci.current_owner_id = '68e8922e-774e-44c0-9254-99cc03690efa'::uuid
  and ci.original_acquisition_type = 'draft'
order by ci.created_at;


-- =========================================================
-- SECTION 7A — RARITY DISTRIBUTION: FARDIN vs BOSSG vs SAMO
--
-- Compares the three named players' Initial Draft rarity outcomes
-- side by side. A skewed result on its own is NOT proof of cheating —
-- see SECTION 7D for the mechanics this should be judged against.
-- =========================================================

with target_players as (
  select '68e8922e-774e-44c0-9254-99cc03690efa'::uuid as profile_id, 'fardin' as label
  union all
  select 'f70f60ca-85cc-4cfc-8dee-86672b296775'::uuid, 'bossg'
  union all
  select p.id, 'samo'
  from public.profiles p
  where lower(p.username) = 'samo' or lower(p.duelist_name) = 'samo'
),
player_picks as (
  select tp.label, p.phase, cc.game_rarity
  from target_players tp
  join public.draft_players dp
    on dp.profile_id = tp.profile_id
  join public.draft_picks p
    on p.draft_player_id = dp.id
  join public.card_catalog cc
    on cc.id = p.card_catalog_id
)
select
  label,
  count(*) filter (where game_rarity = 'Normal') as normal_count,
  count(*) filter (where game_rarity = 'Rare') as rare_count,
  count(*) filter (where game_rarity = 'Super Rare') as super_count,
  count(*) filter (where game_rarity = 'Ultra Rare') as ultra_count,
  count(*) filter (where game_rarity = 'Secret Rare') as secret_count,
  count(*) filter (where game_rarity = 'Legendary') as legendary_count,
  count(*) as total_picks,
  count(*) filter (where phase in ('fusion','xyz') and game_rarity in ('Super Rare','Ultra Rare')) as extra_deck_super_or_ultra_hits,
  count(*) filter (where phase in ('fusion','xyz')) as extra_deck_total
from player_picks
group by label
order by label;


-- =========================================================
-- SECTION 7B — FARDIN: ARCHETYPE / THEME CLUSTERS
--
-- Only shows archetypes where Fardin holds 2 or more cards linked in
-- archetype_cards - i.e. the repo's own archetype registry, not a
-- name-guessing heuristic.
-- =========================================================

with fardin_draft_players as (
  select dp.id as draft_player_id
  from public.draft_players dp
  where dp.profile_id = '68e8922e-774e-44c0-9254-99cc03690efa'::uuid
)
select
  ar.name as archetype,
  ar.code as archetype_code,
  count(*) as card_count,
  string_agg(cc.name, ', ' order by cc.name) as fardin_cards_in_archetype
from public.draft_picks p
join fardin_draft_players fp
  on fp.draft_player_id = p.draft_player_id
join public.card_catalog cc
  on cc.id = p.card_catalog_id
join public.archetype_cards ac
  on ac.card_catalog_id = cc.id
join public.archetype_registry ar
  on ar.id = ac.archetype_id
group by ar.name, ar.code
having count(*) >= 2
order by card_count desc, archetype;


-- =========================================================
-- SECTION 7C — FARDIN: SHARED ATTRIBUTE / MONSTER-TYPE CLUSTERS
--
-- Simpler synergy signal than archetype membership: cards sharing an
-- attribute or monster type, which is the basic backbone of most
-- constructed decks. Only groups of 2+ are shown.
-- =========================================================

with fardin_draft_players as (
  select dp.id as draft_player_id
  from public.draft_players dp
  where dp.profile_id = '68e8922e-774e-44c0-9254-99cc03690efa'::uuid
),
fardin_cards as (
  select cc.*
  from public.draft_picks p
  join fardin_draft_players fp
    on fp.draft_player_id = p.draft_player_id
  join public.card_catalog cc
    on cc.id = p.card_catalog_id
)
select 'attribute' as cluster_type, attribute as cluster_value, count(*) as card_count,
       string_agg(name, ', ' order by name) as cards
from fardin_cards
where attribute is not null
group by attribute
having count(*) >= 2

union all

select 'monster_type', monster_type, count(*),
       string_agg(name, ', ' order by name)
from fardin_cards
where monster_type is not null
group by monster_type
having count(*) >= 2

order by cluster_type, card_count desc;


-- =========================================================
-- SECTION 7D — EXPECTED MECHANICS FOR COMPARISON
--
-- The live rarity weights driving the Main-phase weighted roll
-- (Legendary is hard-excluded regardless of this table - see the
-- audit report). Fusion/Xyz picks are NOT randomly weighted at all:
-- pick 1 of each 2-pick mini-phase deterministically targets Super
-- Rare (cascading down only if supply is short) and pick 2 targets
-- Ultra Rare — so a Fusion/Xyz pick landing on Super or Ultra is the
-- INTENDED, guaranteed outcome, not luck. Compare SECTION 7A's
-- extra_deck_super_or_ultra_hits / extra_deck_total for each player
-- against this: all three players should show at or near 4/4 (2
-- Fusion + 2 Xyz) baseline, absent a supply shortfall that forced a
-- cascade to a lower tier that same pick.
-- =========================================================

select
  d.league_id,
  s.value as configured_rarity_weights
from public.settings s
join public.drafts d
  on d.league_id = s.league_id
where s.key = 'draft.rarity_weights'
group by d.league_id, s.value;


-- =========================================================
-- EXTENSION: SECTIONS 8-12 - THREE-PLAYER CROSS-CHECK
-- (added 2026-09-02, in response to confirmed live production
-- state: card_catalog currently reports 8,954 format_eligible
-- rows against an intended Classic pool of 6,181, and
-- duelist_circle_classic_v1 is still inactive)
--
-- STILL 100% READ-ONLY. Only select / with...select statements.
-- Does NOT call recompute_format_eligibility(), does NOT set
-- is_active, does NOT write release_stage, does NOT modify any
-- player's cards. Extends the single-player Fardin audit above to
-- all three named players (fardin, bossg, samo) so their Initial
-- Draft results can be compared under the same live eligibility
-- state and the same intended-Classic-pool approximation.
--
-- "In the intended Classic pool" below means: honors any explicit
-- format_card_overrides row for duelist_circle_classic_v1 (exclude
-- always wins, include always passes), and otherwise passes
-- classic_v1's own mechanic-type flags and release_cutoff.
-- release_stage is deliberately NOT consulted, because it is
-- unpopulated in production right now and this script does not
-- write it or call recompute_format_eligibility() - this is the
-- best safe, read-only approximation of Classic-pool membership
-- available without activating or recomputing anything. If
-- release_stage is populated later, cards currently counted as
-- "in the intended pool" here could still end up excluded once the
-- release_stage gate is live - this script cannot see that in
-- advance.
-- =========================================================


-- ---------------------------------------------------------
-- 8. DRAFT SESSION TIMESTAMPS - ALL THREE PLAYERS
--
-- One row per (player, draft_players session). A player with more
-- than one row here has more than one draft_players record for a
-- draft - see Section 12 (check: draft_player_session_count) for
-- whether that is flagged.
-- ---------------------------------------------------------

with target_players as (
  select id as profile_id, 'fardin'::text as player_label
  from public.profiles
  where id = '68e8922e-774e-44c0-9254-99cc03690efa'::uuid

  union all

  select id, 'bossg'::text
  from public.profiles
  where id = 'f70f60ca-85cc-4cfc-8dee-86672b296775'::uuid
  limit 1

  union all

  select id, 'samo'::text
  from public.profiles
  where username = 'samo'
  limit 1
)
select
  tp.player_label,
  tp.profile_id,
  d.id as draft_id,
  d.name as draft_name,
  d.status as draft_status,
  d.created_at as draft_created_at,
  d.started_at as draft_started_at,
  d.completed_at as draft_completed_at,
  dp.id as draft_player_id,
  dp.status as draft_player_status,
  dp.joined_at as player_joined_at,
  dp.completed_at as player_completed_at,
  dp.main_picks_completed,
  dp.fusion_picks_completed,
  dp.xyz_picks_completed
from target_players tp
join public.draft_players dp on dp.profile_id = tp.profile_id
join public.drafts d on d.id = dp.draft_id
order by tp.player_label, dp.joined_at nulls last, dp.id;


-- ---------------------------------------------------------
-- 9A. EVERY DRAFTED CARD - ALL THREE PLAYERS, WITH RARITY AND
--     RELEASE DATE/YEAR
-- ---------------------------------------------------------

with target_players as (
  select id as profile_id, 'fardin'::text as player_label
  from public.profiles
  where id = '68e8922e-774e-44c0-9254-99cc03690efa'::uuid

  union all

  select id, 'bossg'::text
  from public.profiles
  where id = 'f70f60ca-85cc-4cfc-8dee-86672b296775'::uuid
  limit 1

  union all

  select id, 'samo'::text
  from public.profiles
  where username = 'samo'
  limit 1
)
select
  tp.player_label,
  dp.id as draft_player_id,
  dpk.phase,
  dpk.pick_number,
  dpk.phase_pick_number,
  dpk.created_at as pick_created_at,
  cc.id as card_catalog_id,
  cc.name as card_name,
  cc.card_type,
  cc.game_rarity,
  do_.rolled_rarity as offer_rolled_rarity,
  cc.release_date,
  extract(year from cc.release_date) as release_year,
  cc.format_eligible
from target_players tp
join public.draft_players dp on dp.profile_id = tp.profile_id
join public.draft_picks dpk on dpk.draft_player_id = dp.id
join public.draft_offers do_ on do_.id = dpk.offer_id
join public.card_catalog cc on cc.id = dpk.card_catalog_id
order by tp.player_label, dpk.created_at, dpk.pick_number;


-- ---------------------------------------------------------
-- 9B. RARITY DISTRIBUTION PER PLAYER (drafted cards only)
--
-- Reproduces, in isolation, the same comparison already computed
-- alongside archetype/attribute clustering in Section 7A above -
-- included here again standalone so this three-player extension
-- can be run on its own.
-- ---------------------------------------------------------

with target_players as (
  select id as profile_id, 'fardin'::text as player_label
  from public.profiles
  where id = '68e8922e-774e-44c0-9254-99cc03690efa'::uuid

  union all

  select id, 'bossg'::text
  from public.profiles
  where id = 'f70f60ca-85cc-4cfc-8dee-86672b296775'::uuid
  limit 1

  union all

  select id, 'samo'::text
  from public.profiles
  where username = 'samo'
  limit 1
)
select
  tp.player_label,
  cc.game_rarity,
  count(*) as card_count
from target_players tp
join public.draft_players dp on dp.profile_id = tp.profile_id
join public.draft_picks dpk on dpk.draft_player_id = dp.id
join public.card_catalog cc on cc.id = dpk.card_catalog_id
group by tp.player_label, cc.game_rarity
order by tp.player_label, cc.game_rarity;


-- ---------------------------------------------------------
-- 10. DRAFTED CARDS OUTSIDE THE INTENDED 6,181-CARD CLASSIC POOL,
--     PER PLAYER (counts only - see Section 11 for the exact list)
-- ---------------------------------------------------------

with target_players as (
  select id as profile_id, 'fardin'::text as player_label
  from public.profiles
  where id = '68e8922e-774e-44c0-9254-99cc03690efa'::uuid

  union all

  select id, 'bossg'::text
  from public.profiles
  where id = 'f70f60ca-85cc-4cfc-8dee-86672b296775'::uuid
  limit 1

  union all

  select id, 'samo'::text
  from public.profiles
  where username = 'samo'
  limit 1
),
classic_fmt as (
  select id, release_cutoff, allow_fusion, allow_xyz,
         allow_synchro, allow_pendulum, allow_link
  from public.duelist_circle_formats
  where code = 'duelist_circle_classic_v1'
),
overrides as (
  select fco.card_catalog_id, fco.override_type
  from public.format_card_overrides fco
  join classic_fmt f on f.id = fco.format_id
),
drafted_cards as (
  select tp.player_label, dpk.id as pick_id, cc.*
  from target_players tp
  join public.draft_players dp on dp.profile_id = tp.profile_id
  join public.draft_picks dpk on dpk.draft_player_id = dp.id
  join public.card_catalog cc on cc.id = dpk.card_catalog_id
),
classified as (
  select
    dc.player_label,
    dc.pick_id,
    dc.id as card_catalog_id,
    dc.name as card_name,
    ov.override_type,
    (
      case
        when ov.override_type = 'exclude' then false
        when ov.override_type = 'include' then true
        else (
          not (lower(dc.card_type) like '%synchro%' and not f.allow_synchro)
          and not (lower(dc.card_type) like '%xyz%' and not f.allow_xyz)
          and not (lower(dc.card_type) like '%link%' and not f.allow_link)
          and not (lower(dc.card_type) like '%pendulum%' and not f.allow_pendulum)
          and not (lower(dc.card_type) like '%fusion%' and not f.allow_fusion)
          and (
            f.release_cutoff is null
            or dc.release_date is null
            or dc.release_date <= f.release_cutoff
          )
        )
      end
    ) as in_intended_classic_pool
  from drafted_cards dc
  cross join classic_fmt f
  left join overrides ov on ov.card_catalog_id = dc.id
)
select
  player_label,
  count(*) as total_drafted_cards,
  count(*) filter (where in_intended_classic_pool) as in_intended_classic_pool_count,
  count(*) filter (where not in_intended_classic_pool) as outside_intended_classic_pool_count
from classified
group by player_label
order by player_label;


-- ---------------------------------------------------------
-- 11. EXACT DRAFTED CARDS OUTSIDE THE INTENDED CLASSIC POOL, PER
--     PLAYER, WITH REASON
-- ---------------------------------------------------------

with target_players as (
  select id as profile_id, 'fardin'::text as player_label
  from public.profiles
  where id = '68e8922e-774e-44c0-9254-99cc03690efa'::uuid

  union all

  select id, 'bossg'::text
  from public.profiles
  where id = 'f70f60ca-85cc-4cfc-8dee-86672b296775'::uuid
  limit 1

  union all

  select id, 'samo'::text
  from public.profiles
  where username = 'samo'
  limit 1
),
classic_fmt as (
  select id, release_cutoff, allow_fusion, allow_xyz,
         allow_synchro, allow_pendulum, allow_link
  from public.duelist_circle_formats
  where code = 'duelist_circle_classic_v1'
),
overrides as (
  select fco.card_catalog_id, fco.override_type
  from public.format_card_overrides fco
  join classic_fmt f on f.id = fco.format_id
),
drafted_cards as (
  select tp.player_label, dpk.id as pick_id, dpk.phase, dpk.created_at as pick_created_at, cc.*
  from target_players tp
  join public.draft_players dp on dp.profile_id = tp.profile_id
  join public.draft_picks dpk on dpk.draft_player_id = dp.id
  join public.card_catalog cc on cc.id = dpk.card_catalog_id
)
select
  dc.player_label,
  dc.pick_id,
  dc.phase,
  dc.pick_created_at,
  dc.id as card_catalog_id,
  dc.name as card_name,
  dc.card_type,
  dc.game_rarity,
  dc.release_date,
  f.release_cutoff as classic_release_cutoff,
  ov.override_type,
  case
    when ov.override_type = 'exclude' then 'explicit format_card_overrides exclude row'
    when dc.release_date is not null and f.release_cutoff is not null and dc.release_date > f.release_cutoff
      then 'release_date after classic_v1 release_cutoff'
    when lower(dc.card_type) like '%synchro%' and not f.allow_synchro then 'mechanic: Synchro not allowed in classic_v1'
    when lower(dc.card_type) like '%xyz%' and not f.allow_xyz then 'mechanic: Xyz not allowed in classic_v1'
    when lower(dc.card_type) like '%link%' and not f.allow_link then 'mechanic: Link not allowed in classic_v1'
    when lower(dc.card_type) like '%pendulum%' and not f.allow_pendulum then 'mechanic: Pendulum not allowed in classic_v1'
    when lower(dc.card_type) like '%fusion%' and not f.allow_fusion then 'mechanic: Fusion not allowed in classic_v1'
    else 'unknown - inspect manually'
  end as exclusion_reason
from drafted_cards dc
cross join classic_fmt f
left join overrides ov on ov.card_catalog_id = dc.id
where
  case
    when ov.override_type = 'exclude' then true
    when ov.override_type = 'include' then false
    else not (
      not (lower(dc.card_type) like '%synchro%' and not f.allow_synchro)
      and not (lower(dc.card_type) like '%xyz%' and not f.allow_xyz)
      and not (lower(dc.card_type) like '%link%' and not f.allow_link)
      and not (lower(dc.card_type) like '%pendulum%' and not f.allow_pendulum)
      and not (lower(dc.card_type) like '%fusion%' and not f.allow_fusion)
      and (
        f.release_cutoff is null
        or dc.release_date is null
        or dc.release_date <= f.release_cutoff
      )
    )
  end
order by dc.player_label, dc.pick_created_at;


-- ---------------------------------------------------------
-- 12. THREE-PLAYER SESSION-INTEGRITY / ANOMALY PANEL
--
-- One row per (player, check) - every named player always appears
-- for every check, even at a zero count, because each check is a
-- scalar subquery driven from target_players rather than a
-- UNION ALL + GROUP BY (which silently drops a player/check
-- combination that happens to be zero). status = 'FLAG' means the
-- pattern is present in the data, not that it proves wrongdoing -
-- interpret alongside Sections 8-11 and the single-player
-- Section 5 panel above.
-- ---------------------------------------------------------

with target_players as (
  select id as profile_id, 'fardin'::text as player_label
  from public.profiles
  where id = '68e8922e-774e-44c0-9254-99cc03690efa'::uuid

  union all

  select id, 'bossg'::text
  from public.profiles
  where id = 'f70f60ca-85cc-4cfc-8dee-86672b296775'::uuid
  limit 1

  union all

  select id, 'samo'::text
  from public.profiles
  where username = 'samo'
  limit 1
)
select tp.player_label, 'draft_player_session_count' as check_label,
  (select count(*) from public.draft_players dp where dp.profile_id = tp.profile_id) as count_value,
  case when (select count(*) from public.draft_players dp where dp.profile_id = tp.profile_id) > 1
       then 'FLAG' else 'PASS' end as status
from target_players tp

union all

select tp.player_label, 'sessions_not_completed',
  (select count(*) from public.draft_players dp where dp.profile_id = tp.profile_id and dp.status <> 'completed'),
  case when (select count(*) from public.draft_players dp where dp.profile_id = tp.profile_id and dp.status <> 'completed') > 0
       then 'FLAG' else 'PASS' end
from target_players tp

union all

select tp.player_label, 'duplicate_card_catalog_id_in_main_phase',
  (select count(*) from (
     select dpk.card_catalog_id
     from public.draft_players dp
     join public.draft_picks dpk on dpk.draft_player_id = dp.id
     where dp.profile_id = tp.profile_id and dpk.phase = 'main'
     group by dpk.card_catalog_id
     having count(*) > 1
   ) dup),
  case when (select count(*) from (
     select dpk.card_catalog_id
     from public.draft_players dp
     join public.draft_picks dpk on dpk.draft_player_id = dp.id
     where dp.profile_id = tp.profile_id and dpk.phase = 'main'
     group by dpk.card_catalog_id
     having count(*) > 1
   ) dup) > 0
       then 'FLAG' else 'PASS' end
from target_players tp

union all

select tp.player_label, 'pick_number_gap_main_phase',
  (select greatest(coalesce(max(dpk.pick_number), 0) - count(*), 0)
     from public.draft_players dp
     join public.draft_picks dpk on dpk.draft_player_id = dp.id
     where dp.profile_id = tp.profile_id and dpk.phase = 'main'),
  case when (select greatest(coalesce(max(dpk.pick_number), 0) - count(*), 0)
     from public.draft_players dp
     join public.draft_picks dpk on dpk.draft_player_id = dp.id
     where dp.profile_id = tp.profile_id and dpk.phase = 'main') > 0
       then 'FLAG' else 'PASS' end
from target_players tp

union all

select tp.player_label, 'orphaned_draft_acquired_card_instances',
  (select count(*) from public.card_instances ci
     where ci.original_owner_id = tp.profile_id
       and ci.original_acquisition_type = 'draft'
       and ci.id not in (
         select dpk.card_instance_id
         from public.draft_players dp
         join public.draft_picks dpk on dpk.draft_player_id = dp.id
         where dp.profile_id = tp.profile_id
       )),
  case when (select count(*) from public.card_instances ci
     where ci.original_owner_id = tp.profile_id
       and ci.original_acquisition_type = 'draft'
       and ci.id not in (
         select dpk.card_instance_id
         from public.draft_players dp
         join public.draft_picks dpk on dpk.draft_player_id = dp.id
         where dp.profile_id = tp.profile_id
       )) > 0
       then 'FLAG' else 'PASS' end
from target_players tp

union all

select tp.player_label, 'expired_offers_count_informational',
  (select count(*) from public.draft_players dp
     join public.draft_offers do_ on do_.draft_player_id = dp.id
     where dp.profile_id = tp.profile_id and do_.status = 'expired'),
  case when (select count(*) from public.draft_players dp
     join public.draft_offers do_ on do_.draft_player_id = dp.id
     where dp.profile_id = tp.profile_id and do_.status = 'expired') > 0
       then 'FLAG' else 'PASS' end
from target_players tp

union all

select tp.player_label, 'picked_offers_without_matching_pick_row',
  (select count(*) from public.draft_players dp
     join public.draft_offers do_ on do_.draft_player_id = dp.id
     where dp.profile_id = tp.profile_id and do_.status = 'picked'
       and not exists (select 1 from public.draft_picks dpk where dpk.offer_id = do_.id)),
  case when (select count(*) from public.draft_players dp
     join public.draft_offers do_ on do_.draft_player_id = dp.id
     where dp.profile_id = tp.profile_id and do_.status = 'picked'
       and not exists (select 1 from public.draft_picks dpk where dpk.offer_id = do_.id)) > 0
       then 'FLAG' else 'PASS' end
from target_players tp

union all

select tp.player_label, 'concurrent_active_offers_right_now',
  (select count(*) from public.draft_players dp
     join public.draft_offers do_ on do_.draft_player_id = dp.id
     where dp.profile_id = tp.profile_id and do_.status = 'active'),
  case when (select count(*) from public.draft_players dp
     join public.draft_offers do_ on do_.draft_player_id = dp.id
     where dp.profile_id = tp.profile_id and do_.status = 'active') > 1
       then 'FLAG' else 'PASS' end
from target_players tp

order by 1, 2;
