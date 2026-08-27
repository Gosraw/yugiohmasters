import { describe, expect, it } from "vitest";

import {
  applyTwoPlayerResult,
  detectFullTies,
  INITIAL_TIEBREAK_STATE,
  nextThreePlayerMatchup,
  simulateThreePlayerTiebreak,
  twoPlayerMatchup,
} from "./tiebreak-model";

// =========================================================
// These tests exercise the hand-transcribed TypeScript reference
// model in tiebreak-model.ts, NOT the deployed Postgres functions in
// 202608271000_competition_tiebreaks.sql directly - see that file's
// header for why (this sandbox cannot run a live Postgres instance
// or execute vitest against native-binary dependencies). They verify
// the ALGORITHM is correct as designed; running the equivalent
// scenarios against a real Supabase instance is the recommended
// follow-up to verify the SQL matches this model exactly.
//
// NOT covered here (SQL-only, no TS equivalent exists to test):
// the draw-rejection score validation (submit_competition_tiebreak_
// match_result reuses submit_competition_match_result_v2's existing
// single_duel/best_of_3 score-shape check, which has no draw-shaped
// input) and finalize_competition_v2's refusal to finalize while any
// tiebreak is unresolved. Both were verified by reading the SQL text
// directly (see this migration's header comment and finalize_
// competition_v2's body) rather than by an executable test.
// =========================================================

