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
import { useMemo, useState } from "react";

import { addCardToDeck } from "@/app/actions/decks";
import { DeckActionButton } from "@/components/deck-action-button";

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

export function DeckCollectionBrowser({
  deckId,
  cards,
}: {
  deckId: string;
  cards: DeckBrowserCard[];
}) {
  const [search, setSearch] =
    useState("");

  const [
    category,
    setCategory,
  ] =
    useState<CardCategory>(
      "all"
    );

  const [
    section,
    setSection,
  ] =
    useState<DeckSection>(
      "all"
    );

  const [rarity, setRarity] =
    useState("all");

  const [sort, setSort] =
    useState<SortOption>(
      "name-asc"
    );

  const [
    filtersOpen,
    setFiltersOpen,
  ] = useState(false);

  const [
    onlyAvailable,
    setOnlyAvailable,
  ] = useState(false);

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
      search,
      section,
      sort,
    ]);

  const hasFilters =
    search !== "" ||
    category !== "all" ||
    section !== "all" ||
    rarity !== "all" ||
    sort !== "name-asc" ||
    onlyAvailable;

  const hasSecondaryFilters =
    category !== "all" ||
    section !== "all" ||
    rarity !== "all" ||
    sort !== "name-asc" ||
    onlyAvailable;

  function resetFilters() {
    setSearch("");
    setCategory("all");
    setSection("all");
    setRarity("all");
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

          {/* RARITY + SORT */}

          <div className="grid gap-3 sm:grid-cols-2">
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

                      <span
                        className={`absolute left-2 top-2 rounded-full border px-2 py-1 text-[8px] font-black uppercase backdrop-blur-md ${rarityStyle}`}
                      >
                        {
                          rarityName
                        }
                      </span>

                      <span className="absolute bottom-2 right-2 rounded-full border border-white/10 bg-black/85 px-2 py-1 text-[10px] font-black">
                        x
                        {
                          group.quantity
                        }
                      </span>

                      {ineligible && (
                        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-red-950/90 px-2 py-1 text-[8px] font-black uppercase text-red-200">
                          <Ban
                            size={
                              9
                            }
                          />
                          Not legal
                        </span>
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