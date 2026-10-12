"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  redirect,
} from "next/navigation";

import {
  requireUser,
} from "@/lib/supabase/queries";

// =========================================================
// HELPERS
//
// Every failure here redirects back with ?error=... instead of
// throwing, so ActionFeedbackBanner can show it as a dismissible
// banner - the same pattern src/app/actions/shop.ts already uses.
// A thrown Error would instead blow away the whole page with the
// app-wide error.tsx interstitial, which is far too heavy-handed
// for routine, expected failures like "Extra Deck is full".
// =========================================================

function getString(
  formData: FormData,
  key: string
) {
  return String(
    formData.get(key) ?? ""
  ).trim();
}

function safeMessage(
  value:
    | string
    | undefined
) {
  return encodeURIComponent(
    value ??
      "Something went wrong."
  );
}

async function requireOwnedDeck(
  deckId: string
) {
  const {
    supabase,
    userId,
  } = await requireUser();

  const {
    data: deck,
    error,
  } = await supabase
    .from("decks")
    .select(
      "id,league_id,owner_id,name,status,is_active"
    )
    .eq(
      "id",
      deckId
    )
    .maybeSingle();

  if (
    error ||
    !deck
  ) {
    redirect(
      `/decks?error=${safeMessage(
        "Deck not found."
      )}`
    );
  }

  if (
    deck.owner_id !==
    userId
  ) {
    redirect(
      `/decks?error=${safeMessage(
        "This deck isn't yours."
      )}`
    );
  }

  return {
    supabase,
    userId,
    deck,
  };
}

function refreshDeck(
  deckId: string
) {
  revalidatePath(
    `/decks/${deckId}`
  );

  revalidatePath(
    "/decks"
  );
}

// =========================================================
// CREATE DECK
// =========================================================

export async function createDeck(
  formData: FormData
) {
  const {
    supabase,
    userId,
  } = await requireUser();

  const name =
    getString(
      formData,
      "name"
    );

  if (!name) {
    redirect(
      `/decks?error=${safeMessage(
        "Deck name is required."
      )}`
    );
  }

  if (
    name.length > 80
  ) {
    redirect(
      `/decks?error=${safeMessage(
        "Deck name can be at most 80 characters."
      )}`
    );
  }

  const {
    data: membership,
    error:
      membershipError,
  } = await supabase
    .from(
      "league_members"
    )
    .select(
      "league_id"
    )
    .eq(
      "profile_id",
      userId
    )
    .limit(1)
    .maybeSingle();

  if (
    membershipError ||
    !membership
  ) {
    redirect(
      `/decks?error=${safeMessage(
        "League not found."
      )}`
    );
  }

  const {
    data: deckId,
    error,
  } = await supabase.rpc(
    "create_deck",
    {
      target_league_id:
        membership.league_id,

      deck_name:
        name,
    }
  );

  if (error) {
    redirect(
      `/decks?error=${safeMessage(
        error.message
      )}`
    );
  }

  if (!deckId) {
    redirect(
      `/decks?error=${safeMessage(
        "The deck could not be created."
      )}`
    );
  }

  revalidatePath(
    "/decks"
  );

  redirect(
    `/decks/${deckId}?success=${encodeURIComponent("Deck created!")}`
  );
}

// =========================================================
// ADD / REMOVE CARD (deck builder)
//
// Called straight from the deck builder's client code (not a <form>),
// once per tap. They deliberately RETURN a result instead of
// redirecting or revalidating: a redirect or revalidatePath() would
// make Next.js re-render the whole deck page (collection, catalog,
// Deck Doctor - many queries) and the page would jump after every
// tap. The builder updates its own state optimistically and only
// needs to know whether the database accepted the change.
//
// The database stays the source of truth for every deck rule:
// add_card_to_deck + the validate_deck_card trigger check ownership,
// locked copies, format legality, Main/Extra placement (Fusion + Xyz
// only in Extra) and the 60 / 15 maximums.
// =========================================================

export type DeckCardMutationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadEditableDeck(
  deckId: string
) {
  const {
    supabase,
    userId,
  } = await requireUser();

  const {
    data: deck,
    error,
  } = await supabase
    .from("decks")
    .select(
      "id,owner_id,status"
    )
    .eq(
      "id",
      deckId
    )
    .maybeSingle();

  if (
    error ||
    !deck
  ) {
    return {
      supabase,
      error:
        "Deck not found.",
    } as const;
  }

  if (
    deck.owner_id !==
    userId
  ) {
    return {
      supabase,
      error:
        "This deck isn't yours.",
    } as const;
  }

  if (
    deck.status !==
    "draft"
  ) {
    return {
      supabase,
      error:
        "Only a Draft deck can be edited.",
    } as const;
  }

  return {
    supabase,
    error:
      null,
  } as const;
}

