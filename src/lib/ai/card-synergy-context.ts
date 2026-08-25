import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  deriveConfidence,
  generateSynergyCandidates,
  type PrecomputedEdgeReason,
  type SynergyCandidate,
  type SynergyCatalogCard,
  type SynergyConfidence,
} from "@/lib/ai/card-synergy-candidates";

import {
  explainSynergyCandidates,
  type SynergyExplanation,
} from "@/lib/ai/card-synergy";

import {
  computeSynergyEdges,
  type CardMechanicsProfile,
} from "@/lib/synergy";

import {
  getLeagueIdForUser,
} from "@/lib/league-stats";

import {
  batchGetCardAvailability,
  splitCandidatesByAvailability,
  type CardAvailability,
} from "@/lib/ai/ownership-intelligence";

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
// OWNED_CANDIDATE_SUPPLEMENT (2026-08-25, Track B redesign): GY
// setup/payoff, discard outlet/payoff, and banish setup/payoff
// relationships (edge types gy_setup_for/discard_payoff_for/
// banish_payoff_for) are NO LONGER precomputed catalog-wide by
// scripts/compute-synergy-graph.mjs - materializing those as a full
// (tag-bucket x tag-bucket) cross product is the confirmed root
// cause of the earlier 1,461,604-row card_synergy_edges incident
// (see that script's header). They are still real, still useful, and
// still fully deterministic - they are just no longer persisted for
// every card in the catalog against every other card.
//
// Instead, getCardSynergyInsight() below evaluates them CONTEXTUALLY,
// on demand, against ONLY the small set of cards the viewing player
// actually owns (never the full ~14k-row catalog): it fetches this
// player's owned card ids (a query already needed for the "Owned x3"
// badge - see ownedCardIds below), reads their card_mechanics rows
// (one bounded IN-clause query, capped at
// OWNED_CANDIDATE_SUPPLEMENT_CAP ids) plus the target card's own
// card_mechanics row, and calls the exact same computeSynergyEdges()
// the precompute script uses (via src/lib/synergy/index.ts, re-
// exporting lib/synergy-engine.mjs - one source of truth for the
// actual edge logic). Only the three edge types above are merged in
// this way; named-reference types (searches/material_supply_named/
// requirement_satisfies) are already exhaustively and cheaply
// persisted by Pass A of the precompute script, so recomputing them
// live would be redundant.
//
// This keeps the "never scan the catalog" and "no huge materialized
// graph" requirements intact while restoring exactly the detection
// power the removed passes provided, scoped to what actually matters
// for THIS player's card coach - their own collection.
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

// =========================================================
// PHASE 3 - COACH MODES
//
// The single "owned vs other" split from Phase 1/2 is now three
// explicitly separate modes, per the product spec:
//   - myCards: candidates the viewer actually owns. NEVER contains a
//     card the viewer doesn't own - this is a hard invariant, tested
//     in card-synergy-context.test.ts.
//   - discover: candidates nobody in the viewer's league owns yet.
//   - tradeTargets: candidates another league member owns (annotated
//     with who, via the Phase 2 ownership-intelligence module) -
//     never mixed into myCards or discover.
// Ownership is now resolved through the same batched, league-scoped
// classifyCardAvailability/batchGetCardAvailability used by Phase 2's
// ownership-intelligence.ts (ONE extra card_instances query + ONE
// reused profile lookup for the whole candidate pool, never N+1),
// rather than the flatter unscoped ownedCounts map alone - that map
// is kept ONLY for the "Owned x3" copy-count badge, ownership
// classification itself is now league-aware and authoritative.
// =========================================================

export type CardSynergyInsight = {
  cardId: string;
  cardName: string;
  myCards: SynergyInsightSuggestion[];
  discover: SynergyInsightSuggestion[];
  tradeTargets: SynergyInsightSuggestion[];
  // Owned 2/3-card packages: this card plus two candidates from
  // myCards that ALSO relate to each other (a real triangle in the
  // precomputed synergy graph, not just two cards that each happen
  // to relate to the target). Empty when the graph hasn't surfaced
  // one - never fabricated.
  packages: SynergyPackage[];
  // false only when the precomputed synergy graph has literally no
  // card_synergy_edges rows touching this card at all - i.e. the
  // precompute script has not been run yet (or this specific card
  // hasn't been picked up by it), NOT "the engine looked and found
  // nothing". The UI uses this to show an honest "not yet analyzed"
  // message instead of implying a real negative result.
  graphComputed: boolean;
};

