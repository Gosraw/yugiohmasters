"use server";

import {
  ENGINE_VERSION,
  OBELISK_GAME,
  validateObeliskRun,
} from "@/lib/games/obelisk-engine";

import {
  getOpenMiniGameRun,
  startMiniGameRun,
  submitReplayedRun,
  type ResumeGameRunResult,
  type StartGameRunResult,
  type SubmitGameRunResult,
} from "@/lib/games/server-runs";

// =========================================================
// OBELISK RUSH actions. Called straight from the client game
// component (no redirect, no reload in the middle of a run).
//
// The browser sends only its strike log + the score it saw;
// submitObeliskRun() replays the whole run on the server with
// src/lib/games/obelisk-engine.ts and stores only the REPLAYED
// score (src/lib/games/server-runs.ts).
// =========================================================

export async function startObeliskRun(
  mode: string
): Promise<StartGameRunResult> {
  return startMiniGameRun(
    OBELISK_GAME,
    ENGINE_VERSION,
    mode
  );
}

export async function getObeliskRunSeed(
  runId: string
): Promise<ResumeGameRunResult> {
  return getOpenMiniGameRun(
    OBELISK_GAME,
    ENGINE_VERSION,
    runId
  );
}

export async function submitObeliskRun(
  runId: string,
  claimedScore: number,
  inputs: unknown
): Promise<SubmitGameRunResult> {
  return submitReplayedRun({
    game: OBELISK_GAME,
    engineVersion: ENGINE_VERSION,
    runId,
    claimedScore,
    inputs,
    validate: validateObeliskRun,
    paths: [
      "/games/obelisk",
      "/games",
    ],
  });
}
