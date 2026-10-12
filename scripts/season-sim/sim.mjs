// =========================================================
// Duelist Circle 2.0 - deterministic season economy simulator.
// Pure functions, no dependencies, no database/network access.
// Same (config, scenario, seed) -> byte-identical result.
// =========================================================

import { SKILL, ACTIVITY, SPENDING, POWER_FEEDBACK, SCENARIOS } from "./config.mjs";

// ---------------------------------------------------------
// Seeded RNG (mulberry32) + helpers
// ---------------------------------------------------------
export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    let u = 0;
    while (u === 0) u = next();
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const pick = (weights) => {
    const entries = Object.entries(weights);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = next() * total;
    for (const [key, w] of entries) {
      r -= w;
      if (r < 0) return key;
    }
    return entries[entries.length - 1][0];
  };
  const shuffle = (arr) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return { next, normal, pick, shuffle };
}

// Derive an independent 32-bit seed for run i from a base seed.
export function deriveSeed(base, i) {
  let h = (base ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (i + 0x85ebca6b), 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x27d4eb2f) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

// ---------------------------------------------------------
// Boss progress index: 1 = route 1 stage 1 (free) ... 12 = route 3 stage 4.
// ---------------------------------------------------------
export const BOSS_MAX = 12;

export function bossLabel(index) {
  const route = Math.ceil(index / 4);
  const stage = ((index - 1) % 4) + 1;
  return `R${route}S${stage}`;
}

export function nextBossCost(config, index) {
  if (index >= BOSS_MAX) return null;
  const route = Math.ceil(index / 4);
  const stage = ((index - 1) % 4) + 1;
  if (stage < 4) return config.boss.stageCosts[stage - 1];
  return config.boss.slotCosts[route]; // unlock next route (stage 1 granted)
}

// ---------------------------------------------------------
// One season
// ---------------------------------------------------------
export function simulateSeason({ config, scenario, seed, spending = SPENDING, feedback = POWER_FEEDBACK }) {
  const rng = createRng(seed);
  const weeks = config.season.weeks;
  const roundsPerWeek = scenario.roundsPerWeek ?? config.season.roundsPerWeek;
  const roundDays = roundsPerWeek >= 3 ? [1, 3, 5].concat(roundsPerWeek > 3 ? [6, 7].slice(0, roundsPerWeek - 3) : []) : roundsPerWeek === 2 ? [2, 5] : [3];
  const league = { poolLeft: config.legendaryPool, legendariesPulled: 0, poolExhaustedHits: 0 };

  const players = scenario.players.map((pp, idx) => ({
    idx,
    id: pp.id,
    skill: pp.skill,
    activity: pp.activity,
    elo: SKILL[pp.skill],
    act: ACTIVITY[pp.activity],
    miniSkill: config.miniGames ? config.miniGames.games.map(() => rng.normal()) : [],
    balance: 0,
    funds: { pack: 0, singles: 0, boss: 0 },
    ledgerIn: {},
    ledgerOut: {},
    luck: 0,
    legendaries: 0,
    guaranteedLegendaries: 0,
    bossIndex: 1,
    bossWeek: {}, // index -> week first reached
    seasonWins: 0,
    seasonLosses: 0,
    xp: 0,
    pathTier: 0,
    packsOpened: 0,
    packsBought: 0,
    vouchersOpened: 0,
    singlesBought: 0,
    nextPack: null,
    nextSingle: null,
    weekly: [],
  }));

  const add = (obj, key, amt) => {
    obj[key] = (obj[key] ?? 0) + amt;
  };

  function credit(pl, amount, source) {
    if (!amount) return;
    add(pl.ledgerIn, source, amount);
    pl.balance += amount;
    const packPart = Math.floor(amount * spending.packShare);
    const singlesPart = Math.floor(amount * spending.singlesShare);
    const bossPart = amount - packPart - singlesPart;
    pl.funds.pack += packPart;
    pl.funds.singles += singlesPart;
    if (pl.bossIndex >= BOSS_MAX) pl.funds.pack += bossPart;
    else pl.funds.boss += bossPart;
  }

  function debit(pl, amount, sink, fund) {
    if (pl.funds[fund] < amount || pl.balance < amount) throw new Error(`overspend ${sink}`);
    pl.funds[fund] -= amount;
    pl.balance -= amount;
    add(pl.ledgerOut, sink, amount);
  }

  function openPack(pl, type) {
    const pack = config.packs[type];
    const o = pack.odds;
    const r = rng.next() * 100;
    let peak = r < o.legendary ? "legendary" : r < o.legendary + o.secret ? "secret" : r < o.legendary + o.secret + o.ultra ? "ultra" : r < o.legendary + o.secret + o.ultra + o.super ? "super" : null;
    if (peak !== "legendary" && pl.luck >= config.luckThreshold) {
      peak = "legendary";
      pl.guaranteedLegendaries += 1;
    }
    if (peak === "legendary") {
      pl.luck = 0;
      if (league.poolLeft > 0) {
        league.poolLeft -= 1;
        league.legendariesPulled += 1;
        pl.legendaries += 1;
      } else {
        // Pool exhausted. The live RPC would fail the purchase; we
        // model a downgrade to Secret and count how often it happens.
        league.poolExhaustedHits += 1;
      }
    } else {
      pl.luck += pack.luck;
    }
    pl.packsOpened += 1;
  }

  function grantVoucher(pl, type) {
    if (!type) return;
    pl.vouchersOpened += 1;
    openPack(pl, type);
  }

  function spend(pl, week) {
    // Boss first (it is a savings envelope), then packs, then singles.
    for (;;) {
      const cost = nextBossCost(config, pl.bossIndex);
      if (cost === null) {
        if (pl.funds.boss > 0) {
          pl.funds.pack += pl.funds.boss; // envelope transfer, not a ledger event
          pl.funds.boss = 0;
        }
        break;
      }
      if (pl.funds.boss < cost) break;
      debit(pl, cost, pl.bossIndex % 4 === 0 ? "bossSlot" : "bossStage", "boss");
      pl.bossIndex += 1;
      if (pl.bossWeek[pl.bossIndex] === undefined) pl.bossWeek[pl.bossIndex] = week;
    }
    for (;;) {
      if (!pl.nextPack) pl.nextPack = rng.pick(spending.packPick);
      const price = config.packs[pl.nextPack].price;
      if (pl.funds.pack < price) break;
      debit(pl, price, "packs", "pack");
      pl.packsBought += 1;
      openPack(pl, pl.nextPack);
      pl.nextPack = null;
    }
    for (;;) {
      if (!pl.nextSingle) pl.nextSingle = rng.pick(spending.singlesPick);
      const price = config.shopSingles.prices[pl.nextSingle];
      if (pl.funds.singles < price) break;
      debit(pl, price, "singles", "singles");
      pl.singlesBought += 1;
      pl.nextSingle = null;
    }
  }

  function gainXp(pl, amount) {
    const sp = config.seasonPath;
    if (!sp || !amount) return;
    pl.xp += amount;
    while (pl.pathTier < sp.tiers.length && pl.xp >= (pl.pathTier + 1) * sp.xpPerTier) {
      const tier = sp.tiers[pl.pathTier];
      pl.pathTier += 1;
      if (tier.dp) credit(pl, tier.dp, "seasonPath");
      if (tier.voucher) grantVoucher(pl, tier.voucher);
    }
  }

  const power = (pl) => pl.elo + feedback.perBossStep * (pl.bossIndex - 1) + feedback.perLegendary * pl.legendaries;

  function soleLeader() {
    const max = Math.max(...players.map((x) => x.seasonWins));
    const top = players.filter((x) => x.seasonWins === max);
    return top.length === 1 ? top[0] : null;
  }

  function soleLast() {
    const min = Math.min(...players.map((x) => x.seasonWins));
    const max = Math.max(...players.map((x) => x.seasonWins));
    const bottom = players.filter((x) => x.seasonWins === min);
    if (bottom.length !== 1) return null;
    if (config.catchUp && max - min < (config.catchUp.minWinGap ?? 1)) return null;
    return bottom[0];
  }

  function playRound(week) {
    const lastBefore = config.catchUp ? soleLast() : null;
    const roundWins = players.map(() => 0);
    const pairs = rng.shuffle([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
    for (const [a, b] of pairs) {
      const A = players[a];
      const B = players[b];
      const leader = config.bounty ? soleLeader() : null;
      const pA = 1 / (1 + Math.pow(10, (power(B) - power(A)) / 400));
      const [win, lose] = rng.next() < pA ? [A, B] : [B, A];
      win.seasonWins += 1;
      lose.seasonLosses += 1;
      roundWins[win.idx] += 1;
      credit(win, config.match.winDp, "match");
      credit(lose, config.match.lossDp, "match");
      if (leader && lose === leader) credit(win, config.bounty.dp, "bounty");
      if (config.seasonPath) {
        gainXp(win, config.seasonPath.xp.matchPlayed + config.seasonPath.xp.matchWin);
        gainXp(lose, config.seasonPath.xp.matchPlayed);
      }
    }
    // Placement: round wins desc, ties broken randomly (live: duel diff).
    const tiebreak = players.map(() => rng.next());
    const order = players.map((x) => x.idx).sort((x, y) => roundWins[y] - roundWins[x] || tiebreak[x] - tiebreak[y]);
    order.forEach((pi, place) => {
      const pl = players[pi];
      credit(pl, config.round.participationDp, "roundParticipation");
      grantVoucher(pl, config.round.participationVoucher);
      credit(pl, config.round.placementDp[place], "roundPlacement");
      grantVoucher(pl, config.round.placementVoucher[place]);
      if (config.seasonPath) gainXp(pl, config.seasonPath.xp.roundCompleted);
    });
    if (lastBefore) credit(lastBefore, config.catchUp.dp, "catchUp");
    for (const pl of players) spend(pl, week);
  }

  function miniGameDay(week) {
    const mg = config.miniGames;
    if (!mg) return;
    mg.games.forEach((_, g) => {
      let best = null;
      let bestScore = -Infinity;
      for (const pl of players) {
        if (rng.next() >= pl.act.miniDaily) continue;
        const score = pl.miniSkill[g] + rng.normal();
        if (score > bestScore) {
          bestScore = score;
          best = pl;
        }
      }
      if (best) credit(best, mg.dailyWinnerDp, "miniGames");
    });
    for (const pl of players) spend(pl, week);
  }

  function miniGameWeek() {
    const mg = config.miniGames;
    if (!mg) return;
    mg.games.forEach((_, g) => {
      let best = null;
      let bestScore = -Infinity;
      for (const pl of players) {
        let top = -Infinity;
        for (let t = 0; t < pl.act.miniTries; t++) top = Math.max(top, rng.normal());
        if (top === -Infinity) continue;
        const score = pl.miniSkill[g] + top;
        if (score > bestScore) {
          bestScore = score;
          best = pl;
        }
      }
      if (best) {
        credit(best, mg.weeklyWinnerDp, "miniGames");
        grantVoucher(best, mg.weeklyWinnerVoucher);
      }
    });
  }

  function endOfWeek(week) {
    for (const pl of players) {
      // P2W perks (honor system)
      let perkDp = 0;
      for (const [perk, amount] of Object.entries(config.perks.amounts)) {
        if (rng.next() < (pl.act.perks[perk] ?? 0)) perkDp += amount;
      }
      if (config.perks.weeklyCapDp != null) perkDp = Math.min(perkDp, config.perks.weeklyCapDp);
      credit(pl, perkDp, "perks");
      // Weekly goals
      const wg = config.weeklyGoals;
      if (wg) {
        let done = 0;
        for (let i = 0; i < wg.count; i++) {
          if (rng.next() < pl.act.goalRate) {
            done += 1;
            credit(pl, wg.dpEach, "weeklyGoals");
            gainXp(pl, wg.xpEach ?? 0);
          }
        }
        if (done === wg.count) grantVoucher(pl, wg.allDoneVoucher);
      }
    }
    miniGameWeek();
    for (const pl of players) spend(pl, week);
  }

  const snapshot = (pl) => {
    const dpIn = Object.values(pl.ledgerIn).reduce((s, v) => s + v, 0);
    const dpOut = Object.values(pl.ledgerOut).reduce((s, v) => s + v, 0);
    return {
      dpEarned: dpIn,
      dpSpent: dpOut,
      balance: pl.balance,
      packsOpened: pl.packsOpened,
      packsBought: pl.packsBought,
      legendaries: pl.legendaries,
      bossIndex: pl.bossIndex,
      pathTier: pl.pathTier,
      seasonWins: pl.seasonWins,
    };
  };

  // Season start: welcome vouchers (Initial Draft has no Legendaries).
  for (const pl of players) {
    credit(pl, config.start.dp, "start");
    for (const [type, n] of Object.entries(config.start.vouchers)) {
      for (let i = 0; i < n; i++) grantVoucher(pl, type);
    }
  }

  for (let week = 1; week <= weeks; week++) {
    for (let day = 1; day <= 7; day++) {
      if (roundDays.includes(day)) playRound(week);
      miniGameDay(week);
    }
    endOfWeek(week);
    for (const pl of players) pl.weekly.push(snapshot(pl));
  }

  return {
    seed,
    league,
    players: players.map((pl) => ({
      id: pl.id,
      skill: pl.skill,
      activity: pl.activity,
      balance: pl.balance,
      funds: { ...pl.funds },
      ledgerIn: pl.ledgerIn,
      ledgerOut: pl.ledgerOut,
      luck: pl.luck,
      legendaries: pl.legendaries,
      guaranteedLegendaries: pl.guaranteedLegendaries,
      bossIndex: pl.bossIndex,
      bossWeek: pl.bossWeek,
      seasonWins: pl.seasonWins,
      seasonLosses: pl.seasonLosses,
      xp: pl.xp,
      pathTier: pl.pathTier,
      packsOpened: pl.packsOpened,
      packsBought: pl.packsBought,
      vouchersOpened: pl.vouchersOpened,
      singlesBought: pl.singlesBought,
      weekly: pl.weekly,
    })),
  };
}

// ---------------------------------------------------------
// Monte Carlo + percentiles
// ---------------------------------------------------------
export function percentile(sorted, q) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}

export function runMany({ config, scenarioKey, runs = 500, seed = 12345, spending = SPENDING, feedback = POWER_FEEDBACK }) {
  const scenario = SCENARIOS[scenarioKey];
  if (!scenario) throw new Error(`Unknown scenario ${scenarioKey}`);
  const results = [];
  for (let i = 0; i < runs; i++) {
    results.push(simulateSeason({ config, scenario, seed: deriveSeed(seed, i), spending, feedback }));
  }
  return { scenarioKey, scenario, config, runs, results };
}

const SOURCES_ORDER = ["match", "roundParticipation", "roundPlacement", "bounty", "catchUp", "weeklyGoals", "seasonPath", "miniGames", "perks", "start"];

export function summarize(batch) {
  const { results, scenario } = batch;
  const weeks = results[0].players[0].weekly.length;
  const q = (arr) => {
    const s = arr.slice().sort((a, b) => a - b);
    return { p10: percentile(s, 0.1), p50: percentile(s, 0.5), p90: percentile(s, 0.9), mean: arr.reduce((a, b) => a + b, 0) / arr.length };
  };
  const players = scenario.players.map((pp, pi) => {
    const weekly = [];
    for (let w = 0; w < weeks; w++) {
      const col = (k) => q(results.map((r) => r.players[pi].weekly[w][k]));
      weekly.push({
        week: w + 1,
        dpEarned: col("dpEarned"),
        packsOpened: col("packsOpened"),
        packsBought: col("packsBought"),
        legendaries: col("legendaries"),
        bossIndex: col("bossIndex"),
        pathTier: col("pathTier"),
      });
    }
    const finals = results.map((r) => r.players[pi]);
    const sources = {};
    for (const s of SOURCES_ORDER) sources[s] = finals.reduce((a, f) => a + (f.ledgerIn[s] ?? 0), 0) / finals.length;
    const reachWeek = (idx) => q(finals.map((f) => (f.bossWeek[idx] ?? 99)));
    return {
      id: pp.id,
      skill: pp.skill,
      activity: pp.activity,
      weekly,
      final: weekly[weeks - 1],
      sources,
      pTwoRoutesDone: finals.filter((f) => f.bossIndex >= 8).length / finals.length,
      pThirdUnlocked: finals.filter((f) => f.bossIndex >= 9).length / finals.length,
      pThirdDone: finals.filter((f) => f.bossIndex >= 12).length / finals.length,
      pPathDone: finals.filter((f) => f.pathTier >= 20).length / finals.length,
      weekRoute1Done: reachWeek(4),
      weekRoute2Done: reachWeek(8),
      weekRoute3Unlocked: reachWeek(9),
      seasonWins: q(finals.map((f) => f.seasonWins)),
      guaranteed: finals.reduce((a, f) => a + f.guaranteedLegendaries, 0) / finals.length,
    };
  });
  const league = {
    legendariesPulled: q(results.map((r) => r.league.legendariesPulled)),
    poolExhaustedRuns: results.filter((r) => r.league.poolExhaustedHits > 0).length / results.length,
  };
  return { scenarioKey: batch.scenarioKey, label: scenario.label, runs: batch.runs, weeks, players, league };
}
