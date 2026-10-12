// =========================================================
// Duelist Circle 2.0 - season economy configs for the simulator.
//
// CURRENT  = the live season-1 economy as it would behave inside 2.0
//            (ad-hoc duels give no DP, Boss evolution is DP-only,
//            one round = one full cycle). Verified against:
//              202609042200_fix_full_round_economy.sql   (round rewards)
//              202609011300_final_pack_sizes_and_peak_odds.sql (packs)
//              202609011400_final_legendary_luck_pity_system.sql (luck)
//              202609012000_boss_route_rpcs.sql          (Boss prices)
//              202609012400_p2w_achievements.sql         (perks)
// PROPOSED = Season 2 proposal. PROPOSAL ONLY - awaiting owner approval.
//
// Nothing here talks to a database; the simulator is pure and seeded.
// =========================================================

// Pack definitions are shared: the proposal does not change pack
// prices, sizes, odds or the Legendary Luck pity system.
const PACKS = {
  normal: { price: 300, cards: 7, luck: 0.25, odds: { legendary: 0.5, secret: 4, ultra: 12, super: 34 } },
  premium: { price: 900, cards: 10, luck: 1, odds: { legendary: 2.25, secret: 15, ultra: 32, super: 43 } },
  special: { price: 1200, cards: 10, luck: 1.25, odds: { legendary: 1.75, secret: 13, ultra: 30, super: 44 } },
  deluxe: { price: 1500, cards: 14, luck: 2, odds: { legendary: 6.5, secret: 35, ultra: 44, super: 14.5 } },
};

const SHOP_SINGLES = {
  perDay: 6,
  prices: { normal: 40, rare: 80, super: 160, ultra: 320, secret: 640, legendary: 1500 },
};

const PERKS = {
  cleaning: 150,
  snack: 150,
  homeCooked: 100,
  fastFood: 200,
  delivery: 250,
  fineDining: 300,
};

export const CURRENT = {
  name: "current",
  label: "Current (live season 1 numbers inside 2.0)",
  season: { weeks: 13, roundsPerWeek: 3 },
  start: { dp: 0, vouchers: { normal: 1, premium: 1, deluxe: 1 } },
  legendaryPool: 50,
  luckThreshold: 100,
  packs: PACKS,
  shopSingles: SHOP_SINGLES,
  match: { winDp: 100, lossDp: 75 },
  round: {
    participationDp: 300,
    participationVoucher: "premium",
    placementDp: [400, 300, 200],
    placementVoucher: ["normal", null, null],
  },
  boss: {
    // cost to go from stage 1->2, 2->3, 3->4 (stage 1 is free / granted)
    stageCosts: [900, 1400, 2400],
    // [route 1 (free pick), route 2 slot, route 3 slot]
    slotCosts: [0, 7000, 10000],
  },
  perks: { amounts: PERKS, weeklyCapDp: null },
  weeklyGoals: null,
  seasonPath: null,
  bounty: null,
  catchUp: null,
  miniGames: null,
};

// ---------------------------------------------------------
// Season Path (proposed): one free track, 20 tiers.
// XP only from playing the season (never from mini games, never
// bought). 85 XP per tier -> 1,700 XP for the final tier.
// ---------------------------------------------------------
const SEASON_PATH_TIERS = [
  { tier: 1, dp: 100 },
  { tier: 2, voucher: "normal" },
  { tier: 3, dp: 150 },
  { tier: 4, voucher: "normal" },
  { tier: 5, voucher: "premium" },
  { tier: 6, dp: 200 },
  { tier: 7, voucher: "normal" },
  { tier: 8, dp: 250 },
  { tier: 9, voucher: "premium" },
  { tier: 10, dp: 400, voucher: "premium", note: "halfway chest" },
  { tier: 11, dp: 200 },
  { tier: 12, voucher: "normal" },
  { tier: 13, dp: 300 },
  { tier: 14, voucher: "premium" },
  { tier: 15, dp: 400 },
  { tier: 16, voucher: "normal" },
  { tier: 17, dp: 500 },
  { tier: 18, voucher: "premium" },
  { tier: 19, dp: 600 },
  { tier: 20, dp: 800, voucher: "deluxe", note: "final step: Deluxe + season-2 title 'Pharaoh's Ascendant' + card frame" },
];

export const PROPOSED = {
  name: "proposed",
  label: "Proposed Season 2 (awaiting owner approval)",
  season: { weeks: 13, roundsPerWeek: 3 },
  start: { dp: 0, vouchers: { normal: 1, premium: 1, deluxe: 1 } },
  legendaryPool: 50,
  luckThreshold: 100,
  packs: PACKS,
  shopSingles: SHOP_SINGLES,
  match: { winDp: 100, lossDp: 75 },
  round: {
    participationDp: 300,
    participationVoucher: "premium",
    placementDp: [350, 200, 100],
    placementVoucher: ["normal", null, null],
  },
  boss: {
    stageCosts: [1800, 3200, 5500],
    slotCosts: [0, 3000, 5500],
  },
  perks: { amounts: PERKS, weeklyCapDp: 600 },
  weeklyGoals: { count: 3, dpEach: 150, allDoneVoucher: "premium", xpEach: 15 },
  seasonPath: {
    xp: { matchPlayed: 10, matchWin: 5, roundCompleted: 10 },
    xpPerTier: 85,
    tiers: SEASON_PATH_TIERS,
  },
  // Beating the sole season leader (most season wins before the match).
  bounty: { dp: 75 },
  // Player in last place of the season table (before the round) gets
  // this on top of their round reward, but only when they are at least
  // minWinGap season wins behind the leader. Ties for last: nobody gets it.
  catchUp: { dp: 50, minWinGap: 3 },
  miniGames: {
    games: ["climber", "autoBattler"],
    dailyWinnerDp: 30,
    weeklyWinnerDp: 150,
    weeklyWinnerVoucher: "normal",
  },
};

