#!/usr/bin/env node
// =========================================================
// RARITY / PACK / DRAFT ECONOMY SIMULATOR
//
// Read-only analysis tool. Never writes to Supabase, never
// touches production data, never changes any live setting.
// Run locally with: node scripts/analyze-rarity.mjs
//
// Everything under CURRENT_* below was re-verified directly
// against the live migration source on 2026-08-21:
//   - supabase/migrations/202608210016_purchase_shop_pack.sql
//     (roll_shop_pack_rarity, purchase_shop_pack pity logic)
//   - supabase/migrations/20260820_shop_system.sql
//     (shop_pack_types default price/cards-per-pack)
//   - supabase/migrations/202608190005_draft_system.sql
//     (draft.rarity_weights, draft.initial_main_picks/xyz_picks)
//   - supabase/migrations/202608200015_practice_no_dp_rewards.sql
//     (award_match_duel_points: hardcoded win/draw/loss DP)
//
// Special Pack price/cards-per-pack is NOT a fixed default in
// the schema - it is set per league admin per rotation
// (shop_rotations.special_pack_price_dp / _cards_per_pack).
// This script uses 250 DP / 5 cards as a stated, clearly
// labeled assumption (matching the "similar strength to
// Premium, but themed" comment in roll_shop_pack_rarity),
// NOT a verified live number.
//
// A seeded PRNG (mulberry32) is used instead of Math.random()
// so re-running this script with the same SEED reproduces
// identical results - useful for comparing CURRENT vs
// PROPOSED runs apples-to-apples.
// =========================================================

const SEED = 20260821;

const PACK_SIM_COUNT = 100_000;
const DRAFT_SIM_COUNT = 20_000;

const RARITIES = [
  "Normal",
  "Rare",
  "Super Rare",
  "Ultra Rare",
  "Secret Rare",
  "Legendary",
];

const RANK = {
  Normal: 1,
  Rare: 2,
  "Super Rare": 3,
  "Ultra Rare": 4,
  "Secret Rare": 5,
  Legendary: 6,
};

// ---------------------------------------------------------
// SEEDED PRNG (mulberry32) - deterministic, reproducible.
// ---------------------------------------------------------

