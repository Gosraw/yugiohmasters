import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  generateSynergyCandidates,
  groupSynergyCandidatesByOwnership,
  type SynergyCatalogCard,
} from "@/lib/ai/card-synergy-candidates";

import {
  explainSynergyCandidates,
  type SynergyExplanation,
} from "@/lib/ai/card-synergy";

// =========================================================
// CARD SYNERGY CONTEXT - server-side orchestration
//
// Wires the pure card-synergy-candidates.ts / card-synergy.ts
// modules to real Supabase data: fetches the target card, a
// candidate pool from card_catalog (lean columns only - never
// `select *`, never the whole catalog shipped to the browser, this
// stays entirely server-side), and the viewing player's owned-copy
// counts for collection-aware ranking.
//
// CACHING: a small in-memory, best-effort, per-server-instance
// cache keyed on card_catalog_id (+ owner, since "owned" framing is
// per-player) - avoids re-running candidate generation and, more
// importantly, re-calling the AI provider on every render of the
// same card within a short window. This is NOT a durable/shared
// cache (a serverless cold start or a second instance won't see
// it) - same tradeoff Boss Companion's in-memory rate limiter
// already makes in this codebase, acceptable for a friends-league
// app at this scale. A real persistent cache (keyed on
// card_catalog_id + card-data version, per the product spec) is a
// documented follow-up, not built this session.
// =========================================================

export type CardSynergyInsight = {
  cardId: string;
  cardName: string;
  ownedSuggestions: SynergyInsightSuggestion[];
  otherSuggestions: SynergyInsightSuggestion[];
};

export type SynergyInsightSuggestion = SynergyExplanation & {
  ownedCount: number;
  masterDuelNote: string | null;
};

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<
  string,
  { expiresAt: number; data: CardSynergyInsight }
>();

function cacheKey(cardId: string, userId: string): string {
  return `${cardId}::${userId}`;
}

function readCache(key: string): CardSynergyInsight | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function writeCache(key: string, data: CardSynergyInsight): void {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data });

  // Same "don't grow forever in a long-lived process" guard used by
  // Boss Companion's rate limiter map.
  if (cache.size > 2000) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiresAt < now) cache.delete(k);
    }
  }
}

const CATALOG_COLUMNS =
  "id,name,card_type,monster_type,attribute,archetype,level,rank,link_rating,atk,def,description,master_duel_status,image_url,game_rarity";

/**
 * Builds (or returns the cached) synergy insight for one card, for
 * one viewing player. Returns `null` only when the target card
 * itself can't be found - every other failure mode (candidate pool
 * fetch error, AI provider failure) degrades gracefully rather than
 * throwing, consistent with "card insights temporarily unavailable"
 * being the worst-case UX, never a broken card detail page.
 */
export async function getCardSynergyInsight(
  supabase: SupabaseClient,
  userId: string,
  cardId: string
): Promise<CardSynergyInsight | null> {
  const key = cacheKey(cardId, userId);
  const cached = readCache(key);
  if (cached) return cached;

  const { data: targetRow, error: targetError } = await supabase
    .from("card_catalog")
    .select(CATALOG_COLUMNS)
    .eq("id", cardId)
    .single();

  if (targetError || !targetRow) {
    return null;
  }

  const target = targetRow as SynergyCatalogCard;

  // Candidate pool: the rest of the catalog, lean columns only.
  // Computation (mechanic-tag extraction + scoring) is pure,
  // synchronous, and happens entirely server-side - nothing here
  // reaches the browser except the final top-3 suggestions.
  const { data: poolRows, error: poolError } = await supabase
    .from("card_catalog")
    .select(CATALOG_COLUMNS)
    .neq("id", cardId);

  const pool = poolError ? [] : ((poolRows ?? []) as SynergyCatalogCard[]);

  // Owned-copy counts for this player, for collection-aware
  // ranking - never another player's collection data.
  const { data: ownedRows } = await supabase
    .from("card_instances")
    .select("card_catalog_id")
    .eq("current_owner_id", userId);

  const ownedCounts = new Map<string, number>();
  for (const row of (ownedRows ?? []) as { card_catalog_id: string }[]) {
    ownedCounts.set(
      row.card_catalog_id,
      (ownedCounts.get(row.card_catalog_id) ?? 0) + 1
    );
  }

  const candidates = generateSynergyCandidates(target, pool, {
    ownedCounts,
    limit: 20,
  });

  const { owned, other } = groupSynergyCandidatesByOwnership(candidates);

  // Collection-aware priority: "BEST SYNERGY YOU OWN" first, then
  // "OTHER GOOD SYNERGIES" - only the combined top 3 ever reach the
  // AI explanation layer, owned candidates preferred.
  const topOwned = owned.slice(0, 3);
  const remainingSlots = Math.max(0, 3 - topOwned.length);
  const topOther = other.slice(0, remainingSlots);

  const [ownedExplanations, otherExplanations] = await Promise.all([
    explainSynergyCandidates(target, topOwned, topOwned.length),
    explainSynergyCandidates(target, topOther, topOther.length),
  ]);

  const toSuggestion = (
    explanations: SynergyExplanation[],
    source: typeof candidates
  ): SynergyInsightSuggestion[] =>
    explanations.map((explanation) => {
      const match = source.find((c) => c.card.id === explanation.cardId);
      return {
        ...explanation,
        ownedCount: match?.ownedCount ?? 0,
        masterDuelNote: match?.masterDuelNote ?? null,
      };
    });

  const insight: CardSynergyInsight = {
    cardId: target.id,
    cardName: target.name,
    ownedSuggestions: toSuggestion(ownedExplanations, topOwned),
    otherSuggestions: toSuggestion(otherExplanations, topOther),
  };

  writeCache(key, insight);

  return insight;
}
