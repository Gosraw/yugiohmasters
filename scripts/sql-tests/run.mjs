#!/usr/bin/env node
// SQL tests against the LOCAL devstack database only
// (postgres://postgres@127.0.0.1:54322/postgres, see
// scripts/devstack/db.mjs). Never points at production.
//
//   node scripts/sql-tests/run.mjs            # every NN_*.sql file
//   node scripts/sql-tests/run.mjs 03         # files whose name contains "03"
//
// Each test file runs inside ONE transaction that is always rolled
// back, so the shared dev database stays exactly as it was. The
// helpers in _helpers.sql (act_as, assert_eq, ...) are created as
// pg_temp functions at the start of that same transaction.
// A test passes when its file runs without an exception; every
// `raise notice 'ok: ...'` is printed as a checked assertion.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DB_URL = "postgres://postgres@127.0.0.1:54322/postgres";
const DIR = import.meta.dirname;
const filter = process.argv[2] ?? "";

const helpers = readFileSync(path.join(DIR, "_helpers.sql"), "utf8");
const files = readdirSync(DIR)
  .filter((name) => /^\d\d_.*\.sql$/.test(name) && name.includes(filter))
  .sort();

if (files.length === 0) {
  console.error(`No SQL test files match "${filter}".`);
  process.exit(1);
}

let failed = 0;

for (const file of files) {
  const notices = [];
  const sql = postgres(DB_URL, {
    max: 1,
    onnotice: (notice) => notices.push(notice.message),
  });

  try {
    await sql.unsafe("begin");

    try {
      await sql.unsafe(helpers);
      await sql.unsafe(readFileSync(path.join(DIR, file), "utf8"));
      console.log(`✓ ${file}`);
    } catch (error) {
      failed += 1;
      console.error(`✗ ${file}\n  ${error.message}`);

      if (error.where) {
        console.error(`  where: ${error.where.split("\n")[0]}`);
      }
    } finally {
      await sql.unsafe("rollback");
    }

    for (const message of notices.filter((m) => m.startsWith("ok:"))) {
      console.log(`    ${message}`);
    }
  } finally {
    await sql.end();
  }
}

console.log(failed === 0 ? `\nAll ${files.length} SQL test file(s) passed.` : `\n${failed} of ${files.length} SQL test file(s) failed.`);
process.exitCode = failed === 0 ? 0 : 1;
