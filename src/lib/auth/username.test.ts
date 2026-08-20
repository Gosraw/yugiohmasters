import { describe, expect, it } from "vitest";
import { isValidUsername, normalizeUsername, usernameToAuthEmail } from "./username";

describe("username auth adapter", () => {
  it("normalizes usernames consistently", () => {
    expect(normalizeUsername("  Player_One ")).toBe("player_one");
  });

  it("maps username to a hidden technical email", () => {
    expect(usernameToAuthEmail("Player-One")).toBe("player-one@duelist.local");
  });

  it("rejects invalid usernames", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(() => usernameToAuthEmail("bad name")).toThrow();
  });
});
