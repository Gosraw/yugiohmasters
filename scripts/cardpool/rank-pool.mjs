#!/usr/bin/env node
// scripts/cardpool/rank-pool.mjs
//
// Re-ranks the v2 "Duelist Circle Classic" pool
// (data/cardpool/classic-v2-pool.json, built by build-pool.mjs) into
// rarities, and builds the group-vote lists.
//
//   node scripts/cardpool/rank-pool.mjs
//
// Offline only: reads the YGOPRODeck snapshot
// (data/external/ygoprodeck-cardinfo.json) and the repo's data files,
// writes:
//   data/cardpool/ranking-v2.json          every pool card + rarity + why
//   data/cardpool/ranking-vote-lists.json  the lists the group votes on
//
// Pipeline (see docs/cardpool-v2-ranking.md for the full story):
//   1. lib/valuation-engine.mjs scores every playable card (unchanged
//      engine, version printed below).
//   2. rank-corrections.mjs adds a small text-tag bonus (hand traps,
//      comeback cards, generic revive/removal).
//   3. Owner concept + banlist policy:
//        - proposal "legendary_unique" (board wipes)  -> Legendary
//        - forbidden (2014 list or proposal)           -> not ranked
//        - 2014 Limited / proposal 1-per-deck          -> at least Ultra Rare
//        - 2014 Semi-Limited                           -> at least Super Rare
//   4. Human calibration values (docs/human-calibration-round2-
//      2026-08-30.json + the 9 approved cards from the engine's
//      regression suite) are applied as overrides, the same doctrine
//      Season 1 used (scripts/apply-final-season1-rarities.mjs).
//   5. Tier sizes are cut by rank to the Season 1 shape (TARGETS).

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  classifyCardContext,
  extractValuationSignals,
  proposeRarity,
  RARITY_ORDER,
  scoreCard,
  VALUATION_ENGINE_VERSION,
} from "../../lib/valuation-engine.mjs";
import { BOSS_ROUTES } from "../../data/boss-route-registry.mjs";
import {
  applyCorrections,
  CORRECTION_LAYER_VERSION,
  hasForeignQuote,
  TAG_LABELS,
} from "./rank-corrections.mjs";
import {
  routeCardNames,
  themeMatch,
} from "./rank-themes.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));

// Season 1 shape on a 6,181-card pool; v2 has 6,136 playable cards
// (x0.993), so the same numbers apply. Midpoints of the owner's ranges.
export const TARGETS = {
  Legendary: 50,
  "Secret Rare": 200,
  "Ultra Rare": 1100,
  "Super Rare": 1200,
  Rare: 1525,
};

const ROUTE_LIST_SIZE = 15;
const SECRET_BORDER_EACH_SIDE = 20;

// The 9 approved cards from lib/valuation-engine.regression.test.mjs
// (APPROVED_CALIBRATION, "Codex calibration", 2026-08-30).
const APPROVED_9 = {
  'Maxx "C"': "Ultra Rare",
  "Effect Veiler": "Secret Rare",
  Tragoedia: "Secret Rare",
  "Gorz the Emissary of Darkness": "Secret Rare",
  "Battle Fader": "Ultra Rare",
  "Swift Scarecrow": "Super Rare",
  "D.D. Crow": "Ultra Rare",
  "Giant Trunade": "Ultra Rare",
  "Rescue Rabbit": "Super Rare",
};

const rank = (r) => RARITY_ORDER.indexOf(r);

