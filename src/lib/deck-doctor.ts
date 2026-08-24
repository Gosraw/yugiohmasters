// =========================================================
// DECK DOCTOR - deterministic analysis foundation
//
// Consumes card_mechanics tags (from lib/synergy-engine.mjs's
// precompute, see the previous session's card_synergy_graph
// migration) plus deck composition to produce STRUCTURED findings a
// future AI layer can phrase - this module never generates prose
// itself, and never calls an AI provider. Every finding carries a
// `confidence` because some checks here are genuinely uncertain
// (e.g. "unsupported Extra Deck card" can't see a GENERIC material
// requirement satisfied by "any 2 monsters" - see
// UNSUPPORTED_EXTRA_DECK_CARD below) and that uncertainty must be
// disclosed, never hidden behind a confident-sounding label.
//
// Pure and synchronous: same (deck cards, mechanics, owned pool) in,
// same findings out. The caller is responsible for the one batched
// card_mechanics query (`.in("card_catalog_id", deckCardIds)`) this
// module needs - this file never queries anything itself.
//
// NOT BUILT HERE (deliberately, per this session's scope): AI prose
// generation for these findings ("Explain this advice" / "Ask
// Coach") - that's Part J's existing card-synergy.ts pattern, to be
// reused for Deck Doctor in a future session, not reinvented here.
// =========================================================

export type DeckDoctorSeverity = "info" | "notice" | "warning";

export type DeckDoctorFindingType =
  | "NORMAL_SUMMON_COMPETITION"
  | "GY_PAYOFF_WITHOUT_SETUP"
  | "GY_SETUP_WITHOUT_PAYOFF"
  | "UNSUPPORTED_EXTRA_DECK_CARD"
  | "OWNED_IMPROVEMENT";

export type DeckDoctorFinding = {
  type: DeckDoctorFindingType;
  severity: DeckDoctorSeverity;
  confidence: "high" | "medium" | "low";
  // Concise, human-readable summary - the ONLY thing normal UI
  // should show by default (see the product spec's "good"/"bad"
  // copy examples). Never contains a raw score or engine identifier.
  summary: string;
  involvedCardIds: string[];
  evidence: Record<string, unknown>;
  suggestedOwnedCardIds?: string[];
};

export type DeckDoctorCard = {
  cardCatalogId: string;
  name: string;
  cardType: string;
};

export type DeckDoctorMechanics = {
  tags: string[];
};

export type DeckDoctorSummary = {
  starterCount: number;
  extenderCount: number;
  searchAndDrawCount: number;
  interactionCount: number;
  removalCount: number;
  gySetupCount: number;
  gyPayoffCount: number;
  recoveryCount: number;
  normalSummonDependentCount: number;
  brickRiskCount: number;
};

export type DeckDoctorReport = {
  summary: DeckDoctorSummary;
  findings: DeckDoctorFinding[];
};

// Tuned conservatively - these are DISCLOSED thresholds, not secret
// magic numbers, and are the only place they live so they can be
// revisited without touching the check logic itself.
const NORMAL_SUMMON_COMPETITION_THRESHOLD = 12;

function tagCount(
  cards: DeckDoctorCard[],
  mechanicsByCardId: Map<string, DeckDoctorMechanics>,
  tag: string
): { count: number; cardIds: string[] } {
  const cardIds: string[] = [];
  for (const card of cards) {
    const mech = mechanicsByCardId.get(card.cardCatalogId);
    if (mech?.tags.includes(tag)) {
      cardIds.push(card.cardCatalogId);
    }
  }
  return { count: cardIds.length, cardIds };
}

function isExtraDeckKind(
  cardType: string,
  kind: "fusion" | "xyz"
): boolean {
  return cardType.toLowerCase().includes(kind);
}

/**
 * Given a gap (e.g. "no gy_setup card in the deck"), looks for an
 * OWNED card (not currently in the deck) that carries the tag that
 * would close it. Never suggests a card already in the deck, never
 * suggests a card the player doesn't own - both are structural
 * guarantees from how `ownedPool` is built by the caller (see
 * decks/[id]/page.tsx: it must already exclude in-deck cards).
 */
function findOwnedCandidate(
  ownedPool: (DeckDoctorCard & DeckDoctorMechanics)[],
  requiredTag: string
): string | null {
  const match = ownedPool.find((card) => card.tags.includes(requiredTag));
  return match?.cardCatalogId ?? null;
}

