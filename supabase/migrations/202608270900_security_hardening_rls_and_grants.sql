-- =========================================================
-- SECURITY HARDENING (2026-08-27) - Track 7 audit findings
--
-- Every statement in this file is additive/idempotent (enable RLS -
-- a no-op if already enabled; create policy guarded by drop policy
-- if exists; column-level revoke; function-level revoke) and touches
-- ONLY grants/policies, never table shape or data. Safe to apply to
-- production as-is, in one transaction, with zero downtime and zero
-- risk to existing rows. Nothing here changes what any
-- SECURITY DEFINER RPC can do internally - those run as the
-- function owner (not `authenticated`), so table/column grants and
-- RLS policies targeting `authenticated` never restrict them. This
-- is the same "lock down direct client access, leave the vetted RPC
-- surface alone" pattern already used everywhere else in this schema
-- (card_instances, ownership_history, etc.).
--
-- FINDING 1 (CRITICAL) - profiles.duel_points directly writable by
-- its own owner:
--   `grant select, update on public.profiles to authenticated;`
--   (202608190001_phase1_foundation.sql:340) plus the profiles_
--   update_self RLS policy (same file, ~line 270) checks ROW
--   ownership only, never WHICH COLUMNS changed. duel_points was
--   added later (202608200014_duel_points_and_wagers.sql) with no
--   column-level restriction ever added on top. Net effect: any
--   authenticated player can currently PATCH their own duel_points
--   to an arbitrary value via a normal REST call - this makes every
--   other DP-economy control in the app (match rewards, shop prices,
--   competition rewards, wagers) moot, since the balance itself is
--   directly settable. Fixed below by revoking UPDATE on that one
--   column while leaving the rest of the table's existing UPDATE
--   grant (display name, avatar, etc.) untouched.
--
-- FINDING 2 (CRITICAL) - the entire competition-rewards table set has
-- ZERO row-level security: competitions, competition_players,
-- competition_reward_rules, competition_results
-- (202608231045_competition_schema_recovery.sql) and
-- competition_reward_grants (202608231100_competition_v2_scheduling.
-- sql) never get `enable row level security`, a policy, or a
-- `revoke insert/update/delete` anywhere in migration history. Every
-- other table in this schema needed an EXPLICIT revoke to lock down
-- (confirming the project default is full CRUD to `authenticated`
-- once a table exists) - these five are wide open: a player could
-- forge their own placement in competition_results, plant a
-- lucrative competition_reward_rules row and have it paid out for
-- real, or fabricate 'granted' competition_reward_grants rows.
-- Fixed below: RLS enabled on all five, SELECT policies scoped to
-- "you're a member of the competition's league" (reusing the
-- existing public.is_league_member() helper - see
-- 202608190001_phase1_foundation.sql), and INSERT/UPDATE/DELETE
-- revoked from `authenticated` entirely - every real mutation to
-- these tables already goes through a SECURITY DEFINER RPC
-- (create_competition/_v2, add/remove_competition_player[_v2],
-- submit/correct_competition_match_result_v2,
-- finalize_competition[_v2], distribute_competition_rewards[_v2]),
-- none of which need direct client write access to keep working.
--
-- NOTE ON SCHEMA DRIFT: 202608231045_competition_schema_recovery.sql
-- explicitly documents that these five tables may already exist in
-- production with a real shape this repo can only infer (V1's RPC
-- bodies are black-box). RLS/grant statements are enable/revoke/
-- policy-create only - they never assume or depend on a column this
-- migration doesn't itself reference (league_id is reached via a
-- join through competitions, which IS a proven, recovered column -
-- see that file's header), so this remains safe even if some other
-- inferred column in that recovery file turns out to be wrong.
--
-- FINDING 3 (MEDIUM) - consume_reward_voucher is SECURITY DEFINER
-- and deletes/decrements a reward_vouchers row from caller-supplied
-- ids with no internal auth.uid() check. A code comment
-- (20260820_shop_system.sql:901-903) claims it's "intentionally NOT
-- granted directly to authenticated users," but Postgres grants
-- EXECUTE to PUBLIC by default at CREATE FUNCTION time, and no
-- REVOKE was ever issued - so the comment describes an intent that
-- was never actually enforced. Exploitable only by someone who
-- already knows a victim's voucher UUID (bounded blast radius), but
-- exactly the anti-pattern the audit asked to close. Fixed below
-- with an explicit revoke.
--
-- FINDING 4 (LOW) - claim_league_admin_if_none() has a TOCTOU race:
-- two concurrent callers during an admin-less window could both
-- read has_admin = false before either UPDATE commits, and both
-- self-promote. Self-limited (it can only ever promote the calling
-- user, never a third party) but still worth closing with the same
-- pg_advisory_xact_lock pattern already used for competition reward
-- distribution (202608231400_competition_v2_reward_correction_
-- hardening.sql) and draft picks (202608231540_draft_concurrency_
-- lock.sql).
-- =========================================================