function mulberry32(seed) {
  let state = seed >>> 0;

  return function rand() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------
// PACK ROLL LOGIC - a direct port of roll_shop_pack_rarity()
// and the pity/floor branching in purchase_shop_pack(), from
// supabase/migrations/202608210016_purchase_shop_pack.sql.
// ---------------------------------------------------------

function cumulative(pcts) {
  let sum = 0;
  return pcts.map((p) => (sum += p));
}

function rarityFromCumulative(roll, cumulativeArr) {
  for (let i = 0; i < cumulativeArr.length; i++) {
    if (roll < cumulativeArr[i]) return RARITIES[i];
  }
  return RARITIES[RARITIES.length - 1];
}

// Forced-minimum-rank tables, verbatim from the SQL's FORCED
// RARE+/SUPER+/ULTRA+ branches - identical regardless of pack
// code, and identical between CURRENT and every candidate
// model in this script (only the pack's own base table and
// the pity/floor trigger conditions change between models).
const FORCED_RARE_PLUS = cumulative([0, 55, 28, 12, 4, 1]); // Rare/SuperRare/Ultra/Secret/Legendary after a 0% Normal slot
const FORCED_SUPER_PLUS = cumulative([0, 0, 65, 25, 8, 2]);
const FORCED_ULTRA_PLUS = cumulative([0, 0, 0, 72, 23, 5]);

function rollRarity(baseCumulative, minimumRank, rand) {
  const roll = rand() * 100;

  if (minimumRank >= 4) {
    return rarityFromCumulative(roll, FORCED_ULTRA_PLUS);
  }

  if (minimumRank === 3) {
    return rarityFromCumulative(roll, FORCED_SUPER_PLUS);
  }

  if (minimumRank === 2) {
    return rarityFromCumulative(roll, FORCED_RARE_PLUS);
  }

  return rarityFromCumulative(roll, baseCumulative);
}

// ---------------------------------------------------------
// PACK CONFIG - price, cards/pack, base rarity tables, and
// pity/floor rules per model.
// ---------------------------------------------------------

const PACK_META = {
  normal: { priceDp: 100, cardsPerPack: 3, label: "Normal Pack" },
  premium: { priceDp: 250, cardsPerPack: 5, label: "Premium Pack" },
  deluxe: { priceDp: 500, cardsPerPack: 7, label: "Deluxe Pack" },
  special: {
    priceDp: 250,
    cardsPerPack: 5,
    label: "Special Pack (assumed - admin-configurable per rotation)",
  },
};

// pity: { thresholdPacks, forceRankAtThreshold, floorRank, resetAtRank }
// - floorRank: the minimum rank always forced on the pack's
//   last slot, pity or not (null = no unconditional floor).
// - thresholdPacks: packs-without-reset before forceRankAtThreshold
//   replaces floorRank on the last slot.
// - resetAtRank: pulling this rank or better ANYWHERE in the
//   pack resets the pity counter to 0.
const CURRENT_PITY = {
  normal: { thresholdPacks: 8, forceRankAtThreshold: 3, floorRank: null, resetAtRank: 3 },
  premium: { thresholdPacks: 7, forceRankAtThreshold: 4, floorRank: 2, resetAtRank: 4 },
  deluxe: { thresholdPacks: 5, forceRankAtThreshold: 5, floorRank: 3, resetAtRank: 5 },
  special: { thresholdPacks: 6, forceRankAtThreshold: 4, floorRank: 3, resetAtRank: 4 },
};

// Every candidate model reuses the exact same pity/floor
// trigger MECHANICS as CURRENT - only the base rarity tables
// change. See the final report for a note on whether these
// thresholds still make sense once base rates move.
const MODEL_PITY = CURRENT_PITY;

const CURRENT_PACK_TABLES = {
  normal: [60, 28, 9, 2.5, 0.45, 0.05],
  premium: [25, 35, 25, 10, 4, 1],
  deluxe: [10, 20, 30, 25, 12, 3],
  special: [20, 30, 28, 14, 6, 2],
};

// PROPOSED / "BALANCED" candidate - designed around the
// brief's Legendary targets (Normal .10% / Premium .35% /
// Deluxe 1.25% / Special .75%), smooth declining curve per
// pack, same shape family as CURRENT.
const BALANCED_PACK_TABLES = {
  normal: [68, 24, 6.5, 1.15, 0.2, 0.1],
  premium: [30, 38, 22, 8, 1.65, 0.35],
  deluxe: [14, 24, 32, 22, 6.75, 1.25],
  special: [22, 32, 28, 14, 3.25, 0.75],
};

const CONSERVATIVE_PACK_TABLES = {
  normal: [74, 21, 4.3, 0.55, 0.1, 0.05],
  premium: [34, 40, 19, 5.8, 1.0, 0.2],
  deluxe: [18, 27, 33, 17.5, 3.7, 0.8],
  special: [26, 35, 27, 9.8, 1.75, 0.45],
};

const GENEROUS_PACK_TABLES = {
  normal: [62, 27, 8.5, 1.8, 0.5, 0.2],
  premium: [26, 36, 24, 10.5, 2.9, 0.6],
  deluxe: [11, 20, 31, 26, 10, 2],
  special: [18, 29, 29, 17.3, 5.5, 1.2],
};

// ---------------------------------------------------------
// DRAFT CONFIG
// ---------------------------------------------------------

const DRAFT_PICKS = 62; // draft.initial_main_picks (60) + draft.initial_xyz_picks (2)
const DRAFT_OPTIONS_PER_PICK = 3; // draft.options_per_pick

const CURRENT_DRAFT_WEIGHTS = {
  Normal: 42,
  Rare: 28,
  "Super Rare": 17,
  "Ultra Rare": 8,
  "Secret Rare": 4,
  Legendary: 1,
};

const BALANCED_DRAFT_WEIGHTS = {
  Normal: 56.0,
  Rare: 28.0,
  "Super Rare": 11.0,
  "Ultra Rare": 3.5,
  "Secret Rare": 1.0,
  Legendary: 0.5,
};

const CONSERVATIVE_DRAFT_WEIGHTS = {
  Normal: 65,
  Rare: 24,
  "Super Rare": 8,
  "Ultra Rare": 2.3,
  "Secret Rare": 0.5,
  Legendary: 0.2,
};

// Deliberately still BELOW every CURRENT weight for Ultra/
// Secret/Legendary (42/28/17/8/4/1) - "generous" here means
// "the most generous of these three redesigned candidates",
// not "more generous than the problematic status quo". See
// the CURRENT draft simulation above (P(2+ Legendary) ~55%)
// for why staying under current on the top three tiers is a
// hard constraint even for this model.
const GENEROUS_DRAFT_WEIGHTS = {
  Normal: 50,
  Rare: 28,
  "Super Rare": 13.5,
  "Ultra Rare": 5.5,
  "Secret Rare": 2.2,
  Legendary: 0.8,
};

// ---------------------------------------------------------
// PACK SIMULATION
// ---------------------------------------------------------

function simulatePacks(packCode, baseTable, pityConfig, packCount, rand) {
  const meta = PACK_META[packCode];
  const cumulativeBase = cumulative(baseTable);
  const pity = pityConfig[packCode];

  const cardTally = Object.fromEntries(RARITIES.map((r) => [r, 0]));

  let pityCounter = 0;
  let packsWithUltraPlus = 0;
  let packsWithSecretPlus = 0;
  let packsWithLegendary = 0;
  let totalUltraPlusCards = 0;
  let totalSecretPlusCards = 0;
  let totalLegendaryCards = 0;

  for (let p = 0; p < packCount; p++) {
    let packHasUltraPlus = false;
    let packHasSecretPlus = false;
    let packHasLegendary = false;
    let hitReset = false;

    for (let slot = 1; slot <= meta.cardsPerPack; slot++) {
      let minimumRank = 1;

      if (slot === meta.cardsPerPack) {
        if (pityCounter >= pity.thresholdPacks) {
          minimumRank = pity.forceRankAtThreshold;
        } else if (pity.floorRank) {
          minimumRank = pity.floorRank;
        }
      }

      const rarity = rollRarity(cumulativeBase, minimumRank, rand);
      const rank = RANK[rarity];

      cardTally[rarity]++;

      if (rank >= 4) {
        totalUltraPlusCards++;
        packHasUltraPlus = true;
      }

      if (rank >= 5) {
        totalSecretPlusCards++;
        packHasSecretPlus = true;
      }

      if (rank >= 6) {
        totalLegendaryCards++;
        packHasLegendary = true;
      }

      if (rank >= pity.resetAtRank) {
        hitReset = true;
      }
    }

    pityCounter = hitReset ? 0 : pityCounter + 1;

    if (packHasUltraPlus) packsWithUltraPlus++;
    if (packHasSecretPlus) packsWithSecretPlus++;
    if (packHasLegendary) packsWithLegendary++;
  }

  const totalCards = packCount * meta.cardsPerPack;

  return {
    packCode,
    label: meta.label,
    priceDp: meta.priceDp,
    cardsPerPack: meta.cardsPerPack,
    packCount,
    totalCards,
    cardTally,
    packsWithUltraPlus,
    packsWithSecretPlus,
    packsWithLegendary,
    totalUltraPlusCards,
    totalSecretPlusCards,
    totalLegendaryCards,
  };
}

function reportPackModel(modelName, packTables, pityConfig, rand) {
  const results = {};

  for (const packCode of Object.keys(PACK_META)) {
    results[packCode] = simulatePacks(
      packCode,
      packTables[packCode],
      pityConfig,
      PACK_SIM_COUNT,
      rand
    );
  }

  return results;
}

function printPackReport(modelName, results) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`PACK SIMULATION - ${modelName} (${PACK_SIM_COUNT.toLocaleString()} packs/type)`);
  console.log("=".repeat(70));

  for (const packCode of Object.keys(PACK_META)) {
    const r = results[packCode];
    const pct = (n) => ((n / r.totalCards) * 100).toFixed(3) + "%";
    const packPct = (n) => ((n / r.packCount) * 100).toFixed(2) + "%";

    const avgPacksToLegendary = r.totalLegendaryCards > 0
      ? (r.packCount / r.totalLegendaryCards).toFixed(1)
      : "n/a (0 pulled)";

    const legendaryRate = r.totalLegendaryCards / r.packCount;
    const dpPerUltraPlus = r.totalUltraPlusCards > 0
      ? ((r.priceDp * r.packCount) / r.totalUltraPlusCards).toFixed(0)
      : "n/a";
    const dpPerSecretPlus = r.totalSecretPlusCards > 0
      ? ((r.priceDp * r.packCount) / r.totalSecretPlusCards).toFixed(0)
      : "n/a";
    const dpPerLegendary = r.totalLegendaryCards > 0
      ? ((r.priceDp * r.packCount) / r.totalLegendaryCards).toFixed(0)
      : "n/a";

    console.log(`\n--- ${r.label} (${r.priceDp} DP, ${r.cardsPerPack} cards/pack) ---`);
    console.log(
      RARITIES.map((rar) => `${rar}: ${pct(r.cardTally[rar])}`).join("  |  ")
    );
    console.log(`P(pack has >=1 Ultra Rare+):  ${packPct(r.packsWithUltraPlus)}`);
    console.log(`P(pack has >=1 Secret Rare+): ${packPct(r.packsWithSecretPlus)}`);
    console.log(`P(pack has >=1 Legendary):    ${packPct(r.packsWithLegendary)}`);
    console.log(`Avg packs between Legendary pulls: ~${avgPacksToLegendary}`);
    console.log(
      `Legendary per 10 packs: ${(legendaryRate * 10).toFixed(3)}   ` +
      `per 50: ${(legendaryRate * 50).toFixed(2)}   ` +
      `per 100: ${(legendaryRate * 100).toFixed(2)}`
    );
    console.log(`DP per expected Ultra Rare+:  ${dpPerUltraPlus} DP`);
    console.log(`DP per expected Secret Rare+: ${dpPerSecretPlus} DP`);
    console.log(`DP per expected Legendary:    ${dpPerLegendary} DP`);
  }
}

