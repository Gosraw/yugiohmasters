#!/usr/bin/env node
// scripts/generate-archetype-registry-migration.mjs
//
// Reads data/archetype-registry.mjs (the hand-maintained source of truth -
// see that file's own header) and emits a safe, name-lookup-based SQL
// migration seeding public.archetype_registry and public.archetype_cards
// (schema: supabase/migrations/202608301300_archetype_registry_schema.sql).
//
// SAFETY (same pattern as every prior override/whitelist migration in this
// repo):
//   - Every archetype_cards row is `INSERT ... SELECT ... WHERE c.name = ?`,
//     never a hardcoded id - the real card_catalog_id is resolved by the
//     database itself at apply time.
//   - Upsert, not insert-once: archetype_registry keyed on `code`,
//     archetype_cards keyed on (archetype_id, card_catalog_id) - safe to
//     regenerate and re-run after editing data/archetype-registry.mjs.
//   - Refuses (does not silently skip) to emit a row for a card name it
//     cannot confirm against a real catalog snapshot - see --catalog below.
//     This mirrors the brief's own instruction: "if a card cannot be
//     verified, place it in REVIEW rather than pretending certainty."
//
// USAGE
//   node scripts/generate-archetype-registry-migration.mjs [options]
//
//   --catalog <path>   JSON array of real cards to validate names/card_type
//                       against, each shaped like the audit report's
//                       per-card.json entries ({name, card_type, ...}).
//                       Defaults to the newest
//                       reports/duelist-circle-classic/*/per-card.json if
//                       present. In production this validation should be
//                       done against a live `select name, card_type from
//                       card_catalog` snapshot instead - the report file is
//                       this sandbox's offline stand-in (see this project's
//                       standing "no live Supabase access" limitation).
//   --out <path>       Output migration file path. Defaults to
//                       supabase/migrations/<timestamp>_seed_archetype_registry.sql
//   --self-test        Run the built-in validation-logic tests and exit
//                       (no file I/O). See lib/archetype-registry.regression.test.mjs
//                       for the full offline regression suite that exercises
//                       this same validation logic end to end.
//
// This script is a pure generator: it never touches Supabase and never
// requires network access. It only reads data/archetype-registry.mjs and
// (optionally) a local catalog snapshot, and writes one SQL file.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARCHETYPE_REGISTRY, ROLES, EXTRA_DECK_KINDS, SUMMON_DIFFICULTIES, PACKAGE_TIERS, BOSS_STAGES } from "../data/archetype-registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// Every text field this generator emits goes through this function - it is
// the ONLY place responsible for turning a JS string into a safe SQL string
// literal. It doubles every embedded single quote ('' is the standard SQL
// escape for a literal quote inside a '...'-delimited string) and always
// wraps the result in its own quote pair, so callers never hand-build a
// literal or string-concatenate raw text into a query.
//
// Self-verified: after escaping, the function un-escapes its own output and
// asserts it recovers the exact original string. Doubling-then-undoubling a
// quote character is mathematically its own inverse, so this can only ever
// fail if a future edit to the escaping logic breaks that invariant - which
// is exactly the "we changed the generator and it quietly stopped escaping
// something" bug class this guards against. See findUnsafeSqlLiteral()
// below for the complementary check on the FINAL assembled SQL text (which
// also catches a value that bypassed sqlQuote() entirely).
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

// Scans an assembled SQL string exactly the way Postgres itself tokenizes
// standard-conforming single-quoted string literals (a lone ' starts/ends a
// literal, '' inside one is an escaped literal quote, and -- starts a
// line comment that is NOT scanned for quotes) and reports the first place
// the file is unsafe: an odd/unterminated string. This is the generator's
// defense against the "Skyscraper" bug class - a value that reaches the
// output WITHOUT going through sqlQuote() (or a future edit to sqlQuote()
// that stops escaping correctly) corrupts quote-parity for every statement
// after it in the file, which can surface as a bizarre, seemingly unrelated
// error far later in the script (e.g. a card name from a much earlier
// statement being parsed as a bare identifier).
//
// Returns null when the SQL is safe, or a diagnostic string describing the
// first problem found.
export function findUnsafeSqlLiteral(sql) {
  let inString = false;
  let stringStartLine = null;
  let line = 1;
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (!inString && c === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? n : nl;
      continue;
    }
    if (c === "'") {
      if (inString) {
        if (sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        inString = false;
        i++;
        continue;
      }
      inString = true;
      stringStartLine = line;
      i++;
      continue;
    }
    i++;
  }
  if (inString) {
    return `unterminated string literal starting at line ${stringStartLine} - a value likely reached the output without going through sqlQuote(), or sqlQuote() itself regressed`;
  }
  return null;
}

