#!/usr/bin/env node
// scripts/cardpool/build-v2-format-migration.mjs
//
// Emits the DATA migration for the Duelist Circle Classic v2 format
// (schema + rules: supabase/migrations/202610121010_classic_v2_banlist_
// and_format_schema.sql). Pure generator: offline, never touches a
// database.
//
// Inputs
//   data/cardpool/classic-v2-pool.json        6,236 pool cards, 6,136 playable
//   data/cardpool/ranking-v2.json             proposed rarity per playable card
//   data/banlists/tcg-2014-10.json            official TCG list Oct 2014
//   data/banlists/duelist-circle-proposal.json our "unfair card" proposal
//   data/external/ygoprodeck-cardinfo.json    snapshot (git-ignored; fetch
//                                             with scripts/cardpool/fetch-catalog.mjs)
//                                             - only for the catalog additions
//
// Output (one transaction, re-runnable: every table is replaced for
// this format, the format row is upserted without touching is_active)
//   1. card_catalog additions: playable pool cards missing from a
//      TCG-only catalog (old OCG-only cards that exist in Master Duel,
//      e.g. 30,000-Year White Turtle). Inserted with
//      format_eligible = false and master_duel_status = 'unknown', so
//      the live app never offers them until Classic v2 is activated.
//   2. duelist_circle_formats row 'duelist_circle_classic_v2' - INACTIVE,
//      curated_pool_only = true, boss_route_exempt = <flag>.
//   3. format_card_overrides: one 'include' per playable pool card
//      (exactly 6,136) - the curated pool.
//   4. duelist_circle_card_limits: our banlist. A proposal verdict
//      overrides the 2014 status; 'legendary_unique' is NOT a deck
//      limit (it is rarity Legendary = 1 per league) so it gets no row.
//      forbidden = 0, limited / limited_1_per_deck = 1, semi = 2.
//   5. duelist_circle_proposed_rarities: ranking-v2 proposal (live
//      game_rarity untouched; launch night copies it over).
//   6. Assertions: the migration raises (and rolls back) when any count
//      differs from what this script computed.
//
// Usage
//   node scripts/cardpool/build-v2-format-migration.mjs [options]
//     --out <path>                 default supabase/migrations/202610121030_classic_v2_format_seed.sql
//     --no-boss-route-exemption    boss_route_exempt = false (default: true)
//     --skip-catalog-additions     don't emit card_catalog inserts (snapshot not needed);
//                                  the include-count assertion then only
//                                  passes on a catalog that already has them
//
// After the group vote: edit the two banlist JSON files / rerun
// scripts/cardpool/build-pool.mjs + rank-pool.mjs, then rerun this with
// a NEW --out file name (e.g. ..._classic_v2_format_after_vote.sql);
// applying it replaces the format's includes / limits / rarities.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { findUnsafeSqlLiteral } from "../generate-archetype-registry-migration.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const FORMAT_CODE = "duelist_circle_classic_v2";
const RARITIES = ["Legendary", "Secret Rare", "Ultra Rare", "Super Rare", "Rare", "Normal"];

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};

const OUT = path.resolve(ROOT, option("--out", "supabase/migrations/202610121030_classic_v2_format_seed.sql"));
const BOSS_ROUTE_EXEMPT = !flag("--no-boss-route-exemption");
const SKIP_CATALOG_ADDITIONS = flag("--skip-catalog-additions");

const readJson = (relative) => JSON.parse(readFileSync(path.join(ROOT, relative), "utf8"));

function sqlQuote(value) {
  if (value === null || value === undefined) {
    return "null";
  }

  const text = String(value);

  if (text.includes("\u0000")) {
    throw new Error("NUL byte in SQL string");
  }

  return `'${text.replaceAll("'", "''")}'`;
}

const sqlInt = (value) => {
  if (value === null || value === undefined) {
    return "null";
  }

  if (!Number.isInteger(value)) {
    throw new Error(`not an integer: ${value}`);
  }

  return String(value);
};

const bigintArray = (ids) => `array[${ids.map(sqlInt).join(",")}]::bigint[]`;

