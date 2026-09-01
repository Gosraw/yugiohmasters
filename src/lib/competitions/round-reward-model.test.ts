import { describe, expect, it } from "vitest";

import {
  computeRoundRewardGrantKeys,
  isRoundReadyToSettle,
  roundParticipants,
  roundRewardGrantKey,
  roundRunnersUp,
  roundWinners,
} from "./round-reward-model";

// =========================================================
// See round-reward-model.ts's header: these tests exercise a
// hand-transcribed TypeScript port of the round-settlement logic
// that actually lives in
// 202608311100_phase2_economy_central_config_and_round_rewards.sql,
// because this sandbox cannot run the real Postgres functions or
// execute vitest against this repo's native-binary dependencies.
// They verify the ALGORITHM as designed (who counts as a
// participant/winner/runner-up, and that settling twice never grows
// the grant set); running the equivalent scenarios against a live
// Supabase instance is the recommended follow-up before trusting
// this in production.
// =========================================================

const twoMatchRound = [
  { playerOneId: "alice", playerTwoId: "bob", winnerId: "alice", status: "completed" },
  { playerOneId: "carol", playerTwoId: "dave", winnerId: "dave", status: "completed" },
];

// The real 3-player league shape: exactly one match this round, and
// a third player ("erin") who is the bye - registered in the
// competition, but absent from every match row for this round.
const threePlayerRoundWithBye = [
  { playerOneId: "alice", playerTwoId: "bob", winnerId: "alice", status: "completed" },
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
  it("is every registered competition player, de-duplicated - not derived from matches", () => {
    expect(
      roundParticipants(["alice", "bob", "alice"]).sort()
    ).toEqual(["alice", "bob"]);
  });

  it("includes the bye player for a 3-player round with only one match", () => {
    // The bye player ("erin") has no match row this round at all -
    // roundParticipants takes the competition roster directly, so
    // it must still be included. This is the Phase 2 fix: the prior
    // version derived participants from match rows and silently
    // dropped the bye player.
    expect(
      roundParticipants(["alice", "bob", "erin"]).sort()
    ).toEqual(["alice", "bob", "erin"]);
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

describe("roundRunnersUp", () => {
  it("includes the loser (non-winner participant) of every match", () => {
    expect(roundRunnersUp(twoMatchRound).sort()).toEqual(
      ["bob", "carol"]
    );
  });

  it("excludes matches with no winner recorded", () => {
    const round = [
      { playerOneId: "alice", playerTwoId: "bob", winnerId: null, status: "completed" },
    ];
    expect(roundRunnersUp(round)).toEqual([]);
  });

  it("never includes a bye player - they have no match row to lose", () => {
    // "erin" sits out this round entirely; roundRunnersUp only ever
    // looks at match rows, so it can never wrongly tag the bye
    // player as a runner-up.
    expect(roundRunnersUp(threePlayerRoundWithBye)).toEqual(["bob"]);
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
    expect(
      roundRewardGrantKey("comp-1", 3, "alice", "round_runner_up")
    ).not.toBe(base);
  });
});

describe("computeRoundRewardGrantKeys", () => {
  it("is empty when the round is not ready to settle", () => {
    expect(
      computeRoundRewardGrantKeys("comp-1", 3, ["alice", "bob"], [])
    ).toEqual([]);
  });

  it("produces one participation key per registered player, one round_winner key per match winner, and one round_runner_up key per match loser", () => {
    const keys = computeRoundRewardGrantKeys(
      "comp-1",
      3,
      ["alice", "bob", "carol", "dave"],
      twoMatchRound
    );

    expect(keys).toHaveLength(8);
    expect(new Set(keys).size).toBe(8);
    expect(keys).toContain(
      roundRewardGrantKey("comp-1", 3, "alice", "participation")
    );
    expect(keys).toContain(
      roundRewardGrantKey("comp-1", 3, "alice", "round_winner")
    );
    expect(keys).toContain(
      roundRewardGrantKey("comp-1", 3, "bob", "participation")
    );
    expect(keys).toContain(
      roundRewardGrantKey("comp-1", 3, "bob", "round_runner_up")
    );
    expect(keys).not.toContain(
      roundRewardGrantKey("comp-1", 3, "bob", "round_winner")
    );
  });

  it("includes a participation key for the bye player even though they appear in no match this round", () => {
    const keys = computeRoundRewardGrantKeys(
      "comp-1",
      5,
      ["alice", "bob", "erin"],
      threePlayerRoundWithBye
    );

    expect(keys).toContain(
      roundRewardGrantKey("comp-1", 5, "erin", "participation")
    );
    expect(keys).not.toContain(
      roundRewardGrantKey("comp-1", 5, "erin", "round_winner")
    );
    expect(keys).not.toContain(
      roundRewardGrantKey("comp-1", 5, "erin", "round_runner_up")
    );
  });

  it("calling it twice for the same round produces the identical key set - this IS the idempotency guarantee", () => {
    const first = computeRoundRewardGrantKeys(
      "comp-1",
      3,
      ["alice", "bob", "carol", "dave"],
      twoMatchRound
    );
    const second = computeRoundRewardGrantKeys(
      "comp-1",
      3,
      ["alice", "bob", "carol", "dave"],
      twoMatchRound
    );

    expect(second).toEqual(first);
  });
});
