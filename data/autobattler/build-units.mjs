#!/usr/bin/env node
// =========================================================
// SHADOW ARENA - unit list generator
//
//   node data/autobattler/build-units.mjs
//
// Reads the curated list below, looks every card up in the
// LOCAL devstack card_catalog (127.0.0.1:54322, never
// production) for attribute / race / level / ATK / DEF / image,
// checks it is in the Classic v2 pool, maps it to auto battler
// stats and writes data/autobattler/units.json.
//
// Stat mapping: every tier has a stat budget; the unit's ability
// "costs" a share of it; what is left is split between attack and
// health by the card's own ATK : DEF ratio (clamped so nothing is
// a 0-attack wall or a 1-health glass cannon by accident).
// Hand-tune a unit with `atk` / `hp` overrides in its row.
// =========================================================

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

import { BOSS_ROUTES } from "../boss-route-registry.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "data/autobattler/units.json");
const DB_URL = "postgres://postgres@127.0.0.1:54322/postgres";

// [name, tier, ability, power, extra]
//   rally: power = +X/+X to other allies sharing `by` (tribe | attribute)
//   lastwill / spawn / ambush / ascend: power = the number in the text
const UNITS = [
  // ---- Tier 1 ----
  ["Kuriboh", 1, "taunt", 0],
  ["Skull Servant", 1, "revive", 0],
  ["Apprentice Magician", 1, "rally", 1, { by: "tribe" }],
  ["Babycerasaurus", 1, "spawn", 1],
  ["Deep Sea Diva", 1, "spawn", 1],
  ["Jinzo #7", 1, "pierce", 0],
  ["Man-Eater Bug", 1, "ambush", 2],
  ["Ojama Yellow", 1, "taunt", 0],
  ["Penguin Soldier", 1, "ambush", 1],
  ["Baby Dragon", 1, "ascend", 1],
  ["Elemental HERO Burstinatrix", 1, "rally", 1, { by: "attribute" }],
  ["Spirit Reaper", 1, "shield", 0],
  ["Sangan", 1, "lastwill", 1],
  ["Raging Flame Sprite", 1, "double", 0],

  // ---- Tier 2 ----
  ["Armed Dragon LV3", 2, "ascend", 1],
  ["Mystic Tomato", 2, "spawn", 2],
  ["UFO Turtle", 2, "spawn", 2],
  ["Mother Grizzly", 2, "spawn", 2],
  ["Pyramid Turtle", 2, "lastwill", 2],
  ["Shining Angel", 2, "rally", 1, { by: "attribute" }],
  ["Marauding Captain", 2, "rally", 1, { by: "tribe" }],
  ["Harpie Lady", 2, "double", 0],
  ["Elemental HERO Avian", 2, "shield", 0],
  ["Breaker the Magical Warrior", 2, "ambush", 2],
  ["Goblin Zombie", 2, "revive", 0],
  ["Ancient Gear Soldier", 2, "taunt", 0],
  ["Witch of the Black Forest", 2, "lastwill", 2],
  ["Toon Mermaid", 2, "pierce", 0],

  // ---- Tier 3 ----
  ["Command Knight", 3, "rally", 2, { by: "tribe" }],
  ["Elemental HERO Clayman", 3, "taunt", 0],
  ["Vampire Lady", 3, "venom", 0],
  ["Crystal Beast Sapphire Pegasus", 3, "lastwill", 3],
  ["Zombie Master", 3, "spawn", 3],
  ["Skilled Dark Magician", 3, "ascend", 1],
  ["Kaiser Sea Horse", 3, "rally", 2, { by: "tribe" }],
  ["Archfiend Soldier", 3, "ambush", 3],
  ["D.D. Warrior Lady", 3, "shield", 0],
  ["Twin-Headed Behemoth", 3, "revive", 0],
  ["Cyber Harpie Lady", 3, "double", 0],
  ["Amphibious Bugroth MK-3", 3, "pierce", 0],
  ["Mirage Dragon", 3, "rally", 2, { by: "tribe" }],
  ["Blue Flame Swordsman", 3, "spawn", 3],

  // ---- Tier 4 ----
  ["Dark Magician Girl", 4, "rally", 2, { by: "tribe" }],
  ["Summoned Skull", 4, "pierce", 0],
  ["Jinzo", 4, "venom", 0],
  ["Chaos Sorcerer", 4, "ambush", 4],
  ["Ryu Kokki", 4, "taunt", 0],
  ["Harpie Lady Sisters", 4, "lastwill", 3],
  ["Elemental HERO Flame Wingman", 4, "double", 0],
  ["Dark Ruler Ha Des", 4, "rally", 2, { by: "tribe" }],
  ["Vampire Lord", 4, "revive", 0],
  ["Cyber Dragon", 4, "rally", 2, { by: "tribe" }],
  ["The Legendary Fisherman", 4, "shield", 0],
  ["Thestalos the Firestorm Monarch", 4, "ambush", 3],
  ["Armed Dragon LV5", 4, "ascend", 2],

  // ---- Tier 5 ----
  ["Dark Magician", 5, "pierce", 0],
  ["Red-Eyes Black Dragon", 5, "lastwill", 5],
  ["Buster Blader", 5, "venom", 0],
  ["Gaia The Fierce Knight", 5, "pierce", 0],
  ["Elemental HERO Neos", 5, "rally", 3, { by: "tribe" }],
  ["Harpie's Pet Dragon", 5, "rally", 3, { by: "attribute" }],
  ["Levia-Dragon - Daedalus", 5, "ambush", 6],
  ["Fortress Whale", 5, "taunt", 0],
  ["Machina Fortress", 5, "revive", 0],
  ["Black Tyranno", 5, "rally", 3, { by: "tribe" }],
  ["Cyber Twin Dragon", 5, "double", 0],
  ["Armed Dragon LV7", 5, "venom", 0],

  // ---- Tier 6 ----
  ["Blue-Eyes White Dragon", 6, "pierce", 0],
  ["Dark Magician of Chaos", 6, "venom", 0],
  ["Black Luster Soldier - Envoy of the Beginning", 6, "double", 0],
  ["Cyber End Dragon", 6, "pierce", 0],
  ["Ancient Gear Golem", 6, "taunt", 0],
  ["Despair from the Dark", 6, "revive", 0],
  ["Rainbow Dragon", 6, "ascend", 3],
  ["Galaxy-Eyes Photon Dragon", 6, "shield", 0],
  ["Destiny HERO - Dogma", 6, "lastwill", 6],
  ["Vampire Genesis", 6, "spawn", 5],
  ["Tyrant Dragon", 6, "ambush", 8],
];

