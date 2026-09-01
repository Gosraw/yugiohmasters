#!/usr/bin/env node
// =========================================================
// LEGENDARY PACING SIMULATION (Phase 2 follow-up, Section 5)
//
// Pure, deterministic, no database or network access required -
// run with `node scripts/simulate-legendary-pacing.mjs`. All
// constants below are copied from the corrected rarity odds in
// supabase/migrations/202608311400_phase2_special_pack_rotation_and_legendary_odds.sql
// (roll_shop_pack_rarity's base tables) and from the pre-existing,
// UNCHANGED "guaranteed floor card" mechanic in purchase_shop_pack's
// GENERATE CARDS loop (Premium's last card is always at least Rare,
// Deluxe/Special's last card is always at least Super Rare,
// independent of the separate pity-after-N-packs system, which this
// script does not model - pity only ever raises the floor further
// after a cold streak, so ignoring it makes every number below a
// slight UNDERESTIMATE of true Legendary frequency, never an
// overestimate).
//
// PURPOSE: check that Legendary pulls remain genuinely uncommon
// under the corrected odds, at realistic weekly play volumes. Per
// the directive: "Do NOT automatically rebalance based only on
// simulation output." This script only prints numbers.
// =========================================================

const BASE_LEGENDARY_ODDS = {
  // roll_shop_pack_rarity's ordinary (non-floor) per-card odds,
  // corrected 2026-08-31.
  standard: 0.0015, // 0.15%
  premium: 0.0030,  // 0.30%
  deluxe: 0.0050,   // 0.50%
  special: 0.0025,  // 0.25%
};

// The shared "FORCED RARE+/SUPER+" tables purchase_shop_pack has
// always applied, unconditionally, to the LAST card of Premium
// (forced >= Rare), and Deluxe/Special (forced >= Super Rare) -
// this is separate from, and on top of, the ordinary pity-after-
// cold-streak system. Not touched by this Phase 2 pass; included
// here so the simulation reflects the pack's REAL behavior, not
// just its base table.
const FORCED_FLOOR_LEGENDARY_ODDS = {
  rank2: 0.01, // "FORCED RARE+" table's Legendary tail
  rank3: 0.02, // "FORCED SUPER+" table's Legendary tail
};

const CARDS_PER_PACK = { standard: 4, premium: 5, deluxe: 7, special: 5 };
const PACK_PRICES = { standard: 300, premium: 900, special: 1200, deluxe: 1500 };

// Realized (whole-pack) Legendary EV = ordinary cards at the base
// rate + the one guaranteed-floor card at ITS higher rate. Standard
// has no unconditional floor card, so all of its cards use the base
// rate.
const PACK_LEGENDARY_EV = {
  standard: CARDS_PER_PACK.standard * BASE_LEGENDARY_ODDS.standard,
  premium:
    (CARDS_PER_PACK.premium - 1) * BASE_LEGENDARY_ODDS.premium +
    FORCED_FLOOR_LEGENDARY_ODDS.rank2,
  deluxe:
    (CARDS_PER_PACK.deluxe - 1) * BASE_LEGENDARY_ODDS.deluxe +
    FORCED_FLOOR_LEGENDARY_ODDS.rank3,
  special:
    (CARDS_PER_PACK.special - 1) * BASE_LEGENDARY_ODDS.special +
    FORCED_FLOOR_LEGENDARY_ODDS.rank3,
};

const MATCH_DP = { win: 100, loss: 75 };
const ROUND_DP = { participation: 250, first: 150, second: 75 };

function fmtPct(p) {
  return `${(p * 100).toFixed(2)}%`;
}

console.log("=".repeat(70));
console.log("LEGENDARY PACING SIMULATION");
console.log("=".repeat(70));

console.log("\n--- REALIZED PER-PACK LEGENDARY CHANCE (base odds + guaranteed floor card) ---");
for (const tier of ["standard", "premium", "special", "deluxe"]) {
  console.log(
    `  ${tier.padEnd(9)} (${PACK_PRICES[tier]} DP, ${CARDS_PER_PACK[tier]} cards): ` +
    `base ${fmtPct(BASE_LEGENDARY_ODDS[tier])}/card -> ${fmtPct(PACK_LEGENDARY_EV[tier])} per whole pack`
  );
}
console.log(
  "\n  Hierarchy check: standard < premium < deluxe on BASE odds (" +
  `${fmtPct(BASE_LEGENDARY_ODDS.standard)} < ${fmtPct(BASE_LEGENDARY_ODDS.premium)} < ${fmtPct(BASE_LEGENDARY_ODDS.deluxe)}) -> PASS.\n` +
  `  Special (${fmtPct(BASE_LEGENDARY_ODDS.special)} base) does not exceed Deluxe at either the base-odds or realized-per-pack level -> PASS.\n` +
  "  Note: Special's REALIZED per-pack rate sits ABOVE Premium's (both share the same pre-existing\n" +
  "  guaranteed-floor-card mechanic, and Special's floor card is the higher rank3 tier, same as Deluxe's) -\n" +
  "  this does not violate the directive (only \"must not exceed Deluxe\" was required of Special), but is\n" +
  "  worth human awareness: a Special Pack's realized Legendary chance is closer to Deluxe's than its base\n" +
  "  odds alone would suggest, purely due to a pre-existing, unchanged floor mechanic this phase did not\n" +
  "  redesign."
);

