import Image from "next/image";
import Link from "next/link";

import {
  BookOpen,
  CalendarDays,
  Copy,
  Gauge,
  Hash,
  Layers3,
  Lock,
  LockKeyhole,
  Repeat2,
  ScrollText,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Swords,
  Tag,
  Unlock,
  UnlockKeyhole,
} from "lucide-react";

import type {
  ReactNode,
} from "react";

import {
  notFound,
} from "next/navigation";

import {
  CardBackLink,
} from "@/components/card-back-link";

import {
  CardDetailKeyNav,
} from "@/components/card-detail-key-nav";

import {
  CardDetailSwipeNav,
} from "@/components/card-detail-swipe-nav";

import {
  SubmitButton,
} from "@/components/submit-button";

import {
  setCardForTrade,
} from "@/app/actions/cards";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  getLeagueIdForUser,
} from "@/lib/league-stats";

import {
  fetchOwnedCollection,
  filterAndSortCollection,
  parseCollectionReturnTo,
} from "@/lib/collection";

import {
  MasterDuelBadge,
} from "@/components/master-duel-badge";

export const dynamic =
  "force-dynamic";

// =========================================================
// RARITY
// =========================================================

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
    "border-yellow-300/50 bg-yellow-300/15 text-yellow-200 shadow-[0_0_30px_rgba(250,204,21,0.12)]",
};

// =========================================================
// TYPES
// =========================================================

type OwnedCopy = {
  id: string;

  copy_number:
    number;

  locked:
    boolean;

  lock_type:
    | string
    | null;

  acquired_at:
    string;

  for_trade:
    boolean;
};

type DeckRow = {
  id: string;
  name: string;
};

type DeckCardRow = {
  deck_id: string;
  card_instance_id: string;
};

// =========================================================
// SMALL COMPONENTS
// =========================================================

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-b border-white/8 py-3 last:border-b-0">
      <div className="flex items-center gap-3 text-zinc-300">
        <span className="text-amber-300">
          {icon}
        </span>

        <span>
          {label}
        </span>
      </div>

      <span className="text-right font-medium text-zinc-100">
        {value}
      </span>
    </div>
  );
}

function RarityBadge({
  rarity,
}: {
  rarity:
    | string
    | null;
}) {
  const name =
    rarity ??
    "Not Rated";

  const style =
    rarityStyles[
      name
    ] ??
    "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[.14em] ${style}`}
    >
      <Sparkles
        size={15}
      />

      {name}
    </span>
  );
}

// =========================================================
// PAGE
// =========================================================

