// Type declarations for valuation-engine.mjs so src/ (TypeScript,
// e.g. a future Duelist Coach V2 module) can import the SAME
// deterministic scoring engine that scripts/audit-card-valuation.mjs
// uses, without duplicating the logic. See valuation-engine.mjs's
// header for why this is a plain .mjs file rather than .ts, and for
// why v2 reshaped the score axes (power/accessibility/dependency/
// genericUtility/consistency/floor/ceiling/oppressiveness).

export type ValuationCardInput = {
  name?: string | null;
  card_type: string | null;
  frame_type?: string | null;
  race?: string | null;
  attribute?: string | null;
  level?: number | null;
  rank?: number | null;
  link_rating?: number | null;
  atk: number | null;
  def: number | null;
  archetype: string | null;
  description: string | null;
};

export type ReferenceType =
  | "mandatory_requirement"
  | "mandatory_target"
  | "alternative_effect"
  | "optional_bonus"
  | "search_target"
  | "self_reference"
  | "ambiguous_reference";

export type ClassifiedReference = {
  term: string;
  type: ReferenceType;
  severity: number;
  ambiguous?: boolean;
};

export type MaterialSpecificity = "n/a" | "generic" | "constrained" | "named";

export type ExtraDeckMaterials = {
  specificity: MaterialSpecificity;
  materialText: string;
  reason: string;
};

export type ValuationSignals = {
  isMonster: boolean;
  isSpell: boolean;
  isTrap: boolean;
  isExtraDeckCard: boolean;
  extraDeckKind: {
    fusion: boolean;
    synchro: boolean;
    xyz: boolean;
    link: boolean;
    pendulum: boolean;
  };
  isNormalMonster: boolean;
  isFlip: boolean;
  isQuickPlay: boolean;
  isQuickEffect: boolean;
  isContinuous: boolean;
  atk: number | null;
  def: number | null;
  hasCost: boolean;
  costTribute: boolean;
  costDiscard: boolean;
  costBanishSelf: boolean;
  costLifePoints: boolean;
  usableFromGraveyard: boolean;
  gainsLifePoints: boolean;
  endsBattlePhase: boolean;
  hardOncePerTurn: boolean;
  softOncePerTurn: boolean;
  distinctAttributesRequired: number;
  boardStateRequirement: boolean;
  classifiedRefs: ClassifiedReference[];
  materials: ExtraDeckMaterials;
  archetypeFunctionalRefs: ClassifiedReference[];
  archetypeIsThematicOnly: boolean;
  removalDestroy: boolean;
  removalBounce: boolean;
  removalBanish: boolean;
  removalNegate: boolean;
  negatesActivationOrEffect: boolean;
  negatesAttack: boolean;
  nonTargeting: boolean;
  providesRemoval: boolean;
  battleProtection: boolean;
  effectProtection: boolean;
  fullProtection: boolean;
  conditionalProtection: boolean;
  isFloodgateOrLock: boolean;
  floodgatePersistent: boolean;
  searches: boolean;
  searchGeneric: boolean;
  searchNarrow: boolean;
  drawsCards: boolean;
  generatesAdvantage: boolean;
  textLength: number;
};

export type ValuationScores = {
  power: number;
  accessibility: number;
  dependency: number;
  genericUtility: number;
  consistency: number;
  floor: number;
  ceiling: number;
  oppressiveness: number;
  draftValue: number;
  reason: string;
};

export type OppressivenessRecommendation = {
  tier: "green" | "orange" | "red";
  reason: string;
  suggestedStage: number;
};

export type GameRarity =
  | "Normal"
  | "Rare"
  | "Super Rare"
  | "Ultra Rare"
  | "Secret Rare"
  | "Legendary";

export function extractValuationSignals(
  card: ValuationCardInput
): ValuationSignals;

export function scoreCard(
  signals: ValuationSignals,
  card: ValuationCardInput,
  context?: { answerDensity?: number | null }
): ValuationScores;

export function proposeRarity(scores: ValuationScores): GameRarity;

// Deprecated alias - do not add new callers.
export function draftValueToRarity(draftValue: number): GameRarity;

export function recommendOppressiveness(
  oppressiveness: number,
  power: number,
  dependency: number
): OppressivenessRecommendation;

export function extractQuotedReferences(
  text: string
): Array<{ term: string; index: number }>;

export function clauseAround(text: string, index: number): string;

export function classifyReference(
  term: string,
  clause: string,
  cardName: string | null
): ClassifiedReference;

export function parseExtraDeckMaterials(
  text: string,
  isExtraDeckCard: boolean
): ExtraDeckMaterials;

export const VALUATION_ENGINE_VERSION: string;
export const RARITY_ORDER: GameRarity[];
