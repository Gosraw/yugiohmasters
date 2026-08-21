-- =========================================================
-- DUELIST CIRCLE - TEST DATA RESET
--
-- !!! SAFETY NOTICE - READ BEFORE RUNNING !!!
--
-- This script was written by Claude for MANUAL review and
-- MANUAL execution in the Supabase SQL Editor. It has NOT
-- been run against your database. Nothing has been deleted.
--
-- What this script does:
--   Deletes all LEAGUE/PLAYER-GENERATED GAMEPLAY DATA (draft
--   progress, owned cards, decks, matches, trades, shop/pack
--   history, pity counters, DP transaction history) so the
--   real friend group can start with a completely clean slate.
--   It also resets every profile's Duel Point balance to 0.
--
-- What this script deliberately does NOT touch:
--   - card_catalog                (reference data)
--   - public.settings             (app config, incl. the new
--                                   draft.rarity_weights row)
--   - boss_monster_options        (boss/system content)
--   - shop_pack_types             (shop configuration)
--   - shop_rotations /
--     shop_rotation_cards         (shop rotation config -
--                                   NOT the same as purchase
--                                   history, which IS reset)
--   - leagues / league_members    (league structure + who's
--                                   allowed to log in)
--   - profiles                    (rows are kept - accounts
--                                   keep working; only
--                                   duel_points is zeroed. See
--                                   OPTIONAL SECTION 3 below if
--                                   you also want identity/
--                                   onboarding fields reset)
--   - audit_log                   (admin/system audit trail,
--                                   not player gameplay data -
--                                   not in your reset list)
--   - auth.users                  (see the AUTH USERS section
--                                   at the very bottom - this
--                                   script never touches auth
--                                   schema tables)
--
-- Ordering: every foreign key in this schema is ON DELETE
-- RESTRICT unless noted otherwise (verified against the
-- migrations directly, not assumed) - almost nothing here
-- cascades automatically, so the DELETE order below is
-- child-tables-first and matters. Do not reorder statements.
--
-- Scope: this repository's bootstrap_private_league() caps a
-- league at 3 members and the app is built as a single
-- private friends league (see README), so this script is
-- written UNSCOPED (no "where league_id = ...") on the
-- assumption there is exactly one league row. Section 0 below
-- lets you confirm that before anything is deleted - if it
-- shows more than one league, STOP and tell Claude, because a
-- league_id filter should be added before this is safe to run
-- as-is.
--
-- Run Section 0 first, alone, and read the counts. Only then
-- run Sections 1-2 (wrapped in BEGIN/COMMIT, matching every
-- other migration in this repo, so it is all-or-nothing).
-- =========================================================


-- =========================================================
-- SECTION 0 - PRE-FLIGHT CHECK (read-only, safe to run any time)
--
-- Run this by itself first. It changes nothing.
-- =========================================================

select 'leagues' as table_name, count(*) from public.leagues
union all
select 'profiles', count(*) from public.profiles
union all
select 'drafts', count(*) from public.drafts
union all
select 'draft_players', count(*) from public.draft_players
union all
select 'draft_offers', count(*) from public.draft_offers
union all
select 'draft_offer_cards', count(*) from public.draft_offer_cards
union all
select 'draft_picks', count(*) from public.draft_picks
union all
select 'card_instances', count(*) from public.card_instances
union all
select 'ownership_history', count(*) from public.ownership_history
union all
select 'decks', count(*) from public.decks
union all
select 'deck_cards', count(*) from public.deck_cards
union all
select 'matches', count(*) from public.matches
union all
select 'match_dp_escrows', count(*) from public.match_dp_escrows
union all
select 'match_wager_cards', count(*) from public.match_wager_cards
union all
select 'duel_point_transactions', count(*) from public.duel_point_transactions
union all
select 'trades', count(*) from public.trades
union all
select 'trade_items', count(*) from public.trade_items
union all
select 'shop_purchases', count(*) from public.shop_purchases
union all
select 'shop_pack_openings', count(*) from public.shop_pack_openings
union all
select 'shop_pack_pulls', count(*) from public.shop_pack_pulls
union all
select 'shop_pack_pity', count(*) from public.shop_pack_pity
union all
select 'reward_vouchers', count(*) from public.reward_vouchers
order by table_name;

