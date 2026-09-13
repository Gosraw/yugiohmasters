// Shared card search used by Collection, Trade and Deck browsers.
//
// Search is intentionally broader than card name: players can type things
// they naturally know about a card ("machine", "dark", "quick effect",
// "spellcaster", "legendary", an archetype, etc.) and get matching cards.
//
// Multiple words are ANDed across the combined searchable fields, so
// "dark spellcaster" matches a DARK Spellcaster even when those words live
// in two different database columns.

export type SearchableCard = {
  name?: string | null;
  description?: string | null;
  archetype?: string | null;
  race?: string | null;
  monster_type?: string | null;
  attribute?: string | null;
  card_type?: string | null;
  game_rarity?: string | null;
  atk?: number | null;
  def?: number | null;
  level?: number | null;
  rank?: number | null;
};

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchesCardSearch(
  card: SearchableCard,
  query: string
): boolean {
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return true;
  }

  const fields = [
    card.name,
    card.description,
    card.archetype,
    card.race,
    card.monster_type,
    card.attribute,
    card.card_type,
    card.game_rarity,
    card.atk != null ? `atk ${card.atk}` : null,
    card.def != null ? `def ${card.def}` : null,
    card.level != null ? `level ${card.level}` : null,
    card.rank != null ? `rank ${card.rank}` : null,
  ];

  const haystack = normalize(
    fields
      .filter((value): value is string => Boolean(value))
      .join(" ")
  );

  return normalizedQuery
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}
