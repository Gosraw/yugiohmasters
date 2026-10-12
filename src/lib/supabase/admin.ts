import { createClient } from "@supabase/supabase-js";

// =========================================================
// SERVICE-ROLE Supabase client. SERVER ONLY.
//
// Bypasses RLS and can call service_role-only RPCs (e.g.
// submit_game_run / reject_game_run). Only import this from
// server actions / route handlers, and only after the caller's
// identity was resolved from their own session (requireUser()).
// Never pass a profile id that came from the client.
//
// The `server-only` package is not installed, so guard at
// runtime: this module must never execute in a browser bundle.
// =========================================================

if (typeof window !== "undefined") {
  throw new Error("src/lib/supabase/admin.ts must never be imported in client code.");
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (server-only env var)."
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
