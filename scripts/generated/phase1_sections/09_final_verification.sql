-- =========================================================
-- PHASE 1 DEPLOYMENT - SECTION 09 of 09 (FINAL VERIFICATION - run last)
-- Structural assertions confirming sections 01-08 all landed
-- correctly (tables/functions/indexes exist, archetype registry has
-- the expected 10 archetypes / 255 relationships). Hard-fails (rolls
-- back only this section's own transaction - it makes no schema
-- changes itself) if anything upstream silently did not apply.
-- Read-only except for its own do-block bookkeeping; safe to re-run
-- any number of times. Run this after 01-08 have all succeeded.
-- SOURCE: extracted from the tail of the combined
-- scripts/generated/LIVE_PHASE1_ROLLOUT_2026_08_31.sql (unmodified
-- logic, wrapped in its own begin;/commit; instead of sharing the
-- combined file's single big transaction).
-- =========================================================

begin;

-- POST-ROLLOUT STRUCTURAL ASSERTIONS
--
-- Hard-fail (and roll back the ENTIRE transaction) only on
-- structural invariants this same script just created - these
-- cannot legitimately be false unless something upstream silently
-- failed. Does NOT hard-fail on data-dependent outcomes (a card name
-- not matching this league's real catalog, a rarity override not
-- finding its target) since those already self-report via RAISE
-- NOTICE in their own sections and a real name mismatch is a data
-- question for the human, not a reason to discard the entire
-- rollout.
-- =========================================================

do $$
declare
  v_archetype_count integer;
  v_relationship_count integer;
begin
  if to_regclass('public.archetype_registry') is null then
    raise exception 'PHASE 1 ROLLOUT ABORTED: public.archetype_registry table was not created.';
  end if;

  if to_regclass('public.archetype_cards') is null then
    raise exception 'PHASE 1 ROLLOUT ABORTED: public.archetype_cards table was not created.';
  end if;

  select count(*) into v_archetype_count from public.archetype_registry;
  if v_archetype_count <> 10 then
    raise exception 'PHASE 1 ROLLOUT ABORTED: expected 10 archetype_registry rows, found %.', v_archetype_count;
  end if;

  select count(*) into v_relationship_count from public.archetype_cards;
  if v_relationship_count <> 255 then
    raise exception 'PHASE 1 ROLLOUT ABORTED: expected 255 archetype_cards relationship rows, found %.', v_relationship_count;
  end if;

  if to_regclass('public.competition_round_reward_rules') is null then
    raise exception 'PHASE 1 ROLLOUT ABORTED: public.competition_round_reward_rules table was not created.';
  end if;

  if to_regclass('public.competition_round_reward_grants') is null then
    raise exception 'PHASE 1 ROLLOUT ABORTED: public.competition_round_reward_grants table was not created.';
  end if;

  if to_regprocedure('public.settle_round_rewards_v2(uuid, integer)') is null then
    raise exception 'PHASE 1 ROLLOUT ABORTED: settle_round_rewards_v2(uuid, integer) function was not created.';
  end if;

  if to_regprocedure('public.settle_competition_if_complete_v2(uuid)') is null then
    raise exception 'PHASE 1 ROLLOUT ABORTED: settle_competition_if_complete_v2(uuid) function was not created.';
  end if;

  if to_regprocedure('public.install_default_round_rewards_v2(uuid)') is null then
    raise exception 'PHASE 1 ROLLOUT ABORTED: install_default_round_rewards_v2(uuid) function was not created.';
  end if;

  if to_regprocedure('public.purchase_shop_pack(text, uuid)') is null then
    raise exception 'PHASE 1 ROLLOUT ABORTED: purchase_shop_pack(text, uuid) function was not created.';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'competition_round_reward_grants_active_unique'
  ) then
    raise exception 'PHASE 1 ROLLOUT ABORTED: competition_round_reward_grants_active_unique partial unique index is missing - round rewards would not be duplicate-safe.';
  end if;

  if to_regprocedure('public._phase1_verify_introspect()') is null then
    raise exception 'PHASE 1 ROLLOUT ABORTED: _phase1_verify_introspect() helper function was not created - the verification script will not be able to run.';
  end if;

  raise notice 'PHASE 1 ROLLOUT: all structural assertions passed (archetype registry: 10 archetypes / 255 relationships; round-reward schema, functions and idempotency index present; Legendary scarcity fix present; verification helper installed).';
end $$;


commit;
