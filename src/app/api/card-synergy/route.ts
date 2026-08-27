import {
  NextResponse,
} from "next/server";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  getCardSynergyInsight,
} from "@/lib/ai/card-synergy-context";

export const dynamic =
  "force-dynamic";

// =========================================================
// GET /api/card-synergy?cardId=<card_catalog id>
//
// Auth required. Returns the Duelist Insight suggestions for one
// card, scoped to the requesting player's own collection - never
// another player's data, never a client-supplied query. Lazy-
// loaded from the client (see CardSynergyInsight component), never
// called per-hover/per-tile - only when a card detail page actually
// asks for it, and cached server-side for a while afterward (see
// card-synergy-context.ts).
//
// Failure modes (bad AI response, catalog fetch error, etc.) never
// throw a 500 with a generic message - either a specific 4xx for a
// bad request, or a clean empty/degraded insight, so the Card
// Detail page can always show "Card insights are temporarily
// unavailable" instead of breaking.
// =========================================================

export async function GET(request: Request) {
  const {
    supabase,
    userId,
  } = await requireUser();

  const { searchParams } = new URL(request.url);
  const cardId = searchParams.get("cardId");

  if (!cardId) {
    return NextResponse.json(
      { error: "Missing cardId." },
      { status: 400 }
    );
  }

  try {
    const insight = await getCardSynergyInsight(
      supabase,
      userId,
      cardId
    );

    if (!insight) {
      return NextResponse.json(
        { error: "Card not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(insight);
  } catch (err) {
    // The response body is deliberately generic-safe rather than a
    // 500 with error detail - the UI treats a non-ok response and a
    // network error identically ("temporarily unavailable"). But the
    // failure itself must never be silent server-side: every prior
    // version of this catch swallowed the real exception entirely,
    // making a genuine provider/config/query failure indistinguishable
    // from "legitimately nothing found" in the logs, which is exactly
    // what made the underlying "Coach shows nothing" bug hard to
    // diagnose. Logging here does not change the response - it only
    // makes a real failure visible in server logs.
    console.error("[api/card-synergy] getCardSynergyInsight threw", {
      cardId,
      userId,
      error: err,
    });
    return NextResponse.json(
      { error: "Card insights are temporarily unavailable." },
      { status: 503 }
    );
  }
}
