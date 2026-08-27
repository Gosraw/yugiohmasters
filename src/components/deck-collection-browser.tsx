"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Ban,
  CheckCircle2,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import type {
  ReadonlyURLSearchParams,
} from "next/navigation";

import { addCardToDeck } from "@/app/actions/decks";
import { DeckActionButton } from "@/components/deck-action-button";
import { useDeckLiveComposition } from "@/components/deck-live-composition";
import { MasterDuelBadge } from "@/components/master-duel-badge";
import { MONSTER_RACES, matchesRace } from "@/lib/card-race";

// Query param keys this browser mirrors its filters into, so
// leaving the page (e.g. tapping a card to inspect it, or
// switching to the "My Deck" tab on mobile) and coming back
// restores exactly what was being browsed instead of resetting to
// an empty search. Namespaced with a "b" prefix so they never
// collide with the page's own "view" tab param.
const PARAM_KEYS = {
  search: "bq",
  category: "bcat",
  section: "bsec",
  rarity: "brar",
  archetype: "barc",
  race: "brace",
  sort: "bsort",
  onlyAvailable: "bavail",
} as const;

export type DeckBrowserCard = {
  card: {
    id: string;
    name: string;
    image_url: string | null;
    card_type: string;
    atk: number | null;
    def: number | null;
    game_rarity: string | null;
    rarity_score: number | null;
    format_eligible: boolean;
    master_duel_status: string | null;
    // Deck Builder 2.0 additions - real card_catalog fields, used
    // for the Archetype filter and (in decks/[id]/page.tsx, not
    // here) the live composition summary. See CardCatalogItem in
    // decks/[id]/page.tsx for where these are fetched.
    archetype: string | null;
    monster_type: string | null;
    attribute: string | null;
    // Track 5 (2026-08-27) - see src/lib/card-race.ts.
    race: string | null;
    level: number | null;
    rank: number | null;
    link_rating: number | null;
  };

  quantity: number;
  inDeck: number;

  availableInstances: {
    id: string;
    copy_number: number;
  }[];
};

type CardCategory =
  | "all"
  | "monster"
  | "spell"
  | "trap";

type DeckSection =
  | "all"
  | "main"
  | "extra";

type SortOption =
  | "name-asc"
  | "name-desc"
  | "rarity"
  | "power"
  | "atk";

const rarityStyles: Record<
  string,
  string
> = {
  Normal:
    "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",

  Rare:
    "border-blue-400/30 bg-blue-400/10 text-blue-300",

  "Super Rare":
    "border-cyan-300/30 bg-cyan-300/10 text-cyan-200",

  "Ultra Rare":
    "border-amber-300/40 bg-amber-300/10 text-amber-200",

  "Secret Rare":
    "border-violet-300/40 bg-violet-300/10 text-violet-200",

  Legendary:
    "border-yellow-300/50 bg-yellow-300/15 text-yellow-200",
};

const rarityOrder: Record<
  string,
  number
> = {
  Legendary: 6,
  "Secret Rare": 5,
  "Ultra Rare": 4,
  "Super Rare": 3,
  Rare: 2,
  Normal: 1,
  "Not Rated": 0,
};

function isExtraDeckCard(
  cardType: string
) {
  const normalized =
    cardType.toLowerCase();

  return (
    normalized.includes(
      "fusion"
    ) ||
    normalized.includes(
      "xyz"
    )
  );
}

function getCategory(
  cardType: string
): Exclude<
  CardCategory,
  "all"
