"use client";

import Link from "next/link";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  ArrowLeft,
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";

import {
  parseDeckSearch,
  removeChipFromQuery,
} from "@/lib/deck-search-parser";

import {
  BrowseGrid,
} from "./browse-grid";

import {
  RARITY_ORDER,
  buildNameIndex,
  buildTextIndex,
  emptyPanel,
  filterAndSortCards,
  panelChips,
  rarityName,
  readUrlState,
  writeUrlState,
  type BuilderTab,
  type PanelState,
} from "./browse-state";

import {
  CardDetailSheet,
} from "./card-detail-sheet";

import {
  DeckList,
} from "./deck-list";

import {
  DeckMore,
} from "./deck-more";

import {
  createDeckStore,
} from "./deck-store";

import {
  FilterSheet,
} from "./filter-sheet";

import {
  NoticeToast,
} from "./notice-toast";

import {
  EXTRA_MAX,
  MAIN_MAX,
  MAIN_MIN,
  decodeBuilderCard,
  type BuilderCardWire,
  type BuilderDeck,
} from "./types";

// =========================================================
// DECK BUILDER (phone first)
//
// One client component owns the whole builder so a tap never needs a
// server render:
//   - deck contents live in an optimistic store (deck-store.ts); each
//     tap calls a Server Action that returns a result (no redirect, no
//     revalidate), so the page never re-renders or jumps
//   - search/filters run in the browser over the tile-weight
//     collection; effect text is fetched once, only when needed
//   - tab, search and filters are mirrored into the URL with
//     history.replaceState (no navigation)
// =========================================================

type TextResult = {
  texts: Record<string, string> | null;
  error: boolean;
};

function dirtyKey(
  deckId: string
) {
  return `dc-deck-changed:${deckId}`;
}

