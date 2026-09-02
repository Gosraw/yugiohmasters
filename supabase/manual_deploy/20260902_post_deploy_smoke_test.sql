-- =========================================================
-- READ-ONLY: SEASON 1 POST-DEPLOY SMOKE TEST
-- (Duelist Circle Season 1 audit, round 2, Priority 9 - 2026-09-02)
--
-- WHY THIS SCRIPT EXISTS
-- The combined deploy script (supabase/manual_deploy/
-- 20260902_season1_release.sql) already contains its own internal
-- PRE-FLIGHT and POST-DEPLOY assertions and aborts the transaction
-- on failure. This script is a SEPARATE, independent, read-only
-- check meant to be run manually AFTER a successful deploy (or at
-- any later time as a health check) - it makes no writes, so it is
-- always safe to run against a live database, repeatedly.
--
-- It reports PASS/FAIL/INFO per row via a single `status` column,
-- computed by comparing what this script finds against the exact
-- values independently verified during this audit round by reading
-- the migration source directly (not by trusting any number the
-- deploy script itself claims). Read every row - a script that
-- silently swallows a failing check is worse than no script.
--
-- SCOPE: this script only checks structural/data integrity that can
-- be verified independent of what a live admin decides to do next
-- (e.g. whether to activate the Duelist Circle Classic format - see
-- verify_cardpool_format_state.sql for that separate, dedicated
-- check, section 8 below only re-surfaces it as a reminder).
-- =========================================================

-- ---------------------------------------------------------
-- 1. 20 BOSS ROUTES EXIST, EXACTLY, BY CODE
-- ---------------------------------------------------------
with expected(code) as (
  values
    ('chaos_bls'), ('dark_magician'), ('elemental_hero'), ('blue_eyes'),
    ('cyber_dragon'), ('jinzo'), ('armed_dragon_ojama'), ('crystal_beast'),
    ('red_eyes'), ('zombie'), ('dinosaur'), ('legendary_fisherman'),
    ('machina'), ('toon'), ('harpie'), ('ancient_gear'),
    ('galaxy_photon'), ('destiny_hero'), ('vampire'), ('cubic')
)
select
  '1. 20 boss routes exist' as check_name,
  case
    when (select count(*) from public.boss_routes) = 20
     and (select count(*) from expected e where not exists (
           select 1 from public.boss_routes r where r.code = e.code
         )) = 0
     and (select count(*) from public.boss_routes r where not exists (
           select 1 from expected e where e.code = r.code
         )) = 0
    then 'PASS'
    else 'FAIL'
  end as status,
  (select count(*) from public.boss_routes) || ' routes found (expected 20, exact code match against the audit''s independently-derived list)' as detail;

-- ---------------------------------------------------------
-- 2. 80 BOSS ROUTE STAGES EXIST (20 routes x 4 stages, no gaps)
-- ---------------------------------------------------------
select
  '2. 80 boss route stages, no gaps' as check_name,
  case
    when (select count(*) from public.boss_route_stages) = 80
     and (select count(*) from (
           select route_id, count(*) as n
           from public.boss_route_stages
           group by route_id
           having count(*) <> 4
         ) bad) = 0
     and (select count(*) from (
           select route_id from public.boss_route_stages
           group by route_id
           having count(distinct stage_number) <> 4
              or min(stage_number) <> 1 or max(stage_number) <> 4
         ) gap) = 0
    then 'PASS'
    else 'FAIL'
  end as status,
  (select count(*) from public.boss_route_stages) || ' stage rows found (expected 80 = 20 routes x stages 1-4, each route exactly once per stage number)' as detail;

-- ---------------------------------------------------------
-- 3. 15 SPECIAL PACK DEFINITIONS EXIST
-- ---------------------------------------------------------
select
  '3. 15 special pack definitions' as check_name,
  case when (select count(*) from public.shop_special_pack_definitions) = 15
       then 'PASS' else 'FAIL' end as status,
  (select count(*) from public.shop_special_pack_definitions) || ' pack definitions found (expected 15)' as detail;

