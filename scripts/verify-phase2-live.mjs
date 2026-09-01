#!/usr/bin/env node
// =========================================================
// PHASE 2 LIVE VERIFICATION
//
// Read-only checks against the REAL live Supabase database. Never
// inserts/updates/deletes anything - every check is either a plain
// SELECT against an application table, or a call to the narrow,
// read-only public._phase2_verify_introspect() RPC (installed by
// supabase/migrations/202608311300_phase2_verify_introspect_helper.sql)
// which itself only SELECTs from pg_proc/pg_constraint and the new
// economy tables. Safe to run against production at any time,
// repeatedly.
//
// Usage:
//   node --env-file=.env.local scripts/verify-phase2-live.mjs
//
// Reads the same env vars every other live-DB script in this repo
// already uses (see scripts/verify-phase1-live.mjs):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
// A service-role/secret key is required (not the publishable/anon
// key): the introspection RPC's EXECUTE grant is restricted to
// service_role.
//
// Run this AFTER applying, in order:
//   202608311100_phase2_economy_central_config_and_round_rewards.sql
//   202608311200_phase2_pack_price_correction.sql
//   202608311300_phase2_verify_introspect_helper.sql
// (or the combined Phase 2 rollout script, once assembled).
// =========================================================

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    "Missing Supabase env vars. Run with: node --env-file=.env.local scripts/verify-phase2-live.mjs"
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
// Introspection: public._phase2_verify_introspect() - a narrow,
// read-only, security-definer RPC. Only ever SELECTs from
// pg_proc/pg_constraint for a hardcoded set of names, plus the new
// economy tables themselves - no arbitrary SQL execution, nothing
// mutated.
// ---------------------------------------------------------

let introspection = null;
let introspectionError = null;

async function loadIntrospection() {
  const { data, error } = await supabase.rpc("_phase2_verify_introspect");
  if (error) {
    introspectionError = error;
    return;
  }
  introspection = data;
}

// ---------------------------------------------------------
// 1. league_economy_defaults - the new single source of truth for
// match DP and round rewards.
// ---------------------------------------------------------

const EXPECTED_DEFAULTS = {
  match_win_dp: 100,
  match_draw_dp: 75,
  match_loss_dp: 75,
  round_participation_dp: 250,
  round_participation_voucher_type: "premium_pack",
  round_participation_voucher_quantity: 1,
  round_first_dp: 150,
  round_first_voucher_type: "normal_pack",
  round_first_voucher_quantity: 1,
  round_second_dp: 75,
};

function checkEconomyDefaults() {
  if (introspectionError || !introspection) {
    warn(
      "league_economy_defaults matches human-approved baseline",
      `could not call public._phase2_verify_introspect() (${introspectionError?.message ?? "no data returned"}) - run 202608311300_phase2_verify_introspect_helper.sql, then re-run this script. Manual fallback: select * from public.league_economy_defaults;`
    );
    return;
  }

  const row = introspection.league_economy_defaults;
  if (!row) {
    fail(
      "league_economy_defaults row exists",
      "no row returned - run 202608311100_phase2_economy_central_config_and_round_rewards.sql (it seeds exactly one row via insert ... on conflict do nothing)."
    );
    return;
  }
  pass("league_economy_defaults row exists", "singleton row found");

  for (const [field, expected] of Object.entries(EXPECTED_DEFAULTS)) {
    const actual = row[field];
    const ok = actual === expected;
    (ok ? pass : fail)(
      `league_economy_defaults.${field} = ${expected}`,
      `actual: ${actual}`
    );
  }
}

// ---------------------------------------------------------
// 2. shop_pack_types - corrected prices (Section 2 baseline).
// ---------------------------------------------------------

async function checkPackPrices() {
  const { data, error } = await supabase
    .from("shop_pack_types")
    .select("code,price_dp,cards_per_pack")
    .in("code", ["normal", "premium", "deluxe"]);

  if (error) {
    fail("Pack shop prices reachable", `query error: ${error.message}`);
    return;
  }

  const expected = { normal: 300, premium: 900, deluxe: 1500 };
  const found = new Map((data ?? []).map((r) => [r.code, r]));
  for (const [code, expectedPrice] of Object.entries(expected)) {
    const row = found.get(code);
    if (!row) {
      fail(`Pack shop price: ${code}`, "no shop_pack_types row with this code");
      continue;
    }
    const ok = row.price_dp === expectedPrice;
    (ok ? pass : fail)(
      `Pack shop price: ${code} = ${expectedPrice} DP`,
      `actual: ${row.price_dp} DP`
    );
  }
}

