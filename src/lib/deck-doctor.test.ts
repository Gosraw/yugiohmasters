import {
  describe,
  expect,
  it,
} from "vitest";

import {
  analyzeDeck,
  type DeckDoctorCard,
  type DeckDoctorMechanics,
} from "@/lib/deck-doctor";

// =========================================================
// DECK DOCTOR - mandated test suite
//
// Covers exactly the scenarios required by the product spec:
// Normal Summon competition, GY payoff without setup, setup
// without payoff, unsupported Fusion, unsupported Xyz, owned
// improvement candidate, false-positive protection.
// =========================================================

function card(
  id: string,
  name: string,
  cardType = "Effect Monster"
): DeckDoctorCard {
  return { cardCatalogId: id, name, cardType };
}

function mechMap(
  entries: [string, string[]][]
): Map<string, DeckDoctorMechanics> {
  return new Map(entries.map(([id, tags]) => [id, { tags }]));
}

describe("analyzeDeck", () => {
  it("1. flags NORMAL_SUMMON_COMPETITION when the deck exceeds the threshold", () => {
    // 13 normal-summon-dependent starters, one over the disclosed
    // threshold of 12.
    const main = Array.from({ length: 13 }, (_, i) =>
      card(`ns-${i}`, `Starter ${i}`)
    );
    const mechanics = mechMap(
      main.map((c) => [c.cardCatalogId, ["normal_summon_dependency"]])
    );

    const report = analyzeDeck(main, [], mechanics);
    const finding = report.findings.find(
      (f) => f.type === "NORMAL_SUMMON_COMPETITION"
    );
    expect(finding).toBeDefined();
    expect(finding?.involvedCardIds).toHaveLength(13);
    expect(report.summary.normalSummonDependentCount).toBe(13);
  });

  it("1b. does NOT flag NORMAL_SUMMON_COMPETITION at or below the threshold (false-positive protection)", () => {
    const main = Array.from({ length: 12 }, (_, i) =>
      card(`ns-${i}`, `Starter ${i}`)
    );
    const mechanics = mechMap(
      main.map((c) => [c.cardCatalogId, ["normal_summon_dependency"]])
    );

    const report = analyzeDeck(main, [], mechanics);
    expect(
      report.findings.some((f) => f.type === "NORMAL_SUMMON_COMPETITION")
    ).toBe(false);
  });

  it("2. flags GY_PAYOFF_WITHOUT_SETUP when payoffs exist but no setup does", () => {
    const main = [
      card("payoff-1", "GY Payoff Card"),
      card("filler-1", "Filler"),
    ];
    const mechanics = mechMap([
      ["payoff-1", ["gy_payoff"]],
      ["filler-1", []],
    ]);

    const report = analyzeDeck(main, [], mechanics);
    const finding = report.findings.find(
      (f) => f.type === "GY_PAYOFF_WITHOUT_SETUP"
    );
    expect(finding).toBeDefined();
    expect(finding?.involvedCardIds).toEqual(["payoff-1"]);
  });

  it("3. flags GY_SETUP_WITHOUT_PAYOFF when setup exists but no payoff does", () => {
    const main = [
      card("setup-1", "GY Setup Card"),
      card("filler-1", "Filler"),
    ];
    const mechanics = mechMap([
      ["setup-1", ["gy_setup"]],
      ["filler-1", []],
    ]);

    const report = analyzeDeck(main, [], mechanics);
    const finding = report.findings.find(
      (f) => f.type === "GY_SETUP_WITHOUT_PAYOFF"
    );
    expect(finding).toBeDefined();
    expect(finding?.involvedCardIds).toEqual(["setup-1"]);
  });

  it("3b. neither GY finding fires when both setup and payoff are present (false-positive protection)", () => {
    const main = [
      card("setup-1", "GY Setup Card"),
      card("payoff-1", "GY Payoff Card"),
    ];
    const mechanics = mechMap([
      ["setup-1", ["gy_setup"]],
      ["payoff-1", ["gy_payoff"]],
    ]);

    const report = analyzeDeck(main, [], mechanics);
    expect(
      report.findings.some(
        (f) =>
          f.type === "GY_PAYOFF_WITHOUT_SETUP" ||
          f.type === "GY_SETUP_WITHOUT_PAYOFF"
      )
    ).toBe(false);
  });

  it("4. flags UNSUPPORTED_EXTRA_DECK_CARD for a Fusion monster with no identified enabler", () => {
    const extra = [card("fusion-1", "Fusion Beast", "Fusion Monster")];
    const mechanics = mechMap([]);

    const report = analyzeDeck([], extra, mechanics);
    const finding = report.findings.find(
      (f) =>
        f.type === "UNSUPPORTED_EXTRA_DECK_CARD" &&
        f.involvedCardIds.includes("fusion-1")
    );
    expect(finding).toBeDefined();
    expect(finding?.evidence).toMatchObject({ kind: "fusion" });
  });

  it("5. flags UNSUPPORTED_EXTRA_DECK_CARD for an Xyz monster with no identified enabler", () => {
    const extra = [card("xyz-1", "Xyz Titan", "XYZ Monster")];
    const mechanics = mechMap([]);

    const report = analyzeDeck([], extra, mechanics);
    const finding = report.findings.find(
      (f) =>
        f.type === "UNSUPPORTED_EXTRA_DECK_CARD" &&
        f.involvedCardIds.includes("xyz-1")
    );
    expect(finding).toBeDefined();
    expect(finding?.evidence).toMatchObject({ kind: "xyz" });
  });

  it("5b. does NOT flag a Fusion/Xyz card when an enabler IS present in the Main Deck (false-positive protection)", () => {
    const main = [card("enabler-1", "Fusion Enabler")];
    const extra = [
      card("fusion-1", "Fusion Beast", "Fusion Monster"),
      card("xyz-1", "Xyz Titan", "XYZ Monster"),
    ];
    const mechanics = mechMap([
      ["enabler-1", ["fusion_enabler", "xyz_enabler"]],
    ]);

    const report = analyzeDeck(main, extra, mechanics);
    expect(
      report.findings.some((f) => f.type === "UNSUPPORTED_EXTRA_DECK_CARD")
    ).toBe(false);
  });

  it("6. suggests an OWNED_IMPROVEMENT when an owned (not-in-deck) card closes a GY setup gap", () => {
    const main = [card("payoff-1", "GY Payoff Card")];
    const mechanics = mechMap([["payoff-1", ["gy_payoff"]]]);
    const ownedPool = [
      {
        cardCatalogId: "owned-setup-1",
        name: "Owned Setup Card",
        cardType: "Spell Card",
        tags: ["gy_setup"],
      },
    ];

    const report = analyzeDeck(main, [], mechanics, ownedPool);
    const improvement = report.findings.find(
      (f) => f.type === "OWNED_IMPROVEMENT"
    );
    expect(improvement).toBeDefined();
    expect(improvement?.suggestedOwnedCardIds).toEqual(["owned-setup-1"]);

    const gap = report.findings.find(
      (f) => f.type === "GY_PAYOFF_WITHOUT_SETUP"
    );
    expect(gap?.suggestedOwnedCardIds).toEqual(["owned-setup-1"]);
  });

  it("6b. suggests an OWNED_IMPROVEMENT for an unsupported Extra Deck card when an owned enabler exists", () => {
    const extra = [card("fusion-1", "Fusion Beast", "Fusion Monster")];
    const mechanics = mechMap([]);
    const ownedPool = [
      {
        cardCatalogId: "owned-enabler-1",
        name: "Owned Fusion Enabler",
        cardType: "Spell Card",
        tags: ["fusion_enabler"],
      },
    ];

    const report = analyzeDeck([], extra, mechanics, ownedPool);
    const improvement = report.findings.find(
      (f) =>
        f.type === "OWNED_IMPROVEMENT" &&
        f.involvedCardIds.includes("fusion-1")
    );
    expect(improvement).toBeDefined();
    expect(improvement?.suggestedOwnedCardIds).toEqual(["owned-enabler-1"]);
  });

  it("7. never suggests an owned improvement when no owned pool is passed (defaults to empty, no crash)", () => {
    const main = [card("payoff-1", "GY Payoff Card")];
    const mechanics = mechMap([["payoff-1", ["gy_payoff"]]]);

    const report = analyzeDeck(main, [], mechanics);
    expect(
      report.findings.some((f) => f.type === "OWNED_IMPROVEMENT")
    ).toBe(false);
  });

  it("8. summary counts are consistent with an empty deck (no crash, all zero, no findings)", () => {
    const report = analyzeDeck([], [], new Map());
    expect(report.summary.starterCount).toBe(0);
    expect(report.summary.gyPayoffCount).toBe(0);
    expect(report.findings).toHaveLength(0);
  });

  it("9. every finding discloses a confidence level - no finding hides uncertainty", () => {
    const main = [card("payoff-1", "GY Payoff Card")];
    const extra = [card("fusion-1", "Fusion Beast", "Fusion Monster")];
    const mechanics = mechMap([["payoff-1", ["gy_payoff"]]]);

    const report = analyzeDeck(main, extra, mechanics);
    expect(report.findings.length).toBeGreaterThan(0);
    for (const finding of report.findings) {
      expect(["high", "medium", "low"]).toContain(finding.confidence);
    }
  });
});
