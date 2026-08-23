#!/usr/bin/env node
// =========================================================
// DRAFT VALUE SIMULATOR (v2)
//
// Proves (rather than asserts) that the draft's rarity odds
// produce a real UR > SR > Rare > Normal PRACTICAL value
// ordering, not just a label ordering - by rolling thousands of
// synthetic 3-card draft OFFERS using the exact same weighted-
// random algorithm create_next_draft_offer() uses
// (supabase/migrations/202608220020_master_duel_compatibility.sql,
// lines ~500-565: weighted roll against
// settings.draft.rarity_weights, default
// {Normal:56, Rare:28, "Super Rare":11, "Ultra Rare":3.5,
// "Secret Rare":1, Legendary:0.5} - unchanged by this run, per
// the explicit instruction not to touch these odds), then
// reporting the resulting draftValue distribution per rarity
// using the SAME deterministic valuation engine
// (lib/valuation-engine.mjs) the rarity/audit proposal uses.
//
// v2 adds the Season 1 review's requested distribution-shape
// metrics: median/p10/p90 per rarity, adjacent-tier overlap, the
// percentage of 3-card offers that are entirely low-value, and the
// percentage of Ultra Rare+ offers that contain no genuinely
// strong practical choice.
//
// TWO THINGS THIS SCRIPT DOES NOT DO:
//   1. It does not re-implement or guess at card SELECTION within
//      a rolled rarity beyond a simple, clearly-labeled
//      without-replacement-per-draw sample from the given pool -
//      the real create_next_draft_offer() also excludes cards
//      already drafted this league, per-copy scarcity, and the
//      format_eligible/master_duel gates. This script is a VALUE
//      DISTRIBUTION proof (does rarity correlate with real
//      value), not a byte-for-byte reproduction of the live offer
//      generator.
//   2. It does not fabricate card data. It reads real, sourced
//      card rows from a JSON file (the same shape
//      scripts/audit-card-valuation.mjs writes to
//      reports/card-valuation/<timestamp>/full-proposal.json), or
//      falls back to a small fixture of real, sourced cards for a
//      smoke test when no file is given. A small fixture is
//      honestly reported as too small to be statistically
//      representative of the real ~13,931-card catalog - see the
//      console output's own caveat.
//
// Usage:
//   node scripts/simulate-draft-value.mjs [--proposal <path-to-full-proposal.json>] [--rounds 10000]
//
// Without --proposal, runs against the small built-in fixture
// purely to prove the MECHANISM is correct - NOT to claim real
// catalog numbers. Pass --proposal pointing at a real
// audit-card-valuation.mjs JSON export to get real numbers.
// =========================================================

import { readFileSync } from "node:fs";
import {
  extractValuationSignals,
  scoreCard,
  proposeRarity,
} from "../lib/valuation-engine.mjs";

const DEFAULT_RARITY_WEIGHTS = {
  Normal: 56.0,
  Rare: 28.0,
  "Super Rare": 11.0,
  "Ultra Rare": 3.5,
  "Secret Rare": 1.0,
  Legendary: 0.5,
};

const RARITY_ORDER = [
  "Normal",
  "Rare",
  "Super Rare",
  "Ultra Rare",
  "Secret Rare",
  "Legendary",
];

const OFFER_SIZE = 3; // matches create_next_draft_offer()'s 3-card offer shape

