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
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const matchId =
    requiredString(
      formData,
      "match_id"
    );

  const competitionId =
    requiredString(
      formData,
      "competition_id"
    );

  const playerOneWins =
    Number.parseInt(
      requiredString(
        formData,
        "player_one_duel_wins"
      ),
      10
    );

  const playerTwoWins =
    Number.parseInt(
      requiredString(
        formData,
        "player_two_duel_wins"
      ),
      10
    );

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
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    `/competitions/${competitionId}`
  );
}

// =========================================================
// V2 - CORRECT MATCH RESULT
// =========================================================

export async function correctCompetitionMatchResultV2(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const matchId =
    requiredString(
      formData,
      "match_id"
    );

  const competitionId =
    requiredString(
      formData,
      "competition_id"
    );

  const playerOneWins =
    Number.parseInt(
      requiredString(
        formData,
        "player_one_duel_wins"
      ),
      10
    );

  const playerTwoWins =
    Number.parseInt(
      requiredString(
        formData,
        "player_two_duel_wins"
      ),
      10
    );

  const reason =
    requiredString(
      formData,
      "reason"
    );

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
    throw new Error(
      error.message
    );
  }

  revalidatePath(
    `/competitions/${competitionId}`
  );
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

  const {
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

  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/shop");
  revalidatePath("/league");
  revalidatePath("/competitions");
  revalidatePath(
    `/competitions/${competitionId}`
  );
}