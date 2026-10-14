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
  type ReactNode,
  type RefObject,
} from "react";

import {
  TICKS_PER_SECOND,
  TapRecorder,
  canDrop,
  createStack,
  decodeTaps,
  simulateTaps,
  stackScore,
  stepStack,
  type RunEnd,
  type StackInputs,
  type StackSim,
} from "@/lib/games/stack-engine";

import type {
  SubmitGameRunResult,
} from "@/lib/games/server-runs";

import {
  play,
} from "@/lib/sound";

import {
  StackRenderer,
  type StackMarker,
} from "./stack-renderer";

// =========================================================
// PYRAMID STACK - the full-screen play view (and its game-over
// card, so "Play again" restarts without leaving the tower).
//
// Fixed-timestep loop like Pyramid Climb: requestAnimationFrame
// accumulates real time and advances the shared engine in exact
// 1/60 s ticks (at most 5 per frame). A tap / click / Space only
// queues a drop; the next tick applies it, and only taps the
// engine would act on are recorded (the replay is identical).
//
// The run waits for a first tap before the block starts moving.
// Pauses on visibilitychange and saves the run (seed is on the
// server, taps in localStorage) so a killed tab can resume.
// =========================================================

const STEP_MS =
  1000 / TICKS_PER_SECOND;

const MAX_STEPS_PER_FRAME = 5;

const SAVE_KEY = "dc.stack.openRun.v1";

/** Tap-anywhere restart is ignored this long after the card shows. */
const RESTART_GUARD_MS = 650;

export type SavedStackRun = {
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

export function readSavedStackRun(): SavedStackRun | null {
  try {
    const raw =
      window.localStorage.getItem(SAVE_KEY);

    if (!raw) return null;

    const parsed =
      JSON.parse(raw) as SavedStackRun;

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

export function clearSavedStackRun() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
}

function writeSavedStackRun(
  run: SavedStackRun
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

export type StackRun = {
  runId: string;
  seed: string;
  mode: "daily" | "practice";
  resume: SavedStackRun | null;
  /** Your weekly best when the run started. */
  previousBest: number | null;
};

export type StackOutcome = {
  score: number;
  inputs: StackInputs;
  perfects: number;
  bestCombo: number;
  crashed?: boolean;
};

export type StackResult = {
  mode: "daily" | "practice";
  score: number;
  perfects: number;
  bestCombo: number;
  previousBest: number | null;
  /** null while the server replays the run. */
  response: SubmitGameRunResult | null;
};

type Props = {
  run: StackRun;
  markers: StackMarker[];
  result: StackResult | null;
  canPlayAgain: boolean;
  starting: boolean;
  error: string | null;
  onFinished: (outcome: StackOutcome) => void;
  /** Ended before the first tick: the run is still open. */
  onAbandon: () => void;
  onPlayAgain: () => void;
  onExit: () => void;
  crashRef?: RefObject<(() => void) | null>;
};

/** Catches a render crash: ends the run with the taps so far. */
export class StackCrashGuard extends Component<
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
    console.error("Pyramid Stack crashed", error);
    this.props.onCrash();
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-[rgb(3_5_15/.94)] px-6 text-center text-sm text-zinc-300">
          Something went wrong. Saving your tower...
        </div>
      );
    }

    return this.props.children;
  }
}

