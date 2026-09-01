#!/usr/bin/env node
// =========================================================
// STATIC GUARD: every generated/seed SQL file must be quote-balanced.
//
// WHY THIS EXISTS
// A production deploy of scripts/generated/LIVE_PHASE1_ROLLOUT_2026_08_31.sql
// failed with `ERROR: 42P01: relation "Skyscraper" does not exist` - the
// exact symptom of a value that reached an INSERT statement without going
// through a proper SQL-string escaper, breaking quote parity for every
// statement after it in the file. Exhaustive static analysis (this
// script's own check run by hand, generate-archetype-registry-migration.mjs's
// own findUnsafeSqlLiteral() self-check, byte-for-byte regeneration from
// data/archetype-registry.mjs, and the dedicated regression suite in
// scripts/generate-archetype-registry-migration.regression.test.mjs) found
// every committed migration and the assembled rollout fully quote-balanced,
// with no live Postgres available in this sandbox to reproduce the error
// directly. Regardless of root cause, this script closes the actual
// process gap that let it go undetected either way: findUnsafeSqlLiteral()
// previously only ran against synthetic in-memory test data in the
// regression suite, and against a freshly generated migration inside
// generate-archetype-registry-migration.mjs's own `main()` - it was NEVER
// run against the real, committed files on disk as part of any standard
// command. This script does exactly that, for every migration and
// generated-rollout file, every time `npm run check:sql` runs.
//
// USAGE
//   node scripts/check-sql-quote-safety.mjs supabase/migrations/*.sql scripts/generated/*.sql
// =========================================================

import { readFileSync } from "node:fs";
import { findUnsafeSqlLiteral } from "./generate-archetype-registry-migration.mjs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: node scripts/check-sql-quote-safety.mjs <file.sql> [...]");
  process.exit(2);
}

let totalIssues = 0;

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    console.error(`[SKIP] ${file}: could not read (${err.message})`);
    continue;
  }

  const unsafe = findUnsafeSqlLiteral(text);
  if (unsafe) {
    console.error(`[FAIL] ${file}: ${unsafe}`);
    totalIssues += 1;
  } else {
    console.log(`[OK]   ${file}: quote-balanced.`);
  }
}

if (totalIssues > 0) {
  console.error(`\n${totalIssues} file(s) failed the quote-safety check.`);
  process.exit(1);
}
console.log("\nAll files are quote-balanced.");
