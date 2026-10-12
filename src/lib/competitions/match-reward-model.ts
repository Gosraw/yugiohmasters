// =========================================================
// LEAGUE MATCH REWARD / CORRECTION REFERENCE MODEL
// (2026-08-27, Track 2; updated 2026-10-12 for 2.0)
//
// Same caveat as ./tiebreak-model.ts: this is a hand-transcribed,
// pure-TypeScript port of logic that actually lives in Postgres:
// public._compute_league_match_reward (values from the single-row
// league_economy_defaults table), public._award_match_duel_points_
// internal (supabase/migrations/202610120110_competition_only_match_
// dp.sql) and the delta-based correction block inside
// correct_competition_match_result_v2 (202610120120_round_rewards_
// resettle_on_correction.sql). Nothing here is imported by the app
// or the SQL; it exists so the reward/correction ARITHMETIC can be
// unit-tested without a database. Keep this in sync by hand if the
// SQL changes. The same behaviour is checked against the real
// functions by scripts/sql-tests/01_* and 03_*.
// =========================================================

// Current league_economy_defaults values (match_win_dp /
// match_loss_dp / match_draw_dp).
export const MATCH_WIN_DP = 100;
export const MATCH_LOSS_DP = 75;
export const MATCH_DRAW_DP = 75;

// Mirrors _award_match_duel_points_internal's early returns (2.0):
// practice duels never pay, and a league duel only pays when it is
// part of a competition. Ad-hoc duels give 0 DP (wagers are settled
// separately and are not modelled here).
export function matchEarnsDuelPoints(
  matchType: "league" | "practice",
  competitionId: string | null
): boolean {
  return matchType === "league" && competitionId !== null;
}

// Mirrors _compute_league_match_reward exactly: draw (null winner)
// -> 75, win -> 100, loss -> 75, invalid winner (neither player) ->
// null (the caller must raise on this, same as
// _award_match_duel_points_internal and the correction block do).
export function computeLeagueMatchReward(
  winnerId: string | null,
  playerId: string,
  otherPlayerId: string
): number | null {
  if (winnerId === null) {
    return MATCH_DRAW_DP;
  }

  if (winnerId === playerId) {
    return MATCH_WIN_DP;
  }

  if (winnerId === otherPlayerId) {
    return MATCH_LOSS_DP;
  }

  return null;
}

export type DuelPointTransaction = {
  reason: string;
  amount: number;
};

// Mirrors the correction block's running-total query:
//   where reason = 'match_reward' or reason like 'match_reward_correction%'
export function sumPriorMatchRewardAmounts(
  transactions: DuelPointTransaction[]
): number {
  return transactions
    .filter(
      (transaction) =>
        transaction.reason === "match_reward" ||
        transaction.reason.startsWith(
          "match_reward_correction"
        )
    )
    .reduce(
      (sum, transaction) => sum + transaction.amount,
      0
    );
}

// Mirrors the numbered-reason generation:
//   'match_reward_correction_' || (1 + count of existing correction rows)
// `existingCorrectionCount` is the count of rows already matching
// `reason like 'match_reward_correction%'` for this match/player.
export function nextCorrectionReason(
  existingCorrectionCount: number
): string {
  return `match_reward_correction_${existingCorrectionCount + 1}`;
}

// Mirrors `match_dp_delta := match_dp_new_reward - match_dp_prior_total;`
export function computeCorrectionDelta(
  newReward: number,
  priorTotal: number
): number {
  return newReward - priorTotal;
}

// Mirrors the downward-correction debit cap: the correction block
// calls _debit_duel_points(..., allow_partial => true), which takes
// least(current_balance, -delta). A negative delta means DP must be
// clawed back; the debit is capped at the player's current balance
// so it can never go negative - if the player has already spent the
// DP, the shortfall is recorded as `unrecovered` in the ledger row's
// metadata (not modeled here, since that's a pure logging concern).
export function computeCappedDebit(
  delta: number,
  currentBalance: number
): number {
  if (delta >= 0) {
    throw new Error(
      "computeCappedDebit expects a strictly negative delta (an upward or zero correction never debits)."
    );
  }

  return Math.min(currentBalance, -delta);
}
