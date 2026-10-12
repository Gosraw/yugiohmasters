// Shared shapes for the phone-first deck builder
// (src/app/(app)/decks/[id]/page.tsx -> <DeckBuilder />).
//
// BuilderCard is deliberately "tile weight": everything the browse
// grid, filters, sorting, deck counts and Master Duel export need, but
// NOT the effect text (loaded lazily from /decks/[id]/card-text only
// when a search needs it or a detail sheet opens) and only the small
// card image. Field names match card_catalog's columns so the cards
// can be handed straight to the pure helpers in src/lib.

export type BuilderCopy = {
  // card_instances.id - one physical copy
  id: string;
  copyNumber: number;
  locked: boolean;
};

export type BuilderCard = {
  id: string;
  name: string;
  image: string | null;
  card_type: string;
  monster_type: string | null;
  race: string | null;
  attribute: string | null;
  level: number | null;
  rank: number | null;
  link_rating: number | null;
  atk: number | null;
  def: number | null;
  game_rarity: string | null;
  rarity_score: number | null;
  format_eligible: boolean;
  master_duel_status: string | null;
  archetype: string | null;
  external_card_id: number | null;
  master_duel_card_id: number | null;
  // Owned copies, lowest copy number first.
  copies: BuilderCopy[];
  // May a copy go into a deck? format_eligible, or a Boss-route card
  // when the active format has boss_route_exempt (same rule as
  // is_duelist_circle_deck_legal() in the database).
  deck_legal: boolean;
  // Our own banlist for the active format
  // (duelist_circle_card_limits): 0 = Forbidden, 1/2 = max copies,
  // null = no extra limit (3 like any card).
  copy_limit: number | null;
};

/**
 * Short badge text for our own banlist, or null when the card has no
 * extra limit.
 */
export function copyLimitLabel(limit: number | null): string | null {
  if (limit === null || limit >= 3) {
    return null;
  }

  return limit === 0 ? "Forbidden" : `Max ${limit}`;
}

export type BuilderDeck = {
  id: string;
  name: string;
  status: "draft" | "ready" | "archived";
  isActive: boolean;
};

export type DeckSectionKey = "main" | "extra";

export const MAIN_MIN = 40;
export const MAIN_MAX = 60;
export const EXTRA_MAX = 15;

/**
 * Same rule as add_card_to_deck / validate_deck_card in the database:
 * Fusion and Xyz Monsters go to the Extra Deck, everything else Main.
 */
export function sectionForCardType(cardType: string): DeckSectionKey {
  const normalized = cardType.toLowerCase();

  return /fusion.*monster|xyz.*monster/.test(normalized) ? "extra" : "main";
}

/**
 * YGOPRODeck serves the same art at /cards_small/ (~170px wide, for
 * tiles) and /cards/ (full size, for the detail sheet).
 */
export function largeImage(url: string | null): string | null {
  return url ? url.replace("/cards_small/", "/cards/") : null;
}

// =========================================================
// COMPACT WIRE FORMAT (server -> browser)
//
// The collection is the biggest thing the page sends (often 800+
// cards). As objects, every card repeats ~20 key names, which roughly
// doubles the payload. The page sends each card as a positional tuple
// instead and the builder expands it once on load.
// =========================================================

const SMALL_IMAGE_PREFIX = "https://images.ygoprodeck.com/images/cards_small/";

export type BuilderCardWire = [
  id: string,
  name: string,
  // image URL, or just "<file>" when it is on the usual YGOPRODeck path
  image: string | null,
  cardType: string,
  monsterType: string | null,
  race: string | null,
  attribute: string | null,
  level: number | null,
  rank: number | null,
  linkRating: number | null,
  atk: number | null,
  def: number | null,
  gameRarity: string | null,
  rarityScore: number | null,
  formatEligible: 0 | 1,
  masterDuelStatus: string | null,
  archetype: string | null,
  externalCardId: number | null,
  masterDuelCardId: number | null,
  // "<instance id>:<copy number>[:L]" joined with ","  (L = locked)
  copies: string,
  deckLegal: 0 | 1,
  copyLimit: number | null,
];

export function encodeBuilderCard(card: BuilderCard): BuilderCardWire {
  return [
    card.id,
    card.name,
    card.image?.startsWith(SMALL_IMAGE_PREFIX) ? card.image.slice(SMALL_IMAGE_PREFIX.length) : card.image,
    card.card_type,
    card.monster_type,
    card.race,
    card.attribute,
    card.level,
    card.rank,
    card.link_rating,
    card.atk,
    card.def,
    card.game_rarity,
    card.rarity_score,
    card.format_eligible ? 1 : 0,
    card.master_duel_status,
    card.archetype,
    card.external_card_id,
    card.master_duel_card_id,
    card.copies.map((copy) => `${copy.id}:${copy.copyNumber}${copy.locked ? ":L" : ""}`).join(","),
    card.deck_legal ? 1 : 0,
    card.copy_limit,
  ];
}

export function decodeBuilderCard(wire: BuilderCardWire): BuilderCard {
  const [
    id,
    name,
    image,
    card_type,
    monster_type,
    race,
    attribute,
    level,
    rank,
    link_rating,
    atk,
    def,
    game_rarity,
    rarity_score,
    format_eligible,
    master_duel_status,
    archetype,
    external_card_id,
    master_duel_card_id,
    copies,
    deck_legal,
    copy_limit,
  ] = wire;

  return {
    id,
    name,
    image: image && !image.includes("/") ? `${SMALL_IMAGE_PREFIX}${image}` : image,
    card_type,
    monster_type,
    race,
    attribute,
    level,
    rank,
    link_rating,
    atk,
    def,
    game_rarity,
    rarity_score,
    format_eligible: format_eligible === 1,
    master_duel_status,
    archetype,
    external_card_id,
    master_duel_card_id,
    copies: copies
      ? copies.split(",").map((entry) => {
          const [copyId, copyNumber, locked] = entry.split(":");

          return {
            id: copyId,
            copyNumber: Number(copyNumber),
            locked: locked === "L",
          };
        })
      : [],
    deck_legal: deck_legal === 1,
    copy_limit,
  };
}
