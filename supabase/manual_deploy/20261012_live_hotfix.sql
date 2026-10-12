-- =========================================================
-- Duelist Circle - LIVE hotfix (2026-10-12) for the season 1 app
--
-- For the CURRENT live app (main), before 2.0. Paste into the
-- Supabase SQL Editor once. Everything runs in ONE transaction: if
-- any check fails, nothing changes. Safe to run twice.
--
-- 1. Round rewards crash
--    202609042210 renamed the variable reward_reason ->
--    v_reward_reason inside settle_round_rewards_v2, but its text
--    replace for the DP ledger insert looked for
--      rule_row.duel_points, <newline> reward_reason,
--    while the real body has new_balance between them. One bare
--    reward_reason stayed behind, which Postgres then reads as a
--    (non-existent) column: every completed full round fails with
--    'column "reward_reason" does not exist' and the last result of
--    the round can't be saved. This rewrites only that reference.
--
-- 2. Unlimited welcome packs
--    season1_welcome_bonus_claims has RLS off and Supabase's default
--    client rights, so a player could delete their own claim row and
--    call claim_welcome_packs() again for another Normal + Premium +
--    Deluxe voucher, as often as they like. claim_welcome_packs() is
--    SECURITY DEFINER and keeps working; the app never reads this
--    table directly.
--
-- Not included: the onboarding proxy (that's a code fix on main,
-- see branch hotfix/live-2026-10-12).
-- =========================================================

begin;

-- 1 -------------------------------------------------------
do $hotfix$
declare
  ddl text;
  stray constant text := E'        new_balance,\n        reward_reason,';
  fixed constant text := E'        new_balance,\n        v_reward_reason,';
begin
  select pg_get_functiondef(
    'public.settle_round_rewards_v2(uuid,integer)'::regprocedure
  ) into ddl;

  if ddl is null then
    raise exception 'HOTFIX ABORTED: settle_round_rewards_v2(uuid,integer) not found.';
  end if;

  if ddl like '%' || fixed || '%' then
    raise notice 'Round rewards: already fixed, nothing to do.';
  elsif ddl like '%  v_reward_reason text;%' and ddl like '%' || stray || '%' then
    ddl := replace(ddl, stray, fixed);

    execute ddl;

    raise notice 'Round rewards: stray reward_reason reference fixed.';
  else
    raise exception 'HOTFIX ABORTED: settle_round_rewards_v2 does not look like the expected 202609042210 version. Nothing changed - send this message to Claude.';
  end if;

  -- Whatever path we took, no bare reward_reason may remain.
  select pg_get_functiondef(
    'public.settle_round_rewards_v2(uuid,integer)'::regprocedure
  ) into ddl;

  if ddl ~ '[^_]reward_reason[^_a-z]' then
    raise exception 'HOTFIX ABORTED: a bare reward_reason reference is still present.';
  end if;
end;
$hotfix$;

-- 2 -------------------------------------------------------
alter table public.season1_welcome_bonus_claims enable row level security;

revoke all on public.season1_welcome_bonus_claims from anon, authenticated;

do $check$
begin
  if has_table_privilege('authenticated', 'public.season1_welcome_bonus_claims', 'delete') then
    raise exception 'HOTFIX ABORTED: players can still delete welcome claim rows.';
  end if;

  raise notice 'Welcome packs: claim rows are now server-only.';
end;
$check$;

commit;
