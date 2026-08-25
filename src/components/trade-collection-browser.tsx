"use client";

import Image from "next/image";
import Link from "next/link";

import {
  CheckCircle2,
  LockKeyhole,
  Plus,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";

import {
  useMemo,
  useState,
} from "react";

import {
  addTradeItem,
} from "@/app/actions/trades";

import {
  SubmitButton,
} from "@/components/submit-button";

// =========================================================
// TYPES
// =========================================================

export type TradeBrowserCard = {
  card: {
    id: string;
    name: string;
    image_url:
      | string
      | null;

    card_type: string;

    game_rarity:
      | string
      | null;

    rarity_score:
      | number
      | null;

    atk:
      | number
      | null;

    def:
      | number
      | null;
  };

  quantity: number;

  selectedCount: number;

  forTradeCount: number;

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

type Availability =
  | "all"
  | "available"
  | "selected"
  | "for-trade";

type SortOption =
  | "name-asc"
  | "name-desc"
  | "rarity"
  | "power"
  | "atk";

// =========================================================
// RARITY
// =========================================================

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

// =========================================================
// HELPERS
// =========================================================

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

  children:
    React.ReactNode;

  onClick:
    () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
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

// =========================================================
// COMPONENT
// =========================================================

export function TradeCollectionBrowser({
  tradeId,
  cards,
  side,
  title,
}: {
  tradeId:
    string;

  cards:
    TradeBrowserCard[];

  side:
    | "offered"
    | "requested";

  title:
    string;
}) {
  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    category,
    setCategory,
  ] =
    useState<CardCategory>(
      "all"
    );

  const [
    rarity,
    setRarity,
  ] =
    useState("all");

  const [
    availability,
    setAvailability,
  ] =
    useState<Availability>(
      "all"
    );

  const [
    sort,
    setSort,
  ] =
    useState<SortOption>(
      "name-asc"
    );

  // =======================================================
  // RARITIES
  // =======================================================

  const rarities =
    useMemo(() => {
      return [
        ...new Set(
          cards.map(
            (group) =>
              group.card
                .game_rarity ??
              "Not Rated"
          )
        ),
      ].sort(
        (
          a,
          b
        ) =>
          (rarityOrder[
            b
          ] ?? 0) -
          (rarityOrder[
            a
          ] ?? 0)
      );
    }, [
      cards,
    ]);

  // =======================================================
  // FILTER + SORT
  // =======================================================

  const filteredCards =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLowerCase();

      const result =
        cards.filter(
          (
            group
          ) => {
            const {
              card,
            } = group;

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
              ) !==
                category
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
              availability ===
                "available" &&
              group
                .availableInstances
                .length ===
                0
            ) {
              return false;
            }

            if (
              availability ===
                "selected" &&
              group.selectedCount ===
                0
            ) {
              return false;
            }

            if (
              availability ===
                "for-trade" &&
              group.forTradeCount ===
                0
            ) {
              return false;
            }

            return true;
          }
        );

      result.sort(
        (
          a,
          b
        ) => {
          switch (
            sort
          ) {
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
      availability,
      cards,
      category,
      rarity,
      search,
      sort,
    ]);

  // =======================================================
  // RESET
  // =======================================================

  const hasFilters =
    search !== "" ||
    category !==
      "all" ||
    rarity !==
      "all" ||
    availability !==
      "all" ||
    sort !==
      "name-asc";

  function resetFilters() {
    setSearch("");
    setCategory(
      "all"
    );
    setRarity(
      "all"
    );
    setAvailability(
      "all"
    );
    setSort(
      "name-asc"
    );
  }

  const returnTo =
    `/trades/${tradeId}`;

  // =======================================================
  // UI
  // =======================================================

  return (
    <>
      {/* FILTER PANEL */}

      <div className="panel mt-4 p-4">
        <p className="text-sm font-black text-zinc-200">
          {title}
        </p>

        {/* SEARCH */}

        <div className="relative mt-4">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
          />

          <input
            type="search"
            value={
              search
            }
            onChange={(
              event
            ) =>
              setSearch(
                event
                  .target
                  .value
              )
            }
            placeholder="Search cards..."
            className="field w-full pl-10 pr-10"
          />

          {search && (
            <button
              type="button"
              onClick={() =>
                setSearch(
                  ""
                )
              }
              title="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-zinc-500 transition hover:text-zinc-200 active:scale-90"
            >
              <X
                size={
                  17
                }
              />
            </button>
          )}
        </div>

        {/* TYPE */}

        <div className="mt-4">
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

        {/* AVAILABILITY */}

        <div className="mt-4">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[.18em] text-zinc-600">
            Availability
          </p>

          <div className="flex flex-wrap gap-2">
            <FilterButton
              active={
                availability ===
                "all"
              }
              onClick={() =>
                setAvailability(
                  "all"
                )
              }
            >
              All
            </FilterButton>

            <FilterButton
              active={
                availability ===
                "available"
              }
              onClick={() =>
                setAvailability(
                  "available"
                )
              }
            >
              Available
            </FilterButton>

            <FilterButton
              active={
                availability ===
                "selected"
              }
              onClick={() =>
                setAvailability(
                  "selected"
                )
              }
            >
              Selected
            </FilterButton>

            <FilterButton
              active={
                availability ===
                "for-trade"
              }
              onClick={() =>
                setAvailability(
                  "for-trade"
                )
              }
            >
              Marked For Trade
            </FilterButton>
          </div>
        </div>

        {/* SELECTS */}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-[.18em] text-zinc-600">
              Rarity
            </span>

            <select
              value={
                rarity
              }
              onChange={(
                event
              ) =>
                setRarity(
                  event
                    .target
                    .value
                )
              }
              className="field w-full cursor-pointer"
            >
              <option value="all">
                All rarities
              </option>

              {rarities.map(
                (
                  value
                ) => (
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
              value={
                sort
              }
              onChange={(
                event
              ) =>
                setSort(
                  event
                    .target
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

        {/* COUNT */}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-3">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <SlidersHorizontal
              size={
                15
              }
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
              </strong>
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

      {/* NO RESULTS */}

      {filteredCards.length ===
      0 ? (
        <div className="panel mt-4 p-8 text-center">
          <Search
            size={32}
            className="mx-auto text-zinc-600"
          />

          <h3 className="mt-3 font-black">
            No cards found
          </h3>

          <p className="mt-2 text-sm text-zinc-500">
            Try another search or reset the filters.
          </p>

          <button
            type="button"
            onClick={
              resetFilters
            }
            className="mt-4 cursor-pointer text-sm font-black text-amber-300 hover:text-amber-200"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredCards.map(
            (
              group
            ) => {
              const {
                card,
              } = group;

              const rarityName =
                card.game_rarity ??
                "Not Rated";

              const rarityStyle =
                rarityStyles[
                  rarityName
                ] ??
                rarityStyles.Normal;

              const nextInstance =
                group
                  .availableInstances[0];

              return (
                <div
                  key={
                    card.id
                  }
                  className="panel group overflow-hidden transition-all duration-150 hover:-translate-y-1 hover:border-amber-300/25 hover:shadow-lg"
                >
                  {/* CARD */}

                  <Link
                    href={`/cards/${card.id}?returnTo=${encodeURIComponent(
                      returnTo
                    )}`}
                    className="block cursor-pointer"
                  >
                    {/* CARD IMAGE - nothing is ever overlaid on top
                        of this: name/artwork/ATK/DEF stay fully
                        visible. Rarity/quantity/For Trade all live
                        below the image instead (see INFO). */}

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
                          className="aspect-[421/614] h-auto w-full object-cover transition duration-200 group-hover:scale-[1.025]"
                          unoptimized
                        />
                      ) : (
                        <div className="flex aspect-[421/614] items-center justify-center bg-zinc-900 text-xs text-zinc-600">
                          No image
                        </div>
                      )}
                    </div>
                  </Link>

                  {/* INFO */}

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
                        image (rarity/quantity/For Trade); moved
                        below so nothing ever blocks the printed
                        name or ATK/DEF. */}

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

                      {group.forTradeCount >
                        0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-violet-300/40 bg-violet-400/15 px-2 py-0.5 text-[8px] font-black uppercase text-violet-200">
                          <Tag
                            size={
                              9
                            }
                          />
                          For Trade
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] font-bold uppercase text-zinc-600">
                        {
                          card.card_type
                        }
                      </span>

                      {card.atk !=
                        null && (
                        <span className="shrink-0 text-[10px] font-bold text-zinc-500">
                          ATK{" "}
                          {
                            card.atk
                          }
                        </span>
                      )}
                    </div>

                    {group.selectedCount >
                      0 && (
                      <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-emerald-300">
                        <CheckCircle2
                          size={
                            11
                          }
                        />

                        {
                          group.selectedCount
                        }{" "}
                        selected
                      </div>
                    )}

                    {/* ACTION */}

                    {nextInstance ? (
                      <form
                        action={
                          addTradeItem
                        }
                        className="mt-3"
                      >
                        <input
                          type="hidden"
                          name="trade_id"
                          value={
                            tradeId
                          }
                        />

                        <input
                          type="hidden"
                          name="card_instance_id"
                          value={
                            nextInstance.id
                          }
                        />

                        <input
                          type="hidden"
                          name="side"
                          value={
                            side
                          }
                        />

                        <SubmitButton
                          pendingLabel="Adding..."
                          className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-black text-amber-200 transition-all duration-150 hover:-translate-y-0.5 hover:border-amber-300/40 hover:bg-amber-300/20 active:scale-[0.97]"
                        >
                          <Plus
                            size={
                              14
                            }
                          />

                          {side ===
                          "offered"
                            ? "Offer"
                            : "Request"}

                          {" "}
                          (
                          {
                            group
                              .availableInstances
                              .length
                          }
                          )
                        </SubmitButton>
                      </form>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="mt-3 inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-xs font-black text-zinc-600"
                      >
                        <LockKeyhole
                          size={
                            13
                          }
                        />

                        Unavailable
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