-- ---------------------------------------------------------
-- FINDING 1 - lock down profiles.duel_points from direct client
-- writes.
--
-- CORRECTED 2026-08-27 (post-review): the original fix here was
-- `revoke update (duel_points) on public.profiles from authenticated`,
-- relying on the table-wide `grant update on public.profiles to
-- authenticated` (202608190001_phase1_foundation.sql) to still cover
-- every other column. That does NOT work: a column-level REVOKE only
-- removes a column-level privilege, and never narrows a broader
-- table-level GRANT that already covers all columns - a role holding
-- table-level UPDATE can still update every column, duel_points
-- included, regardless of any column-level revoke naming it. The
-- correct pattern is the reverse: revoke the table-level UPDATE
-- entirely, then grant UPDATE back only on the specific columns a
-- player is allowed to self-edit - which is also a strictly safer
-- default (a future new profiles column is NOT client-writable unless
-- explicitly added to this list, instead of silently inheriting the
-- old table-wide grant).
--
-- The allow-list below is exactly the columns actually written by
-- profile-editing server actions (src/app/actions/profile.ts -
-- updateProfile, equip/unequip title, select boss monster option),
-- so normal username/avatar/bio/theme/boss-personality editing keeps
-- working unchanged. duel_points is deliberately absent - every
-- legitimate mutation goes through a SECURITY DEFINER RPC
-- (award_match_duel_points, distribute_competition_rewards[_v2], shop
-- purchases, trades, wagers), which runs as the function owner and is
-- unaffected by grants targeting `authenticated`.
-- ---------------------------------------------------------

revoke update on public.profiles from authenticated;

grant update (
  duelist_name,
  catchphrase,
  signature_quote,
  bio,
  avatar_url,
  profile_banner_url,
  accent_theme,
  boss_personality,
  favorite_play_style,
  favorite_card_type,
  favorite_attribute,
  favorite_monster_type,
  custom_title,
  boss_monster_option_id,
  updated_at
) on public.profiles to authenticated;

comment on column public.profiles.duel_points is
  'Current Duel Point balance. All mutations should also be written to duel_point_transactions. NOT directly client-writable - see 202608270900_security_hardening_rls_and_grants.sql (table-level UPDATE revoked from authenticated and replaced with an explicit column allow-list that excludes duel_points, 2026-08-27); every legitimate mutation goes through a SECURITY DEFINER RPC, which runs as the function owner and is unaffected by this revoke.';


-- ---------------------------------------------------------
-- FINDING 2 - RLS + grants for the five ungoverned competition
-- tables. Read access: any member of the competition's league.
-- Write access: none directly from `authenticated` - only via the
-- existing SECURITY DEFINER RPC surface, which runs as the table
-- owner and bypasses these policies entirely (same as every other
-- RPC-mediated table in this schema).
-- ---------------------------------------------------------

alter table public.competitions enable row level security;
alter table public.competition_players enable row level security;
alter table public.competition_reward_rules enable row level security;
alter table public.competition_results enable row level security;
alter table public.competition_reward_grants enable row level security;

-- competitions itself carries league_id directly.
drop policy if exists competitions_select_league_member on public.competitions;
create policy competitions_select_league_member on public.competitions
  for select to authenticated
  using (public.is_league_member(league_id));

-- The other four reach league_id by joining through competitions.
drop policy if exists competition_players_select_league_member on public.competition_players;
create policy competition_players_select_league_member on public.competition_players
  for select to authenticated
  using (
    exists (
      select 1 from public.competitions c
      where c.id = competition_players.competition_id
        and public.is_league_member(c.league_id)
    )
  );

drop policy if exists competition_reward_rules_select_league_member on public.competition_reward_rules;
create policy competition_reward_rules_select_league_member on public.competition_reward_rules
  for select to authenticated
  using (
    exists (
      select 1 from public.competitions c
      where c.id = competition_reward_rules.competition_id
        and public.is_league_member(c.league_id)
    )
  );

