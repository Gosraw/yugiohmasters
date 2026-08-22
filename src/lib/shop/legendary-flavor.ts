// =========================================================
// LEGENDARY FLAVOR TEXT (Duelist Circle Chronicle)
//
// A deterministic, cacheable flavor-text generator for
// Legendary pulls in the pack opening reveal. NOT a live AI
// call - too slow, too expensive, and not reproducible. This
// is a pure function of a card's own catalog metadata
// (attribute, monster type, archetype, level/rank/link,
// atk/def), so the SAME card always produces the SAME text -
// safe to compute on every render, no storage needed.
//
// IMPORTANT: this is deliberately ORIGINAL Duelist Circle
// flavor, presented AS Duelist Circle flavor - never invented
// as if it were official Yu-Gi-Oh! lore. Every generated line
// is framed through "the Circle" / "Duelists of the Circle" /
// "the Chronicle", not through any official card story.
// =========================================================

export type FlavorCardInput = {
  id: string;

  name: string;

  attribute:
    | string
    | null;

  monster_type:
    | string
    | null;

  archetype:
    | string
    | null;

  card_type:
    string;

  atk:
    | number
    | null;

  def:
    | number
    | null;

  level:
    | number
    | null;

  rank:
    | number
    | null;

  link_rating:
    | number
    | null;
};

// A small, fast, fully deterministic string hash (FNV-1a,
// 32-bit). Never Math.random(), never Date.now() - the whole
// point is that the same card id always yields the same
// number, every time, on every render, forever.
function stableHash(
  input: string
): number {
  let hash = 0x811c9dc5;

  for (
    let i = 0;
    i < input.length;
    i += 1
  ) {
    hash ^=
      input.charCodeAt(i);

    hash =
      Math.imul(
        hash,
        0x01000193
      ) >>> 0;
  }

  return hash >>> 0;
}

function pick<T>(
  options: readonly T[],
  seed: number
): T {
  return options[
    seed %
      options.length
  ];
}

// ---------------------------------------------------------
// ATTRIBUTE LINES — the Circle's own read on each attribute's
// character, not the official Yu-Gi-Oh! attribute meaning.
// ---------------------------------------------------------

const ATTRIBUTE_LINES: Record<
  string,
  readonly string[]
> = {
  DARK: [
    "Duelists of the Circle say a DARK legend doesn't arrive so much as it stops pretending it was never there.",
    "The Chronicle marks DARK cards like this one with a single word: inevitable.",
  ],

  LIGHT: [
    "Even veteran duelists of the Circle go quiet when a LIGHT card of this caliber hits the table.",
    "The Circle's old hands call this kind of LIGHT pull a 'clean read' - the kind of card that ends arguments.",
  ],

  FIRE: [
    "The Circle has a saying for FIRE cards like this: the table gets warmer before anyone notices why.",
    "Duelists trade this FIRE card's name the way they trade dueling scars - carefully, and only once.",
  ],

  WATER: [
    "The Chronicle notes that WATER legends of this rank tend to surface exactly when a duel needs them to.",
    "Circle lore holds that a WATER card this rare chooses its duelist as much as the other way around.",
  ],

  EARTH: [
    "The Circle's Chronicle calls EARTH cards of this caliber 'foundation pulls' - the ones a whole deck gets built around.",
    "Duelists of the Circle treat a find like this EARTH card the way you'd treat bedrock: quietly, permanently trusted.",
  ],

  WIND: [
    "The Circle says a WIND legend like this one is felt in the room before it's ever seen on the table.",
    "This WIND card's reputation among Circle duelists arrived well before this particular copy did.",
  ],

  DIVINE: [
    "The Chronicle keeps very few entries under DIVINE - this pull just earned one.",
    "Circle duelists don't talk about DIVINE pulls casually. They just remember exactly where they were.",
  ],
};

const ATTRIBUTE_LINES_FALLBACK =
  [
    "The Circle's Chronicle doesn't have a category wide enough for this one - so it gets its own line.",
  ] as const;

