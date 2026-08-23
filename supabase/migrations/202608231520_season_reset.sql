-- =========================================================
-- SEASON RESET - safe, auditable, dry-run-by-default tooling
--
-- WHY A SQL FUNCTION INSTEAD OF LOOSE DELETE STATEMENTS
-- A plpgsql function body is implicitly one transaction - if any
-- statement inside raises, EVERYTHING in the function rolls back
-- automatically, with no separate BEGIN/COMMIT bookkeeping needed
-- from the caller. This also lets the reset be exposed the same
-- way every other admin operation in this schema already is
-- (recompute_format_eligibility, set_card_master_duel_status): an
-- admin-gated, auditable RPC, not a hand-run SQL script pasted
-- into the Supabase SQL Editor.
--
-- SCOPE - what this migration's functions do NOT do
-- Supabase's auth.users table is managed outside plain SQL
-- privileges in the normal case, and the existing precedent
-- (scripts/reset-test-data.sql) explicitly warns against raw
-- DELETE/TRUNCATE against it. These functions therefore reset
-- every PLAYER-DATA table in the `public` schema (see the
-- dependency-ordered list below) and return the list of profile
-- ids that were reset - deleting the matching auth.users rows
-- themselves is done by scripts/season-reset.mjs afterwards, via
-- Supabase's supported admin.auth.admin.deleteUser() API. Once
-- this function has run, every table that would otherwise block a
-- profile/auth-user cascade delete (drafts, matches, decks,
-- trades, card_instances, competitions, leagues.created_by,
-- card_catalog.rarity_reviewed_by, etc.) has already been cleared
-- or nulled, so that follow-up deleteUser() call cascades cleanly.
--
-- WHAT IS KEPT (never touched by these functions)
--   card_catalog                      reference data
--   settings                          app config
--   boss_monster_options               boss/system content
--   shop_pack_types                    shop configuration
--   shop_rotations                     shop rotation config
--   duelist_circle_formats /
--   format_card_overrides              Season format config
--   leagues                            kept as STRUCTURE (rows
--                                       stay; only created_by is
--                                       nulled so profile deletion
--                                       isn't blocked, and
--                                       league_members is cleared
--                                       so re-registration can
--                                       re-join cleanly)
--   audit_log                          system audit trail
--
-- shop_rotation_cards is config with player state MIXED IN
-- (sold_to_profile_id/sold_at) - this reset UN-SELLS those slots
-- (sets both to null) rather than deleting the rotation rows,
-- matching its actual shape (a config row that happens to record
-- who bought it, not a player-owned row).
--
-- WHAT IS RESET (deleted or zeroed)
-- Every table in scripts/reset-test-data.sql's existing scope,
-- PLUS the competition tables that script predates (competitions,
-- competition_players, competition_results,
-- competition_reward_grants; competition_reward_rules cascades
-- automatically via its own on delete cascade to competitions),
-- PLUS profiles themselves (via the auth.users cascade in the
-- Node wrapper, not directly by this function).
-- =========================================================


-- ---------------------------------------------------------
-- 1. season_reset_preview() - READ-ONLY. Safe to call at any
--    time, changes nothing. Returns exact row counts for every
--    table this reset would touch (delete) and every table it
--    would leave alone, so a caller can compare before/after.
-- ---------------------------------------------------------

