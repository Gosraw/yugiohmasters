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
// PERFORMANCE - WHY THIS IS NOT A NAIVE O(n^2) DOUBLE LOOP, AND WHY
// IT NO LONGER MATERIALIZES EVERY TAG-PAIR RELATIONSHIP
// (2026-08-25 redesign - see reports/synergy-graph/ for the run that
// preceded this: an earlier version of this script's Pass C ran
// crossProduct() over raw tag buckets - e.g. every "gy_setup" card
// against every "gy_payoff" card - and each bucket can hold well
// over a thousand cards out of ~14k. That is hundreds of thousands
// to low-millions of pairs, and it is exactly what filled the
// database to near-capacity with 1,461,604 rows in
// card_synergy_edges before this redesign. That data has since been
// deleted; this script must never reproduce it.)
//
// The fix is not a smarter cross product, it is to stop persisting
// generic tag-pair relationships catalog-wide at all. What THIS
// script still persists is only the high-value, specific, or
// structurally-bounded categories:
//   - searches / material_supply_named / requirement_satisfies (Pass
//     A): O(1) average-case exact-name lookup per named reference in
//     a card's own text. Sparse by construction - most cards name
//     zero or one specific card.
//   - material_supply_constrained (Pass B): only checked against the
//     bucket of monsters matching the Attribute/Type/Tuner actually
//     named in an Extra Deck card's material text, AND capped at
//     MAX_CANDIDATES_PER_SOURCE - a constraint so broad it matches
//     more than that many monsters (e.g. "any Attribute monster") is
//     judged too generic to be worth materializing and is skipped
//     for persistence (still true and computable, just not stored).
//   - spell_trap_support (Pass C): only the (archetype -> card ids)
//     index lookup for the specific archetype a Spell/Trap's own
//     text names, also capped at MAX_CANDIDATES_PER_SOURCE.
//
// Generic tag-pair relationships - GY setup/payoff, discard
// outlet/payoff, banish setup/payoff - are NOT generated or
// persisted by this script at all anymore. They are real and useful,
// but only when evaluated against a specific, small, contextual
// candidate set (e.g. "this player's owned cards") rather than
// materialized card-catalog-wide. That contextual evaluation lives
// in src/lib/ai/card-synergy-context.ts, calls the exact same
// computeSynergyEdges() from lib/synergy-engine.mjs this script
// uses, and is bounded by the caller's own small candidate list
// (typically tens of cards, never the full catalog) - see that
// file's OWNED_CANDIDATE_SUPPLEMENT comment block.
//
// A hard SAFE_EDGE_CEILING check (below) additionally refuses to
// write anything if the deduplicated edge count ever exceeds a sane
// bound, as defense-in-depth against a future regression here
// reintroducing unbounded growth.
//
// Usage:
//   node scripts/compute-synergy-graph.mjs                (dry run, writes reports/ only)
//   node scripts/compute-synergy-graph.mjs --write         (also upserts card_mechanics + card_synergy_edges)
//   node scripts/compute-synergy-graph.mjs --limit 500     (score only the first 500 rows, for a fast smoke test)
//   node scripts/compute-synergy-graph.mjs --incremental --write
//                                                          (only upsert cards whose card_mechanics row is
//                                                           missing or stamped with an older engine_version -
//                                                           see INCREMENTAL MODE below)
//
// IDEMPOTENCY / RESUMABILITY
// Every write is an upsert keyed on a stable natural key
// (card_mechanics.card_catalog_id; card_synergy_edges' unique
// (source_card_id, target_card_id, edge_type)), so re-running this
// script - including re-running it after it crashed or was killed
// mid-batch - is always safe: already-written rows are simply
// overwritten with the same (or newer-engine-version) values, never
// duplicated. There is no separate "resume" flag needed for a crash
// mid-run: just re-run the same command. --incremental (below) is a
// distinct, additional optimization for the common case of a small
// card_catalog update, not a crash-recovery mechanism.
//
// INCREMENTAL MODE (--incremental)
// A full run recomputes every card's mechanic profile in memory
// regardless (that part is already cheap - O(n) over ~14k rows, not
// the expensive part). What --incremental changes is which rows are
// actually WRITTEN: it first reads the existing
// card_mechanics(card_catalog_id, engine_version) rows (a single
// query, id+version only) and treats a card as "stale" only if it has
// no card_mechanics row yet, or its stored engine_version does not
// match the current SYNERGY_ENGINE_VERSION. Only stale cards' mechanic
// rows are upserted, and only edges touching at least one stale card
// are upserted (an edge between two already-current cards cannot have
// changed, since both endpoints' source text and the engine version
// are unchanged). This keeps a routine "the catalog gained 40 new
// cards" or "the engine got a small fix and its version was bumped"
// re-run cheap and low-write, without ever skipping a card that
// actually needs recomputing. Omit --incremental for a full rebuild
// (e.g. after a synergy-engine.mjs change you want applied to every
// row regardless of version, or the very first population run).
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
const INCREMENTAL = args.includes("--incremental");
const limitArgIndex = args.indexOf("--limit");
const ROW_LIMIT = limitArgIndex >= 0 ? parseInt(args[limitArgIndex + 1], 10) : null;

