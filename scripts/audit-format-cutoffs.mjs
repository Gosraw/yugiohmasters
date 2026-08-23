#!/usr/bin/env node
// =========================================================
// FORMAT CUTOFF COMPARISON (2019 / 2020 / 2021)
//
// Reports, for each candidate release_cutoff, the full pool
// composition that is_duelist_circle_format_eligible() would
// produce - total eligible, Monster/Spell/Trap/Fusion/Xyz counts,
// rarity distribution, Attribute distribution, archetype count,
// how many are MD-excluded, how many forbidden, how many
// Illusion-excluded, how many flagged orange/red for power risk -
// so the operator can pick a cutoff from real numbers instead of a
// guess.
//
// REQUIRES card_catalog.release_date to be populated first (see
// scripts/sync-card-release-dates.mjs - release_date is NULL for
// every row until that script has been run against the real
// catalog). Also reads oppressiveness_tier/proposed_game_rarity if
// scripts/audit-card-valuation.mjs --write-scores has already run;
// falls back to the live game_rarity/no-oppressiveness-data
// otherwise and says so.
//
// This mirrors is_duelist_circle_format_eligible()'s own rule set
// in plain JS rather than calling the RPC 3x per card over the
// network, purely so a full ~13,931-card catalog can be evaluated
// in one query + one pass instead of thousands of round trips.
// Keep this in sync with
// supabase/migrations/202608231500_duelist_circle_format_engine.sql
// if that function's rules ever change.
//
// This script could NOT be run against a real Supabase project in
// this sandboxed session (no network access, no real project
// credentials). It is written and syntax-checked, ready for the
// operator's Phase C+ run - it has NOT produced real numbers yet.
//
// Usage:
//   node scripts/audit-format-cutoffs.mjs
// =========================================================

import { createClient } from "@supabase/supabase-js";

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

// Matches the Season 1 seed row in
// 202608231500_duelist_circle_format_engine.sql - Synchro/Link/
// Pendulum disabled (matching today's live global exclusion),
// Illusion disabled, Fusion + Xyz allowed.
const MECHANIC_FLAGS = {
  allow_illusion: false,
  allow_synchro: false,
  allow_xyz: true,
  allow_link: false,
  allow_pendulum: false,
  allow_fusion: true,
};

const CUTOFFS = ["2019-12-31", "2020-12-31", "2021-12-31"];

async function fetchAllCards() {
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("card_catalog")
      .select(
        "id,name,card_type,frame_type,race,monster_type,attribute,archetype,release_date,master_duel_status,proposed_game_rarity,game_rarity,oppressiveness_tier,format_exclusion_reason"
      )
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Fetching card_catalog failed: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function isMechanicDisallowed(card) {
  const haystack = `${card.card_type ?? ""} ${card.frame_type ?? ""}`.toLowerCase();
  if (!MECHANIC_FLAGS.allow_synchro && haystack.includes("synchro")) return "synchro";
  if (!MECHANIC_FLAGS.allow_xyz && haystack.includes("xyz")) return "xyz";
  if (!MECHANIC_FLAGS.allow_link && haystack.includes("link")) return "link";
  if (!MECHANIC_FLAGS.allow_pendulum && haystack.includes("pendulum")) return "pendulum";
  if (!MECHANIC_FLAGS.allow_fusion && haystack.includes("fusion")) return "fusion";
  const isIllusion =
    (card.race ?? "").toLowerCase() === "illusion" ||
    (card.monster_type ?? "").toLowerCase().includes("illusion");
  if (!MECHANIC_FLAGS.allow_illusion && isIllusion) return "illusion";
  return null;
}

function isMdBlocked(card) {
  return ["forbidden", "not_available", "unknown"].includes(
    card.master_duel_status ?? "unknown"
  );
}

function evaluateCutoff(cards, cutoffDate) {
  const cutoff = new Date(cutoffDate);
  const stats = {
    totalEligible: 0,
    byCardType: {},
    byRarity: {},
    byAttribute: {},
    archetypes: new Set(),
    mdExcludedCount: 0,
    mechanicExcludedCount: 0,
    postCutoffExcludedCount: 0,
    oppressivenessOrangeOrRed: 0,
  };

  for (const card of cards) {
    if (isMdBlocked(card)) {
      stats.mdExcludedCount++;
      continue;
    }
    const mechanicReason = isMechanicDisallowed(card);
    if (mechanicReason) {
      stats.mechanicExcludedCount++;
      continue;
    }
    if (card.release_date) {
      const releaseDate = new Date(card.release_date);
      if (releaseDate > cutoff) {
        stats.postCutoffExcludedCount++;
        continue;
      }
    }
    // NULL release_date is never excluded on cutoff grounds alone
    // - matches is_duelist_circle_format_eligible()'s own rule.

    stats.totalEligible++;
    stats.byCardType[card.card_type] = (stats.byCardType[card.card_type] ?? 0) + 1;
    const rarity = card.proposed_game_rarity ?? card.game_rarity ?? "unscored";
    stats.byRarity[rarity] = (stats.byRarity[rarity] ?? 0) + 1;
    if (card.attribute) {
      stats.byAttribute[card.attribute] = (stats.byAttribute[card.attribute] ?? 0) + 1;
    }
    if (card.archetype) {
      stats.archetypes.add(card.archetype);
    }
    if (card.oppressiveness_tier === "orange" || card.oppressiveness_tier === "red") {
      stats.oppressivenessOrangeOrRed++;
    }
  }

  return stats;
}

function printStats(cutoffDate, stats, totalCards) {
  console.log(`\n=== Cutoff: ${cutoffDate} ===`);
  console.log(`Total eligible: ${stats.totalEligible} / ${totalCards}`);
  console.log(`Excluded - Master Duel forbidden/not_available/unknown: ${stats.mdExcludedCount}`);
  console.log(`Excluded - disallowed mechanic (Synchro/Link/Pendulum/Illusion, Fusion/Xyz allowed): ${stats.mechanicExcludedCount}`);
  console.log(`Excluded - released after cutoff: ${stats.postCutoffExcludedCount}`);
  console.log(`Flagged orange/red for power risk (needs scores from audit-card-valuation.mjs): ${stats.oppressivenessOrangeOrRed}`);
  console.log(`Distinct archetypes represented: ${stats.archetypes.size}`);
  console.log("By card type:", stats.byCardType);
  console.log("By proposed/current rarity:", stats.byRarity);
  console.log("By Attribute:", stats.byAttribute);
}

async function main() {
  console.log("Fetching card_catalog ...");
  const cards = await fetchAllCards();
  console.log(`${cards.length} total rows.`);

  const withReleaseDate = cards.filter((c) => c.release_date).length;
  if (withReleaseDate === 0) {
    console.log(
      "\nWARNING: 0 rows have a release_date set. Run scripts/sync-card-release-dates.mjs first " +
        "(this run will still complete, but every cutoff will show the SAME total, since a NULL " +
        "release_date is never excluded on cutoff grounds alone)."
    );
  } else {
    console.log(`${withReleaseDate} of ${cards.length} rows have a known release_date.`);
  }

  for (const cutoff of CUTOFFS) {
    const stats = evaluateCutoff(cards, cutoff);
    printStats(cutoff, stats, cards.length);
  }

  console.log(
    "\nThis is a REPORT ONLY - it does not write anything and does not activate a format. " +
      "Review the three scenarios above, then set duelist_circle_formats.release_cutoff yourself " +
      "(see the runbook) once you've decided."
  );
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
