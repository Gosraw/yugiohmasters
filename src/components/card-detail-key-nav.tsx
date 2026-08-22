"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// =========================================================
// CARD DETAIL KEYBOARD NAVIGATION
//
// Desktop-only convenience: ArrowLeft/ArrowRight walk the
// Previous/Next hrefs computed by the page (already scoped to
// the player's current Collection filter/search/sort context),
// Escape goes back. Renders nothing - this is pure behavior,
// mobile keeps its own on-screen buttons since there's no
// keyboard to bind to anyway.
// =========================================================

export function CardDetailKeyNav({
  prevHref,
  nextHref,
  backHref,
}: {
  prevHref: string | null;
  nextHref: string | null;
  backHref: string;
}) {
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Don't hijack arrow keys while the player is typing
      // somewhere (a search box, a textarea, etc).
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;

      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (event.key === "ArrowLeft" && prevHref) {
        router.push(prevHref);
      } else if (event.key === "ArrowRight" && nextHref) {
        router.push(nextHref);
      } else if (event.key === "Escape") {
        router.push(backHref);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [prevHref, nextHref, backHref, router]);

  return null;
}
