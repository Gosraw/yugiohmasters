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
// TYPES
// =========================================================

type MatchSettlementInfo = {
  id: string;

  competition_id:
    | string
    | null;

  match_type:
    | "league"
    | "practice";

  wager_type:
    | "none"
    | "dp"
    | "card";

  wager_status:
    | "none"
    | "proposed"
    | "funded"
    | "settled"
    | "released";

  status: string;
};

type MatchAcceptInfo = {
  id: string;
  player_one_id: string;
  player_two_id: string;

  match_type:
    | "league"
    | "practice";

  wager_type:
    | "none"
    | "dp"
    | "card";

  wager_dp_amount: number;

  wager_status:
    | "none"
    | "proposed"
    | "funded"
    | "settled"
    | "released";

  status: string;
};

// =========================================================
// HELPERS
//
// Every failure redirects back with ?error=... (shown by
// ActionFeedbackBanner) instead of throwing: a thrown Error becomes
// a generic error screen in production builds. redirect() itself
// throws NEXT_REDIRECT, so none of this runs inside a try/catch.
// =========================================================

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

function matchPath(
  matchId: string
) {
  return matchId
    ? `/matches/${matchId}`
    : "/matches";
}

async function getMatchSettlementInfo(
  supabase: Awaited<
    ReturnType<
      typeof requireUser
    >
  >["supabase"],
  matchId: string
) {
  const back =
    matchPath(
      matchId
    );

  const {
    data,
    error,
  } = await supabase
    .from("matches")
   .select(
  `
    id,
    competition_id,
    match_type,
    wager_type,
    wager_status,
    status
  `
)
    .eq("id", matchId)
    .maybeSingle();

  if (
    error ||
    !data
  ) {
    fail(
      back,
      "Could not load this duel."
    );
  }

  return data as MatchSettlementInfo;
}

async function getMatchAcceptInfo(
  supabase: Awaited<
    ReturnType<
      typeof requireUser
    >
  >["supabase"],
  matchId: string
) {
  const back =
    matchPath(
      matchId
    );

  const {
    data,
    error,
  } = await supabase
    .from("matches")
    .select(
      `
        id,
        player_one_id,
        player_two_id,
        match_type,
        wager_type,
        wager_dp_amount,
        wager_status,
        status
      `
    )
    .eq("id", matchId)
    .maybeSingle();

  if (
    error ||
    !data
  ) {
    fail(
      back,
      "Could not load this duel."
    );
  }

  return data as MatchAcceptInfo;
}

function parseNonNegativeInteger(
  value:
    | FormDataEntryValue
    | null
) {
  const parsed =
    Number(
      String(
        value ?? "0"
      )
    );

  if (
    !Number.isInteger(
      parsed
    ) ||
    parsed < 0
  ) {
    return null;
  }

  return parsed;
}

// =========================================================
// FINALIZE COMPLETED MATCH
// =========================================================

async function finalizeCompletedMatch(
  supabase: Awaited<
    ReturnType<
      typeof requireUser
    >
  >["supabase"],
  matchId: string
) {
  const back =
    matchPath(
      matchId
    );

  const match =
    await getMatchSettlementInfo(
      supabase,
      matchId
    );

  if (
    match.status !==
    "completed"
  ) {
    return;
  }

  // 2.0: only competition matches earn DP (the RPC is a no-op for
  // ad-hoc and practice duels, so skip the round trip for those).
  if (
    match.competition_id
  ) {
    const {
      error: rewardError,
    } = await supabase.rpc(
      "award_match_duel_points",
      {
        target_match_id:
          matchId,
      }
    );

    if (rewardError) {
      fail(
        back,
        `DP reward failed: ${rewardError.message}`
      );
    }
  }

  if (
    match.match_type ===
      "practice" &&
    match.wager_type !==
      "none" &&
    match.wager_status !==
      "settled" &&
    match.wager_status !==
      "released"
  ) {
    const {
      error: wagerError,
    } = await supabase.rpc(
      "settle_match_wagers",
      {
        target_match_id:
          matchId,
      }
    );

    if (wagerError) {
      fail(
        back,
        `Wager settlement failed: ${wagerError.message}`
      );
    }
  }

  if (
    match.competition_id
  ) {
    revalidatePath(
      `/competitions/${match.competition_id}`
    );

    revalidatePath(
      "/competitions"
    );
  }
}

// =========================================================
// RELEASE CANCELLED / DECLINED WAGER
// =========================================================

