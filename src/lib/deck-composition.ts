// =========================================================
// DECK COMPOSITION - pure, deterministic breakdown of a deck's
// contents (Deck Builder 2.0's live summary panel), and the first
// building block the Deck Doctor (deterministic analysis layer)
// reuses instead of recomputing the same counts twice.
//
// Every function here is pure and synchronous - given the same
// card list, always the same output. No Supabase/AI/network calls.
// Callers (decks/[id]/page.tsx, the future Deck Doctor) already have
// the full card_catalog rows for every deck card in hand (they were
// fetched once per page render already) - this module never fetches
// anything itself, it only derives structure from what's passed in.
// =========================================================

export type DeckCompositionCard = {
  card_catalog_id: string;
  name: string;
  card_type: string;
  monster_type: string | null;
  attribute: string | null;
  level: number | null;
  rank: number | null;
  link_rating: number | null;
  archetype: string | null;
};

export type DeckSectionBreakdown = {
  total: number;
  monsters: number;
  spells: number;
  traps: number;
  normalMonsters: number;
  effectMonsters: number;
};

export type DeckExtraBreakdown = {
  total: number;
  fusion: number;
  xyz: number;
  synchro: number;
  link: number;
};

export type DeckComposition = {
  main: DeckSectionBreakdown;
  extra: DeckExtraBreakdown;
  // level -> count of Main Deck monsters at that level (Normal
  // Monsters and Effect Monsters both included, Extra Deck excluded -
  // Extra Deck cards use Rank/Link Rating instead, see rankDistribution).
  levelDistribution: Record<number, number>;
  // rank -> count of Xyz monsters in the Extra Deck at that rank.
  rankDistribution: Record<number, number>;
  attributeDistribution: Record<string, number>;
  // monster_type (e.g. "Spellcaster", "Dragon") -> count, monsters only.
  monsterTypeDistribution: Record<string, number>;
  // archetype -> count across BOTH sections; cards with no archetype
  // are bucketed under "Generic / Other" (never a name-substring
  // guess - same rule as Collection 2.0's groupCollectionByArchetype).
  archetypeDistribution: Record<string, number>;
};

const GENERIC_OTHER_LABEL = "Generic / Other";

function isMonsterType(cardType: string): boolean {
  return cardType.toLowerCase().includes("monster");
}

function isSpellType(cardType: string): boolean {
  return cardType.toLowerCase().includes("spell");
}

function isTrapType(cardType: string): boolean {
  return cardType.toLowerCase().includes("trap");
}

function isNormalMonster(cardType: string): boolean {
  return cardType.toLowerCase() === "normal monster";
}

function extraKind(
  cardType: string
): "fusion" | "xyz" | "synchro" | "link" | null {
  const normalized = cardType.toLowerCase();
  if (normalized.includes("fusion")) return "fusion";
  if (normalized.includes("xyz")) return "xyz";
  if (normalized.includes("synchro")) return "synchro";
  if (normalized.includes("link")) return "link";
  return null;
}

function bumpDistribution<K extends string | number>(
  record: Record<K, number>,
  key: K
): void {
  record[key] = (record[key] ?? 0) + 1;
}

export function computeDeckComposition(
  mainCards: DeckCompositionCard[],
  extraCards: DeckCompositionCard[]
): DeckComposition {
  const main: DeckSectionBreakdown = {
    total: mainCards.length,
    monsters: 0,
    spells: 0,
    traps: 0,
    normalMonsters: 0,
    effectMonsters: 0,
  };

  const extra: DeckExtraBreakdown = {
    total: extraCards.length,
    fusion: 0,
    xyz: 0,
    synchro: 0,
    link: 0,
  };

  const levelDistribution: Record<number, number> = {};
  const rankDistribution: Record<number, number> = {};
  const attributeDistribution: Record<string, number> = {};
  const monsterTypeDistribution: Record<string, number> = {};
  const archetypeDistribution: Record<string, number> = {};

  for (const card of mainCards) {
    if (isMonsterType(card.card_type)) {
      main.monsters += 1;
      if (isNormalMonster(card.card_type)) {
        main.normalMonsters += 1;
      } else {
        main.effectMonsters += 1;
      }

      if (card.level != null) {
        bumpDistribution(levelDistribution, card.level);
      }
      if (card.attribute) {
        bumpDistribution(attributeDistribution, card.attribute);
      }
      if (card.monster_type) {
        bumpDistribution(monsterTypeDistribution, card.monster_type);
      }
    } else if (isSpellType(card.card_type)) {
      main.spells += 1;
    } else if (isTrapType(card.card_type)) {
      main.traps += 1;
    }

    bumpDistribution(
      archetypeDistribution,
      card.archetype?.trim() || GENERIC_OTHER_LABEL
    );
  }

  for (const card of extraCards) {
    const kind = extraKind(card.card_type);
    if (kind) extra[kind] += 1;

    if (card.attribute) {
      bumpDistribution(attributeDistribution, card.attribute);
    }
    if (card.monster_type) {
      bumpDistribution(monsterTypeDistribution, card.monster_type);
    }
    if (kind === "xyz" && card.rank != null) {
      bumpDistribution(rankDistribution, card.rank);
    }

    bumpDistribution(
      archetypeDistribution,
      card.archetype?.trim() || GENERIC_OTHER_LABEL
    );
  }

  return {
    main,
    extra,
    levelDistribution,
    rankDistribution,
    attributeDistribution,
    monsterTypeDistribution,
    archetypeDistribution,
  };
}

/**
 * "Owned copies vs copies used" - given the player's full owned
 * quantity per catalog card (already computed once per page render
 * by fetchOwnedCollection/the deck page's own collectionCards, never
 * re-queried here) and how many copies are currently placed in this
 * deck, returns the small list of cards where the deck uses fewer
 * copies than the player owns (a concrete, deterministic "you could
 * add more copies" signal) - pure derivation, no I/O.
 */
export type OwnedVsUsedEntry = {
  cardCatalogId: string;
  name: string;
  ownedQuantity: number;
  usedInDeck: number;
  spareCopies: number;
};

export function computeOwnedVsUsed(
  deckCards: { card_catalog_id: string; name: string }[],
  ownedQuantityByCard: Map<string, number>
): OwnedVsUsedEntry[] {
  const usedByCard = new Map<string, number>();
  const nameByCard = new Map<string, string>();

  for (const card of deckCards) {
    usedByCard.set(
      card.card_catalog_id,
      (usedByCard.get(card.card_catalog_id) ?? 0) + 1
    );
    nameByCard.set(card.card_catalog_id, card.name);
  }

  const entries: OwnedVsUsedEntry[] = [];
  for (const [cardCatalogId, usedInDeck] of usedByCard) {
    const ownedQuantity = ownedQuantityByCard.get(cardCatalogId) ?? 0;
    const spareCopies = ownedQuantity - usedInDeck;
    if (spareCopies > 0) {
      entries.push({
        cardCatalogId,
        name: nameByCard.get(cardCatalogId) ?? "",
        ownedQuantity,
        usedInDeck,
        spareCopies,
      });
    }
  }

  entries.sort((a, b) => b.spareCopies - a.spareCopies || a.name.localeCompare(b.name));
  return entries;
}
