"use client";

import Image from "next/image";

import {
  X,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  cardPasscodeFromImageSrc,
  largeCardImageUrl,
} from "@/lib/card-image";

import {
  createClient,
} from "@/lib/supabase/client";

// =========================================================
// CARD ZOOM
//
// The YGOPRODeck pictures are 421 px wide, so the effect text
// printed on them is unreadable at the sizes the app shows cards.
// Mounted once in the (app) layout: press and hold any card
// picture (finger or mouse, ~0.45 s) - or right-click it - and a
// large view opens with the picture and the card text in normal,
// readable type.
//
// No page has to opt in: one document-level listener recognises
// a card picture by its YGOPRODeck src (lib/card-image.ts) and
// loads the text from card_catalog by passcode. Wrap anything in
// data-card-zoom="off" to keep its pictures out (the overlay does
// that for itself). After a hold the click that follows the
// release is swallowed, so a card inside a link or button does
// not also navigate or fire its own action.
// =========================================================

const HOLD_MS = 450;

const MOVE_TOLERANCE_PX = 10;

const CLICK_SUPPRESS_MS = 800;

type CardText = {
  name: string;
  card_type: string | null;
  race: string | null;
  attribute: string | null;
  level: number | null;
  rank: number | null;
  atk: number | null;
  def: number | null;
  description: string | null;
};

type ZoomTarget = {
  passcode: number;
  fallbackName: string;
};

type Pending = {
  timer: number;
  pointerId: number;
  x: number;
  y: number;
};

function cardImageTarget(
  eventTarget: EventTarget | null
): ZoomTarget | null {
  if (!(eventTarget instanceof Element)) {
    return null;
  }

  const image =
    eventTarget.closest("img");

  if (
    !image ||
    image.closest(
      "[data-card-zoom='off']"
    )
  ) {
    return null;
  }

  const passcode =
    cardPasscodeFromImageSrc(
      image.currentSrc ||
        image.src
    );

  if (passcode === null) {
    return null;
  }

  return {
    passcode,
    fallbackName:
      image.alt,
  };
}

function statLine(
  card: CardText
) {
  const parts: string[] = [];

  if (card.level != null && card.level > 0) {
    parts.push(
      `Level ${card.level}`
    );
  }

  if (card.rank != null && card.rank > 0) {
    parts.push(
      `Rank ${card.rank}`
    );
  }

  if (card.atk != null) {
    parts.push(
      `ATK ${card.atk < 0 ? "?" : card.atk}`
    );
  }

  if (card.def != null) {
    parts.push(
      `DEF ${card.def < 0 ? "?" : card.def}`
    );
  }

  return parts;
}