// ---------------------------------------------------------
// Load + compute
// ---------------------------------------------------------

const pool = readJson("data/cardpool/classic-v2-pool.json");
const ranking = readJson("data/cardpool/ranking-v2.json");
const tcg2014 = readJson("data/banlists/tcg-2014-10.json");
const proposal = readJson("data/banlists/duelist-circle-proposal.json");

const playable = pool.cards.filter((card) => card.playable);
const poolByName = new Map(pool.cards.map((card) => [card.name, card]));

if (playable.length !== pool.summary.pool_playable) {
  throw new Error(`pool summary says ${pool.summary.pool_playable} playable, cards[] has ${playable.length}`);
}

// --- banlist -----------------------------------------------

const ERA_LIMIT = { forbidden: 0, limited: 1, semi_limited: 2 };
const PROPOSAL_LIMIT = { forbidden: 0, limited_1_per_deck: 1, legendary_unique: null };

const limits = new Map(); // name -> {max, source, note}

for (const [status, max] of Object.entries(ERA_LIMIT)) {
  for (const name of tcg2014[status]) {
    limits.set(name, {
      max,
      source: "2014_tcg",
      note: `TCG list Oct 2014: ${status.replace("_", "-")}`,
    });
  }
}

for (const entry of proposal.entries) {
  if (!(entry.verdict in PROPOSAL_LIMIT)) {
    throw new Error(`unknown proposal verdict ${entry.verdict} (${entry.name})`);
  }

  const max = PROPOSAL_LIMIT[entry.verdict];

  if (max === null) {
    // Legendary = 1 per league through rarity copy limits, not a
    // deck limit. Overrides (removes) any 2014 status.
    limits.delete(entry.name);
    continue;
  }

  limits.set(entry.name, {
    max,
    source: "proposal",
    note: `${entry.verdict} (${entry.category}, ${entry.confidence}): ${entry.reason}`,
  });
}

// Only cards in the pool matter: everything else is ineligible anyway.
const limitRows = [];
const limitsOutsidePool = [];

for (const [name, limit] of limits) {
  const card = poolByName.get(name);

  if (!card) {
    limitsOutsidePool.push(name);
    continue;
  }

  // Cross-check with build-pool.mjs's own verdicts.
  const expectedMax = card.playable ? card.max_copies_per_deck : 0;

  if (expectedMax !== limit.max) {
    throw new Error(`${name}: limit ${limit.max} but classic-v2-pool.json says ${expectedMax} (${card.final_status}) - rerun build-pool.mjs?`);
  }

  limitRows.push({ id: card.id, name, ...limit });
}

const forbiddenInPool = pool.cards.filter((card) => !card.playable).length;
const forbiddenRows = limitRows.filter((row) => row.max === 0).length;

if (forbiddenRows !== forbiddenInPool) {
  throw new Error(`${forbiddenRows} forbidden limit rows vs ${forbiddenInPool} non-playable pool cards`);
}

limitRows.sort((a, b) => a.name.localeCompare(b.name));

// --- rarities ------------------------------------------------

const playableIds = new Set(playable.map((card) => card.id));
const rarityRows = ranking.cards.map((card) => {
  if (!RARITIES.includes(card.proposed_rarity)) {
    throw new Error(`${card.name}: unknown rarity ${card.proposed_rarity}`);
  }

  if (!playableIds.has(card.id)) {
    throw new Error(`${card.name} is ranked but not playable in the pool - rerun rank-pool.mjs`);
  }

  return card;
});

if (rarityRows.length !== playable.length) {
  throw new Error(`ranking has ${rarityRows.length} cards, pool has ${playable.length} playable`);
}

// --- catalog additions -----------------------------------------

function isTcgCard(card) {
  const info = card.misc_info?.[0];
  return Boolean(info?.tcg_date) || (info?.formats ?? []).includes("TCG");
}

let catalogAdditions = [];