// A single source card's candidate set (Pass B, Pass C below) is
// only materialized as persisted edges when it is this specific -
// beyond this many candidates, the requirement is judged too generic
// (e.g. "any DARK monster") to be a high-value persisted
// relationship and is skipped for storage (it remains true and can
// still be evaluated on demand, just not written to
// card_synergy_edges).
const MAX_CANDIDATES_PER_SOURCE = 40;

// Defense-in-depth: refuse to write ANYTHING to the database if the
// deduplicated edge count ever exceeds this, no matter how it got
// there. The previous incident reached 1,461,604 rows; this ceiling
// is two orders of magnitude below even a generous "lots of named
// references" estimate for ~14k cards, so tripping it means a real
// regression in the passes above, not normal growth.
const SAFE_EDGE_CEILING = 100_000;

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

/**
 * Single, id+version-only query (never the full mechanics payload) -
 * the one piece of state --incremental needs to decide staleness.
 * Paged the same way fetchAllCards() is, since this table can also
 * grow past 1000 rows.
 */
async function fetchExistingEngineVersions() {
  const pageSize = 1000;
  let from = 0;
  const versionByCardId = new Map();

  while (true) {
    const { data, error } = await supabase
      .from("card_mechanics")
      .select("card_catalog_id, engine_version")
      .order("card_catalog_id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`card_mechanics engine-version fetch failed: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const row of data) versionByCardId.set(row.card_catalog_id, row.engine_version);

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return versionByCardId;
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
  // material text, not the full catalog. Skipped entirely (not
  // persisted) when the candidate set is too broad to count as a
  // specific relationship - see MAX_CANDIDATES_PER_SOURCE.
  let skippedTooGenericB = 0;
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
    candidateSet.delete(edCard.id);

    if (candidateSet.size > MAX_CANDIDATES_PER_SOURCE) {
      skippedTooGenericB += 1;
      continue;
    }

    for (const candidate of candidateSet.values()) {
      addEdges(
        computeSynergyEdges(edCard, edMech, candidate, mechByCardId.get(candidate.id))
      );
    }
  }

  // C) spell_trap_support - only against the specific archetype a
  // Spell/Trap's own text functionally names, via the archetype
  // index, never a scan of every card sharing that archetype tag.
  // Also capped - an archetype bucket bigger than
  // MAX_CANDIDATES_PER_SOURCE is skipped for persistence.
  let skippedTooGenericC = 0;
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
      if (candidates.length > MAX_CANDIDATES_PER_SOURCE) {
        skippedTooGenericC += 1;
        continue;
      }
      for (const candidate of candidates) {
        if (candidate.id === stCard.id) continue;
        addEdges(
          computeSynergyEdges(stCard, stMech, candidate, mechByCardId.get(candidate.id))
        );
      }
    }
  }

  // NOTE: what used to be "Pass C" here - crossProduct(gySetup,
  // gyPayoff), crossProduct(discardOutlet, gyPayoff),
  // crossProduct(banishSetup, banishPayoff) - is INTENTIONALLY GONE.
  // Those bucket-wide cross products are the confirmed root cause of
  // the 1,461,604-row incident (see the file header). GY setup/
  // payoff, discard outlet/payoff, and banish setup/payoff are still
  // fully supported - just evaluated contextually, on demand,
  // against a small candidate set (e.g. a player's owned cards) in
  // src/lib/ai/card-synergy-context.ts, never materialized here.

  const edges = Array.from(edgeMap.values());
  console.log(`🔗 ${edges.length} deduplicated typed edges generated.`);
  if (skippedTooGenericB > 0 || skippedTooGenericC > 0) {
    console.log(
      `⏭️  Skipped persisting ${skippedTooGenericB} constrained-material source(s) and ${skippedTooGenericC} spell/trap-support reference(s) whose candidate set exceeded MAX_CANDIDATES_PER_SOURCE=${MAX_CANDIDATES_PER_SOURCE} (too generic to persist - still computable contextually).`
    );
  }

  if (edges.length > SAFE_EDGE_CEILING) {
    console.error(
      `\n❌ SAFETY CEILING TRIPPED: ${edges.length} deduplicated edges exceeds SAFE_EDGE_CEILING=${SAFE_EDGE_CEILING}.\n` +
        `   This should not happen given Passes A/B/C above - refusing to write anything to the\n` +
        `   database. Investigate which pass produced this many edges (see the per-pass counts\n` +
        `   logged above) before re-running with --write. Nothing has been written.`
    );
    if (WRITE) {
      process.exit(1);
    }
  }

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

  // ---- Incremental staleness check ----
  // Only matters for WHICH rows get upserted below - every card's
  // mechanic profile above was already computed in memory regardless
  // (needed for the edge indices either way), so --incremental never
  // changes the analysis, only the write volume.
  let staleCardIds = null; // null = "everything is stale" (full run)
  if (INCREMENTAL) {
    const existingVersions = await fetchExistingEngineVersions();
    staleCardIds = new Set();
    for (const card of cards) {
      const existing = existingVersions.get(card.id);
      if (!existing || existing !== SYNERGY_ENGINE_VERSION) {
        staleCardIds.add(card.id);
      }
    }
    console.log(
      `\n♻️  Incremental mode: ${staleCardIds.size}/${cards.length} cards are new or stamped with an older engine version - only those (and edges touching them) will be upserted.`
    );
  }

  console.log(`\n✍️  Writing card_mechanics (--write${INCREMENTAL ? " --incremental" : ""})...`);
  const BATCH = 500;
  const cardsToWrite = staleCardIds ? cards.filter((c) => staleCardIds.has(c.id)) : cards;
  const mechRows = cardsToWrite.map((card) => {
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

  if (mechRows.length === 0) {
    console.log(`   Nothing stale - all card_mechanics rows already current for ${SYNERGY_ENGINE_VERSION}.`);
  }

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

  console.log(`\n✍️  Writing card_synergy_edges (--write${INCREMENTAL ? " --incremental" : ""})...`);
  // An edge between two cards that are BOTH already current cannot
  // itself have changed (same engine version, same source text on
  // both sides) - so incremental mode only re-upserts edges that
  // touch at least one stale card, exactly mirroring the mechRows
  // filter above.
  const edgesToWrite = staleCardIds
    ? edges.filter((e) => staleCardIds.has(e.sourceCardId) || staleCardIds.has(e.targetCardId))
    : edges;
  const edgeRows = edgesToWrite.map((e) => ({
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

  if (INCREMENTAL) {
    console.log(`   ${edgeRows.length}/${edges.length} edges touch a stale card and will be upserted.`);
  }

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

  const runNotes = [
    ROW_LIMIT ? `--limit ${ROW_LIMIT}` : null,
    INCREMENTAL
      ? `--incremental (${mechRows.length}/${cards.length} cards, ${edgeRows.length}/${edges.length} edges written)`
      : null,
  ]
    .filter(Boolean)
    .join(", ") || null;

  const { error: runError } = await supabase.from("card_synergy_engine_runs").insert({
    engine_version: SYNERGY_ENGINE_VERSION,
    cards_processed: cardsToWrite.length,
    edges_generated: edgeRows.length,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    notes: runNotes,
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
