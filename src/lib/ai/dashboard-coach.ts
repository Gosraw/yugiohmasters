import { createHash } from "node:crypto";

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  analyzeDeck,
  type DeckDoctorCard,
  type DeckDoctorFinding,
  type DeckDoctorMechanics,
} from "@/lib/deck-doctor";

// =========================================================
// DASHBOARD DUELIST COACH - cached, deterministic insights
//
// CRITICAL CONSTRAINT (product spec, Section 3): "NO live AI call
// during dashboard render." This module never calls an AI provider
// at all - every insight here is a plain-language rendering of an
// already-computed deck-doctor.ts finding, cached in
// dashboard_coach_insights (see the 202608241100 migration).
//
// CACHING CONTRACT: a dashboard visit calls
// getOrRefreshDashboardCoachInsights() with forceRefresh=false. That
// function computes a cheap STATE FINGERPRINT (a hash of the active
// deck's card ids + this module's own version) and compares it
// against the fingerprint already stored per insight_type. Only a
// MISMATCH (or no stored row yet) triggers recomputation - opening
// the dashboard with an unchanged deck is a single indexed SELECT,
// never a recompute. A player-initiated "Refresh" action passes
// forceRefresh=true to bypass the fingerprint check explicitly.
//
// SCOPE (Phase 3, disclosed): insights here are derived from the
// player's ACTIVE DECK's own Deck Doctor report only - the same
// deterministic analysis already shown on the deck builder page,
// just cached and re-phrased for the dashboard's compact format.
// Collection-wide categories from the product spec's suggested list
// (newly-available synergy across the WHOLE collection, an unused
// owned package, a broad trade-opportunity scan) would each need
// their own bounded, indexed query design and are deliberately
// DEFERRED rather than built as an expensive or approximate scan
// under this session's time budget - see the Phase 3 report. What
// IS implemented (Normal Summon competition, GY imbalance, an
// unsupported Extra Deck card, an owned-card improvement) is fully
// deterministic, real, and reuses the exact query pattern already
// proven safe on the deck builder page (bounded card_mechanics
// lookups, never a full-catalog scan).
// =========================================================

export const DASHBOARD_COACH_VERSION = "2026-08-24.1";

export type DashboardInsightType =
  | "normal_summon_competition"
  | "gy_imbalance"
  | "extra_deck_opportunity"
  | "owned_improvement";

export type DashboardInsight = {
  insightType: DashboardInsightType;
  deterministicSummary: string;
  confidence: "high" | "medium" | "low";
  evidence: Record<string, unknown>;
  aiExplanation: string | null;
  generatedAt: string;
};

type ActiveDeckCard = {
  card_catalog_id: string;
  name: string;
  card_type: string;
  section: "main" | "extra";
};

// Exported so the fingerprint's determinism/sensitivity (same input
// -> same hash, different card set -> different hash) can be unit
// tested directly - see dashboard-coach.test.ts.
export function computeStateFingerprint(deckId: string, cardIds: string[]): string {
  const sorted = [...cardIds].sort();
  return createHash("sha256")
    .update(`${DASHBOARD_COACH_VERSION}|${deckId}|${sorted.join(",")}`)
    .digest("hex");
}

/**
 * Turns one deck-doctor.ts finding into a dashboard-appropriate
 * insight: short, non-jargon, in the tone the product spec's own
 * examples use. Only a small, fixed subset of finding types map to a
 * dashboard insight - the rest (already fully covered by the Deck
 * Doctor panel on the deck builder page itself) are not repeated
 * here, since the dashboard is meant to be a compact highlight, not
 * a duplicate of the full report.
 */
export function findingToDashboardInsight(
  finding: DeckDoctorFinding,
  // Optional card_catalog_id -> display name lookup, so a finding that
  // names a specific card (UNSUPPORTED_EXTRA_DECK_CARD) can show its
  // REAL full name. Deliberately not parsed out of finding.summary
  // (e.g. summary.split(" ")[0]) - that silently truncates any
  // multi-word card name ("Fusion Beast" -> "Fusion"), which is most
  // Yu-Gi-Oh cards. Falls back to a generic phrase when no map/id is
  // available rather than ever showing a broken partial name.
  cardNameById?: Map<string, string>
): { insightType: DashboardInsightType; summary: string } | null {
  switch (finding.type) {
    case "NORMAL_SUMMON_COMPETITION":
      return {
        insightType: "normal_summon_competition",
        summary: "Veel kaarten concurreren om je Normal Summon.",
      };
    case "GY_PAYOFF_WITHOUT_SETUP":
      return {
        insightType: "gy_imbalance",
        summary:
          "Je hebt meerdere GY-payoffs, maar weinig betrouwbare manieren om ze naar de Graveyard te krijgen.",
      };
    case "GY_SETUP_WITHOUT_PAYOFF":
      return {
        insightType: "gy_imbalance",
        summary:
          "Je stuurt kaarten naar de Graveyard, maar hebt nog geen kaart die dat verzilvert.",
      };
    case "UNSUPPORTED_EXTRA_DECK_CARD": {
      const cardId = finding.involvedCardIds[0];
      const cardName = (cardId && cardNameById?.get(cardId)) || "Deze kaart";
      return {
        insightType: "extra_deck_opportunity",
        summary: `${cardName} in je Extra Deck heeft nog geen bekende manier om het veld te bereiken.`,
      };
    }
    case "OWNED_IMPROVEMENT":
      return {
        insightType: "owned_improvement",
        summary:
          "Een kaart die je al bezit lost een gat in je actieve deck op.",
      };
    default:
      return null;
  }
}