// ---------------------------------------------------------
// MONSTER TYPE LINES
// ---------------------------------------------------------

const TYPE_LINES: Record<
  string,
  readonly string[]
> = {
  Dragon: [
    "Dragons in Circle lore aren't summoned so much as negotiated with.",
    "The Chronicle lists this bloodline among the Circle's oldest recorded Dragon sightings.",
  ],

  Spellcaster: [
    "Circle Spellcasters are graded less on power and more on how little warning they give.",
    "The Chronicle credits this Spellcaster with turning at least one recorded Circle duel on its head.",
  ],

  Warrior: [
    "The Circle keeps a short, well-respected list of Warriors who never needed a second card to close a duel. This one's on it.",
    "Duelists of the Circle call this kind of Warrior a 'closer' - the card you save the moment for.",
  ],

  Fiend: [
    "The Circle's Chronicle files Fiends like this one under 'handle with a plan already in place.'",
    "This Fiend's Circle reputation is built entirely on duelists who underestimated it exactly once.",
  ],

  Machine: [
    "The Circle treats a Machine of this caliber less like a card and more like an inevitability with a serial number.",
    "This Machine's Circle file is thin, precise, and ends with the same word every time: efficient.",
  ],

  "Winged Beast": [
    "The Circle's oldest duelists still describe this Winged Beast's entrance the same way, decades later.",
    "Winged Beasts like this one are, per Circle Chronicle tradition, always announced before they're explained.",
  ],

  Fairy: [
    "The Circle's Chronicle keeps Fairies of this rank filed separately - not stronger on paper, just harder to counter cleanly.",
    "Duelists of the Circle trust a Fairy like this one precisely because it's never needed to raise its voice.",
  ],

  Beast: [
    "The Circle's Chronicle describes this Beast the way old duelists describe close calls: respectfully.",
    "This Beast earned its place in Circle lore by refusing to lose the same way twice.",
  ],

  "Beast-Warrior": [
    "The Circle rates Beast-Warriors like this one on instinct as much as strength - and this one tests high on both.",
  ],

  Zombie: [
    "The Circle's Chronicle notes, dryly, that this Zombie has outlasted several duelists who swore they'd retired it.",
  ],

  Aqua: [
    "Circle lore treats Aqua legends like this one as patient - they wait exactly as long as the duel requires.",
  ],

  Reptile: [
    "The Chronicle files this Reptile under 'coiled' - Circle shorthand for a card that wins by waiting.",
  ],

  Insect: [
    "The Circle's Chronicle notes this Insect legend the way it notes most of its kind: quietly, then suddenly not.",
  ],

  Plant: [
    "Circle duelists describe a Plant of this caliber as slow to arrive and impossible to remove once it has.",
  ],

  Rock: [
    "The Chronicle's entry on this Rock-type reads like most of its kind: short, blunt, and absolutely final.",
  ],

  Fish: [
    "Circle lore treats a Fish-type legend like this one as a current you don't notice until it's already moved the duel.",
  ],

  "Sea Serpent": [
    "The Chronicle keeps this Sea Serpent's entry short - Circle duelists say it speaks for itself on the table.",
  ],

  Pyro: [
    "This Pyro-type's Circle reputation is built on timing - duelists remember exactly when it went off, not just that it did.",
  ],

  Thunder: [
    "The Circle's Chronicle describes this Thunder-type the same way most duelists remember it: all at once.",
  ],

  Psychic: [
    "Circle lore holds that a Psychic-type of this caliber wins duels before its opponent finishes reading the card.",
  ],

  Divine_beast: [
    "The Chronicle keeps this Divine-Beast's file thin on purpose - some Circle legends are better left mostly unexplained.",
  ],

  Cyberse: [
    "The Circle's newer duelists rate this Cyberse legend the way old-timers rate their favorite Dragons: without hesitation.",
  ],

  Wyrm: [
    "Circle Chronicle entries on Wyrm-types this rare tend to end the same way: 'still undefeated, as far as anyone's recorded.'",
  ],
};