export type SynergyPackage = {
  cardIds: string[];
  cardNames: string[];
  reason: string;
};

export type SynergyInsightSuggestion = SynergyExplanation & {
  ownedCount: number;
  masterDuelNote: string | null;
  confidence: SynergyConfidence;
  // Structured evidence backing this suggestion - the deterministic
  // reasons the AI explanation (if any) was allowed to paraphrase.
  // The UI shows these behind an expandable "evidence" disclosure,
  // never as the primary copy.
  evidence: string[];
  // Present only for tradeTargets: who in the league owns it.
  owners?: { profileId: string; name: string; count: number }[];
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
 * Looks for a real triangle in the precomputed synergy graph among a
 * small set of owned candidates: does candidate A also relate to
 * candidate B (not just each separately relating to `target`)? One
 * bounded query - `ownedIds` is capped by the caller to a handful of
 * ids, so this is never a scan, and the IN/IN filter means the result
 * set itself is naturally small too. Returns at most 2 packages (more
 * would be noise on a card detail panel, not a useful "package" call-
 * out).
 */
async function findOwnedPackages(
  supabase: SupabaseClient,
  target: SynergyCatalogCard,
  ownedCandidates: SynergyCandidate[]
): Promise<SynergyPackage[]> {
  if (ownedCandidates.length < 2) return [];

  const ownedIds = ownedCandidates.map((c) => c.card.id);
  const nameById = new Map(ownedCandidates.map((c) => [c.card.id, c.card.name]));

  const { data, error } = await supabase
    .from("card_synergy_edges")
    .select("source_card_id,target_card_id,deterministic_reason")
    .in("source_card_id", ownedIds)
    .in("target_card_id", ownedIds)
    .limit(10);

  if (error || !data || data.length === 0) return [];

  const seen = new Set<string>();
  const packages: SynergyPackage[] = [];

  for (const row of data as {
    source_card_id: string;
    target_card_id: string;
    deterministic_reason: string;
  }[]) {
    if (row.source_card_id === row.target_card_id) continue;

    const pairKey = [row.source_card_id, row.target_card_id].sort().join("|");
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);

    const aName = nameById.get(row.source_card_id);
    const bName = nameById.get(row.target_card_id);
    if (!aName || !bName) continue;

    packages.push({
      cardIds: [target.id, row.source_card_id, row.target_card_id],
      cardNames: [target.name, aName, bName],
      reason: row.deterministic_reason,
    });

    if (packages.length >= 2) break;
  }

  return packages;
}

// Hard cap on how many of the player's own owned card ids are ever
// fed into the contextual supplement below - defensive, in case a
// single player's collection somehow grows very large. A friends-
// league collection is nowhere near this in practice, but the cap
// keeps the per-request cost bounded regardless.
const OWNED_CANDIDATE_SUPPLEMENT_CAP = 150;

// Edge types this contextual supplement exists to restore - the ones
// scripts/compute-synergy-graph.mjs intentionally no longer persists
// catalog-wide (see that file's header and the OWNED_CANDIDATE_
// SUPPLEMENT comment above).
const CONTEXTUAL_SUPPLEMENT_EDGE_TYPES = new Set([
  "gy_setup_for",
  "discard_payoff_for",
  "banish_payoff_for",
]);

function mechRowToProfile(row: {
  card_catalog_id: string;
  tags: string[] | null;
  search_targets: string[] | null;
  named_material_targets: string[] | null;
  named_requirement_targets: string[] | null;
  material_specificity: string | null;
  material_text: string | null;
  evidence: Record<string, unknown> | null;
  engine_version: string;
}): CardMechanicsProfile {
  return {
    cardId: row.card_catalog_id,
    tags: (row.tags ?? []) as CardMechanicsProfile["tags"],
    searchTargets: row.search_targets ?? [],
    namedMaterialTargets: row.named_material_targets ?? [],
    namedRequirementTargets: row.named_requirement_targets ?? [],
    materialSpecificity:
      (row.material_specificity as CardMechanicsProfile["materialSpecificity"]) ?? null,
    materialText: row.material_text ?? null,
    evidence: (row.evidence ??
      {
        classifiedRefs: [],
        isExtraDeckCard: false,
        extraDeckKind: { fusion: false, synchro: false, xyz: false, link: false, pendulum: false },
        scores: { power: 0, accessibility: 0, dependency: 0, genericUtility: 0, floor: 0, ceiling: 0, draftValue: 0 },
      }) as CardMechanicsProfile["evidence"],
    engineVersion: row.engine_version,
  };
}

