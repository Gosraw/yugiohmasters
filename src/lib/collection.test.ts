import {
  describe,
  expect,
  it,
} from "vitest";

import {
  groupCollection,
  type CollectionCardCatalogItem,
  type CollectionCardInstance,
  type GroupedOwnedCard,
} from "@/lib/collection";

// =========================================================
// COLLECTION 2.0 - mandated test suite: correct archetype
// grouping, Generic/Other bucket, duplicate ownership counts.
// =========================================================

function catalogCard(
  partial: Partial<CollectionCardCatalogItem> & { id: string; name: string }
): CollectionCardCatalogItem {
  return {
    image_url: null,
    card_type: "Effect Monster",
    attribute: null,
    atk: null,
    def: null,
    game_rarity: "Rare",
    rarity_score: null,
    master_duel_status: null,
    archetype: null,
    ...partial,
  };
}

function instance(
  id: string,
  cardCatalogId: string,
  acquiredAt = "2026-01-01T00:00:00Z"
): CollectionCardInstance {
  return {
    id,
    card_catalog_id: cardCatalogId,
    copy_number: 1,
    acquired_at: acquiredAt,
    locked: false,
    for_trade: false,
    inDeck: false,
    inPendingOffer: false,
  };
}

function groupedCard(
  card: CollectionCardCatalogItem,
  instances: CollectionCardInstance[]
): GroupedOwnedCard {
  return {
    card,
    instances,
    quantity: instances.length,
    lockedCount: instances.filter((i) => i.locked).length,
    availableCount: instances.filter((i) => !i.locked).length,
    forTradeCount: instances.filter((i) => i.for_trade).length,
    inDeckCount: 0,
    inPendingOfferCount: 0,
  };
}

describe("groupCollection - archetype", () => {
  it("1. groups cards under their real archetype metadata", () => {
    const heroA = catalogCard({ id: "h1", name: "Elemental HERO Sparkman", archetype: "HERO" });
    const heroB = catalogCard({ id: "h2", name: "Elemental HERO Avian", archetype: "HERO" });
    const blueEyes = catalogCard({ id: "b1", name: "Blue-Eyes White Dragon", archetype: "Blue-Eyes" });

    const groups = [
      groupedCard(heroA, [instance("i1", "h1"), instance("i2", "h1")]),
      groupedCard(heroB, [instance("i3", "h2")]),
      groupedCard(blueEyes, [instance("i4", "b1")]),
    ];

    const buckets = groupCollection(groups, "archetype");
    expect(buckets).not.toBeNull();

    const heroBucket = buckets!.find((b) => b.label === "HERO");
    expect(heroBucket).toBeDefined();
    // 12 owned copies example from the spec's UX shape: here 2 + 1 = 3
    // owned copies across 2 distinct HERO cards.
    expect(heroBucket?.ownedTotal).toBe(3);
    expect(heroBucket?.distinctCount).toBe(2);

    const blueEyesBucket = buckets!.find((b) => b.label === "Blue-Eyes");
    expect(blueEyesBucket?.ownedTotal).toBe(1);
    expect(blueEyesBucket?.distinctCount).toBe(1);
  });

  it("2. never infers archetype from a name substring - only the archetype column is used", () => {
    // Name contains "HERO" but the archetype column is null - this
    // must NOT be bucketed with real HERO archetype cards.
    const fakeHero = catalogCard({
      id: "f1",
      name: "Amazoness Herald",
      archetype: null,
    });
    const realHero = catalogCard({
      id: "h1",
      name: "Elemental HERO Sparkman",
      archetype: "HERO",
    });

    const groups = [
      groupedCard(fakeHero, [instance("i1", "f1")]),
      groupedCard(realHero, [instance("i2", "h1")]),
    ];

    const buckets = groupCollection(groups, "archetype")!;
    const heroBucket = buckets.find((b) => b.label === "HERO");
    const genericBucket = buckets.find((b) => b.label === "Generic / Other");

    expect(heroBucket?.distinctCount).toBe(1);
    expect(genericBucket?.distinctCount).toBe(1);
    expect(genericBucket?.cards[0].card.id).toBe("f1");
  });

  it("3. cards with no archetype land in a single 'Generic / Other' bucket, sorted last", () => {
    const generic1 = catalogCard({ id: "g1", name: "Pot of Greed", archetype: null });
    const generic2 = catalogCard({ id: "g2", name: "Mirror Force", archetype: null });
    const blueEyes = catalogCard({ id: "b1", name: "Blue-Eyes White Dragon", archetype: "Blue-Eyes" });

    const groups = [
      groupedCard(generic1, [instance("i1", "g1")]),
      groupedCard(generic2, [instance("i2", "g2")]),
      groupedCard(blueEyes, [
        instance("i3", "b1"),
        instance("i4", "b1"),
        instance("i5", "b1"),
      ]),
    ];

    const buckets = groupCollection(groups, "archetype")!;
    expect(buckets[buckets.length - 1].label).toBe("Generic / Other");
    expect(buckets[buckets.length - 1].distinctCount).toBe(2);
    expect(buckets[buckets.length - 1].ownedTotal).toBe(2);
  });

  it("4. duplicate ownership counts: multiple physical copies of one card all count toward ownedTotal, not distinctCount", () => {
    const blueEyes = catalogCard({ id: "b1", name: "Blue-Eyes White Dragon", archetype: "Blue-Eyes" });
    const redEyes = catalogCard({ id: "r1", name: "Red-Eyes B. Dragon", archetype: "Blue-Eyes" });

    const groups = [
      groupedCard(blueEyes, [
        instance("i1", "b1"),
        instance("i2", "b1"),
        instance("i3", "b1"),
      ]),
      groupedCard(redEyes, [instance("i4", "r1")]),
    ];

    const buckets = groupCollection(groups, "archetype")!;
    const bucket = buckets.find((b) => b.label === "Blue-Eyes");

    // 6 owned cards / 4 distinct example shape from the spec - here 3
    // copies of one card + 1 copy of another = 4 owned, 2 distinct.
    expect(bucket?.ownedTotal).toBe(4);
    expect(bucket?.distinctCount).toBe(2);
  });

  it("5. an empty collection produces no buckets", () => {
    const buckets = groupCollection([], "archetype");
    expect(buckets).toEqual([]);
  });
});

describe("groupCollection - type and rarity", () => {
  it("6. groups by card type (Monster/Spell/Trap/Other)", () => {
    const monster = catalogCard({ id: "m1", name: "A Monster", card_type: "Effect Monster" });
    const spell = catalogCard({ id: "s1", name: "A Spell", card_type: "Spell Card" });

    const groups = [
      groupedCard(monster, [instance("i1", "m1")]),
      groupedCard(spell, [instance("i2", "s1")]),
    ];

    const buckets = groupCollection(groups, "type")!;
    expect(buckets.map((b) => b.label)).toEqual(
      expect.arrayContaining(["Monster", "Spell"])
    );
  });

  it("7. returns null when no grouping is requested (flat view)", () => {
    expect(groupCollection([], "")).toBeNull();
  });
});
