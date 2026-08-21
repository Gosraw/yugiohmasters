import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ArrowLeft,
  CheckCircle2,
  House,
  LockKeyhole,
  Settings,
  ShieldCheck,
  Sparkles,
  Swords,
} from "lucide-react";

import {
  archiveDeck,
  markDeckDraft,
  markDeckReady,
  removeCardFromDeck,
  renameDeck,
  setActiveDeck,
} from "@/app/actions/decks";

import {
  DeckActionButton,
} from "@/components/deck-action-button";

import {
  DeckCollectionBrowser,
  type DeckBrowserCard,
} from "@/components/deck-collection-browser";

import {
  ArchiveDeckButton,
  RenameDeckButton,
} from "@/components/deck-management-buttons";

import {
  DeckStatusButton,
} from "@/components/deck-status-button";

import {
  requireUser,
} from "@/lib/supabase/queries";

export const dynamic =
  "force-dynamic";

// =========================================================
// TYPES
// =========================================================

type Deck = {
  id: string;
  league_id: string;
  owner_id: string;
  name: string;
  description:
    | string
    | null;

  status:
    | "draft"
    | "ready"
    | "archived";

  is_active: boolean;
};

type CardCatalogItem = {
  id: string;
  name: string;

  image_url:
    | string
    | null;

  card_type: string;

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

  format_eligible:
    boolean;
};

type CardInstance = {
  id: string;

  card_catalog_id:
    string;

  copy_number:
    number;

  locked:
    boolean;
};

type DeckCardRow = {
  id: string;

  card_instance_id:
    string;

  section:
    | "main"
    | "extra";
};

type CollectionCard = {
  card:
    CardCatalogItem;

  instances:
    CardInstance[];

  availableInstances:
    CardInstance[];

  quantity:
    number;

  inDeck:
    number;
};

type DeckDisplayCard = {
  row:
    DeckCardRow;

  instance:
    CardInstance;

  card:
    CardCatalogItem;
};

// =========================================================
// DECK CARD TILE
// =========================================================

function DeckCardTile({
  item,
  deckId,
  editable,
}: {
  item:
    DeckDisplayCard;

  deckId:
    string;

  editable:
    boolean;
}) {
  const {
    row,
    card,
    instance,
  } = item;

  const returnTo =
    `/decks/${deckId}`;

  return (
    <div className="group relative overflow-hidden rounded-lg border border-white/10 bg-black/20 transition-all duration-150 hover:-translate-y-1 hover:border-amber-300/30 hover:shadow-lg">
      <Link
        href={`/cards/${card.id}?returnTo=${encodeURIComponent(
          returnTo
        )}`}
        title={`${card.name} #${instance.copy_number}`}
        className="block cursor-pointer"
      >
        {card.image_url ? (
          <Image
            src={card.image_url}
            alt={card.name}
            width={421}
            height={614}
            className="aspect-[421/614] h-auto w-full object-cover transition duration-200 group-hover:scale-[1.03]"
            unoptimized
          />
        ) : (
          <div className="aspect-[421/614] bg-zinc-900" />
        )}
      </Link>

      <div className="pointer-events-none absolute left-1 top-1 rounded-md border border-white/10 bg-black/85 px-1.5 py-0.5 text-[8px] font-black text-zinc-200">
        #{instance.copy_number}
      </div>

      {editable && (
        <form
          action={
            removeCardFromDeck
          }
          className="absolute bottom-1 right-1 z-10"
        >
          <input
            type="hidden"
            name="deck_id"
            value={deckId}
          />

          <input
            type="hidden"
            name="deck_card_id"
            value={row.id}
          />

          <DeckActionButton
            type="remove"
          />
        </form>
      )}
    </div>
  );
}

// =========================================================
// PAGE
// =========================================================

