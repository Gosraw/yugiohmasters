// scripts/generate-archetype-registry-migration.regression.test.mjs
//
// Regression coverage for the "quote-parity corruption" bug class reported
// in production (ERROR: 42P01: relation "Skyscraper" does not exist when
// applying supabase/migrations/202608301400_seed_archetype_registry.sql).
//
// Static analysis of the committed migration, the generator, and the
// archetype_registry schema migration found every text field correctly
// routed through sqlQuote() and the assembled SQL fully quote-balanced -
// regenerating from data/archetype-registry.mjs reproduces the committed
// file byte-for-byte. No live Postgres was available to reproduce the
// reported error directly. Regardless of root cause, this suite locks in
// the generator-level defenses added in response: sqlQuote()'s own
// round-trip self-check, and findUnsafeSqlLiteral()'s whole-file scan -
// run directly with `node scripts/generate-archetype-registry-migration.regression.test.mjs`
// (vitest is broken in this sandbox - see valuation-engine.regression.test.mjs
// for the same established pattern).

import assert from "node:assert/strict";
import { generateSql, findUnsafeSqlLiteral } from "./generate-archetype-registry-migration.mjs";

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

function baseArchetype(overrides = {}) {
  return {
    code: "test_arch",
    name: "Test Archetype",
    description: "A plain description with no punctuation",
    priorityRank: 1,
    profile: {
      nostalgiaRelevance: "HIGH",
      consistency: "HIGH",
      removal: "HIGH",
      defense: "HIGH",
      recovery: "HIGH",
      bossPower: "HIGH",
      summoningSpeed: "FAST",
      overallHealth: "HEALTHY",
      deckReality: "FULL_DECK",
    },
    gaps: [{ category: "other", description: "A plain gap description" }],
    notes: "Plain notes",
    bossProgression: {},
    cards: [{ name: "Plain Card", role: "CORE", notes: "Plain card notes" }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// findUnsafeSqlLiteral() itself
// ---------------------------------------------------------------------

await test("findUnsafeSqlLiteral: balanced SQL is reported safe", async () => {
  const sql = "insert into t (name) values ('Elemental HERO Sparkman');\n";
  assert.equal(findUnsafeSqlLiteral(sql), null);
});

await test("findUnsafeSqlLiteral: doubled apostrophe (correct escaping) is safe", async () => {
  const sql = "insert into t (name) values ('Jaden Yuki''s HERO lineup');\n";
  assert.equal(findUnsafeSqlLiteral(sql), null);
});

await test("findUnsafeSqlLiteral: a raw unescaped apostrophe is caught", async () => {
  const sql = "insert into t (name) values ('It's broken');\n";
  assert.ok(findUnsafeSqlLiteral(sql), "expected a diagnostic string, got null");
});

await test("findUnsafeSqlLiteral: an apostrophe inside a -- comment is never mistaken for a string", async () => {
  const sql = "-- don't touch this comment, it has an apostrophe\nselect 1;\n";
  assert.equal(findUnsafeSqlLiteral(sql), null);
});

await test("findUnsafeSqlLiteral: a string that legitimately contains ' -- ' text is still fine", async () => {
  const sql = "insert into t (name) values ('battle -- archetype-defining');\n";
  assert.equal(findUnsafeSqlLiteral(sql), null);
});

await test("findUnsafeSqlLiteral: a semicolon inside a string literal is not a statement break", async () => {
  const sql = "insert into t (notes) values ('Namesake Normal Monster; every build needs it.');\n";
  assert.equal(findUnsafeSqlLiteral(sql), null);
});

// ---------------------------------------------------------------------
// generateSql() end to end, exercising the exact punctuation classes named
// in the bug report: apostrophes, quotes, card names, notes, hyphens,
// punctuation.
// ---------------------------------------------------------------------

const nastyCardNames = [
  "HERO's Bond",
  "D - Formation",
  "Skyscraper 2 - Hero City",
  `A "quoted" card name`,
  "A name ending in a quote'",
  "'A name starting with a quote",
  "A name with -- a comment-looking dash",
  "A name; with a semicolon",
  "A name with ''already doubled'' quotes",
];

for (const name of nastyCardNames) {
  await test(`generateSql: card name ${JSON.stringify(name)} produces safe SQL`, async () => {
    const registry = [
      baseArchetype({
        cards: [{ name, role: "CORE", notes: `Notes referencing ${name} again` }],
      }),
    ];
    const sql = generateSql(registry);
    const unsafe = findUnsafeSqlLiteral(sql);
    assert.equal(unsafe, null, `expected safe SQL, got: ${unsafe}`);
    // And the literal must actually resolve back to the original card name
    // when read the same way Postgres would.
    assert.ok(sql.includes(`c.name = '${name.replace(/'/g, "''")}'`));
  });
}

await test("generateSql: archetype description/notes/gaps with mixed punctuation stay safe", async () => {
  const nasty = nastyCardNames.join(" | ") + " and a trailing apostrophe'";
  const registry = [
    baseArchetype({
      description: nasty,
      notes: nasty,
      gaps: [{ category: "other", description: nasty }],
    }),
  ];
  const sql = generateSql(registry);
  assert.equal(findUnsafeSqlLiteral(sql), null);
});

await test("generateSql: a full multi-archetype registry stays balanced end to end", async () => {
  const registry = [
    baseArchetype({ code: "arch_one", cards: [{ name: "Card One's Name", role: "CORE" }] }),
    baseArchetype({ code: "arch_two", cards: [{ name: "Card - Two", role: "CORE" }] }),
    baseArchetype({ code: "arch_three", cards: [{ name: `Card "Three"`, role: "CORE" }] }),
  ];
  const sql = generateSql(registry);
  assert.equal(findUnsafeSqlLiteral(sql), null);
  // Every statement must actually terminate - a corrupted file would leave
  // an odd number of top-level statements or an unterminated one.
  const insertCount = (sql.match(/^insert into/gm) || []).length;
  assert.equal(insertCount, 6); // 3 archetype_registry + 3 archetype_cards inserts
});

console.log(`generate-archetype-registry-migration.regression.test.mjs: ${passed} passed`);
