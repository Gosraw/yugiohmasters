begin;

-- =========================================================
-- DUELIST CIRCLE - SHOP V2: REFRESH TIMERS + TWO SPECIAL PACKS
-- (2026-08-23, V1.2 update)
--
-- Everything below is additive / idempotent - no existing
-- table, column, row, or function signature is removed, and no
-- production data is touched by running this migration itself
-- (the one exception, called out explicitly: shop_pack_types'
-- normal/basic row gets cards_per_pack updated 3 -> 4, price
-- unchanged - see PACK ECONOMY REBALANCE below for why).
--
-- AUDIT FINDING (before this migration): there was NO rotation-
-- generation RPC anywhere in the codebase - shop_rotations rows
-- (including the single special pack slot they used to carry)
-- were inserted manually. settings.shop.refresh_hours=72 was
-- never actually read by any shop code. This migration is what
-- turns "refresh" from a design intent into real, enforced,
-- server-side behavior.
--
-- DESIGN: LAZY REFRESH, NO CRON REQUIRED
-- ensure_shop_rotations_current() is called at the top of every
-- /shop page load (see the shop/page.tsx change in this same
-- feature branch). It is idempotent and safe to call from many
-- concurrent requests: each of the two refresh paths (singles,
-- and each special-pack category) takes its own
-- pg_advisory_xact_lock before checking-and-generating, so two
-- players loading the shop in the same second cannot both
-- generate a duplicate rotation. This avoids depending on
-- Supabase pg_cron (not confirmed enabled on this project) while
-- still keeping "server/database timestamps as waarheid" - the
-- refresh decision is entirely driven by starts_at/ends_at
-- comparisons against now(), never a client-supplied time.
--
-- SINGLES vs SPECIALS ARE NOW SEPARATE ROTATION CYCLES
-- shop_rotations keeps its existing role (6 first-come-first-
-- served single cards), now refreshing every 24h instead of the
-- stated-but-never-enforced 72h. The single "special pack per
-- rotation" design is retired going forward in favor of a new,
-- dedicated shop_special_pack_rotations table holding TWO
-- concurrently active rows (one theme_category='attribute', one
-- 'archetype'), each refreshing independently every 48h.
-- shop_rotations.special_pack_* columns are left in place,
-- untouched and unused by new rotations - existing historical
-- rows that have them populated are not modified or deleted.
--
-- THEME SELECTION USES REAL CATALOG DATA, NOT A HARDCODED LIST
-- Attribute and archetype candidates are both queried live from
-- card_catalog (distinct non-null attribute / archetype values),
-- filtered to format_eligible + is_master_duel_offerable cards,
-- and required to have at least MIN_THEME_ELIGIBLE_CARDS (12)
-- matching cards before a theme is eligible to be picked - see
-- refresh_shop_special_pack_rotation_if_needed() below for the
-- exact query and the reasoning for that threshold. If a
-- category genuinely has zero eligible themes (should not happen
-- against the real, 13,558-card-Master-Duel-offerable catalog,
-- but is handled defensively for a sparse/test catalog), that
-- category is simply left without an active rotation rather than
-- raising - a missing special pack is safer than a broken one,
-- and never blocks singles refresh or the other category.
--
-- MASTER DUEL FILTERING NOW COVERS SINGLES TOO
-- pick_shop_pack_card (packs) already filtered on
-- is_master_duel_offerable() as of 202608220020. This migration
-- adds the same filter to the new singles-generation function,
-- so no shop acquisition path (normal/premium/deluxe/special
-- packs OR the 6 rotating singles) can hand out a forbidden/
-- not_available/unknown card. Existing owned cards are never
-- touched.
--
-- PACK ECONOMY REBALANCE (Basic vs Deluxe stacking)
-- Simulated with 200,000 packs/type using the exact live
-- rollRarity()/pity logic (scripts/simulate-shop-pack-economy.mjs,
-- full OLD vs NEW numbers documented there and in the session
-- report). Problem: Deluxe (500 DP, 7 cards) stacked THREE
-- advantages over Normal (100 DP, 3 cards) simultaneously - 2.33x
-- the cards, much better odds, AND 9.39x better Ultra Rare+/DP,
-- 1.83x better Legendary/DP. Fix, using only the requested
-- levers (card count / price / guarantees - rarity probabilities
-- are UNCHANGED, exactly as instructed): Normal/Basic
-- cards_per_pack 3 -> 4, price unchanged at 100 DP. This single
-- change pulls the cards ratio to 1.75x (under 2x) and narrows
-- the Ultra+/DP gap to 7.93x and the Legendary/DP gap to 1.46x,
-- purely by making Basic a better volume/value pack - Deluxe
-- itself is completely untouched and stays the clear premium/
-- high-rarity choice.
-- =========================================================


