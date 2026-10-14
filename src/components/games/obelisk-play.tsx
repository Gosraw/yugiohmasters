"use client";

import {
  ChevronLeft,
  ChevronRight,
  Flag,
  Hourglass,
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
  type ReactNode,
  type RefObject,
} from "react";

import {
  TICKS_PER_SECOND,
  TIMER_MAX,
  StrikeRecorder,
  canStrike,
  createObelisk,
  decodeStrikes,
  obeliskScore,
  obeliskTier,
  simulateStrikes,
  stepObelisk,
  type ObeliskInputs,
  type ObeliskSim,
  type RunEnd,
  type Side,
} from "@/lib/games/obelisk-engine";

import type {
  SubmitGameRunResult,
} from "@/lib/games/server-runs";

import {
  play,
} from "@/lib/sound";

import {
  ObeliskRenderer,
} from "./obelisk-renderer";

// =========================================================
// OBELISK RUSH - the full-screen play view (and its game-over
// card, so "Play again" restarts without leaving the temple).
//
// Fixed-timestep loop like Pyramid Stack: requestAnimationFrame
// accumulates real time and advances the shared engine in exact
// 1/60 s ticks (at most 5 per frame). A tap on the left / right
// half (or Left / Right / A / D) only QUEUES a side; the next tick
// the engine can strike on applies it, and only the strikes the
// engine acts on are recorded (the replay is identical).
//
// Multi-touch: inputs arriving in the same frame replace each
// other (the latest finger wins); quick taps in different frames
// queue (up to 3), so fast alternating thumbs never lose a strike.
//
// The first tap is already the first strike (the sand timer only
// starts then). Pauses on visibilitychange and saves the run
// (seed is on the server, strikes in localStorage) so a killed tab
// can resume.
// =========================================================

const STEP_MS =
  1000 / TICKS_PER_SECOND;

const MAX_STEPS_PER_FRAME = 5;

const MAX_QUEUE = 3;

const SAVE_KEY = "dc.obelisk.openRun.v1";

/** Tap-anywhere restart is ignored this long after the card shows. */
const RESTART_GUARD_MS = 650;

/** The timer bar turns red below this fraction. */
const LOW_TIME = 0.25;

export type SavedObeliskRun = {
  runId: string;
  mode: "daily" | "practice";
  tick: number;
  score: number;
  rec: {
    e: number[];
    s: string;
    lastTick: number;
  };
  savedAt: number;
};

