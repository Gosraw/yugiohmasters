// lib/archetype-registry.regression.test.mjs
//
// Plain node:assert/strict regression suite for the Archetype Registry -
// run directly with `node lib/archetype-registry.regression.test.mjs`
// (vitest is broken in this sandbox - see valuation-engine.regression.test.mjs
// for the same established pattern).
//
// Covers two layers:
//   1. DATA VALIDATION - every card in data/archetype-registry.mjs is a
//      real, eligible/whitelisted catalog card; no Synchro/Link/Pendulum
//      leaks into a BOSS/Extra-Deck slot; no duplicate (archetype, card)
//      pairs; boss-progression references resolve. Reuses the exact
//      validateRegistry() logic scripts/generate-archetype-registry-
//      migration.mjs runs before emitting SQL, so a bug caught here is a
//      bug the generator would also refuse to ship.
//   2. SHAPING/QUERY LOGIC - shapeArchetype() (pure) and getArchetype()/
//      listArchetypes() (given a fake Supabase-like client, no network)
//      produce the app-ready object shape section 12 of the Archetype
//      Registry brief describes.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ARCHETYPE_REGISTRY } from "../data/archetype-registry.mjs";
import { validateRegistry } from "../scripts/generate-archetype-registry-migration.mjs";
import { shapeArchetype, getArchetype, listArchetypes } from "./archetype-registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
  } catch (err) {
    console.error(`FAIL: ${name}`);
    throw err;
  }
}

