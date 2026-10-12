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
// =========================================================

async function getMatchSettlementInfo(
  supabase: Awaited<
    ReturnType<
      typeof requireUser
    >
  >["supabase"],
  matchId: string
) {
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
    throw new Error(
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
    throw new Error(
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
      throw new Error(
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
      throw new Error(
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
    throw new Error(
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
    throw new Error(
      "Pick an opponent."
    );
  }

  if (
    opponentId ===
    userId
  ) {
    throw new Error(
      "You cannot challenge yourself."
    );
  }

  if (
    requestedMatchType !==
      "league" &&
    requestedMatchType !==
      "practice"
  ) {
    throw new Error(
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
    throw new Error(
      "Invalid wager type."
    );
  }

  if (
    requestedMatchType ===
      "league" &&
    requestedWagerType !==
      "none"
  ) {
    throw new Error(
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
      throw new Error(
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
    throw new Error(
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
    throw new Error(
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
    throw new Error(
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
    throw new Error(
      activeDeckError.message
    );
  }

  if (!activeDeck) {
    throw new Error(
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
    throw new Error(
      createError.message
    );
  }

  if (!matchId) {
    throw new Error(
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
      throw new Error(
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

        throw new Error(
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

        throw new Error(
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
    throw new Error(
      "Pick an opponent."
    );
  }

  if (
    winnerId !== userId &&
    winnerId !== opponentId
  ) {
    throw new Error(
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
    throw new Error(
      error.message
    );
  }

  if (!matchId) {
    throw new Error(
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

  const cardInstanceId =
    String(
      formData.get(
        "card_instance_id"
      ) ?? ""
    ).trim();

  if (!matchId) {
    throw new Error(
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
    throw new Error(
      "Only the challenged player can accept this duel."
    );
  }

  if (
    match.status !==
    "pending"
  ) {
    throw new Error(
      "This challenge can no longer be accepted."
    );
  }

  // -------------------------------------------------------
  // ACCEPT EXISTING CHALLENGE FIRST
  //
  // Deliberately runs BEFORE any wager funding/locking below. This
  // is the only step that can fail for a reason that has nothing to
  // do with the wager itself (no Active Ready deck, challenge no
  // longer pending, wrong player) - previously it ran LAST, so a
  // player who lacked a ready deck could already have had DP
  // deducted (fund_match_dp_wager) or a card locked
  // (add_match_wager_card) with no rollback, leaving them worse off
  // with the challenge still stuck pending. Running the
  // fail-without-side-effects check first means a deck-check failure
  // now leaves no DP debited and no card locked, so no rollback is
  // needed at all.
  // -------------------------------------------------------

  const {
    error,
  } = await supabase.rpc(
    "accept_match_challenge",
    {
      target_match_id:
        matchId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  // -------------------------------------------------------
  // PRACTICE DP WAGER
  // -------------------------------------------------------

  if (
    match.match_type ===
      "practice" &&
    match.wager_type ===
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
      throw new Error(
        `DP wager failed: ${fundError.message}`
      );
    }
  }

  // -------------------------------------------------------
  // PRACTICE CARD WAGER
  // -------------------------------------------------------

  if (
    match.match_type ===
      "practice" &&
    match.wager_type ===
      "card"
  ) {
    if (!cardInstanceId) {
      throw new Error(
        "Pick a card to wager first."
      );
    }

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
      throw new Error(
        `Card wager failed: ${cardError.message}`
      );
    }
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

  if (!matchId) {
    throw new Error(
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
    throw new Error(
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

  if (!matchId) {
    throw new Error(
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
    throw new Error(
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
    throw new Error(
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
    throw new Error(
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
    throw new Error(
      "Duel not found."
    );
  }

  if (
    match.player_one_id !==
      userId &&
    match.player_two_id !==
      userId
  ) {
    throw new Error(
      "You are not a player in this duel."
    );
  }

  if (
    match.status !==
    "accepted"
  ) {
    throw new Error(
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
    throw new Error(
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

  if (!matchId) {
    throw new Error(
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
    throw new Error(
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

  const reason =
    String(
      formData.get(
        "reason"
      ) ?? ""
    ).trim();

  if (!matchId) {
    throw new Error(
      "Duel is missing."
    );
  }

  if (
    reason.length >
    1000
  ) {
    throw new Error(
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
    throw new Error(
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
    throw new Error(
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
    throw new Error(
      "Invalid result."
    );
  }

  if (
    adminNotes.length >
    1000
  ) {
    throw new Error(
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
    throw new Error(
      "Duel not found."
    );
  }

  if (
    match.status !==
    "disputed"
  ) {
    throw new Error(
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
    throw new Error(
      "League membership not found."
    );
  }

  if (
    membership.role !==
    "admin"
  ) {
    throw new Error(
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
    throw new Error(
      error.message
    );
  }

  await finalizeCompletedMatch(
    supabase,
    matchId
  );

  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath(
    `/matches/${matchId}`
  );
  revalidatePath("/league");
  revalidatePath("/profile");

  redirect(
    `/matches/${matchId}?success=${encodeURIComponent("Dispute resolved.")}`
  );
    }