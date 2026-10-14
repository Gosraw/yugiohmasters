"use client";

import {
  Flag,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
} from "lucide-react";

import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

import {
  ActionRecorder,
  DRAW,
  HALF_X_OF,
  MAX_TICKS,
  ROW_OF,
  TABLEAU_SIZE,
  TICKS_PER_SECOND,
  applyAction,
  canActAt,
  canPlayCard,
  createPeaks,
  decodeActions,
  isUncovered,
  peaksScore,
  simulateActions,
  type PeaksInputs,
  type PeaksSim,
  type RunEnd,
} from "@/lib/games/peaks-engine";

import type {
  SubmitGameRunResult,
} from "@/lib/games/server-runs";

import {
  play,
} from "@/lib/sound";

import {
  CardBack,
  CardFace,
  cardName,
} from "./peaks-card";

// =========================================================
// GIZA PEAKS - the full-screen play view (and its game-over card,
// so "Play again" restarts in place).
//
// Turn-based, so there is no simulation loop: the engine only
// changes when the player acts. A requestAnimationFrame loop just
// runs the RUN CLOCK (60 ticks per second, stopped while paused or
// hidden); every action is stamped with it. Actions closer together
// than the engine allows (MIN_ACTION_GAP) wait in a one-slot queue
// for a few ticks instead of being lost. Refused plays (wrong rank,
// covered card) only shake the card and are never recorded, so the
// server replay sees exactly the accepted actions.
//
// Cards are DOM elements keyed by round + card id and positioned
// with transforms, so a played card simply transitions from its
// tableau slot to the waste; uncovered cards flip with a 2D
// scaleX turn (no 3D flip: that was flaky on mobile Safari in the
// pack opening). Everything is still with prefers-reduced-motion.
//
// Helper: after HINT_IDLE_TICKS without an action the playable
// cards glow (or the stock, when nothing fits). It never says
// WHICH play is best, so planning chains stays the skill.
// =========================================================

const STEP_MS =
  1000 / TICKS_PER_SECOND;

/** A tap that comes too soon waits at most this long for its turn. */
const QUEUE_TICKS = 20;

/** Idle time before playable cards glow. */
const HINT_IDLE_TICKS =
  6 * TICKS_PER_SECOND;

const SAVE_KEY = "dc.peaks.openRun.v1";

/** Tap-anywhere restart is ignored this long after the card shows. */
const RESTART_GUARD_MS = 650;

/** "No moves" stays up this long before the game-over card. */
const NO_MOVES_BEAT_MS = 1500;

const DEAL_STAGGER_MS = 18;

const DEAL_FLIGHT_MS = 340;

/** Pause after a clear before the next round flies out. */
const CLEAR_PAUSE_MS = 520;

const MOVE_MS = 240;

/** Waste / stock cards are this much bigger than tableau cards. */
const TRAY_SCALE = 1.45;

// Own keyframes (kept here so the shared globals.css stays untouched).
const PEAKS_CSS = `
.peaks-column { max-width: calc(100dvh * 0.62); }
@media (orientation: landscape) {
  .peaks-column { max-width: max(calc(100dvh * 0.62), min(100vw, calc(100dvh * 1.3))); }
}
@media (orientation: landscape) and (max-height: 540px) {
  .peaks-column { max-width: none; }
}
@keyframes peaks-banner {
  0% { opacity: 0; transform: scale(.72); }
  14% { opacity: 1; transform: scale(1.06); }
  24% { transform: scale(1); }
  72% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.04); }
}
@keyframes peaks-flip {
  0% { transform: scaleX(0); filter: brightness(1.8); }
  100% { transform: scaleX(1); filter: brightness(1); }
}
@keyframes peaks-burst {
  0% { opacity: .95; transform: translate(-50%, -50%) scale(.2); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(2.4); }
}
@keyframes peaks-float {
  0% { opacity: 0; transform: translate(-50%, 0) scale(.8); }
  15% { opacity: 1; transform: translate(-50%, -6px) scale(1.05); }
  100% { opacity: 0; transform: translate(-50%, -46px) scale(1); }
}
@keyframes peaks-pop {
  0% { transform: scale(.7); }
  45% { transform: scale(1.18); }
  100% { transform: scale(1); }
}
@keyframes peaks-hint {
  0%, 100% { opacity: .35; }
  50% { opacity: 1; }
}
.peaks-banner { animation: peaks-banner 1.5s cubic-bezier(.2, .8, .2, 1) both; }
.peaks-flip { animation: peaks-flip 200ms cubic-bezier(.2, .8, .2, 1) both; }
.peaks-burst { animation: peaks-burst 720ms cubic-bezier(.15, .7, .3, 1) both; }
.peaks-float { animation: peaks-float 900ms cubic-bezier(.2, .8, .2, 1) both; }
.peaks-pop { animation: peaks-pop 260ms cubic-bezier(.2, .9, .3, 1.2) both; }
.peaks-hint { animation: peaks-hint 1.1s ease-in-out infinite; }
@media (hover: hover) {
  .peaks-card[data-playable="true"]:hover .peaks-lift { transform: translateY(-3px); }
}
.peaks-lift { transition: transform 120ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  @keyframes peaks-banner-fade {
    0%, 70% { opacity: 1; }
    100% { opacity: 0; }
  }
  .peaks-banner { animation: peaks-banner-fade 1.5s linear both; }
  .peaks-flip, .peaks-burst, .peaks-pop { animation: none; }
  .peaks-burst { opacity: 0; }
  .peaks-float { animation: peaks-banner-fade .9s linear both; transform: translate(-50%, -20px); }
  .peaks-hint { animation: none; opacity: .8; }
  .peaks-lift { transition: none; }
}
`;

export type SavedPeaksRun = {
  runId: string;
  mode: "daily" | "practice";
  tick: number;
  score: number;
  rec: {
    e: number[];
    lastTick: number;
  };
  savedAt: number;
};

export function readSavedPeaksRun(): SavedPeaksRun | null {
  try {
    const raw =
      window.localStorage.getItem(SAVE_KEY);

    if (!raw) return null;

    const parsed =
      JSON.parse(raw) as SavedPeaksRun;

    if (
      typeof parsed?.runId !== "string" ||
      !Array.isArray(parsed?.rec?.e)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clearSavedPeaksRun() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
}

function writeSavedPeaksRun(
  run: SavedPeaksRun
) {
  try {
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(run)
    );
  } catch {
    // Storage full / blocked: resume just won't be offered.
  }
}

export type PeaksRun = {
  runId: string;
  seed: string;
  mode: "daily" | "practice";
  resume: SavedPeaksRun | null;
  /** Your weekly best when the run started. */
  previousBest: number | null;
};

export type PeaksOutcome = {
  score: number;
  inputs: PeaksInputs;
  rounds: number;
  bestChain: number;
  peaks: number;
  crashed?: boolean;
};

export type PeaksResult = {
  mode: "daily" | "practice";
  end?: RunEnd;
  score: number;
  rounds: number;
  bestChain: number;
  peaks: number;
  previousBest: number | null;
  /** null while the server replays the run. */
  response: SubmitGameRunResult | null;
};

type Props = {
  run: PeaksRun;
  result: PeaksResult | null;
  canPlayAgain: boolean;
  starting: boolean;
  error: string | null;
  onFinished: (outcome: PeaksOutcome) => void;
  /** Ended before the first action: the run is still open. */
  onAbandon: () => void;
  onPlayAgain: () => void;
  onExit: () => void;
  crashRef?: RefObject<(() => void) | null>;
};

/** Catches a render crash: ends the run with the actions so far. */
export class PeaksCrashGuard extends Component<
  {
    children: ReactNode;
    onCrash: () => void;
  },
  {
    crashed: boolean;
  }
> {
  state = {
    crashed: false,
  };

  static getDerivedStateFromError() {
    return {
      crashed: true,
    };
  }

  componentDidCatch(
    error: unknown
  ) {
    console.error("Giza Peaks crashed", error);
    this.props.onCrash();
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-[rgb(3_5_15/.94)] px-6 text-center text-sm text-zinc-300">
          Something went wrong. Saving your run...
        </div>
      );
    }

    return this.props.children;
  }
}