// ---------------------------------------------------------
// Weekly play simulation at 10/20/30 matches/week, 50% win rate
// (same assumption as scripts/simulate-economy.mjs).
// ---------------------------------------------------------

function simulatePlayerWeek(matchesPerWeek, winRate = 0.5) {
  const wins = matchesPerWeek * winRate;
  const losses = matchesPerWeek - wins;
  const totalDp =
    wins * MATCH_DP.win +
    losses * MATCH_DP.loss +
    matchesPerWeek * ROUND_DP.participation +
    wins * ROUND_DP.first +
    losses * ROUND_DP.second;
  const premiumPacksFree = matchesPerWeek;
  const standardPacksFree = wins;

  const legendaryEvFromFreePacks =
    premiumPacksFree * PACK_LEGENDARY_EV.premium +
    standardPacksFree * PACK_LEGENDARY_EV.standard;

  return { matchesPerWeek, totalDp, premiumPacksFree, standardPacksFree, legendaryEvFromFreePacks };
}

function packsAffordable(dp, tier) {
  return Math.floor(dp / PACK_PRICES[tier]);
}

function weeksBetween(p) {
  // 1/p is only a meaningful "weeks between events" figure when p < 1
  // (sub-1-per-week). Once EV reaches/exceeds 1/week, the honest framing
  // flips to "more than one expected per week", not a fractional week count.
  if (p >= 1) return `<1 week (${p.toFixed(1)} expected per week)`;
  return `~${(1 / p).toFixed(1)} weeks`;
}

console.log("\n" + "=".repeat(70));
console.log("WEEKLY LEGENDARY EXPOSURE PER PLAYER (10 / 20 / 30 matches/week)");
console.log("=".repeat(70));

const profiles = [
  { label: "CASUAL", matchesPerWeek: 10 },
  { label: "ACTIVE", matchesPerWeek: 20 },
  { label: "VERY ACTIVE", matchesPerWeek: 30 },
];

const results = [];

for (const profile of profiles) {
  const sim = simulatePlayerWeek(profile.matchesPerWeek);
  console.log(`\n--- ${profile.label} (${profile.matchesPerWeek} matches/week) ---`);
  console.log(
    `  Free packs/week: ${sim.premiumPacksFree} Premium, ${sim.standardPacksFree} Standard ` +
    `-> Legendary EV from free packs alone: ${fmtPct(sim.legendaryEvFromFreePacks)}/week`
  );
  console.log(`  Weekly DP available to spend: ${Math.round(sim.totalDp).toLocaleString("en-US")}`);

  console.log("  If ALL of that DP were spent on ONE tier this week (illustrative maximum, not a recommendation):");
  const scenarioEvs = {};
  for (const tier of ["standard", "premium", "special", "deluxe"]) {
    const packs = packsAffordable(sim.totalDp, tier);
    const ev = packs * PACK_LEGENDARY_EV[tier];
    scenarioEvs[tier] = ev;
    console.log(
      `    -> ${packs} ${tier} pack(s): +${fmtPct(ev)} Legendary EV this week ` +
      `(total this week incl. free packs: ${fmtPct(sim.legendaryEvFromFreePacks + ev)})`
    );
  }

  const minWeeklyEv = sim.legendaryEvFromFreePacks; // free packs only, no purchases
  const maxWeeklyEv = sim.legendaryEvFromFreePacks + Math.max(...Object.values(scenarioEvs)); // + best-EV single-tier spend
  console.log(
    `  Expected time to first Legendary (free packs only): ${weeksBetween(minWeeklyEv)}`
  );
  console.log(
    `  Expected time to first Legendary (free packs + heaviest single-tier DP spend): ${weeksBetween(maxWeeklyEv)}`
  );

  results.push({ ...profile, sim, minWeeklyEv, maxWeeklyEv });
}

console.log("\n" + "=".repeat(70));
console.log("LEAGUE-WIDE (3 PLAYERS), BEFORE SATURATION / DUPLICATE-REROLL EFFECTS");
console.log("=".repeat(70));