-- If public.leagues shows more than 1 row: STOP, do not run
-- Section 1/2 as-is, and tell Claude so a league_id filter can
-- be added to every statement below first.


-- =========================================================
-- SECTION 1 - DELETE GAMEPLAY DATA
--
-- Strict child-to-parent order. Everything below is a DELETE
-- with no WHERE clause other than "everything" (see the
-- single-league assumption above) - review Section 0's output
-- before running this.
-- =========================================================

begin;

-- ---- Draft system (all FKs here are ON DELETE RESTRICT) ----

delete from public.draft_picks;
delete from public.draft_offer_cards;
delete from public.draft_offers;
delete from public.draft_players;
delete from public.drafts;

-- ---- Shop / pack history + pity (per-player state) ----

delete from public.shop_pack_pulls;
delete from public.shop_pack_openings;
delete from public.shop_purchases;
delete from public.shop_pack_pity;
delete from public.reward_vouchers;

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

-- ---- Owned cards (must be last among card_instances
--      referrers - card_catalog itself is never touched) ----

delete from public.ownership_history;
delete from public.card_instances;

-- ---- Duel Point balance back to zero for every player ----

update public.profiles
set
  duel_points = 0,
  updated_at = now()
where duel_points <> 0;

commit;


-- =========================================================
-- SECTION 2 - POST-FLIGHT CHECK (read-only)
--
-- Every count below should now be 0. leagues/profiles are
-- listed again only to confirm they were NOT touched (their
-- counts should be UNCHANGED from Section 0, not zero).
-- =========================================================

select 'leagues (unchanged expected)' as table_name, count(*) from public.leagues
union all
select 'profiles (unchanged expected)', count(*) from public.profiles
union all
select 'profiles with duel_points <> 0 (should be 0)', count(*) from public.profiles where duel_points <> 0
union all
select 'drafts (should be 0)', count(*) from public.drafts
union all
select 'draft_players (should be 0)', count(*) from public.draft_players
union all
select 'draft_offers (should be 0)', count(*) from public.draft_offers
union all
select 'draft_offer_cards (should be 0)', count(*) from public.draft_offer_cards
union all
select 'draft_picks (should be 0)', count(*) from public.draft_picks
union all
select 'card_instances (should be 0)', count(*) from public.card_instances
union all
select 'ownership_history (should be 0)', count(*) from public.ownership_history
union all
select 'decks (should be 0)', count(*) from public.decks
union all
select 'deck_cards (should be 0)', count(*) from public.deck_cards
union all
select 'matches (should be 0)', count(*) from public.matches
union all
select 'match_dp_escrows (should be 0)', count(*) from public.match_dp_escrows
union all
select 'match_wager_cards (should be 0)', count(*) from public.match_wager_cards
union all
select 'duel_point_transactions (should be 0)', count(*) from public.duel_point_transactions
union all
select 'trades (should be 0)', count(*) from public.trades
union all
select 'trade_items (should be 0)', count(*) from public.trade_items
union all
select 'shop_purchases (should be 0)', count(*) from public.shop_purchases
union all
select 'shop_pack_openings (should be 0)', count(*) from public.shop_pack_openings
union all
select 'shop_pack_pulls (should be 0)', count(*) from public.shop_pack_pulls
union all
select 'shop_pack_pity (should be 0)', count(*) from public.shop_pack_pity
union all
select 'reward_vouchers (should be 0)', count(*) from public.reward_vouchers
union all
select 'card_catalog (unchanged expected, reference data)', count(*) from public.card_catalog
union all
select 'settings (unchanged expected, incl. new rarity weights)', count(*) from public.settings
union all
select 'boss_monster_options (unchanged expected)', count(*) from public.boss_monster_options
union all
select 'shop_pack_types (unchanged expected)', count(*) from public.shop_pack_types
union all
select 'shop_rotations (unchanged expected)', count(*) from public.shop_rotations
order by table_name;


