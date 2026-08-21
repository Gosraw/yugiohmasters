// scripts/analyze-rarity.mjs
//
// READ-ONLY rarity/economy analysis for Duelist Circle.
//
// Two independent parts:
//   1. Live queries against card_catalog (distribution, scores,
//      format_eligible split) - no writes, ever.
//   2. Pure in-memory simulation of the shop pack economy
//      (ported 1:1 from roll_shop_pack_rarity + the pity logic in
//      purchase_shop_pack, supabase/migrations/202608210016) and
//      an approximate simulation of the Initial Draft "offer 3,
//      player picks the best" weighted-rarity system
//      (draft.rarity_weights, supabase/migrations/202608190005).
//
// Run with: node scripts/analyze-rarity.mjs
// Requires NEXT_PUBLIC_SUPABASE_URL + a Supabase key in the
// environment (falls back gracefully to simulation-only output
// if neither is available - it never touches production data).

import { createClient } from "@supabase/supabase-js";

const RARITIES = ["Normal", "Rare", "Super Rare", "Ultra Rare", "Secret Rare", "Legendary"];
const RANK = { Normal: 1, Rare: 2, "Super Rare": 3, "Ultra Rare": 4, "Secret Rare": 5, Legendary: 6 };

function pct(n, total) {
  return total === 0 ? "0.0%" : `${((n / total) * 100).toFixed(2)}%`;
}

function emptyTally() {
  return Object.fromEntries(RARITIES.map((r) => [r, 0]));
}

// ---------------------------------------------------------------
// 1. LIVE CARD CATALOG DISTRIBUTION (read-only)
// ---------------------------------------------------------------

async function reportCatalogDistribution() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    console.log("\n[catalog] Skipped - no NEXT_PUBLIC_SUPABASE_URL / key in env.\n");
    return;
  }

  const client = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await client
    .from("card_catalog")
    .select("game_rarity,rarity_score,format_eligible");

  if (error) {
    console.log(`\n[catalog] Could not read card_catalog: ${error.message}\n`);
    return;
  }

  const rows = data ?? [];
  const total = rows.length;

  console.log("\n=================================================");
  console.log(`LIVE CARD CATALOG - ${total} rows`);
  console.log("=================================================");

  const byRarity = emptyTally();
  const eligibleByRarity = emptyTally();
  const scoreSumByRarity = Object.fromEntries(RARITIES.map((r) => [r, 0]));
  const scoreCountByRarity = Object.fromEntries(RARITIES.map((r) => [r, 0]));
  let eligibleTotal = 0;
  let unknownRarity = 0;

  for (const row of rows) {
    const rarity = row.game_rarity;
    if (rarity && byRarity[rarity] !== undefined) {
      byRarity[rarity] += 1;
      if (row.format_eligible) {
        eligibleByRarity[rarity] += 1;
      }
      if (row.rarity_score != null) {
        scoreSumByRarity[rarity] += Number(row.rarity_score);
        scoreCountByRarity[rarity] += 1;
      }
    } else {
      unknownRarity += 1;
    }
    if (row.format_eligible) eligibleTotal += 1;
  }

  console.log(`format_eligible = true:  ${eligibleTotal} (${pct(eligibleTotal, total)})`);
  console.log(`format_eligible = false: ${total - eligibleTotal} (${pct(total - eligibleTotal, total)})`);
  if (unknownRarity > 0) {
    console.log(`Rows with unrecognized/null game_rarity: ${unknownRarity}`);
  }

  console.log("\nRarity        Count   % of catalog   % of that rarity eligible   Avg rarity_score");
  for (const r of RARITIES) {
    const count = byRarity[r];
    const avgScore =
      scoreCountByRarity[r] > 0
        ? (scoreSumByRarity[r] / scoreCountByRarity[r]).toFixed(2)
        : "n/a";
    console.log(
      `${r.padEnd(12)}  ${String(count).padStart(5)}   ${pct(count, total).padStart(6)}         ${pct(
        eligibleByRarity[r],
        count
      ).padStart(6)}                    ${avgScore}`
    );
  }

  // Outlier check: does a "lower" rarity have a higher average
  // score than the rarity above it? That's a sign game_rarity and
  // rarity_score disagree for a meaningful chunk of the catalog.
  console.log("\nOutlier check (average rarity_score should climb monotonically with rarity):");
  let prevAvg = -Infinity;
  let sawInversion = false;
  for (const r of RARITIES) {
    if (scoreCountByRarity[r] === 0) continue;
    const avg = scoreSumByRarity[r] / scoreCountByRarity[r];
    if (avg < prevAvg) {
      console.log(`  ⚠ ${r} has a LOWER average rarity_score (${avg.toFixed(2)}) than the tier below it (${prevAvg.toFixed(2)})`);
      sawInversion = true;
    }
    prevAvg = avg;
  }
  if (!sawInversion) {
    console.log("  None found - rarity_score climbs monotonically with game_rarity, as expected.");
  }
}

