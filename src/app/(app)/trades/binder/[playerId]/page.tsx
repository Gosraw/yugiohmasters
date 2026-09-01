import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ArrowLeft,
  Heart,
  Home,
  Repeat2,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
} from "lucide-react";

import {
  toggleWishlist,
} from "@/app/actions/wishlist";

import {
  SubmitButton,
} from "@/components/submit-button";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  fetchOwnedCollection,
  filterAndSortCollection,
  rarityStyles,
} from "@/lib/collection";

import {
  MONSTER_RACES,
} from "@/lib/card-race";

export const dynamic =
  "force-dynamic";

type Profile = {
  id: string;
  username: string | null;
  duelist_name: string | null;
};

function playerName(
  profile: Profile | null
) {
  return (
    profile?.duelist_name ??
    profile?.username ??
    "Unknown Player"
  );
}

// =========================================================
// PAGE
//
// Read-only view of one league member's "for trade" binder -
// exactly which physical copies they've marked available, so a
// trade partner can be found before opening a full trade draft.
// Every card links straight into "Trade with this player" so
// browsing a binder can lead directly into a trade offer.
// =========================================================

export default async function TradeBinderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{
    playerId: string;
  }>;

  // Track 6 (2026-08-27): this page had no filter form at all before -
  // a binder with many for-trade cards had no way to narrow the view.
  // `q` and `race` mirror Collection's own query-param filter pattern
  // (see cards/collection/page.tsx) so a bookmarked/shared filtered
  // binder link behaves the same way.
  searchParams: Promise<{
    q?: string;
    race?: string;
  }>;
}) {
  const { playerId } = await params;

  const filterParams =
    await searchParams;

  const q =
    filterParams.q ??
    "";

  const race =
    filterParams.race ??
    "";

  const {
    supabase,
    userId,
  } = await requireUser();

  // ======================================================
  // CURRENT LEAGUE + TARGET MUST BE A MEMBER
  // ======================================================

  const {
    data: membership,
    error: membershipError,
  } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("profile_id", userId)
    .limit(1)
    .maybeSingle();

  if (
    membershipError ||
    !membership
  ) {
    notFound();
  }

  const {
    data: targetMembership,
    error: targetMembershipError,
  } = await supabase
    .from("league_members")
    .select("profile_id")
    .eq("league_id", membership.league_id)
    .eq("profile_id", playerId)
    .maybeSingle();

  if (
    targetMembershipError ||
    !targetMembership
  ) {
    notFound();
  }

  const {
    data: profileData,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select("id,username,duelist_name")
    .eq("id", playerId)
    .maybeSingle();

  if (
    profileError ||
    !profileData
  ) {
    notFound();
  }

  const profile =
    profileData as Profile;

  const isOwnBinder =
    playerId === userId;

  // ======================================================
  // WISHLIST (P0E) - which of the cards shown in this binder has
  // the viewer already wished, so the heart toggle here reflects
  // the same state as the card detail page's Wish button.
  // ======================================================

  const wishedCardIds = new Set<string>();

  // ======================================================
  // FOR-TRADE CARDS
  // ======================================================

  let forTradeCards;
  let totalForTradeCount;

  try {
    const owned = await fetchOwnedCollection(
      supabase,
      playerId,
      membership.league_id
    );

    // Unfiltered count first, so the empty state can tell "this
    // binder is genuinely empty" apart from "no card matches your
    // filters" - same distinction Collection's own empty state makes
    // (see totalCards === 0 in cards/collection/page.tsx). No extra
    // query: both calls reuse the single already-fetched `owned` list.
    totalForTradeCount = filterAndSortCollection(
      owned,
      {
        forTrade: true,
        sort: "name",
      }
    ).length;

    forTradeCards = filterAndSortCollection(
      owned,
      {
        q,
        race,
        forTrade: true,
        sort: "name",
      }
    );
  } catch (error) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="panel p-6">
          <p className="font-bold text-red-300">
            Binder kon niet worden geladen.
          </p>

          <p className="mt-2 text-sm text-zinc-500">
            {error instanceof Error
              ? error.message
              : String(error)}
          </p>
        </div>
      </main>
    );
  }

  if (forTradeCards.length > 0) {
    const { data: wishRows } = await supabase
      .from("card_wishlist_items")
      .select("card_catalog_id")
      .eq("profile_id", userId)
      .eq("league_id", membership.league_id)
      .in(
        "card_catalog_id",
        forTradeCards.map((group) => group.card.id)
      );

    for (const row of wishRows ?? []) {
      wishedCardIds.add(row.card_catalog_id as string);
    }
  }

  const hasActiveFilters =
    Boolean(q) ||
    Boolean(race);

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* NAV */}

      <nav className="flex flex-wrap items-center gap-3">
        <Link
          href="/trades/binder"
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300 transition-all hover:-translate-x-0.5 hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-200 active:scale-95"
        >
          <ArrowLeft size={17} />
          Back to Binders
        </Link>

        <Link
          href="/"
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-sm font-bold text-zinc-400 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-100 active:scale-95"
        >
          <Home size={16} />
          Home
        </Link>
      </nav>

      {/* HEADER */}

      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black tracking-[.28em] text-amber-300">
            TRADE BINDER
          </p>

          <h1 className="gold-text mt-2 text-4xl font-black">
            {playerName(profile)}
            {isOwnBinder ? " (You)" : ""}
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            {totalForTradeCount === 0
              ? "No physical copies marked for trade yet."
              : hasActiveFilters
                ? `${forTradeCards.length} of ${totalForTradeCount} card${
                    totalForTradeCount === 1 ? "" : "s"
                  } marked for trade shown.`
                : `${totalForTradeCount} unique card${
                    totalForTradeCount === 1 ? "" : "s"
                  } currently marked for trade.`}
          </p>
        </div>

        {!isOwnBinder && (
          <Link
            href={`/trades/new/${playerId}`}
            className="primary-button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 transition-all hover:-translate-y-0.5 active:scale-[0.97]"
          >
            <Repeat2 size={16} />
            Start Trade with {playerName(profile)}
          </Link>
        )}
      </header>

      {/* FILTERS - search + Monster Type only (this is a read-only,
          already for-trade-scoped view, so rarity/card-type filters
          weren't asked for here - Race is the one Track 6 explicitly
          calls out, and search covers the rest). A plain GET form:
          one query per page load, same as Collection's own filter
          form, never a query per keystroke/selection. */}

      <form
        method="get"
        className="panel mt-6 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto]"
      >
        <label className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
          />

          <input
            name="q"
            defaultValue={q}
            placeholder="Search this binder..."
            className="field w-full pl-9"
          />
        </label>

        <select
          name="race"
          defaultValue={race}
          className="field"
        >
          <option value="">
            All monster types
          </option>

          {MONSTER_RACES.map(
            (monsterRace) => (
              <option
                key={monsterRace}
                value={monsterRace}
              >
                {monsterRace}
              </option>
            )
          )}
        </select>

        <button
          type="submit"
          className="primary-button inline-flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <SlidersHorizontal size={15} />
          Apply
        </button>

        {hasActiveFilters && (
          <Link
            href={`/trades/binder/${playerId}`}
            className="inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
          >
            Clear
          </Link>
        )}
      </form>

      {/* GRID */}

      {forTradeCards.length === 0 ? (
        <section className="panel mt-8 p-10 text-center">
          <Tag
            size={36}
            className="mx-auto text-zinc-600"
          />

          <h2 className="mt-4 text-xl font-black">
            {totalForTradeCount === 0
              ? "Nothing here yet"
              : "No cards match your filters"}
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
            {totalForTradeCount === 0
              ? isOwnBinder
                ? "Mark physical copies as “For Trade” from a card's detail page to list them here."
                : `${playerName(profile)} hasn't marked any cards for trade yet.`
              : "Try clearing the search or Monster Type filter above."}
          </p>
        </section>
      ) : (
        <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {forTradeCards.map((group) => {
            const { card } = group;

            const rarityName =
              card.game_rarity ?? "Not Rated";

            const rarityStyle =
              rarityStyles[rarityName] ??
              "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";

            const isWished = wishedCardIds.has(card.id);

            return (
              <div key={card.id} className="relative">
              <Link
                href={
                  isOwnBinder
                    ? `/cards/${card.id}?returnTo=${encodeURIComponent(
                        `/trades/binder/${playerId}`
                      )}`
                    : `/trades/new/${playerId}`
                }
                className="panel group block transition-all duration-200 hover:-translate-y-1 hover:border-emerald-300/25"
              >
                {card.image_url ? (
                  <Image
                    src={card.image_url}
                    alt={card.name}
                    width={421}
                    height={614}
                    className="aspect-[421/614] h-auto w-full rounded-t-2xl object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex aspect-[421/614] items-center justify-center rounded-t-2xl bg-zinc-900 text-xs text-zinc-600">
                    No image
                  </div>
                )}

                <div className="p-3">
                  <p className="line-clamp-2 min-h-10 text-sm font-black leading-5 text-zinc-100">
                    {card.name}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${rarityStyle}`}
                    >
                      <Sparkles size={8} />
                      {rarityName}
                    </span>

                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-200">
                      <Tag size={8} />
                      {group.forTradeCount} for trade
                    </span>
                  </div>
                </div>
              </Link>

              <form
                action={toggleWishlist}
                className="absolute right-2 top-2"
              >
                <input
                  type="hidden"
                  name="card_catalog_id"
                  value={card.id}
                />

                <input
                  type="hidden"
                  name="return_to"
                  value={`/trades/binder/${playerId}`}
                />

                <SubmitButton
                  pendingLabel="..."
                  className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border backdrop-blur-sm transition-all ${
                    isWished
                      ? "border-rose-400/50 bg-rose-400/25 text-rose-200"
                      : "border-white/15 bg-black/40 text-zinc-300 hover:border-rose-300/40 hover:text-rose-200"
                  }`}
                >
                  <Heart
                    size={12}
                    fill={isWished ? "currentColor" : "none"}
                  />
                </SubmitButton>
              </form>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
