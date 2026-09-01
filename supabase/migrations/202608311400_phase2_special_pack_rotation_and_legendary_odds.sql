begin;

-- =========================================================
-- PHASE 2 (FOLLOW-UP) - SPECIAL PACK ROTATION REBUILD +
-- LEGENDARY ODDS HIERARCHY CORRECTION
--
-- Implements the human-confirmed decisions from the Phase 2
-- follow-up directive (2026-08-31):
--
--   1. SPECIAL PACK STRUCTURE: 15 total configured themes, 3
--      active at the same time, deterministic 48h rotation, all
--      players see the same active 3, survives restart, pack
--      identities stay configurable (nothing invented to pad out
--      to exactly 15 - see section 1 below).
--   2/3/4. LEGENDARY ODDS: audited the current Standard/Premium/
--      Special/Deluxe odds (see roll_shop_pack_rarity below) and
--      corrected the one real inconsistency found - Premium
--      (900 DP) had a LOWER Legendary chance (0.10%) than the
--      cheaper Standard pack (300 DP, 0.15%). New hierarchy:
--      Standard 0.15% < Special 0.25% < Premium 0.30% < Deluxe
--      0.50% - strictly increasing with price for the three
--      normal purchasable tiers, Special positioned by its
--      thematic role (below both Premium and Deluxe, despite
--      costing more than Premium) rather than maximized because
--      it costs more. All four conservative, low-probability,
--      summing to 100 exactly as before - only the Legendary/
--      Secret-Rare split moved within Premium and Deluxe.
--
-- SECTION 1: WHY "MONSTER_TYPE" IS THE THIRD ROTATION CATEGORY
--
-- The live special-pack system (202608230021) already had exactly
-- TWO categories (attribute, archetype), each independently
-- holding one active rotation at a time - "3 active packs" cannot
-- be reached by giving one of those two categories a second
-- simultaneous active row, because every purchase/pity/theme-
-- filter code path (purchase_shop_pack, pick_shop_pack_card,
-- get_active_special_pack_rotation) is keyed by theme_category,
-- one value per active instance. Rather than inventing a new
-- addressing scheme (a slot id, a rotation-instance parameter) to
-- let 3 packs share 2 categories, this migration adds a THIRD
-- category - 'monster_type' - which pick_shop_pack_card has
-- supported as a theme dimension since it was written (see its
-- own `case theme_type ... when 'monster_type' ...` branch,
-- already live and untouched) but which was never wired up to
-- shop_special_pack_rotations' category check or exposed as a
-- purchasable pack code. Three categories, one active rotation
-- each, is the SMALLEST change that reaches "3 active at once"
-- while reusing every existing table, index, constraint, and
-- function UNCHANGED except where explicitly noted below - no new
-- uniqueness model, no new addressing scheme, no rebuild of a
-- working system.
--
-- SECTION 2: WHY "shop_special_pack_slots" INSTEAD OF LIVE RANDOM
-- SELECTION
--
-- The live refresh_shop_special_pack_rotation_if_needed() picked a
-- fresh theme with `order by random() limit 1` on every 48h
-- refresh - never a fixed, enumerable pool, and never deterministic
-- (the directive requires both: "15 total configured" and
-- "deterministic 48-hour rotation"). This migration adds
-- shop_special_pack_slots, a small per-category ordered list (up to
-- 5 slots per category x 3 categories = up to 15 total - the exact
-- Phase 2 target), and changes the refresh function to advance
-- through that fixed list IN ORDER, wrapping back to slot 1 after
-- the last one, instead of drawing a new random theme. A category
-- with exactly 5 configured slots completes a full cycle in
-- 5 x 48h = 240h = 10 days, matching the original Phase 2
-- directive's own "~10-day full cycle" target exactly.
--
-- The 15 slots are populated from REAL, LIVE card_catalog data -
-- the exact same eligibility rule already proven in production
-- (format_eligible + is_master_duel_offerable + >=12 matching
-- cards), just with a DETERMINISTIC tie-break (alphabetical) in
-- place of the old `order by random()`, and capped at 5 per
-- category. If the live catalog has fewer than 5 eligible themes
-- for a category, fewer slots are configured for it - no
-- placeholder or invented theme is ever inserted to pad the count
-- to 15, per the directive's explicit "do not invent final card
-- contents just to fill all 15 packs" instruction. A human can
-- freely edit shop_special_pack_slots afterward to curate the
-- final identities (add, remove, reorder) without touching any
-- function in this migration - slot_order determines rotation
-- sequence, not the underlying card pool.
--
-- SECTION 3: WHAT IS DELIBERATELY UNCHANGED
-- - get_active_special_pack_rotation(category): already tolerant
--   of the category values it's given and already picks the
--   single active row deterministically (order by starts_at desc
--   limit 1) - zero changes needed.
-- - shop_special_pack_rotations' existing "one active row per
--   theme_category" unique index: with exactly 3 categories this
--   index now IS the "at most 3 active at once" guarantee (one
--   attribute + one archetype + one monster_type) - no change
--   needed to the index itself, only to the check constraint that
--   validates which category values are allowed (section below).
-- - pick_shop_pack_card's theme-matching case statement: already
--   supports 'monster_type' (and 'card_type', 'frame_type',
--   'custom' - unused today, available for a future category
--   without any further schema change).
-- - Every rarity-odds NUMBER for Standard and Special: audited and
--   found already correct relative to the approved hierarchy (see
--   roll_shop_pack_rarity below) - only Premium and Deluxe's
--   Legendary/Secret-Rare split changed.
-- - Pity thresholds, pack prices (beyond the already-corrected
--   1200 DP special price), voucher redemption, card-instance
--   minting, ownership history, first-pull tracking: untouched.
--
-- SECTION 4: A KNOWN, HONEST GAP - LEFT FOR A UI FOLLOW-UP
-- The Shop UI (src/app/(app)/shop/page.tsx) and its server action
-- (src/app/actions/shop.ts) currently render exactly two special-
-- pack purchase entry points, wired to the 'special_attribute' and
-- 'special_archetype' pack codes. This migration adds a third,
-- fully working backend pack code - 'special_monster_type' - but
-- does NOT touch the Shop UI or its actions (per the standing "no
-- Shop UI redesign" instruction from the original Phase 2
-- directive). Until a small UI update adds a third pack
-- card/button calling purchase_shop_pack('special_monster_type',
-- ...), players will only be able to SEE all 3 active rotations
-- (via a live query) but only PURCHASE 2 of the 3 through the
-- existing UI. This is flagged in the final report as the one
-- remaining step before the special-pack rebuild is fully
-- player-facing.
--
-- ALSO FIXED IN THIS MIGRATION (discovered during the "verify the
-- existing safe reroll/fallback mechanism" audit the directive
-- asked for): pick_shop_pack_card's own candidate-selection
-- queries excluded a card only by THIS PLAYER's copy count, for
-- every rarity including Legendary - meaning it could still offer
-- an already-league-owned Legendary as a "candidate" (correctly
-- rejected only by purchase_shop_pack's own outer retry loop,
-- which has no memory across attempts and could exhaust all 25
-- retries re-picking the exact same doomed card for a narrow
-- special-pack theme with only one matching Legendary). Fixed by
-- applying the same Legendary-is-league-wide branch already used
-- in purchase_shop_pack's own 2026-08-30 fix, one level earlier,
-- inside pick_shop_pack_card itself - see that function's reissue
-- below for the full explanation.
--
-- SAFE TO RE-RUN: shop_special_pack_slots population is
-- ON CONFLICT DO NOTHING (won't duplicate or reshuffle already-
-- configured slots on a second run); the check-constraint widening
-- is a dynamic find-and-drop-if-exists before adding the new one;
-- every function is a plain CREATE OR REPLACE.
-- =========================================================