function findNewestCatalogSnapshot() {
  const reportsDir = path.join(REPO_ROOT, "reports", "duelist-circle-classic");
  if (!fs.existsSync(reportsDir)) return null;
  const runs = fs
    .readdirSync(reportsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (let i = runs.length - 1; i >= 0; i--) {
    const candidate = path.join(reportsDir, runs[i], "per-card.json");
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// Validates the full registry against a real catalog snapshot (array of
// {name, card_type, eligibilityCategory}). Returns { errors, warnings } -
// both string arrays. `errors` mean the generator must refuse to emit SQL;
// `warnings` are informational (e.g. needsReview cards) and never block.
export function validateRegistry(registry, catalogSnapshot) {
  const errors = [];
  const warnings = [];

  const byName = new Map();
  if (catalogSnapshot) {
    for (const c of catalogSnapshot) {
      if (!byName.has(c.name)) byName.set(c.name, []);
      byName.get(c.name).push(c);
    }
  }

  const seenCodes = new Set();
  for (const arch of registry) {
    if (seenCodes.has(arch.code)) errors.push(`duplicate archetype code: ${arch.code}`);
    seenCodes.add(arch.code);

    // generateSql() below interpolates priorityRank RAW (not through
    // sqlQuote()) because it is meant to always be a plain integer - the
    // one field in this whole generator not routed through the string
    // escaper. That is only safe as long as it is actually a number: a
    // stray string value here (e.g. a data-entry typo like
    // priorityRank: "2") would be interpolated verbatim into the VALUES
    // list unquoted and unescaped, the same "value reached raw SQL
    // without going through sqlQuote()" bug class the "Skyscraper"
    // production incident investigation was looking for (see
    // findUnsafeSqlLiteral() above and the regression suite). Caught
    // here, at validation time, rather than relying on it happening to
    // still produce syntactically valid SQL.
    if (
      arch.priorityRank !== undefined &&
      arch.priorityRank !== null &&
      typeof arch.priorityRank !== "number"
    ) {
      errors.push(
        `${arch.code}: priorityRank must be a number or omitted, got ${typeof arch.priorityRank} (${JSON.stringify(arch.priorityRank)}) - this field is emitted into SQL unquoted`
      );
    }

    const seenNames = new Set();
    for (const card of arch.cards) {
      if (seenNames.has(card.name)) {
        errors.push(`${arch.code}: duplicate card entry for "${card.name}"`);
      }
      seenNames.add(card.name);

      if (!ROLES.includes(card.role)) {
        errors.push(`${arch.code}: "${card.name}" has invalid role "${card.role}"`);
      }
      if (card.extraDeckKind && !EXTRA_DECK_KINDS.includes(card.extraDeckKind)) {
        errors.push(`${arch.code}: "${card.name}" has invalid extraDeckKind "${card.extraDeckKind}"`);
      }
      if (card.summonDifficulty && !SUMMON_DIFFICULTIES.includes(card.summonDifficulty)) {
        errors.push(`${arch.code}: "${card.name}" has invalid summonDifficulty "${card.summonDifficulty}"`);
      }
      if (card.packageTier && !PACKAGE_TIERS.includes(card.packageTier)) {
        errors.push(`${arch.code}: "${card.name}" has invalid packageTier "${card.packageTier}"`);
      }
      if (card.packageTier === "ESSENTIAL" && card.needsReview) {
        errors.push(`${arch.code}: "${card.name}" is ESSENTIAL but needsReview=true - not confident enough for that tier`);
      }
      if (card.packageTier && card.role === "AVOID") {
        errors.push(`${arch.code}: "${card.name}" is role=AVOID but has a packageTier - contradictory`);
      }

      if (!catalogSnapshot) continue; // no snapshot given - structural checks only

      const entries = byName.get(card.name);
      if (!entries) {
        errors.push(`${arch.code}: "${card.name}" not found in catalog snapshot - cannot resolve a real card_catalog_id`);
        continue;
      }
      const usable = entries.find(
        (e) =>
          e.eligibilityCategory === "eligible_core" ||
          e.eligibilityCategory === "override_included" ||
          e.eligibilityCategory === "era_excluded_2015_2018"
      );
      if (!usable) {
        errors.push(
          `${arch.code}: "${card.name}" exists but is not eligible/whitelisted (${entries.map((e) => e.eligibilityCategory).join(",")})`
        );
        continue;
      }
      if (card.extraDeckKind) {
        const ct = (usable.card_type || "").toLowerCase();
        if (ct.includes("synchro") || ct.includes("link") || ct.includes("pendulum")) {
          errors.push(`${arch.code}: "${card.name}" is real card_type "${usable.card_type}" (Synchro/Link/Pendulum) - illegal mechanic for this format, cannot be a BOSS/Extra Deck entry`);
        } else if (card.extraDeckKind === "FUSION" && !ct.includes("fusion")) {
          errors.push(`${arch.code}: "${card.name}" marked extraDeckKind=FUSION but real card_type is "${usable.card_type}"`);
        } else if (card.extraDeckKind === "XYZ" && !ct.includes("xyz")) {
          errors.push(`${arch.code}: "${card.name}" marked extraDeckKind=XYZ but real card_type is "${usable.card_type}"`);
        }
      }
      if (card.needsReview) {
        warnings.push(`${arch.code}: "${card.name}" flagged needsReview - human should confirm before trusting its role/tier`);
      }
    }

    for (const stage of BOSS_STAGES.map((s) => s.toLowerCase())) {
      const val = arch.bossProgression?.[stage];
      if (val && !arch.cards.some((c) => c.name === val)) {
        errors.push(`${arch.code}: bossProgression.${stage} references "${val}" which has no matching card entry`);
      }
    }
  }

  return { errors, warnings };
}

export function generateSql(registry) {
  const lines = [];
  lines.push("begin;");
  lines.push("");
  lines.push("-- =========================================================");
  lines.push("-- ARCHETYPE REGISTRY - SEED DATA");
  lines.push("--");
  lines.push("-- GENERATED FILE - do not hand-edit. Regenerate with:");
  lines.push("--   node scripts/generate-archetype-registry-migration.mjs");
  lines.push("-- from data/archetype-registry.mjs, the human-maintained source of");
  lines.push("-- truth. See that file's own header for the role/tier/difficulty");
  lines.push("-- definitions and the confidence discipline behind needsReview.");
  lines.push("--");
  lines.push("-- Upsert-safe: archetype_registry is keyed on `code`, archetype_cards");
  lines.push("-- on (archetype_id, card_catalog_id) - re-running this file after");
  lines.push("-- regenerating it from an updated data file is always safe.");
  lines.push("-- =========================================================");
  lines.push("");

  for (const arch of registry) {
    const p = arch.profile;
    lines.push(`-- ---- ${arch.name} (${arch.code}) ----`);
    lines.push(
      `insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)`
    );
    lines.push(
      `values (${sqlQuote(arch.code)}, ${sqlQuote(arch.name)}, ${sqlQuote(arch.description)}, ${arch.priorityRank ?? "null"}, ${sqlQuote(
        p.nostalgiaRelevance
      )}, ${sqlQuote(p.consistency)}, ${sqlQuote(p.removal)}, ${sqlQuote(p.defense)}, ${sqlQuote(p.recovery)}, ${sqlQuote(
        p.bossPower
      )}, ${sqlQuote(p.summoningSpeed)}, ${sqlQuote(p.overallHealth)}, ${sqlQuote(p.deckReality)}, ${sqlQuote(
        JSON.stringify(arch.gaps ?? [])
      )}::jsonb, ${sqlQuote(arch.notes)})`
    );
    lines.push(`on conflict (code) do update set`);
    lines.push(`  name = excluded.name,`);
    lines.push(`  description = excluded.description,`);
    lines.push(`  priority_rank = excluded.priority_rank,`);
    lines.push(`  nostalgia_relevance = excluded.nostalgia_relevance,`);
    lines.push(`  consistency = excluded.consistency,`);
    lines.push(`  removal = excluded.removal,`);
    lines.push(`  defense = excluded.defense,`);
    lines.push(`  recovery = excluded.recovery,`);
    lines.push(`  boss_power = excluded.boss_power,`);
    lines.push(`  summoning_speed = excluded.summoning_speed,`);
    lines.push(`  overall_health = excluded.overall_health,`);
    lines.push(`  deck_reality = excluded.deck_reality,`);
    lines.push(`  gaps = excluded.gaps,`);
    lines.push(`  notes = excluded.notes,`);
    lines.push(`  updated_at = now();`);
    lines.push("");

    for (const card of arch.cards) {
      lines.push(
        `insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)`
      );
      lines.push(`select r.id, c.id, ${sqlQuote(card.role)}, ${sqlQuote(card.extraDeckKind ?? null)}, ${sqlQuote(
        card.summonDifficulty ?? null
      )}, ${sqlQuote(card.packageTier ?? null)}, ${sqlQuote(
        BOSS_STAGES.find((s) => arch.bossProgression && arch.bossProgression[s.toLowerCase()] === card.name) ?? null
      )}, ${card.needsReview ? "true" : "false"}, ${sqlQuote(card.notes ?? null)}`);
      lines.push(`from public.archetype_registry r, public.card_catalog c`);
      lines.push(`where r.code = ${sqlQuote(arch.code)} and c.name = ${sqlQuote(card.name)}`);
      lines.push(`on conflict (archetype_id, card_catalog_id) do update set`);
      lines.push(`  role = excluded.role,`);
      lines.push(`  extra_deck_kind = excluded.extra_deck_kind,`);
      lines.push(`  summon_difficulty = excluded.summon_difficulty,`);
      lines.push(`  package_tier = excluded.package_tier,`);
      lines.push(`  boss_stage = excluded.boss_stage,`);
      lines.push(`  needs_review = excluded.needs_review,`);
      lines.push(`  notes = excluded.notes;`);
    }
    lines.push("");
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
    const okRegistry = [
      {
        code: "test_arch",
        name: "Test",
        cards: [{ name: "Foo", role: "CORE", packageTier: "ESSENTIAL" }],
        bossProgression: {},
      },
    ];
    const snapshot = [{ name: "Foo", card_type: "Effect Monster", eligibilityCategory: "eligible_core" }];
    const { errors } = validateRegistry(okRegistry, snapshot);
    if (errors.length !== 0) throw new Error("self-test 1 failed: expected no errors, got " + JSON.stringify(errors));

    const badRegistry = [
      {
        code: "test_arch2",
        name: "Test2",
        cards: [{ name: "Missing Card", role: "CORE" }],
        bossProgression: {},
      },
    ];
    const { errors: errors2 } = validateRegistry(badRegistry, snapshot);
    if (errors2.length === 0) throw new Error("self-test 2 failed: expected a missing-card error");

    const mechRegistry = [
      {
        code: "test_arch3",
        name: "Test3",
        cards: [{ name: "Synchro Card", role: "BOSS", extraDeckKind: "FUSION" }],
        bossProgression: {},
      },
    ];
    const mechSnapshot = [{ name: "Synchro Card", card_type: "Synchro Monster", eligibilityCategory: "eligible_core" }];
    const { errors: errors3 } = validateRegistry(mechRegistry, mechSnapshot);
    if (errors3.length === 0) throw new Error("self-test 3 failed: expected a Synchro-mechanic error");

    const nastyValues = [
      "Jaden Yuki's HERO lineup",
      "HERO''s Bond (already doubled)",
      "D - Formation",
      "a value with a \"double quote\" inside",
      "ends with a quote'",
      "'starts with a quote",
      "just a single quote: '",
      "multiple '' '' adjacent doubled quotes",
      "semicolon; inside prose - and a hyphen too",
    ];
    for (const v of nastyValues) {
      const quoted = sqlQuote(v);
      const unescaped = quoted.slice(1, -1).replace(/''/g, "'");
      if (unescaped !== v) {
        throw new Error(`self-test 4 failed: sqlQuote round-trip mismatch for ${JSON.stringify(v)} -> ${quoted}`);
      }
    }
    const nastyRegistry = [
      {
        code: "nasty_test",
        name: "Nasty Test",
        description: nastyValues.join(" | "),
        priorityRank: 1,
        profile: {
          nostalgiaRelevance: "HIGH",
          consistency: "HIGH",
          removal: "HIGH",
          defense: "HIGH",
          recovery: "HIGH",
          bossPower: "HIGH",
          summoningSpeed: "FAST",
          overallHealth: "HEALTHY",
          deckReality: "FULL_DECK",
        },
        gaps: [{ category: "other", description: nastyValues.join(" | ") }],
        notes: nastyValues.join(" | "),
        bossProgression: {},
        cards: nastyValues.map((v, idx) => ({
          name: `Nasty Card ${idx}`,
          role: "CORE",
          notes: v,
        })),
      },
    ];
    const nastySql = generateSql(nastyRegistry);
    const nastyUnsafe = findUnsafeSqlLiteral(nastySql);
    if (nastyUnsafe) {
      throw new Error(`self-test 4 failed: findUnsafeSqlLiteral flagged generator output as unsafe: ${nastyUnsafe}`);
    }

    const brokenSql = "insert into t (name) values ('It's broken');";
    const brokenResult = findUnsafeSqlLiteral(brokenSql);
    if (!brokenResult) {
      throw new Error("self-test 5 failed: findUnsafeSqlLiteral did not catch an unescaped apostrophe");
    }

    const commentSql = "-- this comment has an apostrophe: don't touch it\nselect 1;";
    const commentResult = findUnsafeSqlLiteral(commentSql);
    if (commentResult) {
      throw new Error(`self-test 6 failed: a -- comment was incorrectly treated as breaking string parity: ${commentResult}`);
    }

    console.log("generate-archetype-registry-migration.mjs self-test: 6/6 checks passed");
    return;
  }

  const catalogPath = getFlag("--catalog") ?? findNewestCatalogSnapshot();
  let catalogSnapshot = null;
  if (catalogPath && fs.existsSync(catalogPath)) {
    catalogSnapshot = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    console.log(`Validating against catalog snapshot: ${catalogPath} (${catalogSnapshot.length} cards)`);
  } else {
    console.warn(
      "WARNING: no catalog snapshot found/given - generating SQL WITHOUT verifying card names against real data. Pass --catalog <path> or run from a checkout with reports/duelist-circle-classic/*/per-card.json present."
    );
  }

  const { errors, warnings } = validateRegistry(ARCHETYPE_REGISTRY, catalogSnapshot);

  if (warnings.length) {
    console.log(`\n${warnings.length} needsReview warning(s) (informational, not blocking):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }

  if (errors.length) {
    console.error(`\nREFUSING TO GENERATE SQL - ${errors.length} validation error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const sql = generateSql(ARCHETYPE_REGISTRY);

  const unsafe = findUnsafeSqlLiteral(sql);
  if (unsafe) {
    console.error(`\nREFUSING TO WRITE MIGRATION - generated SQL failed the quote-safety check: ${unsafe}`);
    process.exit(1);
  }

  const outPath = getFlag("--out") ?? path.join(REPO_ROOT, "supabase", "migrations", "202608301400_seed_archetype_registry.sql");
  fs.writeFileSync(outPath, sql, "utf8");

  const totalCards = ARCHETYPE_REGISTRY.reduce((sum, a) => sum + a.cards.length, 0);
  console.log(
    `\nWrote ${outPath}\n  archetypes: ${ARCHETYPE_REGISTRY.length}\n  card relationships: ${totalCards}\n  needsReview flagged: ${warnings.length}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
