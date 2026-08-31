#!/usr/bin/env node
// =========================================================
// PHASE 1 LIVE VERIFICATION
//
// Read-only checks against the REAL live Supabase database. Never
// inserts/updates/deletes anything - every check is either a plain
// SELECT against an application table, or a call to the narrow,
// read-only public._phase1_verify_introspect() RPC (installed by
// section 8 of scripts/generated/LIVE_PHASE1_ROLLOUT_2026_08_31.sql)
// which itself only SELECTs from pg_proc/pg_indexes for a hardcoded
// set of names. Safe to run against production at any time,
// repeatedly.
//
// Usage:
//   node --env-file=.env.local scripts/verify-phase1-live.mjs
//
// Reads the same env vars every other live-DB script in this repo
// already uses (see scripts/audit-duelist-circle-classic.mjs):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
// A service-role/secret key is required (not the publishable/anon
// key): the introspection RPC's EXECUTE grant is restricted to
// service_role, and several application-table checks (manual rarity
// overrides, archetype registry) are simplest read unfiltered by RLS.
// =========================================================

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    "Missing Supabase env vars. Run with: node --env-file=.env.local scripts/verify-phase1-live.mjs"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];

function pass(name, detail) {
  results.push({ name, status: "PASS", detail });
}
function fail(name, detail) {
  results.push({ name, status: "FAIL", detail });
}
function warn(name, detail) {
  results.push({ name, status: "WARN", detail });
}

// ---------------------------------------------------------
// Introspection: Supabase's default PostgREST config does not
// expose pg_catalog (pg_proc/pg_indexes) directly to a REST/JS
// client, so function-existence/body and index checks go through
// public._phase1_verify_introspect() - a narrow, read-only,
// security-definer RPC installed by section 8 of
// scripts/generated/LIVE_PHASE1_ROLLOUT_2026_08_31.sql. RPC calls to
// public-schema functions always work over PostgREST regardless of
// exposed-schema settings. It only ever SELECTs from pg_proc/
// pg_indexes for a hardcoded set of names - no arbitrary SQL
// execution, nothing mutated.
// ---------------------------------------------------------

let introspection = null;
let introspectionError = null;

async function loadIntrospection() {
  const { data, error } = await supabase.rpc("_phase1_verify_introspect");
  if (error) {
    introspectionError = error;
    return;
  }
  introspection = data;
}

// ---------------------------------------------------------
// 1. CLASSIC FORMAT
// ---------------------------------------------------------

async function checkClassicFormat() {
  const { data, error } = await supabase
    .from("duelist_circle_formats")
    .select(
      "code,release_cutoff,allow_fusion,allow_xyz,allow_synchro,allow_pendulum,allow_link,allow_illusion,is_active"
    )
    .eq("code", "duelist_circle_classic_v1")
    .maybeSingle();

  if (error) {
    fail("Classic format row exists", `query error: ${error.message}`);
    return;
  }
  if (!data) {
    fail(
      "Classic format row exists",
      "no duelist_circle_formats row with code='duelist_circle_classic_v1' - run section 1-2 of the rollout SQL."
    );
    return;
  }
  pass("Classic format row exists", "duelist_circle_classic_v1 found");

  const cutoffOk = data.release_cutoff === "2014-12-31";
  (cutoffOk ? pass : fail)(
    "Classic format release_cutoff = 2014-12-31",
    `actual: ${data.release_cutoff}`
  );

  const mechanics = [
    ["allow_fusion", true],
    ["allow_xyz", true],
    ["allow_synchro", false],
    ["allow_pendulum", false],
    ["allow_link", false],
    ["allow_illusion", false],
  ];
  for (const [field, expected] of mechanics) {
    const ok = data[field] === expected;
    (ok ? pass : fail)(
      `Classic format ${field} = ${expected}`,
      `actual: ${data[field]}`
    );
  }

  if (data.is_active) {
    warn(
      "Classic format activation state",
      "is_active = true - this format is LIVE for players right now. If this is unexpected, someone activated it outside this rollout (the rollout itself never sets is_active)."
    );
  } else {
    pass(
      "Classic format activation state",
      "is_active = false (proposed only, as intended for Phase 1 - not a production switch)."
    );
  }
}

