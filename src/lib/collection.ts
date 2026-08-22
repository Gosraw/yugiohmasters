import type { SupabaseClient } from "@supabase/supabase-js";

// =========================================================
// SHARED COLLECTION LOGIC
//
// Both the Collection page and the Card Detail page's
// Previous/Next navigation need to know "what does this
// player's collection look like, filtered and sorted this
// way". This file is the single source of truth for that so
// the two pages can never quietly drift out of sync with each
// other (e.g. Collection sorting one way while Card Detail's
// Previous/Next silently walks a different order).
// =========================================================

export const rarityOrder: Record<string, number> = {
  Normal: 1,
  Rare: 2,
  "Super Rare": 3,
  "Ultra Rare": 4,
  "Secret Rare": 5,
  Legendary: 6,
};

export const rarityStyles: Record<string, string> = {
  Normal: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  Rare: "border-blue-400/30 bg-blue-400/10 text-blue-300",
  "Super Rare": "border-cyan-300/30 bg-cyan-300/10 text-cyan-200",
  "Ultra Rare": "border-amber-300/40 bg-amber-300/10 text-amber-200",
  "Secret Rare": "border-violet-300/40 bg-violet-300/10 text-violet-200",
  Legendary:
    "border-yellow-300/50 bg-yellow-300/15 text-yellow-200 shadow-[0_0_20px_rgba(250,204,21,0.10)]",
};

export type CollectionCardCatalogItem = {
  id: string;
  name: string;
  image_url: string | null;
  card_type: string;
  attribute: string | null;
  atk: number | null;
  def: number | null;
  game_rarity: string | null;
  rarity_score: number | null;
};

export type CollectionCardInstance = {
  id: string;
  card_catalog_id: string;
  copy_number: number;
  acquired_at: string;
  // "locked" now ONLY ever means "reserved by an active Practice
  // Duel card wager" - trading and deck membership never lock a
  // card (see the 2026-08-22 "current ownership is the hard truth"
  // migration). It is deliberately NOT a stand-in for "unavailable"
  // in the general sense any more.
  locked: boolean;
  for_trade: boolean;
  // Informational, non-blocking signals - a card can be true on
  // any combination of these at once.
  inDeck: boolean;
  inPendingOffer: boolean;
};

export type GroupedOwnedCard = {
  card: CollectionCardCatalogItem;
  instances: CollectionCardInstance[];
  quantity: number;
  lockedCount: number;
  availableCount: number;
  forTradeCount: number;
  inDeckCount: number;
  inPendingOfferCount: number;
};

export type CollectionFilters = {
  q?: string;
  rarity?: string;
  type?: string;
  attribute?: string;
  availability?: string; // "" | "available" | "locked"
  forTrade?: boolean;
  sort?: string;
};

/**
 * Fetches every card_instance this player owns (scoped to their
 * league when known) plus the matching card_catalog rows, and
 * groups them by catalog card - one entry per unique card, with
 * every physical copy attached. Unfiltered, unsorted: filtering
 * and sorting are separate steps (see filterAndSortCollection)
 * so Card Detail can re-derive the exact same ordered list a
 * player was looking at in Collection without duplicating this
 * fetch/group logic.
 */
export async function fetchOwnedCollection(
  supabase: SupabaseClient,
  userId: string,
  leagueId: string | null
): Promise<GroupedOwnedCard[]> {
  let instanceQuery = supabase
    .from("card_instances")
    .select("id,card_catalog_id,copy_number,acquired_at,locked,for_trade")
    .eq("current_owner_id", userId);

  if (leagueId) {
    instanceQuery = instanceQuery.eq("league_id", leagueId);
  }

  const { data: instanceData, error: instanceError } =
    await instanceQuery.order("acquired_at", { ascending: false });

  if (instanceError) {
    throw new Error(
      `Collection kon niet worden geladen: ${instanceError.message}`
    );
  }

  const instances = (instanceData ?? []) as CollectionCardInstance[];

  const instanceIds = instances.map((instance) => instance.id);

  // "In Deck" and "In Pending Offer" are informational, non-blocking
  // signals only (see requirement in the 2026-08-22 no-card-locks
  // pass) - deck membership no longer prevents anything, and a card
  // can be offered in several pending trades at once. Two lightweight
  // lookups, scoped to just this player's instance ids.
  const inDeckIds = new Set<string>();
  const inPendingOfferIds = new Set<string>();

  if (instanceIds.length > 0) {
    const { data: deckCardData } = await supabase
      .from("deck_cards")
      .select("card_instance_id")
      .in("card_instance_id", instanceIds);

    for (const row of (deckCardData ?? []) as {
      card_instance_id: string;
    }[]) {
      inDeckIds.add(row.card_instance_id);
    }

    // RLS on trade_items only surfaces trades the current viewer is
    // a participant in, so when viewing another player's binder this
    // will only reflect pending trades between the two of you - not
    // every pending trade that player happens to be in. That's a
    // reasonable default (not a bug): you shouldn't see the shape of
    // someone else's unrelated trades.
    const { data: tradeItemData } = await supabase
      .from("trade_items")
      .select("card_instance_id,trades!inner(status)")
      .in("card_instance_id", instanceIds)
      .eq("trades.status", "pending");

    for (const row of (tradeItemData ?? []) as {
      card_instance_id: string;
    }[]) {
      inPendingOfferIds.add(row.card_instance_id);
    }
  }

  for (const instance of instances) {
    instance.inDeck = inDeckIds.has(instance.id);
    instance.inPendingOffer = inPendingOfferIds.has(instance.id);
  }

  const catalogIds = [
    ...new Set(instances.map((instance) => instance.card_catalog_id)),
  ];

  let catalogCards: CollectionCardCatalogItem[] = [];

  if (catalogIds.length > 0) {
    const { data: catalogData, error: catalogError } = await supabase
      .from("card_catalog")
      .select(
        "id,name,image_url,card_type,attribute,atk,def,game_rarity,rarity_score"
      )
      .in("id", catalogIds);

    if (catalogError) {
      throw new Error(
        `Kaartinformatie kon niet worden geladen: ${catalogError.message}`
      );
    }

    catalogCards = (catalogData ?? []) as CollectionCardCatalogItem[];
  }

  const cardMap = new Map(catalogCards.map((card) => [card.id, card]));

  const groupedMap = new Map<string, GroupedOwnedCard>();

  for (const instance of instances) {
    const card = cardMap.get(instance.card_catalog_id);

    if (!card) {
      continue;
    }

    const existing = groupedMap.get(card.id);

    if (existing) {
      existing.instances.push(instance);
      existing.quantity += 1;

      if (instance.locked) {
        existing.lockedCount += 1;
      } else {
        existing.availableCount += 1;
      }

      if (instance.for_trade) {
        existing.forTradeCount += 1;
      }

      if (instance.inDeck) {
        existing.inDeckCount += 1;
      }

      if (instance.inPendingOffer) {
        existing.inPendingOfferCount += 1;
      }

      continue;
    }

    groupedMap.set(card.id, {
      card,
      instances: [instance],
      quantity: 1,
      lockedCount: instance.locked ? 1 : 0,
      availableCount: instance.locked ? 0 : 1,
      forTradeCount: instance.for_trade ? 1 : 0,
      inDeckCount: instance.inDeck ? 1 : 0,
      inPendingOfferCount: instance.inPendingOffer ? 1 : 0,
    });
  }

  return [...groupedMap.values()];
}

