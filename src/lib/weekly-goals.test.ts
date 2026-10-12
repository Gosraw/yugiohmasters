import { describe, expect, it } from "vitest";

import {
  EMPTY_SEASON_OVERVIEW,
  goalPercent,
  parseSeasonOverview,
  resetsInLabel,
  seasonWeekLabel,
  weeklyGoalsDone,
} from "./weekly-goals";

const RAW = {
  season: {
    number: 2,
    name: "Season 2",
    starts_on: "2026-10-12",
    ends_on: null,
    week: 3,
  },
  weekly: {
    set_id: "set-1",
    iso_week: "2026-W44",
    week_start: "2026-10-26",
    ends_at: "2026-11-02T00:00:00+01:00",
    items: [
      { id: "b", slot: 2, category: "collect", goal_type: "packs_opened", title: "Open 2 packs", target: 2, progress: 1, completed: false, dp_reward: 150 },
      { id: "a", slot: 1, category: "play", goal_type: "competition_matches_played", title: "Play 3 season duels", target: 3, progress: 3, completed: true, dp_reward: 150 },
    ],
    bonus: { voucher_type: "premium_pack", voucher_quantity: 1, granted: false },
  },
  path: {
    xp: 140,
    tiers: [
      { tier: 1, xp_required: 85, cumulative_xp: 85, dp_reward: 100, voucher_type: null, voucher_quantity: 0, title_reward: null, cosmetic_reward: null, label: null, granted: true },
    ],
    recent_xp: [{ source: "round_completed", xp: 10, description: "Round 2 complete", created_at: "2026-10-28T20:00:00Z" }],
    xp_sources: [{ source: "round_completed", xp: 10, label: "Round completed" }],
  },
  titles: ["Pharaoh's Ascendant", 42],
};

describe("parseSeasonOverview", () => {
  it("maps the RPC JSON and sorts goals by slot", () => {
    const overview = parseSeasonOverview(RAW);

    expect(overview.season).toEqual({ number: 2, name: "Season 2", startsOn: "2026-10-12", week: 3 });
    expect(overview.weekly?.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(overview.weekly?.items[0]).toMatchObject({ goalType: "competition_matches_played", completed: true, dpReward: 150 });
    expect(overview.weekly?.bonus).toEqual({ voucherType: "premium_pack", voucherQuantity: 1, granted: false });
    expect(overview.path.xp).toBe(140);
    expect(overview.path.tiers[0].granted).toBe(true);
    expect(overview.path.recentXp[0].description).toBe("Round 2 complete");
    expect(overview.titles).toEqual(["Pharaoh's Ascendant"]);
  });

  it("returns the empty overview for garbage", () => {
    expect(parseSeasonOverview(null)).toEqual(EMPTY_SEASON_OVERVIEW);
    expect(parseSeasonOverview("nope")).toEqual(EMPTY_SEASON_OVERVIEW);
  });

  it("tolerates a season before it starts and no weekly set", () => {
    const overview = parseSeasonOverview({ season: { number: 2, name: "Season 2", week: null }, weekly: null });

    expect(overview.season?.week).toBeNull();
    expect(overview.weekly).toBeNull();
    expect(overview.path.tiers).toEqual([]);
  });

  it("never lets a bad target divide by zero", () => {
    const overview = parseSeasonOverview({
      weekly: { items: [{ id: "x", slot: 1, title: "x", target: 0, progress: -3 }] },
    });

    expect(overview.weekly?.items[0].target).toBe(1);
    expect(overview.weekly?.items[0].progress).toBe(0);
  });
});

describe("display helpers", () => {
  it("goalPercent clamps to 0-100", () => {
    expect(goalPercent(1, 2)).toBe(50);
    expect(goalPercent(5, 2)).toBe(100);
    expect(goalPercent(-1, 2)).toBe(0);
    expect(goalPercent(0, 0)).toBe(100);
  });

  it("weeklyGoalsDone counts completed goals", () => {
    expect(weeklyGoalsDone([{ completed: true }, { completed: false }, { completed: true }])).toBe(2);
  });

  it("seasonWeekLabel", () => {
    expect(seasonWeekLabel({ number: 2, name: "Season 2", startsOn: null, week: 3 })).toBe("Season 2 · Week 3");
    expect(seasonWeekLabel({ number: 2, name: "Season 2", startsOn: null, week: null })).toBe("Season 2");
    expect(seasonWeekLabel(null)).toBe("Season");
  });

  it("resetsInLabel", () => {
    const now = new Date("2026-10-28T12:00:00Z");

    expect(resetsInLabel("2026-11-02T00:00:00+01:00", now)).toBe("Resets in 4 days");
    expect(resetsInLabel("2026-10-28T20:00:00Z", now)).toBe("Resets in 8 hours");
    expect(resetsInLabel("2026-10-28T12:30:00Z", now)).toBe("Resets soon");
    expect(resetsInLabel(null, now)).toBeNull();
    expect(resetsInLabel("garbage", now)).toBeNull();
  });
});
