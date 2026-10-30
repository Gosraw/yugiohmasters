"use client";

import Image from "next/image";
import Link from "next/link";

import {
  ChevronRight,
  Crown,
  ScrollText,
  SkipForward,
  Sparkles,
  Swords,
  X,
} from "lucide-react";

import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import type {
  CSSProperties,
} from "react";

import {
  EyeOfWudjat,
  GlyphBand,
  SandParticles,
} from "@/components/millennium-glyphs";

import {
  SubmitButton,
} from "@/components/submit-button";

import {
  spinBossPathWheel,
  type SpinWheelState,
} from "@/app/actions/boss-routes";

import {
  isSoundOn,
  play,
  preloadSounds,
} from "@/lib/sound";

import type {
  WheelRoute,
  WheelStageCard,
} from "@/lib/boss-wheel";

// =========================================================
// BOSS PATH WHEEL (2.0 onboarding, migration 202610301400)
//
// The first Boss Path is not chosen, it is spun. The player taps
// "Spin"; the wheel speeds up right away while the server action
// asks spin_boss_path_wheel() for the route (decided and granted in
// the database, once). As soon as the answer is in, the wheel eases
// out over ~4 seconds and stops exactly on that route, ticking past
// every slice (pointer flick + a tiny Web Audio click when sound is
// on). Then the reveal: arena, Stage 1 Boss card, name, story, "How
// it plays" and "Continue to your Initial Draft".
//
// * The slices are frozen on first render: a server re-render in the
//   middle of a spin never changes the wheel under the animation.
// * prefers-reduced-motion: no spinning at all - the result is shown
//   on the wheel straight away and the reveal fades in.
// * Reloading after a spin shows the result (the page passes
//   `assigned`), never the wheel again.
// =========================================================

type Assigned = {
  pathId: string;
  route: WheelRoute;
};

type Phase =
  | "idle"
  | "spinning"
  | "landing"
  | "landed"
  | "revealed";

const INITIAL_STATE: SpinWheelState = {
  status: "idle",
};

// Wheel geometry (SVG user units).
const SIZE = 400;
const CENTER = SIZE / 2;
const RADIUS = 184;
const TEXT_INNER = 50;
const TEXT_OUTER = 172;

// Motion.
const MAX_SPEED = 0.78; // degrees per ms (~2 turns a second)
const ACCELERATION = 0.0024; // degrees per ms²
const LAND_DURATION = 4300; // ms

function mod(
  value: number,
  base: number
) {
  return (
    ((value % base) +
      base) %
    base
  );
}

// Position along the landing curve (0..1). f(0) = 0, f(1) = 1,
// f'(1) = 0 and f'(0) = slope, so the wheel leaves the free spin
// at exactly the speed it had (no jolt) and creeps to a stop.
function landingCurve(
  u: number,
  slope: number
) {
  return (
    slope * u +
    (3 - 2 * slope) * u * u +
    (slope - 2) * u * u * u
  );
}

// Server and browser can differ in the last digit of Math.sin /
// Math.cos; rounded numbers keep the SVG markup identical (no
// hydration mismatch).
function round(
  value: number
) {
  return (
    Math.round(
      value * 100
    ) / 100
  );
}

function prefersReducedMotion() {
  return (
    typeof window !==
      "undefined" &&
    window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
  );
}

function sliceIndexAt(
  angle: number,
  count: number
) {
  const seg =
    360 / count;

  return mod(
    Math.round(
      mod(
        -angle,
        360
      ) / seg
    ),
    count
  );
}

function wedgePath(
  count: number
) {
  if (count <= 1) {
    return `M ${CENTER} ${CENTER - RADIUS} A ${RADIUS} ${RADIUS} 0 1 1 ${CENTER - 0.01} ${CENTER - RADIUS} Z`;
  }

  const half =
    (Math.PI / count);

  const x = round(
    RADIUS *
      Math.sin(half)
  );

  const y = round(
    CENTER -
      RADIUS *
        Math.cos(half)
  );

  const largeArc =
    count < 2
      ? 1
      : 0;

  return `M ${CENTER} ${CENTER} L ${CENTER - x} ${y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${CENTER + x} ${y} Z`;
}

