"use client";

import Image from "next/image";

import {
  memo,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  SearchX,
} from "lucide-react";

import {
  QuantityStepper,
} from "./quantity-stepper";

import {
  largeImage,
  type BuilderCard,
} from "./types";

// =========================================================
// BROWSE GRID
//
// Renders the filtered collection in chunks: the first CHUNK tiles,
// then CHUNK more each time a sentinel near the bottom scrolls into
// view (IntersectionObserver, 1200px early). Tiles are memoised, so
// adding a card re-renders only that card's tile, and use
// content-visibility so off-screen tiles skip layout/paint.
// =========================================================

const CHUNK = 48;

function preloadLarge(
  url: string | null
) {
  const large =
    largeImage(url);

  if (large) {
    const image =
      new window.Image();

    image.decoding =
      "async";

    image.src =
      large;
  }
}

const CardTile = memo(function CardTile({
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
  const legal =
    card.format_eligible;

  return (
    <li
      className={`flex flex-col gap-1.5 rounded-xl p-1 transition-colors duration-150 [contain-intrinsic-size:auto_15rem] [content-visibility:auto] ${
        count > 0
          ? "bg-amber-300/[0.07] ring-1 ring-amber-300/30"
          : ""
      }`}
    >
      <button
        type="button"
        onClick={() =>
          onOpen(
            card.id
          )
        }
        onPointerDown={() =>
          preloadLarge(
            card.image
          )
        }
        aria-label={`Show details for ${card.name}`}
        className="block cursor-pointer touch-manipulation select-none overflow-hidden rounded-lg bg-zinc-900 transition-transform duration-150 ease-out [-webkit-touch-callout:none] active:scale-[0.97]"
      >
        {card.image ? (
          <Image
            src={card.image}
            alt=""
            width={168}
            height={246}
            sizes="(min-width: 1024px) 160px, 33vw"
            loading="lazy"
            draggable={false}
            className={`aspect-[421/614] h-auto w-full object-cover ${
              legal
                ? ""
                : "opacity-60 grayscale"
            }`}
            unoptimized
          />
        ) : (
          <span className="flex aspect-[421/614] items-center justify-center p-2 text-center text-[10px] text-zinc-500">
            {card.name}
          </span>
        )}
      </button>

      <p
        className="truncate px-0.5 text-[11px] font-bold leading-4 text-zinc-200"
        title={card.name}
      >
        {card.name}
      </p>

      <QuantityStepper
        name={card.name}
        count={count}
        owned={card.copies.length}
        canAdd={canAdd}
        legal={legal}
        editable={editable}
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
    </li>
  );
});

export function BrowseGrid({
  cards,
  resetKey,
  countByCard,
  freeByCard,
  editable,
  onAdd,
  onRemove,
  onOpen,
  onResetFilters,
}: {
  cards: BuilderCard[];
  // Changes whenever the filters change, so the grid starts over at
  // the first chunk instead of keeping hundreds of tiles mounted.
  resetKey: string;
  countByCard: ReadonlyMap<string, number>;
  freeByCard: ReadonlyMap<string, number>;
  editable: boolean;
  onAdd: (cardId: string) => void;
  onRemove: (cardId: string) => void;
  onOpen: (cardId: string) => void;
  onResetFilters: () => void;
}) {
  const [limit, setLimit] =
    useState(CHUNK);

  const [seenKey, setSeenKey] =
    useState(resetKey);

  // Reset during render (not in an effect) so the new results never
  // paint with the old limit first.
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setLimit(CHUNK);
  }

  const sentinelRef =
    useRef<HTMLDivElement>(null);

  const hasMore =
    limit <
    cards.length;

  useEffect(() => {
    const sentinel =
      sentinelRef.current;

    if (
      !sentinel ||
      !hasMore
    ) {
      return;
    }

    const observer =
      new IntersectionObserver(
        (entries) => {
          if (
            entries.some(
              (entry) =>
                entry.isIntersecting
            )
          ) {
            setLimit(
              (current) =>
                current +
                CHUNK
            );
          }
        },
        {
          rootMargin:
            "1200px 0px",
        }
      );

    observer.observe(
      sentinel
    );

    return () =>
      observer.disconnect();
  }, [hasMore, limit]);

  if (cards.length === 0) {
    return (
      <div className="panel mt-3 px-6 py-10 text-center">
        <SearchX
          size={32}
          className="mx-auto text-zinc-500"
        />

        <p className="mt-3 font-black text-zinc-200">
          No cards match
        </p>

        <p className="mt-1 text-sm text-zinc-400">
          Try fewer words or remove a filter.
        </p>

        <button
          type="button"
          onClick={onResetFilters}
          className="mt-4 h-11 cursor-pointer touch-manipulation rounded-xl px-4 text-sm font-black text-amber-300 transition active:scale-95 hover:text-amber-200"
        >
          Clear search and filters
        </button>
      </div>
    );
  }

  return (
    <>
      <ul className="mt-2 grid grid-cols-3 gap-x-1.5 gap-y-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {cards
          .slice(
            0,
            limit
          )
          .map(
            (card) => (
              <CardTile
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
            )
          )}
      </ul>

      {hasMore && (
        <div
          ref={sentinelRef}
          aria-hidden
          className="h-24"
        />
      )}
    </>
  );
}