create or replace function public.season_reset_preview()
returns table (
  table_name text,
  row_count bigint,
  will_be_reset boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  is_admin boolean;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1 from public.league_members lm
    where lm.profile_id = current_user_id and lm.role = 'admin'
  ) into is_admin;

  if not is_admin then
    raise exception 'Only a league admin may preview a season reset.';
  end if;

  return query
  select 'profiles'::text as table_name, count(*) as row_count, true as will_be_reset from public.profiles
  union all
  select 'league_members', count(*), true from public.league_members
  union all
  select 'drafts', count(*), true from public.drafts
  union all
  select 'draft_players', count(*), true from public.draft_players
  union all
  select 'draft_offers', count(*), true from public.draft_offers
  union all
  select 'draft_offer_cards', count(*), true from public.draft_offer_cards
  union all
  select 'draft_picks', count(*), true from public.draft_picks
  union all
  select 'card_instances', count(*), true from public.card_instances
  union all
  select 'ownership_history', count(*), true from public.ownership_history
  union all
  select 'decks', count(*), true from public.decks
  union all
  select 'deck_cards', count(*), true from public.deck_cards
  union all
  select 'matches', count(*), true from public.matches
  union all
  select 'match_dp_escrows', count(*), true from public.match_dp_escrows
  union all
  select 'match_wager_cards', count(*), true from public.match_wager_cards
  union all
  select 'duel_point_transactions', count(*), true from public.duel_point_transactions
  union all
  select 'trades', count(*), true from public.trades
  union all
  select 'trade_items', count(*), true from public.trade_items
  union all
  select 'shop_purchases', count(*), true from public.shop_purchases
  union all
  select 'shop_pack_openings', count(*), true from public.shop_pack_openings
  union all
  select 'shop_pack_pulls', count(*), true from public.shop_pack_pulls
  union all
  select 'shop_pack_pity', count(*), true from public.shop_pack_pity
  union all
  select 'reward_vouchers', count(*), true from public.reward_vouchers
  union all
  select 'competition_reward_grants', count(*), true from public.competition_reward_grants
  union all
  select 'competition_results', count(*), true from public.competition_results
  union all
  select 'competition_players', count(*), true from public.competition_players
  union all
  select 'competitions', count(*), true from public.competitions
  union all
  select 'shop_rotation_cards (sold slots to be un-sold, rows kept)',
    count(*) filter (where sold_to_profile_id is not null), true
    from public.shop_rotation_cards
  union all
  select 'auth.users / profiles (deleted via scripts/season-reset.mjs, not this function)',
    count(*), true from public.profiles
  -- --- kept, shown for confirmation only ---
  union all
  select 'card_catalog (kept)', count(*), false from public.card_catalog
  union all
  select 'settings (kept)', count(*), false from public.settings
  union all
  select 'boss_monster_options (kept)', count(*), false from public.boss_monster_options
  union all
  select 'shop_pack_types (kept)', count(*), false from public.shop_pack_types
  union all
  select 'shop_rotations (kept)', count(*), false from public.shop_rotations
  union all
  select 'duelist_circle_formats (kept)', count(*), false from public.duelist_circle_formats
  union all
  select 'format_card_overrides (kept)', count(*), false from public.format_card_overrides
  union all
  select 'leagues (kept as structure, created_by will be cleared)', count(*), false from public.leagues
  union all
  select 'audit_log (kept)', count(*), false from public.audit_log
  order by table_name;
end;
$$;

comment on function public.season_reset_preview() is
  'Read-only dry-run preview for a full Season reset. Never mutates anything. Call this and review the output before ever calling season_reset_apply().';


-- ---------------------------------------------------------
-- 2. season_reset_apply() - THE DESTRUCTIVE STEP. Admin-gated
--    AND requires an exact confirmation phrase, on top of the
--    role check, as a second deliberate gate. Wraps every delete
--    in one function body (one transaction - a raised exception
--    anywhere rolls back everything). Idempotent: calling it
--    again on an already-reset database is a safe no-op (every
--    statement either deletes 0 rows or is already satisfied).
--    Returns the list of profile ids that were reset, for the
--    Node wrapper to pass to auth.admin.deleteUser().
-- ---------------------------------------------------------

