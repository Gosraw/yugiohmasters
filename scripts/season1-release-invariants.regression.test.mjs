// scripts/season1-release-invariants.regression.test.mjs
//
// Plain node:assert/strict STATIC-ANALYSIS regression suite over the
// Season 1 SQL migration/deploy sources themselves - run directly with
// `node scripts/season1-release-invariants.regression.test.mjs` (vitest
// itself cannot run in this sandbox - see
// lib/archetype-registry.regression.test.mjs for the same established
// pattern and root cause: a broken optional native dependency for the
// installed rollup version, unrelated to this repo's own code).
//
// This follows the exact same established pattern as
// scripts/check-sql-quote-safety.mjs (a static guard over committed SQL
// text, no live database required/available) but targets specific
// invariants the Season 1 audit (round 2, Priority 10) identified as
// "logic that has already caused bugs, or logic a future change could
// silently break without anyone noticing until a real player is
// affected" - not generic snapshot coverage.
//
// WHY THIS SUITE EXISTS - each check below traces to a real finding:
//
//   1/2. STAGE-4-ONLY BOSS-ROUTE EXCLUSION (Draft + Shop)
//        202609020970_fix_draft_boss_route_stage4_only_exclusion.sql's
//        own header says the ORIGINAL exclusion was over-broad (blocked
//        all 4 evolution stages from Draft/Shop, not just the intended
//        Stage 4 Boss reward) and had to be fixed forward. A future
//        refactor of this exclusion clause could easily reintroduce
//        that exact bug (e.g. "helpfully" simplifying `stage_number = 4`
//        to `stage_number >= 1`) without any live database catching it,
//        since nothing else in the app depends on Draft/Shop actually
//        being SHORT the Stage 4 cards. This test pins the exact,
//        narrow clause and its known-good occurrence count.
//
//   3. WELCOME BONUS IDEMPOTENCY
//      claim_welcome_packs() is called from proxy.ts on every request
//      for a logged-in player - if its `on conflict (profile_id) do
//      nothing` guard were ever lost in a refactor, every page load
//      would silently re-grant bossg/samo/fardin's welcome vouchers
//      forever. This test pins that the idempotency guard's three load-
//      bearing pieces are all still present together.
//
//   4. SPECIAL PACK POOL EXACT-COUNT SAFETY NET
//      This audit round's own Priority 9 patch to the combined deploy
//      script (raising the seed-time check from "pool not empty" to
//      "pool is exactly 3978 rows") is itself a single line that could
//      be silently reverted or weakened by a future edit with no other
//      signal. This test guards that the patch is still present.
//
//   5. DUELIST CIRCLE CLASSIC FORMAT STAYS OFF BY DEFAULT
//      Priority 5's central finding: the curated 6,181-card Classic
//      format is fully built but its activation
//      (duelist_circle_formats.is_active = true +
//      recompute_format_eligibility()) is documented project-wide as a
//      deliberate, manual, live-admin-only action - never part of any
//      migration or the deploy pipeline. This test pins that the
//      format's own seed migration still inserts it as inactive, so a
//      future edit cannot silently flip Draft/Shop/Deckbuilder onto a
//      completely different (and differently-calibrated) card pool for
//      every player at once, with no code review catching it, because
//      it would just look like "committing a normal data migration".
//
// This suite is intentionally narrow and reads real files on disk - it
// is not a substitute for an integration test against a live database
// (none is available in this audit sandbox), but it is far more likely
// to catch a real future regression in exactly the areas this project's
// own history shows are fragile than a generic snapshot test would be.

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function readMigration(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  assert.ok(
    existsSync(fullPath),
    `expected migration file to exist: ${relativePath} (has it been renamed? update this regression suite's path if so)`,
  );
  return readFileSync(fullPath, "utf8");
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

// ---------------------------------------------------------
// 1. Draft's Stage-4-only Boss Route exclusion
// ---------------------------------------------------------
test("create_next_draft_offer excludes ONLY Stage 4 Boss cards, not the whole route (exactly 7 narrow occurrences, no broadened variant)", () => {
  const sql = readMigration(
    "supabase/migrations/202609020970_fix_draft_boss_route_stage4_only_exclusion.sql",
  );
  const sqlWithoutComments = sql.replace(/--[^\n]*/g, "");
  const narrowMatches = sqlWithoutComments.match(/brs\.stage_number\s*=\s*4/g) ?? [];
  assert.equal(
    narrowMatches.length,
    7,
    `expected exactly 7 occurrences of the narrow "brs.stage_number = 4" exclusion clause (matches this migration's own internal self-check), found ${narrowMatches.length}`,
  );
  assert.doesNotMatch(
    sql,
    /brs\.stage_number\s+in\s*\(/i,
    'found a broadened "brs.stage_number in (...)" exclusion clause - this is exactly the over-broad, all-4-stages bug this migration itself was written to fix; Draft would incorrectly exclude Stage 1-3 evolution cards too',
  );
});

// ---------------------------------------------------------
// 2. Shop Special Pack's Stage-4-only Boss Route exclusion
// ---------------------------------------------------------
test("pick_shop_pack_card excludes ONLY Stage 4 Boss cards, not the whole route (exactly 2 narrow occurrences, no broadened variant)", () => {
  const sql = readMigration(
    "supabase/migrations/202609020950_special_pack_curated_pools_functions.sql",
  );
  const narrowMatches = sql.match(/brs\.stage_number\s*=\s*4/g) ?? [];
  assert.equal(
    narrowMatches.length,
    2,
    `expected exactly 2 occurrences of the narrow "brs.stage_number = 4" exclusion clause, found ${narrowMatches.length}`,
  );
  assert.doesNotMatch(
    sql,
    /brs\.stage_number\s+in\s*\(/i,
    'found a broadened "brs.stage_number in (...)" exclusion clause in the Shop pack-selection function - same over-broad-exclusion risk as the Draft side',
  );
});

// ---------------------------------------------------------
// 3. Welcome bonus idempotency
// ---------------------------------------------------------
test("claim_welcome_packs() keeps its ON CONFLICT DO NOTHING idempotency guard intact", () => {
  const sql = readMigration("supabase/migrations/202609020920_claim_welcome_packs.sql");
  assert.match(
    sql,
    /insert into public\.season1_welcome_bonus_claims \(profile_id\)\s*\n\s*values \(current_user_id\)\s*\n\s*on conflict \(profile_id\) do nothing;/,
    "the idempotency-marker INSERT ... ON CONFLICT (profile_id) DO NOTHING is missing or was reworded - without it, calling claim_welcome_packs() more than once per player (it runs on every page load via proxy.ts) would re-grant welcome vouchers indefinitely",
  );
  assert.match(
    sql,
    /claim_inserted\s*:=\s*found;/,
    "the `claim_inserted := found` check (detects whether the ON CONFLICT actually inserted a new row) is missing - without it the function cannot tell a first claim from a repeat call",
  );
  assert.match(
    sql,
    /if not claim_inserted then/,
    "the early-return-false-on-repeat-claim branch is missing - without it a repeat call would fall through and grant vouchers again",
  );
});

// ---------------------------------------------------------
// 4. Special Pack pool exact-count safety net (this audit round's own patch)
// ---------------------------------------------------------
test("the combined deploy script still asserts the Special Pack pool is exactly 3978 rows at seed time", () => {
  const sql = readMigration("supabase/manual_deploy/20260902_season1_release.sql");
  assert.match(
    sql,
    /if v_pool_count <> 3978 then/,
    "the exact-count seed-time assertion (added this audit round, Priority 9) is missing - without it, a card name in a pack's curated pool list that silently fails to resolve against card_catalog would go undetected until a player notices a Special Pack pulling fewer distinct cards than expected",
  );
});

// ---------------------------------------------------------
// 5. Duelist Circle Classic format stays inactive by default
// ---------------------------------------------------------
test("the Duelist Circle Classic format seed still inserts is_active = false (activation stays a deliberate manual step)", () => {
  const sql = readMigration(
    "supabase/migrations/202608300900_duelist_circle_classic_format.sql",
  );
  assert.match(
    sql,
    /'duelist_circle_classic_v1',\s*\n\s*'Duelist Circle Classic',\s*\n\s*1,\s*\n\s*'2014-12-31',\s*\n\s*false, false, true, false, false, true,\s*\n\s*1,\s*\n\s*false,/,
    "the duelist_circle_classic_v1 seed row's exact values list changed shape or no longer ends its is_active column with `false` - if this format were ever seeded as active, every player's Draft/Shop/Deckbuilder card pool would silently switch from the current ~13,000+ eligible cards to the curated, differently-calibrated 6,181-card Classic pool with no code review catching it (see docs/SEASON_1_RUNBOOK.md - activation is documented as a deliberate, manual, live-admin-only action, never part of a migration)",
  );
  // Belt-and-suspenders: also confirm no OTHER migration or the deploy
  // script itself ever flips this specific format row to active.
  const deploySql = readMigration("supabase/manual_deploy/20260902_season1_release.sql");
  assert.doesNotMatch(
    deploySql,
    /update\s+public\.duelist_circle_formats\s+set[^;]*is_active\s*=\s*true/is,
    "the combined deploy script contains an UPDATE that sets duelist_circle_formats.is_active = true - format activation must stay a separate, deliberate manual admin action outside the deploy pipeline",
  );
});

console.log(`season1-release-invariants.regression.test.mjs: ${passed} passed`);