-- ---------------------------------------------------------
-- 1. shop_special_pack_slots - the configured 15-slot pool.
-- ---------------------------------------------------------

create table if not exists public.shop_special_pack_slots (
  id uuid primary key default gen_random_uuid(),

  theme_category text not null
    check (theme_category in ('attribute', 'archetype', 'monster_type')),

  slot_order integer not null check (slot_order >= 1),

  theme_value text not null,
  theme_label text not null,

  created_at timestamptz not null default now(),

  unique (theme_category, slot_order),
  unique (theme_category, theme_value)
);

comment on table public.shop_special_pack_slots is
  'Configured pool of special-pack theme "slots" per category (attribute/archetype/monster_type), up to 5 per category (15 total) - the Phase 2 "15 configured, 3 active" target, one active slot per category at a time via shop_special_pack_rotations. Populated once at migration time from real, live card_catalog data (deterministic alphabetical order, not random), using the exact eligibility rule already proven by refresh_shop_special_pack_rotation_if_needed (format_eligible + is_master_duel_offerable + >=12 matching cards). If fewer than 5 eligible themes exist for a category in the live catalog, fewer slots are configured - no placeholder/invented theme is ever inserted in their place. A human can freely add, remove, or reorder rows here later to curate the final identities; slot_order determines rotation sequence within its category, not the underlying card pool.';

alter table public.shop_special_pack_slots enable row level security;

drop policy if exists shop_special_pack_slots_select_authenticated on public.shop_special_pack_slots;
create policy shop_special_pack_slots_select_authenticated on public.shop_special_pack_slots
  for select to authenticated
  using (true);

revoke insert, update, delete on public.shop_special_pack_slots from authenticated;
grant select on public.shop_special_pack_slots to authenticated;


-- ---------------------------------------------------------
-- 2. Populate up to 5 slots per category from real, live
--    catalog data - deterministic alphabetical order, capped,
--    never invented. Three independent statements; each is
--    safe to re-run (ON CONFLICT DO NOTHING on the
--    (theme_category, slot_order) uniqueness).
-- ---------------------------------------------------------