// ---------------------------------------------------------
// DRAFT SIMULATION
//
// Models a rational "always pick the highest rarity of the 3
// offered options" player - an UPPER BOUND. It does NOT model
// per-league scarcity: card_copy_limit caps and the fact that
// every player in the league draws from the same finite
// card_catalog pool both pull real outcomes down somewhat.
// No live catalog size was available this session (no network
// access to Supabase from either sandbox - see final report),
// so that depletion effect is not modeled here.
// ---------------------------------------------------------

function weightedDraw(weights, rand) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = rand() * total;

  for (const r of RARITIES) {
    roll -= weights[r];
    if (roll < 0) return r;
  }

  return RARITIES[RARITIES.length - 1];
}

function simulateOneDraft(weights, picks, optionsPerPick, rand) {
  const tally = Object.fromEntries(RARITIES.map((r) => [r, 0]));

  for (let i = 0; i < picks; i++) {
    let bestRarity = null;
    let bestRank = -1;

    for (let opt = 0; opt < optionsPerPick; opt++) {
      const r = weightedDraw(weights, rand);
      if (RANK[r] > bestRank) {
        bestRank = RANK[r];
        bestRarity = r;
      }
    }

    tally[bestRarity]++;
  }

  return tally;
}

function reportDraftModel(weights, draftCount, rand) {
  const aggregateTally = Object.fromEntries(RARITIES.map((r) => [r, 0]));
  const legendaryCounts = new Array(draftCount);
  let secretPlusDrafts = 0;

  for (let d = 0; d < draftCount; d++) {
    const tally = simulateOneDraft(weights, DRAFT_PICKS, DRAFT_OPTIONS_PER_PICK, rand);

    for (const r of RARITIES) aggregateTally[r] += tally[r];

    legendaryCounts[d] = tally.Legendary;

    if (tally["Secret Rare"] + tally.Legendary > 0) secretPlusDrafts++;
  }

  const zeroLegendary = legendaryCounts.filter((n) => n === 0).length;
  const oneLegendary = legendaryCounts.filter((n) => n === 1).length;
  const twoPlusLegendary = legendaryCounts.filter((n) => n >= 2).length;

  const ultraPlusPerDraft =
    (aggregateTally["Ultra Rare"] + aggregateTally["Secret Rare"] + aggregateTally.Legendary) /
    draftCount;

  return {
    draftCount,
    aggregateTally,
    avgPerDraft: Object.fromEntries(
      RARITIES.map((r) => [r, aggregateTally[r] / draftCount])
    ),
    zeroLegendaryPct: (zeroLegendary / draftCount) * 100,
    oneLegendaryPct: (oneLegendary / draftCount) * 100,
    twoPlusLegendaryPct: (twoPlusLegendary / draftCount) * 100,
    secretPlusDraftPct: (secretPlusDrafts / draftCount) * 100,
    ultraPlusPerDraft,
    ultraPlusSharePct: (ultraPlusPerDraft / DRAFT_PICKS) * 100,
  };
}

