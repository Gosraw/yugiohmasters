import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
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
  fetchInBatches,
} from "@/lib/supabase/paginate";

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

// Cards per binder page. A friend's whole collection can be hundreds
// of unique cards; rendering every image at once is slow on a phone.
const BINDER_PAGE_SIZE = 60;

function binderHref(
  playerId: string,
  params: {
    q: string;
    race: string;
    show: string;
    page?: number;
  }
) {
  const query = new URLSearchParams();

  if (params.q) {
    query.set("q", params.q);
  }

  if (params.race) {
    query.set("race", params.race);
  }

  if (params.show) {
    query.set("show", params.show);
  }

  if (params.page && params.page > 1) {
    query.set("page", String(params.page));
  }

  const text = query.toString();

  return `/trades/binder/${playerId}${text ? `?${text}` : ""}`;
}

// =========================================================
// PAGE
//
// 2.0 (docs/V2_PLAN.md "Cards & decks"): the binder shows ALL of a
// league member's cards, not only the ones marked for trade. Copies
// marked "For trade" carry a label, and the "For trade" tab narrows
// the view to just those. The whole collection is fetched with
// paging (fetchOwnedCollection -> fetchAllPages), so nothing is cut
// off at Supabase's 1000-row cap; the grid itself is paged
// (?page=) so a big binder stays fast on a phone.
// For-trade cards link straight into "Trade with this player".
// =========================================================

