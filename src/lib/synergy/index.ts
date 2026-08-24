// =========================================================
// CARD SYNERGY - app-side re-export
//
// Thin pass-through to lib/synergy-engine.mjs (repo root, typed via
// the sibling lib/synergy-engine.d.mts) - the SAME deterministic
// card-intelligence engine scripts/compute-synergy-graph.mjs uses to
// populate card_mechanics/card_synergy_edges. Importing it here
// rather than re-implementing tagging/edge logic in TypeScript keeps
// exactly one source of truth for "what does this card actually do
// and what does it actually relate to", mirroring the same pattern
// already established for card valuation (see ../valuation/index.ts).
//
// Nothing in this file computes anything itself, and nothing in this
// file talks to Supabase or an AI provider - it is pure re-export.
// Application code that wants PRECOMPUTED relationships (the normal,
// cheap, request-time path) should query card_mechanics/
// card_synergy_edges directly instead of calling this at request
// time - see src/lib/ai/card-synergy-context.ts for that query layer.
// This module exists for the precompute script itself and for any
// future one-off/debug tooling that needs the raw engine.
// =========================================================

export {
  computeCardMechanics,
  computeSynergyEdges,
  clauseAround,
  classifyReference,
  parseExtraDeckMaterials,
  extractQuotedReferences,
  MECHANIC_TAGS,
  SYNERGY_ENGINE_VERSION,
} from "../../../lib/synergy-engine.mjs";

export type {
  MechanicTag,
  SynergyCardInput,
  CardMechanicsProfile,
  SynergyEdgeType,
  SynergyEdgeConfidence,
  SynergyEdge,
} from "../../../lib/synergy-engine.mjs";