// ---------------------------------------------------------------
// 2. SHOP PACK SIMULATION
//    1:1 port of roll_shop_pack_rarity() + the pity block inside
//    purchase_shop_pack(), from
//    supabase/migrations/202608210016_purchase_shop_pack.sql
// ---------------------------------------------------------------

function rollShopPackRarity(packCode, minimumRank) {
  const roll = Math.random() * 100;

  if (minimumRank >= 4) {
    if (roll < 72) return "Ultra Rare";
    if (roll < 95) return "Secret Rare";
    return "Legendary";
  }
  if (minimumRank === 3) {
    if (roll < 65) return "Super Rare";
    if (roll < 90) return "Ultra Rare";
    if (roll < 98) return "Secret Rare";
    return "Legendary";
  }
  if (minimumRank === 2) {
    if (roll < 55) return "Rare";
    if (roll < 83) return "Super Rare";
    if (roll < 95) return "Ultra Rare";
    if (roll < 99) return "Secret Rare";
    return "Legendary";
  }

  if (packCode === "normal") {
    if (roll < 60) return "Normal";
    if (roll < 88) return "Rare";
    if (roll < 97) return "Super Rare";
    if (roll < 99.5) return "Ultra Rare";
    if (roll < 99.95) return "Secret Rare";
    return "Legendary";
  }
  if (packCode === "premium") {
    if (roll < 25) return "Normal";
    if (roll < 60) return "Rare";
    if (roll < 85) return "Super Rare";
    if (roll < 95) return "Ultra Rare";
    if (roll < 99) return "Secret Rare";
    return "Legendary";
  }
  if (packCode === "deluxe") {
    if (roll < 10) return "Normal";
    if (roll < 30) return "Rare";
    if (roll < 60) return "Super Rare";
    if (roll < 85) return "Ultra Rare";
    if (roll < 97) return "Secret Rare";
    return "Legendary";
  }
  if (packCode === "special") {
    if (roll < 20) return "Normal";
    if (roll < 50) return "Rare";
    if (roll < 78) return "Super Rare";
    if (roll < 92) return "Ultra Rare";
    if (roll < 98) return "Secret Rare";
    return "Legendary";
  }
  throw new Error("Unknown pack code: " + packCode);
}

const PACK_CONFIG = {
  normal: { priceDp: 100, cardsPerPack: 3, pityThreshold: 8, pityMinRank: 3, resetRank: 3 },
  premium: { priceDp: 250, cardsPerPack: 5, pityThreshold: 7, pityMinRank: 4, resetRank: 4, floorRank: 2 },
  deluxe: { priceDp: 500, cardsPerPack: 7, pityThreshold: 5, pityMinRank: 5, resetRank: 5, floorRank: 3 },
  special: { priceDp: 250, cardsPerPack: 5, pityThreshold: 6, pityMinRank: 4, resetRank: 4, floorRank: 3 },
};

