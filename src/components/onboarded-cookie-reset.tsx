"use client";

import {
  useRouter,
} from "next/navigation";

import {
  useEffect,
  useRef,
} from "react";

import {
  resetOnboardedCookie,
} from "@/app/actions/onboarding-gate";

// Rendered by (app)/layout.tsx only when the "onboarded" cookie is
// stale (season reset, league changed). Clears it once and reloads
// the page data, so the proxy re-runs the league / onboarding gate
// right away instead of showing "No league found" for 15 minutes.
export function OnboardedCookieReset() {
  const router =
    useRouter();

  const started =
    useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }

    started.current =
      true;

    resetOnboardedCookie()
      .then(() =>
        router.refresh()
      )
      .catch(() => {
        // Worst case the cookie simply expires on its own.
      });
  }, [router]);

  return null;
}
