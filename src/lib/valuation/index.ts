// =========================================================
// CARD VALUATION - app-side re-export
//
// Thin pass-through to lib/valuation-engine.mjs (repo root, typed
// via the sibling lib/valuation-engine.d.ts) - the SAME
// deterministic scoring engine scripts/audit-card-valuation.mjs
// uses for the Season 1 rarity/oppressiveness proposal. Importing
// it here rather than re-implementing scoring in TypeScript keeps
// exactly one source of truth for card valuation, reusable by:
//   - the Card Detail page (a future "why this rarity" panel)
//   - a future Duelist Coach V2 (deck strength / synergy /
//     trade-value reasoning - see CLAUDE.md and the Season 1
//     README for the planned reuse)
// Nothing in this file computes scores itself.
// =========================================================

export {
  extractValuationSignals,
  scoreCard,
  proposeRarity,
  draftValueToRarity,
  recommendOppressiveness,
  VALUATION_ENGINE_VERSION,
  RARITY_ORDER,
} from "../../../lib/valuation-engine.mjs";

export type {
  ValuationCardInput,
  ValuationSignals,
  ValuationScores,
  OppressivenessRecommendation,
  GameRarity,
} from "../../../lib/valuation-engine.mjs";
