begin;

-- =========================================================
-- DUELIST CIRCLE 2.0 - TOMB BLOCKS (mini game 'tomb_blocks')
--
-- A Block Blast / 1010!-style puzzle, added through the catalog
-- (202610142000): no shared function is edited. start_game_run /
-- submit_game_run / leaderboards / settle_mini_game_period all work
-- for it as soon as the catalog row exists.
--
--   * seeds:     'tomb-daily:<day>:<rand>' / 'tomb-practice:<rand>'
--                (the seed only decides the piece order, so every
--                player gets the same shapes on the Daily)
--   * max score: ceil(ticks * 125) + 100.
--                The run is turn based; each placement must come at
--                least 12 ticks (0.2 s, MIN_MOVE_TICKS in
--                src/lib/games/tomb-engine.ts) after the previous one,
--                and every placement adds at least those 12 ticks to
--                the run length. The most one placement can ever score
--                is 1464 (MAX_POINTS_PER_MOVE: a 3x3 block clearing
--                3 rows + 3 columns at the max x5.5 streak and
--                emptying the floor = 9 + 1155 + 300), and
--                125 * 12 = 1500 >= 1464. Generous on purpose: it is
--                only a backstop, the server replay of every move is
--                the real check. Only the first second of each gap
--                counts toward the length, so long thinking pauses
--                never push a run past the 30-minute tick cap.
--   * rewards:   the defaults (day #1 30 DP, week #1 150 DP +
--                Normal Pack), editable in the admin config.
--
-- The browser plays src/lib/games/tomb-engine.ts and sends its
-- move log; src/app/actions/tomb.ts replays it with the same
-- engine and only submits the REPLAYED score (service role).
-- =========================================================

select public.register_mini_game(
  'tomb_blocks',
  'Tomb Blocks',
  'tomb-',
  125,
  100,
  70,
  'You already played today''s Daily Tomb. A new one opens at midnight.'
);

commit;
