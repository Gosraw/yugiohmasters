// src/lib/boss-identity.regression.test.mjs
//
// Plain node:assert/strict regression suite for getPrimaryBossIdentity /
// getPrimaryBossIdentities (src/lib/boss-identity.ts) - run directly with
// `node src/lib/boss-identity.regression.test.mjs` (vitest itself cannot
// run in this sandbox - see lib/archetype-registry.regression.test.mjs
// for the same established pattern and root cause: a broken optional
// native dependency for the installed rollup version, unrelated to this
// repo's own code).
//
// WHY THIS SUITE EXISTS (Season 1 audit round 2, Priority 10)
// boss-identity.ts was added earlier in this same Season 1 audit
// (Priority 1) to fix a real, live bug: 7 player-facing pages (matches,
// league, trades, profile, AI companion, and others) were showing
// "Unbound" / "Identity Not Yet Chosen" for players who had already
// chosen and were actively progressing a real Boss Route, because they
// were reading the old, disconnected profiles.boss_monster_option_id
// field instead of player_boss_paths. That fix shipped with zero
// automated test coverage. This suite is the regression test that
// should have existed from the start - it locks in the corrected
// behavior (including several null-handling edge cases the source
// file's own doc comments call out) so a future change to this shared
// helper cannot silently reintroduce the same "Unbound" bug on all 7
// pages at once.
//
// APPROACH
// A tiny fake Supabase client that mimics exactly the
// .from(table).select(cols).in(field, values).eq(field, value) chain
// boss-identity.ts calls, backed by in-memory fixture rows - no network,
// no live database (none is available in this audit sandbox).

import assert from "node:assert/strict";
import { getPrimaryBossIdentity, getPrimaryBossIdentities } from "./boss-identity.ts";

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

// ---------------------------------------------------------
// Fake Supabase client
// ---------------------------------------------------------
function makeFakeSupabase(tables) {
  return {
    from(table) {
      const rows = tables[table] ?? [];
      const state = { rows, filters: [] };
      const builder = {
        select() {
          return builder;
        },
        in(field, values) {
          state.rows = state.rows.filter((r) => values.includes(r[field]));
          return builder;
        },
        eq(field, value) {
          state.rows = state.rows.filter((r) => r[field] === value);
          // Terminal call in every boss-identity.ts query chain -
          // resolve here like the real (thenable) Supabase builder.
          return Promise.resolve({ data: state.rows, error: null });
        },
        then(resolve) {
          // boss_routes / card_catalog queries never call .eq() - only
          // .in() - so the chain must also be awaitable without .eq().
          resolve({ data: state.rows, error: null });
        },
      };
      return builder;
    },
  };
}

const FIXTURE = {
  player_boss_paths: [
    { profile_id: "p-bossg", route_id: "r-dark-magician", current_stage: 3, route_slot: 1 },
    { profile_id: "p-bossg", route_id: "r-side-route", current_stage: 1, route_slot: 2 },
    { profile_id: "p-samo", route_id: "r-cyber-dragon", current_stage: 1, route_slot: 1 },
    { profile_id: "p-fardin", route_id: "r-harpie", current_stage: 4, route_slot: 1 },
    // p-no-card: route/stage exist but the stage's card can't be
    // resolved (simulates a data gap) - must be excluded, not throw.
    { profile_id: "p-no-card", route_id: "r-broken", current_stage: 1, route_slot: 1 },
  ],
  boss_routes: [
    { id: "r-dark-magician", name: "Dark Magician / Magician Girl" },
    { id: "r-cyber-dragon", name: "Cyber Dragon" },
    { id: "r-harpie", name: "Harpie" },
    { id: "r-broken", name: "Broken Route" },
  ],
  boss_route_stages: [
    { route_id: "r-dark-magician", stage_number: 3, evolution_card_catalog_id: "c-dm-chaos" },
    { route_id: "r-cyber-dragon", stage_number: 1, evolution_card_catalog_id: "c-proto-cyber" },
    { route_id: "r-harpie", stage_number: 4, evolution_card_catalog_id: "c-harpie-ffb" },
    // r-broken has no stage 1 row at all - current_stage lookup misses.
  ],
  card_catalog: [
    { id: "c-dm-chaos", name: "Dark Magician of Chaos", image_url: "dm-chaos.png" },
    { id: "c-proto-cyber", name: "Proto-Cyber Dragon", image_url: null },
    { id: "c-harpie-ffb", name: "Harpie's Pet Dragon - Fearsome Fire Blast", image_url: "hpd.png" },
  ],
};

