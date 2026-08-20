import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  House,
  Layers3,
  Plus,
  ShieldCheck,
  Swords,
} from "lucide-react";

import { requireUser } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

type Deck = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "ready" | "archived";
  is_active: boolean;
  created_at: string;
};

type DeckCard = {
  deck_id: string;
  section: "main" | "extra";
};

function StatusBadge({
  status,
  isActive,
}: {
  status: Deck["status"];
  isActive: boolean;
}) {
  if (isActive) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-200">
        <CheckCircle2 size={11} />
        Active
      </span>
    );
  }

  if (status === "ready") {
    return (
      <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200">
        Ready
      </span>
    );
  }

  if (status === "archived") {
    return (
      <span className="rounded-full border border-zinc-500/25 bg-zinc-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-zinc-400">
        Archived
      </span>
    );
  }

  return (
    <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200">
      Draft
    </span>
  );
}

function DeckCardTile({
  deck,
  mainCount,
  extraCount,
}: {
  deck: Deck;
  mainCount: number;
  extraCount: number;
}) {
  const isArchived =
    deck.status === "archived";

  const isReady =
    deck.status === "ready";

  const actionLabel =
    isArchived
      ? "View Archived Deck"
      : isReady
        ? "Open Deck"
        : "Edit Deck";

  return (
    <Link
      href={`/decks/${deck.id}`}
      className={`
        panel group block p-5
        transition-all duration-150
        hover:-translate-y-1
        hover:shadow-lg
        active:scale-[0.99]
        ${
          deck.is_active
            ? "border-cyan-300/30"
            : isArchived
              ? "opacity-70 hover:opacity-100"
              : "hover:border-amber-300/25"
        }
      `}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={deck.status}
              isActive={deck.is_active}
            />
          </div>

          <h2
            className={`mt-3 truncate text-xl font-black transition ${
              deck.is_active
                ? "text-cyan-100"
                : "text-zinc-100 group-hover:text-amber-200"
            }`}
          >
            {deck.name}
          </h2>

          {deck.description && (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-500">
              {deck.description}
            </p>
          )}
        </div>

        <Layers3
          size={24}
          className={
            deck.is_active
              ? "shrink-0 text-cyan-300"
              : "shrink-0 text-amber-300"
          }
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <div className="flex items-center gap-2 text-zinc-500">
            <Swords size={14} />

            <span className="text-[10px] font-bold uppercase tracking-wider">
              Main
            </span>
          </div>

          <p className="mt-1 text-xl font-black">
            {mainCount}

            <span className="text-sm text-zinc-600">
              {" "}
              / 60
            </span>
          </p>

          <p
            className={`mt-1 text-[10px] font-bold ${
              mainCount >= 40
                ? "text-emerald-300"
                : "text-zinc-600"
            }`}
          >
            {mainCount >= 40
              ? "Minimum reached"
              : `Need ${40 - mainCount} more`}
          </p>
        </div>

        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <div className="flex items-center gap-2 text-zinc-500">
            <ShieldCheck size={14} />

            <span className="text-[10px] font-bold uppercase tracking-wider">
              Extra
            </span>
          </div>

          <p className="mt-1 text-xl font-black">
            {extraCount}

            <span className="text-sm text-zinc-600">
              {" "}
              / 15
            </span>
          </p>

          <p className="mt-1 text-[10px] font-bold text-zinc-600">
            Fusion + XYZ
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-white/5 pt-4">
        <p
          className={`text-sm font-black transition ${
            deck.is_active
              ? "text-cyan-300 group-hover:text-cyan-200"
              : "text-amber-300 group-hover:text-amber-200"
          }`}
        >
          {actionLabel} →
        </p>
      </div>
    </Link>
  );
}

