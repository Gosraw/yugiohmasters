begin;

-- =========================================================
-- DUELIST CIRCLE 2.0 - MERGE OF RA (mini game 'merge_ra')
--
-- A 2048-style strategy game (4x4 board of Millennium tiles that
-- merge up a ladder: Ankh 2 -> Scarab 4 -> ... -> Ra 2048 -> ...),
-- added through the catalog (202610142000): no shared function is
-- edited. start_game_run / submit_game_run / leaderboards /
-- settle_mini_game_period work for it as soon as the catalog row
-- exists.
--
--   * seeds:     'merge-daily:<day>:<rand>' / 'merge-practice:<rand>'
--   * rewards:   the defaults (day #1 30 DP, week #1 150 DP +
--                Normal Pack), editable in the admin config.
--   * max score: ceil(ticks * 28) + 200. Why that is a safe upper
--                bound (constants from src/lib/games/merge-engine.ts):
--
--     The game is turn based, so a run has no real clock: every
--     input (a slide or the one rewind) counts as 4 ticks, i.e. at
--     most 15 moves per second, and ticks = 4 * (inputs + 1).
--     submit_game_run() already refuses runs whose ticks are ahead
--     of real time, so it caps the accepted move rate at about 16
--     per second on average; real swiping tops out around 6-9 per
--     second (each slide animates for 110 ms, one move may queue).
--
--     Score = value of every tile made by a merge + a combo bonus
--     of at most +70% (8 merges in one move). Every move spawns one
--     tile of value <= 4 (two tiles at the start), so the board's
--     total mass is <= 4 * (moves + 2). A merge scores the mass of
--     the two merging tiles, and one unit of mass can be merged at
--     most 16 times (2 -> 2^17), so
--       score <= 1.7 * 16 * 4 * (moves + 2) = 108.8 * (moves + 2)
--             <= 27.2 * ticks + 108.8   (ticks >= 4 * (moves + 1))
--     which ceil(ticks * 28) + 200 covers with room to spare. The
--     tests in merge-engine.test.ts check this analytically and
--     after every input of greedy / random / rewind bots.
--     A strong honest run (2048 tile, ~20k points, ~1000 moves) is
--     far below it; the server replay is the real check, this bound
--     is the database's own safety net.
--
-- The browser plays src/lib/games/merge-engine.ts and sends its
-- input log; src/app/actions/merge.ts replays it with the same
-- engine and only submits the REPLAYED score (service role).
-- Backwards compatible with the live main app: it only adds a
-- catalog row + reward rows for a new game key.
-- =========================================================

select public.register_mini_game(
  'merge_ra',
  'Merge of Ra',
  'merge-',
  28,
  200,
  60,
  'You already played today''s Daily Merge. A new one opens at midnight.'
);

commit;
