// =========================================================
// SEASON 1 FORMAT ELIGIBILITY PROXY
//
// Extracted from scripts/audit-card-valuation.mjs during the
// 2026-08-25 Legendary rarity recalibration so this logic can be
// unit-tested (lib/valuation-engine.regression.test.mjs) without
// pulling in that script's top-level Supabase client construction
// (which exits the process immediately if Supabase env vars are
// absent - not safe to import from a test file).
//
// This is a client-side, offline-computable PROXY for the live
// is_duelist_circle_format_eligible() SQL function
// (supabase/migrations/202608231500_duelist_circle_format_engine.sql),
// as configured by the seeded 'season_1' format_rows row. It is NOT
// a substitute for calling that function live - two things it can
// never account for:
//   - format_card_overrides (per-card manual include/exclude) - this
//     module has no such table to read.
//   - Anything in the live format_rows row that later changes and
//     isn't mirrored into SEASON_1_RELEASE_CUTOFF / SEASON_1_ALLOW /
//     SEASON_1_CURRENT_RELEASE_STAGE below.
//
// Do NOT change the constants/logic below to alter what Season 1
// actually allows - that is a live format-rules decision, made by
// editing the seeded format_rows row (and, if the shape changes, the
// SQL predicate itself), never by editing this offline proxy.
// =========================================================

export const SEASON_1_RELEASE_CUTOFF = "2020-12-31";

export const SEASON_1_ALLOW = {
  illusion: false,
  synchro: false,
  xyz: true,
  link: false,
  pendulum: false,
  fusion: true,
};

// The seeded 'season_1' format_rows row's current_release_stage.
// is_duelist_circle_format_eligible() (~line 409 of the migration
// above) treats card_catalog.release_stage IS NULL, or
// release_stage > fmt.current_release_stage, as NOT eligible -
// release_stage gating is part of the TRUE live format_eligible
// boolean, not a separate/orthogonal concept.
export const SEASON_1_CURRENT_RELEASE_STAGE = 1;

export function isMasterDuelOfferable(status) {
  return ["unlimited", "semi_limited", "limited"].includes(status ?? "");
}

/**
 * Client-side port of is_duelist_circle_format_eligible()'s
 * mechanics/date checks (release_stage gating is NOT included here -
 * see computeFormatEligibleProxy below for that). Excludes
 * Synchro/Link/Pendulum/Illusion per the seeded Season 1 format row;
 * allows Xyz and Fusion.
 *
 * @param {{ card_type?: string|null, frame_type?: string|null, race?: string|null, monster_type?: string|null, master_duel_status?: string|null, release_date?: string|null }} card
 */
export function computeSeason1ProvisionalEligibility(card) {
  if (!isMasterDuelOfferable(card.master_duel_status)) return false;

  const cardType = (card.card_type ?? "").toLowerCase();
  const frameType = (card.frame_type ?? "").toLowerCase();
  const race = card.race ?? "";
  const monsterType = (card.monster_type ?? "").toLowerCase();

  const isSynchro = cardType.includes("synchro") || frameType.includes("synchro");
  const isXyz = cardType.includes("xyz") || frameType.includes("xyz");
  const isLink = cardType.includes("link") || frameType.includes("link");
  const isPendulum = cardType.includes("pendulum") || frameType.includes("pendulum");
  const isFusion = cardType.includes("fusion") || frameType.includes("fusion");
  const isIllusion = race === "Illusion" || monsterType.includes("illusion");

  if (isSynchro && !SEASON_1_ALLOW.synchro) return false;
  if (isXyz && !SEASON_1_ALLOW.xyz) return false;
  if (isLink && !SEASON_1_ALLOW.link) return false;
  if (isPendulum && !SEASON_1_ALLOW.pendulum) return false;
  if (isFusion && !SEASON_1_ALLOW.fusion) return false;
  if (isIllusion && !SEASON_1_ALLOW.illusion) return false;

  if (card.release_date != null && card.release_date > SEASON_1_RELEASE_CUTOFF) {
    return false;
  }
  // release_date == null (unknown) is NEVER excluded on cutoff
  // grounds alone, matching the live SQL predicate.

  return true;
}

/**
 * Closest offline approximation to the live format_eligible = true
 * boolean: computeSeason1ProvisionalEligibility() PLUS the
 * release_stage gate the live SQL predicate also applies. Still not
 * a substitute for the live function - see the module header.
 *
 * @param {{ release_stage?: number|null }} card
 * @param {boolean} season1ProvisionalEligible
 */
export function computeFormatEligibleProxy(card, season1ProvisionalEligible) {
  return (
    season1ProvisionalEligible === true &&
    card.release_stage === SEASON_1_CURRENT_RELEASE_STAGE
  );
}
