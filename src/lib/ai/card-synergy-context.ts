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
// LIVE_EDGE_SUPPLEMENT (2026-08-25, Track B redesign; widened
// 2026-08-27 - see the "Coach shows nothing generated" root-cause
// writeup in docs/ for the investigation this responds to):
//
// card_synergy_edges is the PERSISTED, catalog-wide precompute -
// scripts/compute-synergy-graph.mjs has never been run against real
// production data (no network access from any dev sandbox), so that
// table is confirmed EMPTY in production. Relying on it alone meant
// every mode (My Cards / Discover / Trade Targets) was structurally
// almost always empty, which is what showed up to players as a
// generic "nothing generated" result with no distinction from a real
// failure.
//
// Rather than re-attempt a catalog-wide precompute (the confirmed
// root cause of the earlier 1,461,604-row card_synergy_edges
// incident - see that script's header), this module now runs the
// SAME deterministic computeSynergyEdges() engine the precompute
// script uses (src/lib/synergy/index.ts, re-exporting
// lib/synergy-engine.mjs - one source of truth for edge logic) LIVE,
// on demand, against three small, explicitly bounded candidate pools
// - never the full ~14k-row catalog:
//
//   1. OWNED: cards the viewing player already owns (a query already
//      needed for the "Owned x3" badge - see ownedCardIds below),
//      capped at LIVE_SUPPLEMENT_CANDIDATE_CAP ids. Feeds "My Cards".
//   2. LEAGUE-OWNED: cards owned by someone else in the player's
//      league (one card_instances query scoped by league_id, capped),
//      so "Trade Targets" has real candidates to evaluate instead of
//      being permanently empty whenever the persisted graph has
//      nothing for this card. Feeds "Trade Targets" (via the existing
//      ownership classification below, which buckets a candidate as
//      a trade target purely from WHO owns it, unchanged).
//   3. ARCHETYPE-SCOPED: cards sharing the target's archetype (one
//      indexed card_catalog query on card_catalog_archetype_idx,
//      capped) - bounded by real archetype group sizes, not a scan of
//      the catalog. Feeds "Discover". Cards with no archetype get no
//      Discover candidates at all (an honest limitation, not a silent
//      scan) - see the graphComputed/attemptedLive note below.
//
// Every one of the 8 card_synergy_edges edge types is computed live
// here now (searches, material_supply_named/constrained,
// requirement_satisfies, gy_setup_for, discard_payoff_for,
// banish_payoff_for, spell_trap_support) - the earlier version of
// this supplement only restored 3 of 8, reasoning that the other 5
// were "already cheaply persisted by Pass A of the precompute
// script." That precompute has never actually run, so that
// assumption left Discover/Trade-Target/most-of-My-Cards
// structurally starved; there is no correctness reason to keep the
// narrower filter once the pool itself is already small and bounded.
// generateSynergyCandidates()'s own "archetype-alone is never a
// sufficient reason" filter still applies unchanged, so an
// archetype-scoped candidate with no OTHER real edge still gets
// excluded - this does not reintroduce "same archetype = synergy".
//
// GRAPH-NOT-YET-COMPUTED / graphComputed semantics: `graphComputed`
// used to mean strictly "the persisted precompute has rows for this
// card," which - given the precompute has never run - was false for
// nearly every card and rendered the "hasn't been analyzed yet"
// message almost universally, indistinguishable from a real failure.
// It now also turns true whenever a genuine live-computation attempt
// was made (owned/league/archetype), regardless of whether that
// attempt found anything - "we looked and found nothing" (an honest
// negative, shown as "no strong synergies found") is a materially
// different, and now far more common, outcome than "we never looked"
// (shown only when the player owns nothing related, isn't in a
// league, and the card has no archetype to search by).
//
// This keeps the "never scan the catalog" and "no huge materialized
// graph" requirements intact while restoring real detection power
// across all three modes, each still bounded to a small, explicitly
// scoped candidate pool.
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
  // true whenever this card has EITHER persisted card_synergy_edges
  // rows OR a genuine live computation was attempted against it
  // (owned cards, league-mates' cards, or an archetype-scoped pool -
  // see the LIVE_EDGE_SUPPLEMENT comment above getCardSynergyInsight).
  // false only in the narrow case where none of those angles apply at
  // all (no owned/league-relevant cards, no archetype, no persisted
  // graph) - the UI shows an honest "not enough data yet" message
  // only in that case, and "no strong synergies found" (a real
  // negative) whenever graphComputed is true but nothing surfaced.
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

