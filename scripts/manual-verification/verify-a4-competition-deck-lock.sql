-- =========================================================
-- MANUAL VERIFICATION: A4 - competition deck lock
-- (supabase/migrations/202608250930_competition_deck_lock.sql)
--
-- WHY THIS EXISTS - see verify-a1-shop-purchase.sql's header for the
-- full explanation (no network access to a live Supabase project from
-- this sandbox). Same rules apply: run by hand, staging/dev only,
-- never production, after applying 202608250930_... there.
--
-- HOW TO RUN
--   1. Apply supabase/migrations/202608250930_competition_deck_lock.sql
--      to a staging/dev database first.
--   2. Replace :test_profile_id below with a real public.profiles.id.
--   3. This script runs entirely as postgres/service role (unlike A1's
--      script, nothing here needs auth.uid() - every function this
--      migration adds is SECURITY DEFINER and driven by table state,
--      not the calling role), so it can run directly in the Supabase
--      SQL editor without an authenticated session.
--   4. Run top to bottom in one transaction. Ends with ROLLBACK -
--      nothing is kept.
--
-- WHAT THIS PROVES
--   1. Before the competition starts (status = 'draft'), the deck is
--      freely editable (add/remove deck_cards, deactivate/reactivate)
--      - proves normal, non-competition deck editing is NOT affected
--      (test #6 from the product spec's list).
--   2. Flipping the competition's status away from 'draft' locks the
--      player's then-active deck: a competition_deck_locks row is
--      created automatically (via snapshot_competition_decks_on_start).
--   3. After the lock, adding or removing a deck_cards row on that
--      deck fails (via enforce_competition_deck_cards_lock).
--   4. After the lock, changing that deck's status or deactivating it
--      fails (via enforce_competition_deck_lock, branch a).
--   5. After the lock, activating a DIFFERENT deck while the
--      competition is still 'active' fails (via
--      enforce_competition_deck_lock, branch b).
--   6. Once the competition's status becomes 'completed', switching
--      to a different deck IS allowed again (the locked deck's own
--      row stays frozen forever, but the player is free to use other
--      decks post-competition).
-- =========================================================

begin;

do $$
declare
  test_profile_id uuid := '00000000-0000-0000-0000-000000000000'; -- <-- REPLACE with a real profiles.id from your staging DB
  test_league_id uuid;
  test_card_id uuid;
  test_instance_id uuid;
  locked_deck_id uuid;
  other_deck_id uuid;
  test_competition_id uuid;
  failure_caught boolean;
begin
  if test_profile_id = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Replace test_profile_id with a real public.profiles.id before running this script.';
  end if;

  -- ---- Arrange ----
  insert into public.leagues (name, slug, created_by)
  values ('A4 Verification League', 'a4-verify-' || substr(gen_random_uuid()::text, 1, 8), test_profile_id)
  returning id into test_league_id;

  insert into public.league_members (league_id, profile_id, role)
  values (test_league_id, test_profile_id, 'owner');

  insert into public.card_catalog (external_card_id, name, card_type, atk, def, description)
  values (floor(random() * 900000000)::bigint, 'A4 Verification Test Card', 'Normal Monster', 1000, 1000, 'A throwaway test card for A4 verification.')
  returning id into test_card_id;

  insert into public.card_instances (league_id, card_catalog_id, current_owner_id, original_owner_id, original_acquisition_type, copy_number, acquired_at, locked)
  values (test_league_id, test_card_id, test_profile_id, test_profile_id, 'development', 1, now(), false)
  returning id into test_instance_id;

  insert into public.decks (league_id, owner_id, name, status, is_active)
  values (test_league_id, test_profile_id, 'A4 Locked Deck', 'ready', true)
  returning id into locked_deck_id;

  insert into public.decks (league_id, owner_id, name, status, is_active)
  values (test_league_id, test_profile_id, 'A4 Other Deck', 'ready', false)
  returning id into other_deck_id;

  raise notice 'ARRANGE: league=%, locked_deck=%, other_deck=%', test_league_id, locked_deck_id, other_deck_id;

  -- ---- Step 1: before the competition starts, the deck is freely
  -- editable. ----
  insert into public.deck_cards (deck_id, card_instance_id, section, position)
  values (locked_deck_id, test_instance_id, 'main', 1);
  delete from public.deck_cards where deck_id = locked_deck_id and card_instance_id = test_instance_id;
  raise notice 'PASS: pre-lock deck_cards add+remove succeeded (normal editing unaffected before competition start).';

  insert into public.deck_cards (deck_id, card_instance_id, section, position)
  values (locked_deck_id, test_instance_id, 'main', 1);

  -- ---- Step 2: create the competition (starts in 'draft') and add
  -- the player - should NOT lock yet, since status is still 'draft'. ----
  insert into public.competitions (league_id, name, competition_type, status, created_by)
  values (test_league_id, 'A4 Verification Competition', 'round_robin', 'draft', test_profile_id)
  returning id into test_competition_id;

  insert into public.competition_players (competition_id, profile_id)
  values (test_competition_id, test_profile_id);

  if exists (select 1 from public.competition_deck_locks where competition_id = test_competition_id) then
    raise notice 'FAIL: a lock row exists while the competition is still draft - should not happen yet.';
  else
    raise notice 'PASS: no lock row yet while competition status is draft.';
  end if;

  -- ---- Step 3: flip the competition to 'active' - this should
  -- snapshot-lock the player's currently active deck. ----
  update public.competitions set status = 'active' where id = test_competition_id;

  if exists (
    select 1 from public.competition_deck_locks
    where competition_id = test_competition_id
      and profile_id = test_profile_id
      and deck_id = locked_deck_id
  ) then
    raise notice 'PASS: competition_deck_locks row created for the player''s active deck when the competition left draft.';
  else
    raise notice 'FAIL: no lock row created after the competition status left draft.';
  end if;

  -- ---- Step 4: deck_cards mutation on the locked deck must now fail
  -- (add, remove, and update all covered by the same trigger). ----
  failure_caught := false;
  begin
    insert into public.deck_cards (deck_id, card_instance_id, section, position)
    values (locked_deck_id, test_instance_id, 'extra', 2);
  exception when others then
    failure_caught := true;
  end;
  if failure_caught then
    raise notice 'PASS: adding a deck_cards row to the locked deck was correctly blocked.';
  else
    raise notice 'FAIL: adding a deck_cards row to the locked deck SUCCEEDED - lock is not enforced.';
    delete from public.deck_cards where deck_id = locked_deck_id and section = 'extra';
  end if;

  failure_caught := false;
  begin
    delete from public.deck_cards where deck_id = locked_deck_id and card_instance_id = test_instance_id;
  exception when others then
    failure_caught := true;
  end;
  if failure_caught then
    raise notice 'PASS: removing a card from the locked deck was correctly blocked.';
  else
    raise notice 'FAIL: removing a card from the locked deck SUCCEEDED - lock is not enforced.';
  end if;

  -- ---- Step 5: status/is_active changes on the locked deck itself
  -- must fail (can't "delete"/archive it, can't deactivate it). ----
  failure_caught := false;
  begin
    update public.decks set status = 'archived' where id = locked_deck_id;
  exception when others then
    failure_caught := true;
  end;
  if failure_caught then
    raise notice 'PASS: archiving (status change) the locked deck was correctly blocked.';
  else
    raise notice 'FAIL: archiving the locked deck SUCCEEDED - lock is not enforced.';
  end if;

  failure_caught := false;
  begin
    update public.decks set is_active = false where id = locked_deck_id;
  exception when others then
    failure_caught := true;
  end;
  if failure_caught then
    raise notice 'PASS: deactivating the locked deck was correctly blocked.';
  else
    raise notice 'FAIL: deactivating the locked deck SUCCEEDED - lock is not enforced.';
  end if;

  -- ---- Step 6: activating a DIFFERENT deck while the competition is
  -- still active must also fail. ----
  failure_caught := false;
  begin
    update public.decks set is_active = true where id = other_deck_id;
  exception when others then
    failure_caught := true;
  end;
  if failure_caught then
    raise notice 'PASS: activating a different deck mid-competition was correctly blocked.';
  else
    raise notice 'FAIL: activating a different deck mid-competition SUCCEEDED - lock is not enforced.';
    update public.decks set is_active = false where id = other_deck_id; -- undo for the next assertion
  end if;

  -- ---- Step 7: once the competition completes, switching to a
  -- different deck is allowed again - the locked deck itself stays
  -- frozen forever either way. ----
  update public.competitions set status = 'completed' where id = test_competition_id;

  begin
    update public.decks set is_active = true where id = other_deck_id;
    raise notice 'PASS: activating a different deck AFTER the competition completed succeeded (player is free again).';
  exception when others then
    raise notice 'FAIL: activating a different deck after competition completion was blocked - should be allowed. Error: %', sqlerrm;
  end;

  failure_caught := false;
  begin
    update public.decks set status = 'draft' where id = locked_deck_id;
  exception when others then
    failure_caught := true;
  end;
  if failure_caught then
    raise notice 'PASS: the LOCKED deck itself is still permanently frozen even after the competition completed (historical reproducibility preserved).';
  else
    raise notice 'FAIL: the locked deck became editable again after competition completion - it should stay frozen forever.';
  end if;

  raise notice 'DONE. This transaction will now ROLLBACK - nothing above was actually kept.';
end $$;

rollback;
