import Link from "next/link";
import {
  Layers3,
  Sparkles,
  Trophy,
} from "lucide-react";

import {
  createNextDraftOffer,
  startInitialDraft,
} from "@/app/actions/draft";

import {
  DraftChoiceGrid,
  type DraftChoiceCard,
} from "@/components/draft-choice-grid";

import { requireUser } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

const rarityStyles: Record<string, string> = {
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
    "border-yellow-300/50 bg-yellow-300/15 text-yellow-200",
};

type DraftPlayer = {
  id: string;
  status: string;
  main_picks_completed: number;
  fusion_picks_completed: number;
  xyz_picks_completed: number;
};

type DraftOffer = {
  id: string;
  phase: string;
  phase_pick_number: number;
  rolled_rarity: string | null;
};

type DraftOption = {
  id: string;
  card_catalog_id: string;
  display_order: number;
};

type Card = {
  id: string;
  name: string;
  image_url: string | null;
  card_type: string;
  monster_type: string | null;
  attribute: string | null;
  level: number | null;
  rank: number | null;
  atk: number | null;
  def: number | null;
  description: string | null;
  game_rarity: string | null;
  rarity_score: number | null;
};

function phaseTitle(
  phase: string
) {
  if (phase === "fusion") {
    return "FUSION PHASE";
  }

  if (phase === "xyz") {
    return "XYZ PHASE";
  }

  return "MAIN PHASE";
}

