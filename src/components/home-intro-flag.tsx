"use client";

import {
  useEffect,
} from "react";

// =========================================================
// HOME INTRO FLAG
//
// Home's cards stagger in (.dc-stagger) only on the first Home
// visit of a browser session. This remembers that it played:
// sessionStorage for hard reloads (read by the tiny inline
// script in the root layout before first paint), and
// html[data-home-seen] for in-app navigation. The attribute is
// set after the animation finishes so it never cuts it short.
// =========================================================

export const HOME_INTRO_KEY =
  "dc-home-intro";

// When the intro started in this tab (module scope, so React
// StrictMode's dev-only mount -> cleanup -> mount doesn't count
// as "left Home").
let introStartedAt:
  | number
  | null = null;

const INTRO_MS = 900;

export function HomeIntroFlag() {
  useEffect(() => {
    try {
      sessionStorage.setItem(
        HOME_INTRO_KEY,
        "1"
      );
    } catch {
      // Private mode / blocked storage: the intro may replay,
      // which is harmless.
    }

    if (introStartedAt === null) {
      introStartedAt =
        performance.now();
    }

    const startedAt =
      introStartedAt;

    const markSeen = () => {
      document.documentElement.dataset.homeSeen =
        "1";
    };

    const timer =
      setTimeout(
        markSeen,
        Math.max(
          0,
          startedAt +
            INTRO_MS -
            performance.now()
        )
      );

    return () => {
      clearTimeout(timer);

      // Really leaving Home (not StrictMode's instant re-run):
      // never replay the intro on the way back.
      if (
        performance.now() -
          startedAt >
        150
      ) {
        markSeen();
      }
    };
  }, []);

  return null;
}
