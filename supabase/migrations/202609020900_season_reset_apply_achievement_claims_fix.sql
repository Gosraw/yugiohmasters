begin;

-- =========================================================
-- SEASON RESET FIX - ACHIEVEMENT CLAIMS FK GAP (Season 1 real-start prep)
--
-- WHY
-- public.achievement_claims (202609012400_p2w_achievements.sql) was
-- added AFTER public.season_reset_apply() /
-- public.season_reset_preview() were written (202608231520 /
-- 202608231530), so neither function knows it exists.
--
-- achievement_claims.claimant_id references public.profiles(id)
-- ON DELETE RESTRICT (confirmed by direct inspection of
-- 202609012400_p2w_achievements.sql - not guessed). season_reset_apply()
-- ends by returning every remaining profiles.id for
-- scripts/season-reset.mjs to pass to
-- supabase.auth.admin.deleteUser(id), which cascades auth.users ->
-- profiles -> every table with a CASCADE fk to profiles. A RESTRICT
-- fk does NOT cascade - it blocks the delete outright. So today, any
-- player who ever submitted a Pay-to-Win achievement claim (pending,
-- approved, or rejected) cannot have their account deleted via the
-- season reset flow: deleteUser() would fail with a foreign key
-- violation on achievement_claims.claimant_id.
--
-- This is exactly the kind of gap the "REAL START" full-account-wipe
-- reset (RESET_LEAGUE_FOR_REAL_START.sql) depends on
-- season_reset_apply() to have already handled, per project
-- convention ("Supabase's auth.users table is managed outside plain
-- SQL privileges in the normal case" - deletion must go through
-- Supabase's Admin API, never raw SQL against auth.users, and
-- everything that would block that Admin API cascade must be
-- cleared or deleted by season_reset_apply() first).
--
-- FULL AUDIT PERFORMED (per explicit instruction to inspect the
-- schema first and not guess table names) - every
-- "references public.profiles(id)" across every migration file was
-- enumerated with its exact on-delete action. Findings:
--   - Every RESTRICT fk to profiles other than this one is on a
--     table season_reset_apply() already explicitly deletes
--     (drafts/draft_players, card_instances/ownership_history,
--     decks, matches, trades/trade_items, shop_purchases,
--     shop_pack_openings, competitions, competition_reward_grants),
--     or is nulled instead of deleted because the parent row is kept
--     as config (leagues.created_by, card_catalog.rarity_reviewed_by
--     - both already handled in the existing function body).
--   - competition_tiebreaks.streak_holder_id (RESTRICT) and
--     competition_deck_locks.deck_id (RESTRICT) are not explicit
--     blockers: both rows fully cascade away the moment
--     public.competitions is deleted (both have an ON DELETE CASCADE
--     fk to competitions, and season_reset_apply() already deletes
--     competitions before profiles/auth.users are ever touched), so
--     by the time any profile is deleted those rows no longer exist.
--   - public.competition_round_reward_grants is a DIFFERENT table
--     from public.competition_reward_grants (both exist; the former
--     was added later by 202608301500_round_reward_settlement_and_
--     auto_finalize.sql). Its profile_id and competition_id fks are
--     both ON DELETE CASCADE, so - like the tiebreaks/deck-locks
--     tables above - it is not a delete blocker (it cascades away
--     when competitions is deleted, and would cascade away directly
--     from a profile delete regardless). It is left out of the
--     explicit delete list below on purpose, same as the other
--     CASCADE-only tables season_reset_apply() has never explicitly
--     listed (card_wishlist_items, player_boss_paths,
--     player_pack_luck, dashboard_coach_insights, etc.) - CASCADE
--     fks need no explicit statement for a deleteUser() cascade to
--     succeed, and touching them is out of this fix's narrow scope.
--   - achievement_claims.claimant_id is the ONLY real gap found.
--
-- WHAT THIS CHANGES
-- Re-declares season_reset_apply() identically to its current body
-- (202608231530_season_reset_safe_delete_fix.sql) with exactly one
-- addition: an explicit delete of every achievement_claims row,
-- grouped with the other Pay-to-Win/player-state deletes. Claims are
-- deleted outright (not nulled) because they are player state, not
-- configuration - the 7 achievement DEFINITIONS themselves are a
-- separate, preserved table (public.achievements) and are untouched.
-- Also adds a matching row to season_reset_preview() so a
-- pre-reset dry run shows how many claims will be removed instead of
-- silently omitting them.
--
-- SAFETY
-- - Purely a `create or replace function` - same signature, same
--   security definer / search_path / grants, no schema change, fully
--   reversible by re-running the prior migration's definition.
-- - Every other line of both function bodies is copied verbatim from
--   the current live definition - only the achievement_claims lines
--   are new.
-- =========================================================

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
  select 'achievement_claims', count(*), true from public.achievement_claims
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
  union all
  select 'achievements (kept - 7 Pay-to-Win definitions, claims against them are cleared above)', count(*), false from public.achievements
  order by table_name;