with eligible_archetypes as (
  select cc.archetype as theme_value
  from public.card_catalog cc
  where cc.format_eligible = true
    and public.is_master_duel_offerable(cc.master_duel_status)
    and cc.archetype is not null
    and cc.archetype <> ''
  group by cc.archetype
  having count(*) >= 12
),
ranked_archetypes as (
  select theme_value, row_number() over (order by theme_value asc) as slot_order
  from eligible_archetypes
)
insert into public.shop_special_pack_slots (theme_category, slot_order, theme_value, theme_label)
select 'archetype', slot_order, theme_value, theme_value
from ranked_archetypes
where slot_order <= 5
on conflict (theme_category, slot_order) do nothing;

with eligible_attributes as (
  select cc.attribute as theme_value
  from public.card_catalog cc
  where cc.format_eligible = true
    and public.is_master_duel_offerable(cc.master_duel_status)
    and cc.attribute is not null
    and cc.attribute <> ''
  group by cc.attribute
  having count(*) >= 12
),
ranked_attributes as (
  select theme_value, row_number() over (order by theme_value asc) as slot_order
  from eligible_attributes
)
insert into public.shop_special_pack_slots (theme_category, slot_order, theme_value, theme_label)
select 'attribute', slot_order, theme_value, theme_value
from ranked_attributes
where slot_order <= 5
on conflict (theme_category, slot_order) do nothing;

with eligible_monster_types as (
  select cc.monster_type as theme_value
  from public.card_catalog cc
  where cc.format_eligible = true
    and public.is_master_duel_offerable(cc.master_duel_status)
    and cc.monster_type is not null
    and cc.monster_type <> ''
  group by cc.monster_type
  having count(*) >= 12
),
ranked_monster_types as (
  select theme_value, row_number() over (order by theme_value asc) as slot_order
  from eligible_monster_types
)
insert into public.shop_special_pack_slots (theme_category, slot_order, theme_value, theme_label)
select 'monster_type', slot_order, theme_value, theme_value
from ranked_monster_types
where slot_order <= 5
on conflict (theme_category, slot_order) do nothing;


-- ---------------------------------------------------------
-- 3. shop_special_pack_rotations: add slot_order (additive,
--    nullable - historical rows predate slots), widen the
--    theme_category check constraint to allow 'monster_type'.
--    The existing "one active row per theme_category" unique
--    index is UNCHANGED and is now exactly the "3 active at
--    once" guarantee (one per category, three categories).
-- ---------------------------------------------------------

alter table public.shop_special_pack_rotations
  add column if not exists slot_order integer;

comment on column public.shop_special_pack_rotations.slot_order is
  'Which shop_special_pack_slots.slot_order (within this row''s theme_category) is currently active - lets refresh_shop_special_pack_rotation_if_needed() advance deterministically to the next configured slot instead of drawing a new random theme. Null on historical rows created before this column existed.';

do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    where rel.relname = 'shop_special_pack_rotations'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%theme_category%'
  loop
    execute format('alter table public.shop_special_pack_rotations drop constraint %I', con.conname);
  end loop;
end;
$$;

alter table public.shop_special_pack_rotations
  add constraint shop_special_pack_rotations_theme_category_check
  check (theme_category in ('attribute', 'archetype', 'monster_type'));

comment on table public.shop_special_pack_rotations is
  'Three independently-refreshing (48h) rotating special packs, one per theme_category (attribute, archetype, monster_type) - three concurrently active rows is the Phase 2 "3 active at once" target. Each category advances deterministically through its own configured shop_special_pack_slots list (slot_order), wrapping after the last configured slot - never random, as of the 2026-08-31 Phase 2 special-pack rebuild.';


-- ---------------------------------------------------------
-- 4. refresh_shop_special_pack_rotation_if_needed - reissued.
--    Same name, same signature, same lazy-refresh/advisory-
--    lock/idempotent-check safety properties as the live
--    version - the ONLY behavioral change is WHICH theme gets
--    picked: deterministic "next configured slot in sequence"
--    instead of `order by random()` over live catalog data.
--    Supersedes the reissue in 202608311200 (which only changed
--    the hardcoded price 900 -> 1200, already correct and kept
--    here unchanged).
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
  previous_slot_order integer;
  total_slots integer;
  next_slot_order integer;
  next_theme_value text;
  next_theme_label text;
begin
  if target_theme_category not in ('attribute', 'archetype', 'monster_type') then
    raise exception 'Invalid special pack theme category.';
  end if;

  perform pg_advisory_xact_lock(hashtext('shop_special_refresh_' || target_theme_category));

  if exists (
    select 1
    from public.shop_special_pack_rotations
    where
      theme_category = target_theme_category
      and status = 'active'
      and starts_at <= now()
      and ends_at > now()
  ) then
    return;
  end if;

  update public.shop_special_pack_rotations
  set
    status = 'completed',
    updated_at = now()
  where
    theme_category = target_theme_category
    and status = 'active'
    and ends_at <= now();

  select count(*)
  into total_slots
  from public.shop_special_pack_slots
  where theme_category = target_theme_category;

  -- No configured slots at all for this category (e.g. a
  -- sparse/test catalog, or a category not yet curated) - skip
  -- generating a rotation for it rather than raising. A missing
  -- special pack is safer than a broken one, and never blocks
  -- singles refresh or the other categories.
  if total_slots = 0 then
    return;
  end if;

  select slot_order
  into previous_slot_order
  from public.shop_special_pack_rotations
  where theme_category = target_theme_category
  order by created_at desc
  limit 1;

  -- DETERMINISTIC SEQUENTIAL ROTATION: advance to the next
  -- configured slot in this category's fixed sequence, wrapping
  -- back to 1 after the last one - never random. A category with
  -- N configured slots completes a full cycle every N * 48h (5
  -- slots = a 10-day full cycle, matching the original Phase 2
  -- "~10-day full cycle" target).
  next_slot_order := case
    when previous_slot_order is null then 1
    else (previous_slot_order % total_slots) + 1
  end;

  select theme_value, theme_label
  into next_theme_value, next_theme_label
  from public.shop_special_pack_slots
  where theme_category = target_theme_category
    and slot_order = next_slot_order;

  if next_theme_value is null then
    return;
  end if;

  insert into public.shop_special_pack_rotations (
    theme_category,
    slot_order,
    theme_value,
    theme_label,
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
    1200,
    5,
    now(),
    now() + interval '48 hours',
    'active'
  );
