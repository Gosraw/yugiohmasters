"use client";

// =========================================================
// LIVE DECK COMPOSITION (client-side, instant)
//
// Why this exists: every "Add"/"Remove" click on the deck builder
// goes through a server action (src/app/actions/decks.ts), which
// stays the single source of truth - it re-checks ownership, deck
// status, the card instance and the 40/60/15 deck rules server-side
// and actually persists the change. What it should NOT do is make
// the player wait for that full round trip (deck + deck_cards +
// card_instances + card_catalog + Deck Doctor mechanics, ~6 Supabase
// queries) before the numbers on screen move.
//
// computeDeckComposition() is pure and synchronous, and the browser
// already holds every field it needs for the card being added or
// removed - those fields are serialized into the collection browser's
// props anyway. So the Main/Extra totals and the Monster/Spell/Trap
// breakdown are derived here from a small, locally mutable card list
// instead of from a fresh server render. Nothing is queried.
//
// Reconciliation - and why this is NOT React's useOptimistic:
//   - Every add/remove <form> keeps `action={serverAction}` exactly
//     as before, so the forms still submit natively with JavaScript
//     disabled. useOptimistic would require replacing `action` with
//     a client function, which silently drops that progressive
//     enhancement; the local state below is applied from `onSubmit`
//     instead, which leaves the native form wiring untouched.
//   - onSubmit records a pending mutation locally, so the counts
//     update in the same tick as the click - no network involved.
//   - Every server render of the deck page carries a fresh
//     `serverToken`. As soon as a new token arrives, pending
//     mutations are ignored and the counts fall back to the server's
//     authoritative numbers. That happens on success AND on failure
//     (a refused add redirects back with ?error=..., which is still
//     a new render of this page), so a rejected add can never stay
//     on screen as a phantom card - it rolls back by itself.
// =========================================================

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  computeDeckComposition,
  type DeckComposition,
  type DeckCompositionCard,
} from "@/lib/deck-composition";

import {
  removeCardFromDeck,
} from "@/app/actions/decks";

import {
  DeckActionButton,
} from "@/components/deck-action-button";

export type DeckSectionKey =
  | "main"
  | "extra";

export type LiveDeckCard =
  DeckCompositionCard & {
    // deck_cards.id for a card the server already knows about, or a
    // synthetic "optimistic:<card instance id>" key for one that has
    // only just been clicked and isn't persisted yet.
    deckCardId: string;
  };

type PendingMutation =
  | {
      kind: "add";
      section: DeckSectionKey;
      card: LiveDeckCard;
    }
  | {
      kind: "remove";
      deckCardId: string;
    };

// Pending mutations are stored together with the server render they
// were made against. A newer server render (any outcome) makes them
// stale, and stale mutations are simply not applied - see the header
// comment above.
type PendingState = {
  token: string;
  mutations: PendingMutation[];
};

type DeckLiveCompositionValue = {
  mainCards: LiveDeckCard[];
  extraCards: LiveDeckCard[];
  composition: DeckComposition;

  addCard: (
    card: LiveDeckCard,
    section: DeckSectionKey
  ) => void;

  removeCard: (
    deckCardId: string
  ) => void;
};

const NO_MUTATIONS: PendingMutation[] =
  [];

const EMPTY_COMPOSITION =
  computeDeckComposition(
    [],
    []
  );

// Benign default so a consumer rendered outside the provider shows an
// empty deck instead of crashing the page. In practice everything
// that reads this context lives inside DeckLiveCompositionProvider.
const DeckLiveCompositionContext =
  createContext<DeckLiveCompositionValue>(
    {
      mainCards: [],
      extraCards: [],
      composition:
        EMPTY_COMPOSITION,
      addCard: () => {},
      removeCard: () => {},
    }
  );

export function useDeckLiveComposition() {
  return useContext(
    DeckLiveCompositionContext
  );
}

/**
 * Renders the deck builder page's <main> element (rather than sitting
 * inside it) so that the header counters, the composition summary,
 * the sticky mobile bar, the collection browser's Add buttons and the
 * deck tiles' Remove buttons all share one context without adding an
 * extra wrapper node to the DOM.
 *
 * `children` are still rendered on the server - passing server
 * components through a client component's children keeps them out of
 * the client bundle.
 */
