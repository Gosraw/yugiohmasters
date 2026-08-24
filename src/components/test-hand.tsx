"use client";

import {
  useMemo,
  useState,
} from "react";

import Image from "next/image";

import {
  Dices,
  RotateCcw,
  X,
} from "lucide-react";

// =========================================================
// TEST HAND (Deck Builder 2.0)
//
// Entirely client-side: no fetch, no server action, no database
// write, ever. A "hand" is just a random sample drawn from the
// `mainDeckCards` prop already rendered on the page - each entry
// already represents one PHYSICAL copy (decks/[id]/page.tsx builds
// mainDeckCards with one array entry per deck_cards row, so a deck
// running 3 copies of the same card already appears 3 separate times
// in this array) - so duplicates come out correctly for free, no
// special-casing needed here.
//
// Opening this panel and redrawing never mutates the deck, never
// calls a server action, and never touches mainDeckCards itself -
// only local component state (the current sample's indices).
// =========================================================

export type TestHandCard = {
  id: string;
  name: string;
  image_url: string | null;
};

// Exported so its shuffle/sample behavior (duplicate handling,
// <5-card graceful shrink, no mutation of the input) can be unit
// tested directly - see test-hand.test.ts.
export function drawHand(
  deckSlots: TestHandCard[],
  size: number
): TestHandCard[] {
  // Fisher-Yates on a COPY of the slot list - never mutates the
  // array the caller passed in.
  const shuffled = [...deckSlots];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, size);
}

function HandCard({
  card,
}: {
  card: TestHandCard;
}) {
  return (
    <div className="panel overflow-hidden">
      {card.image_url ? (
        <Image
          src={card.image_url}
          alt={card.name}
          width={210}
          height={307}
          className="aspect-[421/614] h-auto w-full object-cover"
          unoptimized
        />
      ) : (
        <div className="flex aspect-[421/614] items-center justify-center bg-zinc-900 p-2 text-center text-[10px] text-zinc-500">
          {card.name}
        </div>
      )}
    </div>
  );
}

export function TestHandButton({
  mainDeckCards,
}: {
  mainDeckCards: TestHandCard[];
}) {
  const [open, setOpen] = useState(false);
  const [hand, setHand] = useState<TestHandCard[]>([]);
  const [drawCount, setDrawCount] = useState(0);

  const handSize = Math.min(
    5,
    mainDeckCards.length
  );

  const redraw = () => {
    setHand(drawHand(mainDeckCards, handSize));
    setDrawCount((n) => n + 1);
  };

  const openPanel = () => {
    setHand(drawHand(mainDeckCards, handSize));
    setDrawCount(1);
    setOpen(true);
  };

  const tooFewCards = useMemo(
    () => mainDeckCards.length === 0,
    [mainDeckCards]
  );

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        disabled={tooFewCards}
        title={
          tooFewCards
            ? "Add cards to your Main Deck first."
            : "Draw a random 5-card sample hand - nothing is saved."
        }
        className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2.5 text-sm font-black text-cyan-200 transition-all hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-cyan-300/15 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Dices size={16} />
        Test Hand
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-b-none p-5 sm:rounded-2xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-300">
                  Test Hand
                </p>

                <h2 className="mt-1 text-xl font-black text-zinc-100">
                  Sample Opening Hand
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setOpen(false)
                }
                className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-zinc-400 transition hover:border-white/20 hover:text-zinc-100 active:scale-90"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-2 text-xs text-zinc-500">
              Random draw {drawCount} · client-side only, nothing is
              saved.
              {handSize < 5 &&
                mainDeckCards.length > 0 &&
                ` Your Main Deck only has ${mainDeckCards.length} card${
                  mainDeckCards.length === 1 ? "" : "s"
                }, so this hand shows all of them.`}
            </p>

            {hand.length === 0 ? (
              <p className="mt-6 text-sm text-zinc-500">
                Your Main Deck is empty - add cards first.
              </p>
            ) : (
              <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5">
                {hand.map((card, index) => (
                  <HandCard
                    key={`${card.id}-${index}`}
                    card={card}
                  />
                ))}
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={redraw}
                disabled={
                  mainDeckCards.length ===
                  0
                }
                className="primary-button inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw size={15} />
                Redraw
              </button>

              <button
                type="button"
                onClick={() =>
                  setOpen(false)
                }
                className="inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