export async function addDeckCard(
  deckId: string,
  cardInstanceId: string
): Promise<DeckCardMutationResult> {
  if (
    !UUID_RE.test(
      deckId
    ) ||
    !UUID_RE.test(
      cardInstanceId
    )
  ) {
    return {
      ok: false,
      error:
        "That card could not be added.",
    };
  }

  const {
    supabase,
    error:
      deckError,
  } =
    await loadEditableDeck(
      deckId
    );

  if (deckError) {
    return {
      ok: false,
      error:
        deckError,
    };
  }

  const {
    error,
  } = await supabase.rpc(
    "add_card_to_deck",
    {
      target_deck_id:
        deckId,

      target_card_instance_id:
        cardInstanceId,
    }
  );

  if (error) {
    return {
      ok: false,
      error:
        error.message,
    };
  }

  return {
    ok: true,
  };
}

export async function removeDeckCard(
  deckId: string,
  cardInstanceId: string
): Promise<DeckCardMutationResult> {
  if (
    !UUID_RE.test(
      deckId
    ) ||
    !UUID_RE.test(
      cardInstanceId
    )
  ) {
    return {
      ok: false,
      error:
        "That card could not be removed.",
    };
  }

  const {
    supabase,
    error:
      deckError,
  } =
    await loadEditableDeck(
      deckId
    );

  if (deckError) {
    return {
      ok: false,
      error:
        deckError,
    };
  }

  const {
    data: deckCard,
    error:
      deckCardError,
  } = await supabase
    .from("deck_cards")
    .select(
      "id"
    )
    .eq(
      "deck_id",
      deckId
    )
    .eq(
      "card_instance_id",
      cardInstanceId
    )
    .maybeSingle();

  if (
    deckCardError ||
    !deckCard
  ) {
    return {
      ok: false,
      error:
        "That card is no longer in this deck.",
    };
  }

  const {
    error,
  } = await supabase.rpc(
    "remove_card_from_deck",
    {
      target_deck_card_id:
        deckCard.id,
    }
  );

  if (error) {
    return {
      ok: false,
      error:
        `Could not remove the card: ${error.message}`,
    };
  }

  return {
    ok: true,
  };
}

// =========================================================
// MARK DECK READY
//
// The database does the final validation:
// - at least 40 Main
// - at most 60 Main
// - at most 15 Extra
// =========================================================

