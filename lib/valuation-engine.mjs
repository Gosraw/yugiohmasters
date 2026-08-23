// =========================================================
// DUELIST CIRCLE CARD VALUATION ENGINE
//
// Deterministic, explainable, reusable card-understanding
// primitives. Given a card_catalog-shaped row, produces SEVEN
// separate scores (0-10 each, except oppressiveness which is
// 0-10 too) plus a human-readable reason string - never a single
// black-box number.
//
//   power          - how strong the effect/ceiling is WHEN it
//                    actually functions.
//   usability      - how easily it can actually be used
//                    (summon/activation cost, timing, fragility).
//   versatility    - how many reasonably different decks/strategies
//                    get real use from it.
//   dependency     - how much specific setup/other cards it needs.
//                    HIGHER dependency = WORSE for random draft
//                    value (this is intentionally an "the more you
//                    need, the more this drags score down" axis).
//   consistency    - how reliably it does its job once you draw it
//                    (timing windows, cost you must pay, fragility).
//   oppressiveness - how problematic the card is specifically in a
//                    SMALL, LOW-POWER starting card pool (floodgates,
//                    repeatable negation/removal, hard-to-answer
//                    locks) - independent of raw power.
//   draftValue     - the actual output: how valuable it is to be
//                    RANDOMLY offered this card. This is what
//                    proposed_game_rarity should be based on, NOT
//                    power alone.
//
// This is plain, dependency-free ESM JavaScript (not TypeScript)
// specifically so it can be imported unmodified by:
//   - scripts/audit-card-valuation.mjs (plain `node`, matching
//     every other script in scripts/ - none of them go through a
//     TS toolchain)
//   - src/lib/valuation/index.ts (the Next.js app / future Duelist
//     Coach V2), via the companion lib/valuation-engine.d.ts
//     type-declaration file sitting next to this one.
// One real implementation, two callers - no duplicated logic to
// drift out of sync (unlike the existing is_master_duel_offerable
// SQL vs. src/lib/master-duel.ts pair, which the codebase itself
// already documents as a manual-sync liability).
//
// Nothing here calls an AI/LLM. Every signal is a plain
// keyword/phrase match against the card's own real text and
// fields - reproducible, auditable, and safe to re-run against
// the full catalog at any time. AI may be used elsewhere (see
// src/lib/ai/card-synergy.ts) to EXPLAIN an already-decided fact
// in prose - never to decide a score or a rarity.
// =========================================================

const RARITY_ORDER = [
  "Normal",
  "Rare",
  "Super Rare",
  "Ultra Rare",
  "Secret Rare",
  "Legendary",
];

// ---------------------------------------------------------
// Signal extraction
// ---------------------------------------------------------

function isExtraDeckType(cardType) {
  const t = (cardType || "").toLowerCase();
  return {
    fusion: t.includes("fusion"),
    synchro: t.includes("synchro"),
    xyz: t.includes("xyz"),
    link: t.includes("link"),
    pendulum: t.includes("pendulum"),
  };
}

function isMonster(cardType) {
  return (cardType || "").toLowerCase().includes("monster");
}

function isSpell(cardType) {
  return (cardType || "").toLowerCase().includes("spell");
}

function isTrap(cardType) {
  return (cardType || "").toLowerCase().includes("trap");
}

/**
 * Extracts structured, explainable signals from one card_catalog
 * row. Every field here is either a direct DB column or a plain
 * regex match against `description` - nothing inferred beyond
 * what the text/fields literally say.
 *
 * @param {{
 *   card_type: string|null, frame_type: string|null,
 *   race: string|null, attribute: string|null,
 *   level: number|null, rank: number|null, link_rating: number|null,
 *   atk: number|null, def: number|null, archetype: string|null,
 *   description: string|null,
 * }} card
 */
