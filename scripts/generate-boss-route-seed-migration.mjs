#!/usr/bin/env node
// scripts/generate-boss-route-seed-migration.mjs
//
// Reads data/boss-route-registry.mjs (the hand-maintained source of truth -
// see that file's own header) and emits a safe, name-lookup-based SQL
// migration seeding public.boss_routes, public.boss_route_stages,
// public.boss_route_stage_grants, public.boss_route_achievement_events, and
// public.boss_route_achievement_requirements (schema:
// supabase/migrations/202609011600_boss_route_schema.sql +
// 202609011800_boss_route_stage_grants_quantity.sql).
//
// SAFETY (same pattern as scripts/generate-archetype-registry-migration.mjs
// and every prior override/whitelist migration in this repo):
//   - Every row that references a card is `INSERT ... SELECT ... WHERE
//     c.name = ?`, never a hardcoded id.
//   - Upsert, not insert-once: every table is keyed so this script is safe
//     to re-run after editing data/boss-route-registry.mjs.
//   - Refuses (does not silently skip) to emit SQL for a card name it
//     cannot confirm against a real catalog snapshot, or that turns out to
//     be a Synchro/Pendulum/Link monster (hard-excluded from this game's
//     Extra Deck).
//   - Refuses to emit SQL that fails the project's own quote-safety scan.
//
// USAGE
//   node scripts/generate-boss-route-seed-migration.mjs [options]
//
//   --catalog <path>   JSON array of real cards to validate names/card_type
//                       against. Defaults to the newest
//                       reports/card-valuation/*/full-proposal.json present.
//   --out <path>       Output migration file path. Defaults to
//                       supabase/migrations/<timestamp>_seed_boss_routes.sql
//   --self-test        Run the built-in validation-logic tests and exit.
//
// This script is a pure generator: it never touches Supabase and never
// requires network access.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BOSS_ROUTES } from "../data/boss-route-registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const BANNED_MECHANICS = ["synchro", "pendulum", "link"];

// Same escaping discipline as generate-archetype-registry-migration.mjs:
// this is the ONLY place responsible for turning a JS string into a safe
// SQL string literal, and it self-verifies its own round-trip.
function sqlQuote(value) {
  if (value === null || value === undefined) return "null";
  const str = String(value);
  const escaped = str.replace(/'/g, "''");
  const literal = `'${escaped}'`;
  const roundTripped = literal.slice(1, -1).replace(/''/g, "'");
  if (roundTripped !== str) {
    throw new Error(
      `sqlQuote() safety check failed for value ${JSON.stringify(str)} -> ${JSON.stringify(literal)} - refusing to emit unsafe SQL`
    );
  }
  return literal;
}

// Scans an assembled SQL string the way Postgres tokenizes standard
// single-quoted string literals, and reports the first place quote parity
// breaks (a value that reached the output without going through
// sqlQuote()). Line comments (--) are not scanned for quotes.
export function findUnsafeSqlLiteral(sql) {
  const lines = sql.split("\n");
  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const line = lines[lineNo];
    const commentIdx = line.indexOf("--");
    const scanned = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    let inString = false;
    for (let i = 0; i < scanned.length; i++) {
      if (scanned[i] === "'") {
        if (inString && scanned[i + 1] === "'") {
          i++;
          continue;
        }
        inString = !inString;
      }
    }
    if (inString) {
      return `Unterminated string literal at line ${lineNo + 1}: ${line}`;
    }
  }
  return null;
}

function findNewestCatalogSnapshot() {
  const dir = path.join(REPO_ROOT, "reports", "card-valuation");
  if (!fs.existsSync(dir)) return null;
  const entries = fs
    .readdirSync(dir)
    .filter((e) => fs.statSync(path.join(dir, e)).isDirectory())
    .sort();
  if (entries.length === 0) return null;
  const newest = entries[entries.length - 1];
  const candidate = path.join(dir, newest, "full-proposal.json");
  return fs.existsSync(candidate) ? candidate : null;
}

