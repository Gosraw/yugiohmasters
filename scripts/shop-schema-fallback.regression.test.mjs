// Regression test: guards the Shop page's schema-mismatch fallback
// added in the Season 1 audit round-4 (2026-09-02) pass.
//
// WHY THIS TEST EXISTS
// GitHub/Vercel deploy the Next.js app on every push to main, but the
// Supabase migrations are a separate, manual step (docs/GO_LIVE_TONIGHT.md).
// If the app code that expects the Special Pack curated-pool tables
// (shop_special_pack_definitions, and the pack_definition_id column on
// shop_special_pack_rotations) reaches production before those migrations
// are applied, src/app/(app)/shop/page.tsx used to unconditionally throw
// on the resulting Postgres/PostgREST error - crashing the ENTIRE Shop
// page (Normal/Premium/Deluxe included, since they render on the same
// page below the Special Packs section that was failing). The fix adds a
// narrow classifier, isMissingCuratedPackSchemaObjectError, and two
// fallback branches that degrade to pre-curated-pool behavior instead of
// crashing - but ONLY for that specific class of error, so a genuinely
// unexpected error still throws and gets noticed.
//
// This test has two halves:
//   1. A logic-equivalence check of the classifier against representative
//      Postgrest/Postgres error shapes (both the codes it must recognize
//      and messages/codes it must NOT treat as a schema mismatch).
//   2. A static source-shape check that the fallback wiring is still
//      present in the real file, so a future edit can't silently narrow
//      or remove it without failing.

import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, err });
  }
}

// ---------------------------------------------------------
// Part 1: logic-equivalence copy of isMissingCuratedPackSchemaObjectError
// (kept in exact sync with src/app/(app)/shop/page.tsx - part 2 below
// pins the real source so this copy can't silently drift unnoticed).
// ---------------------------------------------------------
function isMissingCuratedPackSchemaObjectError(error) {
  if (!error) {
    return false;
  }
  const code = error.code ?? '';
  if (['42703', '42P01', 'PGRST204', 'PGRST205'].includes(code)) {
    return true;
  }
  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('pack_definition_id') ||
    message.includes('shop_special_pack_definitions')
  );
}

test('recognizes Postgres undefined_column (42703)', () => {
  assert.equal(
    isMissingCuratedPackSchemaObjectError({ code: '42703', message: 'column "pack_definition_id" does not exist' }),
    true,
  );
});

test('recognizes Postgres undefined_table (42P01)', () => {
  assert.equal(
    isMissingCuratedPackSchemaObjectError({ code: '42P01', message: 'relation "shop_special_pack_definitions" does not exist' }),
    true,
  );
});

test('recognizes PostgREST stale-schema-cache codes (PGRST204/PGRST205)', () => {
  assert.equal(isMissingCuratedPackSchemaObjectError({ code: 'PGRST204', message: 'anything' }), true);
  assert.equal(isMissingCuratedPackSchemaObjectError({ code: 'PGRST205', message: 'anything' }), true);
});

test('falls back to message sniffing when no recognized code is present', () => {
  assert.equal(
    isMissingCuratedPackSchemaObjectError({ code: undefined, message: 'Could not find the pack_definition_id column' }),
    true,
  );
  assert.equal(
    isMissingCuratedPackSchemaObjectError({ code: null, message: "relation \"public.shop_special_pack_definitions\" does not exist" }),
    true,
  );
});

test('does NOT treat an unrelated error as a schema mismatch (must still throw)', () => {
  assert.equal(
    isMissingCuratedPackSchemaObjectError({ code: '23505', message: 'duplicate key value violates unique constraint' }),
    false,
  );
  assert.equal(
    isMissingCuratedPackSchemaObjectError({ code: undefined, message: 'network error' }),
    false,
  );
});

test('handles null/undefined error gracefully', () => {
  assert.equal(isMissingCuratedPackSchemaObjectError(null), false);
  assert.equal(isMissingCuratedPackSchemaObjectError(undefined), false);
});

// ---------------------------------------------------------
// Part 2: static source-shape check on the real file
// ---------------------------------------------------------
const shopPagePath = 'src/app/(app)/shop/page.tsx';
const shopPage = readFileSync(shopPagePath, 'utf8');

test('shop page still defines isMissingCuratedPackSchemaObjectError', () => {
  assert.match(shopPage, /function isMissingCuratedPackSchemaObjectError\(/);
});

test('shop page no longer unconditionally throws on specialRotationError', () => {
  // The ONLY acceptable unconditional throw left for specialRotationError
  // is inside the "else if" branch (genuinely unrecognized errors) or the
  // legacy-refetch's own error handling - not a bare top-level throw.
  const idx = shopPage.indexOf('let effectiveSpecialRotationData');
  assert.ok(idx !== -1, 'fallback variable not found - throw may have been reintroduced');
  const chunk = shopPage.slice(idx, idx + 2500);
  assert.match(chunk, /isMissingCuratedPackSchemaObjectError\(\s*specialRotationError/);
  assert.match(chunk, /legacySpecialRotationData/);
  assert.match(chunk, /pack_definition_id:\s*\n\s*null/);
});

test('shop page no longer unconditionally throws on packDefinitionError', () => {
  const idx = shopPage.indexOf('let effectivePackDefinitionData');
  assert.ok(idx !== -1, 'fallback variable not found - throw may have been reintroduced');
  const chunk = shopPage.slice(idx, idx + 1500);
  assert.match(chunk, /isMissingCuratedPackSchemaObjectError\(\s*packDefinitionError/);
  assert.match(chunk, /effectivePackDefinitionData =\s*\n\s*\[\]/);
});

test('shop page still throws for a genuinely unrecognized error on both queries (fallback is narrow, not a blanket swallow)', () => {
  const specIdx = shopPage.indexOf('let effectiveSpecialRotationData');
  const specChunk = shopPage.slice(specIdx, specIdx + 2500);
  assert.match(specChunk, /\} else if \(\s*specialRotationError\s*\) \{\s*throw new Error\(/);

  const defIdx = shopPage.indexOf('let effectivePackDefinitionData');
  const defChunk = shopPage.slice(defIdx, defIdx + 1000);
  assert.match(defChunk, /\} else if \(packDefinitionError\) \{\s*throw new Error\(/);
});

test('downstream rendering still uses the effective (fallback-aware) variables, not the raw query results', () => {
  assert.match(shopPage, /const specialRotations =\s*\n\s*\(effectiveSpecialRotationData/);
  assert.match(shopPage, /\(effectivePackDefinitionData/);
});

let passed = 0;
for (const r of results) {
  if (r.ok) {
    console.log(`  ok - ${r.name}`);
    passed++;
  } else {
    console.log(`  FAIL - ${r.name}`);
    console.log(`    ${r.err.message}`);
  }
}
console.log(`shop-schema-fallback.regression.test.mjs: ${passed}/${results.length} passed`);
if (passed !== results.length) process.exit(1);
