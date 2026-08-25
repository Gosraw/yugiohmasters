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
  | "BRICK_RISK"
  | "INSUFFICIENT_INTERACTION"
  | "TOO_FEW_SEARCH_TARGETS"
  | "SPELL_TRAP_BALANCE"
  | "OWNED_IMPROVEMENT";

export type DeckDoctorFinding = {
  type: DeckDoctorFindingType;
  severity: DeckDoctorSeverity;
  confidence: "high" | "medium" | "low";
  // Distinguishes a plain structural fact ("3 Fusion monsters, 0
  // Fusion-access cards") from a heuristic judgment call ("this deck
  // may run low on interaction") - both are useful, but the UI/AI
  // layer must never present a heuristic with the same certainty as
  // a structural fact. `confidence` alone conflated these before;
  // `kind` makes the distinction explicit and machine-readable.
  kind: "structural" | "heuristic";
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
// A deck this heavy on "brick_risk"-tagged cards (situational/
// conditional/dead-in-hand-often cards) is worth flagging - this is
// a heuristic judgment, not a rule violation, hence `kind: "heuristic"`.
const BRICK_RISK_THRESHOLD = 8;
// Fewer than this many combined interaction/negate cards across the
// whole 40-card deck is a soft signal the deck may struggle against
// an opposing board - deliberately low so it only fires for decks
// genuinely light on interaction, not every aggressive build.
const MIN_INTERACTION_THRESHOLD = 4;
// Fewer than this many searcher/tutor/draw cards makes a deck's plan
// hard to assemble consistently - also deliberately conservative.
const MIN_SEARCH_AND_DRAW_THRESHOLD = 3;
// A Main Deck this light on Spells+Traps combined is unusual for a
// consistent deck (most competitive builds run at least this many
// non-monster cards for search/interaction/setup) - flagged only as
// a soft balance note, never as a hard rule.
const MIN_SPELL_TRAP_THRESHOLD = 8;

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
  kind: "fusion" | "xyz" | "synchro" | "link"
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
      kind: "heuristic",
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
      kind: "structural",
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
        kind: "structural",
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
      kind: "structural",
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
        : isExtraDeckKind(extraCard.cardType, "synchro")
          ? "synchro"
          : isExtraDeckKind(extraCard.cardType, "link")
            ? "link"
            : null;
    if (!kind) continue;

    const enablerTag =
      kind === "fusion"
        ? "fusion_enabler"
        : kind === "xyz"
          ? "xyz_enabler"
          : kind === "synchro"
            ? "synchro_enabler"
            : "link_enabler";
    const hasEnabler = mainCards.some((card) =>
      mechanicsByCardId.get(card.cardCatalogId)?.tags.includes(enablerTag)
    );

    if (!hasEnabler) {
      const suggested = findOwnedCandidate(ownedPool, enablerTag);
      findings.push({
        type: "UNSUPPORTED_EXTRA_DECK_CARD",
        severity: "warning",
        confidence: "low",
        kind: "structural",
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
          kind: "structural",
          summary: `A card you already own may help ${extraCard.name} reach the field.`,
          involvedCardIds: [extraCard.cardCatalogId],
          evidence: { gap: enablerTag },
          suggestedOwnedCardIds: [suggested],
        });
      }
    }
  }

  // --- BRICK_RISK ---
  // Heuristic, threshold-tuned (see BRICK_RISK_THRESHOLD) - a high
  // count of situational/conditional cards is a soft consistency
  // signal, not a rule violation.
  if (brickRisk.count > BRICK_RISK_THRESHOLD) {
    findings.push({
      type: "BRICK_RISK",
      severity: "notice",
      confidence: "low",
      kind: "heuristic",
      summary: `${brickRisk.count} cards in this deck are situational or dead in certain hands - this may make your opening hands less consistent.`,
      involvedCardIds: brickRisk.cardIds,
      evidence: { count: brickRisk.count, threshold: BRICK_RISK_THRESHOLD },
    });
  }

  // --- INSUFFICIENT_INTERACTION ---
  if (
    allCards.length > 0 &&
    interaction.count + negate.count < MIN_INTERACTION_THRESHOLD
  ) {
    findings.push({
      type: "INSUFFICIENT_INTERACTION",
      severity: "notice",
      confidence: "low",
      kind: "heuristic",
      summary: `Only ${interaction.count + negate.count} card${
        interaction.count + negate.count === 1 ? "" : "s"
      } in this deck interact with your opponent's plays - you may have a hard time stopping a strong opposing turn.`,
      involvedCardIds: [...interaction.cardIds, ...negate.cardIds],
      evidence: {
        count: interaction.count + negate.count,
        threshold: MIN_INTERACTION_THRESHOLD,
      },
    });
  }

  // --- TOO_FEW_SEARCH_TARGETS ---
  if (
    mainCards.length > 0 &&
    searcher.count + tutor.count + draw.count < MIN_SEARCH_AND_DRAW_THRESHOLD
  ) {
    findings.push({
      type: "TOO_FEW_SEARCH_TARGETS",
      severity: "notice",
      confidence: "low",
      kind: "heuristic",
      summary: `Only ${
        searcher.count + tutor.count + draw.count
      } card${
        searcher.count + tutor.count + draw.count === 1 ? "" : "s"
      } search, tutor, or draw for you - your plan may be hard to assemble consistently.`,
      involvedCardIds: [...searcher.cardIds, ...tutor.cardIds, ...draw.cardIds],
      evidence: {
        count: searcher.count + tutor.count + draw.count,
        threshold: MIN_SEARCH_AND_DRAW_THRESHOLD,
      },
    });
  }

  // --- SPELL_TRAP_BALANCE ---
  // Computed directly from cardType text (already available on every
  // DeckDoctorCard) rather than importing deck-composition.ts, to
  // keep this module dependency-free and pure.
  if (mainCards.length > 0) {
    const spellTrapCount = mainCards.filter((card) => {
      const t = card.cardType.toLowerCase();
      return t.includes("spell") || t.includes("trap");
    }).length;

    if (spellTrapCount < MIN_SPELL_TRAP_THRESHOLD) {
      findings.push({
        type: "SPELL_TRAP_BALANCE",
        severity: "info",
        confidence: "low",
        kind: "heuristic",
        summary: `This deck runs only ${spellTrapCount} Spell/Trap card${
          spellTrapCount === 1 ? "" : "s"
        } in the Main Deck - most consistent decks run more support than that.`,
        involvedCardIds: [],
        evidence: { spellTrapCount, threshold: MIN_SPELL_TRAP_THRESHOLD, mainDeckSize: mainCards.length },
      });
    }
  }

  return { summary, findings };
}
