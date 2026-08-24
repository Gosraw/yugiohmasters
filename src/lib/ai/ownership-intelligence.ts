import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  getLeagueProfiles,
  type StatsProfile,
} from "@/lib/league-stats";

// =========================================================
// OWNERSHIP-AWARE INTELLIGENCE
//
// Reusable, batched ownership classification for a set of candidate
// cards (typically the pool produced by the precomputed synergy
// graph, see card-synergy-context.ts), scoped to ONE league and ONE
// viewing player. This is the "who actually has this card" layer the
// product spec calls for: OWNED mode may only ever surface cards the
// viewer actually owns; DISCOVERY/TRADE mode needs to say WHY a card
// isn't already in the player's hands (another league member owns
// it - a trade candidate; nobody in the league owns it yet; or it
// isn't legal in the current format at all).
//
// PERFORMANCE: exactly ONE card_instances query (scoped to the
// league, filtered to the candidate id list) and ONE league-profile
// lookup (already-existing, reused from league-stats.ts), regardless
// of how many candidates are being classified - never one query per
// candidate. Both grouping and classification happen in plain JS
// against the already-fetched rows. Callers that already have
// card_catalog rows for the candidates (e.g. card-synergy-context.ts,
// which fetches them anyway) pass `formatEligible` straight through -
// this module never re-fetches card_catalog itself.
//
// PRIVACY: only ownership WITHIN the viewer's own league is ever
// surfaced (mirrors the existing trade-binder precedent - see
// trades/binder/[playerId]/page.tsx - where viewing another league
// member's collection is already a supported, intended feature of
// this app). A card owned by someone outside the league, or by
// nobody at all, is never distinguishable from "unowned" here - this
// module has no way to see outside its own leagueId scope, by
// construction (the batched query is always `.eq("league_id", ...)`).
// =========================================================

export type CardAvailabilityStatus =
  | "owned_by_you"
  | "owned_by_league_member"
  | "unowned_in_league"
  | "format_ineligible";

export type TradeOwner = {
  profileId: string;
  name: string;
  count: number;
};

export type CardAvailability = {
  status: CardAvailabilityStatus;
  ownedCountByYou: number;
  // Other league members who own at least one copy - empty unless
  // status === "owned_by_league_member". Sorted by count desc then
  // name, so the biggest trade opportunity surfaces first.
  owners: TradeOwner[];
};

export type AvailabilityCandidate = {
  id: string;
  formatEligible: boolean;
};

function displayName(profile: StatsProfile): string {
  return profile.duelist_name || profile.username || "Unknown Duelist";
}

/**
 * Pure classification for ONE candidate card, given the full set of
 * card_instances rows already scoped to this league. No I/O - safe
 * to unit test directly with synthetic fixtures (see
 * ownership-intelligence.regression.test.mjs... actually .test.ts,
 * this module is TypeScript so its tests live alongside it as a
 * vitest suite, consistent with card-synergy.test.ts).
 */
