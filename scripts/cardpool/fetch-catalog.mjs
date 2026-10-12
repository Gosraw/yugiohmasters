#!/usr/bin/env node
// =========================================================
// Fetch a full card-catalog snapshot from the public YGOPRODeck API.
//
//   node scripts/cardpool/fetch-catalog.mjs            # fetch (skips if snapshot <24h old)
//   node scripts/cardpool/fetch-catalog.mjs --force    # always re-download
//
// Writes data/external/ygoprodeck-cardinfo.json (git-ignored; see
// .gitignore `data/external/`). `misc=yes` adds per-card `misc_info`
// with `tcg_date`, `ocg_date`, `formats` (incl. "Master Duel"),
// `md_rarity`, `konami_id`, etc. - everything
// scripts/cardpool/build-pool.mjs needs. No Supabase access, no deps.
//
// YGOPRODeck asks clients to cache and not hammer the API (rate limit
// ~20 req/s); this script makes exactly one request per run.
// =========================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "data", "external", "ygoprodeck-cardinfo.json");
const URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes";
const VERSION_URL = "https://db.ygoprodeck.com/api/v7/checkDBVer.php";

const force = process.argv.includes("--force");

if (!force && fs.existsSync(OUT)) {
  const ageH = (Date.now() - fs.statSync(OUT).mtimeMs) / 3.6e6;
  if (ageH < 24) {
    console.log(`Snapshot is ${ageH.toFixed(1)}h old - skipping (use --force to re-download).`);
    process.exit(0);
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });

let dbVersion = null;
try {
  const v = await fetch(VERSION_URL).then((r) => r.json());
  dbVersion = Array.isArray(v) ? v[0] : v;
} catch (e) {
  console.warn(`Could not read DB version (${e.message}) - continuing.`);
}

console.log(`Downloading ${URL} ...`);
const res = await fetch(URL, { headers: { "User-Agent": "duelist-circle-cardpool/1.0" } });
if (!res.ok) throw new Error(`HTTP ${res.status} from YGOPRODeck`);
const body = await res.json();
if (!Array.isArray(body?.data) || body.data.length < 10000) {
  throw new Error(`Unexpected payload: ${body?.data?.length ?? "no"} cards`);
}

const snapshot = {
  source_url: URL,
  fetched_at: new Date().toISOString(),
  db_version: dbVersion,
  card_count: body.data.length,
  data: body.data,
};
fs.writeFileSync(OUT, JSON.stringify(snapshot));
const mb = (fs.statSync(OUT).size / 1e6).toFixed(1);
console.log(`Wrote ${snapshot.card_count} cards (${mb} MB) to ${path.relative(ROOT, OUT)}`);
