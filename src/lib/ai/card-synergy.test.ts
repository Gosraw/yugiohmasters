import {
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  generateSynergyCandidates,
  groupSynergyCandidatesByOwnership,
  type SynergyCatalogCard,
} from "@/lib/ai/card-synergy-candidates";

import {
  explainSynergyCandidates,
} from "@/lib/ai/card-synergy";

// =========================================================
// AI CARD SYNERGY - mandated test suite
//
// Covers the 10 required scenarios from the product spec: same
// archetype, different-archetype-shared-GY-mechanic, Xyz+material
// level compatibility, discard cost+payoff, banish+payoff,
// Spell/Trap support, owned-card preference, Forbidden exclusion,
// Not-in-Master-Duel exclusion, and missing-AI-key clean fallback -
// plus an explicit check that not every recommendation is purely
// same-archetype (this is NOT a "same archetype = good together"
// feature).
// =========================================================

function card(
  partial: Partial<SynergyCatalogCard> & { id: string; name: string }
): SynergyCatalogCard {
  return {
    card_type: "Monster",
    monster_type: null,
    attribute: null,
    archetype: null,
    level: null,
    rank: null,
    link_rating: null,
    atk: null,
    def: null,
    description: null,
    master_duel_status: "unlimited",
    ...partial,
  };
}

