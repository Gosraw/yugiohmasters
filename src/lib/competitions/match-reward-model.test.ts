import { describe, expect, it } from "vitest";

import {
  computeCappedDebit,
  computeCorrectionDelta,
  computeLeagueMatchReward,
  nextCorrectionReason,
  sumPriorMatchRewardAmounts,
} from "./match-reward-model";

// =========================================================
// See match-reward-model.ts's header: these tests exercise a
// hand-transcribed TypeScript port of the reward/correction
// arithmetic that actually lives in
// 202608270930_competition_reward_and_match_dp_fixes.sql, because
// this sandbox cannot run the real Postgres functions or execute
// vitest against this repo's native-binary dependencies. They verify
// the ALGORITHM as designed; running the equivalent scenarios
// against a live Supabase instance is the recommended follow-up.
//
// NOT covered here (verified by reading the SQL text directly
// instead): the idempotency guard in _award_match_duel_points_
// internal (`not exists (... reason = 'match_reward')`), the
// participant-check-free nature of that internal helper vs. the
// public wrapper's participant check, and the unique index
// (duel_point_transactions_match_reason_unique) that makes a
// repeated literal correction reason fail - which is exactly why the
// numbered-reason scheme below exists in the first place.
// =========================================================

describe("computeLeagueMatchReward", () => {
  it("pays 100 to the winner", () => {
    expect(
      computeLeagueMatchReward("alice", "alice", "bob")
    ).toBe(100);
  });

  it("pays 50 to the loser", () => {
    expect(
      computeLeagueMatchReward("alice", "bob", "alice")
    ).toBe(50);
  });

  it("pays 75 to both players on a draw (null winner)", () => {
    expect(
      computeLeagueMatchReward(null, "alice", "bob")
    ).toBe(75);
    expect(
      computeLeagueMatchReward(null, "bob", "alice")
    ).toBe(75);
  });

  it("returns null for an invalid winner (neither participant)", () => {
    expect(
      computeLeagueMatchReward("carol", "alice", "bob")
    ).toBeNull();
  });
});

describe("sumPriorMatchRewardAmounts", () => {
  it("sums the original reward and every numbered correction", () => {
    const total = sumPriorMatchRewardAmounts([
      { reason: "match_reward", amount: 100 },
      { reason: "match_reward_correction_1", amount: -75 },
      { reason: "match_reward_correction_2", amount: 50 },
    ]);

    expect(total).toBe(75);
  });

  it("ignores unrelated transaction reasons", () => {
    const total = sumPriorMatchRewardAmounts([
      { reason: "match_reward", amount: 100 },
      { reason: "shop_purchase", amount: -30 },
      { reason: "competition_reward", amount: 300 },
    ]);

    expect(total).toBe(100);
  });

  it("returns 0 for a match that was never paid at all", () => {
    expect(sumPriorMatchRewardAmounts([])).toBe(0);
  });
});

describe("nextCorrectionReason", () => {
  it("numbers the first correction _1", () => {
    expect(nextCorrectionReason(0)).toBe(
      "match_reward_correction_1"
    );
  });

  it("numbers a second correction of the same match _2", () => {
    expect(nextCorrectionReason(1)).toBe(
      "match_reward_correction_2"
    );
  });
});

describe("correction delta + capped debit (end-to-end scenarios)", () => {
  it("is a no-op (delta 0) when correcting a match to the same result twice", () => {
    const priorTotal = sumPriorMatchRewardAmounts([
      { reason: "match_reward", amount: 100 },
    ]);

    expect(
      computeCorrectionDelta(100, priorTotal)
    ).toBe(0);
  });

  it("credits the difference when a loss is corrected to a win", () => {
    const priorTotal = sumPriorMatchRewardAmounts([
      { reason: "match_reward", amount: 50 },
    ]);

    expect(
      computeCorrectionDelta(100, priorTotal)
    ).toBe(50);
  });

  it("debits the difference when a win is corrected to a loss, capped at the current balance", () => {
    const priorTotal = sumPriorMatchRewardAmounts([
      { reason: "match_reward", amount: 100 },
    ]);

    const delta = computeCorrectionDelta(
      50,
      priorTotal
    );

    expect(delta).toBe(-50);
    expect(computeCappedDebit(delta, 1000)).toBe(
      50
    );
    // Player already spent most of it - debit is capped at what's
    // left, never driving the balance negative.
    expect(computeCappedDebit(delta, 30)).toBe(
      30
    );
  });

  it("correctly re-numbers and re-sums across a second correction of the same match", () => {
    // Original: win (100). First correction: to a loss (50) -> -50.
    const afterFirstCorrection = [
      { reason: "match_reward", amount: 100 },
      {
        reason: nextCorrectionReason(0),
        amount: -50,
      },
    ];

    // Second correction: back to a win (100). Prior total is now 50,
    // so the delta credits the remaining 50, and the new reason is
    // numbered _2 (one existing correction row found).
    const priorTotal = sumPriorMatchRewardAmounts(
      afterFirstCorrection
    );

    expect(priorTotal).toBe(50);
    expect(
      computeCorrectionDelta(100, priorTotal)
    ).toBe(50);
    expect(nextCorrectionReason(1)).toBe(
      "match_reward_correction_2"
    );
  });

  it("computeCappedDebit rejects a non-negative delta (misuse guard)", () => {
    expect(() =>
      computeCappedDebit(0, 100)
    ).toThrow();
    expect(() =>
      computeCappedDebit(10, 100)
    ).toThrow();
  });
});
