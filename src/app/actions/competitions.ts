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