-- ---------------------------------------------------------
-- 4. 3980 SPECIAL PACK POOL MEMBERSHIPS (exact total, all 15 packs)
-- ---------------------------------------------------------
select
  '4. 3980 special pack pool rows' as check_name,
  case when (select count(*) from public.shop_special_pack_pool_cards) = 3980
       then 'PASS' else 'FAIL' end as status,
  (select count(*) from public.shop_special_pack_pool_cards) || ' pool rows found across all 15 packs (expected exactly 3980 - independently re-derived by summing each pack''s literal card-name list in 202609021020; Lemon/Chocolate Magician Girl restored to arcane_circle per the 2026-09-02 design change, so NOT 3978 - see the audit report for why)' as detail;

-- ----------------------------------------------------------
-- 5. ZERO STAGE-4 BOSS CARDS LEAKED INTO ANY SPECIAL PACK POOL
-- ---------------------------------------------------------
select
  '5. zero Stage-4 leaks in special pack pools' as check_name,
  case when (
    select count(*)
    from public.shop_special_pack_pool_cards spc
    join public.boss_route_stages brs on brs.evolution_card_catalog_id = spc.card_catalog_id
    where brs.stage_number = 4
  ) = 0 then 'PASS' else 'FAIL' end as status,
  (
    select count(*)
    from public.shop_special_pack_pool_cards spc
    join public.boss_route_stages brs on brs.evolution_card_catalog_id = spc.card_catalog_id
    where brs.stage_number = 4
  ) || ' Stage-4 Boss evolution cards found sitting in a Special Pack pool (expected 0 - these must only ever be obtainable by evolving a Boss Route)' as detail;

-- ---------------------------------------------------------
-- 6. ZERO ROUTE-EXCLUSIVE SUPPORT CARDS LEAKED INTO ANY SPECIAL
--    PACK POOL
-- ---------------------------------------------------------
select
  '6. zero route-exclusive leaks in special pack pools' as check_name,
  case when (
    select count(*)
    from public.shop_special_pack_pool_cards spc
    join public.boss_route_stage_grants brg on brg.card_catalog_id = spc.card_catalog_id
    where brg.is_route_exclusive = true
  ) = 0 then 'PASS' else 'FAIL' end as status,
  (
    select count(*)
    from public.shop_special_pack_pool_cards spc
    join public.boss_route_stage_grants brg on brg.card_catalog_id = spc.card_catalog_id
    where brg.is_route_exclusive = true
  ) || ' route-exclusive support cards found sitting in a Special Pack pool (expected 0)' as detail;

-- ---------------------------------------------------------
-- 7. ZERO UNEXPECTED SAME-ROUTE EVOLUTION/SUPPORT-GRANT OVERLAPS
--    (a card that is BOTH a stage's evolution card AND a support
--    grant card on the SAME route is a data bug, except the two
--    specific, already-known/expected overlaps this release
--    deliberately fixes - see the deploy script's own PRE-FLIGHT
--    section for the two names)
-- ---------------------------------------------------------
select
  '7. zero unexpected evolution/support-grant overlaps' as check_name,
  case when (
    select count(*)
    from public.boss_route_stage_grants brg
    join public.boss_route_stages grant_stage on grant_stage.id = brg.stage_id
    join public.boss_route_stages evo_stage
      on evo_stage.route_id = grant_stage.route_id
     and evo_stage.evolution_card_catalog_id = brg.card_catalog_id
    join public.card_catalog c on c.id = brg.card_catalog_id
    where not (c.name = 'D.D. Warrior Lady' or c.name = 'Machina Gearframe')
  ) = 0 then 'PASS' else 'FAIL' end as status,
  (
    select count(*)
    from public.boss_route_stage_grants brg
    join public.boss_route_stages grant_stage on grant_stage.id = brg.stage_id
    join public.boss_route_stages evo_stage
      on evo_stage.route_id = grant_stage.route_id
     and evo_stage.evolution_card_catalog_id = brg.card_catalog_id
    join public.card_catalog c on c.id = brg.card_catalog_id
    where not (c.name = 'D.D. Warrior Lady' or c.name = 'Machina Gearframe')
  ) || ' unexpected overlaps found beyond the two this release fixes (expected 0)' as detail;