export function readSavedObeliskRun(): SavedObeliskRun | null {
  try {
    const raw =
      window.localStorage.getItem(SAVE_KEY);

    if (!raw) return null;

    const parsed =
      JSON.parse(raw) as SavedObeliskRun;

    if (
      typeof parsed?.runId !== "string" ||
      !Array.isArray(parsed?.rec?.e) ||
      typeof parsed?.rec?.s !== "string"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clearSavedObeliskRun() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
}

function writeSavedObeliskRun(
  run: SavedObeliskRun
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

export type ObeliskRun = {
  runId: string;
  seed: string;
  mode: "daily" | "practice";
  resume: SavedObeliskRun | null;
  /** Your weekly best when the run started. */
  previousBest: number | null;
};

export type ObeliskRival = {
  name: string;
  score: number;
};

export type ObeliskOutcome = {
  score: number;
  inputs: ObeliskInputs;
  strikes: number;
  raHits: number;
  bestCombo: number;
  end: RunEnd;
  crashed?: boolean;
};

export type ObeliskResult = {
  mode: "daily" | "practice";
  score: number;
  strikes: number;
  raHits: number;
  bestCombo: number;
  end: RunEnd;
  previousBest: number | null;
  /** null while the server replays the run. */
  response: SubmitGameRunResult | null;
};

type Props = {
  run: ObeliskRun;
  rival: ObeliskRival | null;
  result: ObeliskResult | null;
  canPlayAgain: boolean;
  starting: boolean;
  error: string | null;
  onFinished: (outcome: ObeliskOutcome) => void;
  /** Ended before the first tick: the run is still open. */
  onAbandon: () => void;
  onPlayAgain: () => void;
  onExit: () => void;
  crashRef?: RefObject<(() => void) | null>;
};

/** Catches a render crash: ends the run with the strikes so far. */
export class ObeliskCrashGuard extends Component<
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
    console.error("Obelisk Rush crashed", error);
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

const endLabel = (
  end: RunEnd
) =>
  end === "cut"
    ? "Cut by a blade"
    : end === "time"
      ? "The sand ran out"
      : "Run ended";

export function ObeliskPlay({
  run,
  rival,
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

  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  const timerFillRef =
    useRef<HTMLDivElement>(null);

  const timerBarRef =
    useRef<HTMLDivElement>(null);

  const againRef =
    useRef<HTMLButtonElement>(null);

  const resuming =
    run.resume !== null &&
    run.resume.runId === run.runId &&
    run.resume.tick > 0;

  const [paused, setPaused] =
    useState(resuming);

  const pausedRef =
    useRef(resuming);

  const [ready, setReady] =
    useState(!resuming);

  const readyRef =
    useRef(!resuming);

  const finishedRef =
    useRef(false);

  const [confirmEnd, setConfirmEnd] =
    useState(false);

  const [score, setScore] =
    useState(
      resuming
        ? run.resume?.score ?? 0
        : 0
    );

  const [combo, setCombo] =
    useState(0);

  // Toast ("Faster!"): key bumps re-trigger the CSS pop.
  const [toast, setToast] =
    useState<{ text: string; key: number } | null>(null);

  const [passedBest, setPassedBest] =
    useState(false);

  const simRef =
    useRef<ObeliskSim | null>(null);

  const recorderRef =
    useRef<StrikeRecorder | null>(null);

  const queueRef =
    useRef<{ side: Side; frame: number }[]>([]);

  const frameRef =
    useRef(0);

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
      sim.tick === 0
    ) {
      return;
    }

    writeSavedObeliskRun({
      runId: run.runId,
      mode: run.mode,
      tick: sim.tick,
      score: obeliskScore(sim),
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
    queueRef.current = [];

    if (sim.tick === 0) {
      onAbandonRef.current();
      return;
    }

    clearSavedObeliskRun();

    onFinishedRef.current({
      score: obeliskScore(sim),
      inputs: recorder.finish(
        end,
        sim.tick
      ),
      strikes: sim.strikes,
      raHits: sim.raHits,
      bestCombo: sim.bestCombo,
      end,
      crashed,
    });
  }, []);

  const setPause = useCallback((
    value: boolean
  ) => {
    if (finishedRef.current) return;

    pausedRef.current = value;
    queueRef.current = [];
    setPaused(value);
    setConfirmEnd(false);

    if (value) save();
  }, [save]);

  // ---------------------------------------------------------
  // Main effect: one per run (a new run id restarts in place).
  // ---------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const wrapper = wrapperRef.current;

    if (!canvas || !container || !wrapper) return;

    const reducedMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let sim: ObeliskSim;
    let recorder: StrikeRecorder;

    const saved =
      run.resume &&
      run.resume.runId === run.runId
        ? run.resume
        : null;

    const strikes = saved
      ? decodeStrikes(saved.rec.e, saved.rec.s, saved.tick + 1)
      : null;

    if (
      saved &&
      strikes
    ) {
      sim = simulateStrikes(run.seed, strikes, saved.tick);
      recorder = StrikeRecorder.restore(saved.rec);
    } else {
      sim = createObelisk(run.seed);
      recorder = new StrikeRecorder();
    }

    simRef.current = sim;
    recorderRef.current = recorder;
    finishedRef.current = false;
    queueRef.current = [];

    const isResume =
      saved !== null &&
      saved.tick > 0;

    pausedRef.current = isResume;
    readyRef.current = !isResume;
    setPaused(isResume);
    setReady(!isResume);
    setConfirmEnd(false);
    setScore(obeliskScore(sim));
    setCombo(0);
    setToast(null);
    setPassedBest(false);

    const renderer =
      new ObeliskRenderer(
        canvas,
        {
          reducedMotion,
        }
      );

    const measure = () => {
      const rect = container.getBoundingClientRect();
      renderer.resize(rect.width, rect.height);
    };

    measure();
    renderer.reset();

    const resizeObserver =
      new ResizeObserver(measure);

    resizeObserver.observe(container);

    const best =
      run.previousBest ?? 0;

    // ---- input: a side ----
    const restartOrIgnore = () => {
      const elapsed = performance.now() - resultShownAt.current;

      if (
        canRestartRef.current &&
        elapsed > RESTART_GUARD_MS
      ) {
        onPlayAgainRef.current();
      }
    };

    const press = (
      side: Side
    ) => {
      if (finishedRef.current) {
        restartOrIgnore();
        return;
      }

      if (pausedRef.current) return;

      if (readyRef.current) {
        // The first tap is already the first strike.
        readyRef.current = false;
        setReady(false);
      }

      const queue = queueRef.current;
      const last = queue[queue.length - 1];

      if (
        last &&
        last.frame === frameRef.current
      ) {
        // Same frame (two fingers at once): the latest finger wins.
        last.side = side;
      } else if (queue.length < MAX_QUEUE) {
        queue.push({
          side,
          frame: frameRef.current,
        });
      }
    };

    const onKeyDown = (
      event: KeyboardEvent
    ) => {
      if (
        event.key === "Escape" ||
        event.key === "p" ||
        event.key === "P"
      ) {
        if (readyRef.current || finishedRef.current) return;
        setPause(!pausedRef.current);
        return;
      }

      const key = event.key.toLowerCase();

      const side: Side | null =
        key === "arrowleft" || key === "a"
          ? "L"
          : key === "arrowright" || key === "d"
            ? "R"
            : null;

      if (side) {
        if (
          pausedRef.current &&
          event.target instanceof HTMLButtonElement
        ) {
          return;
        }

        event.preventDefault();

        // Holding a key must not auto-strike.
        if (event.repeat) return;

        press(side);
        return;
      }

      if (
        event.key === " " ||
        event.key === "Enter"
      ) {
        // A focused button (pause / game-over card: "Play again" is
        // focused) handles its own Space / Enter.
        if (event.target instanceof HTMLButtonElement) return;

        event.preventDefault();

        if (event.repeat) return;

        if (finishedRef.current) restartOrIgnore();
      }
    };

    const onPointerDown = (
      event: PointerEvent
    ) => {
      if (
        event.target instanceof Element &&
        event.target.closest("button, a, [data-obelisk-ui]")
      ) {
        return;
      }

      if (
        event.pointerType === "mouse" &&
        event.button !== 0
      ) {
        return;
      }

      event.preventDefault();

      // Halves of the PORTRAIT COLUMN (on a wide screen a click
      // outside the column still counts for its side).
      const rect = container.getBoundingClientRect();

      press(
        event.clientX < rect.left + rect.width / 2
          ? "L"
          : "R"
      );
    };

    window.addEventListener("keydown", onKeyDown);
    wrapper.addEventListener("pointerdown", onPointerDown);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (!readyRef.current) setPause(true);
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

    let toastKey = 0;
    let toastTimer = 0;
    let bestPassed = false;

    const showToast = (
      text: string
    ) => {
      toastKey += 1;
      setToast({
        text,
        key: toastKey,
      });
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => setToast(null), 1100);
    };

    // Per frame: React state only changes when something changed.
    let shownScore = obeliskScore(sim);
    let shownCombo = 0;

    const feedback = () => {
      for (const event of sim.events) {
        if (event.type === "strike") {
          play("tap", 0, 0.42, Math.min(1.3, 0.94 + Math.min(event.combo, 40) * 0.008));
          buzz(event.ra ? [12, 30, 12] : 6);

          if (event.ra) {
            play("chime", 0, 0.45, 1.15);
            play("coins", 60, 0.3);
          }

          if (event.tierUp) {
            play("rise", 40, 0.35);
            showToast(`Faster! · Level ${event.tier + 1}`);
          }

          if (
            !bestPassed &&
            best > 0 &&
            obeliskScore(sim) > best
          ) {
            bestPassed = true;
            setPassedBest(true);
            play("coins", 120, 0.4);
          }
        } else if (event.type === "cut") {
          play("boom", 0, 0.55);
          play("whoosh", 40, 0.4);
          buzz([40, 50, 40]);
        } else {
          play("whoosh", 0, 0.5);
          buzz([30, 40, 30]);
        }
      }
    };

    const syncHud = () => {
      const current = obeliskScore(sim);

      if (current !== shownScore) {
        shownScore = current;
        setScore(current);
      }

      if (sim.combo !== shownCombo) {
        shownCombo = sim.combo;
        setCombo(sim.combo);
      }

      const fraction =
        sim.timer / TIMER_MAX;

      if (timerFillRef.current) {
        timerFillRef.current.style.transform = `scaleX(${fraction})`;
      }

      if (timerBarRef.current) {
        const low = sim.started && !sim.dead && fraction < LOW_TIME;

        if ((timerBarRef.current.dataset.low === "1") !== low) {
          timerBarRef.current.dataset.low = low ? "1" : "0";
        }
      }
    };

    // ---- loop ----
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let deathAt = sim.dead ? performance.now() : 0;
    let crashed = false;

    const bail = () => {
      if (crashed) return;
      crashed = true;
      cancelAnimationFrame(raf);
      finish("quit", true);
    };

    if (crashRef) {
      crashRef.current = bail;
    }

    const frame = (
      now: number
    ) => {
      raf = requestAnimationFrame(frame);

      try {
        tickFrame(now);
      } catch (error) {
        console.error("Obelisk Rush loop crashed", error);
        bail();
      }
    };

    const tickFrame = (
      now: number
    ) => {
      const elapsed = Math.min(250, now - last);
      last = now;

      if (
        !pausedRef.current &&
        !readyRef.current &&
        !finishedRef.current &&
        !sim.dead
      ) {
        acc += elapsed;

        // The very first strike should not wait for a full tick.
        if (
          sim.tick === 0 &&
          queueRef.current.length > 0
        ) {
          acc = Math.max(acc, STEP_MS);
        }

        let steps = 0;

        while (
          acc >= STEP_MS &&
          steps < MAX_STEPS_PER_FRAME &&
          !sim.dead
        ) {
          let input: Side | null = null;

          const queue = queueRef.current;

          // Only strikes the engine acts on are recorded; an early
          // tap waits in the queue for the next allowed tick.
          if (
            queue.length > 0 &&
            canStrike(sim)
          ) {
            input = queue.shift()!.side;
            recorder.record(sim.tick, input);
          }

          const before = sim.side;

          stepObelisk(sim, input);
          renderer.onEvents(sim.events, before);
          feedback();

          if (input && !sim.dead) save();

          acc -= STEP_MS;
          steps += 1;
        }

        if (steps === MAX_STEPS_PER_FRAME) {
          acc = 0;
        }

        if (sim.dead) {
          deathAt = now;
          queueRef.current = [];
        }
      } else {
        acc = 0;
      }

      frameRef.current += 1;

      syncHud();

      renderer.draw(sim, obeliskTier(sim), elapsed / 1000, pausedRef.current);

      // A short beat to see what happened, then hand over.
      if (
        sim.dead &&
        !finishedRef.current &&
        deathAt > 0 &&
        now - deathAt > 750
      ) {
        finish(
          sim.cause === "cut"
            ? "cut"
            : sim.cause === "time"
              ? "time"
              : "quit"
        );
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
      window.clearTimeout(toastTimer);
      if (crashRef?.current === bail) crashRef.current = null;
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

  const playing =
    !result;

  return (
    <div
      ref={wrapperRef}
      className="fixed inset-0 z-[55] flex h-[100dvh] w-full touch-none select-none justify-center overflow-hidden overscroll-none bg-[radial-gradient(ellipse_at_center,#0b1230_0%,#03050f_70%)] [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none]"
    >
      {/* Portrait column: the whole screen on a phone, a centred
          strip on a wide window (same idea as Pyramid Stack). */}
      <div
        ref={containerRef}
        className="@container relative h-full w-full max-w-[calc(100dvh*0.62)] touch-none select-none overflow-hidden overscroll-none bg-[#03050f] shadow-[0_0_0_1px_rgba(242,196,90,.18),0_0_60px_rgba(0,0,0,.6)]"
        role="application"
        aria-label="Obelisk Rush. Tap the left or right half, or press the Left and Right arrow keys, to strike the obelisk from that side. Avoid the blades."
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none"
        />

        {/* HUD */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center pt-[calc(env(safe-area-inset-top,0px)+14px)]">
          <p
            aria-live="polite"
            className={`font-display text-6xl font-black tabular-nums text-[#fff3c8] drop-shadow-[0_2px_14px_rgba(0,0,0,.55)] transition-opacity duration-300 ${playing ? "opacity-100" : "opacity-0"}`}
          >
            {score}
          </p>

          {/* Sand timer */}
          <div
            className={`mt-2 flex w-[64%] max-w-[280px] items-center gap-2 transition-opacity duration-300 ${playing ? "opacity-100" : "opacity-0"}`}
          >
            <Hourglass
              size={16}
              className="shrink-0 text-amber-200/90"
            />

            <div
              ref={timerBarRef}
              data-low="0"
              className="group relative h-3 flex-1 overflow-hidden rounded-full border border-[rgb(242_196_90/.45)] bg-[rgb(6_9_22/.7)] shadow-[0_0_12px_rgba(0,0,0,.5)] data-[low=1]:border-rose-400/70 data-[low=1]:motion-safe:animate-pulse"
            >
              <div
                ref={timerFillRef}
                className="absolute inset-0 origin-left bg-gradient-to-r from-[#b8822a] via-[#f2c45a] to-[#fff0b8] group-data-[low=1]:from-[#9b1c2c] group-data-[low=1]:via-[#e0485a] group-data-[low=1]:to-[#ff9a8a]"
                style={{
                  transform: "scaleX(0.6)",
                }}
              />
            </div>
          </div>

          <div className="mt-2 flex h-7 items-center gap-2">
            {
              combo >= 5 && playing
                ? (
                    <p
                      key={Math.floor(combo / 10)}
                      className="stack-combo-pop rounded-full border border-amber-300/50 bg-[rgb(6_9_22/.78)] px-3 py-1 text-xs font-black uppercase tracking-[.2em] text-amber-200 tabular-nums"
                    >
                      Combo ×{combo}
                    </p>
                  )
                : null
            }
          </div>

          {
            toast && playing
              ? (
                  <p
                    key={toast.key}
                    className="stack-combo-pop mt-1 rounded-xl border border-[rgb(255_148_62/.55)] bg-[rgb(40_14_8/.82)] px-4 py-1.5 font-display text-lg font-black uppercase tracking-[.12em] text-[#ffd9a0]"
                  >
                    {toast.text}
                  </p>
                )
              : null
          }

          {
            passedBest && playing && !toast
              ? (
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-[.22em] text-amber-300/90">
                    {
                      run.mode === "daily"
                        ? "Past your practice best"
                        : "New best!"
                    }
                  </p>
                )
              : null
          }
        </div>

        <div className="pointer-events-none absolute left-4 top-[calc(env(safe-area-inset-top,0px)+20px)] grid gap-1 @max-[299px]:hidden text-[10px] font-bold uppercase tracking-[.2em]">
          <p className="text-amber-200/70">
            {
              run.mode === "daily"
                ? "Daily Rush"
                : "Practice"
            }
          </p>

          {
            run.previousBest
              ? (
                  <p className="text-amber-100/60 tabular-nums">
                    Best {run.previousBest}
                  </p>
                )
              : null
          }

          {
            rival
              ? (
                  <p className="max-w-[110px] truncate text-[#bccbff]/60 tabular-nums">
                    {rival.name} {rival.score}
                  </p>
                )
              : null
          }
        </div>

        {
          playing
            ? (
                <button
                  type="button"
                  onClick={() => setPause(!paused)}
                  aria-label={
                    paused
                      ? "Resume"
                      : "Pause"
                  }
                  className="absolute right-3 top-[calc(env(safe-area-inset-top,0px)+12px)] z-20 flex h-11 w-11 items-center justify-center rounded-full border border-[rgb(242_196_90/.35)] bg-[rgb(6_9_22/.6)] text-amber-200 backdrop-blur-sm transition-transform duration-100 active:scale-95"
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

        {/* Ready: nothing moves until the first strike. */}
        <div
          aria-hidden={!ready}
          className={`pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+4%)] flex flex-col items-center px-4 transition-opacity duration-200 ease-out motion-reduce:transition-none ${ready && !paused && playing ? "opacity-100" : "opacity-0"}`}
        >
          <div className="flex w-full max-w-sm items-stretch justify-between gap-3">
            <div className="flex flex-1 flex-col items-center rounded-2xl border border-[rgb(242_196_90/.3)] bg-[rgb(6_9_22/.6)] py-3 backdrop-blur-sm">
              <ChevronLeft
                size={28}
                className="text-amber-200"
              />
              <p className="text-xs font-bold uppercase tracking-[.16em] text-amber-100">
                Tap left
              </p>
            </div>

            <div className="flex flex-1 flex-col items-center rounded-2xl border border-[rgb(242_196_90/.3)] bg-[rgb(6_9_22/.6)] py-3 backdrop-blur-sm">
              <ChevronRight
                size={28}
                className="text-amber-200"
              />
              <p className="text-xs font-bold uppercase tracking-[.16em] text-amber-100">
                Tap right
              </p>
            </div>
          </div>

          <p className="mt-3 rounded-full bg-[rgb(6_9_22/.6)] px-4 py-1.5 text-center text-xs font-semibold text-amber-50 backdrop-blur-sm">
            Strike from that side · dodge the blades
          </p>

          <p className="mt-1 hidden text-[11px] text-zinc-400 pointer-fine:block">
            ← / A and → / D · P pauses
          </p>
        </div>

        {
          paused && playing
            ? (
                <div
                  data-obelisk-ui
                  className="absolute inset-0 z-10 flex items-center justify-center bg-[rgb(3_5_15/.72)] px-6 backdrop-blur-[2px]"
                >
                  <div className="panel w-full max-w-xs p-5 text-center">
                    <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
                      Paused
                    </p>

                    <p className="gold-text mt-2 font-display text-3xl font-black tabular-nums">
                      {score} {score === 1 ? "point" : "points"}
                    </p>

                    {
                      confirmEnd
                        ? (
                            <>
                              <p className="mt-3 text-sm leading-6 text-zinc-300">
                                {
                                  run.mode === "daily"
                                    ? "End your Daily Rush here? This becomes your score for today."
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
                                  Keep striking
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
                <div className="stack-result-in absolute inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
                  <div
                    data-obelisk-ui
                    className="panel arena-frame w-full max-w-sm p-5 text-center"
                  >
                    <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
                      {
                        result.mode === "daily"
                          ? "Daily Rush"
                          : "Practice run"
                      }
                      {" · "}
                      <span className={result.end === "cut" ? "text-rose-300" : result.end === "time" ? "text-amber-200" : "text-zinc-300"}>
                        {endLabel(result.end)}
                      </span>
                    </p>

                    <p className="gold-text mt-1 font-display text-6xl font-black leading-none tabular-nums">
                      {result.score}
                    </p>

                    <p className="mt-1 text-xs font-semibold uppercase tracking-[.2em] text-amber-200/80">
                      {result.strikes} {result.strikes === 1 ? "strike" : "strikes"}
                      {
                        result.raHits > 0
                          ? ` · ${result.raHits} Ra`
                          : ""
                      }
                      {
                        result.bestCombo > 1
                          ? ` · combo ×${result.bestCombo}`
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
                                Checking your run...
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
                                      ? ` · best ${response.best}`
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
