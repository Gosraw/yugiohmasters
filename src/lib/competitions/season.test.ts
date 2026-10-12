import { describe, expect, it } from "vitest";

import {
  duelsPerRound,
  logicalRoundFor,
  scheduleRoundsPerCycle,
  totalLogicalRounds,
} from "./season";

// Must match _settle_round_cycle (202610120120): cycle_size = n for
// an odd player count, n - 1 for an even one; logical round =
// ((schedule_round - 1) / cycle_size) + 1.

describe("season round math", () => {
  it("3 players: 3 schedule rounds (one duel each) per season round", () => {
    expect(scheduleRoundsPerCycle(3)).toBe(3);
    expect(duelsPerRound(3)).toBe(3);
    expect(logicalRoundFor(1, 3)).toBe(1);
    expect(logicalRoundFor(3, 3)).toBe(1);
    expect(logicalRoundFor(4, 3)).toBe(2);
    expect(logicalRoundFor(117, 3)).toBe(39);
  });

  it("4 players: 3 schedule rounds (two duels each) per season round", () => {
    expect(scheduleRoundsPerCycle(4)).toBe(3);
    expect(duelsPerRound(4)).toBe(6);
    expect(logicalRoundFor(3, 4)).toBe(1);
    expect(logicalRoundFor(4, 4)).toBe(2);
  });

  it("2 players: every schedule round is a season round", () => {
    expect(scheduleRoundsPerCycle(2)).toBe(1);
    expect(logicalRoundFor(5, 2)).toBe(5);
  });

  it("counts season rounds from the schedule length", () => {
    expect(totalLogicalRounds(117, 3)).toBe(39);
    expect(totalLogicalRounds(null, 3)).toBe(0);
  });
});
