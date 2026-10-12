// =========================================================
// SMART DECK SEARCH
//
// Turns what a player types into the deck builder's search box into
// structured filters plus leftover free text:
//
//   "dark warrior level 4 destroy"
//     -> DARK (attribute) · Warrior (monster type) · Level 4
//        + free text "destroy" (matched against name + effect text)
//
// Pure and synchronous - runs on every keystroke in the browser over
// the already-loaded collection, never a server round trip. Every
// recognised word becomes a removable chip; each chip remembers the
// exact characters it came from so removing the chip can remove just
// those words from the search box (removeChipFromQuery).
//
// The same DeckSearchFilters shape is used by the filter sheet, so
// matchesDeckFilters() is the one place that decides what "Warrior"
// or "Quick-Play" means for a card.
// =========================================================

import {
  MONSTER_RACES,
} from "@/lib/card-race";

export const ATTRIBUTES = [
  "DARK",
  "LIGHT",
  "EARTH",
  "WATER",
  "FIRE",
  "WIND",
  "DIVINE",
] as const;

export type CardTypeKey = "monster" | "spell" | "trap";

export const MONSTER_KINDS = [
  "effect",
  "normal",
  "fusion",
  "xyz",
  "ritual",
  "tuner",
  "flip",
  "gemini",
  "union",
  "spirit",
  "toon",
] as const;

export type MonsterKind = (typeof MONSTER_KINDS)[number];

// Values exactly as stored in card_catalog.race for Spell/Trap cards.
export const SPELL_TRAP_TYPES = [
  "Normal",
  "Quick-Play",
  "Continuous",
  "Field",
  "Equip",
  "Counter",
  "Ritual",
] as const;

export type SpellTrapType = (typeof SPELL_TRAP_TYPES)[number];

export type NumberRange = {
  min: number | null;
  max: number | null;
};

export type DeckSearchFilters = {
  cardTypes: CardTypeKey[];
  attributes: string[];
  races: string[];
  kinds: MonsterKind[];
  spellTrapTypes: SpellTrapType[];
  level: NumberRange;
  rank: NumberRange;
  atk: NumberRange;
  def: NumberRange;
};

export type RangeKey = "level" | "rank" | "atk" | "def";

export type SearchChip = {
  // Stable within one parse: "<field>:<value>"
  key: string;
  label: string;
  // Character span(s) of the original query this chip was read from.
  spans: [number, number][];
};

export type ParsedDeckSearch = {
  filters: DeckSearchFilters;
  chips: SearchChip[];
  // Leftover words, lower-case, in the order they were typed.
  terms: string[];
};

export function emptyRange(): NumberRange {
  return {
    min: null,
    max: null,
  };
}

export function emptyFilters(): DeckSearchFilters {
  return {
    cardTypes: [],
    attributes: [],
    races: [],
    kinds: [],
    spellTrapTypes: [],
    level: emptyRange(),
    rank: emptyRange(),
    atk: emptyRange(),
    def: emptyRange(),
  };
}

export function isRangeActive(range: NumberRange): boolean {
  return range.min != null || range.max != null;
}

export function hasActiveFilters(filters: DeckSearchFilters): boolean {
  return (
    filters.cardTypes.length > 0 ||
    filters.attributes.length > 0 ||
    filters.races.length > 0 ||
    filters.kinds.length > 0 ||
    filters.spellTrapTypes.length > 0 ||
    isRangeActive(filters.level) ||
    isRangeActive(filters.rank) ||
    isRangeActive(filters.atk) ||
    isRangeActive(filters.def)
  );
}

// =========================================================
// LABELS (shared by chips and the filter sheet)
// =========================================================

export const KIND_LABELS: Record<MonsterKind, string> = {
  effect: "Effect",
  normal: "Normal",
  fusion: "Fusion",
  xyz: "Xyz",
  ritual: "Ritual",
  tuner: "Tuner",
  flip: "Flip",
  gemini: "Gemini",
  union: "Union",
  spirit: "Spirit",
  toon: "Toon",
};

export const CARD_TYPE_LABELS: Record<CardTypeKey, string> = {
  monster: "Monster",
  spell: "Spell",
  trap: "Trap",
};

