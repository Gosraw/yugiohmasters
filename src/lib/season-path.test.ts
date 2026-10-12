import { describe, expect, it } from "vitest";

import {
  seasonPathStatus,
  tierRewardParts,
  type SeasonPathTier,
} from "./season-path";

function track(count: number, xpEach = 85): SeasonPathTier[] {
  return Array.from({ length: count }, (_, index) => ({
    tier: index + 1,
    xp_required: xpEach,
    cumulative_xp: xpEach * (index + 1),
    dp_reward: 0,
    voucher_type: null,
    voucher_quantity: 0,
    title_reward: null,
    cosmetic_reward: null,
    label: null,
    granted: false,
  }));
}

describe("seasonPathStatus", () => {
  it("starts at tier 0 working towards tier 1", () => {
    const status = seasonPathStatus(0, track(20));

    expect(status.tier).toBe(0);
    expect(status.nextTier?.tier).toBe(1);
    expect(status.xpIntoTier).toBe(0);
    expect(status.xpForTier).toBe(85);
    expect(status.percentToNext).toBe(0);
    expect(status.complete).toBe(false);
  });

  it("reaches a tier exactly on its threshold", () => {
    const status = seasonPathStatus(170, track(20));

    expect(status.tier).toBe(2);
    expect(status.nextTier?.tier).toBe(3);
    expect(status.xpIntoTier).toBe(0);
  });

  it("measures progress inside the current tier", () => {
    const status = seasonPathStatus(85 * 5 + 40, track(20));

    expect(status.tier).toBe(5);
    expect(status.xpIntoTier).toBe(40);
    expect(Math.round(status.percentToNext)).toBe(47);
    expect(Math.round(status.percentTotal)).toBe(27);
  });

  it("is complete at (or past) the last tier", () => {
    const status = seasonPathStatus(5000, track(20));

    expect(status.tier).toBe(20);
    expect(status.complete).toBe(true);
    expect(status.nextTier).toBeNull();
    expect(status.percentToNext).toBe(100);
    expect(status.percentTotal).toBe(100);
  });

  it("handles uneven tiers and unsorted input", () => {
    const tiers: SeasonPathTier[] = [
      { ...track(1)[0], tier: 2, xp_required: 50, cumulative_xp: 60 },
      { ...track(1)[0], tier: 1, xp_required: 10, cumulative_xp: 10 },
    ];

    const status = seasonPathStatus(35, tiers);

    expect(status.tier).toBe(1);
    expect(status.xpIntoTier).toBe(25);
    expect(status.xpForTier).toBe(50);
  });

  it("survives an empty track and bad XP", () => {
    const status = seasonPathStatus(Number.NaN, []);

    expect(status.tier).toBe(0);
    expect(status.maxTier).toBe(0);
    expect(status.complete).toBe(false);
    expect(status.percentTotal).toBe(0);
  });
});

describe("tierRewardParts", () => {
  it("lists DP, voucher, title and cosmetic in order", () => {
    expect(
      tierRewardParts({
        dp_reward: 800,
        voucher_type: "deluxe_pack",
        voucher_quantity: 1,
        title_reward: "Pharaoh's Ascendant",
        cosmetic_reward: "Season 2 card frame",
      })
    ).toEqual([
      "800 DP",
      "Deluxe Pack",
      "Title: Pharaoh's Ascendant",
      "Season 2 card frame",
    ]);
  });

  it("shows a quantity above 1 and skips empty parts", () => {
    expect(
      tierRewardParts({
        dp_reward: 0,
        voucher_type: "premium_pack",
        voucher_quantity: 2,
        title_reward: null,
        cosmetic_reward: null,
      })
    ).toEqual(["2× Premium Pack"]);
  });

  it("formats thousands", () => {
    expect(
      tierRewardParts({
        dp_reward: 1500,
        voucher_type: null,
        voucher_quantity: 0,
        title_reward: null,
        cosmetic_reward: null,
      })
    ).toEqual(["1,500 DP"]);
  });
});
