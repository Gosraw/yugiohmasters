import type { SupabaseClient } from "@supabase/supabase-js";

import { matchesRace } from "@/lib/card-race";
import { matchesCardSearch } from "@/lib/card-search";
import { fetchAllPages, fetchInBatches } from "@/lib/supabase/paginate";

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
  // Real Monster Type/Race from card_catalog (indexed - see
  // card_catalog_race_idx) - null for Spell/Trap cards. See
  // src/lib/card-race.ts for the fixed filter vocabulary and the
  // reasoning for never inferring this from a name/archetype guess.
  race: string | null;
  atk: number | null;
  def: number | null;
  game_rarity: string | null;
  rarity_score: number | null;
  master_duel_status: string | null;
  // Real archetype metadata from card_catalog (indexed - see
  // card_catalog_archetype_idx) - null for cards with no archetype.
  // Collection 2.0's "Group by Archetype" reads this directly and
  // NEVER infers an archetype from a name substring (the product
  // spec explicitly forbids that - see groupCollectionByArchetype).
  archetype: string | null;
  // Real effect/rules text from card_catalog.description - included
  // so the search box (see filterAndSortCollection's `q` handling)
  // can match on effect text, not just the card name.
  description: string | null;
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
  // "" | "main" | "fusion" | "xyz" - independent of `type`, mirrors the
  // Main/Extra split the deck builder already uses (see
  // isExtraDeckCard in deck-collection-browser.tsx) so a player can
  // narrow down to just their Extra Deck material while browsing.
  section?: string;
  attribute?: string;
  // Real card_catalog.race value (Dragon, Spellcaster, ...) - see
  // src/lib/card-race.ts. Independent of `type`/`section`, exactly
  // like `attribute`.
  race?: string;
  availability?: string; // "" | "available" | "locked"
  forTrade?: boolean;
  sort?: string;
};

/**
 * Same "fusion"/"xyz" substring check the deck builder uses
 * (isExtraDeckCard in deck-collection-browser.tsx) - kept as its own
 * small helper here so Collection's Main/Fusion/Xyz filter can never
 * quietly drift out of sync with what actually counts as Extra Deck
 * material in the deck builder.
 */
