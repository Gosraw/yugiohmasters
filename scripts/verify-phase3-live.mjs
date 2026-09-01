#!/usr/bin/env node
// =========================================================
// PHASE 3 LIVE VERIFICATION (final pre-launch pack sizes + peak-
// rarity odds model)
//
// Read-only checks against the REAL live Supabase database. Never
// inserts/updates/deletes anything - every check is a plain SELECT
// against an application table or a call to the narrow, read-only
// public._phase3_verify_introspect() RPC (installed by
// supabase/migrations/202609010900_phase3_prelaunch_pack_sizes_and_peak_rarity.sql).
//
// Usage:
//   node --env-file=.env.local scripts/verify-phase3-live.mjs
//
// Reads the same env vars as scripts/verify-phase1-live.mjs /
// verify-phase2-live.mjs:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
// =========================================================

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    "Missing Supabase env vars. Run with: node --env-file=.env.local scripts/verify-phase3-live.mjs"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
function pass(name, detail) { results.push({ name, status: "PASS", detail }); }
function fail(name, detail) { results.push({ name, status: "FAIL", detail }); }
function warn(name, detail) { results.push({ name, status: "WARN", detail }); }

async function main() {
  console.log("Connecting to Supabase and running Phase 3 checks...");

  const { data: introspection, error: introspectionError } = await supabase.rpc(
    "_phase3_verify_introspect"
  );

  if (introspectionError || !introspection) {
    fail(
      "public._phase3_verify_introspect() reachable",
      `RPC call failed (${introspectionError?.message ?? "no data returned"}) - run supabase/migrations/202609010900_phase3_prelaunch_pack_sizes_and_peak_rarity.sql first.`
    );
  } else {
    pass("public._phase3_verify_introspect() reachable", "RPC returned data");

    const fns = introspection.functions ?? {};
    for (const fnName of [
      "roll_shop_pack_peak_rarity",
      "roll_shop_pack_filler_rarity",
      "refresh_shop_special_pack_rotation_if_needed",
      "purchase_shop_pack",
    ]) {
      const exists = Boolean(fns[fnName]);
      (exists ? pass : fail)(
        `Function exists: ${fnName}`,
        exists ? "found in pg_proc" : "NOT FOUND - Phase 3 migration did not apply"
      );
    }

    const usesPeakModel = introspection.purchase_shop_pack_uses_peak_model === true;
    (usesPeakModel ? pass : fail)(
      "purchase_shop_pack uses the new pack-level peak-rarity model",
      usesPeakModel
        ? "source references roll_shop_pack_peak_rarity + roll_shop_pack_filler_rarity and no longer references minimum_rarity_rank"
        : "source does not match the expected new model - the old per-card floor mechanic may still be present, or the new functions are not wired up"
    );

    const cardsPerPack = introspection.shop_pack_types_cards_per_pack ?? {};
    const expectedCards = { normal: 5, premium: 7, deluxe: 10 };
    for (const [code, expected] of Object.entries(expectedCards)) {
      const actual = cardsPerPack[code];
      (actual === expected ? pass : fail)(
        `shop_pack_types.${code}.cards_per_pack = ${expected}`,
        `actual: ${actual}`
      );
    }

    const prices = introspection.shop_pack_types_price_dp ?? {};
    const expectedPrices = { normal: 300, premium: 900, deluxe: 1500 };
    for (const [code, expected] of Object.entries(expectedPrices)) {
      const actual = prices[code];
      (actual === expected ? pass : fail)(
        `shop_pack_types.${code}.price_dp = ${expected} (unchanged from Phase 2)`,
        `actual: ${actual}`
      );
    }

    const activeSpecialCards = introspection.active_special_pack_cards_per_pack ?? [];
    if (activeSpecialCards.length === 0) {
      warn(
        "Active special pack rotations have cards_per_pack = 7",
        "no active special pack rotations found - call public.ensure_shop_rotations_current() to populate, then re-run this script"
      );
    } else {
      const allSeven = activeSpecialCards.every((n) => n === 7);
      (allSeven ? pass : fail)(
        "Active special pack rotations have cards_per_pack = 7",
        `found cards_per_pack values: ${activeSpecialCards.join(", ")}`
      );
    }

    const activeSpecialPrices = introspection.active_special_pack_prices ?? [];
    if (activeSpecialPrices.length > 0) {
      const allTwelveHundred = activeSpecialPrices.every((n) => n === 1200);
      (allTwelveHundred ? pass : fail)(
        "Active special pack rotations have price_dp = 1200 (unchanged from Phase 2)",
        `found price_dp values: ${activeSpecialPrices.join(", ")}`
      );
    }
  }

  console.log("\nPHASE 3 LIVE VERIFICATION\n");
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
    console.log("\nOVERALL: PASS WITH WARNINGS - see [WARN] lines above.");
  } else {
    console.log("\nOVERALL: PASS");
  }
}

main().catch((err) => {
  console.error("Verification script crashed:", err);
  process.exit(1);
});