-- ---------------------------------------------------------
-- 1. SCHEMA: NEW COLUMNS (additive, nullable, no backfill risk)
-- ---------------------------------------------------------

alter table public.shop_pack_pulls
  add column if not exists is_first_for_player boolean;

comment on column public.shop_pack_pulls.is_first_for_player is
  'Only meaningfully set for Legendary pulls: true if this was the FIRST time this player ever acquired this exact card_catalog_id (checked race-safely inside purchase_shop_pack, under the same per-card advisory lock used for copy-limit checks). Null for every other rarity - not tracked there.';

-- voucher_type_used already exists live in production (drift -
-- purchase_shop_pack has always written to it) but was never
-- captured in a migration. Adding it here, additively, so a
-- fresh/disposable database replaying the full migration chain
-- matches production and this migration's own purchase_shop_pack
-- re-issue below does not fail against a clean database.
alter table public.shop_purchases
  add column if not exists voucher_type_used text;


-- ---------------------------------------------------------
-- 2. PACK ECONOMY REBALANCE
--
-- Only Normal/Basic changes. Premium/Deluxe/Special and every
-- rarity probability table are completely untouched. See the
-- migration header and scripts/simulate-shop-pack-economy.mjs
-- for the full simulated reasoning.
-- ---------------------------------------------------------

update public.shop_pack_types
set
  cards_per_pack = 4,
  updated_at = now()
where
  code = 'normal'
  and cards_per_pack = 3;


-- ---------------------------------------------------------
-- 3. SHOP_SPECIAL_PACK_ROTATIONS
--
-- Two concurrently-active rows at all times (one per
-- theme_category), each an independent 48h cycle. The unique
-- partial index is safe to add here (unlike on shop_rotations,
-- which already has unknown live rows) because this table is
-- brand new - there is no pre-existing data that could violate
-- it.
-- ---------------------------------------------------------