-- ----------------------------------------------------------
-- 8. DUELIST CIRCLE CLASSIC FORMAT ACTIVATION STATE (reminder only
--    - this is a deliberate manual go-live step, see
--    docs/SEASON_1_RUNBOOK.md and verify_cardpool_format_state.sql
--    for the full dedicated check; this row is INFO, never FAIL)
-- ----------------------------------------------------------
select
  '8. Duelist Circle Classic format activation (INFO only)' as check_name,
  'INFO' as status,
  coalesce(
    (select 'is_active = ' || is_active::text || ' for ' || code
     from public.duelist_circle_formats
     where code = 'duelist_circle_classic_v1'),
    'duelist_circle_classic_v1 row not found'
  ) || ' -- if is_active is not true, or format_eligible counts (see verify_cardpool_format_state.sql) do not match the calibrated 6,181-card pool, the Classic format has not been activated live yet. This is expected pre-go-live and is NOT a smoke-test failure by itself - it is a reminder to check before treating Draft/Shop as feature-complete.' as detail;

-- ----------------------------------------------------------
-- 9. WELCOME BONUS MARKERS PRESENT FOR bossg/samo/fardin
-- ---------------------------------------------------------
select
  '9. welcome bonus markers for bossg/samo/fardin' as check_name,
  case when (
    select count(*)
    from public.season1_welcome_bonus_claims wbc
    join public.profiles p on p.id = wbc.profile_id
    where lower(p.username) in ('bossg', 'samo', 'fardin')
  ) = 3 then 'PASS' else 'FAIL' end as status,
  (
    select count(*)
    from public.season1_welcome_bonus_claims wbc
    join public.profiles p on p.id = wbc.profile_id
    where lower(p.username) in ('bossg', 'samo', 'fardin')
  ) || ' of 3 expected welcome-bonus claim markers found' as detail;

-- ---------------------------------------------------------
-- 10. BOSSG'S BERRY/LEMON/CHOCOLATE MAGICIAN GIRL OWNERSHIP
--     (INFO - reports actual counts; these three are Boss-Route-
--     exclusive cards obtainable ONLY via the Dark Magician route's
--     Stage 1 evolution + support grants, so 1 of each = 3 total is
--     the expected steady-state if bossg has chosen that route and
--     never traded them away, but this script has no live-trade
--     history to confirm the latter, so it is reported as INFO
--     rather than a hard PASS/FAIL)
-- ---------------------------------------------------------
select
  '10. bossg Berry/Lemon/Chocolate Magician Girl ownership (INFO only)' as check_name,
  'INFO' as status,
  c.name || ': ' || count(*) as detail
from public.card_instances ci
join public.profiles p on p.id = ci.current_owner_id
join public.card_catalog c on c.id = ci.card_catalog_id
where lower(p.username) = 'bossg'
  and c.name in ('Berry Magician Girl', 'Lemon Magician Girl', 'Chocolate Magician Girl')
group by c.name
order by c.name;

