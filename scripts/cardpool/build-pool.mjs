#!/usr/bin/env node
// =========================================================
// Build the Duelist Circle 2.0 "Classic" card pool - offline, no DB.
//
//   node scripts/cardpool/fetch-catalog.mjs      # once (or --force to refresh)
//   node scripts/cardpool/fetch-era-banlist.mjs  # once (banlist JSON is committed)
//   node scripts/cardpool/build-pool.mjs
//
// Inputs
//   data/external/ygoprodeck-cardinfo.json     YGOPRODeck snapshot (misc=yes)
//   data/banlists/tcg-2014-10.json             official TCG F&L list in force at end of 2014
//   data/banlists/duelist-circle-proposal.json our own "unfair" verdicts (group vote pending)
//   data/cardpool/overrides.json               curated includes/excludes (mirrors the
//                                              format_card_overrides seed migrations)
//
// Outputs
//   data/cardpool/classic-v2-pool.json     every card in the pool + its status
//   data/cardpool/classic-v2-excluded.json cards in era scope that were removed, with reason
//   data/cardpool/classic-v2-review.json   soft mechanic mentions kept in the pool (spot-check)
//   data/cardpool/classic-v2-summary.json  counts only (small, diff-friendly)
//
// Eligibility precedence (first match wins):
//   1. Skill Cards / Tokens                      -> out of scope (not deck cards)
//   2. Not in Master Duel (misc_info.formats)    -> excluded, absolute (even over includes)
//   3. Manual exclude override                   -> excluded
//   4. Manual include override                   -> IN (skips 5-7)
//   5. Synchro / Link / Pendulum / Illusion type -> excluded (incl. Pendulum Fusion/Xyz hybrids)
//   6. Hard mechanic text dependency             -> excluded (see classifyMechanicDependency)
//   7. Release date (TCG date, else OCG date) > 2014-12-31, or unknown -> excluded
//   8. Otherwise                                 -> IN
// Then banlist status: our proposal verdict (if any) wins over the 2014 list,
// because the owner explicitly re-rated some era-forbidden cards (e.g.
// Harpie's Feather Duster -> Legendary). The Master Duel banlist is NOT
// used: the group plays Master Duel "Unlimited" duel rooms.
// =========================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BOSS_ROUTES } from "../../data/boss-route-registry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const p = (...s) => path.join(ROOT, ...s);
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

export const CORE_CUTOFF = "2014-12-31";

// ---------------------------------------------------------
// Mechanic text-dependency classifier
// ---------------------------------------------------------
// Works sentence by sentence. A sentence is "mechanic-bound" when it only
// makes sense with Synchro / Pendulum / Link cards (or the Synchron
// Tuner family) present. Restriction-only sentences ("Cannot be used as
// Synchro Material, except ...") are stripped first: they limit the card
// but never make it dead. Verdict:
//   hard  - every functional sentence is mechanic-bound (card is dead or
//           its only purpose is the excluded mechanic), or it is a
//           "Synchron" card, or a Fusion/Xyz whose materials need one.
//   soft  - mentions the mechanic but has independent function. KEPT.
//   none  - no mention.