create or replace function public.season_reset_apply(
  confirmation_phrase text
)
returns table (reset_profile_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  is_admin boolean;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1 from public.league_members lm
    where lm.profile_id = current_user_id and lm.role = 'admin'
  ) into is_admin;

  if not is_admin then
    raise exception 'Only a league admin may apply a season reset.';
  end if;

  if confirmation_phrase is distinct from 'RESET DUELIST CIRCLE SEASON' then
    raise exception 'Confirmation phrase did not match. Nothing was changed. Pass exactly: RESET DUELIST CIRCLE SEASON';
  end if;

  -- ---- Draft system ----
  delete from public.draft_picks;
  delete from public.draft_offer_cards;
  delete from public.draft_offers;
  delete from public.draft_players;
  delete from public.drafts;

  -- ---- Shop / pack history + pity ----
  delete from public.shop_pack_pulls;
  delete from public.shop_pack_openings;
  delete from public.shop_purchases;
  delete from public.shop_pack_pity;
  delete from public.reward_vouchers;

  -- ---- Un-sell shop rotation slots (config kept, player state cleared) ----
  update public.shop_rotation_cards
  set sold_to_profile_id = null, sold_at = null
  where sold_to_profile_id is not null;

  -- ---- Competitions (full history reset, per explicit scope) ----
  delete from public.competition_reward_grants;
  delete from public.competition_results;
  delete from public.competition_players;
  delete from public.competitions; -- cascades competition_reward_rules

  -- ---- Matches, wagers, DP ledger ----
  delete from public.match_wager_cards;
  delete from public.match_dp_escrows;
  delete from public.duel_point_transactions;
  delete from public.matches;

  -- ---- Trading ----
  delete from public.trade_items;
  delete from public.trades;

  -- ---- Decks ----
  delete from public.deck_cards;
  delete from public.decks;

  -- ---- Owned cards ----
  -- card_instances carries an intentional, deliberate app-level
  -- guard (prevent_card_instance_delete_trigger, added in
  -- 202608190004_card_instances.sql: "Een bestaande kaart
  -- verdwijnt niet zomaar uit de wereld" / an existing card does
  -- not just disappear from the world - trading/wagers change the
  -- owner, they never delete the row, so scarcity stays reliable).
  -- A full Season reset is the one deliberate, admin-gated,
  -- confirmation-phrase-gated exception to that rule, so the
  -- trigger is suspended for exactly the one statement that needs
  -- it and re-enabled immediately after - both inside this same
  -- function transaction, so if anything below raises, the
  -- trigger's suspension rolls back along with everything else and
  -- is never left disabled outside of this atomic operation.
  delete from public.ownership_history;
  alter table public.card_instances disable trigger prevent_card_instance_delete_trigger;
  delete from public.card_instances;
  alter table public.card_instances enable trigger prevent_card_instance_delete_trigger;

  -- ---- League membership (structure kept, members cleared) ----
  delete from public.league_members;

  -- ---- Clear attribution FKs that would otherwise block the
  --      profile/auth-user cascade delete that follows ----
  update public.leagues set created_by = null where created_by is not null;
  update public.card_catalog set rarity_reviewed_by = null where rarity_reviewed_by is not null;

  return query select p.id from public.profiles p;
end;
$$;

comment on function public.season_reset_apply(text) is
  'DESTRUCTIVE. Admin-gated + requires the exact confirmation phrase RESET DUELIST CIRCLE SEASON. Wraps every delete in one transaction. Does NOT delete auth.users/profiles itself - returns the profile ids for scripts/season-reset.mjs to pass to supabase.auth.admin.deleteUser(), which cascades profiles (and wallets) cleanly since this function has already cleared everything that would otherwise block that cascade.';

revoke all on function public.season_reset_preview() from public;
grant execute on function public.season_reset_preview() to authenticated;

revoke all on function public.season_reset_apply(text) from public;
grant execute on function public.season_reset_apply(text) to authenticated;


-- ---------------------------------------------------------
-- 3. claim_league_admin_if_none(target_league_id) - RECOVERY
--    HELPER, directly required by season_reset_apply()'s own
--    side effects.
--
--    Season Reset deletes every league_members row (per the
--    user's explicit reset scope) but deliberately KEEPS the
--    leagues row itself (per the user's explicit "leagues kept
--    as structure" preference, section 37). Read together with
--    bootstrap_private_league() (202608190001_phase1_foundation.
--    sql, lines 161-227): that function only ever grants
--    role='admin' in the branch where it creates a BRAND NEW
--    league (target_league is null). Since Season Reset keeps
--    the league row, every re-registering player instead hits
--    the "join existing league" branch and is unconditionally
--    granted role='player' - meaning after a Season Reset, NO
--    ONE can ever become admin again through normal
--    registration. This is a real gap discovered by tracing
--    the actual function body (not guessed), and needs an
--    explicit, narrowly-scoped recovery path rather than a
--    silent assumption baked into the reset itself.
--
--    Safety design (works safely even outside a reset, so it is
--    never a standing privilege-escalation hole):
--      - caller must be authenticated
--      - caller must already be a member of the target league
--        (any role) - so only someone who has actually
--        (re)joined can claim it, not an arbitrary stranger
--      - the target league must currently have ZERO members
--        with role='admin' - the ONLY state this does anything
--        useful in. In a normal, already-administered league
--        this is always a no-op that changes nothing and
--        returns false.
--    Effect: promotes the CALLING user's own league_members row
--    to role='admin' for that league. It only ever self-promotes
--    the caller - it cannot be used to grant admin to anyone
--    else, which keeps it safe to leave broadly executable.
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
  'Recovery helper for the gap season_reset_apply() creates: leagues are kept but league_members is fully cleared, and bootstrap_private_league() only grants admin when creating a brand-new league - never when (re)joining a kept one. Self-promotes the calling member to admin, and ONLY does anything when the league currently has zero admins. Safe to leave broadly executable: a no-op in any normally-administered league.';

revoke all on function public.claim_league_admin_if_none(uuid) from public;
grant execute on function public.claim_league_admin_if_none(uuid) to authenticated;
