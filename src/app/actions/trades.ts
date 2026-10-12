"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  redirect,
} from "next/navigation";

import {
  safeReturnTo,
  withFeedback,
} from "@/lib/safe-return-to";

import {
  requireUser,
} from "@/lib/supabase/queries";

// =========================================================
// HELPERS
//
// Every failure redirects back with ?error=... instead of
// throwing, so ActionFeedbackBanner shows a dismissible banner
// (same pattern as decks.ts / shop.ts). A thrown Error would
// replace the whole page with the app-wide error screen and show
// raw database text.
// =========================================================

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readString(
  formData: FormData,
  key: string
) {
  return String(
    formData.get(
      key
    ) ?? ""
  ).trim();
}

function fail(
  path: string,
  message: string
): never {
  redirect(
    withFeedback(
      path,
      "error",
      message
    )
  );
}

// Database errors -> plain-language messages. Messages the RPCs
// already write for players pass through; technical ones
// (constraint names, type errors) never reach the screen.
function friendlyTradeError(
  error: {
    message: string;
    code?: string;
  }
) {
  const message =
    error.message ?? "";

  if (
    error.code === "23505" ||
    message.includes(
      "trade_items_trade_id_card_instance_id_key"
    )
  ) {
    return "That card is already in this trade.";
  }

  if (
    message.includes(
      "Locked cards cannot be added to a trade"
    )
  ) {
    return "This card is locked (for example as a match wager) and cannot be traded right now.";
  }

  if (
    message.includes(
      "Offered card must be owned by sender"
    )
  ) {
    return "You no longer own that card.";
  }

  if (
    message.includes(
      "Requested card must be owned by receiver"
    )
  ) {
    return "The other player no longer owns that card.";
  }

  if (
    message.includes(
      "can only be edited while Draft"
    ) ||
    message.includes(
      "can only be changed while trade is Draft"
    )
  ) {
    return "This trade was already sent, so it can no longer be changed.";
  }

  if (
    message.includes(
      "This deck is locked for a competition"
    )
  ) {
    return "One or more cards in this trade are in a deck that is locked for a competition, so it cannot be completed.";
  }

  if (
    error.code === "22P02" ||
    message.includes(
      "invalid input syntax"
    )
  ) {
    return "That trade or card could not be found.";
  }

  if (
    !message ||
    message.includes(
      "violates"
    ) ||
    message.includes(
      "constraint"
    ) ||
    message.includes(
      "permission denied"
    ) ||
    message.includes(
      "function "
    )
  ) {
    return "Something went wrong. Please try again.";
  }

  return message;
}

// Card add/remove/DP forms send return_to so the player lands back
// on the same page / search of the trade's card browser.
function tradeReturnPath(
  formData: FormData,
  tradeId: string
) {
  return safeReturnTo(
    readString(
      formData,
      "return_to"
    ),
    `/trades/${tradeId}`
  );
}

