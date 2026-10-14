"use server";

import {
  ENGINE_VERSION,
  STACK_GAME,
  validateStackRun,
} from "@/lib/games/stack-engine";

import {
  getOpenMiniGameRun,
  startMiniGameRun,
  submitReplayedRun,
  type ResumeGameRunResult,
  type StartGameRunResult,
  type SubmitGameRunResult,
} from "@/lib/games/server-runs";

// =========================================================
// PYRAMID STACK actions. Called straight from the client game
// component (no redirect, no reload in the middle of a run).
//
// The browser sends only its tap log + the score it saw;
// submitStackRun() replays the whole run on the server with
// src/lib/games/stack-engine.ts and stores only the REPLAYED
// score (src/lib/games/server-runs.ts).
// =========================================================

export async function startStackRun(
  mode: string
): Promise<StartGameRunResult> {
  return startMiniGameRun(
    STACK_GAME,
    ENGINE_VERSION,
    mode
  );
}

export async function getStackRunSeed(
  runId: string
): Promise<ResumeGameRunResult> {
  return getOpenMiniGameRun(
    STACK_GAME,
    ENGINE_VERSION,
    runId
  );
}

export async function submitStackRun(
  runId: string,
  claimedScore: number,
  inputs: unknown
): Promise<SubmitGameRunResult> {
  return submitReplayedRun({
    game: STACK_GAME,
    engineVersion: ENGINE_VERSION,
    runId,
    claimedScore,
    inputs,
    validate: validateStackRun,
    paths: [
      "/games/stack",
      "/games",
    ],
  });
}
