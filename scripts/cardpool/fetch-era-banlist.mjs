#!/usr/bin/env node
// =========================================================
// Build data/banlists/tcg-2014-10.json from Yugipedia's raw wikitext
// for "October 2014 Lists (TCG)" - the official TCG Forbidden &
// Limited list effective 2014-10-01, superseded by the January 2015
// list on 2015-01-01 (i.e. the list in force at the end of 2014).
//
//   node scripts/cardpool/fetch-era-banlist.mjs
//
// Cross-checks every name against the catalog snapshot
// (data/external/ygoprodeck-cardinfo.json, run fetch-catalog.mjs first)
// and prints any name that does not match exactly.
// =========================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAGE = "October_2014_Lists_(TCG)";
const RAW_URL = `https://yugipedia.com/index.php?title=${PAGE}&action=raw`;
const OUT = path.join(ROOT, "data", "banlists", "tcg-2014-10.json");
const CATALOG = path.join(ROOT, "data", "external", "ygoprodeck-cardinfo.json");

const res = await fetch(RAW_URL, { headers: { "User-Agent": "duelist-circle-cardpool/1.0 (research)" } });
if (!res.ok) throw new Error(`HTTP ${res.status} from Yugipedia`);
const wikitext = await res.text();
fs.writeFileSync(path.join(ROOT, "data", "external", "yugipedia-oct2014-tcg.txt"), wikitext);

// Yugipedia page titles cannot contain "#", so a few names are written
// differently there than on the printed card / official list.
const OFFICIAL_NAME = { "Morphing Jar 2": "Morphing Jar #2" };

function section(key) {
  const m = wikitext.match(new RegExp(`\\|\\s*${key}\\s*=\\s*\\n([\\s\\S]*?)(?=\\n\\|\\s*\\w+\\s*=|\\n\\}\\})`));
  if (!m) return [];
  return m[1]
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter(Boolean)
    .map((n) => OFFICIAL_NAME[n] ?? n);
}
const field = (key) => wikitext.match(new RegExp(`\\|\\s*${key}\\s*=\\s*(.+)`))?.[1]?.trim();

const toIso = (s) => {
  const d = new Date(`${s} UTC`);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
};

const list = {
  name: "TCG Forbidden & Limited List - October 2014",
  medium: field("medium") ?? "TCG",
  format: field("format") ?? "Advanced Format",
  effective_from: toIso(field("start_date")),
  effective_to: toIso(field("end_date")),
  superseded_by: field("next"),
  source_url: "https://yugipedia.com/wiki/October_2014_Lists_(TCG)",
  official_source_url: "http://www.yugioh-card.com/en/limited/Oct_2014.html",
  retrieved_at: new Date().toISOString().slice(0, 10),
  forbidden: section("forbidden"),
  limited: section("limited"),
  semi_limited: section("semi_limited"),
  no_longer_on_list: section("no_longer_on_list"),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(list, null, 2) + "\n");
console.log(
  `Wrote ${path.relative(ROOT, OUT)}: ${list.forbidden.length} forbidden, ${list.limited.length} limited, ${list.semi_limited.length} semi-limited (${list.effective_from} .. ${list.effective_to}).`,
);

if (fs.existsSync(CATALOG)) {
  const names = new Set(JSON.parse(fs.readFileSync(CATALOG, "utf8")).data.map((c) => c.name));
  const missing = [...list.forbidden, ...list.limited, ...list.semi_limited].filter((n) => !names.has(n));
  console.log(missing.length ? `Names NOT found in catalog snapshot: ${missing.join(" | ")}` : "All names match the catalog snapshot exactly.");
} else {
  console.log("No catalog snapshot - run fetch-catalog.mjs to cross-check names.");
}
