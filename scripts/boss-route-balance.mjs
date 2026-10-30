#!/usr/bin/env node
// scripts/boss-route-balance.mjs
//
// Balance model for the 14 Season 2 Boss Paths (data/boss-route-registry-v3.mjs).
//
//   node scripts/boss-route-balance.mjs            # table + per-stage view
//   node scripts/boss-route-balance.mjs --cards    # every card: impact vs data anchor
//   node scripts/boss-route-balance.mjs --check    # exit 1 when a route leaves the band
//   node scripts/boss-route-balance.mjs --json     # machine-readable
//
// MODEL (explained in plain Dutch in docs/BOSS_PATHS_V3.md):
//   card power  = sum of the 15 card impacts (4 evolutions + 11 grants),
//                 each 1-10 in the route's own context
//   quality     = consistency + interaction + boss impact + (floor+ceiling)/2,
//                 each 1-10 (judged per route from the card texts)
//   SCORE       = 0.5 x card power + 1.5 x quality       (~80 on average)
//   Bands (checked by --check):
//     total score    within +/-7% of the mean of all 14 routes
//     stage 1 power  within +/-12% of the mean  (fair start)
//     stage 4 power  (Boss + Stage 4 grants + boss impact) within +/-12%
//
// The data anchor per card is ranking-v2's corrected draftValue for pool
// cards and the valuation engine's draftValue for pool-external cards;
// --cards prints both next to the hand-set impact so every adjustment is
// visible.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BOSS_ROUTES_V3 } from "../data/boss-route-registry-v3.mjs";
import { extractValuationSignals, scoreCard } from "../lib/valuation-engine.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const BANDS = {
  total: 0.07,
  stage1: 0.12,
  stage4: 0.12,
};

export function scoreRoute(route) {
  const stagePower = [1, 2, 3, 4].map((n) => {
    const evo = route.stages.find((s) => s.stageNumber === n).impact;
    const grants = route.supportGrants.filter((g) => g.stageNumber === n).reduce((sum, g) => sum + g.impact, 0);
    return evo + grants;
  });
  const cardPower = stagePower.reduce((a, b) => a + b, 0);
  const b = route.balance;
  const quality = b.consistency + b.interaction + b.bossImpact + (b.floor + b.ceiling) / 2;
  const total = 0.5 * cardPower + 1.5 * quality;
  return {
    code: route.code,
    name: route.name,
    stagePower,
    cardPower,
    quality,
    // Stage 4 includes how decisive the Boss is once it lands.
    stage4: stagePower[3] + b.bossImpact,
    total: Math.round(total * 10) / 10,
  };
}

export function scoreAll(routes = BOSS_ROUTES_V3) {
  const rows = routes.map(scoreRoute);
  const mean = (key) => rows.reduce((sum, r) => sum + (typeof key === "function" ? key(r) : r[key]), 0) / rows.length;
  const means = {
    total: mean("total"),
    stage1: mean((r) => r.stagePower[0]),
    stage4: mean("stage4"),
  };
  for (const r of rows) {
    r.deviation = (r.total - means.total) / means.total;
    r.stage1Deviation = (r.stagePower[0] - means.stage1) / means.stage1;
    r.stage4Deviation = (r.stage4 - means.stage4) / means.stage4;
    r.inBand =
      Math.abs(r.deviation) <= BANDS.total &&
      Math.abs(r.stage1Deviation) <= BANDS.stage1 &&
      Math.abs(r.stage4Deviation) <= BANDS.stage4;
  }
  return { rows, means };
}

