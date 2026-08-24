// =========================================================
// COMPUTE SYNERGY GRAPH - precomputes card_mechanics +
// card_synergy_edges from lib/synergy-engine.mjs
//
// DRY RUN BY DEFAULT, mirrors scripts/audit-card-valuation.mjs's
// safety pattern exactly: running this with no flags NEVER writes to
// the database - it only reads card_catalog and prints/writes a
// report under reports/synergy-graph/<timestamp>/. Only --write
// actually upserts card_mechanics/card_synergy_edges and appends a
// card_synergy_engine_runs audit row. Nothing here ever touches
// card_catalog itself, game_rarity, format tables, or player data -
// see the migration header (202608241000_card_synergy_graph.sql) for
// the full list of tables this script is and is not allowed to write.
//
// PERFORMANCE - WHY THIS IS NOT A NAIVE O(n^2) DOUBLE LOOP
// A brute-force "check every card against every other card" over
// ~14k rows is ~98,000,000 unordered pairs - far too slow to be a
// reasonable script even as a one-time precompute, and would also
// bury the real, structural relationships in noise. Instead this
// script computes each card's mechanic profile ONCE (O(n)), then
// builds small indices (by exact name, by archetype, by mechanic-tag
// bucket, by monster Attribute/Type) and only evaluates pairs that
// an index lookup says COULD possibly relate:
//   - searches / material_supply_named / requirement_satisfies: O(1)
//     average-case name lookup per named reference, never a scan.
//   - material_supply_constrained: only checked against the bucket of
//     monsters matching the required Attribute/Type/Tuner, not the
//     whole catalog.
//   - gy_setup_for / discard_payoff_for / banish_payoff_for: only
//     the (setup-bucket x payoff-bucket) cross product, each bucket
//     typically a small fraction of the full catalog.
//   - spell_trap_support: only the (archetype -> card ids) index
//     lookup for the specific archetype a Spell/Trap's own text
//     names, never every card sharing that archetype "just because".
// This is the literal implementation of "precompute intelligence
// once, query cheaply many times" applied to the PRECOMPUTE step
// itself, not just to the request-time read path.
//
// Usage:
//   node scripts/compute-synergy-graph.mjs                (dry run, writes reports/ only)
//   node scripts/compute-synergy-graph.mjs --write         (also upserts card_mechanics + card_synergy_edges)
//   node scripts/compute-synergy-graph.mjs --limit 500     (score only the first 500 rows, for a fast smoke test)
//
// HONESTY NOTE: this sandbox has no network access to the real
// Supabase project, so this script has been syntax-checked and unit-
// tested against synthetic fixtures (lib/synergy-engine.regression.
// test.mjs) but has NOT been run against the real ~14k-row
// card_catalog table. Running it for real, reviewing reports/synergy-
// graph/<timestamp>/REPORT.md, and then re-running with --write is a
// deliberate, disclosed next step for the user, exactly as with
// scripts/audit-card-valuation.mjs before it.
// =========================================================

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  computeCardMechanics,
  computeSynergyEdges,
  SYNERGY_ENGINE_VERSION,
} from "../lib/synergy-engine.mjs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const limitArgIndex = args.indexOf("--limit");
const ROW_LIMIT = limitArgIndex >= 0 ? parseInt(args[limitArgIndex + 1], 10) : null;

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
  "id, name, card_type, frame_type, monster_type, race, attribute, level, rank, link_rating, atk, def, description, archetype";