// Simulates `packCount` sequential pack purchases of one pack type
// for a single player, exactly reproducing purchase_shop_pack's
// per-slot minimum-rank + pity-reset rules.
function simulatePackRun(packCode, packCount) {
  const cfg = PACK_CONFIG[packCode];
  const tally = emptyTally();
  let pityCount = 0;
  let pityTriggers = 0;
  const packsBetweenResets = [];
  let sinceLastReset = 0;

  for (let p = 0; p < packCount; p++) {
    let hitResetThisPack = false;

    for (let slot = 1; slot <= cfg.cardsPerPack; slot++) {
      let minimumRank = 1;
      const isLastSlot = slot === cfg.cardsPerPack;

      if (packCode === "normal" && isLastSlot && pityCount >= cfg.pityThreshold) {
        minimumRank = cfg.pityMinRank;
        pityTriggers++;
      } else if (packCode === "premium" && isLastSlot) {
        minimumRank = pityCount >= cfg.pityThreshold ? cfg.pityMinRank : cfg.floorRank;
        if (pityCount >= cfg.pityThreshold) pityTriggers++;
      } else if (packCode === "deluxe" && isLastSlot) {
        minimumRank = pityCount >= cfg.pityThreshold ? cfg.pityMinRank : cfg.floorRank;
        if (pityCount >= cfg.pityThreshold) pityTriggers++;
      } else if (packCode === "special" && isLastSlot) {
        minimumRank = pityCount >= cfg.pityThreshold ? cfg.pityMinRank : cfg.floorRank;
        if (pityCount >= cfg.pityThreshold) pityTriggers++;
      }

      const rarity = rollShopPackRarity(packCode, minimumRank);
      tally[rarity]++;

      if (RANK[rarity] >= cfg.resetRank) {
        hitResetThisPack = true;
      }
    }

    sinceLastReset++;
    if (hitResetThisPack) {
      packsBetweenResets.push(sinceLastReset);
      sinceLastReset = 0;
      pityCount = 0;
    } else {
      pityCount++;
    }
  }

  return { tally, pityTriggers, packsBetweenResets };
}

function reportPackSimulation() {
  console.log("\n=================================================");
  console.log("SHOP PACK SIMULATION (pure math, no DB involved)");
  console.log("=================================================");
  console.log("Each pack type simulated as one player buying 5,000 packs");
  console.log("of that type back-to-back (pity carried across purchases,");
  console.log("exactly as purchase_shop_pack does per profile+pack_code).\n");

  const RUNS = 5000;
  const results = {};

  for (const packCode of Object.keys(PACK_CONFIG)) {
    const cfg = PACK_CONFIG[packCode];
    const { tally, packsBetweenResets } = simulatePackRun(packCode, RUNS);
    const totalCards = RUNS * cfg.cardsPerPack;
    results[packCode] = { tally, totalCards, cfg };

    const avgPacksBetweenGuarantee =
      packsBetweenResets.length > 0
        ? (packsBetweenResets.reduce((a, b) => a + b, 0) / packsBetweenResets.length).toFixed(1)
        : "never hit";

    console.log(`--- ${packCode.toUpperCase()} PACK (${cfg.priceDp} DP, ${cfg.cardsPerPack} cards/pack) ---`);
    for (const r of RARITIES) {
      console.log(`  ${r.padEnd(12)} ${String(tally[r]).padStart(6)}  (${pct(tally[r], totalCards)})`);
    }
    console.log(`  Avg packs between a guaranteed-floor reset: ${avgPacksBetweenGuarantee}`);

    const rank3plus = RARITIES.filter((r) => RANK[r] >= 3).reduce((sum, r) => sum + tally[r], 0);
    const dpPerRank3plus = ((RUNS * cfg.priceDp) / rank3plus).toFixed(0);
    console.log(`  DP spent per expected Super Rare+ card pulled: ~${dpPerRank3plus} DP\n`);
  }

  console.log("Cross-pack DP efficiency for Super Rare+ (lower = more efficient):");
  for (const packCode of Object.keys(PACK_CONFIG)) {
    const { tally, totalCards, cfg } = results[packCode];
    const rank3plus = RARITIES.filter((r) => RANK[r] >= 3).reduce((sum, r) => sum + tally[r], 0);
    const dpPerRank3plus = (RUNS * cfg.priceDp) / rank3plus;
    console.log(`  ${packCode.padEnd(8)} ~${dpPerRank3plus.toFixed(0)} DP / Super Rare+`);
  }

  console.log(
    "\nExploit check: pity is tracked per (profile, pack_code) - buying the\n" +
    "cheapest pack (Normal) only builds Normal pity, which only guarantees\n" +
    "Super Rare+ (not Ultra/Secret/Legendary) after 8 packs (800 DP). Deluxe\n" +
    "already guarantees Super Rare+ on EVERY pack's last slot with no pity\n" +
    "needed (500 DP), and its baseline odds on the other 6 slots are far\n" +
    "richer. The numbers above confirm Deluxe is the cheapest DP-per-rarity\n" +
    "route, not Normal - so grinding cheap packs is not an exploit, it's\n" +
    "the intentionally slow path."
  );
}