function toCatalogRow(c) {
  const type = c.type ?? "";

  return {
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
}

// ---------------------------------------------------------------
// Load
// ---------------------------------------------------------------

const poolFile = read("data/cardpool/classic-v2-pool.json");
const catalog = new Map(read("data/external/ygoprodeck-cardinfo.json").data.map((c) => [c.id, c]));
const proposal = read("data/banlists/duelist-circle-proposal.json");
const round2 = read("docs/human-calibration-round2-2026-08-30.json").cards;

const HUMAN = {};

for (const [name, value] of Object.entries(round2)) {
  HUMAN[name] = {
    source: "round2",
    accept: typeof value === "string" ? [value] : value.borderline,
  };
}

for (const [name, value] of Object.entries(APPROVED_9)) {
  HUMAN[name] = {
    source: "approved9",
    accept: [value],
  };
}

// ---------------------------------------------------------------
// 1 + 2: engine + correction layer
// ---------------------------------------------------------------

const evaluated = [];

for (const pc of poolFile.cards.filter((c) => c.playable)) {
  const raw = catalog.get(pc.id);

  if (!raw) {
    throw new Error(`card ${pc.id} (${pc.name}) missing from the YGOPRODeck snapshot`);
  }

  const row = toCatalogRow(raw);
  const signals = extractValuationSignals(row);
  const scores = scoreCard(signals, row);
  const engineRarity = proposeRarity(scores);
  const context = classifyCardContext(signals, scores, row).context;
  const corrected = applyCorrections(row, scores);
  const correctedRarity = proposeRarity(corrected.scores);

  evaluated.push({
    pc,
    raw,
    row,
    scores,
    engineRarity,
    context,
    corrected,
    correctedRarity,
  });
}

// ---------------------------------------------------------------
// 3 - 5: policy + tier sizing
// ---------------------------------------------------------------

function floorFor(status) {
  if (status === "limited" || status === "limited_1_per_deck") {
    return "Ultra Rare";
  }

  if (status === "semi_limited") {
    return "Super Rare";
  }

  return "Normal";
}

function humanPick(name, current) {
  const human = HUMAN[name];

  if (!human) {
    return null;
  }

  if (human.accept.includes(current)) {
    return current;
  }

  // Borderline call: take whichever accepted value is closest.
  return [...human.accept].sort(
    (a, b) => Math.abs(rank(a) - rank(current)) - Math.abs(rank(b) - rank(current))
  )[0];
}

// options.useHuman = apply human calibration overrides.
// options.useCorrections = use corrected scores (else raw engine).
function assign(cards, options) {
  const out = new Map();
  const fixed = new Map();
  const notes = new Map();
  const note = (c, text) => {
    if (!notes.has(c)) notes.set(c, []);
    notes.get(c).push(text);
  };
  const dv = (c) => (options.useCorrections ? c.corrected.scores.draftValue : c.scores.draftValue);
  const gate = (c) => (options.useCorrections ? c.correctedRarity : c.engineRarity);
  const sc = (c) => (options.useCorrections ? c.corrected.scores : c.scores);

  for (const c of cards) {
    if (c.pc.final_status === "legendary_unique") {
      fixed.set(c, "Legendary");
      note(c, "owner concept: one-sided board wipe / proposal 'legendary_unique' -> Legendary (1 copy in the league)");
      continue;
    }

    if (options.useHuman && HUMAN[c.pc.name]) {
      const pick = humanPick(c.pc.name, gate(c));
      fixed.set(c, pick);
      note(c, `human calibration (${HUMAN[c.pc.name].source === "round2" ? "round 2, 2026-08-30" : "approved 9, 2026-08-30"}): ${HUMAN[c.pc.name].accept.join(" or ")}`);
    }
  }

  const count = (rarity) => [...fixed.values()].filter((r) => r === rarity).length;
  const free = cards.filter((c) => !fixed.has(c)).sort((a, b) => dv(b) - dv(a));

  // Legendary: engine gate passers, best first, up to the target.
  let legendarySlots = TARGETS.Legendary - count("Legendary");
  const demoted = [];
  const nearGate = [];

  for (const c of free) {
    if (gate(c) !== "Legendary") continue;

    if (legendarySlots > 0) {
      out.set(c, "Legendary");
      note(c, "passes the engine's Legendary gate and ranks inside the Legendary count");
      legendarySlots--;
    } else {
      out.set(c, "Secret Rare");
      demoted.push(c);
      note(c, "passes the engine's Legendary gate but ranks below the Legendary count -> Secret Rare (border case)");
    }
  }

  // Still short of the Legendary target (human calibration moved some
  // gate passers down): fill from the cards closest to the gate - the
  // gate with its accessibility/floor clauses relaxed (ceiling >= 9,
  // genericUtility >= 4, dependency <= 4, accessibility >= 4.5) and no
  // quoted reference to another specific card (Anti Raigeki, Gryphon
  // Wing - counters to one named card are not league-defining).
  for (const c of free) {
    if (legendarySlots <= 0) break;
    if (out.has(c)) continue;
    const s = sc(c);
    if (
      s.ceiling >= 9.0 &&
      s.genericUtility >= 4.0 &&
      s.dependency <= 4.0 &&
      s.accessibility >= 4.5 &&
      !hasForeignQuote(c.row.description, c.row.name)
    ) {
      out.set(c, "Legendary");
      nearGate.push(c);
      note(c, "close to the engine's Legendary gate (ceiling >= 9, generic, low dependency) and ranks inside the Legendary count");
      legendarySlots--;
    }
  }

  // Secret: needs the engine's structural Secret shape (ceiling >= 6,
  // genericUtility >= 3), best draftValue first.
  let secretSlots = TARGETS["Secret Rare"] - count("Secret Rare") - demoted.length;

  for (const c of free) {
    if (out.has(c)) continue;
    const s = sc(c);
    if (secretSlots <= 0) break;
    if (s.ceiling >= 6.0 && s.genericUtility >= 3.0) {
      out.set(c, "Secret Rare");
      secretSlots--;
    }
  }

  // Bulk tiers by rank.
  const bulk = ["Ultra Rare", "Super Rare", "Rare"];
  const remaining = free.filter((c) => !out.has(c));
  let i = 0;

  for (const tier of bulk) {
    let slots = TARGETS[tier] - count(tier);

    while (slots > 0 && i < remaining.length) {
      out.set(remaining[i], tier);
      i++;
      slots--;
    }
  }

  for (; i < remaining.length; i++) {
    out.set(remaining[i], "Normal");
  }

  // Banlist floors (limited cards tend toward higher rarity).
  for (const c of free) {
    const floor = floorFor(c.pc.final_status);
    const now = out.get(c);

    if (rank(floor) > rank(now)) {
      out.set(c, floor);
      note(c, `2014 list / proposal status "${c.pc.final_status}" -> at least ${floor} (was ${now})`);
    }
  }

  for (const [c, r] of fixed) {
    out.set(c, r);
  }

  return {
    rarity: out,
    notes,
    demoted,
    nearGate,
  };
}

const finalAssign = assign(evaluated, { useHuman: true, useCorrections: true });
const noHumanCorrected = assign(evaluated, { useHuman: false, useCorrections: true });
const noHumanRaw = assign(evaluated, { useHuman: false, useCorrections: false });

// ---------------------------------------------------------------
// Calibration agreement
// ---------------------------------------------------------------

function agreement(label, rarityOf, subset) {
  const res = {
    label,
    cards: 0,
    exact: 0,
    within1: 0,
    under: 0,
    over: 0,
    rows: [],
  };

  for (const [name, human] of Object.entries(HUMAN)) {
    if (subset && human.source !== subset) continue;
    const c = evaluated.find((e) => e.pc.name === name);
    if (!c) continue;
    const r = rarityOf(c);
    res.cards++;
    const gaps = human.accept.map((h) => rank(r) - rank(h));
    const gap = gaps.reduce((best, g) => (Math.abs(g) < Math.abs(best) ? g : best));
    if (gap === 0) res.exact++;
    if (Math.abs(gap) <= 1) res.within1++;
    if (gap < 0) res.under++;
    if (gap > 0) res.over++;
    res.rows.push({ name, human: human.accept.join("/"), got: r, gap });
  }

  return res;
}

const VARIANTS = [
  ["engine only (proposeRarity, no corrections, no policy)", (c) => c.engineRarity],
  ["engine + correction layer (proposeRarity on corrected scores)", (c) => c.correctedRarity],
  ["engine + policy + tier sizing (no corrections, no human overrides)", (c) => noHumanRaw.rarity.get(c)],
  ["engine + corrections + policy + tier sizing (no human overrides)", (c) => noHumanCorrected.rarity.get(c)],
  ["final (with human overrides)", (c) => finalAssign.rarity.get(c)],
];

const calibration = {};

for (const subset of ["approved9", "round2"]) {
  calibration[subset] = VARIANTS.map(([label, fn]) => agreement(label, fn, subset));
}

// ---------------------------------------------------------------
// ranking-v2.json
// ---------------------------------------------------------------

function reasonsFor(c) {
  const reasons = [];
  reasons.push(`engine: ${c.engineRarity} (draftValue ${c.scores.draftValue}) - ${c.scores.reason ?? ""}`.trim());

  if (c.corrected.tags.length) {
    reasons.push(`correction +${c.corrected.bonus}: ${c.corrected.tags.map((t) => TAG_LABELS[t]).join("; ")}`);
  }

  for (const n of finalAssign.notes.get(c) ?? []) {
    reasons.push(n);
  }

  return reasons;
}

const sortedFinal = [...evaluated].sort(
  (a, b) =>
    rank(finalAssign.rarity.get(b)) - rank(finalAssign.rarity.get(a)) ||
    b.corrected.scores.draftValue - a.corrected.scores.draftValue
);

const rankingCards = sortedFinal.map((c, index) => ({
  rank: index + 1,
  id: c.pc.id,
  name: c.pc.name,
  type: c.pc.type,
  archetype: c.raw.archetype ?? null,
  status: c.pc.final_status,
  proposed_rarity: finalAssign.rarity.get(c),
  engine_rarity: c.engineRarity,
  context: c.context,
  scores: {
    power: c.scores.power,
    accessibility: c.scores.accessibility,
    dependency: c.scores.dependency,
    genericUtility: c.scores.genericUtility,
    consistency: c.scores.consistency,
    floor: c.scores.floor,
    ceiling: c.scores.ceiling,
    oppressiveness: c.scores.oppressiveness,
    draftValue: c.scores.draftValue,
    corrected_draftValue: c.corrected.scores.draftValue,
  },
  correction_tags: c.corrected.tags,
  human_calibration: HUMAN[c.pc.name]?.accept.join(" / ") ?? null,
  reasons: reasonsFor(c),
}));

const excludedCards = poolFile.cards
  .filter((c) => !c.playable)
  .map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    status: c.final_status,
    proposed_rarity: null,
    reasons: [
      c.dc_verdict === "forbidden"
        ? `proposal: forbidden (${c.dc_category})`
        : "2014 TCG list: forbidden",
    ],
  }));

