-- =========================================================
-- Security review fixes (2026-10-12)
--
-- 1. season1_welcome_bonus_claims (202609020920) was created without
--    RLS, and Supabase's default privileges give anon/authenticated
--    full table rights on it. It is the ONLY idempotency marker for
--    claim_welcome_packs(): a signed-in player could
--      delete from season1_welcome_bonus_claims where profile_id = me
--    through PostgREST and then call claim_welcome_packs() again for
--    another Normal + Premium + Deluxe voucher, as often as they
--    like (and could also delete/insert rows for other players).
--    claim_welcome_packs() is SECURITY DEFINER, so it keeps working
--    with RLS on and no client privileges.
--
-- 2. perk_dp_this_week(uuid, timestamptz) was still executable by
--    anon (revoke from public does not remove Supabase's explicit
--    anon grant): anyone with the publishable key could read any
--    player's weekly perk DP. Signed-in players keep access.
--
-- 3. Defense in depth: the 2.0 season / weekly-goal / title tables
--    are server-written only (SECURITY DEFINER functions). RLS
--    already blocks client writes (select-only policies); also drop
--    the default write privileges so a future permissive policy
--    cannot open them by accident.
--
-- Additive: no function bodies or signatures change.
-- =========================================================

begin;

-- 1 ------------------------------------------------------
alter table public.season1_welcome_bonus_claims enable row level security;

revoke all on public.season1_welcome_bonus_claims from anon, authenticated;

-- 2 ------------------------------------------------------
revoke all on function public.perk_dp_this_week(uuid, timestamptz) from public, anon;
grant execute on function public.perk_dp_this_week(uuid, timestamptz) to authenticated;

-- 3 ------------------------------------------------------
revoke insert, update, delete, truncate on
  public.seasons,
  public.goal_templates,
  public.weekly_goal_config,
  public.weekly_goal_sets,
  public.weekly_goal_set_items,
  public.weekly_goal_progress,
  public.weekly_goal_bonus_grants,
  public.season_bonus_config,
  public.season_bonus_grants,
  public.season_match_bounty_checks,
  public.season_path_tiers,
  public.season_path_xp_sources,
  public.season_path_xp_events,
  public.season_path_tier_grants,
  public.profile_titles
from anon, authenticated;

commit;