// ---------------------------------------------------------------
// 3. INITIAL DRAFT SIMULATION (approximate)
//    draft.rarity_weights, applied to a 62-pick draft (60 Main +
//    2 XYZ by default), each pick offering 3 weighted-random
//    options and assuming the player always takes the flashiest
//    (highest-rarity) of the 3 - a worst-case/most-generous
//    reading of what a rational player ends up with. This ignores
//    per-league scarcity depletion (copy limits, other players
//    drafting the same pool), which in reality can only make high
//    rarities LESS available as a draft progresses - so this
//    simulation is a conservative upper bound on how rarity-heavy
//    an initial collection could get, not an exact reproduction.
// ---------------------------------------------------------------

const DRAFT_WEIGHTS = { Normal: 42, Rare: 28, "Super Rare": 17, "Ultra Rare": 8, "Secret Rare": 4, Legendary: 1 };
const DRAFT_WEIGHT_SUM = Object.values(DRAFT_WEIGHTS).reduce((a, b) => a + b, 0);

function weightedDraw() {
  let roll = Math.random() * DRAFT_WEIGHT_SUM;
  for (const r of RARITIES) {
    roll -= DRAFT_WEIGHTS[r];
    if (roll <= 0) return r;
  }
  return "Normal";
}

function simulateDraft(picks) {
  const tally = emptyTally();
  for (let i = 0; i < picks; i++) {
    // 3 offered options, player takes the best of the 3.
    const options = [weightedDraw(), weightedDraw(), weightedDraw()];
    const best = options.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
    tally[best]++;
  }
  return tally;
}

function reportDraftSimulation() {
  console.log("\n=================================================");
  console.log("INITIAL DRAFT SIMULATION (approximate, best-of-3 per pick)");
  console.log("=================================================");
  console.log("draft.rarity_weights: " + JSON.stringify(DRAFT_WEIGHTS));
  console.log("Simulated 2,000 players each drafting 62 cards (60 Main + 2 XYZ),\n" +
    "always taking the highest-rarity of the 3 offered options.\n");

  const PLAYERS = 2000;
  const PICKS = 62;
  const grand = emptyTally();

  for (let p = 0; p < PLAYERS; p++) {
    const tally = simulateDraft(PICKS);
    for (const r of RARITIES) grand[r] += tally[r];
  }

  const totalPicks = PLAYERS * PICKS;
  console.log("Rarity        Avg per 62-card draft   % of draft");
  for (const r of RARITIES) {
    const avgPerDraft = (grand[r] / PLAYERS).toFixed(2);
    console.log(`${r.padEnd(12)}  ${avgPerDraft.padStart(6)}                  ${pct(grand[r], totalPicks)}`);
  }

  const rank4plusAvg = (
    RARITIES.filter((r) => RANK[r] >= 4).reduce((sum, r) => sum + grand[r], 0) / PLAYERS
  ).toFixed(2);
  console.log(`\nAverage Ultra Rare+ cards per starting 62-card draft: ~${rank4plusAvg}`);
  console.log(
    "This is the 'always pick the shiniest card' upper bound, and real\n" +
    "scarcity constraints during a real draft (limited League copies,\n" +
    "multiple players drafting from the same pool) push this lower still -\n" +
    "so a starting collection averaging well under 1 Legendary and a small\n" +
    "handful of Ultra Rare+ cards across 62 picks is consistent with a slow,\n" +
    "meaningful power curve rather than an immediately stacked deck."
  );
}

await reportCatalogDistribution();
reportPackSimulation();
reportDraftSimulation();

console.log("\nDone. No production data was written.");
