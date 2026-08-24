// =========================================================
// SYNERGY ENGINE - deterministic card-intelligence layer
//
// WHY THIS FILE EXISTS
// The product goal is explicit: do NOT build a system that says
// "same archetype", "both mention Graveyard", "both are WIND" and
// calls that synergy. This file computes TYPED, DIRECTIONAL
// relations between cards ONLY where a real, checkable structural
// fact backs them up (an exact named match, a satisfied Extra Deck
// material constraint, or a documented directional tag-pair like
// "sends to GY" -> "uses the GY"), and represents everything else
// (starter/extender/brick-risk/normal-summon-dependency/etc.) as
// per-card TAGS rather than invented pairwise edges. Archetype and
// Attribute/Type equality are NEVER, by themselves, sufficient
// evidence for an edge - see computeSynergyEdges() below, which
// does not even accept them as an argument.
//
// REUSE, NOT REINVENTION
// Card text parsing (mandatory/optional/search-target reference
// classification, Extra Deck material specificity, quoted-name
// extraction) is NOT reimplemented here - it is imported directly
// from ./valuation-engine.mjs, which already built and regression-
// tested that exact classification (classifyReference,
// parseExtraDeckMaterials, extractQuotedReferences,
// extractValuationSignals, scoreCard). This file adds the pieces
// valuation-engine.mjs does not need for card VALUATION but does
// need for card RELATIONS: a wider mechanic-tag vocabulary, named-
// target extraction for search/material/requirement references, and
// pairwise edge computation between two cards' profiles.
//
// WHAT IS DELIBERATELY *NOT* A PAIRWISE EDGE
// Some concepts in the product spec (starter/extender competing for
// the Normal Summon, generic revival/recursion, self-lock/deck-lock,
// brick risk) are properties of ONE card, not a checkable relation
// between two SPECIFIC cards - a generic "Special Summon 1 monster
// from your GY" effect can revive nearly any monster in the catalog,
// so a pairwise "revives" edge to every eligible monster would be
// noise, not a relation. Those are stored as card_mechanics tags
// instead, aggregated at DECK level by the (future) Deck Coach,
// which is architecturally the right place to count "17 cards
// compete for your Normal Summon" - that is a deck-composition fact,
// not a two-card fact.
//
// DETERMINISM
// Every function here is pure and synchronous. Same card_catalog
// row(s) in -> same output, always. No AI/network call anywhere in
// this file.
// =========================================================

import {
  extractValuationSignals,
  scoreCard,
  classifyReference,
  parseExtraDeckMaterials,
  clauseAround,
  extractQuotedReferences,
} from "./valuation-engine.mjs";

export const SYNERGY_ENGINE_VERSION = "2026-08-24.1";

// ---------------------------------------------------------
// Mechanic tag vocabulary
// ---------------------------------------------------------

export const MECHANIC_TAGS = [
  "starter",
  "extender",
  "searcher",
  "tutor",
  "draw",
  "discard_outlet",
  "tribute_outlet",
  "gy_setup",
  "mill",
  "gy_payoff",
  "revival",
  "recursion",
  "banish_setup",
  "banish_payoff",
  "removal",
  "board_wipe",
  "negate",
  "interaction",
  "protection_battle",
  "protection_targeting",
  "protection_effect",
  "board_breaker",
  "floodgate",
  "token_generation",
  "normal_summon_dependency",
  "special_summon_enabler",
  "fusion_enabler",
  "xyz_enabler",
  "synchro_enabler",
  "link_enabler",
  "brick_risk",
  "hard_once_per_turn",
  "soft_once_per_turn",
  "self_lock",
  "recovery",
  "follow_up",
  "generic_utility",
  "build_around_payoff",
];

// ---------------------------------------------------------
// Small additional text patterns for concepts valuation-engine's
// signals do not already expose as a boolean (it was built for
// VALUATION, not relation-tagging, so a few of these overlap in
// spirit but need a slightly different, relation-focused test).
// Kept intentionally small and conservative - when a pattern is not
// confidently matched, the tag is simply omitted, never guessed.
// ---------------------------------------------------------

