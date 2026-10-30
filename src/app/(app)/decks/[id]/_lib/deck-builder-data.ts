import {
  createClient,
} from "@/lib/supabase/server";

import {
  fetchAllPages,
  fetchInBatches,
} from "@/lib/supabase/paginate";

import {
  analyzeDeck,
  type DeckDoctorCard,
  type DeckDoctorMechanics,
  type DeckDoctorReport,
} from "@/lib/deck-doctor";

import {
  sectionForCardType,
  type BuilderCard,
  type BuilderDeck,
} from "@/components/deck-builder/types";

// =========================================================
// DECK BUILDER DATA (server only)
//
// Shared by the deck page and its two lazy JSON routes
// (card-text/, doctor/). Every list that can grow past 1000 rows is
// paged, and every .in() filter is batched - see
// src/lib/supabase/paginate.ts for why.
// =========================================================

type Supabase =
  Awaited<
    ReturnType<
      typeof createClient
    >
  >;

export type OwnedDeck =
  BuilderDeck & {
    leagueId: string;
  };

type InstanceRow = {
  id: string;
  card_catalog_id: string;
  copy_number: number;
  locked: boolean;
};

type CatalogRow =
  Omit<
    BuilderCard,
    "image" | "copies" | "deck_legal" | "copy_limit"
  > & {
    image_url: string | null;
    image_url_small: string | null;
  };

// Tile-weight columns only: no description (effect text), no
// set_information/raw_data.
const CATALOG_TILE_COLUMNS =
  "id,name,image_url,image_url_small,card_type,monster_type,race,attribute,level,rank,link_rating,atk,def,game_rarity,rarity_score,format_eligible,master_duel_status,archetype,external_card_id,master_duel_card_id";

export async function loadOwnedDeck(
  supabase: Supabase,
  userId: string,
  deckId: string
): Promise<OwnedDeck | null> {
  const {
    data,
    error,
  } = await supabase
    .from("decks")
    .select(
      "id,league_id,owner_id,name,status,is_active"
    )
    .eq(
      "id",
      deckId
    )
    .eq(
      "owner_id",
      userId
    )
    .maybeSingle();

  if (
    error ||
    !data
  ) {
    return null;
  }

  return {
    id: data.id,
    leagueId: data.league_id,
    name: data.name,
    status: data.status,
    isActive: data.is_active,
  };
}

