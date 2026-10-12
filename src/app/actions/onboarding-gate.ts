"use server";

import {
  cookies,
} from "next/headers";

import {
  ONBOARDED_COOKIE,
} from "@/lib/onboarded-cookie";

// Clears the proxy's "already onboarded" shortcut cookie so the next
// request runs the full membership / onboarding gate again. Called by
// <OnboardedCookieReset /> when (app)/layout.tsx sees the cookie no
// longer matches the player's league or the current season.
export async function resetOnboardedCookie() {
  const cookieStore =
    await cookies();

  cookieStore.delete(
    ONBOARDED_COOKIE
  );
}