// Combat keywords each Boss route leans on (bosses never use
// shop-only abilities like rally / ascend).
const ROUTE_KEYWORDS = {
  chaos_bls: ["venom", "double"],
  dark_magician: ["ambush", "shield"],
  elemental_hero: ["pierce", "lastwill"],
  blue_eyes: ["pierce", "taunt"],
  cyber_dragon: ["double", "spawn"],
  jinzo: ["shield", "venom"],
  armed_dragon_ojama: ["taunt", "ambush"],
  crystal_beast: ["lastwill", "revive"],
  red_eyes: ["ambush", "revive"],
  zombie: ["revive", "spawn"],
  dinosaur: ["pierce", "double"],
  legendary_fisherman: ["shield", "taunt"],
  machina: ["taunt", "shield"],
  toon: ["shield", "pierce"],
  harpie: ["double", "lastwill"],
  ancient_gear: ["taunt", "pierce"],
  galaxy_photon: ["shield", "ambush"],
  destiny_hero: ["revive", "lastwill"],
  vampire: ["venom", "revive"],
  cubic: ["spawn", "ambush"],
};

const TIER_BUDGET = [0, 6, 9, 12, 16, 21, 27];

// Share of the stat budget an ability costs.
const ABILITY_COST = {
  taunt: 0.05,
  shield: 0.22,
  revive: 0.25,
  pierce: 0.1,
  rally: 0.3,
  lastwill: 0.18,
  spawn: 0.3,
  double: 0.3,
  venom: 0.32,
  ascend: 0.35,
  ambush: 0.18,
};

const TRIBE_OF_RACE = {
  Dragon: "Dragon",
  "Sea Serpent": "Aqua",
  Aqua: "Aqua",
  Fish: "Aqua",
  Spellcaster: "Spellcaster",
  Warrior: "Warrior",
  "Beast-Warrior": "Warrior",
  Fiend: "Fiend",
  Zombie: "Zombie",
  Machine: "Machine",
  Beast: "Beast",
  "Winged Beast": "Beast",
  Insect: "Beast",
  Plant: "Beast",
  Dinosaur: "Beast",
  Reptile: "Beast",
};

function slug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function split(budget, cardAtk, cardDef, ability) {
  const total = (cardAtk ?? 0) + (cardDef ?? 0);
  let share = total > 0 ? Math.min(0.7, Math.max(0.3, (cardAtk ?? 0) / total)) : 0.5;
  // A Taunt unit's job is to soak hits: keep it health-heavy.
  if (ability === "taunt") {
    share = Math.min(share, 0.35);
  }
  const atk = Math.max(1, Math.round(budget * share));
  const hp = Math.max(1, budget - atk);
  return { atk, hp };
}

