// =========================================================
// APPLY FINAL SEASON 1 RARITIES (2026-09-01 recalibration)
//
// Materializes the already-approved 2026-09-01.1 rarity-engine
// recalibration (see lib/valuation-engine.mjs) into a deployable
// migration + refreshed audit exports. This script does NOT
// re-score any card and does NOT touch eligibility: it reuses the
// exact card scores already computed in the most recent full
// catalog valuation snapshot (reports/card-valuation/
// 2026-08-25T12-39-31-069Z/full-proposal.json - the only local
// full-catalog snapshot available in this sandbox, no live
// Supabase/network access here) and runs them through the CURRENT
// proposeRarity() from lib/valuation-engine.mjs, exactly as
// requirement #4/#5 of the 2026-09-01 "FINAL RARITY APPLICATION"
// directive permits.
//
// ELIGIBILITY: uses the same client-side port of
// is_duelist_circle_format_eligible() (as configured by the
// 'duelist_circle_classic_v1' format row - 2014-12-31 cutoff,
// Synchro/Link/Pendulum/Illusion excluded, Xyz/Fusion allowed, plus
// the 25 format_card_overrides includes / 7 excludes seeded across
// 202608300900 / 202608301200 / 202609011200) that was already used,
// unchanged, for the prior (accepted) SECRET_RARE_AUDIT.csv export.
// Per that directive's requirement #3 ("Do not alter: card
// eligibility / ... / cardpool whitelist"), this script
// deliberately does NOT add the card_catalog.release_stage gate
// that is also part of the live SQL predicate - release_stage has
// never been populated by any committed migration (it defaults to
// NULL for every card and is populated by a separate, not-yet-run
// go-live operator step per the 202608231500 migration's own
// comment), so gating on it here would be a NEW eligibility
// restriction never applied by this project's prior work, not a
// preservation of the existing one.
//
// MANUAL OVERRIDES: the 15 game_rarity overrides committed in
// 202608301000_seed_manual_rarity_overrides.sql and
// 202608301100_seed_manual_rarity_overrides_round2.sql are hard
// overrides. They are EXCLUDED from this script's UPDATE list
// entirely (never re-touched) - their rarity stands exactly as
// those two migrations already set it, matching requirement #2.
//
// KNOWN, FLAGGED DEVIATION: running the current (2026-09-01.1)
// engine's unchanged legendaryGate against this eligible pool
// yields 70 Legendary cards, well above the ~25-35 go-live target.
// Root cause (confirmed, not a script bug): Path B of legendaryGate
// (ceiling >= 9.4 && floor >= 3.0) passes a disproportionate share
// of generic, low-dependency staples with a maxed ceiling score
// (e.g. Obelisk the Tormentor, Vennominaga the Deity of Poisonous
// Snakes, Gryphon Wing, Strike of the Monarchs) - cards this
// project's OWN oppressiveness/valuation audit already recommended
// holding to release_stage 2 (i.e. NOT stage-1 launch cards) via
// suggested_release_stage, a recommendation never yet applied to
// card_catalog.release_stage. Restricting to only
// suggested_release_stage === 1 cards (the closer, but NOT
// currently-live, FORMAT_ELIGIBLE_PROXY pool in
// lib/format-eligibility.mjs) brings Legendary down to 34 - within
// target - but doing so here would mean silently changing which
// cards count as "eligible" for this task, which requirement #3
// forbids. Reported as an explicit blocker below rather than
// silently patched.
// =========================================================

