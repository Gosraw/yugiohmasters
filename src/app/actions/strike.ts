"use server";

import {
  ENGINE_VERSION,
  STRIKE_GAME,
  validateStrikeRun,
} from "@/lib/games/strike-engine";

import {
  getOpenMiniGameRun,
  startMiniGameRun,
  submitReplayedRun,
  type ResumeGameRunResult,
  type StartGameRunResult,
  type SubmitGameRunResult,
} from "@/lib/games/server-runs";

// =========================================================
// MILLENNIUM STRIKE actions. Called straight from the client game
// component (no redirect, no reload in the middle of a run).
//
// The browser sends only its throw log + the score it saw;
// submitStrikeRun() replays the whole run on the server with
// src/lib/games/strike-engine.ts and stores only the REPLAYED
// score (src/lib/games/server-runs.ts).
// =========================================================

export async function startStrikeRun(
  mode: string
): Promise<StartGameRunResult> {
  return startMiniGameRun(
    STRIKE_GAME,
    ENGINE_VERSION,
    mode
  );
}

export async function getStrikeRunSeed(
  runId: string
): Promise<ResumeGameRunResult> {
  return getOpenMiniGameRun(
    STRIKE_GAME,
    ENGINE_VERSION,
    runId
  );
}

export async function submitStrikeRun(
  runId: string,
  claimedScore: number,
  inputs: unknown
): Promise<SubmitGameRunResult> {
  return submitReplayedRun({
    game: STRIKE_GAME,
    engineVersion: ENGINE_VERSION,
    runId,
    claimedScore,
    inputs,
    validate: validateStrikeRun,
    paths: [
      "/games/strike",
      "/games",
    ],
  });
}