/**
 * Restores gy_setup_for/discard_payoff_for/banish_payoff_for
 * detection - intentionally no longer persisted catalog-wide (see
 * the OWNED_CANDIDATE_SUPPLEMENT comment block above) - by evaluating
 * them live, deterministically, against only the player's own owned
 * cards. Mutates `edgesByCandidateId` in place, adding an entry only
 * when a candidate doesn't already carry that edge type from the
 * persisted graph. Every failure mode here (missing card_mechanics
 * rows, a query error) is a silent no-op - this is a supplement, and
 * its absence must never break the rest of the insight.
 */
async function supplementWithOwnedContextualEdges(
  supabase: SupabaseClient,
  target: SynergyCatalogCard,
  ownedCardIds: string[],
  edgesByCandidateId: Map<string, PrecomputedEdgeReason[]>
): Promise<void> {
  const candidateIds = ownedCardIds
    .filter((id) => id !== target.id)
    .slice(0, OWNED_CANDIDATE_SUPPLEMENT_CAP);
  if (candidateIds.length === 0) return;

  const { data: mechRows, error: mechError } = await supabase
    .from("card_mechanics")
    .select(
      "card_catalog_id,tags,search_targets,named_material_targets,named_requirement_targets,material_specificity,material_text,evidence,engine_version"
    )
    .in("card_catalog_id", [target.id, ...candidateIds]);

  if (mechError || !mechRows || mechRows.length === 0) return;

  const targetRow = mechRows.find((r) => r.card_catalog_id === target.id);
  if (!targetRow) return;

  const candidateMechRows = mechRows.filter((r) => r.card_catalog_id !== target.id);
  if (candidateMechRows.length === 0) return;

  const { data: candidateCatalogRows, error: catalogError } = await supabase
    .from("card_catalog")
    .select(CATALOG_COLUMNS)
    .in(
      "id",
      candidateMechRows.map((r) => r.card_catalog_id)
    );
  if (catalogError || !candidateCatalogRows) return;

  const catalogById = new Map(
    (candidateCatalogRows as SynergyCatalogCard[]).map((c) => [c.id, c])
  );

  const targetMech = mechRowToProfile(targetRow);

  for (const row of candidateMechRows) {
    const candidateCard = catalogById.get(row.card_catalog_id);
    if (!candidateCard) continue;
    const candidateMech = mechRowToProfile(row);

    let edges: ReturnType<typeof computeSynergyEdges>;
    try {
      edges = computeSynergyEdges(target, targetMech, candidateCard, candidateMech);
    } catch {
      continue;
    }

    for (const edge of edges) {
      if (!CONTEXTUAL_SUPPLEMENT_EDGE_TYPES.has(edge.edgeType)) continue;

      const otherCardId =
        edge.sourceCardId === target.id ? edge.targetCardId : edge.sourceCardId;
      if (otherCardId !== row.card_catalog_id) continue;

      const list = edgesByCandidateId.get(otherCardId) ?? [];
      if (list.some((e) => e.edgeType === edge.edgeType)) continue;

      list.push({
        edgeType: edge.edgeType,
        score: edge.score,
        confidence: edge.confidence,
        deterministicReason: edge.deterministicReason,
      });
      edgesByCandidateId.set(otherCardId, list);
    }
  }
}

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

  // "Has the precompute graph actually been run for this card at
  // all" must be judged from the PERSISTED graph only, before the
  // contextual owned-card supplement below adds anything - otherwise
  // a card the precompute script has never touched would still show
  // as "analyzed" just because the viewer happens to own a card that
  // GY/discard/banish-pairs with it.
  const graphComputed = edgesByCandidateId.size > 0;

  // Owned-copy counts for this player (ANY league, purely for the
  // "Owned x3" copy-count badge) - never another player's collection
  // data. This is deliberately separate from the league-scoped
  // ownership CLASSIFICATION below, which decides myCards/discover/
  // tradeTargets membership. Also doubles as the bounded candidate
  // set for the contextual GY/discard/banish supplement below - this
  // player's own collection, never the full catalog.
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
  const ownedCardIds = Array.from(ownedCounts.keys());

  // See the OWNED_CANDIDATE_SUPPLEMENT comment block near the top of
  // this file: restores gy_setup_for/discard_payoff_for/
  // banish_payoff_for detection against this player's owned cards,
  // now that those types are no longer persisted catalog-wide.
  // Mutates edgesByCandidateId in place; a no-op if the player owns
  // nothing yet or the target has no card_mechanics row.
  if (ownedCardIds.length > 0) {
    await supplementWithOwnedContextualEdges(
      supabase,
      target,
      ownedCardIds,
      edgesByCandidateId
    );
  }

  const candidateIds = Array.from(edgesByCandidateId.keys());

  let pool: SynergyCatalogCard[] = [];
  if (candidateIds.length > 0) {
    const { data: poolRows, error: poolError } = await supabase
      .from("card_catalog")
      .select(CATALOG_COLUMNS)
      .in("id", candidateIds);

    pool = poolError ? [] : ((poolRows ?? []) as SynergyCatalogCard[]);
  }

  const candidates = generateSynergyCandidates(target, pool, {
    ownedCounts,
    limit: 20,
    precomputedEdges: edgesByCandidateId,
  });

  // ---- Ownership-aware classification (Section 1/2 of the Phase 3
  // spec) - ONE batched card_instances query + ONE reused league-
  // profile lookup for the ENTIRE candidate pool (batchGetCardAvailability,
  // see ownership-intelligence.ts), never one query per candidate. A
  // candidate already passed generateSynergyCandidates' own Master
  // Duel eligibility filter, so `formatEligible` is always true here -
  // format exclusion for THIS feature already happened upstream; this
  // call's real job is the owned/league-member/nobody split, not
  // re-deciding eligibility. ----
  const leagueId = await getLeagueIdForUser(supabase, userId);

  let availabilityByCardId = new Map<string, CardAvailability>();
  if (leagueId && candidates.length > 0) {
    availabilityByCardId = await batchGetCardAvailability(
      supabase,
      leagueId,
      userId,
      candidates.map((c) => ({ id: c.card.id, formatEligible: true }))
    );
  }

  const { owned, tradeTargets, discovery } = splitCandidatesByAvailability(
    candidates,
    availabilityByCardId
  );

  // No league yet (a brand-new profile) - fall back to the simple
  // owned/unowned split from ownedCounts alone, since there is no
  // league to classify trade targets within. myCards must still never
  // contain an unowned card in this fallback.
  const myCardsSource =
    leagueId != null ? owned : candidates.filter((c) => c.ownedCount > 0);
  const discoverSource =
    leagueId != null ? discovery : candidates.filter((c) => c.ownedCount === 0);
  const tradeTargetsSource = leagueId != null ? tradeTargets : [];

  // Collection-aware priority, bounded per mode so the AI layer only
  // ever sees a small top-N (Section 10 performance requirement) -
  // myCards gets the largest allotment since "what can I already do"
  // is the highest-value mode.
  const topMyCards = myCardsSource.slice(0, 3);
  const topDiscover = discoverSource.slice(0, 2);
  const topTradeTargets = tradeTargetsSource.slice(0, 2);

  const [myCardsExplanations, discoverExplanations, tradeExplanations] =
    await Promise.all([
      explainSynergyCandidates(target, topMyCards, topMyCards.length),
      explainSynergyCandidates(target, topDiscover, topDiscover.length),
      explainSynergyCandidates(target, topTradeTargets, topTradeTargets.length),
    ]);

  const toSuggestion = (
    explanations: SynergyExplanation[],
    source: SynergyCandidate[]
  ): SynergyInsightSuggestion[] =>
    explanations.map((explanation) => {
      const match = source.find((c) => c.card.id === explanation.cardId);
      const availability = availabilityByCardId.get(explanation.cardId);
      return {
        ...explanation,
        ownedCount: match?.ownedCount ?? 0,
        masterDuelNote: match?.masterDuelNote ?? null,
        confidence: match ? deriveConfidence(match) : "low",
        evidence: match?.reasons.map((r) => r.detail) ?? [],
        owners: availability?.owners,
      };
    });

  // ---- Owned 2/3-card packages ----
  // Among the (small, already-ranked) myCards pool, check whether any
  // TWO of them also relate to each other in the precomputed synergy
  // graph - a real triangle (target + A + B), not a coincidence of
  // each separately relating to the target. One small, bounded,
  // indexed query (never more than ~6 candidate ids on either side).
  const packages = await findOwnedPackages(
    supabase,
    target,
    myCardsSource.slice(0, 6)
  );

  const insight: CardSynergyInsight = {
    cardId: target.id,
    cardName: target.name,
    myCards: toSuggestion(myCardsExplanations, topMyCards),
    discover: toSuggestion(discoverExplanations, topDiscover),
    tradeTargets: toSuggestion(tradeExplanations, topTradeTargets),
    packages,
    graphComputed,
  };

  writeCache(key, insight);

  return insight;
}
