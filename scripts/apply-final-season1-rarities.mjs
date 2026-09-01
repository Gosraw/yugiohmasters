// =========================================================
// FINAL RARITY DISTRIBUTION FIX (2026-09-01.2 flattening pass)
//
// Applies the flattened, gameplay-friendly Season 1 rarity shape
// (engine 2026-09-01.2 - see lib/valuation-engine.mjs) on top of the
// prior 202609012100 migration. Same methodology as that migration:
// reuses the Aug 25 valuation snapshot's scores (no live Supabase
// access in this sandbox), same eligible Duelist Circle Classic pool
// (6,181 cards, unchanged), idempotent UPDATE statements keyed on
// card_catalog_id.
//
// MANUAL OVERRIDES: the same 15 hard overrides, PLUS a 16th -
// "Ancient Gear Beast" -> "Ultra Rare" - sourced directly from this
// project's own lib/valuation-engine.regression.test.mjs
// HUMAN_CALIBRATION_ROUND2 table (Confidence: HIGH, scored live from
// the card's real effect text). The Aug 25 snapshot's cached score
// for this specific card predates the 2026-08-30 tribute-penalty
// scoreCard() fix and clears the (structurally corrected) Legendary
// gate on stale data alone - a known, already-documented input-data
// staleness gap, not a gate-logic bug, so it is fixed the same way
// this project has always fixed this class of gap: a targeted
// manual override, not further gate surgery on a single card.
// =========================================================

import { proposeRarity, VALUATION_ENGINE_VERSION } from "../lib/valuation-engine.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const SNAPSHOT = "reports/card-valuation/2026-08-25T12-39-31-069Z/full-proposal.json";
const MIGRATION_PATH = "supabase/migrations/202609012110_final_rarity_distribution_fix.sql";
const CSV_PATH = "scripts/generated/SECRET_RARE_AUDIT.csv";
const NAMES_TXT_PATH = "scripts/generated/SECRET_RARE_NAMES.txt";
const LEGENDARY_TXT_PATH = "scripts/generated/LEGENDARY_NAMES.txt";

const RARITY_OVERRIDES = {
  "Rescue Rabbit": "Super Rare",
  "Tragoedia": "Secret Rare",
  "Gorz the Emissary of Darkness": "Secret Rare",
  "Battle Fader": "Ultra Rare",
  "Swift Scarecrow": "Super Rare",
  "D.D. Crow": "Ultra Rare",
  "Effect Veiler": "Secret Rare",
  "Maxx \"C\"": "Ultra Rare",
  "Giant Trunade": "Ultra Rare",
  "Doomcaliber Knight": "Secret Rare",
  "Rainbow Dragon": "Secret Rare",
  "Sorcerer of Dark Magic": "Secret Rare",
  "Superancient Deepsea King Coelacanth": "Secret Rare",
  "Arcana Force EX - The Light Ruler": "Legendary",
  "Arcana Force EX - The Dark Ruler": "Legendary",
  "Ancient Gear Beast": "Ultra Rare",
};

const FORMAT_INCLUDES = new Set([
  "Chocolate Magician Girl",
  "Elemental HERO Shadow Mist", "Mask Change II", "Elemental HERO Blazeman",
  "Eternal Soul", "Red-Eyes Fusion", "Red-Eyes Black Dragon Sword",
  "The Black Stone of Legend", "Cyber Emergency", "Cyber Dragon Herz",
  "Cyber Dragon Vier", "Chaos Ancient Gear Giant", "Ancient Gear Fusion",
  "Ancient Gear Howitzer", "Rainbow Overdragon", "D-Fusion",
  "Fairy Tail - Snow", "Ultimate Conductor Tyranno", "Vision HERO Vyon",
  "Amazoness Onslaught", "Vampire Fraulein", "Return of the Dragon Lords",
  "Toon Kingdom", "Bingo Machine, Go!!!", "Apprentice Illusion Magician",
]);
const FORMAT_EXCLUDES = new Set([
  "Aleister the Invoker", "Invocation", "Invoked Magellanica",
  "Invoked Purgatrio", "Invoked Elysium", "Invoked Cocytus",
  "Invoked Mechaba", "Number 86: Heroic Champion - Rhongomyniad",
]);
const RELEASE_CUTOFF = new Date("2014-12-31T00:00:00Z");
const MASTER_DUEL_OK = new Set(["unlimited", "semi_limited", "limited"]);