export default async function DecksPage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  // ======================================================
  // LEAGUE
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
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="panel p-6">
          Geen league gevonden.
        </div>
      </main>
    );
  }

  // ======================================================
  // DECKS
  // ======================================================

  const {
    data: deckData,
    error: deckError,
  } = await supabase
    .from("decks")
    .select(
      "id,name,description,status,is_active,created_at"
    )
    .eq(
      "owner_id",
      userId
    )
    .eq(
      "league_id",
      membership.league_id
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    );

  if (deckError) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="panel p-6">
          <p className="font-bold text-red-300">
            Decks konden niet worden geladen.
          </p>

          <p className="mt-2 text-sm text-zinc-500">
            {deckError.message}
          </p>
        </div>
      </main>
    );
  }

  const decks =
    (deckData ?? []) as Deck[];

  // ======================================================
  // DECK CARD COUNTS
  // ======================================================

  const deckIds =
    decks.map(
      (deck) =>
        deck.id
    );

  let deckCards:
    DeckCard[] =
    [];

  if (
    deckIds.length >
    0
  ) {
    const {
      data: deckCardData,
      error: deckCardError,
    } = await supabase
      .from("deck_cards")
      .select(
        "deck_id,section"
      )
      .in(
        "deck_id",
        deckIds
      );

    if (
      deckCardError
    ) {
      return (
        <main className="mx-auto max-w-6xl px-4 py-8">
          <div className="panel p-6">
            Deckkaarten konden niet worden geladen.
          </div>
        </main>
      );
    }

    deckCards =
      (deckCardData ??
        []) as DeckCard[];
  }

  const countsByDeck =
    new Map<
      string,
      {
        main: number;
        extra: number;
      }
    >();

  for (
    const deck of
    decks
  ) {
    countsByDeck.set(
      deck.id,
      {
        main: 0,
        extra: 0,
      }
    );
  }

  for (
    const card of
    deckCards
  ) {
    const counts =
      countsByDeck.get(
        card.deck_id
      );

    if (!counts) {
      continue;
    }

    if (
      card.section ===
      "extra"
    ) {
      counts.extra += 1;
    } else {
      counts.main += 1;
    }
  }

  // ======================================================
  // GROUPS
  // ======================================================

  const activeDeck =
    decks.find(
      (deck) =>
        deck.is_active
    );

  const normalDecks =
    decks.filter(
      (deck) =>
        !deck.is_active &&
        deck.status !==
          "archived"
    );

  const archivedDecks =
    decks.filter(
      (deck) =>
        deck.status ===
        "archived"
    );

  const readyCount =
    decks.filter(
      (deck) =>
        deck.status ===
        "ready"
    ).length;

  const draftCount =
    decks.filter(
      (deck) =>
        deck.status ===
        "draft"
    ).length;

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* NAV */}

      <nav className="flex flex-wrap items-center gap-3">
        <Link
          href="/"
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300 transition-all hover:-translate-x-0.5 hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-200 active:scale-95"
        >
          <ArrowLeft size={17} />
          Back
        </Link>

        <Link
          href="/"
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-sm font-bold text-zinc-400 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-100 active:scale-95"
        >
          <House size={16} />
          Home
        </Link>
      </nav>

      {/* HEADER */}

      <header className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black tracking-[.28em] text-amber-300">
            MY DECKS
          </p>

          <h1 className="gold-text mt-2 text-4xl font-black">
            Decks
          </h1>

          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Build, manage and select your decks.
          </p>
        </div>

        <Link
          href="/decks/new"
          className="primary-button inline-flex cursor-pointer items-center justify-center gap-2 transition-all active:scale-[0.97]"
        >
          <Plus size={17} />
          Create Deck
        </Link>
      </header>

      {/* STATS */}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Total decks
          </p>

          <p className="mt-1 text-2xl font-black">
            {decks.length}
          </p>
        </div>

        <div className="panel p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Draft
          </p>

          <p className="mt-1 text-2xl font-black text-amber-200">
            {draftCount}
          </p>
        </div>

        <div className="panel p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Ready
          </p>

          <p className="mt-1 text-2xl font-black text-emerald-200">
            {readyCount}
          </p>
        </div>

        <div className="panel p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Active deck
          </p>

          <p className="mt-1 truncate text-lg font-black text-cyan-200">
            {activeDeck
              ? activeDeck.name
              : "None"}
          </p>
        </div>
      </section>

      {/* NO DECKS */}

      {decks.length ===
      0 ? (
        <section className="panel mt-6 p-10 text-center">
          <Layers3
            size={42}
            className="mx-auto text-zinc-600"
          />

          <h2 className="mt-4 text-2xl font-black">
            No decks yet
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
            Create your first deck and add cards from your Collection.
          </p>

          <Link
            href="/decks/new"
            className="primary-button mt-6 inline-flex cursor-pointer items-center justify-center gap-2"
          >
            <Plus size={17} />
            Create First Deck
          </Link>
        </section>
      ) : (
        <>
          {/* ACTIVE DECK */}

          {activeDeck && (
            <section className="mt-7">
              <div className="flex items-center gap-2">
                <CheckCircle2
                  size={18}
                  className="text-cyan-300"
                />

                <div>
                  <p className="text-xs font-black tracking-[.2em] text-cyan-300">
                    ACTIVE DECK
                  </p>

                  <h2 className="mt-1 text-2xl font-black">
                    Currently Selected
                  </h2>
                </div>
              </div>

              <div className="mt-4 max-w-xl">
                <DeckCardTile
                  deck={activeDeck}
                  mainCount={
                    countsByDeck.get(
                      activeDeck.id
                    )?.main ?? 0
                  }
                  extraCount={
                    countsByDeck.get(
                      activeDeck.id
                    )?.extra ?? 0
                  }
                />
              </div>
            </section>
          )}

          {/* NORMAL DECKS */}

          <section className="mt-8">
            <div>
              <p className="text-xs font-black tracking-[.2em] text-amber-300">
                AVAILABLE DECKS
              </p>

              <h2 className="mt-1 text-2xl font-black">
                Your Decks
              </h2>
            </div>

            {normalDecks.length ===
            0 ? (
              <div className="panel mt-4 p-6 text-sm text-zinc-500">
                No other Draft or Ready decks.
              </div>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {normalDecks.map(
                  (deck) => {
                    const counts =
                      countsByDeck.get(
                        deck.id
                      ) ?? {
                        main: 0,
                        extra: 0,
                      };

                    return (
                      <DeckCardTile
                        key={deck.id}
                        deck={deck}
                        mainCount={
                          counts.main
                        }
                        extraCount={
                          counts.extra
                        }
                      />
                    );
                  }
                )}
              </div>
            )}
          </section>

          {/* ARCHIVED */}

          {archivedDecks.length >
            0 && (
            <section className="mt-10 border-t border-white/5 pt-7">
              <div>
                <p className="text-xs font-black tracking-[.2em] text-zinc-600">
                  ARCHIVED
                </p>

                <h2 className="mt-1 text-xl font-black text-zinc-400">
                  Archived Decks
                </h2>

                <p className="mt-1 text-sm text-zinc-600">
                  Kept for history and future match records.
                </p>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {archivedDecks.map(
                  (deck) => {
                    const counts =
                      countsByDeck.get(
                        deck.id
                      ) ?? {
                        main: 0,
                        extra: 0,
                      };

                    return (
                      <DeckCardTile
                        key={deck.id}
                        deck={deck}
                        mainCount={
                          counts.main
                        }
                        extraCount={
                          counts.extra
                        }
                      />
                    );
                  }
                )}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}