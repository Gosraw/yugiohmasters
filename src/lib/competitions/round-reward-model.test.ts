import { describe, expect, it } from "vitest";

import {
  computeRoundRewardGrantKeys,
  isRoundReadyToSettle,
  roundParticipants,
  roundRewardGrantKey,
  roundWinners,
} from "./round-reward-model";

// =========================================================
// See round-reward-model.ts's header: these tests exercise a
// hand-transcribed TypeScript port of the round-settlement logic
// that actually lives in
// 202608301500_round_reward_settlement_and_auto_finalize.sql,
// because this sandbox cannot run the real Postgres functions or
// execute vitest against this repo's native-binary dependencies.
// They verify the ALGORITHM as designed (who counts as a
// participant/winner, and that settling twice never grows the grant
// set); running the equivalent scenarios against a live Supabase
// instance is the recommended follow-up before trusting this in
// production.
// =========================================================

const twoMatchRound = [
  { playerOneId: "alice", playerTwoId: "bob", winnerId: "alice", status: "completed" },
  { playerOneId: "carol", playerTwoId: "dave", winnerId: "dave", status: "completed" },
];

describe("isRoundReadyToSettle", () => {
  it("is false for an empty round", () => {
    expect(isRoundReadyToSettle([])).toBe(false);
  });

  it("is false while any match is not completed", () => {
    const round = [
      { playerOneId: "alice", playerTwoId: "bob", winnerId: "alice", status: "completed" },
      { playerOneId: "carol", playerTwoId: "dave", winnerId: null, status: "pending" },
    ];
    expect(isRoundReadyToSettle(round)).toBe(false);
  });

  it("is true once every match in the round is completed", () => {
    expect(isRoundReadyToSettle(twoMatchRound)).toBe(true);
  });
});

describe("roundParticipants", () => {
  it("includes both players of every match, de-duplicated", () => {
    expect(roundParticipants(twoMatchRound).sort()).toEqual(
      ["alice", "bob", "carol", "dave"]
    );
  });
});

describe("roundWinners", () => {
  it("includes the winner of every match - more than one player can win a round", () => {
    expect(roundWinners(twoMatchRound).sort()).toEqual(
      ["alice", "dave"]
    );
  });

  it("excludes matches with no winner recorded", () => {
    const round = [
      { playerOneId: "alice", playerTwoId: "bob", winnerId: null, status: "completed" },
    ];
    expect(roundWinners(round)).toEqual([]);
  });
});

describe("roundRewardGrantKey", () => {
  it("is stable for the same (competition, round, profile, role)", () => {
    const first = roundRewardGrantKey("comp-1", 3, "alice", "participation");
    const second = roundRewardGrantKey("comp-1", 3, "alice", "participation");
    expect(first).toBe(second);
  });

  it("differs when any part of the key differs", () => {
    const base = roundRewardGrantKey("comp-1", 3, "alice", "participation");
    expect(
      roundRewardGrantKey("comp-2", 3, "alice", "participation")
    ).not.toBe(base);
    expect(
      roundRewardGrantKey("comp-1", 4, "alice", "participation")
    ).not.toBe(base);
    expect(
      roundRewardGrantKey("comp-1", 3, "bob", "participation")
    ).not.toBe(base);
    expect(
      roundRewardGrantKey("comp-1", 3, "alice", "round_winner")
    ).not.toBe(base);
  });
});

describe("computeRoundRewardGrantKeys", () => {
  it("is empty when the round is not ready to settle", () => {
    expect(
      computeRoundRewardGrantKeys("comp-1", 3, [])
    ).toEqual([]);
  });

  it("produces one participation key per player and one round_winner key per match winner", () => {
    const keys = computeRoundRewardGrantKeys(
      "comp-1",
      3,
      twoMatchRound
    );

    expect(keys).toHaveLength(6);
    expect(new Set(keys).size).toBe(6);
    expect(keys).toContain(
      roundRewardGrantKey("comp-1", 3, "alice", "participation")
    );
    expect(keys).toContain(
      roundRewardGrantKey("comp-1", 3, "alice", "round_winner")
    );
    expect(keys).toContain(
      roundRewardGrantKey("comp-1", 3, "bob", "participation")
    );
    expect(keys).not.toContain(
      roundRewardGrantKey("comp-1", 3, "bob", "round_winner")
    );
  });

  it("calling it twice for the same round produces the identical key set - this IS the idempotency guarantee", () => {
    const first = computeRoundRewardGrantKeys(
      "comp-1",
      3,
      twoMatchRound
    );
    const second = computeRoundRewardGrantKeys(
      "comp-1",
      3,
      twoMatchRound
    );

    expect(second).toEqual(first);
  });
});
