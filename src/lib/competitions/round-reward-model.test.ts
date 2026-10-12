import { describe, expect, it } from "vitest";

import {
  computeRoundReversal,
  cycleBounds,
  cycleSize,
  DEFAULT_ROUND_REWARD_RULES,
  diffRoundGrants,
  expectedMatchesPerCycle,
  expectedRoundGrants,
  isCycleReadyToSettle,
  logicalRoundFor,
  rankCycle,
  roundDuelPointsFor,
  roundRewardGrantKey,
  type CycleMatch,
} from "./round-reward-model";

// =========================================================
// See round-reward-model.ts's header: these tests exercise a
// hand-transcribed TypeScript port of _settle_round_cycle /
// _round_cycle_expected_grants (202610120120). The same scenarios
// run against the real functions in
// scripts/sql-tests/02_round_settlement_and_rules.sql and
// 03_correction_resettles_round.sql.
// =========================================================

const roster = ["bossg", "fardin", "samo"];

function win(
  winner: string,
  loser: string,
  status = "completed"
): CycleMatch {
  return {
    playerOneId: winner,
    playerTwoId: loser,
    winnerId: status === "completed" ? winner : null,
    playerOneDuelWins: status === "completed" ? 1 : 0,
    playerTwoDuelWins: 0,
    status,
  };
}

// fardin 2 wins, bossg 1, samo 0.
const cycle = [
  win("fardin", "bossg"),
  win("bossg", "samo"),
  win("fardin", "samo"),
];

describe("cycle shape", () => {
  it("3 players: 3 schedule rounds and 3 matches per round", () => {
    expect(cycleSize(3)).toBe(3);
    expect(expectedMatchesPerCycle(3)).toBe(3);
  });

  it("4 players: 3 schedule rounds and 6 matches per round", () => {
    expect(cycleSize(4)).toBe(3);
    expect(expectedMatchesPerCycle(4)).toBe(6);
  });

  it("maps schedule rounds onto full-cycle rounds", () => {
    expect([1, 2, 3, 4, 6, 7].map((r) => logicalRoundFor(r, 3))).toEqual(
      [1, 1, 1, 2, 2, 3]
    );
    expect(cycleBounds(2, 3)).toEqual({ start: 4, end: 6 });
  });
});

describe("isCycleReadyToSettle", () => {
  it("is false while a match of the cycle is missing", () => {
    expect(isCycleReadyToSettle(cycle.slice(0, 2), 3)).toBe(false);
  });

  it("is false while a match of the cycle is not completed", () => {
    expect(
      isCycleReadyToSettle(
        [cycle[0], cycle[1], win("fardin", "samo", "pending")],
        3
      )
    ).toBe(false);
  });

  it("is true once every pair has played", () => {
    expect(isCycleReadyToSettle(cycle, 3)).toBe(true);
  });
});

describe("rankCycle", () => {
  it("ranks by wins across the whole cycle", () => {
    expect(
      rankCycle(roster, cycle).map((s) => [s.profileId, s.placement, s.points])
    ).toEqual([
      ["fardin", 1, 6],
      ["bossg", 2, 3],
      ["samo", 3, 0],
    ]);
  });

  it("breaks a points tie on duel difference", () => {
    const bestOfThree: CycleMatch[] = [
      { playerOneId: "a", playerTwoId: "b", winnerId: "a", playerOneDuelWins: 2, playerTwoDuelWins: 0, status: "completed" },
      { playerOneId: "b", playerTwoId: "c", winnerId: "b", playerOneDuelWins: 2, playerTwoDuelWins: 1, status: "completed" },
      { playerOneId: "c", playerTwoId: "a", winnerId: "c", playerOneDuelWins: 2, playerTwoDuelWins: 1, status: "completed" },
    ];

    // a: +2 -1 = +1, b: -2 +1 = -1, c: -1 +1 = 0
    expect(
      rankCycle(["a", "b", "c"], bestOfThree).map((s) => s.profileId)
    ).toEqual(["a", "c", "b"]);
  });

  it("falls back to profile id when everything is equal (1-1-1 single duels)", () => {
    const circle = [win("a", "b"), win("b", "c"), win("c", "a")];

    expect(
      rankCycle(["c", "b", "a"], circle).map((s) => s.profileId)
    ).toEqual(["a", "b", "c"]);
  });
});

