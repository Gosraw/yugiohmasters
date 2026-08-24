import {
  describe,
  expect,
  it,
} from "vitest";

import {
  deriveConfidence,
  generateSynergyCandidates,
  groupSynergyCandidatesByOwnership,
  type SynergyCandidate,
  type SynergyCatalogCard,
} from "@/lib/ai/card-synergy-candidates";

// =========================================================
// CARD SYNERGY CANDIDATES - mandated test suite additions (Phase 3):
// no same-archetype-only false positive, relationship evidence is
// always present, and the new deriveConfidence() tier mapping.
// (generateSynergyCandidates/groupSynergyCandidatesByOwnership
// themselves predate this session but had no dedicated test file
// yet - added here since deriveConfidence composes directly with
// their output.)
// =========================================================

function card(partial: Partial<SynergyCatalogCard> & { id: string; name: string }): SynergyCatalogCard {
  return {
    card_type: "Effect Monster",
    monster_type: null,
    attribute: null,
    archetype: null,
    level: null,
    rank: null,
    link_rating: null,
    atk: null,
    def: null,
    description: "",
    master_duel_status: "unlimited",
    ...partial,
  };
}

describe("generateSynergyCandidates", () => {
  it("1. SAME ARCHETYPE ALONE (no other mechanical reason) is excluded entirely", () => {
    const target = card({ id: "t1", name: "Target", archetype: "HERO" });
    const pool = [card({ id: "c1", name: "Same Archetype Only", archetype: "HERO" })];

    const candidates = generateSynergyCandidates(target, pool);
    expect(candidates).toHaveLength(0);
  });

  it("2. a real mechanical reason (GY pair) PLUS a shared archetype IS included, with evidence for both", () => {
    const target = card({
      id: "t1",
      name: "Sender",
      description: "Send 1 card from your Deck to the Graveyard.",
      archetype: "HERO",
    });
    const candidate = card({
      id: "c1",
      name: "Payoff",
      description: "If a card is in your Graveyard: draw 1 card.",
      archetype: "HERO",
    });

    const candidates = generateSynergyCandidates(target, [candidate]);
    expect(candidates).toHaveLength(1);
    // Every included candidate must expose its reasons as real,
    // human-readable evidence strings - never an empty/opaque result.
    expect(candidates[0].reasons.length).toBeGreaterThan(0);
    expect(candidates[0].reasons.every((r) => r.detail.length > 0)).toBe(true);
  });

  it("3. a Forbidden/unavailable Master Duel status candidate is never suggested", () => {
    const target = card({
      id: "t1",
      name: "Sender",
      description: "Send 1 card from your Deck to the Graveyard.",
    });
    const candidate = card({
      id: "c1",
      name: "Banned Payoff",
      description: "If a card is in your Graveyard: draw 1 card.",
      master_duel_status: "forbidden",
    });

    const candidates = generateSynergyCandidates(target, [candidate]);
    expect(candidates).toHaveLength(0);
  });
});

describe("groupSynergyCandidatesByOwnership", () => {
  it("4. splits strictly on ownedCount - never a false owned classification", () => {
    const owned: SynergyCandidate = {
      card: card({ id: "o1", name: "Owned" }),
      score: 40,
      reasons: [{ kind: "gy_pair", detail: "x", weight: 40 }],
      ownedCount: 2,
      masterDuelNote: null,
    };
    const unowned: SynergyCandidate = {
      card: card({ id: "u1", name: "Unowned" }),
      score: 40,
      reasons: [{ kind: "gy_pair", detail: "x", weight: 40 }],
      ownedCount: 0,
      masterDuelNote: null,
    };

    const { owned: ownedList, other } = groupSynergyCandidatesByOwnership([owned, unowned]);
    expect(ownedList.map((c) => c.card.id)).toEqual(["o1"]);
    expect(other.map((c) => c.card.id)).toEqual(["u1"]);
  });
});

describe("deriveConfidence", () => {
  function candidateWith(reasons: SynergyCandidate["reasons"]): SynergyCandidate {
    return {
      card: card({ id: "c1", name: "C" }),
      score: reasons.reduce((s, r) => s + r.weight, 0),
      reasons,
      ownedCount: 0,
      masterDuelNote: null,
    };
  }

  it("5. a strong single reason (weight >= 40) is HIGH confidence", () => {
    const c = candidateWith([{ kind: "spell_trap_support", detail: "x", weight: 45 }]);
    expect(deriveConfidence(c)).toBe("high");
  });

  it("6. two independent meaningful reasons are HIGH confidence even if individually modest", () => {
    const c = candidateWith([
      { kind: "material_type", detail: "x", weight: 15 },
      { kind: "gy_pair", detail: "y", weight: 40 },
    ]);
    expect(deriveConfidence(c)).toBe("high");
  });

  it("7. a single medium-weight reason is MEDIUM confidence", () => {
    const c = candidateWith([{ kind: "material_type", detail: "x", weight: 15 }]);
    expect(deriveConfidence(c)).toBe("medium");
  });

  it("8. weak signals alone (shared_attribute/monster_type/archetype) never exceed LOW, however many stack", () => {
    const c = candidateWith([
      { kind: "shared_attribute", detail: "x", weight: 5 },
      { kind: "shared_monster_type", detail: "y", weight: 5 },
      { kind: "shared_archetype", detail: "z", weight: 10 },
    ]);
    expect(deriveConfidence(c)).toBe("low");
  });

  it("9. no reasons at all is LOW confidence (degrades safely, never throws)", () => {
    const c = candidateWith([]);
    expect(deriveConfidence(c)).toBe("low");
  });
});