const TRIBUTE_PATTERN = /\btribute\b/i;
// valuation-engine's costBanishSelf only matches "banish THIS card"
// (a self-banish cost, e.g. for a GY-revival effect) - it does not
// expose a general "banish other card(s) as a resource" signal, so
// this mirrors its sibling costBanishOther pattern (present in
// valuation-engine.mjs but not exported in ValuationSignals) to give
// banish_setup the same two real-world shapes real cards use.
const BANISH_OTHER_COST_PATTERN =
  /you can banish \d* ?(?:cards?)? ?from your|banish \d+ (?:cards?)? ?from your (?:hand|deck|graveyard)/i;
// banish_payoff is a REACTIVE trigger off a card/resource being
// banished (by any means - self-banish cost, another card's effect,
// etc.), not "this card provides banish-based removal" (that is
// already covered separately by removalBanish -> the "removal" tag).
// Kept as its own pattern rather than reusing removalBanish, which
// tests for active "banish 1/2/3/a/it/that/all" phrasing and does
// not match passive "if/when a card is banished" trigger text.
const BANISH_PAYOFF_TRIGGER_PATTERN =
  /if (?:this card|a card you control|1 (?:or more )?cards? (?:you control|in your graveyard))[^.]{0,40}(?:is|are|was|were) banished|when (?:this card|a card)[^.]{0,20}banished/i;
const MILL_PATTERN =
  /\bmill(?:s|ed|ing)?\b|send(?:s)? (?:the )?top \d+ cards? of your deck to the graveyard/i;
const REVIVAL_PATTERN =
  /special summon[^.]{0,60}from (?:your |the )?(?:gy|graveyard)/i;
const RECURSION_PATTERN =
  /(add|return)[^.]{0,60}(?:from your (?:gy|graveyard)|to your hand)[^.]{0,30}(?:graveyard|hand)/i;
const TOKEN_GENERATION_PATTERN = /\btoken(?:s)?\b/i;
const BOARD_WIPE_PATTERN =
  /destroy all|banish all|shuffle all|send all[^.]{0,40}(?:field|graveyard) to/i;
const RECOVERY_PATTERN = /gain \d+ life points?/i;
const SELF_LOCK_PATTERN =
  /you can (?:only |cannot )[^.]{0,80}(?:special summon|activate)[^.]{0,40}(?:monster|card)/i;
const BOARD_BREAKER_PATTERN =
  /(destroy|banish|return to the hand|shuffle into the deck)[^.]{0,40}(?:1|a|all|monster\(s\) your opponent controls)/i;

function isMonster(card) {
  return Boolean(card.card_type && card.card_type.toLowerCase().includes("monster"));
}

function isExtraDeckCard(signals) {
  return signals.isExtraDeckCard === true;
}

/**
 * Named cards referenced with a given classified-reference type,
 * lowercased, deduplicated. `types` is an array so callers can pull
 * e.g. both mandatory_requirement and mandatory_target in one pass.
 */
function namedTargetsOfType(classifiedRefs, types) {
  const set = new Set();
  for (const ref of classifiedRefs ?? []) {
    if (types.includes(ref.type) && ref.term) {
      set.add(ref.term.trim().toLowerCase());
    }
  }
  return Array.from(set);
}

/**
 * Computes the full deterministic mechanic profile for one card.
 * Reuses valuation-engine's signal extraction and (for numeric
 * axis-derived tags like brick_risk/build_around_payoff) its
 * scoring - both already regression-tested elsewhere, not
 * duplicated here.
 */
