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
  Tag,
  UnlockKeyhole,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  getLeagueIdForUser,
} from "@/lib/league-stats";

import {
  fetchOwnedCollection,
  filterAndSortCollection,
  rarityStyles,
} from "@/lib/collection";

import {
  ScrollPositionMemory,
} from "@/components/scroll-position-memory";

export const dynamic =
  "force-dynamic";

// =========================================================
// TYPES
// =========================================================

type SearchParams = Promise<{
  q?: string;
  rarity?: string;
  type?: string;
  section?: string;
  attribute?: string;
  availability?: string;
  forTrade?: string;
  sort?: string;
}>;

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
    params.q ??
    "";

  const rarity =
    params.rarity ??
    "";

  const type =
    params.type ??
    "";

  const section =
    params.section ??
    "";

  const attribute =
    params.attribute ??
    "";

  const availability =
    params.availability ??
    "";

  const forTrade =
    params.forTrade ===
    "1";

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
  // OWNED COLLECTION (shared with Card Detail's Previous/Next
  // navigation - see src/lib/collection.ts)
  // ======================================================

  let allGroupedCards;

  try {
    allGroupedCards =
      await fetchOwnedCollection(
        supabase,
        userId,
        leagueId
      );
  } catch (error) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="panel p-5">
          <p className="font-bold text-red-300">
            Collection kon niet worden geladen.
          </p>

          <p className="mt-2 text-sm text-zinc-500">
            {error instanceof
            Error
              ? error.message
              : String(
                  error
                )}
          </p>
        </div>
      </main>
    );
  }

  // ======================================================
  // GLOBAL COLLECTION STATS (always computed against the
  // unfiltered collection, not the filtered view below)
  // ======================================================

  const totalCards =
    allGroupedCards.reduce(
      (
        total,
        group
      ) =>
        total +
        group.quantity,
      0
    );

  const uniqueCards =
    allGroupedCards.length;

  const lockedCount =
    allGroupedCards.reduce(
      (
        total,
        group
      ) =>
        total +
        group.lockedCount,
      0
    );

  const availableCount =
    totalCards -
    lockedCount;

  const forTradeTotal =
    allGroupedCards.reduce(
      (
        total,
        group
      ) =>
        total +
        group.forTradeCount,
      0
    );

  const legendaryCount =
    allGroupedCards.reduce(
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
    allGroupedCards.filter(
      (group) =>
        group.availableCount ===
          0 &&
        group.quantity >
          0
    ).length;

  // ======================================================
  // FILTER + SORT
  // ======================================================

  const groupedCards =
    filterAndSortCollection(
      allGroupedCards,
      {
        q,
        rarity,
        type,
        section,
        attribute,
        availability,
        forTrade,
        sort,
      }
    );

  // Query string this exact filtered view corresponds to - used
  // both to keep "Apply/Reset" reflecting the active filters and
  // to pass along as returnTo context so Card Detail's
  // Previous/Next can walk this exact ordered list, and so
  // navigating back from a card lands on the same filtered view
  // instead of a blank Collection page.
  const activeQuery =
    new URLSearchParams();

  if (q)
    activeQuery.set(
      "q",
      q
    );
  if (rarity)
    activeQuery.set(
      "rarity",
      rarity
    );
  if (type)
    activeQuery.set(
      "type",
      type
    );
  if (section)
    activeQuery.set(
      "section",
      section
    );
  if (attribute)
    activeQuery.set(
      "attribute",
      attribute
    );
  if (availability)
    activeQuery.set(
      "availability",
      availability
    );
  if (forTrade)
    activeQuery.set(
      "forTrade",
      "1"
    );
  if (sort !== "name")
    activeQuery.set(
      "sort",
      sort
    );

  const activeQueryString =
    activeQuery.toString();

  const collectionReturnTo = `/cards/collection${
    activeQueryString
      ? `?${activeQueryString}`
      : ""
  }`;

  // Used for the mobile filter toggle's badge - how many distinct
  // filters (beyond the default sort) are currently narrowing the
  // view, so a player can tell at a glance whether anything is
  // active without opening the sheet.
  const activeFilterCount =
    [
      q,
      rarity,
      type,
      section,
      attribute,
      availability,
    ].filter(Boolean)
      .length +
    (forTrade ? 1 : 0);

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Restores scroll position when returning to this exact
          filtered view from Card Detail (Previous/Next/Back) -
          see src/components/scroll-position-memory.tsx. */}

      <ScrollPositionMemory
        scrollKey={
          activeQueryString ||
          "default"
        }
      />

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

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
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

          <div className="panel relative overflow-hidden p-4">
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

          <div className="panel relative col-span-2 overflow-hidden p-4 lg:col-span-1">
            <Tag
              size={34}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white opacity-[0.035]"
            />

            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              For Trade
            </p>

            <p className="mt-1 text-2xl font-black text-emerald-200">
              {
                forTradeTotal
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
                  fully unavailable card groups. Locked copies are reserved by an active Practice Duel card wager - trades and deck use never lock a card.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ==================================================
            FILTERS

            Mobile (<sm): a compact always-visible toolbar opens a
            bottom sheet holding every field. Desktop (sm+): the
            same fields render inline as a static panel, exactly
            like before - the peer-checked/sm: combo below is the
            same pattern already used for the Browse/My Deck tabs
            in decks/[id]/page.tsx, just driving position/visibility
            instead of which panel shows.
        ================================================== */}

        <input
          type="checkbox"
          id="mobile-filters-toggle"
          className="peer/filters sr-only"
        />

        {/* Mobile-only toolbar: open button + active-filter badge +
            quick Clear, always reachable without opening the sheet. */}

        <div className="mt-6 flex items-center gap-3 sm:hidden">
          <label
            htmlFor="mobile-filters-toggle"
            className="primary-button flex flex-1 cursor-pointer items-center justify-center gap-2 text-center"
          >
            <SlidersHorizontal
              size={16}
            />
            Search & Filters
            {activeFilterCount >
              0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-black/25 px-1.5 text-[11px]">
                {
                  activeFilterCount
                }
              </span>
            )}
          </label>

          {activeFilterCount >
            0 && (
            <Link
              href="/cards/collection"
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-white/10 px-3 text-xs font-bold text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
            >
              Clear
            </Link>
          )}
        </div>

        {/* Backdrop - mobile only, tapping it closes the sheet
            since it's just another label for the same checkbox. */}

        <label
          htmlFor="mobile-filters-toggle"
          aria-hidden="true"
          className="fixed inset-0 z-40 hidden bg-black/60 backdrop-blur-sm peer-checked/filters:block sm:hidden"
        />

        <form
          method="get"
          className="panel fixed inset-x-0 bottom-0 z-50 hidden max-h-[85vh] flex-col overflow-y-auto rounded-t-3xl p-4 peer-checked/filters:flex sm:static sm:z-auto sm:mt-6 sm:flex sm:max-h-none sm:overflow-visible sm:rounded-2xl sm:p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-black text-amber-300">
              <SlidersHorizontal
                size={17}
              />

              Search & Filters
            </div>

            <label
              htmlFor="mobile-filters-toggle"
              className="cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-zinc-400 sm:hidden"
            >
              Done
            </label>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="relative md:col-span-2 lg:col-span-4">
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
              name="section"
              defaultValue={
                section
              }
              className="field"
            >
              <option value="">
                Main + Extra Deck
              </option>

              <option value="main">
                Main Deck material
              </option>

              <option value="fusion">
                Fusion only
              </option>

              <option value="xyz">
                Xyz only
              </option>
            </select>

            <select
              name="attribute"
              defaultValue={
                attribute
              }
              className="field"
            >
              <option value="">
                All attributes
              </option>

              <option value="DARK">
                DARK
              </option>

              <option value="LIGHT">
                LIGHT
              </option>

              <option value="EARTH">
                EARTH
              </option>

              <option value="WATER">
                WATER
              </option>

              <option value="FIRE">
                FIRE
              </option>

              <option value="WIND">
                WIND
              </option>

              <option value="DIVINE">
                DIVINE
              </option>
            </select>

            <select
              name="availability"
              defaultValue={
                availability
              }
              className="field"
            >
              <option value="">
                Owned or locked
              </option>

              <option value="available">
                Has a free copy
              </option>

              <option value="locked">
                Has a locked copy
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

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5 text-xs font-black text-zinc-400 transition hover:border-emerald-300/30 hover:text-emerald-200 has-[:checked]:border-emerald-300/40 has-[:checked]:bg-emerald-300/10 has-[:checked]:text-emerald-200">
              <input
                type="checkbox"
                name="forTrade"
                value="1"
                defaultChecked={
                  forTrade
                }
                className="h-3.5 w-3.5 accent-emerald-400"
              />
              For Trade only
            </label>

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
              Clear Filters
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
                    href={`/cards/${card.id}?returnTo=${encodeURIComponent(
                      collectionReturnTo
                    )}`}
                    className={`panel group relative block transition-all duration-200 hover:-translate-y-1 hover:z-10 ${
                      fullyLocked
                        ? "border-red-300/15 hover:border-red-300/30"
                        : "hover:border-amber-300/25"
                    }`}
                  >
                    {/* CARD IMAGE - nothing is ever overlaid on top of
                        this: name/artwork/ATK/DEF stay fully visible.
                        All rarity/quantity/lock/for-trade metadata is
                        below the image instead (see CARD INFO). On
                        lg+ screens, hovering scales the same image
                        element up in place (no second image request,
                        no layout shift - it's a CSS transform) as a
                        lightweight desktop preview. */}

                    <div className="relative">
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
                          className={`aspect-[421/614] h-auto w-full rounded-t-2xl object-cover transition-transform duration-200 ease-out lg:group-hover:z-20 lg:group-hover:scale-[1.7] lg:group-hover:shadow-[0_20px_60px_rgba(0,0,0,0.6)] ${
                            fullyLocked
                              ? "opacity-75"
                              : ""
                          }`}
                          unoptimized
                        />
                      ) : (
                        <div className="flex aspect-[421/614] items-center justify-center rounded-t-2xl bg-zinc-900 text-xs text-zinc-600">
                          No image
                        </div>
                      )}
                    </div>

                    {/* CARD INFO - priority order: name, gameplay
                        info, then status/inventory metadata last. */}

                    <div className="p-3">
                      <p className="line-clamp-2 min-h-10 text-sm font-black leading-5 text-zinc-100">
                        {
                          card.name
                        }
                      </p>

                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-zinc-500">
                        <span className="truncate">
                          {
                            card.card_type
                          }
                        </span>

                        {card.atk !=
                          null && (
                          <span className="shrink-0 text-zinc-500">
                            ATK{" "}
                            {
                              card.atk
                            }
                          </span>
                        )}
                      </div>

                      {/* METADATA */}

                      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${rarityStyle}`}
                        >
                          <Sparkles
                            size={8}
                          />
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
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-200">
                            <Tag
                              size={8}
                            />
                            For Trade
                          </span>
                        )}

                        {/* Informational only - never blocking. A
                            card can be In Deck and In Offer and For
                            Trade all at once; only an active wager
                            lock (below) actually reserves anything. */}

                        {group.inDeckCount >
                          0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-cyan-200">
                            <Layers3
                              size={8}
                            />
                            In Deck
                          </span>
                        )}

                        {group.inPendingOfferCount >
                          0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-violet-300/30 bg-violet-300/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-violet-200">
                            <Repeat2
                              size={8}
                            />
                            In Offer
                          </span>
                        )}

                        {fullyLocked ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-300/30 bg-red-300/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-red-300">
                            <LockKeyhole
                              size={8}
                            />
                            All Locked
                          </span>
                        ) : group.lockedCount >
                          0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-300">
                            <ShieldCheck
                              size={8}
                            />
                            {
                              group.availableCount
                            }{" "}
                            free
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-cyan-300">
                            <UnlockKeyhole
                              size={8}
                            />
                            Free to use
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