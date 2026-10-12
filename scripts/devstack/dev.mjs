#!/usr/bin/env node
// Runs `next dev` against the LOCAL devstack API instead of the
// production Supabase project in .env.local.
//
//   node scripts/devstack/dev.mjs [port]
//
// Next.js never lets .env files override variables that are already
// set in the process environment, so setting them here wins over
// .env.local. We still double-check before starting.

import { spawn } from "node:child_process";

import { ANON_KEY, GATEWAY_PORT, SERVICE_ROLE_KEY } from "./keys.mjs";

const port = process.argv[2] ?? "3100";

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${GATEWAY_PORT}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ANON_KEY,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SECRET_KEY: SERVICE_ROLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  // Keep the devstack build cache apart from the normal one.
  NEXT_DIST_DIR: ".next-devstack",
};

if (!env.NEXT_PUBLIC_SUPABASE_URL.startsWith("http://127.0.0.1:")) {
  throw new Error("Refusing to start: devstack must point at 127.0.0.1");
}

const child = spawn("npx", ["next", "dev", "-p", port], {
  env,
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));
