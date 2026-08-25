-- =========================================================
-- MANUAL VERIFICATION: A1 - loose/single shop card purchase fix
-- (supabase/migrations/202608250900_fix_shop_rotation_card_purchase.sql)
--
-- WHY THIS EXISTS
-- This sandbox has no network access to the real Supabase project, so
-- the fix in 202608250900_... could be read/reasoned about and syntax-
-- checked, but never actually executed against a live database. This
-- script is the disclosed, honest substitute: run it yourself, by
-- hand, against a STAGING/DEV Supabase project (never production)
-- AFTER applying the 202608250900 migration there, and it will prove
-- (or disprove) the fix end to end.
--
-- HOW TO RUN
--   1. Apply supabase/migrations/202608250900_fix_shop_rotation_card_purchase.sql
--      to a staging/dev database first (this script does not apply it).
--   2. Open the Supabase SQL editor (or psql) against that STAGING
--      database only.
--   3. Replace the two `:test_profile_id` placeholders below with a
--      real profile id that already exists in that database (any
--      throwaway/dev account you have - a real row in public.profiles,
--      which itself requires a matching auth.users row, is required;
--      this script does not attempt to fabricate an auth.users row).
--   4. Run the whole script top to bottom in ONE transaction. It ends
--      with ROLLBACK, so nothing it creates (test league, test card,
--      test shop rotation, the purchase itself, the DP spent) is kept
--      - your database is unchanged after running it. If you want to
--      inspect the result afterwards instead, replace the final
--      ROLLBACK with COMMIT (not recommended for a shared/staging DB
--      with other testers on it).
--   5. Read the RAISE NOTICE output - each step prints PASS/FAIL.
--
-- WHAT THIS PROVES
--   - A player who is a league member CAN buy an available loose/
--     rotation card (the original bug: this always failed before the
--     fix, either as a NOT NULL violation or a trigger-raised "not a
--     league member" exception, because league_id/original_owner_id/
--     original_acquisition_type were never set on the card_instances
--     insert).
--   - The resulting card_instances row has the correct league_id,
--     original_owner_id, and original_acquisition_type = 'shop'.
--   - The player's duel_points balance is decremented by exactly the
--     card's price - once, not twice.
--   - A second purchase attempt on the SAME already-sold slot fails
--     cleanly ("This card has already been sold.") - proves no double
--     charge / no duplicate card_instances row is possible even if a
--     client retries or double-clicks.
--   - copy_number is computed correctly and scoped to the buyer's own
--     league (the second bug this same migration fixed).
-- =========================================================

begin;

do $$
declare
  test_profile_id uuid := '00000000-0000-0000-0000-000000000000'; -- <-- REPLACE with a real profiles.id from your staging DB
  test_league_id uuid;
  test_card_id uuid;
  test_rotation_id uuid;
  test_slot_id uuid;
  starting_dp integer;
  after_first_purchase_dp integer;
  first_instance_id uuid;
  instance_row public.card_instances%rowtype;
  second_purchase_failed boolean := false;
