import {
  describe,
  expect,
  it,
} from "vitest";

import {
  computeDeckComposition,
  computeOwnedVsUsed,
  type DeckCompositionCard,
} from "@/lib/deck-composition";

// =========================================================
// DECK COMPOSITION - mandated test suite (Deck Builder 2.0's live
// summary panel + the data the future Deck Doctor consumes)
// =========================================================

function card(
  partial: Partial<DeckCompositionCard> & { card_catalog_id: string; name: string; card_type: string }
): DeckCompositionCard {
  return {
    monster_type: null,
    attribute: null,
    level: null,
    rank: null,
    link_rating: null,
    archetype: null,
    ...partial,
  };
}

describe("computeDeckComposition", () => {
  it("1. correctly counts monsters/spells/traps in the Main Deck", () => {
    const main = [
      card({ card_catalog_id: "m1", name: "Monster A", card_type: "Effect Monster" }),
      card({ card_catalog_id: "m2", name: "Monster B", card_type: "Normal Monster" }),
      card({ card_catalog_id: "s1", name: "Spell A", card_type: "Spell Card" }),
      card({ card_catalog_id: "t1", name: "Trap A", card_type: "Trap Card" }),
      card({ card_catalog_id: "t2", name: "Trap B", card_type: "Trap Card" }),
    ];

    const result = computeDeckComposition(main, []);
    expect(result.main.total).toBe(5);
    expect(result.main.monsters).toBe(2);
    expect(result.main.spells).toBe(1);
    expect(result.main.traps).toBe(2);
  });

  it("2. distinguishes Normal Monster from Effect Monster", () => {
    const main = [
      card({ card_catalog_id: "m1", name: "Vanilla", card_type: "Normal Monster" }),
      card({ card_catalog_id: "m2", name: "Effecty", card_type: "Effect Monster" }),
      card({ card_catalog_id: "m3", name: "Flippy", card_type: "Flip Effect Monster" }),
    ];

    const result = computeDeckComposition(main, []);
    expect(result.main.normalMonsters).toBe(1);
    expect(result.main.effectMonsters).toBe(2);
  });

  it("3. correctly counts Fusion/Xyz/Synchro/Link in the Extra Deck, separate from Main", () => {
    const extra = [
      card({ card_catalog_id: "f1", name: "Fusion A", card_type: "Fusion Monster" }),
      card({ card_catalog_id: "f2", name: "Fusion B", card_type: "Fusion Monster" }),
      card({ card_catalog_id: "x1", name: "Xyz A", card_type: "XYZ Monster", rank: 4 }),
      card({ card_catalog_id: "s1", name: "Synchro A", card_type: "Synchro Monster" }),
      card({ card_catalog_id: "l1", name: "Link A", card_type: "Link Monster" }),
    ];

    const result = computeDeckComposition([], extra);
    expect(result.extra.total).toBe(5);
    expect(result.extra.fusion).toBe(2);
    expect(result.extra.xyz).toBe(1);
    expect(result.extra.synchro).toBe(1);
    expect(result.extra.link).toBe(1);
  });

  it("4. MAIN/EXTRA TOTALS stay independent - Extra Deck cards never counted toward Main and vice versa", () => {
    const main = [
      card({ card_catalog_id: "m1", name: "Monster A", card_type: "Effect Monster" }),
    ];
    const extra = [
      card({ card_catalog_id: "f1", name: "Fusion A", card_type: "Fusion Monster" }),
    ];

    const result = computeDeckComposition(main, extra);
    expect(result.main.total).toBe(1);
    expect(result.extra.total).toBe(1);
    expect(result.main.monsters).toBe(1);
  });

  it("5. DUPLICATE COPIES: 3 copies of the same card in the Main Deck all count toward the section totals", () => {
    const main = [
      card({ card_catalog_id: "m1", name: "Triplicate", card_type: "Effect Monster" }),
      card({ card_catalog_id: "m1", name: "Triplicate", card_type: "Effect Monster" }),
      card({ card_catalog_id: "m1", name: "Triplicate", card_type: "Effect Monster" }),
    ];

    const result = computeDeckComposition(main, []);
    expect(result.main.total).toBe(3);
    expect(result.main.monsters).toBe(3);
  });

  it("6. level distribution only counts Main Deck monsters, rank distribution only counts Extra Deck Xyz", () => {
    const main = [
      card({ card_catalog_id: "m1", name: "Lv4 A", card_type: "Effect Monster", level: 4 }),
      card({ card_catalog_id: "m2", name: "Lv4 B", card_type: "Effect Monster", level: 4 }),
      card({ card_catalog_id: "m3", name: "Lv7", card_type: "Effect Monster", level: 7 }),
    ];
    const extra = [
      card({ card_catalog_id: "x1", name: "Rank 4 Xyz", card_type: "XYZ Monster", rank: 4 }),
    ];

    const result = computeDeckComposition(main, extra);
    expect(result.levelDistribution[4]).toBe(2);
    expect(result.levelDistribution[7]).toBe(1);
    expect(result.rankDistribution[4]).toBe(1);
    // Extra Deck cards must never leak into levelDistribution.
    expect(result.levelDistribution[0]).toBeUndefined();
  });

  it("7. archetype distribution buckets cards with no archetype under 'Generic / Other'", () => {
    const main = [
      card({ card_catalog_id: "h1", name: "Hero A", card_type: "Effect Monster", archetype: "HERO" }),
      card({ card_catalog_id: "h2", name: "Hero B", card_type: "Effect Monster", archetype: "HERO" }),
      card({ card_catalog_id: "g1", name: "Generic A", card_type: "Effect Monster", archetype: null }),
    ];

    const result = computeDeckComposition(main, []);
    expect(result.archetypeDistribution["HERO"]).toBe(2);
    expect(result.archetypeDistribution["Generic / Other"]).toBe(1);
  });
});

describe("computeOwnedVsUsed", () => {
  it("8. identifies spare owned copies not yet used in this deck", () => {
    const deckCards = [
      { card_catalog_id: "c1", name: "Card One" },
      { card_catalog_id: "c1", name: "Card One" },
    ];
    const ownedQuantityByCard = new Map([["c1", 3]]);

    const result = computeOwnedVsUsed(deckCards, ownedQuantityByCard);
    expect(result).toEqual([
      {
        cardCatalogId: "c1",
        name: "Card One",
        ownedQuantity: 3,
        usedInDeck: 2,
        spareCopies: 1,
      },
    ]);
  });

  it("9. a card fully used (owned === used) produces no entry", () => {
    const deckCards = [
      { card_catalog_id: "c1", name: "Card One" },
      { card_catalog_id: "c1", name: "Card One" },
    ];
    const ownedQuantityByCard = new Map([["c1", 2]]);

    const result = computeOwnedVsUsed(deckCards, ownedQuantityByCard);
    expect(result).toHaveLength(0);
  });
});