// ---------------------------------------------------------
// 3. Active special pack rotation prices = 1200 (Section 2).
// ---------------------------------------------------------

async function checkSpecialPackPrices() {
  const { data, error } = await supabase
    .from("shop_special_pack_rotations")
    .select("theme_category,price_dp,status,ends_at")
    .eq("status", "active");

  if (error) {
    fail("Active special pack rotations reachable", `query error: ${error.message}`);
    return;
  }

  if (!data || data.length === 0) {
    warn(
      "Active special pack rotations exist",
      "no rows with status='active' - call public.ensure_shop_rotations_current() to populate, then re-run this script."
    );
    return;
  }

  for (const row of data) {
    const ok = row.price_dp === 1200;
    (ok ? pass : fail)(
      `Active special pack price (${row.theme_category})`,
      ok ? "1200 DP" : `expected 1200 DP, actual: ${row.price_dp} DP`
    );
  }
}

// ---------------------------------------------------------
// 4. Function-body introspection: match DP formula now reads from
// league_economy_defaults; round rewards install 3 roles; special
// pack refresh writes 1200.
// ---------------------------------------------------------

function checkFunctionSources() {
  if (introspectionError || !introspection) {
    warn(
      "Function/constraint introspection (economy centralization, 3-tier round rewards, special pack price)",
      `could not call public._phase2_verify_introspect() (${introspectionError?.message ?? "no data returned"}) - manual fallback: select prosrc from pg_proc where proname in ('settle_round_rewards_v2','install_default_round_rewards_v2','_compute_league_match_reward','refresh_shop_special_pack_rotation_if_needed');`
    );
    return;
  }

  const functionExistence = introspection.functions ?? {};
  for (const fnName of [
    "settle_round_rewards_v2",
    "install_default_round_rewards_v2",
    "_compute_league_match_reward",
    "refresh_shop_special_pack_rotation_if_needed",
    "roll_shop_pack_rarity",
    "pick_shop_pack_card",
    "purchase_shop_pack",
    "ensure_shop_rotations_current",
  ]) {
    const exists = Boolean(functionExistence[fnName]);
    (exists ? pass : fail)(
      `Function exists: ${fnName}`,
      exists ? "found in pg_proc" : "NOT FOUND - required migration section did not apply"
    );
  }

  const byName = introspection.sources ?? {};

  const matchDp = byName["_compute_league_match_reward"];
  if (matchDp) {
    const readsFromConfig = matchDp.includes("league_economy_defaults");
    (readsFromConfig ? pass : fail)(
      "_compute_league_match_reward reads from league_economy_defaults",
      readsFromConfig
        ? "function body references league_economy_defaults (centralized, not hardcoded)"
        : "function body does NOT reference league_economy_defaults - still hardcoded, centralization migration may not have applied"
    );
  }

  const installFn = byName["install_default_round_rewards_v2"];
  if (installFn) {
    const hasThreeRoles =
      installFn.includes("round_runner_up") &&
      installFn.includes("round_winner") &&
      installFn.includes("participation");
    (hasThreeRoles ? pass : fail)(
      "install_default_round_rewards_v2 installs all 3 round-reward roles",
      hasThreeRoles
        ? "participation, round_winner, and round_runner_up all present"
        : "one or more of participation/round_winner/round_runner_up missing from function body"
    );
  }

  const settleFn = byName["settle_round_rewards_v2"];
  if (settleFn) {
    const usesCompetitionPlayers = settleFn.includes("competition_players");
    (usesCompetitionPlayers ? pass : fail)(
      "settle_round_rewards_v2 derives participation from competition_players (bye-player fix)",
      usesCompetitionPlayers
        ? "function body references competition_players for the participation loop"
        : "function body does not reference competition_players - the bye-player participation fix may not have applied (participation may still be derived from match rows only, silently excluding bye players)"
    );

    const hasRunnerUpRole = settleFn.includes("round_runner_up");
    (hasRunnerUpRole ? pass : fail)(
      "settle_round_rewards_v2 grants a round_runner_up bonus",
      hasRunnerUpRole
        ? "function body contains round_runner_up handling"
        : "function body does not mention round_runner_up - 2nd-place bonus may not be implemented"
    );
  }

  const rotationFn = byName["refresh_shop_special_pack_rotation_if_needed"];
  if (rotationFn) {
    const has1200 = rotationFn.includes("1200");
    (has1200 ? pass : fail)(
      "refresh_shop_special_pack_rotation_if_needed writes the corrected 1200 DP price",
      has1200
        ? "function body contains the literal 1200"
        : "function body does not contain 1200 - price-correction migration may not have applied"
    );
  }

  const rarityFn = byName["roll_shop_pack_rarity"];
  if (rarityFn) {
    const correctedLiterals = ["99.7", "99.5", "0.30", "0.50"];
    const missing = correctedLiterals.filter((lit) => !rarityFn.includes(lit));
    (missing.length === 0 ? pass : fail)(
      "roll_shop_pack_rarity contains the corrected Legendary-odds literals (Premium 0.30%/threshold 99.7, Deluxe 0.50%/threshold 99.5)",
      missing.length === 0
        ? "all corrected literals found in function body"
        : `missing literal(s) in function body: ${missing.join(", ")} - the Legendary-odds correction migration (202608311400) may not have applied`
    );
  }
}