const distribution = Object.fromEntries(
  [...RARITY_ORDER].reverse().map((r) => [r, rankingCards.filter((c) => c.proposed_rarity === r).length])
);

const byTypeLegendary = {};

for (const c of rankingCards.filter((c) => c.proposed_rarity === "Legendary")) {
  byTypeLegendary[c.type] = (byTypeLegendary[c.type] ?? 0) + 1;
}

const ranking = {
  summary: {
    generated_at: new Date().toISOString(),
    engine_version: VALUATION_ENGINE_VERSION,
    correction_layer_version: CORRECTION_LAYER_VERSION,
    pool_playable: rankingCards.length,
    excluded_forbidden: excludedCards.length,
    targets: TARGETS,
    distribution,
    engine_only_distribution: Object.fromEntries(
      [...RARITY_ORDER].reverse().map((r) => [r, evaluated.filter((c) => c.engineRarity === r).length])
    ),
    legendary_by_type: byTypeLegendary,
    correction_tag_counts: Object.fromEntries(
      Object.keys(TAG_LABELS).map((t) => [t, evaluated.filter((c) => c.corrected.tags.includes(t)).length])
    ),
    calibration: Object.fromEntries(
      Object.entries(calibration).map(([k, v]) => [
        k,
        v.map((entry) => {
          const summary = { ...entry };
          delete summary.rows;
          return summary;
        }),
      ])
    ),
    calibration_detail: Object.fromEntries(
      Object.entries(calibration).map(([k, v]) => [
        k,
        Object.fromEntries(v.map((x) => [x.label, x.rows])),
      ])
    ),
  },
  cards: rankingCards,
  excluded: excludedCards,
};

