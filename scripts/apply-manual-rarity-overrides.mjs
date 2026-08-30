#!/usr/bin/env node
// =========================================================
// APPLY MANUAL RARITY OVERRIDES - the enforcement half of the
// "clean persistent mechanism" the Duelist Circle Classic
// architecture brief asked for.
//
// WHAT THIS SCRIPT IS FOR
// card_catalog.game_rarity is the live, player-facing rarity -
// nothing currently promotes scripts/audit-card-valuation.mjs's
// proposed_game_rarity into it automatically, by design (see that
// script's own header: "never touches your live game_rarity unless
// you pass --write-scores, and even then only the new 'proposed'
// columns"). This script is the FIRST piece of live code that
// actually reads rarity_manually_overridden
// (202608190003_game_rarity.sql) as authoritative - previously only
// the deprecated scripts/classify-rarities.mjs did, making that flag
// a guard on nothing.
//
// RULE (this is the entire point of the script - read this twice):
//   - rarity_manually_overridden = true  -> this card's game_rarity
//     is NEVER touched by this script, no matter what
//     proposed_game_rarity says. Full stop, no exceptions, no
//     "unless the difference is large" carve-out.
//   - rarity_manually_overridden = false/null AND proposed_game_rarity
//     is set -> candidate to promote proposed_game_rarity ->
//     game_rarity.
//   - proposed_game_rarity is null -> no recommendation (the
//     valuation audit hasn't scored this card yet).
//
// DRY RUN BY DEFAULT, same convention as every other audit script in
// this repo: reports what WOULD change, writes reports/, touches
// nothing. Only --apply actually performs the UPDATE, and even then
// only for rows where rarity_manually_overridden is not true.
//
// SANDBOX LIMITATION: written and syntax-checked in a sandbox with no
// live Supabase access (see docs/cardpool-classic-format-audit-
// 2026-08-30.md) - not yet run against the real catalog.
//
// Usage:
//   node --env-file=.env.local scripts/apply-manual-rarity-overrides.mjs           (dry run, writes reports/ only)
//   node --env-file=.env.local scripts/apply-manual-rarity-overrides.mjs --apply    (also performs the UPDATE)
// =========================================================

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { RARITY_ORDER } from "../lib/valuation-engine.mjs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const APPLY = process.argv.includes("--apply");

async function fetchAllCards() {
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("card_catalog")
      .select("id,name,game_rarity,proposed_game_rarity,rarity_manually_overridden")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Fetching card_catalog failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function rarityRank(r) {
  return RARITY_ORDER.indexOf(r);
}

async function main() {
  const rows = await fetchAllCards();

  const overridden = rows.filter((c) => c.rarity_manually_overridden === true);
  const eligible = rows.filter((c) => c.rarity_manually_overridden !== true && c.proposed_game_rarity != null);
  const unscored = rows.filter((c) => c.rarity_manually_overridden !== true && c.proposed_game_rarity == null);

  const toPromote = eligible.filter((c) => c.game_rarity !== c.proposed_game_rarity);
  const alreadyMatching = eligible.filter((c) => c.game_rarity === c.proposed_game_rarity);

  const upgrades = toPromote.filter((c) => rarityRank(c.proposed_game_rarity) > rarityRank(c.game_rarity ?? "Normal"));
  const downgrades = toPromote.filter((c) => rarityRank(c.proposed_game_rarity) < rarityRank(c.game_rarity ?? "Normal"));

  console.log(`Total cards: ${rows.length}`);
  console.log(`  Manually overridden (never touched by this script): ${overridden.length}`);
  console.log(`  Unscored (no proposed_game_rarity yet - run audit-card-valuation.mjs first): ${unscored.length}`);
  console.log(`  Already matching proposed_game_rarity: ${alreadyMatching.length}`);
  console.log(`  Would be promoted (game_rarity <- proposed_game_rarity): ${toPromote.length}`);
  console.log(`    Upgrades: ${upgrades.length}`);
  console.log(`    Downgrades: ${downgrades.length}`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join("reports", "rarity-apply", timestamp);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "would-promote.json"),
    JSON.stringify(
      toPromote.map((c) => ({ name: c.name, from: c.game_rarity, to: c.proposed_game_rarity })),
      null,
      2
    )
  );
  console.log(`\nFull list written to ${dir}/would-promote.json`);

  if (!APPLY) {
    console.log("\nDry run only - no changes made. Re-run with --apply to perform the UPDATE.");
    return;
  }

  console.log(`\n--apply passed - updating ${toPromote.length} rows...`);
  let updated = 0;
  for (const card of toPromote) {
    const { error } = await supabase
      .from("card_catalog")
      .update({ game_rarity: card.proposed_game_rarity, updated_at: new Date().toISOString() })
      .eq("id", card.id)
      .eq("rarity_manually_overridden", false); // belt-and-suspenders: refuse even if a race condition flipped it since fetch
    if (error) throw error;
    updated++;
  }
  console.log(`Updated ${updated} rows.`);
}

await main();
