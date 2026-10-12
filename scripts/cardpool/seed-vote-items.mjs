#!/usr/bin/env node
// scripts/cardpool/seed-vote-items.mjs
//
// Loads data/cardpool/ranking-vote-lists.json (made by
// scripts/cardpool/rank-pool.mjs) into public.card_vote_items for one
// league - the items the group votes on at /vote.
//
//   node scripts/cardpool/seed-vote-items.mjs
//   SEED_DB_URL=postgres://postgres@127.0.0.1:54322/postgres \
//     node scripts/cardpool/seed-vote-items.mjs --league <uuid> [--prune]
//
// LOCAL TEST DATABASE ONLY. Refuses any database host other than
// 127.0.0.1 / localhost, so it can never touch production.
//
// - League: --league <uuid>, else LEAGUE_ID, else the only league in
//   the database (refuses if there are several).
// - Idempotent: re-running updates the existing items in place
//   (matched on league + card), so votes already cast are kept.
// - --prune also deletes items that are no longer in the JSON (and,
//   through the foreign key, their votes).

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const ROOT = path.resolve(import.meta.dirname, "../..");
const DEFAULT_DB_URL = "postgres://postgres@127.0.0.1:54322/postgres";
const DB_URL = process.env.SEED_DB_URL || DEFAULT_DB_URL;

function argValue(flag) {
  const index = process.argv.indexOf(flag);

  return index >= 0 ? process.argv[index + 1] : undefined;
}

const host = new URL(DB_URL).hostname;

if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(host)) {
  console.error(`Refusing to seed ${host}: this script only writes to the local test database (127.0.0.1).`);
  process.exit(1);
}

const voteLists = JSON.parse(
  readFileSync(path.join(ROOT, "data/cardpool/ranking-vote-lists.json"), "utf8")
);

const sql = postgres(DB_URL, {
  max: 1,
  onnotice: () => {},
});

try {
  let leagueId = argValue("--league") || process.env.LEAGUE_ID;

  if (!leagueId) {
    const leagues = await sql`select id, name from public.leagues where archived_at is null`;

    if (leagues.length !== 1) {
      throw new Error(`Found ${leagues.length} leagues - pass --league <uuid>`);
    }

    leagueId = leagues[0].id;
    console.log(`League: ${leagues[0].name} (${leagueId})`);
  }

  const rows = [];

  voteLists.lists.forEach((list, listIndex) => {
    for (const item of list.items) {
      if (!item.vote_here) continue;

      rows.push({
        list_key: list.key,
        list_title: list.title,
        list_order: listIndex + 1,
        external_card_id: item.id,
        proposed_verdict: item.proposed_verdict,
        context: item.context,
        sort_order: item.sort_order,
      });
    }
  });

  const catalogRows = await sql`
    select id, external_card_id
    from public.card_catalog
    where external_card_id in ${sql(rows.map((r) => r.external_card_id))}
  `;
  const catalogId = new Map(catalogRows.map((r) => [Number(r.external_card_id), r.id]));
  const missing = rows.filter((r) => !catalogId.has(r.external_card_id));

  if (missing.length) {
    console.warn(`Skipping ${missing.length} card(s) not in card_catalog: ${missing.map((r) => r.external_card_id).join(", ")}`);
  }

  const items = rows
    .filter((r) => catalogId.has(r.external_card_id))
    .map(({ external_card_id, ...r }) => ({
      ...r,
      league_id: leagueId,
      card_catalog_id: catalogId.get(external_card_id),
    }));

  await sql.begin(async (tx) => {
    await tx`
      insert into public.card_vote_items ${tx(items, "league_id", "list_key", "list_title", "list_order", "card_catalog_id", "proposed_verdict", "context", "sort_order")}
      on conflict (league_id, card_catalog_id) do update set
        list_key = excluded.list_key,
        list_title = excluded.list_title,
        list_order = excluded.list_order,
        proposed_verdict = excluded.proposed_verdict,
        context = excluded.context,
        sort_order = excluded.sort_order
    `;

    if (process.argv.includes("--prune")) {
      const removed = await tx`
        delete from public.card_vote_items
        where league_id = ${leagueId}
          and not (card_catalog_id = any(${items.map((i) => i.card_catalog_id)}::uuid[]))
        returning id
      `;
      console.log(`Pruned ${removed.length} item(s).`);
    }
  });

  const [{ count }] = await sql`select count(*)::int as count from public.card_vote_items where league_id = ${leagueId}`;
  console.log(`Seeded ${items.length} vote items into ${voteLists.lists.length} lists; league now has ${count}.`);
} finally {
  await sql.end();
}
