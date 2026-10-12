#!/usr/bin/env node
// Duelist Circle 2.0 season economy simulator - CLI.
//
//   node scripts/season-sim/run.mjs [--config proposed|current] [--runs 500] [--seed N]
//        [--scenario baseline|top|...|all] [--pack-share 0.35] [--no-feedback] [--summary-only]
//
// Prints, per player profile, weekly percentiles (p10/p50/p90) of DP
// earned, packs opened, Legendaries and Boss progress, then a
// season-end summary of every scenario and a target check.

import { CONFIGS, SCENARIOS, SPENDING, POWER_FEEDBACK } from "./config.mjs";
import { runMany, summarize, bossLabel } from "./sim.mjs";

function parseArgs(argv) {
  const out = { config: "proposed", runs: 500, seed: 12345, scenario: "baseline", packShare: null, feedback: true, summaryOnly: false };
  const flat = argv.flatMap((x) => (x.startsWith("--") && x.includes("=") ? x.split(/=(.*)/s).slice(0, 2) : [x]));
  for (let i = 0; i < flat.length; i++) {
    const a = flat[i];
    const v = () => flat[++i];
    if (a === "--config") out.config = v();
    else if (a === "--runs") out.runs = Number(v());
    else if (a === "--seed") out.seed = Number(v());
    else if (a === "--scenario") out.scenario = v();
    else if (a === "--pack-share") out.packShare = Number(v());
    else if (a === "--no-feedback") out.feedback = false;
    else if (a === "--summary-only") out.summaryOnly = true;
    else if (a === "--help" || a === "-h") {
      console.log("usage: node scripts/season-sim/run.mjs [--config proposed|current] [--runs 500] [--seed N] [--scenario " + Object.keys(SCENARIOS).join("|") + "|all] [--pack-share 0.35] [--no-feedback] [--summary-only]");
      process.exit(0);
    } else throw new Error(`Unknown argument ${a}`);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const config = CONFIGS[args.config];
if (!config) throw new Error(`Unknown config ${args.config} (use: ${Object.keys(CONFIGS).join(", ")})`);
const spending = args.packShare == null ? SPENDING : { ...SPENDING, packShare: args.packShare };
const feedback = args.feedback ? POWER_FEEDBACK : { perBossStep: 0, perLegendary: 0 };

const n = (x) => Math.round(x).toLocaleString("en-US");
const pad = (s, w) => String(s).padStart(w);
const pct = (x) => `${Math.round(x * 100)}%`;
const boss = (q) => `${bossLabel(q.p10)}/${bossLabel(q.p50)}/${bossLabel(q.p90)}`;
const wk = (x) => (x >= 99 ? "never" : `wk${x}`);

console.log(`\nDuelist Circle season sim | config=${config.name} | runs=${args.runs} | seed=${args.seed} | packShare=${spending.packShare} singlesShare=${spending.singlesShare} | feedback=${args.feedback ? "on" : "off"}`);
console.log(config.label);

const summaries = {};
for (const key of Object.keys(SCENARIOS)) {
  summaries[key] = summarize(runMany({ config, scenarioKey: key, runs: args.runs, seed: args.seed, spending, feedback }));
}

const weeklyKeys = args.summaryOnly ? [] : args.scenario === "all" ? Object.keys(SCENARIOS) : [args.scenario];
for (const key of weeklyKeys) {
  const s = summaries[key];
  if (!s) throw new Error(`Unknown scenario ${key}`);
  console.log(`\n=== Scenario ${key}: ${s.label} ===`);
  for (const p of s.players) {
    console.log(`\n-- ${p.id} (skill ${p.skill}, activity ${p.activity}) -- cumulative, p10/p50/p90`);
    console.log(`${pad("wk", 3)} ${pad("DP earned", 22)} ${pad("packs opened", 14)} ${pad("bought", 8)} ${pad("Legend.", 8)} ${pad("Boss (R=route,S=stage)", 24)} ${pad("Path", 6)}`);
    for (const w of p.weekly) {
      console.log(
        `${pad(w.week, 3)} ${pad(`${n(w.dpEarned.p10)}/${n(w.dpEarned.p50)}/${n(w.dpEarned.p90)}`, 22)} ${pad(`${w.packsOpened.p10}/${w.packsOpened.p50}/${w.packsOpened.p90}`, 14)} ${pad(w.packsBought.p50, 8)} ${pad(`${w.legendaries.p10}/${w.legendaries.p50}/${w.legendaries.p90}`, 8)} ${pad(boss(w.bossIndex), 24)} ${pad(w.pathTier.p50, 6)}`,
      );
    }
    const src = Object.entries(p.sources)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k} ${n(v)}`)
      .join(", ");
    console.log(`   mean DP by source: ${src}`);
  }
}

console.log(`\n=== Season-end summary (week ${summaries.baseline.weeks}), all scenarios ===`);
console.log(`${"scenario".padEnd(14)} ${"player".padEnd(16)} ${pad("DP p10/p50/p90", 22)} ${pad("packs p50", 9)} ${pad("bought", 6)} ${pad("Leg p50", 7)} ${pad("Boss p10/p50/p90", 18)} ${pad("2 done", 6)} ${pad("3rd unl", 7)} ${pad("R1 done", 7)} ${pad("R2 done", 7)} ${pad("Path20", 6)}`);
for (const [key, s] of Object.entries(summaries)) {
  for (const p of s.players) {
    const f = p.final;
    console.log(
      `${key.padEnd(14)} ${p.id.padEnd(16)} ${pad(`${n(f.dpEarned.p10)}/${n(f.dpEarned.p50)}/${n(f.dpEarned.p90)}`, 22)} ${pad(f.packsOpened.p50, 9)} ${pad(f.packsBought.p50, 6)} ${pad(f.legendaries.p50, 7)} ${pad(boss(f.bossIndex), 18)} ${pad(pct(p.pTwoRoutesDone), 6)} ${pad(pct(p.pThirdUnlocked), 7)} ${pad(wk(p.weekRoute1Done.p50), 7)} ${pad(wk(p.weekRoute2Done.p50), 7)} ${pad(pct(p.pPathDone), 6)}`,
    );
  }
  console.log(`${"".padEnd(14)} league Legendaries pulled p10/p50/p90: ${s.league.legendariesPulled.p10}/${s.league.legendariesPulled.p50}/${s.league.legendariesPulled.p90} of ${config.legendaryPool} | runs where pool ran out: ${pct(s.league.poolExhaustedRuns)}`);
}

// ---------------------------------------------------------
// Target check (owner targets, see docs/season-sim-report.md)
// ---------------------------------------------------------
const find = (scen, id) => summaries[scen].players.find((p) => p.id === id);
const avg = find("baseline", "average-typical");
const weak = find("baseline", "weak-typical");
const skilled = find("baseline", "skilled-typical");
const top = find("top", "skilled-high");
const evenA = find("even", "avg-A");
const runawayWeak = find("runaway", "weak-low");
const runawayTop = find("runaway", "skilled-high");
const targets = [
  ["Average typical player: median has 2 routes at stage 4 (R2S4) by week 13", avg.final.bossIndex.p50 >= 8],
  ["Average typical player: 2 routes done in >= 60% of seasons", avg.pTwoRoutesDone >= 0.6],
  ["Average typical player: route 2 not done before week 10 (median)", avg.weekRoute2Done.p50 >= 10],
  ["Average typical player: 3rd route unlocked in <= 25% of seasons (stretch)", avg.pThirdUnlocked <= 0.25],
  ["Even group: average player median reaches R2S4", evenA.final.bossIndex.p50 >= 8],
  ["Top player (skilled + high activity): 3rd route unlocked in >= 50% of seasons", top.pThirdUnlocked >= 0.5],
  ["Top player: 3rd route NOT fully evolved in > 25% of seasons", top.pThirdDone <= 0.25],
  ["Weak typical player: median at least R2S3", weak.final.bossIndex.p50 >= 7],
  ["Weak typical player earns >= 85% of skilled typical player's DP (median)", weak.final.dpEarned.p50 >= 0.85 * skilled.final.dpEarned.p50],
  ["Runaway case: weak+low player still earns >= 70% of skilled+high (median)", runawayWeak.final.dpEarned.p50 >= 0.7 * runawayTop.final.dpEarned.p50],
  ["Average typical player buys >= 1 pack per week with DP (median)", avg.final.packsBought.p50 >= summaries.baseline.weeks],
  ["Average typical player opens >= 4 packs per week incl. vouchers (median)", avg.final.packsOpened.p50 >= 4 * summaries.baseline.weeks],
  ["Legendary pool: p90 of league pulls <= 60% of pool", summaries.baseline.league.legendariesPulled.p90 <= 0.6 * config.legendaryPool],
];
console.log(`\n=== Target check (${config.name}) ===`);
let pass = 0;
for (const [label, ok] of targets) {
  if (ok) pass += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
}
console.log(`${pass}/${targets.length} targets met\n`);