function anchors() {
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"));
  const ranking = new Map(read("data/cardpool/ranking-v2.json").cards.map((c) => [c.name, c]));
  const catalog = new Map(read("data/external/ygoprodeck-cardinfo.json").data.map((c) => [c.name, c]));
  return (name) => {
    const ranked = ranking.get(name);
    if (ranked) return { source: "ranking-v2", draftValue: ranked.scores.corrected_draftValue, rarity: ranked.proposed_rarity };
    const c = catalog.get(name);
    if (!c) return null;
    const type = c.type ?? "";
    const row = {
      name: c.name,
      card_type: type,
      frame_type: c.frameType ?? null,
      monster_type: c.typeline?.join(" / ") ?? null,
      race: c.race ?? null,
      attribute: c.attribute ?? null,
      level: type.includes("XYZ") ? null : c.level ?? null,
      rank: type.includes("XYZ") ? c.level ?? null : null,
      atk: c.atk ?? null,
      def: c.def ?? null,
      description: c.desc ?? "",
      archetype: c.archetype ?? null,
    };
    return { source: "engine", draftValue: scoreCard(extractValuationSignals(row), row).draftValue, rarity: null };
  };
}

const pct = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

function main() {
  const args = process.argv.slice(2);
  const { rows, means } = scoreAll();

  if (args.includes("--json")) {
    console.log(JSON.stringify({ bands: BANDS, means, rows }, null, 2));
    return;
  }

  if (args.includes("--cards")) {
    const anchor = anchors();
    for (const route of BOSS_ROUTES_V3) {
      console.log(`\n${route.name} (${route.code})`);
      const cards = [
        ...route.stages.map((s) => ({ stage: s.stageNumber, name: s.evolutionCard, impact: s.impact, role: s.isBoss ? "BOSS" : "evo" })),
        ...route.supportGrants.map((g) => ({ stage: g.stageNumber, name: g.cardName, impact: g.impact, role: g.exclusive ? "grant*" : "grant" })),
      ].sort((a, b) => a.stage - b.stage);
      for (const c of cards) {
        const a = anchor(c.name);
        const anchorText = a ? `${a.source} dv ${a.draftValue}` : "no anchor";
        const delta = a ? c.impact - a.draftValue : 0;
        console.log(`  S${c.stage} ${c.role.padEnd(6)} ${String(c.impact).padStart(2)}  ${c.name.padEnd(48)} ${anchorText}${Math.abs(delta) >= 2 ? `  (adjusted ${delta > 0 ? "+" : ""}${delta.toFixed(1)})` : ""}`);
      }
    }
    return;
  }

  console.log("route".padEnd(24), "S1".padStart(4), "S2".padStart(4), "S3".padStart(4), "S4".padStart(4), "cards".padStart(6), "quality".padStart(8), "SCORE".padStart(7), "vs mean".padStart(8), "S1 dev".padStart(8), "S4 dev".padStart(8));
  for (const r of rows) {
    console.log(
      r.code.padEnd(24),
      ...r.stagePower.map((p) => String(p).padStart(4)),
      String(r.cardPower).padStart(6),
      r.quality.toFixed(1).padStart(8),
      r.total.toFixed(1).padStart(7),
      pct(r.deviation).padStart(8),
      pct(r.stage1Deviation).padStart(8),
      pct(r.stage4Deviation).padStart(8),
      r.inBand ? "" : "  <-- OUT OF BAND",
    );
  }
  const totals = rows.map((r) => r.total);
  console.log(`\nmean ${means.total.toFixed(1)}  min ${Math.min(...totals)}  max ${Math.max(...totals)}  spread ${pct((Math.max(...totals) - Math.min(...totals)) / means.total)}  | stage-1 mean ${means.stage1.toFixed(1)}  stage-4 mean ${means.stage4.toFixed(1)}`);
  console.log(`bands: total +/-${BANDS.total * 100}%, stage 1 +/-${BANDS.stage1 * 100}%, stage 4 +/-${BANDS.stage4 * 100}%`);

  if (args.includes("--check")) {
    const out = rows.filter((r) => !r.inBand);
    if (out.length) {
      console.error(`\n${out.length} route(s) out of band: ${out.map((r) => r.code).join(", ")}`);
      process.exit(1);
    }
    console.log("\nAll 14 routes inside every band.");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