export default async function CardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    returnTo?: string;
  }>;
}) {
  const {
    id,
  } = await params;

  const {
    returnTo,
  } = await searchParams;

  const {
    supabase,
    userId,
  } = await requireUser();

  // A player can technically belong to more than one league. Scoping
  // owned-copies lookups by league_id keeps this page consistent with
  // the deck builder (see the deck_cards fix in commit b90a694).
  const leagueId =
    await getLeagueIdForUser(
      supabase,
      userId
    );

  // ======================================================
  // CARD
  // ======================================================

  const {
    data: card,
    error: cardError,
  } = await supabase
    .from(
      "card_catalog"
    )
    .select("*")
    .eq(
      "id",
      id
    )
    .single();

  if (
    cardError ||
    !card
  ) {
    notFound();
  }

  // ======================================================
  // OWNED PHYSICAL COPIES
  // ======================================================

  let ownedCopiesQuery = supabase
    .from(
      "card_instances"
    )
    .select(
      `
        id,
        copy_number,
        locked,
        lock_type,
        acquired_at,
        for_trade
      `
    )
    .eq(
      "card_catalog_id",
      id
    )
    .eq(
      "current_owner_id",
      userId
    );

  if (leagueId) {
    ownedCopiesQuery =
      ownedCopiesQuery.eq(
        "league_id",
        leagueId
      );
  }

  const {
    data: copiesData,
    error: copiesError,
  } = await ownedCopiesQuery.order(
    "copy_number",
    {
      ascending: true,
    }
  );

  const ownedCopies =
    copiesError
      ? []
      : (
          copiesData ??
          []
        ) as OwnedCopy[];

  const availableCopies =
    ownedCopies.filter(
      (copy) =>
        !copy.locked
    );

  const lockedCopies =
    ownedCopies.filter(
      (copy) =>
        copy.locked
    );

  // ======================================================
  // DECK USAGE
  //
  // Shows where this catalog card appears in the user's
  // tracked deck lists.
  // ======================================================

  const {
    data: deckData,
    error: deckError,
  } = await supabase
    .from("decks")
    .select(
      "id,name"
    )
    .eq(
      "owner_id",
      userId
    );

  if (deckError) {
    throw new Error(
      deckError.message
    );
  }

  const decks =
    (deckData ??
      []) as DeckRow[];

  const deckIds =
    decks.map(
      (deck) =>
        deck.id
    );

  let deckCardRows:
    DeckCardRow[] =
    [];

  if (
    deckIds.length >
    0 &&
    ownedCopies.length >
    0
  ) {
    const ownedCopyIds =
      ownedCopies.map(
        (copy) =>
          copy.id
      );

    const {
      data: deckCardsData,
      error: deckCardsError,
    } = await supabase
      .from(
        "deck_cards"
      )
      .select(
        `
          deck_id,
          card_instance_id
        `
      )
      .in(
        "deck_id",
        deckIds
      )
      .in(
        "card_instance_id",
        ownedCopyIds
      );

    if (deckCardsError) {
      throw new Error(
        deckCardsError.message
      );
    }

    deckCardRows =
      (deckCardsData ??
        []) as DeckCardRow[];
  }

  const deckMap =
    new Map(
      decks.map(
        (deck) => [
          deck.id,
          deck,
        ]
      )
    );

  // Informational, non-blocking signals - a copy can be In Deck
  // and In Pending Offer and For Trade all at once. Only an
  // active wager lock (copy.locked) actually reserves a copy.

  const inDeckInstanceIds =
    new Set(
      deckCardRows.map(
        (row) =>
          row.card_instance_id
      )
    );

  let inPendingOfferInstanceIds =
    new Set<string>();

  if (
    ownedCopies.length >
    0
  ) {
    const {
      data:
        pendingOfferData,
    } = await supabase
      .from(
        "trade_items"
      )
      .select(
        "card_instance_id,trades!inner(status)"
      )
      .in(
        "card_instance_id",
        ownedCopies.map(
          (copy) =>
            copy.id
        )
      )
      .eq(
        "trades.status",
        "pending"
      );

    inPendingOfferInstanceIds =
      new Set(
        (
          pendingOfferData ??
          []
        ).map(
          (row: {
            card_instance_id: string;
          }) =>
            row.card_instance_id
        )
      );
  }

  const deckUsageCount =
    new Map<
      string,
      number
    >();

  for (
    const row
    of deckCardRows
  ) {
    deckUsageCount.set(
      row.deck_id,
      (
        deckUsageCount.get(
          row.deck_id
        ) ?? 0
      ) + 1
    );
  }

  const usedInDecks = [
    ...deckUsageCount.entries(),
  ]
    .map(
      ([
        deckId,
        quantity,
      ]) => {
        const deck =
          deckMap.get(
            deckId
          );

        if (!deck) {
          return null;
        }

        return {
          deck,
          quantity,
        };
      }
    )
    .filter(
      (
        value
      ): value is {
        deck: DeckRow;
        quantity: number;
      } =>
        Boolean(value)
    );

  // ======================================================
  // DISPLAY DATA
  // ======================================================

  const createdDate =
    card.created_at
      ? new Date(
          card.created_at
        ).toLocaleDateString(
          "en-GB",
          {
            day:
              "2-digit",

            month:
              "short",

            year:
              "numeric",
          }
        )
      : null;

  const confidence =
    card.rarity_confidence !=
    null
      ? Math.round(
          Number(
            card.rarity_confidence
          ) *
            100
        )
      : null;

  const powerScore =
    card.rarity_score !=
    null
      ? Number(
          card.rarity_score
        ).toFixed(
          1
        )
      : null;

  const fullyUnavailable =
    ownedCopies.length >
      0 &&
    availableCopies.length ===
      0;

  // ======================================================
  // PREVIOUS / NEXT
  //
  // Computed from the SAME filtered/sorted collection view the
  // player was looking at (parsed out of returnTo), not raw
  // catalog order - so Next actually walks the list they were
  // browsing, not an unrelated global ordering.
  // ======================================================

  const collectionFilters =
    parseCollectionReturnTo(
      returnTo
    );

  let prevCardId:
    | string
    | null = null;

  let nextCardId:
    | string
    | null = null;

  if (
    collectionFilters
  ) {
    const ownedGroups =
      await fetchOwnedCollection(
        supabase,
        userId,
        leagueId
      );

    const ordered =
      filterAndSortCollection(
        ownedGroups,
        collectionFilters
      );

    const currentIndex =
      ordered.findIndex(
        (group) =>
          group.card
            .id === id
      );

    if (
      currentIndex >=
      0
    ) {
      if (
        currentIndex >
        0
      ) {
        prevCardId =
          ordered[
            currentIndex -
              1
          ].card.id;
      }

      if (
        currentIndex <
        ordered.length -
          1
      ) {
        nextCardId =
          ordered[
            currentIndex +
              1
          ].card.id;
      }
    }
  }

  const withReturnTo = (
    cardId: string
  ) =>
    returnTo
      ? `/cards/${cardId}?returnTo=${encodeURIComponent(
          returnTo
        )}`
      : `/cards/${cardId}`;

  const prevHref =
    prevCardId
      ? withReturnTo(
          prevCardId
        )
      : null;

  const nextHref =
    nextCardId
      ? withReturnTo(
          nextCardId
        )
      : null;

  const backHref =
    returnTo &&
    returnTo.startsWith(
      "/"
    ) &&
    !returnTo.startsWith(
      "//"
    )
      ? returnTo
      : "/cards/collection";

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* BACKGROUND */}

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-amber-400/[0.05] blur-[150px]" />

        <div className="absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-violet-500/[0.05] blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ==================================================
            BACK
        ================================================== */}

        <CardDetailKeyNav
          prevHref={
            prevHref
          }
          nextHref={
            nextHref
          }
          backHref={
            backHref
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardBackLink
            returnTo={
              returnTo
            }
          />

          {(prevHref ||
            nextHref) && (
            <div className="flex items-center gap-2">
              {prevHref ? (
                <Link
                  href={
                    prevHref
                  }
                  title="Previous card (ArrowLeft)"
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-black text-zinc-300 transition hover:border-amber-300/30 hover:text-amber-200"
                >
                  ← Previous
                </Link>
              ) : (
                <span className="inline-flex h-11 cursor-not-allowed items-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.01] px-4 text-sm font-black text-zinc-700">
                  ← Previous
                </span>
              )}

              {nextHref ? (
                <Link
                  href={
                    nextHref
                  }
                  title="Next card (ArrowRight)"
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-black text-zinc-300 transition hover:border-amber-300/30 hover:text-amber-200"
                >
                  Next →
                </Link>
              ) : (
                <span className="inline-flex h-11 cursor-not-allowed items-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.01] px-4 text-sm font-black text-zinc-700">
                  Next →
                </span>
              )}
            </div>
          )}
        </div>

        {/* ==================================================
            HEADER
        ================================================== */}

        <header className="mt-7">
          <div className="flex flex-wrap items-center gap-3">
            <RarityBadge
              rarity={
                card.game_rarity
              }
            />

            {card.rarity_needs_review && (
              <span className="rounded-full border border-orange-400/25 bg-orange-400/10 px-3 py-2 text-xs font-bold text-orange-200">
                Rarity Review
              </span>
            )}

            {ownedCopies.length >
              0 && (
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-200">
                OWNED x
                {
                  ownedCopies.length
                }
              </span>
            )}

            {fullyUnavailable && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs font-black text-red-200">
                <LockKeyhole
                  size={13}
                />

                ALL COPIES LOCKED
              </span>
            )}
          </div>

          <h1 className="mt-5 text-4xl font-black tracking-tight text-zinc-100 sm:text-5xl">
            {
              card.name
            }
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm sm:text-base">
            <span className="font-bold text-amber-300">
              {
                card.card_type
              }
            </span>

            {card.monster_type && (
              <>
                <span className="text-zinc-700">
                  |
                </span>

                <span className="text-zinc-300">
                  {
                    card.monster_type
                  }
                </span>
              </>
            )}

            {card.archetype && (
              <>
                <span className="text-zinc-700">
                  |
                </span>

                <span className="text-zinc-500">
                  {
                    card.archetype
                  }
                </span>
              </>
            )}
          </div>
        </header>

        {/* ==================================================
            MAIN LAYOUT
        ================================================== */}

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* =================================================
              LEFT COLUMN
          ================================================= */}

          <section className="lg:sticky lg:top-6">
            <div className="panel relative overflow-hidden p-3">
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
                  className="mx-auto h-auto w-full max-w-[280px] rounded-lg"
                  unoptimized
                />
              ) : (
                <div className="flex aspect-[421/614] w-full items-center justify-center rounded-lg bg-zinc-900 text-sm text-zinc-600">
                  No image
                </div>
              )}

              {/* Mobile-only swipe zone over the artwork - Previous/
                  Next buttons below always work too, this is purely
                  additive. See card-detail-swipe-nav.tsx. */}

              <CardDetailSwipeNav
                prevHref={
                  prevHref
                }
                nextHref={
                  nextHref
                }
              />
            </div>

            {/* ATK / DEF */}

            <div className="mt-3 grid grid-cols-2 gap-3">
              {card.atk !=
                null && (
                <div className="panel p-4">
                  <p className="text-xs font-bold tracking-wider text-zinc-500">
                    ATK
                  </p>

                  <p className="mt-1 text-2xl font-black text-red-100">
                    {
                      card.atk
                    }
                  </p>
                </div>
              )}

              {card.def !=
                null && (
                <div className="panel p-4">
                  <p className="text-xs font-bold tracking-wider text-zinc-500">
                    DEF
                  </p>

                  <p className="mt-1 text-2xl font-black text-cyan-100">
                    {
                      card.def
                    }
                  </p>
                </div>
              )}
            </div>

            {/* POWER */}

            {powerScore && (
              <div className="panel mt-3 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold tracking-wider text-zinc-500">
                    POWER SCORE
                  </span>

                  <Gauge
                    size={17}
                    className="text-amber-300"
                  />
                </div>

                <div className="mt-2 flex items-end gap-1">
                  <span className="text-3xl font-black text-amber-200">
                    {
                      powerScore
                    }
                  </span>

                  <span className="mb-1 text-sm text-zinc-600">
                    / 100
                  </span>
                </div>

                {confidence !=
                  null && (
                  <p className="mt-2 text-xs text-zinc-500">
                    Classification confidence:{" "}
                    {
                      confidence
                    }
                    %
                  </p>
                )}
              </div>
            )}

            {/* OWNERSHIP SUMMARY */}

            <div className="panel mt-3 p-4">
              <div className="flex items-center gap-2">
                <Copy
                  size={16}
                  className="text-amber-300"
                />

                <p className="text-xs font-black uppercase tracking-[.16em] text-zinc-500">
                  Your Inventory
                </p>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <p className="text-xl font-black text-zinc-100">
                    {
                      ownedCopies.length
                    }
                  </p>

                  <p className="mt-1 text-[8px] font-black uppercase tracking-wider text-zinc-600">
                    Owned
                  </p>
                </div>

                <div className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.025] p-3">
                  <p className="text-xl font-black text-cyan-200">
                    {
                      availableCopies.length
                    }
                  </p>

                  <p className="mt-1 text-[8px] font-black uppercase tracking-wider text-zinc-600">
                    Free
                  </p>
                </div>

                <div className="rounded-xl border border-red-300/10 bg-red-300/[0.02] p-3">
                  <p className="text-xl font-black text-red-200">
                    {
                      lockedCopies.length
                    }
                  </p>

                  <p className="mt-1 text-[8px] font-black uppercase tracking-wider text-zinc-600">
                    Locked
                  </p>
                </div>
              </div>
            </div>

            {/* QUICK ACTIONS */}

            <div className="panel mt-3 p-4">
              <p className="text-[9px] font-black uppercase tracking-[.18em] text-zinc-600">
                Card Actions
              </p>

              <div className="mt-3 space-y-2">
                <Link
                  href={
                    backHref
                  }
                  className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-3 text-sm font-black text-zinc-300 transition hover:border-amber-300/20 hover:text-amber-200"
                >
                  <span className="flex items-center gap-2">
                    <Copy
                      size={14}
                    />

                    Collection
                  </span>

                  <span>
                    →
                  </span>
                </Link>

                <Link
                  href="/decks"
                  className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-3 text-sm font-black text-zinc-300 transition hover:border-cyan-300/20 hover:text-cyan-200"
                >
                  <span className="flex items-center gap-2">
                    <Layers3
                      size={14}
                    />

                    Deck Builder
                  </span>

                  <span>
                    →
                  </span>
                </Link>

                <Link
                  href="/trades"
                  className={`flex items-center justify-between rounded-xl border px-3 py-3 text-sm font-black transition ${
                    availableCopies.length >
                    0
                      ? "border-white/[0.07] bg-white/[0.02] text-zinc-300 hover:border-violet-300/20 hover:text-violet-200"
                      : "pointer-events-none border-white/[0.04] bg-white/[0.01] text-zinc-700"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Repeat2
                      size={14}
                    />

                    Trade Hub
                  </span>

                  <span>
                    →
                  </span>
                </Link>
              </div>

              {ownedCopies.length >
                0 &&
                availableCopies.length ===
                  0 && (
                <p className="mt-3 text-[10px] leading-5 text-red-300/70">
                  You own this card, but every physical copy is currently locked by an active Practice Duel wager.
                </p>
              )}

              {availableCopies.length >
                0 && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-cyan-300/10 bg-cyan-300/[0.025] p-3">
                  <UnlockKeyhole
                    size={13}
                    className="mt-0.5 shrink-0 text-cyan-300"
                  />

                  <p className="text-[10px] leading-5 text-zinc-600">
                    {
                      availableCopies.length
                    } physical copy
                    {availableCopies.length ===
                    1
                      ? " is"
                      : "ies are"}{" "}
                    not currently tied up in a Practice Duel wager - free to trade or wager next. Being in a deck or up for trade never blocks this.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* =================================================
              RIGHT COLUMN
          ================================================= */}

          <section className="space-y-5">
            {/* ===============================================
                CARD INFORMATION
            =============================================== */}

            <div className="panel p-5 sm:p-6">
              <h2 className="text-lg font-black text-amber-300">
                Card Information
              </h2>

              <div className="mt-4 grid gap-x-8 md:grid-cols-2">
                <div>
                  {card.attribute && (
                    <InfoRow
                      icon={
                        <Sparkles
                          size={18}
                        />
                      }
                      label="Attribute"
                      value={
                        card.attribute
                      }
                    />
                  )}

                  {(card.monster_type ||
                    card.race) && (
                    <InfoRow
                      icon={
                        <Layers3
                          size={18}
                        />
                      }
                      label="Type"
                      value={
                        card.monster_type ??
                        card.race
                      }
                    />
                  )}

                  {card.level !=
                    null && (
                    <InfoRow
                      icon={
                        <Star
                          size={18}
                        />
                      }
                      label="Level"
                      value={
                        card.level
                      }
                    />
                  )}

                  {card.rank !=
                    null && (
                    <InfoRow
                      icon={
                        <Star
                          size={18}
                        />
                      }
                      label="Rank"
                      value={
                        card.rank
                      }
                    />
                  )}

                  {card.link_rating !=
                    null && (
                    <InfoRow
                      icon={
                        <Layers3
                          size={18}
                        />
                      }
                      label="Link Rating"
                      value={
                        card.link_rating
                      }
                    />
                  )}

                  {card.atk !=
                    null && (
                    <InfoRow
                      icon={
                        <Swords
                          size={18}
                        />
                      }
                      label="ATK"
                      value={
                        card.atk
                      }
                    />
                  )}

                  {card.def !=
                    null && (
                    <InfoRow
                      icon={
                        <Shield
                          size={18}
                        />
                      }
                      label="DEF"
                      value={
                        card.def
                      }
                    />
                  )}
                </div>

                <div>
                  <InfoRow
                    icon={
                      <BookOpen
                        size={18}
                      />
                    }
                    label="Card Type"
                    value={
                      card.card_type
                    }
                  />

                  {card.frame_type && (
                    <InfoRow
                      icon={
                        <Layers3
                          size={18}
                        />
                      }
                      label="Frame Type"
                      value={
                        card.frame_type
                      }
                    />
                  )}

                  <InfoRow
                    icon={
                      <Hash
                        size={18}
                      />
                    }
                    label="Passcode"
                    value={
                      card.external_card_id
                    }
                  />

                  {card.archetype && (
                    <InfoRow
                      icon={
                        <Sparkles
                          size={18}
                        />
                      }
                      label="Archetype"
                      value={
                        card.archetype
                      }
                    />
                  )}

                  <InfoRow
                    icon={
                      <Sparkles
                        size={18}
                      />
                    }
                    label="Game Rarity"
                    value={
                      card.game_rarity ??
                      "Not Rated"
                    }
                  />

                  <InfoRow
                    icon={
                      <ShieldCheck
                        size={18}
                      />
                    }
                    label="Master Duel"
                    value={
                      <MasterDuelBadge
                        status={
                          card.master_duel_status
                        }
                        size="md"
                      />
                    }
                  />

                  {powerScore && (
                    <InfoRow
                      icon={
                        <Gauge
                          size={18}
                        />
                      }
                      label="Power Score"
                      value={`${powerScore} / 100`}
                    />
                  )}

                  {createdDate && (
                    <InfoRow
                      icon={
                        <CalendarDays
                          size={18}
                        />
                      }
                      label="Database Added"
                      value={
                        createdDate
                      }
                    />
                  )}
                </div>
              </div>
            </div>

            {/* ===============================================
                PHYSICAL OWNERSHIP
            =============================================== */}

            <div className="panel p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Copy
                    size={19}
                    className="text-amber-300"
                  />

                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[.18em] text-zinc-600">
                      Physical Inventory
                    </p>

                    <h2 className="mt-1 text-lg font-black text-amber-300">
                      Your Copies
                    </h2>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1 text-[9px] font-black uppercase text-cyan-200">
                    {
                      availableCopies.length
                    }{" "}
                    Free
                  </span>

                  <span className="rounded-full border border-red-300/20 bg-red-300/[0.05] px-3 py-1 text-[9px] font-black uppercase text-red-200">
                    {
                      lockedCopies.length
                    }{" "}
                    Locked
                  </span>
                </div>
              </div>

              {ownedCopies.length ===
              0 ? (
                <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-5">
                  <p className="font-bold text-zinc-300">
                    You do not own this card.
                  </p>

                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    This database entry exists, but no tracked physical copy currently belongs to your Collection.
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {ownedCopies.map(
                    (copy) => {
                      const acquiredDate =
                        new Date(
                          copy.acquired_at
                        ).toLocaleDateString(
                          "en-GB",
                          {
                            day:
                              "2-digit",

                            month:
                              "short",

                            year:
                              "numeric",
                          }
                        );

                      return (
                        <div
                          key={
                            copy.id
                          }
                          className={`rounded-xl border p-4 ${
                            copy.locked
                              ? "border-red-300/15 bg-red-300/[0.025]"
                              : "border-cyan-300/15 bg-cyan-300/[0.025]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xl font-black text-zinc-100">
                              #
                              {
                                copy.copy_number
                              }
                            </span>

                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              {copy.for_trade && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/25 bg-violet-400/10 px-2 py-1 text-[9px] font-black uppercase text-violet-200">
                                  <Tag
                                    size={10}
                                  />
                                  For Trade
                                </span>
                              )}

                              {inDeckInstanceIds.has(
                                copy.id
                              ) && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-[9px] font-black uppercase text-cyan-200">
                                  <Layers3
                                    size={10}
                                  />
                                  In Deck
                                </span>
                              )}

                              {inPendingOfferInstanceIds.has(
                                copy.id
                              ) && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[9px] font-black uppercase text-amber-200">
                                  <Repeat2
                                    size={10}
                                  />
                                  In Offer
                                </span>
                              )}

                              {copy.locked ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-red-400/25 bg-red-400/10 px-2 py-1 text-[9px] font-black uppercase text-red-200">
                                  <Lock
                                    size={10}
                                  />

                                  Locked
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[9px] font-black uppercase text-emerald-200">
                                  <Unlock
                                    size={10}
                                  />

                                  Available
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-4 border-t border-white/[0.05] pt-3">
                            <p className="text-[8px] font-black uppercase tracking-wider text-zinc-600">
                              Acquired
                            </p>

                            <p className="mt-1 text-sm font-bold text-zinc-300">
                              {
                                acquiredDate
                              }
                            </p>
                          </div>

                          {copy.locked &&
                            copy.lock_type && (
                            <div className="mt-3 rounded-lg border border-red-300/10 bg-black/20 p-3">
                              <div className="flex items-center gap-2">
                                <LockKeyhole
                                  size={12}
                                  className="text-red-300"
                                />

                                <p className="text-[8px] font-black uppercase tracking-wider text-zinc-600">
                                  Locked For
                                </p>
                              </div>

                              <p className="mt-1 text-sm font-black capitalize text-red-200">
                                {
                                  copy.lock_type
                                }
                              </p>
                            </div>
                          )}

                          {!copy.locked && (
                            <div className="mt-3 rounded-lg border border-cyan-300/10 bg-cyan-300/[0.025] p-3">
                              <div className="flex items-center gap-2">
                                <UnlockKeyhole
                                  size={12}
                                  className="text-cyan-300"
                                />

                                <p className="text-[8px] font-black uppercase tracking-wider text-cyan-300">
                                  Free Copy
                                </p>
                              </div>

                              <p className="mt-1 text-[10px] leading-5 text-zinc-600">
                                Eligible for a trade or Practice Duel card wager.
                              </p>
                            </div>
                          )}

                          <Link
                            href={`/cards/legacy/${copy.id}`}
                            className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-200 transition-all hover:-translate-y-0.5 hover:border-amber-300/30 hover:bg-amber-300/[0.08] active:scale-[0.97]"
                          >
                            <ScrollText
                              size={12}
                            />
                            View Card Legacy
                          </Link>

                          {/* For Trade is a pure interest signal -
                              it reserves nothing, so it can be set
                              regardless of deck use, pending offers,
                              or even an active wager lock. */}

                          {
                            <form
                              action={
                                setCardForTrade
                              }
                              className="mt-2"
                            >
                              <input
                                type="hidden"
                                name="card_instance_id"
                                value={
                                  copy.id
                                }
                              />

                              <input
                                type="hidden"
                                name="for_trade"
                                value={String(
                                  !copy.for_trade
                                )}
                              />

                              <input
                                type="hidden"
                                name="return_to"
                                value={`/cards/${id}${
                                  returnTo
                                    ? `?returnTo=${encodeURIComponent(
                                        returnTo
                                      )}`
                                    : ""
                                }`}
                              />

                              <SubmitButton
                                pendingLabel="Saving..."
                                className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-wider ${
                                  copy.for_trade
                                    ? "border-violet-300/20 bg-violet-300/[0.04] text-violet-200 hover:border-violet-300/40"
                                    : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-emerald-300/30 hover:text-emerald-200"
                                }`}
                              >
                                <Tag
                                  size={12}
                                />
                                {copy.for_trade
                                  ? "Remove From Trade List"
                                  : "Mark For Trade"}
                              </SubmitButton>
                            </form>
                          }
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>

            {/* ===============================================
                DECK USAGE
            =============================================== */}

            <div className="panel p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <Layers3
                  size={18}
                  className="text-cyan-300"
                />

                <div>
                  <p className="text-[9px] font-black uppercase tracking-[.18em] text-zinc-600">
                    Deck Integration
                  </p>

                  <h2 className="mt-1 text-lg font-black text-cyan-200">
                    Used in Your Decks
                  </h2>
                </div>
              </div>

              {usedInDecks.length ===
              0 ? (
                <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="text-sm text-zinc-500">
                    This card is not currently listed in one of your decks.
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {usedInDecks.map(
                    ({
                      deck,
                      quantity,
                    }) => (
                      <Link
                        key={
                          deck.id
                        }
                        href={`/decks/${deck.id}`}
                        className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.025] p-4 transition hover:border-cyan-300/25"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-cyan-100">
                              {
                                deck.name
                              }
                            </p>

                            <p className="mt-1 text-xs text-zinc-600">
                              {
                                quantity
                              }{" "}
                              cop
                              {quantity ===
                              1
                                ? "y"
                                : "ies"}{" "}
                              in deck list
                            </p>
                          </div>

                          <ShieldCheck
                            size={16}
                            className="text-cyan-300"
                          />
                        </div>
                      </Link>
                    )
                  )}
                </div>
              )}
            </div>

            {/* ===============================================
                CARD TEXT
            =============================================== */}

            {card.description && (
              <div className="panel p-5 sm:p-6">
                <h2 className="text-lg font-black text-amber-300">
                  Card Text
                </h2>

                <p className="mt-4 whitespace-pre-line text-sm leading-7 text-zinc-300 sm:text-base">
                  {
                    card.description
                  }
                </p>
              </div>
            )}

            {/* ===============================================
                RARITY ANALYSIS
            =============================================== */}

            {card.rarity_reason && (
              <div className="panel p-5 sm:p-6">
                <div className="flex items-center gap-2">
                  <Gauge
                    size={18}
                    className="text-amber-300"
                  />

                  <h2 className="text-lg font-black text-amber-300">
                    Rarity Analysis
                  </h2>
                </div>

                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  {
                    card.rarity_reason
                  }
                </p>
              </div>
            )}

            {/* ===============================================
                LINK MARKERS
            =============================================== */}

            {Array.isArray(
              card.link_markers
            ) &&
              card.link_markers.length >
                0 && (
                <div className="panel p-5 sm:p-6">
                  <h2 className="text-lg font-black text-amber-300">
                    Link Markers
                  </h2>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {card.link_markers.map(
                      (
                        marker:
                          string
                      ) => (
                        <span
                          key={
                            marker
                          }
                          className="rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-1 text-sm text-amber-200"
                        >
                          {
                            marker
                          }
                        </span>
                      )
                    )}
                  </div>
                </div>
              )}
          </section>
        </div>
      </div>
    </main>
  );
}