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
// CREATE TRADE
// =========================================================

export async function createTrade(
  formData: FormData
) {
  const {
    supabase,
    userId,
  } = await requireUser();

  const receiverId =
    String(
      formData.get(
        "receiver_id"
      ) ?? ""
    ).trim();

  if (!receiverId) {
    throw new Error(
      "Trade partner ontbreekt."
    );
  }

  if (
    receiverId ===
    userId
  ) {
    throw new Error(
      "Je kunt niet met jezelf ruilen."
    );
  }

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
      "League niet gevonden."
    );
  }

  const {
    data: receiverMembership,
    error: receiverMembershipError,
  } = await supabase
    .from("league_members")
    .select("profile_id")
    .eq(
      "league_id",
      membership.league_id
    )
    .eq(
      "profile_id",
      receiverId
    )
    .maybeSingle();

  if (
    receiverMembershipError ||
    !receiverMembership
  ) {
    throw new Error(
      "Deze speler zit niet in jouw league."
    );
  }

  const {
    data: tradeId,
    error,
  } = await supabase.rpc(
    "create_trade",
    {
      target_league_id:
        membership.league_id,

      target_receiver_id:
        receiverId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  if (!tradeId) {
    throw new Error(
      "Trade kon niet worden aangemaakt."
    );
  }

  revalidatePath(
    "/trades"
  );

  redirect(
    `/trades/${tradeId}?success=${encodeURIComponent("Trade started!")}`
  );
}

// =========================================================
// ADD TRADE ITEM
// =========================================================

export async function addTradeItem(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const tradeId =
    String(
      formData.get(
        "trade_id"
      ) ?? ""
    ).trim();

  const cardInstanceId =
    String(
      formData.get(
        "card_instance_id"
      ) ?? ""
    ).trim();

  const side =
    String(
      formData.get(
        "side"
      ) ?? ""
    ).trim();

  if (
    !tradeId ||
    !cardInstanceId
  ) {
    throw new Error(
      "Trade of kaart ontbreekt."
    );
  }

  if (
    side !== "offered" &&
    side !== "requested"
  ) {
    throw new Error(
      "Ongeldige trade side."
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "add_trade_item",
    {
      target_trade_id:
        tradeId,

      target_card_instance_id:
        cardInstanceId,

      target_side:
        side,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    `/trades/${tradeId}`
  );

  redirect(
    `/trades/${tradeId}`
  );
}

// =========================================================
// REMOVE TRADE ITEM
// =========================================================

export async function removeTradeItem(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const tradeId =
    String(
      formData.get(
        "trade_id"
      ) ?? ""
    ).trim();

  const tradeItemId =
    String(
      formData.get(
        "trade_item_id"
      ) ?? ""
    ).trim();

  if (
    !tradeId ||
    !tradeItemId
  ) {
    throw new Error(
      "Trade item ontbreekt."
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "remove_trade_item",
    {
      target_trade_item_id:
        tradeItemId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    `/trades/${tradeId}`
  );

  redirect(
    `/trades/${tradeId}`
  );
}

// =========================================================
// SET TRADE DUEL POINTS
//
// Lets the sender attach a DP amount to either side of a draft
// trade (cards+DP, DP+cards, or DP-only). Never trusted at face
// value later - accept_trade() re-validates both balances at
// accept time before moving anything.
// =========================================================

export async function setTradeDp(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const tradeId =
    String(
      formData.get(
        "trade_id"
      ) ?? ""
    ).trim();

  const dpOffered =
    Number(
      formData.get(
        "dp_offered"
      ) ?? 0
    );

  const dpRequested =
    Number(
      formData.get(
        "dp_requested"
      ) ?? 0
    );

  if (!tradeId) {
    throw new Error(
      "Trade ontbreekt."
    );
  }

  if (
    !Number.isFinite(
      dpOffered
    ) ||
    !Number.isFinite(
      dpRequested
    ) ||
    dpOffered < 0 ||
    dpRequested < 0
  ) {
    throw new Error(
      "Ongeldig Duel Points bedrag."
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "set_trade_dp",
    {
      target_trade_id:
        tradeId,

      target_dp_offered:
        Math.floor(
          dpOffered
        ),

      target_dp_requested:
        Math.floor(
          dpRequested
        ),
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    `/trades/${tradeId}`
  );

  redirect(
    `/trades/${tradeId}`
  );
}

// =========================================================
// SUBMIT TRADE
// =========================================================

export async function submitTrade(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const tradeId =
    String(
      formData.get(
        "trade_id"
      ) ?? ""
    ).trim();

  const message =
    String(
      formData.get(
        "message"
      ) ?? ""
    ).trim();

  if (!tradeId) {
    throw new Error(
      "Trade ontbreekt."
    );
  }

  if (
    message.length >
    1000
  ) {
    throw new Error(
      "Bericht mag maximaal 1000 tekens bevatten."
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "submit_trade",
    {
      target_trade_id:
        tradeId,

      trade_message:
        message || null,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    "/trades"
  );

  revalidatePath(
    `/trades/${tradeId}`
  );

  redirect(
    `/trades/${tradeId}?success=${encodeURIComponent("Trade sent!")}`
  );
}

// =========================================================
// ACCEPT TRADE
// =========================================================

export async function acceptTrade(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const tradeId =
    String(
      formData.get(
        "trade_id"
      ) ?? ""
    ).trim();

  if (!tradeId) {
    throw new Error(
      "Trade ontbreekt."
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "accept_trade",
    {
      target_trade_id:
        tradeId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    "/trades"
  );

  revalidatePath(
    "/cards/collection"
  );

  revalidatePath(
    `/trades/${tradeId}`
  );

  redirect(
    `/trades/${tradeId}?success=${encodeURIComponent("Trade accepted!")}`
  );
}

// =========================================================
// DECLINE TRADE
// =========================================================

export async function declineTrade(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const tradeId =
    String(
      formData.get(
        "trade_id"
      ) ?? ""
    ).trim();

  if (!tradeId) {
    throw new Error(
      "Trade ontbreekt."
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "decline_trade",
    {
      target_trade_id:
        tradeId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    "/trades"
  );

  revalidatePath(
    `/trades/${tradeId}`
  );

  redirect(
    `/trades?success=${encodeURIComponent("Trade declined.")}`
  );
}

// =========================================================
// CANCEL TRADE
// =========================================================

export async function cancelTrade(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const tradeId =
    String(
      formData.get(
        "trade_id"
      ) ?? ""
    ).trim();

  if (!tradeId) {
    throw new Error(
      "Trade ontbreekt."
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "cancel_trade",
    {
      target_trade_id:
        tradeId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    "/trades"
  );

  revalidatePath(
    `/trades/${tradeId}`
  );

  redirect(
    `/trades?success=${encodeURIComponent("Trade cancelled.")}`
  );
}

// =========================================================
// COUNTER TRADE
//
// Only the receiver of a pending trade can counter it. Creates
// a brand new draft trade (roles reversed, items pre-filled with
// sides swapped) and marks the original as declined/superseded -
// see counter_trade() in the migration for the exact mechanics.
// =========================================================

export async function counterTrade(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const tradeId =
    String(
      formData.get(
        "trade_id"
      ) ?? ""
    ).trim();

  if (!tradeId) {
    throw new Error(
      "Trade ontbreekt."
    );
  }

  const {
    data: newTradeId,
    error,
  } = await supabase.rpc(
    "counter_trade",
    {
      target_trade_id:
        tradeId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  if (!newTradeId) {
    throw new Error(
      "Counter-offer kon niet worden aangemaakt."
    );
  }

  revalidatePath(
    "/trades"
  );

  revalidatePath(
    `/trades/${tradeId}`
  );

  redirect(
    `/trades/${newTradeId}?success=${encodeURIComponent(
      "Counter-offer started - adjust it and send when ready."
    )}`
  );
}