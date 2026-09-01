begin;

-- =========================================================
-- FINAL LEGENDARY LUCK / EMERGENCY PITY SYSTEM
-- (Duelist Circle "Final Implementation & Go-Live Sprint", 2026-09-01)
--
-- WHY
-- The go-live spec locks a single, minimal, hidden Legendary-only
-- pity mechanic ("Luck"): +0.25/+1/+1.25/+2 accumulated per Standard/
-- Premium/Special/Deluxe pack purchased, reset to 0 on any natural
-- Legendary, and at ~100 accumulated Luck without one, the next pack
-- guarantees a Legendary. "No aggressive soft-pity. No exact visible
-- 0-100 meter by default."
--
-- This REPLACES the pre-existing packs_since_ultra_or_better
-- streak-pity in public.shop_pack_pity entirely, rather than layering
-- on top of it. That system guaranteed an Ultra Rare-or-better (or
-- Secret Rare for Deluxe) every 5-8 packs per pack TYPE - a much more
-- frequent, multi-tier guarantee than anything in the new spec, which
-- only ever mentions ONE pity mechanic and explicitly calls for
-- keeping pity "minimal." Running both together would be a materially
-- different, undocumented economy no single part of the spec asks
-- for. The shop_pack_pity table itself is left in place (harmless,
-- and the reset script already handles it) but purchase_shop_pack no
-- longer reads or writes it - see the interpretation note inline
-- below if a future design wants both mechanics to coexist instead.
--
-- DESIGN CHOICES MADE HERE (spec leaves these implicit)
-- - Luck accumulates in ONE counter PER PLAYER, not per pack type -
--   "Luck gained per pack" reads as a single running total fed by
--   every purchase regardless of tier, and "the next eligible
--   high-tier pack guarantees one" only makes sense against a single
--   pool (a per-type counter would need 4 separate ~100 thresholds,
--   which the spec never states).
-- - "Eligible high-tier pack" is read as ANY pack tier, since all
--   four have a nonzero natural Legendary chance in
--   roll_shop_pack_peak_rarity()'s own table (even Standard, at
--   0.5%) - seeing inline comment in purchase_shop_pack for how to
--   restrict this to exclude Standard if that turns out to be the
--   intended reading instead.
-- - The luck check happens against the balance accumulated BEFORE
--   this pack's own gain is added (so crossing from 99.75 to 100.25
--   on this exact purchase does NOT retroactively upgrade this same
--   pack - it primes the NEXT one), matching "the NEXT eligible pack
--   guarantees one."
--
-- SAFETY: player_pack_luck is a new, additive table (on delete
-- cascade from profiles, same pattern as every other per-player shop
-- table). purchase_shop_pack is reissued with ONLY its pity/luck
-- section changed - payment, purchase/opening records, the PICK CARD
-- retry loop (with its existing league-wide Legendary copy-limit
-- check and safe reroll/fallback chain), first-pull tracking, card
-- instance creation, and voucher consumption are all byte-for-byte
-- identical to the 202609010900 (Phase 3) version - diffed to confirm
-- before this migration was written.
-- =========================================================

create table if not exists public.player_pack_luck (
  profile_id uuid primary key
    references public.profiles(id)
    on delete cascade,

  luck_points numeric not null default 0
    check (luck_points >= 0),

  updated_at timestamptz not null default now()
);

alter table public.player_pack_luck
  enable row level security;

drop policy if exists
  "Users can read own luck state"
on public.player_pack_luck;

create policy
  "Users can read own luck state"
on public.player_pack_luck
for select
to authenticated
using (
  profile_id = auth.uid()
);