export function DeckLiveCompositionProvider({
  mainCards,
  extraCards,
  serverToken,
  className,
  children,
}: {
  mainCards: LiveDeckCard[];
  extraCards: LiveDeckCard[];
  serverToken: string;
  className?: string;
  children: ReactNode;
}) {
  const [pending, setPending] =
    useState<PendingState>(
      () => ({
        token: serverToken,
        mutations: [],
      })
    );

  const activeMutations =
    pending.token ===
    serverToken
      ? pending.mutations
      : NO_MUTATIONS;

  const pushMutation =
    useCallback(
      (
        mutation: PendingMutation
      ) => {
        setPending(
          (previous) =>
            previous.token ===
            serverToken
              ? {
                  token:
                    serverToken,

                  mutations: [
                    ...previous.mutations,
                    mutation,
                  ],
                }
              : {
                  token:
                    serverToken,

                  mutations: [
                    mutation,
                  ],
                }
        );
      },
      [serverToken]
    );

  const addCard =
    useCallback(
      (
        card: LiveDeckCard,
        section: DeckSectionKey
      ) => {
        pushMutation({
          kind: "add",
          section,
          card,
        });
      },
      [pushMutation]
    );

  const removeCard =
    useCallback(
      (
        deckCardId: string
      ) => {
        pushMutation({
          kind: "remove",
          deckCardId,
        });
      },
      [pushMutation]
    );

  const value =
    useMemo<DeckLiveCompositionValue>(() => {
      const main = [
        ...mainCards,
      ];

      const extra = [
        ...extraCards,
      ];

      for (const mutation of activeMutations) {
        if (
          mutation.kind ===
          "add"
        ) {
          if (
            mutation.section ===
            "extra"
          ) {
            extra.push(
              mutation.card
            );
          } else {
            main.push(
              mutation.card
            );
          }

          continue;
        }

        const mainIndex =
          main.findIndex(
            (card) =>
              card.deckCardId ===
              mutation.deckCardId
          );

        if (mainIndex >= 0) {
          main.splice(
            mainIndex,
            1
          );

          continue;
        }

        const extraIndex =
          extra.findIndex(
            (card) =>
              card.deckCardId ===
              mutation.deckCardId
          );

        if (extraIndex >= 0) {
          extra.splice(
            extraIndex,
            1
          );
        }
      }

      return {
        mainCards: main,
        extraCards: extra,

        composition:
          computeDeckComposition(
            main,
            extra
          ),

        addCard,
        removeCard,
      };
    }, [
      mainCards,
      extraCards,
      activeMutations,
      addCard,
      removeCard,
    ]);

  return (
    <DeckLiveCompositionContext.Provider
      value={value}
    >
      <main
        className={className}
      >
        {children}
      </main>
    </DeckLiveCompositionContext.Provider>
  );
}

/**
 * The live card total of one deck section ("all" = Main + Extra).
 * Renders the bare number so it can be dropped into any existing
 * heading, badge or sentence without changing its styling.
 */
export function DeckSectionTotal({
  section,
}: {
  section:
    | DeckSectionKey
    | "all";
}) {
  const {
    composition,
  } =
    useDeckLiveComposition();

  const total =
    section === "main"
      ? composition.main
          .total
      : section === "extra"
        ? composition.extra
            .total
        : composition.main
            .total +
          composition.extra
            .total;

  return <>{total}</>;
}

/**
 * Text whose colour depends on whether a section has reached a
 * minimum (e.g. the Main Deck's 40 card minimum) - the same
 * conditional styling the page used to compute server-side, now
 * following the live count instead.
 */
export function DeckSectionThresholdText({
  section,
  minimum,
  metClassName,
  unmetClassName,
  baseClassName,
  element = "span",
  children,
}: {
  section: DeckSectionKey;
  minimum: number;
  metClassName: string;
  unmetClassName: string;
  baseClassName?: string;

  element?:
    | "span"
    | "p";

  children: ReactNode;
}) {
  const {
    composition,
  } =
    useDeckLiveComposition();

  const total =
    section === "main"
      ? composition.main
          .total
      : composition.extra
          .total;

  const className = [
    baseClassName,

    total >= minimum
      ? metClassName
      : unmetClassName,
  ]
    .filter(Boolean)
    .join(" ");

  if (element === "p") {
    return (
      <p
        className={className}
      >
        {children}
      </p>
    );
  }

  return (
    <span
      className={className}
    >
      {children}
    </span>
  );
}

/**
 * The Remove button on a deck card tile. Identical markup and server
 * action to the inline <form> it replaces (so it still submits
 * natively without JavaScript) - it only additionally drops the card
 * from the live composition the moment it is clicked.
 */
export function DeckRemoveCardForm({
  deckId,
  deckCardId,
}: {
  deckId: string;
  deckCardId: string;
}) {
  const {
    removeCard,
  } =
    useDeckLiveComposition();

  return (
    <form
      action={
        removeCardFromDeck
      }
      onSubmit={() => {
        removeCard(
          deckCardId
        );
      }}
    >
      <input
        type="hidden"
        name="deck_id"
        value={deckId}
      />

      <input
        type="hidden"
        name="deck_card_id"
        value={deckCardId}
      />

      <DeckActionButton
        type="remove"
      />
    </form>
  );
}
