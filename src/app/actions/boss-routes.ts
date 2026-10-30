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

import {
  loadWheelRoutes,
  type WheelRoute,
} from "@/lib/boss-wheel";

// =========================================================
// BOSS ROUTE ACTIONS (task 142)
//
// Thin server-action wrappers around the SECURITY DEFINER RPCs
// added in 202609012000_boss_route_rpcs.sql (first route: the wheel,
// 202610301400_boss_route_wheel.sql). All the real rules
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
// SPIN THE BOSS PATH WHEEL (first route, free, random)
//
// 2.0 (migration 202610301400): the first Boss Path is not chosen.
// spin_boss_path_wheel picks a random route nobody in the league
// holds yet, creates the path and grants Stage 1 - all on the
// server, once. Calling it again returns the same route. This
// action does not redirect: the wheel on /boss/select stays on
// screen, spins and lands on the route returned here, then reveals
// it. No revalidatePath either - that would re-render the page in
// the middle of the spin, and every page that shows Boss Paths is
// rendered per request anyway.
// =========================================================

export type SpinWheelState =
  | {
      status: "idle";
    }
  | {
      status: "spun";
      pathId: string;
      newlyAssigned: boolean;
      route: WheelRoute;
    }
  | {
      status: "error";
      message: string;
    };

type SpinResult = {
  player_boss_path_id: string;
  route_id: string;
  route_code: string;
  route_name: string;
  newly_assigned: boolean;
};

// Used through useActionState; the previous state and the (empty)
// form are not needed.
export async function spinBossPathWheel(): Promise<SpinWheelState> {
  const {
    supabase,
  } = await requireUser();

  const {
    data,
    error,
  } = await supabase.rpc(
    "spin_boss_path_wheel"
  );

  const result =
    data as SpinResult | null;

  if (
    error ||
    !result?.route_id
  ) {
    return {
      status: "error",
      message:
        error?.message ??
        "The wheel could not spin. Please try again.",
    };
  }

  const [
    route,
  ] = await loadWheelRoutes(
    supabase,
    [
      result.route_id,
    ]
  );

  if (!route) {
    return {
      status: "error",
      message:
        "Your Boss Path is set, but it could not be shown. Reload the page.",
    };
  }

  return {
    status: "spun",
    pathId:
      result.player_boss_path_id,
    newlyAssigned:
      result.newly_assigned,
    route,
  };
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
