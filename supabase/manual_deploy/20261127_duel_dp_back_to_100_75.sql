-- =========================================================
-- PASTE INTO THE SUPABASE SQL EDITOR (production), 2026-11-27
--
-- Owner: put the DP per duel back - with one round payout per play
-- night (20261127_round_rewards_per_play_night.sql) 50 / 35 is too
-- little for a whole evening.
--   win  50 -> 100
--   loss 35 -> 75
--   draw 35 -> 75
-- Applies to every duel completed from now on; nothing else changes.
-- Safe to run twice. The last row must say checks_passed = true.
-- =========================================================

begin;

update public.league_economy_defaults
set
  match_win_dp = 100,
  match_loss_dp = 75,
  match_draw_dp = 75,
  updated_at = now();

commit;

-- =========================================================
-- VERIFICATION (reads only)
-- =========================================================

select
  match_win_dp as duel_win,
  match_loss_dp as duel_loss,
  match_draw_dp as duel_draw,
  (
    match_win_dp = 100
    and match_loss_dp = 75
    and match_draw_dp = 75
  ) as checks_passed
from public.league_economy_defaults;
