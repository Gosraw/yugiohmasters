import Image from "next/image";
import Link from "next/link";

import {
  ArrowLeft,
  Boxes,
  Home,
  Layers3,
  LockKeyhole,
  Repeat2,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Swords,
  UnlockKeyhole,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  getLeagueIdForUser,
} from "@/lib/league-stats";

export const dynamic =
  "force-dynamic";

// =========================================================
// RARITY CONFIG
// =========================================================

const rarityOrder: Record<
  string,
  number
> = {
  Normal: 1,
  Rare: 2,
  "Super Rare": 3,
  "Ultra Rare": 4,
  "Secret Rare": 5,
  Legendary: 6,
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
    "border-yellow-300/50 bg-yellow-300/15 text-yellow-200 shadow-[0_0_20px_rgba(250,204,21,0.10)]",
};

// =========================================================
// TYPES
// =========================================================

type SearchParams = Promise<{
  q?: string;
  rarity?: string;
  type?: string;
  sort?: string;
}>;

type CardCatalogItem = {
  id: string;
  name: string;

  image_url:
    | string
    | null;

  card_type: string;

  attribute:
    | string
    | null;

  atk:
    | number
    | null;

  def:
    | number
    | null;

  game_rarity:
    | string
    | null;

  rarity_score:
    | number
    | null;
};

type CardInstance = {
  id: string;

  card_catalog_id:
    string;

  copy_number:
    number;

  acquired_at:
    string;

  locked:
    boolean;
};

type GroupedOwnedCard = {
  card: CardCatalogItem;

  instances:
    CardInstance[];

  quantity:
    number;

  lockedCount:
    number;

  availableCount:
    number;
};

