"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { normalizeUsername, usernameToAuthEmail } from "@/lib/auth/username";

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
  if (!parsed.success) return { error: "Controleer je username en password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToAuthEmail(parsed.data.username),
    password: parsed.data.password,
  });

  if (error) return { error: "Login mislukt. Controleer je gegevens." };
  redirect("/");
}

export async function signup(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Username: 3-24 tekens. Password: minimaal 8 tekens." };
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
        ? "Deze username bestaat al."
        : "Account aanmaken mislukt.",
    };
  }

  // Season 1: the mandatory onboarding gate in src/lib/supabase/proxy.ts
  // takes over from here (Boss Path selection, then the Initial
  // Draft) - it fires on the very next authenticated request no
  // matter what path is requested, so landing on / is enough.
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