const MECH_COLUMNS =
  "card_catalog_id,tags,search_targets,named_material_targets,named_requirement_targets,material_specificity,material_text,evidence,engine_version";

/**
 * Batched card_mechanics fetch -> CardMechanicsProfile map, for any
 * bounded id list. Shared by every live-edge supplement below and by
 * findOwnedPackages' live pairwise fallback, so there is exactly one
 * place that knows how to turn a card_mechanics row into a
 * CardMechanicsProfile (mechRowToProfile) and exactly one place that
 * logs a fetch failure instead of silently returning an empty map.
 */
async function fetchMechProfiles(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, CardMechanicsProfile>> {
  const map = new Map<string, CardMechanicsProfile>();
  if (ids.length === 0) return map;

  const { data, error } = await supabase
    .from("card_mechanics")
    .select(MECH_COLUMNS)
    .in("card_catalog_id", ids);

  if (error) {
    console.error("[card-synergy] card_mechanics fetch failed", {
      ids: ids.length,
      error,
    });
    return map;
  }

  for (const row of (data ?? []) as Parameters<typeof mechRowToProfile>[0][]) {
    map.set(row.card_catalog_id, mechRowToProfile(row));
  }

  return map;
}

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
  const cardById = new Map(ownedCandidates.map((c) => [c.card.id, c.card]));

  const packages: SynergyPackage[] = [];
  const seen = new Set<string>();

  // Pass 1: the persisted graph - works once (if ever) the operator
  // runs the catalog-wide precompute script.
  const { data, error } = await supabase
    .from("card_synergy_edges")
    .select("source_card_id,target_card_id,deterministic_reason")
    .in("source_card_id", ownedIds)
    .in("target_card_id", ownedIds)
    .limit(10);

  if (error) {
    console.error("[card-synergy] findOwnedPackages persisted-edge query failed", error);
  } else {
    for (const row of (data ?? []) as {
      source_card_id: string;
      target_card_id: string;
      deterministic_reason: string;
    }[]) {
      if (row.source_card_id === row.target_card_id) continue;

      const pairKey = [row.source_card_id, row.target_card_id].sort().join("|");
      if (seen.has(pairKey)) continue;

      const aName = nameById.get(row.source_card_id);
      const bName = nameById.get(row.target_card_id);
      if (!aName || !bName) continue;

      seen.add(pairKey);
      packages.push({
        cardIds: [target.id, row.source_card_id, row.target_card_id],
        cardNames: [target.name, aName, bName],
        reason: row.deterministic_reason,
      });

      if (packages.length >= 2) return packages;
    }
  }

  // Pass 2: live pairwise check among the top owned candidates. The
  // persisted graph is currently empty in production, so without
  // this an "Owned Package" callout would never appear no matter how
  // obviously two owned cards combo with each other. Bounded: at most
  // 6 owned candidates reach this function (see the call site), so
  // at most 15 pairs, each a pure in-memory computeSynergyEdges()
  // call - the only I/O is the one bounded card_mechanics fetch below.
  if (packages.length >= 2) return packages;

  const mechMap = await fetchMechProfiles(supabase, ownedIds);

  for (let i = 0; i < ownedIds.length && packages.length < 2; i++) {
    for (let j = i + 1; j < ownedIds.length && packages.length < 2; j++) {
      const idA = ownedIds[i];
      const idB = ownedIds[j];
      const pairKey = [idA, idB].sort().join("|");
      if (seen.has(pairKey)) continue;

      const mechA = mechMap.get(idA);
      const mechB = mechMap.get(idB);
      const cardA = cardById.get(idA);
      const cardB = cardById.get(idB);
      if (!mechA || !mechB || !cardA || !cardB) continue;

      let edges: ReturnType<typeof computeSynergyEdges>;
      try {
        edges = computeSynergyEdges(cardA, mechA, cardB, mechB);
      } catch (err) {
        console.error(
          `[card-synergy] findOwnedPackages live check threw for ${idA} <-> ${idB}`,
          err
        );
        continue;
      }
      if (edges.length === 0) continue;

      seen.add(pairKey);
      packages.push({
        cardIds: [target.id, idA, idB],
        cardNames: [target.name, nameById.get(idA)!, nameById.get(idB)!],
        reason: edges[0].deterministicReason,
      });
    }
  }

  return packages;
}