export function analyzeDeck(
  mainCards: DeckDoctorCard[],
  extraCards: DeckDoctorCard[],
  mechanicsByCardId: Map<string, DeckDoctorMechanics>,
  ownedPool: (DeckDoctorCard & DeckDoctorMechanics)[] = []
): DeckDoctorReport {
  const allCards = [...mainCards, ...extraCards];

  const starter = tagCount(mainCards, mechanicsByCardId, "starter");
  const extender = tagCount(mainCards, mechanicsByCardId, "extender");
  const searcher = tagCount(mainCards, mechanicsByCardId, "searcher");
  const tutor = tagCount(mainCards, mechanicsByCardId, "tutor");
  const draw = tagCount(mainCards, mechanicsByCardId, "draw");
  const interaction = tagCount(allCards, mechanicsByCardId, "interaction");
  const negate = tagCount(allCards, mechanicsByCardId, "negate");
  const removal = tagCount(allCards, mechanicsByCardId, "removal");
  const gySetup = tagCount(mainCards, mechanicsByCardId, "gy_setup");
  const gyPayoff = tagCount(allCards, mechanicsByCardId, "gy_payoff");
  const recovery = tagCount(allCards, mechanicsByCardId, "recovery");
  const followUp = tagCount(allCards, mechanicsByCardId, "follow_up");
  const normalSummonDependent = tagCount(
    mainCards,
    mechanicsByCardId,
    "normal_summon_dependency"
  );
  const brickRisk = tagCount(allCards, mechanicsByCardId, "brick_risk");

  const summary: DeckDoctorSummary = {
    starterCount: starter.count,
    extenderCount: extender.count,
    searchAndDrawCount:
      searcher.count + tutor.count + draw.count,
    interactionCount: interaction.count + negate.count,
    removalCount: removal.count,
    gySetupCount: gySetup.count,
    gyPayoffCount: gyPayoff.count,
    recoveryCount: recovery.count + followUp.count,
    normalSummonDependentCount: normalSummonDependent.count,
    brickRiskCount: brickRisk.count,
  };

  const findings: DeckDoctorFinding[] = [];

  // --- NORMAL_SUMMON_COMPETITION ---
  if (
    normalSummonDependent.count >
    NORMAL_SUMMON_COMPETITION_THRESHOLD
  ) {
    findings.push({
      type: "NORMAL_SUMMON_COMPETITION",
      severity: "notice",
      confidence: "medium",
      summary: `${normalSummonDependent.count} cards compete for your one Normal Summon each turn - your deck may brick more often than it needs to.`,
      involvedCardIds: normalSummonDependent.cardIds,
      evidence: {
        count: normalSummonDependent.count,
        threshold: NORMAL_SUMMON_COMPETITION_THRESHOLD,
      },
    });
  }

  // --- GY_PAYOFF_WITHOUT_SETUP / GY_SETUP_WITHOUT_PAYOFF ---
  // Both directions are checked independently - a deck can have
  // neither problem, one, or (in principle, though unusual) look
  // unbalanced from both angles if counts are extreme.
  if (gyPayoff.count > 0 && gySetup.count === 0) {
    const suggested = findOwnedCandidate(ownedPool, "gy_setup");
    findings.push({
      type: "GY_PAYOFF_WITHOUT_SETUP",
      severity: "warning",
      confidence: "medium",
      summary: `You have ${gyPayoff.count} card${
        gyPayoff.count === 1 ? "" : "s"
      } that want cards in the Graveyard, but nothing in this deck reliably sends cards there.`,
      involvedCardIds: gyPayoff.cardIds,
      evidence: {
        gyPayoffCount: gyPayoff.count,
        gySetupCount: 0,
      },
      ...(suggested
        ? { suggestedOwnedCardIds: [suggested] }
        : {}),
    });

    if (suggested) {
      findings.push({
        type: "OWNED_IMPROVEMENT",
        severity: "info",
        confidence: "medium",
        summary:
          "A card you already own could set up your Graveyard for the payoff cards above.",
        involvedCardIds: gyPayoff.cardIds,
        evidence: { gap: "gy_setup" },
        suggestedOwnedCardIds: [suggested],
      });
    }
  }

  if (gySetup.count > 0 && gyPayoff.count === 0) {
    findings.push({
      type: "GY_SETUP_WITHOUT_PAYOFF",
      severity: "info",
      confidence: "medium",
      summary: `You have ${gySetup.count} card${
        gySetup.count === 1 ? "" : "s"
      } sending cards to the Graveyard, but nothing in this deck cashes that in yet.`,
      involvedCardIds: gySetup.cardIds,
      evidence: {
        gySetupCount: gySetup.count,
        gyPayoffCount: 0,
      },
    });
  }

  // --- UNSUPPORTED_EXTRA_DECK_CARD ---
  // LOW/MEDIUM confidence by construction - this can only see
  // NAMED/tag-based enablement, never a generic "any 2 monsters"
  // material requirement being satisfiable by the deck's raw monster
  // count (that's a materially different, harder check this
  // foundation deliberately does not claim to make - see the module
  // header). A false "unsupported" here is possible for a deck whose
  // Extra Deck material requirement is fully generic; that is
  // disclosed via confidence, never hidden.
  for (const extraCard of extraCards) {
    const kind = isExtraDeckKind(extraCard.cardType, "fusion")
      ? "fusion"
      : isExtraDeckKind(extraCard.cardType, "xyz")
        ? "xyz"
        : null;
    if (!kind) continue;

    const enablerTag =
      kind === "fusion" ? "fusion_enabler" : "xyz_enabler";
    const hasEnabler = mainCards.some((card) =>
      mechanicsByCardId.get(card.cardCatalogId)?.tags.includes(enablerTag)
    );

    if (!hasEnabler) {
      const suggested = findOwnedCandidate(ownedPool, enablerTag);
      findings.push({
        type: "UNSUPPORTED_EXTRA_DECK_CARD",
        severity: "warning",
        confidence: "low",
        summary: `${extraCard.name} has no identified way to reach the field from this Main Deck yet.`,
        involvedCardIds: [extraCard.cardCatalogId],
        evidence: { kind, checkedTag: enablerTag },
        ...(suggested
          ? { suggestedOwnedCardIds: [suggested] }
          : {}),
      });

      if (suggested) {
        findings.push({
          type: "OWNED_IMPROVEMENT",
          severity: "info",
          confidence: "low",
          summary: `A card you already own may help ${extraCard.name} reach the field.`,
          involvedCardIds: [extraCard.cardCatalogId],
          evidence: { gap: enablerTag },
          suggestedOwnedCardIds: [suggested],
        });
      }
    }
  }

  return { summary, findings };
}