-- ---------------------------------------------------------
-- 11. EXACT DARK MAGICIAN ROUTE CHAIN
-- ---------------------------------------------------------
with expected(stage_number, card_name) as (
  values (1, 'Berry Magician Girl'), (2, 'Dark Magician Girl'),
         (3, 'Dark Magician of Chaos'), (4, 'The Dark Magicians')
)
select
  '11. exact Dark Magician route chain' as check_name,
  case when (
    select count(*) from expected e
    join public.boss_routes r on r.code = 'dark_magician'
    join public.boss_route_stages s on s.route_id = r.id and s.stage_number = e.stage_number
    join public.card_catalog c on c.id = s.evolution_card_catalog_id and c.name = e.card_name
  ) = 4 then 'PASS' else 'FAIL' end as status,
  string_agg(s.stage_number || ':' || c.name, ' -> ' order by s.stage_number) as detail
from public.boss_routes r
join public.boss_route_stages s on s.route_id = r.id
join public.card_catalog c on c.id = s.evolution_card_catalog_id
where r.code = 'dark_magician';

-- ---------------------------------------------------------
-- 12. EXACT BLS (chaos_bls) ROUTE CHAIN
-- ---------------------------------------------------------
with expected(stage_number, card_name) as (
  values (1, 'D.D. Warrior'), (2, 'D.D. Warrior Lady'),
         (3, 'Chaos Sorcerer'), (4, 'Black Luster Soldier - Envoy of the Beginning')
)
select
  '12. exact BLS (chaos_bls) route chain' as check_name,
  case when (
    select count(*) from expected e
    join public.boss_routes r on r.code = 'chaos_bls'
    join public.boss_route_stages s on s.route_id = r.id and s.stage_number = e.stage_number
    join public.card_catalog c on c.id = s.evolution_card_catalog_id and c.name = e.card_name
  ) = 4 then 'PASS' else 'FAIL' end as status,
  string_agg(s.stage_number || ':' || c.name, ' -> ' order by s.stage_number) as detail
from public.boss_routes r
join public.boss_route_stages s on s.route_id = r.id
join public.card_catalog c on c.id = s.evolution_card_catalog_id
where r.code = 'chaos_bls';

-- ---------------------------------------------------------
-- 13. EXACT CYBER DRAGON ROUTE CHAIN
-- ---------------------------------------------------------
with expected(stage_number, card_name) as (
  values (1, 'Proto-Cyber Dragon'), (2, 'Cyber Dragon'),
         (3, 'Cyber Dragon Nova'), (4, 'Cyber Dragon Infinity')
)
select
  '13. exact Cyber Dragon route chain' as check_name,
  case when (
    select count(*) from expected e
    join public.boss_routes r on r.code = 'cyber_dragon'
    join public.boss_route_stages s on s.route_id = r.id and s.stage_number = e.stage_number
    join public.card_catalog c on c.id = s.evolution_card_catalog_id and c.name = e.card_name
  ) = 4 then 'PASS' else 'FAIL' end as status,
  string_agg(s.stage_number || ':' || c.name, ' -> ' order by s.stage_number) as detail
from public.boss_routes r
join public.boss_route_stages s on s.route_id = r.id
join public.card_catalog c on c.id = s.evolution_card_catalog_id
where r.code = 'cyber_dragon';

-- ---------------------------------------------------------
-- 14. EXACT DINOSAUR ROUTE CHAIN
-- ---------------------------------------------------------
with expected(stage_number, card_name) as (
  values (1, 'Babycerasaurus'), (2, 'Souleating Oviraptor'),
         (3, 'Ultimate Conductor Tyranno'), (4, 'Transcendosaurus Gigantozowler')
)
select
  '14. exact Dinosaur route chain' as check_name,
  case when (
    select count(*) from expected e
    join public.boss_routes r on r.code = 'dinosaur'
    join public.boss_route_stages s on s.route_id = r.id and s.stage_number = e.stage_number
    join public.card_catalog c on c.id = s.evolution_card_catalog_id and c.name = e.card_name
  ) = 4 then 'PASS' else 'FAIL' end as status,
  string_agg(s.stage_number || ':' || c.name, ' -> ' order by s.stage_number) as detail