> {
  const normalized =
    cardType.toLowerCase();

  if (
    normalized.includes(
      "spell"
    )
  ) {
    return "spell";
  }

  if (
    normalized.includes(
      "trap"
    )
  ) {
    return "trap";
  }

  return "monster";
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-xl border px-3 py-2 text-xs font-black transition-all duration-150 active:scale-95 ${
        active
          ? "border-amber-300/40 bg-amber-300/15 text-amber-200"
          : "border-white/10 bg-white/[0.025] text-zinc-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function useEffectSyncFiltersToUrl({
  router,
  pathname,
  searchParams,
  search,
  category,
  section,
  rarity,
  archetype,
  race,
  sort,
  onlyAvailable,
}: {
  router: ReturnType<
    typeof useRouter
  >;
  pathname: string;
  searchParams: ReadonlyURLSearchParams;
  search: string;
  category: CardCategory;
  section: DeckSection;
  rarity: string;
  archetype: string;
  race: string;
  sort: SortOption;
  onlyAvailable: boolean;
}) {
  useEffect(() => {
    const next = new URLSearchParams(
      searchParams.toString()
    );

    const values: Record<
      keyof typeof PARAM_KEYS,
      string
    > = {
      search,
      category,
      section,
      rarity,
      archetype,
      race,
      sort,
      onlyAvailable: onlyAvailable
        ? "1"
        : "",
    };

    for (const key of Object.keys(
      PARAM_KEYS
    ) as (keyof typeof PARAM_KEYS)[]) {
      const value = values[key];
      const paramKey =
        PARAM_KEYS[key];

      const isDefault =
        value === "" ||
        value === "all" ||
        (key === "sort" &&
          value === "name-asc");

      if (isDefault) {
        next.delete(paramKey);
      } else {
        next.set(
          paramKey,
          value
        );
      }
    }

    const query = next.toString();
    const nextUrl = `${pathname}${
      query ? `?${query}` : ""
    }`;

    // Avoid a redundant replace() when nothing actually changed -
    // router.replace with an identical URL is harmless but there's
    // no reason to call it every render.
    const currentQuery =
      searchParams.toString();

    if (query !== currentQuery) {
      router.replace(nextUrl, {
        scroll: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    search,
    category,
    section,
    rarity,
    archetype,
    race,
    sort,
    onlyAvailable,
  ]);
}

export function DeckCollectionBrowser({
  deckId,
  cards,
}: {
  deckId: string;
  cards: DeckBrowserCard[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Shared with the deck panels and the composition summary on the
  // deck page: adding a card here updates every count there in the
  // same tick as the click, instead of after the server action's
  // full page round trip. See deck-live-composition.tsx.
  const { addCard } =
    useDeckLiveComposition();

  // Filters live in local state for instant, no-network filtering
  // (as before) but are seeded from - and mirrored back into - the
  // URL query string, so switching to the "My Deck" tab, inspecting
  // a card, or navigating away and back all preserve exactly what
  // was being browsed instead of resetting to an empty search.
  const [search, setSearch] =
    useState(
      () =>
        searchParams.get(
          PARAM_KEYS.search
        ) ?? ""
    );

  const [
    category,
    setCategory,
  ] =
    useState<CardCategory>(
      () =>
        (searchParams.get(
          PARAM_KEYS.category
        ) as CardCategory | null) ??
        "all"
    );

  const [
    section,
    setSection,
  ] =
    useState<DeckSection>(
      () =>
        (searchParams.get(
          PARAM_KEYS.section
        ) as DeckSection | null) ??
        "all"
    );

  const [rarity, setRarity] =
    useState(
      () =>
        searchParams.get(
          PARAM_KEYS.rarity
        ) ?? "all"
    );

  const [archetype, setArchetype] =
    useState(
      () =>
        searchParams.get(
          PARAM_KEYS.archetype
        ) ?? "all"
    );

  const [race, setRace] =
    useState(
      () =>
        searchParams.get(
          PARAM_KEYS.race
        ) ?? "all"
    );

  const [sort, setSort] =
    useState<SortOption>(
      () =>
        (searchParams.get(
          PARAM_KEYS.sort
        ) as SortOption | null) ??
        "name-asc"
    );

  const [
    filtersOpen,
    setFiltersOpen,
  ] = useState(false);

  const [
    onlyAvailable,
    setOnlyAvailable,
  ] = useState(
    () =>
      searchParams.get(
        PARAM_KEYS.onlyAvailable
      ) === "1"
  );

  // Mirrors the current filter values into the URL (replacing, not
  // pushing a new history entry - this re-runs on every keystroke/
  // click, and a full undo-able history entry per keystroke would
  // make the browser Back button useless). {scroll:false} keeps
  // the player's scroll position while the sticky search bar above
  // stays put anyway. Runs whenever a filter value changes, rather
  // than being threaded through every individual onClick/onChange
  // handler below - one place to keep in sync instead of a dozen.
  useEffectSyncFiltersToUrl({
    router,
    pathname,
    searchParams,
    search,
    category,
    section,
    rarity,
    archetype,
    race,
    sort,
    onlyAvailable,
  });

  const rarities =
    useMemo(() => {
      return [
        ...new Set(
          cards
            .map(
              (group) =>
                group.card
                  .game_rarity ??
                "Not Rated"
            )
            .filter(Boolean)
        ),
      ].sort(
        (a, b) =>
          (rarityOrder[b] ??
            0) -
          (rarityOrder[a] ??
            0)
      );
    }, [cards]);

  // Real archetype metadata only (card_catalog.archetype) - never a
  // name-substring guess, mirroring Collection 2.0's same rule (see
  // groupCollectionByArchetype in src/lib/collection.ts). Cards with
  // no archetype simply don't add an entry here; they still show up
  // normally under "All archetypes".
  const archetypes =
    useMemo(() => {
      return [
        ...new Set(
          cards
            .map(
              (group) =>
                group.card
                  .archetype
            )
            .filter(
              (value): value is string =>
                Boolean(value)
            )
        ),
      ].sort((a, b) =>
        a.localeCompare(b)
      );
    }, [cards]);

  const filteredCards =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLowerCase();

      const result =
        cards.filter(
          (group) => {
            const card =
              group.card;

            if (
              normalizedSearch &&
              !card.name
                .toLowerCase()
                .includes(
                  normalizedSearch
                )
            ) {
              return false;
            }

            if (
              category !==
                "all" &&
              getCategory(
                card.card_type
              ) !== category
            ) {
              return false;
            }

            const extra =
              isExtraDeckCard(
                card.card_type
              );

            if (
              section ===
                "main" &&
              extra
            ) {
              return false;
            }

            if (
              section ===
                "extra" &&
              !extra
            ) {
              return false;
            }

            if (
              rarity !==
                "all" &&
              (card.game_rarity ??
                "Not Rated") !==
                rarity
            ) {
              return false;
            }

            if (
              archetype !==
                "all" &&
              card.archetype !==
                archetype
            ) {
              return false;
            }

            if (
              race !== "all" &&
              !matchesRace(
                card.race,
                race
              )
            ) {
              return false;
            }

            if (
              onlyAvailable &&
              group
                .availableInstances
                .length ===
                0
            ) {
              return false;
            }

            return true;
          }
        );

      result.sort(
        (a, b) => {
          switch (sort) {
            case "name-desc":
              return b.card.name.localeCompare(
                a.card.name
              );

            case "rarity":
              return (
                (rarityOrder[
                  b.card
                    .game_rarity ??
                    "Not Rated"
                ] ?? 0) -
                  (rarityOrder[
                    a.card
                      .game_rarity ??
                      "Not Rated"
                  ] ?? 0) ||
                a.card.name.localeCompare(
                  b.card.name
                )
              );

            case "power":
              return (
                (b.card
                  .rarity_score ??
                  -1) -
                  (a.card
                    .rarity_score ??
                    -1) ||
                a.card.name.localeCompare(
                  b.card.name
                )
              );

            case "atk":
              return (
                (b.card.atk ??
                  -1) -
                  (a.card.atk ??
                    -1) ||
                a.card.name.localeCompare(
                  b.card.name
                )
              );

            case "name-asc":
            default:
              return a.card.name.localeCompare(
                b.card.name
              );
          }
        }
      );

      return result;
    }, [
      cards,
      category,
      onlyAvailable,
      rarity,
      archetype,
      race,
      search,
      section,
      sort,
    ]);

  const hasFilters =
    search !== "" ||
    category !== "all" ||
    section !== "all" ||
    rarity !== "all" ||
    archetype !== "all" ||
    race !== "all" ||
    sort !== "name-asc" ||
    onlyAvailable;

  const hasSecondaryFilters =
    category !== "all" ||
    section !== "all" ||
    rarity !== "all" ||
    archetype !== "all" ||
    race !== "all" ||
    sort !== "name-asc" ||
    onlyAvailable;

  function resetFilters() {
    setSearch("");
    setCategory("all");
    setSection("all");
    setRarity("all");
    setArchetype("all");
    setRace("all");
    setSort("name-asc");
    setOnlyAvailable(false);
  }

  const returnTo =
    `/decks/${deckId}`;

  return (
    <>
      {/* SEARCH - sticky so it stays reachable while scrolling a
          long card grid instead of forcing a scroll back to top. */}

      <div className="panel sticky top-2 z-20 p-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />

            <input
              type="search"
              value={search}
              onChange={(
                event
              ) =>
                setSearch(
                  event.target
                    .value
                )
              }
              placeholder="Search cards..."
              className="field w-full pl-10"
            />

            {search && (
              <button
                type="button"
                onClick={() =>
                  setSearch("")
                }
                title="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-zinc-500 transition hover:text-zinc-200 active:scale-90"
              >
                <X
                  size={17}
                />
              </button>
            )}
          </div>

          {/* Filter type/section/rarity/sort collapse behind this
              toggle on small screens only - sm: and up they stay
              expanded, matching the previous always-open layout. */}
          <button
            type="button"
            onClick={() =>
              setFiltersOpen(
                (open) => !open
              )
            }
            aria-expanded={
              filtersOpen
            }
            className={`relative flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-black transition-all active:scale-95 sm:hidden ${
              filtersOpen
                ? "border-amber-300/40 bg-amber-300/15 text-amber-200"
                : "border-white/10 bg-white/[0.025] text-zinc-400"
            }`}
          >
            <SlidersHorizontal
              size={15}
            />

            Filters

            {hasSecondaryFilters && (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-black bg-amber-300" />
            )}
          </button>
        </div>
      </div>

      <div
        className={`panel mt-3 p-4 ${filtersOpen ? "block" : "hidden"} sm:block`}
      >
        <div className="flex flex-col gap-4">

          {/* CARD TYPE */}

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[.18em] text-zinc-600">
              Card Type
            </p>

            <div className="flex flex-wrap gap-2">
              <FilterButton
                active={
                  category ===
                  "all"
                }
                onClick={() =>
                  setCategory(
                    "all"
                  )
                }
              >
                All
              </FilterButton>

              <FilterButton
                active={
                  category ===
                  "monster"
                }
                onClick={() =>
                  setCategory(
                    "monster"
                  )
                }
              >
                Monster
              </FilterButton>

              <FilterButton
                active={
                  category ===
                  "spell"
                }
                onClick={() =>
                  setCategory(
                    "spell"
                  )
                }
              >
                Spell
              </FilterButton>

              <FilterButton
                active={
                  category ===
                  "trap"
                }
                onClick={() =>
                  setCategory(
                    "trap"
                  )
                }
              >
                Trap
              </FilterButton>
            </div>
          </div>

          {/* DECK SECTION */}

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[.18em] text-zinc-600">
              Deck Section
            </p>

            <div className="flex flex-wrap gap-2">
              <FilterButton
                active={
                  section ===
                  "all"
                }
                onClick={() =>
                  setSection(
                    "all"
                  )
                }
              >
                All
              </FilterButton>

              <FilterButton
                active={
                  section ===
                  "main"
                }
                onClick={() =>
                  setSection(
                    "main"
                  )
                }
              >
                Main
              </FilterButton>

              <FilterButton
                active={
                  section ===
                  "extra"
                }
                onClick={() =>
                  setSection(
                    "extra"
                  )
                }
              >
                Fusion / XYZ
              </FilterButton>
            </div>
          </div>

          {/* AVAILABILITY */}

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[.18em] text-zinc-600">
              Availability
            </p>

            <div className="flex flex-wrap gap-2">
              <FilterButton
                active={
                  onlyAvailable
                }
                onClick={() =>
                  setOnlyAvailable(
                    (
                      value
                    ) =>
                      !value
                  )
                }
              >
                Only Available
              </FilterButton>
            </div>
          </div>

          {/* RARITY + ARCHETYPE + SORT */}

          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className="mb-2 block text-[10px] font-black uppercase tracking-[.18em] text-zinc-600">
                Rarity
              </span>

              <select
                value={rarity}
                onChange={(
                  event
                ) =>
                  setRarity(
                    event.target
                      .value
                  )
                }
                className="field w-full cursor-pointer"
              >
                <option value="all">
                  All rarities
                </option>

                {rarities.map(
                  (value) => (
                    <option
                      key={
                        value
                      }
                      value={
                        value
                      }
                    >
                      {
                        value
                      }
                    </option>
                  )
                )}
              </select>
            </label>

            <label>
              <span className="mb-2 block text-[10px] font-black uppercase tracking-[.18em] text-zinc-600">
                Archetype
              </span>

              <select
                value={archetype}
                onChange={(
                  event
                ) =>
                  setArchetype(
                    event.target
                      .value
                  )
                }
                className="field w-full cursor-pointer"
              >
                <option value="all">
                  All archetypes
                </option>

                {archetypes.map(
                  (value) => (
                    <option
                      key={
                        value
                      }
                      value={
                        value
                      }
                    >
                      {
                        value
                      }
                    </option>
                  )
                )}
              </select>
            </label>

            <label>
              <span className="mb-2 block text-[10px] font-black uppercase tracking-[.18em] text-zinc-600">
                Monster Type
              </span>

              <select
                value={race}
                onChange={(
                  event
                ) =>
                  setRace(
                    event.target
                      .value
                  )
                }
                className="field w-full cursor-pointer"
              >
                <option value="all">
                  All monster types
                </option>

                {MONSTER_RACES.map(
                  (value) => (
                    <option
                      key={
                        value
                      }
                      value={
                        value
                      }
                    >
                      {
                        value
                      }
                    </option>
                  )
                )}
              </select>
            </label>

            <label>
              <span className="mb-2 block text-[10px] font-black uppercase tracking-[.18em] text-zinc-600">
                Sort By
              </span>

              <select
                value={sort}
                onChange={(
                  event
                ) =>
                  setSort(
                    event.target
                      .value as SortOption
                  )
                }
                className="field w-full cursor-pointer"
              >
                <option value="name-asc">
                  Name A–Z
                </option>

                <option value="name-desc">
                  Name Z–A
                </option>

                <option value="rarity">
                  Highest Rarity
                </option>

                <option value="power">
                  Highest Power
                </option>

                <option value="atk">
                  Highest ATK
                </option>
              </select>
            </label>
          </div>

          {/* RESULT COUNT */}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-3">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <SlidersHorizontal
                size={15}
              />

              <span>
                Showing{" "}
                <strong className="text-zinc-200">
                  {
                    filteredCards.length
                  }
                </strong>{" "}
                of{" "}
                <strong className="text-zinc-200">
                  {
                    cards.length
                  }
                </strong>{" "}
                cards
              </span>
            </div>

            {hasFilters && (
              <button
                type="button"
                onClick={
                  resetFilters
                }
                className="cursor-pointer text-xs font-black text-amber-300 transition hover:text-amber-200 active:scale-95"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CARDS */}

      {filteredCards.length ===
      0 ? (
        <div className="panel mt-4 p-10 text-center">
          <Search
            size={34}
            className="mx-auto text-zinc-600"
          />

          <h3 className="mt-3 font-black text-zinc-300">
            No cards found
          </h3>

          <p className="mt-2 text-sm text-zinc-500">
            Try another search
            or reset your
            filters.
          </p>

          <button
            type="button"
            onClick={
              resetFilters
            }
            className="mt-4 cursor-pointer text-sm font-black text-amber-300 transition hover:text-amber-200 active:scale-95"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-4 2xl:grid-cols-5">
          {filteredCards.map(
            (group) => {
              const card =
                group.card;

              const rarityName =
                card.game_rarity ??
                "Not Rated";

              const rarityStyle =
                rarityStyles[
                  rarityName
                ] ??
                rarityStyles.Normal;

              const extra =
                isExtraDeckCard(
                  card.card_type
                );

              const available =
                group
                  .availableInstances
                  .length;

              const nextInstance =
                group
                  .availableInstances[0];

              const ineligible =
                !card.format_eligible;

              return (
                <div
                  key={
                    card.id
                  }
                  className={`panel group overflow-hidden transition-all duration-150 hover:-translate-y-1 hover:shadow-lg ${
                    ineligible
                      ? "opacity-70 hover:border-red-300/25"
                      : "hover:border-amber-300/25"
                  }`}
                >
                  <Link
                    href={`/cards/${card.id}?returnTo=${encodeURIComponent(
                      returnTo
                    )}`}
                    className="block cursor-pointer"
                  >
                    {/* CARD IMAGE - nothing is ever overlaid on top
                        of this: name/artwork/ATK/DEF stay fully
                        visible. Rarity/quantity/legality/Master
                        Duel status all live below the image instead
                        (see CARD INFO). */}

                    <div className="relative overflow-hidden">
                      {card.image_url ? (
                        <Image
                          src={
                            card.image_url
                          }
                          alt={
                            card.name
                          }
                          width={
                            421
                          }
                          height={
                            614
                          }
                          className={`aspect-[421/614] h-auto w-full object-cover transition duration-200 group-hover:scale-[1.025] ${
                            ineligible
                              ? "grayscale"
                              : ""
                          }`}
                          unoptimized
                        />
                      ) : (
                        <div className="flex aspect-[421/614] items-center justify-center bg-zinc-900 text-xs text-zinc-600">
                          No image
                        </div>
                      )}
                    </div>
                  </Link>

                  <div className="p-3">
                    <Link
                      href={`/cards/${card.id}?returnTo=${encodeURIComponent(
                        returnTo
                      )}`}
                      className="cursor-pointer"
                    >
                      <p className="line-clamp-2 min-h-10 text-sm font-black leading-5 transition group-hover:text-amber-200">
                        {
                          card.name
                        }
                      </p>
                    </Link>

                    {/* METADATA - previously overlaid on the card
                        image (rarity/quantity/legality/Master Duel
                        status); moved below so nothing ever blocks
                        the printed name or ATK/DEF. */}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${rarityStyle}`}
                      >
                        {
                          rarityName
                        }
                      </span>

                      <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[8px] font-black text-zinc-300">
                        x
                        {
                          group.quantity
                        }
                      </span>

                      {(!card.master_duel_status ||
                        card.master_duel_status !==
                          "unlimited") && (
                        <MasterDuelBadge
                          status={
                            card.master_duel_status
                          }
                        />
                      )}

                      {ineligible && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-red-950/90 px-2 py-0.5 text-[8px] font-black uppercase text-red-200">
                          <Ban
                            size={
                              9
                            }
                          />
                          Not legal
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase text-zinc-500">
                        {extra
                          ? "Extra"
                          : "Main"}
                      </span>

                      {group.inDeck >
                        0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300">
                          <CheckCircle2
                            size={
                              11
                            }
                          />

                          {
                            group.inDeck
                          }{" "}
                          in deck
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-zinc-600">
                      <span>
                        {
                          card.card_type
                        }
                      </span>

                      {card.atk !=
                        null && (
                        <span>
                          ATK{" "}
                          {
                            card.atk
                          }
                        </span>
                      )}
                    </div>

                    {/* Explicit physical-copy breakdown - a card
                        owned in multiple copies can be partly in
                        this deck, partly locked by an active
                        Practice Duel wager, and partly free, so a
                        bare quantity badge isn't enough. Being
                        offered in a trade never affects this - see
                        the 2026-08-22 no-card-locks pass. */}
                    <p className="mt-1.5 text-[10px] font-bold text-zinc-600">
                      Owned{" "}
                      {
                        group.quantity
                      }
                      {" · "}
                      In deck{" "}
                      {
                        group.inDeck
                      }
                      {" · "}
                      <span
                        className={
                          available >
                          0
                            ? "text-emerald-400"
                            : "text-zinc-600"
                        }
                      >
                        Available{" "}
                        {
                          available
                        }
                      </span>
                    </p>

                    {ineligible ? (
                      <button
                        type="button"
                        disabled
                        title="This card isn't legal in the current Duelist Circle format."
                        className="mt-3 inline-flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border border-red-400/15 bg-red-400/[0.03] px-3 py-2 text-[10px] font-black uppercase text-red-300/70"
                      >
                        <Ban
                          size={
                            11
                          }
                        />
                        Not format legal
                      </button>
                    ) : nextInstance ? (
                      <form
                        action={
                          addCardToDeck
                        }
                        onSubmit={() => {
                          // Instant, local composition update - the
                          // server action on `action` above still
                          // runs and stays the source of truth (and
                          // still submits natively without
                          // JavaScript); this only stops the counts
                          // from waiting for its round trip. Rolled
                          // back automatically if the add is
                          // refused - see deck-live-composition.tsx.
                          addCard(
                            {
                              deckCardId: `optimistic:${nextInstance.id}`,
                              card_catalog_id:
                                card.id,
                              name: card.name,
                              card_type:
                                card.card_type,
                              monster_type:
                                card.monster_type,
                              attribute:
                                card.attribute,
                              level:
                                card.level,
                              rank: card.rank,
                              link_rating:
                                card.link_rating,
                              archetype:
                                card.archetype,
                            },
                            extra
                              ? "extra"
                              : "main"
                          );
                        }}
                        className="mt-3"
                      >
                        <input
                          type="hidden"
                          name="deck_id"
                          value={
                            deckId
                          }
                        />

                        <input
                          type="hidden"
                          name="card_instance_id"
                          value={
                            nextInstance.id
                          }
                        />

                        <DeckActionButton
                          type="add"
                          label={`Add (${available})`}
                        />
                      </form>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="mt-3 inline-flex w-full cursor-not-allowed items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-xs font-black text-zinc-600"
                      >
                        {group.inDeck ===
                        group.quantity
                          ? "All in deck"
                          : "Unavailable"}
                      </button>
                    )}
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}
    </>
  );
}