export function isExtraDeckCardType(cardType: string): "fusion" | "xyz" | null {
  const normalized = cardType.toLowerCase();

  if (normalized.includes("fusion")) {
    return "fusion";
  }

  if (normalized.includes("xyz")) {
    return "xyz";
  }

  return null;
}

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
  let instances: CollectionCardInstance[];

  try {
    // Paged: a single select stops at 1000 rows, which silently hid
    // the rest of a big collection (Collection, binder, card detail).
    instances = await fetchAllPages<CollectionCardInstance>(
      (from, to) => {
        let instanceQuery = supabase
          .from("card_instances")
          .select("id,card_catalog_id,copy_number,acquired_at,locked,for_trade")
          .eq("current_owner_id", userId);

        if (leagueId) {
          instanceQuery = instanceQuery.eq("league_id", leagueId);
        }

        return instanceQuery
          .order("acquired_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to);
      }
    );
  } catch (error) {
    throw new Error(
      `Collection could not be loaded: ${(error as Error).message}`
    );
  }

  const instanceIds = instances.map((instance) => instance.id);

  // "In Deck" and "In Pending Offer" are informational, non-blocking
  // signals only (see requirement in the 2026-08-22 no-card-locks
  // pass) - deck membership no longer prevents anything, and a card
  // can be offered in several pending trades at once. Two lightweight
  // lookups, scoped to just this player's instance ids.
  const inDeckIds = new Set<string>();
  const inPendingOfferIds = new Set<string>();

  if (instanceIds.length > 0) {
    // Batched: one .in() with every instance id overflowed the
    // request URL on big collections and the error was swallowed,
    // so In Deck / Pending flags quietly went blank.
    const [deckCardData, tradeItemData] = await Promise.all([
      fetchInBatches<string, { card_instance_id: string }>(
        instanceIds,
        (batch, from, to) => supabase
          .from("deck_cards")
          .select("card_instance_id")
          .in("card_instance_id", batch)
          .order("card_instance_id")
          .range(from, to)
      ),
      // RLS on trade_items only surfaces trades the current viewer is
      // a participant in, so when viewing another player's binder this
      // will only reflect pending trades between the two of you - not
      // every pending trade that player happens to be in. That's a
      // reasonable default (not a bug): you shouldn't see the shape of
      // someone else's unrelated trades.
      fetchInBatches<string, { card_instance_id: string }>(
        instanceIds,
        (batch, from, to) => supabase
          .from("trade_items")
          .select("card_instance_id,trades!inner(status)")
          .in("card_instance_id", batch)
          .eq("trades.status", "pending")
          .order("card_instance_id")
          .range(from, to)
      ),
    ]);

    for (const row of deckCardData) {
      inDeckIds.add(row.card_instance_id);
    }

    for (const row of tradeItemData) {
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

  let catalogCards: CollectionCardCatalogItem[];

  try {
    // Batched (URL length) and run a few batches in parallel instead
    // of one after another.
    catalogCards = await fetchInBatches<string, CollectionCardCatalogItem>(
      catalogIds,
      (batch, from, to) => supabase
        .from("card_catalog")
        .select(
          "id,name,image_url,card_type,attribute,race,atk,def,game_rarity,rarity_score,master_duel_status,archetype,description"
        )
        .in("id", batch)
        .order("id")
        .range(from, to)
    );
  } catch (error) {
    throw new Error(
      `Card details could not be loaded: ${(error as Error).message}`
    );
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
  const section = filters.section ?? "";
  const attribute = filters.attribute ?? "";
  const race = filters.race ?? "";
  const availability = filters.availability ?? "";
  const sort = filters.sort ?? "name";

  let result = groups;

  if (q) {
    result = result.filter((group) =>
      matchesCardSearch(group.card, q)
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

  if (section === "main") {
    result = result.filter(
      (group) => isExtraDeckCardType(group.card.card_type) === null
    );
  }

  if (section === "fusion" || section === "xyz") {
    result = result.filter(
      (group) => isExtraDeckCardType(group.card.card_type) === section
    );
  }

  if (attribute) {
    result = result.filter((group) => group.card.attribute === attribute);
  }

  if (race) {
    result = result.filter((group) => matchesRace(group.card.race, race));
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

    if (sort === "recent") {
      // instances are already ordered acquired_at DESC by
      // fetchOwnedCollection's own query, so instances[0] is always
      // this group's most recently acquired copy - no extra sort
      // work or extra query needed here.
      const aRecent = a.instances[0]?.acquired_at ?? "";
      const bRecent = b.instances[0]?.acquired_at ?? "";
      if (bRecent !== aRecent) {
        return bRecent.localeCompare(aRecent);
      }
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
    section: query.get("section") ?? undefined,
    attribute: query.get("attribute") ?? undefined,
    race: query.get("race") ?? undefined,
    availability: query.get("availability") ?? undefined,
    forTrade: query.get("forTrade") === "1",
    sort: query.get("sort") ?? undefined,
  };
}

// =========================================================
// COLLECTION 2.0 - grouping (Archetype / Type / Rarity)
//
// Pure, synchronous, operates on an already-fetched (and already
// filtered/sorted) GroupedOwnedCard[] - a player's own unique-owned-
// card list, bounded by their real collection size, never the full
// catalog. No extra query: archetype/card_type/game_rarity are
// already present on every card from fetchOwnedCollection's single
// batched card_catalog fetch.
// =========================================================

export type CollectionGroupBy = "" | "archetype" | "type" | "rarity";

export type CollectionGroupBucket = {
  key: string;
  label: string;
  cards: GroupedOwnedCard[];
  ownedTotal: number;
  distinctCount: number;
};

const GENERIC_OTHER_KEY = "__generic_other__";
const GENERIC_OTHER_LABEL = "Generic / Other";

/**
 * Groups by REAL archetype metadata only (card_catalog.archetype) -
 * deliberately never a name-substring guess, per the explicit product
 * requirement. Cards with no archetype land in a single, clearly
 * labeled "Generic / Other" bucket rather than being scattered or
 * dropped. Buckets are sorted by total owned copies desc (the biggest
 * part of a player's collection first), with Generic / Other always
 * last regardless of size, since it's a catch-all rather than a real
 * archetype a player is "collecting".
 */
function groupByArchetype(cards: GroupedOwnedCard[]): CollectionGroupBucket[] {
  const buckets = new Map<string, CollectionGroupBucket>();

  for (const group of cards) {
    const archetype = group.card.archetype?.trim();
    const key = archetype ? archetype : GENERIC_OTHER_KEY;
    const label = archetype ? archetype : GENERIC_OTHER_LABEL;

    const bucket = buckets.get(key) ?? {
      key,
      label,
      cards: [],
      ownedTotal: 0,
      distinctCount: 0,
    };

    bucket.cards.push(group);
    bucket.ownedTotal += group.quantity;
    bucket.distinctCount += 1;
    buckets.set(key, bucket);
  }

  const result = Array.from(buckets.values());
  result.sort((a, b) => {
    if (a.key === GENERIC_OTHER_KEY) return 1;
    if (b.key === GENERIC_OTHER_KEY) return -1;
    if (b.ownedTotal !== a.ownedTotal) return b.ownedTotal - a.ownedTotal;
    return a.label.localeCompare(b.label);
  });

  return result;
}

function groupByType(cards: GroupedOwnedCard[]): CollectionGroupBucket[] {
  const order = ["Monster", "Spell", "Trap", "Other"];
  const buckets = new Map<string, CollectionGroupBucket>();

  for (const group of cards) {
    const normalized = group.card.card_type.toLowerCase();
    const label = normalized.includes("monster")
      ? "Monster"
      : normalized.includes("spell")
        ? "Spell"
        : normalized.includes("trap")
          ? "Trap"
          : "Other";

    const bucket = buckets.get(label) ?? {
      key: label,
      label,
      cards: [],
      ownedTotal: 0,
      distinctCount: 0,
    };

    bucket.cards.push(group);
    bucket.ownedTotal += group.quantity;
    bucket.distinctCount += 1;
    buckets.set(label, bucket);
  }

  return Array.from(buckets.values()).sort(
    (a, b) => order.indexOf(a.key) - order.indexOf(b.key)
  );
}

function groupByRarity(cards: GroupedOwnedCard[]): CollectionGroupBucket[] {
  const buckets = new Map<string, CollectionGroupBucket>();

  for (const group of cards) {
    const label = group.card.game_rarity ?? "Not Rated";

    const bucket = buckets.get(label) ?? {
      key: label,
      label,
      cards: [],
      ownedTotal: 0,
      distinctCount: 0,
    };

    bucket.cards.push(group);
    bucket.ownedTotal += group.quantity;
    bucket.distinctCount += 1;
    buckets.set(label, bucket);
  }

  return Array.from(buckets.values()).sort(
    (a, b) => (rarityOrder[b.key] ?? -1) - (rarityOrder[a.key] ?? -1)
  );
}

export function groupCollection(
  cards: GroupedOwnedCard[],
  groupBy: CollectionGroupBy
): CollectionGroupBucket[] | null {
  if (groupBy === "archetype") return groupByArchetype(cards);
  if (groupBy === "type") return groupByType(cards);
  if (groupBy === "rarity") return groupByRarity(cards);
  return null;
}

// =========================================================
// PAGING (2026-10-12) - a big collection (1,800+ copies, 1,000+
// unique cards) rendered every tile in one response (10 MB HTML,
// 15+ s). The full list is still fetched and filtered/sorted (stats,
// "Wanted from you" and Card Detail's Previous/Next need it), but
// only one page of tiles is rendered.
//
// In the grouped view the page is a slice of the buckets flattened
// in display order, so bucket order stays the same and each bucket
// keeps its real (whole-collection) distinct/owned totals.
// =========================================================

export const COLLECTION_PAGE_SIZE = 60;

export type CollectionPage = {
  page: number;
  pageCount: number;
  cards: GroupedOwnedCard[];
  buckets: CollectionGroupBucket[] | null;
};

export function paginateCollection(
  cards: GroupedOwnedCard[],
  buckets: CollectionGroupBucket[] | null,
  requestedPage: number,
  pageSize = COLLECTION_PAGE_SIZE
): CollectionPage {
  const pageCount = Math.max(1, Math.ceil(cards.length / pageSize));
  const page = Math.min(
    pageCount,
    Math.max(1, Math.floor(Number.isFinite(requestedPage) ? requestedPage : 1))
  );
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  if (!buckets) {
    return {
      page,
      pageCount,
      cards: cards.slice(start, end),
      buckets: null,
    };
  }

  const pageBuckets: CollectionGroupBucket[] = [];
  let offset = 0;

  for (const bucket of buckets) {
    const bucketStart = offset;
    const bucketEnd = offset + bucket.cards.length;

    offset = bucketEnd;

    if (bucketEnd <= start || bucketStart >= end) {
      continue;
    }

    pageBuckets.push({
      ...bucket,
      cards: bucket.cards.slice(
        Math.max(0, start - bucketStart),
        Math.min(bucket.cards.length, end - bucketStart)
      ),
    });
  }

  return {
    page,
    pageCount,
    cards: pageBuckets.flatMap((bucket) => bucket.cards),
    buckets: pageBuckets,
  };
}
