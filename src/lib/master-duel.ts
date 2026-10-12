// =========================================================
// MASTER DUEL STATUS — shared client-safe helpers
//
// Single source of truth for how a `card_catalog.master_duel_status`
// value maps to a display label and to a deck-legality copy limit.
//
// 2.0 rule (Unlimited Duel Rooms): the group plays Master Duel with
// the Forbidden/Limited setting on "Unlimited", so the Master Duel
// banlist does NOT apply. Only 'not_available' (the card does not
// exist in Master Duel) blocks a card. Forbidden / Limited /
// Semi-Limited in Master Duel are all fine; OUR own banlist
// (public.duelist_circle_card_limits) decides deck copies.
//
// Mirrors the SQL is_master_duel_offerable() from
// supabase/migrations/202610121000_master_duel_unlimited_rooms.sql
// - keep the two in sync. This file does not call the database.
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
  // Max copies of this card in a deck as far as Master Duel
  // (Unlimited rooms) is concerned: 3 for every card that exists in
  // Master Duel, 0 for not_available.
  copyLimit: 0 | 1 | 2 | 3;
  tone:
    | "legal"
    | "restricted"
    | "blocked"
    | "unknown";
};

// The Master Duel list status is kept only as an "In Master Duel"
// signal: every status that means "the card exists in Master Duel"
// shares the same calm, legal look, so nothing alarming is shown
// for cards that are Forbidden/Limited on the MD list.
const IN_MASTER_DUEL: Omit<
  MasterDuelStatusMeta,
  "status"
> = {
  label: "In Master Duel",
  shortLabel: "In MD",
  copyLimit: 3,
  tone: "legal",
};

const STATUS_META: Record<
  string,
  MasterDuelStatusMeta
> = {
  unlimited: {
    status: "unlimited",
    ...IN_MASTER_DUEL,
  },

  semi_limited: {
    status: "semi_limited",
    ...IN_MASTER_DUEL,
  },

  limited: {
    status: "limited",
    ...IN_MASTER_DUEL,
  },

  forbidden: {
    status: "forbidden",
    ...IN_MASTER_DUEL,
  },

  not_available: {
    status: "not_available",
    label: "Not in Master Duel",
    shortLabel: "Not in MD",
    copyLimit: 0,
    tone: "blocked",
  },
};

// Never checked against Master Duel. The server only lets such a
// card into the format through a curated include, so it is not
// treated as a deck problem here - just shown as unchecked.
const UNKNOWN_META: MasterDuelStatusMeta =
  {
    status: "unknown",
    label: "Master Duel Status Unchecked",
    shortLabel: "MD Unchecked",
    copyLimit: 3,
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

// Same rule as the SQL is_master_duel_offerable() (Unlimited
// rooms): true for unlimited/semi_limited/limited/forbidden/unknown,
// false for not_available and for null/unrecognised values.
export function isMasterDuelOfferable(
  status: MasterDuelStatus
): boolean {
  if (!status) {
    return false;
  }

  return (
    status === "unknown" ||
    (status in STATUS_META &&
      STATUS_META[status]
        .copyLimit > 0)
  );
}

// =========================================================
// DECK LEGALITY
//
// Counts copies per catalog card across a deck's cards
// (Main + Extra combined - the copy limit applies to the
// whole deck, not per section) and reports every card that
// can't be played in a Master Duel Unlimited room: a Not in
// Master Duel card present at all, or any card above 3 copies.
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
  if (
    meta.status ===
    "not_available"
  ) {
    return `${card.name} is not available in Master Duel.`;
  }

  return `${card.name} has ${ownedCount} copies - Master Duel allows max ${meta.copyLimit}.`;
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