-- =========================================================
-- OPTIONAL SECTION 3 - PROFILE IDENTITY / ONBOARDING RESET
--
-- NOT part of the default reset above. Your instructions
-- listed "onboarding/draft progress" together - Section 1
-- already wipes all DRAFT progress (the drafts/draft_players/
-- draft_offers/draft_picks tables). This optional block
-- additionally clears each profile's Boss Monster pick and
-- personalization choices (from the onboarding flow) so the
-- SAME login accounts feel brand-new when the real players
-- sign back in, instead of keeping the test players' choices.
--
-- Only run this if you actually intend to reuse the existing
-- login accounts for the real friend group. If the real
-- players will get their OWN new accounts instead, skip this
-- entirely and see the AUTH USERS section below.
--
-- Commented out on purpose - uncomment deliberately.
-- =========================================================

-- begin;
--
-- update public.profiles
-- set
--   boss_monster_option_id = null,
--   custom_title = null,
--   catchphrase = null,
--   bio = null,
--   favorite_play_style = null,
--   favorite_card_type = null,
--   favorite_attribute = null,
--   favorite_monster_type = null,
--   accent_theme = 'gold',
--   signature_quote = null,
--   profile_banner_url = null,
--   boss_personality = 'sarcastic',
--   updated_at = now();
--
-- commit;


-- =========================================================
-- NOT COVERED BY THIS SCRIPT: public.wallets
--
-- Investigated and intentionally skipped: public.wallets is
-- Phase-1 scaffolding that nothing in the current codebase
-- reads from or writes to (the live DP balance lives on
-- profiles.duel_points, reset in Section 1 above; verified by
-- grepping every migration and the entire src/ tree for
-- "wallets" - it's referenced nowhere outside its own CREATE
-- TABLE statement). Resetting it would be a no-op either way.
-- =========================================================


-- =========================================================
-- AUTH USERS - DO NOT DELETE VIA SQL
--
-- auth.users is Supabase's own managed schema. This script
-- never touches it, and you should not run manual DELETE/
-- TRUNCATE statements against auth.users yourself either -
-- Supabase manages related auth state (sessions, identities,
-- refresh tokens) outside what a plain SQL delete can safely
-- clean up.
--
-- To remove a TEST ACCOUNT (login) entirely, once you have
-- confirmed you no longer want it:
--
--   1. Supabase Dashboard -> Authentication -> Users.
--   2. Find the test account (the app maps usernames to
--      <normalized>@duelist.local, so look for that pattern -
--      not a real email address).
--   3. Delete the user from there.
--
-- What happens automatically: public.profiles.id has
--   references auth.users(id) on delete cascade
-- so deleting the auth user automatically deletes the
-- matching profiles row too - you do NOT need to also delete
-- the profile manually.
--
-- One thing that CAN block this and is worth knowing before
-- you click delete: public.leagues.created_by references
-- profiles(id) ON DELETE RESTRICT (not cascade). If the test
-- account you are deleting is the league's creator
-- (created_by), the cascade will fail with a foreign key
-- error. If that happens, run this first (read-only-safe,
-- just repoints a text label, no gameplay effect):
--
--   update public.leagues
--   set created_by = null
--   where created_by = '<the test profile''s id>';
--
-- then delete the auth user again. Every other table that
-- references profiles uses either CASCADE or RESTRICT in a
-- way that Section 1 above already cleared out first (drafts,
-- matches, decks, trades, etc. all reference profiles too, but
-- since Section 1 deletes all of those rows already, nothing
-- will be left over to block a profile's cascade delete except
-- the leagues.created_by case above).
--
-- Run Section 0's "profiles" count before and after in the
-- Table Editor if you want to visually confirm which accounts
-- remain.
-- =========================================================
