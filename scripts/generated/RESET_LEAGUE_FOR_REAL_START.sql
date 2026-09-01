-- =========================================================
-- RESET_LEAGUE_FOR_REAL_START.sql
--
-- ============================ DANGER =====================
-- THIS SCRIPT PERMANENTLY DELETES ALL GAMEPLAY/TEST-RUN DATA.
-- DO NOT RUN THIS AGAINST LIVE SUPABASE WITHOUT A BACKUP AND
-- WITHOUT A HUMAN DELIBERATELY CHOOSING TO RUN IT.
-- IT WAS NOT EXECUTED BY THE AI THAT WROTE IT.
-- ==========================================================
--
-- PURPOSE
-- Clears every test-run gameplay artifact so the real league can start
-- from a clean slate tonight, WITHOUT touching permanent configuration,
-- accounts, or the cardpool. This is deliberately a DIFFERENT, narrower
-- operation than the existing reset_duelist_circle_season() RPC
-- (supabase/migrations/202608231520_season_reset.sql), which deletes
-- profiles/leagues themselves via an auth.users cascade - that is a
-- "delete every account and start over" reset. This script is a
-- "keep everyone's account and league membership, wipe everything they
-- did while testing" reset - the correct shape for "start the real run
-- tonight with the same 3 players."
--
-- WHAT THIS PRESERVES (never touched below)
--   - auth.users, public.profiles           (accounts/names/settings)
--   - public.leagues, public.league_members (league + membership)
--   - public.card_catalog, card_mechanics   (the cardpool)
--   - Classic eligibility: duelist_circle_formats, format_card_overrides
--   - public.archetype_registry, archetype_cards
--   - rarity configuration + manual rarity overrides (both already
--     live INSIDE card_catalog.game_rarity / rarity_manually_overridden -
--     there is no separate "overrides" table to reset; the override
--     migrations already applied their UPDATEs to card_catalog once,
--     and card_catalog itself is preserved whole)
--   - public.shop_pack_types                (pack definitions/prices)
--   - public.shop_special_pack_slots        (Special Pack theme config)
--   - public.league_economy_defaults, public.settings (economy config)
--   - public.boss_monster_options           (profile flavor content -
--     NOT a gameplay Boss Route system; see note near the bottom -
--     no Boss Route progression table exists yet anywhere in this
--     schema, so there is nothing of that kind to reset)
--   - public.card_synergy_edges, card_synergy_engine_runs (computed
--     purely from card_catalog, which is unchanged - still valid)
--   - public.audit_log                      (admin action history -
--     an audit trail, not gameplay state; left alone on purpose)
--
-- WHAT THIS REMOVES (every player's test-run state)
--   - Competitions, registrations, rounds, standings, reward grants
--   - Matches (league + practice/BO3), tiebreaks, deck locks
--   - BO3 challenge stakes: DP escrows, wagered-card locks
--   - The full DP ledger, with every profile's DP balance reset to 0
--   - Packs: purchase history, opening/pull history, pity counters,
--     unopened pack vouchers, sold-rotation-card state, active Special
--     Pack rotation instances (config that GENERATES rotations is kept;
--     the next purchase/visit regenerates a fresh rotation from it)
--   - Every player-owned card (card_instances) and its ownership history
--   - Decks and their contents
--   - Trades and trade offers
--   - Drafts and all draft sub-state
--   - Stale computed dashboard coaching insights (they reference
--     collections/decks that no longer exist after this reset)
--
-- SAFETY
--   - Single transaction: fully applies or fully rolls back.
--   - Every DELETE respects existing foreign keys - ordered so a
--     child table is always cleared (or already cascaded) before the
--     parent/referenced table it would otherwise block. Verified
--     against every `on delete` clause in the schema, not assumed.
--   - Does NOT truncate. Every removal is a scoped DELETE (or, for
--     rows that are genuinely config-with-embedded-player-state like
--     shop_rotation_cards, a scoped UPDATE clearing only the
--     player-state columns).
--   - Pre-flight and post-flight `raise notice` counts, plus a
--     structural assertion block, so a human running this via the
--     Supabase SQL Editor sees exactly what was cleared and gets a
--     hard abort (whole transaction rolled back) if a preserved table
--     unexpectedly lost rows or a gameplay table unexpectedly still
--     has rows at the end.
--   - Not league-scoped by id (this app has exactly one league in
--     practice) - if you ever run this against a database with more
--     than one league, add `where league_id = '<id>'` to every
--     DELETE below rather than running it as-is. Left un-scoped
--     because every affected table here is 1:1 with "the league"
--     already, and adding dead `where` clauses that always match
--     every row would be worse camouflage, not more safety.
--
-- FRESH-START DP BALANCE
-- No "starting DP" config exists anywhere in this schema (checked
-- league_economy_defaults and settings) - profiles.duel_points'
-- own column default is 0, so that is the fresh-start value used
-- below. Change v_fresh_start_dp if the humans decide otherwise.
-- =========================================================

begin;

do $$
declare
  v_fresh_start_dp constant integer := 0;

  v_pre_profiles integer;
  v_pre_card_catalog integer;
  v_pre_archetype_registry integer;
  v_pre_league_members integer;
  v_pre_shop_pack_types integer;

  v_pre_competitions integer;
  v_pre_matches integer;
  v_pre_card_instances integer;
  v_pre_decks integer;
  v_pre_drafts integer;
  v_pre_trades integer;
  v_pre_dp_transactions integer;
begin
  -- -------------------------------------------------------
  -- PRE-FLIGHT COUNTS
  -- -------------------------------------------------------
  select count(*) into v_pre_profiles from public.profiles;
  select count(*) into v_pre_card_catalog from public.card_catalog;
  select count(*) into v_pre_archetype_registry from public.archetype_registry;
  select count(*) into v_pre_league_members from public.league_members;
  select count(*) into v_pre_shop_pack_types from public.shop_pack_types;

  select count(*) into v_pre_competitions from public.competitions;
  select count(*) into v_pre_matches from public.matches;
  select count(*) into v_pre_card_instances from public.card_instances;
  select count(*) into v_pre_decks from public.decks;
  select count(*) into v_pre_drafts from public.drafts;
  select count(*) into v_pre_trades from public.trades;
  select count(*) into v_pre_dp_transactions from public.duel_point_transactions;

  raise notice 'RESET PRE-FLIGHT: % profiles / % card_catalog / % archetype_registry / % league_members / % shop_pack_types (all PRESERVED)',
    v_pre_profiles, v_pre_card_catalog, v_pre_archetype_registry, v_pre_league_members, v_pre_shop_pack_types;
  raise notice 'RESET PRE-FLIGHT (about to remove): % competitions / % matches / % card_instances / % decks / % drafts / % trades / % duel_point_transactions',
    v_pre_competitions, v_pre_matches, v_pre_card_instances, v_pre_decks, v_pre_drafts, v_pre_trades, v_pre_dp_transactions;

  -- -------------------------------------------------------
  -- 1. COMPETITIONS (rounds, standings, reward settlements)
  --    competitions cascades: competition_reward_rules,
  --    competition_round_reward_rules, competition_tiebreaks,
  --    competition_deck_locks. Grants tables deleted explicitly first
  --    anyway for clarity even though they'd also cascade.
  -- -------------------------------------------------------
  delete from public.competition_round_reward_grants;
  delete from public.competition_reward_grants;
  delete from public.competition_results;
  delete from public.competition_players;
  delete from public.competitions;

  -- -------------------------------------------------------
  -- 2. MATCHES, BO3 CHALLENGE STAKES, DP LEDGER
  --    Must precede decks (matches.player_one/two_deck_id is
  --    ON DELETE RESTRICT) and precede card_instances (via
  --    match_wager_cards.card_instance_id, ON DELETE RESTRICT).
  -- -------------------------------------------------------
  delete from public.match_wager_cards;
  delete from public.match_dp_escrows;
  delete from public.duel_point_transactions;
  delete from public.matches;

  -- -------------------------------------------------------
  -- 3. PACK ECONOMY RUN STATE
  --    shop_pack_openings cascades shop_pack_pulls. All of these
  --    reference card_instances (ON DELETE RESTRICT in shop_pack_pulls)
  --    so must precede step 7 below.
  -- -------------------------------------------------------
  delete from public.shop_pack_openings;
  delete from public.shop_purchases;
  delete from public.shop_pack_pity;
  delete from public.reward_vouchers;

  -- Un-sell the regular shop rotation's cards (config/slots kept,
  -- exactly like the existing full season-reset's own pattern) -
  -- these are config rows with one piece of embedded player state.
  update public.shop_rotation_cards
  set sold_to_profile_id = null, sold_at = null
  where sold_to_profile_id is not null;

  -- Active Special Pack rotation INSTANCES are run state (time-boxed,
  -- server-generated from shop_special_pack_slots, which is config
  -- and is preserved). Clearing them is safe and self-healing: the
  -- next call to refresh_shop_special_pack_rotation_if_needed()
  -- generates a fresh active rotation per category from the
  -- preserved slot config.
  delete from public.shop_special_pack_rotations;

  -- -------------------------------------------------------
  -- 4. DRAFTS
  --    Every draft_* FK is ON DELETE RESTRICT (not cascade) - must
  --    delete bottom-up explicitly.
  -- -------------------------------------------------------
  delete from public.draft_picks;
  delete from public.draft_offer_cards;
  delete from public.draft_offers;
  delete from public.draft_players;
  delete from public.drafts;

  -- -------------------------------------------------------
  -- 5. TRADES
  --    trade_items cascades from trades, but trade_items.card_instance_id
  --    is ON DELETE RESTRICT, so trades must be cleared before
  --    card_instances (step 7).
  -- -------------------------------------------------------
  delete from public.trades;

  -- -------------------------------------------------------
  -- 6. DECKS
  --    deck_cards cascades from decks, but deck_cards.card_instance_id
  --    is ON DELETE RESTRICT, so decks must be cleared before
  --    card_instances (step 7). Matches (step 2) and competitions'
  --    cascaded competition_deck_locks (step 1) are already gone,
  --    so decks.id is no longer referenced by anything blocking.
  -- -------------------------------------------------------
  delete from public.decks;

  -- -------------------------------------------------------
  -- 7. OWNED CARDS
  --    card_instances carries a deliberate app-level guard
  --    (prevent_card_instance_delete_trigger - "an existing card does
  --    not just disappear from the world"; see
  --    202608190004_card_instances.sql). This reset is the one
  --    deliberate, reviewed exception, exactly like the existing
  --    full season-reset - suspended for exactly this one statement,
  --    inside this same transaction, so a rollback anywhere in this
  --    script also rolls back the trigger suspension.
  -- -------------------------------------------------------
  delete from public.ownership_history;
  alter table public.card_instances disable trigger prevent_card_instance_delete_trigger;
  delete from public.card_instances;
  alter table public.card_instances enable trigger prevent_card_instance_delete_trigger;

  -- -------------------------------------------------------
  -- 8. STALE COMPUTED STATE
  --    Dashboard coaching insights reference collections/decks that
  --    no longer exist after steps 4-7 - clearing them avoids
  --    dangling/nonsensical suggestions until they are recomputed.
  -- -------------------------------------------------------
  delete from public.dashboard_coach_insights;

  -- -------------------------------------------------------
  -- 9. DP BALANCE -> FRESH-START VALUE
  --    profiles.duel_points is the live balance (read by every RPC
  --    via _credit_duel_points). public.wallets is a legacy,
  --    currently-unused table from the very first foundation
  --    migration (nothing in src/ reads from it) - reset for hygiene
  --    in case anything ever reads it, but it is not the source of
  --    truth.
  -- -------------------------------------------------------
  update public.profiles set duel_points = v_fresh_start_dp;
  update public.wallets set duel_points = v_fresh_start_dp, updated_at = now();

  -- -------------------------------------------------------
  -- POST-FLIGHT ASSERTIONS
  -- -------------------------------------------------------
  if (select count(*) from public.profiles) <> v_pre_profiles then
    raise exception 'RESET ABORTED: profiles row count changed (expected preserved) - % before, % after',
      v_pre_profiles, (select count(*) from public.profiles);
  end if;

  if (select count(*) from public.card_catalog) <> v_pre_card_catalog then
    raise exception 'RESET ABORTED: card_catalog row count changed (expected preserved) - % before, % after',
      v_pre_card_catalog, (select count(*) from public.card_catalog);
  end if;

  if (select count(*) from public.archetype_registry) <> v_pre_archetype_registry then
    raise exception 'RESET ABORTED: archetype_registry row count changed (expected preserved) - % before, % after',
      v_pre_archetype_registry, (select count(*) from public.archetype_registry);
  end if;

  if (select count(*) from public.league_members) <> v_pre_league_members then
    raise exception 'RESET ABORTED: league_members row count changed (expected preserved) - % before, % after',
      v_pre_league_members, (select count(*) from public.league_members);
  end if;

  if (select count(*) from public.shop_pack_types) <> v_pre_shop_pack_types then
    raise exception 'RESET ABORTED: shop_pack_types row count changed (expected preserved) - % before, % after',
      v_pre_shop_pack_types, (select count(*) from public.shop_pack_types);
  end if;

  if (select count(*) from public.competitions) <> 0 then
    raise exception 'RESET ABORTED: competitions still has rows after delete.';
  end if;
  if (select count(*) from public.matches) <> 0 then
    raise exception 'RESET ABORTED: matches still has rows after delete.';
  end if;
  if (select count(*) from public.card_instances) <> 0 then
    raise exception 'RESET ABORTED: card_instances still has rows after delete.';
  end if;
  if (select count(*) from public.decks) <> 0 then
    raise exception 'RESET ABORTED: decks still has rows after delete.';
  end if;
  if (select count(*) from public.drafts) <> 0 then
    raise exception 'RESET ABORTED: drafts still has rows after delete.';
  end if;
  if (select count(*) from public.trades) <> 0 then
    raise exception 'RESET ABORTED: trades still has rows after delete.';
  end if;
  if (select count(*) from public.duel_point_transactions) <> 0 then
    raise exception 'RESET ABORTED: duel_point_transactions still has rows after delete.';
  end if;
  if exists (select 1 from public.profiles where duel_points <> v_fresh_start_dp) then
    raise exception 'RESET ABORTED: at least one profile did not reach the fresh-start DP value.';
  end if;

  raise notice 'RESET COMPLETE: all gameplay/test-run state cleared, all configuration preserved, every profile DP balance = %.', v_fresh_start_dp;
end $$;

commit;
