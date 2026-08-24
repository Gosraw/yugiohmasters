// Type declarations for synergy-engine.mjs so src/ (TypeScript, e.g.
// scripts/compute-synergy-graph.mjs's TS callers and any route that
// needs to call this engine directly rather than only reading its
// precomputed output from card_mechanics/card_synergy_edges) can
// import the SAME deterministic card-intelligence engine, without
// duplicating the logic. See synergy-engine.mjs's header for why this
// is a plain .mjs file rather than .ts, mirroring valuation-engine's
// pattern.

import type {
  ValuationCardInput,
  ClassifiedReference,
  MaterialSpecificity,
} from "./valuation-engine.d.mts";

export type MechanicTag =
  | "starter"
  | "extender"
  | "searcher"
  | "tutor"
  | "draw"
  | "discard_outlet"
  | "tribute_outlet"
  | "gy_setup"
  | "mill"
  | "gy_payoff"
  | "revival"
  | "recursion"
  | "banish_setup"
  | "banish_payoff"
  | "removal"
  | "board_wipe"
  | "negate"
  | "interaction"
  | "protection_battle"
  | "protection_targeting"
  | "protection_effect"
  | "board_breaker"
  | "floodgate"
  | "token_generation"
  | "normal_summon_dependency"
  | "special_summon_enabler"
  | "fusion_enabler"
  | "xyz_enabler"
  | "synchro_enabler"
  | "link_enabler"
  | "brick_risk"
  | "hard_once_per_turn"
  | "soft_once_per_turn"
  | "self_lock"
  | "recovery"
  | "follow_up"
  | "generic_utility"
  | "build_around_payoff";

export type SynergyCardInput = ValuationCardInput & {
  id: string;
  archetype?: string | null;
};

export type CardMechanicsProfile = {
  cardId: string;
  tags: MechanicTag[];
  searchTargets: string[];
  namedMaterialTargets: string[];
  namedRequirementTargets: string[];
  materialSpecificity: MaterialSpecificity | null;
  materialText: string | null;
  evidence: {
    classifiedRefs: ClassifiedReference[];
    isExtraDeckCard: boolean;
    extraDeckKind: {
      fusion: boolean;
      synchro: boolean;
      xyz: boolean;
      link: boolean;
      pendulum: boolean;
    };
    scores: {
      power: number;
      accessibility: number;
      dependency: number;
      genericUtility: number;
      floor: number;
      ceiling: number;
      draftValue: number;
    };
  };
  engineVersion: string;
};

export type SynergyEdgeType =
  | "searches"
  | "material_supply_named"
  | "material_supply_constrained"
  | "requirement_satisfies"
  | "gy_setup_for"
  | "discard_payoff_for"
  | "banish_payoff_for"
  | "spell_trap_support";

export type SynergyEdgeConfidence = "high" | "medium" | "low";

export type SynergyEdge = {
  sourceCardId: string;
  targetCardId: string;
  edgeType: SynergyEdgeType;
  score: number;
  confidence: SynergyEdgeConfidence;
  deterministicReason: string;
  evidence: Record<string, unknown>;
  engineVersion: string;
};

export const SYNERGY_ENGINE_VERSION: string;
export const MECHANIC_TAGS: MechanicTag[];

export function computeCardMechanics(
  card: SynergyCardInput
): CardMechanicsProfile;

export function computeSynergyEdges(
  cardA: SynergyCardInput,
  mechA: CardMechanicsProfile,
  cardB: SynergyCardInput,
  mechB: CardMechanicsProfile
): SynergyEdge[];

// Re-exported for convenience from valuation-engine.mjs.
export function clauseAround(text: string, index: number): string;

export function classifyReference(
  term: string,
  clause: string,
  cardName: string | null
): ClassifiedReference;

export function parseExtraDeckMaterials(
  text: string,
  isExtraDeckCard: boolean
): { specificity: MaterialSpecificity; materialText: string; reason: string };

export function extractQuotedReferences(
  text: string
): Array<{ term: string; index: number }>;
