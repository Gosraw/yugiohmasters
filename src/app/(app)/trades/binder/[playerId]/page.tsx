import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ArrowLeft,
  Home,
  Repeat2,
  Sparkles,
  Tag,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  fetchOwnedCollection,
  filterAndSortCollection,
  rarityStyles,
} from "@/lib/collection";

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
}: {
  params: Promise<{
    playerId: string;
  }>;
}) {
  const { playerId } = await params;

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
  // FOR-TRADE CARDS
  // ======================================================

  let forTradeCards;

  try {
    const owned = await fetchOwnedCollection(
      supabase,
      playerId,
      membership.league_id
    );

    forTradeCards = filterAndSortCollection(
      owned,
      {
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
            {forTradeCards.length === 0
              ? "No physical copies marked for trade yet."
              : `${forTradeCards.length} unique card${
                  forTradeCards.length === 1 ? "" : "s"
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

      {/* GRID */}

      {forTradeCards.length === 0 ? (
        <section className="panel mt-8 p-10 text-center">
          <Tag
            size={36}
            className="mx-auto text-zinc-600"
          />

          <h2 className="mt-4 text-xl font-black">
            Nothing here yet
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
            {isOwnBinder
              ? "Mark physical copies as “For Trade” from a card's detail page to list them here."
              : `${playerName(profile)} hasn't marked any cards for trade yet.`}
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

            return (
              <Link
                key={card.id}
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
            );
          })}
        </section>
      )}
    </main>
  );
}
