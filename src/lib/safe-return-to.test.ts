import {
  describe,
  expect,
  it,
} from "vitest";

import {
  safeReturnTo,
  withFeedback,
} from "@/lib/safe-return-to";

describe("safeReturnTo", () => {
  it("keeps same-site relative paths and drops old banner params", () => {
    expect(safeReturnTo("/cards?q=dark&page=2", "/x")).toBe("/cards?q=dark&page=2");
    expect(safeReturnTo("/cards?q=a&success=old&error=x", "/x")).toBe("/cards?q=a");
  });

  it("falls back for anything that could leave the site", () => {
    for (const value of [
      "https://evil.example/x",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "",
      undefined,
    ]) {
      expect(safeReturnTo(value, "/fallback")).toBe("/fallback");
    }
  });
});

describe("withFeedback", () => {
  it("appends the message with the right separator", () => {
    expect(withFeedback("/cards", "success", "Saved!")).toBe("/cards?success=Saved!");
    expect(withFeedback("/cards?q=a", "error", "A & B")).toBe("/cards?q=a&error=A%20%26%20B");
  });
});
