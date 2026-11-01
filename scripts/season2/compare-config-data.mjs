#!/usr/bin/env node
// Developer tool: compares the rows of the tables that survive the
// Season 2 reset (config, catalog-driven data) between two LOCAL
// databases. Random uuids are replaced by a stable label (card name,
// route code, ...) so the two sides can be compared; timestamps and
// ids are ignored.
//
//   node scripts/season2/compare-config-data.mjs <urlA> <urlB> [table...]
//
// Refuses anything but 127.0.0.1. Prints counts and samples, never
// account details (profiles, votes and titles are compared by count).

import postgres from "postgres";

const args = process.argv.slice(2);
const [urlA, urlB, ...only] = args;

if (!urlA || !urlB) {
  console.error("Usage: compare-config-data.mjs <urlA> <urlB> [table...]");
  process.exit(2);
}

for (const url of [urlA, urlB]) {
  if (new URL(url).hostname !== "127.0.0.1") {
    console.error(`Refusing non-local database: ${new URL(url).hostname}`);
    process.exit(2);
  }
}

// Only counted: player data or free-form history.
const COUNT_ONLY = new Set([
  "audit_log", "card_votes", "card_vote_tiebreaks", "card_wishlist_items",
  "league_members", "leagues", "profile_titles", "profiles", "wallets",
  "card_mechanics", "card_catalog", "shop_rotation_cards", "shop_rotations",
  "shop_special_pack_rotations", "mini_game_daily_seeds", "_devstack_migrations",
]);

const TABLES = [
  "achievements", "archetype_cards", "archetype_registry", "audit_log",
  "boss_monster_options", "boss_route_achievement_events", "boss_route_achievement_requirements",
  "boss_route_stage_grants", "boss_route_stages", "boss_routes",
  "card_catalog", "card_mechanics", "card_synergy_edges", "card_synergy_engine_runs",
  "card_vote_items", "card_vote_tiebreaks", "card_votes", "card_wishlist_items",
  "duelist_circle_card_limits", "duelist_circle_formats", "duelist_circle_proposed_rarities",
  "format_card_overrides",
  "goal_templates", "league_economy_defaults", "league_members", "leagues",
  "mini_game_catalog", "mini_game_daily_seeds", "mini_game_reward_config",
  "perk_config", "profile_titles", "profiles",
  "season_bonus_config", "season_path_tiers", "season_path_xp_sources", "seasons",
  "settings",
  "shop_pack_types", "shop_rotation_cards", "shop_rotations",
  "shop_special_pack_definitions", "shop_special_pack_pool_cards",
  "shop_special_pack_rotations", "shop_special_pack_slots",
  "wallets", "weekly_goal_config",
];

// A foreign key to one of these becomes this readable label.
const LABELS = {
  card_catalog: "name",
  boss_routes: "code",
  achievements: "key",
  shop_special_pack_definitions: "code",
  archetype_registry: "name",
  duelist_circle_formats: "code",
  mini_game_catalog: "game_key",
};
const IGNORED = /(^id$|_at$|^created_by$|^updated_by$|_by$|^league_id$|^profile_id$)/;

async function columnsOf(sql, table) {
  const rows = await sql`
    select a.attname as name, t.typname as type,
      (select cf.relname from pg_constraint k join pg_class cf on cf.oid = k.confrelid
       where k.conrelid = a.attrelid and k.contype = 'f' and array_length(k.conkey, 1) = 1 and k.conkey[1] = a.attnum limit 1) as target
    from pg_attribute a join pg_type t on t.oid = a.atttypid
    where a.attrelid = ${`public.${table}`}::regclass and a.attnum > 0 and not a.attisdropped
    order by a.attname`;

  return rows;
}

async function rowsOf(sql, table) {
  const exists = await sql`select to_regclass(${`public.${table}`}) as t`;

  if (!exists[0].t) {
    return null;
  }

  const count = Number((await sql.unsafe(`select count(*) as c from public.${table}`))[0].c);

  if (COUNT_ONLY.has(table)) {
    return { count, rows: null };
  }

  const columns = await columnsOf(sql, table);
  const pieces = [];

  for (const col of columns) {
    if (IGNORED.test(col.name)) {
      continue;
    }

    if (col.type === "uuid" && col.target && LABELS[col.target]) {
      pieces.push(`'${col.name}', (select x.${LABELS[col.target]} from public.${col.target} x where x.id = t.${col.name})`);
    } else if (col.type === "uuid" && col.target === "boss_route_stages") {
      pieces.push(`'${col.name}', (select r.code || ':' || s.stage_number from public.boss_route_stages s join public.boss_routes r on r.id = s.route_id where s.id = t.${col.name})`);
    } else if (col.type === "uuid") {
      continue;
    } else {
      pieces.push(`'${col.name}', t.${col.name}`);
    }
  }

  const rows = pieces.length === 0
    ? []
    : await sql.unsafe(`select jsonb_build_object(${pieces.join(", ")})::text as j from public.${table} t`);

  return { count, rows: rows.map((r) => r.j) };
}

const a = postgres(urlA, { max: 1, onnotice: () => {} });
const b = postgres(urlB, { max: 1, onnotice: () => {} });
let diffs = 0;

for (const table of only.length ? only : TABLES) {
  const [left, right] = [await rowsOf(a, table), await rowsOf(b, table)];

  if (!left || !right) {
    console.log(`DIFF ${table}: table missing on ${left ? "B" : "A"}`);
    diffs += 1;
    continue;
  }

  if (!left.rows) {
    console.log(`${left.count === right.count ? "ok  " : "info"} ${table}: ${left.count} vs ${right.count} rows (count only)`);
    continue;
  }

  const bag = (rows) => rows.reduce((m, r) => m.set(r, (m.get(r) ?? 0) + 1), new Map());
  const [la, lb] = [bag(left.rows), bag(right.rows)];
  const onlyA = [...la.keys()].filter((k) => la.get(k) !== lb.get(k));
  const onlyB = [...lb.keys()].filter((k) => la.get(k) !== lb.get(k));

  if (onlyA.length === 0 && onlyB.length === 0) {
    console.log(`ok   ${table}: ${left.count} rows identical`);
    continue;
  }

  diffs += 1;
  console.log(`DIFF ${table}: ${left.count} vs ${right.count} rows (${onlyA.length} differ on A, ${onlyB.length} on B)`);

  for (const r of onlyA.slice(0, 3)) console.log(`     A: ${r.slice(0, 700)}`);
  for (const r of onlyB.slice(0, 3)) console.log(`     B: ${r.slice(0, 700)}`);
}

await a.end();
await b.end();

console.log(diffs === 0 ? "\nConfig data identical." : `\n${diffs} table(s) differ.`);
process.exitCode = diffs === 0 ? 0 : 1;
