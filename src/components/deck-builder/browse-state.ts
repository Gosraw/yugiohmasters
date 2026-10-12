// =========================================================
// BROWSE STATE - filter sheet + search box, mirrored into the URL
//
// Everything here is pure: the builder keeps this state in React,
// writes it to the address bar with history.replaceState (no Next.js
// navigation, so no server render and no scroll jump) and reads it
// back on load, so a refresh or a shared link restores the same view.
// =========================================================

import {
  CARD_TYPE_LABELS,
  KIND_LABELS,
  emptyFilters,
  isRangeActive,
  matchesDeckFilters,
  normalizeSearchText,
  rangeLabel,
  spellTrapLabel,
  type CardTypeKey,
  type DeckSearchFilters,
  type MonsterKind,
  type NumberRange,
  type ParsedDeckSearch,
  type RangeKey,
  type SpellTrapType,
} from "@/lib/deck-search-parser";

import type {
  BuilderCard,
} from "./types";

export type BuilderTab = "browse" | "deck" | "more";

export type SortKey = "name-asc" | "name-desc" | "rarity" | "power" | "atk" | "def" | "level";

export const SORT_OPTIONS: {
  value: SortKey;
  label: string;
}[] = [
  { value: "name-asc", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
  { value: "rarity", label: "Highest rarity" },
  { value: "power", label: "Highest power" },
  { value: "atk", label: "Highest ATK" },
  { value: "def", label: "Highest DEF" },
  { value: "level", label: "Highest Level/Rank" },
];

export type PanelState = {
  filters: DeckSearchFilters;
  rarity: string;
  archetype: string;
  sort: SortKey;
};

export function emptyPanel(): PanelState {
  return {
    filters: emptyFilters(),
    rarity: "",
    archetype: "",
    sort: "name-asc",
  };
}

export const RARITY_ORDER: Record<string, number> = {
  Legendary: 6,
  "Secret Rare": 5,
  "Ultra Rare": 4,
  "Super Rare": 3,
  Rare: 2,
  Normal: 1,
  "Not Rated": 0,
};

export function rarityName(card: Pick<BuilderCard, "game_rarity">): string {
  return card.game_rarity ?? "Not Rated";
}

// =========================================================
// URL
// =========================================================

const LIST_KEYS = {
  cardTypes: "type",
  attributes: "attr",
  races: "race",
  kinds: "kind",
  spellTrapTypes: "st",
} as const;

const RANGE_KEYS: Record<RangeKey, string> = {
  level: "lv",
  rank: "rk",
  atk: "atk",
  def: "def",
};

// Every key the builder owns. Anything else in the URL (e.g. the
// ?success= banner message) is left alone.
const OWNED_KEYS = [
  "view",
  "q",
  ...Object.values(LIST_KEYS),
  ...Object.values(RANGE_KEYS),
  "rar",
  "arc",
  "sort",
];

function readList(params: URLSearchParams, key: string): string[] {
  return (params.get(key) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readNumber(value: string | undefined): number | null {
  if (value == null || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function readRange(params: URLSearchParams, key: string): NumberRange {
  const raw = params.get(key);

  if (!raw) {
    return { min: null, max: null };
  }

  const [min, max] = raw.split("-");

  return {
    min: readNumber(min),
    max: readNumber(max ?? min),
  };
}

function writeRange(range: NumberRange): string {
  if (!isRangeActive(range)) {
    return "";
  }

  return `${range.min ?? ""}-${range.max ?? ""}`;
}

export function readUrlState(params: URLSearchParams): {
  tab: BuilderTab;
  query: string;
  panel: PanelState;
} {
  const view = params.get("view");
  const sort = params.get("sort") as SortKey | null;

  return {
    tab: view === "deck" || view === "more" ? view : "browse",
    query: params.get("q") ?? "",
    panel: {
      filters: {
        cardTypes: readList(params, LIST_KEYS.cardTypes) as CardTypeKey[],
        attributes: readList(params, LIST_KEYS.attributes),
        races: readList(params, LIST_KEYS.races),
        kinds: readList(params, LIST_KEYS.kinds) as MonsterKind[],
        spellTrapTypes: readList(params, LIST_KEYS.spellTrapTypes) as SpellTrapType[],
        level: readRange(params, RANGE_KEYS.level),
        rank: readRange(params, RANGE_KEYS.rank),
        atk: readRange(params, RANGE_KEYS.atk),
        def: readRange(params, RANGE_KEYS.def),
      },
      rarity: params.get("rar") ?? "",
      archetype: params.get("arc") ?? "",
      sort: sort && SORT_OPTIONS.some((option) => option.value === sort) ? sort : "name-asc",
    },
  };
}

export function writeUrlState(
  current: URLSearchParams,
  state: {
    tab: BuilderTab;
    query: string;
    panel: PanelState;
  }
): URLSearchParams {
  const next = new URLSearchParams(current);

  for (const key of OWNED_KEYS) {
    next.delete(key);
  }

  const set = (key: string, value: string) => {
    if (value) {
      next.set(key, value);
    }
  };

  set("view", state.tab === "browse" ? "" : state.tab);
  set("q", state.query.trim());

  for (const [field, key] of Object.entries(LIST_KEYS) as [keyof typeof LIST_KEYS, string][]) {
    set(key, state.panel.filters[field].join(","));
  }

  for (const [field, key] of Object.entries(RANGE_KEYS) as [RangeKey, string][]) {
    set(key, writeRange(state.panel.filters[field]));
  }

  set("rar", state.panel.rarity);
  set("arc", state.panel.archetype);
  set("sort", state.panel.sort === "name-asc" ? "" : state.panel.sort);

  return next;
}

// =========================================================
// CHIPS FOR THE FILTER SHEET'S CHOICES
// =========================================================

export type PanelChip = {
  key: string;
  label: string;
  clear: (panel: PanelState) => PanelState;
};

function withoutValue<K extends keyof typeof LIST_KEYS>(
  panel: PanelState,
  field: K,
  value: DeckSearchFilters[K][number]
): PanelState {
  return {
    ...panel,
    filters: {
      ...panel.filters,
      [field]: (panel.filters[field] as string[]).filter((item) => item !== value),
    },
  };
}

export function panelChips(panel: PanelState): PanelChip[] {
  const chips: PanelChip[] = [];
  const { filters } = panel;

  for (const value of filters.cardTypes) {
    chips.push({
      key: `type:${value}`,
      label: CARD_TYPE_LABELS[value],
      clear: (state) => withoutValue(state, "cardTypes", value),
    });
  }

  for (const value of filters.kinds) {
    chips.push({
      key: `kind:${value}`,
      label: KIND_LABELS[value],
      clear: (state) => withoutValue(state, "kinds", value),
    });
  }

  for (const value of filters.spellTrapTypes) {
    chips.push({
      key: `st:${value}`,
      label: spellTrapLabel(value),
      clear: (state) => withoutValue(state, "spellTrapTypes", value),
    });
  }

  for (const value of filters.attributes) {
    chips.push({
      key: `attr:${value}`,
      label: value,
      clear: (state) => withoutValue(state, "attributes", value),
    });
  }

  for (const value of filters.races) {
    chips.push({
      key: `race:${value}`,
      label: value,
      clear: (state) => withoutValue(state, "races", value),
    });
  }

  for (const key of ["level", "rank", "atk", "def"] as RangeKey[]) {
    if (isRangeActive(filters[key])) {
      chips.push({
        key: `range:${key}`,
        label: rangeLabel(key, filters[key]),
        clear: (state) => ({
          ...state,
          filters: {
            ...state.filters,
            [key]: { min: null, max: null },
          },
        }),
      });
    }
  }

  if (panel.rarity) {
    chips.push({
      key: "rarity",
      label: panel.rarity,
      clear: (state) => ({ ...state, rarity: "" }),
    });
  }

  if (panel.archetype) {
    chips.push({
      key: "archetype",
      label: panel.archetype,
      clear: (state) => ({ ...state, archetype: "" }),
    });
  }

  return chips;
}

// =========================================================
// FILTER + SORT
// =========================================================

export type SearchIndex = ReadonlyMap<string, string>;

/**
 * name + archetype, normalised once per collection so every
 * keystroke is a plain substring check.
 */
export function buildNameIndex(cards: BuilderCard[]): SearchIndex {
  return new Map(cards.map((card) => [card.id, normalizeSearchText(`${card.name} ${card.archetype ?? ""}`)]));
}

export function buildTextIndex(texts: Record<string, string>): SearchIndex {
  return new Map(Object.entries(texts).map(([id, text]) => [id, normalizeSearchText(text)]));
}

function compareNumbers(a: number | null, b: number | null): number {
  return (b ?? -1) - (a ?? -1);
}

export function filterAndSortCards({
  cards,
  query,
  parsed,
  panel,
  nameIndex,
  textIndex,
}: {
  cards: BuilderCard[];
  query: string;
  parsed: ParsedDeckSearch;
  panel: PanelState;
  nameIndex: SearchIndex;
  textIndex: SearchIndex | null;
}): BuilderCard[] {
  const terms = parsed.terms.map(normalizeSearchText).filter(Boolean);
  // "monster reborn", "dark magician": the whole query typed as a
  // card name still finds the card even though "monster"/"dark"
  // were also read as filters.
  const wholeName = parsed.chips.length > 0 ? normalizeSearchText(query) : "";

  const result = cards.filter((card) => {
    if (panel.rarity && rarityName(card) !== panel.rarity) {
      return false;
    }

    if (panel.archetype && card.archetype !== panel.archetype) {
      return false;
    }

    if (!matchesDeckFilters(card, panel.filters)) {
      return false;
    }

    const name = nameIndex.get(card.id) ?? "";

    if (wholeName && name.includes(wholeName)) {
      return true;
    }

    if (!matchesDeckFilters(card, parsed.filters)) {
      return false;
    }

    if (terms.length === 0) {
      return true;
    }

    const text = textIndex?.get(card.id) ?? "";

    return terms.every((term) => name.includes(term) || text.includes(term));
  });

  switch (panel.sort) {
    case "name-desc":
      return result.reverse();
    case "rarity":
      return result.sort(
        (a, b) => (RARITY_ORDER[rarityName(b)] ?? 0) - (RARITY_ORDER[rarityName(a)] ?? 0)
      );
    case "power":
      return result.sort((a, b) => compareNumbers(a.rarity_score, b.rarity_score));
    case "atk":
      return result.sort((a, b) => compareNumbers(a.atk, b.atk));
    case "def":
      return result.sort((a, b) => compareNumbers(a.def, b.def));
    case "level":
      return result.sort((a, b) => compareNumbers(a.level ?? a.rank, b.level ?? b.rank));
    default:
      // Already name-sorted by the server.
      return result;
  }
}