describe("detectFullTies", () => {
  it("detects a 3-way full tie", () => {
    const groups = detectFullTies([
      { profileId: "p3", points: 9, headToHeadScore: 1, duelDifferential: 2, duelWins: 5 },
      { profileId: "p1", points: 9, headToHeadScore: 1, duelDifferential: 2, duelWins: 5 },
      { profileId: "p2", points: 9, headToHeadScore: 1, duelDifferential: 2, duelWins: 5 },
      { profileId: "p4", points: 6, headToHeadScore: 0, duelDifferential: -1, duelWins: 3 },
    ]);

    expect(groups).toEqual([["p1", "p2", "p3"]]);
  });

  it("detects a 2-way full tie", () => {
    const groups = detectFullTies([
      { profileId: "b", points: 6, headToHeadScore: 0, duelDifferential: 1, duelWins: 4 },
      { profileId: "a", points: 6, headToHeadScore: 0, duelDifferential: 1, duelWins: 4 },
    ]);

    expect(groups).toEqual([["a", "b"]]);
  });

  it("ignores a solo standing and a tie of 4+ (out of scope)", () => {
    const groups = detectFullTies([
      { profileId: "solo", points: 9, headToHeadScore: 2, duelDifferential: 3, duelWins: 6 },
      { profileId: "w", points: 3, headToHeadScore: 0, duelDifferential: 0, duelWins: 2 },
      { profileId: "x", points: 3, headToHeadScore: 0, duelDifferential: 0, duelWins: 2 },
      { profileId: "y", points: 3, headToHeadScore: 0, duelDifferential: 0, duelWins: 2 },
      { profileId: "z", points: 3, headToHeadScore: 0, duelDifferential: 0, duelWins: 2 },
    ]);

    expect(groups).toEqual([]);
  });

  it("reports multiple independent tie groups in the same competition", () => {
    const groups = detectFullTies([
      { profileId: "a", points: 9, headToHeadScore: 1, duelDifferential: 2, duelWins: 5 },
      { profileId: "b", points: 9, headToHeadScore: 1, duelDifferential: 2, duelWins: 5 },
      { profileId: "c", points: 3, headToHeadScore: 0, duelDifferential: -1, duelWins: 2 },
      { profileId: "d", points: 3, headToHeadScore: 0, duelDifferential: -1, duelWins: 2 },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups).toContainEqual(["a", "b"]);
    expect(groups).toContainEqual(["c", "d"]);
  });
});

describe("2-player tiebreak", () => {
  it("always pairs the two tied players", () => {
    expect(twoPlayerMatchup(["alice", "bob"])).toEqual([
      "alice",
      "bob",
    ]);
  });

  it("resolves immediately with the winner ranked above the loser", () => {
    const state = applyTwoPlayerResult("bob", "alice");

    expect(state).toEqual({
      status: "resolved",
      streakHolderId: null,
      streakCount: 0,
      resolvedOrder: ["bob", "alice"],
    });
  });
});

describe("3-player sudden-death tiebreak", () => {
  const TIED = ["p1", "p2", "p3"];

  it("the first match is always between the first two sorted players - the third sits out", () => {
    const [playerA, playerB] = nextThreePlayerMatchup(
      TIED,
      INITIAL_TIEBREAK_STATE,
      []
    );

    expect([playerA, playerB]).toEqual(["p1", "p2"]);
  });

  it("keeps the streak alive when the same player wins twice in a row, and resolves with both wins recorded", () => {
    // p1 beats p2 (match 1) -> streak holder p1, count 1.
    // Rotation then pits p1 vs whoever sat out match 1 (p3).
    // p1 beats p3 (match 2) -> streak count reaches 2 -> resolved.
    const { finalState, matchHistory } =
      simulateThreePlayerTiebreak(TIED, ["p1", "p1"]);

    expect(matchHistory).toEqual([
      { playerA: "p1", playerB: "p2", winner: "p1", loser: "p2" },
      { playerA: "p1", playerB: "p3", winner: "p1", loser: "p3" },
    ]);

    expect(finalState.status).toBe("resolved");
    // Guarantee under test: the winner's two consecutive wins are
    // against two DIFFERENT opponents (p2 then p3), which is exactly
    // what makes this order well-defined.
    expect(finalState.resolvedOrder).toEqual([
      "p1",
      "p3",
      "p2",
    ]);
  });

  it("resets the streak when a different player wins, and does not resolve yet", () => {
    // p1 beats p2 (match 1) -> streak holder p1, count 1.
    // p3 beats p1 (match 2, since p3 sat out match 1) -> different
    // winner -> streak resets to holder p3, count 1. Not resolved.
    const { finalState, matchHistory } =
      simulateThreePlayerTiebreak(TIED, ["p1", "p3"]);

    expect(matchHistory).toEqual([
      { playerA: "p1", playerB: "p2", winner: "p1", loser: "p2" },
      { playerA: "p1", playerB: "p3", winner: "p3", loser: "p1" },
    ]);

    expect(finalState).toEqual({
      status: "in_progress",
      streakHolderId: "p3",
      streakCount: 1,
      resolvedOrder: null,
    });
  });

  it("resolves a longer sequence with a reset in the middle, still against two different opponents", () => {
    // m1: p1 vs p2 -> p1 wins (streak: p1 x1)
    // m2: p1 vs p3 (p3 sat out m1) -> p3 wins (streak resets: p3 x1)
    // m3: p3 vs p2 (p2 sat out m2) -> p3 wins (streak: p3 x2 -> resolved)
    const { finalState, matchHistory } =
      simulateThreePlayerTiebreak(TIED, [
        "p1",
        "p3",
        "p3",
      ]);

    expect(matchHistory.map((m) => [m.playerA, m.playerB])).toEqual([
      ["p1", "p2"],
      ["p1", "p3"],
      ["p3", "p2"],
    ]);

    expect(finalState.status).toBe("resolved");
    // p3's two consecutive wins were against p1 (match 2) then p2
    // (match 3) - two different opponents, per the rotation guarantee.
    expect(finalState.resolvedOrder).toEqual([
      "p3",
      "p2",
      "p1",
    ]);
  });

  it("refuses to play another match once the tiebreak is resolved", () => {
    expect(() =>
      simulateThreePlayerTiebreak(TIED, ["p1", "p1", "p1"])
    ).toThrow(/already resolved/);
  });

  it("rejects a scripted winner who isn't a participant in the current matchup", () => {
    expect(() =>
      simulateThreePlayerTiebreak(TIED, ["p3"])
    ).toThrow(/not a participant/);
  });
});