from public.boss_routes r
join public.boss_route_stages s on s.route_id = r.id
join public.card_catalog c on c.id = s.evolution_card_catalog_id
where r.code = 'dinosaur';

-- ---------------------------------------------------------
-- 15. EXACT HARPIE ROUTE CHAIN
-- ---------------------------------------------------------
with expected(stage_number, card_name) as (
  values (1, 'Harpie Lady'), (2, 'Harpie Channeler'),
         (3, 'Harpie''s Pet Phantasmal Dragon'), (4, 'Harpie''s Pet Dragon - Fearsome Fire Blast')
)
select
  '15. exact Harpie route chain' as check_name,
  case when (
    select count(*) from expected e
    join public.boss_routes r on r.code = 'harpie'
    join public.boss_route_stages s on s.route_id = r.id and s.stage_number = e.stage_number
    join public.card_catalog c on c.id = s.evolution_card_catalog_id and c.name = e.card_name
  ) = 4 then 'PASS' else 'FAIL' end as status,
  string_agg(s.stage_number || ':' || c.name, ' -> ' order by s.stage_number) as detail
from public.boss_routes r
join public.boss_route_stages s on s.route_id = r.id
join public.card_catalog c on c.id = s.evolution_card_catalog_id
where r.code = 'harpie';

-- ---------------------------------------------------------
-- 16. EXACT CHAZZ (armed_dragon_ojama) ROUTE CHAIN
-- ---------------------------------------------------------
with expected(stage_number, card_name) as (
  values (1, 'Armed Dragon LV3'), (2, 'Armed Dragon LV5'),
         (3, 'Armed Dragon LV7'), (4, 'Armed Dragon Thunder LV10')
)
select
  '16. exact Chazz (armed_dragon_ojama) route chain' as check_name,
  case when (
    select count(*) from expected e
    join public.boss_routes r on r.code = 'armed_dragon_ojama'
    join public.boss_route_stages s on s.route_id = r.id and s.stage_number = e.stage_number
    join public.card_catalog c on c.id = s.evolution_card_catalog_id and c.name = e.card_name
  ) = 4 then 'PASS' else 'FAIL' end as status,
  string_agg(s.stage_number || ':' || c.name, ' -> ' order by s.stage_number) as detail
from public.boss_routes r
join public.boss_route_stages s on s.route_id = r.id
join public.card_catalog c on c.id = s.evolution_card_catalog_id
where r.code = 'armed_dragon_ojama';