writeFileSync(path.join(ROOT, "data/cardpool/ranking-v2.json"), JSON.stringify(ranking, null, 1) + "\n");

// ---------------------------------------------------------------
// ranking-vote-lists.json
// ---------------------------------------------------------------

const rankingById = new Map(rankingCards.map((c) => [c.id, c]));

function shortReason(c) {
  const parts = [];
  if (c.correction_tags.length) parts.push(c.correction_tags.map((t) => TAG_LABELS[t]).join("; "));
  const policy = c.reasons.filter((r) => !r.startsWith("engine:") && !r.startsWith("correction"));
  parts.push(...policy);
  if (!parts.length) parts.push(`engine score ${c.scores.corrected_draftValue} (${c.context.replace("_", " ")})`);
  return parts.join(" | ");
}

const lists = [];

const proposalGroups = [
  ["proposal_forbidden", "forbidden", "Proposed: forbidden", "Unfair cards (locks, stall, one-turn-win loops). Agree = keep them out of the game."],
  ["proposal_limited", "limited_1", "Proposed: max 1 per deck", "Softer cases: playable, but only 1 copy per deck."],
  ["proposal_legendary", "Legendary", "Proposed: Legendary board wipes", "One-sided board wipes: only 1 copy exists in the whole league."],
];

const verdictKey = {
  forbidden: "forbidden",
  limited_1_per_deck: "limited_1",
  legendary_unique: "Legendary",
};