// =========================================================
// MOTION ENGINE (plain JS, outside React: one requestAnimationFrame
// loop writes the wheel's transform directly - no re-render per
// frame)
// =========================================================

type WheelMotion = {
  /** Speed up and keep spinning until the result is known. */
  spinFree: () => void;
  /** Ease out and stop on slice `index` of `count`. */
  landOn: (
    index: number,
    count: number,
    immediate: boolean
  ) => void;
  /** Jump to the end of the landing. */
  skip: () => void;
  /** Stop where it is (error) or on unmount. */
  stop: () => void;
  isLanding: () => boolean;
};

function createWheelMotion({
  apply,
  onSlice,
  onLanded,
  sliceCount,
}: {
  apply: (angle: number) => void;
  onSlice: (
    index: number,
    now: number
  ) => void;
  onLanded: (index: number) => void;
  sliceCount: number;
}): WheelMotion {
  let mode:
    | "still"
    | "free"
    | "land" = "still";
  let angle = 0;
  let velocity = 0;
  let last = 0;
  let landStart = 0;
  let landFrom = 0;
  let landDelta = 0;
  let landSlope = 0;
  let landIndex = 0;
  let count = Math.max(
    1,
    sliceCount
  );
  let lastIndex = 0;
  let frameId:
    | number
    | null = null;

  function cancel() {
    if (frameId !== null) {
      cancelAnimationFrame(
        frameId
      );

      frameId = null;
    }
  }

  function report(now: number) {
    const index =
      sliceIndexAt(
        angle,
        count
      );

    if (index !== lastIndex) {
      lastIndex = index;
      onSlice(
        index,
        now
      );
    }
  }

  function finish() {
    cancel();
    mode = "still";
    angle =
      landFrom +
      landDelta;
    apply(angle);
    report(
      performance.now()
    );
    onLanded(landIndex);
  }

  function frame(now: number) {
    const elapsed =
      Math.min(
        48,
        Math.max(
          0,
          now - last
        )
      );

    last = now;

    if (mode === "free") {
      velocity = Math.min(
        MAX_SPEED,
        velocity +
          ACCELERATION *
            elapsed
      );

      angle +=
        velocity *
        elapsed;
    } else if (
      mode === "land"
    ) {
      const progress =
        Math.min(
          1,
          (now -
            landStart) /
            LAND_DURATION
        );

      angle =
        landFrom +
        landDelta *
          landingCurve(
            progress,
            landSlope
          );

      if (progress >= 1) {
        finish();

        return;
      }
    } else {
      return;
    }

    apply(angle);
    report(now);

    frameId =
      requestAnimationFrame(
        frame
      );
  }

  return {
    spinFree() {
      mode = "free";
      velocity = 0;
      last =
        performance.now();
      cancel();
      frameId =
        requestAnimationFrame(
          frame
        );
    },

    landOn(
      index,
      newCount,
      immediate
    ) {
      count = Math.max(
        1,
        newCount
      );

      landIndex = index;

      const seg =
        360 / count;

      // Stop a little off-centre inside the slice, like a real
      // wheel - but never near its edge.
      const jitter =
        count > 1
          ? (Math.random() *
              2 -
              1) *
            seg *
            0.3
          : 0;

      const target =
        mod(
          jitter -
            index * seg,
          360
        );

      landFrom = angle;

      if (
        immediate ||
        mode !== "free"
      ) {
        landDelta = mod(
          target - angle,
          360
        );

        finish();

        return;
      }

      // At least three full turns, and never so short that the
      // curve would have to start faster than the wheel already is.
      const minimum =
        Math.max(
          (velocity *
            LAND_DURATION) /
            3,
          1080
        );

      landDelta =
        minimum +
        mod(
          target -
            (angle +
              minimum),
          360
        );

      landSlope =
        (velocity *
          LAND_DURATION) /
        landDelta;

      landStart =
        performance.now();

      mode = "land";
    },

    skip() {
      if (mode === "land") {
        finish();
      }
    },

    stop() {
      cancel();
      mode = "still";
    },

    isLanding() {
      return mode === "land";
    },
  };
}

// =========================================================
// THE WHEEL FACE (slices only - rotates as one layer)
// =========================================================