// RECALIBRATED 2026-08-23 (rarity calibration pass): the old
// 5.0 / 6.5 constants were tuned against an EARLIER engine version
// where the score scale's real achievable max was assumed to be
// close to 10. Under the current v2 engine the real 13,931-card
// catalog's draftValue max is only ~7.27 (see the calibration
// session's percentile analysis), so 6.5 sat at roughly the 99.7th
// percentile - a bar only Secret Rare/Legendary-caliber cards could
// ever clear, which silently made "no UR+ offer has a strong pick"
// report as ~93% even on a healthy distribution. These two
// constants are now grounded in this session's own calibrated
// rarity cut points instead of an arbitrary absolute number:
//   LOW_VALUE_THRESHOLD = the Super Rare cut point (proposeRarity's
//     draftValue >= 4.45 branch) - "low value" now means "did not
//     even reach Super Rare quality".
//   STRONG_VALUE_THRESHOLD = the Secret Rare draftValue-gate cut
//     point (proposeRarity's draftValue >= 5.75 branch) - "strong"
//     now means "Secret-Rare-caliber pick", not an arbitrary number.
// If proposeRarity's cut points change again, these two constants
// should be re-derived from it rather than hand-edited independently.
const LOW_VALUE_THRESHOLD = 4.45;
const STRONG_VALUE_THRESHOLD = 5.75;
const UR_PLUS = new Set(["Ultra Rare", "Secret Rare", "Legendary"]);

// A small, sourced fixture used only when no --proposal file is
// given, purely to exercise the simulator's mechanics end to end.
// Too small to be a statistically meaningful catalog - see the
// printed caveat.
const FIXTURE_CARDS = [
  {
    name: "Fuh-Rin-Ka-Zan",
    game_rarity: "Legendary",
    description:
      'If you control 4 or more monsters with different Attributes, including WIND, WATER, FIRE and EARTH monsters: Destroy all monsters your opponent controls. You can only activate 1 "Fuh-Rin-Ka-Zan" per turn.',
    card_type: "Trap Card",
  },
  {
    name: "Sekka's Light",
    game_rarity: "Legendary",
    description:
      "If this is the only card in your hand and you have no cards in your Graveyard: Special Summon as many Normal Monsters with different names as possible from your Deck.",
    card_type: "Spell Card",
  },
  {
    name: "Magician of Faith",
    game_rarity: "Super Rare",
    description: "FLIP: Target 1 Spell Card in your Graveyard; add that target to your hand.",
    card_type: "Effect Monster",
  },
  {
    name: "Forbidden Droplet",
    game_rarity: "Ultra Rare",
    archetype: "Forbidden",
    description:
      "Target 2 face-up monsters on the field with different names; for the rest of this turn after this card resolves, change one monster's ATK to 1000 and the other monster's ATK to 0, also, for the rest of this turn after this card resolves, negate their effects.",
    card_type: "Spell Card",
  },
  {
    name: "Baronne de Fleur",
    game_rarity: "Ultra Rare",
    archetype: "Fleur",
    atk: 1000,
    def: 2500,
    description:
      "1 Fusion, Synchro, or Xyz Monster, plus 1 non-Tuner monster\nMust first be either Fusion, Synchro, or Xyz Summoned, and cannot be Special Summoned by other ways. Once per turn: You can target 1 monster your opponent controls; until the end of this turn, that target's original ATK and DEF become 0, also its effects are negated.",
    card_type: "Fusion Monster",
  },
  {
    name: "Harpie's Feather Duster",
    game_rarity: "Ultra Rare",
    archetype: "Harpie",
    description: "Destroy all Spell and Trap Cards on the field.",
    card_type: "Spell Card",
  },
  {
    name: "Pot of Greed",
    game_rarity: "Normal",
    description: "Draw 2 cards.",
    card_type: "Spell Card",
  },
  {
    name: "7 Colored Fish",
    game_rarity: "Normal",
    description: "A rainbow-colored fish that swims elegantly.",
    card_type: "Normal Monster",
    atk: 1800,
    def: 800,
  },
  {
    name: "Negate Attack",
    game_rarity: "Rare",
    description: "When an opponent's monster declares an attack: Negate the attack, and if you do, end the Battle Phase.",
    card_type: "Trap Card",
  },
  {
    name: "Skill Drain",
    game_rarity: "Secret Rare",
    description: "Activate this card by paying 1000 Life Points. All face-up monsters' effects on the field are negated.",
    card_type: "Trap Card",
  },
];