async function releaseMatchWagerIfNeeded(
  supabase: Awaited<
    ReturnType<
      typeof requireUser
    >
  >["supabase"],
  matchId: string
) {
  const back =
    matchPath(
      matchId
    );

  const match =
    await getMatchSettlementInfo(
      supabase,
      matchId
    );

  if (
    match.match_type !==
      "practice" ||
    match.wager_type ===
      "none" ||
    match.wager_status ===
      "settled" ||
    match.wager_status ===
      "released"
  ) {
    return;
  }

  if (
    match.status !==
      "cancelled" &&
    match.status !==
      "declined"
  ) {
    return;
  }

  const {
    error,
  } = await supabase.rpc(
    "release_match_wagers",
    {
      target_match_id:
        matchId,
    }
  );

  if (error) {
    fail(
      back,
      `Releasing the wager failed: ${error.message}`
    );
  }
}

// =========================================================
// CREATE CHALLENGE
// =========================================================

export async function createMatchChallenge(
  formData: FormData
) {
  const {
    supabase,
    userId,
  } = await requireUser();

  const back =
    "/matches/new";

  const opponentId =
    String(
      formData.get(
        "opponent_id"
      ) ?? ""
    ).trim();

  const requestedMatchType =
    String(
      formData.get(
        "match_type"
      ) ?? "league"
    ).trim();

  const requestedWagerType =
    String(
      formData.get(
        "wager_type"
      ) ?? "none"
    ).trim();

  const cardInstanceId =
    String(
      formData.get(
        "card_instance_id"
      ) ?? ""
    ).trim();

  const wagerDpAmount =
    parseNonNegativeInteger(
      formData.get(
        "wager_dp_amount"
      )
    );

  if (!opponentId) {
    fail(
      back,
      "Pick an opponent."
    );
  }

  if (
    opponentId ===
    userId
  ) {
    fail(
      back,
      "You cannot challenge yourself."
    );
  }

  if (
    requestedMatchType !==
      "league" &&
    requestedMatchType !==
      "practice"
  ) {
    fail(
      back,
      "Invalid duel type."
    );
  }

  if (
    requestedWagerType !==
      "none" &&
    requestedWagerType !==
      "dp" &&
    requestedWagerType !==
      "card"
  ) {
    fail(
      back,
      "Invalid wager type."
    );
  }

  if (
    requestedMatchType ===
      "league" &&
    requestedWagerType !==
      "none"
  ) {
    fail(
      back,
      "League Duels can't have a wager."
    );
  }

  if (
    requestedMatchType ===
      "practice" &&
    requestedWagerType ===
      "dp"
  ) {
    if (
      wagerDpAmount ===
        null ||
      wagerDpAmount <= 0
    ) {
      fail(
        back,
        "Enter a valid DP wager."
      );
    }
  }

  if (
    requestedMatchType ===
      "practice" &&
    requestedWagerType ===
      "card" &&
    !cardInstanceId
  ) {
    fail(
      back,
      "Pick a card to wager."
    );
  }

  const {
    data: membership,
    error: membershipError,
  } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("profile_id", userId)
    .limit(1)
    .maybeSingle();

  if (
    membershipError ||
    !membership
  ) {
    fail(
      back,
      "League not found."
    );
  }

  const {
    data:
      opponentMembership,
    error:
      opponentMembershipError,
  } = await supabase
    .from("league_members")
    .select("profile_id")
    .eq(
      "league_id",
      membership.league_id
    )
    .eq(
      "profile_id",
      opponentId
    )
    .maybeSingle();

  if (
    opponentMembershipError ||
    !opponentMembership
  ) {
    fail(
      back,
      "That player is not in your league."
    );
  }

  const {
    data: activeDeck,
    error: activeDeckError,
  } = await supabase
    .from("decks")
    .select("id")
    .eq(
      "league_id",
      membership.league_id
    )
    .eq(
      "owner_id",
      userId
    )
    .eq(
      "status",
      "ready"
    )
    .eq(
      "is_active",
      true
    )
    .limit(1)
    .maybeSingle();

  if (activeDeckError) {
    fail(
      back,
      activeDeckError.message
    );
  }

  if (!activeDeck) {
    fail(
      back,
      "You need an active Ready deck first."
    );
  }

  const {
    data: matchId,
    error: createError,
  } = await supabase.rpc(
    "create_match_challenge",
    {
      target_league_id:
        membership.league_id,

      target_opponent_id:
        opponentId,
    }
  );

  if (createError) {
    fail(
      back,
      createError.message
    );
  }

  if (!matchId) {
    fail(
      back,
      "The challenge could not be created."
    );
  }

  if (
    requestedMatchType ===
    "practice"
  ) {
    const {
      error: configError,
    } = await supabase.rpc(
      "configure_practice_challenge",
      {
        target_match_id:
          matchId,

        target_wager_type:
          requestedWagerType,

        target_wager_dp_amount:
          requestedWagerType ===
          "dp"
            ? wagerDpAmount
            : 0,
      }
    );

    if (configError) {
      fail(
        back,
        `Setting up the practice duel failed: ${configError.message}`
      );
    }

    if (
      requestedWagerType ===
      "dp"
    ) {
      const {
        error: fundError,
      } = await supabase.rpc(
        "fund_match_dp_wager",
        {
          target_match_id:
            matchId,
        }
      );

      if (fundError) {
        await supabase.rpc(
          "cancel_match_challenge",
          {
            target_match_id:
              matchId,
          }
        );

        fail(
          back,
          `DP wager failed: ${fundError.message}`
        );
      }
    }

    if (
      requestedWagerType ===
        "card" &&
      cardInstanceId
    ) {
      const {
        error: cardError,
      } = await supabase.rpc(
        "add_match_wager_card",
        {
          target_match_id:
            matchId,

          target_card_instance_id:
            cardInstanceId,
        }
      );

      if (cardError) {
        await supabase.rpc(
          "cancel_match_challenge",
          {
            target_match_id:
              matchId,
          }
        );

        fail(
          back,
          `Card wager failed: ${cardError.message}`
        );
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath("/league");
  revalidatePath("/profile");

  redirect(
    `/matches/${matchId}?success=${encodeURIComponent("Challenge sent!")}`
  );
}

// =========================================================
// RECORD A PRACTICE DUEL (2.0: tap the winner)
//
// One screen: pick the opponent, tap who won. The duel was already
// played at the table, so there is no challenge/accept step -
// record_practice_duel puts it straight into "result submitted" and
// the opponent confirms it with one tap (Home / Attention -> duel
// page). No wager and no DP: a wagered duel still goes through
// createMatchChallenge above so both stakes are escrowed first.
// =========================================================

export async function recordPracticeDuel(
  formData: FormData
) {
  const {
    supabase,
    userId,
  } = await requireUser();

  const back =
    "/matches/new";

  const opponentId =
    String(
      formData.get(
        "opponent_id"
      ) ?? ""
    ).trim();

  const winnerId =
    String(
      formData.get(
        "winner_id"
      ) ?? ""
    ).trim();

  if (!opponentId) {
    fail(
      back,
      "Pick an opponent."
    );
  }

  if (
    winnerId !== userId &&
    winnerId !== opponentId
  ) {
    fail(
      back,
      "Tap who won the duel."
    );
  }

  const {
    data: matchId,
    error,
  } = await supabase.rpc(
    "record_practice_duel",
    {
      target_opponent_id:
        opponentId,
      target_winner_id:
        winnerId,
    }
  );

  if (error) {
    fail(
      back,
      error.message
    );
  }

  if (!matchId) {
    fail(
      back,
      "The duel could not be recorded."
    );
  }

  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath("/attention");
  revalidatePath("/profile");

  redirect(
    `/matches/${matchId}?success=${encodeURIComponent("Result saved — your opponent just has to confirm it.")}`
  );
}

// =========================================================
// ACCEPT MATCH
//
// Practice wager behavior:
//
// DP:
//   receiver funds same amount before accept
//
// CARD:
//   receiver chooses one physical copy before accept
//
// NONE / LEAGUE:
//   normal accept
// =========================================================

export async function acceptMatchChallenge(
  formData: FormData
) {
  const {
    supabase,
    userId,
  } = await requireUser();

  const matchId =
    String(
      formData.get(
        "match_id"
      ) ?? ""
    ).trim();

  const back =
    matchPath(
      matchId
    );

  const cardInstanceId =
    String(
      formData.get(
        "card_instance_id"
      ) ?? ""
    ).trim();

  if (!matchId) {
    fail(
      back,
      "Duel is missing."
    );
  }

  const match =
    await getMatchAcceptInfo(
      supabase,
      matchId
    );

  if (
    match.player_two_id !==
    userId
  ) {
    fail(
      back,
      "Only the challenged player can accept this duel."
    );
  }

  if (
    match.status !==
    "pending"
  ) {
    fail(
      back,
      "This challenge can no longer be accepted."
    );
  }

  if (
    match.match_type ===
      "practice" &&
    match.wager_type ===
      "card" &&
    !cardInstanceId
  ) {
    fail(
      back,
      "Pick a card to wager first."
    );
  }

  // -------------------------------------------------------
  // ACCEPT + STAKE IN ONE TRANSACTION (202610152030)
  //
  // accept_practice_challenge accepts the challenge and pays this
  // player's stake (DP into escrow, or locks the chosen card) in one
  // database transaction. If the stake fails (not enough DP, card
  // locked, no Ready deck) nothing happens at all - before, the
  // duel could end up accepted with only the challenger's stake in
  // the pot.
  // -------------------------------------------------------

  const {
    error,
  } = await supabase.rpc(
    "accept_practice_challenge",
    {
      target_match_id:
        matchId,

      target_card_instance_id:
        cardInstanceId ||
        null,
    }
  );

  if (error) {
    fail(
      back,
      match.wager_type !==
        "none"
        ? `Wager failed: ${error.message}`
        : error.message
    );
  }

  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath(
    `/matches/${matchId}`
  );
  revalidatePath("/profile");

  redirect(
    `/matches/${matchId}?success=${encodeURIComponent("Duel accepted!")}`
  );
}

// =========================================================
// DECLINE MATCH
// =========================================================

export async function declineMatchChallenge(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const matchId =
    String(
      formData.get(
        "match_id"
      ) ?? ""
    ).trim();

  const back =
    matchPath(
      matchId
    );

  if (!matchId) {
    fail(
      back,
      "Duel is missing."
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "decline_match_challenge",
    {
      target_match_id:
        matchId,
    }
  );

  if (error) {
    fail(
      back,
      error.message
    );
  }

  await releaseMatchWagerIfNeeded(
    supabase,
    matchId
  );

  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath(
    `/matches/${matchId}`
  );
  revalidatePath("/profile");

  redirect(
    `/matches?success=${encodeURIComponent("Challenge declined.")}`
  );
}

// =========================================================
// CANCEL MATCH
// =========================================================

export async function cancelMatchChallenge(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const matchId =
    String(
      formData.get(
        "match_id"
      ) ?? ""
    ).trim();

  const back =
    matchPath(
      matchId
    );

  if (!matchId) {
    fail(
      back,
      "Duel is missing."
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "cancel_match_challenge",
    {
      target_match_id:
        matchId,
    }
  );

  if (error) {
    fail(
      back,
      error.message
    );
  }

  await releaseMatchWagerIfNeeded(
    supabase,
    matchId
  );

  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath(
    `/matches/${matchId}`
  );
  revalidatePath("/profile");

  redirect(
    `/matches?success=${encodeURIComponent("Challenge cancelled.")}`
  );
}

// =========================================================
// SUBMIT MATCH RESULT
// =========================================================

export async function completeMatch(
  formData: FormData
) {
  const {
    supabase,
    userId,
  } = await requireUser();

  const matchId =
    String(
      formData.get(
        "match_id"
      ) ?? ""
    ).trim();

  const back =
    matchPath(
      matchId
    );

  const result =
    String(
      formData.get(
        "result"
      ) ?? ""
    ).trim();

  const notes =
    String(
      formData.get(
        "notes"
      ) ?? ""
    ).trim();

  if (!matchId) {
    fail(
      back,
      "Duel is missing."
    );
  }

  if (
    result !==
      "player_one_win" &&
    result !==
      "player_two_win" &&
    result !==
      "draw"
  ) {
    fail(
      back,
      "Invalid duel result."
    );
  }

  const {
    data: match,
    error: matchError,
  } = await supabase
    .from("matches")
    .select(
      `
        id,
        player_one_id,
        player_two_id,
        status
      `
    )
    .eq("id", matchId)
    .maybeSingle();

  if (
    matchError ||
    !match
  ) {
    fail(
      back,
      "Duel not found."
    );
  }

  if (
    match.player_one_id !==
      userId &&
    match.player_two_id !==
      userId
  ) {
    fail(
      back,
      "You are not a player in this duel."
    );
  }

  if (
    match.status !==
    "accepted"
  ) {
    fail(
      back,
      "Only an accepted duel can get a result."
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "complete_match",
    {
      target_match_id:
        matchId,

      target_result:
        result,

      match_notes:
        notes || null,
    }
  );

  if (error) {
    fail(
      back,
      error.message
    );
  }

  revalidatePath("/matches");
  revalidatePath(
    `/matches/${matchId}`
  );

  redirect(
    `/matches/${matchId}?success=${encodeURIComponent("Result submitted — waiting for confirmation.")}`
  );
}

// =========================================================
// CONFIRM RESULT
// =========================================================

export async function confirmMatchResult(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const matchId =
    String(
      formData.get(
        "match_id"
      ) ?? ""
    ).trim();

  const back =
    matchPath(
      matchId
    );

  if (!matchId) {
    fail(
      back,
      "Duel is missing."
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "confirm_match_result",
    {
      target_match_id:
        matchId,
    }
  );

  if (error) {
    fail(
      back,
      error.message
    );
  }

  await finalizeCompletedMatch(
    supabase,
    matchId
  );

  // 2.0: Boss evolution is DP-only, so the old Boss achievement
  // checkboxes on this form are gone.

  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath(
    `/matches/${matchId}`
  );
  revalidatePath("/league");
  revalidatePath("/profile");
  revalidatePath("/boss");

  redirect(
    `/matches/${matchId}?success=${encodeURIComponent("Result confirmed!")}`
  );
}

// =========================================================
// DISPUTE RESULT
// =========================================================

export async function disputeMatchResult(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const matchId =
    String(
      formData.get(
        "match_id"
      ) ?? ""
    ).trim();

  const back =
    matchPath(
      matchId
    );

  const reason =
    String(
      formData.get(
        "reason"
      ) ?? ""
    ).trim();

  if (!matchId) {
    fail(
      back,
      "Duel is missing."
    );
  }

  if (
    reason.length >
    1000
  ) {
    fail(
      back,
      "The reason can be at most 1000 characters."
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "dispute_match_result",
    {
      target_match_id:
        matchId,

      reason:
        reason || null,
    }
  );

  if (error) {
    fail(
      back,
      error.message
    );
  }

  revalidatePath("/matches");
  revalidatePath(
    `/matches/${matchId}`
  );

  redirect(
    `/matches/${matchId}?success=${encodeURIComponent("Dispute filed — a league admin will review it.")}`
  );
}

// =========================================================
// RESOLVE DISPUTE
// =========================================================

export async function resolveDisputedMatch(
  formData: FormData
) {
  const {
    supabase,
    userId,
  } = await requireUser();

  const matchId =
    String(
      formData.get(
        "match_id"
      ) ?? ""
    ).trim();

  const back =
    matchPath(
      matchId
    );

  const result =
    String(
      formData.get(
        "result"
      ) ?? ""
    ).trim();

  const adminNotes =
    String(
      formData.get(
        "admin_notes"
      ) ?? ""
    ).trim();

  if (!matchId) {
    fail(
      back,
      "Duel is missing."
    );
  }

  if (
    result !==
      "player_one_win" &&
    result !==
      "player_two_win" &&
    result !==
      "draw"
  ) {
    fail(
      back,
      "Invalid result."
    );
  }

  if (
    adminNotes.length >
    1000
  ) {
    fail(
      back,
      "The admin note can be at most 1000 characters."
    );
  }

  const {
    data: match,
    error: matchError,
  } = await supabase
    .from("matches")
    .select(
      "id,league_id,status"
    )
    .eq("id", matchId)
    .maybeSingle();

  if (
    matchError ||
    !match
  ) {
    fail(
      back,
      "Duel not found."
    );
  }

  if (
    match.status !==
    "disputed"
  ) {
    fail(
      back,
      "Only a disputed duel can be resolved."
    );
  }

  const {
    data: membership,
    error: membershipError,
  } = await supabase
    .from("league_members")
    .select(
      "profile_id,role"
    )
    .eq(
      "league_id",
      match.league_id
    )
    .eq(
      "profile_id",
      userId
    )
    .maybeSingle();

  if (
    membershipError ||
    !membership
  ) {
    fail(
      back,
      "League membership not found."
    );
  }

  if (
    membership.role !==
    "admin"
  ) {
    fail(
      back,
      "Only a league admin can resolve a disputed duel."
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "resolve_disputed_match",
    {
      target_match_id:
        matchId,

      target_result:
        result,

      admin_notes:
        adminNotes || null,
    }
  );

  if (error) {
    fail(
      back,
      error.message
    );
  }

  // 202610152010: an admin who plays in this duel only PROPOSES the
  // result - the opponent has to accept it before anything (result,
  // wager) changes.
  const {
    data: openProposal,
  } = await supabase
    .from("match_result_proposals")
    .select("id")
    .eq(
      "match_id",
      matchId
    )
    .eq(
      "proposed_by",
      userId
    )
    .eq(
      "status",
      "pending"
    )
    .maybeSingle();

  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath(
    `/matches/${matchId}`
  );
  revalidatePath("/attention");

  if (openProposal) {
    redirect(
      withFeedback(
        `/matches/${matchId}`,
        "success",
        "Result proposed — your opponent has to accept it before it counts."
      )
    );
  }

  await finalizeCompletedMatch(
    supabase,
    matchId
  );

  revalidatePath("/league");
  revalidatePath("/profile");

  redirect(
    withFeedback(
      `/matches/${matchId}`,
      "success",
      "Dispute resolved."
    )
  );
}

// =========================================================
// RESULT PROPOSALS (202610152010)
//
// A league admin who PLAYS in a duel cannot overrule it: their
// correction (season duel), tiebreak result or dispute resolution
// (practice duel) is stored as a proposal. Only the opponent can
// accept or reject it; the admin can withdraw it. All checks live in
// the database functions. return_to brings the player back to the
// screen the buttons were on (round screen, competition page, duel).
// =========================================================

type ProposalAction =
  | "accept_match_result_proposal"
  | "reject_match_result_proposal"
  | "withdraw_match_result_proposal";

const PROPOSAL_SUCCESS: Record<
  ProposalAction,
  string
> = {
  accept_match_result_proposal:
    "Accepted — the result is updated.",
  reject_match_result_proposal:
    "Rejected — the result stays as it was.",
  withdraw_match_result_proposal:
    "Proposal withdrawn.",
};

async function runProposalAction(
  formData: FormData,
  rpc: ProposalAction
) {
  const {
    supabase,
  } = await requireUser();

  const proposalId =
    String(
      formData.get(
        "proposal_id"
      ) ?? ""
    ).trim();

  const back =
    safeReturnTo(
      String(
        formData.get(
          "return_to"
        ) ?? ""
      ),
      "/attention"
    );

  if (!proposalId) {
    fail(
      back,
      "Proposal is missing."
    );
  }

  const note =
    String(
      formData.get(
        "note"
      ) ?? ""
    ).trim();

  const {
    data: matchId,
    error,
  } = await supabase.rpc(
    rpc,
    rpc ===
      "reject_match_result_proposal"
      ? {
          target_proposal_id:
            proposalId,
          target_note:
            note ||
            null,
        }
      : {
          target_proposal_id:
            proposalId,
        }
  );

  if (error) {
    fail(
      back,
      error.message
    );
  }

  const settledMatchId =
    typeof matchId ===
    "string"
      ? matchId
      : "";

  if (
    rpc ===
      "accept_match_result_proposal" &&
    settledMatchId
  ) {
    // Practice duel: settle its wager now that it is completed (a
    // no-op for season duels and duels without a wager).
    await finalizeCompletedMatch(
      supabase,
      settledMatchId
    );
  }

  const {
    data: matchRow,
  } = settledMatchId
    ? await supabase
        .from("matches")
        .select("competition_id")
        .eq(
          "id",
          settledMatchId
        )
        .maybeSingle()
    : {
        data: null,
      };

  const competitionId =
    (matchRow as {
      competition_id: string | null;
    } | null)?.competition_id ?? null;

  revalidatePath("/");
  revalidatePath("/attention");
  revalidatePath("/matches");
  revalidatePath("/league");
  revalidatePath("/profile");

  if (settledMatchId) {
    revalidatePath(
      `/matches/${settledMatchId}`
    );
  }

  if (competitionId) {
    revalidatePath(
      `/competitions/${competitionId}`
    );
    revalidatePath(
      `/competitions/${competitionId}/round`
    );
  }

  redirect(
    withFeedback(
      back,
      "success",
      PROPOSAL_SUCCESS[rpc]
    )
  );
}

export async function acceptMatchResultProposal(
  formData: FormData
) {
  await runProposalAction(
    formData,
    "accept_match_result_proposal"
  );
}

export async function rejectMatchResultProposal(
  formData: FormData
) {
  await runProposalAction(
    formData,
    "reject_match_result_proposal"
  );
}

export async function withdrawMatchResultProposal(
  formData: FormData
) {
  await runProposalAction(
    formData,
    "withdraw_match_result_proposal"
  );
}