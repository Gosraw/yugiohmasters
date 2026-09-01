-- =========================================================
-- PHASE 1 DEPLOYMENT - SECTION 08 of 08
-- One narrow, read-only, security-definer introspection RPC
-- (_phase1_verify_introspect) used only by
-- scripts/verify-phase1-live.mjs, since Supabase's default PostgREST
-- config does not expose pg_catalog directly to a REST/JS client.
-- Optional to keep afterward; safe to drop once Phase 1 is verified.
-- Idempotent: safe to re-run.
-- SOURCE (unmodified): supabase/migrations/202608310010_phase1_verify_introspect_helper.sql
-- =========================================================

begin;


-- =========================================================
-- PHASE 1 VERIFICATION HELPER (read-only introspection RPC)
--
-- scripts/verify-phase1-live.mjs needs to confirm specific functions
-- and unique indexes exist, and that a few function bodies contain
-- the expected corrected literals/wiring - but Supabase's default
-- PostgREST config does not expose pg_catalog over the REST API, so
-- a plain `.from("pg_proc")` call from the JS client would fail on
-- most projects regardless of whether the underlying fix is really
-- there. This narrow, read-only, security-definer RPC is the
-- reliable way to check: RPC calls to public-schema functions always
-- work over PostgREST, independent of exposed-schema settings.
--
-- SAFETY
-- - Read-only: only ever SELECTs from pg_proc / pg_indexes. No
--   application table is touched, nothing is inserted/updated/
--   deleted, nothing outside this one JSON return value is exposed.
-- - Narrow: the exact function/index names it inspects are
--   hardcoded inside the function body, not passed in as arguments -
--   it cannot be used to introspect arbitrary objects.
-- - Grants execute to service_role only (not authenticated/anon) -
--   this is a one-time deployment-verification tool, not something
--   the app itself should ever call.
-- - Optional to keep: safe to leave in place permanently (it does
--   nothing unless explicitly called with the service-role key), or
--   drop it after Phase 1 verification is done with:
--     drop function if exists public._phase1_verify_introspect();
-- =========================================================

create or replace function public._phase1_verify_introspect()
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
        'settle_competition_if_complete_v2',
        'install_default_round_rewards_v2',
        'purchase_shop_pack',
        '_compute_league_match_reward',
        'submit_competition_match_result_v2'
      ]) as fn
    ),
    'sources', (
      select jsonb_object_agg(p.proname, p.prosrc)
      from pg_proc p
      where p.proname in (
        'install_default_round_rewards_v2',
        '_compute_league_match_reward',
        'submit_competition_match_result_v2',
        'purchase_shop_pack'
      )
    ),
    'indexes', (
      select jsonb_object_agg(idx, exists(select 1 from pg_indexes where indexname = idx))
      from unnest(array[
        'duel_point_transactions_match_reason_unique',
        'competition_reward_grants_active_unique',
        'competition_round_reward_grants_active_unique'
      ]) as idx
    )
  ) into result;

  return result;
end;
$function$;

revoke all on function public._phase1_verify_introspect() from public;
grant execute on function public._phase1_verify_introspect() to service_role;

commit;
