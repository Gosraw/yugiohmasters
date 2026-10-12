"use client";

import {
  useEffect,
  useRef,
} from "react";

import {
  CircleAlert,
  Info,
  X,
} from "lucide-react";

import type {
  DeckNotice,
} from "./deck-store";

// Small inline notice for refused/blocked taps ("Extra Deck is
// full"). Rendered as a manual popover so it sits in the top layer -
// visible above an open bottom sheet too - and placed just above the
// bottom nav. Auto-dismisses after a few seconds.

const VISIBLE_MS = 4200;

export function NoticeToast({
  notice,
  onDismiss,
}: {
  notice: DeckNotice | null;
  onDismiss: (id: number) => void;
}) {
  const ref =
    useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element =
      ref.current;

    if (
      !element ||
      !notice
    ) {
      return;
    }

    // Re-show so a toast raised while a sheet is open lands above it.
    if (
      typeof element.showPopover ===
      "function"
    ) {
      if (
        element.matches(
          ":popover-open"
        )
      ) {
        element.hidePopover();
      }

      element.showPopover();
    }

    const timer =
      window.setTimeout(
        () =>
          onDismiss(
            notice.id
          ),
        VISIBLE_MS
      );

    return () => {
      window.clearTimeout(
        timer
      );

      if (
        typeof element.hidePopover ===
          "function" &&
        element.matches(
          ":popover-open"
        )
      ) {
        element.hidePopover();
      }
    };
  }, [notice, onDismiss]);

  return (
    <div
      ref={ref}
      popover="manual"
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-auto bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] m-0 flex justify-center border-0 bg-transparent p-0 px-3 [inset-inline:0] [&:not(:popover-open)]:hidden"
    >
      {notice && (
        <div
          key={notice.id}
          className={`pointer-events-auto flex max-w-md animate-[deck-toast-in_180ms_ease-out] items-center gap-2.5 rounded-2xl border py-1 pl-3.5 pr-1 text-sm font-bold shadow-[0_14px_40px_rgb(0_0_0/.5)] backdrop-blur-xl ${
            notice.tone === "error"
              ? "border-red-300/30 bg-[rgb(48_14_22/.94)] text-red-50"
              : "border-[var(--dc-gold-line)] bg-[rgb(14_20_44/.95)] text-zinc-100"
          }`}
        >
          {notice.tone === "error" ? (
            <CircleAlert
              size={17}
              className="shrink-0 text-red-300"
            />
          ) : (
            <Info
              size={17}
              className="shrink-0 text-amber-300"
            />
          )}

          <span className="py-2 leading-5">
            {notice.text}
          </span>

          <button
            type="button"
            onClick={() =>
              onDismiss(
                notice.id
              )
            }
            aria-label="Dismiss"
            className="grid size-10 shrink-0 cursor-pointer touch-manipulation place-items-center rounded-xl text-current/70 transition active:scale-95"
          >
            <X
              size={16}
            />
          </button>
        </div>
      )}

      <style>{`
        @keyframes deck-toast-in {
          from { opacity: 0; transform: translateY(8px) scale(.98); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          [role="status"] > div { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