drop policy if exists competition_results_select_league_member on public.competition_results;
create policy competition_results_select_league_member on public.competition_results
  for select to authenticated
  using (
    exists (
      select 1 from public.competitions c
      where c.id = competition_results.competition_id
        and public.is_league_member(c.league_id)
    )
  );

drop policy if exists competition_reward_grants_select_league_member on public.competition_reward_grants;
create policy competition_reward_grants_select_league_member on public.competition_reward_grants
  for select to authenticated
  using (
    exists (
      select 1 from public.competitions c
      where c.id = competition_reward_grants.competition_id
        and public.is_league_member(c.league_id)
    )
  );

-- No INSERT/UPDATE/DELETE policy is created for any of the five -
-- with RLS enabled and no permissive policy for those commands,
-- every direct client mutation attempt is denied outright regardless
-- of the table-level grant below. The explicit revoke is still
-- issued for defense-in-depth (matches the pattern used for
-- card_instances/ownership_history) and to remove the false
-- impression a future `grant all` might otherwise create.
revoke insert, update, delete on public.competitions from authenticated;
revoke insert, update, delete on public.competition_players from authenticated;
revoke insert, update, delete on public.competition_reward_rules from authenticated;
revoke insert, update, delete on public.competition_results from authenticated;
revoke insert, update, delete on public.competition_reward_grants from authenticated;

grant select on public.competitions to authenticated;
grant select on public.competition_players to authenticated;
grant select on public.competition_reward_rules to authenticated;
grant select on public.competition_results to authenticated;
grant select on public.competition_reward_grants to authenticated;


-- ---------------------------------------------------------
-- FINDING 3 - close the gap between consume_reward_voucher's
-- documented intent ("not granted directly") and its actual grant
-- state (PUBLIC gets EXECUTE by default at CREATE FUNCTION time).
-- ---------------------------------------------------------

revoke execute on function public.consume_reward_voucher(uuid, uuid) from public;
revoke execute on function public.consume_reward_voucher(uuid, uuid) from authenticated;


-- ---------------------------------------------------------
-- FINDING 4 - close claim_league_admin_if_none()'s TOCTOU race with
-- an advisory transaction lock keyed by league, mirroring the
-- competition_reward_lifecycle_ lock pattern already established in
-- 202608231400_competition_v2_reward_correction_hardening.sql.
-- Function body is otherwise byte-for-byte identical to
-- 202608231520_season_reset.sql's version - only the lock line is
-- new - so this is a pure hardening replace, not a behavior change.
-- ---------------------------------------------------------

create or replace function public.claim_league_admin_if_none(
  target_league_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  is_member boolean;
  has_admin boolean;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Serializes concurrent claims for the SAME league so two
  -- simultaneous callers can never both observe has_admin = false
  -- and both self-promote - the second caller's lock acquisition
  -- blocks until the first's transaction (including its UPDATE)
  -- has committed or rolled back.
  perform pg_advisory_xact_lock(hashtext('claim_league_admin_' || target_league_id::text));

  select exists (
    select 1 from public.league_members lm
    where lm.league_id = target_league_id
      and lm.profile_id = current_user_id
  ) into is_member;

  if not is_member then
    raise exception 'You must already be a member of this league to claim admin.';
  end if;

  select exists (
    select 1 from public.league_members lm
    where lm.league_id = target_league_id
      and lm.role = 'admin'
  ) into has_admin;

  if has_admin then
    return false;
  end if;

  update public.league_members
  set role = 'admin'
  where league_id = target_league_id
    and profile_id = current_user_id;

  return true;
end;
$$;

comment on function public.claim_league_admin_if_none(uuid) is
  'Recovery helper for the gap season_reset_apply() creates: leagues are kept but league_members is fully cleared, and bootstrap_private_league() only grants admin when creating a brand-new league - never when (re)joining a kept one. Self-promotes the calling member to admin, and ONLY does anything when the league currently has zero admins. Safe to leave broadly executable: a no-op in any normally-administered league. Advisory-locked per league (2026-08-27) to close a TOCTOU race between concurrent callers.';

revoke all on function public.claim_league_admin_if_none(uuid) from public;
grant execute on function public.claim_league_admin_if_none(uuid) to authenticated;
