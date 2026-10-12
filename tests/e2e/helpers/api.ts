import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import { passwordFor } from "./users";

// Calls the real RPCs AS a player (their own JWT), through the local
// devstack gateway - the same path the app's server actions take.

export const GATEWAY_URL = "http://127.0.0.1:54321";

// The anon key is derived from the devstack JWT secret in
// scripts/devstack/keys.mjs (kept as the single source of truth).
export function devstackAnonKey(): string {
  const keysFile = readFileSync(path.resolve(__dirname, "../../../scripts/devstack/keys.mjs"), "utf8");
  const secret = keysFile.match(/JWT_SECRET = "([^"]+)"/)?.[1];

  if (!secret) {
    throw new Error("Could not read JWT_SECRET from scripts/devstack/keys.mjs");
  }

  const b64 = (value: string) => Buffer.from(value).toString("base64url");
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify({ iss: "supabase-devstack", role: "anon", exp: 4102444800 }));
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");

  return `${header}.${body}.${signature}`;
}

export async function apiAs(username: string): Promise<SupabaseClient> {
  const supabase = createClient(GATEWAY_URL, devstackAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: `${username}@duelist.local`,
    password: passwordFor(username),
  });

  if (error) {
    throw new Error(`API sign-in as ${username} failed: ${error.message}`);
  }

  return supabase;
}

export async function rpcAs<T = unknown>(
  username: string,
  fn: string,
  args: Record<string, unknown> = {}
): Promise<{ data: T | null; error: string | null }> {
  const supabase = await apiAs(username);
  const { data, error } = await supabase.rpc(fn, args);

  return {
    data: (data as T | null) ?? null,
    error: error?.message ?? null,
  };
}

// After a DB reset PostgREST needs a moment to reconnect and reload
// its schema cache; wait until a real table answers.
export async function waitForRestApi(timeoutMs = 90_000) {
  const key = devstackAnonKey();
  const deadline = Date.now() + timeoutMs;
  let last = "";

  while (Date.now() < deadline) {
    const response = await fetch(`${GATEWAY_URL}/rest/v1/shop_pack_types?select=code&limit=1`, {
      headers: {
        apikey: key,
      },
    }).catch((error: Error) => ({ ok: false, status: 0, text: async () => error.message }));

    if (response.ok) {
      return;
    }

    last = `${response.status} ${await response.text()}`;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Local REST API not ready after reset: ${last}`);
}
