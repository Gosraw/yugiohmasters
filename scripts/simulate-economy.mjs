#!/usr/bin/env node
// =========================================================
// DUELIST CIRCLE ECONOMY SIMULATION (Phase 2, Sections 18-21)
//
// Pure, deterministic, no database or network access required -
// run with `node scripts/simulate-economy.mjs`. Every constant
// below is copied from the human-approved Phase 2 economy baseline
// (see docs/CURRENT_DUELIST_CIRCLE_ECONOMY.md and
// supabase/migrations/202608311100_phase2_economy_central_config_and_round_rewards.sql
// / 202608311200_phase2_pack_price_correction.sql) and is NOT read
// from the live database - if the real values are ever changed,
// this file's CONFIG block must be updated by hand to match, or its
// output will silently describe a stale economy.
//
// PURPOSE: expose PACING, not to justify or trigger a rebalance.
// Per the Phase 2 directive: "Do NOT change economy values based
// solely on the simulation. The purpose is to expose pacing." This
// script only prints numbers; nothing here writes to the database
// or a config file.
//
// KEY MODELING ASSUMPTION (stated once, applies throughout): in the
// real 3-player league, generate_round_robin_matches_v2 produces
// exactly one match per round_number (see that function's own
// comments and 202608311100's migration header) - so for this
// league, "a match" and "a round" are the same event for the two
// players who play it, and the third player's "round" that cycle is
// a bye (participation only, no match). This script treats
// "matches per week" and "rounds per week" as 1:1 per player
// throughout Sections 18-20, which is only true because of this
// specific 3-player structure - it would NOT hold for a >3-player
// competition, where a round can bundle several simultaneous
// matches for different players.
// =========================================================

const CONFIG = {
  match: { winDp: 100, lossDp: 75, drawDp: 75 },
  round: {
    participationDp: 250,
    participationPack: "premium_pack",
    firstDp: 150,
    firstPack: "normal_pack", // "Standard Pack" in the UI
    secondDp: 75,
    thirdBonusDp: 0,
  },
  packPrices: { standard: 300, premium: 900, special: 1200, deluxe: 1500 },
};

function fmt(n) {
  return n.toLocaleString("en-US");
}

// ---------------------------------------------------------
// SECTION 18/20 - single-player pacing at three activity levels.
// Win rate is assumed at 50% throughout (stated explicitly, not
// pulled from any real data - the league has no long-run win-rate
// history to draw from). Every match doubles as "a round" per this
// file's header assumption, so every match also carries the
// universal participation reward.
// ---------------------------------------------------------

function simulatePlayerWeek(matchesPerWeek, winRate = 0.5) {
  const wins = matchesPerWeek * winRate;
  const losses = matchesPerWeek - wins;

  const dpFromMatches = wins * CONFIG.match.winDp + losses * CONFIG.match.lossDp;
  const dpFromParticipation = matchesPerWeek * CONFIG.round.participationDp;
  const dpFromFirstPlace = wins * CONFIG.round.firstDp;
  const dpFromSecondPlace = losses * CONFIG.round.secondDp;

  const totalDp = dpFromMatches + dpFromParticipation + dpFromFirstPlace + dpFromSecondPlace;
  const premiumPacksFree = matchesPerWeek; // one per round, win or lose
  const standardPacksFree = wins; // only the round's match winner

  return {
    matchesPerWeek,
    winRate,
    wins,
    losses,
    totalDp,
    premiumPacksFree,
    standardPacksFree,
    dpPerMatchAverage: totalDp / matchesPerWeek,
  };
}

function matchesToAfford(dpPerMatch, price) {
  return Math.ceil(price / dpPerMatch);
}

