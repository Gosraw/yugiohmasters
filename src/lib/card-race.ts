// =========================================================
// MONSTER TYPE / RACE FILTER (Tracks 4-6, 2026-08-27)
//
// "Race" is the real, already-indexed card_catalog column
// (card_catalog_race_idx - see 202608190002_card_catalog.sql) that
// holds YGOPRODeck's Monster Type value (Dragon, Spellcaster,
// Warrior, ...) verbatim - this is what players mean by "Type" when
// they ask to filter by monster type, distinct from card_catalog.
// card_type (Monster/Spell/Trap) which Collection/Deck Builder/Trade
// already filter on separately. Every filter surface below reads
// this single real column directly - none of them ever infer a
// monster's type from its name or archetype.
//
// The list is a fixed, hardcoded set (Spell/Trap rows have no race
// worth filtering on, and YGOPRODeck's own race vocabulary for
// monsters is small and stable) rather than a query against distinct
// catalog values, specifically so opening a filter dropdown never
// costs a database round trip - see the Track 8 performance audit
// for the "no query per filter interaction" requirement this serves.
// =========================================================

export const MONSTER_RACES = [
  "Aqua",
  "Beast",
  "Beast-Warrior",
  "Creator God",
  "Cyberse",
  "Dinosaur",
  "Divine-Beast",
  "Dragon",
  "Fairy",
  "Fiend",
  "Fish",
  "Illusion",
  "Insect",
  "Machine",
  "Plant",
  "Psychic",
  "Pyro",
  "Reptile",
  "Rock",
  "Sea Serpent",
  "Spellcaster",
  "Thunder",
  "Warrior",
  "Winged Beast",
  "Wyrm",
  "Zombie",
] as const;

export type MonsterRace = (typeof MONSTER_RACES)[number];

/**
 * True when a card's real `race` column matches the selected filter
 * value. An empty/falsy `filterRace` always matches (no filter
 * applied) - callers never need a separate "is a filter active"
 * branch before calling this.
 */
export function matchesRace(
  cardRace: string | null | undefined,
  filterRace: string | null | undefined
): boolean {
  if (!filterRace) {
    return true;
  }

  return cardRace === filterRace;
}
