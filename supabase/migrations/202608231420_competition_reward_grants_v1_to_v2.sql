-- =========================================================
-- COMPETITION REWARD GRANTS - V1 -> V2 PRODUCTION COMPATIBILITY
--
-- ROOT CAUSE
-- 202608231100_competition_v2_scheduling.sql failed on manual
-- production deploy with:
--   ERROR 42703: column "status" does not exist
--   where status = 'granted'
-- (the `create unique index ... where status = 'granted'` statement
-- on public.competition_reward_grants).
--
-- Production's competition_reward_grants is NOT the V2 shape that
-- migration assumed - it is a pre-existing V1 table with these
-- columns (confirmed by direct inspection, not guessed):
--   id, competition_id, profile_id, placement, duel_points,
--   voucher_type, voucher_quantity, created_at
-- plus a table-level UNIQUE(competition_id, profile_id) constraint
-- (competition_reward_grants_competition_id_profile_id_key).
--
-- 202608231100's `create table if not exists` therefore left the
-- existing V1 table completely untouched (correctly - that's what
-- IF NOT EXISTS means), and the very next statement assumed the
-- newer V2 columns (status, duel_points_granted, etc.) already
-- existed. They didn't, so it failed there - meaning none of the
-- V2 functions further down that same file were ever created in
-- production, but everything ABOVE the failure point in the file
-- (the additive `competitions`/`matches` V2 columns and
-- constraints) may already be live, since that file has no
-- transaction wrapper and each top-level statement can commit
-- independently depending on how it was invoked. See the
-- deploy-order note and the read-only inspection query at the
-- bottom of this file's paired report for how to check that
-- safely.
--
-- WHAT THIS MIGRATION DOES
-- Makes production's REAL V1 competition_reward_grants shape safe
-- and compatible with every V2 column/index 202608231100 and
-- 202608231400 need, without ever deleting a row, changing an
-- existing DP balance, or changing an existing voucher:
--   1. Adds every missing V2 column additively, backfilling
--      historical rows logically (status -> 'granted',
--      duel_points_granted <- duel_points, granted_at <-
--      created_at) using a nullable-add-then-backfill-then-
--      constrain pattern so re-running this file, or running it
--      after V2 has already started writing new rows, can never
--      overwrite a real value with a backfilled one.
--   2. Replaces the legacy table-level UNIQUE(competition_id,
--      profile_id) constraint (fundamentally incompatible with V2
--      result correction, which needs an old 'reversed' row and a
--      new 'granted' row to coexist for the same competition+
--      profile) with V2's partial unique index - WHERE
--      status = 'granted' - so at most one ACTIVE grant per player
--      per competition still holds, while historical reversed rows
--      are no longer blocked.
-- Legacy columns (duel_points, created_at) are left in place and
-- untouched, per the explicit instruction to preserve V1 backwards
-- compatibility since the 8 original V1 RPCs are black-box and may
-- still read them.
--
-- SAFETY: every statement is additive/idempotent (IF NOT EXISTS /
-- IF EXISTS / backfill guarded by IS NULL, which can only ever
-- match a genuinely not-yet-backfilled row - see inline comments).
-- No DROP TABLE, no DELETE, no row-count-changing statement
-- anywhere in this file. No existing duel_points value, no
-- duel_point_transactions row, and no reward_vouchers row is
-- touched by this migration.
-- =========================================================


-- ---------------------------------------------------------
-- 1. duel_points_granted - the V2 payout-amount column, distinct
--    from the legacy `duel_points` column which stays untouched.
--    Added nullable first (no default) so the backfill below can
--    tell "never touched" (NULL) apart from "already correct, even
--    if that correct value happens to be 0" - a flat DEFAULT could
--    never make that distinction safely.
-- ---------------------------------------------------------

alter table public.competition_reward_grants
  add column if not exists duel_points_granted integer;

-- Backfill ONLY rows this migration has never touched before. Any
-- row already backfilled (by an earlier run of this same file) has
-- a non-null duel_points_granted and is skipped. Any row inserted
-- by the real V2 functions after this migration first ran will
-- likewise never be NULL here (V2's own inserts always set this
-- column explicitly), so this can never overwrite a genuine V2
-- grant with a stale legacy value.
update public.competition_reward_grants
set duel_points_granted = duel_points
where duel_points_granted is null;

alter table public.competition_reward_grants
  alter column duel_points_granted set default 0;

alter table public.competition_reward_grants
  alter column duel_points_granted set not null;


-- ---------------------------------------------------------
-- 2. granted_at - when this specific reward was actually granted.
--    Same nullable-add-then-backfill-then-constrain pattern,
--    backfilled from the legacy row's own created_at (its true
--    historical grant time) rather than "now" for every existing
--    row.
-- ---------------------------------------------------------

