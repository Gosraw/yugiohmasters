import {
  getImageProps,
} from "next/image";

import type {
  requireUser,
} from "@/lib/supabase/queries";

import {
  getBossArenaImage,
} from "@/lib/boss-arena";

type SupabaseClient =
  Awaited<
    ReturnType<typeof requireUser>
  >["supabase"];

// =========================================================
// BOSS PATH WHEEL DATA (2.0, migration 202610301400)
//
// Everything the wheel and its reveal need for a set of routes:
// name, story, "How it plays", the arena art (full size for the
// reveal, a small optimized copy for the wheel slices) and the
// Stage 1 Boss card. Which routes go on the wheel is decided by the
// database (boss_path_free_routes / spin_boss_path_wheel); this file
// only loads their details. No route codes are hardcoded here.
// =========================================================

export type WheelStageCard = {
  name: string;
  imageUrl:
    | string
    | null;
};

export type WheelRoute = {
  id: string;
  code: string;
  name: string;
  teaserStory: string;
  howItPlays:
    | string
    | null;
  arenaImage: string;
  wheelArt: string;
  stageOneCard:
    | WheelStageCard
    | null;
};

type RouteRow = {
  id: string;
  code: string;
  name: string;
  display_order: number;
  teaser_story: string | null;
  how_it_plays: string | null;
};

type StageRow = {
  route_id: string;
  evolution_card_catalog_id: string;
};

type CardRow = {
  id: string;
  name: string;
  image_url: string | null;
};

// A ~384px optimized copy of the arena art: 14 slices stay light on
// a phone (the full arenas are ~200 KB each).
function wheelArtFor(
  arenaImage: string
) {
  const {
    props,
  } = getImageProps({
    src: arenaImage,
    alt: "",
    width: 384,
    height: 688,
    quality: 75,
  });

  return props.src;
}

/** Route details in display order. Unknown ids are skipped. */
export async function loadWheelRoutes(
  supabase: SupabaseClient,
  routeIds: string[]
): Promise<WheelRoute[]> {
  if (routeIds.length === 0) {
    return [];
  }

  const {
    data: routesData,
    error: routesError,
  } = await supabase
    .from("boss_routes")
    .select(
      "id,code,name,display_order,teaser_story,how_it_plays"
    )
    .in(
      "id",
      routeIds
    )
    .order(
      "display_order",
      {
        ascending: true,
      }
    );

  if (routesError) {
    throw new Error(
      routesError.message
    );
  }

  const routes =
    (routesData ??
      []) as RouteRow[];

  const {
    data: stagesData,
    error: stagesError,
  } = await supabase
    .from("boss_route_stages")
    .select(
      "route_id,evolution_card_catalog_id"
    )
    .eq(
      "stage_number",
      1
    )
    .in(
      "route_id",
      routeIds
    );

  if (stagesError) {
    throw new Error(
      stagesError.message
    );
  }

  const stages =
    (stagesData ??
      []) as StageRow[];

  const cardIds = [
    ...new Set(
      stages.map(
        (stage) =>
          stage.evolution_card_catalog_id
      )
    ),
  ];

  let cards =
    new Map<
      string,
      CardRow
    >();

  if (cardIds.length > 0) {
    const {
      data: cardsData,
      error: cardsError,
    } = await supabase
      .from("card_catalog")
      .select(
        "id,name,image_url"
      )
      .in(
        "id",
        cardIds
      );

    if (cardsError) {
      throw new Error(
        cardsError.message
      );
    }

    cards = new Map(
      ((cardsData ??
        []) as CardRow[]).map(
        (card) => [
          card.id,
          card,
        ]
      )
    );
  }

  const stageCardByRoute =
    new Map(
      stages.map(
        (stage) => [
          stage.route_id,
          cards.get(
            stage.evolution_card_catalog_id
          ),
        ]
      )
    );

  return routes.map(
    (route) => {
      const arenaImage =
        getBossArenaImage(
          route.code
        );

      const card =
        stageCardByRoute.get(
          route.id
        );

      return {
        id: route.id,
        code: route.code,
        name: route.name,
        teaserStory:
          route.teaser_story ??
          "",
        howItPlays:
          route.how_it_plays,
        arenaImage,
        wheelArt:
          wheelArtFor(
            arenaImage
          ),
        stageOneCard: card
          ? {
              name: card.name,
              imageUrl:
                card.image_url,
            }
          : null,
      };
    }
  );
}

/** Route ids the wheel may land on for the signed-in player. */
export async function getFreeRouteIds(
  supabase: SupabaseClient
): Promise<string[]> {
  const {
    data,
    error,
  } = await supabase.rpc(
    "boss_path_free_routes"
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return (
    (data ??
      []) as string[]
  );
}
