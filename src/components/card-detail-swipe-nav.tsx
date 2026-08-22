"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// =========================================================
// CARD DETAIL SWIPE NAVIGATION
//
// Mobile-only convenience mirroring CardDetailKeyNav's arrow-key
// behavior: swipe left/right on the card artwork to walk
// Previous/Next. On-screen buttons (see cards/[id]/page.tsx)
// always work regardless of this component - swipe is purely
// additive, never the only way to navigate.
//
// Deliberately conservative to avoid two real risks:
//
// 1. iOS Safari's edge-swipe-back gesture. A touch that STARTS
//    within EDGE_ZONE_PX of the left screen edge is ignored
//    entirely by this component (we never call preventDefault
//    anywhere, so the OS gesture is always free to fire - this
//    is purely about not ALSO firing our own navigation for the
//    same gesture and causing a double-nav / back-then-forward
//    flicker).
// 2. Accidental navigation while scrolling or tapping. We only
//    act on touchend, only if the horizontal distance clearly
//    dominates the vertical one (a real horizontal swipe, not a
//    vertical scroll with some drift) and clears a minimum
//    distance - a light tap or a vertical scroll never triggers
//    a card change.
// =========================================================

const EDGE_ZONE_PX = 24;
const MIN_SWIPE_DISTANCE_PX = 70;
const MAX_VERTICAL_DRIFT_PX = 60;

export function CardDetailSwipeNav({
  prevHref,
  nextHref,
}: {
  prevHref: string | null;
  nextHref: string | null;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let startX = 0;
    let startY = 0;
    let tracking = false;

    function handleTouchStart(event: TouchEvent) {
      const touch = event.touches[0];

      if (!touch) {
        return;
      }

      // Let the OS edge-swipe-back gesture own this touch
      // entirely - don't even start tracking it.
      if (touch.clientX < EDGE_ZONE_PX) {
        tracking = false;
        return;
      }

      startX = touch.clientX;
      startY = touch.clientY;
      tracking = true;
    }

    function handleTouchEnd(event: TouchEvent) {
      if (!tracking) {
        return;
      }

      tracking = false;

      const touch = event.changedTouches[0];

      if (!touch) {
        return;
      }

      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (Math.abs(deltaY) > MAX_VERTICAL_DRIFT_PX) {
        return;
      }

      if (Math.abs(deltaX) < MIN_SWIPE_DISTANCE_PX) {
        return;
      }

      // Swipe left (negative deltaX) -> Next, mirroring how a
      // page/carousel naturally advances. Swipe right -> Previous.
      if (deltaX < 0 && nextHref) {
        router.push(nextHref);
      } else if (deltaX > 0 && prevHref) {
        router.push(prevHref);
      }
    }

    container.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    container.addEventListener("touchend", handleTouchEnd, {
      passive: true,
    });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [prevHref, nextHref, router]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10 sm:hidden"
      aria-hidden="true"
    />
  );
}