export function CardZoom() {
  const [
    target,
    setTarget,
  ] = useState<ZoomTarget | null>(null);

  const [
    card,
    setCard,
  ] = useState<CardText | null>(null);

  const [
    status,
    setStatus,
  ] = useState<"loading" | "ready" | "missing">("loading");

  const cache =
    useRef(
      new Map<number, CardText | null>()
    );

  const closeButton =
    useRef<HTMLButtonElement>(null);

  const close = useCallback(
    () => {
      setTarget(null);
    },
    []
  );

  // Press-and-hold / right-click detection for the whole app.
  useEffect(
    () => {
      let pending: Pending | null = null;
      let suppressClickUntil = 0;
      let openedAt = 0;

      function cancelPending() {
        if (pending) {
          window.clearTimeout(
            pending.timer
          );
          pending = null;
        }
      }

      function open(
        next: ZoomTarget
      ) {
        cancelPending();
        openedAt =
          Date.now();
        suppressClickUntil =
          openedAt + CLICK_SUPPRESS_MS;
        setTarget(next);

        try {
          navigator.vibrate?.(
            10
          );
        } catch {
          // Vibration is a nicety; some browsers refuse it.
        }
      }

      function onPointerDown(
        event: PointerEvent
      ) {
        cancelPending();

        if (event.button !== 0 || !event.isPrimary) {
          return;
        }

        const next =
          cardImageTarget(
            event.target
          );

        if (!next) {
          return;
        }

        pending = {
          timer: window.setTimeout(
            () => open(next),
            HOLD_MS
          ),
          pointerId:
            event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
      }

      function onPointerMove(
        event: PointerEvent
      ) {
        if (!pending || event.pointerId !== pending.pointerId) {
          return;
        }

        const moved = Math.hypot(
          event.clientX - pending.x,
          event.clientY - pending.y
        );

        if (moved > MOVE_TOLERANCE_PX) {
          cancelPending();
        }
      }

      function onClick(
        event: MouseEvent
      ) {
        if (Date.now() < suppressClickUntil) {
          suppressClickUntil = 0;
          event.preventDefault();
          event.stopPropagation();
        }
      }

      function onContextMenu(
        event: MouseEvent
      ) {
        const next =
          cardImageTarget(
            event.target
          );

        if (!next) {
          return;
        }

        // No browser menu / "save image" sheet on a card picture.
        event.preventDefault();

        if (Date.now() - openedAt < CLICK_SUPPRESS_MS) {
          // A touch hold already opened the view; Android fires
          // this a moment later. Keep swallowing the release click.
          return;
        }

        if (pending) {
          // Android can fire this before the hold timer: open now.
          open(next);
        } else if (
          (event as Partial<PointerEvent>).pointerType !== "touch"
        ) {
          // Desktop right-click: no click follows, so nothing to
          // swallow (the next real click must still work).
          open(next);
          suppressClickUntil = 0;
        }
      }

      document.addEventListener(
        "pointerdown",
        onPointerDown,
        true
      );
      document.addEventListener(
        "pointermove",
        onPointerMove,
        true
      );
      document.addEventListener(
        "pointerup",
        cancelPending,
        true
      );
      document.addEventListener(
        "pointercancel",
        cancelPending,
        true
      );
      document.addEventListener(
        "scroll",
        cancelPending,
        {
          capture: true,
          passive: true,
        }
      );
      document.addEventListener(
        "click",
        onClick,
        true
      );
      document.addEventListener(
        "contextmenu",
        onContextMenu,
        true
      );

      return () => {
        cancelPending();
        document.removeEventListener(
          "pointerdown",
          onPointerDown,
          true
        );
        document.removeEventListener(
          "pointermove",
          onPointerMove,
          true
        );
        document.removeEventListener(
          "pointerup",
          cancelPending,
          true
        );
        document.removeEventListener(
          "pointercancel",
          cancelPending,
          true
        );
        document.removeEventListener(
          "scroll",
          cancelPending,
          true
        );
        document.removeEventListener(
          "click",
          onClick,
          true
        );
        document.removeEventListener(
          "contextmenu",
          onContextMenu,
          true
        );
      };
    },
    []
  );

  // Load the card text (cached per passcode for this visit).
  useEffect(
    () => {
      if (!target) {
        return;
      }

      const passcode =
        target.passcode;

      if (cache.current.has(passcode)) {
        const cached =
          cache.current.get(passcode) ?? null;

        setCard(cached);
        setStatus(
          cached
            ? "ready"
            : "missing"
        );
        return;
      }

      let cancelled = false;

      setCard(null);
      setStatus("loading");

      createClient()
        .from("card_catalog")
        .select(
          "name,card_type,race,attribute,level,rank,atk,def,description"
        )
        .eq(
          "external_card_id",
          passcode
        )
        .maybeSingle()
        .then(
          ({
            data,
            error,
          }) => {
            if (cancelled) {
              return;
            }

            const found =
              !error && data
                ? (data as CardText)
                : null;

            // A failed request is not cached, so the next hold retries.
            if (!error) {
              cache.current.set(
                passcode,
                found
              );
            }

            setCard(found);
            setStatus(
              found
                ? "ready"
                : "missing"
            );
          }
        );

      return () => {
        cancelled = true;
      };
    },
    [
      target,
    ]
  );

  // While open: Escape closes, the page behind does not scroll.
  useEffect(
    () => {
      if (!target) {
        return;
      }

      function onKeyDown(
        event: KeyboardEvent
      ) {
        if (event.key === "Escape") {
          close();
        }
      }

      const previousOverflow =
        document.body.style.overflow;

      document.body.style.overflow =
        "hidden";
      document.addEventListener(
        "keydown",
        onKeyDown
      );
      closeButton.current?.focus({
        preventScroll: true,
      });

      return () => {
        document.body.style.overflow =
          previousOverflow;
        document.removeEventListener(
          "keydown",
          onKeyDown
        );
      };
    },
    [
      target,
      close,
    ]
  );

  if (!target) {
    return null;
  }

  const name =
    card?.name ||
    target.fallbackName ||
    "Card";

  const typeLine = card
    ? [
        card.attribute,
        card.race,
        card.card_type,
      ].filter(Boolean)
    : [];

  const stats = card
    ? statLine(card)
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      data-card-zoom="off"
      onClick={close}
      className="card-zoom-backdrop fixed inset-0 z-[200] flex items-end justify-center bg-black/85 p-3 backdrop-blur-md sm:items-center sm:p-6"
    >
      <div
        onClick={(event) =>
          event.stopPropagation()
        }
        className="card-zoom-sheet panel relative max-h-[92dvh] w-full max-w-3xl overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6"
      >
        <button
          ref={closeButton}
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-black/50 text-zinc-300 transition hover:border-amber-300/40 hover:text-amber-200 active:scale-95"
        >
          <X
            size={18}
          />
        </button>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,280px)_1fr] sm:gap-6">
          <Image
            src={
              largeCardImageUrl(
                target.passcode
              )
            }
            alt={name}
            width={421}
            height={614}
            draggable={false}
            className="mx-auto aspect-[421/614] h-auto w-full max-w-[220px] rounded-lg shadow-[0_12px_40px_rgb(0_0_0/.55)] sm:max-w-none"
            unoptimized
          />

          <div className="min-w-0">
            <h2 className="gold-text pr-12 font-display text-xl font-bold leading-tight sm:text-2xl">
              {name}
            </h2>

            {typeLine.length > 0 && (
              <p className="mt-2 text-sm font-bold text-zinc-300">
                {typeLine.join(
                  " · "
                )}
              </p>
            )}

            {stats.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {stats.map(
                  (stat) => (
                    <span
                      key={stat}
                      className="rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-1 text-sm font-black tabular-nums text-amber-100"
                    >
                      {stat}
                    </span>
                  )
                )}
              </div>
            )}

            <div className="mt-4 border-t border-white/10 pt-4">
              {status === "loading" && (
                <p className="text-base text-zinc-400">
                  Loading card text...
                </p>
              )}

              {status === "missing" && (
                <p className="text-base text-zinc-400">
                  Card text not available.
                </p>
              )}

              {status === "ready" && card?.description && (
                <p className="whitespace-pre-line text-base leading-7 text-zinc-100">
                  {card.description}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
