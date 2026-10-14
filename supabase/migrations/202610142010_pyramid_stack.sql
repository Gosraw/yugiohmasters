begin;

-- =========================================================
-- DUELIST CIRCLE 2.0 - PYRAMID STACK (mini game 'pyramid_stack')
--
-- First game added through the catalog (202610142000): no shared
-- function is edited. start_game_run / submit_game_run /
-- leaderboards / settle_mini_game_period all work for it as soon
-- as the catalog row exists.
--
--   * seeds:       'stack-daily:<day>:<rand>' / 'stack-practice:<rand>'
--   * max score:   ceil(ticks * 0.1) + 2. A new block ignores taps
--                  for its first 10 ticks (MIN_LIVE_TICKS in
--                  src/lib/games/stack-engine.ts), so at most one
--                  block per 10 ticks can ever be stacked.
--   * rewards:     the defaults (day #1 30 DP, week #1 150 DP +
--                  Normal Pack), editable in the admin config.
--
-- The browser plays src/lib/games/stack-engine.ts and sends its
-- tap log; src/app/actions/stack.ts replays it with the same engine
-- and only submits the REPLAYED score (service role).
-- =========================================================

select public.register_mini_game(
  'pyramid_stack',
  'Pyramid Stack',
  'stack-',
  0.1,
  2,
  30,
  'You already played today''s Daily Stack. A new one opens at midnight.'
);

commit;
