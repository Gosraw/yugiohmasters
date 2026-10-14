"use server";

import {
  ENGINE_VERSION,
  PEAKS_GAME,
  validatePeaksRun,
} from "@/lib/games/peaks-engine";

import {
  getOpenMiniGameRun,
  startMiniGameRun,
  submitReplayedRun,
  type ResumeGameRunResult,
  type StartGameRunResult,
  type SubmitGameRunResult,
} from "@/lib/games/server-runs";

// =========================================================
// GIZA PEAKS actions. Called straight from the client game
// component (no redirect, no reload in the middle of a run).
//
// The browser sends only its action log + the score it saw;
// submitPeaksRun() replays the whole run on the server with
// src/lib/games/peaks-engine.ts and stores only the REPLAYED
// score (src/lib/games/server-runs.ts).
// =========================================================

export async function startPeaksRun(
  mode: string
): Promise<StartGameRunResult> {
  return startMiniGameRun(
    PEAKS_GAME,
    ENGINE_VERSION,
    mode
  );
}

export async function getPeaksRunSeed(
  runId: string
): Promise<ResumeGameRunResult> {
  return getOpenMiniGameRun(
    PEAKS_GAME,
    ENGINE_VERSION,
    runId
  );
}

export async function submitPeaksRun(
  runId: string,
  claimedScore: number,
  inputs: unknown
): Promise<SubmitGameRunResult> {
  return submitReplayedRun({
    game: PEAKS_GAME,
    engineVersion: ENGINE_VERSION,
    runId,
    claimedScore,
    inputs,
    validate: validatePeaksRun,
    paths: [
      "/games/peaks",
      "/games",
    ],
  });
}