export function StackPlay({
  run,
  markers,
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

  // Combo callout: key bumps re-trigger the CSS pop.
  const [combo, setCombo] =
    useState<{ value: number; key: number; grew: boolean } | null>(null);

  const [passedBest, setPassedBest] =
    useState(false);

  const simRef =
    useRef<StackSim | null>(null);

  const recorderRef =
    useRef<TapRecorder | null>(null);

  const tapQueuedRef =
    useRef(false);

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

    writeSavedStackRun({
      runId: run.runId,
      mode: run.mode,
      tick: sim.tick,
      score: stackScore(sim),
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

    if (sim.tick === 0) {
      onAbandonRef.current();
      return;
    }

    clearSavedStackRun();

    onFinishedRef.current({
      score: stackScore(sim),
      inputs: recorder.finish(
        end,
        sim.tick
      ),
      perfects: sim.perfects,
      bestCombo: sim.bestCombo,
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
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const wrapper = wrapperRef.current;

    if (!canvas || !container || !wrapper) return;

    const reducedMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let sim: StackSim;
    let recorder: TapRecorder;

    const saved =
      run.resume &&
      run.resume.runId === run.runId
        ? run.resume
        : null;

    const taps = saved
      ? decodeTaps(saved.rec.e, saved.tick + 1)
      : null;

    if (
      saved &&
      taps
    ) {
      sim = simulateTaps(run.seed, taps, saved.tick);
      recorder = TapRecorder.restore(saved.rec);
    } else {
      sim = createStack(run.seed);
      recorder = new TapRecorder();
    }

    simRef.current = sim;
    recorderRef.current = recorder;
    finishedRef.current = false;
    tapQueuedRef.current = false;

    const isResume =
      saved !== null &&
      saved.tick > 0;

    pausedRef.current = isResume;
    readyRef.current = !isResume;
    setPaused(isResume);
    setReady(!isResume);
    setConfirmEnd(false);
    setScore(stackScore(sim));
    setCombo(null);
    setPassedBest(false);

    const renderer =
      new StackRenderer(
        canvas,
        {
          reducedMotion,
        }
      );

    renderer.setMarkers(markers);

    const measure = () => {
      const rect = container.getBoundingClientRect();
      renderer.resize(rect.width, rect.height);
    };

    measure();
    renderer.reset(sim);

    const resizeObserver =
      new ResizeObserver(measure);

    resizeObserver.observe(container);

    const best =
      markers.find((marker) => marker.kind === "best")?.score ?? 0;

    // ---- input: one action, "drop" ----
    const press = () => {
      if (finishedRef.current) {
        const elapsed = performance.now() - resultShownAt.current;

        if (
          canRestartRef.current &&
          elapsed > RESTART_GUARD_MS
        ) {
          onPlayAgainRef.current();
        }

        return;
      }

      if (pausedRef.current) return;

      if (readyRef.current) {
        readyRef.current = false;
        setReady(false);
        return;
      }

      tapQueuedRef.current = true;
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

      if (
        event.key === " " ||
        event.key === "Enter" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowUp"
      ) {
        // A focused button (pause / game-over card: "Play again" is
        // focused) handles its own Space / Enter.
        if (
          (pausedRef.current || finishedRef.current) &&
          event.target instanceof HTMLButtonElement
        ) {
          return;
        }

        event.preventDefault();

        if (event.repeat) return;

        press();
      }
    };

    const onPointerDown = (
      event: PointerEvent
    ) => {
      if (
        event.target instanceof Element &&
        event.target.closest("button, a, [data-stack-ui]")
      ) {
        return;
      }

      if (event.button !== 0) return;

      event.preventDefault();
      press();
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

    let comboKey = 0;
    let bestPassed = false;

    const feedback = () => {
      for (const event of sim.events) {
        if (event.type === "place") {
          setScore(sim.placed);

          if (event.perfect) {
            const top = sim.slabs[sim.slabs.length - 1];
            renderer.ring(top);
            // Each perfect in a row is a higher note.
            play("chime", 0, 0.4, Math.min(1.9, 1 + (event.combo - 1) * 0.08));
            buzz(event.combo >= 3 ? [10, 30, 14] : 14);
            comboKey += 1;
            setCombo({
              value: event.combo,
              key: comboKey,
              grew: event.grew,
            });

            if (event.grew) play("rise", 60, 0.3);
          } else {
            play("tap", 0, 0.55);
            buzz(8);
            setCombo(null);
          }

          if (
            !bestPassed &&
            best > 0 &&
            sim.placed > best
          ) {
            bestPassed = true;
            setPassedBest(true);
            play("coins", 120, 0.4);
          }
        } else {
          play("whoosh", 0, 0.5);
          buzz([30, 40, 30]);
          setCombo(null);
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
        console.error("Pyramid Stack loop crashed", error);
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

        let steps = 0;

        while (
          acc >= STEP_MS &&
          steps < MAX_STEPS_PER_FRAME &&
          !sim.dead
        ) {
          let tap = false;

          if (tapQueuedRef.current) {
            tapQueuedRef.current = false;

            // Only taps the engine acts on are recorded; a tap on a
            // fresh block is ignored by the engine either way.
            if (canDrop(sim)) {
              tap = true;
              recorder.record(sim.tick);
            }
          }

          stepStack(sim, tap);
          renderer.onEvents(sim.events);
          feedback();

          if (tap && !sim.dead) save();

          acc -= STEP_MS;
          steps += 1;
        }

        if (steps === MAX_STEPS_PER_FRAME) {
          acc = 0;
        }

        if (sim.dead) {
          deathAt = now;
        }
      } else {
        acc = 0;
      }

      const alpha =
        pausedRef.current || sim.dead
          ? 1
          : Math.min(1, acc / STEP_MS);

      renderer.draw(sim, alpha, elapsed / 1000, pausedRef.current);

      // A short beat to watch the block fall, then hand over.
      if (
        sim.dead &&
        !finishedRef.current &&
        deathAt > 0 &&
        now - deathAt > 550
      ) {
        finish(sim.timedOut ? "quit" : "miss");
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
    // One effect per run; markers are read once at its start.
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

  return (
    <div
      ref={wrapperRef}
      className="fixed inset-0 z-[55] flex h-[100dvh] w-full touch-none select-none justify-center overflow-hidden overscroll-none bg-[radial-gradient(ellipse_at_center,#0b1230_0%,#03050f_70%)] [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none]"
    >
      {/* Portrait column: the whole screen on a phone, a centred
          strip on a wide window (same idea as Pyramid Climb). */}
      <div
        ref={containerRef}
        className="@container relative h-full w-full max-w-[calc(100dvh*0.62)] touch-none select-none overflow-hidden overscroll-none bg-[#03050f] shadow-[0_0_0_1px_rgba(242,196,90,.18),0_0_60px_rgba(0,0,0,.6)]"
        role="application"
        aria-label="Pyramid Stack. Tap, click or press Space to drop the sliding block onto the tower."
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none"
        />

        {/* HUD */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center pt-[calc(env(safe-area-inset-top,0px)+18px)]">
          <p
            aria-live="polite"
            className={`font-display text-6xl font-black tabular-nums text-[#fff3c8] drop-shadow-[0_2px_14px_rgba(0,0,0,.55)] transition-opacity duration-300 ${result ? "opacity-0" : "opacity-100"}`}
          >
            {score}
          </p>

          {
            combo && combo.value >= 1 && !result
              ? (
                  <p
                    key={combo.key}
                    className="stack-combo-pop mt-1 rounded-full border border-amber-300/50 bg-[rgb(6_9_22/.55)] px-3 py-1 text-xs font-black uppercase tracking-[.2em] text-amber-200 backdrop-blur-sm"
                  >
                    Perfect
                    {
                      combo.value > 1
                        ? ` ×${combo.value}`
                        : ""
                    }
                    {
                      combo.grew
                        ? " · grow"
                        : ""
                    }
                  </p>
                )
              : null
          }

          {
            passedBest && !result
              ? (
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-[.22em] text-amber-300/90">
                    New best!
                  </p>
                )
              : null
          }
        </div>

        <p className="pointer-events-none absolute left-4 top-[calc(env(safe-area-inset-top,0px)+24px)] text-[10px] font-bold uppercase tracking-[.2em] text-amber-200/70">
          {
            run.mode === "daily"
              ? "Daily Stack"
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

        {/* Ready: nothing moves until the first tap. */}
        <div
          aria-hidden={!ready}
          className={`pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+12%)] flex justify-center px-6 transition-opacity duration-200 ease-out motion-reduce:transition-none ${ready && !paused && !result ? "opacity-100" : "opacity-0"}`}
        >
          <div className="rounded-2xl border border-[rgb(242_196_90/.35)] bg-[rgb(6_9_22/.72)] px-6 py-4 text-center backdrop-blur-sm">
            <p className="gold-text font-display text-2xl font-black">
              Tap to start
            </p>

            <p className="mt-1.5 text-sm font-semibold text-amber-100">
              Then tap to drop each block
            </p>

            <p className="mt-1 hidden text-xs text-zinc-400 pointer-fine:block">
              Click or press Space · P pauses
            </p>
          </div>
        </div>

        {
          paused && !result
            ? (
                <div
                  data-stack-ui
                  className="absolute inset-0 z-10 flex items-center justify-center bg-[rgb(3_5_15/.72)] px-6 backdrop-blur-[2px]"
                >
                  <div className="panel w-full max-w-xs p-5 text-center">
                    <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
                      Paused
                    </p>

                    <p className="gold-text mt-2 font-display text-3xl font-black tabular-nums">
                      {score} {score === 1 ? "block" : "blocks"}
                    </p>

                    {
                      confirmEnd
                        ? (
                            <>
                              <p className="mt-3 text-sm leading-6 text-zinc-300">
                                {
                                  run.mode === "daily"
                                    ? "End your Daily Stack here? This becomes your score for today."
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
                                  Keep stacking
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

        {/* GAME OVER: on top of the zoomed-out tower. */}
        {
          result
            ? (
                <div className="stack-result-in absolute inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
                  <div
                    data-stack-ui
                    className="panel arena-frame w-full max-w-sm p-5 text-center"
                  >
                    <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
                      {
                        result.mode === "daily"
                          ? "Daily Stack"
                          : "Practice run"
                      }
                    </p>

                    <p className="gold-text mt-1 font-display text-6xl font-black leading-none tabular-nums">
                      {result.score}
                    </p>

                    <p className="mt-1 text-xs font-semibold uppercase tracking-[.2em] text-amber-200/80">
                      {result.score === 1 ? "block" : "blocks"}
                      {" · "}
                      {result.perfects} perfect
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
                              New best this week
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
                                Checking your tower...
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
                              Tap anywhere or press Space to play again
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
