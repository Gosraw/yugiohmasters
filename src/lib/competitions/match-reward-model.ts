// =========================================================
// LEAGUE MATCH REWARD / CORRECTION REFERENCE MODEL
// (2026-08-27, Track 2)
//
// Same caveat as ./tiebreak-model.ts: this is a hand-transcribed,
// pure-TypeScript port of logic that actually lives in Postgres -
// public._compute_league_match_reward and the delta-based correction
// block inside correct_competition_match_result_v2, both in
// supabase/migrations/202608270930_competition_reward_and_match_dp_
// fixes.sql. Nothing here is imported by the app or the SQL; it
// exists purely so the reward/correction ARITHMETIC can be unit-
// tested in a sandbox that cannot run Postgres or execute vitest
// against this repo's native-binary dependencies (see that file's
// own notes). Keep this in sync by hand if the SQL changes.
// =========================================================

// Mirrors _compute_league_match_reward exactly: draw (null winner)
// -> 50, win -> 100, loss -> 25, invalid winner (neither player) ->
// null (the caller must raise on this, same as
// _award_match_duel_points_internal and the correction block do).
export function computeLeagueMatchReward(
  winnerId: string | null,
  playerId: string,
  otherPlayerId: string
): number | null {
  if (winnerId === null) {
    return 50;
  }

  if (winnerId === playerId) {
    return 100;
  }

  if (winnerId === otherPlayerId) {
    return 25;
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

// Mirrors the downward-correction debit cap:
//   match_dp_actual_debit := least(match_dp_current_balance, -match_dp_delta);
// A negative delta means DP must be clawed back; the debit is capped
// at the player's current balance so it can never go negative - if
// the player has already spent the DP, the shortfall is recorded as
// `unrecovered` in the transaction's metadata (not modeled here,
// since that's a pure logging concern, not arithmetic).
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
