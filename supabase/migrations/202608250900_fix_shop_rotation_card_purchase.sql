begin;

-- =========================================================
-- FIX: purchase_shop_rotation_card - single/loose card
-- purchases were failing for every player
--
-- ROOT CAUSE (found by tracing the complete purchase flow: UI form
-- in src/app/(app)/shop/page.tsx -> purchaseRotationCard server
-- action in src/app/actions/shop.ts -> this RPC -> card_instances
-- insert -> validate_new_card_instance trigger):
--
-- public.card_instances.league_id and .original_owner_id and
-- .original_acquisition_type are all `not null` (see
-- 202608190004_card_instances.sql). The ORIGINAL
-- purchase_shop_rotation_card (defined in 20260820_shop_system.sql,
-- never touched since) only ever inserted card_catalog_id,
-- current_owner_id, copy_number, acquired_at, locked - it never set
-- league_id, original_owner_id, or original_acquisition_type at
-- all. Every attempt to buy a loose/rotation card therefore failed
-- at the database layer:
--   - if league_id/original_owner_id/original_acquisition_type had
--     no default, the insert itself raises a not-null-constraint
--     violation, OR
--   - even where a null slipped through, the
--     validate_new_card_instance BEFORE INSERT trigger
--     (202608190004_card_instances.sql) scopes its scarcity count
--     AND its "current/original owner must be a league member"
--     checks by `league_id = new.league_id` - with league_id left
--     null, that check can never match a real league_members row,
--     so the trigger unconditionally raised 'Current owner is not
--     a member of this league.'
-- Either way, the error surfaced to the player via
-- purchaseRotationCard's existing `redirect(/shop?error=...)`
-- path - this was never hidden client-side, the client-side error
-- handling was already correct; the bug was entirely upstream, in
-- this RPC never having been updated when card_instances.league_id
-- became a required column (the same "league" concept that
-- purchase_shop_pack - the WORKING pack-purchase path, re-issued in
-- 202608230021_shop_v2_refresh_and_specials.sql - already resolves
-- correctly via a `league_members` lookup and passes through on
-- every insert).
--
-- A SECOND, related bug fixed in the same pass: next_copy_number
-- was computed as `max(copy_number) + 1 from card_instances where
-- card_catalog_id = ...` with NO league_id filter at all, even
-- though copy numbers are scoped PER LEAGUE (see the
-- `unique (league_id, card_catalog_id, copy_number)` constraint and
-- validate_new_card_instance's own per-league scarcity count). In a
-- multi-league installation this could compute a copy_number
-- already taken in the buyer's own league (unique-constraint
-- violation) or one that exceeds the card_instances_copy_number_valid
-- check (<= 3), instead of the correct next number within the
-- buyer's own league.
--
-- FIX: re-issue purchase_shop_rotation_card, identical in every
-- other respect (row-level locking via `for update`, the
-- already-sold guard, the rotation-active guard, the DP balance
-- check/deduct, the second `sold_at is null` guard against a
-- last-instant race, the shop_purchases insert), but now:
--   1. resolves the buyer's current_league_id via the exact same
--      `league_members` lookup purchase_shop_pack already uses,
--      raising a clear error if the player is not in a league
--      (matches the existing "not a league member" UX elsewhere in
--      the shop rather than a raw constraint error),
--   2. scopes next_copy_number's max-copy lookup to that league,
--   3. passes league_id, original_owner_id (= the buyer, this is a
--      brand-new instance, never previously owned), and
--      original_acquisition_type = 'shop' (already a valid
--      card_acquisition_type enum value, the same one the pack path
--      uses) into the card_instances insert, plus original_source_id
--      = the rotation card slot id purchased, mirroring how the pack
--      path stamps its own opening id.
--
-- SAFETY: purely a function re-issue (create or replace function),
-- same signature, same return type, same RPC name the client
-- already calls - no schema change, no data migration, nothing else
-- touched. Existing atomicity/no-double-charge guarantees (the
-- `for update` row lock plus the `where sold_at is null` guard on
-- the update) are preserved unchanged; this fix only adds the
-- missing required columns to the insert and fixes their scoping.
-- =========================================================

create or replace function public.purchase_shop_rotation_card(
  target_rotation_card_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;

  current_league_id uuid;

  slot_row public.shop_rotation_cards%rowtype;

  rotation_row public.shop_rotations%rowtype;

  current_dp integer;

  next_copy_number integer;

  new_instance_id uuid;

  new_purchase_id uuid;
begin
  current_user_id :=
    auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  -- Resolve the buyer's league the same way purchase_shop_pack
  -- does - card_instances.league_id is required, and the player
  -- must actually belong to it.
  select
    lm.league_id
  into current_league_id
  from public.league_members lm
  where lm.profile_id = current_user_id
  limit 1;

  if current_league_id is null then
    raise exception 'Current user is not a league member.';
  end if;

  select *
  into slot_row
  from public.shop_rotation_cards
  where id = target_rotation_card_id
  for update;

  if not found then
    raise exception 'Shop card not found.';
  end if;

  if slot_row.sold_at is not null then
    raise exception 'This card has already been sold.';
  end if;

  select *
  into rotation_row
  from public.shop_rotations
  where id = slot_row.rotation_id;

  if not found then
    raise exception 'Shop rotation not found.';
  end if;

  if
    rotation_row.status <> 'active'
    or rotation_row.starts_at > now()
    or rotation_row.ends_at <= now()
  then
    raise exception 'This shop rotation is not active.';
  end if;

  select duel_points
  into current_dp
  from public.profiles
  where id = current_user_id
  for update;

  if not found then
    raise exception 'Profile not found.';
  end if;

  if current_dp < slot_row.price_dp then
    raise exception 'Not enough Duel Points.';
  end if;

  update public.profiles
  set
    duel_points =
      duel_points -
      slot_row.price_dp,

    updated_at =
      now()
  where id =
    current_user_id;

  select
    coalesce(
      max(copy_number),
      0
    ) + 1
  into next_copy_number
  from public.card_instances
  where card_catalog_id =
    slot_row.card_catalog_id
    and league_id =
      current_league_id;

  insert into public.card_instances (
    league_id,
    card_catalog_id,
    current_owner_id,
    original_owner_id,
    original_acquisition_type,
    original_source_id,
    copy_number,
    acquired_at,
    locked
  )
  values (
    current_league_id,
    slot_row.card_catalog_id,
    current_user_id,
    current_user_id,
    'shop',
    slot_row.id,
    next_copy_number,
    now(),
    false
  )
  returning id
  into new_instance_id;

  update public.shop_rotation_cards
  set
    sold_to_profile_id =
      current_user_id,

    sold_at =
      now()
  where id =
    target_rotation_card_id
    and sold_at is null;

  if not found then
    raise exception 'This card was sold before your purchase completed.';
  end if;

  insert into public.shop_purchases (
    profile_id,
    purchase_type,
    rotation_id,
    rotation_card_id,
    dp_spent
  )
  values (
    current_user_id,
    'single_card',
    slot_row.rotation_id,
    slot_row.id,
    slot_row.price_dp
  )
  returning id
  into new_purchase_id;

  return new_instance_id;
end;
$$;

revoke all
  on function public.purchase_shop_rotation_card(uuid)
  from public;

grant execute
  on function public.purchase_shop_rotation_card(uuid)
  to authenticated;

commit;
