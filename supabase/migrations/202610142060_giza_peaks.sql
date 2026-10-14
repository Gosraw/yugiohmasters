begin;

-- =========================================================
-- DUELIST CIRCLE 2.0 - GIZA PEAKS (mini game 'giza_peaks')
--
-- A TriPeaks solitaire game added through the catalog
-- (202610142000): no shared function is edited. start_game_run /
-- submit_game_run / leaderboards / settle_mini_game_period work for
-- it as soon as the catalog row exists.
--
--   * seeds:       'peaks-daily:<day>:<rand>' / 'peaks-practice:<rand>'
--   * rewards:     the defaults (day #1 30 DP, week #1 150 DP +
--                  Normal Pack), editable in the admin config.
--   * max score:   ceil(ticks * 27) + 4200. Why that is a safe upper
--                  bound (constants from src/lib/games/peaks-engine.ts):
--
--     Actions (play a card / draw) are stamped with the run clock
--     (60 ticks per second) and must be at least 7 ticks apart
--     (at most ~8.6 per second); every deal locks input for 60
--     ticks. A cleared round needs all 28 tableau cards played, so
--     it lasts at least 60 + 27 x 7 = 249 ticks and is worth at
--     most 10 x (1 + ... + 28) chain points + 3 x 150 peak tops +
--     1000 clear + 23 x 50 stock left = 6660 <= 27 x 249 = 6723.
--     Only the round still being played can be ahead of that, and
--     it is worth at most 10 x (1 + ... + 27) + 2 x 150 = 4080 <=
--     4200, the flat part. Real play is far below the bound (a
--     round takes a minute or more, i.e. thousands of ticks); the
--     exact score is checked by the server-side replay anyway.
--     The tests in peaks-engine.test.ts check this analytically and
--     after every action of max-speed bots.
--
-- The browser plays src/lib/games/peaks-engine.ts and sends its
-- action log; src/app/actions/peaks.ts replays it with the same
-- engine and only submits the REPLAYED score (service role).
-- =========================================================

select public.register_mini_game(
  'giza_peaks',
  'Giza Peaks',
  'peaks-',
  27,
  4200,
  80,
  'You already played today''s Daily Peaks. A new one opens at midnight.'
);

commit;
