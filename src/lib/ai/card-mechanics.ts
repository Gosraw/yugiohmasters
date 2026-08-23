// =========================================================
// CARD MECHANICS - deterministic tag extraction
//
// Turns a card's real card_catalog fields (mainly its effect
// text) into a small set of structured "mechanic tags". This is
// intentionally simple and reproducible - plain keyword/phrase
// matching against the card's own text, no AI involved, same
// input always produces the same output. It is the STEP 1
// "deterministic candidate generation" input described in the
// V1.2 instruction: mechanic tags, text patterns, card type,
// level/rank compatibility, materials, attribute/type, GY/banish/
// discard interactions, archetype, deck role.
//
// Deliberately NOT built as "send 14,000 cards to an AI and ask
// which are good" - this file never calls any AI provider. It is
// pure, synchronous, and safe to run against the full catalog on
// every request if needed.
//
// Where a card has both a "sends X away" and a "benefits from X"
// reading (Graveyard and discard both work this way), two
// directional tags are produced instead of one generic tag, so
// candidate generation can specifically pair a sender with a
// payoff card - the flagship example from the product spec
// ("Card X sends monsters to the Graveyard, Card Y benefits from
// monsters being in the Graveyard").
// =========================================================

export type MechanicTag =
  | "sends_to_graveyard"
  | "uses_graveyard"
  | "discards"
  | "benefits_from_discard"
  | "banishes"
  | "benefits_from_banish"
  | "special_summons"
  | "normal_summons_extra"
  | "tributes"
  | "searches"
  | "draws"
  | "destroys"
  | "negates"
  | "targets"
  | "battle_effect"
  | "resource_generation"
  | "xyz_material_user"
  | "fusion_material_user"
  | "synchro_material_user"
  | "link_material_user"
  | "spell_trap_support";

export type MechanicCardInput = {
  id: string;
  name: string;
  card_type: string | null;
  monster_type: string | null;
  attribute: string | null;
  archetype: string | null;
  level: number | null;
  rank: number | null;
  link_rating: number | null;
  atk: number | null;
  def: number | null;
  description: string | null;
};

type TagRule = {
  tag: MechanicTag;
  test: (text: string) => boolean;
};

// Order matters for the directional GY/discard/banish pairs: the
// "sends/discards/banishes" rule is checked first so its matched
// phrase can be excluded from the complementary "uses/benefits"
// rule below, keeping the two tags meaningfully distinct instead
// of firing on the exact same sentence.
const SENDS_TO_GY_PATTERN =
  /(send|sent|mill(?:ed)?|discard(?:s|ed)?)[^.]{0,60}graveyard/i;

const USES_GY_PATTERN =
  /graveyard/i;

const DISCARDS_PATTERN =
  /discard(?:s|ed)? (?:1|a|this card|\d+ card)/i;

const BENEFITS_FROM_DISCARD_PATTERN =
  /(if|when|whenever) (?:this card|a card|you)[^.]{0,40}discard/i;

const BANISHES_PATTERN =
  /banish (?:1|a|\d+)/i;

const BENEFITS_FROM_BANISH_PATTERN =
  /(if|when|whenever)[^.]{0,40}banish/i;

const RULES: TagRule[] = [
  {
    tag: "sends_to_graveyard",
    test: (t) => SENDS_TO_GY_PATTERN.test(t),
  },
  {
    tag: "uses_graveyard",
    test: (t) =>
      USES_GY_PATTERN.test(t) &&
      !SENDS_TO_GY_PATTERN.test(t),
  },
  {
    tag: "discards",
    test: (t) => DISCARDS_PATTERN.test(t),
  },
  {
    tag: "benefits_from_discard",
    test: (t) => BENEFITS_FROM_DISCARD_PATTERN.test(t),
  },
  {
    tag: "banishes",
    test: (t) => BANISHES_PATTERN.test(t),
  },
  {
    tag: "benefits_from_banish",
    test: (t) => BENEFITS_FROM_BANISH_PATTERN.test(t),
  },
  {
    tag: "special_summons",
    test: (t) => /special summon/i.test(t),
  },
  {
    tag: "normal_summons_extra",
    test: (t) =>
      /you can (?:also )?normal summon/i.test(t),
  },
  {
    tag: "tributes",
    test: (t) => /tribute/i.test(t),
  },
  {
    tag: "searches",
    test: (t) =>
      /add[^.]{0,40}from your deck to your hand/i.test(t),
  },
  {
    tag: "draws",
    test: (t) => /draw (?:1|a|\d+) card/i.test(t),
  },
  {
    tag: "destroys",
    test: (t) => /destroy/i.test(t),
  },
  {
    tag: "negates",
    test: (t) => /negate/i.test(t),
  },
  {
    tag: "targets",
    test: (t) => /target/i.test(t),
  },
  {
    tag: "battle_effect",
    test: (t) =>
      /(battle|attacks?|atk\/?def)/i.test(t),
  },
  {
    tag: "resource_generation",
    test: (t) =>
      /(gain \d+ lp|add|special summon)[^.]{0,30}(from your (deck|hand|graveyard))/i.test(
        t
      ),
  },
  {
    tag: "xyz_material_user",
    test: (t) => /xyz material/i.test(t),
  },
  {
    tag: "fusion_material_user",
    test: (t) => /fusion material/i.test(t),
  },
  {
    tag: "synchro_material_user",
    test: (t) => /synchro material/i.test(t),
  },
  {
    tag: "link_material_user",
    test: (t) => /link material/i.test(t),
  },
];

/**
 * Extracts the structured mechanic tags for one card. Pure and
 * deterministic - the same card_catalog row always produces the
 * same tag set, so callers can cache on card_catalog_id safely.
 */
export function extractMechanicTags(
  card: MechanicCardInput
): MechanicTag[] {
  const text = card.description ?? "";

  const tags = RULES.filter((rule) =>
    rule.test(text)
  ).map((rule) => rule.tag);

  // Spell/Trap support is a structural signal, not a text-pattern
  // one: any non-Monster card that mentions an archetype name is
  // support for that archetype. Detected separately in
  // isSpellTrapSupportFor() below since it needs the OTHER card's
  // archetype, not just this card's own text.
  if (
    card.card_type &&
    !card.card_type.toLowerCase().includes("monster")
  ) {
    tags.push("spell_trap_support");
  }

  return Array.from(new Set(tags));
}

/**
 * True when `supportCard` (expected to be a Spell/Trap) explicitly
 * names `archetypeName` in its own text - a concrete, checkable
 * fact rather than an assumption from card_type alone.
 */
export function isSpellTrapSupportFor(
  supportCard: MechanicCardInput,
  archetypeName: string
): boolean {
  if (!archetypeName) {
    return false;
  }

  if (
    supportCard.card_type &&
    supportCard.card_type
      .toLowerCase()
      .includes("monster")
  ) {
    return false;
  }

  const text = supportCard.description ?? "";

  return text
    .toLowerCase()
    .includes(archetypeName.toLowerCase());
}