// ---------------------------------------------------------
// Tests
// ---------------------------------------------------------

await test("getPrimaryBossIdentity resolves a single player's route_slot=1 identity", async () => {
  const supabase = makeFakeSupabase(FIXTURE);
  const identity = await getPrimaryBossIdentity(supabase, "p-bossg");
  assert.ok(identity, "expected a resolved identity, got null");
  assert.equal(identity.name, "Dark Magician of Chaos");
  assert.equal(identity.currentStage, 3);
  assert.equal(identity.routeName, "Dark Magician / Magician Girl");
  assert.equal(identity.subtitle, "Dark Magician / Magician Girl · Stage 3 of 4");
  assert.equal(identity.imageUrl, "dm-chaos.png");
});

await test("getPrimaryBossIdentity only ever looks at route_slot=1 (ignores a second/third slot)", async () => {
  // p-bossg also has a route_slot=2 row (r-side-route) in the fixture -
  // if the eq('route_slot', 1) filter were ever dropped, the batched
  // lookup could pick up the wrong route for a player with multiple
  // slots unlocked. This directly exercises that filter.
  const supabase = makeFakeSupabase(FIXTURE);
  const identity = await getPrimaryBossIdentity(supabase, "p-bossg");
  assert.equal(identity.routeName, "Dark Magician / Magician Girl");
  assert.notEqual(identity.routeName, "Broken Route");
});

await test("getPrimaryBossIdentity returns null for a player with no player_boss_paths row", async () => {
  const supabase = makeFakeSupabase(FIXTURE);
  const identity = await getPrimaryBossIdentity(supabase, "p-nobody");
  assert.equal(identity, null);
});

await test("getPrimaryBossIdentity returns null (not a throw) when the stage's card cannot be resolved", async () => {
  // Mirrors the source file's own doc comment: "Returns null ... if the
  // route/stage/card data cannot be resolved (mirrors Home's own
  // null-handling)". This is the single most important behavior this
  // helper exists to preserve - the original bug this replaced showed
  // "Unbound" instead of crashing, so this replacement must degrade the
  // same way, not throw and break the page.
  const supabase = makeFakeSupabase(FIXTURE);
  const identity = await getPrimaryBossIdentity(supabase, "p-no-card");
  assert.equal(identity, null);
});

await test("getPrimaryBossIdentities batches multiple players in one call and dedupes profileIds", async () => {
  const supabase = makeFakeSupabase(FIXTURE);
  const identities = await getPrimaryBossIdentities(supabase, [
    "p-bossg",
    "p-samo",
    "p-fardin",
    "p-samo", // duplicate on purpose
  ]);
  assert.equal(identities.size, 3);
  assert.equal(identities.get("p-bossg").name, "Dark Magician of Chaos");
  assert.equal(identities.get("p-samo").name, "Proto-Cyber Dragon");
  assert.equal(identities.get("p-fardin").name, "Harpie's Pet Dragon - Fearsome Fire Blast");
});

await test("getPrimaryBossIdentities omits players whose identity could not be resolved, without dropping the others", async () => {
  const supabase = makeFakeSupabase(FIXTURE);
  const identities = await getPrimaryBossIdentities(supabase, ["p-bossg", "p-no-card", "p-nobody"]);
  assert.equal(identities.size, 1);
  assert.ok(identities.has("p-bossg"));
  assert.ok(!identities.has("p-no-card"));
  assert.ok(!identities.has("p-nobody"));
});

await test("getPrimaryBossIdentities returns an empty map for an empty/falsy input list (no query fired)", async () => {
  const supabase = makeFakeSupabase(FIXTURE);
  const identities = await getPrimaryBossIdentities(supabase, []);
  assert.equal(identities.size, 0);
});

await test("subtitle falls back to stage-only text when the route name is somehow missing", async () => {
  const fixtureNoRouteName = {
    ...FIXTURE,
    boss_routes: FIXTURE.boss_routes.filter((r) => r.id !== "r-cyber-dragon"),
  };
  const supabase = makeFakeSupabase(fixtureNoRouteName);
  const identity = await getPrimaryBossIdentity(supabase, "p-samo");
  assert.equal(identity.routeName, null);
  assert.equal(identity.subtitle, "Stage 1 of 4");
});

console.log(`boss-identity.regression.test.mjs: ${passed} passed`);
