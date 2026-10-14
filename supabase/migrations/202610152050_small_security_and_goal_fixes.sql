begin;

-- =========================================================
-- Small fixes from the 2.0 code review (2026-10-15)
--
-- M3  consume_reward_voucher(uuid, uuid) deletes / decrements a
--     voucher from caller-supplied ids and has no auth check of its
--     own. authenticated was already revoked (202608270900), but
--     Supabase's default privileges still gave anon EXECUTE. Revoke
--     it from anon and public; nothing in the app calls it directly
--     (only SECURITY DEFINER code and the service role).
-- Low _phase1/2/3_verify_introspect(): read-only schema check
--     helpers for the scripts/verify-phase*-live.mjs scripts, which
--     run with the service role. No longer callable by anon /
--     signed-in players.
-- Low Tiebreak duels (matches.tiebreak_id set) no longer count for
--     the weekly goals "play / win season duels" - they are
--     deciders, not season duels (they already did not count for
--     standings or match DP).
--
-- Backwards compatible with the live main app.
-- =========================================================

revoke execute on function public.consume_reward_voucher(uuid, uuid) from public, anon;
grant execute on function public.consume_reward_voucher(uuid, uuid) to service_role;

do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        '_phase1_verify_introspect',
        '_phase2_verify_introspect',
        '_phase3_verify_introspect'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- Weekly goals: season duels only, tiebreak deciders excluded.
-- Same in-place technique as 202610121500 (the live body is
-- re-created with just this filter added).
do $$
declare
  def text;
  patched text;
begin
  def := pg_get_functiondef(
    'public._weekly_goal_progress_count(text,jsonb,uuid,uuid,timestamptz,timestamptz)'::regprocedure
  );

  if position('m.tiebreak_id is null' in def) > 0 then
    return;
  end if;

  patched := replace(
    def,
    'public._is_season_competition(m.competition_id)',
    'public._is_season_competition(m.competition_id)
      and m.tiebreak_id is null'
  );

  if patched = def then
    raise exception 'weekly goals: expected season filter not found in _weekly_goal_progress_count';
  end if;

  execute patched;
end;
$$;

commit;
