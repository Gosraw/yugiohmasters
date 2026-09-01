begin;

-- =========================================================
-- PHASE 2 - ECONOMY CENTRALIZATION (3/3): VERIFICATION HELPER
--
-- Same reasoning as _phase1_verify_introspect() (see that
-- migration's own header): Supabase's default PostgREST config does
-- not expose pg_catalog over the REST API, so a plain
-- `.from("pg_proc")` call from the JS verification script would
-- fail regardless of whether the underlying fix is really live.
-- This narrow, read-only, security-definer RPC additionally exposes
-- the actual VALUES now live in league_economy_defaults and
-- shop_pack_types (not just existence) since Phase 2 is specifically
-- about verifying economy VALUES agree everywhere - existence checks
-- alone (Phase 1's approach) are not enough this time.
--
-- SAFETY: identical posture to _phase1_verify_introspect - read-only,
-- narrow (hardcoded object names, not caller-supplied), granted to
-- service_role only, safe to leave in place permanently.
-- =========================================================

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
        'refresh_shop_special_pack_rotation_if_needed'
      ]) as fn
    ),
    'sources', (
      select jsonb_object_agg(p.proname, p.prosrc)
      from pg_proc p
      where p.proname in (
        'install_default_round_rewards_v2',
        '_compute_league_match_reward',
        'settle_round_rewards_v2',
        'refresh_shop_special_pack_rotation_if_needed'
      )
    ),
    'constraints', (
      select jsonb_object_agg(rel.relname || '.' || c.conname, pg_get_constraintdef(c.oid))
      from pg_constraint c
      join pg_class rel on rel.oid = c.conrelid
      where rel.relname in ('competition_round_reward_rules', 'competition_round_reward_grants')
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%role%'
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
