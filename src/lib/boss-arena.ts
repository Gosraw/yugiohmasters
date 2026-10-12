// =========================================================
// BOSS ARENA ART (Season 2, "Night Temple" style)
//
// One original fal.ai arena background per Boss Route, stored as
// compact JPEGs in public/v2/arenas/<route code>.jpg. The route
// code is boss_routes.code (see data/boss-route-registry.mjs).
// Unknown or missing codes fall back to the shared temple
// background so a new route never shows a broken image.
// =========================================================

export const BOSS_ARENA_FALLBACK =
  "/v2/temple-night.jpg";

const BOSS_ARENA_CODES =
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

export function getBossArenaImage(
  routeCode:
    | string
    | null
    | undefined
) {
  if (
    routeCode &&
    BOSS_ARENA_CODES.has(
      routeCode
    )
  ) {
    return `/v2/arenas/${routeCode}.jpg`;
  }

  return BOSS_ARENA_FALLBACK;
}