const sql = postgres(DB_URL, { max: 1 });

const pool = JSON.parse(readFileSync(path.join(ROOT, "data/cardpool/classic-v2-pool.json"), "utf8"));
const poolNames = new Set(pool.cards.map((card) => card.name.toLowerCase()));

async function lookup(names) {
  const rows = await sql`
    select name, attribute, race, level, atk, def, card_type, image_url_small, image_url_cropped
    from card_catalog
    where lower(name) in ${sql(names.map((name) => name.toLowerCase()))}
  `;
  return new Map(rows.map((row) => [row.name.toLowerCase(), row]));
}

const problems = [];

const unitRows = await lookup(UNITS.map((row) => row[0]));

const units = UNITS.map(([name, tier, ability, power, extra = {}]) => {
  const card = unitRows.get(name.toLowerCase());
  if (!card) {
    problems.push(`not in catalog: ${name}`);
    return null;
  }
  if (!poolNames.has(name.toLowerCase())) {
    problems.push(`not in Classic pool: ${name}`);
  }
  if (!card.image_url_small) {
    problems.push(`no image: ${name}`);
  }
  const budget = Math.round(TIER_BUDGET[tier] * (1 - ABILITY_COST[ability]));
  const stats = split(budget, card.atk, card.def, ability);
  return {
    id: slug(card.name),
    name: card.name,
    tier,
    attribute: card.attribute,
    race: card.race,
    tribe: TRIBE_OF_RACE[card.race] ?? null,
    level: card.level,
    cardAtk: card.atk,
    cardDef: card.def,
    atk: extra.atk ?? stats.atk,
    hp: extra.hp ?? stats.hp,
    ability,
    power,
    ...(ability === "rally" ? { rallyBy: extra.by } : {}),
    img: card.image_url_small,
    art: card.image_url_cropped ?? null,
  };
}).filter(Boolean);

for (const unit of units) {
  if (unit.ability === "rally" && unit.rallyBy === "tribe" && !unit.tribe) {
    problems.push(`tribe rally without tribe: ${unit.name}`);
  }
}

// ---- Boss routes ----
const routeNames = BOSS_ROUTES.flatMap((route) => [
  ...route.stages.map((stage) => stage.evolutionCard),
  ...route.supportGrants.map((grant) => grant.cardName),
]);
const routeRows = await lookup(routeNames);

const routes = BOSS_ROUTES.map((route) => {
  const bossName = route.stages.find((stage) => stage.isBoss)?.evolutionCard;
  const names = [
    ...route.stages.map((stage) => stage.evolutionCard),
    ...route.supportGrants.map((grant) => grant.cardName),
  ];
  const seen = new Set();
  const monsters = [];
  for (const name of names) {
    const card = routeRows.get(name.toLowerCase());
    if (!card || seen.has(card.name) || !/Monster/.test(card.card_type) || !card.image_url_small) {
      continue;
    }
    seen.add(card.name);
    monsters.push({
      name: card.name,
      attribute: card.attribute,
      race: card.race,
      level: card.level ?? card.rank ?? 4,
      cardAtk: card.atk ?? 0,
      cardDef: card.def ?? 0,
      boss: card.name === bossName,
      img: card.image_url_small,
      art: card.image_url_cropped ?? null,
    });
  }
  if (!monsters.some((monster) => monster.boss)) {
    problems.push(`route without boss card: ${route.code}`);
  }
  if (monsters.length < 4) {
    problems.push(`route with < 4 monsters: ${route.code} (${monsters.length})`);
  }
  const boss = monsters.filter((monster) => monster.boss);
  const rest = monsters
    .filter((monster) => !monster.boss)
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name));
  return {
    code: route.code,
    name: route.name,
    order: route.displayOrder,
    keywords: ROUTE_KEYWORDS[route.code],
    units: [...rest, ...boss],
  };
});

await sql.end();

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const byTier = {};
const byAttr = {};
const byTribe = {};
for (const unit of units) {
  byTier[unit.tier] = (byTier[unit.tier] ?? 0) + 1;
  byAttr[unit.attribute] = (byAttr[unit.attribute] ?? 0) + 1;
  byTribe[unit.tribe ?? "-"] = (byTribe[unit.tribe ?? "-"] ?? 0) + 1;
}

writeFileSync(
  OUT,
  `${JSON.stringify({ generatedBy: "data/autobattler/build-units.mjs", units, routes }, null, 1)}\n`
);

console.log(`wrote ${units.length} units, ${routes.length} routes -> ${path.relative(ROOT, OUT)}`);
console.log("tiers", byTier);
console.log("attributes", byAttr);
console.log("tribes", byTribe);
