-- =========================================================
-- RELEASE_STAGE POPULATION + ELIGIBILITY-SOURCE DIAGNOSIS
-- (Duelist Circle Season 1, read-only, 2026-09-02)
--
-- THIS SCRIPT IS 100% READ-ONLY.
-- Only `select` / `with ... select` statements. No insert, update,
-- delete, truncate, create, alter, drop, grant, revoke, or call of
-- any mutating function. Safe to run against production at any
-- time, as many times as needed. Does NOT call
-- recompute_format_eligibility(), does NOT set is_active, does NOT
-- write release_stage, does NOT touch any player's cards.
--
-- WHY THIS SCRIPT EXISTS
-- Confirmed live state: duelist_circle_formats.season_1 is
-- is_active = true (release_cutoff 2020-12-31), duelist_circle_
-- classic_v1 is inactive (release_cutoff 2014-12-31, target 6,181
-- eligible cards). card_catalog currently reports 8,954 of 13,931
-- rows as format_eligible = true - far above 6,181 and not an
-- obviously season_1-shaped number either. This script establishes,
-- from data alone:
--   1. Whether card_catalog.release_stage has actually been
--      populated anywhere, and for how many rows.
--   2. Whether 8,954 could possibly be the output of
--      recompute_format_eligibility() ever having been run for
--      season_1 (or any format), or whether it must be the
--      untouched legacy bulk flag from
--      202608190005_draft_system.sql (excludes only Synchro /
--      Pendulum / Link / Skill Cards / Tokens - no era cutoff, no
--      release_stage gate at all).
--   3. What recompute_format_eligibility() would actually produce
--      for duelist_circle_classic_v1 TODAY if it were called (it is
--      NOT called by this script) - i.e. how much of the gap to
--      6,181 is explained by unpopulated release_stage alone.
-- =========================================================


-- ---------------------------------------------------------
-- 1. TOTAL CARD_CATALOG ROWS
-- ---------------------------------------------------------

select count(*) as total_card_catalog_rows
from public.card_catalog;


-- ---------------------------------------------------------
-- 2. RELEASE_STAGE NULL VS POPULATED, OVERALL
-- ---------------------------------------------------------

select
  count(*) filter (where release_stage is null) as release_stage_null_count,
  count(*) filter (where release_stage is not null) as release_stage_populated_count,
  count(*) as total
from public.card_catalog;


-- ---------------------------------------------------------
-- 3. COUNTS GROUPED BY RELEASE_STAGE (NULL is its own group)
-- ---------------------------------------------------------

select
  release_stage,
  count(*) as card_count
from public.card_catalog
group by release_stage
order by release_stage nulls first;


-- ---------------------------------------------------------
-- 4. AMONG THE CURRENT 8,954-ISH FORMAT_ELIGIBLE POOL:
--    release_stage null vs populated
--
-- If total_currently_eligible is large while eligible_and_stage_
-- populated is near zero, the current eligible pool CANNOT be the
-- output of recompute_format_eligibility() for any format row -
-- that function's own eligibility check
-- (is_duelist_circle_format_eligible, in
-- 202608231500_duelist_circle_format_engine.sql) hard-excludes any
-- card whose release_stage is null. A large eligible count built
-- almost entirely on null-release_stage rows is only possible under
-- the ORIGINAL legacy bulk flag from 202608190005 - see SECTION 5.
-- ---------------------------------------------------------

select
  count(*) filter (where format_eligible = true and release_stage is null) as eligible_and_stage_null,
  count(*) filter (where format_eligible = true and release_stage is not null) as eligible_and_stage_populated,
  count(*) filter (where format_eligible = true) as total_currently_eligible
from public.card_catalog;


-- ---------------------------------------------------------
-- 5. LEGACY-RULE CROSS-CHECK
--
-- Does the current format_eligible = true count match exactly
-- "everything except Synchro / Pendulum / Link / Skill Cards /
-- Tokens" - the original 202608190005 rule, with no era cutoff and
-- no release_stage gate at all? If matches_legacy_rule_exactly is
-- true, the current 8,954 figure is demonstrably the untouched
-- legacy flag, not any output of the format engine.
-- ---------------------------------------------------------

