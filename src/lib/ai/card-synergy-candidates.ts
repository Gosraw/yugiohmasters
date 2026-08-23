// =========================================================
// CARD SYNERGY - deterministic candidate generation + ranking
// (STEP 1 + STEP 2 of the hybrid architecture)
//
// Consumes the mechanic tags from card-mechanics.ts plus a handful
// of direct card_catalog fields (card_type, level/rank, attribute,
// archetype) to score how well a candidate card pairs with a
// target card. Pure, synchronous, no AI/network calls - this is
// exactly the "real backend candidate generation from real card
// data" step the product spec requires before any AI explanation
// is ever generated, and it is deliberately NOT "same archetype =
// good together": archetype match is only ONE signal, weighted
// lower than a genuine mechanical interaction (a directional GY/
// discard/banish pair, a material level/rank match, or explicit
// Spell/Trap archetype support).
//
// Master Duel eligibility is enforced here (conservative rule -
// only unlimited/semi_limited/limited are offerable, mirrors
// src/lib/master-duel.ts) so nothing downstream (AI layer, UI) can
// accidentally recommend a Forbidden/Not Available/Unknown card.
// =========================================================

import {
  extractMechanicTags,
  isSpellTrapSupportFor,
  type MechanicCardInput,
} from "@/lib/ai/card-mechanics";

import {
  isMasterDuelOfferable,
  getMasterDuelStatusMeta,
  type MasterDuelStatus,
} from "@/lib/master-duel";

export type SynergyCatalogCard = MechanicCardInput & {
  master_duel_status: MasterDuelStatus;
  image_url?: string | null;
  game_rarity?: string | null;
};

export type SynergyReasonKind =
  | "gy_pair"
  | "discard_pair"
  | "banish_pair"
  | "material_level"
  | "material_type"
  | "spell_trap_support"
  | "shared_attribute"
  | "shared_monster_type"
  | "shared_archetype";

export type SynergyReason = {
  kind: SynergyReasonKind;
  // Short, factual, human-readable description grounded ONLY in
  // fields actually present on the two cards - this is exactly the
  // "structured mechanic facts" the AI explanation layer is allowed
  // to see and paraphrase, never invent.
  detail: string;
  weight: number;
};

export type SynergyCandidate = {
  card: SynergyCatalogCard;
  score: number;
  reasons: SynergyReason[];
  ownedCount: number;
  masterDuelNote: string | null;
};

export type CandidateGenerationOptions = {
  // card_catalog id -> copies owned by the viewing player. Absent
  // or missing entries are treated as 0 owned.
  ownedCounts?: Map<string, number>;
  // card_catalog ids already in the deck being viewed (deck-aware
  // mode) - excluded from suggestions since they're already there.
  deckCardIds?: Set<string>;
  // Max candidates returned after ranking. UI trims further (max 3
  // shown), this just bounds the work done/returned upstream of that.
  limit?: number;
};

const WEIGHT = {
  directionalPair: 40,
  materialLevel: 35,
  materialType: 15,
  spellTrapSupport: 45,
  sharedAttribute: 5,
  sharedMonsterType: 5,
  sharedArchetype: 10,
} as const;

function isExtraDeckKind(
  cardType: string | null,
  kind: "xyz" | "fusion" | "synchro" | "link"
): boolean {
  if (!cardType) return false;
  return cardType.toLowerCase().includes(kind);
}

/**
 * Directional GY/discard/banish reasons between `target` and
 * `candidate`, checked in both directions (target sends & candidate
 * uses, or candidate sends & target uses).
 */
