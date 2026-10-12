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

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  ENGINE_VERSION,
  normalizeGhosts,
  turnSeconds,
  validateRun,
  type GhostBoard,
} from "@/lib/games/autobattler/engine";

import {
  ghostTableFromRows,
  pickGhosts,
  type FrozenGhostRow,
} from "@/lib/games/autobattler/ghosts";

import {
  loadArenaBoards,
  type ArenaBoards,
} from "@/lib/games/autobattler/data";

// =========================================================
// SHADOW ARENA ACTIONS (auto battler)
//
// Called straight from the client game component (no redirect,
// no page reload in the middle of a run).
//
// Anti-cheat: the browser only sends its action log (buy, sell,
// move, refresh, ... end turn) plus the score it saw.
// submitArenaRun() replays the whole run on the server with the
// SAME deterministic engine and only stores the score the replay
// produced. Tampered logs (illegal actions, wrong seed, edited
// score) are stored as rejected; a daily attempt stays spent.
// It also checks the run did not take longer than the turn
// timers allow (the timer is what keeps it a strategy game
// instead of a "look it up" game).
//
// Ghosts (engine v2): startArenaRun() freezes one league-mate
// board per turn into the run (arena_run_ghosts, service role,
// picked by ghosts.ts from the run seed). The browser plays
// against exactly those; submitArenaRun() replays against the
// frozen rows from the DATABASE and, once the run validates,
// stores this run's boards (from the replay) as new ghosts.
// =========================================================

const ARENA_GAME = "auto_battler";

const ARENA_PATH = "/games/autobattler";

/** Combat playback + loading between turns, per turn (seconds). */
const COMBAT_ALLOWANCE = 30;

/** Extra slack for one interruption (phone call, reload). */
const RUN_SLACK = 10 * 60;

export type ArenaGhosts =
  (GhostBoard | null)[];

export type StartArenaResult =
  | {
      ok: true;
      runId: string;
      seed: string;
      mode: "daily" | "practice";
      ghosts: ArenaGhosts;
    }
  | {
      ok: false;
      error: string;
    };

export type SubmitArenaResult =
  | {
      ok: true;
      score: number;
      mode: "daily" | "practice";
      place: number | null;
      players: number;
      best: number | null;
      boards: ArenaBoards;
    }
  | {
      ok: false;
      error: string;
      boards: ArenaBoards | null;
    };

type MyRunRow = {
  run_seed: string;
  run_game: string;
  run_mode: "daily" | "practice";
  run_status: string;
  run_engine_version: number;
  run_day: string;
  run_iso_week: string;
  run_started_at: string;
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

/** The ghosts frozen into one of your runs (RLS: own runs only). */
async function loadRunGhosts(
  supabase: SupabaseClient,
  runId: string
): Promise<ArenaGhosts | null> {
  const {
    data,
    error,
  } = await supabase
    .from("arena_run_ghosts")
    .select("turn, snapshot_id, ghost_name, board")
    .eq("run_id", runId);

  if (error) {
    return null;
  }

  return ghostTableFromRows(
    (data ?? []) as FrozenGhostRow[]
  );
}

/**
 * Pick + freeze league-mates' boards for a fresh run. Never blocks
 * the run: on any problem it simply has no ghosts (Boss waves).
 * The frozen rows are read back, so browser and replay agree.
 */
async function freezeGhosts(
  supabase: SupabaseClient,
  userId: string,
  runId: string,
  seed: string
): Promise<ArenaGhosts> {
  try {
    const admin =
      createAdminClient();

    const {
      data,
      error,
    } = await admin.rpc(
      "arena_ghost_candidates",
      {
        p_profile_id: userId,
        target_run_id: runId,
      }
    );

    const candidates =
      (data ?? []) as {
        snapshot_id: string;
        profile_id: string;
        duelist_name: string;
        turn: number;
      }[];

    if (
      !error &&
      candidates.length > 0
    ) {
      const picks =
        pickGhosts(
          seed,
          candidates.map(
            (row) => ({
              snapshotId: row.snapshot_id,
              profileId: row.profile_id,
              name: row.duelist_name,
              turn: row.turn,
            })
          )
        );

      if (picks.length > 0) {
        await admin.rpc(
          "assign_arena_ghosts",
          {
            p_profile_id: userId,
            target_run_id: runId,
            target_ghosts: picks.map(
              (pick) => ({
                turn: pick.turn,
                snapshot_id: pick.snapshotId,
              })
            ),
          }
        );
      }
    }
  } catch (error) {
    console.error("Shadow Arena: could not assign ghosts", error);
  }

  return (
    await loadRunGhosts(
      supabase,
      runId
    )
  ) ?? normalizeGhosts([]);
}

function isRunId(
  runId: unknown
): runId is string {
  return (
    typeof runId === "string" &&
    /^[0-9a-f-]{36}$/i.test(runId)
  );
}

export async function startArenaRun(
  mode: string
): Promise<StartArenaResult> {
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
    userId,
  } = await requireUser();

  const {
    data,
    error,
  } = await supabase.rpc(
    "start_game_run",
    {
      target_game: ARENA_GAME,
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
    ghosts: await freezeGhosts(
      supabase,
      userId,
      row.run_id,
      row.run_seed
    ),
  };
}

/** Seed of one of your own open runs (resume after the tab was closed). */
export async function resumeArenaRun(
  runId: string
): Promise<
  | {
      ok: true;
      seed: string;
      mode: "daily" | "practice";
      ghosts: ArenaGhosts;
    }
  | {
      ok: false;
      error: string;
    }
> {
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
    run.run_game !== ARENA_GAME ||
    run.run_status !== "started" ||
    run.run_engine_version !== ENGINE_VERSION
  ) {
    return {
      ok: false,
      error: "This run can no longer be resumed.",
    };
  }

  const ghosts =
    await loadRunGhosts(
      supabase,
      runId
    );

  if (!ghosts) {
    return {
      ok: false,
      error: "Could not load your opponents. Try again.",
    };
  }

  return {
    ok: true,
    seed: run.run_seed,
    mode: run.run_mode,
    ghosts,
  };
}