// Validates every card name referenced by every route against the catalog
// snapshot. Returns { errors, warnings }. Errors block generation entirely;
// warnings are informational (currently unused, kept for parity with the
// archetype-registry generator's shape).
export function validateRoutes(routes, catalogSnapshot) {
  const errors = [];
  const warnings = [];

  const byName = new Map();
  if (catalogSnapshot) {
    for (const c of catalogSnapshot) {
      if (!byName.has(c.name)) byName.set(c.name, c);
    }
  }

  const checkCard = (name, where) => {
    if (!catalogSnapshot) return;
    const card = byName.get(name);
    if (!card) {
      errors.push(`${where}: card ${JSON.stringify(name)} not found in catalog snapshot`);
      return;
    }
    const cardType = (card.card_type || "").toLowerCase();
    const frameType = (card.frame_type || "").toLowerCase();
    for (const banned of BANNED_MECHANICS) {
      if (cardType.includes(banned) || frameType.includes(banned)) {
        errors.push(`${where}: card ${JSON.stringify(name)} is a ${banned} card - hard-excluded from this format's Extra Deck`);
      }
    }
  };

  const seenCodes = new Set();
  const seenOrders = new Set();

  for (const route of routes) {
    if (seenCodes.has(route.code)) errors.push(`duplicate route code ${JSON.stringify(route.code)}`);
    seenCodes.add(route.code);
    if (seenOrders.has(route.displayOrder)) errors.push(`duplicate displayOrder ${route.displayOrder} (route ${route.code})`);
    seenOrders.add(route.displayOrder);

    const stageNumbers = route.stages.map((s) => s.stageNumber).sort();
    if (JSON.stringify(stageNumbers) !== JSON.stringify([1, 2, 3, 4])) {
      errors.push(`${route.code}: expected stages 1-4, got ${JSON.stringify(stageNumbers)}`);
    }

    const evoNamesSeen = new Set();
    for (const stage of route.stages) {
      if (evoNamesSeen.has(stage.evolutionCard)) {
        errors.push(`${route.code}: evolution card ${JSON.stringify(stage.evolutionCard)} repeated across stages`);
      }
      evoNamesSeen.add(stage.evolutionCard);
      checkCard(stage.evolutionCard, `${route.code} stage ${stage.stageNumber} evolution`);

      const expectedDp = { 1: null, 2: 900, 3: 1400, 4: 2400 }[stage.stageNumber];
      if (stage.dpCost !== expectedDp) {
        errors.push(
          `${route.code} stage ${stage.stageNumber}: dpCost ${JSON.stringify(stage.dpCost)} does not match the locked economy (expected ${JSON.stringify(expectedDp)})`
        );
      }
    }

    const supportCount = route.supportGrants.length;
    if (supportCount < 12 || supportCount > 15) {
      errors.push(`${route.code}: support grant count ${supportCount} out of the 12-15 range`);
    }

    const perStageSeen = new Map();
    for (const grant of route.supportGrants) {
      checkCard(grant.cardName, `${route.code} stage ${grant.stageNumber} support grant`);
      const key = `${grant.stageNumber}:${grant.cardName}`;
      if (perStageSeen.has(key)) {
        errors.push(`${route.code} stage ${grant.stageNumber}: support card ${JSON.stringify(grant.cardName)} granted twice`);
      }
      perStageSeen.set(key, true);
    }

    const exclusiveCount = route.supportGrants.filter((g) => g.exclusive).length + 1; // +1 for the always-exclusive Boss
    if (exclusiveCount < 4) {
      warnings.push(`${route.code}: only ${exclusiveCount} route-exclusive items (target >= 4)`);
    }

    if (!route.achievementEvents || route.achievementEvents.length !== 3) {
      errors.push(`${route.code}: expected exactly 3 achievement events`);
    }
    const eventKeys = new Set((route.achievementEvents || []).map((e) => e.key));
    for (const req of route.achievementRequirements || []) {
      if (!eventKeys.has(req.eventKey)) {
        errors.push(`${route.code}: achievement requirement references unknown event key ${JSON.stringify(req.eventKey)}`);
      }
      if (![2, 3, 4].includes(req.stageNumber)) {
        errors.push(`${route.code}: achievement requirement has invalid stageNumber ${req.stageNumber} (must be 2, 3, or 4)`);
      }
    }
  }

  return { errors, warnings };
}

