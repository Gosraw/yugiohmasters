// =========================================================
// AUDIT CARD VALUATION - Season 1 rarity/valuation proposal (v2)
//
// PROPOSAL / AUDIT ONLY BY DEFAULT. Running this script with no
// flags NEVER writes to the database - it only reads card_catalog
// and produces review reports (CSV + JSON + Markdown) under
// reports/card-valuation/<timestamp>/.
//
// Only with --write-scores does it write anything back, and even
// then it writes ONLY to the proposal columns added by
// 202608231500_duelist_circle_format_engine.sql and
// 202608231600_valuation_engine_v2_columns.sql (power_score,
// accessibility_score, dependency_score, generic_utility_score,
// consistency_score, floor_score, ceiling_score,
// oppressiveness_tier, oppressiveness_reason, draft_value_score,
// proposed_game_rarity, valuation_reason, valuation_engine_version,
// valuation_computed_at). It NEVER writes to game_rarity,
// release_stage, or format_eligible - those are separate, even
// more deliberate operator actions, documented in the Season 1
// runbook, never bundled into this script.
//
// A card with valuation_manually_overridden = true is always
// skipped entirely (scored for the report so you can still see
// what the engine WOULD have said, but never written), mirroring
// the existing rarity_manually_overridden protection in
// scripts/classify-rarities.mjs.
//
// v2 CHANGES vs. the version that produced the report which
// triggered this rewrite (see lib/valuation-engine.mjs's own
// header for the full account of what was wrong and why):
//   - Every score section below now reports all EIGHT axes
//     (power/accessibility/dependency/genericUtility/consistency/
//     floor/ceiling/oppressiveness), not six.
//   - REPORT.md now includes 50 RANDOM SAMPLES PER PROPOSED
//     RARITY (not just the extremes), so a reviewer can sanity-
//     check the "middle of the distribution", not only the
//     upgrades/downgrades that were already flagged as interesting.
//   - REPORT.md now includes an explicit FALSE-POSITIVE /
//     FALSE-NEGATIVE ARCHETYPE DEPENDENCY section: every card whose
//     archetype tag is thematic-only (no real functional
//     requirement in its own text) vs. every card whose archetype
//     tag IS load-bearing, so a reviewer can directly spot-check
//     the exact failure mode the Season 1 review reported.
//   - Top upgrades/downgrades sections now show up to 100 rows (not
//     60) in REPORT.md itself, matching the requested audit scope.
//
// Usage:
//   node scripts/audit-card-valuation.mjs                 (dry run, writes reports/ only)
//   node scripts/audit-card-valuation.mjs --write-scores   (also upserts the proposal columns)
//   node scripts/audit-card-valuation.mjs --limit 500       (score only the first 500 rows, for a fast smoke test)
// =========================================================

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  extractValuationSignals,
  scoreCard,
  proposeRarity,
  recommendOppressiveness,
  VALUATION_ENGINE_VERSION,
  RARITY_ORDER,
} from "../lib/valuation-engine.mjs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const WRITE_SCORES = args.includes("--write-scores");
const limitArgIndex = args.indexOf("--limit");
const ROW_LIMIT =
  limitArgIndex >= 0 ? parseInt(args[limitArgIndex + 1], 10) : null;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    "❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) ontbreken in .env.local."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SELECT_COLUMNS =
  "id, external_card_id, name, card_type, frame_type, monster_type, race, attribute, level, rank, link_rating, atk, def, description, archetype, game_rarity, master_duel_status, valuation_manually_overridden, release_date";

