"use client";

import { useEffect } from "react";

// =========================================================
// SCROLL POSITION MEMORY
//
// Next.js App Router navigation (Link, router.push) never
// unloads the document, so `pagehide`/`beforeunload` alone
// miss the common "tap a card, come back" round trip - those
// only fire on a real tab close or full page reload. What
// DOES fire reliably on a client-side route change is this
// component's own unmount, since navigating away swaps out
// the whole page's component tree. We save on unmount (plus
// pagehide/visibilitychange as a backstop for real unloads,
// e.g. iOS Safari suspending the tab) and restore on mount,
// keyed by whatever the caller says uniquely identifies "this
// exact filtered view" (e.g. the active query string) so a
// restored scroll position only ever applies to the same
// filters/search/sort the player actually scrolled through.
// =========================================================

const SCROLL_KEY_PREFIX = "duelist-scroll:";

export function ScrollPositionMemory({
  scrollKey,
}: {
  scrollKey: string;
}) {
  useEffect(() => {
    const storageKey = SCROLL_KEY_PREFIX + scrollKey;

    function save() {
      try {
        window.sessionStorage.setItem(
          storageKey,
          String(window.scrollY)
        );
      } catch {
        // sessionStorage can throw in private browsing contexts -
        // scroll memory is a nice-to-have, never worth breaking the
        // page over.
      }
    }

    try {
      const saved = window.sessionStorage.getItem(storageKey);

      if (saved) {
        const y = Number(saved);

        if (Number.isFinite(y) && y > 0) {
          // Card tiles/images are still laying out on first paint -
          // wait a frame so the restored position lands after that
          // settles instead of getting immediately overwritten.
          requestAnimationFrame(() => {
            window.scrollTo(0, y);
          });
        }
      }
    } catch {
      // Ignore - see save() above.
    }

    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", save);

    return () => {
      save();
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", save);
    };
  }, [scrollKey]);

  return null;
}
