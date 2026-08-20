import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./defaults";

describe("settings defaults", () => {
  it("keeps game-economy values centralized", () => {
    expect(DEFAULT_SETTINGS["life_points.start"]).toBe(8000);
    expect(DEFAULT_SETTINGS["competition.cp_by_position"]).toEqual([5, 3, 1]);
  });
});