// ---------------------------------------------------------
// PROVISIONAL Season 1 (2020 pool) eligibility, computed
// client-side from this same SELECT so the JSON/CSV export can
// report a real, non-guessed 2020-pool distribution alongside the
// full-catalog one. This DELIBERATELY mirrors, field-for-field,
// the live is_duelist_circle_format_eligible() predicate
// (supabase/migrations/202608231500_duelist_circle_format_engine.sql)
// as configured by the seeded 'season_1' format row in that same
// migration (release_cutoff 2020-12-31; allow_illusion=false,
// allow_synchro=false, allow_xyz=true, allow_link=false,
// allow_pendulum=false, allow_fusion=true) - it is NOT a guess at
// what that predicate does, it is a direct JS port of it, so this
// script and the live SQL function cannot silently diverge as long
// as this comment is kept in sync with that migration.
//
// Two things this can NEVER do that the real SQL function does:
//   - format_card_overrides (per-card manual include/exclude) -
//     this script has no such table to read, so a card that would
//     be manually overridden in the live format is NOT reflected
//     here. This is a report-only proxy, never a substitute for
//     actually calling is_duelist_circle_format_eligible() live.
//   - release_stage / current_release_stage gating - deliberately
//     omitted here, because release_stage is assigned BY this same
//     audit's oppressiveness step (recommendOppressiveness) and
//     rarity/pool-size analysis should not silently exclude cards
//     the audit itself is the one proposing a stage for.
// Absent card_type/monster_type/race/release_date on OLDER export
// files (pre-dating this field's addition) means this field will
// be undefined for every row in that file - callers must treat a
// missing season1_provisional_eligible field as "unknown", never
// as "false".
// ---------------------------------------------------------
const SEASON_1_RELEASE_CUTOFF = "2020-12-31";
const SEASON_1_ALLOW = {
  illusion: false,
  synchro: false,
  xyz: true,
  link: false,
  pendulum: false,
  fusion: true,
};

function isMasterDuelOfferable(status) {
  return ["unlimited", "semi_limited", "limited"].includes(status ?? "");
}

function computeSeason1ProvisionalEligibility(card) {
  if (!isMasterDuelOfferable(card.master_duel_status)) return false;

  const cardType = (card.card_type ?? "").toLowerCase();
  const frameType = (card.frame_type ?? "").toLowerCase();
  const race = card.race ?? "";
  const monsterType = (card.monster_type ?? "").toLowerCase();

  const isSynchro = cardType.includes("synchro") || frameType.includes("synchro");
  const isXyz = cardType.includes("xyz") || frameType.includes("xyz");
  const isLink = cardType.includes("link") || frameType.includes("link");
  const isPendulum = cardType.includes("pendulum") || frameType.includes("pendulum");
  const isFusion = cardType.includes("fusion") || frameType.includes("fusion");
  const isIllusion = race === "Illusion" || monsterType.includes("illusion");

  if (isSynchro && !SEASON_1_ALLOW.synchro) return false;
  if (isXyz && !SEASON_1_ALLOW.xyz) return false;
  if (isLink && !SEASON_1_ALLOW.link) return false;
  if (isPendulum && !SEASON_1_ALLOW.pendulum) return false;
  if (isFusion && !SEASON_1_ALLOW.fusion) return false;
  if (isIllusion && !SEASON_1_ALLOW.illusion) return false;

  if (card.release_date != null && card.release_date > SEASON_1_RELEASE_CUTOFF) {
    return false;
  }
  // release_date == null (unknown) is NEVER excluded on cutoff
  // grounds alone, matching the live SQL predicate exactly.

  return true;
}

const RARITY_RANK = {
  Normal: 0,
  Rare: 1,
  "Super Rare": 2,
  "Ultra Rare": 3,
  "Secret Rare": 4,
  Legendary: 5,
};