async function fetchAllCards() {
  const pageSize = 1000;
  let from = 0;
  const rows = [];

  while (true) {
    const to = ROW_LIMIT ? Math.min(from + pageSize - 1, ROW_LIMIT - 1) : from + pageSize - 1;

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

function isMonster(card) {
  return Boolean(card.card_type && card.card_type.toLowerCase().includes("monster"));
}

async function main() {
  console.log(
    `🔗 Synergy graph precompute (engine ${SYNERGY_ENGINE_VERSION}) - ${
      WRITE ? "WRITE MODE (card_mechanics + card_synergy_edges will be upserted)" : "DRY RUN ONLY, no database writes"
    }`
  );

  const startedAt = new Date().toISOString();
  const cards = await fetchAllCards();
  console.log(`📦 ${cards.length} card_catalog rows fetched.`);

  if (cards.length === 0) {
    console.log("⚠️  No cards found. Run scripts/sync-cards.mjs first.");
    return;
  }

  // ---- Pass 1: compute every card's mechanic profile once ----
  const mechByCardId = new Map();
  for (const card of cards) {
    mechByCardId.set(card.id, computeCardMechanics(card));
  }
  console.log(`🧮 Computed mechanic profiles for ${mechByCardId.size} cards.`);

  // ---- Indices, built once, each an O(n) pass over the already-
  // computed profiles - never a nested scan. ----
  const byExactName = new Map(); // lowercase name -> card
  const byArchetype = new Map(); // lowercase archetype -> card[]
  const monstersByAttribute = new Map(); // lowercase attribute -> card[]
  const monstersByType = new Map(); // lowercase monster_type -> card[]
  const bucket = {
    gySetup: [],
    gyPayoff: [],
    discardOutlet: [],
    banishSetup: [],
    banishPayoff: [],
    extraDeckWithMaterial: [], // { card, mech } where mech.materialSpecificity is 'named' or 'constrained'
    spellsTraps: [],
  };

  for (const card of cards) {
    const mech = mechByCardId.get(card.id);
    byExactName.set(card.name.trim().toLowerCase(), card);

    if (card.archetype) {
      const key = card.archetype.trim().toLowerCase();
      if (!byArchetype.has(key)) byArchetype.set(key, []);
      byArchetype.get(key).push(card);
    }

    if (isMonster(card) && !mech.evidence.isExtraDeckCard) {
      if (card.attribute) {
        const key = card.attribute.trim().toLowerCase();
        if (!monstersByAttribute.has(key)) monstersByAttribute.set(key, []);
        monstersByAttribute.get(key).push(card);
      }
      if (card.monster_type) {
        const key = card.monster_type.trim().toLowerCase();
        if (!monstersByType.has(key)) monstersByType.set(key, []);
        monstersByType.get(key).push(card);
      }
    }

    if (mech.tags.includes("gy_setup")) bucket.gySetup.push(card);
    if (mech.tags.includes("gy_payoff")) bucket.gyPayoff.push(card);
    if (mech.tags.includes("discard_outlet")) bucket.discardOutlet.push(card);
    if (mech.tags.includes("banish_setup")) bucket.banishSetup.push(card);
    if (mech.tags.includes("banish_payoff")) bucket.banishPayoff.push(card);
    if (mech.materialSpecificity === "named" || mech.materialSpecificity === "constrained") {
      bucket.extraDeckWithMaterial.push(card);
    }
    if (!isMonster(card)) bucket.spellsTraps.push(card);
  }

  console.log(
    `📇 Indices built: ${byExactName.size} unique names, ${byArchetype.size} archetypes, ` +
      `gySetup=${bucket.gySetup.length} gyPayoff=${bucket.gyPayoff.length} ` +
      `discardOutlet=${bucket.discardOutlet.length} banishSetup=${bucket.banishSetup.length} ` +
      `banishPayoff=${bucket.banishPayoff.length} extraDeckWithMaterial=${bucket.extraDeckWithMaterial.length}`
  );

  // ---- Pass 2: generate edges using the indices above. A Map keyed
  // by "sourceId|targetId|edgeType" dedupes cleanly, since several
  // index paths can rediscover the same real relation from either
  // side (computeSynergyEdges itself checks both directions per
  // call). ----
  const edgeMap = new Map();
  const addEdges = (edges) => {
    for (const e of edges) {
      edgeMap.set(`${e.sourceCardId}|${e.targetCardId}|${e.edgeType}`, e);
    }
  };

  const cardById = new Map(cards.map((c) => [c.id, c]));

  // A) Named references (searches / material_supply_named /
  // requirement_satisfies) - O(1) average lookup per named target,
  // not a scan.
  for (const card of cards) {
    const mech = mechByCardId.get(card.id);

    for (const targetName of mech.searchTargets) {
      const target = byExactName.get(targetName);
      if (target && target.id !== card.id) {
        addEdges(computeSynergyEdges(card, mech, target, mechByCardId.get(target.id)));
      }
    }
    for (const targetName of mech.namedMaterialTargets) {
      const target = byExactName.get(targetName);
      if (target && target.id !== card.id) {
        addEdges(computeSynergyEdges(card, mech, target, mechByCardId.get(target.id)));
      }
    }
    for (const targetName of mech.namedRequirementTargets) {
      const target = byExactName.get(targetName);
      if (target && target.id !== card.id) {
        addEdges(computeSynergyEdges(card, mech, target, mechByCardId.get(target.id)));
      }
    }
  }

  // B) Constrained Extra Deck materials - only against the bucket of
  // monsters matching the specific Attribute/Type named in the
  // material text, not the full catalog.
  for (const edCard of bucket.extraDeckWithMaterial) {
    const edMech = mechByCardId.get(edCard.id);
    if (edMech.materialSpecificity !== "constrained") continue;

    const text = (edMech.materialText ?? "").toLowerCase();
    const candidateSet = new Map();
    for (const [attr, list] of monstersByAttribute) {
      if (text.includes(attr)) for (const c of list) candidateSet.set(c.id, c);
    }
    for (const [type, list] of monstersByType) {
      if (text.includes(type)) for (const c of list) candidateSet.set(c.id, c);
    }

    for (const candidate of candidateSet.values()) {
      if (candidate.id === edCard.id) continue;
      addEdges(
        computeSynergyEdges(edCard, edMech, candidate, mechByCardId.get(candidate.id))
      );
    }
  }

  // C) Directional tag-pair edges - bounded cross products of small
  // buckets, never the full catalog.
  const crossProduct = (listA, listB) => {
    for (const a of listA) {
      for (const b of listB) {
        if (a.id === b.id) continue;
        addEdges(computeSynergyEdges(a, mechByCardId.get(a.id), b, mechByCardId.get(b.id)));
      }
    }
  };
  crossProduct(bucket.gySetup, bucket.gyPayoff);
  crossProduct(bucket.discardOutlet, bucket.gyPayoff);
  crossProduct(bucket.banishSetup, bucket.banishPayoff);

  // D) spell_trap_support - only against the specific archetype a
  // Spell/Trap's own text functionally names, via the archetype
  // index, never a scan of every card sharing that archetype tag.
  for (const stCard of bucket.spellsTraps) {
    const stMech = mechByCardId.get(stCard.id);
    for (const ref of stMech.evidence.classifiedRefs ?? []) {
      if (
        !["mandatory_requirement", "mandatory_target", "optional_bonus", "search_target"].includes(
          ref.type
        )
      ) {
        continue;
      }
      const candidates = byArchetype.get(ref.term.trim().toLowerCase());
      if (!candidates) continue;
      for (const candidate of candidates) {
        if (candidate.id === stCard.id) continue;
        addEdges(
          computeSynergyEdges(stCard, stMech, candidate, mechByCardId.get(candidate.id))
        );
      }
    }
  }

  const edges = Array.from(edgeMap.values());
  console.log(`🔗 ${edges.length} deduplicated typed edges generated.`);

  const edgeTypeCounts = {};
  const confidenceCounts = { high: 0, medium: 0, low: 0 };
  for (const e of edges) {
    edgeTypeCounts[e.edgeType] = (edgeTypeCounts[e.edgeType] ?? 0) + 1;
    confidenceCounts[e.confidence] = (confidenceCounts[e.confidence] ?? 0) + 1;
  }

  const tagCounts = {};
  for (const mech of mechByCardId.values()) {
    for (const tag of mech.tags) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
  }

  // ---- Report ----
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(process.cwd(), "reports", "synergy-graph", timestamp);
  mkdirSync(outDir, { recursive: true });

  const mdLines = [
    `# Synergy Graph Precompute Report`,
    ``,
    `Engine version: \`${SYNERGY_ENGINE_VERSION}\``,
    `Generated: ${new Date().toISOString()}`,
    `Cards processed: ${cards.length}${ROW_LIMIT ? ` (--limit ${ROW_LIMIT})` : ""}`,
    `Edges generated: ${edges.length}`,
    ``,
    `## Edge type distribution`,
    ``,
    "| Edge type | Count |",
    "|---|---|",
    ...Object.entries(edgeTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `| ${k} | ${v} |`),
    ``,
    `## Confidence distribution`,
    ``,
    `high=${confidenceCounts.high} medium=${confidenceCounts.medium} low=${confidenceCounts.low}`,
    ``,
    `## Mechanic tag distribution (card_mechanics.tags)`,
    ``,
    "| Tag | Cards |",
    "|---|---|",
    ...Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `| ${k} | ${v} |`),
    ``,
    `## Sample edges (first 60, for spot review)`,
    ``,
    "| Source | Target | Type | Score | Confidence | Reason |",
    "|---|---|---|---|---|---|",
    ...edges.slice(0, 60).map((e) => {
      const src = cardById.get(e.sourceCardId)?.name ?? e.sourceCardId;
      const tgt = cardById.get(e.targetCardId)?.name ?? e.targetCardId;
      return `| ${src} | ${tgt} | ${e.edgeType} | ${e.score} | ${e.confidence} | ${e.deterministicReason.replace(/\|/g, "/")} |`;
    }),
    ``,
  ];
  writeFileSync(join(outDir, "REPORT.md"), mdLines.join("\n"));

  writeFileSync(
    join(outDir, "edges.json"),
    JSON.stringify(edges.slice(0, 5000), null, 2)
  );

  console.log(`\n📄 Report written to: ${outDir}`);
  console.log(`   - REPORT.md`);
  console.log(`   - edges.json (first 5000 edges, full set only upserted with --write)`);
  console.log(`\nEdge type distribution:`, edgeTypeCounts);
  console.log(`Confidence distribution:`, confidenceCounts);

  if (!WRITE) {
    console.log(
      `\n✅ Dry run complete. Nothing was written to the database. Re-run with --write to upsert card_mechanics + card_synergy_edges.`
    );
    return;
  }

  console.log(`\n✍️  Writing card_mechanics (--write)...`);
  const BATCH = 500;
  const mechRows = cards.map((card) => {
    const mech = mechByCardId.get(card.id);
    return {
      card_catalog_id: card.id,
      tags: mech.tags,
      search_targets: mech.searchTargets,
      named_material_targets: mech.namedMaterialTargets,
      named_requirement_targets: mech.namedRequirementTargets,
      material_specificity: mech.materialSpecificity,
      material_text: mech.materialText,
      evidence: mech.evidence,
      engine_version: SYNERGY_ENGINE_VERSION,
      computed_at: new Date().toISOString(),
    };
  });

  let mechWritten = 0;
  for (let i = 0; i < mechRows.length; i += BATCH) {
    const batch = mechRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("card_mechanics")
      .upsert(batch, { onConflict: "card_catalog_id" });
    if (error) {
      console.error(`❌ card_mechanics batch write failed at offset ${i}: ${error.message}`);
      process.exit(1);
    }
    mechWritten += batch.length;
    process.stdout.write(`\r   ${mechWritten}/${mechRows.length} card_mechanics rows written...`);
  }
  console.log(`\n✅ Wrote ${mechWritten} card_mechanics rows.`);

  console.log(`\n✍️  Writing card_synergy_edges (--write)...`);
  const edgeRows = edges.map((e) => ({
    source_card_id: e.sourceCardId,
    target_card_id: e.targetCardId,
    edge_type: e.edgeType,
    score: e.score,
    confidence: e.confidence,
    deterministic_reason: e.deterministicReason,
    evidence: e.evidence,
    engine_version: e.engineVersion,
    computed_at: new Date().toISOString(),
  }));

  let edgeWritten = 0;
  for (let i = 0; i < edgeRows.length; i += BATCH) {
    const batch = edgeRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("card_synergy_edges")
      .upsert(batch, { onConflict: "source_card_id,target_card_id,edge_type" });
    if (error) {
      console.error(`❌ card_synergy_edges batch write failed at offset ${i}: ${error.message}`);
      process.exit(1);
    }
    edgeWritten += batch.length;
    process.stdout.write(`\r   ${edgeWritten}/${edgeRows.length} card_synergy_edges rows written...`);
  }
  console.log(`\n✅ Wrote ${edgeWritten} card_synergy_edges rows.`);

  const { error: runError } = await supabase.from("card_synergy_engine_runs").insert({
    engine_version: SYNERGY_ENGINE_VERSION,
    cards_processed: cards.length,
    edges_generated: edges.length,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    notes: ROW_LIMIT ? `--limit ${ROW_LIMIT}` : null,
  });
  if (runError) {
    console.error(`⚠️  card_synergy_engine_runs audit insert failed (data already written, non-fatal): ${runError.message}`);
  }

  console.log(`\n✅ Synergy graph precompute complete.`);
}

main().catch((err) => {
  console.error("❌ Synergy graph precompute failed:", err);
  process.exit(1);
});