function printDraftReport(modelName, weights, result) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`DRAFT SIMULATION - ${modelName} (${DRAFT_SIM_COUNT.toLocaleString()} simulated drafts, ${DRAFT_PICKS} picks each, best-of-${DRAFT_OPTIONS_PER_PICK})`);
  console.log("=".repeat(70));
  console.log("Weights: " + JSON.stringify(weights));

  for (const r of RARITIES) {
    console.log(
      `${r.padEnd(12)}  avg ${result.avgPerDraft[r].toFixed(2)}/draft  ` +
      `(${((result.avgPerDraft[r] / DRAFT_PICKS) * 100).toFixed(2)}% of draft)`
    );
  }

  console.log(`\nTotal Ultra Rare+ per draft: ~${result.ultraPlusPerDraft.toFixed(2)} (${result.ultraPlusSharePct.toFixed(1)}% of draft)`);
  console.log(`P(0 Legendary in draft):  ${result.zeroLegendaryPct.toFixed(2)}%`);
  console.log(`P(exactly 1 Legendary):   ${result.oneLegendaryPct.toFixed(2)}%`);
  console.log(`P(2+ Legendary):          ${result.twoPlusLegendaryPct.toFixed(2)}%`);
  console.log(`P(>=1 Secret Rare+ card): ${result.secretPlusDraftPct.toFixed(2)}%`);
}

