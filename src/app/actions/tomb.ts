"use server";

import {
  ENGINE_VERSION,
  TOMB_GAME,
  validateTombRun,
} from "@/lib/games/tomb-engine";

import {
  getOpenMiniGameRun,
  startMiniGameRun,
  submitReplayedRun,
  type ResumeGameRunResult,
  type StartGameRunResult,
  type SubmitGameRunResult,
} from "@/lib/games/server-runs";

// =========================================================
// TOMB BLOCKS actions. Called straight from the client game
// component (no redirect, no reload in the middle of a run).
//
// The browser sends only its move log + the score it saw;
// submitTombRun() replays every placement on the server with
// src/lib/games/tomb-engine.ts and stores only the REPLAYED
// score (src/lib/games/server-runs.ts).
// =========================================================

export async function startTombRun(
  mode: string
): Promise<StartGameRunResult> {
  return startMiniGameRun(
    TOMB_GAME,
    ENGINE_VERSION,
    mode
  );
}

export async function getTombRunSeed(
  runId: string
): Promise<ResumeGameRunResult> {
  return getOpenMiniGameRun(
    TOMB_GAME,
    ENGINE_VERSION,
    runId
  );
}

export async function submitTombRun(
  runId: string,
  claimedScore: number,
  inputs: unknown
): Promise<SubmitGameRunResult> {
  return submitReplayedRun({
    game: TOMB_GAME,
    engineVersion: ENGINE_VERSION,
    runId,
    claimedScore,
    inputs,
    validate: validateTombRun,
    paths: [
      "/games/tomb",
      "/games",
    ],
  });
}