function isMasterDuelOfferable(status) { return MASTER_DUEL_OK.has(status || ""); }

function computeEligibility(card) {
  if (!isMasterDuelOfferable(card.master_duel_status)) {
    return { eligible: false, poolStatus: "excluded_master_duel_gate" };
  }
  if (FORMAT_EXCLUDES.has(card.name)) {
    return { eligible: false, poolStatus: "excluded_override" };
  }
  if (FORMAT_INCLUDES.has(card.name)) {
    return { eligible: true, poolStatus: "eligible_override_include" };
  }
  const t = (card.card_type || "") + " " + (card.frame_type || "");
  if (/synchro/i.test(t)) return { eligible: false, poolStatus: "excluded_banned_mechanic" };
  if (/link/i.test(t)) return { eligible: false, poolStatus: "excluded_banned_mechanic" };
  if (/pendulum/i.test(t)) return { eligible: false, poolStatus: "excluded_banned_mechanic" };
  if (card.race === "Illusion" || /illusion/i.test(card.monster_type || "")) {
    return { eligible: false, poolStatus: "excluded_banned_mechanic" };
  }
  if (card.release_date) {
    const rd = new Date(card.release_date);
    if (rd > RELEASE_CUTOFF) return { eligible: false, poolStatus: "excluded_post_cutoff" };
  }
  return { eligible: true, poolStatus: "eligible_base_pre_2015" };
}

function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