function findNewestCatalogSnapshot() {
  const reportsDir = path.join(REPO_ROOT, "reports", "duelist-circle-classic");
  if (!fs.existsSync(reportsDir)) return null;
  const runs = fs
    .readdirSync(reportsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (let i = runs.length - 1; i >= 0; i--) {
    const candidate = path.join(reportsDir, runs[i], "per-card.json");
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------
// 1. DATA VALIDATION - against the real catalog snapshot, when present.
// ---------------------------------------------------------------------

const snapshotPath = findNewestCatalogSnapshot();
const catalogSnapshot = snapshotPath ? JSON.parse(fs.readFileSync(snapshotPath, "utf8")) : null;

await test("registry has 10 archetypes with unique codes", () => {
  assert.equal(ARCHETYPE_REGISTRY.length, 10);
  const codes = ARCHETYPE_REGISTRY.map((a) => a.code);
  assert.equal(new Set(codes).size, codes.length);
});

await test("every archetype has a non-empty cards array and a complete profile", () => {
  for (const arch of ARCHETYPE_REGISTRY) {
    assert.ok(arch.cards.length > 0, `${arch.code} has no cards`);
    for (const key of [
      "nostalgiaRelevance",
      "consistency",
      "removal",
      "defense",
      "recovery",
      "bossPower",
      "summoningSpeed",
      "overallHealth",
      "deckReality",
    ]) {
      assert.ok(arch.profile[key], `${arch.code} missing profile.${key}`);
    }
  }
});

await test("validateRegistry reports zero structural errors", () => {
  const { errors } = validateRegistry(ARCHETYPE_REGISTRY, null);
  assert.deepEqual(errors, []);
});

await test("validateRegistry reports zero errors against the real catalog snapshot", () => {
  if (!catalogSnapshot) {
    console.warn(
      "  (skipped catalog cross-check: no reports/duelist-circle-classic/*/per-card.json snapshot found in this checkout)"
    );
    return;
  }
  const { errors } = validateRegistry(ARCHETYPE_REGISTRY, catalogSnapshot);
  assert.deepEqual(errors, [], `catalog validation errors:\n${errors.join("\n")}`);
});

await test("no Synchro/Link/Pendulum card is ever marked as a BOSS/Extra Deck entry", () => {
  if (!catalogSnapshot) return;
  const byName = new Map();
  for (const c of catalogSnapshot) {
    if (!byName.has(c.name)) byName.set(c.name, []);
    byName.get(c.name).push(c);
  }
  for (const arch of ARCHETYPE_REGISTRY) {
    for (const card of arch.cards) {
      if (!card.extraDeckKind) continue;
      const entries = byName.get(card.name) ?? [];
      for (const e of entries) {
        const ct = (e.card_type ?? "").toLowerCase();
        assert.ok(
          !ct.includes("synchro") && !ct.includes("link") && !ct.includes("pendulum"),
          `${arch.code}: "${card.name}" is real card_type "${e.card_type}" but marked extraDeckKind=${card.extraDeckKind}`
        );
      }
    }
  }
});

await test("no duplicate (archetype, card) pairs", () => {
  for (const arch of ARCHETYPE_REGISTRY) {
    const names = arch.cards.map((c) => c.name);
    assert.equal(new Set(names).size, names.length, `${arch.code} has duplicate card names`);
  }
});

await test("every bossProgression reference resolves to a real card entry in the same archetype", () => {
  for (const arch of ARCHETYPE_REGISTRY) {
    for (const stage of ["early", "mid", "late", "signature"]) {
      const val = arch.bossProgression?.[stage];
      if (!val) continue;
      assert.ok(
        arch.cards.some((c) => c.name === val),
        `${arch.code}: bossProgression.${stage} = "${val}" has no matching card entry`
      );
    }
  }
});

await test("ESSENTIAL package cards are never needsReview, and AVOID cards never carry a package tier", () => {
  for (const arch of ARCHETYPE_REGISTRY) {
    for (const card of arch.cards) {
      if (card.packageTier === "ESSENTIAL") {
        assert.ok(!card.needsReview, `${arch.code}: "${card.name}" is ESSENTIAL but needsReview`);
      }
      if (card.role === "AVOID") {
        assert.ok(!card.packageTier, `${arch.code}: "${card.name}" is AVOID but has a packageTier`);
      }
    }
  }
});

await test("post-2014 cards only appear via eligible_core or an explicit whitelist/override category", () => {
  if (!catalogSnapshot) return;
  const byName = new Map();
  for (const c of catalogSnapshot) {
    if (!byName.has(c.name)) byName.set(c.name, []);
    byName.get(c.name).push(c);
  }
  for (const arch of ARCHETYPE_REGISTRY) {
    for (const card of arch.cards) {
      const entries = byName.get(card.name);
      if (!entries) continue; // reported separately by the catalog-validation test above
      const usable = entries.find(
        (e) =>
          e.eligibilityCategory === "eligible_core" ||
          e.eligibilityCategory === "override_included" ||
          e.eligibilityCategory === "era_excluded_2015_2018"
      );
      assert.ok(usable, `${arch.code}: "${card.name}" has no eligible/whitelisted catalog entry`);
    }
  }
});

// ---------------------------------------------------------------------
// 2. SHAPING LOGIC - pure, no I/O.
// ---------------------------------------------------------------------

const FIXTURE_ARCHETYPE_ROW = {
  id: "arch-1",
  code: "test_archetype",
  name: "Test Archetype",
  description: "A fixture archetype for shaping tests.",
  priority_rank: 1,
  nostalgia_relevance: "HIGH",
  consistency: "MEDIUM",
  removal: "LOW",
  defense: "LOW",
  recovery: "MEDIUM",
  boss_power: "HIGH",
  summoning_speed: "FAST",
  overall_health: "HEALTHY",
  deck_reality: "FULL_DECK",
  gaps: [{ category: "removal", description: "No unconditional removal." }],
  notes: "fixture notes",
};

const FIXTURE_CARD_ROWS = [
  {
    role: "CORE",
    extra_deck_kind: null,
    summon_difficulty: null,
    package_tier: "ESSENTIAL",
    boss_stage: null,
    needs_review: false,
    notes: "core note",
    card_catalog: { id: "c1", name: "Fixture Starter", card_type: "Normal Monster", game_rarity: "Normal" },
  },
  {
    role: "BOSS",
    extra_deck_kind: "FUSION",
    summon_difficulty: "EASY",
    package_tier: "RECOMMENDED",
    boss_stage: "EARLY",
    needs_review: false,
    notes: "fusion boss note",
    card_catalog: { id: "c2", name: "Fixture Fusion Boss", card_type: "Fusion Monster", game_rarity: "Ultra Rare" },
  },
  {
    role: "BOSS",
    extra_deck_kind: "XYZ",
    summon_difficulty: "MODERATE",
    package_tier: "EXPANSION",
    boss_stage: "SIGNATURE",
    needs_review: true,
    notes: "xyz boss note",
    card_catalog: { id: "c3", name: "Fixture Xyz Boss", card_type: "XYZ Monster", game_rarity: "Secret Rare" },
  },
  {
    role: "NICHE",
    extra_deck_kind: null,
    summon_difficulty: null,
    package_tier: null,
    boss_stage: null,
    needs_review: true,
    notes: null,
    card_catalog: { id: "c4", name: "Fixture Niche Card", card_type: "Trap Card", game_rarity: "Rare" },
  },
];

await test("shapeArchetype groups cards by role", () => {
  const shaped = shapeArchetype(FIXTURE_ARCHETYPE_ROW, FIXTURE_CARD_ROWS);
  assert.equal(shaped.cards.core.length, 1);
  assert.equal(shaped.cards.boss.length, 2);
  assert.equal(shaped.cards.niche.length, 1);
  assert.equal(shaped.cards.support.length, 0);
  assert.equal(shaped.cardCount, 4);
});

await test("shapeArchetype splits bosses into fusion/xyz/mainDeck", () => {
  const shaped = shapeArchetype(FIXTURE_ARCHETYPE_ROW, FIXTURE_CARD_ROWS);
  assert.equal(shaped.bosses.fusion.length, 1);
  assert.equal(shaped.bosses.fusion[0].name, "Fixture Fusion Boss");
  assert.equal(shaped.bosses.xyz.length, 1);
  assert.equal(shaped.bosses.xyz[0].name, "Fixture Xyz Boss");
  assert.equal(shaped.bosses.mainDeck.length, 0);
});

await test("shapeArchetype builds package tiers and boss progression", () => {
  const shaped = shapeArchetype(FIXTURE_ARCHETYPE_ROW, FIXTURE_CARD_ROWS);
  assert.equal(shaped.packages.essential.length, 1);
  assert.equal(shaped.packages.recommended.length, 1);
  assert.equal(shaped.packages.expansion.length, 1);
  assert.equal(shaped.bossProgression.early, "Fixture Fusion Boss");
  assert.equal(shaped.bossProgression.signature, "Fixture Xyz Boss");
  assert.equal(shaped.bossProgression.mid, null);
});

await test("shapeArchetype counts needsReview and passes gaps/notes through", () => {
  const shaped = shapeArchetype(FIXTURE_ARCHETYPE_ROW, FIXTURE_CARD_ROWS);
  assert.equal(shaped.needsReviewCount, 2);
  assert.deepEqual(shaped.gaps, FIXTURE_ARCHETYPE_ROW.gaps);
  assert.equal(shaped.notes, "fixture notes");
  assert.equal(shaped.health, "HEALTHY");
});

await test("shapeArchetype returns null for a missing archetype row", () => {
  assert.equal(shapeArchetype(null, []), null);
});

// ---------------------------------------------------------------------
// 3. QUERY WIRING - getArchetype()/listArchetypes() against a fake
//    Supabase-like client (no network).
// ---------------------------------------------------------------------

function makeFakeClient({ archetypeRows, cardRowsByArchetypeId }) {
  return {
    from(table) {
      if (table === "archetype_registry") {
        return {
          select() {
            return {
              or(filter) {
                const [codePart, namePart] = filter.split(",");
                const code = codePart.replace("code.eq.", "");
                const name = namePart.replace("name.eq.", "");
                return {
                  maybeSingle: async () => ({
                    data: archetypeRows.find((r) => r.code === code || r.name === name) ?? null,
                    error: null,
                  }),
                };
              },
              order() {
                return { data: archetypeRows.slice().sort((a, b) => (a.priority_rank ?? 999) - (b.priority_rank ?? 999)), error: null };
              },
            };
          },
        };
      }
      if (table === "archetype_cards") {
        return {
          select() {
            return {
              eq: async (_col, archetypeId) => ({ data: cardRowsByArchetypeId.get(archetypeId) ?? [], error: null }),
              in: async (_col, ids) => ({
                data: ids.flatMap((id) => (cardRowsByArchetypeId.get(id) ?? []).map((row) => ({ ...row, archetype_id: id }))),
                error: null,
              }),
            };
          },
        };
      }
      throw new Error(`fake client: unexpected table "${table}"`);
    },
  };
}

await test("getArchetype fetches by code and shapes the result", async () => {
  const client = makeFakeClient({
    archetypeRows: [FIXTURE_ARCHETYPE_ROW],
    cardRowsByArchetypeId: new Map([["arch-1", FIXTURE_CARD_ROWS]]),
  });
  const result = await getArchetype(client, "test_archetype");
  assert.equal(result.name, "Test Archetype");
  assert.equal(result.cardCount, 4);
  assert.equal(result.bosses.fusion.length, 1);
});

await test("getArchetype returns null when the archetype does not exist", async () => {
  const client = makeFakeClient({ archetypeRows: [], cardRowsByArchetypeId: new Map() });
  const result = await getArchetype(client, "does_not_exist");
  assert.equal(result, null);
});

await test("listArchetypes fetches and shapes every archetype in priority order", async () => {
  const second = { ...FIXTURE_ARCHETYPE_ROW, id: "arch-2", code: "test_archetype_2", name: "Test Archetype 2", priority_rank: 2 };
  const client = makeFakeClient({
    archetypeRows: [second, FIXTURE_ARCHETYPE_ROW],
    cardRowsByArchetypeId: new Map([
      ["arch-1", FIXTURE_CARD_ROWS],
      ["arch-2", []],
    ]),
  });
  const results = await listArchetypes(client);
  assert.equal(results.length, 2);
  assert.equal(results[0].code, "test_archetype");
  assert.equal(results[1].code, "test_archetype_2");
  assert.equal(results[0].cardCount, 4);
  assert.equal(results[1].cardCount, 0);
});

console.log(`archetype-registry.regression.test.mjs: ${passed} passed`);
