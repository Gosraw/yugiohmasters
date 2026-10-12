import {
  NextResponse,
} from "next/server";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  loadOwnedCardTexts,
  loadOwnedDeck,
} from "../_lib/deck-builder-data";

export const dynamic =
  "force-dynamic";

// =========================================================
// GET /decks/<deck id>/card-text
//
// Effect text for every card the signed-in player owns in this deck's
// league, as { texts: { <card_catalog id>: "<effect text>" } }.
//
// The deck builder page itself never ships effect text (it is most of
// the payload); the builder asks for it only once a free-text search
// or a card detail sheet actually needs it, then keeps it in memory.
// Private browser caching for a few minutes - the text of a card
// never changes, only which cards the player owns.
// =========================================================

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
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
    return NextResponse.json(
      {
        error:
          "Deck not found.",
      },
      {
        status: 404,
      }
    );
  }

  try {
    const texts =
      await loadOwnedCardTexts(
        supabase,
        userId,
        deck.leagueId
      );

    return NextResponse.json(
      {
        texts,
      },
      {
        headers: {
          "Cache-Control":
            "private, max-age=300",
        },
      }
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Card text could not be loaded.",
      },
      {
        status: 500,
      }
    );
  }
}
