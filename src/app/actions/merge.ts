"use server";

import {
  ENGINE_VERSION,
  MERGE_GAME,
  validateMergeRun,
} from "@/lib/games/merge-engine";

import {
  getOpenMiniGameRun,
  startMiniGameRun,
  submitReplayedRun,
  type ResumeGameRunResult,
  type StartGameRunResult,
  type SubmitGameRunResult,
} from "@/lib/games/server-runs";

// =========================================================
// MERGE OF RA actions. Called straight from the client game
// component (no redirect, no reload in the middle of a run).
//
// The browser sends only its input log + the score it saw;
// submitMergeRun() replays the whole run on the server with
// src/lib/games/merge-engine.ts and stores only the REPLAYED
// score (src/lib/games/server-runs.ts).
// =========================================================

export async function startMergeRun(
  mode: string
): Promise<StartGameRunResult> {
  return startMiniGameRun(
    MERGE_GAME,
    ENGINE_VERSION,
    mode
  );
}

export async function getMergeRunSeed(
  runId: string
): Promise<ResumeGameRunResult> {
  return getOpenMiniGameRun(
    MERGE_GAME,
    ENGINE_VERSION,
    runId
  );
}

export async function submitMergeRun(
  runId: string,
  claimedScore: number,
  inputs: unknown
): Promise<SubmitGameRunResult> {
  return submitReplayedRun({
    game: MERGE_GAME,
    engineVersion: ENGINE_VERSION,
    runId,
    claimedScore,
    inputs,
    validate: validateMergeRun,
    paths: [
      "/games/merge",
      "/games",
    ],
  });
}
