import {
  NextResponse,
} from "next/server";

import {
  fetchAllPages,
  fetchInBatches,
} from "@/lib/supabase/paginate";

import {
  requireUser,
} from "@/lib/supabase/queries";

export const dynamic =
  "force-dynamic";

// =========================================================
// GET /trades/<trade id>/card-text
//
// Effect text for every card both players of this trade own, as
// { texts: { <card_catalog id>: "<effect text>" } }.
//
// The trade page never ships effect text (it was ~300 KB); the card
// browser asks for it only once a free-text search needs it, then
// keeps it in memory. Same pattern as /decks/<id>/card-text.
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

  const {
    data: trade,
  } = await supabase
    .from("trades")
    .select(
      "id,league_id,sender_id,receiver_id"
    )
    .eq(
      "id",
      id
    )
    .maybeSingle();

  if (
    !trade ||
    (
      trade.sender_id !== userId &&
      trade.receiver_id !== userId
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Trade not found.",
      },
      {
        status: 404,
      }
    );
  }

  try {
    const instances =
      await fetchAllPages<{
        card_catalog_id: string;
      }>(
        (
          from,
          to
        ) => supabase
          .from("card_instances")
          .select(
            "card_catalog_id"
          )
          .eq(
            "league_id",
            trade.league_id
          )
          .in(
            "current_owner_id",
            [
              trade.sender_id,
              trade.receiver_id,
            ]
          )
          .order(
            "id",
            {
              ascending: true,
            }
          )
          .range(
            from,
            to
          )
      );

    const catalogIds = [
      ...new Set(
        instances.map(
          (instance) =>
            instance.card_catalog_id
        )
      ),
    ];

    const rows =
      await fetchInBatches<string, {
        id: string;
        description: string | null;
      }>(
        catalogIds,
        (
          batch,
          from,
          to
        ) => supabase
          .from("card_catalog")
          .select(
            "id,description"
          )
          .in(
            "id",
            batch
          )
          .order(
            "id",
            {
              ascending: true,
            }
          )
          .range(
            from,
            to
          )
      );

    const texts: Record<string, string> =
      {};

    for (const row of rows) {
      if (row.description) {
        texts[row.id] =
          row.description;
      }
    }

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
