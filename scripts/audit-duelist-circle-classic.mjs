#!/usr/bin/env node
// =========================================================
// DUELIST CIRCLE CLASSIC - FULL PIPELINE AUDIT
//
// Ties together every piece built for the Codex cardpool-balancing
// brief into ONE pass that produces exactly the report the brief's
// "VALIDATION" section asks for: total scanned, eligible <=2014,
// mechanic-dependent exclusions, 2015-2018 candidates, approved
// post-2014 inclusions, total cards in the format, automated rarity
// distribution, manual override count, and Legendary/Secret/Ultra/
// Super totals.
//
// ARCHITECTURE (per the brief's explicit instructions - read this
// before changing anything below):
//   1. ELIGIBILITY FIRST. A card's rarity is never computed at all
//      until it's confirmed eligible for Duelist Circle Classic.
//      Eligibility = mechanic check (Fusion/Xyz allowed; Synchro/
//      Pendulum/Link/Illusion excluded by card_type/frame_type, see
//      lib/format-eligibility.mjs's proxy pattern) AND NOT hard-
//      text-dependency-excluded (scripts/audit-mechanic-text-
//      dependency.mjs's classifyCardText - a Main Deck/Spell/Trap
//      card that functionally requires an excluded mechanic without
//      being one itself) AND release-era policy (<=2014 eligible by
//      default; 2015-2018 ONLY via a format_card_overrides include;
//      2019+ ONLY via a format_card_overrides include) AND Master
//      Duel status is offerable AND no format_card_overrides exclude
//      row. An override include row bypasses the mechanic/cutoff/
//      text-dependency checks but never the Master Duel gate -
//      mirrors is_duelist_circle_format_eligible()'s own precedence
//      exactly (supabase/migrations/202608231500_duelist_circle_
//      format_engine.sql).
//   2. RARITY SECOND, ONLY FOR ELIGIBLE CARDS. The valuation engine
//      (lib/valuation-engine.mjs) runs and produces a RECOMMENDATION
//      only - this script never treats its output as final. Per the
//      brief: "do NOT assume text-only valuation captures opponent-
//      dependent disruption, hand traps, comeback value, generic
//      staple value, archetype context, or format-specific Special
//      Summon frequency."
//   3. MANUAL OVERRIDE ALWAYS WINS. If
//      card_catalog.rarity_manually_overridden is true, this script
//      reports card_catalog.game_rarity (the human-approved value,
//      seeded for 9 cards by
//      202608301000_seed_manual_rarity_overrides.sql) and NEVER the
//      engine's recommendation, in every count and every distribution
//      below - a manually-overridden card is never in the "automated
//      rarity distribution" section, only in the "final" one.
//   4. CONTEXT IS A SEPARATE AXIS. classifyCardContext() output
//      (generic / archetype / narrow_support / splashable_engine) is
//      reported alongside rarity, never blended into it - see that
//      function's own header in lib/valuation-engine.mjs.
//
// SELF-TEST MODE (--self-test): exercises computeClassicEligibility()
// against a small set of real + clearly-labeled-synthetic fixtures,
// entirely offline. This is what's actually been run and verified in
// this sandbox - the live-DB path below has NOT.
//
// SANDBOX LIMITATION: same as every other audit script in this repo
// (see docs/cardpool-classic-format-audit-2026-08-30.md) - no network
// path to a live Supabase project from this sandbox. Written and
// self-tested; not yet run against the real ~13,900-card catalog.
//
// Usage:
//   node scripts/audit-duelist-circle-classic.mjs --self-test
//   node --env-file=.env.local scripts/audit-duelist-circle-classic.mjs
// =========================================================

import { classifyCardText } from "./audit-mechanic-text-dependency.mjs";

const RELEASE_CUTOFF = "2014-12-31";
const CURATED_WINDOW_START = "2015-01-01";
const CURATED_WINDOW_END = "2018-12-31";

function isMasterDuelOfferable(status) {
  return ["unlimited", "semi_limited", "limited"].includes(status ?? "");
}

