// =========================================================
// MASTER DUEL EXPORT — honest, researched deck export workflow
//
// RESEARCH FIRST, PER THE PRODUCT REQUIREMENT: this file exists
// because a fake "Export to Master Duel" button was explicitly
// ruled out. Before writing anything here, the real, current
// (checked live, not from training-data memory) official and
// community mechanisms for getting a deck into Master Duel were
// looked up:
//
//   - Konami's own support site confirms exactly two supported
//     import sources for Master Duel, and states them as the ONLY
//     ones:
//       1. A deck that is PUBLIC in the Official Yu-Gi-Oh! TCG
//          Card Database.
//          ("If your Deck is registered as public in the Official
//          Yu-Gi-Oh! TCG Card Database, it can be imported into
//          Yu-Gi-Oh! MASTER DUEL.")
//          https://us-support.konami.com/hc/en-us/articles/4813772381975
//       2. A deck that is PUBLIC in the Yu-Gi-Oh! NEURON app.
//          ("If your Deck is registered as public in NEURON, it
//          can be imported into MASTER DUEL. Only the Deck List
//          will be imported, and cards that you do not have in
//          MASTER DUEL will be displayed in gray.")
//          https://us-support.konami.com/hc/en-us/articles/4814044001687
//     Konami does NOT document any file/text/API import path, and
//     explicitly states MASTER DUEL -> NEURON export does not
//     exist either. There is no officially supported way for a
//     third-party app (this one included) to push a deck directly
//     into Master Duel.
//
//   - The real, actively-used COMMUNITY bridge (e.g. the
//     DawnbrandBots "deck-transfer-for-master-duel" browser
//     extension, and YGOPRODeck's own transfer tool) does not
//     bypass Konami either - it automates copying a deck list to
//     the clipboard and then walks the user through pasting it
//     into the Official Yu-Gi-Oh! TCG Card Database's own deck
//     editor ("Import from Clipboard and save"), i.e. it automates
//     route #1 above, it doesn't replace it.
//     https://ygoprodeck.com/decks/transfer-tool/
//     https://github.com/DawnbrandBots/deck-transfer-for-master-duel
//
// CONCLUSION / PRODUCT DECISION: this app has no account
// integration with Konami's TCG Database or NEURON (and building
// one - scripted login/automation against Konami's own accounts -
// is out of scope and not something to build into a friends'
// hobby app). So the honest, practically useful thing this app CAN
// do is:
//   1. Produce a real, standard .ydk file (the open, widely
//      supported Yu-Gi-Oh deck-file format used by EDOPro,
//      YGOPRODeck's own deck builder/importer, Dueling Book, and
//      others - #main / #extra sections, one numeric card
//      "passcode" per line, one line per copy). This is NOT a
//      Master Duel file format and this module never claims it
//      is - it's the standard interchange format most other deck
//      tools (including the ones above) can read, which is a
//      genuinely useful, honest deliverable on its own.
//      https://goatworld.community/wiki/ydk-code-format
//   2. Produce a plain-text, copyable checklist (card name +
//      count, Main/Extra, with each card's real Master Duel
//      legality shown) for the player to manually rebuild as a
//      deck in the Official TCG Database or NEURON themselves -
//      the one and only path Konami actually documents into
//      Master Duel.
// Nowhere does this module or any UI built on it claim the deck
// was "imported" or "exported to Master Duel" - see
// EXPORT_DISCLAIMER below, which the UI must always show next to
// any use of these functions.
// =========================================================

export const EXPORT_DISCLAIMER =
  "This is not a direct import into Master Duel - Konami doesn't offer one. " +
  "The confirmed way in: rebuild this exact list as a public deck in the " +
  "Official Yu-Gi-Oh! TCG Card Database or the Yu-Gi-Oh! NEURON app, then use " +
  "Master Duel's own import feature to bring it in from there. The .ydk file " +
  "below is a standard deck file most other deck-building tools can read.";

export type DeckSection = "main" | "extra";

