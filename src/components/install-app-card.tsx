"use client";

import {
  useSyncExternalStore,
} from "react";

import {
  Share,
  SquarePlus,
} from "lucide-react";

// =========================================================
// INSTALL APP CARD
//
// A small, one-time-visible card explaining how to add
// Duelist Circle to an iPhone home screen. Deliberately NOT
// a popup/prompt - it just sits in Profile like any other
// setting. Hides itself once the app detects it is already
// running standalone (added to the home screen), and only
// shows on iOS/iPadOS Safari, where "Add to Home Screen"
// actually produces an app-like standalone launch.
// =========================================================

function isIosDevice() {
  if (
    typeof navigator ===
    "undefined"
  ) {
    return false;
  }

  const ua =
    navigator.userAgent;

  const isIphoneOrIpad =
    /iPhone|iPad|iPod/.test(
      ua
    ) ||
    // iPadOS 13+ reports as
    // "Macintosh" with touch
    // support.
    (ua.includes(
      "Macintosh"
    ) &&
      "ontouchend" in
        document);

  return isIphoneOrIpad;
}

function isStandalone() {
  if (
    typeof window ===
    "undefined"
  ) {
    return false;
  }

  const navStandalone =
    (
      window.navigator as
        | (Navigator & {
            standalone?: boolean;
          })
        | undefined
    )?.standalone;

  return (
    navStandalone === true ||
    window.matchMedia?.(
      "(display-mode: standalone)"
    ).matches ===
      true
  );
}

// React's sanctioned pattern for "a value that only exists on
// the client, without triggering a hydration mismatch": render
// the server snapshot (false) on both the server pass and the
// client's first hydration pass, then React automatically
// re-renders once with the real client snapshot right after
// hydration commits - no manual effect/setState needed.
function subscribeNever() {
  return () => undefined;
}

export function InstallAppCard() {
  const mounted =
    useSyncExternalStore(
      subscribeNever,
      () => true,
      () => false
    );

  const visible =
    mounted &&
    isIosDevice() &&
    !isStandalone();

  if (!visible) {
    return null;
  }

  return (
    <div className="panel relative overflow-hidden p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-amber-200">
          <SquarePlus
            size={18}
          />
        </div>

        <div className="min-w-0">
          <p className="font-black text-zinc-100">
            Install Duelist Circle
          </p>

          <p className="mt-1 text-sm leading-6 text-zinc-500">
            Add it to your Home Screen for a full-screen, app-like experience - no browser bar, your own icon.
          </p>

          <ol className="mt-3 space-y-1.5 text-xs font-bold text-zinc-400">
            <li className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/15 text-[10px] text-zinc-500">
                1
              </span>
              Open this page in Safari
            </li>

            <li className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/15 text-[10px] text-zinc-500">
                2
              </span>
              Tap{" "}
              <Share
                size={13}
                className="inline-block text-zinc-300"
              />{" "}
              Share
            </li>

            <li className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/15 text-[10px] text-zinc-500">
                3
              </span>
              Tap &quot;Add to Home Screen&quot;
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