if (!SKIP_CATALOG_ADDITIONS) {
  const snapshotPath = path.join(ROOT, "data/external/ygoprodeck-cardinfo.json");

  if (!existsSync(snapshotPath)) {
    throw new Error("No snapshot - run node scripts/cardpool/fetch-catalog.mjs (or pass --skip-catalog-additions)");
  }

  const snapshot = new Map(JSON.parse(readFileSync(snapshotPath, "utf8")).data.map((card) => [card.id, card]));

  // scripts/sync-cards.mjs (production) and the devstack seed both keep
  // TCG cards only, so these are exactly the pool cards they miss.
  catalogAdditions = playable
    .map((card) => {
      const raw = snapshot.get(card.id);

      if (!raw) {
        throw new Error(`${card.name} (${card.id}) not in snapshot`);
      }

      return raw;
    })
    .filter((raw) => !isTcgCard(raw))
    .map((raw) => {
      const type = raw.type ?? "";
      const image = raw.card_images?.[0];
      const info = raw.misc_info?.[0] ?? {};

      return {
        external_card_id: raw.id,
        name: raw.name,
        card_type: type || "Unknown",
        frame_type: raw.frameType ?? null,
        monster_type: raw.typeline?.join(" / ") ?? null,
        race: raw.race ?? null,
        attribute: raw.attribute ?? null,
        level: type.includes("XYZ") || type.includes("Link") ? null : raw.level ?? null,
        rank: type.includes("XYZ") ? raw.level ?? null : null,
        atk: raw.atk ?? null,
        def: raw.def ?? null,
        description: raw.desc ?? null,
        archetype: raw.archetype ?? null,
        image_url: image?.image_url ?? null,
        image_url_small: image?.image_url_small ?? null,
        image_url_cropped: image?.image_url_cropped ?? null,
        release_date: info.tcg_date ?? info.ocg_date ?? null,
        release_date_source: info.tcg_date ? "ygoprodeck_tcg_date" : "ygoprodeck_ocg_date",
      };
    });
}

// ---------------------------------------------------------
// Emit SQL
// ---------------------------------------------------------

const count = (rows, fn) => rows.filter(fn).length;
const limitSummary = `${count(limitRows, (r) => r.max === 0)} forbidden / ${count(limitRows, (r) => r.max === 1)} limited / ${count(limitRows, (r) => r.max === 2)} semi-limited`;
const raritySummary = RARITIES.map((rarity) => `${rarity} ${count(rarityRows, (r) => r.proposed_rarity === rarity)}`).join(", ");

const out = [];
const emit = (text = "") => out.push(text);

emit(`-- =========================================================
-- GENERATED by scripts/cardpool/build-v2-format-migration.mjs
-- on ${new Date().toISOString()} - do not edit by hand; edit the JSON
-- inputs and regenerate (with a new file name once this one is
-- applied anywhere).
--
-- Duelist Circle Classic v2 format DATA (schema: 202610121010).
--   pool:       ${playable.length} playable cards (data/cardpool/classic-v2-pool.json, ${pool.summary.generated_at})
--   banlist:    ${limitRows.length} rows - ${limitSummary}
--               (2014 TCG list + proposal; ${limitsOutsidePool.length} listed cards are outside the pool and skipped)
--   rarities:   ${raritySummary}
--               (data/cardpool/ranking-v2.json, ${ranking.summary.generated_at}) - PROPOSED only,
--               live card_catalog.game_rarity is not touched
--   catalog:    ${catalogAdditions.length} card_catalog additions (OCG-only cards that exist in Master Duel)
--   boss_route_exempt = ${BOSS_ROUTE_EXEMPT} (OWNER DECISION PENDING; regenerate with
--               --no-boss-route-exemption to turn it off, or update the format row)
--
-- The format row is created INACTIVE. Nothing the live app offers
-- changes until scripts/season2/reset-and-activate.sql activates it.
-- =========================================================

begin;
`);

// 1. catalog additions
emit(`-- ---------------------------------------------------------
-- 1. card_catalog additions (format_eligible = false until activation)
-- ---------------------------------------------------------
`);

