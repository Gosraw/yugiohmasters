"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

import {
  ENGINE_VERSION,
  validateRun,
} from "@/lib/games/climber-engine";

import {
  CLIMBER_GAME,
  loadLeaderboard,
} from "@/lib/games/climber-data";

// =========================================================
// MINI GAME ACTIONS (Pyramid Climb)
//
// Called straight from the client game component (no redirect,
// no page reload in the middle of a run).
//
// Anti-cheat: the browser only sends its recorded steering
// inputs plus the score it saw. submitClimberRun() replays the
// whole run on the server with the SAME deterministic engine
// (src/lib/games/climber-engine.ts) and only stores the score the
// replay produced. A run whose replay does not match is stored
// as rejected (a daily attempt stays spent).
// =========================================================

export type StartRunResult =
  | {
      ok: true;
      runId: string;
      seed: string;
      mode: "daily" | "practice";
    }
  | {
      ok: false;
      error: string;
    };

export type SubmitRunResult =
  | {
      ok: true;
      score: number;
      mode: "daily" | "practice";
      place: number | null;
      players: number;
      best: number | null;
    }
  | {
      ok: false;
      error: string;
    };

function cleanError(
  message: string | undefined
) {
  if (!message) {
    return "Something went wrong. Try again.";
  }

  return message.replace(
    /^.*?ERROR:\s*/,
    ""
  );
}

export async function startClimberRun(
  mode: string
): Promise<StartRunResult> {
  if (
    mode !== "daily" &&
    mode !== "practice"
  ) {
    return {
      ok: false,
      error: "Unknown mode.",
    };
  }

  const {
    supabase,
  } = await requireUser();

  const {
    data,
    error,
  } = await supabase.rpc(
    "start_game_run",
    {
      target_game: CLIMBER_GAME,
      target_mode: mode,
      target_engine_version: ENGINE_VERSION,
    }
  );

  const row =
    (data as {
      run_id: string;
      run_seed: string;
    }[] | null)?.[0];

  if (
    error ||
    !row
  ) {
    return {
      ok: false,
      error: cleanError(error?.message),
    };
  }

  return {
    ok: true,
    runId: row.run_id,
    seed: row.run_seed,
    mode,
  };
}

/** Seed of one of your own open runs (resume after the tab was killed). */
export async function getClimberRunSeed(
  runId: string
): Promise<
  | {
      ok: true;
      seed: string;
      mode: "daily" | "practice";
    }
  | {
      ok: false;
      error: string;
    }
> {
  const {
    supabase,
  } = await requireUser();

  const {
    data,
  } = await supabase.rpc(
    "get_my_game_run",
    {
      target_run_id: runId,
    }
  );

  const run =
    (data as {
      run_seed: string;
      run_mode: "daily" | "practice";
      run_status: string;
      run_engine_version: number;
    }[] | null)?.[0];

  if (
    !run ||
    run.run_status !== "started" ||
    run.run_engine_version !== ENGINE_VERSION
  ) {
    return {
      ok: false,
      error: "This run can no longer be resumed.",
    };
  }

  return {
    ok: true,
    seed: run.run_seed,
    mode: run.run_mode,
  };
}

export async function submitClimberRun(
  runId: string,
  claimedScore: number,
  inputs: unknown
): Promise<SubmitRunResult> {
  if (
    typeof runId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(runId)
  ) {
    return {
      ok: false,
      error: "Unknown run.",
    };
  }

  const {
    supabase,
    userId,
  } = await requireUser();

  const {
    data: runData,
    error: runError,
  } = await supabase.rpc(
    "get_my_game_run",
    {
      target_run_id: runId,
    }
  );

  const run =
    (runData as {
      run_seed: string;
      run_mode: "daily" | "practice";
      run_status: string;
      run_engine_version: number;
      run_day: string;
      run_iso_week: string;
    }[] | null)?.[0];

  if (
    runError ||
    !run
  ) {
    return {
      ok: false,
      error: "Run not found.",
    };
  }

  if (run.run_status !== "started") {
    return {
      ok: false,
      error: "This run was already submitted.",
    };
  }

  const ticks =
    typeof inputs === "object" &&
    inputs !== null &&
    typeof (inputs as { ticks?: unknown }).ticks === "number"
      ? (inputs as { ticks: number }).ticks
      : 0;

  // The engine version is fixed at start; a stale tab replaying an
  // older engine would never match, so say so plainly.
  const verdict =
    run.run_engine_version !== ENGINE_VERSION
      ? {
          ok: false as const,
          reason: "The game was updated during your run.",
        }
      : validateRun(
          run.run_seed,
          inputs,
          claimedScore
        );

  if (!verdict.ok) {
    // Service-role only RPC: the profile id is the SESSION user,
    // never anything the client sent.
    await createAdminClient().rpc(
      "reject_game_run",
      {
        p_profile_id: userId,
        target_run_id: runId,
        target_reason: verdict.reason,
        target_ticks: Number.isInteger(ticks) ? ticks : null,
        target_inputs: typeof inputs === "object" ? inputs : null,
      }
    );

    revalidatePath("/games/climber");

    return {
      ok: false,
      error: `Run not counted: ${verdict.reason}`,
    };
  }

  const {
    data: submitData,
    error: submitError,
  } = await createAdminClient().rpc(
    "submit_game_run",
    {
      p_profile_id: userId,
      target_run_id: runId,
      target_score: verdict.score,
      target_ticks: verdict.ticks,
      target_inputs: inputs,
    }
  );

  const submitted =
    (submitData as {
      run_status: string;
      run_reject_reason: string | null;
    }[] | null)?.[0];

  if (
    submitError ||
    !submitted
  ) {
    return {
      ok: false,
      error: cleanError(submitError?.message),
    };
  }

  revalidatePath("/games/climber");

  revalidatePath("/games");

  if (submitted.run_status !== "validated") {
    return {
      ok: false,
      error: `Run not counted: ${submitted.run_reject_reason ?? "rejected"}`,
    };
  }

  const board =
    await loadLeaderboard(
      supabase,
      run.run_mode === "daily"
        ? "day"
        : "week",
      run.run_mode === "daily"
        ? run.run_day
        : run.run_iso_week
    );

  const mine =
    board.find(
      (row) => row.profileId === userId
    );

  return {
    ok: true,
    score: verdict.score,
    mode: run.run_mode,
    place: mine?.place ?? null,
    players: board.length,
    best: mine?.score ?? null,
  };
}
