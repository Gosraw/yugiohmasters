#!/usr/bin/env node
// One command for the whole LOCAL test stack:
//
//   npm run devstack
//
// 1. starts the local Postgres (creates + fills it on first run),
// 2. starts the Supabase stand-in API (gateway.mjs) on :54321,
// 3. starts the app (dev.mjs) on :3100.
//
// Anything already running is reused. Ctrl+C stops what this script
// started. Never touches production.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";

import { start as startDb } from "./db.mjs";
import { GATEWAY_PORT } from "./keys.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const APP_PORT = 3100;

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");

    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

const children = [];

function run(script, args = []) {
  const child = spawn(process.execPath, [path.join(import.meta.dirname, script), ...args], {
    cwd: ROOT,
    stdio: "inherit",
  });

  children.push(child);

  return child;
}

function stopAll() {
  for (const child of children) {
    child.kill("SIGINT");
  }
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});

if (existsSync(path.join(ROOT, ".devstack/pg"))) {
  startDb();
  console.log("✓ database running (127.0.0.1:54322)");
} else {
  console.log("First run: building the test database (takes a minute)...");

  await new Promise((resolve, reject) => {
    run("db.mjs", ["reset"]).on("exit", (code) => (code === 0 ? resolve() : reject(new Error("db reset failed"))));
  });
}

if (await isPortOpen(GATEWAY_PORT)) {
  console.log(`✓ API already running (127.0.0.1:${GATEWAY_PORT})`);
} else {
  run("gateway.mjs");
}

if (await isPortOpen(APP_PORT)) {
  console.log(`✓ app already running: http://localhost:${APP_PORT}`);
} else {
  run("dev.mjs", [String(APP_PORT)]);
  console.log(`→ app starting: http://localhost:${APP_PORT} (log in as bossg, see scripts/devstack/test-users.json)`);
}

if (children.length === 0) {
  console.log("Everything was already running. Nothing to start.");
}
