"use client";

import Image from "next/image";

import Link from "next/link";

import {
  ExternalLink,
} from "lucide-react";

import {
  cardTypeKey,
} from "@/lib/deck-search-parser";

import {
  MasterDuelBadge,
} from "@/components/master-duel-badge";

import {
  BottomSheet,
} from "./bottom-sheet";

import {
  cardSubtitle,
} from "./deck-list";

import {
  QuantityStepper,
} from "./quantity-stepper";

import {
  largeImage,
  sectionForCardType,
  type BuilderCard,
} from "./types";

// =========================================================
// CARD DETAIL SHEET
//
// Opens in place over the builder (no navigation, so the grid, the
// scroll position and the search all stay exactly where they were).
// Effect text comes from the lazily loaded text cache.
// =========================================================

function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
      <p className="text-[9px] font-black uppercase tracking-[.16em] text-zinc-500">
        {label}
      </p>
      <p className="text-sm font-black tabular-nums text-zinc-100">
        {value}
      </p>
    </div>
  );
}

export function CardDetailSheet({
  card,
  open,
  count,
  canAdd,
  editable,
  text,
  textState,
  deckId,
  onAdd,
  onRemove,
  onClose,
}: {
  card: BuilderCard | null;
  open: boolean;
  count: number;
  canAdd: boolean;
  editable: boolean;
  text: string | null;
  textState: "idle" | "loading" | "ready" | "error";
  deckId: string;
  onAdd: (cardId: string) => void;
  onRemove: (cardId: string) => void;
  onClose: () => void;
}) {
  const isMonster =
    card != null &&
    cardTypeKey(
      card.card_type
    ) === "monster";

  const lockedCopies =
    card?.copies.filter(
      (copy) =>
        copy.locked
    ).length ?? 0;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={card?.name ?? ""}
      subtitle={
        card
          ? `${card.card_type} · ${sectionForCardType(card.card_type) === "extra" ? "Extra Deck" : "Main Deck"}`
          : null
      }
      footer={
        card ? (
          <QuantityStepper
            name={card.name}
            count={count}
            owned={card.copies.length}
            canAdd={canAdd}
            legal={card.format_eligible}
            editable={editable}
            size="large"
            onAdd={() =>
              onAdd(
                card.id
              )
            }
            onRemove={() =>
              onRemove(
                card.id
              )
            }
          />
        ) : null
      }
    >
      {card && (
        <div className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-xl bg-zinc-900 shadow-[0_12px_30px_rgb(0_0_0/.45)]">
            {card.image ? (
              <Image
                // Keyed so the small image never flashes in place of
                // the next card's art.
                key={card.id}
                src={
                  largeImage(
                    card.image
                  ) ?? card.image
                }
                alt={card.name}
                width={421}
                height={614}
                sizes="(min-width: 640px) 192px, 152px"
                className={`aspect-[421/614] h-auto w-full object-cover ${
                  card.format_eligible
                    ? ""
                    : "grayscale"
                }`}
                style={{
                  backgroundImage: `url(${card.image})`,
                  backgroundSize: "cover",
                }}
                unoptimized
              />
            ) : (
              <span className="block aspect-[421/614]" />
            )}
          </div>

          <div className="min-w-0 space-y-2.5">
            <p className="text-xs leading-5 text-zinc-300">
              {cardSubtitle(
                card
              )}
            </p>

            {isMonster && (
              <div className="grid grid-cols-2 gap-1.5">
                <Stat
                  label="ATK"
                  value={card.atk ?? "?"}
                />
                <Stat
                  label="DEF"
                  value={card.def ?? "?"}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-black text-zinc-300">
                {card.game_rarity ?? "Not Rated"}
              </span>

              <MasterDuelBadge
                status={
                  card.master_duel_status
                }
              />

              {!card.format_eligible && (
                <span className="rounded-full border border-red-400/40 bg-red-950/80 px-2 py-0.5 text-[10px] font-black uppercase text-red-200">
                  Not format legal
                </span>
              )}
            </div>

            <p className="text-[11px] leading-5 text-zinc-400">
              You own {card.copies.length}{" "}
              {card.copies.length === 1 ? "copy" : "copies"} ·{" "}
              {count} in this deck
              {lockedCopies > 0 &&
                ` · ${lockedCopies} locked in a wager`}
            </p>

            {card.archetype && (
              <p className="text-[11px] text-zinc-400">
                Archetype:{" "}
                <span className="font-bold text-zinc-200">
                  {card.archetype}
                </span>
              </p>
            )}
          </div>

          <div className="col-span-2">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-zinc-500">
              Card text
            </p>

            {text ? (
              <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-zinc-200">
                {text}
              </p>
            ) : textState === "error" ? (
              <p className="mt-1.5 text-sm text-zinc-400">
                Card text couldn&apos;t be loaded right now.
              </p>
            ) : textState === "ready" ? (
              <p className="mt-1.5 text-sm text-zinc-400">
                No card text.
              </p>
            ) : (
              <div
                aria-label="Loading card text"
                className="mt-2 space-y-2"
              >
                <div className="h-3 w-full animate-pulse rounded bg-white/[0.06]" />
                <div className="h-3 w-11/12 animate-pulse rounded bg-white/[0.06]" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.06]" />
              </div>
            )}

            <Link
              href={`/cards/${card.id}?returnTo=${encodeURIComponent(`/decks/${deckId}`)}`}
              className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-xl text-xs font-black text-amber-300 transition active:scale-95 hover:text-amber-200"
            >
              Full card page
              <ExternalLink
                size={13}
              />
            </Link>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