function reportPlayerProfile(label, matchesPerWeek) {
  const sim = simulatePlayerWeek(matchesPerWeek);
  console.log(`\n--- ${label} (${matchesPerWeek} matches/week, 50% win rate) ---`);
  console.log(`  Weekly DP: ${fmt(Math.round(sim.totalDp))}  (avg ${sim.dpPerMatchAverage.toFixed(0)} DP/match)`);
  console.log(`  Free packs/week: ${sim.premiumPacksFree} Premium (every round), ${sim.standardPacksFree} Standard (wins only)`);

  const tiers = ["standard", "premium", "special", "deluxe"];
  for (const tier of tiers) {
    const price = CONFIG.packPrices[tier];
    const matchesNeeded = matchesToAfford(sim.dpPerMatchAverage, price);
    const daysNeeded = (matchesNeeded / matchesPerWeek) * 7;
    console.log(
      `  DP-only cost of one ${tier[0].toUpperCase()}${tier.slice(1)} Pack (${price} DP): ~${matchesNeeded} matches (~${daysNeeded.toFixed(1)} days)`
    );
  }

  return sim;
}

// ---------------------------------------------------------
// SECTION 19 - the real 3-player league. One full round-robin cycle
// (meetings_per_pairing = 1) for 3 players is exactly 3 rounds / 3
// matches (see this file's header): each player plays each other
// player once and sits one bye. The example below uses an
// intentionally lopsided result (one player wins both their
// matches, one splits, one loses both) to show a realistic spread,
// not an average.
// ---------------------------------------------------------

function simulateThreePlayerCycle() {
  // Round 1: A beats B (C byes). Round 2: A beats C (B byes).
  // Round 3: B beats C (A byes).
  const players = {
    A: { matchesWon: 2, matchesLost: 0, byes: 1 },
    B: { matchesWon: 1, matchesLost: 1, byes: 1 },
    C: { matchesWon: 0, matchesLost: 2, byes: 1 },
  };

  const results = {};
  for (const [name, p] of Object.entries(players)) {
    const roundsPlayedIn = p.matchesWon + p.matchesLost; // rounds with a real match
    const totalRounds = roundsPlayedIn + p.byes; // always 3 for a 3-player cycle

    const participationDp = totalRounds * CONFIG.round.participationDp;
    const matchDp = p.matchesWon * CONFIG.match.winDp + p.matchesLost * CONFIG.match.lossDp;
    const placementDp = p.matchesWon * CONFIG.round.firstDp + p.matchesLost * CONFIG.round.secondDp;

    results[name] = {
      totalRounds,
      matchesWon: p.matchesWon,
      matchesLost: p.matchesLost,
      byes: p.byes,
      totalDp: participationDp + matchDp + placementDp,
      premiumPacks: totalRounds, // one per round, always
      standardPacks: p.matchesWon, // one per round win
    };
  }

  return results;
}

// ---------------------------------------------------------
// MAIN
// ---------------------------------------------------------

console.log("=".repeat(70));
console.log("DUELIST CIRCLE ECONOMY SIMULATION");
console.log("=".repeat(70));
console.log("\nBaseline used (must match docs/CURRENT_DUELIST_CIRCLE_ECONOMY.md):");
console.log(`  Match: Win +${CONFIG.match.winDp} DP, Loss +${CONFIG.match.lossDp} DP`);
console.log(
  `  Round: Completion +${CONFIG.round.participationDp} DP + 1 Premium Pack, ` +
  `1st +${CONFIG.round.firstDp} DP + 1 Standard Pack, 2nd +${CONFIG.round.secondDp} DP, 3rd +0 DP`
);
console.log(
  `  Pack shop: Standard ${CONFIG.packPrices.standard}, Premium ${CONFIG.packPrices.premium}, ` +
  `Special ${CONFIG.packPrices.special}, Deluxe ${CONFIG.packPrices.deluxe}`
);

console.log("\n" + "=".repeat(70));
console.log("SECTION 18/20 - SINGLE-PLAYER ACTIVITY PROFILES");
console.log("=".repeat(70));

reportPlayerProfile("CASUAL", 10);
const active = reportPlayerProfile("ACTIVE", 20);
reportPlayerProfile("VERY ACTIVE", 30);

