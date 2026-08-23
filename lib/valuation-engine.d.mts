// Type declarations for valuation-engine.mjs so src/ (TypeScript,
// e.g. a future Duelist Coach V2 module) can import the SAME
// deterministic scoring engine that scripts/audit-card-valuation.mjs
// uses, without duplicating the logic. See valuation-engine.mjs's
// header for why this is a plain .mjs file rather than .ts.

export type ValuationCardInput = {
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
  atk: number | null;
  def: number | null;
  hasCost: boolean;
  costTribute: boolean;
  costDiscard: boolean;
  costBanishSelf: boolean;
  costLifePoints: boolean;
  hardOncePerTurn: boolean;
  softOncePerTurn: boolean;
  distinctAttributesRequired: number;
  archetypeLocked: boolean;
  namedCardDependency: boolean;
  boardStateRequirement: boolean;
  removalDestroy: boolean;
  removalBounce: boolean;
  removalBanish: boolean;
  removalNegate: boolean;
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
  materialSpecificity: "n/a" | "generic" | "moderate" | "named";
  textLength: number;
};

export type ValuationScores = {
  power: number;
  usability: number;
  versatility: number;
  dependency: number;
  consistency: number;
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

export function draftValueToRarity(draftValue: number): GameRarity;

export function recommendOppressiveness(
  oppressiveness: number,
  power: number,
  dependency: number
): OppressivenessRecommendation;

export const VALUATION_ENGINE_VERSION: string;
export const RARITY_ORDER: GameRarity[];