describe("expectedRoundGrants", () => {
  it("gives everyone participation plus 1st/2nd/3rd once", () => {
    const grants = expectedRoundGrants(roster, cycle);

    expect(grants).toHaveLength(6);
    expect(
      grants
        .filter((g) => g.role !== "participation")
        .map((g) => [g.profileId, g.role])
    ).toEqual([
      ["fardin", "round_winner"],
      ["bossg", "round_runner_up"],
      ["samo", "round_third"],
    ]);
  });

  it("pays the current defaults: 300+400 / 300+300 / 300+200 DP", () => {
    const grants = expectedRoundGrants(roster, cycle);

    expect(roundDuelPointsFor("fardin", grants)).toBe(700);
    expect(roundDuelPointsFor("bossg", grants)).toBe(600);
    expect(roundDuelPointsFor("samo", grants)).toBe(500);
    expect(DEFAULT_ROUND_REWARD_RULES.participation.voucherType).toBe("premium_pack");
    expect(DEFAULT_ROUND_REWARD_RULES.round_winner.voucherType).toBe("normal_pack");
  });

  it("only places 1-3 earn a placement grant in a bigger league", () => {
    const four = ["a", "b", "c", "d"];
    const matches = [
      win("a", "b"), win("a", "c"), win("a", "d"),
      win("b", "c"), win("b", "d"), win("c", "d"),
    ];

    const grants = expectedRoundGrants(four, matches);

    expect(grants.filter((g) => g.role === "participation")).toHaveLength(4);
    expect(grants.some((g) => g.profileId === "d" && g.role !== "participation")).toBe(false);
  });
});

describe("diffRoundGrants (settle + re-settle after a correction)", () => {
  it("first settlement grants everything and reverses nothing", () => {
    const diff = diffRoundGrants([], expectedRoundGrants(roster, cycle));

    expect(diff.toGrant).toHaveLength(6);
    expect(diff.toReverse).toEqual([]);
  });

  it("settling again is a no-op", () => {
    const expected = expectedRoundGrants(roster, cycle);
    const active = expected.map(({ profileId, role }) => ({ profileId, role }));

    expect(diffRoundGrants(active, expected)).toEqual({
      toGrant: [],
      toReverse: [],
    });
  });

  it("a correction swaps exactly the moved placement grants", () => {
    const before = expectedRoundGrants(roster, cycle);
    const active = before.map(({ profileId, role }) => ({ profileId, role }));

    // Admin: bossg actually beat fardin.
    const corrected = [win("bossg", "fardin"), cycle[1], cycle[2]];
    const diff = diffRoundGrants(active, expectedRoundGrants(roster, corrected));

    expect(diff.toGrant.map((g) => [g.profileId, g.role]).sort()).toEqual([
      ["bossg", "round_winner"],
      ["fardin", "round_runner_up"],
    ]);
    expect(diff.toReverse.map((g) => [g.profileId, g.role]).sort()).toEqual([
      ["bossg", "round_runner_up"],
      ["fardin", "round_winner"],
    ]);
  });
});

describe("computeRoundReversal", () => {
  it("recovers everything when the balance allows", () => {
    expect(computeRoundReversal(400, 1000)).toEqual({ recovered: 400, unrecovered: 0 });
  });

  it("never takes more than the balance and records the shortfall", () => {
    // Same numbers as the SQL test: 325 left, 400 to take back.
    expect(computeRoundReversal(400, 325)).toEqual({ recovered: 325, unrecovered: 75 });
    expect(computeRoundReversal(400, 0)).toEqual({ recovered: 0, unrecovered: 400 });
  });
});

describe("roundRewardGrantKey", () => {
  it("is stable and distinct per (competition, round, profile, role)", () => {
    const base = roundRewardGrantKey("comp-1", 3, "alice", "participation");

    expect(roundRewardGrantKey("comp-1", 3, "alice", "participation")).toBe(base);
    expect(roundRewardGrantKey("comp-2", 3, "alice", "participation")).not.toBe(base);
    expect(roundRewardGrantKey("comp-1", 4, "alice", "participation")).not.toBe(base);
    expect(roundRewardGrantKey("comp-1", 3, "bob", "participation")).not.toBe(base);
    expect(roundRewardGrantKey("comp-1", 3, "alice", "round_third")).not.toBe(base);
  });
});