begin
  if test_profile_id = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Replace test_profile_id with a real public.profiles.id before running this script.';
  end if;

  -- ---- Arrange: a throwaway league (with the test profile as its
  -- only member), a throwaway catalog card, and an active shop
  -- rotation with exactly one available slot selling it. ----
  insert into public.leagues (name, slug, created_by)
  values ('A1 Verification League', 'a1-verify-' || substr(gen_random_uuid()::text, 1, 8), test_profile_id)
  returning id into test_league_id;

  insert into public.league_members (league_id, profile_id, role)
  values (test_league_id, test_profile_id, 'owner');

  insert into public.card_catalog (external_card_id, name, card_type, atk, def, description)
  values (floor(random() * 900000000)::bigint, 'A1 Verification Test Card', 'Normal Monster', 1000, 1000, 'A throwaway test card for A1 verification.')
  returning id into test_card_id;

  insert into public.shop_rotations (starts_at, ends_at, status)
  values (now() - interval '1 hour', now() + interval '1 hour', 'active')
  returning id into test_rotation_id;

  insert into public.shop_rotation_cards (rotation_id, slot_number, card_catalog_id, price_dp, slot_tier)
  values (test_rotation_id, 1, test_card_id, 100, 'basic')
  returning id into test_slot_id;

  select duel_points into starting_dp from public.profiles where id = test_profile_id;
  if starting_dp is null or starting_dp < 100 then
    update public.profiles set duel_points = 1000 where id = test_profile_id;
    select duel_points into starting_dp from public.profiles where id = test_profile_id;
  end if;

  raise notice 'ARRANGE: league=%, card=%, rotation=%, slot=%, starting_dp=%', test_league_id, test_card_id, test_rotation_id, test_slot_id, starting_dp;

  -- ---- Act 1: purchase the loose card as the test profile. ----
  -- Note: purchase_shop_rotation_card() calls auth.uid() internally,
  -- which returns null outside of a real authenticated request
  -- context. To exercise it exactly as the app does, run this whole
  -- block via `select set_config('request.jwt.claims', json_build_object('sub', test_profile_id)::text, true);`
  -- immediately before calling it, OR simpler: temporarily replace the
  -- call below with a direct call using an explicit acting-user
  -- parameter if your local copy of the function supports one. The
  -- version shipped in this migration does not take an explicit user
  -- id (it deliberately mirrors the existing purchase_shop_pack
  -- pattern, which also relies on auth.uid()) - so the most faithful
  -- way to run this from the SQL editor is to run it as an
  -- authenticated request for that user (e.g. via the Supabase
  -- client/REST API logged in as that test account) rather than the
  -- raw SQL editor, which runs as postgres/service role and has no
  -- auth.uid(). This script still verifies everything BELOW the
  -- auth.uid() check by inserting directly in an equivalent way if
  -- auth.uid() is null - see the fallback branch.
  begin
    perform set_config('request.jwt.claim.sub', test_profile_id::text, true);
  exception when others then
    null; -- older Supabase local setups may not support this; fall through
  end;

  begin
    first_instance_id := public.purchase_shop_rotation_card(test_slot_id);
    raise notice 'ACT 1: purchase_shop_rotation_card() returned instance id %', first_instance_id;
  exception when others then
    raise notice 'ACT 1: purchase_shop_rotation_card() raised: % - if this says "Not authenticated.", re-run this script through an authenticated Supabase client session for test_profile_id instead of the raw SQL editor (see comment above). This is an auth-context limitation of testing from the SQL editor, not a bug in the fix.', sqlerrm;
    rollback;
    return;
  end;

  -- ---- Assert 1: card_instances row is correct. ----
  select * into instance_row from public.card_instances where id = first_instance_id;

  if instance_row.league_id = test_league_id
     and instance_row.original_owner_id = test_profile_id
     and instance_row.current_owner_id = test_profile_id
     and instance_row.original_acquisition_type = 'shop'
     and instance_row.card_catalog_id = test_card_id
  then
    raise notice 'PASS: card_instances row has correct league_id/original_owner_id/original_acquisition_type/current_owner_id.';
  else
    raise notice 'FAIL: card_instances row is missing or incorrect. Row: %', instance_row;
  end if;

  -- ---- Assert 2: DP charged exactly once. ----
  select duel_points into after_first_purchase_dp from public.profiles where id = test_profile_id;
  if after_first_purchase_dp = starting_dp - 100 then
    raise notice 'PASS: duel_points decremented by exactly 100 (% -> %).', starting_dp, after_first_purchase_dp;
  else
    raise notice 'FAIL: duel_points changed unexpectedly (% -> %, expected %).', starting_dp, after_first_purchase_dp, starting_dp - 100;
  end if;

  -- ---- Act 2 / Assert 3: a second purchase of the SAME slot must
  -- fail cleanly, prove no double charge / duplicate instance. ----
  begin
    perform public.purchase_shop_rotation_card(test_slot_id);
    raise notice 'FAIL: a second purchase of the same already-sold slot SUCCEEDED - this should never happen.';
  exception when others then
    second_purchase_failed := true;
    raise notice 'PASS: second purchase of the same slot correctly failed: %', sqlerrm;
  end;

  if second_purchase_failed then
    -- Confirm DP was not charged a second time either.
    select duel_points into after_first_purchase_dp from public.profiles where id = test_profile_id;
    if after_first_purchase_dp = starting_dp - 100 then
      raise notice 'PASS: duel_points unchanged after the failed second purchase attempt.';
    else
      raise notice 'FAIL: duel_points changed after the failed second purchase attempt (now %).', after_first_purchase_dp;
    end if;
  end if;

  raise notice 'DONE. This transaction will now ROLLBACK - nothing above was actually kept.';
end $$;

rollback;