function mechanicFlags(card) {
  const cardType = (card.card_type ?? "").toLowerCase();
  const frameType = (card.frame_type ?? "").toLowerCase();
  const race = card.race ?? "";
  const monsterType = (card.monster_type ?? "").toLowerCase();
  return {
    isSynchro: cardType.includes("synchro") || frameType.includes("synchro"),
    isXyz: cardType.includes("xyz") || frameType.includes("xyz"),
    isLink: cardType.includes("link") || frameType.includes("link"),
    isPendulum: cardType.includes("pendulum") || frameType.includes("pendulum"),
    isFusion: cardType.includes("fusion") || frameType.includes("fusion"),
    isIllusion: race === "Illusion" || monsterType.includes("illusion"),
  };
}

/**
 * Pure, offline-computable eligibility check for Duelist Circle
 * Classic. Mirrors is_duelist_circle_format_eligible()'s precedence
 * (Master Duel gate first, then override exclude, then override
 * include, then mechanic/cutoff), PLUS the text-dependency layer that
 * SQL function does not have.
 *
 * @param {object} card - card_catalog-shaped row (card_type,
 *   frame_type, race, monster_type, description, release_date,
 *   master_duel_status, name)
 * @param {"include"|"exclude"|null} overrideType - this card's
 *   format_card_overrides row for duelist_circle_classic_v1, if any
 * @returns {{ eligible: boolean, reason: string, category: string }}
 *   category is one of: "master_duel_excluded", "override_excluded",
 *   "override_included", "mechanic_excluded", "text_dependency_excluded",
 *   "era_excluded_2015_2018", "era_excluded_2019_plus", "eligible_core"
 */
function computeClassicEligibility(card, overrideType) {
  if (!isMasterDuelOfferable(card.master_duel_status)) {
    return { eligible: false, reason: "Forbidden/not_available/unknown in Master Duel - absolute gate.", category: "master_duel_excluded" };
  }

  if (overrideType === "exclude") {
    return { eligible: false, reason: "Manual format_card_overrides exclude.", category: "override_excluded" };
  }

  if (overrideType === "include") {
    return { eligible: true, reason: "Manual format_card_overrides include (bypasses mechanic/cutoff/text-dependency checks).", category: "override_included" };
  }

  const mech = mechanicFlags(card);
  if (mech.isSynchro) return { eligible: false, reason: "Synchro Monster - excluded mechanic.", category: "mechanic_excluded" };
  if (mech.isLink) return { eligible: false, reason: "Link Monster - excluded mechanic.", category: "mechanic_excluded" };
  if (mech.isPendulum) return { eligible: false, reason: "Pendulum Monster - excluded mechanic.", category: "mechanic_excluded" };
  if (mech.isIllusion) return { eligible: false, reason: "Illusion - excluded mechanic.", category: "mechanic_excluded" };
  // Fusion and Xyz are allowed - no exclusion for mech.isFusion/isXyz.

  const textFindings = classifyCardText(card.description);
  const hardTextDependency = textFindings.find((f) => f.bucket === "hard_dependency");
  if (hardTextDependency) {
    return {
      eligible: false,
      reason: `Text functionally requires a ${hardTextDependency.mechanic} Monster without being one itself ("${hardTextDependency.snippet}").`,
      category: "text_dependency_excluded",
    };
  }

  const releaseDate = card.release_date ?? null;
  if (releaseDate != null && releaseDate > RELEASE_CUTOFF) {
    if (releaseDate >= CURATED_WINDOW_START && releaseDate <= CURATED_WINDOW_END) {
      return { eligible: false, reason: "2015-2018 curated window - not eligible without an explicit include override.", category: "era_excluded_2015_2018" };
    }
    return { eligible: false, reason: "2019+ - excluded by default without an explicit include override.", category: "era_excluded_2019_plus" };
  }
  // release_date == null (unknown) is NEVER excluded on cutoff
  // grounds alone - matches the live SQL predicate and every other
  // cutoff-aware script in this repo.

  return { eligible: true, reason: "Released 2014 or earlier (or release date unknown), no excluded mechanic, no hard text dependency.", category: "eligible_core" };
}