function requireTradeId(
  formData: FormData
) {
  const tradeId =
    readString(
      formData,
      "trade_id"
    );

  if (
    !UUID_RE.test(
      tradeId
    )
  ) {
    fail(
      "/trades",
      "That trade could not be found."
    );
  }

  return tradeId;
}

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
    readString(
      formData,
      "receiver_id"
    );

  if (
    !UUID_RE.test(
      receiverId
    )
  ) {
    fail(
      "/trades/new",
      "Pick a player to trade with."
    );
  }

  const backPath =
    `/trades/new/${receiverId}`;

  if (
    receiverId ===
    userId
  ) {
    fail(
      "/trades/new",
      "You can't trade with yourself."
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
    fail(
      "/trades",
      "League not found."
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
    fail(
      "/trades/new",
      "This player is not in your league."
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
    fail(
      backPath,
      friendlyTradeError(
        error
      )
    );
  }

  if (!tradeId) {
    fail(
      backPath,
      "The trade could not be created."
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
    requireTradeId(
      formData
    );

  const backPath =
    tradeReturnPath(
      formData,
      tradeId
    );

  const cardInstanceId =
    readString(
      formData,
      "card_instance_id"
    );

  const side =
    readString(
      formData,
      "side"
    );

  if (
    !UUID_RE.test(
      cardInstanceId
    )
  ) {
    fail(
      backPath,
      "Pick a card to add."
    );
  }

  if (
    side !== "offered" &&
    side !== "requested"
  ) {
    fail(
      backPath,
      "Choose whether you offer or request this card."
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
    fail(
      backPath,
      friendlyTradeError(
        error
      )
    );
  }

  revalidatePath(
    `/trades/${tradeId}`
  );

  redirect(
    withFeedback(
      backPath,
      "success",
      side === "offered"
        ? "Card added to your offer."
        : "Card added to your request."
    )
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
    requireTradeId(
      formData
    );

  const backPath =
    tradeReturnPath(
      formData,
      tradeId
    );

  const tradeItemId =
    readString(
      formData,
      "trade_item_id"
    );

  if (
    !UUID_RE.test(
      tradeItemId
    )
  ) {
    fail(
      backPath,
      "That card is no longer in this trade."
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
    fail(
      backPath,
      error.message.includes(
        "Trade item not found"
      )
        ? "That card is no longer in this trade."
        : friendlyTradeError(
            error
          )
    );
  }

  revalidatePath(
    `/trades/${tradeId}`
  );

  redirect(
    backPath
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
    requireTradeId(
      formData
    );

  const backPath =
    tradeReturnPath(
      formData,
      tradeId
    );

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
    fail(
      backPath,
      "Duel Points must be 0 or more."
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
    fail(
      backPath,
      friendlyTradeError(
        error
      )
    );
  }

  revalidatePath(
    `/trades/${tradeId}`
  );

  redirect(
    withFeedback(
      backPath,
      "success",
      "Duel Points updated."
    )
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
    requireTradeId(
      formData
    );

  const message =
    readString(
      formData,
      "message"
    );

  if (
    message.length >
    1000
  ) {
    fail(
      `/trades/${tradeId}`,
      "Messages can be at most 1000 characters."
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

  revalidatePath(
    "/trades"
  );

  revalidatePath(
    `/trades/${tradeId}`
  );

  if (error) {
    // Cards are never reserved by a draft, so a draft can go stale
    // between when it was built and when it's sent (one of its
    // cards moved on via another trade, or got locked as a wager).
    // Land back on the same page with a friendly banner instead of
    // crashing to the error boundary.
    fail(
      `/trades/${tradeId}`,
      friendlyTradeError(
        error
      )
    );
  }

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
    requireTradeId(
      formData
    );

  const {
    error,
  } = await supabase.rpc(
    "accept_trade",
    {
      target_trade_id:
        tradeId,
    }
  );

  if (
    error &&
    error.message.includes(
      "expired"
    )
  ) {
    // accept_trade() marks the trade expired and then raises - but
    // the raise rolls that update back. The idempotent sweep below
    // records the expiry for real, so the trade shows as Expired.
    await supabase.rpc(
      "expire_stale_trades"
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

  if (error) {
    // The same card can be offered in several pending trades at
    // once - first valid accept wins, and every later accept for a
    // trade touching that same card fails the live ownership
    // re-check inside accept_trade(). That is an expected outcome,
    // so it gets a friendly banner instead of the error boundary.
    fail(
      `/trades/${tradeId}`,
      friendlyTradeError(
        error
      )
    );
  }

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
    requireTradeId(
      formData
    );

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
    fail(
      `/trades/${tradeId}`,
      friendlyTradeError(
        error
      )
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
//
// Also used to discard a Draft trade (cancel_trade allows both).
// =========================================================

export async function cancelTrade(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const tradeId =
    requireTradeId(
      formData
    );

  const wasDraft =
    readString(
      formData,
      "was_draft"
    ) === "true";

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
    fail(
      `/trades/${tradeId}`,
      friendlyTradeError(
        error
      )
    );
  }

  revalidatePath(
    "/trades"
  );

  revalidatePath(
    `/trades/${tradeId}`
  );

  redirect(
    `/trades?success=${encodeURIComponent(
      wasDraft
        ? "Draft trade discarded."
        : "Trade cancelled."
    )}`
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
    requireTradeId(
      formData
    );

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
    fail(
      `/trades/${tradeId}`,
      friendlyTradeError(
        error
      )
    );
  }

  if (!newTradeId) {
    fail(
      `/trades/${tradeId}`,
      "The counter-offer could not be created."
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
