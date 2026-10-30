begin;

-- =========================================================
-- DUELIST CIRCLE 2.0 - HIDE MINI GAMES FOR LAUNCH
--
-- Owner decision 2026-10-30: 2.0 launches WITHOUT mini games.
-- The app hides every entry point behind MINI_GAMES_ENABLED
-- (src/lib/games/flag.ts); this migration makes sure the database
-- neither starts new runs nor pays leaderboard rewards while they
-- are hidden:
--
--   * every mini_game_catalog row goes inactive, so
--     start_game_run() answers 'Unknown game.' (it only accepts
--     `c.active` games, 202610142000). submit_game_run() is
--     service-role only and needs a started run, so no new scores
--     can appear.
--   * settle_mini_game_period() can no longer be called by players
--     (it was called lazily by the /games leaderboards and is the
--     only thing that pays mini game DP / vouchers).
--
-- Nothing is dropped: tables, runs, reward amounts, functions and
-- older migrations stay exactly as they are. The live main app has
-- no mini games, so it is unaffected.
--
-- Idempotent: the update only touches rows that are still active
-- and revoke is a no-op when the grant is already gone.
--
-- To bring mini games back: a new migration that sets
-- `active = true` for the wanted games and runs
--   grant execute on function public.settle_mini_game_period(text, text) to authenticated;
-- plus MINI_GAMES_ENABLED = true in src/lib/games/flag.ts.
-- =========================================================

update public.mini_game_catalog
set active = false
where active;

revoke execute on function public.settle_mini_game_period(text, text) from authenticated;

commit;
