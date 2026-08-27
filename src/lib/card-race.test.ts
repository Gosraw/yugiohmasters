import { describe, expect, it } from "vitest";

import { matchesRace, MONSTER_RACES } from "./card-race";

describe("matchesRace", () => {
  it("matches with no filter applied", () => {
    expect(matchesRace("Dragon", "")).toBe(true);
    expect(matchesRace(null, "")).toBe(true);
    expect(matchesRace(null, undefined)).toBe(true);
  });

  it("matches only the exact selected race", () => {
    expect(matchesRace("Dragon", "Dragon")).toBe(true);
    expect(matchesRace("Spellcaster", "Dragon")).toBe(false);
  });

  it("never matches a Spell/Trap card (null race) against a real filter", () => {
    expect(matchesRace(null, "Dragon")).toBe(false);
  });
});

describe("MONSTER_RACES", () => {
  it("has no duplicate entries", () => {
    expect(new Set(MONSTER_RACES).size).toBe(
      MONSTER_RACES.length
    );
  });

  it("includes common races used across the app's filters", () => {
    expect(MONSTER_RACES).toContain("Dragon");
    expect(MONSTER_RACES).toContain("Spellcaster");
    expect(MONSTER_RACES).toContain("Warrior");
    expect(MONSTER_RACES).toContain("Zombie");
  });
});