const RANGE_LABELS: Record<RangeKey, string> = {
  level: "Level",
  rank: "Rank",
  atk: "ATK",
  def: "DEF",
};

export function rangeLabel(key: RangeKey, range: NumberRange): string {
  const name = RANGE_LABELS[key];
  const { min, max } = range;

  if (min != null && max != null) {
    return min === max ? `${name} ${min}` : `${name} ${min}–${max}`;
  }

  if (min != null) {
    return `${name} ${min}+`;
  }

  if (max != null) {
    return `${name} ≤ ${max}`;
  }

  return name;
}

export function spellTrapLabel(value: SpellTrapType): string {
  return value === "Normal" || value === "Ritual" ? `${value} Spell/Trap` : value;
}

// =========================================================
// VOCABULARY
// =========================================================

type Action =
  | { field: "cardTypes"; value: CardTypeKey }
  | { field: "attributes"; value: string }
  | { field: "races"; value: string }
  | { field: "kinds"; value: MonsterKind }
  | { field: "spellTrapTypes"; value: SpellTrapType };

// phrase (space separated, lower case) -> action
const PHRASES = new Map<string, Action>();

function addPhrase(phrase: string, action: Action) {
  PHRASES.set(phrase, action);
}

for (const attribute of ATTRIBUTES) {
  addPhrase(attribute.toLowerCase(), {
    field: "attributes",
    value: attribute,
  });
}

const RACE_PLURALS: Record<string, string[]> = {
  Fairy: ["fairies"],
  Fish: [],
  Psychic: ["psychics"],
  "Divine-Beast": [],
  "Creator God": [],
  Illusion: ["illusions"],
};

for (const race of MONSTER_RACES) {
  const base = race.toLowerCase().replace(/-/g, " ");

  addPhrase(base, {
    field: "races",
    value: race,
  });

  const plurals = RACE_PLURALS[race] ?? [`${base}s`];

  for (const plural of plurals) {
    addPhrase(plural, {
      field: "races",
      value: race,
    });
  }
}

addPhrase("divine beast", {
  field: "races",
  value: "Divine-Beast",
});

for (const [words, value] of [
  ["monster", "monster"],
  ["monsters", "monster"],
  ["spell", "spell"],
  ["spells", "spell"],
  ["spell card", "spell"],
  ["spell cards", "spell"],
  ["trap", "trap"],
  ["traps", "trap"],
  ["trap card", "trap"],
  ["trap cards", "trap"],
] as const) {
  addPhrase(words, {
    field: "cardTypes",
    value,
  });
}

for (const kind of MONSTER_KINDS) {
  addPhrase(kind, {
    field: "kinds",
    value: kind,
  });
}

addPhrase("xyzs", {
  field: "kinds",
  value: "xyz",
});
addPhrase("fusions", {
  field: "kinds",
  value: "fusion",
});
addPhrase("rituals", {
  field: "kinds",
  value: "ritual",
});
addPhrase("tuners", {
  field: "kinds",
  value: "tuner",
});

for (const [words, value] of [
  ["quick play", "Quick-Play"],
  ["quickplay", "Quick-Play"],
  ["continuous", "Continuous"],
  ["field", "Field"],
  ["equip", "Equip"],
  ["counter", "Counter"],
] as const) {
  addPhrase(words, {
    field: "spellTrapTypes",
    value,
  });
}

const MAX_PHRASE_WORDS = 3;

// "effect" is very common in effect text ("negate the effect"), so on
// its own it only becomes a filter when nothing else is left to
// search for - or when it's spelled out as "effect monster(s)".
const WEAK_PHRASES = new Set(["effect"]);

const SPELL_WORDS = new Set(["spell", "spells"]);
const SPELL_OR_TRAP_WORDS = new Set(["spell", "spells", "trap", "traps"]);
const MONSTER_WORDS = new Set(["monster", "monsters"]);

const STAT_KEYWORDS: Record<string, RangeKey> = {
  atk: "atk",
  attack: "atk",
  def: "def",
  defense: "def",
  defence: "def",
  level: "level",
  lvl: "level",
  lv: "level",
  star: "level",
  stars: "level",
  rank: "rank",
  rk: "rank",
};