export function DeckBuilder({
  deck,
  cardsWire,
  initialInDeck,
  renderedAt,
}: {
  deck: BuilderDeck;
  // Compact tuples - see BuilderCardWire in ./types.
  cardsWire: BuilderCardWire[];
  initialInDeck: string[];
  renderedAt: number;
}) {
  const [cards] =
    useState(
      () =>
        cardsWire.map(
          decodeBuilderCard
        )
    );

  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const editable =
    deck.status ===
    "draft";

  // =======================================================
  // DECK STATE
  // =======================================================

  const [store] =
    useState(
      () =>
        createDeckStore({
          deckId: deck.id,
          cards,
          initialInDeck,
          onConfirmed: () => {
            try {
              sessionStorage.setItem(
                dirtyKey(
                  deck.id
                ),
                String(
                  Date.now()
                )
              );
            } catch {
              // Private mode etc. - only used to refresh a stale
              // back/forward copy of this page.
            }
          },
        })
    );

  const snapshot =
    useSyncExternalStore(
      store.subscribe,
      store.getSnapshot,
      store.getSnapshot
    );

  // Browser back/forward can restore an older render of this page
  // than the deck the player just edited - fetch a fresh one if so.
  useEffect(() => {
    try {
      const changedAt =
        Number(
          sessionStorage.getItem(
            dirtyKey(
              deck.id
            )
          ) ?? 0
        );

      if (
        changedAt >
        renderedAt
      ) {
        router.refresh();
      }
    } catch {
      // ignore
    }
  }, [deck.id, renderedAt, router]);

  const freeByCard =
    useMemo(() => {
      const free =
        new Map<string, number>();

      for (const card of cards) {
        let count = 0;

        for (const copy of card.copies) {
          if (
            !copy.locked &&
            !snapshot.inDeck.has(
              copy.id
            )
          ) {
            count += 1;
          }
        }

        // "Addable", not just free: a card that isn't deck legal or
        // already sits at our own copy limit gets a disabled +.
        if (!card.deck_legal) {
          count = 0;
        } else if (
          card.copy_limit !== null
        ) {
          count = Math.min(
            count,
            Math.max(
              0,
              card.copy_limit -
                (snapshot.countByCard.get(
                  card.id
                ) ?? 0)
            )
          );
        }

        free.set(
          card.id,
          count
        );
      }

      return free;
    }, [cards, snapshot.inDeck, snapshot.countByCard]);

  const deckSignature =
    useMemo(
      () =>
        [
          ...snapshot.inDeck,
        ]
          .sort()
          .join(","),
      [snapshot.inDeck]
    );

  const add =
    store.add;

  const remove =
    store.remove;

  const dismissNotice =
    store.dismissNotice;

  // =======================================================
  // VIEW STATE (seeded from the URL once)
  // =======================================================

  // window.location first: after a remount (e.g. router.refresh) it
  // still has the filters this builder wrote, which Next's own
  // searchParams don't know about (see the replaceState note below).
  // On the very first render both are the same URL.
  const [initialUrl] =
    useState(
      () =>
        readUrlState(
          new URLSearchParams(
            typeof window === "undefined"
              ? searchParams.toString()
              : window.location.search
          )
        )
    );

  const [tab, setTab] =
    useState<BuilderTab>(
      initialUrl.tab
    );

  const [query, setQuery] =
    useState(
      initialUrl.query
    );

  const [panel, setPanel] =
    useState<PanelState>(
      initialUrl.panel
    );

  const [filtersOpen, setFiltersOpen] =
    useState(false);

  const [detailId, setDetailId] =
    useState<string | null>(
      null
    );

  // Keeps the last card on screen while the sheet slides away.
  const [detailCardId, setDetailCardId] =
    useState<string | null>(
      null
    );

  useEffect(() => {
    const timer =
      window.setTimeout(
        () => {
          const next =
            writeUrlState(
              new URLSearchParams(
                window.location.search
              ),
              {
                tab,
                query,
                panel,
              }
            ).toString();

          const current =
            window.location.search.replace(
              /^\?/,
              ""
            );

          if (next !== current) {
            // Passing Next.js's own history state on purpose: Next then
            // leaves this replaceState alone. A plain replaceState is
            // synced into the router, and for this dynamic page that
            // means a full server render on every filter change - the
            // exact round trip this builder exists to avoid. The page
            // never reads these params on the server; the builder
            // reads them once, on load.
            window.history.replaceState(
              window.history.state,
              "",
              `${window.location.pathname}${next ? `?${next}` : ""}`
            );
          }
        },
        250
      );

    return () =>
      window.clearTimeout(
        timer
      );
  }, [tab, query, panel]);

  // Each tab remembers its own scroll position.
  const scrollByTab =
    useRef<Partial<Record<BuilderTab, number>>>(
      {}
    );

  const stickyRef =
    useRef<HTMLDivElement>(null);

  const switchingTab =
    useRef(false);

  const switchTab =
    useCallback(
      (next: BuilderTab) => {
        if (next === tab) {
          return;
        }

        scrollByTab.current[tab] =
          window.scrollY;

        switchingTab.current =
          true;

        setTab(next);
      },
      [tab]
    );

  useLayoutEffect(() => {
    if (!switchingTab.current) {
      return;
    }

    switchingTab.current =
      false;

    const saved =
      scrollByTab.current[tab];

    const stickyTop =
      stickyRef.current
        ? stickyRef.current.getBoundingClientRect().top +
          window.scrollY
        : 0;

    window.scrollTo({
      top:
        saved ??
        Math.min(
          window.scrollY,
          stickyTop
        ),
    });
  }, [tab]);

  // =======================================================
  // EFFECT TEXT (lazy)
  // =======================================================

  const [textResult, setTextResult] =
    useState<TextResult | null>(
      null
    );

  const textRequest =
    useRef<Promise<void> | null>(
      null
    );

  const ensureTexts =
    useCallback(() => {
      if (textRequest.current) {
        return;
      }

      textRequest.current =
        fetch(
          `/decks/${deck.id}/card-text`
        )
          .then(
            async (response) => {
              if (!response.ok) {
                throw new Error(
                  String(
                    response.status
                  )
                );
              }

              const data =
                (await response.json()) as {
                  texts: Record<string, string>;
                };

              setTextResult({
                texts:
                  data.texts,
                error: false,
              });
            }
          )
          .catch(() => {
            textRequest.current =
              null;

            setTextResult({
              texts: null,
              error: true,
            });
          });
    }, [deck.id]);

  // =======================================================
  // SEARCH + FILTERS
  // =======================================================

  const parsed =
    useMemo(
      () =>
        parseDeckSearch(
          query
        ),
      [query]
    );

  const hasTerms =
    parsed.terms.length >
    0;

  useEffect(() => {
    if (hasTerms) {
      ensureTexts();
    }
  }, [hasTerms, ensureTexts]);

  const nameIndex =
    useMemo(
      () =>
        buildNameIndex(
          cards
        ),
      [cards]
    );

  const textIndex =
    useMemo(
      () =>
        textResult?.texts
          ? buildTextIndex(
              textResult.texts
            )
          : null,
      [textResult]
    );

  const deferredQuery =
    useDeferredValue(
      query
    );

  const deferredParsed =
    useDeferredValue(
      parsed
    );

  const deferredPanel =
    useDeferredValue(
      panel
    );

  const filtered =
    useMemo(
      () =>
        filterAndSortCards({
          cards,
          query:
            deferredQuery,
          parsed:
            deferredParsed,
          panel:
            deferredPanel,
          nameIndex,
          textIndex,
        }),
      [
        cards,
        deferredQuery,
        deferredParsed,
        deferredPanel,
        nameIndex,
        textIndex,
      ]
    );

  const resetKey =
    useMemo(
      () =>
        `${deferredQuery}|${JSON.stringify(deferredPanel)}`,
      [deferredQuery, deferredPanel]
    );

  const chips =
    useMemo(
      () =>
        panelChips(
          panel
        ),
      [panel]
    );

  const rarities =
    useMemo(
      () =>
        [
          ...new Set(
            cards.map(
              rarityName
            )
          ),
        ].sort(
          (a, b) =>
            (RARITY_ORDER[b] ?? 0) -
            (RARITY_ORDER[a] ?? 0)
        ),
      [cards]
    );

  const archetypes =
    useMemo(
      () =>
        [
          ...new Set(
            cards
              .map(
                (card) =>
                  card.archetype
              )
              .filter(
                (value): value is string =>
                  Boolean(value)
              )
          ),
        ].sort(
          (a, b) =>
            a.localeCompare(
              b
            )
        ),
      [cards]
    );

  const anyFilter =
    query.trim() !== "" ||
    chips.length > 0;

  const resetAll =
    useCallback(() => {
      setQuery("");
      setPanel(
        emptyPanel()
      );
    }, []);

  // =======================================================
  // DETAIL SHEET
  // =======================================================

  const openDetail =
    useCallback(
      (cardId: string) => {
        setDetailId(cardId);
        setDetailCardId(cardId);
        ensureTexts();
      },
      [ensureTexts]
    );

  const closeDetail =
    useCallback(
      () =>
        setDetailId(null),
      []
    );

  const cardsById =
    useMemo(
      () =>
        new Map(
          cards.map(
            (card) => [
              card.id,
              card,
            ]
          )
        ),
      [cards]
    );

  const detailCard =
    detailCardId
      ? cardsById.get(
          detailCardId
        ) ?? null
      : null;

  // =======================================================
  // SUMMARY
  // =======================================================

  const {
    mainCount,
    extraCount,
  } = snapshot;

  const tooMany =
    mainCount > MAIN_MAX ||
    extraCount > EXTRA_MAX;

  const legal =
    mainCount >= MAIN_MIN &&
    !tooMany;

  const totalOwnedCopies =
    useMemo(
      () =>
        cards.reduce(
          (total, card) =>
            total +
            card.copies.length,
          0
        ),
      [cards]
    );

  const showSearch =
    tab === "browse";

  return (
    <main className="mx-auto max-w-[1500px] px-3 pb-6 pt-4 sm:px-6 lg:px-8">
      {/* HEADER */}

      <header className="flex items-start gap-2">
        <Link
          href="/decks"
          aria-label="Back to decks"
          className="-ml-1.5 grid size-11 shrink-0 place-items-center rounded-xl text-amber-300 transition active:scale-95 hover:bg-amber-300/10"
        >
          <ArrowLeft
            size={20}
          />
        </Link>

        <div className="min-w-0 flex-1 pt-1">
          <p className="text-[10px] font-black uppercase tracking-[.28em] text-amber-300/90">
            Deck builder
          </p>

          <h1 className="gold-text mt-0.5 line-clamp-2 text-2xl font-black leading-tight sm:text-3xl">
            {deck.name}
          </h1>
        </div>
      </header>

      {/* STICKY: tabs, live counts, search */}

      <div
        ref={stickyRef}
        className="sticky top-0 z-40 -mx-3 mt-3 border-b border-[var(--dc-gold-line-soft)] bg-[rgb(7_10_26/.9)] px-3 pb-2 pt-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      >
        <div
          role="tablist"
          aria-label="Deck builder sections"
          className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-black/30 p-1 lg:grid-cols-2"
        >
          {(
            [
              ["browse", "Browse", "lg:hidden"],
              ["deck", "My Deck", "lg:hidden"],
              ["builder", "Builder", "hidden lg:flex"],
              ["more", "More", ""],
            ] as const
          ).map(
            ([key, label, visibility]) => {
              const selected =
                key === "builder"
                  ? tab !== "more"
                  : tab === key;

              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() =>
                    switchTab(
                      key === "builder"
                        ? "browse"
                        : key
                    )
                  }
                  className={`${visibility} flex h-11 cursor-pointer touch-manipulation select-none items-center justify-center gap-1.5 rounded-xl text-[13px] font-black transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${
                    selected
                      ? "bg-amber-300/15 text-amber-100 shadow-[inset_0_0_0_1px_rgb(242_196_90/.35)]"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {label}

                  {key === "browse" && (
                    <span className="text-[11px] font-bold text-zinc-500">
                      {cards.length}
                    </span>
                  )}

                  {key === "deck" && (
                    <span className="text-[11px] font-bold tabular-nums text-zinc-500">
                      {mainCount + extraCount}
                    </span>
                  )}
                </button>
              );
            }
          )}
        </div>

        {/* Live deck summary */}

        <div className="mt-2 flex items-center gap-3 px-0.5 text-xs font-bold">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0 text-zinc-400">
              Main
            </span>

            <span
              className={`shrink-0 tabular-nums ${
                mainCount > MAIN_MAX
                  ? "text-red-300"
                  : mainCount >= MAIN_MIN
                    ? "text-emerald-300"
                    : "text-zinc-100"
              }`}
            >
              {mainCount}
              <span className="text-zinc-500">
                /{MAIN_MIN}–{MAIN_MAX}
              </span>
            </span>

            <span
              aria-hidden
              className="relative h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-white/10"
            >
              <span
                className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ease-out ${
                  mainCount > MAIN_MAX
                    ? "bg-red-400"
                    : mainCount >= MAIN_MIN
                      ? "bg-emerald-400"
                      : "bg-amber-300"
                }`}
                style={{
                  width: `${Math.min(100, (mainCount / MAIN_MIN) * 100)}%`,
                }}
              />
            </span>
          </div>

          <span className="shrink-0 text-zinc-400">
            Extra{" "}
            <span
              className={`tabular-nums ${
                extraCount > EXTRA_MAX
                  ? "text-red-300"
                  : "text-zinc-100"
              }`}
            >
              {extraCount}
              <span className="text-zinc-500">
                /{EXTRA_MAX}
              </span>
            </span>
          </span>

          {deck.status !== "draft" ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-cyan-200">
              <LockKeyhole
                size={10}
              />
              {deck.status === "archived"
                ? "Archived"
                : deck.isActive
                  ? "Active"
                  : "Ready"}
            </span>
          ) : legal ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-200">
              <CheckCircle2
                size={10}
              />
              Legal
            </span>
          ) : (
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                tooMany
                  ? "border-red-400/30 bg-red-400/10 text-red-200"
                  : "border-amber-300/30 bg-amber-300/10 text-amber-200"
              }`}
            >
              {tooMany
                ? "Too many"
                : `${MAIN_MIN - mainCount} to go`}
            </span>
          )}

          {snapshot.pending > 0 && (
            <LoaderCircle
              size={13}
              aria-label="Saving"
              className="shrink-0 animate-spin text-zinc-500"
            />
          )}
        </div>

        {/* Search */}

        <div
          className={`${showSearch ? "" : "hidden"} ${tab === "deck" ? "lg:block" : ""} mt-2`}
        >
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
              />

              <input
                type="search"
                value={query}
                onChange={(event) =>
                  setQuery(
                    event.target.value
                  )
                }
                onFocus={ensureTexts}
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Search your collection"
                placeholder='Try "dark warrior level 4"'
                className="field h-11 !rounded-xl !py-0 !pl-10 !pr-11 [&::-webkit-search-cancel-button]:hidden"
              />

              {query && (
                <button
                  type="button"
                  onClick={() =>
                    setQuery("")
                  }
                  aria-label="Clear search"
                  className="absolute right-0 top-0 grid size-11 cursor-pointer touch-manipulation place-items-center text-zinc-400 transition active:scale-90 hover:text-zinc-100"
                >
                  <X
                    size={17}
                  />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                setFiltersOpen(true)
              }
              aria-label={`Filters${chips.length ? ` (${chips.length} active)` : ""}`}
              className={`relative grid size-11 shrink-0 cursor-pointer touch-manipulation place-items-center rounded-xl border transition active:scale-95 ${
                chips.length > 0 ||
                panel.sort !== "name-asc"
                  ? "border-amber-300/50 bg-amber-300/15 text-amber-100"
                  : "border-white/10 bg-white/[0.03] text-zinc-300"
              }`}
            >
              <SlidersHorizontal
                size={18}
              />

              {chips.length > 0 && (
                <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-amber-300 px-1 text-[10px] font-black text-[var(--dc-gold-ink)]">
                  {chips.length}
                </span>
              )}
            </button>
          </div>

          {(anyFilter || parsed.chips.length > 0) && (
            <div className="mt-2 flex items-center gap-1">
              {/* Chips scroll sideways; the count and Clear stay put. */}
              <div className="-ml-3 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5 pl-3 [mask-image:linear-gradient(90deg,#000_calc(100%-1.25rem),transparent)] [scrollbar-width:none] sm:-ml-6 sm:pl-6 lg:-ml-8 lg:pl-8">
              {parsed.chips.map(
                (chip) => (
                  <button
                    key={`search:${chip.key}`}
                    type="button"
                    onClick={() =>
                      setQuery(
                        (current) =>
                          removeChipFromQuery(
                            current,
                            chip
                          )
                      )
                    }
                    aria-label={`Remove filter ${chip.label}`}
                    className="inline-flex h-9 shrink-0 cursor-pointer touch-manipulation select-none items-center gap-1 rounded-full border border-amber-300/40 bg-amber-300/10 pl-2.5 pr-2 text-xs font-bold text-amber-100 transition active:scale-95"
                  >
                    <Sparkles
                      size={11}
                      className="text-amber-300"
                    />
                    {chip.label}
                    <X
                      size={13}
                      className="text-amber-200/70"
                    />
                  </button>
                )
              )}

              {chips.map(
                (chip) => (
                  <button
                    key={`panel:${chip.key}`}
                    type="button"
                    onClick={() =>
                      setPanel(
                        (current) =>
                          chip.clear(
                            current
                          )
                      )
                    }
                    aria-label={`Remove filter ${chip.label}`}
                    className="inline-flex h-9 shrink-0 cursor-pointer touch-manipulation select-none items-center gap-1 rounded-full border border-white/15 bg-white/[0.05] pl-3 pr-2 text-xs font-bold text-zinc-200 transition active:scale-95"
                  >
                    {chip.label}
                    <X
                      size={13}
                      className="text-zinc-400"
                    />
                  </button>
                )
              )}
              </div>

              <span className="shrink-0 pl-1 text-[11px] font-bold tabular-nums text-zinc-400">
                {filtered.length} card{filtered.length === 1 ? "" : "s"}
              </span>

              <button
                type="button"
                onClick={resetAll}
                className="h-9 shrink-0 cursor-pointer touch-manipulation rounded-full px-2.5 text-xs font-black text-amber-300 transition active:scale-95"
              >
                Clear
              </button>
            </div>
          )}

          {hasTerms &&
            !textResult && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                <LoaderCircle
                  size={11}
                  className="animate-spin"
                />
                Also searching card text...
              </p>
            )}
        </div>
      </div>

      {/* BODY */}

      <div
        className={`mt-3 ${tab === "more" ? "hidden" : "lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_420px]"}`}
      >
        <section
          role="tabpanel"
          aria-label="Browse your collection"
          className={`${tab === "browse" ? "" : "hidden"} lg:block`}
        >
          {!editable && (
            <div className="mb-2 flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-zinc-300">
              <LockKeyhole
                size={15}
                className="mt-0.5 shrink-0 text-zinc-400"
              />
              <p>
                {deck.status === "archived"
                  ? "This deck is archived and can't be edited."
                  : "This deck is Ready, so its cards are locked. Move it back to Draft under More to edit it."}
              </p>
            </div>
          )}

          {cards.length === 0 ? (
            <div className="panel px-6 py-10 text-center">
              <p className="font-black text-zinc-200">
                Your collection is empty
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                Open packs in the Shop or trade with friends to get
                cards for your deck.
              </p>
            </div>
          ) : (
            <BrowseGrid
              cards={filtered}
              resetKey={resetKey}
              countByCard={
                snapshot.countByCard
              }
              freeByCard={freeByCard}
              editable={editable}
              onAdd={add}
              onRemove={remove}
              onOpen={openDetail}
              onResetFilters={resetAll}
            />
          )}

          {cards.length > 0 && (
            <p className="mt-4 text-center text-[11px] text-zinc-500">
              {cards.length} different cards · {totalOwnedCopies} copies owned
            </p>
          )}
        </section>

        <aside
          role="tabpanel"
          aria-label="My deck"
          className={`${tab === "deck" ? "" : "hidden"} lg:sticky lg:top-44 lg:block lg:max-h-[calc(100dvh-12rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain`}
        >
          <DeckList
            cards={cards}
            countByCard={
              snapshot.countByCard
            }
            freeByCard={freeByCard}
            mainCount={mainCount}
            extraCount={extraCount}
            editable={editable}
            onAdd={add}
            onRemove={remove}
            onOpen={openDetail}
            onBrowse={() =>
              switchTab("browse")
            }
          />
        </aside>
      </div>

      {tab === "more" && (
        <section
          role="tabpanel"
          aria-label="More deck tools"
          className="mx-auto mt-3 max-w-3xl"
        >
          <DeckMore
            deck={deck}
            cards={cards}
            countByCard={
              snapshot.countByCard
            }
            mainCount={mainCount}
            extraCount={extraCount}
            saving={
              snapshot.pending > 0
            }
            deckSignature={
              deckSignature
            }
          />
        </section>
      )}

      <FilterSheet
        open={filtersOpen}
        onClose={() =>
          setFiltersOpen(false)
        }
        panel={panel}
        onChange={setPanel}
        rarities={rarities}
        archetypes={archetypes}
        resultCount={
          filtered.length
        }
      />

      <CardDetailSheet
        card={detailCard}
        open={
          detailId !== null
        }
        count={
          detailCard
            ? snapshot.countByCard.get(
                detailCard.id
              ) ?? 0
            : 0
        }
        canAdd={
          detailCard
            ? (freeByCard.get(
                detailCard.id
              ) ?? 0) > 0
            : false
        }
        editable={editable}
        text={
          detailCard
            ? textResult?.texts?.[
                detailCard.id
              ] ?? null
            : null
        }
        textState={
          textResult
            ? textResult.error
              ? "error"
              : "ready"
            : "loading"
        }
        deckId={deck.id}
        onAdd={add}
        onRemove={remove}
        onClose={closeDetail}
      />

      <NoticeToast
        notice={
          snapshot.notice
        }
        onDismiss={
          dismissNotice
        }
      />
    </main>
  );
}
