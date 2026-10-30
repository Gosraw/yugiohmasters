// =========================================================
// BOSS ARENA ART (Season 2, "Night Temple" style)
//
// One original fal.ai arena background per art file, stored as
// compact JPEGs in public/v2/arenas/<art>.jpg. The 20 files were
// made for the Season 1 routes; the 14 Season 2 Boss Paths
// (data/boss-route-registry-v3.mjs, codes "s2_*") reuse the closest
// one through BOSS_ARENA_ART below. Unknown or missing codes fall
// back to the shared temple background so a new route never shows
// a broken image.
// =========================================================

export const BOSS_ARENA_FALLBACK =
  "/v2/temple-night.jpg";

// Every file in public/v2/arenas (without .jpg).
const BOSS_ARENA_FILES =
  new Set([
    "chaos_bls",
    "dark_magician",
    "elemental_hero",
    "blue_eyes",
    "cyber_dragon",
    "jinzo",
    "armed_dragon_ojama",
    "crystal_beast",
    "red_eyes",
    "zombie",
    "dinosaur",
    "legendary_fisherman",
    "machina",
    "toon",
    "harpie",
    "ancient_gear",
    "galaxy_photon",
    "destiny_hero",
    "vampire",
    "cubic",
  ]);

// Season 2 route code -> arena file.
const BOSS_ARENA_ART: Record<string, string> = {
  s2_blue_eyes:
    "blue_eyes",
  s2_red_eyes:
    "red_eyes",
  s2_elemental_hero:
    "elemental_hero",
  s2_ancient_gear:
    "ancient_gear",
  s2_crystal_beast:
    "crystal_beast",
  s2_chaos_bls:
    "chaos_bls",
  // Armour racks, weapons and a forge: a samurai armoury.
  s2_six_samurai:
    "armed_dragon_ojama",
  // Grand gate between two statues: the closest thing to an arena.
  s2_gladiator_beast:
    "cubic",
  s2_zombie:
    "zombie",
  s2_harpie:
    "harpie",
  s2_toon:
    "toon",
  s2_galaxy_eyes:
    "galaxy_photon",
  s2_atlantean_ocean:
    "legendary_fisherman",
  // The glowing volcano behind the temple gate.
  s2_volcanic:
    "dinosaur",
};

export function getBossArenaImage(
  routeCode:
    | string
    | null
    | undefined
) {
  if (!routeCode) {
    return BOSS_ARENA_FALLBACK;
  }

  const art =
    BOSS_ARENA_ART[routeCode] ??
    routeCode;

  if (
    BOSS_ARENA_FILES.has(
      art
    )
  ) {
    return `/v2/arenas/${art}.jpg`;
  }

  return BOSS_ARENA_FALLBACK;
}
