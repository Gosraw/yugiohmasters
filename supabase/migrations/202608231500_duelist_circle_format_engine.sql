-- =========================================================
-- DUELIST CIRCLE FORMAT ENGINE (versioned, configurable)
--
-- WHY
-- Today "format eligibility" is a single global boolean
-- (card_catalog.format_eligible / format_exclusion_reason),
-- set ONCE by a bulk UPDATE in 202608190005_draft_system.sql
-- (Synchro/Pendulum/Link/Skill Cards/Tokens excluded, nothing
-- else). Draft, Shop and the Deckbuilder already all read that
-- SAME column as their single source of truth (confirmed by
-- grep across every migration - `format_eligible = true`
-- appears consistently in create_next_draft_offer,
-- pick_shop_pack_card and add_card_to_deck's validation, and
-- nowhere else is eligibility recomputed independently). That
-- part of the architecture is already exactly right and is NOT
-- being replaced.
--
-- What's missing is a way to reconsider that boolean per a
-- CONFIGURABLE, VERSIONED format definition - a release-year
-- cutoff, which Extra Deck mechanics are allowed, a power
-- ceiling, a progressive release stage, and manual per-card
-- overrides - without hand-editing a one-off bulk UPDATE every
-- time a decision changes.
--
-- DESIGN
-- This migration adds a small brain (duelist_circle_formats +
-- format_card_overrides + is_duelist_circle_format_eligible())
-- and ONE explicit, re-runnable "apply" step
-- (recompute_format_eligibility()) that writes its answer into
-- the EXISTING format_eligible/format_exclusion_reason columns
-- that Draft/Shop/Deckbuilder already read. Nothing in those
-- three systems needs to change - the existing wiring already
-- IS the "one central predicate" the product brief asks for;
-- this migration is what now computes the value that flows
-- through it, instead of a one-time bulk UPDATE.
--
-- Master Duel status remains a SEPARATE, non-configurable, hard
-- gate exactly as it is today (is_master_duel_offerable() is
-- untouched) - a card can be format-eligible in principle and
-- still never be offered because it's forbidden/not_available/
-- unknown in Master Duel. This migration does not change that.
--
-- SAFETY
-- - Purely additive: two new tables, new nullable/defaulted
--   columns on card_catalog, new functions. Nothing existing is
--   dropped or redefined.
-- - The one seeded format row is created with is_active = false.
--   Nothing in Draft/Shop/Deckbuilder changes behavior from this
--   migration alone - format_eligible is only ever touched by
--   explicitly calling recompute_format_eligibility(), which is
--   a separate, deliberate operator action (see the Season 1
--   runbook), not something this migration runs automatically.
-- - release_stage defaults to NULL for every card, and the
--   eligibility function treats NULL release_stage as NOT YET
--   RELEASED (safe-by-default) rather than "stage 1" - a card
--   only becomes offerable once the valuation/staging step
--   explicitly assigns it a stage. This means running
--   recompute_format_eligibility() before that staging step has
--   populated release_stage would make the whole catalog
--   ineligible - documented explicitly in the runbook as the
--   required order (valuation/staging BEFORE recompute).
-- =========================================================


-- ---------------------------------------------------------
-- 1. New card_catalog columns: release metadata + valuation
--    scores. All nullable/defaulted - existing rows are
--    unaffected until an explicit backfill/audit step runs.
-- ---------------------------------------------------------

alter table public.card_catalog
  add column if not exists release_date date;

comment on column public.card_catalog.release_date is
  'TCG original release date. NOT populated by the base card sync (scripts/sync-cards.mjs fetches YGOPRODeck without misc=yes, which is required for tcg_date) - populated separately by scripts/sync-card-release-dates.mjs. NULL means unknown, not "very old" or "very new" - a format release_cutoff only excludes a card whose release_date is known AND after the cutoff; an unknown release_date is never excluded on cutoff grounds alone.';

alter table public.card_catalog
  add column if not exists release_date_source text;

comment on column public.card_catalog.release_date_source is
  'Provenance of release_date, e.g. ''ygoprodeck_tcg_date''. Never guessed - only set when release_date was set from a verified source.';

alter table public.card_catalog
  add column if not exists release_stage integer;

