import {
  describe,
  expect,
  it,
} from "vitest";

import {
  computeStateFingerprint,
  findingToDashboardInsight,
  getOrRefreshDashboardCoachInsights,
  type DashboardInsight,
} from "@/lib/ai/dashboard-coach";

import type { DeckDoctorFinding } from "@/lib/deck-doctor";

// =========================================================
// DASHBOARD DUELIST COACH - mandated test suite
//
// Covers: cached insight used without regeneration, fingerprint
// change invalidates appropriately, no AI call required, league
// isolation.
//
// The orchestration function (getOrRefreshDashboardCoachInsights)
// talks to Supabase, so these tests use a small generic in-memory
// mock query builder (below) rather than a real client - it supports
// exactly the .from/.select/.eq/.in/.upsert/.delete/.maybeSingle
// shapes this module actually calls, filtering an in-memory table
// the same way Postgres would for the filters this module issues.
// =========================================================

type Row = Record<string, unknown>;

function createMockSupabase(initialTables: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(initialTables));
  const calls: { table: string; op: string; filters: Record<string, unknown> }[] = [];

  function matches(row: Row, filters: Record<string, unknown>): boolean {
    return Object.entries(filters).every(([key, value]) => {
      if (key.startsWith("in:")) {
        const col = key.slice(3);
        return Array.isArray(value) && value.includes(row[col]);
      }
      return row[key] === value;
    });
  }

  function builder(table: string) {
    const filters: Record<string, unknown> = {};
    let op: "select" | "upsert" | "delete" = "select";
    let upsertRows: Row[] = [];

    const api = {
      select() {
        op = "select";
        return api;
      },
      eq(col: string, val: unknown) {
        filters[col] = val;
        return api;
      },
      in(col: string, val: unknown[]) {
        filters[`in:${col}`] = val;
        return api;
      },
      upsert(rows: Row[]) {
        op = "upsert";
        upsertRows = rows;
        return api;
      },
      delete() {
        op = "delete";
        return api;
      },
      maybeSingle() {
        const result = tables[table]?.filter((r) => matches(r, filters)) ?? [];
        calls.push({ table, op, filters: { ...filters } });
        return Promise.resolve({ data: result[0] ?? null, error: null });
      },
      then(resolve: (v: { data: Row[] | null; error: null }) => void) {
        calls.push({ table, op, filters: { ...filters } });
        if (op === "upsert") {
          tables[table] = tables[table] ?? [];
          for (const row of upsertRows) {
            const idx = tables[table].findIndex(
              (r) =>
                r.profile_id === row.profile_id &&
                r.league_id === row.league_id &&
                r.insight_type === row.insight_type
            );
            if (idx >= 0) tables[table][idx] = row;
            else tables[table].push(row);
          }
          resolve({ data: upsertRows, error: null });
          return;
        }
        if (op === "delete") {
          tables[table] = (tables[table] ?? []).filter((r) => !matches(r, filters));
          resolve({ data: null, error: null });
          return;
        }
        const result = (tables[table] ?? []).filter((r) => matches(r, filters));
        resolve({ data: result, error: null });
      },
    };
    return api;
  }

  return {
    from: (table: string) => builder(table),
    calls,
    tables,
  };
}

const DECK_ID = "deck-1";
const USER_ID = "user-1";
const LEAGUE_ID = "league-1";

function baseTables(cardIds: string[]) {
  return {
    deck_cards: cardIds.map((id, i) => ({
      deck_id: DECK_ID,
      card_instance_id: `inst-${i}`,
      section: "main",
    })),
    card_instances: cardIds.map((id, i) => ({
      id: `inst-${i}`,
      card_catalog_id: id,
    })),
    card_catalog: cardIds.map((id) => ({
      id,
      name: `Card ${id}`,
      card_type: "Effect Monster",
    })),
    card_mechanics: cardIds.map((id) => ({
      card_catalog_id: id,
      tags: ["normal_summon_dependency"],
    })),
    dashboard_coach_insights: [] as Row[],
  };
}

