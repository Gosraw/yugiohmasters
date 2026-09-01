#!/usr/bin/env node
// =========================================================
// STATIC GUARD: FOREACH ... SLICE loop variables must be arrays.
//
// WHY THIS EXISTS
// supabase/migrations/202608301200_seed_2015_2018_legacy_support_whitelist.sql
// declared `v_card record;` and then did
// `foreach v_card slice 1 in array v_cards` where v_cards was a
// text[][]. Postgres rejects this at runtime with:
//   ERROR: 42804: FOREACH ... SLICE loop variable must be of an
//   array type
// because a SLICE loop yields sub-ARRAYS (one fewer dimension than
// the source array), never a scalar/record - only found when the
// generated rollout was actually run against live Supabase. This
// script catches that specific class of bug statically, without a
// live database, by pattern-matching every `foreach <var> slice N in
// array <src>` occurrence in every .sql file passed in and checking
// that <var>'s nearest preceding `declare`-block type annotation
// contains at least one `[]` (an array type).
//
// USAGE
//   node scripts/check-plpgsql-foreach-slice.mjs supabase/migrations/*.sql scripts/generated/*.sql
//
// LIMITATIONS (documented, not silently assumed away)
// - Regex-based, not a real PL/pgSQL parser. It looks backward from
//   each FOREACH...SLICE line for the nearest `declare` keyword and
//   the nearest matching `\bVAR\b ... ;` declaration line above the
//   FOREACH, which is correct for the straightforward
//   `do $$ declare ... begin ... foreach ... end $$;` shape used
//   throughout this repo's migrations. A pathological file with two
//   unrelated declare blocks using the same variable name very close
//   together could confuse it - acceptable for a pre-commit/pre-
//   rollout sanity check, not a substitute for actually testing
//   against Postgres.
// - Does not check SLICE depth against actual array dimensionality
//   (e.g. SLICE 2 on a 1-D array) - only the array-vs-scalar class of
//   bug that actually occurred.
// =========================================================

import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: node scripts/check-plpgsql-foreach-slice.mjs <file.sql> [...]");
  process.exit(2);
}

let totalIssues = 0;

const FOREACH_RE = /foreach\s+(\w+)\s+slice\s+\d+\s+in\s+array\s+(\w+)/gi;

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    console.error(`[SKIP] ${file}: could not read (${err.message})`);
    continue;
  }

  let match;
  FOREACH_RE.lastIndex = 0;
  while ((match = FOREACH_RE.exec(text))) {
    const [, loopVar] = match;
    const upToMatch = text.slice(0, match.index);
    const lineNumber = upToMatch.split("\n").length;

    // Find the nearest preceding `declare` keyword (start of this
    // block's declaration section).
    const declareIdx = upToMatch.toLowerCase().lastIndexOf("\ndeclare");
    if (declareIdx === -1) {
      console.error(
        `[WARN] ${file}:${lineNumber}: found "foreach ${loopVar} slice ... in array" but no preceding "declare" block - could not verify loop variable type.`
      );
      continue;
    }

    const declareSection = text.slice(declareIdx, match.index);
    // Look for a declaration line for this exact variable name:
    // `  v_card text[];` / `v_card text[][] := ...` / `v_card record;`
    const declRe = new RegExp(`(^|\\n)\\s*${loopVar}\\s+([^;]+);`, "i");
    const declMatch = declareSection.match(declRe);

    if (!declMatch) {
      console.error(
        `[WARN] ${file}:${lineNumber}: could not find a declaration for loop variable "${loopVar}" in the preceding declare block - could not verify its type.`
      );
      continue;
    }

    const declaredType = declMatch[2].trim();
    const isArrayType = declaredType.includes("[]");

    if (!isArrayType) {
      console.error(
        `[FAIL] ${file}:${lineNumber}: "foreach ${loopVar} slice ... in array" but ${loopVar} is declared as "${declaredType}" (not an array type). ` +
        `Postgres will reject this at runtime with 42804 "FOREACH ... SLICE loop variable must be of an array type". ` +
        `Declare ${loopVar} as an array type matching the sliced dimension (e.g. "text[]" for a SLICE 1 loop over a text[][] source).`
      );
      totalIssues += 1;
    } else {
      console.log(`[OK]   ${file}:${lineNumber}: ${loopVar} declared as "${declaredType}" (array type) - SLICE loop is valid.`);
    }
  }
}

if (totalIssues > 0) {
  console.error(`\n${totalIssues} FOREACH...SLICE type issue(s) found.`);
  process.exit(1);
}
console.log("\nNo FOREACH...SLICE type issues found.");
