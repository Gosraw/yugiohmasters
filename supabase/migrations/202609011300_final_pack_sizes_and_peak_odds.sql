begin;

-- =========================================================
-- FINAL PACK ECONOMY - LOCKED SIZES AND PEAK RARITY ODDS
-- (Duelist Circle "Final Implementation & Go-Live Sprint", 2026-09-01)
--
-- WHY
-- The go-live spec locks a further pack-size increase on top of Phase
-- 3's 5/7/7/10 (Standard/Premium/Special/Deluxe) values, and a new
-- pack-level PEAK rarity odds table (the highest-tier hit per pack,
-- not an independent per-card roll - unchanged architecture from
-- roll_shop_pack_peak_rarity(), only the constants change):
--
--   Sizes:  Standard 5->7, Premium 7->10, Special 7->10, Deluxe 10->14
--   Odds (Legendary / Secret / Ultra / Super):
--     Standard: 0.5% / 4%    / 12% / 34%
--     Premium:  2.25%/ 15%   / 32% / 43%
--     Special:  1.75%/ 13%   / 30% / 44%
--     Deluxe:   6.5% / 35%   / 44% / 14.5%
--
-- Pack prices are NOT touched here - already correct from Phase 2
-- (300/900/1200/1500) and untouched by every migration since.
--
-- SAFETY: every UPDATE is guarded by a WHERE clause on the pre-change
-- value (same idempotent pattern as every prior pack-size/odds
-- correction) - safe to re-run, and structurally asserts its own
-- starting assumptions rather than silently overwriting an
-- unexpected value. Every CREATE is OR REPLACE. Legendary league-wide
-- uniqueness (purchase_shop_pack's copy-limit check) and the pity/
-- luck-point system (separate migration) are both completely
-- unaffected - this migration only changes cards_per_pack and the
-- roll_shop_pack_peak_rarity() percentage constants.
-- =========================================================

-- ---------------------------------------------------------
-- Pack sizes
-- ---------------------------------------------------------

update public.shop_pack_types
set cards_per_pack = 7, updated_at = now()
where code = 'normal' and cards_per_pack = 5;

update public.shop_pack_types
set cards_per_pack = 10, updated_at = now()
where code = 'premium' and cards_per_pack = 7;

update public.shop_pack_types
set cards_per_pack = 14, updated_at = now()
where code = 'deluxe' and cards_per_pack = 10;

update public.shop_special_pack_rotations
set cards_per_pack = 10, updated_at = now()
where status = 'active' and cards_per_pack = 7;

-- ---------------------------------------------------------
-- refresh_shop_special_pack_rotation_if_needed - reissued only to
-- change the hardcoded cards_per_pack literal for FUTURE rotations
-- from 7 to 10. Everything else (deterministic sequential slot
-- advance, 48h duration, price 1200) is byte-for-byte identical to
-- the 202609010900 version.
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

  -- Deterministic sequential advance (replaces order by random()):
  -- wraps back to slot 1 after the last configured slot. With up to
  -- 5 slots per category and a 48h rotation, this is up to a 10-day
  -- full cycle per category. Byte-identical logic to the
  -- 202609010900 version - only cards_per_pack changes below.
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
-- roll_shop_pack_peak_rarity - reissued with the final locked odds.
-- Architecture (single mutually-exclusive roll for the pack's one
-- peak card) is unchanged from 202609010900; only the percentage
-- constants change.
-- ---------------------------------------------------------

create or replace function public.roll_shop_pack_peak_rarity(
  target_pack_code text
)
returns text
language plpgsql
as $function$
declare
  roll numeric;
  legendary_pct numeric;
  secret_pct numeric;
  ultra_pct numeric;
  super_pct numeric;
  cursor_pct numeric;
begin
  case target_pack_code
    when 'normal' then
      legendary_pct := 0.5; secret_pct := 4; ultra_pct := 12; super_pct := 34;
    when 'premium' then
      legendary_pct := 2.25; secret_pct := 15; ultra_pct := 32; super_pct := 43;
    when 'special_attribute', 'special_archetype', 'special_monster_type', 'special' then
      legendary_pct := 1.75; secret_pct := 13; ultra_pct := 30; super_pct := 44;
    when 'deluxe' then
      legendary_pct := 6.5; secret_pct := 35; ultra_pct := 44; super_pct := 14.5;
    else
      raise exception 'Unknown pack code.';
  end case;

  roll := random() * 100;
  cursor_pct := legendary_pct;
  if roll < cursor_pct then
    return 'Legendary';
  end if;

  cursor_pct := cursor_pct + secret_pct;
  if roll < cursor_pct then
    return 'Secret Rare';
  end if;

  cursor_pct := cursor_pct + ultra_pct;
  if roll < cursor_pct then
    return 'Ultra Rare';
  end if;

  cursor_pct := cursor_pct + super_pct;
  if roll < cursor_pct then
    return 'Super Rare';
  end if;

  return null;
end;
$function$;

-- ---------------------------------------------------------
-- Structural check: a 14-card Deluxe pack must roll the peak-rarity
-- function exactly ONCE per pack (this is a code-review sanity check,
-- not something this migration can execute against live purchase
-- flow data) - confirmed by inspection: roll_shop_pack_peak_rarity is
-- called once per pack purchase in purchase_shop_pack
-- (202608302335_legendary_league_wide_scarcity.sql), and every other
-- of the pack's cards is filled by roll_shop_pack_filler_rarity
-- (Normal/Rare only, per its own header) - so the 6.5% Deluxe
-- Legendary odds is a single per-pack chance, never rolled 14 times.
-- =========================================================

commit;