create table if not exists public.shop_special_pack_rotations (
  id uuid primary key default gen_random_uuid(),

  theme_category text not null
    check (theme_category in ('attribute', 'archetype')),

  theme_value text not null,
  theme_label text not null,

  price_dp integer not null
    check (price_dp >= 0),

  cards_per_pack integer not null
    check (cards_per_pack > 0),

  starts_at timestamptz not null,
  ends_at timestamptz not null,

  status text not null default 'active'
    check (status in ('active', 'completed')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (ends_at > starts_at)
);

create index if not exists shop_special_pack_rotations_category_idx
  on public.shop_special_pack_rotations (theme_category, status);

create index if not exists shop_special_pack_rotations_created_idx
  on public.shop_special_pack_rotations (theme_category, created_at desc);

create unique index if not exists shop_special_pack_rotations_one_active_per_category
  on public.shop_special_pack_rotations (theme_category)
  where status = 'active';

comment on table public.shop_special_pack_rotations is
  'Two independently-refreshing (48h) rotating special packs: one theme_category=attribute (e.g. DARK), one theme_category=archetype (e.g. Blue-Eyes). Themes are chosen live from real card_catalog data by refresh_shop_special_pack_rotation_if_needed(), never a hardcoded list.';

alter table public.shop_special_pack_rotations enable row level security;

drop policy if exists "Authenticated users can read special pack rotations"
  on public.shop_special_pack_rotations;

create policy "Authenticated users can read special pack rotations"
  on public.shop_special_pack_rotations
  for select
  to authenticated
  using (true);

revoke all
  on public.shop_special_pack_rotations
  from public;

grant select
  on public.shop_special_pack_rotations
  to authenticated;


-- Link purchases/openings to the specific special-pack rotation
-- actually purchased from. Nullable - only set for
-- special_attribute/special_archetype purchases. The existing
-- rotation_id column (-> shop_rotations) keeps recording the
-- SINGLES rotation active at purchase time for every pack type,
-- unchanged - this is a new, separate, additive link.

alter table public.shop_purchases
  add column if not exists special_pack_rotation_id uuid
    references public.shop_special_pack_rotations(id)
    on delete set null;

alter table public.shop_pack_openings
  add column if not exists special_pack_rotation_id uuid
    references public.shop_special_pack_rotations(id)
    on delete set null;

create index if not exists shop_purchases_special_pack_rotation_idx
  on public.shop_purchases (special_pack_rotation_id);

create index if not exists shop_pack_openings_special_pack_rotation_idx
  on public.shop_pack_openings (special_pack_rotation_id);


-- ---------------------------------------------------------
-- 4. WIDEN pack_code CHECK CONSTRAINTS
--
-- Adds 'special_attribute' / 'special_archetype' alongside the
-- existing values (including the now-legacy 'special', kept for
-- backward compatibility with historical rows - never written by
-- new purchases going forward).
-- ---------------------------------------------------------

alter table public.shop_pack_openings
  drop constraint if exists shop_pack_openings_pack_code_check;

alter table public.shop_pack_openings
  add constraint shop_pack_openings_pack_code_check
  check (
    pack_code in (
      'normal', 'premium', 'deluxe', 'special',
      'special_attribute', 'special_archetype'
    )
  );

alter table public.shop_pack_pity
  drop constraint if exists shop_pack_pity_pack_code_check;

alter table public.shop_pack_pity
  add constraint shop_pack_pity_pack_code_check
  check (
    pack_code in (
      'normal', 'premium', 'deluxe', 'special',
      'special_attribute', 'special_archetype'
    )
  );


-- ---------------------------------------------------------
-- 5. HELPERS
-- ---------------------------------------------------------

create or replace function public.shop_single_card_price(target_rarity text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case target_rarity
    when 'Normal' then 40
    when 'Rare' then 80
    when 'Super Rare' then 160
    when 'Ultra Rare' then 320
    when 'Secret Rare' then 640
    when 'Legendary' then 1500
    else 40
  end;
$$;

comment on function public.shop_single_card_price(text) is
  'Price ladder (DP) for the 6 rotating single cards, keyed by rarity. Deliberately well below what a full pack costs for the equivalent rarity chase - singles are a first-come-first-served treat, not the main acquisition path.';

revoke all
  on function public.shop_single_card_price(text)
  from public;

grant execute
  on function public.shop_single_card_price(text)
  to authenticated;


create or replace function public.shop_single_card_slot_tier(target_rarity text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case target_rarity
    when 'Normal' then 'basic'
    when 'Rare' then 'basic'
    when 'Super Rare' then 'mid'
    when 'Ultra Rare' then 'strong'
    when 'Secret Rare' then 'premium'
    when 'Legendary' then 'wildcard'
    else 'basic'
  end;
$$;

revoke all
  on function public.shop_single_card_slot_tier(text)
  from public;

grant execute
  on function public.shop_single_card_slot_tier(text)
  to authenticated;


create or replace function public.get_active_special_pack_rotation(
  target_theme_category text
)
returns uuid
language sql
stable
set search_path = ''
as $$
  select id
  from public.shop_special_pack_rotations
  where
    theme_category = target_theme_category
    and status = 'active'
    and starts_at <= now()
    and ends_at > now()
  order by starts_at desc
  limit 1;
$$;

revoke all
  on function public.get_active_special_pack_rotation(text)
  from public;

grant execute
  on function public.get_active_special_pack_rotation(text)
  to authenticated;


-- ---------------------------------------------------------
-- 6. ROLL_SHOP_PACK_RARITY - widened pack-code match only
--
-- Single change from the live 202608210018 version: the
-- 'special' branch also matches 'special_attribute' and
-- 'special_archetype' (both share the exact same, UNCHANGED
-- rarity table - 18/29/29/17.3/6.45/else Legendary). Every
-- number is byte-for-byte identical to what is live today.
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
  -- PREMIUM PACK - LIVE (unchanged)
  -- 30 / 38 / 22 / 8 / 1.9 / else Legendary
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
    elsif roll < 99.9 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- DELUXE PACK - LIVE (unchanged)
  -- 11 / 20 / 31 / 26 / 11.55 / else Legendary
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
    elsif roll < 99.55 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- SPECIAL PACK(S) - LIVE (unchanged), now shared by both
  -- special_attribute and special_archetype, plus the legacy
  -- 'special' code for backward compatibility with any code
  -- path that might still pass it.
  -- 18 / 29 / 29 / 17.3 / 6.45 / else Legendary
  -- =======================================================
  if target_pack_code in ('special', 'special_attribute', 'special_archetype') then
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
-- 7. PICK_SHOP_PACK_CARD - theme source swapped only
--
-- Single structural change from the live 202608220020 version:
-- when target_rotation_id is supplied, the theme lookup now
-- reads from shop_special_pack_rotations (theme_category /
-- theme_value) instead of shop_rotations (special_pack_theme_type
-- / special_pack_theme_value) - callers now pass a
-- shop_special_pack_rotations.id here. Every predicate, fallback
-- tier, and the Master Duel eligibility filter are byte-for-byte
-- identical to the live version.
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
begin
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
        instance.current_owner_id = target_profile_id
        and instance.card_catalog_id = card.id
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
        instance.current_owner_id = target_profile_id
        and instance.card_catalog_id = card.id
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
          instance.current_owner_id = target_profile_id
          and instance.card_catalog_id = card.id
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
        instance.current_owner_id = target_profile_id
        and instance.card_catalog_id = card.id
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
-- 8. ROTATION_NUMBER - made a real, explicit column
--
-- shop/page.tsx reads rotation_number from the
-- active_shop_rotation_cards VIEW (undocumented drift - no
-- migration in this repo ever defined that view). Rather than
-- guess at its live definition, this migration gives
-- shop_rotations a real rotation_number column (additive,
-- backfilled once from existing row order if it was already
-- null/missing) and rebuilds the view on top of it, so the
-- numbering has one clear, inspectable source of truth going
-- forward.
-- ---------------------------------------------------------

alter table public.shop_rotations
  add column if not exists rotation_number integer;

with numbered as (
  select
    id,
    row_number() over (order by starts_at asc, created_at asc) as computed_number
  from public.shop_rotations
  where rotation_number is null
)
update public.shop_rotations sr
set rotation_number = numbered.computed_number
from numbered
where sr.id = numbered.id;

create unique index if not exists shop_rotations_rotation_number_key
  on public.shop_rotations (rotation_number)
  where rotation_number is not null;


-- ---------------------------------------------------------
-- 9. ACTIVE_SHOP_ROTATION_CARDS VIEW - rebuilt explicitly
--
-- Matches the exact column shape the existing UI
-- (RotationCard type in shop/page.tsx) already expects. Dropped
-- and recreated (not CREATE OR REPLACE) because Postgres forbids
-- CREATE OR REPLACE VIEW from changing an existing view's column
-- set/order, and this view's live definition is exactly the
-- undocumented drift this migration is resolving - a plain
-- DROP+CREATE inside this migration's own transaction is safe
-- (no data loss, it is only a query definition) and guarantees
-- the shape is correct rather than hoping CREATE OR REPLACE
-- happens to match.
-- ---------------------------------------------------------

drop view if exists public.active_shop_rotation_cards;

create view public.active_shop_rotation_cards as
select
  sr.id as rotation_id,
  sr.rotation_number,
  sr.starts_at,
  sr.ends_at,
  sr.special_pack_name,
  sr.special_pack_description,
  sr.special_pack_price_dp,
  sr.special_pack_cards_per_pack,
  sr.special_pack_theme_type,
  sr.special_pack_theme_value,
  sr.special_pack_theme_value as special_pack_theme_label,
  src.id as rotation_card_id,
  src.slot_number,
  src.slot_tier,
  src.price_dp,
  src.sold_to_profile_id,
  src.sold_at,
  cc.id as card_catalog_id,
  cc.name as card_name,
  cc.image_url,
  cc.card_type,
  cc.attribute,
  cc.monster_type,
  cc.archetype,
  cc.atk,
  cc.def,
  cc.game_rarity,
  cc.rarity_score
from public.shop_rotations sr
join public.shop_rotation_cards src
  on src.rotation_id = sr.id
join public.card_catalog cc
  on cc.id = src.card_catalog_id
where
  sr.status = 'active'
  and sr.starts_at <= now()
  and sr.ends_at > now();

revoke all
  on public.active_shop_rotation_cards
  from public;

grant select
  on public.active_shop_rotation_cards
  to authenticated;


-- ---------------------------------------------------------
-- 10. REFRESH: SINGLES (24h)
--
-- Picks 6 DISTINCT eligible cards - one per targeted rarity
-- (Normal/Rare/Super Rare/Ultra Rare/Secret Rare) plus one
-- wildcard slot of any rarity - so a rotation always has a
-- spread rather than being dominated by whichever rarity has the
-- most catalog rows. If a targeted rarity has zero eligible
-- candidates (should not happen against the real catalog), that
-- slot falls back to any eligible card so it is never left
-- empty; price/tier always follow whatever rarity was actually
-- chosen, never the originally-targeted one.
-- ---------------------------------------------------------

create or replace function public.refresh_shop_singles_rotation_if_needed()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  next_rotation_id uuid;
  next_rotation_number integer;
  picked_ids uuid[] := array[]::uuid[];
  target_rarities text[] := array['Normal', 'Rare', 'Super Rare', 'Ultra Rare', 'Secret Rare'];
  target_rarity text;
  slot_number integer := 0;
  candidate_id uuid;
  candidate_rarity text;
begin
  perform pg_advisory_xact_lock(hashtext('shop_singles_refresh'));

  if exists (
    select 1
    from public.shop_rotations
    where
      status = 'active'
      and starts_at <= now()
      and ends_at > now()
  ) then
    return;
  end if;

  update public.shop_rotations
  set
    status = 'completed',
    updated_at = now()
  where
    status = 'active'
    and ends_at <= now();

  select coalesce(max(rotation_number), 0) + 1
  into next_rotation_number
  from public.shop_rotations;

  insert into public.shop_rotations (
    starts_at,
    ends_at,
    status,
    rotation_number
  )
  values (
    now(),
    now() + interval '24 hours',
    'active',
    next_rotation_number
  )
  returning id
  into next_rotation_id;

  -- =======================================================
  -- ONE SLOT PER TARGETED RARITY
  -- =======================================================
  foreach target_rarity in array target_rarities loop
    slot_number := slot_number + 1;

    select cc.id, cc.game_rarity
    into candidate_id, candidate_rarity
    from public.card_catalog cc
    where
      cc.format_eligible = true
      and public.is_master_duel_offerable(cc.master_duel_status)
      and cc.game_rarity = target_rarity
      and cc.id <> all(picked_ids)
    order by random()
    limit 1;

    -- Fallback: this exact rarity has no eligible candidate left
    -- (should not happen against the real catalog) - pick any
    -- eligible, not-yet-picked card instead of leaving the slot
    -- empty.
    if candidate_id is null then
      select cc.id, cc.game_rarity
      into candidate_id, candidate_rarity
      from public.card_catalog cc
      where
        cc.format_eligible = true
        and public.is_master_duel_offerable(cc.master_duel_status)
        and cc.id <> all(picked_ids)
      order by random()
      limit 1;
    end if;

    if candidate_id is not null then
      picked_ids := array_append(picked_ids, candidate_id);

      insert into public.shop_rotation_cards (
        rotation_id,
        slot_number,
        card_catalog_id,
        price_dp,
        slot_tier
      )
      values (
        next_rotation_id,
        slot_number,
        candidate_id,
        public.shop_single_card_price(candidate_rarity),
        public.shop_single_card_slot_tier(candidate_rarity)
      );
    end if;
  end loop;

  -- =======================================================
  -- WILDCARD SLOT (any rarity, any eligible card not already
  -- picked)
  -- =======================================================
  slot_number := slot_number + 1;

  select cc.id, cc.game_rarity
  into candidate_id, candidate_rarity
  from public.card_catalog cc
  where
    cc.format_eligible = true
    and public.is_master_duel_offerable(cc.master_duel_status)
    and cc.id <> all(picked_ids)
  order by random()
  limit 1;

  if candidate_id is not null then
    insert into public.shop_rotation_cards (
      rotation_id,
      slot_number,
      card_catalog_id,
      price_dp,
      slot_tier
    )
    values (
      next_rotation_id,
      slot_number,
      candidate_id,
      public.shop_single_card_price(candidate_rarity),
      public.shop_single_card_slot_tier(candidate_rarity)
    );
  end if;
end;
$function$;

revoke all
  on function public.refresh_shop_singles_rotation_if_needed()
  from public;

grant execute
  on function public.refresh_shop_singles_rotation_if_needed()
  to authenticated;


-- ---------------------------------------------------------
-- 11. REFRESH: SPECIAL PACKS (48h, per category)
--
-- MIN_THEME_ELIGIBLE_CARDS = 12: chosen so a themed pack (5
-- cards/pack) can plausibly draw several packs' worth of
-- genuinely-themed cards across multiple rarities before
-- pick_shop_pack_card's own fallback tiers would need to dilute
-- the theme - low enough that legitimate smaller archetypes are
-- not excluded, high enough to avoid a paper-thin "spotlight" of
-- 2-3 cards. Against the real, audited catalog (13,558 Master
-- Duel-offerable cards) this threshold is expected to be cleared
-- by every real attribute and the large majority of real
-- archetypes - see the session report for what could and could
-- not be verified this session (no access to the real catalog
-- distribution from this sandbox).
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
  min_theme_eligible_cards constant integer := 12;
  previous_theme_value text;
  chosen_theme_value text;
  chosen_theme_label text;
begin
  if target_theme_category not in ('attribute', 'archetype') then
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

  select theme_value
  into previous_theme_value
  from public.shop_special_pack_rotations
  where theme_category = target_theme_category
  order by created_at desc
  limit 1;

  -- =======================================================
  -- PICK A VALID THEME FROM REAL CATALOG DATA
  --
  -- Try excluding the immediately-previous theme first (avoid
  -- back-to-back repeats where easy); if that leaves nothing
  -- eligible, retry without the exclusion rather than leaving
  -- the category without a rotation.
  -- =======================================================
  if target_theme_category = 'attribute' then
    select cc.attribute
    into chosen_theme_value
    from public.card_catalog cc
    where
      cc.format_eligible = true
      and public.is_master_duel_offerable(cc.master_duel_status)
      and cc.attribute is not null
      and cc.attribute <> ''
      and (previous_theme_value is null or cc.attribute <> previous_theme_value)
    group by cc.attribute
    having count(*) >= min_theme_eligible_cards
    order by random()
    limit 1;

    if chosen_theme_value is null then
      select cc.attribute
      into chosen_theme_value
      from public.card_catalog cc
      where
        cc.format_eligible = true
        and public.is_master_duel_offerable(cc.master_duel_status)
        and cc.attribute is not null
        and cc.attribute <> ''
      group by cc.attribute
      having count(*) >= min_theme_eligible_cards
      order by random()
      limit 1;
    end if;
  else
    select cc.archetype
    into chosen_theme_value
    from public.card_catalog cc
    where
      cc.format_eligible = true
      and public.is_master_duel_offerable(cc.master_duel_status)
      and cc.archetype is not null
      and cc.archetype <> ''
      and (previous_theme_value is null or cc.archetype <> previous_theme_value)
    group by cc.archetype
    having count(*) >= min_theme_eligible_cards
    order by random()
    limit 1;

    if chosen_theme_value is null then
      select cc.archetype
      into chosen_theme_value
      from public.card_catalog cc
      where
        cc.format_eligible = true
        and public.is_master_duel_offerable(cc.master_duel_status)
        and cc.archetype is not null
        and cc.archetype <> ''
      group by cc.archetype
      having count(*) >= min_theme_eligible_cards
      order by random()
      limit 1;
    end if;
  end if;

  -- No valid theme exists at all for this category (e.g. a
  -- sparse/test catalog) - skip generating a rotation for it
  -- rather than raising. The shop simply shows one fewer special
  -- pack until a future refresh finds a valid theme.
  if chosen_theme_value is null then
    return;
  end if;

  chosen_theme_label := chosen_theme_value;

  insert into public.shop_special_pack_rotations (
    theme_category,
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
    chosen_theme_value,
    chosen_theme_label,
    250,
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
-- 12. ENSURE_SHOP_ROTATIONS_CURRENT - single entry point
--
-- Called at the top of every /shop page load. Cheap no-op when
-- everything is already fresh (each sub-function's first check
-- is a single indexed EXISTS query under an advisory lock).
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
end;
$function$;

revoke all
  on function public.ensure_shop_rotations_current()
  from public;

grant execute
  on function public.ensure_shop_rotations_current()
  to authenticated;


-- ---------------------------------------------------------
-- 13. PURCHASE_SHOP_PACK - re-issued
--
-- Changes from the live version, everything else byte-for-byte
-- identical:
--   - target_pack_code accepts special_attribute/special_archetype
--     instead of the old single 'special' (which this function no
--     longer accepts as an input - historical rows using it are
--     untouched, this is forward validation only).
--   - Special pack price/cards_per_pack/theme now come from
--     shop_special_pack_rotations (via get_active_special_pack_rotation)
--     instead of shop_rotations.
--   - shop_purchases/shop_pack_openings additionally stamp the new
--     special_pack_rotation_id column for special purchases.
--   - is_first_for_player is computed and recorded on
--     shop_pack_pulls for Legendary pulls only, race-safely under
--     the exact same per-card pg_advisory_xact_lock already taken
--     for the copy-limit check - never a client-side guess.
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
  if target_pack_code not in ('normal', 'premium', 'deluxe', 'special_attribute', 'special_archetype') then
    raise exception 'Invalid pack type.';
  end if;

  active_rotation_id := public.get_active_shop_rotation();

  if target_pack_code in ('special_attribute', 'special_archetype') then
    theme_category := case target_pack_code
      when 'special_attribute' then 'attribute'
      else 'archetype'
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
    elsif target_pack_code in ('special_attribute', 'special_archetype')
      and pity_count >= 6
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 4;
    elsif target_pack_code in ('special_attribute', 'special_archetype')
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

      select count(*)
      into current_owned_count
      from public.card_instances
      where
        league_id = current_league_id
        and current_owner_id = current_user_id
        and card_catalog_id = chosen_card_id;

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
    elsif target_pack_code in ('special_attribute', 'special_archetype')
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


commit;