end;
$function$;

revoke all
  on function public.refresh_shop_special_pack_rotation_if_needed(text)
  from public;

grant execute
  on function public.refresh_shop_special_pack_rotation_if_needed(text)
  to authenticated;


-- ---------------------------------------------------------
-- 5. ensure_shop_rotations_current - reissued, adds the
--    monster_type refresh call. Singles and the other two
--    special categories are unchanged.
-- ---------------------------------------------------------

create or replace function public.ensure_shop_rotations_current()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.refresh_shop_singles_rotation_if_needed();
  perform public.refresh_shop_special_pack_rotation_if_needed('attribute');
  perform public.refresh_shop_special_pack_rotation_if_needed('archetype');
  perform public.refresh_shop_special_pack_rotation_if_needed('monster_type');
end;
$function$;

revoke all
  on function public.ensure_shop_rotations_current()
  from public;

grant execute
  on function public.ensure_shop_rotations_current()
  to authenticated;


-- ---------------------------------------------------------
-- 6. roll_shop_pack_rarity - reissued with the corrected
--    Legendary/Secret-Rare split for Premium and Deluxe (see
--    this migration's header for the audit and the exact
--    numbers). Standard and Special are numerically unchanged;
--    Special's valid-pack-code list widens to include
--    special_monster_type. Every other tier, every forced-
--    minimum-rank (pity) branch, is byte-for-byte identical to
--    the live version.
-- ---------------------------------------------------------

create or replace function public.roll_shop_pack_rarity(
  target_pack_code text,
  minimum_rank integer default 1
)
returns text
language plpgsql
as $function$
declare
  roll numeric;