// =========================================================
// PAGE
// =========================================================

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params =
    await searchParams;

  const q =
    params.q
      ?.trim()
      .toLowerCase() ??
    "";

  const rarity =
    params.rarity ??
    "";

  const type =
    params.type ??
    "";

  const sort =
    params.sort ??
    "name";

  const {
    supabase,
    userId,
  } = await requireUser();

  // A player can technically belong to more than one league. Scoping by
  // the player's league (not just current_owner_id) keeps this page
  // consistent with the deck builder, which already scopes card_instances
  // by league_id - see the deck_cards fix in commit b90a694 for why this
  // matters.
  const leagueId =
    await getLeagueIdForUser(
      supabase,
      userId
    );

  // ======================================================
  // OWNED CARD INSTANCES
  // ======================================================

  let instanceQuery = supabase
    .from(
      "card_instances"
    )
    .select(
      `
        id,
        card_catalog_id,
        copy_number,
        acquired_at,
        locked
      `
    )
    .eq(
      "current_owner_id",
      userId
    );

  if (leagueId) {
    instanceQuery =
      instanceQuery.eq(
        "league_id",
        leagueId
      );
  }

  const {
    data: instanceData,
    error: instanceError,
  } = await instanceQuery.order(
    "acquired_at",
    {
      ascending: false,
    }
  );

  if (instanceError) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="panel p-5">
          <p className="font-bold text-red-300">
            Collection kon niet worden geladen.
          </p>

          <p className="mt-2 text-sm text-zinc-500">
            {
              instanceError.message
            }
          </p>
        </div>
      </main>
    );
  }

  const instances =
    (instanceData ??
      []) as CardInstance[];

  // ======================================================
  // CARD CATALOG
  // ======================================================

  const catalogIds = [
    ...new Set(
      instances.map(
        (instance) =>
          instance.card_catalog_id
      )
    ),
  ];

  let catalogCards:
    CardCatalogItem[] =
    [];

  if (
    catalogIds.length >
    0
  ) {
    const {
      data: catalogData,
      error: catalogError,
    } = await supabase
      .from(
        "card_catalog"
      )
      .select(
        `
          id,
          name,
          image_url,
          card_type,
          attribute,
          atk,
          def,
          game_rarity,
          rarity_score
        `
      )
      .in(
        "id",
        catalogIds
      );

    if (catalogError) {
      return (
        <main className="mx-auto max-w-7xl px-4 py-6">
          <div className="panel p-5">
            <p className="font-bold text-red-300">
              Kaartinformatie kon niet worden geladen.
            </p>

            <p className="mt-2 text-sm text-zinc-500">
              {
                catalogError.message
              }
            </p>
          </div>
        </main>
      );
    }

    catalogCards =
      (catalogData ??
        []) as CardCatalogItem[];
  }

  const cardMap =
    new Map(
      catalogCards.map(
        (card) => [
          card.id,
          card,
        ]
      )
    );

  // ======================================================
  // GROUP OWNED COPIES
  // ======================================================

  const groupedMap =
    new Map<
      string,
      GroupedOwnedCard
    >();

  for (
    const instance of
    instances
  ) {
    const card =
      cardMap.get(
        instance.card_catalog_id
      );

    if (!card) {
      continue;
    }

    const existing =
      groupedMap.get(
        card.id
      );

    if (existing) {
      existing.instances.push(
        instance
      );

      existing.quantity +=
        1;

      if (
        instance.locked
      ) {
        existing.lockedCount +=
          1;
      } else {
        existing.availableCount +=
          1;
      }

      continue;
    }

    groupedMap.set(
      card.id,
      {
        card,

        instances: [
          instance,
        ],

        quantity: 1,

        lockedCount:
          instance.locked
            ? 1
            : 0,

        availableCount:
          instance.locked
            ? 0
            : 1,
      }
    );
  }

  let groupedCards = [
    ...groupedMap.values(),
  ];

  // ======================================================
  // GLOBAL COLLECTION STATS
  // ======================================================

  const totalCards =
    instances.length;

  const uniqueCards =
    groupedCards.length;

  const lockedCount =
    instances.filter(
      (instance) =>
        instance.locked
    ).length;

  const availableCount =
    totalCards -
    lockedCount;

  const legendaryCount =
    groupedCards.reduce(
      (
        total,
        group
      ) => {
        if (
          group.card
            .game_rarity ===
          "Legendary"
        ) {
          return (
            total +
            group.quantity
          );
        }

        return total;
      },
      0
    );

  const fullyLockedGroups =
    groupedCards.filter(
      (group) =>
        group.availableCount ===
          0 &&
        group.quantity >
          0
    ).length;

  // ======================================================
  // FILTERS
  // ======================================================

  if (q) {
    groupedCards =
      groupedCards.filter(
        (group) =>
          group.card.name
            .toLowerCase()
            .includes(q)
      );
  }

  if (rarity) {
    groupedCards =
      groupedCards.filter(
        (group) =>
          group.card
            .game_rarity ===
          rarity
      );
  }

  if (
    type ===
    "Monster"
  ) {
    groupedCards =
      groupedCards.filter(
        (group) =>
          group.card.card_type
            .toLowerCase()
            .includes(
              "monster"
            )
      );
  }

  if (
    type ===
    "Spell"
  ) {
    groupedCards =
      groupedCards.filter(
        (group) =>
          group.card.card_type
            .toLowerCase()
            .includes(
              "spell"
            )
      );
  }

  if (
    type ===
    "Trap"
  ) {
    groupedCards =
      groupedCards.filter(
        (group) =>
          group.card.card_type
            .toLowerCase()
            .includes(
              "trap"
            )
      );
  }

  // ======================================================
  // SORTING
  // ======================================================

  groupedCards =
    [...groupedCards].sort(
      (a, b) => {
        if (
          sort ===
          "rarity"
        ) {
          const aRarity =
            rarityOrder[
              a.card
                .game_rarity ??
                ""
            ] ??
            0;

          const bRarity =
            rarityOrder[
              b.card
                .game_rarity ??
                ""
            ] ??
            0;

          if (
            bRarity !==
            aRarity
          ) {
            return (
              bRarity -
              aRarity
            );
          }

          return (
            Number(
              b.card
                .rarity_score ??
                0
            ) -
            Number(
              a.card
                .rarity_score ??
                0
            )
          );
        }

        if (
          sort ===
          "power"
        ) {
          return (
            Number(
              b.card
                .rarity_score ??
                0
            ) -
            Number(
              a.card
                .rarity_score ??
                0
            )
          );
        }

        if (
          sort ===
          "atk"
        ) {
          return (
            Number(
              b.card.atk ??
                -1
            ) -
            Number(
              a.card.atk ??
                -1
            )
          );
        }

        if (
          sort ===
          "copies"
        ) {
          return (
            b.quantity -
            a.quantity
          );
        }

        if (
          sort ===
          "available"
        ) {
          return (
            b.availableCount -
            a.availableCount
          );
        }

        return a.card.name.localeCompare(
          b.card.name
        );
      }
    );

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* BACKGROUND */}

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-amber-400/[0.05] blur-[150px]" />

        <div className="absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-cyan-500/[0.05] blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ==================================================
            NAV
        ================================================== */}

        <nav className="flex flex-wrap items-center gap-3">
          <Link
            href="/cards"
            className="inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300 transition hover:border-amber-300/40 hover:bg-amber-300/10"
          >
            <ArrowLeft
              size={17}
            />

            Cards
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-sm font-bold text-zinc-400 transition hover:border-white/20 hover:text-zinc-100"
          >
            <Home
              size={16}
            />

            Home
          </Link>
        </nav>

        {/* ==================================================
            HERO
        ================================================== */}

        <header className="arena-frame relative mt-6 overflow-hidden rounded-[28px] border border-amber-300/15 bg-gradient-to-br from-white/[0.045] via-black/45 to-black/75 p-6 shadow-[0_30px_100px_rgba(0,0,0,.45)] sm:p-8">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-amber-400/[0.06] blur-[100px]" />

            <div className="absolute bottom-[-120px] left-[20%] h-64 w-64 rounded-full bg-cyan-500/[0.05] blur-[100px]" />
          </div>

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-amber-200">
                <Boxes
                  size={12}
                />

                Physical Inventory
              </div>

              <h1 className="gold-text mt-5 text-4xl font-black sm:text-5xl">
                Collection
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                Every copy here represents a tracked physical card you own. Free copies can be used in trades and card wagers; locked copies are already committed somewhere else.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/decks"
                  className="primary-button inline-flex items-center gap-2"
                >
                  <Layers3
                    size={16}
                  />

                  Build Deck
                </Link>

                <Link
                  href="/trades"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-black text-zinc-300 transition hover:border-cyan-300/20 hover:text-cyan-200"
                >
                  <Repeat2
                    size={16}
                  />

                  Trade Hub
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-300/15 bg-black/30 p-5">
              <div className="flex items-center gap-2">
                <UnlockKeyhole
                  size={15}
                  className="text-cyan-300"
                />

                <p className="text-[9px] font-black uppercase tracking-[.18em] text-cyan-300">
                  Free Copies
                </p>
              </div>

              <p className="mt-2 text-4xl font-black text-cyan-100">
                {
                  availableCount
                }
              </p>

              <p className="mt-1 text-xs text-zinc-600">
                available for trade or wager
              </p>
            </div>
          </div>
        </header>

        {/* ==================================================
            COLLECTION STATS
        ================================================== */}

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="panel relative overflow-hidden p-4">
            <Boxes
              size={34}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white opacity-[0.035]"
            />

            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Total Owned
            </p>

            <p className="mt-1 text-2xl font-black">
              {
                totalCards
              }
            </p>
          </div>

          <div className="panel relative overflow-hidden p-4">
            <Sparkles
              size={34}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white opacity-[0.035]"
            />

            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Unique Cards
            </p>

            <p className="mt-1 text-2xl font-black text-amber-200">
              {
                uniqueCards
              }
            </p>
          </div>

          <div className="panel relative overflow-hidden p-4">
            <UnlockKeyhole
              size={34}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white opacity-[0.035]"
            />

            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Available
            </p>

            <p className="mt-1 text-2xl font-black text-cyan-200">
              {
                availableCount
              }
            </p>
          </div>

          <div className="panel relative overflow-hidden p-4">
            <LockKeyhole
              size={34}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white opacity-[0.035]"
            />

            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Locked
            </p>

            <p className="mt-1 text-2xl font-black text-red-200">
              {
                lockedCount
              }
            </p>
          </div>

          <div className="panel relative col-span-2 overflow-hidden p-4 lg:col-span-1">
            <Sparkles
              size={34}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white opacity-[0.035]"
            />

            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Legendary
            </p>

            <p className="mt-1 text-2xl font-black text-yellow-200">
              {
                legendaryCount
              }
            </p>
          </div>
        </section>

        {/* ==================================================
            INVENTORY INFO
        ================================================== */}

        {lockedCount >
          0 && (
          <section className="mt-4 rounded-2xl border border-red-300/10 bg-red-300/[0.025] p-4">
            <div className="flex items-start gap-3">
              <LockKeyhole
                size={17}
                className="mt-0.5 shrink-0 text-red-300"
              />

              <div>
                <p className="text-sm font-black text-red-100">
                  Some copies are locked
                </p>

                <p className="mt-1 text-xs leading-5 text-zinc-600">
                  You currently have{" "}
                  <span className="font-black text-red-200">
                    {
                      lockedCount
                    }
                  </span>{" "}
                  locked physical copies across{" "}
                  <span className="font-black text-zinc-400">
                    {
                      fullyLockedGroups
                    }
                  </span>{" "}
                  fully unavailable card groups. Locked copies may be part of an active trade or Practice Duel wager.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ==================================================
            FILTERS
        ================================================== */}

        <form
          method="get"
          className="panel mt-6 p-4 sm:p-5"
        >
          <div className="flex items-center gap-2 text-sm font-black text-amber-300">
            <SlidersHorizontal
              size={17}
            />

            Search & Filters
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <label className="relative lg:col-span-2">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />

              <input
                name="q"
                defaultValue={
                  params.q ??
                  ""
                }
                placeholder="Search owned cards..."
                className="field w-full pl-10"
              />
            </label>

            <select
              name="rarity"
              defaultValue={
                rarity
              }
              className="field"
            >
              <option value="">
                All rarities
              </option>

              <option value="Normal">
                Normal
              </option>

              <option value="Rare">
                Rare
              </option>

              <option value="Super Rare">
                Super Rare
              </option>

              <option value="Ultra Rare">
                Ultra Rare
              </option>

              <option value="Secret Rare">
                Secret Rare
              </option>

              <option value="Legendary">
                Legendary
              </option>
            </select>

            <select
              name="type"
              defaultValue={
                type
              }
              className="field"
            >
              <option value="">
                All card types
              </option>

              <option value="Monster">
                Monster
              </option>

              <option value="Spell">
                Spell
              </option>

              <option value="Trap">
                Trap
              </option>
            </select>

            <select
              name="sort"
              defaultValue={
                sort
              }
              className="field"
            >
              <option value="name">
                Sort: Name
              </option>

              <option value="rarity">
                Sort: Rarity
              </option>

              <option value="power">
                Sort: Power score
              </option>

              <option value="atk">
                Sort: ATK
              </option>

              <option value="copies">
                Sort: Copies owned
              </option>

              <option value="available">
                Sort: Available copies
              </option>
            </select>
          </div>

          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="submit"
              className="primary-button"
            >
              Apply Filters
            </button>

            <Link
              href="/cards/collection"
              className="inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
            >
              Reset
            </Link>
          </div>
        </form>

        {/* ==================================================
            RESULT INFO
        ================================================== */}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Layers3
              size={17}
              className="text-amber-300"
            />

            <p className="text-sm font-bold">
              {
                groupedCards.length
              }{" "}
              unique card
              {groupedCards.length ===
              1
                ? ""
                : "s"}{" "}
              shown
            </p>
          </div>

          <Link
            href="/cards"
            className="text-sm font-bold text-amber-300 transition hover:text-amber-200"
          >
            Browse Card Database →
          </Link>
        </div>

        {/* ==================================================
            EMPTY STATE
        ================================================== */}

        {groupedCards.length ===
        0 ? (
          <section className="panel mt-5 p-10 text-center">
            <Layers3
              size={36}
              className="mx-auto text-zinc-600"
            />

            <h2 className="mt-4 text-xl font-black">
              {totalCards === 0
                ? "Your binder is empty."
                : "No cards found"}
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
              {totalCards === 0
                ? "Open a pack or draft a starting collection to fill it."
                : "Adjust your search or filters to find another part of your Collection."}
            </p>

            {totalCards === 0 && (
              <Link
                href="/shop"
                className="primary-button mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs"
              >
                Visit the Card Shop
              </Link>
            )}
          </section>
        ) : (
          /* ==================================================
              CARD GRID
          ================================================== */

          <section className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {groupedCards.map(
              (group) => {
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
                  "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";

                const fullyLocked =
                  group.availableCount ===
                    0 &&
                  group.quantity >
                    0;

                return (
                  <Link
                    key={
                      card.id
                    }
                    href={`/cards/${card.id}`}
                    className={`panel group block overflow-hidden transition duration-200 hover:-translate-y-1 ${
                      fullyLocked
                        ? "border-red-300/15 hover:border-red-300/30"
                        : "hover:border-amber-300/25"
                    }`}
                  >
                    {/* CARD IMAGE */}

                    <div className="relative bg-black/20">
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
                          className={`aspect-[421/614] h-auto w-full object-cover transition duration-300 group-hover:scale-[1.02] ${
                            fullyLocked
                              ? "opacity-70"
                              : ""
                          }`}
                          unoptimized
                        />
                      ) : (
                        <div className="flex aspect-[421/614] items-center justify-center text-xs text-zinc-600">
                          No image
                        </div>
                      )}

                      {/* RARITY */}

                      <div className="absolute left-2 top-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-wider backdrop-blur-md ${rarityStyle}`}
                        >
                          <Sparkles
                            size={9}
                          />

                          {
                            rarityName
                          }
                        </span>
                      </div>

                      {/* TOTAL QUANTITY */}

                      <div className="absolute bottom-2 right-2">
                        <span className="rounded-full border border-amber-300/30 bg-black/85 px-2.5 py-1 text-xs font-black text-amber-200">
                          x
                          {
                            group.quantity
                          }
                        </span>
                      </div>

                      {/* FULL LOCK */}

                      {fullyLocked && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <div className="rounded-xl border border-red-300/25 bg-red-950/85 px-3 py-2 text-center backdrop-blur-sm">
                            <LockKeyhole
                              size={16}
                              className="mx-auto text-red-200"
                            />

                            <p className="mt-1 text-[8px] font-black uppercase tracking-wider text-red-200">
                              All Copies Locked
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* CARD INFO */}

                    <div className="p-3">
                      <p className="line-clamp-2 min-h-10 text-sm font-black leading-5 text-zinc-100">
                        {
                          card.name
                        }
                      </p>

                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {
                          card.card_type
                        }
                      </p>

                      {/* INVENTORY */}

                      <div className="mt-3 grid grid-cols-2 gap-1.5">
                        <div className="rounded-lg border border-cyan-300/10 bg-cyan-300/[0.025] px-2 py-2">
                          <p className="text-[7px] font-black uppercase tracking-wider text-zinc-600">
                            Available
                          </p>

                          <p className="mt-1 text-sm font-black text-cyan-200">
                            {
                              group.availableCount
                            }
                          </p>
                        </div>

                        <div className="rounded-lg border border-red-300/10 bg-red-300/[0.02] px-2 py-2">
                          <p className="text-[7px] font-black uppercase tracking-wider text-zinc-600">
                            Locked
                          </p>

                          <p
                            className={`mt-1 text-sm font-black ${
                              group.lockedCount >
                              0
                                ? "text-red-200"
                                : "text-zinc-600"
                            }`}
                          >
                            {
                              group.lockedCount
                            }
                          </p>
                        </div>
                      </div>

                      {/* POWER INFO */}

                      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2">
                        {card.rarity_score !=
                        null ? (
                          <span className="text-xs font-bold text-amber-200">
                            {Number(
                              card.rarity_score
                            ).toFixed(
                              1
                            )}
                          </span>
                        ) : (
                          <span />
                        )}

                        {card.atk !=
                          null && (
                          <span className="text-[10px] text-zinc-500">
                            ATK{" "}
                            {
                              card.atk
                            }
                          </span>
                        )}
                      </div>

                      {/* STATE */}

                      <div className="mt-2">
                        {fullyLocked ? (
                          <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-red-300">
                            <LockKeyhole
                              size={9}
                            />

                            unavailable
                          </span>
                        ) : group.lockedCount >
                          0 ? (
                          <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-amber-300">
                            <ShieldCheck
                              size={9}
                            />

                            partly locked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-cyan-300">
                            <UnlockKeyhole
                              size={9}
                            />

                            free to use
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              }
            )}
          </section>
        )}

        {/* ==================================================
            ECONOMY EXPLANATION
        ================================================== */}

        <section className="panel mt-8 p-5">
          <div className="flex items-start gap-3">
            <Swords
              size={18}
              className="mt-0.5 shrink-0 text-violet-300"
            />

            <div>
              <p className="font-black">
                One Card, One Physical Copy
              </p>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Every numbered copy is tracked separately. A copy locked by an active trade or Practice Duel card wager cannot be committed somewhere else until that transaction or duel is resolved.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}