function WheelFace({
  slices,
  winnerIndex,
  clipId,
}: {
  slices: WheelRoute[];
  winnerIndex:
    | number
    | null;
  clipId: string;
}) {
  const count =
    Math.max(
      1,
      slices.length
    );

  const seg =
    360 / count;

  const wedge =
    wedgePath(count);

  const half =
    Math.PI / count;

  const artWidth =
    count <= 2
      ? RADIUS * 2
      : round(
          Math.max(
            120,
            2 *
              RADIUS *
              Math.sin(half) +
              24
          )
        );

  const artHeight =
    count <= 1
      ? RADIUS * 2
      : RADIUS;

  const fontSize =
    count <= 6
      ? 15
      : count <= 10
        ? 13
        : 11.5;

  const textCenter =
    CENTER -
    (TEXT_INNER +
      TEXT_OUTER) /
      2;

  const textRoom =
    TEXT_OUTER -
    TEXT_INNER;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-hidden="true"
      className="h-full w-full"
    >
      <defs>
        <clipPath
          id={clipId}
          clipPathUnits="userSpaceOnUse"
        >
          <path
            d={wedge}
          />
        </clipPath>

        <radialGradient
          id={`${clipId}-shade`}
        >
          <stop
            offset="18%"
            stopColor="#03050f"
            stopOpacity=".92"
          />

          <stop
            offset="62%"
            stopColor="#03050f"
            stopOpacity=".35"
          />

          <stop
            offset="100%"
            stopColor="#03050f"
            stopOpacity=".12"
          />
        </radialGradient>
      </defs>

      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="#070a1c"
      />

      {slices.map(
        (route, index) => {
          const edgeX = round(
            CENTER -
              RADIUS *
                Math.sin(half)
          );

          const edgeY = round(
            CENTER -
              RADIUS *
                Math.cos(half)
          );

          return (
            <g
              key={
                route.id
              }
              transform={`rotate(${index * seg} ${CENTER} ${CENTER})`}
            >
              <image
                href={
                  route.wheelArt
                }
                x={
                  CENTER -
                  artWidth / 2
                }
                y={
                  CENTER -
                  RADIUS
                }
                width={
                  artWidth
                }
                height={
                  artHeight
                }
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#${clipId})`}
              />

              <path
                d={wedge}
                fill={
                  index % 2 === 0
                    ? "rgb(10 14 40 / .5)"
                    : "rgb(90 58 10 / .38)"
                }
              />

              {count > 1 && (
                <line
                  x1={CENTER}
                  y1={CENTER}
                  x2={edgeX}
                  y2={edgeY}
                  stroke="#f2c45a"
                  strokeOpacity=".7"
                  strokeWidth={1.6}
                />
              )}

              {winnerIndex ===
                index && (
                <path
                  d={wedge}
                  fill="rgb(255 216 110 / .16)"
                  stroke="#ffe9a8"
                  strokeWidth={4}
                  className="dc-wheel-win"
                />
              )}
            </g>
          );
        }
      )}

      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill={`url(#${clipId}-shade)`}
      />

      {slices.map(
        (route, index) => {
          const estimated =
            route.name.length *
            fontSize *
            0.6;

          return (
            <text
              key={
                route.id
              }
              transform={`rotate(${index * seg} ${CENTER} ${CENTER}) translate(${CENTER} ${textCenter}) rotate(90)`}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={
                fontSize
              }
              fontWeight={900}
              letterSpacing=".02em"
              fill={
                winnerIndex ===
                index
                  ? "#fffaf0"
                  : "#fde68a"
              }
              stroke="#03050f"
              strokeWidth={3}
              strokeOpacity=".85"
              paintOrder="stroke"
              textLength={
                estimated >
                textRoom
                  ? textRoom
                  : undefined
              }
              lengthAdjust="spacingAndGlyphs"
            >
              {route.name}
            </text>
          );
        }
      )}
    </svg>
  );
}

// =========================================================
// STATIC RIM, BULBS AND POINTER (do not rotate)
// =========================================================

const BULBS =
  Array.from(
    {
      length: 28,
    },
    (_, index) => {
      const angle =
        (index / 28) *
        Math.PI *
        2;

      return {
        x: round(
          CENTER +
            193 *
              Math.sin(angle)
        ),
        y: round(
          CENTER -
            193 *
              Math.cos(angle)
        ),
      };
    }
  );