select
  count(*) filter (
    where lower(card_type) not like '%synchro%'
      and lower(card_type) not like '%pendulum%'
      and lower(card_type) not like '%link%'
      and lower(card_type) not like '%skill%'
      and lower(card_type) not like '%token%'
  ) as legacy_rule_would_count,
  count(*) filter (where format_eligible = true) as actual_format_eligible_count,
  (
    count(*) filter (
      where lower(card_type) not like '%synchro%'
        and lower(card_type) not like '%pendulum%'
        and lower(card_type) not like '%link%'
        and lower(card_type) not like '%skill%'
        and lower(card_type) not like '%token%'
    ) = count(*) filter (where format_eligible = true)
  ) as matches_legacy_rule_exactly
from public.card_catalog;


-- ---------------------------------------------------------
-- 6. EXPLICIT FORMAT_CARD_OVERRIDES COUNTS FOR
--    duelist_circle_classic_v1
-- ---------------------------------------------------------

select
  fco.override_type,
  count(*) as override_count
from public.format_card_overrides fco
join public.duelist_circle_formats f
  on f.id = fco.format_id
where f.code = 'duelist_circle_classic_v1'
group by fco.override_type
order by fco.override_type;


-- ---------------------------------------------------------
-- 7. WHAT recompute_format_eligibility() WOULD ACTUALLY PRODUCE
--    FOR duelist_circle_classic_v1 TODAY (NOT executed - this is a
--    read-only simulation of that function's own logic)
--
-- Every card is placed into exactly one disjoint bucket:
--  - excluded_by_explicit_override: an 'exclude' row always wins.
--  - included_by_explicit_override_stage_irrelevant: an 'include'
--    row bypasses cutoff/mechanic/release_stage entirely (matches
--    is_duelist_circle_format_eligible's own precedence).
--  - excluded_by_mechanic_or_cutoff_no_override: fails the format's
--    own mechanic flags or release_cutoff, no override to save it.
--  - would_be_eligible_but_stage_null: passes every other check but
--    is blocked ONLY by release_stage is null - this is the number
--    that explains the gap to 6,181.
--  - would_be_eligible_and_stage_populated: passes every check
--    including having a release_stage set - genuinely ready today.
-- ---------------------------------------------------------

with classic_fmt as (
  select
    id, release_cutoff, allow_fusion, allow_xyz,
    allow_synchro, allow_pendulum, allow_link
  from public.duelist_circle_formats
  where code = 'duelist_circle_classic_v1'
),
overrides as (
  select fco.card_catalog_id, fco.override_type
  from public.format_card_overrides fco
  join classic_fmt f on f.id = fco.format_id
),
classified as (
  select
    c.id,
    c.release_stage,
    ov.override_type,
    (
      not (lower(c.card_type) like '%synchro%' and not f.allow_synchro)
      and not (lower(c.card_type) like '%xyz%' and not f.allow_xyz)
      and not (lower(c.card_type) like '%link%' and not f.allow_link)
      and not (lower(c.card_type) like '%pendulum%' and not f.allow_pendulum)
      and not (lower(c.card_type) like '%fusion%' and not f.allow_fusion)
      and (
        f.release_cutoff is null
        or c.release_date is null
        or c.release_date <= f.release_cutoff
      )
    ) as passes_mechanic_and_cutoff
  from public.card_catalog c
  cross join classic_fmt f
  left join overrides ov
    on ov.card_catalog_id = c.id
)
select
  count(*) filter (where override_type = 'exclude')
    as excluded_by_explicit_override,
  count(*) filter (where override_type = 'include')
    as included_by_explicit_override_stage_irrelevant,
  count(*) filter (where override_type is null and not passes_mechanic_and_cutoff)
    as excluded_by_mechanic_or_cutoff_no_override,
  count(*) filter (where override_type is null and passes_mechanic_and_cutoff and release_stage is null)
    as would_be_eligible_but_stage_null,
  count(*) filter (where override_type is null and passes_mechanic_and_cutoff and release_stage is not null)
    as would_be_eligible_and_stage_populated,
  count(*) filter (where override_type = 'include')
    + count(*) filter (where override_type is null and passes_mechanic_and_cutoff and release_stage is not null)
    as projected_recompute_total_today
from classified;

-- projected_recompute_total_today is what
-- recompute_format_eligibility() would produce for
-- duelist_circle_classic_v1 RIGHT NOW if called (it was NOT called
-- by this script). Compare it to the 6,181 target: the difference is
-- exactly would_be_eligible_but_stage_null.