for (const [key, verdict, title, description] of proposalGroups) {
  lists.push({
    key,
    title,
    description,
    items: proposal.entries
      .filter((e) => verdictKey[e.verdict] === verdict)
      .map((e) => {
        const pc = poolFile.cards.find((c) => c.name === e.name);
        const ranked = pc ? rankingById.get(pc.id) : null;
        return {
          id: pc?.id ?? null,
          name: e.name,
          proposed_verdict: verdict,
          confidence: e.confidence,
          context: `${e.reason} (category: ${e.category.replaceAll("_", " ")}; confidence: ${e.confidence})${
            verdict === "limited_1" && ranked ? ` Proposed rarity: ${ranked.proposed_rarity}.` : ""
          }`,
        };
      }),
  });
}

lists.push({
  key: "legendary",
  title: "Legendary cards",
  description: "Every proposed Legendary (1 copy in the whole league). Agree / too strong (ban it) / too weak (should be Secret Rare).",
  items: rankingCards
    .filter((c) => c.proposed_rarity === "Legendary")
    .map((c) => ({
      id: c.id,
      name: c.name,
      proposed_verdict: "Legendary",
      context: shortReason(c),
    })),
});

const secretFree = rankingCards.filter(
  (c) => c.proposed_rarity === "Secret Rare" && !c.human_calibration && !["limited", "limited_1_per_deck", "semi_limited"].includes(c.status)
);
const ultraFree = rankingCards.filter(
  (c) => c.proposed_rarity === "Ultra Rare" && !c.human_calibration && c.scores.ceiling >= 6 && c.scores.genericUtility >= 3
);
const demotedIds = new Set(finalAssign.demoted.map((c) => c.pc.id));
const borderIds = new Set([
  ...secretFree.filter((c) => demotedIds.has(c.id)).map((c) => c.id),
  ...secretFree.slice(-SECRET_BORDER_EACH_SIDE).map((c) => c.id),
  ...ultraFree.slice(0, SECRET_BORDER_EACH_SIDE).map((c) => c.id),
  ...rankingCards
    .filter((c) => c.human_calibration?.includes("Secret Rare") && c.human_calibration.includes("/"))
    .map((c) => c.id),
]);

lists.push({
  key: "secret_border",
  title: "Secret Rare border cases",
  description: "Cards right on the Secret Rare line: just under Legendary, the weakest Secret Rares, and the strongest Ultra Rares.",
  items: rankingCards
    .filter((c) => borderIds.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      proposed_verdict: c.proposed_rarity,
      context: `${
        demotedIds.has(c.id)
          ? "Just missed Legendary."
          : c.proposed_rarity === "Secret Rare"
            ? "One of the weakest Secret Rares."
            : "One of the strongest Ultra Rares."
      } ${shortReason(c)}`,
    })),
});

