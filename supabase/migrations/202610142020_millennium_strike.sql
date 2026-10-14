begin;

-- =========================================================
-- DUELIST CIRCLE 2.0 - MILLENNIUM STRIKE (mini game 'millennium_strike')
--
-- A Knife Hit-style game added through the catalog (202610142000):
-- no shared function is edited. start_game_run / submit_game_run /
-- leaderboards / settle_mini_game_period work for it as soon as
-- the catalog row exists.
--
--   * seeds:       'strike-daily:<day>:<rand>' / 'strike-practice:<rand>'
--   * rewards:     the defaults (day #1 30 DP, week #1 150 DP +
--                  Normal Pack), editable in the admin config.
--   * max score:   ceil(ticks * 0.4) + 40. Why that is a safe upper
--                  bound (constants from src/lib/games/strike-engine.ts):
--
--     score = 10 per stage cleared + 1 per card stuck + 3 per Eye
--             orb + 10 per boss beaten.
--     A stage needs N cards, 6 <= N <= 11, has at most 3 orbs, and
--     one card can take at most one orb. A throw is only accepted
--     every 8 ticks (6 ticks of flight + 2 reload), so N cards take
--     at least 8N - 2 ticks, and a cleared wheel is followed by at
--     least 50 ticks before the next one appears. So one stage is
--     worth at most N + 9 + 10 + 10 = N + 29 points and lasts at
--     least 8N + 48 ticks: 0.4 * (8N + 48) = 3.2N + 19.2 >= N + 29
--     for every N >= 6, so every finished stage pays for itself
--     inside 0.4 points per tick. Only the LAST stage of a run (its
--     break not over yet, or not cleared) can be ahead of that, and
--     a whole stage is worth at most 11 + 29 = 40: the flat part.
--     The tests in strike-engine.test.ts check this analytically and
--     with spam / perfect / orb-greedy bots at every tick.
--
-- The browser plays src/lib/games/strike-engine.ts and sends its
-- throw log; src/app/actions/strike.ts replays it with the same
-- engine and only submits the REPLAYED score (service role).
-- =========================================================

select public.register_mini_game(
  'millennium_strike',
  'Millennium Strike',
  'strike-',
  0.4,
  40,
  40,
  'You already played today''s Daily Strike. A new one opens at midnight.'
);

commit;