/** Plain copy of what the screen shows (rendering never reads refs). */
type Snap = {
  round: number;
  tableau: number[];
  uncovered: boolean[];
  playable: boolean[];
  stockTop: number | null;
  stockCount: number;
  /** Last two waste cards, top last. */
  waste: number[];
  score: number;
  chain: number;
  bestChain: number;
  roundsCleared: number;
  peaksTaken: number;
  over: boolean;
};

function snapOf(
  sim: PeaksSim
): Snap {
  const uncovered: boolean[] = [];
  const playable: boolean[] = [];

  for (let i = 0; i < TABLEAU_SIZE; i++) {
    uncovered.push(isUncovered(sim, i));
    playable.push(canPlayCard(sim, i));
  }

  return {
    round: sim.round,
    tableau: [...sim.tableau],
    uncovered,
    playable,
    stockTop: sim.stock.length > 0
      ? sim.stock[sim.stock.length - 1]
      : null,
    stockCount: sim.stock.length,
    waste: sim.waste.slice(-2),
    score: peaksScore(sim),
    chain: sim.chain,
    bestChain: sim.bestChain,
    roundsCleared: sim.roundsCleared,
    peaksTaken: sim.peaksTaken,
    over: sim.over,
  };
}

type Layout = {
  w: number;
  h: number;
  /** Stock / waste cards are this much bigger than tableau cards. */
  tray: number;
  slots: {
    x: number;
    y: number;
  }[];
  stock: {
    x: number;
    y: number;
  };
  waste: {
    x: number;
    y: number;
  };
  /** Centre of the chain counter (between the tableau and the tray). */
  chainX: number;
  chainY: number;
};

/**
 * Portrait: tableau on top, stock + waste side by side under it
 * (near the thumb). Spare height on tall phones opens the rows up
 * and enlarges the stock / waste instead of leaving a gap.
 */
function stackedLayout(
  width: number,
  height: number,
  insetTop: number,
  insetBottom: number
): Layout {
  const gutter = 5;
  const gap = Math.max(2, Math.round(width * 0.008));
  const hudBottom = insetTop + 112;
  const helpHeight = insetBottom + 34;

  // Height needed for the tableau (2.8 h) + tray (TRAY_SCALE h + labels).
  let w = (width - 2 * gutter - 9 * gap) / 10;

  w = Math.min(
    w,
    (height - hudBottom - helpHeight - 120) / (1.45 * (2.8 + TRAY_SCALE)),
    92
  );

  w = Math.max(16, Math.floor(w));

  const h = Math.round(w * 1.45);

  const spare = Math.max(
    0,
    height - helpHeight - 24 - Math.round(h * TRAY_SCALE) -
      56 - hudBottom - (h + 3 * Math.round(h * 0.6))
  );

  const rowStep = Math.round(h * 0.6 + Math.min(h * 0.15, (spare * 0.25) / 3));
  const tray = Math.min(1.85, TRAY_SCALE + (spare * 0.25) / h);
  const tableauWidth = 10 * w + 9 * gap;
  const tableauHeight = h + 3 * rowStep;
  const left = Math.round((width - tableauWidth) / 2);
  const trayHeight = Math.round(h * tray);
  const trayTop = height - helpHeight - 24 - trayHeight;
  const room = Math.max(0, trayTop - 56 - hudBottom - tableauHeight);
  const tableauTop = Math.round(hudBottom + room * 0.5);

  const slots = HALF_X_OF.map(
    (half, i) => ({
      x: left + (half * (w + gap)) / 2,
      y: tableauTop + ROW_OF[i] * rowStep,
    })
  );

  const trayWidth = w * tray;
  const pairWidth = trayWidth * 2.5;
  const stockX = Math.round(width / 2 - pairWidth / 2);

  return {
    w,
    h,
    tray,
    slots,
    stock: {
      x: stockX,
      y: trayTop,
    },
    waste: {
      x: Math.round(stockX + trayWidth * 1.5),
      y: trayTop,
    },
    chainX: Math.round(width / 2),
    chainY: Math.round((tableauTop + tableauHeight + trayTop) / 2),
  };
}

/**
 * Landscape (phone on its side, wide windows): stock above waste
 * in a column right of the tableau, so the cards can use the full
 * height instead of shrinking to fit a portrait stack.
 */
function sideLayout(
  width: number,
  height: number,
  insetTop: number,
  insetBottom: number
): Layout {
  const gutter = 10;
  const gap = Math.max(2, Math.round(width * 0.004));
  const hudBottom = insetTop + 80;
  const helpHeight = insetBottom + 30;
  const tray = 1.2;
  const sideGap = 28;
  const pauseBottom = insetTop + 64;

  let w = Math.min(
    (width - 2 * gutter - 9 * gap - sideGap) / (10 + tray),
    // Tableau + the chain counter under it.
    (height - hudBottom - helpHeight - 44) / (1.45 * 2.8),
    // Stock + label + waste + label, under the pause button.
    (height - pauseBottom - helpHeight - 64) / (2 * 1.45 * tray),
    92
  );

  w = Math.max(16, Math.floor(w));

  const h = Math.round(w * 1.45);
  const rowStep = Math.round(h * 0.6);
  const tableauWidth = 10 * w + 9 * gap;
  const tableauHeight = h + 3 * rowStep;
  const trayWidth = Math.round(w * tray);
  const trayHeight = Math.round(h * tray);
  const left = Math.round((width - (tableauWidth + sideGap + trayWidth)) / 2);
  const room = Math.max(0, height - helpHeight - 44 - hudBottom - tableauHeight);
  const tableauTop = Math.round(hudBottom + room * 0.4);

  const slots = HALF_X_OF.map(
    (half, i) => ({
      x: left + (half * (w + gap)) / 2,
      y: tableauTop + ROW_OF[i] * rowStep,
    })
  );

  const trayX = left + tableauWidth + sideGap;
  const columnHeight = 2 * trayHeight + 34;
  const stockY = Math.max(
    pauseBottom,
    Math.round((height - helpHeight - columnHeight) / 2 + 8)
  );

  return {
    w,
    h,
    tray,
    slots,
    stock: {
      x: trayX,
      y: stockY,
    },
    waste: {
      x: trayX,
      y: stockY + trayHeight + 34,
    },
    chainX: Math.round(left + tableauWidth / 2),
    chainY: Math.round(tableauTop + tableauHeight + 24),
  };
}