export default async function DeckBuilderPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } =
    await params;

  const {
    supabase,
    userId,
  } = await requireUser();

  // =======================================================
  // DECK
  // =======================================================

  const {
    data: deckData,
    error: deckError,
  } = await supabase
    .from("decks")
    .select(
      "id,league_id,owner_id,name,description,status,is_active"
    )
    .eq(
      "id",
      id
    )
    .eq(
      "owner_id",
      userId
    )
    .maybeSingle();

  if (
    deckError ||
    !deckData
  ) {
    notFound();
  }

  const deck =
    deckData as Deck;

  const editable =
    deck.status ===
    "draft";

  // =======================================================
  // DECK CARDS
  // =======================================================

  const {
    data: deckCardData,
    error: deckCardError,
  } = await supabase
    .from("deck_cards")
    .select(
      "id,card_instance_id,section"
    )
    .eq(
      "deck_id",
      deck.id
    );

  if (
    deckCardError
  ) {
    throw new Error(
      `Deckkaarten konden niet worden geladen: ${deckCardError.message}`
    );
  }

  const deckCards =
    (deckCardData ??
      []) as DeckCardRow[];

  const deckInstanceIds =
    new Set(
      deckCards.map(
        (row) =>
          row.card_instance_id
      )
    );

  const mainCount =
    deckCards.filter(
      (row) =>
        row.section ===
        "main"
    ).length;

  const extraCount =
    deckCards.filter(
      (row) =>
        row.section ===
        "extra"
    ).length;

  const mainMinimum = 40;
  const mainMaximum = 60;
  const extraMaximum = 15;

  const cardsNeeded =
    Math.max(
      0,
      mainMinimum -
        mainCount
    );

  const canBeReady =
    mainCount >=
      mainMinimum &&
    mainCount <=
      mainMaximum &&
    extraCount <=
      extraMaximum;

  // =======================================================
  // COLLECTION
  // =======================================================

  const {
    data: instanceData,
    error: instanceError,
  } = await supabase
    .from("card_instances")
    .select(
      "id,card_catalog_id,copy_number,locked"
    )
    .eq(
      "current_owner_id",
      userId
    )
    .eq(
      "league_id",
      deck.league_id
    )
    .order(
      "copy_number",
      {
        ascending: true,
      }
    );

  if (
    instanceError
  ) {
    throw new Error(
      `Collection kon niet worden geladen: ${instanceError.message}`
    );
  }

  const instances =
    (instanceData ??
      []) as CardInstance[];

  // =======================================================
  // CATALOG
  // =======================================================

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
        "id,name,image_url,card_type,atk,def,game_rarity,rarity_score,format_eligible"
      )
      .in(
        "id",
        catalogIds
      );

    if (
      catalogError
    ) {
      throw new Error(
        `Kaartinformatie kon niet worden geladen: ${catalogError.message}`
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

  // =======================================================
  // GROUP COLLECTION
  // =======================================================

  const groupedMap =
    new Map<
      string,
      CollectionCard
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

    const isInDeck =
      deckInstanceIds.has(
        instance.id
      );

    const isAvailable =
      !instance.locked &&
      !isInDeck;

    const existing =
      groupedMap.get(
        card.id
      );

    if (existing) {
      existing.instances.push(
        instance
      );

      existing.quantity += 1;

      if (
        isInDeck
      ) {
        existing.inDeck += 1;
      }

      if (
        isAvailable
      ) {
        existing.availableInstances.push(
          instance
        );
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

        availableInstances:
          isAvailable
            ? [instance]
            : [],

        quantity: 1,

        inDeck:
          isInDeck
            ? 1
            : 0,
      }
    );
  }

  const collectionCards =
    [
      ...groupedMap.values(),
    ].sort(
      (a, b) =>
        a.card.name.localeCompare(
          b.card.name
        )
    );

  // =======================================================
  // DECK DISPLAY
  // =======================================================

  const instanceMap =
    new Map(
      instances.map(
        (instance) => [
          instance.id,
          instance,
        ]
      )
    );

  const mainDeckCards:
    DeckDisplayCard[] =
    [];

  const extraDeckCards:
    DeckDisplayCard[] =
    [];

  for (
    const row of
    deckCards
  ) {
    const instance =
      instanceMap.get(
        row.card_instance_id
      );

    if (
      !instance
    ) {
      continue;
    }

    const card =
      cardMap.get(
        instance.card_catalog_id
      );

    if (!card) {
      continue;
    }

    const item:
      DeckDisplayCard =
      {
        row,
        instance,
        card,
      };

    if (
      row.section ===
      "extra"
    ) {
      extraDeckCards.push(
        item
      );
    } else {
      mainDeckCards.push(
        item
      );
    }
  }

  mainDeckCards.sort(
    (a, b) =>
      a.card.name.localeCompare(
        b.card.name
      )
  );

  extraDeckCards.sort(
    (a, b) =>
      a.card.name.localeCompare(
        b.card.name
      )
  );

  // =======================================================
  // CLIENT BROWSER DATA
  // =======================================================

  const browserCards:
    DeckBrowserCard[] =
    collectionCards.map(
      (group) => ({
        card:
          group.card,

        quantity:
          group.quantity,

        inDeck:
          group.inDeck,

        availableInstances:
          group.availableInstances.map(
            (instance) => ({
              id:
                instance.id,

              copy_number:
                instance.copy_number,
            })
          ),
      })
    );

  // =======================================================
  // UI
  // =======================================================

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      {/* NAV */}

      <nav className="flex flex-wrap items-center gap-3">
        <Link
          href="/decks"
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300 transition-all hover:-translate-x-0.5 hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-200 active:scale-95"
        >
          <ArrowLeft size={17} />
          Back to Decks
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

      <header className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {deck.status ===
            "draft" ? (
              <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200">
                Draft
              </span>
            ) : deck.status ===
              "ready" ? (
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200">
                Ready
              </span>
            ) : (
              <span className="rounded-full border border-zinc-500/25 bg-zinc-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                Archived
              </span>
            )}

            {deck.is_active && (
              <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-200">
                Active Deck
              </span>
            )}
          </div>

          <p className="mt-4 text-xs font-black tracking-[.28em] text-amber-300">
            DECK BUILDER
          </p>

          <h1 className="gold-text mt-2 text-4xl font-black">
            {deck.name}
          </h1>

          <p className="mt-2 text-sm text-zinc-500">
            {editable
              ? "Build your deck with cards from your Collection."
              : deck.is_active
                ? "This is your current Active Deck."
                : "This deck is Ready. Return it to Draft mode to edit its cards."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="panel min-w-32 p-4">
            <div className="flex items-center gap-2 text-zinc-500">
              <Swords size={15} />

              <span className="text-[10px] font-black uppercase tracking-wider">
                Main Deck
              </span>
            </div>

            <p className="mt-1 text-2xl font-black">
              {mainCount}
              <span className="text-sm text-zinc-600">
                {" "}
                / 60
              </span>
            </p>

            <p
              className={`mt-1 text-[10px] font-bold ${
                mainCount >=
                40
                  ? "text-emerald-300"
                  : "text-zinc-600"
              }`}
            >
              Minimum 40
            </p>
          </div>

          <div className="panel min-w-32 p-4">
            <div className="flex items-center gap-2 text-zinc-500">
              <ShieldCheck
                size={15}
              />

              <span className="text-[10px] font-black uppercase tracking-wider">
                Extra Deck
              </span>
            </div>

            <p className="mt-1 text-2xl font-black">
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
      </header>

      {/* STATUS PANEL */}

      <section className="panel mt-6 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              {deck.status ===
              "draft" ? (
                <Sparkles
                  size={18}
                  className="text-amber-300"
                />
              ) : deck.is_active ? (
                <CheckCircle2
                  size={18}
                  className="text-cyan-300"
                />
              ) : (
                <CheckCircle2
                  size={18}
                  className="text-emerald-300"
                />
              )}

              <h2 className="font-black">
                Deck Status
              </h2>
            </div>

            {deck.status ===
            "draft" ? (
              canBeReady ? (
                <p className="mt-2 text-sm text-emerald-300">
                  This deck can be marked Ready.
                </p>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">
                  Add{" "}
                  <strong className="text-zinc-300">
                    {cardsNeeded}
                  </strong>{" "}
                  more Main Deck card
                  {cardsNeeded ===
                  1
                    ? ""
                    : "s"}{" "}
                  before this deck can become Ready.
                </p>
              )
            ) : deck.is_active ? (
              <p className="mt-2 text-sm text-cyan-200">
                This deck is Ready and currently selected as your Active Deck.
              </p>
            ) : (
              <p className="mt-2 text-sm text-emerald-300">
                This deck is valid and Ready to use.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            {deck.status ===
              "draft" && (
              <form
                action={
                  markDeckReady
                }
              >
                <input
                  type="hidden"
                  name="deck_id"
                  value={
                    deck.id
                  }
                />

                <DeckStatusButton
                  action="ready"
                  disabled={
                    !canBeReady
                  }
                  label={
                    canBeReady
                      ? "Mark as Ready"
                      : `Need ${cardsNeeded} More`
                  }
                />
              </form>
            )}

            {deck.status ===
              "ready" &&
              !deck.is_active && (
                <>
                  <form
                    action={
                      setActiveDeck
                    }
                  >
                    <input
                      type="hidden"
                      name="deck_id"
                      value={
                        deck.id
                      }
                    />

                    <DeckStatusButton
                      action="active"
                    />
                  </form>

                  <form
                    action={
                      markDeckDraft
                    }
                  >
                    <input
                      type="hidden"
                      name="deck_id"
                      value={
                        deck.id
                      }
                    />

                    <DeckStatusButton
                      action="edit"
                    />
                  </form>
                </>
              )}

            {deck.status ===
              "ready" &&
              deck.is_active && (
                <div className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2.5 text-sm font-black text-cyan-200">
                  <LockKeyhole
                    size={16}
                  />

                  Active Deck
                </div>
              )}
          </div>
        </div>
      </section>

      {/* SETTINGS */}

      <section className="panel mt-4 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Settings
            size={18}
            className="text-amber-300"
          />

          <h2 className="font-black">
            Deck Settings
          </h2>
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_320px]">
          {/* RENAME */}

          <div>
            <p className="text-sm font-black text-zinc-200">
              Deck Name
            </p>

            <p className="mt-1 text-xs text-zinc-500">
              Change the name of this deck.
            </p>

            <form
              action={
                renameDeck
              }
              className="mt-3 flex flex-col gap-3 sm:flex-row"
            >
              <input
                type="hidden"
                name="deck_id"
                value={
                  deck.id
                }
              />

              <input
                type="text"
                name="name"
                required
                maxLength={80}
                defaultValue={
                  deck.name
                }
                disabled={
                  deck.status ===
                  "archived"
                }
                className="field flex-1 disabled:cursor-not-allowed disabled:opacity-50"
              />

              <RenameDeckButton />
            </form>
          </div>

          {/* ARCHIVE */}

          <div className="rounded-xl border border-red-400/15 bg-red-400/[0.035] p-4">
            <p className="text-sm font-black text-red-200">
              Archive Deck
            </p>

            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Archiving hides this deck from normal use but keeps it for future match history.
            </p>

            {deck.is_active && (
              <p className="mt-2 text-xs font-bold text-red-300">
                Active decks cannot be archived.
              </p>
            )}

            <form
              action={
                archiveDeck
              }
              className="mt-4"
            >
              <input
                type="hidden"
                name="deck_id"
                value={
                  deck.id
                }
              />

              <ArchiveDeckButton
                disabled={
                  deck.is_active ||
                  deck.status ===
                    "archived"
                }
              />
            </form>
          </div>
        </div>
      </section>

      {/* BUILDER */}

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black tracking-[.2em] text-zinc-500">
                YOUR COLLECTION
              </p>

              <h2 className="mt-1 text-2xl font-black">
                {editable
                  ? "Add Cards"
                  : "Collection"}
              </h2>
            </div>

            <p className="text-sm text-zinc-500">
              {collectionCards.length} unique cards
            </p>
          </div>

          {editable ? (
            <DeckCollectionBrowser
              deckId={
                deck.id
              }
              cards={
                browserCards
              }
            />
          ) : (
            <div className="panel mt-4 p-6">
              <div className="flex items-start gap-3">
                <LockKeyhole
                  size={20}
                  className="mt-0.5 shrink-0 text-zinc-500"
                />

                <div>
                  <p className="font-black text-zinc-300">
                    Deck editing is locked
                  </p>

                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    A Ready deck cannot be edited directly.
                    {deck.is_active
                      ? " This is currently your Active Deck."
                      : " Use Edit Deck Again above to return it to Draft mode."}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <section className="panel p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Swords
                  size={17}
                  className="text-amber-300"
                />

                <h2 className="font-black">
                  Main Deck
                </h2>
              </div>

              <span
                className={`text-sm font-black ${
                  mainCount >=
                  40
                    ? "text-emerald-300"
                    : "text-zinc-500"
                }`}
              >
                {mainCount} / 60
              </span>
            </div>

            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              Minimum 40 cards
            </p>

            {mainDeckCards.length ===
            0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-600">
                Add Main Deck cards from your Collection.
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5">
                {mainDeckCards.map(
                  (item) => (
                    <DeckCardTile
                      key={
                        item.row.id
                      }
                      item={
                        item
                      }
                      deckId={
                        deck.id
                      }
                      editable={
                        editable
                      }
                    />
                  )
                )}
              </div>
            )}
          </section>

          <section className="panel p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck
                  size={17}
                  className="text-violet-300"
                />

                <h2 className="font-black">
                  Extra Deck
                </h2>
              </div>

              <span className="text-sm font-black text-zinc-500">
                {extraCount} / 15
              </span>
            </div>

            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              Fusion + XYZ only
            </p>

            {extraDeckCards.length ===
            0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-600">
                Fusion and XYZ cards appear here.
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5">
                {extraDeckCards.map(
                  (item) => (
                    <DeckCardTile
                      key={
                        item.row.id
                      }
                      item={
                        item
                      }
                      deckId={
                        deck.id
                      }
                      editable={
                        editable
                      }
                    />
                  )
                )}
              </div>
            )}
          </section>

          <section className="panel p-4">
            <div className="flex items-center gap-2">
              <Sparkles
                size={16}
                className="text-amber-300"
              />

              <p className="text-sm font-black">
                Deck Rules
              </p>
            </div>

            <div className="mt-3 space-y-2 text-xs leading-5 text-zinc-500">
              <p>
                Main Deck: minimum 40 and maximum 60 cards.
              </p>

              <p>
                Extra Deck: maximum 15 cards.
              </p>

              <p>
                Only Fusion and XYZ Monsters are allowed in the Extra Deck.
              </p>

              <p>
                You can only use physical copies that you own.
              </p>

              <p>
                Ready decks are locked from editing until returned to Draft mode.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}