begin
  roll := random() * 100;

  -- =======================================================
  -- FORCED ULTRA+ (unchanged)
  -- =======================================================
  if minimum_rank >= 4 then
    if roll < 72 then
      return 'Ultra Rare';
    elsif roll < 95 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- FORCED SUPER+ (unchanged)
  -- =======================================================
  if minimum_rank = 3 then
    if roll < 65 then
      return 'Super Rare';
    elsif roll < 90 then
      return 'Ultra Rare';
    elsif roll < 98 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- FORCED RARE+ (unchanged)
  -- =======================================================
  if minimum_rank = 2 then
    if roll < 55 then
      return 'Rare';
    elsif roll < 83 then
      return 'Super Rare';
    elsif roll < 95 then
      return 'Ultra Rare';
    elsif roll < 99 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- NORMAL PACK - LIVE (unchanged)
  -- 68 / 24 / 6.5 / 1.15 / 0.2 / else Legendary
  -- =======================================================
  if target_pack_code = 'normal' then
    if roll < 68 then
      return 'Normal';
    elsif roll < 92 then
      return 'Rare';
    elsif roll < 98.5 then
      return 'Super Rare';
    elsif roll < 99.65 then
      return 'Ultra Rare';
    elsif roll < 99.85 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- PREMIUM PACK - CORRECTED (2026-08-31, Legendary-odds
  -- hierarchy fix): Legendary raised 0.10% -> 0.30% (was, absurdly,
  -- LOWER than the cheaper Standard pack's 0.15% despite costing
  -- 3x as much - see this migration's header). Secret Rare's share
  -- reduced by the same 0.20 points (1.9 -> 1.70) so the
  -- distribution still sums to 100; every other tier unchanged.
  -- 30 / 38 / 22 / 8 / 1.70 / else Legendary
  -- =======================================================
  if target_pack_code = 'premium' then
    if roll < 30 then
      return 'Normal';
    elsif roll < 68 then
      return 'Rare';
    elsif roll < 90 then
      return 'Super Rare';
    elsif roll < 98 then
      return 'Ultra Rare';
    elsif roll < 99.7 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- DELUXE PACK - CORRECTED (2026-08-31, Legendary-odds hierarchy
  -- fix): Legendary raised 0.45% -> 0.50%, keeping Deluxe the best
  -- Legendary chance among the three normal purchasable tiers
  -- (Standard 0.15% < Premium 0.30% < Deluxe 0.50%) without making
  -- it common - still roughly 1-in-200. Secret Rare's share reduced
  -- by the same 0.05 points (11.55 -> 11.50) so the distribution
  -- still sums to 100; every other tier unchanged.
  -- 11 / 20 / 31 / 26 / 11.50 / else Legendary
  -- =======================================================
  if target_pack_code = 'deluxe' then
    if roll < 11 then
      return 'Normal';
    elsif roll < 31 then
      return 'Rare';
    elsif roll < 62 then
      return 'Super Rare';
    elsif roll < 88 then
      return 'Ultra Rare';
    elsif roll < 99.5 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- SPECIAL PACK(S) - odds unchanged (2026-08-31 hierarchy audit:
  -- 0.25% Legendary already sits below Premium's corrected 0.30%
  -- and Deluxe's corrected 0.50%, so Special already satisfies
  -- "thematic targeting, not a Legendary-farming route" without
  -- any numeric change - only the pack-code list is widened here
  -- to add special_monster_type, the new third rotation category).
  -- Shared by special_attribute, special_archetype and
  -- special_monster_type, plus the legacy 'special' code for
  -- backward compatibility with any code path that might still
  -- pass it.
  -- 18 / 29 / 29 / 17.3 / 6.45 / else Legendary
  -- =======================================================
  if target_pack_code in ('special', 'special_attribute', 'special_archetype', 'special_monster_type') then
    if roll < 18 then
      return 'Normal';
    elsif roll < 47 then
      return 'Rare';
    elsif roll < 76 then
      return 'Super Rare';
    elsif roll < 93.3 then
      return 'Ultra Rare';
    elsif roll < 99.75 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  raise exception 'Unknown pack code.';
end;
$function$;


-- ---------------------------------------------------------
-- 7. pick_shop_pack_card - reissued with the league-wide-
--    Legendary candidate-selection fix (see this migration's
--    header for the "verify the existing safe reroll/fallback
--    mechanism" audit finding). Theme matching, fallback tier
--    order, and the Master Duel eligibility filter are otherwise
--    byte-for-byte identical to the live version.
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

revoke all
  on function public.pick_shop_pack_card(uuid, text, uuid)
  from public;

grant execute
  on function public.pick_shop_pack_card(uuid, text, uuid)
  to authenticated;



-- ---------------------------------------------------------
-- 8. purchase_shop_pack - reissued to accept the new
--    'special_monster_type' pack code (widened in the pack-
--    validity check, the theme_category mapping, the required-
--    voucher-type mapping, and both special-pack pity threshold
--    checks - 7 sites total, listed in this migration's own
--    commit history). Every other line - payment, purchase/
--    opening/pity records, card generation loop, Legendary
--    league-wide copy-limit check, first-pull tracking, voucher
--    consumption - is byte-for-byte identical to the live
--    version (202608302335).
-- ---------------------------------------------------------

create or replace function public.purchase_shop_pack(
  target_pack_code text,
  target_voucher_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_user_id uuid;
  current_league_id uuid;
  active_rotation_id uuid;
  theme_category text;
  special_rotation_id uuid;
  pack_price integer;
  pack_card_count integer;
  required_voucher_type text;
  current_dp integer;
  voucher_row public.reward_vouchers%rowtype;
  purchase_id uuid;
  opening_id uuid;
  pity_count integer := 0;
  position_number integer;
  minimum_rarity_rank integer;
  rolled_rarity text;
  chosen_card_id uuid;
  chosen_card_rarity text;
  copy_limit integer;
  current_owned_count integer;
  next_copy_number integer;
  new_instance_id uuid;
  hit_pity_target boolean := false;
  attempts integer;
  is_first_pull boolean;
begin
  -- =======================================================
  -- AUTH
  -- =======================================================
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  -- =======================================================
  -- CURRENT LEAGUE
  -- =======================================================
  select
    lm.league_id
  into current_league_id
  from public.league_members lm
  where lm.profile_id = current_user_id
  limit 1;

  if current_league_id is null then
    raise exception 'Current user is not a league member.';
  end if;

  -- =======================================================
  -- VALID PACK
  -- =======================================================
  if target_pack_code not in ('normal', 'premium', 'deluxe', 'special_attribute', 'special_archetype', 'special_monster_type') then
    raise exception 'Invalid pack type.';
  end if;

  active_rotation_id := public.get_active_shop_rotation();

  if target_pack_code in ('special_attribute', 'special_archetype', 'special_monster_type') then
    theme_category := case target_pack_code
      when 'special_attribute' then 'attribute'
      when 'special_archetype' then 'archetype'
      when 'special_monster_type' then 'monster_type'
    end;
  end if;

  -- =======================================================
  -- PACK CONFIG
  -- =======================================================
  if theme_category is null then
    select
      price_dp,
      cards_per_pack
    into
      pack_price,
      pack_card_count
    from public.shop_pack_types
    where
      code = target_pack_code
      and active = true;

    if not found then
      raise exception 'Pack is not available.';
    end if;
  else
    special_rotation_id := public.get_active_special_pack_rotation(theme_category);

    if special_rotation_id is null then
      raise exception 'No active special pack rotation for this theme.';
    end if;

    select
      price_dp,
      cards_per_pack
    into
      pack_price,
      pack_card_count
    from public.shop_special_pack_rotations
    where id = special_rotation_id;

    if pack_price is null or pack_card_count is null then
      raise exception 'Special Pack is not configured for this rotation.';
    end if;
  end if;

  -- =======================================================
  -- VOUCHER TYPE
  -- =======================================================
  required_voucher_type :=
    case target_pack_code
      when 'normal' then 'normal_pack'
      when 'premium' then 'premium_pack'
      when 'deluxe' then 'deluxe_pack'
      when 'special_attribute' then 'special_pack'
      when 'special_archetype' then 'special_pack'
      when 'special_monster_type' then 'special_pack'
    end;

  -- =======================================================
  -- PAYMENT
  -- =======================================================
  if target_voucher_id is not null then
    select *
    into voucher_row
    from public.reward_vouchers
    where
      id = target_voucher_id
      and profile_id = current_user_id
    for update;

    if not found then
      raise exception 'Voucher not found.';
    end if;

    if voucher_row.voucher_type <> required_voucher_type then
      raise exception 'This voucher cannot be used for this pack.';
    end if;
  else
    select
      duel_points
    into current_dp
    from public.profiles
    where id = current_user_id
    for update;

    if not found then
      raise exception 'Profile not found.';
    end if;

    if current_dp < pack_price then
      raise exception 'Not enough Duel Points.';
    end if;

    update public.profiles
    set
      duel_points = duel_points - pack_price,
      updated_at = now()
    where id = current_user_id;
  end if;

  -- =======================================================
  -- PURCHASE
  -- =======================================================
  insert into public.shop_purchases (
    profile_id,
    purchase_type,
    rotation_id,
    special_pack_rotation_id,
    pack_type_id,
    used_voucher_id,
    voucher_type_used,
    dp_spent
  )
  values (
    current_user_id,
    case
      when theme_category is not null then 'special_pack'
      else 'pack'
    end,
    active_rotation_id,
    special_rotation_id,
    case
      when theme_category is not null then null
      else (
        select id
        from public.shop_pack_types
        where code = target_pack_code
        limit 1
      )
    end,
    target_voucher_id,
    case
      when target_voucher_id is not null then required_voucher_type
      else null
    end,
    case
      when target_voucher_id is null then pack_price
      else 0
    end
  )
  returning id
  into purchase_id;

  -- =======================================================
  -- PACK OPENING
  -- =======================================================
  insert into public.shop_pack_openings (
    profile_id,
    purchase_id,
    rotation_id,
    special_pack_rotation_id,
    pack_code
  )
  values (
    current_user_id,
    purchase_id,
    active_rotation_id,
    special_rotation_id,
    target_pack_code
  )
  returning id
  into opening_id;

  -- =======================================================
  -- PITY STATE
  -- =======================================================
  insert into public.shop_pack_pity (
    profile_id,
    pack_code,
    packs_since_ultra_or_better
  )
  values (
    current_user_id,
    target_pack_code,
    0
  )
  on conflict (profile_id, pack_code)
  do nothing;

  select
    packs_since_ultra_or_better
  into pity_count
  from public.shop_pack_pity
  where
    profile_id = current_user_id
    and pack_code = target_pack_code
  for update;

  -- =======================================================
  -- GENERATE CARDS
  -- =======================================================
  for position_number in 1..pack_card_count loop
    minimum_rarity_rank := 1;

    -- NORMAL PITY
    if target_pack_code = 'normal'
      and pity_count >= 8
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 3;
    -- PREMIUM
    elsif target_pack_code = 'premium'
      and pity_count >= 7
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 4;
    elsif target_pack_code = 'premium'
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 2;
    -- DELUXE
    elsif target_pack_code = 'deluxe'
      and pity_count >= 5
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 5;
    elsif target_pack_code = 'deluxe'
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 3;
    -- SPECIAL (both categories share the old 'special' thresholds)
    elsif target_pack_code in ('special_attribute', 'special_archetype', 'special_monster_type')
      and pity_count >= 6
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 4;
    elsif target_pack_code in ('special_attribute', 'special_archetype', 'special_monster_type')
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 3;
    end if;

    rolled_rarity := public.roll_shop_pack_rarity(target_pack_code, minimum_rarity_rank);

    -- =====================================================
    -- PICK CARD
    -- =====================================================
    attempts := 0;

    loop
      attempts := attempts + 1;

      if attempts > 25 then
        raise exception 'Could not find an eligible card for this pack.';
      end if;

      chosen_card_id := public.pick_shop_pack_card(
        current_user_id,
        rolled_rarity,
        special_rotation_id
      );

      if chosen_card_id is null then
        raise exception 'Could not select a card for this pack.';
      end if;

      perform pg_advisory_xact_lock(hashtext(chosen_card_id::text));

      select
        game_rarity
      into chosen_card_rarity
      from public.card_catalog
      where id = chosen_card_id;

      if chosen_card_rarity is null then
        raise exception 'Selected card has no rarity.';
      end if;

      copy_limit := public.shop_card_copy_limit(chosen_card_rarity);

      -- LEAGUE-WIDE LEGENDARY SCARCITY FIX (2026-08-30):
      -- shop_card_copy_limit()'s own comment has always said
      -- "Legendary = max 1 copy per league, everything else = max
      -- 3" - but this count query used to filter by
      -- current_owner_id = current_user_id for every rarity, making
      -- the Legendary limit a max of 1 copy PER PLAYER instead of
      -- one copy total across the whole league (each of the 3
      -- friends could pull their own "only" copy of the same
      -- Legendary). Legendary now counts every instance of this
      -- card in the league regardless of owner; every other rarity
      -- keeps its original per-player cap unchanged. Race-safe
      -- under the pg_advisory_xact_lock(hashtext(chosen_card_id::text))
      -- already taken above for this exact card_catalog_id, which
      -- was always keyed league-wide (not per-player) - so this was
      -- already safe to make league-wide, nothing else needed to
      -- change for concurrency.
      if chosen_card_rarity = 'Legendary' then
        select count(*)
        into current_owned_count
        from public.card_instances
        where
          league_id = current_league_id
          and card_catalog_id = chosen_card_id;
      else
        select count(*)
        into current_owned_count
        from public.card_instances
        where
          league_id = current_league_id
          and current_owner_id = current_user_id
          and card_catalog_id = chosen_card_id;
      end if;

      exit when current_owned_count < copy_limit;
    end loop;

    -- =====================================================
    -- FIRST-EVER PULL CHECK (Legendary only)
    --
    -- Computed here, under the pg_advisory_xact_lock already
    -- taken above for this exact card_catalog_id - race-safe
    -- against concurrent purchases of the same card by design,
    -- not a client-side guess. Checked BEFORE the new instance
    -- below is inserted.
    --
    -- IMPORTANT: this is NOT "was this player the original_owner_id
    -- of some existing instance" - that only reflects the very
    -- first acquirer of a card_instance row and goes stale the
    -- moment that instance changes hands (trade, wager, any other
    -- ownership transfer). A player who received this exact
    -- card_catalog_id via trade and later traded it away again
    -- would wrongly read as "never owned" under that check.
    --
    -- public.ownership_history is the source of truth for every
    -- acquisition of every card_instance, for both the initial
    -- acquisition (INSERT trigger, to_owner_id = acquirer) and
    -- every later transfer (UPDATE trigger, to_owner_id = new
    -- owner) - see record_card_ownership_history() in
    -- 202608190004_card_instances.sql. So "has this player ever
    -- owned this card_catalog_id, via any route" is exactly
    -- "does a row exist where to_owner_id = current_user_id for
    -- any card_instance of this card_catalog_id", regardless of
    -- whether that player still holds it today.
    -- =====================================================
    is_first_pull := null;

    if chosen_card_rarity = 'Legendary' then
      select not exists (
        select 1
        from public.card_instances ci
        join public.ownership_history oh
          on oh.card_instance_id = ci.id
        where
          ci.card_catalog_id = chosen_card_id
          and oh.to_owner_id = current_user_id
      )
      into is_first_pull;
    end if;

    -- =====================================================
    -- COPY NUMBER PER LEAGUE
    -- =====================================================
    select
      coalesce(max(copy_number), 0) + 1
    into next_copy_number
    from public.card_instances
    where
      league_id = current_league_id
      and card_catalog_id = chosen_card_id;

    -- =====================================================
    -- CREATE CARD INSTANCE
    --
    -- Definitive shop ownership metadata
    -- =====================================================
    insert into public.card_instances (
      league_id,
      card_catalog_id,
      copy_number,
      current_owner_id,
      original_owner_id,
      original_acquisition_type,
      original_source_id,
      acquired_at,
      locked
    )
    values (
      current_league_id,
      chosen_card_id,
      next_copy_number,
      current_user_id,
      current_user_id,
      'shop',
      opening_id,
      now(),
      false
    )
    returning id
    into new_instance_id;

    -- =====================================================
    -- RECORD PULL
    -- =====================================================
    insert into public.shop_pack_pulls (
      opening_id,
      card_catalog_id,
      card_instance_id,
      pull_position,
      pulled_rarity,
      is_first_for_player
    )
    values (
      opening_id,
      chosen_card_id,
      new_instance_id,
      position_number,
      chosen_card_rarity,
      is_first_pull
    );

    -- =====================================================
    -- PITY RESET CHECK
    -- =====================================================
    if target_pack_code = 'normal'
      and public.shop_rarity_rank(chosen_card_rarity) >= 3
    then
      hit_pity_target := true;
    elsif target_pack_code = 'premium'
      and public.shop_rarity_rank(chosen_card_rarity) >= 4
    then
      hit_pity_target := true;
    elsif target_pack_code = 'deluxe'
      and public.shop_rarity_rank(chosen_card_rarity) >= 5
    then
      hit_pity_target := true;
    elsif target_pack_code in ('special_attribute', 'special_archetype', 'special_monster_type')
      and public.shop_rarity_rank(chosen_card_rarity) >= 4
    then
      hit_pity_target := true;
    end if;
  end loop;

  -- =======================================================
  -- UPDATE PITY
  -- =======================================================
  if hit_pity_target then
    update public.shop_pack_pity
    set
      packs_since_ultra_or_better = 0,
      updated_at = now()
    where
      profile_id = current_user_id
      and pack_code = target_pack_code;
  else
    update public.shop_pack_pity
    set
      packs_since_ultra_or_better = packs_since_ultra_or_better + 1,
      updated_at = now()
    where
      profile_id = current_user_id
      and pack_code = target_pack_code;
  end if;

  -- =======================================================
  -- CONSUME VOUCHER
  -- =======================================================
  if target_voucher_id is not null then
    if voucher_row.quantity <= 1 then
      delete from public.reward_vouchers
      where id = target_voucher_id;
    else
      update public.reward_vouchers
      set
        quantity = quantity - 1,
        updated_at = now()
      where id = target_voucher_id;
    end if;
  end if;

  return opening_id;
end;
$function$;

revoke all
  on function public.purchase_shop_pack(text, uuid)
  from public;

grant execute
  on function public.purchase_shop_pack(text, uuid)
  to authenticated;


-- ---------------------------------------------------------
-- 9. _phase2_verify_introspect() - reissued with new checks for
--    the special-pack rebuild (slot counts per category, which
--    categories are currently active, the widened theme_category
--    constraints, and two targeted boolean checks on
--    purchase_shop_pack rather than returning its full ~550-line
--    source through the RPC). Everything from the original
--    202608311300 version is kept.
-- ---------------------------------------------------------

create or replace function public._phase2_verify_introspect()
returns jsonb
language plpgsql
security definer
set search_path to 'public, pg_catalog'
as $function$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'functions', (
      select jsonb_object_agg(fn, exists(select 1 from pg_proc where proname = fn))
      from unnest(array[
        'settle_round_rewards_v2',
        'install_default_round_rewards_v2',
        '_compute_league_match_reward',
        'refresh_shop_special_pack_rotation_if_needed',
        'roll_shop_pack_rarity',
        'pick_shop_pack_card',
        'purchase_shop_pack',
        'ensure_shop_rotations_current'
      ]) as fn
    ),
    'sources', (
      select jsonb_object_agg(p.proname, p.prosrc)
      from pg_proc p
      where p.proname in (
        'install_default_round_rewards_v2',
        '_compute_league_match_reward',
        'settle_round_rewards_v2',
        'refresh_shop_special_pack_rotation_if_needed',
        'roll_shop_pack_rarity',
        'pick_shop_pack_card'
      )
    ),
    'purchase_shop_pack_checks', (
      select jsonb_build_object(
        'supports_special_monster_type', p.prosrc ilike '%special_monster_type%',
        'has_league_wide_legendary_fix', p.prosrc ilike '%LEAGUE-WIDE LEGENDARY SCARCITY FIX%'
      )
      from pg_proc p
      where p.proname = 'purchase_shop_pack'
      limit 1
    ),
    'constraints', (
      select jsonb_object_agg(rel.relname || '.' || c.conname, pg_get_constraintdef(c.oid))
      from pg_constraint c
      join pg_class rel on rel.oid = c.conrelid
      where rel.relname in (
        'competition_round_reward_rules',
        'competition_round_reward_grants',
        'shop_special_pack_rotations',
        'shop_special_pack_slots'
      )
        and c.contype = 'c'
        and (
          pg_get_constraintdef(c.oid) ilike '%role%'
          or pg_get_constraintdef(c.oid) ilike '%theme_category%'
        )
    ),
    'league_economy_defaults', (
      select to_jsonb(d) - 'id' - 'updated_at'
      from public.league_economy_defaults d
      where d.id = true
    ),
    'shop_pack_types', (
      select jsonb_object_agg(t.code, t.price_dp)
      from public.shop_pack_types t
      where t.code in ('normal', 'premium', 'deluxe')
    ),
    'active_special_pack_prices', (
      select coalesce(jsonb_agg(distinct r.price_dp), '[]'::jsonb)
      from public.shop_special_pack_rotations r
      where r.status = 'active'
    ),
    'active_special_pack_categories', (
      select coalesce(jsonb_agg(distinct r.theme_category order by r.theme_category), '[]'::jsonb)
      from public.shop_special_pack_rotations r
      where r.status = 'active'
        and r.starts_at <= now()
        and r.ends_at > now()
    ),
    'special_pack_slot_counts', (
      select coalesce(jsonb_object_agg(theme_category, cnt), '{}'::jsonb)
      from (
        select theme_category, count(*) as cnt
        from public.shop_special_pack_slots
        group by theme_category
      ) counts
    ),
    'round_reward_rule_role_counts', (
      select jsonb_object_agg(role, cnt)
      from (
        select role, count(*) as cnt
        from public.competition_round_reward_rules
        group by role
      ) counts
    )
  ) into result;

  return result;
end;
$function$;

revoke all on function public._phase2_verify_introspect() from public;
grant execute on function public._phase2_verify_introspect() to service_role;

commit;
