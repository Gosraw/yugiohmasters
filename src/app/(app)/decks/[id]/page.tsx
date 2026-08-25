import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  House,
  LockKeyhole,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Swords,
} from "lucide-react";

import {
  computeOwnedVsUsed,
} from "@/lib/deck-composition";

import {
  analyzeDeck,
  type DeckDoctorCard,
  type DeckDoctorFinding,
  type DeckDoctorMechanics,
  type DeckDoctorReport,
} from "@/lib/deck-doctor";

import {
  TestHandButton,
} from "@/components/test-hand";

import {
  archiveDeck,
  markDeckDraft,
  markDeckReady,
  renameDeck,
  setActiveDeck,
} from "@/app/actions/decks";

import {
  DeckCollectionBrowser,
  type DeckBrowserCard,
} from "@/components/deck-collection-browser";

import {
  DeckCompositionSummary,
} from "@/components/deck-composition-summary";

import {
  DeckLiveCompositionProvider,
  DeckRemoveCardForm,
  DeckSectionThresholdText,
  DeckSectionTotal,
  type LiveDeckCard,
} from "@/components/deck-live-composition";

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

import {
  evaluateMasterDuelDeckLegality,
  getMasterDuelStatusMeta,
} from "@/lib/master-duel";

import {
  MasterDuelBadge,
} from "@/components/master-duel-badge";

import {
  buildMasterDuelChecklist,
  buildYdkExport,
  EXPORT_DISCLAIMER,
} from "@/lib/master-duel-export";

