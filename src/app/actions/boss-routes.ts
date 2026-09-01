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
// BOSS ROUTE ACTIONS (task 142)
//
// Thin server-action wrappers around the SECURITY DEFINER RPCs
// added in 202609012000_boss_route_rpcs.sql. All the real rules
// (idempotency, DP gating, achievement gating, in-order stage
// progression) live in the database - these actions only parse
// form input, call the RPC, and redirect with a friendly message.
// =========================================================

function revalidateBossPaths(
  pathId?: string
) {
  revalidatePath("/boss");
  revalidatePath(
    "/boss/select"
  );
  revalidatePath("/profile");
  revalidatePath("/");

  if (pathId) {
    revalidatePath(
      `/boss/${pathId}`
    );
  }
}

// =========================================================
// CHOOSE FIRST BOSS ROUTE (free)
// =========================================================

export async function chooseBossPath(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const routeId = String(
    formData.get(
      "route_id"
    ) ?? ""
  ).trim();

  if (!routeId) {
    throw new Error(
      "Choose a Boss Route first."
    );
  }

  const {
    data: pathId,
    error,
  } = await supabase.rpc(
    "choose_boss_path",
    {
      target_route_id:
        routeId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidateBossPaths(
    pathId ?? undefined
  );

  redirect(
    `/boss/${pathId}?success=${encodeURIComponent("Boss Route chosen! Stage 1 is yours.")}`
  );
}

// =========================================================
// UNLOCK SECOND / THIRD BOSS ROUTE SLOT
// =========================================================

export async function unlockBossPathSlot(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const routeSlot = Number(
    formData.get(
      "route_slot"
    )
  );

  const routeId = String(
    formData.get(
      "route_id"
    ) ?? ""
  ).trim();

  if (
    !routeId ||
    (routeSlot !== 2 &&
      routeSlot !== 3)
  ) {
    throw new Error(
      "Invalid Boss Route slot selection."
    );
  }

  const {
    data: pathId,
    error,
  } = await supabase.rpc(
    "unlock_second_third_boss_path",
    {
      target_route_slot:
        routeSlot,
      target_route_id:
        routeId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidateBossPaths(
    pathId ?? undefined
  );

  redirect(
    `/boss/${pathId}?success=${encodeURIComponent("New Boss Route unlocked! Stage 1 is yours.")}`
  );
}

// =========================================================
// EVOLVE TO NEXT STAGE
// =========================================================

export async function evolveBossStage(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const pathId = String(
    formData.get(
      "player_boss_path_id"
    ) ?? ""
  ).trim();

  const stageNumber = Number(
    formData.get(
      "stage_number"
    )
  );

  if (
    !pathId ||
    ![2, 3, 4].includes(
      stageNumber
    )
  ) {
    throw new Error(
      "Invalid Boss Route evolution request."
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "evolve_boss_stage",
    {
      target_player_boss_path_id:
        pathId,
      target_stage_number:
        stageNumber,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidateBossPaths(pathId);

  redirect(
    `/boss/${pathId}?success=${encodeURIComponent(`Evolved to Stage ${stageNumber}!`)}`
  );
}


// =========================================================
// CONFIRM BOSS ACHIEVEMENT EVENT (task 146 - "tonight" flow)
//
// Thin wrapper around confirm_boss_achievement_event (see
// 202609012000_boss_route_rpcs.sql). The RPC itself enforces that
// the caller is the OPPONENT in that match (never the path owner,
// never a third party) and that the match is completed - this
// action just parses input, calls it, and revalidates. Used by the
// linear "tonight" game-night flow's Boss Progress Y/N step.
// =========================================================

export async function confirmBossAchievementEvent(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const matchId = String(
    formData.get(
      "match_id"
    ) ?? ""
  ).trim();

  const playerBossPathId = String(
    formData.get(
      "player_boss_path_id"
    ) ?? ""
  ).trim();

  const eventId = String(
    formData.get(
      "event_id"
    ) ?? ""
  ).trim();

  if (
    !matchId ||
    !playerBossPathId ||
    !eventId
  ) {
    throw new Error(
      "Invalid Boss achievement confirmation request."
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "confirm_boss_achievement_event",
    {
      target_match_id:
        matchId,
      target_player_boss_path_id:
        playerBossPathId,
      target_event_id:
        eventId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  revalidateBossPaths(
    playerBossPathId
  );

  revalidatePath(
    "/competitions"
  );
}
