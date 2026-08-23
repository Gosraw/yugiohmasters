#!/usr/bin/env node
// =========================================================
// CARD RELEASE DATE BACKFILL
//
// card_catalog.release_date (added by
// 202608231500_duelist_circle_format_engine.sql) is NULL for
// every row today. scripts/sync-cards.mjs fetches YGOPRODeck's
// cardinfo.php WITHOUT `&misc=yes`, so raw_data never contains
// the `tcg_date` field this needs - confirmed by reading that
// script directly, not guessed. This script re-fetches with
// misc=yes and backfills release_date/release_date_source from
// the real tcg_date YGOPRODeck reports, for every card already in
// card_catalog (matched by external_card_id - it never inserts
// new cards, only fills in a date on existing rows).
//
// Needed before the format cutoff comparison
// (scripts/audit-format-cutoffs.mjs) can produce real numbers -
// is_duelist_circle_format_eligible()'s release_cutoff check is a
// no-op for every card until release_date is populated (a NULL
// release_date is deliberately never excluded on cutoff grounds
// alone - see that function's comments).
//
// This script could NOT be run against the real YGOPRODeck API or
// a real Supabase project during this session (no network access
// in this sandbox - confirmed via direct curl attempts against
// db.ygoprodeck.com from both the cloud sandbox and the device
// bridge). It is written, syntax-checked, and ready to run in the
// operator's own environment (Phase B+ in the runbook) - it has
// NOT been executed against real data.
//
// Usage:
//   node scripts/sync-card-release-dates.mjs [--limit N] [--dry-run]
// =========================================================

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const YGOPRODECK_URL =
  "https://db.ygoprodeck.com/api/v7/cardinfo.php?format=tcg&misc=yes";

function parseArgs(argv) {
  const args = { limit: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") {
      args.limit = Number(argv[i + 1]);
      i++;
    } else if (argv[i] === "--dry-run") {
      args.dryRun = true;
    }
  }
  return args;
}

async function fetchAllCatalogRows() {
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("card_catalog")
      .select("id,external_card_id,release_date")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Fetching card_catalog failed: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log("Fetching YGOPRODeck data with misc=yes (needed for tcg_date) ...");
  const response = await fetch(YGOPRODECK_URL);
  if (!response.ok) {
    console.error(`YGOPRODeck request failed: HTTP ${response.status}`);
    process.exit(1);
  }
  const payload = await response.json();
  const ygoCards = payload.data ?? [];
  console.log(`Fetched ${ygoCards.length} cards from YGOPRODeck.`);

  // Map by YGOPRODeck's own numeric id (the same value stored as
  // card_catalog.external_card_id - confirmed by reading
  // scripts/sync-cards.mjs, which inserts external_card_id from
  // this exact same `id` field).
  //
  // NOTE ON tcg_date's EXACT LOCATION IN THE RESPONSE: YGOPRODeck's
  // own API guide (https://ygoprodeck.com/api-guide/) confirms
  // misc=yes adds a `tcg_date` field ("the original date the card
  // was released in the TCG") but this session had no network
  // access to fetch one real sample response and see its exact
  // shape - most third-party YGOPRODeck clients read it from a
  // `misc_info` array (`card.misc_info[0].tcg_date`), so that is
  // checked first, with a plain top-level `card.tcg_date` as a
  // fallback. BEFORE relying on this script, run it once with
  // --dry-run --limit 5 and inspect the "known tcg_date" count - if
  // it's suspiciously low/zero versus the fetched card count,
  // console.log(JSON.stringify(ygoCards[0], null, 2)) one raw card
  // to see the real field name and fix the lookup below.
  const dateById = new Map();
  for (const card of ygoCards) {
    const tcgDate = card.misc_info?.[0]?.tcg_date ?? card.tcg_date;
    if (tcgDate) {
      dateById.set(card.id, tcgDate);
    }
  }
  console.log(`${dateById.size} of those cards have a known tcg_date.`);

  console.log("Fetching current card_catalog rows ...");
  const catalogRows = await fetchAllCatalogRows();
  console.log(`${catalogRows.length} rows in card_catalog.`);

  const toUpdate = [];
  let alreadySet = 0;
  let noMatch = 0;
  for (const row of catalogRows) {
    if (row.release_date) {
      alreadySet++;
      continue;
    }
    const tcgDate = dateById.get(row.external_card_id);
    if (!tcgDate) {
      noMatch++;
      continue;
    }
    toUpdate.push({ id: row.id, release_date: tcgDate });
  }

  console.log(`\nAlready had a release_date: ${alreadySet}`);
  console.log(`No matching tcg_date found (left NULL - never guessed): ${noMatch}`);
  console.log(`Will be backfilled: ${toUpdate.length}`);

  if (args.dryRun) {
    console.log("\n--dry-run: no writes performed.");
    return;
  }

  const limited = args.limit ? toUpdate.slice(0, args.limit) : toUpdate;
  const BATCH_SIZE = 200;
  let written = 0;
  for (let i = 0; i < limited.length; i += BATCH_SIZE) {
    const batch = limited.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      const { error } = await supabase
        .from("card_catalog")
        .update({
          release_date: row.release_date,
          release_date_source: "ygoprodeck_tcg_date",
        })
        .eq("id", row.id)
        .is("release_date", null); // idempotent - never overwrites a manually-set date
      if (error) {
        console.error(`Failed to update ${row.id}: ${error.message}`);
        continue;
      }
      written++;
    }
    console.log(`  ${written}/${limited.length} written`);
  }

  console.log(`\nDone. ${written} card_catalog row(s) backfilled with a real release_date.`);
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
