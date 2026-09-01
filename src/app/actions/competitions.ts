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

import {
  buildMatchSettlementSummary,
  type MatchSettlementSummary,
} from "@/lib/match-settlement-summary";

// =========================================================
// HELPERS
// =========================================================

function requiredString(
  formData: FormData,
  key: string
) {
  const value =
    String(
      formData.get(key) ??
        ""
    ).trim();

  if (!value) {
    throw new Error(
      `${key} ontbreekt.`
    );
  }

  return value;
}

// =========================================================
// MATCH RESULT ACTION STATE
//
// submit_competition_match_result_v2 / submit_competition_tiebreak_
// match_result are void RPCs - the settlement (match DP, round
// rewards, competition finalize + rewards) all already happened
// inside them, atomically and idempotently, before this ever runs.
// This state shape lets the client component show what ACTUALLY got
// granted (via buildMatchSettlementSummary re-reading the ledger/
// grant tables) instead of the frontend guessing or computing its
// own numbers.
// =========================================================

export type MatchResultActionState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; summary: MatchSettlementSummary | null };


// =========================================================
// CREATE COMPETITION
// =========================================================

export async function createCompetition(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const leagueId =
    requiredString(
      formData,
      "league_id"
    );

  const name =
    requiredString(
      formData,
      "name"
    );

  const competitionType =
    requiredString(
      formData,
      "competition_type"
    );

  if (
    competitionType !==
      "round_robin" &&
    competitionType !==
      "tournament"
  ) {
    throw new Error(
      "Ongeldig competition type."
    );
  }

  const {
    data: competitionId,
    error,
  } = await supabase.rpc(
    "create_competition",
    {
      target_league_id:
        leagueId,

      target_name:
        name,

      target_type:
        competitionType,

      target_season_id:
        null,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  if (!competitionId) {
    throw new Error(
      "Competition kon niet worden aangemaakt."
    );
  }

  const {
    error: rewardError,
  } = await supabase.rpc(
    "install_default_competition_rewards",
    {
      target_competition_id:
        competitionId,
    }
  );

  if (rewardError) {
    throw new Error(
      rewardError.message
    );
  }

  revalidatePath(
    "/competitions"
  );

  redirect(
    `/competitions/${competitionId}`
  );
}

// =========================================================
// ADD PLAYER
// =========================================================

export async function addCompetitionPlayer(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const competitionId =
    requiredString(
      formData,
      "competition_id"
    );

  const profileId =
    requiredString(
      formData,
      "profile_id"
    );

  const {
    error,
  } = await supabase.rpc(
    "add_competition_player",
    {
      target_competition_id:
        competitionId,

      target_profile_id:
        profileId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    "/competitions"
  );

  revalidatePath(
    `/competitions/${competitionId}`
  );
}

// =========================================================
// REMOVE PLAYER
// =========================================================

export async function removeCompetitionPlayer(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const competitionId =
    requiredString(
      formData,
      "competition_id"
    );

  const profileId =
    requiredString(
      formData,
      "profile_id"
    );

  const {
    error,
  } = await supabase.rpc(
    "remove_competition_player",
    {
      target_competition_id:
        competitionId,

      target_profile_id:
        profileId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    "/competitions"
  );

  revalidatePath(
    `/competitions/${competitionId}`
  );
}

// =========================================================
// START COMPETITION
// =========================================================

export async function startCompetition(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const competitionId =
    requiredString(
      formData,
      "competition_id"
    );

  const {
    error,
  } = await supabase.rpc(
    "start_competition",
    {
      target_competition_id:
        competitionId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    "/competitions"
  );

  revalidatePath(
    `/competitions/${competitionId}`
  );

  revalidatePath(
    "/league"
  );
}

// =========================================================
// FINALIZE ROUND ROBIN
// =========================================================

export async function finalizeRoundRobinCompetition(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const competitionId =
    requiredString(
      formData,
      "competition_id"
    );

  const {
    error,
  } = await supabase.rpc(
    "finalize_round_robin_competition",
    {
      target_competition_id:
        competitionId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    "/competitions"
  );

  revalidatePath(
    `/competitions/${competitionId}`
  );

  revalidatePath(
    "/league"
  );
}

// =========================================================
// DISTRIBUTE REWARDS
// =========================================================

export async function distributeCompetitionRewards(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const competitionId =
    requiredString(
      formData,
      "competition_id"
    );

  const {
    error,
  } = await supabase.rpc(
    "distribute_competition_rewards",
    {
      target_competition_id:
        competitionId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidatePath("/");
  revalidatePath(
    "/profile"
  );
  revalidatePath(
    "/shop"
  );
  revalidatePath(
    "/league"
  );
  revalidatePath(
    "/competitions"
  );
  revalidatePath(
    `/competitions/${competitionId}`
  );
}

// =========================================================
// V2 - CREATE COMPETITION
// =========================================================

export async function createCompetitionV2(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const leagueId =
    requiredString(
      formData,
      "league_id"
    );

  const name =
    requiredString(
      formData,
      "name"
    );

  const meetingsRaw =
    requiredString(
      formData,
      "meetings_per_pairing"
    );

  const meetings =
    Number.parseInt(
      meetingsRaw,
      10
    );

  if (
    !Number.isFinite(
      meetings
    ) ||
    meetings < 1
  ) {
    throw new Error(
      "Meetings per pairing moet minimaal 1 zijn."
    );
  }

  const matchFormat =
    requiredString(
      formData,
      "match_format"
    );

  if (
    matchFormat !==
      "single_duel" &&
    matchFormat !==
      "best_of_3"
  ) {
    throw new Error(
      "Ongeldig match format."
    );
  }

  const {
    data: competitionId,
    error,
  } = await supabase.rpc(
    "create_competition_v2",
    {
      target_league_id:
        leagueId,
      target_name: name,
      target_meetings_per_pairing:
        meetings,
      target_match_format:
        matchFormat,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  if (!competitionId) {
    throw new Error(
      "Competition kon niet worden aangemaakt."
    );
  }

  const playerIds =
    formData
      .getAll("player_ids")
      .map((value) => String(value))
      .filter((value) => value.length > 0);

  for (const profileId of playerIds) {
    const {
      error: addPlayerError,
    } = await supabase.rpc(
      "add_competition_player_v2",
      {
        target_competition_id:
          competitionId,
        target_profile_id:
          profileId,
      }
    );

    if (addPlayerError) {
      throw new Error(
        addPlayerError.message
      );
    }
  }

  revalidatePath(
    "/competitions"
  );

  redirect(
    `/competitions/${competitionId}`
  );
}

// =========================================================
// V2 - ADD / REMOVE PLAYER
// =========================================================

export async function addCompetitionPlayerV2(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const competitionId =
    requiredString(
      formData,
      "competition_id"
    );

  const profileId =
    requiredString(
      formData,
      "profile_id"
    );

  const {
    error,
  } = await supabase.rpc(
    "add_competition_player_v2",
    {
      target_competition_id:
        competitionId,
      target_profile_id:
        profileId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    `/competitions/${competitionId}`
  );
}

export async function removeCompetitionPlayerV2(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const competitionId =
    requiredString(
      formData,
      "competition_id"
    );

  const profileId =
    requiredString(
      formData,
      "profile_id"
    );

  const {
    error,
  } = await supabase.rpc(
    "remove_competition_player_v2",
    {
      target_competition_id:
        competitionId,
      target_profile_id:
        profileId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    `/competitions/${competitionId}`
  );
}

// =========================================================
// V2 - START (GENERATE ROUND ROBIN MATCHES)
// =========================================================

export async function startCompetitionV2(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const competitionId =
    requiredString(
      formData,
      "competition_id"
    );

  const {
    error,
  } = await supabase.rpc(
    "generate_round_robin_matches_v2",
    {
      target_competition_id:
        competitionId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    `/competitions/${competitionId}`
  );

  revalidatePath(
    "/competitions"
  );
}

// =========================================================
// V2 - SUBMIT MATCH RESULT
// =========================================================

export async function submitCompetitionMatchResultV2(
  _prevState: MatchResultActionState,
  formData: FormData
): Promise<MatchResultActionState> {
  const {
    supabase,
  } = await requireUser();

  let matchId: string;
  let competitionId: string;
  let playerOneWins: number;
  let playerTwoWins: number;

  try {
    matchId = requiredString(formData, "match_id");
    competitionId = requiredString(formData, "competition_id");
    playerOneWins = Number.parseInt(
      requiredString(formData, "player_one_duel_wins"),
      10
    );
    playerTwoWins = Number.parseInt(
      requiredString(formData, "player_two_duel_wins"),
      10
    );
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Invalid form submission.",
    };
  }

  const settledFrom = new Date().toISOString();

  const {
    error,
  } = await supabase.rpc(
    "submit_competition_match_result_v2",
    {
      target_match_id:
        matchId,
      target_player_one_duel_wins:
        playerOneWins,
      target_player_two_duel_wins:
        playerTwoWins,
    }
  );

  if (error) {
    return {
      status: "error",
      error: error.message,
    };
  }

  revalidatePath(
    `/competitions/${competitionId}`
  );

  let summary: MatchSettlementSummary | null = null;

  try {
    summary = await buildMatchSettlementSummary(supabase, {
      matchId,
      competitionId,
      settledFrom,
    });
  } catch {
    // The result was saved successfully - a failure summarizing it
    // afterward should never make the submission look like it failed.
    summary = null;
  }

  return {
    status: "success",
    summary,
  };
}

// =========================================================
// V2 - CORRECT MATCH RESULT
// =========================================================

export async function correctCompetitionMatchResultV2(
  _prevState: MatchResultActionState,
  formData: FormData
): Promise<MatchResultActionState> {
  const {
    supabase,
  } = await requireUser();

  let matchId: string;
  let competitionId: string;
  let playerOneWins: number;
  let playerTwoWins: number;
  let reason: string;

  try {
    matchId = requiredString(formData, "match_id");
    competitionId = requiredString(formData, "competition_id");
    playerOneWins = Number.parseInt(
      requiredString(formData, "player_one_duel_wins"),
      10
    );
    playerTwoWins = Number.parseInt(
      requiredString(formData, "player_two_duel_wins"),
      10
    );
    reason = requiredString(formData, "reason");
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Invalid form submission.",
    };
  }

  const {
    error,
  } = await supabase.rpc(
    "correct_competition_match_result_v2",
    {
      target_match_id:
        matchId,
      target_player_one_duel_wins:
        playerOneWins,
      target_player_two_duel_wins:
        playerTwoWins,
      target_reason: reason,
    }
  );

  if (error) {
    return {
      status: "error",
      error: error.message,
    };
  }

  revalidatePath(
    `/competitions/${competitionId}`
  );

  return {
    status: "success",
    summary: null,
  };
}

// =========================================================
// V2 - FINALIZE
// =========================================================

export async function finalizeCompetitionV2(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const competitionId =
    requiredString(
      formData,
      "competition_id"
    );

  const {
    error,
  } = await supabase.rpc(
    "finalize_competition_v2",
    {
      target_competition_id:
        competitionId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    `/competitions/${competitionId}`
  );

  revalidatePath(
    "/competitions"
  );
}

// =========================================================
// V2 - TIEBREAKS (2026-08-27, Track 3)
//
// Three thin wrappers around the RPCs added in
// 202608271000_competition_tiebreaks.sql, following the exact same
// FormData -> requireUser() -> supabase.rpc() -> throw-on-error ->
// revalidatePath() pattern as every other V2 action above. All three
// RPCs are admin-gated server-side (SECURITY DEFINER, checks the
// caller is a league admin) - these wrappers add no extra
// authorization of their own, matching e.g. finalizeCompetitionV2.
// =========================================================

export async function detectCompetitionTiebreaksV2(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const competitionId =
    requiredString(
      formData,
      "competition_id"
    );

  const {
    error,
  } = await supabase.rpc(
    "detect_and_create_competition_tiebreaks",
    {
      target_competition_id:
        competitionId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    `/competitions/${competitionId}`
  );
}

export async function startCompetitionTiebreak(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const tiebreakId =
    requiredString(
      formData,
      "tiebreak_id"
    );

  const competitionId =
    requiredString(
      formData,
      "competition_id"
    );

  const {
    error,
  } = await supabase.rpc(
    "start_competition_tiebreak",
    {
      target_tiebreak_id:
        tiebreakId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    `/competitions/${competitionId}`
  );
}

export async function submitCompetitionTiebreakMatchResult(
  _prevState: MatchResultActionState,
  formData: FormData
): Promise<MatchResultActionState> {
  const {
    supabase,
  } = await requireUser();

  let matchId: string;
  let competitionId: string;
  let playerOneWins: number;
  let playerTwoWins: number;

  try {
    matchId = requiredString(formData, "match_id");
    competitionId = requiredString(formData, "competition_id");
    playerOneWins = Number.parseInt(
      requiredString(formData, "player_one_duel_wins"),
      10
    );
    playerTwoWins = Number.parseInt(
      requiredString(formData, "player_two_duel_wins"),
      10
    );
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Invalid form submission.",
    };
  }

  const settledFrom = new Date().toISOString();

  const {
    error,
  } = await supabase.rpc(
    "submit_competition_tiebreak_match_result",
    {
      target_match_id:
        matchId,
      target_player_one_duel_wins:
        playerOneWins,
      target_player_two_duel_wins:
        playerTwoWins,
    }
  );

  if (error) {
    return {
      status: "error",
      error: error.message,
    };
  }

  revalidatePath(
    `/competitions/${competitionId}`
  );

  // A tiebreak match is never itself part of a "round" (its
  // matches.round_number is null - see start_competition_tiebreak),
  // so there is no round-reward summary here, only a possible
  // competition-completion summary if resolving this tiebreak just
  // let the competition auto-finalize.
  let summary: MatchSettlementSummary | null = null;

  try {
    summary = await buildMatchSettlementSummary(supabase, {
      matchId,
      competitionId,
      settledFrom,
    });
  } catch {
    summary = null;
  }

  return {
    status: "success",
    summary,
  };
}

// =========================================================
// V2 - DISTRIBUTE REWARDS
// =========================================================

export async function distributeCompetitionRewardsV2(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const competitionId =
    requiredString(
      formData,
      "competition_id"
    );

  // FIXED (2026-08-27): distribute_competition_rewards_v2 now
  // returns the number of NEW grants it actually created (was `void`
  // - see that function's fix header in
  // 202608270930_competition_reward_and_match_dp_fixes.sql) instead
  // of only ever reporting success via a non-null error. `data` is
  // that count - not yet surfaced in the UI (the page's own copy was
  // updated to stop implying "distributed" always means "something
  // was granted"), but captured here rather than discarded so a
  // future toast/inline count is a small addition, not a rewrite.
  const {
    data: grantsCreated,
    error,
  } = await supabase.rpc(
    "distribute_competition_rewards_v2",
    {
      target_competition_id:
        competitionId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  if (typeof grantsCreated === "number" && grantsCreated === 0) {
    console.warn(
      `[competitions] distribute_competition_rewards_v2 granted 0 new rewards for competition ${competitionId} - either everyone eligible was already rewarded, or nobody has a matching reward rule for their placement.`
    );
  }

  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/shop");
  revalidatePath("/league");
  revalidatePath("/competitions");
  revalidatePath(
    `/competitions/${competitionId}`
  );
}

// =========================================================
// QUICK START ("TONIGHT") - task 146
//
// One-click competition creation for the 3-player league: no
// manual form, no player picker. Auto-uses every league member as
// a player, always meetings_per_pairing=3 (everyone plays everyone
// 3 times), always single_duel, then immediately generates the
// full round-robin schedule and redirects into the new linear
// "tonight" flow. Reuses create_competition_v2 / add_competition_
// player_v2 / generate_round_robin_matches_v2 exactly as the manual
// V2 form does - no new backend, no duplicate scheduling logic.
// =========================================================

export async function quickStartTonightCompetition(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const leagueId =
    requiredString(
      formData,
      "league_id"
    );

  const {
    data: memberRows,
    error: memberError,
  } = await supabase
    .from(
      "league_members"
    )
    .select(
      "profile_id"
    )
    .eq(
      "league_id",
      leagueId
    );

  if (memberError) {
    throw new Error(
      memberError.message
    );
  }

  const playerIds = (
    memberRows ?? []
  ).map(
    (row) =>
      row.profile_id as string
  );

  if (playerIds.length < 2) {
    throw new Error(
      "Need at least 2 league members to start a competition."
    );
  }

  const competitionName = `Tonight - ${new Date().toLocaleDateString(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  )}`;

  const {
    data: competitionId,
    error: createError,
  } = await supabase.rpc(
    "create_competition_v2",
    {
      target_league_id:
        leagueId,
      target_name:
        competitionName,
      target_meetings_per_pairing: 3,
      target_match_format:
        "single_duel",
    }
  );

  if (createError) {
    throw new Error(
      createError.message
    );
  }

  if (!competitionId) {
    throw new Error(
      "Competition kon niet worden aangemaakt."
    );
  }

  for (const profileId of playerIds) {
    const {
      error: addPlayerError,
    } = await supabase.rpc(
      "add_competition_player_v2",
      {
        target_competition_id:
          competitionId,
        target_profile_id:
          profileId,
      }
    );

    if (addPlayerError) {
      throw new Error(
        addPlayerError.message
      );
    }
  }

  const {
    error: scheduleError,
  } = await supabase.rpc(
    "generate_round_robin_matches_v2",
    {
      target_competition_id:
        competitionId,
    }
  );

  if (scheduleError) {
    throw new Error(
      scheduleError.message
    );
  }

  revalidatePath(
    "/competitions"
  );

  redirect(
    `/competitions/${competitionId}/tonight`
  );
}