if (catalogAdditions.length > 0) {
  const columns = Object.keys(catalogAdditions[0]);
  emit(`insert into public.card_catalog (${columns.join(", ")}, format_eligible, format_exclusion_reason)`);
  emit("values");
  emit(catalogAdditions.map((row) => {
    const values = columns.map((column) => {
      const value = row[column];
      if (["level", "rank", "atk", "def", "external_card_id"].includes(column)) {
        return sqlInt(value);
      }
      if (column === "release_date") {
        return value === null ? "null" : `${sqlQuote(value)}::date`;
      }
      return sqlQuote(value);
    });
    return `  (${values.join(", ")}, false, ${sqlQuote(`Classic v2 catalog addition - eligible once ${FORMAT_CODE} is active`)})`;
  }).join(",\n"));
  emit("on conflict (external_card_id) do nothing;");
  emit();
} else {
  emit("-- (none)\n");
}

// 2. format row
emit(`-- ---------------------------------------------------------
-- 2. Format row (inactive; is_active is never touched on re-run)
-- ---------------------------------------------------------

insert into public.duelist_circle_formats (
  code, name, version,
  release_cutoff,
  allow_illusion, allow_synchro, allow_xyz, allow_link, allow_pendulum, allow_fusion,
  current_release_stage,
  is_active,
  curated_pool_only,
  boss_route_exempt,
  notes
)
values (
  ${sqlQuote(FORMAT_CODE)},
  'Duelist Circle Classic (Season 2)',
  2,
  '2014-12-31',
  false, false, true, false, false, true,
  1,
  false,
  true,
  ${BOSS_ROUTE_EXEMPT},
  ${sqlQuote(`Season 2 / Duelist Circle 2.0 pool. Eligibility = exactly the ${playable.length} playable cards of data/cardpool/classic-v2-pool.json (include overrides, curated_pool_only). Banlist = duelist_circle_card_limits (Oct 2014 TCG list + group proposal). Proposed rarities in duelist_circle_proposed_rarities. Master Duel: only not_available blocks (Unlimited rooms). boss_route_exempt: Boss evolution monsters + route-exclusive grants are deck-legal and exempt from deck limits, but never offered by draft/shop (owner decision pending). Generated by scripts/cardpool/build-v2-format-migration.mjs.`)}
)
on conflict (code) do update
set
  name = excluded.name,
  version = excluded.version,
  release_cutoff = excluded.release_cutoff,
  allow_illusion = excluded.allow_illusion,
  allow_synchro = excluded.allow_synchro,
  allow_xyz = excluded.allow_xyz,
  allow_link = excluded.allow_link,
  allow_pendulum = excluded.allow_pendulum,
  allow_fusion = excluded.allow_fusion,
  curated_pool_only = excluded.curated_pool_only,
  boss_route_exempt = excluded.boss_route_exempt,
  notes = excluded.notes,
  updated_at = now();
`);

// 3. includes
const poolIds = playable.map((card) => card.id).sort((a, b) => a - b);

emit(`-- ---------------------------------------------------------
-- 3. Curated pool: one include per playable card (${poolIds.length})
-- ---------------------------------------------------------

delete from public.format_card_overrides o
using public.duelist_circle_formats f
where o.format_id = f.id
  and f.code = ${sqlQuote(FORMAT_CODE)};

insert into public.format_card_overrides (format_id, card_catalog_id, override_type, reason)
select f.id, c.id, 'include', 'Classic v2 pool (data/cardpool/classic-v2-pool.json)'
from public.duelist_circle_formats f
cross join unnest(${bigintArray(poolIds)}) as pool(external_card_id)
join public.card_catalog c on c.external_card_id = pool.external_card_id
where f.code = ${sqlQuote(FORMAT_CODE)};
`);