function parseArgs(argv) {
  const args = { proposalPath: null, rounds: 10000, season1Only: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--proposal") {
      args.proposalPath = argv[i + 1] ?? null;
      i++;
    } else if (argv[i] === "--rounds") {
      args.rounds = Number(argv[i + 1] ?? 10000);
      i++;
    } else if (argv[i] === "--season1-only") {
      args.season1Only = true;
    }
  }
  return args;
}

function loadCatalog(proposalPath) {
  if (!proposalPath) {
    return { cards: FIXTURE_CARDS, isFixture: true };
  }
  const raw = readFileSync(proposalPath, "utf8");
  const parsed = JSON.parse(raw);
  const cards = Array.isArray(parsed) ? parsed : parsed.cards;
  if (!Array.isArray(cards)) {
    throw new Error(
      `Could not find a card array in ${proposalPath} (expected either a top-level array or a { cards: [...] } object).`
    );
  }
  return { cards, isFixture: false };
}

// Scores every card once up front and buckets it by its PROPOSED
// rarity (proposeRarity of its own full score object) -
// deliberately the NEW proposed rarity, not whatever
// game_rarity/proposed_game_rarity field the source file carries,
// so the simulator measures the valuation engine's own output
// consistently regardless of which stage of review produced the
// input file.
//
// BUG FIX (found while running the 2026-08-23 rarity calibration's
// required draft simulation): a real scripts/audit-card-valuation.mjs
// full-proposal.json export does NOT carry the raw card fields
// (description, card_type, atk/def, ...) extractValuationSignals()
// needs - only the ALREADY-COMPUTED `scores` object. Calling
// extractValuationSignals(card)/scoreCard(...) on such a row silently
// produced the SAME near-empty-signals baseline score for every
// single card (confirmed: all 13,931 real cards collapsed to one
// identical draftValue and one Rare bucket) - a real bug in this
// script, not a semantic engine bug, and not present when running
// against the small built-in FIXTURE_CARDS (which DOES carry
// description/card_type, so it happened to mask this). Fix: prefer
// the row's own pre-computed `scores` when present; only fall back
// to recomputing from raw signals for genuinely raw card input
// (e.g. FIXTURE_CARDS, or a future export shape without `scores`).
function buildRarityBuckets(cards) {
  const buckets = new Map(RARITY_ORDER.map((r) => [r, []]));
  for (const card of cards) {
    let scores;
    if (card.scores && typeof card.scores.draftValue === "number") {
      scores = card.scores;
    } else {
      const signals = extractValuationSignals(card);
      scores = scoreCard(signals, card, {});
    }
    const rarity = proposeRarity(scores);
    buckets.get(rarity).push({
      name: card.name,
      draftValue: scores.draftValue,
    });
  }
  return buckets;
}

// Weighted rarity roll - reproduces create_next_draft_offer()'s
// own algorithm: sum the weights of rarities that currently have
// at least 1 available card, roll a uniform number in
// [0, totalWeight), walk the cumulative weights in RARITY_ORDER to
// find which band the roll landed in.
function rollRarity(weights, buckets) {
  const available = RARITY_ORDER.filter((r) => (buckets.get(r) ?? []).length > 0);
  const totalWeight = available.reduce((sum, r) => sum + (weights[r] ?? 0), 0);
  if (totalWeight <= 0) {
    throw new Error("No rarity has both a positive weight and at least one available card - cannot roll.");
  }
  const roll = Math.random() * totalWeight;
  let running = 0;
  for (const rarity of available) {
    running += weights[rarity] ?? 0;
    if (roll < running) return rarity;
  }
  return available[available.length - 1];
}