async function loadOwnedInstances(
  supabase: Supabase,
  userId: string,
  leagueId: string
) {
  return fetchAllPages<InstanceRow>(
    (
      from,
      to
    ) => supabase
      .from("card_instances")
      .select(
        "id,card_catalog_id,copy_number,locked"
      )
      .eq(
        "current_owner_id",
        userId
      )
      .eq(
        "league_id",
        leagueId
      )
      .order(
        "copy_number",
        {
          ascending: true,
        }
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
}

function uniqueCatalogIds(
  instances: InstanceRow[]
) {
  return [
    ...new Set(
      instances.map(
        (instance) =>
          instance.card_catalog_id
      )
    ),
  ];
}

/**
 * The player's whole collection for this league, grouped per card,
 * sorted by name. Instances in the deck are included - the client
 * works out "available" itself from the deck's instance ids.
 */
export async function loadBuilderCards(
  supabase: Supabase,
  userId: string,
  leagueId: string
): Promise<BuilderCard[]> {
  const instances =
    await loadOwnedInstances(
      supabase,
      userId,
      leagueId
    );

  const catalogRows =
    await fetchInBatches<string, CatalogRow>(
      uniqueCatalogIds(
        instances
      ),
      (
        batch,
        from,
        to
      ) => supabase
        .from("card_catalog")
        .select(
          CATALOG_TILE_COLUMNS
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

  const rules =
    await loadDeckRules(
      supabase,
      userId,
      catalogRows
    );

  const cardsById =
    new Map<string, BuilderCard>();

  for (const row of catalogRows) {
    const {
      image_url,
      image_url_small,
      ...rest
    } = row;

    // The Boss-route exemption only matters for cards outside the
    // pool; a route card inside the pool keeps its normal limit
    // (duelist_circle_deck_copy_limit, 202610301000).
    const exempt =
      !row.format_eligible &&
      rules.exemptIds.has(
        row.id
      );

    cardsById.set(
      row.id,
      {
        ...rest,
        image:
          image_url_small ??
          image_url,
        copies: [],
        deck_legal:
          row.format_eligible ||
          exempt,
        copy_limit:
          exempt
            ? null
            : rules.limits.get(
                row.id
              ) ?? null,
      }
    );
  }

  for (const instance of instances) {
    cardsById
      .get(
        instance.card_catalog_id
      )
      ?.copies.push({
        id: instance.id,
        copyNumber:
          instance.copy_number,
        locked:
          instance.locked,
      });
  }

  return [
    ...cardsById.values(),
  ].sort(
    (a, b) =>
      a.name.localeCompare(
        b.name
      )
  );
}

type ActiveFormat = {
  id: string;
  code: string;
  boss_route_exempt: boolean;
};

/**
 * Display-side mirror of the database's deck rules for the ACTIVE
 * format (the database stays the source of truth and refuses
 * anything that breaks them):
 *   - limits: duelist_circle_card_limits rows (our own banlist),
 *     like duelist_circle_deck_copy_limit().
 *   - exemptIds: cards that are deck legal without being
 *     format_eligible because the format has boss_route_exempt, like
 *     is_duelist_circle_deck_legal_for(): an evolution monster or a
 *     route-exclusive grant of an ACTIVE Boss Route that THIS player
 *     has, not not_available, not excluded. Only exempt cards that are
 *     outside the pool lose their copy limit (the caller checks
 *     format_eligible).
 * No active format = no limits and no exemptions.
 */
async function loadDeckRules(
  supabase: Supabase,
  userId: string,
  catalogRows: CatalogRow[]
): Promise<{
  limits: Map<string, number>;
  exemptIds: Set<string>;
}> {
  const limits =
    new Map<string, number>();

  const exemptIds =
    new Set<string>();

  const {
    data: format,
    error: formatError,
  } = await supabase
    .from("duelist_circle_formats")
    .select(
      "id,code,boss_route_exempt"
    )
    .eq(
      "is_active",
      true
    )
    .limit(1)
    .maybeSingle<ActiveFormat>();

  if (formatError) {
    throw new Error(
      formatError.message
    );
  }

  if (
    !format ||
    catalogRows.length === 0
  ) {
    return {
      limits,
      exemptIds,
    };
  }

  const ids =
    catalogRows.map(
      (row) =>
        row.id
    );

  const limitRows =
    await fetchInBatches<string, {
      card_catalog_id: string;
      max_copies: number;
    }>(
      ids,
      (
        batch,
        from,
        to
      ) => supabase
        .from("duelist_circle_card_limits")
        .select(
          "card_catalog_id,max_copies"
        )
        .eq(
          "format_code",
          format.code
        )
        .in(
          "card_catalog_id",
          batch
        )
        .order(
          "card_catalog_id",
          {
            ascending: true,
          }
        )
        .range(
          from,
          to
        )
    );

  for (const row of limitRows) {
    limits.set(
      row.card_catalog_id,
      row.max_copies
    );
  }

  if (!format.boss_route_exempt) {
    return {
      limits,
      exemptIds,
    };
  }

  const routeCardIds =
    await loadOwnBossRouteCardIds(
      supabase,
      userId
    );

  if (routeCardIds.size === 0) {
    return {
      limits,
      exemptIds,
    };
  }

  const excludeRows =
    await fetchInBatches<string, {
      card_catalog_id: string;
    }>(
      [
        ...routeCardIds,
      ],
      (
        batch,
        from,
        to
      ) => supabase
        .from("format_card_overrides")
        .select(
          "card_catalog_id"
        )
        .eq(
          "format_id",
          format.id
        )
        .eq(
          "override_type",
          "exclude"
        )
        .in(
          "card_catalog_id",
          batch
        )
        .order(
          "card_catalog_id",
          {
            ascending: true,
          }
        )
        .range(
          from,
          to
        )
    );

  const excluded =
    new Set(
      excludeRows.map(
        (row) =>
          row.card_catalog_id
      )
    );

  const statusById =
    new Map(
      catalogRows.map(
        (row) => [
          row.id,
          row.master_duel_status,
        ]
      )
    );

  for (const id of routeCardIds) {
    if (
      statusById.has(id) &&
      !excluded.has(id) &&
      statusById.get(id) !==
        "not_available"
    ) {
      exemptIds.add(id);
    }
  }

  return {
    limits,
    exemptIds,
  };
}

/**
 * Evolution cards (every stage) and route-exclusive grants of the
 * ACTIVE Boss Routes this player has - the cards the Boss-route
 * exemption lets them deck (is_boss_route_exempt_for_profile in the
 * database). At most 3 routes, so a handful of small queries.
 */
async function loadOwnBossRouteCardIds(
  supabase: Supabase,
  userId: string
): Promise<Set<string>> {
  const ids =
    new Set<string>();

  const {
    data: paths,
    error: pathsError,
  } = await supabase
    .from("player_boss_paths")
    .select(
      "route_id"
    )
    .eq(
      "profile_id",
      userId
    );

  if (pathsError) {
    throw new Error(
      pathsError.message
    );
  }

  const routeIds =
    (paths ?? []).map(
      (path) =>
        path.route_id as string
    );

  if (routeIds.length === 0) {
    return ids;
  }

  const {
    data: routes,
    error: routesError,
  } = await supabase
    .from("boss_routes")
    .select(
      "id"
    )
    .in(
      "id",
      routeIds
    )
    .eq(
      "is_active",
      true
    );

  if (routesError) {
    throw new Error(
      routesError.message
    );
  }

  const activeRouteIds =
    (routes ?? []).map(
      (route) =>
        route.id as string
    );

  if (activeRouteIds.length === 0) {
    return ids;
  }

  const {
    data: stages,
    error: stagesError,
  } = await supabase
    .from("boss_route_stages")
    .select(
      "id,evolution_card_catalog_id"
    )
    .in(
      "route_id",
      activeRouteIds
    );

  if (stagesError) {
    throw new Error(
      stagesError.message
    );
  }

  for (const stage of stages ?? []) {
    ids.add(
      stage.evolution_card_catalog_id as string
    );
  }

  const stageIds =
    (stages ?? []).map(
      (stage) =>
        stage.id as string
    );

  if (stageIds.length === 0) {
    return ids;
  }

  const {
    data: grants,
    error: grantsError,
  } = await supabase
    .from("boss_route_stage_grants")
    .select(
      "card_catalog_id"
    )
    .in(
      "stage_id",
      stageIds
    )
    .eq(
      "is_route_exclusive",
      true
    );

  if (grantsError) {
    throw new Error(
      grantsError.message
    );
  }

  for (const grant of grants ?? []) {
    ids.add(
      grant.card_catalog_id as string
    );
  }

  return ids;
}

export async function loadDeckInstanceIds(
  supabase: Supabase,
  deckId: string
): Promise<string[]> {
  const rows =
    await fetchAllPages<{
      card_instance_id: string;
    }>(
      (
        from,
        to
      ) => supabase
        .from("deck_cards")
        .select(
          "card_instance_id"
        )
        .eq(
          "deck_id",
          deckId
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

  return rows.map(
    (row) =>
      row.card_instance_id
  );
}

/**
 * Effect text for every card the player owns in this league -
 * fetched only when the builder needs it (a free-text search or an
 * open detail sheet), never on page load.
 */
export async function loadOwnedCardTexts(
  supabase: Supabase,
  userId: string,
  leagueId: string
): Promise<Record<string, string>> {
  const instances =
    await loadOwnedInstances(
      supabase,
      userId,
      leagueId
    );

  const rows =
    await fetchInBatches<string, {
      id: string;
      description: string | null;
    }>(
      uniqueCatalogIds(
        instances
      ),
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

  return texts;
}

type MechanicsRow = {
  card_catalog_id: string;
  tags: string[];
};

// Tags Deck Doctor can suggest from the player's own collection.
const DECK_DOCTOR_OWNED_TAGS = [
  "gy_setup",
  "fusion_enabler",
  "xyz_enabler",
];

export type DeckDoctorResult = {
  report: DeckDoctorReport;
  // false = the card mechanics engine hasn't analysed these cards yet
  // (distinct from "analysed and healthy").
  mechanicsComputed: boolean;
};

/**
 * Deterministic Deck Doctor report for the deck as it is in the
 * database right now. Two batched, indexed card_mechanics lookups:
 * the deck's own cards, and owned-but-not-in-deck cards carrying a
 * tag Deck Doctor can suggest.
 */
export async function loadDeckDoctor(
  supabase: Supabase,
  userId: string,
  deck: OwnedDeck
): Promise<DeckDoctorResult> {
  const [
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

  const inDeck =
    new Set(
      deckInstanceIds
    );

  const mainCards: DeckDoctorCard[] =
    [];

  const extraCards: DeckDoctorCard[] =
    [];

  const deckCardIds =
    new Set<string>();

  for (const card of cards) {
    for (const copy of card.copies) {
      if (
        !inDeck.has(
          copy.id
        )
      ) {
        continue;
      }

      deckCardIds.add(
        card.id
      );

      const entry = {
        cardCatalogId: card.id,
        name: card.name,
        cardType: card.card_type,
      };

      if (
        sectionForCardType(
          card.card_type
        ) === "extra"
      ) {
        extraCards.push(
          entry
        );
      } else {
        mainCards.push(
          entry
        );
      }
    }
  }

  const ownedNotInDeck =
    cards.filter(
      (card) =>
        !deckCardIds.has(
          card.id
        )
    );

  const [
    deckMechRows,
    ownedMechRows,
  ] = await Promise.all([
    fetchInBatches<string, MechanicsRow>(
      [
        ...deckCardIds,
      ],
      (
        batch,
        from,
        to
      ) => supabase
        .from("card_mechanics")
        .select(
          "card_catalog_id,tags"
        )
        .in(
          "card_catalog_id",
          batch
        )
        .order(
          "card_catalog_id",
          {
            ascending: true,
          }
        )
        .range(
          from,
          to
        )
    ),
    fetchInBatches<string, MechanicsRow>(
      ownedNotInDeck.map(
        (card) =>
          card.id
      ),
      (
        batch,
        from,
        to
      ) => supabase
        .from("card_mechanics")
        .select(
          "card_catalog_id,tags"
        )
        .in(
          "card_catalog_id",
          batch
        )
        .overlaps(
          "tags",
          DECK_DOCTOR_OWNED_TAGS
        )
        .order(
          "card_catalog_id",
          {
            ascending: true,
          }
        )
        .range(
          from,
          to
        )
    ),
  ]);

  const mechanicsByCardId =
    new Map<string, DeckDoctorMechanics>(
      deckMechRows.map(
        (row) => [
          row.card_catalog_id,
          {
            tags: row.tags,
          },
        ]
      )
    );

  const cardsById =
    new Map(
      cards.map(
        (card) => [
          card.id,
          card,
        ]
      )
    );

  const ownedPool =
    ownedMechRows.map(
      (row) => ({
        cardCatalogId:
          row.card_catalog_id,
        name:
          cardsById.get(
            row.card_catalog_id
          )?.name ??
          "Unknown card",
        cardType:
          cardsById.get(
            row.card_catalog_id
          )?.card_type ??
          "",
        tags: row.tags,
      })
    );

  return {
    report:
      analyzeDeck(
        mainCards,
        extraCards,
        mechanicsByCardId,
        ownedPool
      ),
    mechanicsComputed:
      mechanicsByCardId.size >
      0,
  };
}
