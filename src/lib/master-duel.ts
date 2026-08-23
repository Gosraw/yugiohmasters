// =========================================================
// MASTER DUEL STATUS — shared client-safe helpers
//
// Single source of truth for how a `card_catalog.master_duel_status`
// value maps to a display label and to a deck-legality copy limit.
// Mirrors the CONSERVATIVE eligibility rule already enforced in SQL
// by is_master_duel_offerable() (see
// supabase/migrations/202608220020_master_duel_compatibility.sql
// and 202608230021_shop_v2_refresh_and_specials.sql) - offerable
// ONLY for unlimited/semi_limited/limited. This file must stay in
// sync with that SQL function if it's ever changed; it does not
// call the database, it just mirrors the same conservative rule for
// UI/deck-validation purposes.
// =========================================================

// Widened to plain `string | null | undefined` rather than a
// strict literal union: every DB read in this codebase types
// card_catalog.master_duel_status as plain `string | null`
// (there's no generated Supabase Database type wiring it to a
// literal union), so a strict union here would just force an
// `as` cast at every call site. getMasterDuelStatusMeta below
// already safely handles any string value at runtime (falls
// back to "unknown" for anything unrecognized), so nothing
// about type-safety is actually lost by widening this.
export type MasterDuelStatus =
  | string
  | null
  | undefined;

export type MasterDuelStatusMeta = {
  status: string;
  label: string;
  shortLabel: string;
  // Max copies of this card allowed in a Master-Duel-legal deck.
  // null = "not applicable" (forbidden/not_available/unknown all
  // resolve to 0 - a deck containing any copy of one of these is
  // not Master Duel ready).
  copyLimit: 0 | 1 | 2 | 3;
  tone:
    | "legal"
    | "restricted"
    | "blocked"
    | "unknown";
};

const STATUS_META: Record<
  string,
  MasterDuelStatusMeta
> = {
  unlimited: {
    status: "unlimited",
    label: "Master Duel Legal",
    shortLabel: "Legal",
    copyLimit: 3,
    tone: "legal",
  },

  semi_limited: {
    status: "semi_limited",
    label: "Semi-Limited · Max 2",
    shortLabel: "Semi-Limited 2",
    copyLimit: 2,
    tone: "restricted",
  },

  limited: {
    status: "limited",
    label: "Limited · Max 1",
    shortLabel: "Limited 1",
    copyLimit: 1,
    tone: "restricted",
  },

  forbidden: {
    status: "forbidden",
    label: "Forbidden in Master Duel",
    shortLabel: "Forbidden",
    copyLimit: 0,
    tone: "blocked",
  },

  not_available: {
    status: "not_available",
    label: "Not in Master Duel",
    shortLabel: "Not Available",
    copyLimit: 0,
    tone: "blocked",
  },
};

const UNKNOWN_META: MasterDuelStatusMeta =
  {
    status: "unknown",
    label: "Master Duel Status Unknown",
    shortLabel: "Unknown",
    copyLimit: 0,
    tone: "unknown",
  };

export function getMasterDuelStatusMeta(
  status: MasterDuelStatus
): MasterDuelStatusMeta {
  if (
    !status ||
    !(status in STATUS_META)
  ) {
    return UNKNOWN_META;
  }

  return STATUS_META[status];
}

// Same rule as the SQL is_master_duel_offerable() function -
// offerable only for unlimited/semi_limited/limited.
export function isMasterDuelOfferable(
  status: MasterDuelStatus
): boolean {
  return (
    getMasterDuelStatusMeta(status)
      .copyLimit > 0
  );
}

// =========================================================
// DECK LEGALITY
//
// Counts copies per catalog card across a deck's cards
// (Main + Extra combined - the copy limit applies to the
// whole deck, not per section) and reports every card that
// breaks the conservative Master Duel rule: any Forbidden or
// Not Available or Unknown-status card present at all, or a
// Limited/Semi-Limited/Unlimited card present in more copies
// than its status allows.
// =========================================================

export type MasterDuelDeckCardInput =
  {
    id: string;
    name: string;
    master_duel_status: MasterDuelStatus;
  };

export type MasterDuelDeckIssue = {
  cardId: string;
  cardName: string;
  meta: MasterDuelStatusMeta;
  ownedCount: number;
  message: string;
};

export type MasterDuelDeckSummary = {
  issues: MasterDuelDeckIssue[];
  ready: boolean;
};

function issueMessage(
  card: MasterDuelDeckCardInput,
  meta: MasterDuelStatusMeta,
  ownedCount: number
): string {
  if (meta.status === "forbidden") {
    return `${card.name} is Forbidden in Master Duel.`;
  }

  if (
    meta.status ===
    "not_available"
  ) {
    return `${card.name} is not available in Master Duel.`;
  }

  if (meta.status === "unknown") {
    return `${card.name}'s Master Duel status hasn't been checked yet.`;
  }

  return `${card.name} exceeds its Master Duel copy limit (${ownedCount} owned, max ${meta.copyLimit}).`;
}

/**
 * `deckCards` should be every card in the deck (Main + Extra),
 * one entry per copy (i.e. a card present 3 times appears 3
 * times in this array) - matches how DeckDisplayCard lists are
 * already built in decks/[id]/page.tsx.
 */
export function evaluateMasterDuelDeckLegality(
  deckCards: MasterDuelDeckCardInput[]
): MasterDuelDeckSummary {
  const countByCard = new Map<
    string,
    {
      count: number;
      card: MasterDuelDeckCardInput;
    }
  >();

  for (const card of deckCards) {
    const existing =
      countByCard.get(card.id);

    if (existing) {
      existing.count += 1;
      continue;
    }

    countByCard.set(card.id, {
      count: 1,
      card,
    });
  }

  const issues: MasterDuelDeckIssue[] =
    [];

  for (const {
    count,
    card,
  } of countByCard.values()) {
    const meta =
      getMasterDuelStatusMeta(
        card.master_duel_status
      );

    if (count > meta.copyLimit) {
      issues.push({
        cardId: card.id,
        cardName: card.name,
        meta,
        ownedCount: count,
        message: issueMessage(
          card,
          meta,
          count
        ),
      });
    }
  }

  return {
    issues,
    ready:
      issues.length === 0,
  };
}
