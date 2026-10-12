#!/usr/bin/env node
// Local test database without Docker: a native Postgres cluster in
// .devstack/pg, with scripts/devstack/bootstrap.sql standing in for
// Supabase's roles/auth schema, then every top-level migration in
// filename order.
//
//   node scripts/devstack/db.mjs reset    # wipe + init + migrate
//   node scripts/devstack/db.mjs start    # start existing cluster
//   node scripts/devstack/db.mjs stop
//   node scripts/devstack/db.mjs migrate  # apply not-yet-applied migrations
//
// Never points at production: it only ever talks to 127.0.0.1:54322.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

import { createTestUsers, seedCatalog } from "./seed-catalog.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const DATA_DIR = path.join(ROOT, ".devstack/pg");
const LOG_FILE = path.join(ROOT, ".devstack/postgres.log");
const PG_BIN = "/opt/homebrew/opt/postgresql@17/bin";
export const DB_PORT = 54322;
export const DB_URL = `postgres://postgres@127.0.0.1:${DB_PORT}/postgres`;

function pg(bin, args, options = {}) {
  return execFileSync(path.join(PG_BIN, bin), args, {
    stdio: "inherit",
    // Postgres refuses to start on macOS without a valid locale.
    env: {
      ...process.env,
      LC_ALL: "en_US.UTF-8",
    },
    ...options,
  });
}

function isRunning() {
  const result = spawnSync(path.join(PG_BIN, "pg_ctl"), ["-D", DATA_DIR, "status"], {
    stdio: "ignore",
  });

  return result.status === 0;
}

function init() {
  rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(path.dirname(DATA_DIR), { recursive: true });
  pg("initdb", ["-D", DATA_DIR, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C"], {
    stdio: "ignore",
  });
}

export function start() {
  if (isRunning()) {
    return;
  }

  pg("pg_ctl", [
    "-D", DATA_DIR,
    "-l", LOG_FILE,
    "-o", `-p ${DB_PORT} -k /tmp -c listen_addresses=127.0.0.1`,
    "-w",
    "start",
  ], {
    stdio: "ignore",
  });
}

function stop() {
  if (isRunning()) {
    pg("pg_ctl", ["-D", DATA_DIR, "-m", "fast", "stop"], {
      stdio: "ignore",
    });
  }
}