export async function submitArenaRun(
  runId: string,
  claimedScore: number,
  log: unknown
): Promise<SubmitArenaResult> {
  if (!isRunId(runId)) {
    return {
      ok: false,
      error: "Unknown run.",
      boards: null,
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

  if (
    runError ||
    !run ||
    run.run_game !== ARENA_GAME
  ) {
    return {
      ok: false,
      error: "Run not found.",
      boards: null,
    };
  }

  if (run.run_status !== "started") {
    return {
      ok: false,
      error: "This run was already submitted.",
      boards: await loadArenaBoards(supabase),
    };
  }

  const safeLog =
    typeof log === "object" &&
    log !== null &&
    JSON.stringify(log).length <= 200000
      ? log
      : null;

  // The ghosts this run was frozen with (from the database,
  // never from the browser). A failed read is retryable.
  const ghosts =
    await loadRunGhosts(
      supabase,
      runId
    );

  if (!ghosts) {
    return {
      ok: false,
      error: "Could not reach the server. Check your connection and retry.",
      boards: null,
    };
  }

  let verdict: ReturnType<typeof validateRun> =
    run.run_engine_version !== ENGINE_VERSION
      ? {
          ok: false as const,
          reason: "The game was updated during your run.",
        }
      : validateRun(
          run.run_seed,
          safeLog,
          Number.isInteger(claimedScore) ? claimedScore : -1,
          ghosts
        );

  // Time sanity: a run can't take (much) longer than its turn
  // timers plus combat playback allow.
  if (verdict.ok) {
    let allowed =
      RUN_SLACK;

    for (let turn = 1; turn <= verdict.turns; turn++) {
      allowed += turnSeconds(turn) + COMBAT_ALLOWANCE;
    }

    const elapsed =
      (Date.now() - new Date(run.run_started_at).getTime()) / 1000;

    if (elapsed > allowed) {
      verdict = {
        ok: false,
        reason: "The run took longer than the turn timers allow.",
      };
    }
  }

  if (!verdict.ok) {
    // Service-role only RPC: the profile id is the SESSION user,
    // never anything the client sent.
    await createAdminClient().rpc(
      "reject_game_run",
      {
        p_profile_id: userId,
        target_run_id: runId,
        target_reason: verdict.reason,
        target_ticks: null,
        target_inputs: safeLog,
      }
    );

    revalidatePath(ARENA_PATH);

    return {
      ok: false,
      error: `Run not counted: ${verdict.reason}`,
      boards: await loadArenaBoards(supabase),
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
      // "Ticks" for the shared real-time sanity check: at least
      // ~2 seconds per turn must have passed.
      target_ticks: verdict.turns * 120,
      target_inputs: safeLog,
    }
  );

  const submitted =
    (submitData as {
      run_status: string;
      run_reject_reason: string | null;
    }[] | null)?.[0];

  revalidatePath(ARENA_PATH);

  revalidatePath("/games");

  const boards =
    await loadArenaBoards(supabase);

  if (
    submitError ||
    !submitted
  ) {
    return {
      ok: false,
      error: cleanError(submitError?.message),
      boards,
    };
  }

  if (submitted.run_status !== "validated") {
    return {
      ok: false,
      error: `Run not counted: ${submitted.run_reject_reason ?? "rejected"}`,
      boards,
    };
  }

  // This run's boards (from OUR replay) become ghosts for friends.
  const {
    error: snapshotError,
  } = await createAdminClient().rpc(
    "record_arena_snapshots",
    {
      p_profile_id: userId,
      target_run_id: runId,
      target_snapshots: verdict.snapshots.map(
        (snapshot) => ({
          turn: snapshot.turn,
          board: {
            units: snapshot.units,
          },
        })
      ),
    }
  );

  if (snapshotError) {
    console.error("Shadow Arena: could not store ghosts", snapshotError.message);
  }

  const board =
    run.run_mode === "daily"
      ? boards.day
      : boards.weekBoard;

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
    boards,
  };
}
