import {
  notFound,
} from "next/navigation";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  DeckBuilder,
} from "@/components/deck-builder/deck-builder";

import {
  encodeBuilderCard,
} from "@/components/deck-builder/types";

import {
  loadBuilderCards,
  loadDeckInstanceIds,
  loadOwnedDeck,
} from "./_lib/deck-builder-data";

export const dynamic =
  "force-dynamic";

// =========================================================
// DECK BUILDER PAGE
//
// Only loads what the builder needs to render: the deck, which copies
// are in it, and the player's collection at "tile weight" (no effect
// text, small images). Everything interactive - adding/removing,
// search, filters, Deck Doctor, Master Duel export - lives in the
// <DeckBuilder /> client component, so a tap never triggers a server
// render of this page. Effect text and Deck Doctor load lazily from
// ./card-text and ./doctor.
// =========================================================

export default async function DeckBuilderPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const {
    id,
  } = await params;

  const {
    supabase,
    userId,
  } = await requireUser();

  const deck =
    await loadOwnedDeck(
      supabase,
      userId,
      id
    );

  if (!deck) {
    notFound();
  }

  let cards;
  let deckInstanceIds;

  try {
    [
      cards,
      deckInstanceIds,
    ] = await Promise.all([
      loadBuilderCards(
        supabase,
        userId,
        deck.leagueId
      ),
      loadDeckInstanceIds(
        supabase,
        deck.id
      ),
    ]);
  } catch (error) {
    throw new Error(
      `Deck builder could not be loaded: ${(error as Error).message}`
    );
  }

  // When this render was made - lets the builder notice that the
  // browser restored an older copy of the page (back/forward) after
  // the deck was edited, and refresh it. Differs per request by
  // design; this Server Component never re-renders in the browser.
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();

  return (
    <DeckBuilder
      // A fresh server render (router.refresh, status change) starts
      // the builder over from the database's state.
      key={renderedAt}
      deck={{
        id: deck.id,
        name: deck.name,
        status: deck.status,
        isActive: deck.isActive,
      }}
      cardsWire={cards.map(
        encodeBuilderCard
      )}
      initialInDeck={
        deckInstanceIds
      }
      renderedAt={
        renderedAt
      }
    />
  );
}