// ---------------------------------------------------------
// Offline self-test
// ---------------------------------------------------------

const SELF_TEST_CASES = [
  {
    name: "Dark Magician",
    card: { card_type: "Normal Monster", frame_type: "normal", master_duel_status: "unlimited", release_date: "2002-03-08", description: "The ultimate wizard in terms of attack and defense." },
    override: null,
    expectCategory: "eligible_core",
  },
  {
    name: "Stardust Dragon",
    card: { card_type: "Synchro Monster", frame_type: "synchro", master_duel_status: "unlimited", release_date: "2008-03-04", description: "1 Tuner + 1 or more non-Tuner monsters." },
    override: null,
    expectCategory: "mechanic_excluded",
  },
  {
    name: "Iron Call (real card, Synchro text-dependency without being a Synchro Monster)",
    card: { card_type: "Spell Card", frame_type: "spell", master_duel_status: "unlimited", release_date: "2011-01-01", description: "Target 1 Synchro Monster in your GY; Special Summon it, but it cannot attack this turn, also you take no battle damage this turn." },
    override: null,
    expectCategory: "text_dependency_excluded",
  },
  {
    name: "Chocolate Magician Girl (2015-2018 curated window, no override in this test)",
    card: { card_type: "Effect Monster", frame_type: "effect", master_duel_status: "unlimited", release_date: "2017-06-24", description: "Dark Magician Girl support." },
    override: null,
    expectCategory: "era_excluded_2015_2018",
  },
  {
    name: "Chocolate Magician Girl (with the seeded include override)",
    card: { card_type: "Effect Monster", frame_type: "effect", master_duel_status: "unlimited", release_date: "2017-06-24", description: "Dark Magician Girl support." },
    override: "include",
    expectCategory: "override_included",
  },
  {
    name: "Hypothetical 2022 card (2019+, excluded by default)",
    card: { card_type: "Effect Monster", frame_type: "effect", master_duel_status: "unlimited", release_date: "2022-01-01", description: "A generic effect." },
    override: null,
    expectCategory: "era_excluded_2019_plus",
  },
  {
    name: "Forbidden card in Master Duel (absolute gate wins even with an include override)",
    card: { card_type: "Effect Monster", frame_type: "effect", master_duel_status: "forbidden", release_date: "2005-01-01", description: "A generic effect." },
    override: "include",
    expectCategory: "master_duel_excluded",
  },
  {
    name: "Meaningful standalone Tuner (Tuners are NOT auto-excluded - only Synchro Monsters themselves are)",
    card: { card_type: "Effect Monster", frame_type: "effect", monster_type: "Tuner", master_duel_status: "unlimited", release_date: "2010-01-01", description: "You can target 1 monster; destroy it." },
    override: null,
    expectCategory: "eligible_core",
  },
  {
    name: "Unknown release date is never excluded on cutoff grounds alone",
    card: { card_type: "Effect Monster", frame_type: "effect", master_duel_status: "unlimited", release_date: null, description: "A generic effect." },
    override: null,
    expectCategory: "eligible_core",
  },
];

function runSelfTest() {
  let passed = 0;
  let failed = 0;
  for (const tc of SELF_TEST_CASES) {
    const result = computeClassicEligibility(tc.card, tc.override);
    if (result.category === tc.expectCategory) {
      passed++;
      console.log(`  PASS  ${tc.name} -> ${result.category}`);
    } else {
      failed++;
      console.log(`  FAIL  ${tc.name}`);
      console.log(`        expected category "${tc.expectCategory}", got "${result.category}" (reason: ${result.reason})`);
    }
  }
  console.log(`\nSelf-test: ${passed} passed, ${failed} failed (${SELF_TEST_CASES.length} total).`);
  if (failed > 0) process.exitCode = 1;
}

// ---------------------------------------------------------
// Live-DB full pipeline (requires Supabase env vars + network)
// ---------------------------------------------------------