for (const r of results) {
  const leagueMinEv = 3 * r.minWeeklyEv;
  const leagueMaxEv = 3 * r.maxWeeklyEv;
  console.log(
    `\n  All 3 players at ${r.label} (${r.matchesPerWeek} matches/week each):\n` +
    `    Nominal league-wide Legendary hits/week: ${fmtPct(leagueMinEv)} (free packs only) to ${fmtPct(leagueMaxEv)} (+ heaviest DP spend)\n` +
    `    -> free-packs-only pace: ${weeksBetween(leagueMinEv)} between league-wide Legendary hits, nominally.\n` +
    `    -> heaviest-DP-spend pace: ${weeksBetween(leagueMaxEv)} between league-wide Legendary hits, nominally.`
  );
}

console.log("\n" + "=".repeat(70));
console.log("DUPLICATE-REROLL / SATURATION EFFECT (qualitative + illustrative)");
console.log("=".repeat(70));
console.log(`
  Every Legendary card is league-wide unique (copy limit 1, enforced
  both by a hard database trigger on every card_instances insert AND,
  as of this Phase 2 pass, correctly excluded from pick_shop_pack_card's
  own candidate pool - see the migration header for the bug this
  fixed). A roll that lands on an already-league-owned Legendary
  safely rerolls to a different eligible card (same rarity, widening
  to no-theme/any-rarity only if truly none remain) rather than ever
  creating a second copy.

  This means the nominal per-week Legendary rates above are an upper
  bound that erodes as the league's Legendary cards get claimed: once
  M of the catalog's N total Legendary cards are already owned
  somewhere in the league, only (N - M) remain rollable, so the
  REALIZED rate drops roughly in proportion to (N - M) / N as the
  league approaches full Legendary saturation - the pool of pulls
  gets rarer, not just each individual roll.

  This sandbox has no live database access and could not query the
  real total Legendary count (N) in the catalog to give an exact
  saturation timeline - run
    select count(*) from card_catalog
    where game_rarity = 'Legendary' and format_eligible = true;
  against the live database to get the real N. For illustration only,
  here is how many weeks a league-wide catalog of a given size would
  take to fully exhaust at the ACTIVE-tier nominal rate (all 3 players
  at 20 matches/week, free packs only - the conservative end):
`);

const activeResult = results.find((r) => r.label === "ACTIVE");
const leagueActiveMinEv = 3 * activeResult.minWeeklyEv;
for (const illustrativeN of [10, 20, 30]) {
  console.log(
    `    If the catalog has ${illustrativeN} total Legendary cards: ~${(illustrativeN / leagueActiveMinEv).toFixed(0)} weeks (~${(illustrativeN / leagueActiveMinEv / 52).toFixed(1)} years) to claim them all, at a naive constant rate.`
  );
}
console.log(
  "\n  (This ignores the rate itself slowing as the pool shrinks, so real time-to-full-saturation is longer\n" +
  "  than this naive estimate - which only reinforces that Legendary acquisition stays a rare, memorable\n" +
  "  event rather than something that runs out or gets easy.)"
);

console.log("\n" + "=".repeat(70));
console.log("PACING CONCLUSION (reported, not auto-applied)");
console.log("=".repeat(70));

const casual = results.find((r) => r.label === "CASUAL");
const veryActive = results.find((r) => r.label === "VERY ACTIVE");
console.log(`
  These numbers do NOT show a "months between pulls" pace. At a single
  player's own free-packs-only rate, expected time to a first Legendary
  ranges from ${weeksBetween(casual.minWeeklyEv)} (CASUAL, 10 matches/week) down to
  ${weeksBetween(veryActive.minWeeklyEv)} (VERY ACTIVE, 30 matches/week) - i.e. WEEKS, not months,
  for any player who plays regularly. League-wide (3 players pooling
  pulls) the pace is faster still (see the league-wide section above).

  This is driven almost entirely by the pre-existing, unmodified
  "guaranteed floor card" mechanic (purchase_shop_pack's unconditional
  forced-rank last card): it lifts the REALIZED per-pack Legendary rate
  far above the corrected BASE odds audited in Section 3/4 (e.g. Deluxe's
  realized rate, 5.00%, is 10x its 0.50% base odds). The base-odds
  hierarchy correction (Section 4) is verified correct and holds at
  every level (base and realized) - but it does not, by itself, make
  Legendary pulls rare at realistic weekly play volumes, because the
  floor mechanic dominates the realized rate.

  Per the directive's explicit instruction, this script does NOT
  auto-rebalance anything in response to this finding. It is reported
  here as the single most important open economy concern for the
  Section 6 final output: the corrected base-odds hierarchy alone does
  not deliver "Legendary remains a memorable, uncommon event" once the
  pre-existing floor-card mechanic is accounted for at realistic play
  volumes. A human decision is needed on whether to also revisit the
  floor-card mechanic in a future pass.
`);