export type MasterDuelExportCardInput = {
  cardCatalogId: string;
  name: string;
  // The numeric passcode to use for YDK export. Per
  // card_catalog.master_duel_card_id's own column comment: null
  // until confirmed to diverge from external_card_id, so prefer it
  // when set and fall back to external_card_id (the YGOPRODeck/TCG
  // passcode) otherwise. Never fuzzy-mapped or guessed here - a
  // card with neither value set is a real, reported blocker, not a
  // silently skipped row.
  externalCardId: number | null;
  masterDuelCardId: number | null;
  masterDuelStatus: string | null | undefined;
  section: DeckSection;
};

export type YdkExportResult = {
  // The full, ready-to-save .ydk file contents. Empty sections are
  // still emitted as bare "#main"/"#extra" headers with no lines
  // under them, matching the format's own convention for an absent
  // section.
  ydkText: string;
  // Cards that could NOT be included because neither
  // masterDuelCardId nor externalCardId is set on that catalog
  // row. Never silently dropped - always surfaced so the UI can
  // warn the player their exported file is incomplete and why.
  missingPasscodeCards: { cardCatalogId: string; name: string }[];
  mainCount: number;
  extraCount: number;
};

function resolvePasscode(
  card: MasterDuelExportCardInput
): number | null {
  return card.masterDuelCardId ?? card.externalCardId ?? null;
}

export function buildYdkExport(
  cards: MasterDuelExportCardInput[]
): YdkExportResult {
  const mainLines: string[] = [];
  const extraLines: string[] = [];
  const missingByCard = new Map<
    string,
    { cardCatalogId: string; name: string }
  >();

  for (const card of cards) {
    const passcode = resolvePasscode(card);

    if (passcode === null) {
      missingByCard.set(card.cardCatalogId, {
        cardCatalogId: card.cardCatalogId,
        name: card.name,
      });
      continue;
    }

    const line = String(passcode);
    if (card.section === "extra") {
      extraLines.push(line);
    } else {
      mainLines.push(line);
    }
  }

  const ydkText = [
    "#created by Duelist Circle",
    "#main",
    ...mainLines,
    "#extra",
    ...extraLines,
    "!side",
  ].join("\n");

  return {
    ydkText,
    missingPasscodeCards: [...missingByCard.values()],
    mainCount: mainLines.length,
    extraCount: extraLines.length,
  };
}

export type MasterDuelChecklistLine = {
  name: string;
  count: number;
  section: DeckSection;
  masterDuelStatusLabel: string;
};

export type MasterDuelChecklistResult = {
  checklistText: string;
  lines: MasterDuelChecklistLine[];
};

// Grouped, human-readable text a player can read off while
// manually rebuilding the deck in the TCG Database or NEURON - the
// one confirmed real path into Master Duel (see the header comment
// above). Deliberately does not attempt any automated pasting or
// API call: none exists to call.
export function buildMasterDuelChecklist(
  cards: MasterDuelExportCardInput[],
  getStatusLabel: (
    status: string | null | undefined
  ) => string
): MasterDuelChecklistResult {
  const groups = new Map<
    string,
    MasterDuelChecklistLine
  >();

  for (const card of cards) {
    const key = `${card.section}:${card.cardCatalogId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    groups.set(key, {
      name: card.name,
      count: 1,
      section: card.section,
      masterDuelStatusLabel: getStatusLabel(
        card.masterDuelStatus
      ),
    });
  }

  const lines = [...groups.values()].sort((a, b) => {
    if (a.section !== b.section) {
      return a.section === "main" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  const mainLines = lines.filter((l) => l.section === "main");
  const extraLines = lines.filter((l) => l.section === "extra");

  const textParts: string[] = [];
  textParts.push("Main Deck:");
  for (const line of mainLines) {
    textParts.push(
      `${line.count}x ${line.name} (${line.masterDuelStatusLabel})`
    );
  }
  textParts.push("");
  textParts.push("Extra Deck:");
  for (const line of extraLines) {
    textParts.push(
      `${line.count}x ${line.name} (${line.masterDuelStatusLabel})`
    );
  }

  return {
    checklistText: textParts.join("\n"),
    lines,
  };
}
