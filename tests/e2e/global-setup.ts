import { execFileSync } from "node:child_process";
import path from "node:path";

import type { FullConfig } from "@playwright/test";

import {
  waitForRestApi,
} from "./helpers/api";

import {
  closeDb,
  db,
} from "./helpers/db";

import {
  runSeedDemo,
} from "./helpers/seed";

import {
  PRESEEDED,
  USERNAMES,
} from "./helpers/users";

const ROOT = path.resolve(__dirname, "../..");
const GATEWAY_URL = "http://127.0.0.1:54321";

// Runs once before all specs:
//  1. refuses to run against anything but the local devstack;
//  2. wipes + rebuilds the local test database (skip with
//     E2E_SKIP_RESET=1 to keep the current state);
//  3. makes the local catalog playable and onboards bossg + samo via
//     the real RPCs. fardin stays fresh for onboarding.spec.
export default async function globalSetup(config: FullConfig) {
  const baseURL = String(config.projects[0]?.use?.baseURL ?? "");
  const host = new URL(baseURL).hostname;

  if (!["localhost", "127.0.0.1"].includes(host)) {
    throw new Error(`Test bots only run against a local app, not ${baseURL}`);
  }

  const health = await fetch(`${GATEWAY_URL}/auth/v1/health`).catch(() => null);

  if (!health?.ok) {
    throw new Error(
      `Local gateway not reachable at ${GATEWAY_URL} - start it: node scripts/devstack/gateway.mjs`
    );
  }

  if (process.env.E2E_SKIP_RESET !== "1") {
    console.log("[bots] resetting the LOCAL test database (127.0.0.1:54322)...");
    execFileSync("node", ["scripts/devstack/db.mjs", "reset"], {
      cwd: ROOT,
      stdio: "inherit",
    });

    // The season-1 deploy marks the three real usernames as "welcome
    // packs already claimed" (they got them by hand in production).
    // On a fresh test season they are new players, exactly like after
    // the 2.0 light reset, so clear that marker once, right after the
    // reset - never on a kept database, or they'd be granted twice.
    await db()`
      delete from public.season1_welcome_bonus_claims
      where profile_id in (select id from public.profiles where username = any(${USERNAMES}))
    `;
    await closeDb();
  }

  await waitForRestApi();

  // Playable catalog + bossg/samo onboarded through the real RPCs.
  runSeedDemo(PRESEEDED);
}