// Hard cap on how many candidate ids are ever fed into any one live
// edge supplement below - defensive, in case a single player's
// collection or a league's combined collection somehow grows very
// large. A friends-league app is nowhere near this in practice, but
// the cap keeps the per-request cost bounded regardless, and keeps
// this from ever becoming the "catalog-wide scan" the architecture
// explicitly forbids.
const LIVE_SUPPLEMENT_CANDIDATE_CAP = 150;

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
 * Live, deterministic edge computation between `target` and a bounded
 * candidate id list - the shared engine behind all three "LIVE_EDGE_
 * SUPPLEMENT" sources described in the header comment above (owned,
 * league-owned, archetype-scoped). Mutates `edgesByCandidateId` in
 * place, adding an entry only when a candidate doesn't already carry
 * that edge type (from the persisted graph or an earlier supplement
 * call). Computes ALL edge types (not a narrow subset) since every
 * pool this is called with is already small and bounded.
 *
 * Returns `true` if a genuine computation attempt was made (i.e.
 * there was at least one candidate id and a target card_mechanics
 * row to compare against) - used by the caller to set `graphComputed`
 * honestly even when the attempt finds nothing. A missing
 * card_mechanics row, a query error, or a computeSynergyEdges()
 * exception is logged (never silent) and degrades this one
 * supplement gracefully - it must never break the rest of the insight.
 */