// ---------------------------------------------------------
// DP ECONOMY (gameplay-based, from verified defaults)
//
// award_match_duel_points() in
// 202608200015_practice_no_dp_rewards.sql hardcodes:
//   League Duel win  = +100 DP
//   League Duel draw = +50 DP each
//   League Duel loss = +25 DP
//   Practice Duel     = +0 DP automatic
// (the earlier economy.match_win_dp / match_loss_dp settings
// rows from 202608190001_phase1_foundation.sql are not read by
// this function - they appear superseded/unused by it).
//
// This is real, sourced gameplay income - NOT invented. It
// deliberately ignores competition placement DP and
// achievement DP, which exist but are too configurable/
// irregular to turn into a fair "DP per hour" number - that
// omission is called out explicitly below rather than guessed.
// ---------------------------------------------------------

function printDpEconomy() {
  console.log(`\n${"=".repeat(70)}`);
  console.log("DP ECONOMY (gameplay-sourced, from verified defaults)");
  console.log("=".repeat(70));
  console.log("League Duel: win +100 DP, draw +50 DP each, loss +25 DP (hardcoded in award_match_duel_points()).");
  console.log("Practice Duel: +0 DP automatically (wagers still allowed).");
  console.log("Competition placement DP and achievement DP also exist, but their amounts are per-league/per-competition");
  console.log("settings (competition.cp_by_position, achievements.default_reward_dp) with no single fair default -");
  console.log("not included below, so these DP-per-pack figures are a FLOOR on how fast a player can reach 10 packs,");
  console.log("not the whole picture.");

  const scenarios = [
    { label: "Even record (50% win rate)", avgDp: (100 + 25) / 2 },
    { label: "Strong record (65% win rate)", avgDp: 100 * 0.65 + 25 * 0.35 },
  ];

  for (const packCode of Object.keys(PACK_META)) {
    const meta = PACK_META[packCode];
    console.log(`\n${meta.label} - ${meta.priceDp} DP each, 10 packs = ${meta.priceDp * 10} DP`);

    for (const s of scenarios) {
      const duels = Math.ceil((meta.priceDp * 10) / s.avgDp);
      console.log(`  ${s.label}: ~${s.avgDp.toFixed(1)} DP/duel avg -> ~${duels} league duels for 10 packs`);
    }
  }
}

