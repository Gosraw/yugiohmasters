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
  loadGameLeaderboard,
} from "./mini-game-data";

// =========================================================
// SERVER ONLY. Shared start / resume / replay-submit flow for
// catalog mini games (the same steps src/app/actions/games.ts does
// for Pyramid Climb), so a new game's server actions are a few
// lines: pass the game key, engine version and its pure
// validate(seed, inputs, claimedScore) replay function.
//
// Anti-cheat: the browser only sends its recorded inputs plus the
// score it saw. The run is replayed here with the SAME
// deterministic engine and only the REPLAYED score is stored, via
// the service-role-only submit_game_run / reject_game_run (the
// profile id is always the session user from requireUser()).
// =========================================================

if (typeof window !== "undefined") {
  throw new Error("src/lib/games/server-runs.ts must never be imported in client code.");
}

export type RunMode =
  | "daily"
  | "practice";

export type StartGameRunResult =
  | {
      ok: true;
      runId: string;
      seed: string;
      mode: RunMode;
      startedAt: number;
    }
  | {
      ok: false;
      error: string;
    };

export type ResumeGameRunResult =
  | {
      ok: true;
      seed: string;
      mode: RunMode;
    }
  | {
      ok: false;
      error: string;
    };

export type SubmitGameRunResult =
  | {
      ok: true;
      score: number;
      mode: RunMode;
      place: number | null;
      players: number;
      best: number | null;
    }
  | {
      ok: false;
      error: string;
    };

export type ReplayVerdict =
  | {
      ok: true;
      score: number;
      ticks: number;
    }
  | {
      ok: false;
      reason: string;
    };

type MyRunRow = {
  run_game: string;
  run_seed: string;
  run_mode: RunMode;
  run_status: string;
  run_engine_version: number;
  run_day: string;
  run_iso_week: string;
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

export function isRunId(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f-]{36}$/i.test(value)
  );
}

export async function startMiniGameRun(
  game: string,
  engineVersion: number,
  mode: unknown
): Promise<StartGameRunResult> {
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
      target_game: game,
      target_mode: mode,
      target_engine_version: engineVersion,
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
    startedAt: Date.now(),
  };
}

/** Seed of one of your own open runs of this game (resume). */
export async function getOpenMiniGameRun(
  game: string,
  engineVersion: number,
  runId: unknown
): Promise<ResumeGameRunResult> {
  if (!isRunId(runId)) {
    return {
      ok: false,
      error: "Unknown run.",
    };
  }

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
    (data as MyRunRow[] | null)?.[0];

  if (
    !run ||
    run.run_game !== game ||
    run.run_status !== "started" ||
    run.run_engine_version !== engineVersion
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

export async function submitReplayedRun(
  options: {
    game: string;
    engineVersion: number;
    runId: unknown;
    claimedScore: unknown;
    inputs: unknown;
    validate: (
      seed: string,
      inputs: unknown,
      claimedScore: number
    ) => ReplayVerdict;
    paths: string[];
  }
): Promise<SubmitGameRunResult> {
  const {
    game,
    engineVersion,
    runId,
    claimedScore,
    inputs,
    validate,
    paths,
  } = options;

  if (!isRunId(runId)) {
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
    (runData as MyRunRow[] | null)?.[0];

  // Only this game's runs: replaying another game's run id with
  // this engine would put this game's score on that game's board.
  if (
    runError ||
    !run ||
    run.run_game !== game
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

  const verdict: ReplayVerdict =
    run.run_engine_version !== engineVersion
      ? {
          ok: false,
          reason: "The game was updated during your run.",
        }
      : typeof claimedScore !== "number"
        ? {
            ok: false,
            reason: "Impossible score.",
          }
        : validate(
            run.run_seed,
            inputs,
            claimedScore
          );

  const refresh = () => {
    for (const path of paths) {
      revalidatePath(path);
    }
  };

  if (!verdict.ok) {
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

    refresh();

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

  refresh();

  if (submitted.run_status !== "validated") {
    return {
      ok: false,
      error: `Run not counted: ${submitted.run_reject_reason ?? "rejected"}`,
    };
  }

  const board =
    await loadGameLeaderboard(
      supabase,
      game,
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
