import {
  NextResponse,
} from "next/server";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  loadDeckDoctor,
  loadOwnedDeck,
} from "../_lib/deck-builder-data";

export const dynamic =
  "force-dynamic";

// =========================================================
// GET /decks/<deck id>/doctor
//
// The deterministic Deck Doctor report for the deck as saved right
// now. Loaded only when the player opens Deck Doctor in the builder's
// "More" tab (and again after the deck changed), so a normal page load
// or an add/remove tap never pays for the card_mechanics lookups.
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
    const result =
      await loadDeckDoctor(
        supabase,
        userId,
        deck
      );

    return NextResponse.json(
      result,
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Deck Doctor is unavailable right now.",
      },
      {
        status: 500,
      }
    );
  }
}