export async function markDeckReady(
  formData: FormData
) {
  const deckId =
    getString(
      formData,
      "deck_id"
    );

  if (!deckId) {
    redirect(
      `/decks?error=${safeMessage(
        "Deck is missing."
      )}`
    );
  }

  const {
    supabase,
    deck,
  } =
    await requireOwnedDeck(
      deckId
    );

  if (
    deck.status ===
    "archived"
  ) {
    redirect(
      `/decks/${deckId}?error=${safeMessage(
        "An archived deck can't be marked Ready."
      )}`
    );
  }

  if (
    deck.status ===
    "ready"
  ) {
    redirect(
      `/decks/${deckId}`
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "set_deck_status",
    {
      target_deck_id:
        deckId,

      target_status:
        "ready",
    }
  );

  if (error) {
    redirect(
      `/decks/${deckId}?error=${safeMessage(
        `This deck can't be marked Ready yet: ${error.message}`
      )}`
    );
  }

  refreshDeck(
    deckId
  );

  redirect(
    `/decks/${deckId}?success=${encodeURIComponent("Deck marked Ready!")}`
  );
}

// =========================================================
// RETURN READY DECK TO DRAFT
// =========================================================

export async function markDeckDraft(
  formData: FormData
) {
  const deckId =
    getString(
      formData,
      "deck_id"
    );

  if (!deckId) {
    redirect(
      `/decks?error=${safeMessage(
        "Deck is missing."
      )}`
    );
  }

  const {
    supabase,
    deck,
  } =
    await requireOwnedDeck(
      deckId
    );

  if (
    deck.status ===
    "archived"
  ) {
    redirect(
      `/decks/${deckId}?error=${safeMessage(
        "An archived deck can't be changed."
      )}`
    );
  }

  if (
    deck.is_active
  ) {
    redirect(
      `/decks/${deckId}?error=${safeMessage(
        "Your Active Deck can't go back to Draft. Activate another Ready deck first."
      )}`
    );
  }

  if (
    deck.status ===
    "draft"
  ) {
    redirect(
      `/decks/${deckId}`
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "set_deck_status",
    {
      target_deck_id:
        deckId,

      target_status:
        "draft",
    }
  );

  if (error) {
    redirect(
      `/decks/${deckId}?error=${safeMessage(
        error.message
      )}`
    );
  }

  refreshDeck(
    deckId
  );

  redirect(
    `/decks/${deckId}?success=${encodeURIComponent("Deck moved back to Draft.")}`
  );
}

// =========================================================
// SET ACTIVE DECK
// =========================================================

export async function setActiveDeck(
  formData: FormData
) {
  const deckId =
    getString(
      formData,
      "deck_id"
    );

  if (!deckId) {
    redirect(
      `/decks?error=${safeMessage(
        "Deck is missing."
      )}`
    );
  }

  const {
    supabase,
    deck,
  } =
    await requireOwnedDeck(
      deckId
    );

  if (
    deck.status !==
    "ready"
  ) {
    redirect(
      `/decks/${deckId}?error=${safeMessage(
        "Only a Ready deck can become Active."
      )}`
    );
  }

  if (
    deck.is_active
  ) {
    redirect(
      `/decks/${deckId}`
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "set_active_deck",
    {
      target_deck_id:
        deckId,
    }
  );

  if (error) {
    redirect(
      `/decks/${deckId}?error=${safeMessage(
        error.message
      )}`
    );
  }

  refreshDeck(
    deckId
  );

  redirect(
    `/decks/${deckId}?success=${encodeURIComponent("This is now your active deck!")}`
  );
}

// =========================================================
// RENAME DECK
// =========================================================

export async function renameDeck(
  formData: FormData
) {
  const deckId =
    getString(
      formData,
      "deck_id"
    );

  const name =
    getString(
      formData,
      "name"
    );

  if (!deckId) {
    redirect(
      `/decks?error=${safeMessage(
        "Deck is missing."
      )}`
    );
  }

  if (!name) {
    redirect(
      `/decks/${deckId}?error=${safeMessage(
        "Deck name is required."
      )}`
    );
  }

  if (
    name.length > 80
  ) {
    redirect(
      `/decks/${deckId}?error=${safeMessage(
        "Deck name can be at most 80 characters."
      )}`
    );
  }

  const {
    supabase,
    deck,
  } =
    await requireOwnedDeck(
      deckId
    );

  if (
    deck.status ===
    "archived"
  ) {
    redirect(
      `/decks/${deckId}?error=${safeMessage(
        "An archived deck can't be renamed."
      )}`
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "rename_deck",
    {
      target_deck_id:
        deckId,

      new_name:
        name,
    }
  );

  if (error) {
    redirect(
      `/decks/${deckId}?error=${safeMessage(
        error.message
      )}`
    );
  }

  refreshDeck(
    deckId
  );

  redirect(
    `/decks/${deckId}?success=${encodeURIComponent("Deck renamed.")}`
  );
}

// =========================================================
// ARCHIVE DECK
//
// Decks are deliberately never hard-deleted:
// match history can still point at this deck.
// =========================================================

export async function archiveDeck(
  formData: FormData
) {
  const deckId =
    getString(
      formData,
      "deck_id"
    );

  if (!deckId) {
    redirect(
      `/decks?error=${safeMessage(
        "Deck is missing."
      )}`
    );
  }

  const {
    supabase,
    deck,
  } =
    await requireOwnedDeck(
      deckId
    );

  if (
    deck.is_active
  ) {
    redirect(
      `/decks/${deckId}?error=${safeMessage(
        "Your Active Deck can't be archived. Activate another deck first."
      )}`
    );
  }

  if (
    deck.status ===
    "archived"
  ) {
    redirect(
      "/decks"
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "archive_deck",
    {
      target_deck_id:
        deckId,
    }
  );

  if (error) {
    redirect(
      `/decks/${deckId}?error=${safeMessage(
        error.message
      )}`
    );
  }

  refreshDeck(
    deckId
  );

  redirect(
    `/decks?success=${encodeURIComponent("Deck archived.")}`
  );
}