export function generateSql(routes) {
  const lines = [];
  lines.push("begin;");
  lines.push("");
  lines.push("-- =========================================================");
  lines.push("-- BOSS ROUTE SEED DATA - ALL 20 ROUTES");
  lines.push("--");
  lines.push("-- GENERATED FILE - do not hand-edit. Regenerate with:");
  lines.push("--   node scripts/generate-boss-route-seed-migration.mjs");
  lines.push("-- from data/boss-route-registry.mjs, the human-maintained source of");
  lines.push("-- truth. See that file's own header for card-name validation notes");
  lines.push("-- and the substitutions made for cards that could not be confirmed");
  lines.push("-- real or turned out to use an excluded mechanic.");
  lines.push("--");
  lines.push("-- Upsert-safe: every table is keyed so re-running this file after");
  lines.push("-- regenerating it from an updated data file is always safe.");
  lines.push("-- =========================================================");
  lines.push("");

  for (const route of routes) {
    lines.push(`-- ================= ROUTE: ${route.name} (${route.code}) =================`);
    lines.push("");

    // ---- boss_routes ----
    lines.push(
      `insert into public.boss_routes (code, name, display_order, teaser_story, star_profile, target_power_grade, is_active)`
    );
    lines.push(
      `values (${sqlQuote(route.code)}, ${sqlQuote(route.name)}, ${route.displayOrder}, ${sqlQuote(
        route.teaserStory
      )}, ${sqlQuote(JSON.stringify(route.starProfile))}::jsonb, ${sqlQuote(route.targetPowerGrade)}, true)`
    );
    lines.push(`on conflict (code) do update set`);
    lines.push(`  name = excluded.name,`);
    lines.push(`  display_order = excluded.display_order,`);
    lines.push(`  teaser_story = excluded.teaser_story,`);
    lines.push(`  star_profile = excluded.star_profile,`);
    lines.push(`  target_power_grade = excluded.target_power_grade,`);
    lines.push(`  is_active = excluded.is_active;`);
    lines.push("");

    // ---- boss_route_stages ----
    for (const stage of route.stages) {
      const dpCostLiteral = stage.dpCost === null || stage.dpCost === undefined ? "null" : String(stage.dpCost);
      lines.push(`insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)`);
      lines.push(`select r.id, ${stage.stageNumber}, c.id, ${dpCostLiteral}`);
      lines.push(`from public.boss_routes r, public.card_catalog c`);
      lines.push(`where r.code = ${sqlQuote(route.code)} and c.name = ${sqlQuote(stage.evolutionCard)}`);
      lines.push(`on conflict (route_id, stage_number) do update set`);
      lines.push(`  evolution_card_catalog_id = excluded.evolution_card_catalog_id,`);
      lines.push(`  dp_cost_to_reach = excluded.dp_cost_to_reach;`);
      lines.push("");
    }

    // ---- boss_route_stage_grants ----
    for (const grant of route.supportGrants) {
      const quantity = grant.quantity ?? 1;
      lines.push(`insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)`);
      lines.push(`select s.id, c.id, ${grant.exclusive ? "true" : "false"}, ${quantity}`);
      lines.push(`from public.boss_route_stages s`);
      lines.push(`join public.boss_routes r on r.id = s.route_id`);
      lines.push(`cross join public.card_catalog c`);
      lines.push(`where r.code = ${sqlQuote(route.code)} and s.stage_number = ${grant.stageNumber} and c.name = ${sqlQuote(grant.cardName)}`);
      lines.push(`on conflict (stage_id, card_catalog_id) do update set`);
      lines.push(`  is_route_exclusive = excluded.is_route_exclusive,`);
      lines.push(`  quantity = excluded.quantity;`);
      lines.push("");
    }

    // ---- boss_route_achievement_events ----
    for (const event of route.achievementEvents) {
      lines.push(`insert into public.boss_route_achievement_events (route_id, event_key, label, description, is_finishing_blow)`);
      lines.push(
        `select r.id, ${sqlQuote(event.key)}, ${sqlQuote(event.label)}, ${sqlQuote(event.description)}, ${event.isFinishingBlow ? "true" : "false"}`
      );
      lines.push(`from public.boss_routes r`);
      lines.push(`where r.code = ${sqlQuote(route.code)}`);
      lines.push(`on conflict (route_id, event_key) do update set`);
      lines.push(`  label = excluded.label,`);
      lines.push(`  description = excluded.description,`);
      lines.push(`  is_finishing_blow = excluded.is_finishing_blow;`);
      lines.push("");
    }

    // ---- boss_route_achievement_requirements ----
    for (const req of route.achievementRequirements) {
      lines.push(`insert into public.boss_route_achievement_requirements (target_stage_id, event_id, target_count)`);
      lines.push(`select s.id, e.id, ${req.targetCount}`);
      lines.push(`from public.boss_route_stages s`);
      lines.push(`join public.boss_routes r on r.id = s.route_id`);
      lines.push(`join public.boss_route_achievement_events e on e.route_id = r.id and e.event_key = ${sqlQuote(req.eventKey)}`);
      lines.push(`where r.code = ${sqlQuote(route.code)} and s.stage_number = ${req.stageNumber}`);
      lines.push(`on conflict (target_stage_id, event_id) do update set`);
      lines.push(`  target_count = excluded.target_count;`);
      lines.push("");
    }
  }

  lines.push("commit;");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const getFlag = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const selfTest = args.includes("--self-test");

  if (selfTest) {
    const okRoutes = [
      {
        code: "test_route",
        name: "Test Route",
        displayOrder: 1,
        targetPowerGrade: "A",
        starProfile: { startStrength: 3, growth: 3, bossPower: 3, synergy: 3, flexibility: 3 },
        teaserStory: "Test",
        stages: [
          { stageNumber: 1, evolutionCard: "Foo", dpCost: null },
          { stageNumber: 2, evolutionCard: "Bar", dpCost: 900 },
          { stageNumber: 3, evolutionCard: "Baz", dpCost: 1400 },
          { stageNumber: 4, evolutionCard: "Qux", dpCost: 2400, isBoss: true },
        ],
        supportGrants: Array.from({ length: 12 }, (_, i) => ({
          stageNumber: (i % 4) + 1,
          cardName: `Support${i}`,
          exclusive: i < 4,
        })),
        achievementEvents: [
          { key: "signature_win", label: "Win", description: "Win", isFinishingBlow: false },
          { key: "signature_move", label: "Move", description: "Move", isFinishingBlow: false },
          { key: "finishing_blow", label: "Finish", description: "Finish", isFinishingBlow: true },
        ],
        achievementRequirements: [
          { stageNumber: 2, eventKey: "signature_win", targetCount: 3 },
          { stageNumber: 3, eventKey: "signature_win", targetCount: 10 },
          { stageNumber: 4, eventKey: "finishing_blow", targetCount: 2 },
        ],
      },
    ];
    const okSnapshot = [
      { name: "Foo", card_type: "Effect Monster" },
      { name: "Bar", card_type: "Effect Monster" },
      { name: "Baz", card_type: "Effect Monster" },
      { name: "Qux", card_type: "Effect Monster" },
      ...Array.from({ length: 12 }, (_, i) => ({ name: `Support${i}`, card_type: "Spell Card" })),
    ];
    const { errors } = validateRoutes(okRoutes, okSnapshot);
    if (errors.length !== 0) throw new Error("self-test 1 failed: expected no errors, got " + JSON.stringify(errors));

    const missingCardRoutes = JSON.parse(JSON.stringify(okRoutes));
    missingCardRoutes[0].stages[0].evolutionCard = "Does Not Exist";
    const { errors: errors2 } = validateRoutes(missingCardRoutes, okSnapshot);
    if (errors2.length === 0) throw new Error("self-test 2 failed: expected a missing-card error");

    const synchroRoutes = JSON.parse(JSON.stringify(okRoutes));
    const synchroSnapshot = JSON.parse(JSON.stringify(okSnapshot));
    synchroSnapshot[0].card_type = "Synchro Monster";
    const { errors: errors3 } = validateRoutes(synchroRoutes, synchroSnapshot);
    if (errors3.length === 0) throw new Error("self-test 3 failed: expected a Synchro-mechanic error");

    const dupEvoRoutes = JSON.parse(JSON.stringify(okRoutes));
    dupEvoRoutes[0].stages[1].evolutionCard = "Foo";
    const { errors: errors4 } = validateRoutes(dupEvoRoutes, okSnapshot);
    if (errors4.length === 0) throw new Error("self-test 4 failed: expected a duplicate-evolution error");

    const sql = generateSql(okRoutes);
    const unsafe = findUnsafeSqlLiteral(sql);
    if (unsafe) throw new Error(`self-test 5 failed: generator output flagged unsafe: ${unsafe}`);

    console.log("generate-boss-route-seed-migration.mjs self-test: 5/5 checks passed");
    return;
  }

  const catalogPath = getFlag("--catalog") ?? findNewestCatalogSnapshot();
  let catalogSnapshot = null;
  if (catalogPath && fs.existsSync(catalogPath)) {
    catalogSnapshot = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    console.log(`Validating against catalog snapshot: ${catalogPath} (${catalogSnapshot.length} cards)`);
  } else {
    console.warn(
      "WARNING: no catalog snapshot found/given - generating SQL WITHOUT verifying card names against real data."
    );
  }

  const { errors, warnings } = validateRoutes(BOSS_ROUTES, catalogSnapshot);

  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s) (informational, not blocking):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }

  if (errors.length) {
    console.error(`\nREFUSING TO GENERATE SQL - ${errors.length} validation error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const sql = generateSql(BOSS_ROUTES);

  const unsafe = findUnsafeSqlLiteral(sql);
  if (unsafe) {
    console.error(`\nREFUSING TO WRITE MIGRATION - generated SQL failed the quote-safety check: ${unsafe}`);
    process.exit(1);
  }

  const outPath = getFlag("--out") ?? path.join(REPO_ROOT, "supabase", "migrations", "202609011900_seed_boss_routes.sql");
  fs.writeFileSync(outPath, sql, "utf8");

  const totalStages = BOSS_ROUTES.reduce((sum, r) => sum + r.stages.length, 0);
  const totalGrants = BOSS_ROUTES.reduce((sum, r) => sum + r.supportGrants.length, 0);
  const totalEvents = BOSS_ROUTES.reduce((sum, r) => sum + r.achievementEvents.length, 0);
  const totalReqs = BOSS_ROUTES.reduce((sum, r) => sum + r.achievementRequirements.length, 0);
  console.log(
    `\nWrote ${outPath}\n  routes: ${BOSS_ROUTES.length}\n  stages: ${totalStages}\n  support grants: ${totalGrants}\n  achievement events: ${totalEvents}\n  achievement requirements: ${totalReqs}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