// ---------------------------------------------------------
// 7. Special pack rotation structure: the 3rd category
// (monster_type), the pre-populated slot table, and the two
// correctness fixes to the pack-purchase/card-pick path
// (league-wide Legendary copy-limit check inside pick_shop_pack_card,
// and special_monster_type support in purchase_shop_pack).
// ---------------------------------------------------------

function checkSpecialPackRotationSystem() {
  if (introspectionError || !introspection) {
    warn(
      "Special pack rotation system (3rd category, slot table, league-wide Legendary fix)",
      `could not call public._phase2_verify_introspect() (${introspectionError?.message ?? "no data returned"}) - run 202608311400_phase2_special_pack_rotation_and_legendary_odds.sql, then re-run this script.`
    );
    return;
  }

  const checks = introspection.purchase_shop_pack_checks ?? {};
  (checks.supports_special_monster_type ? pass : fail)(
    "purchase_shop_pack supports the special_monster_type pack code",
    checks.supports_special_monster_type
      ? "function body references special_monster_type"
      : "function body does not reference special_monster_type - the 3rd special-pack-category migration may not have applied"
  );
  (checks.has_league_wide_legendary_fix ? pass : fail)(
    "purchase_shop_pack retains the league-wide Legendary scarcity fix",
    checks.has_league_wide_legendary_fix
      ? "function body contains the league-wide scarcity fix marker"
      : "function body does not contain the expected marker - check purchase_shop_pack was not accidentally reverted to an earlier definition"
  );

  const pickCardFn = (introspection.sources ?? {})["pick_shop_pack_card"];
  if (pickCardFn) {
    const hasLeagueWideCheck =
      pickCardFn.includes("current_league_id") && pickCardFn.includes("instance.league_id");
    (hasLeagueWideCheck ? pass : fail)(
      "pick_shop_pack_card enforces league-wide (not per-player) copy limit for Legendary cards",
      hasLeagueWideCheck
        ? "function body resolves current_league_id and checks instance.league_id for Legendary candidates"
        : "function body does not show the league-wide Legendary check - the pick_shop_pack_card bugfix in 202608311400 may not have applied, which can cause narrow-theme special packs to spuriously fail to purchase"
    );
  }

  const slotCounts = introspection.special_pack_slot_counts ?? {};
  for (const category of ["attribute", "archetype", "monster_type"]) {
    const count = slotCounts[category] ?? 0;
    (count > 0 ? pass : fail)(
      `shop_special_pack_slots has configured slots for '${category}'`,
      count > 0 ? `${count} slot(s) configured` : "0 slots found - run 202608311400's slot-population inserts (they are idempotent, safe to re-run)"
    );
  }

  const activeCategories = introspection.active_special_pack_categories ?? [];
  const hasMonsterType = activeCategories.includes("monster_type");
  (hasMonsterType ? pass : warn)(
    "An active rotation currently exists for the 'monster_type' category",
    hasMonsterType
      ? `active categories: ${activeCategories.join(", ")}`
      : `active categories seen: ${activeCategories.length ? activeCategories.join(", ") : "(none)"} - rotations refresh lazily on next access via ensure_shop_rotations_current(); not a failure if this endpoint simply hasn't been hit yet since the migration applied`
  );

  const constraints = introspection.constraints ?? {};
  const themeConstraints = Object.entries(constraints).filter(
    ([key]) => key.startsWith("shop_special_pack_rotations.") || key.startsWith("shop_special_pack_slots.")
  );
  if (themeConstraints.length === 0) {
    warn(
      "theme_category check constraints widened to include 'monster_type'",
      "no matching constraint found via introspection - could not verify"
    );
  } else {
    for (const [key, def] of themeConstraints) {
      const includesMonsterType = Boolean(def) && def.includes("monster_type");
      (includesMonsterType ? pass : fail)(
        `Check constraint ${key} allows 'monster_type'`,
        includesMonsterType ? def : `current definition does not mention monster_type: ${def}`
      );
    }
  }
}

