import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  generateSynergyCandidates,
  groupSynergyCandidatesByOwnership,
  type PrecomputedEdgeReason,
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
// candidate pool, and the viewing player's owned-copy counts for
// collection-aware ranking.
//
// FIXED (2026-08-24): the candidate pool used to be `.neq("id",
// cardId)` against the FULL card_catalog table (~14k rows, every
// uncached request) - a direct violation of the "no request-time
// scan of the full catalog" rule, found and documented in
// supabase/migrations/202608241000_card_synergy_graph.sql's header.
// The pool is now the small, precomputed, INDEXED set of cards
// card_synergy_edges already says are actually related to this one
// (source_card_id = cardId OR target_card_id = cardId, ordered by
// score, capped) - typically a few dozen rows, never the whole
// catalog. Each edge's own deterministic_reason/confidence is passed
// through as a `deep_relation` reason (see PrecomputedEdgeReason in
// card-synergy-candidates.ts) so real evidence from the deep engine
// (lib/synergy-engine.mjs) is never lost even when the shallower
// card-mechanics.ts tagger doesn't independently rediscover it.
// generateSynergyCandidates() itself is UNCHANGED and still applies
// every existing rule (Master Duel eligibility, archetype-alone
// exclusion, ownership-aware sorting) - only the size and source of
// the pool fed into it changed.
//
// GRAPH-NOT-YET-COMPUTED: card_mechanics/card_synergy_edges start
// EMPTY until an operator runs `node scripts/compute-synergy-graph.mjs
// --write` (see that script's header - it has not been run against
// the real catalog from this sandbox, no network access here). Until
// then this function returns an insight with zero suggestions and
// `graphComputed: false` for every card, which the UI shows as an
// honest "not yet analyzed" state rather than a false "no synergies
// found" - this is a disclosed, non-broken degraded state, the same
// pattern already used for the valuation engine's proposal columns.
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
  // false only when the precomputed synergy graph has literally no
  // card_synergy_edges rows touching this card at all - i.e. the
  // precompute script has not been run yet (or this specific card
  // hasn't been picked up by it), NOT "the engine looked and found
  // nothing". The UI uses this to show an honest "not yet analyzed"
  // message instead of implying a real negative result.
  graphComputed: boolean;
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

  // Candidate pool: ONLY the cards the precomputed card_synergy_edges
  // table says actually relate to this one - an indexed lookup by
  // source_card_id/target_card_id (see card_synergy_edges_source_idx/
  // card_synergy_edges_target_idx in the migration), never a full-
  // catalog scan. Edges are directional (either this card is the
  // source or the target of a real relation), so both columns are
  // checked. Capped generously above generateSynergyCandidates' own
  // limit so ranking still has real choices to sort between.
  const EDGE_QUERY_CAP = 60;

  const [{ data: outgoingEdges, error: outgoingError }, { data: incomingEdges, error: incomingError }] =
    await Promise.all([
      supabase
        .from("card_synergy_edges")
        .select("target_card_id,edge_type,score,confidence,deterministic_reason")
        .eq("source_card_id", cardId)
        .order("score", { ascending: false })
        .limit(EDGE_QUERY_CAP),
      supabase
        .from("card_synergy_edges")
        .select("source_card_id,edge_type,score,confidence,deterministic_reason")
        .eq("target_card_id", cardId)
        .order("score", { ascending: false })
        .limit(EDGE_QUERY_CAP),
    ]);

  type EdgeRow = {
    edge_type: string;
    score: number;
    confidence: "high" | "medium" | "low";
    deterministic_reason: string;
  };

  const edgesByCandidateId = new Map<string, PrecomputedEdgeReason[]>();

  const addEdge = (otherCardId: string, row: EdgeRow) => {
    const list = edgesByCandidateId.get(otherCardId) ?? [];
    list.push({
      edgeType: row.edge_type,
      score: row.score,
      confidence: row.confidence,
      deterministicReason: row.deterministic_reason,
    });
    edgesByCandidateId.set(otherCardId, list);
  };

  if (!outgoingError) {
    for (const row of (outgoingEdges ?? []) as (EdgeRow & { target_card_id: string })[]) {
      addEdge(row.target_card_id, row);
    }
  }
  if (!incomingError) {
    for (const row of (incomingEdges ?? []) as (EdgeRow & { source_card_id: string })[]) {
      addEdge(row.source_card_id, row);
    }
  }

  const graphComputed = edgesByCandidateId.size > 0;

  const candidateIds = Array.from(edgesByCandidateId.keys());

  let pool: SynergyCatalogCard[] = [];
  if (candidateIds.length > 0) {
    const { data: poolRows, error: poolError } = await supabase
      .from("card_catalog")
      .select(CATALOG_COLUMNS)
      .in("id", candidateIds);

    pool = poolError ? [] : ((poolRows ?? []) as SynergyCatalogCard[]);
  }

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
    precomputedEdges: edgesByCandidateId,
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
    graphComputed,
  };

  writeCache(key, insight);

  return insight;
}