for (const route of [...BOSS_ROUTES].sort((a, b) => a.displayOrder - b.displayOrder)) {
  const names = routeCardNames(route);
  const relevant = rankingCards
    .map((c) => ({ c, why: themeMatch(route, names, { ...catalog.get(c.id), name: c.name }) }))
    .filter((x) => x.why)
    .sort((a, b) => b.c.scores.corrected_draftValue - a.c.scores.corrected_draftValue || rank(b.c.proposed_rarity) - rank(a.c.proposed_rarity))
    .slice(0, ROUTE_LIST_SIZE);

  lists.push({
    key: `route_${route.code}`,
    title: `${route.name} route`,
    description: `The ${ROUTE_LIST_SIZE} strongest pool cards for the ${route.name} Boss route theme.`,
    items: relevant.map(({ c, why }) => ({
      id: c.id,
      name: c.name,
      proposed_verdict: c.proposed_rarity,
      context: `${why === "route card" ? "Boss route card" : `Theme: ${why}`}. ${shortReason(c)}`,
    })),
  });
}

// One vote per card: the first list a card appears in owns its vote;
// later lists keep the entry (so the JSON is complete) but flag it.
const seen = new Map();

for (const list of lists) {
  list.items.forEach((item, index) => {
    item.sort_order = index + 1;
    if (item.id == null) {
      item.vote_here = false;
      item.missing = "not in the Classic pool data";
      return;
    }
    if (seen.has(item.id)) {
      item.vote_here = false;
      item.voted_in = seen.get(item.id);
      return;
    }
    item.vote_here = true;
    seen.set(item.id, list.key);
  });
}

for (const list of lists) {
  for (const item of list.items) {
    const others = lists.filter((l) => l.key !== list.key && l.items.some((i) => i.id === item.id)).map((l) => l.title);
    if (item.vote_here && others.length) {
      item.context += ` (Also on: ${others.join(", ")}.)`;
    }
  }
}

const voteLists = {
  generated_at: ranking.summary.generated_at,
  engine_version: VALUATION_ENGINE_VERSION,
  correction_layer_version: CORRECTION_LAYER_VERSION,
  vote_options: {
    rarity: { agree: "Agree", too_strong: "Too strong for this rarity: make it rarer (Legendary: ban it)", too_weak: "Too weak: make it more common" },
    limited_1: { agree: "Agree: max 1 per deck", too_strong: "Too strong: ban it", too_weak: "Too weak: allow 3 per deck" },
    forbidden: { agree: "Agree: keep it out", too_weak: "Allow it" },
  },
  totals: {
    lists: lists.length,
    entries: lists.reduce((n, l) => n + l.items.length, 0),
    votes: lists.reduce((n, l) => n + l.items.filter((i) => i.vote_here).length, 0),
  },
  lists,
};

writeFileSync(path.join(ROOT, "data/cardpool/ranking-vote-lists.json"), JSON.stringify(voteLists, null, 1) + "\n");

// ---------------------------------------------------------------
// Report
// ---------------------------------------------------------------

console.log(`engine ${VALUATION_ENGINE_VERSION}, corrections ${CORRECTION_LAYER_VERSION}`);
console.log("pool playable:", rankingCards.length, "excluded (forbidden):", excludedCards.length);
console.log("engine-only distribution:", ranking.summary.engine_only_distribution);
console.log("final distribution:", distribution);
console.log("Legendary by type:", byTypeLegendary);
console.log("correction tags:", ranking.summary.correction_tag_counts);

for (const [subset, rows] of Object.entries(calibration)) {
  console.log(`\ncalibration ${subset}:`);
  for (const r of rows) {
    console.log(`  ${r.label}: ${r.exact}/${r.cards} exact, ${r.within1}/${r.cards} within 1 tier, ${r.under} under, ${r.over} over`);
  }
}

console.log("\nvote lists:", voteLists.totals);
for (const l of lists) {
  console.log(`  ${l.key}: ${l.items.length} entries, ${l.items.filter((i) => i.vote_here).length} votes`);
}