async function supplementWithLiveEdges(
  supabase: SupabaseClient,
  target: SynergyCatalogCard,
  targetMech: CardMechanicsProfile | undefined,
  rawCandidateIds: string[],
  edgesByCandidateId: Map<string, PrecomputedEdgeReason[]>
): Promise<boolean> {
  const candidateIds = Array.from(
    new Set(rawCandidateIds.filter((id) => id !== target.id))
  ).slice(0, LIVE_SUPPLEMENT_CANDIDATE_CAP);

  if (candidateIds.length === 0) return false;
  if (!targetMech) {
    console.error(
      `[card-synergy] no card_mechanics row for target ${target.id}; skipping live edge supplement`
    );
    return true;
  }

  const [mechMap, { data: candidateCatalogRows, error: catalogError }] =
    await Promise.all([
      fetchMechProfiles(supabase, candidateIds),
      supabase.from("card_catalog").select(CATALOG_COLUMNS).in("id", candidateIds),
    ]);

  if (catalogError) {
    console.error("[card-synergy] candidate catalog fetch failed", catalogError);
  }

  const catalogById = new Map(
    ((candidateCatalogRows ?? []) as SynergyCatalogCard[]).map((c) => [c.id, c])
  );

  for (const candidateId of candidateIds) {
    const candidateCard = catalogById.get(candidateId);
    const candidateMech = mechMap.get(candidateId);
    if (!candidateCard || !candidateMech) continue;

    let edges: ReturnType<typeof computeSynergyEdges>;
    try {
      edges = computeSynergyEdges(target, targetMech, candidateCard, candidateMech);
    } catch (err) {
      console.error(
        `[card-synergy] computeSynergyEdges threw for ${target.id} <-> ${candidateId}`,
        err
      );
      continue;
    }

    for (const edge of edges) {
      const otherCardId =
        edge.sourceCardId === target.id ? edge.targetCardId : edge.sourceCardId;
      if (otherCardId !== candidateId) continue;

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

  return true;
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

  // Whether the PERSISTED graph has anything for this card - kept as
  // its own signal (distinct from `graphComputed` below, which also
  // accounts for the live supplements) purely so a future operator
  // run of the precompute script remains observable independently.
  const persistedGraphHasEdges = edgesByCandidateId.size > 0;

  // Owned-copy counts for this player (ANY league, purely for the
  // "Owned x3" copy-count badge) - never another player's collection
  // data. This is deliberately separate from the league-scoped
  // ownership CLASSIFICATION below, which decides myCards/discover/
  // tradeTargets membership. Also doubles as the bounded OWNED
  // candidate source for the live edge supplement below - this
  // player's own collection, never the full catalog.
  const { data: ownedRows, error: ownedRowsError } = await supabase
    .from("card_instances")
    .select("card_catalog_id")
    .eq("current_owner_id", userId);

  if (ownedRowsError) {
    console.error("[card-synergy] owned card_instances fetch failed", ownedRowsError);
  }

  const ownedCounts = new Map<string, number>();
  for (const row of (ownedRows ?? []) as { card_catalog_id: string }[]) {
    ownedCounts.set(
      row.card_catalog_id,
      (ownedCounts.get(row.card_catalog_id) ?? 0) + 1
    );
  }
  const ownedCardIds = Array.from(ownedCounts.keys());

  // League lookup is needed both for the LEAGUE-OWNED live supplement
  // right below (Trade Targets candidates) and for the ownership
  // classification step further down - fetched once, here, and
  // reused for both.
  const leagueId = await getLeagueIdForUser(supabase, userId);

  // Target's own card_mechanics row, fetched once and reused across
  // all three live edge supplements below (see the LIVE_EDGE_
  // SUPPLEMENT header comment near the top of this file).
  const targetMech = (await fetchMechProfiles(supabase, [target.id])).get(target.id);

  // Tracks whether at least one live computation was genuinely
  // attempted (regardless of whether it found anything) - feeds
  // `graphComputed` below so "we looked and found nothing" reads as
  // an honest negative rather than "not yet analyzed".
  let attemptedLive = false;

  // SOURCE 1 - OWNED: feeds "My Cards".
  if (ownedCardIds.length > 0) {
    const attempted = await supplementWithLiveEdges(
      supabase,
      target,
      targetMech,
      ownedCardIds,
      edgesByCandidateId
    );
    attemptedLive = attemptedLive || attempted;
  }

  // SOURCE 2 - LEAGUE-OWNED: feeds "Trade Targets". One card_instances
  // query scoped to this league, excluding the viewer's own copies,
  // capped - never a catalog-wide scan.
  if (leagueId) {
    const { data: leagueInstanceRows, error: leagueInstanceError } = await supabase
      .from("card_instances")
      .select("card_catalog_id")
      .eq("league_id", leagueId)
      .neq("current_owner_id", userId)
      .limit(LIVE_SUPPLEMENT_CANDIDATE_CAP * 4);

    if (leagueInstanceError) {
      console.error("[card-synergy] league card_instances fetch failed", leagueInstanceError);
    }

    const leagueMateCardIds = Array.from(
      new Set(
        ((leagueInstanceRows ?? []) as { card_catalog_id: string }[]).map(
          (r) => r.card_catalog_id
        )
      )
    ).slice(0, LIVE_SUPPLEMENT_CANDIDATE_CAP);

    if (leagueMateCardIds.length > 0) {
      const attempted = await supplementWithLiveEdges(
        supabase,
        target,
        targetMech,
        leagueMateCardIds,
        edgesByCandidateId
      );
      attemptedLive = attemptedLive || attempted;
    }
  }

  // SOURCE 3 - ARCHETYPE-SCOPED: feeds "Discover". One indexed
  // card_catalog query (card_catalog_archetype_idx), capped - bounded
  // by real archetype group sizes, never a full-catalog scan. A card
  // with no archetype gets no Discover candidates from this source at
  // all (an honest limitation, not a scan-based guess).
  if (target.archetype) {
    const { data: archetypeRows, error: archetypeError } = await supabase
      .from("card_catalog")
      .select("id")
      .eq("archetype", target.archetype)
      .neq("id", target.id)
      .limit(LIVE_SUPPLEMENT_CANDIDATE_CAP);

    if (archetypeError) {
      console.error("[card-synergy] archetype-scoped candidate fetch failed", archetypeError);
    }

    const archetypeCandidateIds = ((archetypeRows ?? []) as { id: string }[]).map(
      (r) => r.id
    );

    if (archetypeCandidateIds.length > 0) {
      const attempted = await supplementWithLiveEdges(
        supabase,
        target,
        targetMech,
        archetypeCandidateIds,
        edgesByCandidateId
      );
      attemptedLive = attemptedLive || attempted;
    } else {
      // We tried (the card has an archetype) even though nothing came
      // back - still counts as a genuine attempt.
      attemptedLive = true;
    }
  }

  // See the LIVE_EDGE_SUPPLEMENT / graphComputed header comment above:
  // true whenever the persisted graph has rows for this card OR a
  // live computation was genuinely attempted, even if it found
  // nothing - only a card with no owned/league/archetype angle at all
  // falls through to the honest "not yet analyzed" state.
  const graphComputed = persistedGraphHasEdges || attemptedLive;

  const candidateIds = Array.from(edgesByCandidateId.keys());

  let pool: SynergyCatalogCard[] = [];
  if (candidateIds.length > 0) {
    const { data: poolRows, error: poolError } = await supabase
      .from("card_catalog")
      .select(CATALOG_COLUMNS)
      .in("id", candidateIds);

    if (poolError) {
      console.error("[card-synergy] candidate pool fetch failed", poolError);
    }

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
  // re-deciding eligibility. (leagueId was already fetched above, for
  // the LEAGUE-OWNED live edge supplement - reused here as-is.) ----
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