// ---------------------------------------------------------
// 2 & 3. MANUAL RARITY OVERRIDES (original 9 + round-2 6)
// ---------------------------------------------------------

const ORIGINAL_OVERRIDES = [
  ["Rescue Rabbit", "Super Rare"],
  ["Tragoedia", "Secret Rare"],
  ["Gorz the Emissary of Darkness", "Secret Rare"],
  ["Battle Fader", "Ultra Rare"],
  ["Swift Scarecrow", "Super Rare"],
  ["D.D. Crow", "Ultra Rare"],
  ["Effect Veiler", "Secret Rare"],
  ['Maxx "C"', "Ultra Rare"],
  ["Giant Trunade", "Ultra Rare"],
];

const ROUND2_OVERRIDES = [
  ["Doomcaliber Knight", "Secret Rare"],
  ["Rainbow Dragon", "Secret Rare"],
  ["Sorcerer of Dark Magic", "Secret Rare"],
  ["Superancient Deepsea King Coelacanth", "Secret Rare"],
  ["Arcana Force EX - The Light Ruler", "Legendary"],
  ["Arcana Force EX - The Dark Ruler", "Legendary"],
];

async function checkOverrides(label, list) {
  const names = list.map(([name]) => name);
  const { data, error } = await supabase
    .from("card_catalog")
    .select("name,game_rarity,rarity_manually_overridden")
    .in("name", names);

  if (error) {
    fail(label, `query error: ${error.message}`);
    return;
  }

  const byName = new Map((data ?? []).map((row) => [row.name, row]));

  for (const [name, expectedRarity] of list) {
    const row = byName.get(name);
    if (!row) {
      fail(`${label}: "${name}"`, "no card_catalog row with this exact name");
      continue;
    }
    if (!row.rarity_manually_overridden) {
      fail(
        `${label}: "${name}"`,
        `found but rarity_manually_overridden = false (game_rarity = ${row.game_rarity})`
      );
      continue;
    }
    if (row.game_rarity !== expectedRarity) {
      fail(
        `${label}: "${name}"`,
        `expected game_rarity = ${expectedRarity}, actual = ${row.game_rarity}`
      );
      continue;
    }
    pass(`${label}: "${name}"`, `${expectedRarity}, manually overridden`);
  }
}

// ---------------------------------------------------------
// 4. ARCHETYPE REGISTRY
// ---------------------------------------------------------

const EXPECTED_ARCHETYPE_CODES = [
  "dark_magician",
  "elemental_hero",
  "blue_eyes",
  "red_eyes",
  "cyber_dragon",
  "ancient_gear",
  "crystal_beast",
  "destiny_hero",
  "vampire",
  "jinzo",
];