export function listMigrations() {
  // Production also has the files from the stray nested folder
  // supabase/migrations/supabase/migrations/ applied (later
  // migrations depend on e.g. profiles.signature_quote from it), so
  // replay both, merged by filename.
  const dirs = [
    path.join(ROOT, "supabase/migrations"),
    path.join(ROOT, "supabase/migrations/supabase/migrations"),
  ];

  return dirs
    .flatMap((dir) => readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => ({
        name,
        file: path.join(dir, name),
      })))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Some committed migrations are not valid as written (they were
// fixed by hand in production via supabase/manual_deploy). To replay
// the chain locally we patch them on the fly - the repo files stay
// untouched. Each entry: [find, replace].
const MIGRATION_PATCHES = {
  // SQL CASE *expressions* don't accept comma lists in WHEN.
  "202609010900_phase3_prelaunch_pack_sizes_and_peak_rarity.sql": [
    [
      "when 'special_attribute', 'special_archetype', 'special_monster_type' then 6",
      "when 'special_attribute' then 6 when 'special_archetype' then 6 when 'special_monster_type' then 6",
    ],
  ],
  "202609011400_final_legendary_luck_pity_system.sql": [
    [
      "when 'special_attribute', 'special_archetype', 'special_monster_type' then 1.25",
      "when 'special_attribute' then 1.25 when 'special_archetype' then 1.25 when 'special_monster_type' then 1.25",
    ],
    // The migration's own self-check greps the new function source
    // for the old column name - which this comment inside the body
    // contains, so it can never pass as written.
    [
      "  -- Replaces the old packs_since_ultra_or_better streak-pity\n",
      "  -- Replaces the old streak-pity\n",
    ],
  ],
  // RAISE EXCEPTION needs a format string, not a CASE expression.
  "202609012400_p2w_achievements.sql": [
    [
      "    raise exception\n      case\n        when achievement_row.cadence = 'weekly'",
      "    raise exception '%',\n      case\n        when achievement_row.cadence = 'weekly'",
    ],
  ],
  // ORDER BY a column that is neither grouped nor functionally
  // dependent on the GROUP BY key.
  "20260902_season1_release.sql": [
    [
      "    group by d.code, d.name\n    order by d.display_order",
      "    group by d.code, d.name, d.display_order\n    order by d.display_order",
    ],
    // Asserts on bossg's hand-granted production cards, which a
    // fresh local DB doesn't have.
    [
      "  if v_counts.berry <> 1 or v_counts.lemon <> 1 or v_counts.chocolate <> 1 then",
      "  if false then",
    ],
  ],
};

function readMigration(migration) {
  let text = readFileSync(migration.file, "utf8");

  for (const [find, replace] of MIGRATION_PATCHES[migration.name] ?? []) {
    if (!text.includes(find)) {
      throw new Error(`devstack patch for ${migration.name} no longer matches - remove or update it`);
    }

    text = text.split(find).join(replace);
  }

  return text;
}

const MANUAL_DEPLOY_FIRST = "202609020910";
const MANUAL_DEPLOY_LAST = "202609021030_zzz";
const MANUAL_DEPLOY_NAME = "20260902_season1_release.sql";

// The Special Pack slots (202608311400) and the first singles rotation
// are generated from card_catalog while the replay's catalog is not
// yet format-eligible, so a fresh devstack ends up with zero slots and
// an active singles rotation without cards. Production had a real
// catalog by then. Recreate both here, after everything is seeded
// (idempotent: only touches empty slots / an empty active rotation).
async function ensureShopRotations(sql) {
  await sql.unsafe(`
    -- Same slot -> curated pack mapping as manual_deploy section 3:
    -- definitions 1-5 archetype, 6-10 attribute, 11-15 monster_type.
    insert into public.shop_special_pack_slots (
      theme_category, slot_order, theme_value, theme_label, pack_definition_id
    )
    select
      case
        when d.display_order <= 5 then 'archetype'
        when d.display_order <= 10 then 'attribute'
        else 'monster_type'
      end,
      ((d.display_order - 1) % 5) + 1,
      d.code,
      d.name,
      d.id
    from public.shop_special_pack_definitions d
    where d.display_order between 1 and 15
    on conflict (theme_category, slot_order) do nothing;

    -- An active singles rotation without any card: close it so the
    -- refresh below generates a real one for the current window.
    update public.shop_rotations r
    set status = 'completed', ends_at = greatest(r.starts_at + interval '1 second', now()), updated_at = now()
    where r.status = 'active'
      and not exists (select 1 from public.shop_rotation_cards c where c.rotation_id = r.id);

    select public.ensure_shop_rotations_current();
  `);
}

async function migrate({ bootstrap = false } = {}) {
  const sql = postgres(DB_URL, {
    max: 1,
    onnotice: () => {},
  });

  try {
    if (bootstrap) {
      await sql.unsafe(readFileSync(path.join(import.meta.dirname, "bootstrap.sql"), "utf8"));
      await sql`create table if not exists public._devstack_migrations (name text primary key, applied_at timestamptz default now())`;
      await sql`revoke all on public._devstack_migrations from anon, authenticated`;
    }

    const applied = new Set(
      (await sql`select name from public._devstack_migrations`).map((row) => row.name)
    );

    let count = 0;

    for (const migration of listMigrations()) {
      if (applied.has(migration.name)) {
        continue;
      }

      // Production never ran 202609020910..202609021030 one by one:
      // they went live as ONE combined, hand-reconciled script
      // (supabase/manual_deploy/20260902_season1_release.sql, which
      // also fixes the unsafe boss-stage swaps). Mirror that.
      if (migration.name >= MANUAL_DEPLOY_FIRST && migration.name <= MANUAL_DEPLOY_LAST) {
        if (!applied.has(MANUAL_DEPLOY_NAME)) {
          try {
            // Its pre-flight insists the three live players exist.
            await createTestUsers(sql, ["bossg", "samo", "fardin"]);

            // Production's catalog didn't have this card yet; the deploy
            // imports it itself and asserts on the fresh row.
            await sql`delete from public.card_catalog where name = 'Harpie''s Pet Dragon - Fearsome Fire Blast'`;

            // Its multi-row "swap" UPDATEs assume the unique check
            // runs at end of statement. Postgres only does that for a
            // DEFERRABLE constraint; a plain one is checked per row,
            // so success depends on physical row order (it happened
            // to work in production). Make it order-independent here.
            await sql.unsafe(`
              alter table public.boss_route_stages
                drop constraint boss_route_stages_route_id_evolution_card_catalog_id_key,
                add constraint boss_route_stages_route_id_evolution_card_catalog_id_key
                  unique (route_id, evolution_card_catalog_id) deferrable initially immediate
            `);

            await sql.unsafe(readMigration({
              name: MANUAL_DEPLOY_NAME,
              file: path.join(ROOT, "supabase/manual_deploy", MANUAL_DEPLOY_NAME),
            }));
            await sql`insert into public._devstack_migrations (name) values (${MANUAL_DEPLOY_NAME})`;
            applied.add(MANUAL_DEPLOY_NAME);
            count += 1;
          } catch (error) {
            console.error(`\n✗ manual_deploy/${MANUAL_DEPLOY_NAME}\n  ${error.message}`);
            process.exitCode = 1;

            return;
          }
        }

        continue;
      }

      try {
        await sql.begin(async (tx) => {
          await tx.unsafe(readMigration(migration));
          await tx`insert into public._devstack_migrations (name) values (${migration.name})`;
        });

        count += 1;

        // Later migrations (Boss routes, rarity passes, pools) look
        // cards up by name, so the catalog must exist right after its
        // table does - exactly like production, where sync-cards ran
        // early on.
        if (migration.name === "202608190002_card_catalog.sql") {
          const seeded = await seedCatalog(sql);

          console.log(`  seeded ${seeded} catalog cards`);
        }
      } catch (error) {
        console.error(`\n✗ ${migration.name}\n  ${error.message}`);

        if (error.position) {
          const text = readMigration(migration);
          const line = text.slice(0, Number(error.position)).split("\n").length;
          console.error(`  at line ${line}`);
        }

        process.exitCode = 1;

        return;
      }
    }

    await createTestUsers(sql, ["bossg", "samo", "fardin"]);
    await ensureShopRotations(sql);

    console.log(`✓ applied ${count} migration(s)`);

    // PostgREST caches the schema; tell it to reload.
    await sql`notify pgrst, 'reload schema'`;
  } finally {
    await sql.end();
  }
}

const command = process.argv[2];

if (command === "reset") {
  stop();
  init();
  start();
  await migrate({ bootstrap: true });
} else if (command === "start") {
  if (!existsSync(DATA_DIR)) {
    console.error("No cluster yet - run: node scripts/devstack/db.mjs reset");
    process.exit(1);
  }

  start();
} else if (command === "stop") {
  stop();
} else if (command === "migrate") {
  start();
  await migrate();
} else if (command) {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
