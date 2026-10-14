"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { normalizeUsername, usernameToAuthEmail } from "@/lib/auth/username";
import { onboardingRedirectPath } from "@/lib/supabase/onboarding-gate";

// username: echoed back on an error so the form can keep it filled in
// (React 19 resets a form after its action; the password may clear).
export type AuthActionState = { error?: string; username?: string };

const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
});

export async function login(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const typedUsername = String(formData.get("username") ?? "").trim().slice(0, 24);
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check your username and password.", username: typedUsername };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToAuthEmail(parsed.data.username),
    password: parsed.data.password,
  });

  if (error) return { error: "Login failed. Check your username and password.", username: typedUsername };

  // A Server Action redirect renders "/" in this same response
  // without passing the proxy, so send a not-yet-onboarded player
  // straight to their onboarding step here.
  redirect((await onboardingRedirectPath(supabase, data.user.id)) ?? "/");
}

export async function signup(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const typedUsername = String(formData.get("username") ?? "").trim().slice(0, 24);
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const usernameIssues = parsed.error.issues.filter((issue) => issue.path[0] === "username");
    if (usernameIssues.some((issue) => issue.code === "invalid_format")) {
      return { error: "Username can only use letters (a-z), numbers, _ and - (no spaces or other symbols).", username: typedUsername };
    }
    if (usernameIssues.length > 0) return { error: "Username must be 3-24 characters.", username: typedUsername };
    return { error: "Password must be at least 8 characters.", username: typedUsername };
  }

  const username = normalizeUsername(parsed.data.username);
  const supabase = await createClient();

  // The private league holds 3 players. Check BEFORE creating the
  // account, so a 4th person never ends up with a login but no
  // league (202610121610_signup_league_capacity.sql).
  const { data: hasRoom, error: roomError } = await supabase.rpc("private_league_has_room");
  if (roomError) return { error: "Could not check the league right now. Try again in a moment.", username: typedUsername };
  if (hasRoom === false) {
    return { error: "This league is full (3 players). Ask the league admin if there is room for you.", username: typedUsername };
  }
  const { error } = await supabase.auth.signUp({
    email: usernameToAuthEmail(username),
    password: parsed.data.password,
    options: { data: { username, duelist_name: username } },
  });

  if (error) {
    return {
      error: error.message.includes("already")
        ? "This username is already taken."
        : "Could not create the account.",
      username: typedUsername,
    };
  }

  // Season 1 onboarding: a brand new player always starts at Boss
  // Path select (the proxy ensures league membership on that
  // request). Redirecting to "/" here would render Home in the same
  // Server Action response without passing the proxy's gate.
  redirect("/boss/select?slot=1");
}

export async function logout() {
  const supabase = await createClient();
  // "Log out on this device" (Profile): the default scope is
  // "global", which would also end the player's sessions on their
  // other phone/laptop.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