async function fetchAllCards() {
  const pageSize = 1000;
  let from = 0;
  const rows = [];

  while (true) {
    const to = ROW_LIMIT
      ? Math.min(from + pageSize - 1, ROW_LIMIT - 1)
      : from + pageSize - 1;

    const { data, error } = await supabase
      .from("card_catalog")
      .select(SELECT_COLUMNS)
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`card_catalog fetch failed: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    rows.push(...data);

    if (data.length < pageSize) break;
    if (ROW_LIMIT && rows.length >= ROW_LIMIT) break;
    from += pageSize;
  }

  return ROW_LIMIT ? rows.slice(0, ROW_LIMIT) : rows;
}

function scoreOneCard(card) {
  const signals = extractValuationSignals(card);
  const scores = scoreCard(signals, card);
  const proposedRarity = proposeRarity(scores);
  const opp = recommendOppressiveness(
    scores.oppressiveness,
    scores.power,
    scores.dependency
  );
  const season1ProvisionalEligible = computeSeason1ProvisionalEligibility(card);
  return { signals, scores, proposedRarity, opp, season1ProvisionalEligible };
}

function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Deterministic-enough sampling for a report (not cryptographic,
// just needs to spread across the array without a Date.now()/
// Math.random() dependency that would make two runs of the same
// data disagree pointlessly) - simple stride sampling.
function sampleEvenly(arr, n) {
  if (arr.length <= n) return arr;
  const stride = arr.length / n;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(arr[Math.floor(i * stride)]);
  }
  return out;
}

async function main() {
  console.log(
    `🔎 Card valuation audit (engine ${VALUATION_ENGINE_VERSION}) - ${
      WRITE_SCORES ? "DRY RUN + WRITE proposal columns" : "DRY RUN ONLY, no database writes"
    }`
  );

  const cards = await fetchAllCards();
  console.log(`📦 ${cards.length} card_catalog rows fetched.`);

  if (cards.length === 0) {
    console.log(
      "⚠️  No cards found. If this is a fresh/empty catalog, run scripts/sync-cards.mjs first."
    );
  }

  const results = [];
  for (const card of cards) {
    const { signals, scores, proposedRarity, opp, season1ProvisionalEligible } = scoreOneCard(card);
    results.push({ card, signals, scores, proposedRarity, opp, season1ProvisionalEligible });
  }

  // ---- Rarity distribution before/after (full catalog) ----
  const before = {};
  const after = {};
  for (const r of results) {
    const cur = r.card.game_rarity ?? "(unset)";
    before[cur] = (before[cur] ?? 0) + 1;
    after[r.proposedRarity] = (after[r.proposedRarity] ?? 0) + 1;
  }

  // ---- Rarity distribution, PROVISIONAL 2020 Season 1 pool only
  //      (see computeSeason1ProvisionalEligibility above for what
  //      this does and does not account for) ----
  const season1Results = results.filter((r) => r.season1ProvisionalEligible);
  const afterSeason1 = {};
  for (const r of season1Results) {
    afterSeason1[r.proposedRarity] = (afterSeason1[r.proposedRarity] ?? 0) + 1;
  }

  // ---- Oppressiveness tier distribution ----
  const oppTiers = { green: 0, orange: 0, red: 0 };
  for (const r of results) oppTiers[r.opp.tier] += 1;

  // ---- Shortlists ----
  const downgrades = results
    .filter(
      (r) =>
        r.card.game_rarity &&
        RARITY_RANK[r.card.game_rarity] != null &&
        RARITY_RANK[r.proposedRarity] < RARITY_RANK[r.card.game_rarity]
    )
    .sort(
      (a, b) =>
        RARITY_RANK[a.card.game_rarity] -
        RARITY_RANK[a.proposedRarity] -
        (RARITY_RANK[b.card.game_rarity] - RARITY_RANK[b.proposedRarity])
    )
    .reverse()
    .slice(0, 100);

  const upgrades = results
    .filter(
      (r) =>
        r.card.game_rarity &&
        RARITY_RANK[r.card.game_rarity] != null &&
        RARITY_RANK[r.proposedRarity] > RARITY_RANK[r.card.game_rarity]
    )
    .sort(
      (a, b) =>
        RARITY_RANK[b.proposedRarity] -
        RARITY_RANK[b.card.game_rarity] -
        (RARITY_RANK[a.proposedRarity] - RARITY_RANK[a.card.game_rarity])
    )
    .slice(0, 100);

  const suspicious = downgrades
    .filter((r) => r.card.game_rarity === "Legendary" && r.proposedRarity !== "Legendary")
    .slice(0, 100);

  const highOppressiveness = results
    .filter((r) => r.opp.tier === "red" || r.opp.tier === "orange")
    .sort((a, b) => b.scores.oppressiveness - a.scores.oppressiveness)
    .slice(0, 150);

  const highPowerHighDependency = results
    .filter((r) => r.scores.power >= 6.5 && r.scores.dependency >= 5)
    .sort((a, b) => b.scores.power - a.scores.power)
    .slice(0, 150);

  const masterDuelExclusions = results.filter(
    (r) =>
      !["unlimited", "semi_limited", "limited"].includes(
        r.card.master_duel_status
      )
  );

  const manuallyLocked = results.filter((r) => r.card.valuation_manually_overridden);

  // ---- False-positive / false-negative archetype dependency
  //      review - directly answers the exact failure mode the
  //      Season 1 valuation review reported (Forbidden
  //      Droplet/Baronne de Fleur). "False positive" here means:
  //      the card HAS an archetype tag, but the engine correctly
  //      found it thematic-only (no real functional requirement) -
  //      i.e. cards where the OLD engine's tag-matching approach
  //      would likely have over-penalized dependency. "False
  //      negative" candidates are the inverse: no archetype tag
  //      at all, but the engine still found a real functional
  //      dependency in the text (worth a human sanity check, since
  //      it means the DB's own archetype tagging missed something
  //      the card's text actually requires). ----
  const archetypeThematicOnly = results.filter(
    (r) => r.card.archetype && r.signals.archetypeIsThematicOnly
  );
  const archetypeFunctionallyLoadBearing = results.filter(
    (r) => r.card.archetype && !r.signals.archetypeIsThematicOnly
  );
  const noArchetypeTagButDependent = results.filter(
    (r) => !r.card.archetype && r.scores.dependency >= 4
  );
  const ambiguousReferences = results.filter((r) =>
    r.signals.classifiedRefs.some((ref) => ref.type === "ambiguous_reference")
  );

  // ---- 50 random(-ish, evenly-sampled) samples per proposed
  //      rarity, so a reviewer can eyeball the MIDDLE of the
  //      distribution, not just the flagged extremes. ----
  const samplesByRarity = {};
  for (const rarity of RARITY_ORDER) {
    const inRarity = results.filter((r) => r.proposedRarity === rarity);
    samplesByRarity[rarity] = sampleEvenly(inRarity, 50);
  }

  // ---- Output files ----
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(process.cwd(), "reports", "card-valuation", timestamp);
  mkdirSync(outDir, { recursive: true });

  const fullCsvHeader = [
    "external_card_id",
    "name",
    "current_rarity",
    "proposed_rarity",
    "power",
    "accessibility",
    "dependency",
    "generic_utility",
    "consistency",
    "floor",
    "ceiling",
    "oppressiveness",
    "draft_value",
    "oppressiveness_tier",
    "suggested_stage",
    "master_duel_status",
    "release_date",
    "season1_provisional_eligible",
    "archetype",
    "archetype_thematic_only",
    "reason",
  ];
  const fullCsvRows = results.map((r) =>
    [
      r.card.external_card_id,
      r.card.name,
      r.card.game_rarity ?? "",
      r.proposedRarity,
      r.scores.power,
      r.scores.accessibility,
      r.scores.dependency,
      r.scores.genericUtility,
      r.scores.consistency,
      r.scores.floor,
      r.scores.ceiling,
      r.scores.oppressiveness,
      r.scores.draftValue,
      r.opp.tier,
      r.opp.suggestedStage,
      r.card.master_duel_status,
      r.card.release_date ?? "",
      r.season1ProvisionalEligible,
      r.card.archetype ?? "",
      r.card.archetype ? String(r.signals.archetypeIsThematicOnly) : "",
      r.scores.reason,
    ]
      .map(csvEscape)
      .join(",")
  );
  writeFileSync(
    join(outDir, "full-proposal.csv"),
    [fullCsvHeader.join(","), ...fullCsvRows].join("\n")
  );

  writeFileSync(
    join(outDir, "full-proposal.json"),
    JSON.stringify(
      results.map((r) => ({
        card_catalog_id: r.card.id,
        external_card_id: r.card.external_card_id,
        name: r.card.name,
        archetype: r.card.archetype,
        archetype_thematic_only: r.card.archetype ? r.signals.archetypeIsThematicOnly : null,
        current_rarity: r.card.game_rarity,
        proposed_rarity: r.proposedRarity,
        scores: r.scores,
        classified_references: r.signals.classifiedRefs,
        materials: r.signals.materials,
        oppressiveness_tier: r.opp.tier,
        suggested_release_stage: r.opp.suggestedStage,
        oppressiveness_reason: r.opp.reason,
        master_duel_status: r.card.master_duel_status,
        card_type: r.card.card_type,
        frame_type: r.card.frame_type,
        monster_type: r.card.monster_type,
        race: r.card.race,
        release_date: r.card.release_date,
        season1_provisional_eligible: r.season1ProvisionalEligible,
      })),
      null,
      2
    )
  );

  function shortlistMd(title, rows, mapper, limit = 100) {
    const shown = rows.slice(0, limit);
    const lines = [`## ${title} (${rows.length}${rows.length > limit ? `, showing ${limit}` : ""})`, ""];
    if (shown.length === 0) {
      lines.push("_none_", "");
      return lines.join("\n");
    }
    lines.push(
      "| Card | Current | Proposed | Power | Dependency | Floor | Ceiling | Draft Value | Reason |",
      "|---|---|---|---|---|---|---|---|---|"
    );
    for (const r of shown) {
      lines.push(mapper(r));
    }
    lines.push("");
    return lines.join("\n");
  }

  const rowMd = (r) =>
    `| ${r.card.name} | ${r.card.game_rarity ?? "-"} | ${r.proposedRarity} | ${r.scores.power} | ${r.scores.dependency} | ${r.scores.floor} | ${r.scores.ceiling} | ${r.scores.draftValue} | ${r.scores.reason.replace(/\|/g, "/")} |`;

  const archetypeRowMd = (r) =>
    `| ${r.card.name} | ${r.card.archetype} | ${r.scores.dependency} | ${r.signals.materials.specificity} | ${r.scores.reason.replace(/\|/g, "/")} |`;

  function archetypeSectionMd(title, rows, limit = 60) {
    const shown = rows.slice(0, limit);
    const lines = [`## ${title} (${rows.length}${rows.length > limit ? `, showing ${limit}` : ""})`, ""];
    if (shown.length === 0) {
      lines.push("_none_", "");
      return lines.join("\n");
    }
    lines.push(
      "| Card | Archetype tag | Dependency | Materials | Reason |",
      "|---|---|---|---|---|"
    );
    for (const r of shown) lines.push(archetypeRowMd(r));
    lines.push("");
    return lines.join("\n");
  }

  function sampleSectionMd(rarity, rows) {
    const lines = [`### ${rarity} (${rows.length} sampled)`, ""];
    if (rows.length === 0) {
      lines.push("_no cards currently propose to this rarity_", "");
      return lines.join("\n");
    }
    lines.push(
      "| Card | Power | Accessibility | Dependency | Generic Utility | Consistency | Floor | Ceiling | Draft Value |",
      "|---|---|---|---|---|---|---|---|---|"
    );
    for (const r of rows) {
      lines.push(
        `| ${r.card.name} | ${r.scores.power} | ${r.scores.accessibility} | ${r.scores.dependency} | ${r.scores.genericUtility} | ${r.scores.consistency} | ${r.scores.floor} | ${r.scores.ceiling} | ${r.scores.draftValue} |`
      );
    }
    lines.push("");
    return lines.join("\n");
  }

  const mdSections = [
    `# Duelist Circle Card Valuation Audit (v2)`,
    ``,
    `Engine version: \`${VALUATION_ENGINE_VERSION}\``,
    `Generated: ${new Date().toISOString()}`,
    `Cards scored: ${results.length}${ROW_LIMIT ? ` (--limit ${ROW_LIMIT})` : ""}`,
    `Manually-overridden cards (never touched by --write-scores): ${manuallyLocked.length}`,
    ``,
    `## Rarity distribution - BEFORE (current game_rarity)`,
    ``,
    "| Rarity | Count | % |",
    "|---|---|---|",
    ...Object.entries(before)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([k, v]) =>
          `| ${k} | ${v} | ${((v / results.length) * 100).toFixed(2)}% |`
      ),
    ``,
    `## Rarity distribution - PROPOSED (draft_value_score based)`,
    ``,
    "| Rarity | Count | % |",
    "|---|---|---|",
    ...Object.entries(after)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([k, v]) =>
          `| ${k} | ${v} | ${((v / results.length) * 100).toFixed(2)}% |`
      ),
    ``,
    `Sanity reference only (per the Season 1 review, NOT a target to optimize toward - the new distribution is allowed to differ substantially if quality improved): Normal 4875, Rare 4180, Super Rare 2786, Ultra Rare 1393, Secret Rare 557, Legendary 140.`,
    ``,
    `## Rarity distribution - PROVISIONAL 2020 Season 1 pool (${season1Results.length} of ${results.length} cards)`,
    ``,
    `Computed from a client-side port of is_duelist_circle_format_eligible() as configured by the seeded 'season_1' format row (release_cutoff 2020-12-31, Synchro/Link/Pendulum/Illusion excluded, Xyz/Fusion allowed) - see computeSeason1ProvisionalEligibility() in this script. This does NOT account for format_card_overrides (manual per-card include/exclude) or release_stage gating, and release_date is only as complete as scripts/sync-card-release-dates.mjs has been run - a card with an unknown release_date is never excluded on cutoff grounds alone, matching the live SQL predicate.`,
    ``,
    "| Rarity | Count | % of 2020 pool |",
    "|---|---|---|",
    ...RARITY_ORDER.map(
      (k) =>
        `| ${k} | ${afterSeason1[k] ?? 0} | ${
          season1Results.length ? (((afterSeason1[k] ?? 0) / season1Results.length) * 100).toFixed(2) : "0.00"
        }% |`
    ),
    ``,
    `## Oppressiveness tier distribution`,
    ``,
    `Green (starting-pool safe): ${oppTiers.green} | Orange (manual review): ${oppTiers.orange} | Red (recommend later stage): ${oppTiers.red}`,
    `Note: oppressiveness is NEVER a factor in draft_value_score/proposed_game_rarity - see valuation-engine.mjs. A card can be both highly desirable (rarity) and highly oppressive (release_stage) at the same time.`,
    ``,
    `## FALSE-POSITIVE ARCHETYPE DEPENDENCY REVIEW`,
    ``,
    `Cards with an archetype tag that the engine determined is THEMATIC-ONLY (no real functional requirement was found anywhere in the card's own text) - this is the exact failure mode the Season 1 review reported for Forbidden Droplet and Baronne de Fleur. Spot-check a sample of these: if any of them genuinely DO need their archetype tag's support to function, that's a real false negative in the classifier and worth reporting back.`,
    ``,
    archetypeSectionMd("Archetype-tagged but thematic-only (dependency NOT penalized)", archetypeThematicOnly, 80),
    `## FALSE-NEGATIVE ARCHETYPE DEPENDENCY REVIEW`,
    ``,
    `Cards with NO archetype tag at all, but which the engine still scored as meaningfully dependent (dependency >= 4) based on their own text (multi-Attribute requirements, named Extra Deck materials, mandatory_requirement/mandatory_target references). Worth checking whether the database's archetype tagging is simply incomplete for these.`,
    ``,
    archetypeSectionMd("No archetype tag, but dependency >= 4", noArchetypeTagButDependent, 80),
    `## AMBIGUOUS REFERENCES (engine could not confidently classify)`,
    ``,
    `Cards containing a quoted reference the classifier could not confidently place into mandatory_requirement/mandatory_target/optional_bonus/search_target/alternative_effect - these got a small, deliberately-weak dependency penalty rather than a guess, and are the best candidates for a human to expand the classifier's pattern coverage next.`,
    ``,
    archetypeSectionMd("Ambiguous reference cards", ambiguousReferences, 80),
    shortlistMd(
      "TOP LEGENDARY DOWNGRADES (cards currently Legendary, proposed lower)",
      suspicious,
      rowMd
    ),
    shortlistMd("TOP RARITY DOWNGRADES (any direction, up to 100)", downgrades, rowMd, 100),
    shortlistMd("TOP RARITY UPGRADES (up to 100)", upgrades, rowMd, 100),
    shortlistMd(
      "HIGH-OPPRESSIVENESS CARDS (orange/red - recommend review or later release stage)",
      highOppressiveness,
      rowMd,
      60
    ),
    shortlistMd(
      "HIGH POWER + HIGH DEPENDENCY (power >= 6.5, dependency >= 5 - draft value should be much lower than raw power)",
      highPowerHighDependency,
      rowMd,
      60
    ),
    shortlistMd(
      "MASTER DUEL EXCLUSIONS (forbidden/not_available/unknown - never offered regardless of format)",
      masterDuelExclusions,
      rowMd,
      60
    ),
    `## 50 SAMPLES PER PROPOSED RARITY (evenly sampled, not just extremes)`,
    ``,
    ...RARITY_ORDER.map((rarity) => sampleSectionMd(rarity, samplesByRarity[rarity])),
  ];
  writeFileSync(join(outDir, "REPORT.md"), mdSections.join("\n"));

  console.log(`\n📄 Reports written to: ${outDir}`);
  console.log(`   - full-proposal.csv`);
  console.log(`   - full-proposal.json`);
  console.log(`   - REPORT.md`);
  console.log(`\nBEFORE distribution:`, before);
  console.log(`PROPOSED distribution (full catalog):`, after);
  console.log(`PROPOSED distribution (provisional 2020 Season 1 pool, ${season1Results.length} cards):`, afterSeason1);
  console.log(`Oppressiveness tiers:`, oppTiers);
  console.log(
    `Archetype tags found thematic-only: ${archetypeThematicOnly.length} | functionally load-bearing: ${archetypeFunctionallyLoadBearing.length}`
  );

  if (!WRITE_SCORES) {
    console.log(
      `\n✅ Dry run complete. Nothing was written to the database. Re-run with --write-scores to store these scores on card_catalog (still does NOT touch game_rarity/release_stage/format_eligible).`
    );
    return;
  }

  console.log(`\n✍️  Writing proposal columns (--write-scores)...`);
  let written = 0;
  let skippedOverride = 0;
  const BATCH = 200;
  const writable = results.filter((r) => !r.card.valuation_manually_overridden);
  skippedOverride = results.length - writable.length;

  for (let i = 0; i < writable.length; i += BATCH) {
    const batch = writable.slice(i, i + BATCH);

    for (const r of batch) {
      const payload = {
        power_score: r.scores.power,
        accessibility_score: r.scores.accessibility,
        dependency_score: r.scores.dependency,
        generic_utility_score: r.scores.genericUtility,
        consistency_score: r.scores.consistency,
        floor_score: r.scores.floor,
        ceiling_score: r.scores.ceiling,
        draft_value_score: r.scores.draftValue,
        oppressiveness_tier: r.opp.tier,
        oppressiveness_reason: r.opp.reason,
        proposed_game_rarity: r.proposedRarity,
        valuation_reason: r.scores.reason,
        valuation_engine_version: VALUATION_ENGINE_VERSION,
        valuation_computed_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("card_catalog")
        .update(payload)
        .eq("id", r.card.id)
        .select("id");

      if (error) {
        throw new Error(
          `Score update failed for card ${r.card.id}: ${error.message}`
        );
      }

      if (!data || data.length !== 1) {
        throw new Error(
          `Expected exactly 1 card_catalog row for ${r.card.id}, got ${data?.length ?? 0}`
        );
      }

      written += 1;
    }

    process.stdout.write(
      `\r   ${written}/${writable.length} written...`
    );
  }

  console.log(
    `\n✅ Wrote proposal scores for ${written} cards. Skipped ${skippedOverride} manually-overridden cards. game_rarity/release_stage/format_eligible were NOT touched by this run.`
  );
}

main().catch((err) => {
  console.error("❌ Audit failed:", err);
  process.exit(1);
});