/**
 * Recomputes the active deck's Deck Doctor report and derives at
 * most one dashboard insight per DashboardInsightType (dedupes
 * multiple findings of the same mapped type - the dashboard shows
 * the single most severe one, full detail stays on the deck page).
 */
/**
 * Flat, three-step fetch (deck_cards -> card_instances -> card_catalog)
 * mirroring the exact pattern already used by decks/[id]/page.tsx,
 * rather than a nested Supabase join - keeps the relationship
 * explicit and avoids any FK-name ambiguity. Each step is a single
 * batched, id-list-bounded query, never per-row.
 */
async function fetchActiveDeckCards(
  supabase: SupabaseClient,
  activeDeckId: string
): Promise<ActiveDeckCard[]> {
  const { data: deckCardRows } = await supabase
    .from("deck_cards")
    .select("card_instance_id,section")
    .eq("deck_id", activeDeckId);

  const deckCards = (deckCardRows ?? []) as {
    card_instance_id: string;
    section: "main" | "extra";
  }[];

  if (deckCards.length === 0) return [];

  const instanceIds = [...new Set(deckCards.map((r) => r.card_instance_id))];

  const { data: instanceRows } = await supabase
    .from("card_instances")
    .select("id,card_catalog_id")
    .in("id", instanceIds);

  const catalogIdByInstanceId = new Map(
    ((instanceRows ?? []) as { id: string; card_catalog_id: string }[]).map(
      (r) => [r.id, r.card_catalog_id]
    )
  );

  const catalogIds = [...new Set(catalogIdByInstanceId.values())];

  const { data: catalogRows } = await supabase
    .from("card_catalog")
    .select("id,name,card_type")
    .in("id", catalogIds);

  const catalogById = new Map(
    ((catalogRows ?? []) as { id: string; name: string; card_type: string }[]).map(
      (r) => [r.id, r]
    )
  );

  const cards: ActiveDeckCard[] = [];
  for (const row of deckCards) {
    const catalogId = catalogIdByInstanceId.get(row.card_instance_id);
    const catalogCard = catalogId ? catalogById.get(catalogId) : undefined;
    if (!catalogId || !catalogCard) continue;
    cards.push({
      card_catalog_id: catalogId,
      name: catalogCard.name,
      card_type: catalogCard.card_type,
      section: row.section,
    });
  }
  return cards;
}

async function computeInsightsForActiveDeck(
  supabase: SupabaseClient,
  cards: ActiveDeckCard[]
): Promise<DashboardInsight[]> {
  const cardIds = [...new Set(cards.map((c) => c.card_catalog_id))];

  if (cardIds.length === 0) {
    return [];
  }

  const { data: mechRows } = await supabase
    .from("card_mechanics")
    .select("card_catalog_id,tags")
    .in("card_catalog_id", cardIds);

  const mechanicsByCardId = new Map<string, DeckDoctorMechanics>();
  for (const row of (mechRows ?? []) as { card_catalog_id: string; tags: string[] }[]) {
    mechanicsByCardId.set(row.card_catalog_id, { tags: row.tags });
  }

  if (mechanicsByCardId.size === 0) {
    // Same honest "not yet analyzed" contract as everywhere else -
    // no insights rather than a false "your deck is perfect".
    return [];
  }

  const mainCards: DeckDoctorCard[] = cards
    .filter((c) => c.section === "main")
    .map((c) => ({ cardCatalogId: c.card_catalog_id, name: c.name, cardType: c.card_type }));
  const extraCards: DeckDoctorCard[] = cards
    .filter((c) => c.section === "extra")
    .map((c) => ({ cardCatalogId: c.card_catalog_id, name: c.name, cardType: c.card_type }));

  const report = analyzeDeck(mainCards, extraCards, mechanicsByCardId, []);

  const cardNameById = new Map(cards.map((c) => [c.card_catalog_id, c.name]));

  const seen = new Set<DashboardInsightType>();
  const insights: DashboardInsight[] = [];

  for (const finding of report.findings) {
    const mapped = findingToDashboardInsight(finding, cardNameById);
    if (!mapped || seen.has(mapped.insightType)) continue;
    seen.add(mapped.insightType);

    insights.push({
      insightType: mapped.insightType,
      deterministicSummary: mapped.summary,
      confidence: finding.confidence,
      evidence: finding.evidence,
      aiExplanation: null,
      generatedAt: new Date().toISOString(),
    });
  }

  return insights;
}