export function computeCardMechanics(card) {
  const signals = extractValuationSignals(card);
  const scores = scoreCard(signals, card);
  const text = card.description ?? "";

  const tags = new Set();

  // --- Directly reused from valuation-engine signals ---
  if (signals.searches && signals.searchGeneric) tags.add("searcher");
  if (signals.searches && signals.searchNarrow) tags.add("tutor");
  if (signals.drawsCards) tags.add("draw");
  if (signals.costDiscard) tags.add("discard_outlet");
  if (signals.costTribute) tags.add("tribute_outlet");
  if (signals.costBanishSelf) tags.add("banish_setup");
  if (BANISH_OTHER_COST_PATTERN.test(text)) tags.add("banish_setup");
  if (signals.usableFromGraveyard) tags.add("gy_payoff");
  if (signals.removalDestroy || signals.removalBounce || signals.removalBanish)
    tags.add("removal");
  if (signals.removalNegate || signals.negatesActivationOrEffect || signals.negatesAttack) {
    tags.add("negate");
    tags.add("interaction");
  }
  if (signals.providesRemoval) tags.add("interaction");
  if (signals.battleProtection) tags.add("protection_battle");
  if (signals.nonTargeting === false && (signals.effectProtection || signals.fullProtection))
    tags.add("protection_targeting");
  if (signals.effectProtection || signals.fullProtection || signals.conditionalProtection)
    tags.add("protection_effect");
  if (signals.isFloodgateOrLock) tags.add("floodgate");
  if (signals.hardOncePerTurn) tags.add("hard_once_per_turn");
  if (signals.softOncePerTurn) tags.add("soft_once_per_turn");
  if (signals.gainsLifePoints) tags.add("recovery");

  if (signals.extraDeckKind?.fusion) tags.add("fusion_enabler");
  if (signals.extraDeckKind?.xyz) tags.add("xyz_enabler");
  if (signals.extraDeckKind?.synchro) tags.add("synchro_enabler");
  if (signals.extraDeckKind?.link) tags.add("link_enabler");

  // --- New relation-focused patterns ---
  if (TRIBUTE_PATTERN.test(text) && !signals.costTribute) tags.add("tribute_outlet");
  if (MILL_PATTERN.test(text)) tags.add("mill");
  if (/send[^.]{0,40}graveyard|discard[^.]{0,40}graveyard/i.test(text)) tags.add("gy_setup");
  if (REVIVAL_PATTERN.test(text)) tags.add("revival");
  if (RECURSION_PATTERN.test(text)) tags.add("recursion");
  if (signals.removalBanish && /if[^.]{0,40}banish|when[^.]{0,40}banish/i.test(text))
    tags.add("banish_payoff");
  if (BANISH_PAYOFF_TRIGGER_PATTERN.test(text)) tags.add("banish_payoff");
  if (TOKEN_GENERATION_PATTERN.test(text) && /special summon[^.]{0,30}token/i.test(text))
    tags.add("token_generation");
  if (BOARD_WIPE_PATTERN.test(text)) tags.add("board_wipe");
  if (BOARD_BREAKER_PATTERN.test(text) && isMonster(card)) tags.add("board_breaker");
  if (RECOVERY_PATTERN.test(text)) tags.add("recovery");
  if (SELF_LOCK_PATTERN.test(text)) tags.add("self_lock");

  // Special Summon enabler: the card's own text grants a Special
  // Summon to something OTHER than "this card" (a plain self-
  // referential "Special Summon this card" does not enable other
  // cards). Conservative: requires the word "Special Summon" without
  // it being immediately about "this card".
  if (
    /special summon/i.test(text) &&
    !/special summon this card/i.test(text.toLowerCase())
  ) {
    tags.add("special_summon_enabler");
  }

  // Normal Summon dependency: a Main Deck monster with no textual
  // path to being Special Summoned itself is dependent on winning
  // the Normal Summon for the turn. Deliberately conservative/LOW
  // CONFIDENCE - real oracle text has many exceptions this simple
  // check cannot see (e.g. Set by another card's effect) - flagged
  // in evidence.confidence, never asserted as certain.
  if (isMonster(card) && !isExtraDeckCard(signals) && !signals.isNormalMonster) {
    const hasOwnSpecialSummonPath =
      /can be special summoned|special summon this card|special summon itself/i.test(
        text
      );
    if (!hasOwnSpecialSummonPath) {
      tags.add("normal_summon_dependency");
    }
  } else if (isMonster(card) && signals.isNormalMonster) {
    tags.add("normal_summon_dependency");
  }

  // Starter / extender - approximated from valuation-engine's own
  // power/accessibility/floor axes rather than a second independent
  // guess: a starter is a card that functions well ON ITS OWN
  // (high floor, low dependency, and does something proactive -
  // searches, special-summon-enables, or generates advantage from
  // nothing). An extender continues a play already in motion
  // (usable from GY, or a soft-once-per-turn card providing a
  // second copy of value) with at least moderate floor.
  const proactive =
    tags.has("searcher") ||
    tags.has("tutor") ||
    tags.has("special_summon_enabler") ||
    signals.generatesAdvantage === true;
  if (proactive && scores.floor >= 5 && scores.dependency <= 3) {
    tags.add("starter");
  }
  if (
    (tags.has("gy_payoff") || tags.has("recursion") || signals.softOncePerTurn) &&
    scores.floor >= 4
  ) {
    tags.add("extender");
  }

  // Brick risk / generic utility / build-around payoff - directly
  // reused from valuation-engine's own already-validated axes
  // rather than re-deriving a parallel notion of "is this card
  // risky/generic/a payoff".
  if (scores.dependency >= 5 && scores.floor <= 3) tags.add("brick_risk");
  if (scores.genericUtility >= 6) tags.add("generic_utility");
  if (scores.ceiling - scores.draftValue >= 3) tags.add("build_around_payoff");

  // --- Named target extraction (for pairwise edges below) ---
  const searchTargets = namedTargetsOfType(signals.classifiedRefs, ["search_target"]);

  const namedMaterialTargets =
    signals.materials?.specificity === "named"
      ? extractQuotedReferences(signals.materials.materialText).map((r) =>
          r.term.trim().toLowerCase()
        )
      : [];

  const namedRequirementTargets = namedTargetsOfType(signals.classifiedRefs, [
    "mandatory_requirement",
    "mandatory_target",
  ]).filter((name) => !namedMaterialTargets.includes(name));

  return {
    cardId: card.id,
    tags: Array.from(tags),
    searchTargets,
    namedMaterialTargets,
    namedRequirementTargets,
    materialSpecificity: signals.materials?.specificity ?? null,
    materialText: signals.materials?.materialText ?? null,
    evidence: {
      classifiedRefs: signals.classifiedRefs,
      isExtraDeckCard: signals.isExtraDeckCard,
      extraDeckKind: signals.extraDeckKind,
      scores: {
        power: scores.power,
        accessibility: scores.accessibility,
        dependency: scores.dependency,
        genericUtility: scores.genericUtility,
        floor: scores.floor,
        ceiling: scores.ceiling,
        draftValue: scores.draftValue,
      },
    },
    engineVersion: SYNERGY_ENGINE_VERSION,
  };
}