console.log("\n" + "=".repeat(70));
console.log("SECTION 19 - THREE-PLAYER LEAGUE (one round-robin cycle: 3 rounds)");
console.log("=".repeat(70));

const cycle = simulateThreePlayerCycle();
for (const [name, r] of Object.entries(cycle)) {
  console.log(
    `\n  Player ${name}: ${r.matchesWon}W-${r.matchesLost}L, ${r.byes} bye, ${r.totalRounds} rounds total`
  );
  console.log(`    Total DP this cycle: ${fmt(r.totalDp)}`);
  console.log(`    Packs this cycle: ${r.premiumPacks} Premium, ${r.standardPacks} Standard`);
}

const dpValues = Object.values(cycle).map((r) => r.totalDp);
const gapPct = ((Math.max(...dpValues) - Math.min(...dpValues)) / Math.min(...dpValues)) * 100;
console.log(`\n  Top-vs-bottom DP gap this cycle: ${gapPct.toFixed(1)}%`);
console.log(
  `  Every player, regardless of result, receives ${CONFIG.round.participationDp * 3} DP and 3 Premium Packs ` +
  `from participation alone this cycle (the largest single component of every player's total).`
);

console.log("\n" + "=".repeat(70));
console.log("SECTION 21 - ROUND PAYOUT EXAMPLES (one round, three placements)");
console.log("=".repeat(70));

const roundExamples = [
  { label: "1st place", matchDp: CONFIG.match.winDp, placementDp: CONFIG.round.firstDp, pack: "Premium + Standard" },
  { label: "2nd place", matchDp: CONFIG.match.lossDp, placementDp: CONFIG.round.secondDp, pack: "Premium" },
  { label: "3rd place (bye)", matchDp: 0, placementDp: 0, pack: "Premium" },
];

for (const ex of roundExamples) {
  const total = ex.matchDp + CONFIG.round.participationDp + ex.placementDp;
  console.log(
    `\n  ${ex.label}: Match DP ${ex.matchDp}, Round DP ${CONFIG.round.participationDp}, ` +
    `Placement ${ex.placementDp}, Pack(s): ${ex.pack} -> Total direct DP: ${total}`
  );
}

console.log("\n" + "=".repeat(70));
console.log("PACING OBSERVATIONS (reported, not auto-applied - see Phase 2 report)");
console.log("=".repeat(70));
console.log(`
  - Standard and Premium packs are earned FREE from ordinary play
    (every round grants a Premium Pack; every round win grants a
    Standard Pack) well before a player would need to buy one with
    DP at any activity level above CASUAL - DP purchases of those
    two tiers are rarely the bottleneck.
  - Special (${CONFIG.packPrices.special} DP) and Deluxe (${CONFIG.packPrices.deluxe} DP) packs have no free
    source and are the real DP sinks. For an ACTIVE player (20
    matches/week, ~${active.dpPerMatchAverage.toFixed(0)} DP/match average), a Special Pack costs about
    ${matchesToAfford(active.dpPerMatchAverage, CONFIG.packPrices.special)} matches (well under a day of play at that pace) and a
    Deluxe Pack about ${matchesToAfford(active.dpPerMatchAverage, CONFIG.packPrices.deluxe)} matches - flagged for human review as a possible
    fast pace for the two highest tiers once Boss Route DP costs are
    set in a future phase (Phase 2 Section 23 asks that this
    simulation's output be available for that later pricing work).
  - The three-player cycle above shows a ${gapPct.toFixed(0)}% DP gap between the
    biggest winner and the biggest loser in one cycle - meaningful,
    but not runaway, because the universal participation reward
    (${CONFIG.round.participationDp} DP + 1 Premium Pack per round, paid to every player every
    round regardless of result) is the largest single component of
    every player's total. A player who loses every match still
    accumulates DP and packs every round they exist in the
    competition, including their own bye round.
`);