// ---------------------------------------------------------
// 5. Check constraints widened to allow 'round_runner_up'.
// ---------------------------------------------------------

function checkConstraints() {
  if (introspectionError || !introspection) {
    warn(
      "Round-reward role check constraints include round_runner_up",
      `could not call public._phase2_verify_introspect() (${introspectionError?.message ?? "no data returned"}) - verify manually against pg_constraint.`
    );
    return;
  }

  const constraints = introspection.constraints ?? {};
  // Keys are "relname.conname" (see the RPC's jsonb_object_agg) - one
  // entry per role-check constraint found on either table. If a
  // table's constraint isn't in this map at all, the RPC's own
  // `ilike '%role%'` filter didn't match it (e.g. it was renamed to
  // something without "role" in the name), which is itself worth
  // flagging rather than silently reporting nothing for that table.
  for (const table of ["competition_round_reward_rules", "competition_round_reward_grants"]) {
    const matches = Object.entries(constraints).filter(([key]) => key.startsWith(`${table}.`));
    if (matches.length === 0) {
      warn(
        `Check constraint on ${table}`,
        "no role-related check constraint found via introspection - could not verify it allows 'round_runner_up'"
      );
      continue;
    }
    for (const [key, def] of matches) {
      const includesRunnerUp = Boolean(def) && def.includes("round_runner_up");
      (includesRunnerUp ? pass : fail)(
        `Check constraint ${key} allows 'round_runner_up'`,
        includesRunnerUp ? def : `current definition does not mention round_runner_up: ${def}`
      );
    }
  }
}

// ---------------------------------------------------------
// 6. Round reward rules exist for all 3 roles across existing
// competitions (post-backfill).
// ---------------------------------------------------------

function checkRoleCounts() {
  if (introspectionError || !introspection) {
    warn(
      "Round reward rules cover all 3 roles for existing competitions",
      `could not call public._phase2_verify_introspect() (${introspectionError?.message ?? "no data returned"}) - verify manually: select role, count(*) from competition_round_reward_rules group by role;`
    );
    return;
  }

  const counts = introspection.round_reward_rule_role_counts ?? {};
  const participationCount = counts["participation"] ?? 0;
  const winnerCount = counts["round_winner"] ?? 0;
  const runnerUpCount = counts["round_runner_up"] ?? 0;

  if (participationCount === 0) {
    warn(
      "Round reward rules exist",
      "no competition_round_reward_rules rows found at all - either no competitions exist yet, or install_default_round_rewards_v2 has never run. Not a failure by itself."
    );
    return;
  }

  pass(
    "Round reward rule counts by role",
    `participation=${participationCount}, round_winner=${winnerCount}, round_runner_up=${runnerUpCount}`
  );

  (runnerUpCount === participationCount ? pass : fail)(
    "Every competition with participation rules also has a round_runner_up rule",
    runnerUpCount === participationCount
      ? "counts match - the backfill for existing competitions applied cleanly"
      : `participation=${participationCount} vs round_runner_up=${runnerUpCount} - the backfill insert in 202608311100 may not have covered every existing competition, check for competitions created between the backfill and now with a different install path`
  );
}

// ---------------------------------------------------------
// RUN ALL CHECKS
// ---------------------------------------------------------

async function main() {
  console.log("Connecting to Supabase and running checks...");
  await loadIntrospection();
  checkEconomyDefaults();
  await checkPackPrices();
  await checkSpecialPackPrices();
  checkFunctionSources();
  checkConstraints();
  checkRoleCounts();
  checkSpecialPackRotationSystem();

  console.log("\nPHASE 2 LIVE VERIFICATION\n");
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
    console.log("\nOVERALL: PASS WITH WARNINGS - see [WARN] lines above (usually 'no live DB access from this sandbox', not a data problem).");
  } else {
    console.log("\nOVERALL: PASS");
  }
}

main().catch((err) => {
  console.error("Verification script crashed:", err);
  process.exit(1);
});