function WheelRim() {
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <defs>
        <linearGradient
          id="dc-wheel-rim"
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop
            offset="0%"
            stopColor="#fff1b3"
          />

          <stop
            offset="45%"
            stopColor="#d6a23e"
          />

          <stop
            offset="100%"
            stopColor="#7a5418"
          />
        </linearGradient>
      </defs>

      <circle
        cx={CENTER}
        cy={CENTER}
        r={193}
        fill="none"
        stroke="url(#dc-wheel-rim)"
        strokeWidth={13}
      />

      <circle
        cx={CENTER}
        cy={CENTER}
        r={186}
        fill="none"
        stroke="#03050f"
        strokeOpacity=".7"
        strokeWidth={2}
      />

      <g>
        {BULBS.map(
          (bulb, index) => (
            <circle
              key={index}
              cx={bulb.x}
              cy={bulb.y}
              r={3.3}
              fill="#fffaf0"
              className="dc-wheel-bulb"
              style={{
                filter:
                  "drop-shadow(0 0 3px rgb(255 216 110 / .9))",
              }}
            />
          )
        )}
      </g>
    </svg>
  );
}

// =========================================================
// REVEAL PIECES
// =========================================================

function StageCardFace({
  card,
  routeName,
}: {
  card:
    | WheelStageCard
    | null;
  routeName: string;
}) {
  if (card?.imageUrl) {
    return (
      <Image
        src={
          card.imageUrl
        }
        alt={
          card.name
        }
        width={421}
        height={614}
        unoptimized
        className="h-full w-full rounded-xl object-cover"
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl bg-[linear-gradient(160deg,#26346e,#101634_70%)] p-4 text-center">
      <EyeOfWudjat className="h-10 w-14 text-amber-300/70" />

      <p className="font-display text-sm font-bold text-amber-100">
        {card?.name ??
          routeName}
      </p>
    </div>
  );
}

function RouteStory({
  route,
}: {
  route: WheelRoute;
}) {
  return (
    <div className="space-y-3 text-left">
      {route.teaserStory && (
        <p className="text-sm leading-6 text-zinc-300">
          {
            route.teaserStory
          }
        </p>
      )}

      {route.howItPlays && (
        <div className="rounded-xl border border-amber-300/20 bg-[#05081a]/70 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-300/90">
            <Swords
              size={12}
            />
            How it plays
          </p>

          <p className="mt-1.5 text-sm leading-6 text-zinc-200">
            {
              route.howItPlays
            }
          </p>
        </div>
      )}
    </div>
  );
}

function NextStepLink({
  pathId,
  draftDone,
  autoFocus = false,
}: {
  pathId: string;
  draftDone: boolean;
  autoFocus?: boolean;
}) {
  return draftDone ? (
    <Link
      href={`/boss/${pathId}`}
      autoFocus={
        autoFocus
      }
      className="primary-button inline-flex w-full items-center justify-center gap-2 text-sm sm:w-auto sm:px-8"
    >
      Open your Boss Path
      <ChevronRight
        size={16}
      />
    </Link>
  ) : (
    <Link
      href="/draft"
      autoFocus={
        autoFocus
      }
      className="primary-button inline-flex w-full items-center justify-center gap-2 text-sm sm:w-auto sm:px-8"
    >
      Continue to your Initial Draft
      <ChevronRight
        size={16}
      />
    </Link>
  );
}

function RouteReveal({
  outcome,
  draftDone,
  onClose,
}: {
  outcome: Assigned;
  draftDone: boolean;
  onClose: () => void;
}) {
  const {
    route,
  } = outcome;

  const titleId =
    useId();

  useEffect(() => {
    function onKey(
      event: KeyboardEvent
    ) {
      if (
        event.key ===
        "Escape"
      ) {
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      onKey
    );

    return () =>
      window.removeEventListener(
        "keydown",
        onKey
      );
  }, [
    onClose,
  ]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={
        titleId
      }
      className="dc-evo-backdrop fixed inset-0 z-[90] overflow-y-auto overscroll-contain bg-[#03050f]"
    >
      <div
        aria-hidden="true"
        className="dc-evo-arena fixed inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${route.arenaImage})`,
        }}
      />

      <div
        aria-hidden="true"
        className="fixed inset-0 bg-[radial-gradient(90%_55%_at_50%_30%,transparent,rgb(3_5_15/.82)_72%),linear-gradient(180deg,rgb(3_5_15/.45),transparent_30%,rgb(3_5_15/.94)_70%)]"
      />

      <button
        type="button"
        onClick={
          onClose
        }
        aria-label="Close"
        className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-amber-300/25 bg-[#05081a]/70 text-amber-200 transition-colors hover:bg-amber-300/10"
      >
        <X
          size={16}
        />
      </button>

      <div className="relative mx-auto flex min-h-full w-full max-w-md flex-col items-center px-5 pt-[max(3.5rem,env(safe-area-inset-top))] text-center">
        <GlyphBand
          units={3}
          className="dc-reveal-title h-4 w-56 text-amber-300/35"
        />

        <p className="dc-reveal-title hud-label mt-3 text-amber-300/85">
          The wheel has chosen
        </p>

        <div className="dc-reveal-card relative mt-6 aspect-[421/614] w-[min(42vw,200px)]">
          <div
            aria-hidden="true"
            className="dc-aura dc-aura-forever pointer-events-none absolute -inset-[32%] rounded-full"
            style={
              {
                "--aura":
                  "rgb(255 216 110 / .5)",
              } as CSSProperties
            }
          />

          <div
            aria-hidden="true"
            className="dc-rays pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[250%] -translate-x-1/2 -translate-y-1/2"
            style={
              {
                "--rays-opacity": 0.5,
              } as CSSProperties
            }
          />

          <SandParticles className="-inset-x-[40%] -top-[30%] bottom-0" />

          <div className="relative h-full w-full overflow-hidden rounded-2xl border border-amber-200/60 bg-[#05081a] p-2 shadow-[0_0_60px_rgba(255,216,110,.35),0_30px_80px_rgba(0,0,0,.6)]">
            <StageCardFace
              card={
                route.stageOneCard
              }
              routeName={
                route.name
              }
            />
          </div>
        </div>

        <h2
          id={
            titleId
          }
          className="dc-reveal-title gold-text mt-7 text-3xl font-black leading-tight sm:text-4xl"
        >
          {route.name}
        </h2>

        {route.stageOneCard && (
          <p className="dc-reveal-title mt-2 text-xs font-black uppercase tracking-wider text-zinc-300">
            Stage 1 ·{" "}
            {
              route.stageOneCard
                .name
            }
          </p>
        )}

        <div className="dc-reveal-body mt-5 w-full">
          <RouteStory
            route={route}
          />
        </div>

        <p className="dc-reveal-body mt-4 text-[11px] leading-5 text-zinc-500">
          Stage 1 is already in your collection. This is your Boss Path for
          the season - the wheel never spins twice.
        </p>

        {/* Always in reach on a phone, even before scrolling the story. */}
        <div className="dc-reveal-actions sticky bottom-0 -mx-5 mt-auto w-[calc(100%+2.5rem)] bg-[linear-gradient(180deg,transparent,#03050f_35%)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
          <NextStepLink
            pathId={
              outcome.pathId
            }
            draftDone={
              draftDone
            }
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}

export function BossPathResult({
  outcome,
  draftDone,
}: {
  outcome: Assigned;
  draftDone: boolean;
}) {
  const {
    route,
  } = outcome;

  return (
    <div className="panel relative overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-72 bg-cover bg-center opacity-50 [mask-image:linear-gradient(180deg,#000_40%,transparent)]"
        style={{
          backgroundImage: `url(${route.arenaImage})`,
        }}
      />

      <div className="relative flex flex-col items-center gap-6 p-5 sm:flex-row sm:items-start sm:p-8">
        <div className="relative aspect-[421/614] w-[min(46vw,190px)] shrink-0">
          <div
            aria-hidden="true"
            className="dc-aura dc-aura-forever pointer-events-none absolute -inset-[25%] rounded-full"
          />

          <div className="relative h-full w-full overflow-hidden rounded-2xl border border-amber-200/50 bg-[#05081a] p-2 shadow-[0_0_40px_rgba(255,216,110,.25)]">
            <StageCardFace
              card={
                route.stageOneCard
              }
              routeName={
                route.name
              }
            />
          </div>
        </div>

        <div className="w-full min-w-0 text-center sm:text-left">
          <p className="hud-label inline-flex items-center gap-1.5 text-amber-300/85">
            <Crown
              size={11}
            />
            Your Boss Path
          </p>

          <h2 className="gold-text mt-2 text-3xl font-black leading-tight">
            {route.name}
          </h2>

          {route.stageOneCard && (
            <p className="mt-1.5 text-xs font-black uppercase tracking-wider text-zinc-400">
              Stage 1 ·{" "}
              {
                route.stageOneCard
                  .name
              }
            </p>
          )}

          <div className="mt-4">
            <RouteStory
              route={route}
            />
          </div>

          <div className="mt-6">
            <NextStepLink
              pathId={
                outcome.pathId
              }
              draftDone={
                draftDone
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================
// THE WHEEL
// =========================================================

export function BossPathWheel({
  routes,
  assigned,
  draftDone,
}: {
  routes: WheelRoute[];
  assigned:
    | Assigned
    | null;
  draftDone: boolean;
}) {
  // Frozen on first render (see header).
  const [
    slices,
    setSlices,
  ] = useState(routes);

  const [
    outcome,
    setOutcome,
  ] = useState<Assigned | null>(
    assigned
  );

  const [
    phase,
    setPhase,
  ] = useState<Phase>(
    assigned
      ? "revealed"
      : "idle"
  );

  const [
    revealOpen,
    setRevealOpen,
  ] = useState(false);

  const [
    winnerIndex,
    setWinnerIndex,
  ] = useState<number | null>(
    null
  );

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  const rawId =
    useId();

  const clipId = `wheel-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const wheelRef =
    useRef<HTMLDivElement>(null);

  const pointerRef =
    useRef<HTMLDivElement>(null);

  const tickerRef =
    useRef<HTMLSpanElement>(null);

  const slicesRef =
    useRef(slices);

  const motionRef =
    useRef<WheelMotion | null>(
      null
    );

  const timersRef =
    useRef<number[]>([]);

  const audioRef =
    useRef<AudioContext | null>(
      null
    );

  const lastClickRef =
    useRef(0);

  useEffect(() => {
    preloadSounds([
      "whoosh",
      "boom",
      "rise",
      "chime",
    ]);

    const timers =
      timersRef.current;

    return () => {
      motionRef.current?.stop();

      timers.forEach(
        (timer) =>
          window.clearTimeout(
            timer
          )
      );

      audioRef.current
        ?.close()
        .catch(() => {});
    };
  }, []);

  // A tiny synthesized click per slice: an <audio> file per tick
  // lags on iPhone, Web Audio does not.
  function click() {
    const context =
      audioRef.current;

    if (
      !context ||
      !isSoundOn()
    ) {
      return;
    }

    const now =
      context.currentTime;

    const oscillator =
      context.createOscillator();

    const gain =
      context.createGain();

    oscillator.type =
      "triangle";

    oscillator.frequency.setValueAtTime(
      1600,
      now
    );

    oscillator.frequency.exponentialRampToValueAtTime(
      650,
      now + 0.045
    );

    gain.gain.setValueAtTime(
      0.0001,
      now
    );

    gain.gain.exponentialRampToValueAtTime(
      0.13,
      now + 0.004
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + 0.055
    );

    oscillator
      .connect(gain)
      .connect(
        context.destination
      );

    oscillator.start(now);
    oscillator.stop(
      now + 0.06
    );
  }

  function onSlice(
    index: number,
    now: number
  ) {
    if (tickerRef.current) {
      tickerRef.current.textContent =
        slicesRef.current[
          index
        ]?.name ?? "";
    }

    if (
      now -
        lastClickRef.current <
      38
    ) {
      return;
    }

    lastClickRef.current =
      now;

    click();

    pointerRef.current?.animate(
      [
        {
          transform:
            "rotate(-16deg)",
        },
        {
          transform:
            "rotate(0deg)",
        },
      ],
      {
        duration: 140,
        easing:
          "cubic-bezier(.2,.8,.2,1)",
      }
    );
  }

  function onLanded(
    index: number
  ) {
    setWinnerIndex(index);
    setPhase("landed");
    play("boom");

    timersRef.current.push(
      window.setTimeout(
        () => {
          setPhase(
            "revealed"
          );

          setRevealOpen(true);

          play("rise");
          play(
            "chime",
            600
          );
        },
        prefersReducedMotion()
          ? 300
          : 900
      )
    );
  }

  function motion() {
    if (!motionRef.current) {
      motionRef.current =
        createWheelMotion({
          apply: (angle) => {
            if (wheelRef.current) {
              wheelRef.current.style.transform = `rotate(${angle}deg)`;
            }
          },
          onSlice,
          onLanded,
          sliceCount:
            slicesRef.current
              .length,
        });
    }

    return motionRef.current;
  }

  function startSpin() {
    if (
      phase !== "idle" ||
      slices.length === 0
    ) {
      return;
    }

    setError(null);
    setPhase("spinning");
    play("whoosh");

    // A user gesture: the only moment iOS lets a page start audio.
    if (
      isSoundOn() &&
      !audioRef.current
    ) {
      try {
        const AudioContextClass =
          window.AudioContext ??
          (
            window as unknown as {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;

        if (AudioContextClass) {
          audioRef.current =
            new AudioContextClass();
        }
      } catch {
        audioRef.current =
          null;
      }
    }

    if (
      !prefersReducedMotion()
    ) {
      motion().spinFree();
    }
  }

  function land(
    result: Assigned
  ) {
    let current =
      slicesRef.current;

    let index =
      current.findIndex(
        (route) =>
          route.id ===
          result.route.id
      );

    // Someone took a route between page load and this spin and the
    // server handed out one the wheel didn't show: add it.
    if (index < 0) {
      current = [
        ...current,
        result.route,
      ];

      slicesRef.current =
        current;

      setSlices(current);

      index =
        current.length -
        1;
    }

    setOutcome(result);

    const reduced =
      prefersReducedMotion();

    motion().landOn(
      index,
      current.length,
      reduced
    );

    if (
      motionRef.current?.isLanding()
    ) {
      setPhase("landing");
    }
  }

  const [
    ,
    formAction,
  ] = useActionState(
    async (): Promise<SpinWheelState> => {
      const result =
        await spinBossPathWheel();

      if (
        result.status ===
        "spun"
      ) {
        land({
          pathId:
            result.pathId,
          route:
            result.route,
        });
      } else if (
        result.status ===
        "error"
      ) {
        motionRef.current?.stop();
        setPhase("idle");
        setError(
          result.message
        );
      }

      return result;
    },
    INITIAL_STATE
  );

  const closeReveal =
    useCallback(() => {
      setRevealOpen(false);
    }, []);

  // Already assigned (reload) or the reveal was closed: the result.
  if (
    outcome &&
    phase ===
      "revealed" &&
    !revealOpen
  ) {
    return (
      <BossPathResult
        outcome={outcome}
        draftDone={
          draftDone
        }
      />
    );
  }

  if (
    slices.length === 0
  ) {
    return (
      <div className="panel mx-auto flex max-w-lg flex-col items-center gap-3 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-300/25 bg-amber-300/10 text-amber-200">
          <Crown
            size={20}
          />
        </div>

        <h2 className="text-lg font-black text-zinc-100">
          Every Boss Path is taken
        </h2>

        <p className="text-sm leading-6 text-zinc-400">
          Each route can belong to only one duelist in your league, and
          all of them have been claimed. Ask the league admin for help.
        </p>
      </div>
    );
  }

  const spinning =
    phase ===
      "spinning" ||
    phase ===
      "landing";

  return (
    <div className="flex flex-col items-center">
      {revealOpen &&
        outcome && (
          <RouteReveal
            outcome={outcome}
            draftDone={
              draftDone
            }
            onClose={
              closeReveal
            }
          />
        )}

      <div
        className="relative mt-2 aspect-square w-[min(84vw,440px,calc(100svh-23rem))] min-w-[260px] select-none"
        data-wheel-spinning={
          spinning
            ? ""
            : undefined
        }
      >
        <div
          aria-hidden="true"
          className="dc-wheel-glow pointer-events-none absolute -inset-[9%] rounded-full bg-[radial-gradient(closest-side,rgb(242_196_90/.32),rgb(64_98_200/.12)_60%,transparent)]"
        />

        <div
          ref={wheelRef}
          className="absolute inset-[2.5%] rounded-full shadow-[0_30px_80px_rgba(0,0,0,.65)] will-change-transform"
        >
          <WheelFace
            slices={slices}
            winnerIndex={
              winnerIndex
            }
            clipId={clipId}
          />
        </div>

        <WheelRim />

        {/* Hub */}
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 flex h-[21%] w-[21%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-amber-300/80 bg-[radial-gradient(circle_at_40%_35%,#2a3470,#070a1c_70%)] shadow-[0_0_30px_rgba(255,216,110,.35),inset_0_0_18px_rgba(0,0,0,.8)]"
        >
          <EyeOfWudjat className="h-[46%] w-[62%] text-amber-200" />
        </div>

        {/* Pointer */}
        <div
          ref={pointerRef}
          aria-hidden="true"
          className="absolute left-1/2 top-[-3%] z-10 h-[13%] w-[9%] -translate-x-1/2"
          style={{
            transformOrigin:
              "50% 12%",
          }}
        >
          <svg
            viewBox="0 0 36 52"
            className="h-full w-full drop-shadow-[0_4px_8px_rgba(0,0,0,.7)]"
          >
            <defs>
              <linearGradient
                id={`${clipId}-pin`}
                x1="0"
                y1="0"
                x2="1"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="#fff1b3"
                />

                <stop
                  offset="100%"
                  stopColor="#b8852c"
                />
              </linearGradient>
            </defs>

            <path
              d="M18 50 L3 14 A16 16 0 1 1 33 14 Z"
              fill={`url(#${clipId}-pin)`}
              stroke="#5a3d10"
              strokeWidth={1.5}
            />

            <circle
              cx={18}
              cy={14}
              r={5.5}
              fill="#070a1c"
            />
          </svg>
        </div>
      </div>

      <p
        className="mt-3 min-h-[1.75rem] text-center text-lg font-black text-amber-100 sm:mt-5"
        aria-hidden="true"
      >
        <span
          ref={tickerRef}
        >
          {spinning ||
          phase ===
            "landed"
            ? ""
            : `${slices.length} Boss Path${slices.length === 1 ? "" : "s"} on the wheel`}
        </span>
      </p>

      <p
        className="sr-only"
        aria-live="polite"
      >
        {phase === "spinning" ||
        phase === "landing"
          ? "The wheel is spinning."
          : outcome &&
              phase !== "idle"
            ? `The wheel stopped on ${outcome.route.name}.`
            : ""}
      </p>

      <ul className="sr-only">
        {slices.map(
          (route) => (
            <li
              key={
                route.id
              }
            >
              {route.name}
            </li>
          )
        )}
      </ul>

      {error && (
        <p
          role="alert"
          className="mt-4 max-w-md rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-center text-sm font-bold text-red-200"
        >
          {error}
        </p>
      )}

      <div className="mt-3 flex w-full max-w-sm flex-col items-center gap-3 sm:mt-5">
        {/* Stays mounted while spinning: removing the form in the
            same tap would cancel its submit. */}
        {(phase === "idle" ||
          phase ===
            "spinning") && (
          <form
            action={
              formAction
            }
            className="w-full"
          >
            <SubmitButton
              pendingLabel="Spinning..."
              onClick={
                startSpin
              }
              className="primary-button inline-flex min-h-12 w-full items-center justify-center gap-2 text-base"
            >
              <Sparkles
                size={17}
              />
              Spin the Wheel
            </SubmitButton>
          </form>
        )}


        {phase ===
          "landing" && (
          <button
            type="button"
            onClick={() =>
              motionRef.current?.skip()
            }
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-amber-300/25 bg-[#05081a]/70 px-3 text-xs font-black text-amber-200 transition-colors hover:bg-amber-300/10"
          >
            <SkipForward
              size={12}
            />
            Skip
          </button>
        )}

        {phase ===
          "landed" &&
          outcome && (
            <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-200">
              <ScrollText
                size={13}
              />
              {outcome.route.name}
            </p>
          )}

        {phase === "idle" && (
          <p className="text-center text-[11px] leading-5 text-zinc-500">
            One spin, no re-spins. The wheel only holds Boss Paths nobody in
            your league has yet.
          </p>
        )}
      </div>
    </div>
  );
}
