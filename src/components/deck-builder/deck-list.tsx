"use client";

import Image from "next/image";

import {
  memo,
} from "react";

import {
  ShieldAlert,
} from "lucide-react";

import {
  cardTypeKey,
} from "@/lib/deck-search-parser";

import {
  MasterDuelBadge,
} from "@/components/master-duel-badge";

import {
  QuantityStepper,
} from "./quantity-stepper";

import {
  EXTRA_MAX,
  MAIN_MAX,
  MAIN_MIN,
  sectionForCardType,
  type BuilderCard,
} from "./types";

// =========================================================
// MY DECK
//
// One row per card (not per copy) with a quantity stepper, grouped
// Main (Monsters / Spells / Traps) and Extra. Tapping the art opens
// the same detail sheet as the browse grid.
// =========================================================

export function cardSubtitle(
  card: BuilderCard
): string {
  const kind =
    cardTypeKey(
      card.card_type
    );

  if (kind !== "monster") {
    return `${card.race ?? ""} ${kind === "spell" ? "Spell" : "Trap"}`.trim();
  }

  const stars =
    card.rank != null
      ? `Rank ${card.rank}`
      : card.level != null
        ? `Lv ${card.level}`
        : null;

  return [
    stars,
    card.attribute,
    card.monster_type ??
      card.race,
  ]
    .filter(Boolean)
    .join(" · ");
}

const DeckRow = memo(function DeckRow({
  card,
  count,
  canAdd,
  editable,
  onAdd,
  onRemove,
  onOpen,
}: {
  card: BuilderCard;
  count: number;
  canAdd: boolean;
  editable: boolean;
  onAdd: (cardId: string) => void;
  onRemove: (cardId: string) => void;
  onOpen: (cardId: string) => void;
}) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      <button
        type="button"
        onClick={() =>
          onOpen(
            card.id
          )
        }
        aria-label={`Show details for ${card.name}`}
        className="w-12 shrink-0 cursor-pointer touch-manipulation select-none overflow-hidden rounded-md bg-zinc-900 transition-transform duration-150 active:scale-95"
      >
        {card.image ? (
          <Image
            src={card.image}
            alt=""
            width={168}
            height={246}
            sizes="48px"
            loading="lazy"
            className={`aspect-[421/614] h-auto w-full object-cover ${
              card.format_eligible
                ? ""
                : "grayscale"
            }`}
            unoptimized
          />
        ) : (
          <span className="block aspect-[421/614]" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-bold leading-5 text-zinc-100">
          {card.name}
        </p>

        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-zinc-400">
          {!card.format_eligible && (
            <span className="font-black uppercase text-red-300">
              Not legal ·
            </span>
          )}

          <span className="truncate">
            {cardSubtitle(
              card
            )}
          </span>

          {card.master_duel_status &&
            card.master_duel_status !==
              "unlimited" && (
              <MasterDuelBadge
                status={
                  card.master_duel_status
                }
              />
            )}
        </p>
      </div>

      <div className="w-[7.5rem] shrink-0">
        <QuantityStepper
          name={card.name}
          count={count}
          owned={card.copies.length}
          canAdd={canAdd}
          legal={card.format_eligible}
          editable={editable}
          size="row"
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
      </div>
    </li>
  );
});

type Group = {
  label: string;
  cards: BuilderCard[];
};

function groupDeck(
  cards: BuilderCard[],
  countByCard: ReadonlyMap<string, number>
) {
  const monsters: BuilderCard[] = [];
  const spells: BuilderCard[] = [];
  const traps: BuilderCard[] = [];
  const extra: BuilderCard[] = [];

  for (const card of cards) {
    if (
      !countByCard.get(
        card.id
      )
    ) {
      continue;
    }

    if (
      sectionForCardType(
        card.card_type
      ) === "extra"
    ) {
      extra.push(card);
      continue;
    }

    const kind =
      cardTypeKey(
        card.card_type
      );

    if (kind === "spell") {
      spells.push(card);
    } else if (kind === "trap") {
      traps.push(card);
    } else {
      monsters.push(card);
    }
  }

  const sum = (list: BuilderCard[]) =>
    list.reduce(
      (total, card) =>
        total +
        (countByCard.get(
          card.id
        ) ?? 0),
      0
    );

  const main: Group[] = [
    {
      label: `Monsters ${sum(monsters)}`,
      cards: monsters,
    },
    {
      label: `Spells ${sum(spells)}`,
      cards: spells,
    },
    {
      label: `Traps ${sum(traps)}`,
      cards: traps,
    },
  ].filter(
    (group) =>
      group.cards.length >
      0
  );

  return {
    main,
    extra,
  };
}