-- ---------------------------------------------------------
-- purchase_shop_pack - reissued to replace the packs_since_ultra_
-- or_better streak-pity with the Legendary Luck system. See this
-- migration's header for the full rationale and design choices.
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
  position_number integer;
  pack_peak_rarity text;
  pack_peak_position integer;
  v_luck_points numeric := 0;
  luck_gain numeric;
  luck_guaranteed_legendary boolean := false;
  rolled_rarity text;
  chosen_card_id uuid;
  chosen_card_rarity text;
  copy_limit integer;
  current_owned_count integer;
  next_copy_number integer;
  new_instance_id uuid;
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
  -- LEGENDARY LUCK STATE (go-live rebuild, 2026-09-01)
  --
  -- Replaces the old packs_since_ultra_or_better streak-pity
  -- entirely (see this migration's header for why: the go-live spec
  -- calls for ONE minimal, hidden, Legendary-only pity mechanic, not
  -- a separate frequent Ultra/Secret floor stacked on top of it).
  -- One row per player (not per pack type - "Luck gained per pack"
  -- accumulates from every pack purchase into a single counter).
  -- =======================================================
  insert into public.player_pack_luck (
    profile_id,
    luck_points
  )
  values (
    current_user_id,
    0
  )
  on conflict (profile_id)
  do nothing;

  select
    luck_points
  into v_luck_points
  from public.player_pack_luck
  where profile_id = current_user_id
  for update;

  luck_gain := case target_pack_code
    when 'normal' then 0.25
    when 'premium' then 1
    when 'deluxe' then 2
    when 'special_attribute', 'special_archetype', 'special_monster_type' then 1.25
  end;

  -- =======================================================
  -- PACK-LEVEL PEAK RARITY
  --
  -- Exactly ONE roll per pack determines its single meaningful/
  -- exciting hit (Legendary, Secret Rare, Ultra Rare, Super Rare, or
  -- none) via roll_shop_pack_peak_rarity() - unchanged from the
  -- Phase 3 rebuild. Every other card in the pack is "filler"
  -- (Normal/Rare foundation only, via roll_shop_pack_filler_rarity())
  -- so filler slots can never independently reproduce a top-tier hit.
  --
  -- EMERGENCY LEGENDARY PROTECTION: at >=100 accumulated Luck without
  -- a natural Legendary, this pack's peak is force-upgraded to
  -- Legendary regardless of the roll above - checked against the
  -- luck accumulated BEFORE this pack's own gain is added, matching
  -- "the NEXT pack after crossing ~100 guarantees one." Every pack
  -- tier is "eligible" for this guarantee (all four have a nonzero
  -- natural Legendary chance in roll_shop_pack_peak_rarity's own
  -- table) - if a future design wants to exclude Standard from
  -- redeeming the guarantee, add `and target_pack_code <> 'normal'`
  -- to the condition below.
  -- =======================================================
  pack_peak_rarity := public.roll_shop_pack_peak_rarity(target_pack_code);

  if pack_peak_rarity is distinct from 'Legendary' and v_luck_points >= 100 then
    pack_peak_rarity := 'Legendary';
    luck_guaranteed_legendary := true;
  end if;

  -- Natural Legendary resets luck to 0; a guaranteed one (already at
  -- >=100) also resets to 0 rather than continuing to climb past the
  -- threshold. Any other outcome accumulates this pack's luck_gain.
  if pack_peak_rarity = 'Legendary' then
    v_luck_points := 0;
  else
    v_luck_points := v_luck_points + luck_gain;
  end if;

  update public.player_pack_luck
  set
    luck_points = v_luck_points,
    updated_at = now()
  where profile_id = current_user_id;

  -- One randomly chosen slot in the pack carries the peak hit (when
  -- there is one this pack) so the exciting card isn't predictably
  -- always the last one opened.
  pack_peak_position := 1 + floor(random() * pack_card_count)::integer;

  -- =======================================================
  -- GENERATE CARDS
  -- =======================================================
  for position_number in 1..pack_card_count loop
    if position_number = pack_peak_position and pack_peak_rarity is not null then
      rolled_rarity := pack_peak_rarity;
    else
      rolled_rarity := public.roll_shop_pack_filler_rarity(target_pack_code);
    end if;

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

  end loop;

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

-- =========================================================
-- POST-MIGRATION STRUCTURAL ASSERTIONS
-- =========================================================

do $$
declare
  v_purchase_src text;
begin
  if to_regclass('public.player_pack_luck') is null then
    raise exception 'LEGENDARY LUCK MIGRATION ABORTED: public.player_pack_luck table was not created.';
  end if;

  select p.prosrc into v_purchase_src from pg_proc p where p.proname = 'purchase_shop_pack' limit 1;

  if v_purchase_src is null or v_purchase_src not ilike '%player_pack_luck%' then
    raise exception 'LEGENDARY LUCK MIGRATION ABORTED: purchase_shop_pack does not reference player_pack_luck.';
  end if;

  if v_purchase_src ilike '%packs_since_ultra_or_better%' then
    raise exception 'LEGENDARY LUCK MIGRATION ABORTED: purchase_shop_pack still references the old packs_since_ultra_or_better streak-pity mechanic - it should have been fully replaced by the Luck system.';
  end if;

  if v_purchase_src not ilike '%luck_points >= 100%' then
    raise exception 'LEGENDARY LUCK MIGRATION ABORTED: purchase_shop_pack does not contain the >=100 emergency Legendary guarantee check.';
  end if;

  raise notice 'LEGENDARY LUCK MIGRATION: all structural assertions passed (player_pack_luck table created; purchase_shop_pack uses the new Luck system with no leftover streak-pity references).';
end $$;

commit;