export default async function DraftPage() {
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
    .select("league_id,role")
    .eq(
      "profile_id",
      userId
    )
    .limit(1)
    .maybeSingle();

  if (
    membershipError ||
    !membership
  ) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="panel p-6">
          Geen league gevonden.
        </div>
      </main>
    );
  }

  // ======================================================
  // ACTIVE DRAFT
  // ======================================================

  const {
    data: activeDraft,
    error: draftError,
  } = await supabase
    .from("drafts")
    .select(
      "id,name,status,main_picks_per_player,fusion_picks_per_player,xyz_picks_per_player"
    )
    .eq(
      "league_id",
      membership.league_id
    )
    .eq(
      "status",
      "active"
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    )
    .limit(1)
    .maybeSingle();

  if (draftError) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="panel p-6">
          Draft kon niet worden geladen.
        </div>
      </main>
    );
  }

  // ======================================================
  // GEEN ACTIEVE DRAFT?
  //
  // Eerst controleren of de Initial Draft al is voltooid.
  // ======================================================

  if (!activeDraft) {
    const {
      data: completedDraft,
      error: completedDraftError,
    } = await supabase
      .from("drafts")
      .select(
        "id,name,status,completed_at"
      )
      .eq(
        "league_id",
        membership.league_id
      )
      .eq(
        "name",
        "Initial Draft"
      )
      .eq(
        "status",
        "completed"
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();

    if (completedDraftError) {
      return (
        <main className="mx-auto max-w-5xl px-4 py-8">
          <div className="panel p-6">
            Draftstatus kon niet worden gecontroleerd.
          </div>
        </main>
      );
    }

    // ====================================================
    // INITIAL DRAFT AL VOLTOOID
    // ====================================================

    if (completedDraft) {
      return (
        <main className="mx-auto max-w-4xl px-4 py-8">
          <section className="panel p-8 text-center">
            <Trophy
              size={52}
              className="mx-auto text-amber-300"
            />

            <p className="mt-5 text-xs font-black tracking-[.28em] text-amber-300">
              INITIAL DRAFT COMPLETE
            </p>

            <h1 className="gold-text mt-2 text-4xl font-black">
              The First 64
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-zinc-400">
              Je Initial Draft is voltooid.
              De kaarten die je hebt gekozen
              zijn permanent toegevoegd aan
              je Collection.
            </p>

            <div className="mx-auto mt-6 grid max-w-lg grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/10 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Main
                </p>

                <p className="mt-1 text-2xl font-black">
                  60
                </p>
              </div>

              <div className="rounded-xl border border-white/10 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Fusion
                </p>

                <p className="mt-1 text-2xl font-black">
                  2
                </p>
              </div>

              <div className="rounded-xl border border-white/10 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  XYZ
                </p>

                <p className="mt-1 text-2xl font-black">
                  2
                </p>
              </div>
            </div>

            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                href="/cards/collection"
                className="primary-button inline-flex items-center justify-center"
              >
                View Collection
              </Link>

              <Link
                href="/cards"
                className="inline-flex items-center justify-center rounded-xl border border-white/10 px-5 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/5 hover:text-white"
              >
                Browse Cards
              </Link>
            </div>
          </section>
        </main>
      );
    }

    // ====================================================
    // INITIAL DRAFT NOG NOOIT GEDAAN
    // ====================================================

    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-xs font-black tracking-[.28em] text-amber-300">
          INITIAL DRAFT
        </p>

        <h1 className="gold-text mt-2 text-4xl font-black">
          The First 64
        </h1>

        <section className="panel mt-6 p-6">
          <Layers3
            size={40}
            className="text-amber-300"
          />

          <h2 className="mt-5 text-2xl font-black">
            No active draft
          </h2>

          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            Iedere speler draft
            60 Main Pool-kaarten,
            2 Fusion Monsters en
            2 XYZ Monsters.
            Iedere ronde wordt eerst
            één rarity gerold, waarna
            je één van drie kaarten
            van die rarity kiest.
          </p>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/10 p-4 text-center">
              <p className="text-xs font-bold text-zinc-500">
                MAIN
              </p>

              <p className="mt-1 text-2xl font-black">
                60
              </p>
            </div>

            <div className="rounded-xl border border-white/10 p-4 text-center">
              <p className="text-xs font-bold text-zinc-500">
                FUSION
              </p>

              <p className="mt-1 text-2xl font-black">
                2
              </p>
            </div>

            <div className="rounded-xl border border-white/10 p-4 text-center">
              <p className="text-xs font-bold text-zinc-500">
                XYZ
              </p>

              <p className="mt-1 text-2xl font-black">
                2
              </p>
            </div>
          </div>

          {membership.role ===
          "admin" ? (
            <form
              action={
                startInitialDraft
              }
            >
              <button
                type="submit"
                className="primary-button mt-6"
              >
                Start Initial Draft
              </button>
            </form>
          ) : (
            <p className="mt-6 text-sm text-zinc-500">
              Wacht tot de admin
              de draft start.
            </p>
          )}
        </section>
      </main>
    );
  }

  // ======================================================
  // CURRENT PLAYER
  // ======================================================

  const {
    data: playerData,
    error: playerError,
  } = await supabase
    .from("draft_players")
    .select(
      "id,status,main_picks_completed,fusion_picks_completed,xyz_picks_completed"
    )
    .eq(
      "draft_id",
      activeDraft.id
    )
    .eq(
      "profile_id",
      userId
    )
    .maybeSingle();

  if (
    playerError ||
    !playerData
  ) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="panel p-6">
          Je bent geen deelnemer
          aan deze draft.
        </div>
      </main>
    );
  }

  const player =
    playerData as DraftPlayer;

  const totalCompleted =
    player.main_picks_completed +
    player.fusion_picks_completed +
    player.xyz_picks_completed;

  const totalRequired =
    activeDraft.main_picks_per_player +
    activeDraft.fusion_picks_per_player +
    activeDraft.xyz_picks_per_player;

  // ======================================================
  // DEZE SPELER IS KLAAR
  //
  // De gehele league-draft kan nog actief zijn
  // omdat andere spelers nog bezig zijn.
  // ======================================================

  if (
    player.status ===
    "completed"
  ) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <section className="panel p-8 text-center">
          <Trophy
            size={48}
            className="mx-auto text-amber-300"
          />

          <p className="mt-5 text-xs font-black tracking-[.28em] text-amber-300">
            YOUR DRAFT IS COMPLETE
          </p>

          <h1 className="mt-2 text-4xl font-black">
            Your collection is ready.
          </h1>

          <p className="mt-3 text-zinc-400">
            {totalCompleted} cards drafted.
          </p>

          <Link
            href="/cards/collection"
            className="primary-button mt-6 inline-block"
          >
            View Collection
          </Link>
        </section>
      </main>
    );
  }

  // ======================================================
  // ACTIVE OFFER
  // ======================================================

  const {
    data: offerData,
    error: offerError,
  } = await supabase
    .from("draft_offers")
    .select(
      "id,phase,phase_pick_number,rolled_rarity"
    )
    .eq(
      "draft_player_id",
      player.id
    )
    .eq(
      "status",
      "active"
    )
    .limit(1)
    .maybeSingle();

  if (offerError) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="panel p-6">
          Draft offer kon niet worden geladen.
        </div>
      </main>
    );
  }

  // ======================================================
  // NOG GEEN OFFER
  // ======================================================

  if (!offerData) {
    const progress =
      totalRequired === 0
        ? 0
        : (
            totalCompleted /
            totalRequired
          ) * 100;

    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <header>
          <p className="text-xs font-black tracking-[.28em] text-amber-300">
            INITIAL DRAFT
          </p>

          <h1 className="gold-text mt-2 text-4xl font-black">
            {activeDraft.name}
          </h1>
        </header>

        <section className="panel mt-6 p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Total progress
          </p>

          <p className="mt-2 text-3xl font-black">
            {totalCompleted}

            <span className="ml-1 text-lg text-zinc-600">
              / {totalRequired}
            </span>
          </p>

          <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-amber-300"
              style={{
                width: `${progress}%`,
              }}
            />
          </div>

          <form
            action={
              createNextDraftOffer
            }
          >
            <input
              type="hidden"
              name="draft_player_id"
              value={player.id}
            />

            <button
              type="submit"
              className="primary-button mt-6"
            >
              Reveal Next 3 Cards
            </button>
          </form>
        </section>
      </main>
    );
  }

  const offer =
    offerData as DraftOffer;

  // ======================================================
  // OFFER OPTIONS
  // ======================================================

  const {
    data: optionData,
    error: optionError,
  } = await supabase
    .from(
      "draft_offer_cards"
    )
    .select(
      "id,card_catalog_id,display_order"
    )
    .eq(
      "offer_id",
      offer.id
    )
    .eq(
      "status",
      "available"
    )
    .order(
      "display_order",
      {
        ascending: true,
      }
    );

  if (optionError) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="panel p-6">
          Draftopties konden niet worden geladen.
        </div>
      </main>
    );
  }

  const options =
    (optionData ??
      []) as DraftOption[];

  const cardIds =
    options.map(
      (option) =>
        option.card_catalog_id
    );

  // ======================================================
  // CARD DETAILS
  // ======================================================

  let cards: Card[] = [];

  if (
    cardIds.length > 0
  ) {
    const {
      data: cardData,
      error: cardError,
    } = await supabase
      .from(
        "card_catalog"
      )
      .select(
        "id,name,image_url,card_type,monster_type,attribute,level,rank,atk,def,description,game_rarity,rarity_score"
      )
      .in(
        "id",
        cardIds
      );

    if (cardError) {
      return (
        <main className="mx-auto max-w-5xl px-4 py-8">
          <div className="panel p-6">
            Kaartinformatie kon niet worden geladen.
          </div>
        </main>
      );
    }

    cards =
      (cardData ??
        []) as Card[];
  }

  const cardMap =
    new Map(
      cards.map(
        (card) => [
          card.id,
          card,
        ]
      )
    );

  const choices:
    DraftChoiceCard[] =
      options.flatMap(
        (option) => {
          const card =
            cardMap.get(
              option.card_catalog_id
            );

          if (!card) {
            return [];
          }

          return [
            {
              optionId:
                option.id,

              ...card,
            },
          ];
        }
      );

  // ======================================================
  // PHASE INFO
  // ======================================================

  let phaseTotal =
    activeDraft.main_picks_per_player;

  if (
    offer.phase ===
    "fusion"
  ) {
    phaseTotal =
      activeDraft.fusion_picks_per_player;
  }

  if (
    offer.phase ===
    "xyz"
  ) {
    phaseTotal =
      activeDraft.xyz_picks_per_player;
  }

  const rarity =
    offer.rolled_rarity ??
    "Unknown";

  const rarityStyle =
    rarityStyles[
      rarity
    ] ??
    rarityStyles.Normal;

  const progress =
    totalRequired === 0
      ? 0
      : (
          totalCompleted /
          totalRequired
        ) * 100;

  // ======================================================
  // DRAFT UI
  // ======================================================

  return (
    <main className="mx-auto max-w-7xl px-3 py-5 sm:px-6 lg:px-8">
      <header className="text-center">
        <p className="text-[10px] font-black tracking-[.28em] text-amber-300 sm:text-xs">
          INITIAL DRAFT
        </p>

        <h1 className="gold-text mt-1 text-2xl font-black sm:text-4xl">
          {phaseTitle(
            offer.phase
          )}
        </h1>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <span className="text-sm font-bold text-zinc-400">
            Pick{" "}
            {
              offer.phase_pick_number
            }{" "}
            / {phaseTotal}
          </span>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${rarityStyle}`}
          >
            <Sparkles
              size={12}
            />

            {rarity}
          </span>
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          Kies één kaart. Klik op Details om
          de kaart groter te bekijken.
        </p>
      </header>

      <DraftChoiceGrid
        offerId={
          offer.id
        }
        cards={
          choices
        }
      />

      <footer className="mx-auto mt-6 max-w-5xl">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            Total progress
          </span>

          <span>
            {totalCompleted} /{" "}
            {totalRequired}
          </span>
        </div>

        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-amber-300"
            style={{
              width:
                `${progress}%`,
            }}
          />
        </div>
      </footer>
    </main>
  );
}