const TYPE_LINES_FALLBACK = [
  "The Circle's Chronicle doesn't file this one under any familiar category - which duelists tend to agree is fitting.",
] as const;

// ---------------------------------------------------------
// SPELL / TRAP LINES (Legendary is rare here, but the copy
// limit doesn't discriminate by card_type - cover it cleanly)
// ---------------------------------------------------------

const SPELL_TRAP_LINES = [
  "The Circle's Chronicle doesn't usually make room for a Spell or Trap - this one earned an exception.",
  "Duelists of the Circle trade fewer stories about Spells and Traps than Monsters. This is one of the ones they do tell.",
] as const;

// ---------------------------------------------------------
// MECHANICAL CLOSER LINE — grounds the flavor in the card's
// own numbers so it never reads as fully generic.
// ---------------------------------------------------------

function mechanicalLine(
  card: FlavorCardInput
) {
  if (
    card.link_rating != null &&
    card.link_rating > 0
  ) {
    return `LINK-${card.link_rating}, ATK ${card.atk ?? "?"}. The Circle's Chronicle notes it's rare for a Link this size to also be this quiet on the table.`;
  }

  if (
    card.rank != null &&
    card.rank > 0
  ) {
    return `Rank ${card.rank}, ATK ${card.atk ?? "?"} / DEF ${card.def ?? "?"}. The Chronicle lists few Xyz monsters of this Rank still in active Circle rotation.`;
  }

  if (
    card.level != null &&
    card.level > 0
  ) {
    return `Level ${card.level}, ATK ${card.atk ?? "?"} / DEF ${card.def ?? "?"}. Circle duelists still argue about whether the Level undersells it.`;
  }

  if (card.atk != null) {
    return `ATK ${card.atk}${card.def != null ? ` / DEF ${card.def}` : ""}. The numbers alone don't explain the reputation - the Circle's duelists insist you have to see it played.`;
  }

  return "The Circle's own records on this card are more about what duelists remember than what's printed on it.";
}

// ---------------------------------------------------------
// ARCHETYPE LINE
// ---------------------------------------------------------

function archetypeLine(
  card: FlavorCardInput
) {
  if (!card.archetype) {
    return null;
  }

  return `Filed in the Circle's Chronicle under the ${card.archetype} line - duelists who run it tend to name it specifically when they talk about the pull.`;
}

// ---------------------------------------------------------
// MAIN ENTRY POINT
// ---------------------------------------------------------

export function generateLegendaryFlavor(
  card: FlavorCardInput
): string[] {
  const seed = stableHash(
    card.id
  );

  const lines: string[] =
    [];

  if (
    card.card_type &&
    !card.card_type
      .toLowerCase()
      .includes("monster")
  ) {
    lines.push(
      pick(
        SPELL_TRAP_LINES,
        seed
      )
    );
  } else if (
    card.attribute &&
    ATTRIBUTE_LINES[
      card.attribute
    ]
  ) {
    lines.push(
      pick(
        ATTRIBUTE_LINES[
          card.attribute
        ],
        seed
      )
    );
  } else {
    lines.push(
      pick(
        ATTRIBUTE_LINES_FALLBACK,
        seed
      )
    );
  }

  if (
    card.card_type &&
    card.card_type
      .toLowerCase()
      .includes("monster")
  ) {
    if (
      card.monster_type &&
      TYPE_LINES[
        card.monster_type
      ]
    ) {
      lines.push(
        pick(
          TYPE_LINES[
            card.monster_type
          ],
          seed >>> 3
        )
      );
    } else {
      lines.push(
        pick(
          TYPE_LINES_FALLBACK,
          seed >>> 3
        )
      );
    }
  }

  const archetype =
    archetypeLine(card);

  if (archetype) {
    lines.push(archetype);
  }

  lines.push(
    mechanicalLine(card)
  );

  return lines;
}
