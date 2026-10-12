import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/decks", () => ({
  addDeckCard: vi.fn(),
  removeDeckCard: vi.fn(),
}));

import { createDeckStore } from "./deck-store";
import type { BuilderCard } from "./types";

function makeCard(id: string, copies: number, overrides: Partial<BuilderCard> = {}): BuilderCard {
  return {
    id,
    name: `Card ${id}`,
    image: null,
    card_type: "Effect Monster",
    monster_type: "Warrior / Effect",
    race: "Warrior",
    attribute: "DARK",
    level: 4,
    rank: null,
    link_rating: null,
    atk: 1800,
    def: 1000,
    game_rarity: null,
    rarity_score: null,
    format_eligible: true,
    master_duel_status: "unlimited",
    archetype: null,
    external_card_id: null,
    master_duel_card_id: null,
    copies: Array.from({ length: copies }, (_, index) => ({
      id: `${id}-copy-${index + 1}`,
      copyNumber: index + 1,
      locked: false,
    })),
    deck_legal: true,
    copy_limit: null,
    ...overrides,
  };
}

function deferred() {
  let resolve!: (value: { ok: true } | { ok: false; error: string }) => void;
  const promise = new Promise<{ ok: true } | { ok: false; error: string }>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createDeckStore", () => {
  it("updates counts immediately and confirms in the background", async () => {
    const add = vi.fn(async () => ({ ok: true as const }));
    const store = createDeckStore({
      deckId: "deck",
      cards: [makeCard("a", 3)],
      initialInDeck: [],
      mutators: { add, remove: vi.fn() },
    });

    store.add("a");
    store.add("a");

    expect(store.getSnapshot().countByCard.get("a")).toBe(2);
    expect(store.getSnapshot().mainCount).toBe(2);

    await flush();

    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenNthCalledWith(1, "deck", "a-copy-1");
    expect(add).toHaveBeenNthCalledWith(2, "deck", "a-copy-2");
    expect(store.getSnapshot().pending).toBe(0);
  });

  it("rolls back a refused add and shows the reason", async () => {
    const pending = deferred();
    const store = createDeckStore({
      deckId: "deck",
      cards: [makeCard("a", 1)],
      initialInDeck: [],
      mutators: { add: vi.fn(() => pending.promise), remove: vi.fn() },
    });

    store.add("a");
    expect(store.getSnapshot().countByCard.get("a")).toBe(1);

    pending.resolve({ ok: false, error: "Main Deck is full. Maximum: 60" });
    await flush();

    expect(store.getSnapshot().countByCard.get("a") ?? 0).toBe(0);
    expect(store.getSnapshot().notice?.text).toBe("Main Deck is full. Maximum: 60");
  });

  it("cancels a queued add instead of sending add + remove", async () => {
    const first = deferred();
    const add = vi.fn(() => first.promise);
    const remove = vi.fn();
    const store = createDeckStore({
      deckId: "deck",
      cards: [makeCard("a", 3)],
      initialInDeck: [],
      mutators: { add, remove },
    });

    store.add("a"); // starts immediately
    store.add("a"); // queued
    store.remove("a"); // cancels the queued one

    expect(store.getSnapshot().countByCard.get("a")).toBe(1);

    first.resolve({ ok: true });
    await flush();

    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it("never picks a locked copy or more copies than owned", () => {
    const add = vi.fn(() => new Promise<never>(() => {}));
    const card = makeCard("a", 2);
    card.copies[0].locked = true;

    const store = createDeckStore({
      deckId: "deck",
      cards: [card],
      initialInDeck: [],
      mutators: { add, remove: vi.fn() },
    });

    store.add("a");
    store.add("a");

    expect(add).toHaveBeenCalledWith("deck", "a-copy-2");
    expect(store.getSnapshot().countByCard.get("a")).toBe(1);
    expect(store.getSnapshot().notice?.tone).toBe("info");
  });

  it("puts Fusion/Xyz in the Extra Deck and enforces the 15 maximum", () => {
    const fusions = Array.from({ length: 16 }, (_, index) =>
      makeCard(`f${index}`, 1, { card_type: "Fusion Monster" })
    );

    const store = createDeckStore({
      deckId: "deck",
      cards: fusions,
      initialInDeck: [],
      mutators: { add: vi.fn(() => new Promise<never>(() => {})), remove: vi.fn() },
    });

    for (const card of fusions) {
      store.add(card.id);
    }

    expect(store.getSnapshot().extraCount).toBe(15);
    expect(store.getSnapshot().mainCount).toBe(0);
    expect(store.getSnapshot().notice?.text).toMatch(/Extra Deck is full/);
  });

  it("removes the highest copy number first", async () => {
    const remove = vi.fn(async () => ({ ok: true as const }));
    const store = createDeckStore({
      deckId: "deck",
      cards: [makeCard("a", 3)],
      initialInDeck: ["a-copy-1", "a-copy-3"],
      mutators: { add: vi.fn(), remove },
    });

    store.remove("a");
    await flush();

    expect(remove).toHaveBeenCalledWith("deck", "a-copy-3");
    expect(store.getSnapshot().countByCard.get("a")).toBe(1);
  });
});

describe("builder card wire format", () => {
  it("round-trips a card", async () => {
    const { decodeBuilderCard, encodeBuilderCard } = await import("./types");
    const card = makeCard("x", 2, {
      image: "https://images.ygoprodeck.com/images/cards_small/123.jpg",
      archetype: "Dark Magician",
    });
    card.copies[1].locked = true;

    const wire = encodeBuilderCard(card);

    expect(wire[2]).toBe("123.jpg");
    expect(decodeBuilderCard(wire)).toEqual(card);
    expect(decodeBuilderCard(encodeBuilderCard({ ...card, image: null, copies: [] }))).toEqual({
      ...card,
      image: null,
      copies: [],
    });
  });

  it("stops at our own copy limit and refuses Forbidden cards without a server call", async () => {
    const add = vi.fn(async () => ({ ok: true as const }));
    const store = createDeckStore({
      deckId: "deck",
      cards: [makeCard("lim", 3, { copy_limit: 1 }), makeCard("ban", 3, { copy_limit: 0 })],
      initialInDeck: [],
      mutators: { add, remove: vi.fn() },
    });

    store.add("lim");
    store.add("lim");
    store.add("ban");
    await flush();

    expect(store.getSnapshot().countByCard.get("lim")).toBe(1);
    expect(store.getSnapshot().countByCard.get("ban")).toBeUndefined();
    expect(add).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().notice?.text).toMatch(/Forbidden/);
  });

  it("lets a deck-legal Boss-route card in even when it is not format_eligible", async () => {
    const add = vi.fn(async () => ({ ok: true as const }));
    const store = createDeckStore({
      deckId: "deck",
      cards: [makeCard("boss", 1, { format_eligible: false, deck_legal: true })],
      initialInDeck: [],
      mutators: { add, remove: vi.fn() },
    });

    store.add("boss");
    await flush();

    expect(add).toHaveBeenCalledTimes(1);
  });
});