end;
$$;

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
  delete from public.draft_picks where true;
  delete from public.draft_offer_cards where true;
  delete from public.draft_offers where true;
  delete from public.draft_players where true;
  delete from public.drafts where true;

  -- ---- Shop / pack history + pity ----
  delete from public.shop_pack_pulls where true;
  delete from public.shop_pack_openings where true;
  delete from public.shop_purchases where true;
  delete from public.shop_pack_pity where true;
  delete from public.reward_vouchers where true;

  -- ---- Un-sell shop rotation slots (config kept, player state cleared) ----
  update public.shop_rotation_cards
  set sold_to_profile_id = null, sold_at = null
  where sold_to_profile_id is not null;

  -- ---- Competitions (full history reset, per explicit scope) ----
  delete from public.competition_reward_grants where true;
  delete from public.competition_results where true;
  delete from public.competition_players where true;
  delete from public.competitions where true; -- cascades competition_reward_rules, competition_tiebreaks, competition_deck_locks, competition_round_reward_grants

  -- ---- Matches, wagers, DP ledger ----
  delete from public.match_wager_cards where true;
  delete from public.match_dp_escrows where true;
  delete from public.duel_point_transactions where true;
  delete from public.matches where true;

  -- ---- Trading ----
  delete from public.trade_items where true;
  delete from public.trades where true;

  -- ---- Decks ----
  delete from public.deck_cards where true;
  delete from public.decks where true;

  -- ---- Pay-to-Win achievement claims (player state; the 7
  --      achievement DEFINITIONS in public.achievements are config
  --      and stay untouched) ----
  -- claimant_id references public.profiles(id) on delete restrict,
  -- so any surviving claim row blocks the profile/auth-user cascade
  -- delete that follows this function (via scripts/season-reset.mjs
  -- -> supabase.auth.admin.deleteUser()). Deleted outright, not
  -- nulled, since a claim with no claimant is meaningless - unlike
  -- leagues.created_by / card_catalog.rarity_reviewed_by below,
  -- which null out attribution on rows that must themselves survive.
  delete from public.achievement_claims where true;

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
  delete from public.ownership_history where true;
  alter table public.card_instances disable trigger prevent_card_instance_delete_trigger;
  delete from public.card_instances where true;
  alter table public.card_instances enable trigger prevent_card_instance_delete_trigger;

  -- ---- League membership (structure kept, members cleared) ----
  delete from public.league_members where true;

  -- ---- Clear attribution FKs that would otherwise block the
  --      profile/auth-user cascade delete that follows ----
  update public.leagues set created_by = null where created_by is not null;
  update public.card_catalog set rarity_reviewed_by = null where rarity_reviewed_by is not null;

  return query select p.id from public.profiles p;
end;
$$;

comment on function public.season_reset_apply(text) is
  'DESTRUCTIVE. Admin-gated + requires the exact confirmation phrase RESET DUELIST CIRCLE SEASON. Wraps every delete in one transaction. Does NOT delete auth.users/profiles itself - returns the profile ids for scripts/season-reset.mjs to pass to supabase.auth.admin.deleteUser(), which cascades profiles (and wallets, card_wishlist_items, player_boss_paths + its stage-unlock/achievement-event children, player_pack_luck, dashboard_coach_insights, competition_round_reward_grants, competition_tiebreaks, competition_deck_locks, and every other CASCADE fk to profiles) cleanly since this function has already deleted or nulled everything with a RESTRICT fk to profiles that would otherwise block that cascade - most recently public.achievement_claims (202609020900, added after this function was first written).';

revoke all on function public.season_reset_preview() from public;
grant execute on function public.season_reset_preview() to authenticated;

revoke all on function public.season_reset_apply(text) from public;
grant execute on function public.season_reset_apply(text) to authenticated;

commit;