describe("card synergy - candidate generation + AI explanation", () => {
  beforeEach(() => {
    // Every test starts with no AI key configured unless it
    // explicitly sets one - keeps the deterministic fallback the
    // default, matching how this app actually runs without
    // ANTHROPIC_API_KEY set in most environments.
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("1. same archetype ALONE is not enough to be recommended (not a 'same archetype = good together' feature)", () => {
    const target = card({
      id: "t1",
      name: "Archetype Anchor",
      archetype: "Dragon Squad",
      description: "A vanilla monster with no effect.",
    });
    const sameArchetypeVanilla = card({
      id: "c1",
      name: "Archetype Filler",
      archetype: "Dragon Squad",
      description: "A vanilla monster with no effect.",
    });

    const results = generateSynergyCandidates(target, [sameArchetypeVanilla], {});

    expect(results).toHaveLength(0);
  });

  it("2. different archetype, shared Graveyard mechanic (directional sender/payoff pair) IS recommended", () => {
    const target = card({
      id: "t2",
      name: "GY Sender",
      archetype: "Dragon Squad",
      description: "Send 1 monster from your Deck to the Graveyard.",
    });
    const gyPayoff = card({
      id: "c2",
      name: "GY Payoff",
      archetype: "Zombie World",
      description: "Gains 200 ATK for each monster in your Graveyard.",
    });

    const results = generateSynergyCandidates(target, [gyPayoff], {});

    expect(results).toHaveLength(1);
    expect(results[0].card.id).toBe("c2");
    expect(results[0].reasons.some((r) => r.kind === "gy_pair")).toBe(true);
  });

  it("3. Xyz Material level compatibility (Rank N Xyz + Level N monster)", () => {
    const xyz = card({
      id: "t3",
      name: "Rank 4 Xyz",
      card_type: "Xyz Monster",
      rank: 4,
      description: "2 Level 4 monsters",
    });
    const level4 = card({ id: "c3a", name: "Level 4 Beater", level: 4 });
    const level3 = card({ id: "c3b", name: "Level 3 Beater", level: 3 });

    const results = generateSynergyCandidates(xyz, [level4, level3], {});

    expect(results.some((r) => r.card.id === "c3a")).toBe(true);
    expect(results.some((r) => r.card.id === "c3b")).toBe(false);
  });

  it("4. discard cost + discard payoff (directional pair)", () => {
    const discarder = card({
      id: "t4",
      name: "Discarder",
      description: "Discard 1 card to Special Summon this card from your hand.",
    });
    const discardPayoff = card({
      id: "c4",
      name: "Discard Payoff",
      description:
        "If you discarded a card this turn: You can Special Summon this card from your hand.",
    });

    const results = generateSynergyCandidates(discarder, [discardPayoff], {});

    expect(results).toHaveLength(1);
    expect(results[0].reasons.some((r) => r.kind === "discard_pair")).toBe(true);
  });

  it("5. banish + banish payoff (directional pair)", () => {
    const banisher = card({
      id: "t5",
      name: "Banisher",
      description: "You can banish 1 card from your Graveyard; draw 1 card.",
    });
    const banishPayoff = card({
      id: "c5",
      name: "Banish Payoff",
      description:
        "When this card is banished, you can Special Summon it during your next Standby Phase.",
    });

    const results = generateSynergyCandidates(banisher, [banishPayoff], {});

    expect(results).toHaveLength(1);
    expect(results[0].reasons.some((r) => r.kind === "banish_pair")).toBe(true);
  });

  it("6. Spell/Trap explicit archetype support", () => {
    const archetypeMonster = card({
      id: "t6",
      name: "Blue-Eyes White Dragon",
      archetype: "Blue-Eyes",
      description: "A powerful dragon.",
    });
    const supportSpell = card({
      id: "c6",
      name: "Support Spell",
      card_type: "Spell",
      description: "Add 1 'Blue-Eyes' monster from your Deck to your hand.",
    });

    const results = generateSynergyCandidates(archetypeMonster, [supportSpell], {});

    expect(results).toHaveLength(1);
    expect(
      results[0].reasons.some((r) => r.kind === "spell_trap_support")
    ).toBe(true);
  });

  it("7. owned-card preference (collection-aware grouping)", () => {
    const target = card({
      id: "t7",
      name: "GY Sender",
      description: "Send 1 monster from your Deck to the Graveyard.",
    });
    const ownedPayoff = card({
      id: "c7a",
      name: "Owned Payoff",
      description: "Gains 200 ATK for each monster in your Graveyard.",
    });
    const unownedPayoff = card({
      id: "c7b",
      name: "Unowned Payoff",
      description: "Gains 300 DEF for each monster in your Graveyard.",
    });

    const results = generateSynergyCandidates(
      target,
      [ownedPayoff, unownedPayoff],
      { ownedCounts: new Map([["c7a", 3]]) }
    );

    const grouped = groupSynergyCandidatesByOwnership(results);

    expect(grouped.owned.map((c) => c.card.id)).toContain("c7a");
    expect(grouped.other.map((c) => c.card.id)).toContain("c7b");
    expect(grouped.owned.map((c) => c.card.id)).not.toContain("c7b");
  });

  it("8. Forbidden card is excluded from suggestions", () => {
    const target = card({
      id: "t8",
      name: "GY Sender",
      description: "Send 1 monster from your Deck to the Graveyard.",
    });
    const forbiddenPayoff = card({
      id: "c8",
      name: "Forbidden Payoff",
      description: "Gains 200 ATK for each monster in your Graveyard.",
      master_duel_status: "forbidden",
    });

    const results = generateSynergyCandidates(target, [forbiddenPayoff], {});

    expect(results).toHaveLength(0);
  });

  it("9. Not-in-Master-Duel (not_available / unknown) cards are excluded", () => {
    const target = card({
      id: "t9",
      name: "GY Sender",
      description: "Send 1 monster from your Deck to the Graveyard.",
    });
    const notAvailable = card({
      id: "c9a",
      name: "Not Available Payoff",
      description: "Gains 200 ATK for each monster in your Graveyard.",
      master_duel_status: "not_available",
    });
    const unknownStatus = card({
      id: "c9b",
      name: "Unknown Status Payoff",
      description: "Gains 200 ATK for each monster in your Graveyard.",
      master_duel_status: null,
    });
    const limited = card({
      id: "c9c",
      name: "Limited Payoff",
      description: "Gains 200 ATK for each monster in your Graveyard.",
      master_duel_status: "limited",
    });

    const results = generateSynergyCandidates(
      target,
      [notAvailable, unknownStatus, limited],
      {}
    );

    expect(results.some((r) => r.card.id === "c9a")).toBe(false);
    expect(results.some((r) => r.card.id === "c9b")).toBe(false);
    // Limited IS offerable (conservative rule allows limited/semi_limited/
    // unlimited) but must carry a note mentioning the restriction.
    const limitedResult = results.find((r) => r.card.id === "c9c");
    expect(limitedResult).toBeDefined();
    expect(limitedResult?.masterDuelNote).toMatch(/Limited/);
  });

  it("10. missing AI key produces a clean deterministic fallback, never throws", async () => {
    const target = card({
      id: "t10",
      name: "GY Sender",
      description: "Send 1 monster from your Deck to the Graveyard.",
    });
    const payoff = card({
      id: "c10",
      name: "GY Payoff",
      description: "Gains 200 ATK for each monster in your Graveyard.",
    });

    const candidates = generateSynergyCandidates(target, [payoff], {});
    const explanations = await explainSynergyCandidates(target, candidates, 3);

    expect(explanations).toHaveLength(1);
    expect(explanations[0].source).toBe("fallback");
    expect(explanations[0].explanation.length).toBeGreaterThan(0);
    expect(explanations[0].cardId).toBe("c10");
  });

  it("explainSynergyCandidates resolves cleanly with zero candidates", async () => {
    const target = card({ id: "t11", name: "Solo Card" });
    const explanations = await explainSynergyCandidates(target, [], 3);
    expect(explanations).toHaveLength(0);
  });

  it("a mixed pool produces recommendations that are not purely same-archetype", () => {
    const target = card({
      id: "t12",
      name: "GY Sender",
      archetype: "Dragon Squad",
      description: "Send 1 monster from your Deck to the Graveyard.",
    });
    const sameArchetypeVanilla = card({
      id: "c12a",
      name: "Archetype Filler",
      archetype: "Dragon Squad",
      description: "A vanilla monster with no effect.",
    });
    const differentArchetypePayoff = card({
      id: "c12b",
      name: "GY Payoff",
      archetype: "Zombie World",
      description: "Gains 200 ATK for each monster in your Graveyard.",
    });

    const results = generateSynergyCandidates(
      target,
      [sameArchetypeVanilla, differentArchetypePayoff],
      {}
    );

    expect(results.some((r) => r.card.id === "c12b")).toBe(true);
    expect(results.some((r) => r.card.id === "c12a")).toBe(false);
  });
});