// ---------------------------------------------------------
// MAIN
// ---------------------------------------------------------

function runModel(name, packTables, draftWeights, rand) {
  const packResults = reportPackModel(name, packTables, MODEL_PITY, rand);
  printPackReport(name, packResults);

  const draftResult = reportDraftModel(draftWeights, DRAFT_SIM_COUNT, rand);
  printDraftReport(name, draftWeights, draftResult);

  return { packResults, draftResult };
}

async function main() {
  console.log("Duelist Circle - rarity/pack/draft economy simulator");
  console.log(`Seed: ${SEED} (deterministic - re-running reproduces identical numbers)`);
  console.log(`Pack sims: ${PACK_SIM_COUNT.toLocaleString()} per type per model`);
  console.log(`Draft sims: ${DRAFT_SIM_COUNT.toLocaleString()} per model`);
  console.log("\nNO production data is read or written. NO live odds are changed by this script.");

  const currentResult = runModel(
    "CURRENT (production)",
    CURRENT_PACK_TABLES,
    CURRENT_DRAFT_WEIGHTS,
    mulberry32(SEED)
  );

  const conservativeResult = runModel(
    "CANDIDATE: CONSERVATIVE",
    CONSERVATIVE_PACK_TABLES,
    CONSERVATIVE_DRAFT_WEIGHTS,
    mulberry32(SEED + 1)
  );

  const balancedResult = runModel(
    "CANDIDATE: BALANCED / PROPOSED",
    BALANCED_PACK_TABLES,
    BALANCED_DRAFT_WEIGHTS,
    mulberry32(SEED + 2)
  );

  const generousResult = runModel(
    "CANDIDATE: GENEROUS",
    GENEROUS_PACK_TABLES,
    GENEROUS_DRAFT_WEIGHTS,
    mulberry32(SEED + 3)
  );

  printDpEconomy();

  console.log(`\n${"=".repeat(70)}`);
  console.log("NONE of these candidate percentages have been applied to production.");
  console.log("draft.rarity_weights and the pack rarity tables in roll_shop_pack_rarity() are UNCHANGED.");
  console.log("=".repeat(70));

  void currentResult;
  void conservativeResult;
  void balancedResult;
  void generousResult;
}

main();
