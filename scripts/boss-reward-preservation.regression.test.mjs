// Regression test: guards the Boss Route reward-card preservation
// safeguard added in the Season 1 audit round-3 (2026-09-02) pass.
//
// WHY THIS TEST EXISTS
// The user's explicit, critical requirement: changing boss route
// CONFIGURATION (boss_route_stages / boss_route_stage_grants /
// stage identities / support grants) must NEVER retroactively grant
// additional cards to existing players, and existing Boss Route
// reward cards must be grandfathered untouched. This is enforced by
// a PRE-DEPLOY snapshot + POST-DEPLOY assertion pair in
// supabase/manual_deploy/20260902_season1_release.sql, plus a
// standalone confirmation check (#20) in
// supabase/manual_deploy/20260902_post_deploy_smoke_test.sql. This
// test statically re-verifies the shape of that safeguard so a
// future edit to either file can't silently weaken or remove it
// without failing CI.

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

const releasePath = 'supabase/manual_deploy/20260902_season1_release.sql';
const smokeTestPath = 'supabase/manual_deploy/20260902_post_deploy_smoke_test.sql';
const release = readFileSync(releasePath, 'utf8');
const smokeTest = readFileSync(smokeTestPath, 'utf8');

test('release script creates the pre-deploy boss reward snapshot temp table', () => {
  assert.match(
    release,
    /create temporary table pre_deploy_boss_reward_snapshot on commit drop as/,
  );
});

test('pre-deploy boss reward snapshot scopes reward cards via original_source_id -> player_boss_paths, not acquisition_type alone', () => {
  const idx = release.indexOf('create temporary table pre_deploy_boss_reward_snapshot');
  assert.ok(idx !== -1, 'snapshot table not found');
  const chunk = release.slice(idx, idx + 2500);
  assert.match(chunk, /join public\.player_boss_paths pbp2 on pbp2\.id = ci\.original_source_id/);
  assert.match(chunk, /ci\.original_acquisition_type = 'achievement'/);
});

test('release script has exactly one post_boss_reward_preservation block that raises exception on any change', () => {
  const matches = release.match(/do \$post_boss_reward_preservation\$/g) || [];
  assert.equal(matches.length, 1, `expected exactly 1 occurrence, found ${matches.length}`);
  const idx = release.indexOf('do $post_boss_reward_preservation$');
  const endIdx = release.indexOf('end $post_boss_reward_preservation$;');
  assert.ok(idx !== -1 && endIdx !== -1 && endIdx > idx, 'block start/end not found');
  const block = release.slice(idx, endIdx);
  assert.match(block, /raise exception 'POST-DEPLOY ABORTED/);
});

test('post_boss_reward_preservation block never READS FROM boss_route_stages or boss_route_stage_grants (config-change exception) - a mention inside the human-readable error message text is fine, an actual table reference is not', () => {
  const idx = release.indexOf('do $post_boss_reward_preservation$');
  const endIdx = release.indexOf('end $post_boss_reward_preservation$;');
  const block = release.slice(idx, endIdx);
  // Strip the raise notice/exception string literals first, since the
  // explanatory error text legitimately names these config tables in
  // prose (e.g. "...boss_route_stages/boss_route_stage_grants
  // CONFIGURATION change alone..."); what must never appear is an
  // actual SQL reference to either table (from/join/into/update).
  const withoutStringLiterals = block.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  assert.doesNotMatch(withoutStringLiterals, /\b(?:from|join|into|update)\s+(?:public\.)?boss_route_stages\b/i);
  assert.doesNotMatch(withoutStringLiterals, /\b(?:from|join|into|update)\s+(?:public\.)?boss_route_stage_grants\b/i);
});

test('pre-deploy boss reward snapshot also never READS FROM boss_route_stages or boss_route_stage_grants', () => {
  const idx = release.indexOf('create temporary table pre_deploy_boss_reward_snapshot');
  const nextDo = release.indexOf('do $preflight_boss_reward_snapshot_notice$');
  const chunk = release.slice(idx, nextDo === -1 ? idx + 3000 : nextDo);
  const withoutStringLiterals = chunk.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  assert.doesNotMatch(withoutStringLiterals, /\b(?:from|join|into|update)\s+(?:public\.)?boss_route_stages\b/i);
  assert.doesNotMatch(withoutStringLiterals, /\b(?:from|join|into|update)\s+(?:public\.)?boss_route_stage_grants\b/i);
});

test('release script still has exactly one begin;/commit; pair (single-transaction deploy preserved)', () => {
  const begins = release.match(/^begin;$/gm) || [];
  const commits = release.match(/^commit;$/gm) || [];
  assert.equal(begins.length, 1, `expected 1 'begin;', found ${begins.length}`);
  assert.equal(commits.length, 1, `expected 1 'commit;', found ${commits.length}`);
});

test('post-deploy boss reward preservation block appears after the pre-deploy snapshot in file order', () => {
  const snapIdx = release.indexOf('create temporary table pre_deploy_boss_reward_snapshot');
  const checkIdx = release.indexOf('do $post_boss_reward_preservation$');
  assert.ok(snapIdx !== -1 && checkIdx !== -1 && checkIdx > snapIdx);
});

test('smoke test has a check 20 confirming zero existing players gained Boss Path cards during deployment', () => {
  assert.match(
    smokeTest,
    /'20\. zero existing players gained Boss Path cards during deployment' as check_name/,
  );
});

test('smoke test check 20 also scopes to original_source_id -> player_boss_paths (same precise scoping as the deploy script)', () => {
  const idx = smokeTest.indexOf("'20. zero existing players gained Boss Path cards during deployment'");
  const chunk = smokeTest.slice(idx, idx + 2000);
  assert.match(chunk, /join public\.player_boss_paths pbp2 on pbp2\.id = ci\.original_source_id/);
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
console.log(`boss-reward-preservation.regression.test.mjs: ${passed}/${results.length} passed`);
if (passed !== results.length) process.exit(1);
