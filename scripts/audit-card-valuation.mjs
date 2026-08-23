// =========================================================
// AUDIT CARD VALUATION - Season 1 rarity/valuation proposal
//
// PROPOSAL / AUDIT ONLY BY DEFAULT. Running this script with no
// flags NEVER writes to the database - it only reads card_catalog
// and produces review reports (CSV + JSON + Markdown) under
// reports/card-valuation/<timestamp>/.
//
// Only with --write-scores does it write anything back, and even
// then it writes ONLY to the new proposal columns added by
// 202608231500_duelist_circle_format_engine.sql (power_score,
// usability_score, versatility_score, dependency_score,
// consistency_score, oppressiveness_score is not a column - see
// note below -, oppressiveness_tier, oppressiveness_reason,
// draft_value_score, proposed_game_rarity, valuation_reason,
// valuation_engine_version, valuation_computed_at). It NEVER
// writes to game_rarity, release_stage, or format_eligible - those
// are separate, even more deliberate operator actions, documented
// in the Season 1 runbook, never bundled into this script.
//
// A card with valuation_manually_overridden = true is always
// skipped entirely (scored for the report so you can still see
// what the engine WOULD have said, but never written), mirroring
// the existing rarity_manually_overridden protection in
// scripts/classify-rarities.mjs.
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
  draftValueToRarity,
  recommendOppressiveness,
  VALUATION_ENGINE_VERSION,
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
  "id, external_card_id, name, card_type, frame_type, monster_type, race, attribute, level, rank, link_rating, atk, def, description, archetype, game_rarity, master_duel_status, valuation_manually_overridden";

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
  const proposedRarity = draftValueToRarity(scores.draftValue);
  const opp = recommendOppressiveness(
    scores.oppressiveness,
    scores.power,
    scores.dependency
  );
  return { signals, scores, proposedRarity, opp };
}

function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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
    const { signals, scores, proposedRarity, opp } = scoreOneCard(card);
    results.push({ card, signals, scores, proposedRarity, opp });
  }

  // ---- Rarity distribution before/after ----
  const before = {};
  const after = {};
  for (const r of results) {
    const cur = r.card.game_rarity ?? "(unset)";
    before[cur] = (before[cur] ?? 0) + 1;
    after[r.proposedRarity] = (after[r.proposedRarity] ?? 0) + 1;
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
    "usability",
    "versatility",
    "dependency",
    "consistency",
    "oppressiveness",
    "draft_value",
    "oppressiveness_tier",
    "suggested_stage",
    "master_duel_status",
    "reason",
  ];
  const fullCsvRows = results.map((r) =>
    [
      r.card.external_card_id,
      r.card.name,
      r.card.game_rarity ?? "",
      r.proposedRarity,
      r.scores.power,
      r.scores.usability,
      r.scores.versatility,
      r.scores.dependency,
      r.scores.consistency,
      r.scores.oppressiveness,
      r.scores.draftValue,
      r.opp.tier,
      r.opp.suggestedStage,
      r.card.master_duel_status,
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
        current_rarity: r.card.game_rarity,
        proposed_rarity: r.proposedRarity,
        scores: r.scores,
        oppressiveness_tier: r.opp.tier,
        suggested_release_stage: r.opp.suggestedStage,
        oppressiveness_reason: r.opp.reason,
        master_duel_status: r.card.master_duel_status,
      })),
      null,
      2
    )
  );

  function shortlistMd(title, rows, mapper) {
    const lines = [`## ${title} (${rows.length})`, ""];
    if (rows.length === 0) {
      lines.push("_none_", "");
      return lines.join("\n");
    }
    lines.push(
      "| Card | Current | Proposed | Power | Dependency | Draft Value | Reason |",
      "|---|---|---|---|---|---|---|"
    );
    for (const r of rows) {
      lines.push(mapper(r));
    }
    lines.push("");
    return lines.join("\n");
  }

  const rowMd = (r) =>
    `| ${r.card.name} | ${r.card.game_rarity ?? "-"} | ${r.proposedRarity} | ${r.scores.power} | ${r.scores.dependency} | ${r.scores.draftValue} | ${r.scores.reason.replace(/\|/g, "/")} |`;

  const mdSections = [
    `# Duelist Circle Card Valuation Audit`,
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
    `## Oppressiveness tier distribution`,
    ``,
    `Green (starting-pool safe): ${oppTiers.green} | Orange (manual review): ${oppTiers.orange} | Red (recommend later stage): ${oppTiers.red}`,
    ``,
    shortlistMd(
      "TOP LEGENDARY DOWNGRADES (cards currently Legendary, proposed lower)",
      suspicious,
      rowMd
    ),
    shortlistMd("TOP RARITY DOWNGRADES (any direction)", downgrades.slice(0, 60), rowMd),
    shortlistMd("TOP RARITY UPGRADES", upgrades.slice(0, 60), rowMd),
    shortlistMd(
      "HIGH-OPPRESSIVENESS CARDS (orange/red - recommend review or later release stage)",
      highOppressiveness.slice(0, 60),
      rowMd
    ),
    shortlistMd(
      "HIGH POWER + HIGH DEPENDENCY (power >= 6.5, dependency >= 5 - draft value should be much lower than raw power)",
      highPowerHighDependency.slice(0, 60),
      rowMd
    ),
    shortlistMd(
      "MASTER DUEL EXCLUSIONS (forbidden/not_available/unknown - never offered regardless of format)",
      masterDuelExclusions.slice(0, 60),
      rowMd
    ),
  ];
  writeFileSync(join(outDir, "REPORT.md"), mdSections.join("\n"));

  console.log(`\n📄 Reports written to: ${outDir}`);
  console.log(`   - full-proposal.csv`);
  console.log(`   - full-proposal.json`);
  console.log(`   - REPORT.md`);
  console.log(`\nBEFORE distribution:`, before);
  console.log(`PROPOSED distribution:`, after);
  console.log(`Oppressiveness tiers:`, oppTiers);

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
    const batch = writable.slice(i, i + BATCH).map((r) => ({
      id: r.card.id,
      power_score: r.scores.power,
      usability_score: r.scores.usability,
      versatility_score: r.scores.versatility,
      dependency_score: r.scores.dependency,
      consistency_score: r.scores.consistency,
      draft_value_score: r.scores.draftValue,
      oppressiveness_tier: r.opp.tier,
      oppressiveness_reason: r.opp.reason,
      proposed_game_rarity: r.proposedRarity,
      valuation_reason: r.scores.reason,
      valuation_engine_version: VALUATION_ENGINE_VERSION,
      valuation_computed_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("card_catalog").upsert(batch, {
      onConflict: "id",
    });

    if (error) {
      console.error(`❌ Batch write failed at offset ${i}: ${error.message}`);
      process.exit(1);
    }
    written += batch.length;
    process.stdout.write(`\r   ${written}/${writable.length} written...`);
  }

  console.log(
    `\n✅ Wrote proposal scores for ${written} cards. Skipped ${skippedOverride} manually-overridden cards. game_rarity/release_stage/format_eligible were NOT touched by this run.`
  );
}

main().catch((err) => {
  console.error("❌ Audit failed:", err);
  process.exit(1);
});