export default async function TradeBinderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{
    playerId: string;
  }>;

  // `q` and `race` mirror Collection's own query-param filters;
  // `show=trade` is the "For trade" tab; `page` is the grid page.
  searchParams: Promise<{
    q?: string;
    race?: string;
    show?: string;
    page?: string;
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

  const show =
    filterParams.show === "trade"
      ? "trade"
      : "";

  const requestedPage =
    Math.max(
      1,
      Number.parseInt(
        filterParams.page ?? "1",
        10
      ) || 1
    );

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
  // ALL CARDS (paged fetch) + the for-trade subset
  // ======================================================

  let owned;

  try {
    owned = await fetchOwnedCollection(
      supabase,
      playerId,
      membership.league_id
    );
  } catch (error) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="panel p-6">
          <p className="font-bold text-red-300">
            This binder could not be loaded.
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

  const totalUniqueCount =
    owned.length;

  const totalCopyCount =
    owned.reduce(
      (sum, group) =>
        sum + group.quantity,
      0
    );

  const forTradeUniqueCount =
    owned.filter(
      (group) =>
        group.forTradeCount > 0
    ).length;

  const filteredCards =
    filterAndSortCollection(
      owned,
      {
        q,
        race,
        forTrade: show === "trade",
        sort: "name",
      }
    );

  const pageCount =
    Math.max(
      1,
      Math.ceil(
        filteredCards.length /
          BINDER_PAGE_SIZE
      )
    );

  const page =
    Math.min(
      requestedPage,
      pageCount
    );

  const pageCards =
    filteredCards.slice(
      (page - 1) * BINDER_PAGE_SIZE,
      page * BINDER_PAGE_SIZE
    );

  // ======================================================
  // WISHLIST - only for the cards on this page (batched .in()).
  // ======================================================

  const wishedCardIds = new Set<string>();

  if (pageCards.length > 0) {
    try {
      const wishRows = await fetchInBatches<
        string,
        {
          card_catalog_id: string;
        }
      >(
        pageCards.map((group) => group.card.id),
        (batch, from, to) =>
          supabase
            .from("card_wishlist_items")
            .select("card_catalog_id")
            .eq("profile_id", userId)
            .eq("league_id", membership.league_id)
            .in("card_catalog_id", batch)
            .order("card_catalog_id", { ascending: true })
            .range(from, to)
      );

      for (const row of wishRows) {
        wishedCardIds.add(row.card_catalog_id);
      }
    } catch {
      // Hearts just render empty if the wishlist can't be read.
    }
  }

  const hasActiveFilters =
    Boolean(q) ||
    Boolean(race);

  const tabs = [
    {
      key: "",
      label: "All cards",
      count: totalUniqueCount,
    },
    {
      key: "trade",
      label: "For trade",
      count: forTradeUniqueCount,
    },
  ];

  const name =
    playerName(profile);

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
        <div className="min-w-0">
          <p className="text-xs font-black tracking-[.28em] text-amber-300">
            BINDER
          </p>

          <h1 className="gold-text mt-2 text-3xl font-black sm:text-4xl">
            {name}
            {isOwnBinder ? " (You)" : ""}
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            {totalUniqueCount === 0
              ? "No cards yet."
              : `${totalUniqueCount.toLocaleString("en-US")} unique card${
                  totalUniqueCount === 1 ? "" : "s"
                } (${totalCopyCount.toLocaleString("en-US")} copies) · ${forTradeUniqueCount} marked for trade.`}
          </p>
        </div>

        {!isOwnBinder && (
          <Link
            href={`/trades/new/${playerId}`}
            className="primary-button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 transition-all hover:-translate-y-0.5 active:scale-[0.97]"
          >
            <Repeat2 size={16} />
            Start Trade with {name}
          </Link>
        )}
      </header>

      {/* TABS: All cards / For trade */}

      <div
        role="tablist"
        aria-label="Binder view"
        className="mt-6 inline-flex rounded-2xl border border-white/10 bg-black/20 p-1"
      >
        {tabs.map((tab) => {
          const active =
            show === tab.key;

          return (
            <Link
              key={tab.key || "all"}
              role="tab"
              aria-selected={active}
              href={binderHref(playerId, {
                q,
                race,
                show: tab.key,
              })}
              className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors ${
                active
                  ? "bg-amber-300/15 text-amber-200"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {tab.key === "trade" ? <Tag size={14} /> : null}
              {tab.label}
              <span className="text-xs font-semibold tabular-nums text-zinc-500">
                {tab.count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* FILTERS - plain GET form: one query per page load. */}

      <form
        method="get"
        className="panel mt-4 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto]"
      >
        {show ? (
          <input
            type="hidden"
            name="show"
            value={show}
          />
        ) : null}

        <label className="relative">
          <span className="sr-only">Search this binder</span>

          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
          />

          <input
            name="q"
            defaultValue={q}
            placeholder="Search this binder..."
            className="field w-full"
            // .field is unlayered CSS, so its padding beats a pl-*
            // utility - keep room for the search icon explicitly.
            style={{
              paddingLeft: "2.5rem",
            }}
          />
        </label>

        <select
          name="race"
          defaultValue={race}
          aria-label="Monster type"
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
            href={binderHref(playerId, {
              q: "",
              race: "",
              show,
            })}
            className="inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
          >
            Clear
          </Link>
        )}
      </form>

      {filteredCards.length > 0 && (
        <p className="mt-4 text-xs text-zinc-500">
          {filteredCards.length === totalUniqueCount && !show
            ? `${filteredCards.length} cards`
            : `${filteredCards.length} card${filteredCards.length === 1 ? "" : "s"} shown`}
          {pageCount > 1 ? ` · page ${page} of ${pageCount}` : ""}
        </p>
      )}

      {/* GRID */}

      {filteredCards.length === 0 ? (
        <section className="panel mt-8 p-10 text-center">
          <Tag
            size={36}
            className="mx-auto text-zinc-600"
          />

          <h2 className="mt-4 text-xl font-black">
            {hasActiveFilters
              ? "No cards match your filters"
              : show === "trade"
                ? "Nothing marked for trade"
                : "Nothing here yet"}
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
            {hasActiveFilters
              ? "Try clearing the search or Monster Type filter above."
              : show === "trade"
                ? isOwnBinder
                  ? "Mark physical copies as “For Trade” from a card's detail page to list them here."
                  : `${name} hasn't marked any cards for trade yet. You can still ask for any card in a trade offer.`
                : `${name} doesn't own any cards yet.`}
          </p>
        </section>
      ) : (
        <section className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {pageCards.map((group) => {
            const { card } = group;

            const rarityName =
              card.game_rarity ?? "Not Rated";

            const rarityStyle =
              rarityStyles[rarityName] ??
              "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";

            const isWished = wishedCardIds.has(card.id);

            const forTrade =
              group.forTradeCount > 0;

            const returnTo =
              binderHref(playerId, {
                q,
                race,
                show,
                page,
              });

            return (
              <div key={card.id} className="relative">
              <Link
                href={
                  !isOwnBinder && forTrade
                    ? `/trades/new/${playerId}`
                    : `/cards/${card.id}?returnTo=${encodeURIComponent(returnTo)}`
                }
                className={`panel group block transition-all duration-200 hover:-translate-y-1 ${
                  forTrade
                    ? "border-emerald-300/30 hover:border-emerald-300/50"
                    : "hover:border-amber-300/25"
                }`}
              >
                <div className="relative">
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

                  {forTrade ? (
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full border border-emerald-300/50 bg-emerald-950/85 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-200 shadow-lg backdrop-blur-sm">
                      <Tag size={9} />
                      For trade
                    </span>
                  ) : null}
                </div>

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

                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-zinc-300">
                      ×{group.quantity}
                    </span>

                    {forTrade && group.quantity > 1 ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-200">
                        {group.forTradeCount} for trade
                      </span>
                    ) : null}
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
                  value={returnTo}
                />

                <SubmitButton
                  pendingLabel="..."
                  className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border backdrop-blur-sm transition-all ${
                    isWished
                      ? "border-rose-400/50 bg-rose-400/25 text-rose-200"
                      : "border-white/15 bg-black/40 text-zinc-300 hover:border-rose-300/40 hover:text-rose-200"
                  }`}
                >
                  <Heart
                    size={13}
                    fill={isWished ? "currentColor" : "none"}
                    aria-label={isWished ? "Remove from wishlist" : "Add to wishlist"}
                  />
                </SubmitButton>
              </form>
              </div>
            );
          })}
        </section>
      )}

      {/* PAGER */}

      {pageCount > 1 && (
        <nav
          aria-label="Binder pages"
          className="mt-6 flex items-center justify-center gap-3"
        >
          {page > 1 ? (
            <Link
              href={binderHref(playerId, {
                q,
                race,
                show,
                page: page - 1,
              })}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-white/10 px-4 text-sm font-bold text-zinc-300 transition hover:border-amber-300/30 hover:text-amber-200"
            >
              <ChevronLeft size={16} />
              Previous
            </Link>
          ) : null}

          <span className="text-sm tabular-nums text-zinc-500">
            {page} / {pageCount}
          </span>

          {page < pageCount ? (
            <Link
              href={binderHref(playerId, {
                q,
                race,
                show,
                page: page + 1,
              })}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-white/10 px-4 text-sm font-bold text-zinc-300 transition hover:border-amber-300/30 hover:text-amber-200"
            >
              Next
              <ChevronRight size={16} />
            </Link>
          ) : null}
        </nav>
      )}
    </main>
  );
}