function main() {
  const raw = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  const cards = Array.isArray(raw) ? raw : raw.records || raw.cards || raw.data;

  const eligibleCards = [];
  for (const card of cards) {
    const { eligible, poolStatus } = computeEligibility(card);
    if (eligible) eligibleCards.push({ card, poolStatus });
  }

  const distribution = {};
  const changes = [];
  const overridesApplied = [];
  const secretRareRows = [];
  const legendaryNames = [];

  for (const { card, poolStatus } of eligibleCards) {
    const override = RARITY_OVERRIDES[card.name];
    let finalRarity;
    let manualOverride = false;

    if (override) {
      finalRarity = override;
      manualOverride = true;
      overridesApplied.push({ name: card.name, rarity: override });
    } else if (card.scores) {
      finalRarity = proposeRarity(card.scores);
      if (finalRarity !== card.current_rarity) {
        changes.push({
          card_catalog_id: card.card_catalog_id,
          name: card.name,
          from: card.current_rarity,
          to: finalRarity,
        });
      }
    } else {
      finalRarity = card.current_rarity;
    }

    distribution[finalRarity] = (distribution[finalRarity] || 0) + 1;

    if (finalRarity === "Secret Rare") {
      secretRareRows.push({
        card_name: card.name,
        current_rarity: finalRarity,
        card_type: card.card_type || "",
        monster_type: card.monster_type || "",
        archetype: card.archetype || "",
        rarity_score: card.scores ? card.scores.draftValue : "",
        rarity_reason: card.scores ? card.scores.reason || "" : "",
        manual_override: manualOverride ? "TRUE" : "FALSE",
        release_date: card.release_date || "",
        pool_status: poolStatus,
      });
    }
    if (finalRarity === "Legendary") {
      legendaryNames.push(card.name);
    }
  }

  // ---- 1. Migration SQL ----
  // IMPORTANT: this migration runs AFTER 202609012100 has already
  // applied its own game_rarity values, so "from" here is what THAT
  // migration set (i.e. the 2026-09-01.1 output), not the raw Aug25
  // snapshot. Since this script recomputes finalRarity purely from
  // scores.mjs + overrides (never reading an intermediate applied
  // state), and compares it to card.current_rarity (the Aug25
  // snapshot's PRE-09-01.1 value) rather than the 09-01.1 output, the
  // WHERE-clause skip-if-unchanged optimization does not apply
  // cleanly across two migrations - so every eligible, non-override
  // card gets an unconditional UPDATE here (idempotent regardless of
  // which prior state it is applied on top of), rather than only the
  // subset whose value differs from the stale snapshot's original
  // current_rarity.
  const nonOverrideCards = eligibleCards.filter(({ card }) => !RARITY_OVERRIDES[card.name] && card.scores && card.card_catalog_id);

  const header = `-- =========================================================
-- FINAL RARITY DISTRIBUTION FIX (engine ${VALUATION_ENGINE_VERSION})
--
-- Supersedes 202609012100_apply_final_season1_rarities.sql's rarity
-- assignments with the flattened, gameplay-friendly Season 1 shape
-- from the final pre-launch sprint. Generated by
-- scripts/apply-final-season1-rarities.mjs. Does NOT touch card
-- eligibility, Boss Routes, pack odds, draft rules, or economy.
--
-- Unconditionally (re)sets game_rarity for every eligible,
-- non-manually-overridden card in the Duelist Circle Classic pool
-- (6,181 cards) to the engine ${VALUATION_ENGINE_VERSION} output -
-- safe/idempotent to re-run, and correct whether run on top of the
-- Aug 25 snapshot's original values or on top of 202609012100's
-- already-applied 2026-09-01.1 values. The 16 manual overrides
-- (the original 15 plus Ancient Gear Beast -> Ultra Rare, see this
-- migration's generating script for why) are excluded entirely and
-- left exactly as already committed.
-- =========================================================

begin;

`;

  const updates = nonOverrideCards
    .map(({ card }) => {
      const finalRarity = proposeRarity(card.scores);
      return `update public.card_catalog set game_rarity = '${sqlEscape(finalRarity)}' where id = '${card.card_catalog_id}'; -- ${sqlEscape(card.name)}`;
    })
    .join("\n");

  const footer = `

commit;
`;

  writeFileSync(MIGRATION_PATH, header + updates + footer, "utf8");

  // ---- 2. Secret Rare audit CSV ----
  secretRareRows.sort((a, b) => a.card_name.localeCompare(b.card_name));
  const csvColumns = [
    "card_name", "current_rarity", "card_type", "monster_type", "archetype",
    "rarity_score", "rarity_reason", "manual_override", "release_date", "pool_status",
  ];
  function csvEscape(v) {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  const csvLines = [csvColumns.join(",")];
  for (const row of secretRareRows) {
    csvLines.push(csvColumns.map((c) => csvEscape(row[c])).join(","));
  }
  writeFileSync(CSV_PATH, csvLines.join("\n") + "\n", "utf8");

  // ---- 3. Secret Rare names TXT ----
  const names = secretRareRows.map((r) => r.card_name).sort((a, b) => a.localeCompare(b));
  writeFileSync(NAMES_TXT_PATH, names.join("\n") + "\n", "utf8");

  // ---- 4. Legendary names TXT ----
  legendaryNames.sort((a, b) => a.localeCompare(b));
  writeFileSync(LEGENDARY_TXT_PATH, legendaryNames.join("\n") + "\n", "utf8");

  // ---- Report ----
  console.log("Engine version:", VALUATION_ENGINE_VERSION);
  console.log("Eligible pool size:", eligibleCards.length);
  console.log("Final distribution:", distribution);
  console.log("Overrides applied:", overridesApplied.length);
  console.log("UPDATE statements written:", nonOverrideCards.length);
  console.log("Secret Rare rows:", secretRareRows.length);
  console.log("Legendary names:", legendaryNames.length);
  console.log("\nOverrides preserved:");
  for (const o of overridesApplied) console.log(`  ${o.name} -> ${o.rarity}`);
  console.log("\nLegendary list:");
  for (const n of legendaryNames) console.log(`  ${n}`);
}
main();