function pickLayout(
  width: number,
  height: number,
  insetTop: number,
  insetBottom: number
): Layout {
  const stacked =
    stackedLayout(width, height, insetTop, insetBottom);

  if (width < height * 1.15) return stacked;

  const side =
    sideLayout(width, height, insetTop, insetBottom);

  return side.w > stacked.w
    ? side
    : stacked;
}

/** Safe-area insets (notch / home bar), read from a probe element. */
function readInsets(
  probe: HTMLElement | null
) {
  const style = probe
    ? getComputedStyle(probe)
    : null;

  const px = (
    value: string | undefined
  ) => parseFloat(value ?? "") || 0;

  return {
    top: px(style?.paddingTop),
    bottom: px(style?.paddingBottom),
    left: px(style?.paddingLeft),
    right: px(style?.paddingRight),
  };
}

function computeLayout(
  width: number,
  height: number,
  probe: HTMLElement | null
): Layout {
  const insets =
    readInsets(probe);

  // A phone on its side has the notch on the left or right: lay
  // out inside the safe width, then shift everything past it.
  const layout =
    pickLayout(
      width - insets.left - insets.right,
      height,
      insets.top,
      insets.bottom
    );

  const dx = insets.left;

  if (dx === 0) return layout;

  return {
    ...layout,
    slots: layout.slots.map(
      (slot) => ({
        x: slot.x + dx,
        y: slot.y,
      })
    ),
    stock: {
      x: layout.stock.x + dx,
      y: layout.stock.y,
    },
    waste: {
      x: layout.waste.x + dx,
      y: layout.waste.y,
    },
    chainX: layout.chainX + dx,
  };
}

type Banner = {
  key: number;
  title: string;
  sub: string | null;
  tone: "gold" | "rose";
};

type Fx = {
  key: number;
  x: number;
  y: number;
  text?: string;
};

/** 0 = all on the stock, 1 = flying out, 2 = landed (faces up). */
type DealPhase = {
  round: number;
  phase: 0 | 1 | 2;
};