import {
  MasterDuelExportPanel,
} from "@/components/master-duel-export-panel";

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

  master_duel_status:
    | string
    | null;

  external_card_id:
    | number
    | null;

  master_duel_card_id:
    | number
    | null;

  // Added for Deck Builder 2.0's live composition summary (see
  // components/deck-composition-summary.tsx) - purely additive
  // fields, never fetched before this. Nothing about the existing
  // add/remove/legality logic reads these.
  archetype:
    | string
    | null;

  monster_type:
    | string
    | null;

  attribute:
    | string
    | null;

  level:
    | number
    | null;

  rank:
    | number
    | null;

  link_rating:
    | number
    | null;
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
    <div
      className={`group relative overflow-hidden rounded-lg border bg-black/20 transition-all duration-150 hover:-translate-y-1 hover:shadow-lg ${
        card.format_eligible
          ? "border-white/10 hover:border-amber-300/30"
          : "border-red-400/40 hover:border-red-300/60"
      }`}
    >
      {/* CARD IMAGE - nothing overlaid: name and ATK/DEF stay
          fully readable. Copy number/Master Duel status/remove
          all live in the thin strip below the image instead. */}

      <Link
        href={`/cards/${card.id}?returnTo=${encodeURIComponent(
          returnTo
        )}`}
        title={
          card.format_eligible
            ? `${card.name} #${instance.copy_number}`
            : `${card.name} #${instance.copy_number} - no longer format-legal`
        }
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

      {/* THIN INFO STRIP - previously all three of these were
          overlaid on the card art (copy number over the name,
          Master Duel status over the name, Remove over the
          printed ATK/DEF). Kept compact (p-1, 8px text) so the
          already-dense 3-5 column grid doesn't grow noticeably
          taller. */}

      <div className="flex items-center justify-between gap-1 p-1">
        <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[8px] font-black text-zinc-200">
          #{instance.copy_number}
        </span>

        <div className="flex items-center gap-1">
          {(!card.master_duel_status ||
            card.master_duel_status !==
              "unlimited") && (
            <MasterDuelBadge
              status={
                card.master_duel_status
              }
            />
          )}

          {editable && (
            <DeckRemoveCardForm
              deckId={deckId}
              deckCardId={
                row.id
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

// =========================================================
// DECK DOCTOR PANEL (Phase 3)
//
// Renders the deterministic Deck Doctor report computed server-side
// (see the analyzeDeck() call in the page body below) - no AI call
// here, this panel only formats already-computed structured findings
// into plain, non-technical language, per the product spec's "should
// look like a polished Duelist Circle feature, not an admin/debug
// screen" requirement. Collapsed by default, same pattern as the
// composition summary (components/deck-composition-summary.tsx).
// =========================================================

const CONFIDENCE_LABEL: Record<
  DeckDoctorFinding["confidence"],
  string
> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

const SEVERITY_STYLE: Record<
  DeckDoctorFinding["severity"],
  string
> = {
  warning: "border-amber-300/20 bg-amber-300/[0.05]",
  notice: "border-cyan-300/15 bg-cyan-300/[0.04]",
  info: "border-emerald-300/15 bg-emerald-300/[0.04]",
};

function FindingRow({
  finding,
}: {
  finding: DeckDoctorFinding;
}) {
  const evidenceEntries = Object.entries(finding.evidence);

  return (
    <div
      className={`rounded-lg border p-3 ${SEVERITY_STYLE[finding.severity]}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs leading-5 font-bold text-zinc-200">
          {finding.summary}
        </p>

        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] font-black uppercase text-zinc-500">
          {CONFIDENCE_LABEL[finding.confidence]}
        </span>
      </div>

      {evidenceEntries.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-zinc-600 transition hover:text-zinc-400">
            Evidence
          </summary>
          <ul className="mt-1.5 space-y-1 border-l border-white/[0.06] pl-3">
            {evidenceEntries.map(([key, value]) => (
              <li key={key} className="text-[11px] text-zinc-500">
                {key}: {String(value)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function DeckDoctorPanel({
  report,
  mechanicsComputed,
}: {
  report: DeckDoctorReport;
  mechanicsComputed: boolean;
}) {
  if (!mechanicsComputed) {
    return (
      <div className="panel mt-6 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Stethoscope size={16} className="text-cyan-300" />
          <p className="text-sm font-black text-zinc-200">Deck Doctor</p>
        </div>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          This deck hasn&apos;t been analyzed yet - the card mechanics
          engine still needs to run. Check back later for a health
          check.
        </p>
      </div>
    );
  }

  const attention = report.findings.filter(
    (f) => f.severity === "warning" || f.severity === "notice"
  );
  const ownedImprovements = report.findings.filter(
    (f) => f.type === "OWNED_IMPROVEMENT"
  );
  const otherNotes = report.findings.filter(
    (f) =>
      f.severity === "info" && f.type !== "OWNED_IMPROVEMENT"
  );

  const { summary } = report;
  const strengths: string[] = [];
  if (summary.starterCount > 0) {
    strengths.push(`${summary.starterCount} starters`);
  }
  if (summary.extenderCount > 0) {
    strengths.push(`${summary.extenderCount} extenders`);
  }
  if (
    summary.gySetupCount > 0 &&
    summary.gyPayoffCount > 0 &&
    !report.findings.some(
      (f) =>
        f.type === "GY_PAYOFF_WITHOUT_SETUP" ||
        f.type === "GY_SETUP_WITHOUT_PAYOFF"
    )
  ) {
    strengths.push("healthy GY setup/payoff relationship");
  }
  if (summary.removalCount > 0) {
    strengths.push(`${summary.removalCount} removal effects`);
  }

  return (
    <details className="panel group/doctor mt-6 overflow-hidden p-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 select-none sm:p-5">
        <div className="flex items-center gap-2">
          <Stethoscope size={16} className="text-cyan-300" />
          <span className="text-sm font-black text-zinc-100">
            Deck Doctor
            {attention.length > 0 && (
              <span className="ml-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[9px] font-black uppercase text-amber-200">
                {attention.length} item
                {attention.length === 1 ? "" : "s"} need attention
              </span>
            )}
          </span>
        </div>

        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500">
          Full analysis
          <ChevronDown
            size={14}
            className="transition-transform group-open/doctor:rotate-180"
          />
        </span>
      </summary>

      <div className="space-y-4 border-t border-white/5 p-4 sm:p-5">
        {strengths.length > 0 && (
          <div>
            <p className="text-[9px] font-black uppercase tracking-[.16em] text-emerald-300/80">
              Strengths
            </p>
            <p className="mt-1.5 text-xs leading-5 text-zinc-400">
              {strengths.join(" · ")}
            </p>
          </div>
        )}

        {attention.length > 0 && (
          <div>
            <p className="text-[9px] font-black uppercase tracking-[.16em] text-amber-300/80">
              Attention
            </p>
            <div className="mt-2 space-y-2">
              {attention.map((f, i) => (
                <FindingRow key={i} finding={f} />
              ))}
            </div>
          </div>
        )}

        {ownedImprovements.length > 0 && (
          <div>
            <p className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-300/80">
              From Your Collection
            </p>
            <div className="mt-2 space-y-2">
              {ownedImprovements.map((f, i) => (
                <FindingRow key={i} finding={f} />
              ))}
            </div>
          </div>
        )}

        {otherNotes.length > 0 && (
          <div>
            <p className="text-[9px] font-black uppercase tracking-[.16em] text-zinc-500">
              Other
            </p>
            <div className="mt-2 space-y-2">
              {otherNotes.map((f, i) => (
                <FindingRow key={i} finding={f} />
              ))}
            </div>
          </div>
        )}

        {attention.length === 0 &&
          ownedImprovements.length === 0 &&
          otherNotes.length === 0 && (
            <p className="text-xs text-zinc-500">
              No issues found - this deck looks healthy on the checks
              Deck Doctor can run.
            </p>
          )}

        <p className="text-[10px] text-zinc-600">
          Deterministic analysis - no AI. For cards you don&apos;t own
          yet, see Duelist Insight on the card pages themselves
          (Discover / Trade Targets).
        </p>
      </div>
    </details>
  );
}

// =========================================================
// PAGE
// =========================================================

export default async function DeckBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    view?: string;
  }>;
}) {
  const { id } =
    await params;

  const {
    view,
  } =
    await searchParams;

  // Which mobile tab (Browse vs My Deck) was active - persisted in
  // the URL so switching tabs, inspecting a card, and coming back
  // lands on the same tab instead of always resetting to Browse.
  const mobileViewIsDeck =
    view === "deck";

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

  // Every real reason this deck cannot become Ready, not just
  // the main-deck-minimum case - a deck can also be blocked by
  // being over the Main or Extra maximum, and the old message
  // only ever reported the minimum shortfall (showing a
  // nonsensical "Add 0 more" when an over-max was the actual
  // blocker).
  const readyReasons: string[] =
    [];

  if (
    mainCount <
    mainMinimum
  ) {
    const short =
      mainMinimum -
      mainCount;

    readyReasons.push(
      `Add ${short} more Main Deck card${
        short === 1
          ? ""
          : "s"
      } (currently ${mainCount}/${mainMinimum} minimum).`
    );
  }

  if (
    mainCount >
    mainMaximum
  ) {
    const over =
      mainCount -
      mainMaximum;

    readyReasons.push(
      `Remove ${over} Main Deck card${
        over === 1
          ? ""
          : "s"
      } (currently ${mainCount}, maximum ${mainMaximum}).`
    );
  }

  if (
    extraCount >
    extraMaximum
  ) {
    const over =
      extraCount -
      extraMaximum;

    readyReasons.push(
      `Remove ${over} Extra Deck card${
        over === 1
          ? ""
          : "s"
      } (currently ${extraCount}, maximum ${extraMaximum}).`
    );
  }

  const canBeReady =
    readyReasons.length ===
    0;

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
        "id,name,image_url,card_type,atk,def,game_rarity,rarity_score,format_eligible,master_duel_status,external_card_id,master_duel_card_id,archetype,monster_type,attribute,level,rank,link_rating"
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

  const ineligibleInDeckCount =
    [
      ...mainDeckCards,
      ...extraDeckCards,
    ].filter(
      (item) =>
        !item.card.format_eligible
    ).length;

  // =======================================================
  // DECK BUILDER 2.0 - LIVE COMPOSITION SUMMARY
  //
  // Built directly from mainDeckCards/extraDeckCards above - the exact
  // same data already fetched for this render, nothing extra queried.
  // These two lists are the *starting point* handed to
  // DeckLiveCompositionProvider (see deck-live-composition.tsx), which
  // keeps them up to date in the browser: adding or removing a card
  // updates every count on this page immediately, in the same tick as
  // the click, while the server action still runs in the background as
  // the source of truth and re-renders this page with the real numbers
  // when it is done (or rolls the change back if it was refused).
  // computeDeckComposition() itself is pure and synchronous, so no
  // Supabase round trip is involved in any of it.
  // =======================================================

  const toLiveDeckCard = (
    item: DeckDisplayCard
  ): LiveDeckCard => ({
    deckCardId: item.row.id,
    card_catalog_id:
      item.card.id,
    name: item.card.name,
    card_type:
      item.card.card_type,
    monster_type:
      item.card.monster_type,
    attribute:
      item.card.attribute,
    level:
      item.card.level,
    rank:
      item.card.rank,
    link_rating:
      item.card.link_rating,
    archetype:
      item.card.archetype,
  });

  const liveMainCards =
    mainDeckCards.map(
      toLiveDeckCard
    );

  const liveExtraCards =
    extraDeckCards.map(
      toLiveDeckCard
    );

  // Changes on every server render of this page (it is
  // force-dynamic, so that is exactly once per real request). The
  // live composition provider watches this value to know the server
  // has answered and its own pending add/remove can be dropped -
  // which is what makes a refused add roll back on screen instead of
  // lingering as a phantom card.
  //
  // react-hooks/purity is switched off for this single line on
  // purpose. That rule protects against values that change between
  // *client* re-renders of the same component; this is an async
  // Server Component that runs once per request and is never
  // re-rendered in the browser, and a value that differs per server
  // render is exactly what is needed here.
  // eslint-disable-next-line react-hooks/purity
  const serverRenderToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const ownedQuantityByCard =
    new Map(
      collectionCards.map(
        (group) => [
          group.card.id,
          group.quantity,
        ]
      )
    );

  const ownedVsUsed =
    computeOwnedVsUsed(
      [
        ...mainDeckCards,
        ...extraDeckCards,
      ].map((item) => ({
        card_catalog_id:
          item.card.id,
        name: item.card.name,
      })),
      ownedQuantityByCard
    );

  // =======================================================
  // DECK DOCTOR (Phase 3) - two new batched, indexed queries, never
  // per-card:
  //   1. card_mechanics for THIS deck's cards only (bounded by deck
  //      size, ~≤50 unique ids).
  //   2. card_mechanics for the player's OWNED-BUT-NOT-IN-DECK cards
  //      that carry at least one of the specific tags Deck Doctor can
  //      actually suggest as a fix (gy_setup/fusion_enabler/
  //      xyz_enabler) - `.overlaps("tags", ...)` against the existing
  //      GIN index, further filtered to this player's own collection
  //      ids, never the full catalog and never every owned card's
  //      full mechanics payload.
  // =======================================================

  const deckCardIdSet = new Set(
    [...mainDeckCards, ...extraDeckCards].map((item) => item.card.id)
  );
  const deckCardIds = [...deckCardIdSet];

  const DECK_DOCTOR_OWNED_TAGS = [
    "gy_setup",
    "fusion_enabler",
    "xyz_enabler",
  ];
  const ownedNotInDeckIds = collectionCards
    .filter((group) => !deckCardIdSet.has(group.card.id))
    .map((group) => group.card.id);

  const [{ data: deckMechRows }, { data: ownedMechRows }] = await Promise.all([
    deckCardIds.length > 0
      ? supabase
          .from("card_mechanics")
          .select("card_catalog_id,tags")
          .in("card_catalog_id", deckCardIds)
      : Promise.resolve({ data: [] as { card_catalog_id: string; tags: string[] }[] }),
    ownedNotInDeckIds.length > 0
      ? supabase
          .from("card_mechanics")
          .select("card_catalog_id,tags")
          .in("card_catalog_id", ownedNotInDeckIds)
          .overlaps("tags", DECK_DOCTOR_OWNED_TAGS)
      : Promise.resolve({ data: [] as { card_catalog_id: string; tags: string[] }[] }),
  ]);

  const deckMechanicsByCardId = new Map<string, DeckDoctorMechanics>();
  for (const row of (deckMechRows ?? []) as {
    card_catalog_id: string;
    tags: string[];
  }[]) {
    deckMechanicsByCardId.set(row.card_catalog_id, { tags: row.tags });
  }

  // Honest "not yet analyzed" state, same pattern as Duelist Insight's
  // graphComputed - distinct from "the engine looked and this deck is
  // just fine".
  const deckDoctorMechanicsComputed = deckMechanicsByCardId.size > 0;

  const cardNameById = new Map(
    collectionCards.map((group) => [group.card.id, group.card.name])
  );
  const cardTypeById = new Map(
    collectionCards.map((group) => [group.card.id, group.card.card_type])
  );

  const ownedPool = ((ownedMechRows ?? []) as {
    card_catalog_id: string;
    tags: string[];
  }[]).map((row) => ({
    cardCatalogId: row.card_catalog_id,
    name: cardNameById.get(row.card_catalog_id) ?? "Unknown card",
    cardType: cardTypeById.get(row.card_catalog_id) ?? "",
    tags: row.tags,
  }));

  const deckDoctorMainCards: DeckDoctorCard[] = mainDeckCards.map((item) => ({
    cardCatalogId: item.card.id,
    name: item.card.name,
    cardType: item.card.card_type,
  }));
  const deckDoctorExtraCards: DeckDoctorCard[] = extraDeckCards.map((item) => ({
    cardCatalogId: item.card.id,
    name: item.card.name,
    cardType: item.card.card_type,
  }));

  const deckDoctorReport = analyzeDeck(
    deckDoctorMainCards,
    deckDoctorExtraCards,
    deckMechanicsByCardId,
    ownedPool
  );

  // =======================================================
  // MASTER DUEL LEGALITY (Fase L)
  //
  // A separate, purely informational summary - unlike
  // `canBeReady` above (which gates this LEAGUE's own Ready
  // status), Master Duel legality never blocks anything here.
  // It just tells the player whether this exact deck could
  // also be played as-is in Master Duel.
  // =======================================================

  const masterDuelSummary =
    evaluateMasterDuelDeckLegality(
      [
        ...mainDeckCards,
        ...extraDeckCards,
      ].map((item) => ({
        id: item.card.id,
        name: item.card.name,
        master_duel_status:
          item.card
            .master_duel_status,
      }))
    );

  // =======================================================
  // MASTER DUEL EXPORT (researched workflow - see
  // src/lib/master-duel-export.ts for why this is a checklist +
  // .ydk file rather than a direct "import" button: Konami
  // doesn't offer one).
  // =======================================================

  const exportCards =
    [
      ...mainDeckCards,
      ...extraDeckCards,
    ].map((item) => ({
      cardCatalogId:
        item.card.id,
      name: item.card
        .name,
      externalCardId:
        item.card
          .external_card_id,
      masterDuelCardId:
        item.card
          .master_duel_card_id,
      masterDuelStatus:
        item.card
          .master_duel_status,
      section: (item
        .row
        .section ===
      "extra"
        ? "extra"
        : "main") as
        | "main"
        | "extra",
    }));

  const ydkExport =
    buildYdkExport(
      exportCards
    );

  const masterDuelChecklist =
    buildMasterDuelChecklist(
      exportCards,
      (status) =>
        getMasterDuelStatusMeta(
          status
        ).shortLabel
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
    // Renders this page's <main> element and, around it, the shared
    // live-composition context: the header counters, the composition
    // summary, the sticky mobile bar, the deck panels' counters, the
    // collection browser's Add buttons and the deck tiles' Remove
    // buttons all read from (and write to) the same client-side card
    // list, so a click moves every number instantly. Everything below
    // stays a Server Component - passing it through as children keeps
    // it out of the client bundle.
    <DeckLiveCompositionProvider
      mainCards={
        liveMainCards
      }
      extraCards={
        liveExtraCards
      }
      serverToken={
        serverRenderToken
      }
      className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8"
    >
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
              <DeckSectionTotal
                section="main"
              />
              <span className="text-sm text-zinc-600">
                {" "}
                / 60
              </span>
            </p>

            <DeckSectionThresholdText
              section="main"
              minimum={40}
              element="p"
              baseClassName="mt-1 text-[10px] font-bold"
              metClassName="text-emerald-300"
              unmetClassName="text-zinc-600"
            >
              Minimum 40
            </DeckSectionThresholdText>
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
              <DeckSectionTotal
                section="extra"
              />
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

      {/* LIVE COMPOSITION SUMMARY + TEST HAND (Deck Builder 2.0) */}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <DeckCompositionSummary
            ownedVsUsed={
              ownedVsUsed
            }
          />
        </div>

        <TestHandButton
          mainDeckCards={mainDeckCards.map(
            (item) => ({
              id: item.row.id,
              name: item.card.name,
              image_url:
                item.card.image_url,
            })
          )}
        />
      </div>

      {/* DECK DOCTOR (Phase 3) */}

      <DeckDoctorPanel
        report={deckDoctorReport}
        mechanicsComputed={deckDoctorMechanicsComputed}
      />

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
                <ul className="mt-2 space-y-1 text-sm text-zinc-500">
                  {readyReasons.map(
                    (reason) => (
                      <li
                        key={
                          reason
                        }
                        className="flex items-start gap-2"
                      >
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
                        <span>
                          {
                            reason
                          }
                        </span>
                      </li>
                    )
                  )}
                </ul>
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
                      : "Not Ready Yet"
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

      {ineligibleInDeckCount > 0 && (
        <section className="mt-4 rounded-2xl border border-red-300/15 bg-red-300/[0.03] p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert
              size={17}
              className="mt-0.5 shrink-0 text-red-300"
            />

            <div>
              <p className="text-sm font-black text-red-100">
                {ineligibleInDeckCount} card
                {ineligibleInDeckCount === 1 ? "" : "s"} in this deck{" "}
                {ineligibleInDeckCount === 1 ? "is" : "are"} no longer
                format-legal
              </p>

              <p className="mt-1 text-xs leading-5 text-zinc-600">
                A card&apos;s legality can change after it was added.
                Marked with a red border below - consider swapping{" "}
                {ineligibleInDeckCount === 1 ? "it" : "them"} out before
                your next league duel.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* MASTER DUEL LEGALITY - purely informational, never
          blocks this league's own Ready status above. */}

      {mainDeckCards.length +
        extraDeckCards.length >
        0 && (
        <section
          className={`mt-4 rounded-2xl border p-4 ${
            masterDuelSummary.ready
              ? "border-emerald-300/15 bg-emerald-300/[0.03]"
              : "border-amber-300/15 bg-amber-300/[0.03]"
          }`}
        >
          <div className="flex items-start gap-3">
            {masterDuelSummary.ready ? (
              <ShieldCheck
                size={17}
                className="mt-0.5 shrink-0 text-emerald-300"
              />
            ) : (
              <ShieldAlert
                size={17}
                className="mt-0.5 shrink-0 text-amber-300"
              />
            )}

            <div className="flex-1">
              <p
                className={`text-sm font-black uppercase tracking-wide ${
                  masterDuelSummary.ready
                    ? "text-emerald-100"
                    : "text-amber-100"
                }`}
              >
                {masterDuelSummary.ready
                  ? "Master Duel Ready"
                  : `${masterDuelSummary.issues.length} Master Duel issue${
                      masterDuelSummary
                        .issues
                        .length === 1
                        ? ""
                        : "s"
                    }`}
              </p>

              {masterDuelSummary.ready ? (
                <p className="mt-1 text-xs leading-5 text-zinc-600">
                  Every card in this deck is Master Duel legal at
                  its current copy count.
                </p>
              ) : (
                <ul className="mt-2 space-y-1 text-xs leading-5 text-zinc-500">
                  {masterDuelSummary.issues.map(
                    (issue) => (
                      <li
                        key={
                          issue.cardId
                        }
                        className="flex items-start gap-2"
                      >
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
                        <span>
                          {
                            issue.message
                          }
                        </span>
                      </li>
                    )
                  )}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* MASTER DUEL EXPORT */}

      {mainDeckCards.length +
        extraDeckCards.length >
        0 && (
        <section className="panel mt-4 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Swords
              size={18}
              className="text-amber-300"
            />

            <h2 className="font-black">
              Export for Master
              Duel
            </h2>
          </div>

          <MasterDuelExportPanel
            deckName={
              deck.name
            }
            disclaimer={
              EXPORT_DISCLAIMER
            }
            ydkText={
              ydkExport.ydkText
            }
            checklistText={
              masterDuelChecklist.checklistText
            }
            missingPasscodeCount={
              ydkExport
                .missingPasscodeCards
                .length
            }
          />
        </section>
      )}

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
        {/* Mobile/tablet view toggle (below xl only). A real "view"
            query param (not just CSS-only local state) drives which
            panel shows, so the active tab survives navigating away
            (inspecting a card, going Home) and back - see
            mobileViewIsDeck above. At xl: and above both panels
            always render side by side and this toggle is hidden. */}

        <div className="col-span-full flex gap-1.5 rounded-xl border border-white/10 bg-black/40 p-1.5 xl:hidden">
          <Link
            href={`/decks/${deck.id}?view=browse`}
            replace
            scroll={false}
            className={`flex-1 rounded-lg px-3 py-2.5 text-center text-xs font-black uppercase tracking-wider transition-colors ${
              mobileViewIsDeck
                ? "text-zinc-500"
                : "bg-amber-300/15 text-amber-200"
            }`}
          >
            Browse ({
              collectionCards.length
            })
          </Link>

          <Link
            href={`/decks/${deck.id}?view=deck`}
            replace
            scroll={false}
            className={`flex-1 rounded-lg px-3 py-2.5 text-center text-xs font-black uppercase tracking-wider transition-colors ${
              mobileViewIsDeck
                ? "bg-amber-300/15 text-amber-200"
                : "text-zinc-500"
            }`}
          >
            My Deck (
            <DeckSectionTotal
              section="all"
            />
            )
          </Link>
        </div>

        {/* Sticky mobile deck-status summary - stays pinned while
            scrolling a long Browse list so a player can always see
            Main/Extra/Ready progress without switching to the My
            Deck tab. Desktop already sees the full status panel
            above at all times, so this is mobile-only. */}

        {!mobileViewIsDeck && (
          <div className="sticky top-0 z-30 -mx-4 flex items-center justify-between gap-3 border-b border-white/10 bg-black/85 px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6 xl:hidden">
            <div className="flex items-center gap-3 text-xs font-black">
              <DeckSectionThresholdText
                section="main"
                minimum={
                  mainMinimum
                }
                metClassName="text-emerald-300"
                unmetClassName="text-zinc-400"
              >
                Main{" "}
                <DeckSectionTotal
                  section="main"
                />
                /60
              </DeckSectionThresholdText>

              <span className="text-zinc-400">
                Extra{" "}
                <DeckSectionTotal
                  section="extra"
                />
                /15
              </span>
            </div>

            {deck.status ===
            "draft" ? (
              canBeReady ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200">
                  <CheckCircle2
                    size={11}
                  />
                  Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200">
                  Not Ready
                </span>
              )
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-200">
                {deck.status ===
                "ready"
                  ? "Ready"
                  : "Archived"}
              </span>
            )}
          </div>
        )}

        <section
          className={`${
            mobileViewIsDeck
              ? "hidden"
              : ""
          } xl:block`}
        >
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

        <aside
          className={`${
            mobileViewIsDeck
              ? ""
              : "hidden"
          } space-y-4 xl:block xl:sticky xl:top-6 xl:self-start`}
        >
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

              <DeckSectionThresholdText
                section="main"
                minimum={40}
                baseClassName="text-sm font-black"
                metClassName="text-emerald-300"
                unmetClassName="text-zinc-500"
              >
                <DeckSectionTotal
                  section="main"
                />{" "}
                / 60
              </DeckSectionThresholdText>
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
                <DeckSectionTotal
                  section="extra"
                />{" "}
                / 15
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
    </DeckLiveCompositionProvider>
  );
}