export function DeckList({
  cards,
  countByCard,
  freeByCard,
  mainCount,
  extraCount,
  editable,
  onAdd,
  onRemove,
  onOpen,
  onBrowse,
}: {
  cards: BuilderCard[];
  countByCard: ReadonlyMap<string, number>;
  freeByCard: ReadonlyMap<string, number>;
  mainCount: number;
  extraCount: number;
  editable: boolean;
  onAdd: (cardId: string) => void;
  onRemove: (cardId: string) => void;
  onOpen: (cardId: string) => void;
  onBrowse: () => void;
}) {
  const {
    main,
    extra,
  } = groupDeck(
    cards,
    countByCard
  );

  const notLegal =
    cards.filter(
      (card) =>
        !card.format_eligible &&
        (countByCard.get(
          card.id
        ) ?? 0) > 0
    ).length;

  const row = (card: BuilderCard) => (
    <DeckRow
      key={card.id}
      card={card}
      count={
        countByCard.get(
          card.id
        ) ?? 0
      }
      canAdd={
        (freeByCard.get(
          card.id
        ) ?? 0) > 0
      }
      editable={editable}
      onAdd={onAdd}
      onRemove={onRemove}
      onOpen={onOpen}
    />
  );

  return (
    <div className="space-y-3">
      {notLegal > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-300/20 bg-red-300/[0.05] p-3 text-xs leading-5 text-red-100">
          <ShieldAlert
            size={16}
            className="mt-0.5 shrink-0 text-red-300"
          />
          <p>
            {notLegal} card{notLegal === 1 ? " is" : "s are"} no longer
            format-legal. Swap {notLegal === 1 ? "it" : "them"} out
            before your next league duel.
          </p>
        </div>
      )}

      <section className="panel p-3 sm:p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-black text-zinc-50">
            Main Deck
          </h2>

          <p
            className={`text-sm font-black tabular-nums ${
              mainCount >= MAIN_MIN &&
              mainCount <= MAIN_MAX
                ? "text-emerald-300"
                : "text-zinc-300"
            }`}
          >
            {mainCount}
            <span className="text-xs text-zinc-500">
              {" "}
              / {MAIN_MIN}–{MAIN_MAX}
            </span>
          </p>
        </div>

        {main.length === 0 ? (
          <EmptyGroup
            text="No Main Deck cards yet."
            onBrowse={editable ? onBrowse : undefined}
          />
        ) : (
          main.map(
            (group) => (
              <div
                key={group.label}
                className="mt-3"
              >
                <p className="text-[10px] font-black uppercase tracking-[.18em] text-zinc-500">
                  {group.label}
                </p>

                <ul className="mt-1 divide-y divide-white/[0.05]">
                  {group.cards.map(
                    row
                  )}
                </ul>
              </div>
            )
          )
        )}
      </section>

      <section className="panel p-3 sm:p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-black text-zinc-50">
            Extra Deck
          </h2>

          <p className="text-sm font-black tabular-nums text-zinc-300">
            {extraCount}
            <span className="text-xs text-zinc-500">
              {" "}
              / {EXTRA_MAX}
            </span>
          </p>
        </div>

        <p className="mt-0.5 text-[11px] text-zinc-500">
          Fusion and Xyz Monsters only.
        </p>

        {extra.length === 0 ? (
          <EmptyGroup
            text="No Fusion or Xyz Monsters yet."
            onBrowse={editable ? onBrowse : undefined}
          />
        ) : (
          <ul className="mt-2 divide-y divide-white/[0.05]">
            {extra.map(
              row
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

function EmptyGroup({
  text,
  onBrowse,
}: {
  text: string;
  onBrowse?: () => void;
}) {
  return (
    <div className="mt-3 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center">
      <p className="text-sm text-zinc-400">
        {text}
      </p>

      {onBrowse && (
        <button
          type="button"
          onClick={onBrowse}
          className="mt-2 h-11 cursor-pointer touch-manipulation rounded-xl px-4 text-sm font-black text-amber-300 transition active:scale-95"
        >
          Browse your collection
        </button>
      )}
    </div>
  );
}
