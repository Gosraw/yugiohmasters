"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { normalizeUsername, usernameToAuthEmail } from "@/lib/auth/username";
import { onboardingRedirectPath } from "@/lib/supabase/onboarding-gate";

export type AuthActionState = { error?: string };

const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
});

export async function login(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check your username and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToAuthEmail(parsed.data.username),
    password: parsed.data.password,
  });

  if (error) return { error: "Login failed. Check your username and password." };

  // A Server Action redirect renders "/" in this same response
  // without passing the proxy, so send a not-yet-onboarded player
  // straight to their onboarding step here.
  redirect((await onboardingRedirectPath(supabase, data.user.id)) ?? "/");
}

export async function signup(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Username: 3-24 characters. Password: at least 8 characters." };
  }

  const username = normalizeUsername(parsed.data.username);
  const supabase = await createClient();
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
  await supabase.auth.signOut();
  redirect("/login");
}