// 4. limits
emit(`-- ---------------------------------------------------------
-- 4. Banlist (${limitSummary})
-- ---------------------------------------------------------

delete from public.duelist_circle_card_limits
where format_code = ${sqlQuote(FORMAT_CODE)};

insert into public.duelist_circle_card_limits (format_code, card_catalog_id, max_copies, source, note)
select ${sqlQuote(FORMAT_CODE)}, c.id, v.max_copies, v.source, v.note
from (values
${limitRows.map((row) => `  (${sqlInt(row.id)}::bigint, ${sqlInt(row.max)}, ${sqlQuote(row.source)}, ${sqlQuote(`${row.name} - ${row.note}`)})`).join(",\n")}
) as v(external_card_id, max_copies, source, note)
join public.card_catalog c on c.external_card_id = v.external_card_id;
`);

// 5. rarities
emit(`-- ---------------------------------------------------------
-- 5. Proposed rarities (${raritySummary})
-- ---------------------------------------------------------

delete from public.duelist_circle_proposed_rarities
where format_code = ${sqlQuote(FORMAT_CODE)};
`);

for (const rarity of RARITIES) {
  const rows = rarityRows.filter((card) => card.proposed_rarity === rarity);

  if (rows.length === 0) {
    continue;
  }

  emit(`insert into public.duelist_circle_proposed_rarities (format_code, card_catalog_id, proposed_rarity, source, rank)
select ${sqlQuote(FORMAT_CODE)}, c.id, ${sqlQuote(rarity)}, 'ranking-v2', v.rank
from unnest(
  ${bigintArray(rows.map((card) => card.id))},
  array[${rows.map((card) => sqlInt(card.rank)).join(",")}]::integer[]
) as v(external_card_id, rank)
join public.card_catalog c on c.external_card_id = v.external_card_id;
`);
}

// 6. assertions
emit(`-- ---------------------------------------------------------
-- 6. Assertions (any mismatch aborts the whole migration)
-- ---------------------------------------------------------

do $$
declare
  v_format public.duelist_circle_formats;
  v_includes integer;
  v_limits integer;
  v_rarities integer;
begin
  select * into v_format from public.duelist_circle_formats where code = ${sqlQuote(FORMAT_CODE)};

  select count(*) into v_includes
  from public.format_card_overrides
  where format_id = v_format.id and override_type = 'include';

  select count(*) into v_limits
  from public.duelist_circle_card_limits
  where format_code = ${sqlQuote(FORMAT_CODE)};

  select count(*) into v_rarities
  from public.duelist_circle_proposed_rarities
  where format_code = ${sqlQuote(FORMAT_CODE)};

  if v_includes <> ${playable.length} then
    raise exception 'Classic v2 seed: % of ${playable.length} pool cards found in card_catalog (external_card_id mismatch?)', v_includes;
  end if;

  if v_limits <> ${limitRows.length} then
    raise exception 'Classic v2 seed: % of ${limitRows.length} banlist rows matched card_catalog', v_limits;
  end if;

  if v_rarities <> ${rarityRows.length} then
    raise exception 'Classic v2 seed: % of ${rarityRows.length} proposed rarities matched card_catalog', v_rarities;
  end if;

  raise notice 'Classic v2 seed OK: % includes, % banlist rows, % proposed rarities, boss_route_exempt=%, active=%',
    v_includes, v_limits, v_rarities, v_format.boss_route_exempt, v_format.is_active;
end;
$$;

commit;
`);

const sql = out.join("\n");
const unsafe = findUnsafeSqlLiteral(sql);

if (unsafe) {
  throw new Error(`refusing to write unsafe SQL: ${unsafe}`);
}

writeFileSync(OUT, sql);

console.log(`wrote ${path.relative(ROOT, OUT)} (${(sql.length / 1024).toFixed(0)} KB)`);
console.log(`  pool includes:      ${playable.length}`);
console.log(`  banlist rows:       ${limitRows.length} (${limitSummary})`);
console.log(`  outside pool:       ${limitsOutsidePool.length} (${limitsOutsidePool.join(", ")})`);
console.log(`  proposed rarities:  ${raritySummary}`);
console.log(`  catalog additions:  ${SKIP_CATALOG_ADDITIONS ? "skipped" : catalogAdditions.length}`);
console.log(`  boss_route_exempt:  ${BOSS_ROUTE_EXEMPT}`);
