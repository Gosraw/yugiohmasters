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
// =========================================================

function getString(
  formData: FormData,
  key: string
) {
  return String(
    formData.get(key) ?? ""
  ).trim();
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
    throw new Error(
      "Deck niet gevonden."
    );
  }

  if (
    deck.owner_id !==
    userId
  ) {
    throw new Error(
      "Dit deck is niet van jou."
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
    throw new Error(
      "Decknaam is verplicht."
    );
  }

  if (
    name.length > 80
  ) {
    throw new Error(
      "Decknaam mag maximaal 80 tekens bevatten."
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
    throw new Error(
      "League niet gevonden."
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
    throw new Error(
      error.message
    );
  }

  if (!deckId) {
    throw new Error(
      "Deck kon niet worden aangemaakt."
    );
  }

  revalidatePath(
    "/decks"
  );

  redirect(
    `/decks/${deckId}`
  );
}

// =========================================================
// ADD CARD TO DECK
// =========================================================

export async function addCardToDeck(
  formData: FormData
) {
  const deckId =
    getString(
      formData,
      "deck_id"
    );

  const cardInstanceId =
    getString(
      formData,
      "card_instance_id"
    );

  if (
    !deckId ||
    !cardInstanceId
  ) {
    throw new Error(
      "Deck of kaart ontbreekt."
    );
  }

  const {
    supabase,
    userId,
    deck,
  } =
    await requireOwnedDeck(
      deckId
    );

  if (
    deck.status !==
    "draft"
  ) {
    throw new Error(
      "Alleen een Draft deck kan worden aangepast."
    );
  }

  const {
    data: instance,
    error:
      instanceError,
  } = await supabase
    .from(
      "card_instances"
    )
    .select(
      "id,current_owner_id,locked"
    )
    .eq(
      "id",
      cardInstanceId
    )
    .maybeSingle();

  if (
    instanceError ||
    !instance
  ) {
    throw new Error(
      "Kaartinstance niet gevonden."
    );
  }

  if (
    instance.current_owner_id !==
    userId
  ) {
    throw new Error(
      "Deze kaart is niet van jou."
    );
  }

  if (
    instance.locked
  ) {
    throw new Error(
      "Deze kaart is locked en kan niet aan een deck worden toegevoegd."
    );
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
    throw new Error(
      error.message
    );
  }

  refreshDeck(
    deckId
  );

  redirect(
    `/decks/${deckId}`
  );
}

// =========================================================
// REMOVE CARD FROM DECK
// =========================================================

export async function removeCardFromDeck(
  formData: FormData
) {
  const deckId =
    getString(
      formData,
      "deck_id"
    );

  const deckCardId =
    getString(
      formData,
      "deck_card_id"
    );

  if (
    !deckId ||
    !deckCardId
  ) {
    throw new Error(
      "Deckkaart ontbreekt."
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
    "draft"
  ) {
    throw new Error(
      "Alleen een Draft deck kan worden aangepast."
    );
  }

  const {
    data: deckCard,
    error:
      deckCardError,
  } = await supabase
    .from("deck_cards")
    .select(
      "id,deck_id"
    )
    .eq(
      "id",
      deckCardId
    )
    .eq(
      "deck_id",
      deckId
    )
    .maybeSingle();

  if (
    deckCardError ||
    !deckCard
  ) {
    throw new Error(
      "Deckkaart niet gevonden."
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "remove_card_from_deck",
    {
      target_deck_card_id:
        deckCardId,
    }
  );

  if (error) {
    throw new Error(
      `Kaart verwijderen mislukt: ${error.message}`
    );
  }

  refreshDeck(
    deckId
  );

  redirect(
    `/decks/${deckId}`
  );
}

// =========================================================
// MARK DECK READY
//
// Database doet de definitieve validatie:
// - minimaal 40 Main
// - maximaal 60 Main
// - maximaal 15 Extra
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
    throw new Error(
      "Deck ontbreekt."
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
    throw new Error(
      "Een gearchiveerd deck kan niet Ready worden gemaakt."
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
    throw new Error(
      `Deck kan nog niet Ready worden gemaakt: ${error.message}`
    );
  }

  refreshDeck(
    deckId
  );

  redirect(
    `/decks/${deckId}`
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
    throw new Error(
      "Deck ontbreekt."
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
    throw new Error(
      "Een gearchiveerd deck kan niet worden aangepast."
    );
  }

  if (
    deck.is_active
  ) {
    throw new Error(
      "Je actieve deck kan niet naar Draft worden teruggezet. Activeer eerst een ander Ready deck."
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
    throw new Error(
      error.message
    );
  }

  refreshDeck(
    deckId
  );

  redirect(
    `/decks/${deckId}`
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
    throw new Error(
      "Deck ontbreekt."
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
    throw new Error(
      "Alleen een Ready deck kan Active worden."
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
    throw new Error(
      error.message
    );
  }

  refreshDeck(
    deckId
  );

  redirect(
    `/decks/${deckId}`
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
    throw new Error(
      "Deck ontbreekt."
    );
  }

  if (!name) {
    throw new Error(
      "Decknaam is verplicht."
    );
  }

  if (
    name.length > 80
  ) {
    throw new Error(
      "Decknaam mag maximaal 80 tekens bevatten."
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
    throw new Error(
      "Een gearchiveerd deck kan niet worden hernoemd."
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
    throw new Error(
      error.message
    );
  }

  refreshDeck(
    deckId
  );

  redirect(
    `/decks/${deckId}`
  );
}

// =========================================================
// ARCHIVE DECK
//
// We verwijderen decks bewust niet hard.
// Match history kan later naar dit deck verwijzen.
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
    throw new Error(
      "Deck ontbreekt."
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
    throw new Error(
      "Je actieve deck kan niet worden gearchiveerd. Activeer eerst een ander deck."
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
    throw new Error(
      error.message
    );
  }

  refreshDeck(
    deckId
  );

  redirect(
    "/decks"
  );
}