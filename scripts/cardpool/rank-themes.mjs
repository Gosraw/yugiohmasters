// scripts/cardpool/rank-themes.mjs
//
// Boss Route THEME relevance, used only to build the per-route vote
// lists in data/cardpool/ranking-vote-lists.json ("which strong pool
// cards belong to this route's theme?").
//
// This is NOT valuation. Nothing here feeds draftValue, rarity or the
// engine's dependency score (lib/valuation-engine.mjs keeps its
// text-only dependency classification, never an archetype-substring
// check). A route theme is a plain, hand-written description of what a
// player of that route would look for: its archetype tags, its names,
// the quoted card names its support refers to, and (for the Type-based
// routes) the monster Type.
//
// A card is relevant to a route when ANY of these hold:
//   - it is one of the route's own cards (evolution chain or support
//     grant in data/boss-route-registry.mjs),
//   - its YGOPRODeck archetype tag is in `archetypes`,
//   - its name matches `name`,
//   - its text matches `text` (quoted names / Type phrases),
//   - it is a monster whose Type is in `races`.

export const ROUTE_THEMES = {
  chaos_bls: {
    archetypes: ["Chaos", "Black Luster Soldier", "D.D."],
    name: /chaos|black luster soldier|envoy of the/i,
    text: /1 LIGHT and 1 DARK monster|LIGHT and DARK monsters?|"Black Luster Soldier/i,
  },
  dark_magician: {
    archetypes: ["Dark Magician", "Magician Girl", "Magician"],
    name: /dark magician|magician girl/i,
    text: /"Dark Magician|"Dark Magician Girl"|"Magician Girl"/i,
  },
  elemental_hero: {
    archetypes: ["Elemental HERO", "HERO", "Neo-Spacian", "Masked HERO", "Evil HERO", "Vision HERO"],
    name: /elemental hero|neo-spacian|\bneos\b|miracle fusion|hero's bond/i,
    text: /"Elemental HERO|"HERO"|"Neo-Spacian"|"Elemental HERO Neos"/i,
  },
  blue_eyes: {
    archetypes: ["Blue-Eyes"],
    name: /blue-eyes|with eyes of blue|white stone of/i,
    text: /"Blue-Eyes White Dragon"|"Blue-Eyes"/i,
  },
  cyber_dragon: {
    archetypes: ["Cyber Dragon", "Cyberdark"],
    name: /cyber dragon|chimeratech|cyber (?:twin|end|laser|barrier|phoenix|larva|valley|kirin|eltanin)|cyberdark/i,
    text: /"Cyber Dragon"|"Cyber Dragon/i,
  },
  jinzo: {
    archetypes: ["Jinzo"],
    name: /jinzo/i,
    text: /"Jinzo"/i,
  },
  armed_dragon_ojama: {
    archetypes: ["Armed Dragon", "Ojama"],
    name: /armed dragon|ojama|level up!/i,
    text: /"Armed Dragon|"Ojama/i,
  },
  crystal_beast: {
    archetypes: ["Crystal Beast"],
    name: /crystal beast|rainbow (?:dragon|dark dragon|bridge|gravity|path|refraction)|crystal (?:blessing|release|tree|abundance|promise|pair|raigeki)/i,
    text: /"Crystal Beast|"Rainbow Dragon"|"Advanced Dark"/i,
  },
  red_eyes: {
    archetypes: ["Red-Eyes"],
    name: /red-eyes/i,
    text: /"Red-Eyes/i,
  },
  zombie: {
    archetypes: [],
    races: ["Zombie"],
    text: /Zombie[- ](?:Type )?monsters?|Zombie-Type/i,
  },
  dinosaur: {
    archetypes: ["Jurrac"],
    races: ["Dinosaur"],
    text: /Dinosaur[- ](?:Type )?monsters?|Dinosaur-Type/i,
  },
  legendary_fisherman: {
    archetypes: ["Umi", "Fishborg"],
    name: /legendary fisherman|\bumi\b/i,
    races: ["Fish", "Sea Serpent"],
    text: /"Umi"|Fish, Sea Serpent|Fish-Type|Sea Serpent-Type/i,
  },
  machina: {
    archetypes: ["Machina"],
    name: /machina/i,
    text: /"Machina|Machine[- ](?:Type )?monsters?|Machine-Type/i,
  },
  toon: {
    archetypes: ["Toon"],
    name: /toon/i,
    text: /"Toon World"|"Toon Kingdom"|Toon monster/i,
  },
  harpie: {
    archetypes: ["Harpie"],
    name: /harpie/i,
    text: /"Harpie/i,
  },
  ancient_gear: {
    archetypes: ["Ancient Gear"],
    name: /ancient gear/i,
    text: /"Ancient Gear/i,
  },
  galaxy_photon: {
    archetypes: ["Galaxy-Eyes", "Photon", "Galaxy"],
    name: /galaxy|photon/i,
    text: /"Galaxy|"Photon/i,
  },
  destiny_hero: {
    archetypes: ["Destiny HERO"],
    name: /destiny hero|destiny draw|destiny signal/i,
    text: /"Destiny HERO/i,
  },
  vampire: {
    archetypes: ["Vampire"],
    name: /vampire/i,
    text: /"Vampire/i,
  },
  cubic: {
    // The registry's Cubic route was rebuilt around Rock-Type monsters
    // (see its buildNote), so the theme is Rock + the Cubic tag.
    archetypes: ["Cubic"],
    name: /cubic/i,
    races: ["Rock"],
    text: /Rock[- ](?:Type )?monsters?|Rock-Type|"Cubic/i,
  },
};

const MONSTER_TYPE = /monster/i;

export function routeCardNames(route) {
  const names = new Set();

  for (const stage of route.stages) {
    names.add(stage.evolutionCard);
  }

  for (const grant of route.supportGrants) {
    names.add(grant.cardName);
  }

  return names;
}

// Returns the reason a card is relevant to the route, or null.
export function themeMatch(route, routeNames, card) {
  if (routeNames.has(card.name)) {
    return "route card";
  }

  const theme = ROUTE_THEMES[route.code];

  if (!theme) {
    return null;
  }

  if (card.archetype && theme.archetypes.includes(card.archetype)) {
    return `archetype tag "${card.archetype}"`;
  }

  if (theme.name && theme.name.test(card.name)) {
    return "name";
  }

  if (theme.races && MONSTER_TYPE.test(card.type ?? "") && theme.races.includes(card.race)) {
    return `${card.race} monster`;
  }

  if (theme.text && theme.text.test(card.desc ?? "")) {
    return "text supports the theme";
  }

  return null;
}