function PeakMarks({
  tableau,
}: {
  tableau: number[];
}) {
  return (
    <div
      aria-hidden
      className="flex items-center gap-1.5"
    >
      {[0, 1, 2].map(
        (peak) => {
          const taken =
            tableau[peak] < 0;

          return (
            <svg
              key={peak}
              viewBox="0 0 12 10"
              className={`h-2.5 w-3 transition-colors duration-200 ${
                taken
                  ? "text-amber-300 drop-shadow-[0_0_6px_rgba(255,216,110,.8)]"
                  : "text-amber-200/35"
              }`}
            >
              <path
                d="M6 0.8 L11.2 9.2 H0.8 Z"
                fill={taken ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
          );
        }
      )}
    </div>
  );
}

export function PeaksPlay({
  run,
  result,
  canPlayAgain,
  starting,
  error,
  onFinished,
  onAbandon,
  onPlayAgain,
  onExit,
  crashRef,
}: Props) {
  const wrapperRef =
    useRef<HTMLDivElement>(null);

  const containerRef =
    useRef<HTMLDivElement>(null);

  const againRef =
    useRef<HTMLButtonElement>(null);

  /** Invisible probe whose padding = the safe-area insets. */
  const insetRef =
    useRef<HTMLDivElement>(null);

  /** Inner element per card key, for the "nope" shake. */
  const cardEls =
    useRef(new Map<string, HTMLDivElement>());

  const resuming =
    run.resume !== null &&
    run.resume.runId === run.runId &&
    run.resume.rec.e.length > 0;

  const [paused, setPaused] =
    useState(resuming);

  const pausedRef =
    useRef(resuming);

  const finishedRef =
    useRef(false);

  const [confirmEnd, setConfirmEnd] =
    useState(false);

  const [snap, setSnap] =
    useState<Snap | null>(null);

  const [layout, setLayout] =
    useState<Layout | null>(null);

  const [deal, setDeal] =
    useState<DealPhase>({
      round: 1,
      phase: 0,
    });

  const [banner, setBanner] =
    useState<Banner | null>(null);

  const [floats, setFloats] =
    useState<Fx[]>([]);

  const [bursts, setBursts] =
    useState<Fx[]>([]);

  const [hint, setHint] =
    useState(false);

  const [passedBest, setPassedBest] =
    useState(false);

  const [timeLeft, setTimeLeft] =
    useState<number | null>(null);

  const simRef =
    useRef<PeaksSim | null>(null);

  const recorderRef =
    useRef<ActionRecorder | null>(null);

  /** Current run-clock tick. */
  const tickRef =
    useRef(0);

  /** Player action entry point (set by the run effect). */
  const actRef =
    useRef<((action: number) => void) | null>(null);

  const resultShownAt =
    useRef(0);

  const onFinishedRef =
    useRef(onFinished);

  const onAbandonRef =
    useRef(onAbandon);

  const onPlayAgainRef =
    useRef(onPlayAgain);

  const canRestartRef =
    useRef(false);

  useEffect(() => {
    onFinishedRef.current = onFinished;
    onAbandonRef.current = onAbandon;
    onPlayAgainRef.current = onPlayAgain;
  }, [onFinished, onAbandon, onPlayAgain]);

  const resultReady =
    result !== null &&
    result.response !== null;

  useEffect(() => {
    canRestartRef.current =
      resultReady &&
      canPlayAgain &&
      !starting;

    if (resultReady) {
      resultShownAt.current = performance.now();
      againRef.current?.focus({
        preventScroll: true,
      });
    }
  }, [resultReady, canPlayAgain, starting]);

  const save = useCallback(() => {
    const sim = simRef.current;
    const recorder = recorderRef.current;

    if (
      !sim ||
      !recorder ||
      finishedRef.current ||
      recorder.snapshot().e.length === 0
    ) {
      return;
    }

    writeSavedPeaksRun({
      runId: run.runId,
      mode: run.mode,
      tick: tickRef.current,
      score: peaksScore(sim),
      rec: recorder.snapshot(),
      savedAt: Date.now(),
    });
  }, [run.runId, run.mode]);

  const finish = useCallback((
    end: RunEnd,
    crashed = false
  ) => {
    const sim = simRef.current;
    const recorder = recorderRef.current;

    if (
      !sim ||
      !recorder ||
      finishedRef.current
    ) {
      return;
    }

    finishedRef.current = true;

    if (recorder.snapshot().e.length === 0) {
      onAbandonRef.current();
      return;
    }

    clearSavedPeaksRun();

    const ticks =
      Math.min(
        MAX_TICKS,
        Math.max(
          tickRef.current,
          sim.lastActionTick + 1
        )
      );

    onFinishedRef.current({
      score: peaksScore(sim),
      inputs: recorder.finish(
        end,
        ticks
      ),
      rounds: sim.roundsCleared,
      bestChain: sim.bestChain,
      peaks: sim.peaksTaken,
      crashed,
    });
  }, []);

  const setPause = useCallback((
    value: boolean
  ) => {
    if (finishedRef.current) return;

    pausedRef.current = value;
    setPaused(value);
    setConfirmEnd(false);

    if (value) save();
  }, [save]);

  // ---------------------------------------------------------
  // Main effect: one per run (a new run id restarts in place).
  // ---------------------------------------------------------

  useEffect(() => {
    const container = containerRef.current;
    const wrapper = wrapperRef.current;

    if (!container || !wrapper) return;

    const reducedMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let sim: PeaksSim;
    let recorder: ActionRecorder;
    let baseTick = 0;

    // Only a run with recorded actions resumes (an untouched one
    // simply starts fresh with the same seed).
    const saved =
      run.resume &&
      run.resume.runId === run.runId &&
      run.resume.rec.e.length > 0
        ? run.resume
        : null;

    const savedEnd = saved
      ? Math.max(saved.tick, saved.rec.lastTick) + 1
      : 0;

    const actions = saved
      ? decodeActions(saved.rec.e, savedEnd)
      : null;

    const replayed =
      saved && actions
        ? simulateActions(run.seed, actions)
        : null;

    if (
      saved &&
      replayed &&
      replayed.refusedAt < 0 &&
      !replayed.sim.over
    ) {
      sim = replayed.sim;
      recorder = ActionRecorder.restore(saved.rec);
      baseTick = Math.max(saved.tick, saved.rec.lastTick);
    } else {
      sim = createPeaks(run.seed);
      recorder = new ActionRecorder();
    }

    simRef.current = sim;
    recorderRef.current = recorder;
    finishedRef.current = false;
    tickRef.current = baseTick;

    const isResume =
      recorder.snapshot().e.length > 0;

    pausedRef.current = isResume;
    setPaused(isResume);
    setConfirmEnd(false);
    setSnap(snapOf(sim));
    setBanner(null);
    setFloats([]);
    setBursts([]);
    setHint(false);
    setPassedBest(false);
    setTimeLeft(null);

    const timers = new Set<number>();

    const later = (
      fn: () => void,
      ms: number
    ) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);

      timers.add(id);
    };

    // ---- layout ----
    const measure = () => {
      const rect = container.getBoundingClientRect();

      setLayout(
        computeLayout(
          rect.width,
          rect.height,
          insetRef.current
        )
      );
    };

    measure();

    const resizeObserver =
      new ResizeObserver(measure);

    resizeObserver.observe(container);

    // ---- deal animation ----
    /** Input is ignored until the cards have landed. */
    let settled = false;

    const dealDuration =
      DEAL_STAGGER_MS * TABLEAU_SIZE + DEAL_FLIGHT_MS + 60;

    const startDeal = (
      round: number,
      delay: number
    ) => {
      settled = false;

      if (reducedMotion) {
        setDeal({
          round,
          phase: 2,
        });
        later(() => {
          settled = true;
        }, delay);
        return;
      }

      setDeal({
        round,
        phase: 0,
      });

      later(() => {
        setDeal({
          round,
          phase: 1,
        });
        play("whoosh", 0, 0.25, 0.8);
      }, delay + 40);

      later(() => {
        setDeal({
          round,
          phase: 2,
        });
        settled = true;
        play("tap", 0, 0.35, 1.2);
      }, delay + 40 + dealDuration);
    };

    let bannerKey = 0;
    let fxKey = 0;

    const showBanner = (
      title: string,
      sub: string | null,
      tone: Banner["tone"] = "gold"
    ) => {
      bannerKey += 1;
      setBanner({
        key: bannerKey,
        title,
        sub,
        tone,
      });
    };

    if (isResume) {
      // Resumed runs open paused with the cards already on the table.
      later(() => {
        setDeal({
          round: sim.round,
          phase: 2,
        });
        settled = true;
      }, 0);
    } else {
      startDeal(sim.round, 120);
      showBanner(
        `Round ${sim.round}`,
        `${sim.stock.length} cards in the stock`
      );
    }

    const canVibrate =
      typeof navigator.vibrate === "function";

    const buzz = (
      pattern: number | number[]
    ) => {
      if (canVibrate) {
        try {
          navigator.vibrate(pattern);
        } catch {
          // Not allowed here; fine.
        }
      }
    };

    const best =
      run.previousBest ?? 0;

    let bestPassed = false;
    let hintShown = false;
    let overAt = 0;
    let queued: {
      action: number;
      at: number;
    } | null = null;

    const layoutNow = () =>
      computeLayout(
        container.getBoundingClientRect().width,
        container.getBoundingClientRect().height,
        insetRef.current
      );

    const shake = (
      index: number
    ) => {
      const el =
        cardEls.current.get(`${sim.round}:${sim.tableau[index]}`);

      buzz(8);

      if (!el || reducedMotion) return;

      el.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-4px)" },
          { transform: "translateX(4px)" },
          { transform: "translateX(-2px)" },
          { transform: "translateX(0)" },
        ],
        {
          duration: 240,
          easing: "ease-out",
        }
      );
    };

    const perform = (
      action: number,
      tick: number
    ) => {
      const roundBefore = sim.round;
      const before = snapOf(sim);
      const refused = applyAction(sim, tick, action);

      if (refused) {
        if (action >= 0) shake(action);
        return;
      }

      recorder.record(tick, action);

      if (hintShown) {
        hintShown = false;
        setHint(false);
      }

      const geo = layoutNow();

      for (const event of sim.events) {
        switch (event.type) {
          case "draw":
            play("whoosh", 0, 0.22, 1.5);
            buzz(5);
            break;

          case "play": {
            play("tap", 0, 0.6, Math.min(1.7, 0.9 + event.chain * 0.05));
            buzz(event.chain >= 5 ? [8, 20, 8] : 10);

            fxKey += 1;
            const fx: Fx = {
              key: fxKey,
              x: geo.waste.x + (geo.w * geo.tray) / 2,
              y: geo.waste.y - 8,
              text: `+${event.points}`,
            };
            setFloats((list) => [...list.slice(-4), fx]);
            later(() => {
              setFloats((list) => list.filter((item) => item.key !== fx.key));
            }, 950);

            if (event.peak) {
              play("chime", 0, 0.5, 1.2);
              buzz([12, 30, 16]);

              const slot = geo.slots[event.index];
              fxKey += 1;
              const burst: Fx = {
                key: fxKey,
                x: slot.x + geo.w / 2,
                y: slot.y + geo.h / 2,
              };
              setBursts((list) => [...list, burst]);
              later(() => {
                setBursts((list) => list.filter((item) => item.key !== burst.key));
              }, 800);
            }
            break;
          }

          case "clear":
            play("rise", 60, 0.6);
            play("coins", 260, 0.5);
            buzz([20, 30, 40, 30, 60]);
            showBanner(
              "Peaks cleared!",
              event.stockLeft > 0
                ? `+${event.bonus} · ${event.stockLeft} unused ${event.stockLeft === 1 ? "card" : "cards"} x 50`
                : `+${event.bonus}`
            );
            break;

          case "deal":
            later(() => {
              showBanner(
                `Round ${event.round}`,
                `${event.stock} cards in the stock`
              );
            }, CLEAR_PAUSE_MS + 900);
            break;

          case "nomoves":
            play("seal", 200, 0.5, 0.8);
            buzz([30, 40, 60]);
            showBanner("No moves", "The stock is empty", "rose");
            overAt = performance.now();
            break;
        }
      }

      const cleared =
        sim.round !== roundBefore;

      if (
        !bestPassed &&
        best > 0 &&
        peaksScore(sim) > best
      ) {
        bestPassed = true;
        setPassedBest(true);
        play("coins", 120, 0.4);
      }

      if (cleared) {
        // Show the emptied table with the last card on the waste for
        // a beat, then deal the next round.
        settled = false;

        const empty =
          before.tableau.map(() => false);

        setSnap({
          ...before,
          tableau: before.tableau.map(() => -1),
          uncovered: empty,
          playable: empty,
          waste: [
            ...before.waste.slice(-1),
            before.tableau[action],
          ],
          score: peaksScore(sim),
          chain: before.chain + 1,
          bestChain: sim.bestChain,
          roundsCleared: sim.roundsCleared,
          peaksTaken: sim.peaksTaken,
        });

        later(() => {
          setSnap(snapOf(sim));
          startDeal(sim.round, 0);
        }, reducedMotion ? 0 : CLEAR_PAUSE_MS);
      } else {
        setSnap(snapOf(sim));
      }

      save();
    };

    const act = (
      action: number
    ) => {
      if (
        finishedRef.current ||
        pausedRef.current ||
        sim.over ||
        !settled
      ) {
        return;
      }

      const tick = tickRef.current;

      if (canActAt(sim, tick)) {
        queued = null;
        perform(action, tick);
        return;
      }

      // Too soon after the previous action: wait for the gap.
      if (!queued) {
        queued = {
          action,
          at: tick,
        };
      }
    };

    actRef.current = act;

    // ---- input ----
    const onKeyDown = (
      event: KeyboardEvent
    ) => {
      if (
        event.key === "Escape" ||
        event.key === "p" ||
        event.key === "P"
      ) {
        if (finishedRef.current) return;
        setPause(!pausedRef.current);
        return;
      }

      if (
        event.key === " " ||
        event.key === "Enter" ||
        event.key === "ArrowDown" ||
        event.key === "d" ||
        event.key === "D"
      ) {
        // A focused button handles its own Space / Enter.
        if (event.target instanceof HTMLButtonElement) return;

        event.preventDefault();

        if (event.repeat) return;

        if (finishedRef.current) {
          if (
            canRestartRef.current &&
            performance.now() - resultShownAt.current > RESTART_GUARD_MS
          ) {
            onPlayAgainRef.current();
          }
          return;
        }

        act(DRAW);
      }
    };

    // Tap anywhere on the temple after the run: play again.
    const onPointerDown = (
      event: PointerEvent
    ) => {
      if (!finishedRef.current) return;

      if (
        event.target instanceof Element &&
        event.target.closest("button, a, [data-peaks-ui]")
      ) {
        return;
      }

      if (
        canRestartRef.current &&
        performance.now() - resultShownAt.current > RESTART_GUARD_MS
      ) {
        onPlayAgainRef.current();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    wrapper.addEventListener("pointerdown", onPointerDown);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        setPause(true);
      }
    };

    const onPageHide = () => save();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    let wakeLock: { release: () => Promise<void> } | null = null;

    const nav = navigator as Navigator & {
      wakeLock?: {
        request: (type: "screen") => Promise<{ release: () => Promise<void> }>;
      };
    };

    nav.wakeLock?.request("screen").then(
      (lock) => {
        wakeLock = lock;
      },
      () => {}
    );

    // ---- run clock ----
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let crashed = false;
    let lastWarn = -1;

    const bail = () => {
      if (crashed) return;
      crashed = true;
      cancelAnimationFrame(raf);
      finish("quit", true);
    };

    if (crashRef) {
      crashRef.current = bail;
    }

    const tickFrame = (
      now: number
    ) => {
      const elapsed = Math.min(250, now - last);
      last = now;

      if (
        !pausedRef.current &&
        !finishedRef.current &&
        !sim.over
      ) {
        acc += elapsed;

        while (acc >= STEP_MS) {
          acc -= STEP_MS;
          tickRef.current += 1;
        }
      }

      const tick = tickRef.current;

      if (queued) {
        if (tick - queued.at > QUEUE_TICKS) {
          queued = null;
        } else if (canActAt(sim, tick)) {
          const next = queued;
          queued = null;
          perform(next.action, tick);
        }
      }

      if (
        !hintShown &&
        settled &&
        !sim.over &&
        !pausedRef.current &&
        tick - Math.max(sim.lastActionTick, sim.lockedUntil) > HINT_IDLE_TICKS
      ) {
        hintShown = true;
        setHint(true);
      }

      // Last 2 minutes of the 30-minute run cap: show a countdown.
      const left =
        Math.ceil((MAX_TICKS - tick) / TICKS_PER_SECOND);

      if (
        left <= 120 &&
        left !== lastWarn &&
        !finishedRef.current
      ) {
        lastWarn = left;
        setTimeLeft(left);
      }

      if (
        tick >= MAX_TICKS - 1 &&
        !finishedRef.current &&
        !sim.over
      ) {
        finish("quit");
      }

      if (
        sim.over &&
        overAt > 0 &&
        !finishedRef.current &&
        now - overAt > (reducedMotion ? 900 : NO_MOVES_BEAT_MS)
      ) {
        finish("nomoves");
      }
    };

    const frame = (
      now: number
    ) => {
      raf = requestAnimationFrame(frame);

      try {
        tickFrame(now);
      } catch (error) {
        console.error("Giza Peaks loop crashed", error);
        bail();
      }
    };

    raf = requestAnimationFrame(frame);

    const html = document.documentElement;
    const previousOverscroll = html.style.overscrollBehavior;
    const previousOverflow = document.body.style.overflow;
    html.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      for (const id of timers) window.clearTimeout(id);
      if (crashRef?.current === bail) crashRef.current = null;
      if (actRef.current === act) actRef.current = null;
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      wrapper.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      wakeLock?.release().catch(() => {});
      html.style.overscrollBehavior = previousOverscroll;
      document.body.style.overflow = previousOverflow;
    };
    // One effect per run; previousBest is read once at its start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.runId, run.seed]);

  const endRun = () => {
    if (finishedRef.current) return;
    pausedRef.current = true;
    setPaused(false);
    finish("quit");
  };

  const response =
    result?.response ?? null;

  const newBest =
    result !== null &&
    response?.ok === true &&
    result.score > 0 &&
    (result.previousBest === null || result.score > result.previousBest);

  // ---------------------------------------------------------
  // Cards to draw (one flat list, sorted by key so DOM order never
  // changes while a card flies: moved nodes would skip transitions).
  // ---------------------------------------------------------

  type Item = {
    key: string;
    card: number;
    x: number;
    y: number;
    scale: number;
    z: number;
    faceUp: boolean;
    /** Tableau index, -1 = waste, -2 = stock. */
    slot: number;
    delay: number;
  };

  const items: Item[] = [];

  if (
    snap &&
    layout
  ) {
    const dealing =
      deal.round === snap.round
        ? deal.phase
        : 0;

    const atStock = {
      x: layout.stock.x,
      y: layout.stock.y,
      scale: layout.tray,
    };

    snap.tableau.forEach(
      (card, index) => {
        if (card < 0) return;

        const slot = layout.slots[index];
        const home = dealing === 0
          ? atStock
          : {
              x: slot.x,
              y: slot.y,
              scale: 1,
            };

        items.push({
          key: `${snap.round}:${card}`,
          card,
          ...home,
          z: dealing === 0
            ? 160 - index
            : 10 + ROW_OF[index],
          faceUp: dealing === 2 && snap.uncovered[index],
          slot: index,
          delay: dealing === 1
            ? index * DEAL_STAGGER_MS
            : 0,
        });
      }
    );

    snap.waste.forEach(
      (card, i) => {
        const home = dealing === 0 && snap.waste.length === 1
          ? atStock
          : {
              x: layout.waste.x,
              y: layout.waste.y,
              scale: layout.tray,
            };

        items.push({
          key: `${snap.round}:${card}`,
          card,
          ...home,
          z: 200 + i,
          faceUp: dealing === 2 || snap.waste.length > 1,
          slot: -1,
          delay: dealing === 1
            ? TABLEAU_SIZE * DEAL_STAGGER_MS
            : 0,
        });
      }
    );

    if (snap.stockTop !== null) {
      items.push({
        key: `${snap.round}:${snap.stockTop}`,
        card: snap.stockTop,
        ...atStock,
        z: 150,
        faceUp: false,
        slot: -2,
        delay: 0,
      });
    }

    items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  const dealt =
    snap !== null &&
    deal.round === snap.round &&
    deal.phase === 2;

  const anyPlayable =
    snap?.playable.some(Boolean) ?? false;

  const cardStyle = (
    item: Item
  ) => ({
    width: layout?.w ?? 0,
    height: layout?.h ?? 0,
    transform: `translate3d(${item.x}px, ${item.y}px, 0) scale(${item.scale})`,
    transformOrigin: "0 0",
    zIndex: item.z,
    transition: deal.phase === 0
      ? "none"
      : `transform ${deal.phase === 1 ? DEAL_FLIGHT_MS : MOVE_MS}ms cubic-bezier(.2, .8, .2, 1) ${item.delay}ms`,
    "--w": `${layout?.w ?? 0}px`,
  }) as CSSProperties;

  return (
    <div
      ref={wrapperRef}
      className="fixed inset-0 z-[55] flex h-[100dvh] w-full touch-none select-none justify-center overflow-hidden overscroll-none bg-[radial-gradient(ellipse_at_center,#0b1230_0%,#03050f_70%)] [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none]"
    >
      <style>
        {PEAKS_CSS}
      </style>

      {/* Portrait column on a phone, a centred table on a wide
          window, the full width on a phone held sideways (the
          layout then moves the stock / waste beside the peaks). */}
      <div
        ref={containerRef}
        className="peaks-column @container relative h-full w-full touch-none select-none overflow-hidden overscroll-none bg-[#03050f] bg-[url('/v2/temple-night.jpg')] bg-cover bg-center shadow-[0_0_0_1px_rgba(242,196,90,.18),0_0_60px_rgba(0,0,0,.6)] motion-reduce:[&_*]:!transition-none"
        role="application"
        aria-label="Giza Peaks. Play a face-up card one rank higher or lower than the waste card, or draw from the stock."
      >
        <div
          ref={insetRef}
          aria-hidden
          className="pointer-events-none invisible absolute h-0 w-0 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]"
        />

        {/* Darken the temple so the cards pop; a warm glow behind the peaks. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(6,9,22,.45)_0%,rgba(3,5,15,.8)_62%,rgba(3,5,15,.94)_100%)]" />

        {
          layout
            ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(242,196,90,.16)_0%,rgba(242,196,90,0)_70%)]"
                  style={{
                    left: layout.chainX,
                    top: layout.slots[0].y - layout.h * 0.6,
                    width: layout.w * 12,
                    height: layout.h * 4,
                  }}
                />
              )
            : null
        }

        {/* HUD */}
        <div className={`pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center pt-[calc(env(safe-area-inset-top,0px)+14px)] transition-opacity duration-300 ${result ? "opacity-0" : "opacity-100"}`}>
          <p
            aria-live="polite"
            className="font-display text-5xl font-black tabular-nums text-[#fff3c8] drop-shadow-[0_2px_14px_rgba(0,0,0,.65)]"
          >
            {snap?.score.toLocaleString("en-US") ?? 0}
          </p>

          <div className="mt-1.5 flex items-center gap-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[.24em] text-amber-200/80">
              Round {snap?.round ?? 1}
            </p>

            <PeakMarks
              tableau={snap?.tableau ?? []}
            />
          </div>

          {
            passedBest && !result
              ? (
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[.22em] text-amber-300/90">
                    {
                      run.mode === "daily"
                        ? "Past your practice best"
                        : "New best!"
                    }
                  </p>
                )
              : null
          }

          {
            timeLeft !== null && !result
              ? (
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[.22em] text-rose-200">
                    Run ends in {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                  </p>
                )
              : null
          }
        </div>

        <p className="pointer-events-none absolute left-[calc(env(safe-area-inset-left,0px)+16px)] top-[calc(env(safe-area-inset-top,0px)+22px)] @max-[299px]:hidden text-[10px] font-bold uppercase tracking-[.2em] text-amber-200/70">
          {
            run.mode === "daily"
              ? "Daily Peaks"
              : "Practice"
          }
        </p>

        {
          !result
            ? (
                <button
                  type="button"
                  onClick={() => setPause(!paused)}
                  aria-label={
                    paused
                      ? "Resume"
                      : "Pause"
                  }
                  className="absolute right-[calc(env(safe-area-inset-right,0px)+12px)] top-[calc(env(safe-area-inset-top,0px)+12px)] z-[400] flex h-11 w-11 items-center justify-center rounded-full border border-[rgb(242_196_90/.35)] bg-[rgb(6_9_22/.6)] text-amber-200 backdrop-blur-sm transition-transform duration-100 active:scale-95"
                >
                  {
                    paused
                      ? <Play size={18} />
                      : <Pause size={18} />
                  }
                </button>
              )
            : null
        }

        {/* TABLE (dims behind the game-over card) */}
        {
          layout && snap
            ? (
                <div
                  className={`absolute inset-0 transition-opacity duration-300 ${
                    result
                      ? "opacity-30"
                      : "opacity-100"
                  }`}
                >
                  {/* Stock pile (cards under the top one) + the click target */}
                  <button
                    type="button"
                    data-peaks-ui
                    onPointerDown={(event) => {
                      event.preventDefault();
                      actRef.current?.(DRAW);
                    }}
                    onClick={(event) => {
                      // Keyboard activation (pointer taps act on pointerdown).
                      if (event.detail === 0) actRef.current?.(DRAW);
                    }}
                    disabled={snap.stockCount === 0 || !!result}
                    aria-label={
                      snap.stockCount > 0
                        ? `Draw from the stock, ${snap.stockCount} left`
                        : "The stock is empty"
                    }
                    className="absolute rounded-[10%] outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                    style={{
                      left: layout.stock.x - 6,
                      top: layout.stock.y - 6,
                      width: layout.w * layout.tray + 12,
                      height: layout.h * layout.tray + 12,
                      zIndex: 300,
                    }}
                  />

                  <div
                    aria-hidden
                    className="pointer-events-none absolute rounded-[10%] border border-dashed border-amber-200/25"
                    style={{
                      left: layout.stock.x,
                      top: layout.stock.y,
                      width: layout.w * layout.tray,
                      height: layout.h * layout.tray,
                    }}
                  />

                  {
                    Array.from(
                      {
                        length: Math.min(3, Math.max(0, snap.stockCount - 1)),
                      },
                      (_, i) => (
                        <div
                          key={i}
                          aria-hidden
                          className="pointer-events-none absolute"
                          style={{
                            left: layout.stock.x + (i + 1) * 1.5,
                            top: layout.stock.y + (i + 1) * 1.5,
                            width: layout.w * layout.tray,
                            height: layout.h * layout.tray,
                            zIndex: 140 - i,
                            "--w": `${layout.w * layout.tray}px`,
                          } as CSSProperties}
                        >
                          <CardBack />
                        </div>
                      )
                    )
                  }

                  {
                    hint && !anyPlayable && snap.stockCount > 0 && !result
                      ? (
                          <div
                            aria-hidden
                            className="peaks-hint pointer-events-none absolute rounded-[10%] border-2 border-amber-200 shadow-[0_0_14px_rgba(255,216,110,.8)]"
                            style={{
                              left: layout.stock.x - 3,
                              top: layout.stock.y - 3,
                              width: layout.w * layout.tray + 6,
                              height: layout.h * layout.tray + 6,
                              zIndex: 299,
                            }}
                          />
                        )
                      : null
                  }

                  <p
                    className="pointer-events-none absolute text-center text-[10px] font-bold uppercase tracking-[.18em] text-amber-200/70 tabular-nums"
                    style={{
                      left: layout.stock.x - 10,
                      width: layout.w * layout.tray + 20,
                      top: layout.stock.y + layout.h * layout.tray + 8,
                    }}
                  >
                    {
                      snap.stockCount > 0
                        ? `${snap.stockCount} left`
                        : "Empty"
                    }
                  </p>

                  <p
                    className="pointer-events-none absolute text-center text-[10px] font-bold uppercase tracking-[.18em] text-amber-200/70"
                    style={{
                      left: layout.waste.x - 10,
                      width: layout.w * layout.tray + 20,
                      top: layout.waste.y + layout.h * layout.tray + 8,
                    }}
                  >
                    Waste
                  </p>

                  {/* Cards */}
                  {items.map(
                    (item) => {
                      const tableauCard = item.slot >= 0;
                      const playable =
                        tableauCard &&
                        dealt &&
                        snap.playable[item.slot];
                      const faceUpTableau =
                        tableauCard && item.faceUp;

                      return (
                        <div
                          key={item.key}
                          role={faceUpTableau ? "button" : undefined}
                          aria-label={
                            faceUpTableau
                              ? `${cardName(item.card)}${playable ? ", playable" : ""}`
                              : undefined
                          }
                          aria-hidden={faceUpTableau ? undefined : true}
                          data-peaks-ui={tableauCard ? "" : undefined}
                          data-playable={playable ? "true" : "false"}
                          className={`peaks-card absolute left-0 top-0 ${tableauCard && item.faceUp ? "cursor-pointer" : "pointer-events-none"}`}
                          style={cardStyle(item)}
                          onPointerDown={
                            tableauCard
                              ? (event) => {
                                  event.preventDefault();
                                  actRef.current?.(item.slot);
                                }
                              : undefined
                          }
                        >
                          <div
                            ref={(el) => {
                              if (el) {
                                cardEls.current.set(item.key, el);
                              } else {
                                cardEls.current.delete(item.key);
                              }
                            }}
                            className="peaks-lift relative h-full w-full"
                          >
                            <div
                              key={item.faceUp ? "up" : "down"}
                              className={`absolute inset-0 ${item.faceUp ? "peaks-flip" : ""}`}
                            >
                              {
                                item.faceUp
                                  ? (
                                      <CardFace
                                        card={item.card}
                                      />
                                    )
                                  : <CardBack />
                              }
                            </div>

                            {
                              hint && playable && !result
                                ? (
                                    <div
                                      aria-hidden
                                      className="peaks-hint pointer-events-none absolute -inset-[3px] rounded-[12%] border-2 border-amber-200 shadow-[0_0_12px_rgba(255,216,110,.85)]"
                                    />
                                  )
                                : null
                            }
                          </div>
                        </div>
                      );
                    }
                  )}

                  {/* Chain counter */}
                  <div
                    className="pointer-events-none absolute flex w-72 -translate-x-1/2 justify-center"
                    style={{
                      left: layout.chainX,
                      top: layout.chainY - 16,
                      zIndex: 320,
                    }}
                  >
                    <p
                      key={snap.chain}
                      className={`rounded-full border px-3.5 py-1 font-display text-sm font-black uppercase tracking-[.16em] tabular-nums transition-opacity duration-200 ${
                        snap.chain >= 2
                          ? "peaks-pop opacity-100"
                          : "opacity-0"
                      } ${
                        snap.chain >= 8
                          ? "border-amber-200/80 bg-amber-300/25 text-[#fff3c8] shadow-[0_0_18px_rgba(255,216,110,.55)]"
                          : "border-amber-300/40 bg-[rgb(6_9_22/.7)] text-amber-200"
                      }`}
                    >
                      Chain x{snap.chain}
                      <span className="ml-2 text-[11px] text-amber-100/70">
                        next +{(snap.chain + 1) * 10}
                      </span>
                    </p>
                  </div>

                  {/* Points floating off the waste */}
                  {floats.map(
                    (fx) => (
                      <p
                        key={fx.key}
                        aria-hidden
                        className="peaks-float pointer-events-none absolute font-display text-lg font-black text-[#fff3c8] drop-shadow-[0_2px_8px_rgba(0,0,0,.8)]"
                        style={{
                          left: fx.x,
                          top: fx.y - 20,
                          zIndex: 330,
                        }}
                      >
                        {fx.text}
                      </p>
                    )
                  )}

                  {/* Peak-top bursts */}
                  {bursts.map(
                    (fx) => (
                      <div
                        key={fx.key}
                        aria-hidden
                        className="peaks-burst pointer-events-none absolute rounded-full border-2 border-amber-200 bg-[radial-gradient(circle,rgba(255,236,170,.75)_0%,rgba(242,196,90,.25)_45%,rgba(242,196,90,0)_70%)]"
                        style={{
                          left: fx.x,
                          top: fx.y,
                          width: layout.w * 2.2,
                          height: layout.w * 2.2,
                          zIndex: 330,
                        }}
                      />
                    )
                  )}

                  {/* Rules line */}
                  <p className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+10px)] px-4 text-center text-[11px] leading-4 text-zinc-400">
                    Play a card one higher or lower · K
                    <span className="text-amber-200/80"> ↔ </span>
                    A wraps
                    <span className="hidden pointer-fine:inline"> · Space draws</span>
                  </p>
                </div>
              )
            : null
        }

        {/* Round / clear / no-moves banner */}
        {
          banner && !result
            ? (
                <div
                  key={banner.key}
                  className="peaks-banner pointer-events-none absolute inset-x-0 flex justify-center px-6"
                  style={{
                    top: layout
                      ? layout.chainY - 70
                      : "50%",
                    zIndex: 340,
                  }}
                >
                  <div className="rounded-2xl bg-[rgb(3_5_15/.55)] px-5 py-2 text-center backdrop-blur-[2px]">
                    <p
                      className={`whitespace-nowrap font-display text-[clamp(1.35rem,7.5cqw,1.9rem)] font-black uppercase tracking-[.1em] drop-shadow-[0_2px_12px_rgba(0,0,0,.8)] ${
                        banner.tone === "rose"
                          ? "text-rose-200"
                          : "gold-text"
                      }`}
                    >
                      {banner.title}
                    </p>

                    {
                      banner.sub
                        ? (
                            <p className="mt-1 text-xs font-bold uppercase tracking-[.2em] text-amber-100/85">
                              {banner.sub}
                            </p>
                          )
                        : null
                    }
                  </div>
                </div>
              )
            : null
        }

        {
          paused && !result
            ? (
                <div
                  data-peaks-ui
                  className="absolute inset-0 z-[500] flex items-center justify-center bg-[rgb(3_5_15/.72)] px-6 backdrop-blur-[2px]"
                >
                  <div className="panel w-full max-w-xs p-5 text-center">
                    <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
                      Paused
                    </p>

                    <p className="gold-text mt-2 font-display text-3xl font-black tabular-nums">
                      {(snap?.score ?? 0).toLocaleString("en-US")} pts
                    </p>

                    <p className="mt-1 text-xs font-semibold uppercase tracking-[.2em] text-amber-200/70">
                      Round {snap?.round ?? 1}
                    </p>

                    {
                      confirmEnd
                        ? (
                            <>
                              <p className="mt-3 text-sm leading-6 text-zinc-300">
                                {
                                  run.mode === "daily"
                                    ? "End your Daily Peaks here? This becomes your score for today."
                                    : "End this run here? This score counts for the weekly board."
                                }
                              </p>

                              <div className="mt-4 grid gap-2">
                                <button
                                  type="button"
                                  onClick={endRun}
                                  className="primary-button flex w-full items-center justify-center gap-2"
                                >
                                  End run
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setConfirmEnd(false)}
                                  className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-300 active:scale-[.98]"
                                >
                                  Keep playing
                                </button>
                              </div>
                            </>
                          )
                        : (
                            <div className="mt-4 grid gap-2">
                              <button
                                type="button"
                                autoFocus
                                onClick={() => setPause(false)}
                                className="primary-button flex w-full items-center justify-center gap-2"
                              >
                                <Play
                                  size={16}
                                />
                                Resume
                              </button>

                              <button
                                type="button"
                                onClick={() => setConfirmEnd(true)}
                                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-300 active:scale-[.98]"
                              >
                                <Flag
                                  size={15}
                                />
                                End run
                              </button>
                            </div>
                          )
                    }
                  </div>
                </div>
              )
            : null
        }

        {/* GAME OVER */}
        {
          result
            ? (
                <div className="stack-result-in absolute inset-x-0 bottom-0 z-[500] flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
                  <div
                    data-peaks-ui
                    className="panel arena-frame w-full max-w-sm p-5 text-center"
                  >
                    <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
                      {
                        result.mode === "daily"
                          ? "Daily Peaks"
                          : "Practice run"
                      }
                      {
                        result.end === "nomoves"
                          ? " · No moves"
                          : ""
                      }
                    </p>

                    <p className="gold-text mt-1 font-display text-6xl font-black leading-none tabular-nums">
                      {result.score.toLocaleString("en-US")}
                    </p>

                    <p className="mt-1 text-xs font-semibold uppercase tracking-[.2em] text-amber-200/80">
                      {result.rounds} {result.rounds === 1 ? "round" : "rounds"}
                      {` · chain x${result.bestChain}`}
                      {
                        result.peaks > 0
                          ? ` · ${result.peaks} ${result.peaks === 1 ? "peak" : "peaks"}`
                          : ""
                      }
                    </p>

                    {
                      newBest
                        ? (
                            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-300/50 bg-amber-300/15 px-3 py-1 text-xs font-bold uppercase tracking-[.18em] text-amber-200">
                              <Sparkles
                                size={13}
                              />
                              {
                                result.mode === "daily"
                                  ? "Beats your practice best"
                                  : "New best this week"
                              }
                            </p>
                          )
                        : null
                    }

                    <div className="mt-3 min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      {
                        !response
                          ? (
                              <p className="flex items-center justify-center gap-2 text-sm text-zinc-300">
                                <Loader2
                                  size={15}
                                  className="animate-spin motion-reduce:animate-none"
                                />
                                Checking your plays...
                              </p>
                            )
                          : response.ok
                            ? (
                                <p className="text-sm text-zinc-200">
                                  <span className="font-semibold text-emerald-300">
                                    Verified
                                  </span>
                                  {" · "}
                                  {
                                    response.place
                                      ? `#${response.place} of ${response.players} ${response.mode === "daily" ? "today" : "this week"}`
                                      : "not on the board yet"
                                  }
                                  {
                                    response.mode === "practice" &&
                                    response.best !== null &&
                                    response.best > response.score
                                      ? ` · best ${response.best.toLocaleString("en-US")}`
                                      : ""
                                  }
                                </p>
                              )
                            : (
                                <p className="text-sm text-rose-300">
                                  {response.error}
                                </p>
                              )
                      }
                    </div>

                    <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                      {
                        canPlayAgain
                          ? (
                              <button
                                type="button"
                                ref={againRef}
                                disabled={!response || starting}
                                onClick={onPlayAgain}
                                className="primary-button flex w-full items-center justify-center gap-2 disabled:opacity-60"
                              >
                                {
                                  starting
                                    ? (
                                        <Loader2
                                          size={16}
                                          className="animate-spin motion-reduce:animate-none"
                                        />
                                      )
                                    : (
                                        <RotateCcw
                                          size={16}
                                        />
                                      )
                                }
                                {
                                  result.mode === "practice"
                                    ? "Play again"
                                    : "Practice run"
                                }
                              </button>
                            )
                          : <span />
                      }

                      <button
                        type="button"
                        disabled={!response}
                        onClick={onExit}
                        aria-label="Leaderboard"
                        className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-200 transition-transform duration-100 active:scale-[.98] disabled:opacity-60"
                      >
                        <Trophy
                          size={16}
                        />
                        <span className="hidden @[360px]:inline">
                          Leaderboard
                        </span>
                      </button>
                    </div>

                    {
                      canPlayAgain && response
                        ? (
                            <p className="mt-2 text-[11px] text-zinc-500">
                              <span className="pointer-fine:hidden">
                                Tap anywhere to play again
                              </span>
                              <span className="hidden pointer-fine:inline">
                                Click anywhere or press Space to play again
                              </span>
                            </p>
                          )
                        : null
                    }

                    {
                      error
                        ? (
                            <p className="mt-2 text-sm text-rose-300">
                              {error}
                            </p>
                          )
                        : null
                    }
                  </div>
                </div>
              )
            : null
        }
      </div>
    </div>
  );
}