/**
 * Pure filter + sort step, separated from the fetch above so it
 * can run again cheaply against an already-fetched grouped list.
 */
export function filterAndSortCollection(
  groups: GroupedOwnedCard[],
  filters: CollectionFilters
): GroupedOwnedCard[] {
  const q = filters.q?.trim().toLowerCase() ?? "";
  const rarity = filters.rarity ?? "";
  const type = filters.type ?? "";
  const attribute = filters.attribute ?? "";
  const availability = filters.availability ?? "";
  const sort = filters.sort ?? "name";

  let result = groups;

  if (q) {
    result = result.filter((group) =>
      group.card.name.toLowerCase().includes(q)
    );
  }

  if (rarity) {
    result = result.filter((group) => group.card.game_rarity === rarity);
  }

  if (type === "Monster") {
    result = result.filter((group) =>
      group.card.card_type.toLowerCase().includes("monster")
    );
  }

  if (type === "Spell") {
    result = result.filter((group) =>
      group.card.card_type.toLowerCase().includes("spell")
    );
  }

  if (type === "Trap") {
    result = result.filter((group) =>
      group.card.card_type.toLowerCase().includes("trap")
    );
  }

  if (attribute) {
    result = result.filter((group) => group.card.attribute === attribute);
  }

  if (availability === "available") {
    result = result.filter((group) => group.availableCount > 0);
  }

  if (availability === "locked") {
    result = result.filter((group) => group.lockedCount > 0);
  }

  if (filters.forTrade) {
    result = result.filter((group) => group.forTradeCount > 0);
  }

  result = [...result].sort((a, b) => {
    if (sort === "rarity") {
      const aRarity = rarityOrder[a.card.game_rarity ?? ""] ?? 0;
      const bRarity = rarityOrder[b.card.game_rarity ?? ""] ?? 0;

      if (bRarity !== aRarity) {
        return bRarity - aRarity;
      }

      return Number(b.card.rarity_score ?? 0) - Number(a.card.rarity_score ?? 0);
    }

    if (sort === "power") {
      return Number(b.card.rarity_score ?? 0) - Number(a.card.rarity_score ?? 0);
    }

    if (sort === "atk") {
      return Number(b.card.atk ?? -1) - Number(a.card.atk ?? -1);
    }

    if (sort === "copies") {
      return b.quantity - a.quantity;
    }

    if (sort === "available") {
      return b.availableCount - a.availableCount;
    }

    return a.card.name.localeCompare(b.card.name);
  });

  return result;
}

/**
 * Given a returnTo path (as produced by the Collection page,
 * e.g. "/cards/collection?q=jinzo&rarity=Legendary"), parses out
 * the filter params it encodes. Returns null if returnTo doesn't
 * point at the Collection page at all.
 */
export function parseCollectionReturnTo(
  returnTo: string | undefined
): CollectionFilters | null {
  if (!returnTo || !returnTo.startsWith("/cards/collection")) {
    return null;
  }

  const queryIndex = returnTo.indexOf("?");
  const query = new URLSearchParams(
    queryIndex >= 0 ? returnTo.slice(queryIndex + 1) : ""
  );

  return {
    q: query.get("q") ?? undefined,
    rarity: query.get("rarity") ?? undefined,
    type: query.get("type") ?? undefined,
    attribute: query.get("attribute") ?? undefined,
    availability: query.get("availability") ?? undefined,
    forTrade: query.get("forTrade") === "1",
    sort: query.get("sort") ?? undefined,
  };
}