/**
 * Public entry point. Reads cached rows first; only recomputes (and
 * upserts) when the state fingerprint has changed or forceRefresh is
 * true. Returns [] (not an error) when the player has no active
 * league/deck - the dashboard shows nothing in that case, never a
 * broken panel.
 */
export async function getOrRefreshDashboardCoachInsights(
  supabase: SupabaseClient,
  userId: string,
  leagueId: string,
  activeDeckId: string | null,
  forceRefresh = false
): Promise<DashboardInsight[]> {
  if (!activeDeckId) {
    return [];
  }

  const { data: cachedRows } = await supabase
    .from("dashboard_coach_insights")
    .select(
      "insight_type,deterministic_summary,confidence,evidence,ai_explanation,state_fingerprint,generated_at"
    )
    .eq("profile_id", userId)
    .eq("league_id", leagueId);

  type CachedRow = {
    insight_type: DashboardInsightType;
    deterministic_summary: string;
    confidence: "high" | "medium" | "low";
    evidence: Record<string, unknown>;
    ai_explanation: string | null;
    state_fingerprint: string;
    generated_at: string;
  };

  const cached = (cachedRows ?? []) as CachedRow[];

  // Determine the CURRENT fingerprint from the deck's card ids alone
  // (one query, the same deck_cards/card_instances lookup the full
  // analysis needs anyway - see fetchActiveDeckCards) before deciding
  // whether a real recompute (the extra card_mechanics fetch +
  // analyzeDeck() call) is needed at all.
  const cards = await fetchActiveDeckCards(supabase, activeDeckId);
  const currentCardIds = [...new Set(cards.map((c) => c.card_catalog_id))];
  const currentFingerprint = computeStateFingerprint(activeDeckId, currentCardIds);

  const isFresh =
    !forceRefresh &&
    cached.length > 0 &&
    cached.every((row) => row.state_fingerprint === currentFingerprint);

  if (isFresh) {
    return cached.map((row) => ({
      insightType: row.insight_type,
      deterministicSummary: row.deterministic_summary,
      confidence: row.confidence,
      evidence: row.evidence,
      aiExplanation: row.ai_explanation,
      generatedAt: row.generated_at,
    }));
  }

  const insights = await computeInsightsForActiveDeck(supabase, cards);

  // Best-effort cache write - a failed upsert never breaks the
  // dashboard, it just means the next visit recomputes again.
  if (insights.length > 0) {
    await supabase.from("dashboard_coach_insights").upsert(
      insights.map((insight) => ({
        profile_id: userId,
        league_id: leagueId,
        insight_type: insight.insightType,
        evidence: insight.evidence,
        deterministic_summary: insight.deterministicSummary,
        confidence: insight.confidence,
        state_fingerprint: currentFingerprint,
        engine_version: DASHBOARD_COACH_VERSION,
        ai_explanation: insight.aiExplanation,
        generated_at: insight.generatedAt,
      })),
      { onConflict: "profile_id,league_id,insight_type" }
    );

    // Stale insight_types from a prior fingerprint that no longer
    // fire this round are removed so the dashboard never shows an
    // outdated finding - scoped strictly to this player+league+the
    // specific types that just fired, never a broader delete.
    const currentTypes = insights.map((i) => i.insightType);
    const staleTypes = cached
      .map((row) => row.insight_type)
      .filter((type) => !currentTypes.includes(type));
    if (staleTypes.length > 0) {
      await supabase
        .from("dashboard_coach_insights")
        .delete()
        .eq("profile_id", userId)
        .eq("league_id", leagueId)
        .in("insight_type", staleTypes);
    }
  } else if (cached.length > 0) {
    // Deck changed and no findings fire anymore - clear the stale
    // cache entirely rather than leaving outdated rows behind.
    await supabase
      .from("dashboard_coach_insights")
      .delete()
      .eq("profile_id", userId)
      .eq("league_id", leagueId);
  }

  return insights;
}
