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
    `/trades/${tradeId}`
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
    `/trades/${tradeId}`
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
    `/trades/${tradeId}`
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
    "/trades"
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
    "/trades"
  );
}