async function runLiveAudit() {
  const { createClient } = await import("@supabase/supabase-js");
  const { extractValuationSignals, scoreCard, proposeRarity, classifyCardContext, getArchetypeRelevanceHint, RARITY_ORDER } = await import(
    "../lib/valuation-engine.mjs"
  );
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { join } = await import("node:path");

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: fmt, error: fmtErr } = await supabase
    .from("duelist_circle_formats")
    .select("id,code")
    .eq("code", "duelist_circle_classic_v1")
    .maybeSingle();
  if (fmtErr) throw fmtErr;
  if (!fmt) {
    console.error("No 'duelist_circle_classic_v1' format row found - run 202608300900_duelist_circle_classic_format.sql first.");
    process.exit(1);
  }

  const { data: overrideRows, error: overrideErr } = await supabase
    .from("format_card_overrides")
    .select("card_catalog_id,override_type")
    .eq("format_id", fmt.id);
  if (overrideErr) throw overrideErr;
  const overridesByCardId = new Map(overrideRows.map((r) => [r.card_catalog_id, r.override_type]));

  const rows = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("card_catalog")
      .select(
        "id,name,card_type,frame_type,race,monster_type,attribute,archetype,description,release_date,master_duel_status,atk,def,level,rank,link_rating,game_rarity,proposed_game_rarity,rarity_manually_overridden"
      )
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Fetching card_catalog failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  // Single pass over the FULL catalog (not just eligible cards). Every
  // row - eligible or not - gets a perCard record with enough raw
  // fields (archetype, card_type, release_date, eligibility category +
  // reason) to filter into every review-output bucket the brief asks
  // for without this script pre-building bespoke aggregation logic:
  // era_excluded_2015_2018 rows ARE the "2015-2018 REVIEW candidates"
  // pool (excluded absent an override); override_included rows with a
  // post-2018 release_date ARE the "post-2018 exception candidates";
  // text_dependency_excluded rows ARE the mechanic-dependent-exclusion
  // list; etc. Valuation (scoreCard/proposeRarity/classifyCardContext)
  // still only ever runs for eligible cards - excluded cards get no
  // scores field at all, matching the architecture's own rule that
  // rarity is never computed before eligibility is confirmed.
  const byCategory = new Map();
  const automatedRarityDist = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0]));
  const finalRarityDist = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0]));
  const contextDist = { generic: 0, archetype: 0, narrow_support: 0, splashable_engine: 0 };
  let manualOverrideCount = 0;
  let eligibleCount = 0;
  const perCard = [];

  for (const card of rows) {
    const overrideType = overridesByCardId.get(card.id) ?? null;
    const result = computeClassicEligibility(card, overrideType);
    byCategory.set(result.category, (byCategory.get(result.category) ?? 0) + 1);

    const base = {
      name: card.name,
      archetype: card.archetype ?? null,
      card_type: card.card_type ?? null,
      release_date: card.release_date ?? null,
      eligible: result.eligible,
      eligibilityCategory: result.category,
      eligibilityReason: result.reason,
    };

    if (!result.eligible) {
      perCard.push(base);
      continue;
    }
    eligibleCount++;

    const signals = extractValuationSignals(card);
    const scores = scoreCard(signals, card);
    const automatedRarity = proposeRarity(scores);
    const context = classifyCardContext(signals, scores, card);

    automatedRarityDist[automatedRarity]++;
    contextDist[context.context]++;

    const isOverridden = card.rarity_manually_overridden === true;
    const finalRarity = isOverridden ? card.game_rarity : automatedRarity;
    if (isOverridden) manualOverrideCount++;
    if (finalRarity && finalRarityDist[finalRarity] != null) finalRarityDist[finalRarity]++;

    perCard.push({
      ...base,
      automatedRarity,
      finalRarity,
      manuallyOverridden: isOverridden,
      context: context.context,
      contextReason: context.reason,
      // 2026-08-30 human calibration pass (brief section 9G): report-
      // only - NEVER read by scoreCard/proposeRarity - so a reviewer
      // can weigh expected real play rate (nostalgia) alongside the
      // automated rarity, without the engine silently boosting any
      // card just for carrying a popular archetype tag.
      archetypeRelevanceHint: getArchetypeRelevanceHint(card.archetype),
      scores,
    });
  }

  // override_included spans BOTH the 2015-2018 curated window and any
  // 2019+ exception - split it by the card's own release_date (already
  // on every perCard record) rather than approximating from the
  // category count alone, so "2015-2018 included" and "post-2018
  // exception" are exact, disjoint lists/counts.
  const curated2015to2018IncludedCount = perCard.filter(
    (c) => c.eligibilityCategory === "override_included" && c.release_date >= CURATED_WINDOW_START && c.release_date <= CURATED_WINDOW_END
  ).length;
  const post2018IncludedCount = perCard.filter(
    (c) => c.eligibilityCategory === "override_included" && c.release_date > CURATED_WINDOW_END
  ).length;

  console.log(`Total cards scanned: ${rows.length}`);
  console.log(`\nEligibility breakdown:`);
  for (const [cat, count] of byCategory.entries()) {
    console.log(`  ${cat}: ${count}`);
  }
  console.log(`\nTotal cards in Duelist Circle Classic: ${eligibleCount}`);
  console.log(`\nAutomated rarity distribution (engine recommendation, pre-override):`);
  for (const r of RARITY_ORDER) console.log(`  ${r}: ${automatedRarityDist[r]}`);
  console.log(`\nManual overrides applied: ${manualOverrideCount}`);
  console.log(`\nFinal rarity distribution (overrides applied):`);
  for (const r of RARITY_ORDER) console.log(`  ${r}: ${finalRarityDist[r]}`);
  console.log(`\nContext distribution:`);
  for (const [k, v] of Object.entries(contextDist)) console.log(`  ${k}: ${v}`);
  console.log(
    `\nLegendary total: ${finalRarityDist.Legendary} (target ~25-35, not a forced quota)`
  );
  console.log(`Secret Rare total: ${finalRarityDist["Secret Rare"]}`);
  console.log(`Ultra Rare total: ${finalRarityDist["Ultra Rare"]}`);
  console.log(`Super Rare total: ${finalRarityDist["Super Rare"]}`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join("reports", "duelist-circle-classic", timestamp);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "per-card.json"), JSON.stringify(perCard, null, 2));
  writeFileSync(
    join(dir, "summary.json"),
    JSON.stringify(
      {
        totalScanned: rows.length,
        eligibilityBreakdown: Object.fromEntries(byCategory),
        totalEligible: eligibleCount,
        totalExcluded: rows.length - eligibleCount,
        // Named counts the audit brief asked for explicitly, each a
        // direct lookup into eligibilityBreakdown above (0 if a
        // category never occurred) - no new classification logic.
        eligibleAt2014OrEarlierCount: byCategory.get("eligible_core") ?? 0,
        curated2015to2018IncludedCount,
        curated2015to2018ReviewCount: byCategory.get("era_excluded_2015_2018") ?? 0,
        post2018IncludedCount,
        post2018ExcludedCount: byCategory.get("era_excluded_2019_plus") ?? 0,
        mechanicExcludedCount: byCategory.get("mechanic_excluded") ?? 0,
        textDependencyExcludedCount: byCategory.get("text_dependency_excluded") ?? 0,
        masterDuelExcludedCount: byCategory.get("master_duel_excluded") ?? 0,
        overrideExcludedCount: byCategory.get("override_excluded") ?? 0,
        automatedRarityDist,
        manualOverrideCount,
        finalRarityDist,
        contextDist,
      },
      null,
      2
    )
  );
  console.log(`\nFull per-card + summary output written to ${dir}/`);
}

// ---------------------------------------------------------
// Entry point
// ---------------------------------------------------------

const forceSelfTest = process.argv.includes("--self-test");
const hasEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY));

if (forceSelfTest || !hasEnv) {
  if (!hasEnv && !forceSelfTest) {
    console.log("No Supabase env vars found - running the offline self-test instead of a live audit.\n");
  }
  runSelfTest();
} else {
  await runLiveAudit();
}