describe("computeStateFingerprint", () => {
  it("1. is deterministic - same deck id + same card ids -> same fingerprint", () => {
    const a = computeStateFingerprint("deck-1", ["c1", "c2"]);
    const b = computeStateFingerprint("deck-1", ["c1", "c2"]);
    expect(a).toBe(b);
  });

  it("2. is order-independent for the same card set (sorted internally)", () => {
    const a = computeStateFingerprint("deck-1", ["c1", "c2"]);
    const b = computeStateFingerprint("deck-1", ["c2", "c1"]);
    expect(a).toBe(b);
  });

  it("3. changes when the card set changes", () => {
    const a = computeStateFingerprint("deck-1", ["c1", "c2"]);
    const b = computeStateFingerprint("deck-1", ["c1", "c2", "c3"]);
    expect(a).not.toBe(b);
  });

  it("4. changes when the deck id changes (same cards, different deck)", () => {
    const a = computeStateFingerprint("deck-1", ["c1"]);
    const b = computeStateFingerprint("deck-2", ["c1"]);
    expect(a).not.toBe(b);
  });
});

describe("findingToDashboardInsight", () => {
  function finding(partial: Partial<DeckDoctorFinding>): DeckDoctorFinding {
    return {
      type: "NORMAL_SUMMON_COMPETITION",
      severity: "notice",
      confidence: "medium",
      summary: "placeholder",
      involvedCardIds: [],
      evidence: {},
      ...partial,
    };
  }

  it("5. maps NORMAL_SUMMON_COMPETITION to the exact product-spec tone example", () => {
    const mapped = findingToDashboardInsight(finding({ type: "NORMAL_SUMMON_COMPETITION" }));
    expect(mapped?.insightType).toBe("normal_summon_competition");
    expect(mapped?.summary).toBe("Veel kaarten concurreren om je Normal Summon.");
  });

  it("6. maps GY_PAYOFF_WITHOUT_SETUP to the gy_imbalance type with plain, non-jargon language", () => {
    const mapped = findingToDashboardInsight(finding({ type: "GY_PAYOFF_WITHOUT_SETUP" }));
    expect(mapped?.insightType).toBe("gy_imbalance");
    expect(mapped?.summary).not.toMatch(/GY_PAYOFF|score=|confidence=/i);
  });

  it("7. an unrecognized finding type returns null (the default branch) rather than throwing", () => {
    const mapped = findingToDashboardInsight(
      // Deliberately outside the real DeckDoctorFindingType union to
      // exercise the switch's default branch - deck-doctor.ts's own
      // union is closed, so this can only happen via an unexpected
      // future finding type; this proves that case degrades safely
      // instead of crashing the dashboard.
      finding({ type: "SOME_FUTURE_FINDING_TYPE" as DeckDoctorFinding["type"] })
    );
    expect(mapped).toBeNull();
  });

  it("7b. OWNED_IMPROVEMENT and UNSUPPORTED_EXTRA_DECK_CARD both map to a non-null insight", () => {
    expect(
      findingToDashboardInsight(finding({ type: "OWNED_IMPROVEMENT" }))
    ).not.toBeNull();
    expect(
      findingToDashboardInsight(
        finding({
          type: "UNSUPPORTED_EXTRA_DECK_CARD",
          summary: "Fusion Beast has no identified material path.",
        })
      )
    ).not.toBeNull();
  });

  it("7c. UNSUPPORTED_EXTRA_DECK_CARD uses the FULL card name from a lookup map, never a truncated first-word guess", () => {
    const cardNameById = new Map([["card-99", "Elemental HERO Sparkman"]]);
    const mapped = findingToDashboardInsight(
      finding({
        type: "UNSUPPORTED_EXTRA_DECK_CARD",
        involvedCardIds: ["card-99"],
        summary: "Elemental HERO Sparkman has no identified way to reach the field from this Main Deck yet.",
      }),
      cardNameById
    );
    expect(mapped?.summary).toContain("Elemental HERO Sparkman");
    expect(mapped?.summary).not.toContain("Elemental in je");
  });

  it("7d. UNSUPPORTED_EXTRA_DECK_CARD falls back to a generic phrase (never throws) when no name map is given", () => {
    const mapped = findingToDashboardInsight(
      finding({ type: "UNSUPPORTED_EXTRA_DECK_CARD", involvedCardIds: ["card-99"] })
    );
    expect(mapped?.summary).toContain("Deze kaart");
  });
});