function directionalReasons(
  target: SynergyCatalogCard,
  candidate: SynergyCatalogCard,
  targetTags: Set<string>,
  candidateTags: Set<string>
): SynergyReason[] {
  const reasons: SynergyReason[] = [];

  if (
    targetTags.has("sends_to_graveyard") &&
    candidateTags.has("uses_graveyard")
  ) {
    reasons.push({
      kind: "gy_pair",
      detail: `${target.name} sends cards to the Graveyard, and ${candidate.name} benefits from cards being in the Graveyard.`,
      weight: WEIGHT.directionalPair,
    });
  } else if (
    candidateTags.has("sends_to_graveyard") &&
    targetTags.has("uses_graveyard")
  ) {
    reasons.push({
      kind: "gy_pair",
      detail: `${candidate.name} sends cards to the Graveyard, which feeds ${target.name}'s Graveyard effect.`,
      weight: WEIGHT.directionalPair,
    });
  }

  if (
    targetTags.has("discards") &&
    candidateTags.has("benefits_from_discard")
  ) {
    reasons.push({
      kind: "discard_pair",
      detail: `${target.name} discards cards, and ${candidate.name} has an effect that triggers off discarding.`,
      weight: WEIGHT.directionalPair,
    });
  } else if (
    candidateTags.has("discards") &&
    targetTags.has("benefits_from_discard")
  ) {
    reasons.push({
      kind: "discard_pair",
      detail: `${candidate.name} discards cards, which can trigger ${target.name}'s discard payoff.`,
      weight: WEIGHT.directionalPair,
    });
  }

  if (
    targetTags.has("banishes") &&
    candidateTags.has("benefits_from_banish")
  ) {
    reasons.push({
      kind: "banish_pair",
      detail: `${target.name} banishes cards, and ${candidate.name} has an effect that triggers off being banished.`,
      weight: WEIGHT.directionalPair,
    });
  } else if (
    candidateTags.has("banishes") &&
    targetTags.has("benefits_from_banish")
  ) {
    reasons.push({
      kind: "banish_pair",
      detail: `${candidate.name} banishes cards, which can trigger ${target.name}'s banish payoff.`,
      weight: WEIGHT.directionalPair,
    });
  }

  return reasons;
}

/**
 * Xyz Material level compatibility (the one material relationship
 * we can check precisely from direct fields: an Xyz Monster's
 * `rank` must equal the Level of the monsters used as its material)
 * plus a weaker generic "both reference the same Extra Deck
 * material type" signal for Fusion/Synchro/Link.
 */
function materialReasons(
  target: SynergyCatalogCard,
  candidate: SynergyCatalogCard
): SynergyReason[] {
  const reasons: SynergyReason[] = [];

  const targetIsXyz = isExtraDeckKind(target.card_type, "xyz");
  const candidateIsXyz = isExtraDeckKind(candidate.card_type, "xyz");

  if (
    targetIsXyz &&
    target.rank !== null &&
    !candidateIsXyz &&
    candidate.level !== null &&
    candidate.level === target.rank
  ) {
    reasons.push({
      kind: "material_level",
      detail: `${candidate.name} is Level ${candidate.level}, matching the Rank ${target.rank} required as Xyz Material for ${target.name}.`,
      weight: WEIGHT.materialLevel,
    });
  } else if (
    candidateIsXyz &&
    candidate.rank !== null &&
    !targetIsXyz &&
    target.level !== null &&
    target.level === candidate.rank
  ) {
    reasons.push({
      kind: "material_level",
      detail: `${target.name} is Level ${target.level}, matching the Rank ${candidate.rank} required as Xyz Material for ${candidate.name}.`,
      weight: WEIGHT.materialLevel,
    });
  }

  // Weaker generic signal: both cards are part of the same
  // Fusion/Synchro/Link "family" (one is the Extra Deck monster,
  // the other explicitly references that material type in its own
  // text) - genuinely weaker than the precise Xyz level match above
  // since it can't verify the exact requirement is met.
  (["fusion", "synchro", "link"] as const).forEach((kind) => {
    const targetIsKind = isExtraDeckKind(target.card_type, kind);
    const candidateIsKind = isExtraDeckKind(candidate.card_type, kind);
    const targetMentions = extractMechanicTags(target).includes(
      `${kind}_material_user` as never
    );
    const candidateMentions = extractMechanicTags(candidate).includes(
      `${kind}_material_user` as never
    );

    if (targetIsKind && !candidateIsKind && candidateMentions) {
      reasons.push({
        kind: "material_type",
        detail: `${candidate.name}'s text references being used as ${kind[0].toUpperCase()}${kind.slice(1)} Material, which ${target.name} requires.`,
        weight: WEIGHT.materialType,
      });
    } else if (candidateIsKind && !targetIsKind && targetMentions) {
      reasons.push({
        kind: "material_type",
        detail: `${target.name}'s text references being used as ${kind[0].toUpperCase()}${kind.slice(1)} Material, which ${candidate.name} requires.`,
        weight: WEIGHT.materialType,
      });
    }
  });

  return reasons;
}

function spellTrapSupportReasons(
  target: SynergyCatalogCard,
  candidate: SynergyCatalogCard
): SynergyReason[] {
  const reasons: SynergyReason[] = [];

  if (
    target.archetype &&
    isSpellTrapSupportFor(candidate, target.archetype)
  ) {
    reasons.push({
      kind: "spell_trap_support",
      detail: `${candidate.name} explicitly supports the "${target.archetype}" archetype in its own text.`,
      weight: WEIGHT.spellTrapSupport,
    });
  }

  if (
    candidate.archetype &&
    isSpellTrapSupportFor(target, candidate.archetype)
  ) {
    reasons.push({
      kind: "spell_trap_support",
      detail: `${target.name} explicitly supports the "${candidate.archetype}" archetype in its own text.`,
      weight: WEIGHT.spellTrapSupport,
    });
  }

  return reasons;
}