import { proposeRarity, VALUATION_ENGINE_VERSION } from "../lib/valuation-engine.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const SNAPSHOT = "reports/card-valuation/2026-08-25T12-39-31-069Z/full-proposal.json";
const MIGRATION_PATH = "supabase/migrations/202609012100_apply_final_season1_rarities.sql";
const CSV_PATH = "scripts/generated/SECRET_RARE_AUDIT.csv";
const NAMES_TXT_PATH = "scripts/generated/SECRET_RARE_NAMES.txt";

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
  const isSynchro = /synchro/i.test(t);
  const isLink = /link/i.test(t);
  const isPendulum = /pendulum/i.test(t);
  const isIllusion = card.race === "Illusion" || /illusion/i.test(card.monster_type || "");
  if (isSynchro) return { eligible: false, poolStatus: "excluded_banned_mechanic" };
  if (isLink) return { eligible: false, poolStatus: "excluded_banned_mechanic" };
  if (isPendulum) return { eligible: false, poolStatus: "excluded_banned_mechanic" };
  if (isIllusion) return { eligible: false, poolStatus: "excluded_banned_mechanic" };
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
  const changes = []; // non-override cards whose rarity actually changes
  const overridesApplied = [];
  const secretRareRows = [];

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
      finalRarity = card.current_rarity; // no scores at all - fallback, kept as-is
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
  }

  // ---- 1. Migration SQL ----
  const changesById = changes.filter((c) => c.card_catalog_id);
  const changesMissingId = changes.filter((c) => !c.card_catalog_id);

  const header = `-- =========================================================
-- APPLY FINAL SEASON 1 RARITY RECALIBRATION (engine ${VALUATION_ENGINE_VERSION})
--
-- Materializes the already-approved 2026-09-01 rarity-engine
-- recalibration into card_catalog.game_rarity for the eligible
-- Duelist Circle Classic pool. Generated by
-- scripts/apply-final-season1-rarities.mjs from the 2026-08-25
-- full-catalog valuation snapshot (the only local snapshot
-- available; effect_text/live re-scoring was not possible in this
-- sandbox - see that script's header for the full methodology and
-- a flagged, known deviation: this recalibration yields 70
-- Legendary cards against the eligible pool used here, above the
-- ~25-35 go-live target. Root cause: generic low-dependency staples
-- with a maxed ceiling score clear legendaryGate Path B; several of
-- them carry a suggested_release_stage of 2 in the source valuation
-- data (i.e. this project's own oppressiveness review already
-- recommended holding them back from stage 1), but
-- card_catalog.release_stage has never been populated by any
-- committed migration, so that recommendation could not be applied
-- here without changing what counts as "eligible" - out of scope
-- for this migration per its own directive. Flag for operator
-- review before/at go-live.
--
-- Does NOT touch: card eligibility, format_card_overrides, Boss
-- Route tables/exclusivity, pack odds, economy config, or any of
-- the 15 manually-overridden cards from
-- 202608301000_seed_manual_rarity_overrides.sql and
-- 202608301100_seed_manual_rarity_overrides_round2.sql (excluded
-- from this file entirely - those hard overrides stand as already
-- committed).
--
-- Idempotent: every statement is a plain UPDATE ... WHERE id = ...
-- keyed on card_catalog_id (safe to re-run; a re-run after this
-- migration already applied is a no-op).
-- =========================================================

begin;

`;

  const updates = changesById
    .map(
      (c) =>
        `update public.card_catalog set game_rarity = '${sqlEscape(c.to)}' where id = '${c.card_catalog_id}'; -- ${sqlEscape(c.name)}: ${c.from} -> ${c.to}`
    )
    .join("\n");

  const footer = `

commit;
`;

  const migrationSql = header + updates + footer;
  writeFileSync(MIGRATION_PATH, migrationSql, "utf8");

  // ---- 2. Secret Rare audit CSV (v2) ----
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

  // ---- Report ----
  console.log("Engine version:", VALUATION_ENGINE_VERSION);
  console.log("Eligible pool size:", eligibleCards.length);
  console.log("Final distribution:", distribution);
  console.log("Overrides applied:", overridesApplied.length);
  console.log("Changes written to migration (has card_catalog_id):", changesById.length);
  console.log("Changes SKIPPED (missing card_catalog_id):", changesMissingId.length);
  if (changesMissingId.length) {
    console.log(JSON.stringify(changesMissingId.slice(0, 5), null, 2));
  }
  console.log("Secret Rare rows in new CSV:", secretRareRows.length);
  console.log("Migration written to:", MIGRATION_PATH);
  console.log("CSV written to:", CSV_PATH);
  console.log("Names TXT written to:", NAMES_TXT_PATH);
  console.log("\nOverrides preserved:");
  for (const o of overridesApplied) console.log(`  ${o.name} -> ${o.rarity}`);
}
main();