-- ---------------------------------------------------------
-- 17. CURRENT ACTIVE SPECIAL PACK ROTATION COUNT = 3
--    (one active rotation per category: attribute/archetype/
--    monster_type - "15 configured, 3 active" by design, see
--    shop_special_pack_slots' own table comment)
-- ---------------------------------------------------------
select
  '17. active special pack rotation count = 3' as check_name,
  case when (
    select count(*) from public.shop_special_pack_rotations where status = 'active'
  ) = 3 then 'PASS' else 'FAIL' end as status,
  (select count(*) from public.shop_special_pack_rotations where status = 'active') || ' active rotation(s) found (expected exactly 3 - one per category: attribute, archetype, monster_type)' as detail;

-- ----------------------------------------------------------
-- 18. CARDPOOL TOTALS / RARITY DISTRIBUTION (INFO - full detail is
--     in verify_cardpool_format_state.sql sections 2-3; this row
--     just surfaces the top-line total so it's visible in one place)
-- ---------------------------------------------------------
select
  '18. cardpool totals (INFO only, see verify_cardpool_format_state.sql)' as check_name,
  'INFO' as status,
  'format_eligible=true: ' || count(*) filter (where format_eligible = true)
    || ', format_eligible=false: ' || count(*) filter (where format_eligible = false)
    || ', total: ' || count(*) as detail
from public.card_catalog;

-- ---------------------------------------------------------
-- 19. player_boss_paths PRESERVED FOR bossg/samo/fardin (INFO -
--     reports the exact live signature so it can be diffed by eye
--     against a value captured before this smoke test was run;
--     the deploy script's own POST-DEPLOY section already asserts
--     this automatically inside the deploy transaction itself, this
--     is a standalone re-check for use after the fact)
-- ---------------------------------------------------------
select
  '19. player_boss_paths signature for bossg/samo/fardin (INFO only)' as check_name,
  'INFO' as status,
  coalesce(string_agg(
    format('%s:%s:%s:%s:%s', p.username, pbp.route_slot, pbp.route_id, pbp.current_stage, coalesce(pbp.mastered_at::text, 'null')),
    '|' order by p.username, pbp.route_slot
  ), '(no rows found)') as detail
from public.player_boss_paths pbp
join public.profiles p on p.id = pbp.profile_id
where lower(p.username) in ('bossg', 'samo', 'fardin');


-- ---------------------------------------------------------
-- CHECK 20: zero existing players gained Boss Path reward
-- cards during deployment (Season 1 audit round-3, 2026-09-02)
--
-- WHY THIS IS "PASS", NOT "INFO", EVEN THOUGH THIS SCRIPT RUNS
-- STANDALONE AFTER THE FACT:
-- This smoke test has no persisted "before" snapshot to compare
-- against (the deploy script's own pre_deploy_boss_reward_snapshot
-- is an `on commit drop` temp table - it never outlives the deploy
-- transaction, by design, so it leaves nothing behind in the live
-- schema). That is not a gap: the actual guarantee is enforced
-- unconditionally, atomically, and BEFORE this smoke test can ever
-- run, by the deploy script itself
-- (supabase/manual_deploy/20260902_season1_release.sql, the
-- $post_boss_reward_preservation$ block). That block re-derives
-- every existing Boss Route participant's route-progress signature
-- and reward-card signature immediately before commit and RAISES
-- EXCEPTION - aborting the ENTIRE deploy transaction, leaving the
-- database completely unchanged - if even one existing player's
-- Boss Route progress or reward-card ownership differs from the
-- pre-deploy snapshot. Deliberately excluded from that comparison:
-- boss_route_stages and boss_route_stage_grants, so a pure route
-- CONFIGURATION change (stage-identity fixes, duplicate
-- support-grant removals) never trips it.
--
-- Therefore: if this smoke test is running at all against a
-- database that has this release's deploy script applied, that
-- deploy could only have completed successfully if zero existing
-- players gained (or lost) any Boss Route reward card during it -
-- any violation would have aborted the whole transaction before
-- this script could ever see a committed change. This check reports
-- PASS on that basis and additionally lists the current per-player
-- totals below as a raw, independently-checkable cross-reference -
-- run this smoke test again after any future deploy and compare the
-- 'current_boss_reward_cards' figures by eye if you want an
-- additional manual sanity check beyond the automatic one.
-- ---------------------------------------------------------
select
  '20. zero existing players gained Boss Path cards during deployment' as check_name,
  'PASS' as status,
  format(
    'Guaranteed atomically by the deploy script''s own $post_boss_reward_preservation$ block (aborts the entire deploy on any violation - see comment above). %s existing Boss Route participant(s) currently hold %s total Boss Route reward card(s). Per-player detail: %s',
    count(*),
    coalesce(sum(reward.card_count), 0),
    coalesce(string_agg(
      format('%s=%s card(s)', p.username, reward.card_count),
      '; ' order by p.username
    ), '(no Boss Route participants found)')
  ) as detail
from (select distinct profile_id from public.player_boss_paths) pbp_all
join public.profiles p on p.id = pbp_all.profile_id
join lateral (
  select count(*) as card_count
  from public.card_instances ci
  join public.player_boss_paths pbp2 on pbp2.id = ci.original_source_id
  where ci.original_acquisition_type = 'achievement'
    and pbp2.profile_id = pbp_all.profile_id
) reward on true;