comment on column public.card_catalog.release_stage is
  'Progressive release stage this card unlocks at (1 = Season 1 starting pool, 2 = later, etc). NULL = not yet staged - treated as NOT YET RELEASED by is_duelist_circle_format_eligible(), never as "stage 1", so an unreviewed powerful card is never silently offered. Populated by the valuation/oppressiveness audit apply step, or by a manual format_card_overrides.release_stage_override.';

alter table public.card_catalog
  add column if not exists oppressiveness_tier text;

alter table public.card_catalog
  drop constraint if exists card_catalog_oppressiveness_tier_check;

alter table public.card_catalog
  add constraint card_catalog_oppressiveness_tier_check
  check (oppressiveness_tier is null or oppressiveness_tier in ('green', 'orange', 'red'));

comment on column public.card_catalog.oppressiveness_tier is
  'green = appropriate for starting pool, orange = manual review / possibly later stage, red = recommend later release. Never used to silently delete or ban a card - only to recommend a release_stage.';

alter table public.card_catalog
  add column if not exists oppressiveness_reason text;

alter table public.card_catalog
  add column if not exists power_score numeric(5, 2);

alter table public.card_catalog
  add column if not exists usability_score numeric(5, 2);

alter table public.card_catalog
  add column if not exists versatility_score numeric(5, 2);

alter table public.card_catalog
  add column if not exists dependency_score numeric(5, 2);

alter table public.card_catalog
  add column if not exists consistency_score numeric(5, 2);

alter table public.card_catalog
  add column if not exists draft_value_score numeric(5, 2);

comment on column public.card_catalog.draft_value_score is
  'How valuable it is to be RANDOMLY offered this card - the intended basis for proposed_game_rarity. Distinct from power_score (raw ceiling): a high-power, high-dependency, low-usability card can have a low draft_value_score.';

alter table public.card_catalog
  add column if not exists valuation_reason text;

comment on column public.card_catalog.valuation_reason is
  'Human-readable explanation of the scores above, e.g. "Powerful payoff but requires four different Attributes and has very low standalone usability." Never a black-box score with no reason.';

alter table public.card_catalog
  add column if not exists valuation_engine_version text;

alter table public.card_catalog
  add column if not exists valuation_computed_at timestamptz;

alter table public.card_catalog
  add column if not exists valuation_manually_overridden boolean not null default false;

comment on column public.card_catalog.valuation_manually_overridden is
  'Mirrors the existing rarity_manually_overridden pattern (202608190003_game_rarity.sql) - when true, the audit script must never overwrite this card''s scores/proposed_game_rarity/oppressiveness_tier on a later run.';

alter table public.card_catalog
  add column if not exists proposed_game_rarity text;

alter table public.card_catalog
  drop constraint if exists card_catalog_proposed_game_rarity_check;

alter table public.card_catalog
  add constraint card_catalog_proposed_game_rarity_check
  check (
    proposed_game_rarity is null
    or proposed_game_rarity in ('Normal', 'Rare', 'Super Rare', 'Ultra Rare', 'Secret Rare', 'Legendary')
  );

comment on column public.card_catalog.proposed_game_rarity is
  'Written by scripts/audit-card-valuation.mjs. Deliberately SEPARATE from the live game_rarity column - proposing a rarity never changes what Draft/Shop actually offer. Copying proposed_game_rarity -> game_rarity is a distinct, explicit, reviewed apply step (see the Season 1 runbook Phase D) - this migration does not perform that copy for any card.';

create index if not exists card_catalog_release_stage_idx
  on public.card_catalog(release_stage);

create index if not exists card_catalog_oppressiveness_tier_idx
  on public.card_catalog(oppressiveness_tier);


-- ---------------------------------------------------------
-- 2. duelist_circle_formats - versioned format definitions.
--    Config/catalog data, not player data (no profile_id).
-- ---------------------------------------------------------