async function checkArchetypeRegistry() {
  const { data: archetypes, error: archErr } = await supabase
    .from("archetype_registry")
    .select("id,code,name");

  if (archErr) {
    fail(
      "archetype_registry table reachable",
      `query error: ${archErr.message} - table likely does not exist yet, run section 3-4 of the rollout SQL.`
    );
    return;
  }
  pass("archetype_registry table reachable", `${archetypes.length} row(s)`);

  const codesFound = new Set(archetypes.map((a) => a.code));
  const missingCodes = EXPECTED_ARCHETYPE_CODES.filter((c) => !codesFound.has(c));
  if (archetypes.length === 10 && missingCodes.length === 0) {
    pass("Exactly the 10 intended archetypes exist", archetypes.map((a) => a.code).sort().join(", "));
  } else {
    fail(
      "Exactly the 10 intended archetypes exist",
      `found ${archetypes.length} row(s); missing: ${missingCodes.join(", ") || "none"}; unexpected extra codes: ${[...codesFound].filter((c) => !EXPECTED_ARCHETYPE_CODES.includes(c)).join(", ") || "none"}`
    );
  }

  for (const code of ["blue_eyes", "elemental_hero", "dark_magician"]) {
    const found = archetypes.find((a) => a.code === code);
    (found ? pass : fail)(
      `Core registry query returns "${code}"`,
      found ? found.name : "not found"
    );
  }

  const { data: cards, error: cardsErr } = await supabase
    .from("archetype_cards")
    .select("archetype_id,card_catalog_id,extra_deck_kind");

  if (cardsErr) {
    fail(
      "archetype_cards table reachable",
      `query error: ${cardsErr.message}`
    );
    return;
  }

  if (cards.length === 255) {
    pass("Archetype card relationships exist", `${cards.length} row(s) (expected 255)`);
  } else {
    warn(
      "Archetype card relationships exist",
      `${cards.length} row(s) found, expected 255 - if this is fewer, some card names in the seed did not match your live catalog (check Postgres NOTICEs from the rollout run).`
    );
  }

  const pairKey = (row) => `${row.archetype_id}::${row.card_catalog_id}`;
  const seen = new Map();
  for (const row of cards) {
    const key = pairKey(row);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dupes = [...seen.values()].filter((count) => count > 1).length;
  (dupes === 0 ? pass : fail)(
    "No duplicate archetype_cards relationship rows",
    dupes === 0 ? "none found" : `${dupes} duplicate (archetype_id, card_catalog_id) pair(s) found`
  );

  const badKinds = cards.filter(
    (row) => row.extra_deck_kind !== null && !["FUSION", "XYZ"].includes(row.extra_deck_kind)
  );
  (badKinds.length === 0 ? pass : fail)(
    "No Synchro/Pendulum/Link extra_deck_kind values present",
    badKinds.length === 0
      ? "every extra_deck_kind is FUSION, XYZ, or null (DB CHECK constraint enforces this structurally)"
      : `${badKinds.length} row(s) with an unexpected extra_deck_kind - this should be impossible under the schema's CHECK constraint, investigate immediately`
  );
}

// ---------------------------------------------------------
// Function-body introspection (round rewards, match DP,
// auto-finalization, Legendary scarcity) via the RPC helper.
// ---------------------------------------------------------

async function checkRoundRewardsAndFinalization() {
  if (introspectionError || !introspection) {
    warn(
      "Function/index introspection (round rewards, auto-finalization, Legendary fix, idempotency indexes)",
      `could not call public._phase1_verify_introspect() (${introspectionError?.message ?? "no data returned"}) - run section 8 of the rollout SQL, then re-run this script. Manual fallback: in the SQL Editor, select proname from pg_proc where proname in ('settle_round_rewards_v2','settle_competition_if_complete_v2','install_default_round_rewards_v2','purchase_shop_pack','_compute_league_match_reward','submit_competition_match_result_v2');`
    );
    return;
  }

  const functionExistence = introspection.functions ?? {};
  for (const fnName of [
    "settle_round_rewards_v2",
    "settle_competition_if_complete_v2",
    "install_default_round_rewards_v2",
    "purchase_shop_pack",
    "_compute_league_match_reward",
    "submit_competition_match_result_v2",
  ]) {
    const exists = Boolean(functionExistence[fnName]);
    (exists ? pass : fail)(
      `Function exists: ${fnName}`,
      exists ? "found in pg_proc" : "NOT FOUND - required migration section did not apply"
    );
  }

  const byName = introspection.sources ?? {};

  const roundDefaults = byName["install_default_round_rewards_v2"];
  if (roundDefaults) {
    const hasParticipation = roundDefaults.includes("250") && roundDefaults.includes("premium_pack");
    const hasWinner = roundDefaults.includes("150") && roundDefaults.includes("normal_pack");
    (hasParticipation && hasWinner ? pass : fail)(
      "Round-reward economy correction is live",
      hasParticipation && hasWinner
        ? "install_default_round_rewards_v2 grants 250 DP + premium_pack (participation) and 150 DP + normal_pack (round_winner)"
        : "install_default_round_rewards_v2 does not contain the expected corrected literals - the economy-correction migration may not have applied"
    );
  }

  const matchDp = byName["_compute_league_match_reward"];
  if (matchDp) {
    pass(
      "Match DP formula (informational, not asserted against a single 'correct' value)",
      `_compute_league_match_reward source contains: ${["100", "75", "50"].filter((n) => matchDp.includes(n)).join(", ")} - cross-check manually against the intended win/draw/loss values`
    );
  }

  const submitFn = byName["submit_competition_match_result_v2"];
  if (submitFn) {
    const callsRound = submitFn.includes("settle_round_rewards_v2");
    const callsFinal = submitFn.includes("settle_competition_if_complete_v2");
    (callsRound && callsFinal ? pass : fail)(
      "Match result submission wired to auto-settlement",
      `submit_competition_match_result_v2 calls settle_round_rewards_v2: ${callsRound}; calls settle_competition_if_complete_v2: ${callsFinal}`
    );
  }

  const packFn = byName["purchase_shop_pack"];
  if (packFn) {
    const hasFixMarker = packFn.includes("LEAGUE-WIDE LEGENDARY SCARCITY FIX");
    (hasFixMarker ? pass : fail)(
      "Legendary league-wide scarcity fix is live",
      hasFixMarker
        ? "purchase_shop_pack contains the league-wide Legendary count branch"
        : "purchase_shop_pack does NOT contain the league-wide fix marker - the fix migration may not have applied yet"
    );
  }
}

// ---------------------------------------------------------
// Idempotency: partial unique indexes
// ---------------------------------------------------------

async function checkIdempotencyIndexes() {
  const expectedIndexes = [
    "duel_point_transactions_match_reason_unique",
    "competition_reward_grants_active_unique",
    "competition_round_reward_grants_active_unique",
  ];

  if (introspectionError || !introspection) {
    warn(
      "Idempotency indexes present",
      `could not call public._phase1_verify_introspect() (${introspectionError?.message ?? "no data returned"}) - verify manually: select indexname from pg_indexes where indexname in (${expectedIndexes.map((n) => `'${n}'`).join(", ")});`
    );
    return;
  }

  const indexExistence = introspection.indexes ?? {};
  for (const idx of expectedIndexes) {
    const exists = Boolean(indexExistence[idx]);
    (exists ? pass : fail)(
      `Idempotency index: ${idx}`,
      exists ? "present" : "MISSING - duplicate-grant protection is not in place for this system"
    );
  }
}

// ---------------------------------------------------------
// Pack system: reward grants resolve to real inventory, not a
// fake text label.
// ---------------------------------------------------------

async function checkPackSystem() {
  const { data, error } = await supabase
    .from("shop_pack_types")
    .select("code,price_dp,cards_per_pack")
    .in("code", ["normal", "premium", "deluxe"]);

  if (error) {
    fail("Pack types exist (normal/premium/deluxe)", `query error: ${error.message}`);
    return;
  }

  const found = new Map((data ?? []).map((r) => [r.code, r]));
  for (const code of ["normal", "premium", "deluxe"]) {
    const row = found.get(code);
    (row ? pass : fail)(
      `Pack type "${code}" resolves to a real shop_pack_types row`,
      row ? `price_dp=${row.price_dp}, cards_per_pack=${row.cards_per_pack}` : "not found"
    );
  }
}

// ---------------------------------------------------------
// RUN ALL CHECKS
// ---------------------------------------------------------

async function main() {
  console.log("Connecting to Supabase and running checks...");
  await loadIntrospection();
  await checkClassicFormat();
  await checkOverrides("Original rarity override", ORIGINAL_OVERRIDES);
  await checkOverrides("Round-2 rarity override", ROUND2_OVERRIDES);
  await checkArchetypeRegistry();
  await checkRoundRewardsAndFinalization();
  await checkIdempotencyIndexes();
  await checkPackSystem();

  console.log("\nPHASE 1 LIVE VERIFICATION\n");
  let failCount = 0;
  let warnCount = 0;
  for (const r of results) {
    const tag = r.status === "PASS" ? "[PASS]" : r.status === "WARN" ? "[WARN]" : "[FAIL]";
    console.log(`${tag} ${r.name} — ${r.detail}`);
    if (r.status === "FAIL") failCount += 1;
    if (r.status === "WARN") warnCount += 1;
  }

  console.log(
    `\n${results.length} check(s): ${results.length - failCount - warnCount} passed, ${warnCount} warning(s), ${failCount} failed.`
  );

  if (failCount > 0) {
    console.log("\nOVERALL: FAIL - see [FAIL] lines above.");
    process.exitCode = 1;
  } else if (warnCount > 0) {
    console.log("\nOVERALL: PASS WITH WARNINGS - see [WARN] lines above (usually a pg_catalog access limitation, not a data problem).");
  } else {
    console.log("\nOVERALL: PASS");
  }
}

main().catch((err) => {
  console.error("Verification script crashed:", err);
  process.exit(1);
});