// =========================================================
// TOKENIZER
// =========================================================

type Token = {
  text: string;
  start: number;
  end: number;
};

const TOKEN_RE = /\S+/g;
const EDGE_PUNCT_RE = /^[("'“”‘’,.;!?]+|[)"'“”‘’,.;!?]+$/g;
const HAS_DIGIT_RE = /\d/;

function tokenize(query: string): Token[] {
  const tokens: Token[] = [];

  for (const match of query.matchAll(TOKEN_RE)) {
    const raw = match[0];
    const rawStart = match.index ?? 0;
    const stripped = raw.replace(EDGE_PUNCT_RE, "");

    if (!stripped) {
      continue;
    }

    const start = rawStart + raw.indexOf(stripped);
    const text = stripped.toLowerCase();

    // "beast-warrior" / "quick-play" -> separate words so the phrase
    // table only needs the space-separated form. Tokens with digits
    // ("4-6", "atk>=2000") stay whole for the stat parser.
    if (!HAS_DIGIT_RE.test(text) && text.includes("-")) {
      let offset = 0;

      for (const part of text.split("-")) {
        if (part) {
          tokens.push({
            text: part,
            start: start + offset,
            end: start + offset + part.length,
          });
        }

        offset += part.length + 1;
      }

      continue;
    }

    tokens.push({
      text,
      start,
      end: start + stripped.length,
    });
  }

  return tokens;
}

// =========================================================
// STAT PARSING (level / rank / atk / def)
// =========================================================

// "4", "4+", "4-", "4-6", ">=4", "<4", "=4"
const VALUE_RE = /^(>=|<=|>|<|=|:)?(\d{1,5})(\+|-|-(\d{1,5}))?$/;
// keyword glued to the value: "lv4", "atk>=2000", "level:4", "rank4+"
const GLUED_RE = /^([a-z]+)(>=|<=|>|<|=|:)?(\d{1,5})(\+|-|-(\d{1,5}))?$/;
const OPERATOR_RE = /^(>=|<=|>|<|=|:)$/;
// "4star", "4-star", "4stars"
const STAR_RE = /^(\d{1,2})-?stars?$/;

function rangeFrom(
  operator: string | undefined,
  value: number,
  suffix: string | undefined,
  upper: string | undefined
): NumberRange {
  if (upper != null) {
    const high = Number(upper);

    return {
      min: Math.min(value, high),
      max: Math.max(value, high),
    };
  }

  if (suffix === "+") {
    return { min: value, max: null };
  }

  if (suffix === "-") {
    return { min: null, max: value };
  }

  switch (operator) {
    case ">=":
      return { min: value, max: null };
    case ">":
      return { min: value + 1, max: null };
    case "<=":
      return { min: null, max: value };
    case "<":
      return { min: null, max: value - 1 };
    default:
      return { min: value, max: value };
  }
}

type StatMatch = {
  key: RangeKey;
  range: NumberRange;
  consumed: number;
};

function matchStat(tokens: Token[], index: number): StatMatch | null {
  const first = tokens[index].text;

  const star = STAR_RE.exec(first);

  if (star) {
    return {
      key: "level",
      range: rangeFrom(undefined, Number(star[1]), undefined, undefined),
      consumed: 1,
    };
  }

  // "4 star(s)"
  if (/^\d{1,2}$/.test(first) && /^stars?$/.test(tokens[index + 1]?.text ?? "")) {
    return {
      key: "level",
      range: rangeFrom(undefined, Number(first), undefined, undefined),
      consumed: 2,
    };
  }

  const glued = GLUED_RE.exec(first);

  if (glued && STAT_KEYWORDS[glued[1]] && glued[1] !== "star" && glued[1] !== "stars") {
    return {
      key: STAT_KEYWORDS[glued[1]],
      range: rangeFrom(glued[2], Number(glued[3]), glued[4], glued[5]),
      consumed: 1,
    };
  }

  const key = STAT_KEYWORDS[first];

  if (!key || first === "star" || first === "stars") {
    return null;
  }

  const second = tokens[index + 1]?.text;

  if (second == null) {
    return null;
  }

  const value = VALUE_RE.exec(second);

  if (value) {
    return {
      key,
      range: rangeFrom(value[1], Number(value[2]), value[3], value[4]),
      consumed: 2,
    };
  }

  // "atk >= 2000"
  const third = tokens[index + 2]?.text;

  if (OPERATOR_RE.test(second) && third != null) {
    const afterOperator = VALUE_RE.exec(third);

    if (afterOperator && !afterOperator[1]) {
      return {
        key,
        range: rangeFrom(second, Number(afterOperator[2]), afterOperator[3], afterOperator[4]),
        consumed: 3,
      };
    }
  }

  return null;
}

// =========================================================
// PARSER
// =========================================================

type PendingChip = {
  action: Action;
  spans: [number, number][];
  weak: boolean;
  // token index range this chip consumed (for weak -> text fallback)
  tokenStart: number;
  tokenEnd: number;
};

function resolveContextual(
  action: Action,
  phrase: string,
  previous: string | undefined,
  next: string | undefined
): Action {
  // "ritual spell" / "normal trap" mean the Spell/Trap subtype, not a
  // Ritual/Normal Monster.
  if (phrase === "ritual" && (SPELL_WORDS.has(next ?? "") || SPELL_WORDS.has(previous ?? ""))) {
    return {
      field: "spellTrapTypes",
      value: "Ritual",
    };
  }

  if (
    phrase === "normal" &&
    (SPELL_OR_TRAP_WORDS.has(next ?? "") || SPELL_OR_TRAP_WORDS.has(previous ?? ""))
  ) {
    return {
      field: "spellTrapTypes",
      value: "Normal",
    };
  }

  return action;
}

function actionKey(action: Action): string {
  return `${action.field}:${action.value}`;
}

function actionLabel(action: Action): string {
  switch (action.field) {
    case "cardTypes":
      return CARD_TYPE_LABELS[action.value];
    case "kinds":
      return KIND_LABELS[action.value];
    case "spellTrapTypes":
      return spellTrapLabel(action.value);
    default:
      return action.value;
  }
}

function applyAction(filters: DeckSearchFilters, action: Action) {
  const list = filters[action.field] as string[];

  if (!list.includes(action.value)) {
    list.push(action.value);
  }
}

function mergeRange(current: NumberRange, next: NumberRange): NumberRange {
  return {
    min: next.min ?? current.min,
    max: next.max ?? current.max,
  };
}

export function parseDeckSearch(query: string): ParsedDeckSearch {
  const tokens = tokenize(query);
  const filters = emptyFilters();
  const pending: PendingChip[] = [];
  const rangeChips = new Map<RangeKey, [number, number][]>();
  const textTokens: { index: number; text: string }[] = [];

  let index = 0;

  while (index < tokens.length) {
    const stat = matchStat(tokens, index);

    if (stat) {
      filters[stat.key] = mergeRange(filters[stat.key], stat.range);

      const spans = rangeChips.get(stat.key) ?? [];

      spans.push([tokens[index].start, tokens[index + stat.consumed - 1].end]);
      rangeChips.set(stat.key, spans);

      index += stat.consumed;
      continue;
    }

    let matched = false;

    for (let size = Math.min(MAX_PHRASE_WORDS, tokens.length - index); size >= 1; size--) {
      const phrase = tokens
        .slice(index, index + size)
        .map((token) => token.text)
        .join(" ");

      const base = PHRASES.get(phrase);

      if (!base) {
        continue;
      }

      const next = tokens[index + size]?.text;
      const previous = tokens[index - 1]?.text;
      const action = resolveContextual(base, phrase, previous, next);

      pending.push({
        action,
        spans: [[tokens[index].start, tokens[index + size - 1].end]],
        weak: WEAK_PHRASES.has(phrase) && !MONSTER_WORDS.has(next ?? ""),
        tokenStart: index,
        tokenEnd: index + size,
      });

      index += size;
      matched = true;
      break;
    }

    if (!matched) {
      textTokens.push({
        index,
        text: tokens[index].text,
      });

      index += 1;
    }
  }

  const strongText = textTokens.length > 0;
  const chipsByKey = new Map<string, SearchChip>();

  for (const chip of pending) {
    if (chip.weak && strongText) {
      for (let i = chip.tokenStart; i < chip.tokenEnd; i++) {
        textTokens.push({
          index: i,
          text: tokens[i].text,
        });
      }

      continue;
    }

    applyAction(filters, chip.action);

    const key = actionKey(chip.action);
    const existing = chipsByKey.get(key);

    if (existing) {
      existing.spans.push(...chip.spans);
    } else {
      chipsByKey.set(key, {
        key,
        label: actionLabel(chip.action),
        spans: [...chip.spans],
      });
    }
  }

  for (const [key, spans] of rangeChips) {
    chipsByKey.set(`range:${key}`, {
      key: `range:${key}`,
      label: rangeLabel(key, filters[key]),
      spans,
    });
  }

  textTokens.sort((a, b) => a.index - b.index);

  return {
    filters,
    chips: [...chipsByKey.values()].sort((a, b) => a.spans[0][0] - b.spans[0][0]),
    terms: textTokens.map((token) => token.text),
  };
}

/**
 * Removes the words a chip was read from, leaving the rest of the
 * query (and the player's own spacing between the other words) alone.
 */
export function removeChipFromQuery(query: string, chip: SearchChip): string {
  const spans = [...chip.spans].sort((a, b) => b[0] - a[0]);
  let result = query;

  for (const [start, end] of spans) {
    result = result.slice(0, start) + result.slice(end);
  }

  return result.replace(/\s{2,}/g, " ").trim();
}

// =========================================================
// MATCHING
// =========================================================

export type FilterableCard = {
  card_type: string;
  // card_catalog.monster_type: YGOPRODeck's type line, e.g.
  // "Warrior / Tuner / Effect"
  monster_type: string | null;
  race: string | null;
  attribute: string | null;
  level: number | null;
  rank: number | null;
  atk: number | null;
  def: number | null;
};

export function cardTypeKey(cardType: string): CardTypeKey {
  const normalized = cardType.toLowerCase();

  if (normalized.includes("spell")) {
    return "spell";
  }

  if (normalized.includes("trap")) {
    return "trap";
  }

  return "monster";
}

export function cardHasKind(card: FilterableCard, kind: MonsterKind): boolean {
  const type = card.card_type.toLowerCase();

  if (!type.includes("monster")) {
    return false;
  }

  const line = (card.monster_type ?? "").toLowerCase();

  switch (kind) {
    case "normal":
      return type.includes("normal");
    case "effect":
      return line ? line.includes("effect") : type.includes("effect");
    default:
      return type.includes(kind) || line.includes(kind);
  }
}

function inRange(value: number | null, range: NumberRange): boolean {
  if (range.min == null && range.max == null) {
    return true;
  }

  if (value == null) {
    return false;
  }

  return (range.min == null || value >= range.min) && (range.max == null || value <= range.max);
}

export function matchesDeckFilters(card: FilterableCard, filters: DeckSearchFilters): boolean {
  if (filters.cardTypes.length > 0 && !filters.cardTypes.includes(cardTypeKey(card.card_type))) {
    return false;
  }

  if (filters.attributes.length > 0 && !filters.attributes.includes(card.attribute ?? "")) {
    return false;
  }

  if (filters.races.length > 0) {
    const isMonster = cardTypeKey(card.card_type) === "monster";

    if (!isMonster || !filters.races.includes(card.race ?? "")) {
      return false;
    }
  }

  if (filters.kinds.length > 0 && !filters.kinds.some((kind) => cardHasKind(card, kind))) {
    return false;
  }

  if (filters.spellTrapTypes.length > 0) {
    const isSpellOrTrap = cardTypeKey(card.card_type) !== "monster";

    if (!isSpellOrTrap || !filters.spellTrapTypes.includes((card.race ?? "") as SpellTrapType)) {
      return false;
    }
  }

  return (
    inRange(card.level, filters.level) &&
    inRange(card.rank, filters.rank) &&
    inRange(card.atk, filters.atk) &&
    inRange(card.def, filters.def)
  );
}

/**
 * Lower-cases and strips accents/punctuation so "Blue-Eyes" and
 * "blue eyes" compare equal. Shared by the free-text search.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