create table if not exists public.duelist_circle_formats (
  id uuid primary key default gen_random_uuid(),

  code text not null unique,
  name text not null,
  version integer not null,

  release_cutoff date,

  allow_illusion boolean not null default false,
  allow_synchro boolean not null default true,
  allow_xyz boolean not null default true,
  allow_link boolean not null default true,
  allow_pendulum boolean not null default true,
  allow_fusion boolean not null default true,

  power_ceiling numeric(5, 2),

  current_release_stage integer not null default 1,

  is_active boolean not null default false,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint duelist_circle_formats_stage_positive
    check (current_release_stage >= 1)
);

comment on table public.duelist_circle_formats is
  'Versioned Duelist Circle format definitions. At most one row may have is_active = true (enforced by duelist_circle_formats_one_active below) - that row is what is_duelist_circle_format_eligible() uses by default and what recompute_format_eligibility() applies when called with no explicit format_id.';

comment on column public.duelist_circle_formats.release_cutoff is
  'NULL = no release-date cutoff enforced. A card is excluded on cutoff grounds only when its release_date is known and strictly after this date - an unknown release_date never gets excluded by this rule alone.';

comment on column public.duelist_circle_formats.power_ceiling is
  'NULL = no score-based ceiling enforced. When set, excludes any card whose power_score exceeds it - this is a coarse additional safety net, not a substitute for the release_stage/oppressiveness review, which is the primary mechanism for holding back early-game-oppressive cards.';

create unique index if not exists duelist_circle_formats_one_active
  on public.duelist_circle_formats(is_active)
  where is_active = true;

-- No shared "touch updated_at" trigger exists anywhere in this
-- schema (verified by grep - every table sets updated_at = now()
-- explicitly in its own UPDATE statements); matching that
-- convention rather than introducing a new one here.


-- ---------------------------------------------------------
-- 3. format_card_overrides - auditable manual per-card,
--    per-format decisions. Never silently overwritten by the
--    audit script (see valuation_manually_overridden above for
--    the equivalent guarantee on the scoring side).
-- ---------------------------------------------------------

