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
--     NOT the gameplay Boss Route system below; a cosmetic
--     "favorite boss monster" profile flair feature)
--   - Boss Route CONFIG (authored once, same footing as card_catalog):
--     public.boss_routes, boss_route_stages, boss_route_stage_grants,
--     boss_route_achievement_events, boss_route_achievement_requirements
--     (task 138-139 - the 20 routes' evolution chains, permanent
--     support grants and achievement definitions are content, not
--     player state, exactly like archetype_registry above)
--   - public.card_synergy_edges, card_synergy_engine_runs (computed
--     purely from card_catalog, which is unchanged - still valid)
--   - public.audit_log                      (admin action history -
--     an audit trail, not gameplay state; left alone on purpose)
--   - public.achievements                   (P1C Pay-to-Win seed
--     content - the 7 achievement definitions - same footing as
--     card_catalog/boss_monster_options; the CLAIMS against them are
--     player state and ARE removed below)
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
--   - Boss Route RUNTIME (task 139-140 - a player's chosen path,
--     stage progress and confirmed achievement events): every
--     player_boss_paths row and its cascaded player_boss_stage_unlocks
--     / player_boss_achievement_events rows. Boss Route CONFIG (the
--     20 routes themselves) is preserved - see above.
--   - Legendary Luck pack-pity state (task 136): every
--     public.player_pack_luck.luck_points reset to 0, exactly like
--     duel_points below - this is per-profile pity progress accrued
--     from test-run pack purchases, not configuration.
--   - Wishlist entries (P0E): public.card_wishlist_items - test-run
--     "I want this card" flags, not something to carry into the real
--     season.
--   - Pay-to-Win achievement claims (P1C): every
--     public.achievement_claims row (pending, approved and rejected
--     alike). The achievements themselves (the 7 seeded definitions)
--     are config and are preserved - see above. Leftover test claims
--     matter here for more than tidiness: request_achievement_claim()
--     blocks a second APPROVED claim for the same
--     achievement+player+ISO-week, so an approved test claim made
--     during THIS calendar week would otherwise silently block that
--     same player's first real claim of the same achievement this
--     week.
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
  v_pre_player_boss_paths integer;
  v_pre_wishlist integer;
  v_pre_achievement_claims integer;
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
  select count(*) into v_pre_player_boss_paths from public.player_boss_paths;
  select count(*) into v_pre_wishlist from public.card_wishlist_items;
  select count(*) into v_pre_achievement_claims from public.achievement_claims;

  raise notice 'RESET PRE-FLIGHT: % profiles / % card_catalog / % archetype_registry / % league_members / % shop_pack_types (all PRESERVED)',
    v_pre_profiles, v_pre_card_catalog, v_pre_archetype_registry, v_pre_league_members, v_pre_shop_pack_types;
  raise notice 'RESET PRE-FLIGHT (about to remove): % competitions / % matches / % card_instances / % decks / % drafts / % trades / % duel_point_transactions / % player_boss_paths / % wishlist_items / % achievement_claims',
    v_pre_competitions, v_pre_matches, v_pre_card_instances, v_pre_decks, v_pre_drafts, v_pre_trades, v_pre_dp_transactions, v_pre_player_boss_paths, v_pre_wishlist, v_pre_achievement_claims;

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
  -- 7A. BOSS ROUTE RUNTIME (task 139-140)
  --     Deleted explicitly bottom-up for clarity even though
  --     player_boss_stage_unlocks and player_boss_achievement_events
  --     both cascade from player_boss_paths (and
  --     player_boss_achievement_events also cascades from matches,
  --     already cleared in step 2). Boss Route CONFIG - boss_routes,
  --     boss_route_stages, boss_route_stage_grants,
  --     boss_route_achievement_events/_requirements - is content, not
  --     player state, and is preserved untouched (player_boss_paths
  --     only references it with ON DELETE RESTRICT, so deleting rows
  --     here can never touch it).
  -- -------------------------------------------------------
  delete from public.player_boss_achievement_events;
  delete from public.player_boss_stage_unlocks;
  delete from public.player_boss_paths;

  -- -------------------------------------------------------
  -- 8. STALE COMPUTED STATE
  --    Dashboard coaching insights reference collections/decks that
  --    no longer exist after steps 4-7 - clearing them avoids
  --    dangling/nonsensical suggestions until they are recomputed.
  -- -------------------------------------------------------
  delete from public.dashboard_coach_insights;

  -- -------------------------------------------------------
  -- 9. DP BALANCE + LEGENDARY LUCK PITY -> FRESH-START VALUE
  --    profiles.duel_points is the live balance (read by every RPC
  --    via _credit_duel_points). public.wallets is a legacy,
  --    currently-unused table from the very first foundation
  --    migration (nothing in src/ reads from it) - reset for hygiene
  --    in case anything ever reads it, but it is not the source of
  --    truth. player_pack_luck.luck_points (task 136) is per-profile
  --    pack-pity progress, not configuration - reset to 0 alongside
  --    DP so nobody starts the real season already primed for a
  --    Legendary pull from test-run pack purchases.
  -- -------------------------------------------------------
  update public.profiles set duel_points = v_fresh_start_dp;
  update public.wallets set duel_points = v_fresh_start_dp, updated_at = now();
  update public.player_pack_luck set luck_points = 0, updated_at = now();

  -- -------------------------------------------------------
  -- 10. WISHLIST (P0E)
  --     public.card_wishlist_items keys on (profile_id,
  --     card_catalog_id) - references card_catalog (preserved) and
  --     profiles (preserved), never card_instances, so it has no
  --     ordering dependency on steps 1-7 above. Cleared purely
  --     because it is test-run player state, not configuration.
  -- -------------------------------------------------------
  delete from public.card_wishlist_items;

  -- -------------------------------------------------------
  -- 11. PAY-TO-WIN ACHIEVEMENT CLAIMS (P1C)
  --     public.achievement_claims references achievements (seed
  --     content, preserved - see header), profiles and leagues
  --     (both preserved) - never card_instances or matches, so it
  --     too has no ordering dependency on steps 1-7. See the
  --     "WHAT THIS REMOVES" note above for why leftover approved
  --     test claims are more than cosmetic clutter here.
  -- -------------------------------------------------------
  delete from public.achievement_claims;

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
  if (select count(*) from public.player_boss_paths) <> 0 then
    raise exception 'RESET ABORTED: player_boss_paths still has rows after delete.';
  end if;
  if (select count(*) from public.player_boss_stage_unlocks) <> 0 then
    raise exception 'RESET ABORTED: player_boss_stage_unlocks still has rows after delete.';
  end if;
  if (select count(*) from public.player_boss_achievement_events) <> 0 then
    raise exception 'RESET ABORTED: player_boss_achievement_events still has rows after delete.';
  end if;
  if (select count(*) from public.boss_routes) <> 20 then
    raise exception 'RESET ABORTED: boss_routes should still have all 20 CONFIG rows (expected preserved) - found %.',
      (select count(*) from public.boss_routes);
  end if;
  if exists (select 1 from public.profiles where duel_points <> v_fresh_start_dp) then
    raise exception 'RESET ABORTED: at least one profile did not reach the fresh-start DP value.';
  end if;
  if exists (select 1 from public.player_pack_luck where luck_points <> 0) then
    raise exception 'RESET ABORTED: at least one player_pack_luck row did not reach 0.';
  end if;
  if (select count(*) from public.card_wishlist_items) <> 0 then
    raise exception 'RESET ABORTED: card_wishlist_items still has rows after delete.';
  end if;
  if (select count(*) from public.achievement_claims) <> 0 then
    raise exception 'RESET ABORTED: achievement_claims still has rows after delete.';
  end if;
  if (select count(*) from public.achievements) <> 7 then
    raise exception 'RESET ABORTED: achievements should still have all 7 seeded CONFIG rows (expected preserved) - found %.',
      (select count(*) from public.achievements);
  end if;

  raise notice 'RESET COMPLETE: all gameplay/test-run state cleared (including Boss Route progress, Legendary Luck pity, wishlist entries and Pay-to-Win claims), all configuration preserved (including all 20 Boss Routes and all 7 Pay-to-Win achievements), every profile DP balance = %.', v_fresh_start_dp;
end $$;

commit;
