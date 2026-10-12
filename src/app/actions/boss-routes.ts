"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  redirect,
} from "next/navigation";

import {
  withFeedback,
} from "@/lib/safe-return-to";

import {
  requireUser,
} from "@/lib/supabase/queries";

// =========================================================
// BOSS ROUTE ACTIONS (task 142)
//
// Thin server-action wrappers around the SECURITY DEFINER RPCs
// added in 202609012000_boss_route_rpcs.sql. All the real rules
// (idempotency, DP prices from the database, in-order stage
// progression) live in the database - these actions only parse
// form input, call the RPC, and redirect with a friendly message.
// 2.0: Boss evolution is DP only; the achievement-confirmation
// action is gone (migration 202610120130).
// =========================================================

// Failures go back to the page the form was on with a friendly
// ?error= banner instead of crashing into the error page.
function failTo(
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
    failTo(
      "/boss/select?slot=1",
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

  if (error || !pathId) {
    failTo(
      "/boss/select?slot=1",
      error?.message ??
        "Could not choose this Boss Route."
    );
  }

  revalidateBossPaths(
    pathId
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
    failTo(
      "/boss",
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

  if (error || !pathId) {
    failTo(
      `/boss/select?slot=${routeSlot}`,
      error?.message ??
        "Could not unlock this Boss Route slot."
    );
  }

  revalidateBossPaths(
    pathId
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
    failTo(
      pathId
        ? `/boss/${encodeURIComponent(pathId)}`
        : "/boss",
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
    failTo(
      `/boss/${encodeURIComponent(pathId)}`,
      error.message
    );
  }

  revalidateBossPaths(pathId);

  redirect(
    `/boss/${pathId}?evolved=${stageNumber}&success=${encodeURIComponent(`Evolved to Stage ${stageNumber}!`)}`
  );
}