export const CONFIGS = { current: CURRENT, proposed: PROPOSED };

// ---------------------------------------------------------
// Player profiles
// ---------------------------------------------------------
// Duel skill as an Elo-style rating. 70 points ~ 60% win chance.
export const SKILL = { skilled: 1570, average: 1500, weak: 1430 };

// Activity profile = how much a player uses the optional systems.
//  perks:      weekly claim probability per perk (honor system)
//  goalRate:   chance to finish each weekly goal
//  miniDaily:  chance to play the daily challenge on a given day
//  miniTries:  weekly-board attempts per game per week
export const ACTIVITY = {
  low: {
    perks: { cleaning: 0.3, snack: 0.3, homeCooked: 0.1, fastFood: 0.1, delivery: 0.05, fineDining: 0.02 },
    goalRate: 0.55,
    miniDaily: 0.25,
    miniTries: 2,
  },
  typical: {
    perks: { cleaning: 0.6, snack: 0.6, homeCooked: 0.25, fastFood: 0.3, delivery: 0.2, fineDining: 0.08 },
    goalRate: 0.8,
    miniDaily: 0.55,
    miniTries: 5,
  },
  high: {
    perks: { cleaning: 0.9, snack: 0.9, homeCooked: 0.5, fastFood: 0.6, delivery: 0.5, fineDining: 0.25 },
    goalRate: 0.95,
    miniDaily: 0.9,
    miniTries: 12,
  },
  // Stress case: claims every perk every week (1,150 DP/week), does
  // every goal, plays every mini game daily and grinds the weekly board.
  max: {
    perks: { cleaning: 1, snack: 1, homeCooked: 1, fastFood: 1, delivery: 1, fineDining: 1 },
    goalRate: 1,
    miniDaily: 1,
    miniTries: 25,
  },
};

// ---------------------------------------------------------
// Spending model (stated assumption, same for every player):
//  - every DP credited is split into envelopes:
//      packShare    -> pack fund (buys packs)
//      singlesShare -> shop singles
//      the rest     -> Boss fund (evolve stages / unlock slots)
//  - pack fund buys a pack as soon as it covers the next pick
//    (weighted pick below); Boss fund buys the next Boss step as
//    soon as it covers it, in order: finish route 1 -> unlock route 2
//    -> finish route 2 -> unlock route 3 -> finish route 3.
//  - once all Boss steps are bought, the Boss share goes to packs.
// ---------------------------------------------------------
export const SPENDING = {
  packShare: 0.35,
  singlesShare: 0.05,
  packPick: { normal: 0.25, premium: 0.4, special: 0.2, deluxe: 0.15 },
  singlesPick: { rare: 0.2, super: 0.4, ultra: 0.3, secret: 0.1 },
};

// Card power feeds back into win chance (runaway-leader pressure):
// Elo bonus per Boss step owned and per Legendary owned.
export const POWER_FEEDBACK = { perBossStep: 6, perLegendary: 8 };

// ---------------------------------------------------------
// Scenarios: a league is always 3 players.
// ---------------------------------------------------------
const p = (id, skill, activity) => ({ id, skill, activity });

export const SCENARIOS = {
  baseline: {
    label: "Baseline: skilled / average / weak, all typical activity",
    players: [p("skilled-typical", "skilled", "typical"), p("average-typical", "average", "typical"), p("weak-typical", "weak", "typical")],
  },
  top: {
    label: "Top player: skilled + high activity vs two typical players",
    players: [p("skilled-high", "skilled", "high"), p("average-typical", "average", "typical"), p("weak-typical", "weak", "typical")],
  },
  perksLow: {
    label: "Everyone low activity",
    players: [p("skilled-low", "skilled", "low"), p("average-low", "average", "low"), p("weak-low", "weak", "low")],
  },
  perksHigh: {
    label: "Everyone high activity",
    players: [p("skilled-high", "skilled", "high"), p("average-high", "average", "high"), p("weak-high", "weak", "high")],
  },
  mixed: {
    label: "Mixed: skilled+low, average+typical, weak+high",
    players: [p("skilled-low", "skilled", "low"), p("average-typical", "average", "typical"), p("weak-high", "weak", "high")],
  },
  runaway: {
    label: "Runaway risk: skilled+high vs average+typical vs weak+low",
    players: [p("skilled-high", "skilled", "high"), p("average-typical", "average", "typical"), p("weak-low", "weak", "low")],
  },
  maxPerks: {
    label: "Stress: average player who claims every perk every week (1,150 DP/wk)",
    players: [p("skilled-typical", "skilled", "typical"), p("average-max", "average", "max"), p("weak-typical", "weak", "typical")],
  },
  even: {
    label: "Even group: three average players, typical activity",
    players: [p("avg-A", "average", "typical"), p("avg-B", "average", "typical"), p("avg-C", "average", "typical")],
  },
  lightSchedule: {
    label: "Baseline but only 2 rounds per week",
    roundsPerWeek: 2,
    players: [p("skilled-typical", "skilled", "typical"), p("average-typical", "average", "typical"), p("weak-typical", "weak", "typical")],
  },
};