alter table public.competition_reward_grants
  add column if not exists granted_at timestamptz;

update public.competition_reward_grants
set granted_at = created_at
where granted_at is null;

alter table public.competition_reward_grants
  alter column granted_at set default now();

alter table public.competition_reward_grants
  alter column granted_at set not null;


-- ---------------------------------------------------------
-- 3. status - every pre-existing V1 row represents a reward that
--    was already granted (V1 had no correction/reversal concept at
--    all), so every legacy row backfills to 'granted'. Same
--    nullable-add-then-backfill-then-constrain pattern; the check
--    constraint is added last, once every row is guaranteed to
--    satisfy it.
-- ---------------------------------------------------------

alter table public.competition_reward_grants
  add column if not exists status text;

update public.competition_reward_grants
set status = 'granted'
where status is null;

alter table public.competition_reward_grants
  alter column status set default 'granted';

alter table public.competition_reward_grants
  alter column status set not null;

alter table public.competition_reward_grants
  drop constraint if exists competition_reward_grants_status_check;

alter table public.competition_reward_grants
  add constraint competition_reward_grants_status_check
  check (status in ('granted', 'reversed'));


-- ---------------------------------------------------------
-- 4. Remaining V2 / hardening columns. None of these need
--    historical backfill: no V1 row was ever reversed (V1 had no
--    correction flow), so NULL/0 is the objectively correct value
--    for every pre-existing row, identical to what a brand-new V2
--    row would get. A flat IF NOT EXISTS + DEFAULT is fully safe
--    here - no distinct-from-default backfill logic is needed.
-- ---------------------------------------------------------

alter table public.competition_reward_grants
  add column if not exists duel_point_transaction_id uuid
    references public.duel_point_transactions(id)
    on delete set null;

comment on column public.competition_reward_grants.duel_point_transaction_id is
  'Nullable, left NULL for pre-V2 rows backfilled by this migration - the historical duel_point_transactions row (if any) V1''s black-box reward logic produced for an existing grant is not guessed at or retroactively linked.';

alter table public.competition_reward_grants
  add column if not exists reversed_at timestamptz;

alter table public.competition_reward_grants
  add column if not exists reversal_reason text;

alter table public.competition_reward_grants
  add column if not exists duel_points_recovered integer not null default 0;

alter table public.competition_reward_grants
  add column if not exists duel_points_unrecovered integer not null default 0;

alter table public.competition_reward_grants
  add column if not exists voucher_quantity_recovered integer not null default 0;

alter table public.competition_reward_grants
  add column if not exists voucher_quantity_unrecovered integer not null default 0;


-- ---------------------------------------------------------
-- 5. LEGACY UNIQUE CONSTRAINT/INDEX REPLACEMENT
--
-- competition_reward_grants_competition_id_profile_id_key must go -
-- a full-table UNIQUE(competition_id, profile_id) makes it
-- structurally impossible to ever insert a new 'granted' row for a
-- player+competition that already has a 'reversed' row, which is
-- exactly what correct_competition_match_result_v2 needs to do.
--
-- The name pattern (`..._key`) is Postgres's own auto-generated
-- name for a table-level UNIQUE CONSTRAINT (as opposed to a bare
-- CREATE INDEX, which would carry a deliberately chosen name) - but
-- this is verified programmatically below rather than assumed, and
-- the correct DROP variant (CONSTRAINT vs INDEX) is used for
-- whichever it actually turns out to be. Naturally idempotent: once
-- dropped, neither branch matches again on a re-run.
-- ---------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'competition_reward_grants_competition_id_profile_id_key'
      and conrelid = 'public.competition_reward_grants'::regclass
  ) then
    alter table public.competition_reward_grants
      drop constraint competition_reward_grants_competition_id_profile_id_key;
  elsif exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'competition_reward_grants'
      and indexname = 'competition_reward_grants_competition_id_profile_id_key'
  ) then
    drop index public.competition_reward_grants_competition_id_profile_id_key;
  end if;
end;
$$;

-- V2's replacement: at most one ACTIVE ('granted') grant per player
-- per competition, while any number of historical 'reversed' rows
-- for the same pair are allowed to coexist. Same statement
-- 202608231100 already contains further down (once it can run past
-- its failure point) - creating it here too is a harmless,
-- IF-NOT-EXISTS-guarded no-op either way, whichever migration
-- reaches it first.
create unique index if not exists competition_reward_grants_active_unique
  on public.competition_reward_grants(competition_id, profile_id)
  where status = 'granted';

create index if not exists competition_reward_grants_competition_idx
  on public.competition_reward_grants(competition_id);
