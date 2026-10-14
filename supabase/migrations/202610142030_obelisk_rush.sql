begin;

-- =========================================================
-- DUELIST CIRCLE 2.0 - OBELISK RUSH (mini game 'obelisk_rush')
--
-- Timberman-style two-side tapper, added through the catalog
-- (202610142000): no shared function is edited. start_game_run /
-- submit_game_run / leaderboards / settle_mini_game_period all
-- work for it as soon as the catalog row exists.
--
--   * seeds:     'obelisk-daily:<day>:<rand>' / 'obelisk-practice:<rand>'
--   * max score: ceil(ticks * 0.375) + 2. Why:
--       - the engine strikes at most once every 4 ticks
--         (MIN_STRIKE_GAP in src/lib/games/obelisk-engine.ts),
--         i.e. 15 strikes per second. Fast two-thumb tapping tops
--         out around 8-12 per second, so honest play never gets
--         near it;
--       - golden Ra blocks (+5) can only be every 10th block, so
--         the score is at most 1.5 x strikes;
--       - 1.5 x (ticks / 4 + 1) <= ceil(ticks * 0.375) + 2.
--     The server replay (src/app/actions/obelisk.ts) is the real
--     check; this bound is the database's own safety net.
--   * rewards:   the defaults (day #1 30 DP, week #1 150 DP +
--                Normal Pack), editable in the admin config.
--
-- The browser plays src/lib/games/obelisk-engine.ts and sends its
-- strike log; src/app/actions/obelisk.ts replays it with the same
-- engine and only submits the REPLAYED score (service role).
-- Backwards compatible with the live main app: it only adds a
-- catalog row + reward rows for a new game key.
-- =========================================================

select public.register_mini_game(
  'obelisk_rush',
  'Obelisk Rush',
  'obelisk-',
  0.375,
  2,
  50,
  'You already played today''s Daily Rush. A new one opens at midnight.'
);

commit;