function weakSignalReasons(
  target: SynergyCatalogCard,
  candidate: SynergyCatalogCard
): SynergyReason[] {
  const reasons: SynergyReason[] = [];

  if (
    target.attribute &&
    candidate.attribute &&
    target.attribute === candidate.attribute
  ) {
    reasons.push({
      kind: "shared_attribute",
      detail: `Both cards are ${target.attribute} Attribute.`,
      weight: WEIGHT.sharedAttribute,
    });
  }

  if (
    target.monster_type &&
    candidate.monster_type &&
    target.monster_type === candidate.monster_type
  ) {
    reasons.push({
      kind: "shared_monster_type",
      detail: `Both cards are ${target.monster_type} type.`,
      weight: WEIGHT.sharedMonsterType,
    });
  }

  // Archetype equality is deliberately the WEAKEST signal here and
  // never the sole basis for a suggestion - see the filter in
  // generateSynergyCandidates() below, which requires at least one
  // other real mechanical reason before a candidate is included at
  // all when its only match is a shared archetype string.
  if (
    target.archetype &&
    candidate.archetype &&
    target.archetype === candidate.archetype
  ) {
    reasons.push({
      kind: "shared_archetype",
      detail: `Both cards are part of the "${target.archetype}" archetype.`,
      weight: WEIGHT.sharedArchetype,
    });
  }

  return reasons;
}

/**
 * Ranks `pool` against `target` and returns Master-Duel-eligible,
 * mechanically-justified candidates sorted best-first. A candidate
 * whose ONLY reason is `shared_archetype` is dropped - archetype
 * alone is not allowed to be the entire justification for a
 * suggestion, per the product requirement that this must not be a
 * "same archetype = good together" feature.
 */
export function generateSynergyCandidates(
  target: SynergyCatalogCard,
  pool: SynergyCatalogCard[],
  options: CandidateGenerationOptions = {}
): SynergyCandidate[] {
  const targetTags = new Set<string>(extractMechanicTags(target));

  const candidates: SynergyCandidate[] = [];

  for (const candidate of pool) {
    if (candidate.id === target.id) continue;

    if (options.deckCardIds?.has(candidate.id)) continue;

    if (!isMasterDuelOfferable(candidate.master_duel_status)) continue;

    const candidateTags = new Set<string>(extractMechanicTags(candidate));

    const reasons: SynergyReason[] = [
      ...directionalReasons(target, candidate, targetTags, candidateTags),
      ...materialReasons(target, candidate),
      ...spellTrapSupportReasons(target, candidate),
      ...weakSignalReasons(target, candidate),
    ];

    if (reasons.length === 0) continue;

    const meaningfulReasons = reasons.filter(
      (r) => r.kind !== "shared_archetype"
    );
    // Archetype match alone (with nothing else) is not a real
    // recommendation - require at least one genuine mechanical or
    // weak-but-non-archetype signal too.
    if (meaningfulReasons.length === 0) continue;

    const score = reasons.reduce((sum, r) => sum + r.weight, 0);
    const meta = getMasterDuelStatusMeta(candidate.master_duel_status);

    candidates.push({
      card: candidate,
      score,
      reasons: reasons.sort((a, b) => b.weight - a.weight),
      ownedCount: options.ownedCounts?.get(candidate.id) ?? 0,
      masterDuelNote:
        meta.tone === "restricted"
          ? `${meta.label} in Master Duel.`
          : null,
    });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.card.name.localeCompare(b.card.name);
  });

  return candidates.slice(0, options.limit ?? 20);
}

/**
 * Splits ranked candidates into "owned" (the player has at least 1
 * copy) and "other" (unowned) groups, each still sorted best-first -
 * the collection-aware "BEST SYNERGY YOU OWN" / "OTHER GOOD
 * SYNERGIES" split the product spec asks for.
 */
export function groupSynergyCandidatesByOwnership(
  candidates: SynergyCandidate[]
): {
  owned: SynergyCandidate[];
  other: SynergyCandidate[];
} {
  return {
    owned: candidates.filter((c) => c.ownedCount > 0),
    other: candidates.filter((c) => c.ownedCount === 0),
  };
}
