"use server";

import { redirect } from "next/navigation";

import {
  requireUser,
} from "@/lib/supabase/queries";

// =========================================================
// START INITIAL DRAFT
//
// De Initial Draft is eenmalig.
//
// Bescherming:
// - alleen league admin
// - geen tweede actieve draft
// - geen tweede afgeronde Initial Draft
// =========================================================

export async function startInitialDraft() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const {
    data: membership,
    error: membershipError,
  } = await supabase
    .from("league_members")
    .select("league_id")
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
      "League membership niet gevonden."
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "start_personal_initial_draft",
    {
      target_league_id:
        membership.league_id,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  redirect("/draft");
}

// =========================================================
// CREATE NEXT DRAFT OFFER
//
// Alleen nodig:
// - bij de allereerste reveal
//
// Daarna maakt pickDraftCard automatisch
// het volgende offer.
// =========================================================

export async function createNextDraftOffer(
  formData: FormData
) {
  const {
    supabase,
    userId,
  } = await requireUser();

  const draftPlayerId =
    String(
      formData.get(
        "draft_player_id"
      ) ?? ""
    );

  if (!draftPlayerId) {
    throw new Error(
      "Draft player ontbreekt."
    );
  }

  // -------------------------------------------------------
  // Controle: hoort deze draft player bij de gebruiker?
  // -------------------------------------------------------

  const {
    data: player,
    error: playerError,
  } = await supabase
    .from("draft_players")
    .select(
      "id,profile_id,status"
    )
    .eq(
      "id",
      draftPlayerId
    )
    .maybeSingle();

  if (
    playerError ||
    !player
  ) {
    throw new Error(
      "Draft player niet gevonden."
    );
  }

  if (
    player.profile_id !==
    userId
  ) {
    throw new Error(
      "Je kunt geen kaarten genereren voor een andere speler."
    );
  }

  if (
    player.status ===
    "completed"
  ) {
    redirect("/draft");
  }

  // -------------------------------------------------------
  // Offer genereren
  //
  // Database bepaalt automatisch:
  //
  // - huidige fase
  // - rarity roll
  // - 3 kaarten
  // - scarcity
  // - Fusion/XYZ filtering
  // -------------------------------------------------------

  const {
    error,
  } = await supabase.rpc(
    "create_next_draft_offer",
    {
      target_draft_player_id:
        draftPlayerId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  redirect("/draft");
}

// =========================================================
// PICK DRAFT CARD
//
// Flow:
//
// 3 kaarten
// → speler kiest 1
// → kaart wordt echte card_instance
// → andere 2 worden released
// → progress +1
// → volgende rarity wordt gerold
// → nieuwe 3 kaarten worden direct klaargezet
// =========================================================

export async function pickDraftCard(
  formData: FormData
) {
  const {
    supabase,
    userId,
  } = await requireUser();

  const offerId =
    String(
      formData.get(
        "offer_id"
      ) ?? ""
    );

  const optionId =
    String(
      formData.get(
        "option_id"
      ) ?? ""
    );

  if (
    !offerId ||
    !optionId
  ) {
    throw new Error(
      "Draftkeuze ontbreekt."
    );
  }

  // -------------------------------------------------------
  // Actieve offer ophalen
  //
  // We moeten draft_player_id vóór de pick weten,
  // want de database zet offer daarna op "picked".
  // -------------------------------------------------------

  const {
    data: offer,
    error: offerError,
  } = await supabase
    .from("draft_offers")
    .select(
      "id,draft_player_id,status"
    )
    .eq(
      "id",
      offerId
    )
    .eq(
      "status",
      "active"
    )
    .maybeSingle();

  if (
    offerError ||
    !offer
  ) {
    throw new Error(
      "Deze draftkeuze is niet meer actief."
    );
  }

  const draftPlayerId =
    offer.draft_player_id;

  // -------------------------------------------------------
  // Controle speler
  // -------------------------------------------------------

  const {
    data: draftPlayer,
    error: playerError,
  } = await supabase
    .from("draft_players")
    .select(
      "id,profile_id,status"
    )
    .eq(
      "id",
      draftPlayerId
    )
    .maybeSingle();

  if (
    playerError ||
    !draftPlayer
  ) {
    throw new Error(
      "Draft player niet gevonden."
    );
  }

  if (
    draftPlayer.profile_id !==
    userId
  ) {
    throw new Error(
      "Je kunt niet voor een andere speler kiezen."
    );
  }

  if (
    draftPlayer.status ===
    "completed"
  ) {
    redirect("/draft");
  }

  // -------------------------------------------------------
  // KAART KIEZEN
  //
  // Database regelt:
  //
  // - scarcity
  // - max 3 normale copies
  // - max 1 Legendary
  // - card_instance
  // - ownership history
  // - draft history
  // - progress
  // - faseovergang
  // - complete-status
  // -------------------------------------------------------

  const {
    error: pickError,
  } = await supabase.rpc(
    "pick_draft_card",
    {
      target_offer_id:
        offerId,

      target_option_id:
        optionId,
    }
  );

  if (pickError) {
    throw new Error(
      pickError.message
    );
  }

  // -------------------------------------------------------
  // Nieuwe player-status ophalen
  // -------------------------------------------------------

  const {
  data: updatedPlayer,
  error: updatedPlayerError,
} = await supabase
  .from("draft_players")
  .select(
    "id,status,main_picks_completed,fusion_picks_completed,xyz_picks_completed"
  )
  .eq(
    "id",
    draftPlayerId
  )
  .maybeSingle();

  if (
    updatedPlayerError ||
    !updatedPlayer
  ) {
    throw new Error(
      "Draftvoortgang kon niet worden geladen."
    );
  }

  // -------------------------------------------------------
  // PLAYER KLAAR
  //
  // Geen nieuw offer maken.
  // /draft toont het complete-scherm.
  // -------------------------------------------------------

  if (
    updatedPlayer.status ===
    "completed"
  ) {
    redirect("/draft");
  }

  // -------------------------------------------------------
  // VOLGENDE OFFER AUTOMATISCH MAKEN
  //
  // Database bepaalt automatisch:
  //
  // Main 1-60
  // ↓
  // Fusion 1-2
  // ↓
  // XYZ 1-2
  // ↓
  // Complete
  // -------------------------------------------------------

  const {
    error: nextOfferError,
  } = await supabase.rpc(
    "create_next_draft_offer",
    {
      target_draft_player_id:
        draftPlayerId,
    }
  );

  if (nextOfferError) {
    throw new Error(
      `De kaart is gekozen, maar de volgende draftkeuze kon niet worden gemaakt: ${nextOfferError.message}`
    );
  }

  // -------------------------------------------------------
  // Nieuwe drie kaarten staan al klaar.
  // -------------------------------------------------------

  redirect("/draft");
}