function pickCard(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

function rollOneCard(weights, buckets) {
  const rarity = rollRarity(weights, buckets);
  const pool = buckets.get(rarity);
  const drawn = pickCard(pool);
  return { rarity, name: drawn.name, draftValue: drawn.draftValue };
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null;
  const idx = Math.min(sortedValues.length - 1, Math.max(0, Math.floor((p / 100) * sortedValues.length)));
  return sortedValues[idx];
}

function median(sortedValues) {
  if (sortedValues.length === 0) return null;
  const mid = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 0
    ? (sortedValues[mid - 1] + sortedValues[mid]) / 2
    : sortedValues[mid];
}

// Runs the simulation as a sequence of 3-card OFFERS (matching the
// real UI's offer shape) rather than independent single draws, so
// offer-level metrics (all-low-value offers, UR+ offers with no
// strong choice) can be computed directly instead of approximated.
function runSimulation(buckets, weights, rounds) {
  const perRarityValues = RARITY_ORDER.reduce((acc, r) => {
    acc[r] = [];
    return acc;
  }, {});
  let allLowValueOffers = 0;
  let urPlusOffers = 0;
  let urPlusOffersWithNoStrongChoice = 0;

  for (let i = 0; i < rounds; i++) {
    const offer = Array.from({ length: OFFER_SIZE }, () => rollOneCard(weights, buckets));
    for (const card of offer) {
      perRarityValues[card.rarity].push(card.draftValue);
    }
    if (offer.every((c) => c.draftValue < LOW_VALUE_THRESHOLD)) {
      allLowValueOffers += 1;
    }
    if (offer.some((c) => UR_PLUS.has(c.rarity))) {
      urPlusOffers += 1;
      if (!offer.some((c) => c.draftValue >= STRONG_VALUE_THRESHOLD)) {
        urPlusOffersWithNoStrongChoice += 1;
      }
    }
  }

  return { perRarityValues, allLowValueOffers, urPlusOffers, urPlusOffersWithNoStrongChoice };
}

// Adjacent-tier overlap: what fraction of the LOWER tier's draws
// already meet or beat the UPPER tier's 10th percentile (p10)? A
// well-separated rarity ladder should show this shrinking toward 0
// as tiers get further apart; a large number means the two tiers
// are not meaningfully distinguishable in practice.
function computeAdjacentOverlap(perRarityValues) {
  const overlaps = [];
  for (let i = 0; i < RARITY_ORDER.length - 1; i++) {
    const lower = RARITY_ORDER[i];
    const upper = RARITY_ORDER[i + 1];
    const lowerValues = perRarityValues[lower];
    const upperValues = perRarityValues[upper];
    if (lowerValues.length === 0 || upperValues.length === 0) {
      overlaps.push({ lower, upper, overlapPct: null });
      continue;
    }
    const upperP10 = percentile([...upperValues].sort((a, b) => a - b), 10);
    const overlapCount = lowerValues.filter((v) => v >= upperP10).length;
    overlaps.push({ lower, upper, overlapPct: (overlapCount / lowerValues.length) * 100 });
  }
  return overlaps;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { cards: allCards, isFixture } = loadCatalog(args.proposalPath);

  let cards = allCards;
  if (args.season1Only) {
    const withField = allCards.filter((c) => c.season1_provisional_eligible !== undefined);
    if (withField.length === 0) {
      console.log(
        "⚠️  --season1-only requested but no card in this file has a season1_provisional_eligible field " +
          "(this file predates that field being added to the audit export - re-run scripts/audit-card-valuation.mjs " +
          "to get it). Falling back to the FULL catalog - the numbers below are NOT the 2020 pool."
      );
    } else {
      cards = allCards.filter((c) => c.season1_provisional_eligible === true);
    }
  }
  const buckets = buildRarityBuckets(cards);

  console.log(
    `Loaded ${cards.length} card(s) ${isFixture ? "from the built-in sourced fixture" : `from ${args.proposalPath}`}${
      args.season1Only ? " (filtered to season1_provisional_eligible === true)" : ""
    }.`
  );
  console.log("\nRarity bucket sizes (by the valuation engine's OWN proposed rarity):");
  for (const rarity of RARITY_ORDER) {
    console.log(`  ${rarity.padEnd(12)} ${buckets.get(rarity).length}`);
  }

  const emptyBuckets = RARITY_ORDER.filter((r) => buckets.get(r).length === 0);
  if (emptyBuckets.length > 0) {
    console.log(
      `\nNote: ${emptyBuckets.join(", ")} currently have zero cards in this input, so the simulator excludes ${emptyBuckets.length === 1 ? "that rarity" : "those rarities"} from the roll (same fallback behavior create_next_draft_offer() uses for an exhausted pool).`
    );
  }

  console.log(`\nRunning ${args.rounds} synthetic 3-card draft offers using the live default weights ${JSON.stringify(DEFAULT_RARITY_WEIGHTS)} ...\n`);

  const { perRarityValues, allLowValueOffers, urPlusOffers, urPlusOffersWithNoStrongChoice } = runSimulation(
    buckets,
    DEFAULT_RARITY_WEIGHTS,
    args.rounds
  );

  console.log("Rarity        Draws    Avg DV   Median   p10     p90     % below 5.0");
  const orderedAverages = [];
  for (const rarity of RARITY_ORDER) {
    const values = perRarityValues[rarity];
    if (values.length === 0) continue;
    const sorted = [...values].sort((a, b) => a - b);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const med = median(sorted);
    const p10 = percentile(sorted, 10);
    const p90 = percentile(sorted, 90);
    const lowPct = (values.filter((v) => v < LOW_VALUE_THRESHOLD).length / values.length) * 100;
    orderedAverages.push(avg);
    console.log(
      `${rarity.padEnd(14)} ${String(values.length).padStart(6)}   ${avg.toFixed(2).padStart(6)}   ${med.toFixed(2).padStart(6)}   ${p10.toFixed(2).padStart(5)}   ${p90.toFixed(2).padStart(5)}   ${lowPct.toFixed(1).padStart(6)}%`
    );
  }

  const isMonotonic = orderedAverages.every((v, i) => i === 0 || v >= orderedAverages[i - 1]);
  console.log(`\nAverage draft value strictly increases with rarity tier: ${isMonotonic ? "YES" : "NO"}`);

  console.log("\nAdjacent-tier overlap (% of the LOWER tier's draws that already meet/beat the UPPER tier's p10 - lower is better separation):");
  for (const { lower, upper, overlapPct } of computeAdjacentOverlap(perRarityValues)) {
    console.log(`  ${lower.padEnd(12)} vs ${upper.padEnd(12)} ${overlapPct === null ? "n/a (empty bucket)" : overlapPct.toFixed(1) + "%"}`);
  }

  console.log(`\n% of 3-card offers where ALL THREE choices are below draftValue ${LOW_VALUE_THRESHOLD}: ${((allLowValueOffers / args.rounds) * 100).toFixed(2)}%`);
  console.log(
    `% of offers containing an Ultra Rare+ card where NONE of the 3 choices reaches draftValue ${STRONG_VALUE_THRESHOLD} (a "dead UR+ offer"): ${
      urPlusOffers === 0 ? "n/a (no UR+ offers rolled)" : ((urPlusOffersWithNoStrongChoice / urPlusOffers) * 100).toFixed(2) + "%"
    } (${urPlusOffers} UR+ offers out of ${args.rounds} total)`
  );

  if (isFixture) {
    console.log(
      "\nCAVEAT: this run used the small built-in sourced fixture (10 cards), not the real ~13,931-card catalog. " +
        "With that few cards per rarity bucket, this proves the SIMULATOR MECHANISM (weighted roll, offer bucketing, " +
        "percentile/overlap computation) is correct and unbiased - it does NOT yet prove the real catalog's value " +
        "distribution, and the overlap/dead-offer percentages above are NOT meaningful with only a handful of cards " +
        "per bucket. Re-run with --proposal pointing at a real scripts/audit-card-valuation.mjs full-proposal.json " +
        "export (Phase C in the runbook) for real numbers."
    );
  }
}

main();
