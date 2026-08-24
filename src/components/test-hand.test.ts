import {
  describe,
  expect,
  it,
} from "vitest";

import {
  drawHand,
  type TestHandCard,
} from "@/components/test-hand";

// =========================================================
// TEST HAND - mandated test suite
// =========================================================

function slots(n: number, duplicateOf?: string): TestHandCard[] {
  return Array.from({ length: n }, (_, i) => ({
    id: duplicateOf ?? `card-${i}`,
    name: duplicateOf ? "Duplicate Card" : `Card ${i}`,
    image_url: null,
  }));
}

describe("drawHand", () => {
  it("1. draws exactly 5 cards when the deck has 5 or more", () => {
    const hand = drawHand(slots(40), 5);
    expect(hand).toHaveLength(5);
  });

  it("2. duplicates are represented correctly - a deck slot list with 3 copies of the same card can produce multiple copies in hand", () => {
    // 3 copies of "Duplicate Card" + 2 unique filler cards = 5 slots
    // total, sample size 5 -> the whole deck, so all 3 duplicate
    // copies MUST appear.
    const deck = [
      ...slots(3, "dup-card"),
      ...slots(2),
    ];
    const hand = drawHand(deck, 5);
    const dupCount = hand.filter((c) => c.id === "dup-card").length;
    expect(dupCount).toBe(3);
  });

  it("3. does NOT mutate the input deck array or its order", () => {
    const deck = slots(10);
    const originalOrder = deck.map((c) => c.id);
    drawHand(deck, 5);
    expect(deck.map((c) => c.id)).toEqual(originalOrder);
  });

  it("4. handles fewer than 5 cards gracefully - returns all of them, no crash, no duplicated slots invented", () => {
    const hand = drawHand(slots(3), 5);
    expect(hand).toHaveLength(3);
    expect(new Set(hand.map((c) => c.id)).size).toBe(3);
  });

  it("5. handles an empty deck gracefully", () => {
    const hand = drawHand([], 5);
    expect(hand).toHaveLength(0);
  });

  it("6. never returns more cards than requested even with a huge deck", () => {
    const hand = drawHand(slots(60), 5);
    expect(hand).toHaveLength(5);
  });
});
