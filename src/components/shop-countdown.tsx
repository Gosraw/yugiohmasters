"use client";

import {
  useSyncExternalStore,
} from "react";

// =========================================================
// SHOP COUNTDOWN
//
// A small live-ticking "refreshes in Xh Ym" readout. The
// server tells us WHEN a rotation ends (`endsAt`, a real
// database timestamp - never a client-guessed value); this
// component just re-renders the remaining time once a minute
// so the shop page doesn't need a hard refresh to feel live.
//
// Implemented with useSyncExternalStore (React's own pattern
// for subscribing to an external clock) rather than a
// useEffect + setState pair - that avoids both a hydration
// mismatch (the server snapshot is fixed at 0, matching the
// client's first paint before it subscribes) and the
// react-hooks/set-state-in-effect lint rule against calling
// setState synchronously inside an effect body.
// =========================================================

function subscribeToClock(
  onTick: () => void
) {
  const interval =
    setInterval(
      onTick,
      60_000
    );

  return () =>
    clearInterval(interval);
}

function getClientNow() {
  return Date.now();
}

function getServerNow() {
  // Fixed placeholder - the real server render time isn't
  // meaningful here since it would just drift from the
  // client's actual clock anyway. What matters is that this
  // matches the client's PRE-subscription snapshot exactly,
  // which useSyncExternalStore guarantees during hydration.
  return 0;
}

function formatRemaining(
  remainingMs: number
) {
  if (remainingMs <= 0) {
    return "Refreshing...";
  }

  const totalMinutes =
    Math.floor(
      remainingMs / 60_000
    );

  const days =
    Math.floor(
      totalMinutes / 1440
    );

  const hours =
    Math.floor(
      (totalMinutes % 1440) /
        60
    );

  const minutes =
    totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

export function ShopCountdown({
  endsAt,
}: {
  endsAt:
    | string
    | null
    | undefined;
}) {
  const now =
    useSyncExternalStore(
      subscribeToClock,
      getClientNow,
      getServerNow
    );

  if (!endsAt) {
    return (
      <span>
        No rotation
      </span>
    );
  }

  if (now === 0) {
    return (
      <span className="tabular-nums">
        …
      </span>
    );
  }

  const target = new Date(
    endsAt
  ).getTime();

  return (
    <span className="tabular-nums">
      {formatRemaining(
        target - now
      )}
    </span>
  );
}
