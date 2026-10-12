import { describe, expect, it } from "vitest";

import {
  formatLeagueDate,
  formatLeagueDateTime,
  formatLeagueRelativeDay,
  formatLeagueShortDate,
  formatNumber,
  leagueDayKey,
} from "./format-date";

// Run with TZ=UTC (like Vercel): the output must still be Amsterdam
// time.

describe("league date formatting", () => {
  it("shows Amsterdam summer time (UTC+2), not the server clock", () => {
    expect(formatLeagueDateTime("2026-10-12T19:30:00Z")).toBe(
      "12 Oct 2026, 21:30"
    );
  });

  it("shows Amsterdam winter time (UTC+1)", () => {
    expect(formatLeagueDateTime("2026-12-01T19:30:00Z")).toBe(
      "01 Dec 2026, 20:30"
    );
  });

  it("rolls the date over at Amsterdam midnight", () => {
    // 22:30 UTC = 00:30 next day in Amsterdam (summer time).
    expect(formatLeagueDate("2026-10-12T22:30:00Z")).toBe("13 Oct 2026");
    expect(formatLeagueShortDate("2026-10-12T22:30:00Z")).toBe("13 Oct");
    expect(leagueDayKey(new Date("2026-10-12T22:30:00Z"))).toBe(
      "2026-10-13"
    );
  });

  it("falls back for empty or invalid values", () => {
    expect(formatLeagueDateTime(null)).toBe("—");
    expect(formatLeagueDate("not a date", "?")).toBe("?");
  });

  it("formats thousands with a separator", () => {
    expect(formatNumber(2825)).toBe("2,825");
  });
});

describe("relative day (calendar day in Amsterdam)", () => {
  const now = new Date("2026-10-12T08:00:00Z"); // 10:00 in Amsterdam

  it("is Today for earlier the same Amsterdam day", () => {
    expect(formatLeagueRelativeDay("2026-10-11T22:30:00Z", now)).toBe(
      "Today"
    );
  });

  it("is Yesterday for late yesterday evening, even < 24h ago", () => {
    expect(formatLeagueRelativeDay("2026-10-11T21:00:00Z", now)).toBe(
      "Yesterday"
    );
  });

  it("counts days and then shows a date", () => {
    expect(formatLeagueRelativeDay("2026-10-09T12:00:00Z", now)).toBe(
      "3d ago"
    );
    // ICU versions differ on "Sep" vs "Sept".
    expect(formatLeagueRelativeDay("2026-09-30T12:00:00Z", now)).toMatch(
      /^30 Sept?$/
    );
  });
});