create table if not exists public.format_card_overrides (
  id uuid primary key default gen_random_uuid(),

  format_id uuid not null
    references public.duelist_circle_formats(id)
    on delete cascade,

  card_catalog_id uuid not null
    references public.card_catalog(id)
    on delete cascade,

  override_type text not null,

  release_stage_override integer,

  reason text not null,

  created_by uuid
    references public.profiles(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint format_card_overrides_type_check
    check (override_type in ('include', 'exclude')),

  constraint format_card_overrides_reason_not_blank
    check (length(trim(reason)) > 0),

  unique (format_id, card_catalog_id)
);

comment on table public.format_card_overrides is
  'Manual human decisions that override the computed format eligibility for one card in one format version. override_type=exclude always wins (even over an include-by-default computation). override_type=include bypasses the mechanic/cutoff/stage checks but never bypasses Master Duel forbidden/not_available/unknown, which stays an absolute gate - see is_duelist_circle_format_eligible() below.';

create index if not exists format_card_overrides_format_idx
  on public.format_card_overrides(format_id);

alter table public.duelist_circle_formats enable row level security;
alter table public.format_card_overrides enable row level security;

drop policy if exists duelist_circle_formats_select_authenticated
  on public.duelist_circle_formats;

create policy duelist_circle_formats_select_authenticated
  on public.duelist_circle_formats
  for select
  to authenticated
  using (true);

drop policy if exists format_card_overrides_select_authenticated
  on public.format_card_overrides;

create policy format_card_overrides_select_authenticated
  on public.format_card_overrides
  for select
  to authenticated
  using (true);

-- No insert/update/delete policies for authenticated: both tables
-- are admin-managed config, mutated only via SECURITY DEFINER
-- functions/service-role tooling, same pattern as card_catalog
-- itself (202608190002_card_catalog.sql revokes client writes).
revoke insert, update, delete on public.duelist_circle_formats from authenticated;
revoke insert, update, delete on public.format_card_overrides from authenticated;


-- ---------------------------------------------------------
-- 4. get_active_duelist_circle_format() - convenience lookup.
-- ---------------------------------------------------------

create or replace function public.get_active_duelist_circle_format()
returns public.duelist_circle_formats
language sql
stable
security definer
set search_path = ''
as $$
  select f.*
  from public.duelist_circle_formats f
  where f.is_active = true
  limit 1;
$$;


-- ---------------------------------------------------------
-- 5. is_duelist_circle_format_eligible() - the central,
--    versioned predicate. target_format_id = null uses the
--    active format; if there is no active format at all, this
--    falls back to the existing legacy behavior (the current
--    format_eligible column + Master Duel gate) so the function
--    is safe to call even before any format row is activated.
-- ---------------------------------------------------------

create or replace function public.is_duelist_circle_format_eligible(
  target_card_catalog_id uuid,
  target_format_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  fmt public.duelist_circle_formats;
  card public.card_catalog;
  override public.format_card_overrides;
  is_synchro boolean;
  is_xyz boolean;
  is_link boolean;
  is_pendulum boolean;
  is_fusion boolean;
  is_illusion boolean;
begin
  select * into card from public.card_catalog where id = target_card_catalog_id;
  if card is null then
    return false;
  end if;

  -- Master Duel is an absolute, non-configurable gate regardless
  -- of format - forbidden/not_available/unknown are never offered.
  if not public.is_master_duel_offerable(card.master_duel_status) then
    return false;
  end if;

  if target_format_id is null then
    select * into fmt from public.duelist_circle_formats where is_active = true limit 1;
  else
    select * into fmt from public.duelist_circle_formats where id = target_format_id;
  end if;

  if fmt is null then
    -- No format configured/active yet: fall back to the existing
    -- legacy global flag so this function is safe to call at any
    -- point, including before Season 1 is set up.
    return coalesce(card.format_eligible, false);
  end if;

  select * into override
  from public.format_card_overrides
  where format_id = fmt.id and card_catalog_id = target_card_catalog_id;

  if override.id is not null and override.override_type = 'exclude' then
    return false;
  end if;

  if override.id is not null and override.override_type = 'include' then
    return true;
  end if;

  is_synchro := coalesce(card.card_type, '') ilike '%synchro%' or coalesce(card.frame_type, '') ilike '%synchro%';
  is_xyz := coalesce(card.card_type, '') ilike '%xyz%' or coalesce(card.frame_type, '') ilike '%xyz%';
  is_link := coalesce(card.card_type, '') ilike '%link%' or coalesce(card.frame_type, '') ilike '%link%';
  is_pendulum := coalesce(card.card_type, '') ilike '%pendulum%' or coalesce(card.frame_type, '') ilike '%pendulum%';
  is_fusion := coalesce(card.card_type, '') ilike '%fusion%' or coalesce(card.frame_type, '') ilike '%fusion%';
  is_illusion := coalesce(card.race, '') = 'Illusion' or coalesce(card.monster_type, '') ilike '%illusion%';

  if is_synchro and not fmt.allow_synchro then return false; end if;
  if is_xyz and not fmt.allow_xyz then return false; end if;
  if is_link and not fmt.allow_link then return false; end if;
  if is_pendulum and not fmt.allow_pendulum then return false; end if;
  if is_fusion and not fmt.allow_fusion then return false; end if;
  if is_illusion and not fmt.allow_illusion then return false; end if;

  if fmt.release_cutoff is not null
    and card.release_date is not null
    and card.release_date > fmt.release_cutoff
  then
    return false;
  end if;

  if fmt.power_ceiling is not null
    and card.power_score is not null
    and card.power_score > fmt.power_ceiling
  then
    return false;
  end if;

  if card.release_stage is null or card.release_stage > fmt.current_release_stage then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.is_duelist_circle_format_eligible(uuid, uuid) is
  'Single source of truth for Duelist Circle format eligibility. Intended callers: recompute_format_eligibility() (writes the answer into card_catalog.format_eligible, which Draft/Shop/Deckbuilder already read), the Deckbuilder/Card Detail UI for a live per-card check, and the Master Duel export/legality check. Master Duel forbidden/not_available/unknown is an absolute gate that no format configuration or manual include-override can bypass.';


-- ---------------------------------------------------------
-- 6. recompute_format_eligibility() - the explicit, re-runnable
--    APPLY step. Admin-only. Writes into the EXISTING
--    format_eligible/format_exclusion_reason columns that
--    Draft/Shop/Deckbuilder already filter on - this is the only
--    function in this migration that mutates card_catalog rows
--    at scale, and it is never called automatically by this
--    migration or by any trigger.
-- ---------------------------------------------------------

create or replace function public.recompute_format_eligibility(
  target_format_id uuid default null
)
returns table (updated_count integer, eligible_count integer, ineligible_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  is_admin boolean;
  fmt public.duelist_circle_formats;
  v_updated integer;
  v_eligible integer;
  v_ineligible integer;
begin
  current_user_id := (select auth.uid());

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1
    from public.league_members lm
    where lm.profile_id = current_user_id
      and lm.role = 'admin'
  )
  into is_admin;

  if not is_admin then
    raise exception 'Only a league admin may recompute format eligibility.';
  end if;

  if target_format_id is null then
    select * into fmt from public.duelist_circle_formats where is_active = true limit 1;
    if fmt is null then
      raise exception 'No active duelist_circle_formats row - pass target_format_id explicitly, or activate a format first.';
    end if;
  else
    select * into fmt from public.duelist_circle_formats where id = target_format_id;
    if fmt is null then
      raise exception 'Unknown format id.';
    end if;
  end if;

  with computed as (
    select
      c.id,
      public.is_duelist_circle_format_eligible(c.id, fmt.id) as eligible
    from public.card_catalog c
  )
  update public.card_catalog c
  set
    format_eligible = computed.eligible,
    format_exclusion_reason = case
      when computed.eligible then null
      else 'Excluded by ' || fmt.code || ' (see is_duelist_circle_format_eligible / format_card_overrides for the exact reason)'
    end,
    updated_at = now()
  from computed
  where c.id = computed.id
    and (c.format_eligible is distinct from computed.eligible);

  get diagnostics v_updated = row_count;

  select count(*) filter (where format_eligible = true),
         count(*) filter (where format_eligible = false or format_eligible is null)
  into v_eligible, v_ineligible
  from public.card_catalog;

  return query select v_updated, v_eligible, v_ineligible;
end;
$$;

comment on function public.recompute_format_eligibility(uuid) is
  'Explicit, admin-gated, re-runnable APPLY step. Call this only after release_stage has been populated for the cards you intend to make available (see the Season 1 runbook Phase D/F) - before that, every card has release_stage = null and is_duelist_circle_format_eligible() treats that as not-yet-released, so calling this too early will correctly (if surprisingly) make the whole catalog ineligible rather than silently offering unreviewed cards.';

revoke all on function public.is_duelist_circle_format_eligible(uuid, uuid) from public;
grant execute on function public.is_duelist_circle_format_eligible(uuid, uuid) to authenticated;

revoke all on function public.recompute_format_eligibility(uuid) from public;
grant execute on function public.recompute_format_eligibility(uuid) to authenticated;

revoke all on function public.get_active_duelist_circle_format() from public;
grant execute on function public.get_active_duelist_circle_format() to authenticated;


-- ---------------------------------------------------------
-- 7. Seed the proposed Season 1 format row - INACTIVE.
--    This alone changes nothing about what Draft/Shop offer:
--    is_active = false, and recompute_format_eligibility() is
--    never called by this migration.
-- ---------------------------------------------------------

insert into public.duelist_circle_formats (
  code, name, version,
  release_cutoff,
  allow_illusion, allow_synchro, allow_xyz, allow_link, allow_pendulum, allow_fusion,
  current_release_stage,
  is_active,
  notes
)
values (
  'season_1',
  'Duelist Circle Season 1',
  1,
  '2020-12-31',
  false, false, true, false, false, true,
  1,
  false,
  'PROPOSED starting configuration, not yet approved. release_cutoff of 2020-12-31 matches the owner''s stated preliminary direction ("waarschijnlijk rond <= 2020") - see the 2019/2020/2021 pool audit for the actual comparison this should be decided from before activating. allow_synchro/allow_link/allow_pendulum = false matches the CURRENT live global exclusion (202608190005_draft_system.sql) so activating this format with these settings and recomputing is expected to reproduce today''s exclusions plus the new cutoff/illusion/stage/oppressiveness layers - not a silent behavior change on top of what is already excluded. allow_illusion = false per explicit instruction. Fusion/Xyz intentionally allowed per explicit instruction.'
)
on conflict (code) do nothing;