describe("getOrRefreshDashboardCoachInsights", () => {
  it("8. no active deck -> returns [] without touching the database at all", async () => {
    const mock = createMockSupabase(baseTables([]));
    const result = await getOrRefreshDashboardCoachInsights(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      USER_ID,
      LEAGUE_ID,
      null
    );
    expect(result).toEqual([]);
    expect(mock.calls.length).toBe(0);
  });

  it("9. a fresh cached row (matching fingerprint) is returned WITHOUT recomputation - no card_mechanics query, no upsert", async () => {
    const cardIds = Array.from({ length: 13 }, (_, i) => `c${i}`);
    const tables = baseTables(cardIds);
    const fingerprint = computeStateFingerprint(DECK_ID, cardIds);

    tables.dashboard_coach_insights = [
      {
        profile_id: USER_ID,
        league_id: LEAGUE_ID,
        insight_type: "normal_summon_competition",
        deterministic_summary: "Veel kaarten concurreren om je Normal Summon.",
        confidence: "medium",
        evidence: {},
        ai_explanation: null,
        state_fingerprint: fingerprint,
        generated_at: "2026-08-24T00:00:00Z",
      },
    ];

    const mock = createMockSupabase(tables);
    const result = await getOrRefreshDashboardCoachInsights(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      USER_ID,
      LEAGUE_ID,
      DECK_ID
    );

    expect(result).toHaveLength(1);
    expect(result[0].deterministicSummary).toBe(
      "Veel kaarten concurreren om je Normal Summon."
    );

    const mechanicsQueries = mock.calls.filter((c) => c.table === "card_mechanics");
    const upserts = mock.calls.filter((c) => c.op === "upsert");
    expect(mechanicsQueries).toHaveLength(0);
    expect(upserts).toHaveLength(0);
  });

  it("10. a fingerprint mismatch (deck changed) triggers recomputation and re-caches", async () => {
    const cardIds = Array.from({ length: 13 }, (_, i) => `c${i}`);
    const tables = baseTables(cardIds);

    tables.dashboard_coach_insights = [
      {
        profile_id: USER_ID,
        league_id: LEAGUE_ID,
        insight_type: "normal_summon_competition",
        deterministic_summary: "stale summary",
        confidence: "medium",
        evidence: {},
        ai_explanation: null,
        state_fingerprint: "outdated-fingerprint",
        generated_at: "2026-08-01T00:00:00Z",
      },
    ];

    const mock = createMockSupabase(tables);
    const result = await getOrRefreshDashboardCoachInsights(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      USER_ID,
      LEAGUE_ID,
      DECK_ID
    );

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].deterministicSummary).not.toBe("stale summary");

    const mechanicsQueries = mock.calls.filter((c) => c.table === "card_mechanics");
    const upserts = mock.calls.filter((c) => c.op === "upsert");
    expect(mechanicsQueries.length).toBeGreaterThan(0);
    expect(upserts.length).toBeGreaterThan(0);
  });

  it("11. every query is scoped by profile_id/league_id - never a cross-player or cross-league read", async () => {
    const cardIds = ["c0"];
    const mock = createMockSupabase(baseTables(cardIds));
    await getOrRefreshDashboardCoachInsights(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      USER_ID,
      LEAGUE_ID,
      DECK_ID
    );

    const insightCalls = mock.calls.filter((c) => c.table === "dashboard_coach_insights");
    expect(insightCalls.length).toBeGreaterThan(0);
    for (const call of insightCalls) {
      if (call.op === "select") {
        expect(call.filters.profile_id).toBe(USER_ID);
        expect(call.filters.league_id).toBe(LEAGUE_ID);
      }
    }
  });

  it("12. computed insights never carry an AI explanation - this module makes zero AI calls", async () => {
    const cardIds = Array.from({ length: 13 }, (_, i) => `c${i}`);
    const mock = createMockSupabase(baseTables(cardIds));
    const result: DashboardInsight[] = await getOrRefreshDashboardCoachInsights(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      USER_ID,
      LEAGUE_ID,
      DECK_ID
    );

    for (const insight of result) {
      expect(insight.aiExplanation).toBeNull();
    }
  });

  it("13. empty card_mechanics (not yet analyzed) yields no insights rather than a false 'all good'", async () => {
    const cardIds = ["c0", "c1"];
    const tables = baseTables(cardIds);
    tables.card_mechanics = []; // simulate the precompute script never having run

    const mock = createMockSupabase(tables);
    const result = await getOrRefreshDashboardCoachInsights(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      USER_ID,
      LEAGUE_ID,
      DECK_ID
    );

    expect(result).toEqual([]);
  });
});
