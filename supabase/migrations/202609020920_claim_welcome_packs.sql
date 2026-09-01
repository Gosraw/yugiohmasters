begin;

-- =========================================================
-- CLAIM_WELCOME_PACKS - Season 1 welcome bonus, real entitlement
-- (Season 1 audit, shop/welcome-bonus item)
--
-- WHY
-- The spec grants each new Season 1 player 1 Normal + 1 Premium + 1
-- Deluxe pack, no DP cost, on joining. We manually discovered that
-- inserting a row directly into public.shop_purchases does NOT
-- grant an unopened pack - purchase_shop_pack() is the only
-- function that creates the actual entitlement chain
-- (shop_pack_openings -> player_pack_luck -> card_instances /
-- shop_pack_pulls, all in one transaction) - a bare shop_purchases
-- row is just a history log entry with nothing behind it.
--
-- purchase_shop_pack() already has a fully-formed "pay with a
-- voucher instead of DP" path (target_voucher_id) - this is
-- exactly the same mechanism already used to manually grant
-- bossg/samo/fardin their vouchers live. This function reuses that
-- exact path rather than inventing a second entitlement pipeline:
-- it grants three public.reward_vouchers rows (normal_pack /
-- premium_pack / deluxe_pack, quantity 1 each), which the player
-- then redeems from the existing Shop UI exactly like any other
-- voucher - purchase_shop_pack() does the rest, unmodified.
--
-- IDEMPOTENCY
-- A reward_vouchers row is deleted the moment it's redeemed (see
-- purchase_shop_pack's "CONSUME VOUCHER" step), so the voucher rows
-- themselves cannot be used as the durable "already claimed" marker
-- - a player who redeemed their welcome Normal pack would otherwise
-- look like they never received one and get re-granted. A small
-- dedicated claims table is the marker instead, following the same
-- unique-constraint-as-guard pattern already used elsewhere in this
-- schema (e.g. achievement_claims_one_success_per_period): the
-- primary key insert is the atomic "have I already run" check.
--
-- WHO CAN CALL THIS
-- Any authenticated league member, for themselves only (auth.uid()
-- - no target-profile parameter) - self-service, same shape as
-- start_personal_initial_draft(). Season 1's proxy.ts onboarding
-- gate also calls this automatically once a player's league
-- membership is confirmed, so a brand new player receives their
-- welcome packs with no manual action - but it remains safe to
-- call directly (e.g. from a support/admin tool) since it is a
-- total no-op after the first successful claim.
--
-- NOTE ON THE 3 ALREADY-LIVE PLAYERS
-- bossg/samo/fardin already received their welcome vouchers via a
-- manual live grant before this function existed. This migration
-- does NOT call claim_welcome_packs() for them or backfill the
-- claims table on their behalf - doing so without live read access
-- to confirm their current reward_vouchers/shop_purchases state
-- risks double-granting. See the audit report's live-data section
-- for the exact read-only verification query and the safe backfill
-- snippet (insert into season1_welcome_bonus_claims only, no
-- voucher grant) to run by hand once their current state is
-- confirmed.
--
-- SAFETY
-- Purely additive: one new table, one new function. Does not touch
-- shop_purchases, purchase_shop_pack, or any existing voucher.
-- Fully reversible: drop function if exists
-- public.claim_welcome_packs(); drop table if exists
-- public.season1_welcome_bonus_claims; undoes this with no
-- consequence to any other table.
-- =========================================================

create table if not exists public.season1_welcome_bonus_claims (
  profile_id uuid primary key
    references public.profiles(id)
    on delete cascade,

  claimed_at timestamptz not null default now()
);

comment on table public.season1_welcome_bonus_claims is
  'Idempotency marker for claim_welcome_packs(): one row per profile that has ever received the Season 1 welcome bonus (1 Normal + 1 Premium + 1 Deluxe voucher). Vouchers themselves are deleted on redemption, so this table - not reward_vouchers - is the durable "already granted" check.';

create or replace function public.claim_welcome_packs()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  claim_inserted boolean;
begin
  current_user_id := (select auth.uid());

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.league_members
    where profile_id = current_user_id
  ) then
    raise exception 'You are not a league member yet.';
  end if;

  insert into public.season1_welcome_bonus_claims (profile_id)
  values (current_user_id)
  on conflict (profile_id) do nothing;

  claim_inserted := found;

  if not claim_inserted then
    -- Already claimed previously - total no-op, safe to call
    -- repeatedly (e.g. on every proxy.ts request).
    return false;
  end if;

  insert into public.reward_vouchers (
    profile_id,
    voucher_type,
    quantity,
    source_type,
    note
  )
  values
    (current_user_id, 'normal_pack', 1, 'season1_welcome_bonus', 'Season 1 welcome bonus'),
    (current_user_id, 'premium_pack', 1, 'season1_welcome_bonus', 'Season 1 welcome bonus'),
    (current_user_id, 'deluxe_pack', 1, 'season1_welcome_bonus', 'Season 1 welcome bonus');

  return true;
end;
$$;

comment on function public.claim_welcome_packs() is
  'Self-service, idempotent: grants the calling league member their one-time Season 1 welcome bonus (1 Normal + 1 Premium + 1 Deluxe pack voucher, redeemed via the existing purchase_shop_pack voucher path). Returns true the first time it actually grants, false on every call after (already claimed). Raises if the caller is not yet a league member.';

revoke all on function public.claim_welcome_packs() from public;
grant execute on function public.claim_welcome_packs() to authenticated;

commit;