// ---------------------------------------------------------
// Pairwise edge computation
// ---------------------------------------------------------

const WEIGHT = {
  searches: 90,
  materialSupplyNamed: 90,
  requirementSatisfies: 85,
  materialSupplyConstrained: 55,
  gySetupFor: 35,
  discardPayoffFor: 35,
  banishPayoffFor: 35,
  spellTrapSupport: 45,
};

function nameMatches(candidateName, targetList) {
  if (!candidateName) return false;
  return targetList.includes(candidateName.trim().toLowerCase());
}

/**
 * Does `card` (a Main Deck monster/other) satisfy the CONSTRAINED
 * (not named) material requirement described by `materialText`? Only
 * checks the specific, checkable constraints valuation-engine's
 * parseExtraDeckMaterials already looked for (Attribute/Type/Tuner) -
 * never a guess at unstated requirements.
 */
function satisfiesConstrainedMaterial(materialText, card) {
  if (!materialText) return false;
  const t = materialText.toLowerCase();
  if (card.attribute && t.includes(card.attribute.toLowerCase())) return true;
  if (card.monster_type && t.includes(card.monster_type.toLowerCase())) return true;
  if (t.includes("tuner") && card.card_type && card.card_type.toLowerCase().includes("tuner"))
    return true;
  return false;
}