export function classifyCardAvailability(
  candidate: AvailabilityCandidate,
  instancesInLeague: { current_owner_id: string }[],
  viewerUserId: string,
  profilesById: Map<string, StatsProfile>
): CardAvailability {
  // Format ineligibility is checked FIRST and wins regardless of who
  // owns the card - an ineligible card must never surface as a
  // normal owned/discovery suggestion (explicit product requirement),
  // even if the viewer happens to physically own a copy of it.
  if (!candidate.formatEligible) {
    return {
      status: "format_ineligible",
      ownedCountByYou: instancesInLeague.filter(
        (i) => i.current_owner_id === viewerUserId
      ).length,
      owners: [],
    };
  }

  const ownedCountByYou = instancesInLeague.filter(
    (i) => i.current_owner_id === viewerUserId
  ).length;

  if (ownedCountByYou > 0) {
    return {
      status: "owned_by_you",
      ownedCountByYou,
      owners: [],
    };
  }

  const countByOwner = new Map<string, number>();
  for (const instance of instancesInLeague) {
    if (instance.current_owner_id === viewerUserId) continue;
    countByOwner.set(
      instance.current_owner_id,
      (countByOwner.get(instance.current_owner_id) ?? 0) + 1
    );
  }

  if (countByOwner.size === 0) {
    return {
      status: "unowned_in_league",
      ownedCountByYou: 0,
      owners: [],
    };
  }

  const owners: TradeOwner[] = Array.from(countByOwner.entries())
    .map(([profileId, count]) => ({
      profileId,
      name: profilesById.get(profileId)
        ? displayName(profilesById.get(profileId)!)
        : "A league member",
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    status: "owned_by_league_member",
    ownedCountByYou: 0,
    owners,
  };
}

/**
 * Batched I/O: one card_instances query (league-scoped, id-list
 * filtered) + one league-profile lookup, then pure classification
 * per candidate. Safe to call with a large candidate list - it is
 * bounded by the caller's own candidate pool (e.g. the ~20-60 cards
 * the precomputed synergy graph already narrowed things down to),
 * never the full catalog.
 */
export async function batchGetCardAvailability(
  supabase: SupabaseClient,
  leagueId: string,
  viewerUserId: string,
  candidates: AvailabilityCandidate[]
): Promise<Map<string, CardAvailability>> {
  const result = new Map<string, CardAvailability>();

  if (candidates.length === 0) {
    return result;
  }

  const candidateIds = candidates.map((c) => c.id);

  const [{ data: instanceRows, error: instanceError }, profiles] =
    await Promise.all([
      supabase
        .from("card_instances")
        .select("card_catalog_id,current_owner_id")
        .eq("league_id", leagueId)
        .in("card_catalog_id", candidateIds),
      getLeagueProfiles(supabase, leagueId).catch(() => [] as StatsProfile[]),
    ]);

  const instancesByCard = new Map<
    string,
    { current_owner_id: string }[]
  >();

  if (!instanceError) {
    for (const row of (instanceRows ?? []) as {
      card_catalog_id: string;
      current_owner_id: string;
    }[]) {
      const list = instancesByCard.get(row.card_catalog_id) ?? [];
      list.push({ current_owner_id: row.current_owner_id });
      instancesByCard.set(row.card_catalog_id, list);
    }
  }

  const profilesById = new Map(profiles.map((p) => [p.id, p]));

  for (const candidate of candidates) {
    result.set(
      candidate.id,
      classifyCardAvailability(
        candidate,
        instancesByCard.get(candidate.id) ?? [],
        viewerUserId,
        profilesById
      )
    );
  }

  return result;
}

/**
 * Splits a ranked candidate list (anything shaped `{ card: { id } }`,
 * matching SynergyCandidate from card-synergy-candidates.ts) into the
 * three explicitly-separate result sets the product spec requires:
 *   - owned: cards the viewer actually owns - the ONLY set a caller
 *     building "recommend from my own cards" UI should ever read from.
 *   - tradeTargets: cards owned by another league member - annotated
 *     with who owns them, ready for a "might be worth a trade" UI.
 *   - discovery: cards nobody in the league owns yet.
 * format_ineligible candidates are dropped from all three buckets
 * entirely - never surfaced as a normal suggestion of any kind.
 */
export function splitCandidatesByAvailability<T extends { card: { id: string } }>(
  candidates: T[],
  availabilityMap: Map<string, CardAvailability>
): {
  owned: T[];
  tradeTargets: (T & { availability: CardAvailability })[];
  discovery: T[];
} {
  const owned: T[] = [];
  const tradeTargets: (T & { availability: CardAvailability })[] = [];
  const discovery: T[] = [];

  for (const candidate of candidates) {
    const availability = availabilityMap.get(candidate.card.id);
    if (!availability) continue;

    switch (availability.status) {
      case "format_ineligible":
        continue;
      case "owned_by_you":
        owned.push(candidate);
        break;
      case "owned_by_league_member":
        tradeTargets.push({ ...candidate, availability });
        break;
      case "unowned_in_league":
        discovery.push(candidate);
        break;
    }
  }

  return { owned, tradeTargets, discovery };
}
