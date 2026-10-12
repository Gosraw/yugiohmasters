"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  X,
} from "lucide-react";

// =========================================================
// BOTTOM SHEET
//
// A native <dialog> (focus trap, Escape, top layer above the bottom
// nav) styled as a phone sheet: slides up, the page behind stops
// scrolling, the sheet's own content scrolls with
// overscroll-behavior: contain, and it can be dragged down by its
// handle/header to close. Exit is animated before the dialog closes.
// =========================================================

const EXIT_MS = 220;
const DRAG_CLOSE_DISTANCE = 96;
const DRAG_CLOSE_VELOCITY = 0.55;

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const dialogRef =
    useRef<HTMLDialogElement>(null);

  const panelRef =
    useRef<HTMLDivElement>(null);

  const drag =
    useRef<{
      startY: number;
      startTime: number;
      dy: number;
    } | null>(null);

  // `entered` flips one frame after the dialog opens so the slide-up
  // transition has a start state; `shown` drops the moment `open`
  // does, so the exit transition plays before the dialog closes.
  const [entered, setEntered] =
    useState(false);

  const shown =
    open &&
    entered;

  useEffect(() => {
    const dialog =
      dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }

      const frame =
        requestAnimationFrame(
          () => setEntered(true)
        );

      const root =
        document.documentElement;

      const previousOverflow =
        root.style.overflow;

      root.style.overflow =
        "hidden";

      return () => {
        cancelAnimationFrame(
          frame
        );

        root.style.overflow =
          previousOverflow;
      };
    }

    const timer =
      window.setTimeout(
        () => {
          setEntered(false);

          if (dialog.open) {
            dialog.close();
          }
        },
        EXIT_MS
      );

    return () =>
      window.clearTimeout(
        timer
      );
  }, [open]);

  function handlePointerDown(
    event: React.PointerEvent
  ) {
    if (
      (event.target as HTMLElement).closest(
        "button, a, input, select"
      )
    ) {
      return;
    }

    drag.current = {
      startY:
        event.clientY,
      startTime:
        event.timeStamp,
      dy: 0,
    };

    (event.currentTarget as HTMLElement).setPointerCapture(
      event.pointerId
    );
  }

  function handlePointerMove(
    event: React.PointerEvent
  ) {
    const state =
      drag.current;

    const panel =
      panelRef.current;

    if (
      !state ||
      !panel
    ) {
      return;
    }

    // Dragging up past the top resists instead of moving freely.
    const raw =
      event.clientY -
      state.startY;

    state.dy =
      raw > 0
        ? raw
        : raw / 6;

    panel.style.transition =
      "none";

    panel.style.transform =
      `translateY(${state.dy}px)`;
  }

  function handlePointerUp(
    event: React.PointerEvent
  ) {
    const state =
      drag.current;

    const panel =
      panelRef.current;

    drag.current =
      null;

    if (
      !state ||
      !panel
    ) {
      return;
    }

    const elapsed =
      Math.max(
        1,
        event.timeStamp -
          state.startTime
      );

    const velocity =
      state.dy /
      elapsed;

    panel.style.transition =
      "";

    panel.style.transform =
      "";

    if (
      state.dy >
        DRAG_CLOSE_DISTANCE ||
      (state.dy > 24 &&
        velocity >
          DRAG_CLOSE_VELOCITY)
    ) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-transparent p-0 text-[var(--dc-ink)] backdrop:bg-transparent"
    >
      <div
        aria-hidden
        onClick={onClose}
        data-state={
          shown
            ? "open"
            : "closed"
        }
        className="absolute inset-0 bg-[rgb(3_5_14/.62)] opacity-0 backdrop-blur-[2px] transition-opacity duration-200 ease-out data-[state=open]:opacity-100"
      />

      <div
        ref={panelRef}
        data-state={
          shown
            ? "open"
            : "closed"
        }
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] w-full max-w-xl translate-y-full flex-col rounded-t-[1.6rem] border border-b-0 border-[var(--dc-gold-line)] bg-[linear-gradient(180deg,rgb(20_28_60/.98),rgb(9_13_32/.99))] shadow-[0_-24px_60px_rgb(2_4_14/.6)] transition-transform duration-[260ms] ease-[cubic-bezier(.32,.72,0,1)] data-[state=open]:translate-y-0 motion-reduce:transition-none"
      >
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="shrink-0 cursor-grab touch-none select-none px-5 pb-3 pt-2.5 active:cursor-grabbing"
        >
          <div className="mx-auto h-1.5 w-11 rounded-full bg-white/20" />

          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-black text-zinc-50">
                {title}
              </h2>

              {subtitle && (
                <div className="mt-0.5 text-xs text-zinc-400">
                  {subtitle}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 grid size-11 shrink-0 cursor-pointer touch-manipulation place-items-center rounded-full text-zinc-400 transition active:scale-95 hover:bg-white/5 hover:text-zinc-100"
            >
              <X
                size={20}
              />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-white/10 px-5 pb-[calc(.85rem+env(safe-area-inset-bottom,0px))] pt-3">
            {footer}
          </div>
        )}

        {!footer && (
          <div className="h-[env(safe-area-inset-bottom,0px)] shrink-0" />
        )}
      </div>
    </dialog>
  );
}