// Restriction clauses limit how the card may be used but never make it dead.
// They are cut out of the sentence (the rest of the sentence still counts).
const RESTRICTION_CLAUSES = [
  /[,;]?\s*(also |and )?(it|they|this card|that monster)?\s*cannot be used as (an? )?(synchro|link) material( monsters?)?(,? except for the (synchro|link) summon of [^.]*?)?(?=[.,;]|$)/gi,
  /[,;]?\s*(or )?use it as (an? )?synchro material( monsters?)?/gi,
  /(also )?you cannot (synchro|pendulum|link) summon[^.]*?(?=[.;]|$)/gi,
  /if this card was special summoned, it cannot be used as (an? )?synchro material/gi,
];
const BOILERPLATE =
  /^(you can only (use|activate|special summon|control)|this card cannot be (normal summoned|special summoned)|cannot be (normal summoned|special summoned)|must (first )?be special summoned|\(this card is (always|not) treated)/i;
const MECHANIC_WORD =
  /\bsynchro\b|\bpendulum\b|\blink (monster|summon|material|rating|arrow|marker)|treated as an? tuner|"[^"]*synchron[^"]*"/i;
// "Ritual, Fusion or Synchro Monster", "(Fusion, Synchro, or Xyz)", "Synchro or Xyz Summon":
// the excluded mechanic is just one alternative next to an allowed one.
const ALTERNATIVE_LIST =
  /\b(ritual|fusion|xyz|synchro|pendulum|link)\b((,|,? or|,? and) (ritual|fusion|xyz|synchro|pendulum|link)\b)+/gi;
// Optional riders ("..., then you can Special Summon 1 "Stardust Dragon"") don't make a card dead.
const OPTIONAL_RIDER = /,? (then|also),? you can [^.]*\.?$/i;

function splitSentences(desc) {
  return (desc ?? "")
    .replace(/\r/g, "")
    .split(/\n+|●|(?<=[.!])\s+(?=[A-Z("'])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function classifyMechanicDependency(card, excludedNames = new Set()) {
  const name = card.name ?? "";
  if (/synchron/i.test(name)) return { level: "hard", why: "Synchron card (Synchro-enabler family)" };
  if (/normal/i.test(card.type) && !/tuner/i.test(card.type)) return { level: "none" };

  const sentences = splitSentences(card.desc);
  const isExtra = /fusion|xyz/i.test(card.type);
  if (isExtra && sentences.length && MECHANIC_WORD.test(sentences[0])) {
    return { level: "hard", why: `materials need an excluded mechanic: "${sentences[0].slice(0, 120)}"` };
  }

  const refsExcluded = (s) => {
    for (const m of s.matchAll(/"([^"]+)"/g)) if (excludedNames.has(m[1]) && m[1] !== name) return true;
    return false;
  };
  const bound = (raw) => {
    const s = raw.replace(OPTIONAL_RIDER, "").replace(ALTERNATIVE_LIST, (m) => (/ritual|fusion|xyz/i.test(m) ? "ALLOWED-OR-EXCLUDED" : m));
    return MECHANIC_WORD.test(s) || refsExcluded(s);
  };

  let materialRestriction = false;
  let anyRestriction = false;
  const functional = [];
  for (const raw of isExtra ? sentences.slice(1) : sentences) {
    let s = raw;
    RESTRICTION_CLAUSES.forEach((re, i) => {
      s = s.replace(re, () => {
        anyRestriction = true;
        if (i !== 2) materialRestriction = true;
        return "";
      });
    });
    s = s.trim();
    if (s !== raw.trim() && s.replace(/[^a-z]/gi, "").length < 12) continue; // only the restriction was there
    if (BOILERPLATE.test(s)) continue;
    functional.push(s);
  }
  const boundSentences = functional.filter(bound);
  const freeSentences = functional.filter((s) => !bound(s));

  // Spells/Traps: an activation requirement or cost that needs the excluded
  // mechanic ("Tribute 1 Synchro Monster you control.", "Activate only if you
  // destroyed a ... Synchro Monster") makes the whole card dead.
  const isSpellTrap = /spell|trap/i.test(card.type);
  if (isSpellTrap && functional.length) {
    const first = functional[0];
    const hasConditionPrefix = /[:;]/.test(first) || /^(activate|equip only|tribute|select|remove from play|send|banish|target|return|neither player can)\b/i.test(first);
    const condition = first.split(/[:;]/)[0];
    // "a "Power Tool Dragon" or Level 4 or higher Machine-Type monster": an allowed alternative exists
    const hasFreeAlternative =
      !MECHANIC_WORD.test(condition) && refsExcluded(condition) && condition.split(/ or /i).some((part) => !bound(part));
    if (hasConditionPrefix && bound(condition) && !hasFreeAlternative) {
      return { level: "hard", why: `activation condition/cost needs an excluded mechanic: "${first.slice(0, 140)}"` };
    }
  }
  if (boundSentences.length && !freeSentences.length) {
    return { level: "hard", why: `only mechanic-bound effects: "${boundSentences[0].slice(0, 140)}"` };
  }
  if (!functional.length && materialRestriction && !isExtra) {
    return { level: "hard", why: "no effect besides a Synchro-material restriction (exists only for Synchro Summons)" };
  }
  if (boundSentences.length || anyRestriction) {
    return { level: "soft", why: `mechanic mention, independent function kept: "${(boundSentences[0] ?? "restriction clause").slice(0, 140)}"` };
  }
  return { level: "none" };
}

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------
const misc = (c) => c.misc_info?.[0] ?? {};
export const releaseDate = (c) => misc(c).tcg_date ?? misc(c).ocg_date ?? null;
export const inMasterDuel = (c) => (misc(c).formats ?? []).includes("Master Duel");
const isOutOfScopeType = (c) => /skill|token/i.test(c.type);
export const isExcludedMechanicType = (c) =>
  /synchro|link|pendulum/i.test(`${c.type} ${c.frameType}`) || (c.typeline ?? []).some((t) => /illusion/i.test(t));

function eraOf(date) {
  if (!date) return "unknown";
  if (date <= CORE_CUTOFF) return "core_<=2014";
  if (date <= "2018-12-31") return "2015-2018";
  return "2019+";
}

const STATUS_COPIES = { unlimited: 3, semi_limited: 2, limited: 1, limited_1_per_deck: 1, legendary_unique: 1, forbidden: 0 };

// ---------------------------------------------------------
// Main
// ---------------------------------------------------------
function main() {
  const catalogFile = p("data", "external", "ygoprodeck-cardinfo.json");
  if (!fs.existsSync(catalogFile)) {
    console.error("No catalog snapshot. Run: node scripts/cardpool/fetch-catalog.mjs");
    process.exit(1);
  }
  const snapshot = readJson(catalogFile);
  const cards = snapshot.data;
  const byName = new Map(cards.map((c) => [c.name, c]));

  const overrides = readJson(p("data", "cardpool", "overrides.json"));
  const includeSet = new Map(overrides.include.map((o) => [o.name, o]));
  const excludeSet = new Map(overrides.exclude.map((o) => [o.name, o]));

  const era = readJson(p("data", "banlists", "tcg-2014-10.json"));
  const eraStatus = new Map();
  for (const n of era.forbidden) eraStatus.set(n, "forbidden");
  for (const n of era.limited) eraStatus.set(n, "limited");
  for (const n of era.semi_limited) eraStatus.set(n, "semi_limited");

  const proposalFile = p("data", "banlists", "duelist-circle-proposal.json");
  const proposal = fs.existsSync(proposalFile) ? readJson(proposalFile) : { entries: [] };
  const verdicts = new Map(proposal.entries.map((e) => [e.name, e]));

  const warnings = [];
  for (const n of [...includeSet.keys(), ...excludeSet.keys(), ...eraStatus.keys(), ...verdicts.keys()]) {
    if (!byName.has(n)) warnings.push(`name not in catalog: ${n}`);
  }

  // Names of cards that are themselves excluded by mechanic type: a quoted
  // reference to one of them counts as mechanic-bound text.
  const excludedNames = new Set(cards.filter(isExcludedMechanicType).map((c) => c.name));

  const pool = [];
  const excluded = [];
  const review = [];
  const counts = {
    catalog_total: cards.length,
    out_of_scope_type: 0,
    not_in_master_duel: 0,
    manual_exclude: 0,
    manual_include: 0,
    mechanic_type: 0,
    mechanic_text_dependency: 0,
    era_post_2014: 0,
    unknown_release_date: 0,
  };

  for (const c of cards) {
    const date = releaseDate(c);
    const eraName = eraOf(date);
    const inEraScope = eraName === "core_<=2014" || includeSet.has(c.name);
    const base = { id: c.id, name: c.name, type: c.type, release_date: date, era: eraName };
    const exclude = (reason, detail) => {
      counts[reason]++;
      // only list exclusions that matter for the Classic pool (in era scope)
      if (inEraScope || reason === "manual_exclude") excluded.push({ ...base, reason, detail });
    };

    if (isOutOfScopeType(c)) { counts.out_of_scope_type++; continue; }
    if (!inMasterDuel(c)) { exclude("not_in_master_duel", "not listed in Master Duel by YGOPRODeck"); continue; }
    if (excludeSet.has(c.name)) {
      const o = excludeSet.get(c.name);
      if (o.kind === "mechanic_leak") exclude("mechanic_text_dependency", `manual review: ${o.reason}`);
      else exclude("manual_exclude", o.reason);
      continue;
    }

    let source = "core";
    if (includeSet.has(c.name)) {
      counts.manual_include++;
      source = "curated_include";
    } else {
      if (isExcludedMechanicType(c)) { exclude("mechanic_type", c.type); continue; }
      const dep = classifyMechanicDependency(c, excludedNames);
      if (dep.level === "hard") { exclude("mechanic_text_dependency", dep.why); continue; }
      if (!date) { exclude("unknown_release_date", "no TCG or OCG date in snapshot"); continue; }
      if (date > CORE_CUTOFF) { exclude("era_post_2014", eraName); continue; }
      if (dep.level === "soft") review.push({ ...base, note: dep.why });
    }

    const eraBan = eraStatus.get(c.name) ?? "unlimited";
    const v = verdicts.get(c.name);
    const finalStatus = v ? v.verdict : eraBan;
    pool.push({
      ...base,
      frame_type: c.frameType,
      race: c.race ?? null,
      attribute: c.attribute ?? null,
      archetype: c.archetype ?? null,
      source,
      in_md: true,
      md_rarity: misc(c).md_rarity ?? null,
      era_banlist: eraBan,
      dc_verdict: v?.verdict ?? null,
      dc_category: v?.category ?? null,
      final_status: finalStatus,
      max_copies_per_deck: STATUS_COPIES[finalStatus],
      league_unique: finalStatus === "legendary_unique",
      playable: finalStatus !== "forbidden",
    });
  }

  pool.sort((a, b) => a.name.localeCompare(b.name));
  excluded.sort((a, b) => a.reason.localeCompare(b.reason) || a.name.localeCompare(b.name));
  review.sort((a, b) => a.name.localeCompare(b.name));

  // Classic-scope view of MD availability (deliverable 3): cards that would be
  // in the pool on type/era/text grounds but are not in Master Duel.
  const notInMdClassic = excluded.filter((e) => e.reason === "not_in_master_duel");

  const tally = (arr, key) => arr.reduce((acc, x) => ((acc[x[key] ?? "null"] = (acc[x[key] ?? "null"] ?? 0) + 1), acc), {});
  // Boss Route cross-check: every evolution card and support grant should be
  // in the pool and not touched by a ban/legendary verdict (a route grant of a
  // legendary_unique card would mint extra copies of a "1 per league" card).
  const poolByName = new Map(pool.map((c) => [c.name, c]));
  const excludedByName = new Map(excluded.map((e) => [e.name, e]));
  const bossRouteIssues = [];
  for (const route of BOSS_ROUTES) {
    const refs = [
      ...route.stages.map((st) => ({ card: st.evolutionCard, role: `stage ${st.stageNumber} evolution` })),
      ...(route.supportGrants ?? []).map((g) => ({ card: g.cardName, role: `stage ${g.stageNumber} support grant${g.exclusive ? " (exclusive)" : ""}` })),
    ];
    for (const { card, role } of refs) {
      const inPool = poolByName.get(card);
      let issue = null;
      let severity = null;
      if (!inPool) {
        const ex = excludedByName.get(card);
        const cat = byName.get(card);
        if (ex) {
          issue = `not in pool: ${ex.reason} (${ex.detail})`;
          severity = "blocking";
        } else if (cat) {
          issue = `not in pool: ${eraOf(releaseDate(cat))} release, no include override`;
          severity = "era_gap"; // route grant still hands it out; decide whether it joins the pool
        } else {
          issue = "name not in catalog";
          severity = "blocking";
        }
      } else if (["forbidden", "legendary_unique"].includes(inPool.final_status)) {
        issue = `status ${inPool.final_status}${inPool.dc_verdict ? " (our proposal)" : " (2014 list)"}`;
        severity = "blocking";
      } else if (inPool.final_status !== "unlimited") {
        issue = `status ${inPool.final_status}${inPool.dc_verdict ? " (our proposal)" : " (2014 list)"}`;
        severity = "info";
      }
      if (issue) bossRouteIssues.push({ severity, route: route.code, card, role, issue });
    }
  }

  const summary = {
    generated_at: new Date().toISOString(),
    catalog: { source: snapshot.source_url, fetched_at: snapshot.fetched_at, db_version: snapshot.db_version, cards: cards.length },
    banlist: { name: era.name, effective_from: era.effective_from, effective_to: era.effective_to },
    proposal_entries: proposal.entries.length,
    exclusion_counts_catalog_wide: counts,
    classic_scope_exclusions: tally(excluded, "reason"),
    pool_total: pool.length,
    pool_playable: pool.filter((c) => c.playable).length,
    pool_by_source: tally(pool, "source"),
    pool_by_type: tally(pool, "type"),
    pool_by_final_status: tally(pool, "final_status"),
    pool_by_era_banlist: tally(pool, "era_banlist"),
    verdict_overrides_era: pool.filter((c) => c.dc_verdict && c.era_banlist !== "unlimited" && c.dc_verdict !== c.era_banlist).map((c) => `${c.name}: ${c.era_banlist} -> ${c.dc_verdict}`),
    classic_not_in_master_duel: notInMdClassic.length,
    soft_mechanic_mentions_kept: review.length,
    boss_route_issue_counts: tally(bossRouteIssues, "severity"),
    boss_route_issues: bossRouteIssues,
    warnings,
  };

  const outDir = p("data", "cardpool");
  fs.writeFileSync(path.join(outDir, "classic-v2-pool.json"), JSON.stringify({ summary, cards: pool }, null, 1) + "\n");
  fs.writeFileSync(path.join(outDir, "classic-v2-excluded.json"), JSON.stringify(excluded, null, 1) + "\n");
  fs.writeFileSync(path.join(outDir, "classic-v2-review.json"), JSON.stringify(review, null, 1) + "\n");
  fs.writeFileSync(path.join(outDir, "classic-v2-summary.json"), JSON.stringify(summary, null, 2) + "\n");

  console.log(`Pool: ${pool.length} cards (${summary.pool_playable} playable, ${pool.length - summary.pool_playable} forbidden).`);
  console.log("Final status:", summary.pool_by_final_status);
  console.log("Classic-scope exclusions:", summary.classic_scope_exclusions);
  console.log(`Not in Master Duel (Classic scope): ${notInMdClassic.length} -> ${notInMdClassic.map((e) => e.name).join("; ")}`);
  console.log("Boss Route cross-check:", summary.boss_route_issue_counts, "(blocking listed below; full list in classic-v2-summary.json)");
  for (const b of bossRouteIssues.filter((x) => x.severity === "blocking")) console.log(`  [${b.route}] ${b.card} - ${b.role}: ${b.issue}`);
  if (warnings.length) console.log("WARNINGS:\n  " + warnings.join("\n  "));
}

const isMain = import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) main();
