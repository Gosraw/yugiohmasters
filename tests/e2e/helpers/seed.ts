import { execFileSync } from "node:child_process";
import path from "node:path";

import { isOnboarded } from "./db";

const ROOT = path.resolve(__dirname, "../../..");

// Runs scripts/devstack/seed-demo.mjs in its own Node process (it is
// a native ES module; Playwright's TypeScript loader can't import it).
export function runSeedDemo(args: string[]) {
  execFileSync("node", ["scripts/devstack/seed-demo.mjs", ...args], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

// Fast-forwards anyone who hasn't finished onboarding (Boss Path +
// Initial Draft) via the real RPCs.
export async function ensureOnboarded(usernames: readonly string[]) {
  const missing: string[] = [];

  for (const username of usernames) {
    if (!(await isOnboarded(username))) {
      missing.push(username);
    }
  }

  if (missing.length) {
    runSeedDemo(missing);
  }
}

// claim_welcome_packs() as the player, standing in for
// src/lib/supabase/proxy.ts, which is meant to call it on every
// request but never runs (see README "Bugs found").
export function claimWelcomePacks(username: string) {
  runSeedDemo(["--welcome", username]);
}