/**
 * Computes every typed edge between `cardA`/`mechA` and
 * `cardB`/`mechB`, in whichever direction(s) the evidence actually
 * supports (a function call covers both directions in one pass - the
 * precompute script only needs to call this once per unordered
 * pair). Returns an empty array when no real relation is found -
 * NEVER falls back to archetype/attribute equality; those simply
 * are not inputs to this function at all.
 */
export function computeSynergyEdges(cardA, mechA, cardB, mechB) {
  const edges = [];

  const push = (sourceCard, targetCard, edgeType, weightKey, reason, evidence, confidence) => {
    edges.push({
      sourceCardId: sourceCard.id,
      targetCardId: targetCard.id,
      edgeType,
      score: WEIGHT[weightKey],
      confidence,
      deterministicReason: reason,
      evidence,
      engineVersion: SYNERGY_ENGINE_VERSION,
    });
  };

  // searches: A's text names B as a search target.
  if (nameMatches(cardB.name, mechA.searchTargets)) {
    push(
      cardA,
      cardB,
      "searches",
      "searches",
      `${cardA.name} can search ${cardB.name} directly by name.`,
      { matchedName: cardB.name },
      "high"
    );
  }
  if (nameMatches(cardA.name, mechB.searchTargets)) {
    push(
      cardB,
      cardA,
      "searches",
      "searches",
      `${cardB.name} can search ${cardA.name} directly by name.`,
      { matchedName: cardA.name },
      "high"
    );
  }

  // material_supply_named: B is a named material A's text requires
  // (A is the Extra Deck card).
  if (nameMatches(cardB.name, mechA.namedMaterialTargets)) {
    push(
      cardB,
      cardA,
      "material_supply_named",
      "materialSupplyNamed",
      `${cardB.name} is named directly as required Extra Deck material for ${cardA.name}.`,
      { materialText: mechA.materialText },
      "high"
    );
  }
  if (nameMatches(cardA.name, mechB.namedMaterialTargets)) {
    push(
      cardA,
      cardB,
      "material_supply_named",
      "materialSupplyNamed",
      `${cardA.name} is named directly as required Extra Deck material for ${cardB.name}.`,
      { materialText: mechB.materialText },
      "high"
    );
  }

  // material_supply_constrained: B satisfies A's constrained (but
  // not named) material requirement (Attribute/Type/Tuner match).
  if (
    mechA.materialSpecificity === "constrained" &&
    isMonsterCard(cardB) &&
    satisfiesConstrainedMaterial(mechA.materialText, cardB)
  ) {
    push(
      cardB,
      cardA,
      "material_supply_constrained",
      "materialSupplyConstrained",
      `${cardB.name} matches the Attribute/Type/Tuner requirement for ${cardA.name}'s Extra Deck material.`,
      { materialText: mechA.materialText },
      "medium"
    );
  }
  if (
    mechB.materialSpecificity === "constrained" &&
    isMonsterCard(cardA) &&
    satisfiesConstrainedMaterial(mechB.materialText, cardA)
  ) {
    push(
      cardA,
      cardB,
      "material_supply_constrained",
      "materialSupplyConstrained",
      `${cardA.name} matches the Attribute/Type/Tuner requirement for ${cardB.name}'s Extra Deck material.`,
      { materialText: mechB.materialText },
      "medium"
    );
  }

  // requirement_satisfies: B is named as a non-material mandatory
  // requirement of A (e.g. "banishing 1 <Name> you control").
  if (nameMatches(cardB.name, mechA.namedRequirementTargets)) {
    push(
      cardB,
      cardA,
      "requirement_satisfies",
      "requirementSatisfies",
      `${cardA.name} has a hard requirement that ${cardB.name} directly satisfies.`,
      {},
      "high"
    );
  }
  if (nameMatches(cardA.name, mechB.namedRequirementTargets)) {
    push(
      cardA,
      cardB,
      "requirement_satisfies",
      "requirementSatisfies",
      `${cardB.name} has a hard requirement that ${cardA.name} directly satisfies.`,
      {},
      "high"
    );
  }

  // gy_setup_for / discard_payoff_for / banish_payoff_for -
  // directional tag-pairs. Medium confidence: real (the tags are
  // each individually evidenced), but not name-specific, so this
  // candidate is one of potentially several that would satisfy it.
  if (mechA.tags.includes("gy_setup") && mechB.tags.includes("gy_payoff")) {
    push(
      cardA,
      cardB,
      "gy_setup_for",
      "gySetupFor",
      `${cardA.name} sends cards to the Graveyard, and ${cardB.name} has an effect that uses the Graveyard.`,
      {},
      "medium"
    );
  }
  if (mechB.tags.includes("gy_setup") && mechA.tags.includes("gy_payoff")) {
    push(
      cardB,
      cardA,
      "gy_setup_for",
      "gySetupFor",
      `${cardB.name} sends cards to the Graveyard, and ${cardA.name} has an effect that uses the Graveyard.`,
      {},
      "medium"
    );
  }

  if (mechA.tags.includes("discard_outlet") && mechB.tags.includes("gy_payoff")) {
    push(
      cardA,
      cardB,
      "discard_payoff_for",
      "discardPayoffFor",
      `${cardA.name} can discard cards, which can feed ${cardB.name}'s Graveyard-based effect.`,
      {},
      "medium"
    );
  }
  if (mechB.tags.includes("discard_outlet") && mechA.tags.includes("gy_payoff")) {
    push(
      cardB,
      cardA,
      "discard_payoff_for",
      "discardPayoffFor",
      `${cardB.name} can discard cards, which can feed ${cardA.name}'s Graveyard-based effect.`,
      {},
      "medium"
    );
  }

  if (mechA.tags.includes("banish_setup") && mechB.tags.includes("banish_payoff")) {
    push(
      cardA,
      cardB,
      "banish_payoff_for",
      "banishPayoffFor",
      `${cardA.name} can banish cards, which can trigger ${cardB.name}'s banish-based effect.`,
      {},
      "medium"
    );
  }
  if (mechB.tags.includes("banish_setup") && mechA.tags.includes("banish_payoff")) {
    push(
      cardB,
      cardA,
      "banish_payoff_for",
      "banishPayoffFor",
      `${cardB.name} can banish cards, which can trigger ${cardA.name}'s banish-based effect.`,
      {},
      "medium"
    );
  }

  // spell_trap_support: a Spell/Trap explicitly names the OTHER
  // card's archetype as a functional (not thematic-only, not self-
  // referential) reference - reuses valuation-engine's own
  // classifyReference distinction rather than a raw substring test,
  // so a card whose name merely CONTAINS the archetype word does not
  // qualify (the exact false-positive this task explicitly warns
  // against).
  const supportsArchetype = (supportMech, supportCard, archetypeName) => {
    if (!archetypeName) return false;
    if (isMonsterCard(supportCard)) return false;
    return (supportMech.evidence.classifiedRefs ?? []).some(
      (ref) =>
        ref.term &&
        ref.term.toLowerCase() === archetypeName.toLowerCase() &&
        (ref.type === "mandatory_requirement" ||
          ref.type === "mandatory_target" ||
          ref.type === "optional_bonus" ||
          ref.type === "search_target")
    );
  };

  if (cardA.archetype && supportsArchetype(mechB, cardB, cardA.archetype)) {
    push(
      cardB,
      cardA,
      "spell_trap_support",
      "spellTrapSupport",
      `${cardB.name} functionally supports the "${cardA.archetype}" archetype in its own text (not just a thematic name).`,
      { archetype: cardA.archetype },
      "medium"
    );
  }
  if (cardB.archetype && supportsArchetype(mechA, cardA, cardB.archetype)) {
    push(
      cardA,
      cardB,
      "spell_trap_support",
      "spellTrapSupport",
      `${cardA.name} functionally supports the "${cardB.archetype}" archetype in its own text (not just a thematic name).`,
      { archetype: cardB.archetype },
      "medium"
    );
  }

  return edges;
}

function isMonsterCard(card) {
  return Boolean(card.card_type && card.card_type.toLowerCase().includes("monster"));
}

export { clauseAround, classifyReference, parseExtraDeckMaterials, extractQuotedReferences };