export function extractValuationSignals(card) {
  const text = card.description || "";
  const t = text.toLowerCase();
  const extra = isExtraDeckType(card.card_type || card.frame_type);
  const monster = isMonster(card.card_type);
  const spell = isSpell(card.card_type);
  const trap = isTrap(card.card_type);
  const isExtraDeckCard =
    extra.fusion || extra.synchro || extra.xyz || extra.link;
  const isNormalMonster =
    monster && /normal monster/i.test(card.card_type || "");
  const isFlip = /\bflip:/i.test(text) || /flip summon/i.test(t);
  const isQuickPlay = /quick-play/i.test(card.card_type || "");
  const isQuickEffect = /\(quick effect\)/i.test(t);

  // --- Costs (things you must PAY to get the effect) ---
  const costTribute = /tribute (?:1|2|3|a|this card)/i.test(t) && !/synchro|xyz|fusion|link/i.test(t.slice(0, 40));
  const costDiscard = /discard (?:1|2|3|a|\d+ card)/i.test(t);
  const costBanishSelf = /banish this card (?:from your hand|from your (?:field|graveyard))?/i.test(t);
  const costBanishOther = /you can banish \d* ?(?:cards?)? from your/i.test(t) || /banish \d+ (?:cards?)? from your (?:hand|deck|graveyard)/i.test(t);
  const costLifePoints = /pay \d+ life ?points/i.test(t);
  const costHandCard = /(?:send|discard) \d+ cards? from your hand/i.test(t);
  const hasCost = costTribute || costDiscard || costBanishSelf || costBanishOther || costLifePoints || costHandCard;

  // --- Once-per-turn gating ---
  const hardOncePerTurn = /you can only use this effect of ["“][^"”]+["”]? once per turn/i.test(text) ||
    /you can only use \d+ of these effects? of ["“][^"”]+["”]? per turn/i.test(text) ||
    /once per turn[,:]/i.test(text);
  const softOncePerTurn = /once per turn/i.test(t) && !hardOncePerTurn;

  // --- Dependency / condition signals ---
  // How many distinct Attributes/Types the text explicitly demands
  // present at once (e.g. Fuh-Rin-Ka-Zan's "WIND, WATER, FIRE and
  // EARTH monster(s) on the field").
  const attributeListMatch = text.match(
    /((?:LIGHT|DARK|WATER|FIRE|EARTH|WIND|DIVINE)(?:\s*,\s*(?:LIGHT|DARK|WATER|FIRE|EARTH|WIND|DIVINE)){1,5}\s*(?:,?\s*and\s*)?(?:LIGHT|DARK|WATER|FIRE|EARTH|WIND|DIVINE))/
  );
  const distinctAttributesRequired = attributeListMatch
    ? new Set(attributeListMatch[1].toUpperCase().match(/LIGHT|DARK|WATER|FIRE|EARTH|WIND|DIVINE/g) || []).size
    : 0;

  const archetypeNamedInOwnText =
    !!card.archetype && t.includes(card.archetype.toLowerCase());
  // Narrow: a Spell/Trap or non-generic monster effect that only
  // works with a NAMED archetype/card, rather than a generic
  // type/attribute condition.
  const archetypeLocked =
    !!card.archetype && (!monster || isExtraDeckCard) && archetypeNamedInOwnText;

  const namedCardDependency = /(?:except|other than) ["“][^"”]+["”]/i.test(text) === false &&
    /["“][A-Z][a-zA-Z' -]{2,40}["”]/.test(text) && !/this card/i.test(text.slice(0, 20));

  const boardStateRequirement =
    /if you control no other cards/i.test(t) ||
    /if you control \d+ or more/i.test(t) ||
    /with \d+ or more (?:different )?(?:types|attributes)/i.test(t) ||
    distinctAttributesRequired >= 2;

  // --- Removal / disruption ---
  const removalDestroy = /destroy (?:1|2|3|a|all|target)/i.test(t) || /destroy that (?:target|card)/i.test(t);
  const removalBounce = /(?:return|shuffle)[^.]{0,40}(?:to (?:the|your opponent's) (?:hand|deck))/i.test(t);
  const removalBanish = /banish (?:1|2|3|a|it|that|all)/i.test(t) && !costBanishSelf;
  // Covers both active ("negate the activation/effect") and
  // passive ("effects...are negated", "activation of...is negated")
  // phrasings - Skill Drain-style continuous negation uses the
  // passive form and was previously missed entirely.
  const removalNegate =
    /negate the (?:activation|effect|attack)/i.test(t) ||
    /negate that/i.test(t) ||
    /(?:effects?|activations?)[^.]{0,40}(?:are|is) negated/i.test(t);
  const nonTargeting = /(?:destroy|banish|negate)[^.]{0,60}(?:without targeting|that does not target)/i.test(t);
  const providesRemoval = removalDestroy || removalBounce || removalBanish || removalNegate;

  // --- Protection ---
  const battleProtection = /cannot be destroyed by battle/i.test(t);
  const effectProtection = /cannot be destroyed by (?:card )?effects/i.test(t) || /cannot be (?:targeted|affected) by/i.test(t);
  const fullProtection = /cannot be destroyed(?: by battle)? or affected by/i.test(t) || (battleProtection && effectProtection);
  const conditionalProtection = (battleProtection || effectProtection) &&
    /(?:once per turn|if|while you control|as long as)/i.test(t);

  // --- Floodgate / lock patterns (opponent-restriction or a
  // blanket field-wide restriction, not simple 1-for-1 removal -
  // these are the "answer-me-or-you-can't-play" cards). Includes
  // both the "your opponent cannot..." phrasing AND the passive
  // "all face-up monster effects...are negated" phrasing (e.g.
  // Skill Drain), which is a distinct, very common floodgate
  // pattern that only checking for "opponent cannot" would miss
  // entirely. ---
  const floodgateOpponentCannotActivate =
    /your opponent cannot activate/i.test(t) ||
    /neither player can (?:activate|special summon)/i.test(t) ||
    /cards and effects (?:cannot|can)not be activated/i.test(t);
  const floodgateCannotSummon =
    /(?:special summons? are negated|cannot be special summoned)[^.]{0,20}(?:except|;)?/i.test(t) &&
    !/this card/i.test(text.match(/(?:special summons? are negated|cannot be special summoned)[^.]{0,40}/i)?.[0] || "");
  const floodgateBlanketNegation =
    /all face-up[^.]{0,30}effects[^.]{0,20}(?:are|on the field are) negated/i.test(t) ||
    /(?:all|every)[^.]{0,20}(?:monster|card) effects[^.]{0,30}negated/i.test(t);
  const isContinuous = /continuous/i.test(card.card_type || "");
  const floodgatePersistent =
    (floodgateOpponentCannotActivate || floodgateCannotSummon || floodgateBlanketNegation) &&
    (/as long as this card (?:remains|is) (?:face-up )?on the field/i.test(t) || isContinuous);
  const isFloodgateOrLock = floodgateOpponentCannotActivate || floodgateCannotSummon || floodgateBlanketNegation;

  // --- Searching ---
  const searches = /add[^.]{0,60}from your deck to your hand/i.test(t);
  const searchGeneric = searches && !archetypeNamedInOwnText && !/["“][A-Z]/.test(text.match(/add[^.]{0,60}from your deck to your hand/i)?.[0] || "");
  const searchNarrow = searches && (archetypeNamedInOwnText || /["“][A-Z]/.test(text));

  // --- Draw / advantage ---
  const drawsCards = /draw (?:1|2|3|a|\d+) cards?/i.test(t);
  const generatesAdvantage = drawsCards || searches || /special summon (?:1|a|this card) from your (?:hand|graveyard|deck)/i.test(t);

  // --- Extra Deck material specificity ---
  let materialSpecificity = "n/a";
  if (isExtraDeckCard) {
    const materialText = (text.split(/\n|\. /)[0] || text).toLowerCase();
    const genericMaterial =
      /\d+\+? (?:effect monsters?|monsters?|"[^"]+" monsters)/i.test(materialText) &&
      !/named/i.test(materialText);
    const namedMaterial = /"[A-Z][^"]+"/.test(text.slice(0, 120));
    materialSpecificity = namedMaterial ? "named" : genericMaterial ? "generic" : "moderate";
  }

  return {
    isMonster: monster,
    isSpell: spell,
    isTrap: trap,
    isExtraDeckCard,
    extraDeckKind: extra,
    isNormalMonster,
    isFlip,
    isQuickPlay,
    isQuickEffect,
    atk: card.atk,
    def: card.def,
    hasCost,
    costTribute,
    costDiscard,
    costBanishSelf,
    costLifePoints,
    hardOncePerTurn,
    softOncePerTurn,
    distinctAttributesRequired,
    archetypeLocked,
    namedCardDependency,
    boardStateRequirement,
    removalDestroy,
    removalBounce,
    removalBanish,
    removalNegate,
    nonTargeting,
    providesRemoval,
    battleProtection,
    effectProtection,
    fullProtection,
    conditionalProtection,
    isFloodgateOrLock,
    floodgatePersistent,
    searches,
    searchGeneric,
    searchNarrow,
    drawsCards,
    generatesAdvantage,
    materialSpecificity,
    textLength: text.length,
  };
}

// ---------------------------------------------------------
// Scoring
// ---------------------------------------------------------

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Scores one card across all seven axes and returns an
 * explanation. `answerDensity` (0-1, optional) is how well the
 * candidate pool already answers this card's protection/lock, per
 * the "format answer density" concept - pass null/undefined to
 * skip that adjustment (used for single-card ad-hoc scoring).
 *
 * @param {ReturnType<typeof extractValuationSignals>} s
 * @param {{ atk: number|null, def: number|null, level: number|null, rank: number|null, link_rating: number|null, archetype: string|null }} card
 * @param {{ answerDensity?: number|null }} [context]
 */
export function scoreCard(s, card, context = {}) {
  const reasons = [];

  // ---- POWER: raw ceiling when the card functions ----
  let power = 3.0;
  if (s.removalNegate) { power += 2.5; reasons.push("negates activations/attacks"); }
  if (s.removalDestroy) power += 1.2;
  if (s.removalBounce) power += 0.8;
  if (s.removalBanish) power += 1.5;
  if (s.nonTargeting) { power += 0.8; reasons.push("non-targeting removal is hard to play around"); }
  if (s.isFloodgateOrLock) { power += 2.0; reasons.push("restricts what the opponent can do"); }
  if (s.drawsCards) power += 1.0;
  if (s.generatesAdvantage) power += 0.5;
  if (s.fullProtection) { power += 1.5; reasons.push("hard to remove"); }
  else if (s.battleProtection || s.effectProtection) power += 0.6;
  if (s.isExtraDeckCard) power += 0.8;
  const atk = Number(card.atk) || 0;
  if (s.isMonster && atk >= 2500) power += 0.8;
  if (s.isMonster && atk >= 3000) power += 0.5;
  if (s.textLength > 260) power += 0.4; // long text usually means more clauses/effects
  power = clamp(power, 0, 10);

  // ---- DEPENDENCY: how much specific setup this needs.
  //      HIGHER = worse for random draft value. ----
  let dependency = 1.0;
  if (s.distinctAttributesRequired >= 3) { dependency += 4.5; reasons.push(`requires ${s.distinctAttributesRequired} different Attributes on field at once`); }
  else if (s.distinctAttributesRequired === 2) { dependency += 2.0; reasons.push("requires two specific Attributes at once"); }
  if (s.archetypeLocked) { dependency += 3.0; reasons.push(`only functional with the "${card.archetype}" archetype`); }
  if (s.boardStateRequirement && s.distinctAttributesRequired < 2) { dependency += 1.5; reasons.push("requires a specific board state"); }
  if (s.namedCardDependency) { dependency += 1.5; reasons.push("references a specific named card"); }
  if (s.isExtraDeckCard) {
    if (s.materialSpecificity === "named") { dependency += 3.0; reasons.push("Extra Deck materials are named, not generic"); }
    else if (s.materialSpecificity === "moderate") dependency += 1.0;
  }
  if (s.hasCost) dependency += 0.5;
  dependency = clamp(dependency, 0, 10);

  // ---- USABILITY: how easily it can actually be deployed ----
  let usability = 6.5;
  if (s.isNormalMonster) usability = 3.5 + Math.min(2.5, atk / 1200);
  if (s.isMonster && !s.isNormalMonster) {
    if (s.isFlip) { usability -= 1.5; reasons.push("Flip Summon timing is fragile (vulnerable before flipping)"); }
    if (atk > 0 && atk < 1200 && !s.isExtraDeckCard) usability -= 1.0;
    if (atk === 0 && !s.isExtraDeckCard) { usability -= 1.5; reasons.push("0 ATK makes it useless on offense"); }
  }
  if (s.isSpell || s.isTrap) usability += 0.5;
  if (s.hasCost) usability -= 1.0;
  if (s.costTribute) usability -= 1.0;
  if (dependency >= 6) usability -= 2.0;
  else if (dependency >= 3) usability -= 1.0;
  if (s.isQuickEffect || s.isQuickPlay) usability += 0.8;
  if (s.hardOncePerTurn) usability -= 0.3;
  usability = clamp(usability, 0, 10);

  // ---- VERSATILITY: how many decks/strategies get real use ----
  let versatility = 5.0;
  if (s.archetypeLocked) { versatility -= 3.5; reasons.push("narrow to one archetype"); }
  if (s.isMonster && !s.isExtraDeckCard && !s.archetypeLocked) versatility += 0.5;
  if (s.searchGeneric) { versatility += 1.5; reasons.push("searches broadly, not one named target"); }
  if (s.searchNarrow) versatility -= 1.0;
  if (s.providesRemoval && !s.archetypeLocked) versatility += 1.5;
  if (s.isFloodgateOrLock) versatility -= 0.5; // strong but often deck-specific to want
  if (s.distinctAttributesRequired >= 2) versatility -= 1.5;
  versatility = clamp(versatility, 0, 10);

  // ---- CONSISTENCY: how reliably it does its job once drawn ----
  let consistency = 6.0;
  if (s.isFlip) consistency -= 1.5;
  if (s.hasCost) consistency -= 0.5;
  if (dependency >= 6) consistency -= 2.5;
  else if (dependency >= 3) consistency -= 1.0;
  if (s.conditionalProtection) consistency -= 0.5;
  if (s.isExtraDeckCard && s.materialSpecificity !== "generic") consistency -= 1.0;
  consistency = clamp(consistency, 0, 10);

  // ---- OPPRESSIVENESS: how problematic in a small starting pool ----
  let oppressiveness = 0.5;
  if (s.isFloodgateOrLock) { oppressiveness += 4.0; reasons.push("floodgate/lock effect"); }
  if (s.floodgatePersistent) oppressiveness += 1.5;
  if (s.removalNegate && s.hardOncePerTurn === false && s.softOncePerTurn === false) { oppressiveness += 1.5; reasons.push("repeatable negation with no once-per-turn limit found in text"); }
  if (s.fullProtection && !s.conditionalProtection) oppressiveness += 1.0;
  if (s.generatesAdvantage && !s.hardOncePerTurn && !s.softOncePerTurn && power >= 6) oppressiveness += 1.0;
  if (context.answerDensity != null && (s.isFloodgateOrLock || s.fullProtection)) {
    // A well-answered pool makes the same card less oppressive.
    oppressiveness -= context.answerDensity * 2.0;
  }
  oppressiveness = clamp(oppressiveness, 0, 10);

  // ---- DRAFT VALUE: the actual output. Usability/versatility/
  //      consistency matter MORE than raw power; dependency and
  //      oppressiveness actively PENALIZE it. This is deliberately
  //      NOT just "power" - a high-power, high-dependency card
  //      should NOT out-rank a lower-power, generically-usable one. ----
  let draftValue =
    power * 0.28 +
    usability * 0.26 +
    versatility * 0.18 +
    consistency * 0.18 -
    dependency * 0.30 -
    oppressiveness * 0.10;
  draftValue = clamp(draftValue, 0, 10);

  if (reasons.length === 0) {
    reasons.push("straightforward, unconditional effect");
  }

  return {
    power: round2(power),
    usability: round2(usability),
    versatility: round2(versatility),
    dependency: round2(dependency),
    consistency: round2(consistency),
    oppressiveness: round2(oppressiveness),
    draftValue: round2(draftValue),
    reason: buildReasonSentence(reasons, { power, usability, dependency, draftValue }),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function buildReasonSentence(reasons, scores) {
  const unique = Array.from(new Set(reasons));
  const clause = unique.slice(0, 3).join("; ");
  if (scores.dependency >= 6 && scores.power >= 6) {
    return `Powerful but ${clause}, so real-world draft value is much lower than raw power alone would suggest.`;
  }
  if (scores.draftValue >= 7) {
    return `Strong, broadly usable card: ${clause}.`;
  }
  if (scores.draftValue <= 3) {
    return `Low practical draft value: ${clause}.`;
  }
  return `${clause[0].toUpperCase()}${clause.slice(1)}.`;
}

/**
 * Maps a draft-value score (0-10) to a proposed rarity band. Bands
 * are intentionally steep at the top (Legendary/Secret Rare are
 * meant to be rare in COUNT, not just in the percentile sense) -
 * see the Season 1 audit report for the resulting distribution and
 * why these specific cut points were chosen.
 */
export function draftValueToRarity(draftValue) {
  if (draftValue >= 8.6) return "Legendary";
  if (draftValue >= 7.6) return "Secret Rare";
  if (draftValue >= 6.4) return "Ultra Rare";
  if (draftValue >= 5.0) return "Super Rare";
  if (draftValue >= 3.2) return "Rare";
  return "Normal";
}

/**
 * Recommends an oppressiveness tier + release stage suggestion.
 * Never recommends deletion - only a later release_stage.
 */
export function recommendOppressiveness(oppressiveness, power, dependency) {
  if (oppressiveness >= 6.5) {
    return {
      tier: "red",
      reason: "High oppressiveness in a small pool - recommend a later release stage rather than starting-pool inclusion.",
      suggestedStage: 3,
    };
  }
  if (oppressiveness >= 3.5 || (power >= 7.5 && dependency <= 3)) {
    return {
      tier: "orange",
      reason: oppressiveness >= 3.5
        ? "Moderate oppressiveness risk - manual review recommended before starting-pool inclusion."
        : "High power with low dependency (easy to use) - manual review recommended for an early-power-spike risk.",
      suggestedStage: 2,
    };
  }
  return {
    tier: "green",
    reason: "No significant early-pool risk signals detected.",
    suggestedStage: 1,
  };
}

export const VALUATION_ENGINE_VERSION = "2026-08-23.1";

export { RARITY_ORDER };
