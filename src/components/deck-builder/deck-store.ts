// =========================================================
// DECK STORE - optimistic add/remove for the deck builder
//
// Why a tiny external store instead of useState: a tap must update the
// screen in the same frame, while the server calls run one at a time
// in the background (Next.js dispatches Server Actions sequentially
// anyway). Keeping the queue outside React means the queue always
// sees the latest state, even between renders.
//
//   confirmed  = instance ids the database has accepted
//   ops        = taps not yet confirmed, in tap order
//   inDeck     = confirmed with every op applied (what the UI shows)
//
// A refused op is dropped together with any later op on the same
// physical copy, so the UI rolls back to exactly what the database
// has, and a short notice explains why.
//
// The database stays the source of truth for every rule; the checks
// here (format legal, a free copy left, Main/Extra not full) only
// avoid sending taps that are certain to fail.
// =========================================================

import {
  addDeckCard,
  removeDeckCard,
  type DeckCardMutationResult,
} from "@/app/actions/decks";

import {
  EXTRA_MAX,
  MAIN_MAX,
  sectionForCardType,
  type BuilderCard,
} from "./types";

type Op = {
  id: number;
  kind: "add" | "remove";
  instanceId: string;
  cardId: string;
  started: boolean;
};

export type DeckNotice = {
  id: number;
  text: string;
  tone: "error" | "info";
};

export type DeckSnapshot = {
  inDeck: ReadonlySet<string>;
  // card_catalog id -> copies of it in the deck
  countByCard: ReadonlyMap<string, number>;
  mainCount: number;
  extraCount: number;
  pending: number;
  notice: DeckNotice | null;
};

export type DeckStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => DeckSnapshot;
  add: (cardId: string) => void;
  remove: (cardId: string) => void;
  dismissNotice: (id: number) => void;
};

type Mutator = (deckId: string, instanceId: string) => Promise<DeckCardMutationResult>;

export function createDeckStore({
  deckId,
  cards,
  initialInDeck,
  onConfirmed,
  mutators = {
    add: addDeckCard,
    remove: removeDeckCard,
  },
}: {
  deckId: string;
  cards: BuilderCard[];
  initialInDeck: string[];
  onConfirmed?: () => void;
  mutators?: {
    add: Mutator;
    remove: Mutator;
  };
}): DeckStore {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const cardByInstance = new Map<string, BuilderCard>();

  for (const card of cards) {
    for (const copy of card.copies) {
      cardByInstance.set(copy.id, card);
    }
  }

  // Ignore deck rows for copies the player no longer owns (the page
  // never showed those either).
  const confirmed = new Set(initialInDeck.filter((id) => cardByInstance.has(id)));
  let ops: Op[] = [];
  let nextOpId = 1;
  let nextNoticeId = 1;
  let notice: DeckNotice | null = null;
  let running = false;

  const listeners = new Set<() => void>();

  function build(): DeckSnapshot {
    const inDeck = new Set(confirmed);

    for (const op of ops) {
      if (op.kind === "add") {
        inDeck.add(op.instanceId);
      } else {
        inDeck.delete(op.instanceId);
      }
    }

    const countByCard = new Map<string, number>();
    let mainCount = 0;
    let extraCount = 0;

    for (const instanceId of inDeck) {
      const card = cardByInstance.get(instanceId);

      if (!card) {
        continue;
      }

      countByCard.set(card.id, (countByCard.get(card.id) ?? 0) + 1);

      if (sectionForCardType(card.card_type) === "extra") {
        extraCount += 1;
      } else {
        mainCount += 1;
      }
    }

    return {
      inDeck,
      countByCard,
      mainCount,
      extraCount,
      pending: ops.length,
      notice,
    };
  }

  let snapshot = build();

  function emit() {
    snapshot = build();

    for (const listener of listeners) {
      listener();
    }
  }

  function say(text: string, tone: DeckNotice["tone"] = "error") {
    notice = {
      id: nextNoticeId++,
      text,
      tone,
    };
  }

  async function run() {
    if (running) {
      return;
    }

    running = true;

    try {
      for (;;) {
        const op = ops.find((candidate) => !candidate.started);

        if (!op) {
          break;
        }

        op.started = true;

        let result: DeckCardMutationResult;

        try {
          result = await (op.kind === "add" ? mutators.add : mutators.remove)(deckId, op.instanceId);
        } catch {
          result = {
            ok: false,
            error: "Connection problem - your last change was not saved.",
          };
        }

        const index = ops.indexOf(op);

        if (result.ok) {
          if (op.kind === "add") {
            confirmed.add(op.instanceId);
          } else {
            confirmed.delete(op.instanceId);
          }

          ops.splice(index, 1);
          onConfirmed?.();
        } else {
          // Drop the refused op and anything queued later for the same
          // copy - those depended on it.
          ops = ops.filter(
            (candidate, position) =>
              position < index || (position > index && candidate.instanceId !== op.instanceId)
          );

          say(result.error);
        }

        emit();
      }
    } finally {
      running = false;
    }
  }

  function enqueue(kind: Op["kind"], instanceId: string, cardId: string) {
    ops.push({
      id: nextOpId++,
      kind,
      instanceId,
      cardId,
      started: false,
    });

    emit();
    void run();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      return snapshot;
    },

    add(cardId) {
      const card = cardsById.get(cardId);

      if (!card) {
        return;
      }

      if (!card.format_eligible) {
        say(`${card.name} isn't legal in the current format.`);
        emit();
        return;
      }

      const section = sectionForCardType(card.card_type);

      if (section === "main" && snapshot.mainCount >= MAIN_MAX) {
        say(`Main Deck is full (${MAIN_MAX} max).`);
        emit();
        return;
      }

      if (section === "extra" && snapshot.extraCount >= EXTRA_MAX) {
        say(`Extra Deck is full (${EXTRA_MAX} max).`);
        emit();
        return;
      }

      const free = card.copies.find((copy) => !copy.locked && !snapshot.inDeck.has(copy.id));

      if (!free) {
        say(
          card.copies.some((copy) => copy.locked)
            ? `No free copy of ${card.name} - a copy is locked in a wager.`
            : `All your copies of ${card.name} are already in this deck.`,
          "info"
        );
        emit();
        return;
      }

      enqueue("add", free.id, card.id);
    },

    remove(cardId) {
      const card = cardsById.get(cardId);

      if (!card) {
        return;
      }

      // Undo a tap that hasn't reached the server yet: cheaper than
      // an add + remove round trip.
      for (let index = ops.length - 1; index >= 0; index--) {
        const op = ops[index];

        if (op.cardId === cardId && op.kind === "add" && !op.started) {
          ops.splice(index, 1);
          emit();
          return;
        }
      }

      // Otherwise take out the highest copy number in the deck.
      const inDeckCopies = card.copies.filter((copy) => snapshot.inDeck.has(copy.id));
      const target = inDeckCopies[inDeckCopies.length - 1];

      if (!target) {
        return;
      }

      enqueue("remove", target.id, card.id);
    },

    dismissNotice(id) {
      if (notice?.id === id) {
        notice = null;
        emit();
      }
    },
  };
}
