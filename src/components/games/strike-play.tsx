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
  BOSS_EVERY,
  TICKS_PER_SECOND,
  ThrowRecorder,
  canThrow,
  createStrike,
  decodeThrows,
  isBossStage,
  simulateThrows,
  stepStrike,
  strikeScore,
  type RunEnd,
  type StrikeInputs,
  type StrikeSim,
} from "@/lib/games/strike-engine";

import type {
  SubmitGameRunResult,
} from "@/lib/games/server-runs";

import {
  play,
} from "@/lib/sound";

import {
  StrikeRenderer,
} from "./strike-renderer";

// =========================================================
// MILLENNIUM STRIKE - the full-screen play view (and its
// game-over card, so "Play again" restarts in place).
//
// Fixed-timestep loop like Pyramid Stack: requestAnimationFrame
// accumulates real time and advances the shared engine in exact
// 1/60 s ticks (at most 5 per frame). A tap / click / Space only
// QUEUES a throw: if a card is still in the air the tap waits up
// to QUEUE_TICKS for the hand to be free (one queued throw at
// most; extra taps while one is queued are ignored), taps while
// the wheel shatters are dropped. Only throws the engine actually
// takes are recorded, so the server replay is identical.
//
// The run waits for a first tap before the wheel starts turning.
// Pauses on visibilitychange and saves the run (seed is on the
// server, throws in localStorage) so a killed tab can resume.
// =========================================================

const STEP_MS =
  1000 / TICKS_PER_SECOND;

const MAX_STEPS_PER_FRAME = 5;

/** A tap waits at most this many ticks for the hand to be free. */
const QUEUE_TICKS = 10;

const SAVE_KEY = "dc.strike.openRun.v1";

/** Tap-anywhere restart is ignored this long after the card shows. */
const RESTART_GUARD_MS = 650;

/** Slow-motion clash beat before the game-over card. */
const CLASH_BEAT_MS = 1250;

// Own keyframes (kept here so the shared globals.css stays untouched).
const STRIKE_CSS = `
@keyframes strike-banner {
  0% { opacity: 0; transform: scale(.72); }
  14% { opacity: 1; transform: scale(1.06); }
  24% { transform: scale(1); }
  72% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.04); }
}
.strike-banner { animation: strike-banner 1.35s cubic-bezier(.2, .8, .2, 1) both; }
@media (prefers-reduced-motion: reduce) {
  @keyframes strike-banner-fade {
    0%, 70% { opacity: 1; }
    100% { opacity: 0; }
  }
  .strike-banner { animation: strike-banner-fade 1.35s linear both; }
}
`;

export type SavedStrikeRun = {
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

export function readSavedStrikeRun(): SavedStrikeRun | null {
  try {
    const raw =
      window.localStorage.getItem(SAVE_KEY);

    if (!raw) return null;

    const parsed =
      JSON.parse(raw) as SavedStrikeRun;

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

export function clearSavedStrikeRun() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
}

function writeSavedStrikeRun(
  run: SavedStrikeRun
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

export type StrikeRun = {
  runId: string;
  seed: string;
  mode: "daily" | "practice";
  resume: SavedStrikeRun | null;
  /** Your weekly best when the run started. */
  previousBest: number | null;
};

export type StrikeOutcome = {
  score: number;
  inputs: StrikeInputs;
  stages: number;
  orbs: number;
  bosses: number;
  crashed?: boolean;
};

export type StrikeResult = {
  mode: "daily" | "practice";
  /** How the run ended (shown next to the mode on the result card). */
  end?: RunEnd;
  score: number;
  stages: number;
  orbs: number;
  bosses: number;
  previousBest: number | null;
  /** null while the server replays the run. */
  response: SubmitGameRunResult | null;
};

type Banner = {
  key: number;
  title: string;
  sub: string | null;
  boss: boolean;
};

type Props = {
  run: StrikeRun;
  result: StrikeResult | null;
  canPlayAgain: boolean;
  starting: boolean;
  error: string | null;
  onFinished: (outcome: StrikeOutcome) => void;
  /** Ended before the first tick: the run is still open. */
  onAbandon: () => void;
  onPlayAgain: () => void;
  onExit: () => void;
  crashRef?: RefObject<(() => void) | null>;
};

/** Catches a render crash: ends the run with the throws so far. */
export class StrikeCrashGuard extends Component<
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
    console.error("Millennium Strike crashed", error);
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

function StageDots({
  stage,
}: {
  stage: number;
}) {
  const first =
    Math.floor((stage - 1) / BOSS_EVERY) * BOSS_EVERY + 1;

  return (
    <div
      aria-hidden
      className="flex items-center gap-2"
    >
      {Array.from(
        {
          length: BOSS_EVERY,
        },
        (_, i) => {
          const index = first + i;
          const boss = isBossStage(index);
          const done = index < stage;
          const current = index === stage;

          return (
            <span
              key={index}
              className={`block rotate-45 rounded-[3px] border transition-colors duration-200 ${
                boss
                  ? "h-3.5 w-3.5"
                  : "h-2 w-2"
              } ${
                done
                  ? "border-amber-200 bg-amber-300"
                  : current
                    ? boss
                      ? "border-rose-300 bg-rose-400/40 shadow-[0_0_10px_rgba(255,90,70,.7)]"
                      : "border-amber-200 bg-amber-200/30 shadow-[0_0_8px_rgba(255,216,110,.7)]"
                    : boss
                      ? "border-rose-300/50 bg-black/30"
                      : "border-amber-200/40 bg-black/30"
              }`}
            />
          );
        }
      )}
    </div>
  );
}

export function StrikePlay({
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

  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  const againRef =
    useRef<HTMLButtonElement>(null);

  /** Invisible probe whose padding = the safe-area insets. */
  const insetRef =
    useRef<HTMLDivElement>(null);

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

  const [stage, setStage] =
    useState(1);

  const [bossName, setBossName] =
    useState<string | null>(null);

  const [banner, setBanner] =
    useState<Banner | null>(null);

  const [passedBest, setPassedBest] =
    useState(false);

  const simRef =
    useRef<StrikeSim | null>(null);

  const recorderRef =
    useRef<ThrowRecorder | null>(null);

  /** Tick a queued throw was pressed at; -1 = none. */
  const queuedAtRef =
    useRef(-1);

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

    writeSavedStrikeRun({
      runId: run.runId,
      mode: run.mode,
      tick: sim.tick,
      score: strikeScore(sim),
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

    clearSavedStrikeRun();

    onFinishedRef.current({
      score: strikeScore(sim),
      inputs: recorder.finish(
        end,
        sim.tick
      ),
      stages: sim.stagesCleared,
      orbs: sim.orbsHit,
      bosses: sim.bossesBeaten,
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

    let sim: StrikeSim;
    let recorder: ThrowRecorder;

    const saved =
      run.resume &&
      run.resume.runId === run.runId
        ? run.resume
        : null;

    const throws = saved
      ? decodeThrows(saved.rec.e, saved.tick + 1)
      : null;

    if (
      saved &&
      throws
    ) {
      sim = simulateThrows(run.seed, throws, saved.tick).sim;
      recorder = ThrowRecorder.restore(saved.rec);
    } else {
      sim = createStrike(run.seed);
      recorder = new ThrowRecorder();
    }

    simRef.current = sim;
    recorderRef.current = recorder;
    finishedRef.current = false;
    queuedAtRef.current = -1;

    const isResume =
      saved !== null &&
      saved.tick > 0;

    pausedRef.current = isResume;
    readyRef.current = !isResume;
    setPaused(isResume);
    setReady(!isResume);
    setConfirmEnd(false);
    setScore(strikeScore(sim));
    setStage(sim.stage.index);
    setBossName(sim.stage.bossName);
    setBanner(null);
    setPassedBest(false);

    const renderer =
      new StrikeRenderer(
        canvas,
        {
          reducedMotion,
        }
      );

    const measure = () => {
      const rect = container.getBoundingClientRect();
      const insets = insetRef.current
        ? getComputedStyle(insetRef.current)
        : null;

      renderer.resize(
        rect.width,
        rect.height,
        insets ? parseFloat(insets.paddingTop) || 0 : 0,
        insets ? parseFloat(insets.paddingBottom) || 0 : 0
      );
    };

    measure();
    renderer.reset();

    const resizeObserver =
      new ResizeObserver(measure);

    resizeObserver.observe(container);

    const best =
      run.previousBest ?? 0;

    // ---- input: one action, "throw" ----
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

      // Taps while the wheel shatters are dropped; one queued throw max.
      if (
        sim.dead ||
        sim.breakLeft > 0 ||
        queuedAtRef.current >= 0
      ) {
        return;
      }

      queuedAtRef.current = sim.tick;
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
        event.target.closest("button, a, [data-strike-ui]")
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

    let bannerKey = 0;
    let bestPassed = false;

    const showBanner = (
      title: string,
      sub: string | null,
      boss: boolean
    ) => {
      bannerKey += 1;
      setBanner({
        key: bannerKey,
        title,
        sub,
        boss,
      });
    };

    // A boss as the very first wheel of a resumed run still gets its intro.
    if (sim.stage.boss) {
      showBanner("Boss", sim.stage.bossName, true);
    }

    const feedback = () => {
      for (const event of sim.events) {
        switch (event.type) {
          case "throw":
            play("whoosh", 0, 0.2, 1.7);
            buzz(5);
            break;

          case "hit":
            setScore(strikeScore(sim));
            play("tap", 0, 0.6, 0.9 + Math.random() * 0.25);
            buzz(12);

            if (event.orb !== null) {
              play("chime", 0, 0.45, 1.35);
              buzz([10, 24, 12]);
            }
            break;

          case "break":
            setScore(strikeScore(sim));
            play("boom", 0, 0.5, event.boss ? 0.85 : 1.1);
            play("coins", 90, 0.4);
            buzz(event.boss ? [30, 30, 50, 30, 70] : [20, 30, 40]);
            showBanner(
              event.boss ? "Boss broken" : "Wheel broken",
              event.boss ? "+10 boss bonus" : `+10`,
              false
            );
            break;

          case "stage":
            setStage(event.stage);
            setBossName(sim.stage.bossName);

            if (event.boss) {
              play("rise", 0, 0.55, 0.85);
              buzz([15, 40, 15]);
              showBanner("Boss", sim.stage.bossName, true);
            } else {
              showBanner(`Stage ${event.stage}`, null, false);
            }
            break;

          case "clash":
            play("boom", 0, 0.75, 0.6);
            play("seal", 60, 0.5, 0.8);
            buzz([40, 30, 80]);
            break;
        }

        if (
          !bestPassed &&
          best > 0 &&
          strikeScore(sim) > best
        ) {
          bestPassed = true;
          setPassedBest(true);
          play("coins", 120, 0.4);
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
        console.error("Millennium Strike loop crashed", error);
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
          let throwCard = false;

          if (queuedAtRef.current >= 0) {
            if (sim.tick - queuedAtRef.current > QUEUE_TICKS) {
              queuedAtRef.current = -1;
            } else if (canThrow(sim)) {
              queuedAtRef.current = -1;
              throwCard = true;
              recorder.record(sim.tick);
            }
          }

          stepStrike(sim, throwCard);
          renderer.onEvents(sim, sim.events);
          feedback();

          if (throwCard) save();

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

      // The slow-motion clash plays out, then hand over.
      if (
        sim.dead &&
        !finishedRef.current &&
        deathAt > 0 &&
        now - deathAt > (reducedMotion ? 600 : CLASH_BEAT_MS)
      ) {
        finish(sim.timedOut ? "quit" : "clash");
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

  return (
    <div
      ref={wrapperRef}
      className="fixed inset-0 z-[55] flex h-[100dvh] w-full touch-none select-none justify-center overflow-hidden overscroll-none bg-[radial-gradient(ellipse_at_center,#0b1230_0%,#03050f_70%)] [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none]"
    >
      <style>
        {STRIKE_CSS}
      </style>

      {/* Portrait column: the whole screen on a phone, a centred
          strip on a wide window (same idea as Pyramid Stack). */}
      <div
        ref={containerRef}
        className="@container relative h-full w-full max-w-[calc(100dvh*0.62)] touch-none select-none overflow-hidden overscroll-none bg-[#03050f] bg-[url('/v2/temple-night.jpg')] bg-cover bg-center shadow-[0_0_0_1px_rgba(242,196,90,.18),0_0_60px_rgba(0,0,0,.6)]"
        role="application"
        aria-label="Millennium Strike. Tap, click or press Space to throw a card into the turning wheel."
      >
        <div
          ref={insetRef}
          aria-hidden
          className="pointer-events-none invisible absolute h-0 w-0 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
        />

        {/* Darken the temple so the wheel pops. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_36%,rgba(6,9,22,.35)_0%,rgba(3,5,15,.78)_62%,rgba(3,5,15,.92)_100%)]" />

        <canvas
          ref={canvasRef}
          className="relative block h-full w-full touch-none"
        />

        {/* HUD */}
        <div className={`pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center pt-[calc(env(safe-area-inset-top,0px)+14px)] transition-opacity duration-300 ${result ? "opacity-0" : "opacity-100"}`}>
          <p
            aria-live="polite"
            className="font-display text-5xl font-black tabular-nums text-[#fff3c8] drop-shadow-[0_2px_14px_rgba(0,0,0,.65)]"
          >
            {score}
          </p>

          <div className="mt-1.5 flex flex-col items-center gap-1.5">
            <StageDots
              stage={stage}
            />

            <p
              className={`text-[10px] font-bold uppercase tracking-[.24em] ${
                bossName
                  ? "text-rose-200"
                  : "text-amber-200/80"
              }`}
            >
              {
                bossName
                  ? `Boss · ${bossName.replace("Millennium ", "")}`
                  : `Stage ${stage}`
              }
            </p>
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
        </div>

        <p className="pointer-events-none absolute left-4 top-[calc(env(safe-area-inset-top,0px)+22px)] @max-[299px]:hidden text-[10px] font-bold uppercase tracking-[.2em] text-amber-200/70">
          {
            run.mode === "daily"
              ? "Daily Strike"
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

        {/* Stage / boss banner */}
        {
          banner && !result && !ready
            ? (
                <div
                  key={banner.key}
                  className="strike-banner pointer-events-none absolute inset-x-0 top-[56%] flex justify-center px-6"
                >
                  <div className="text-center">
                    <p
                      className={`font-display font-black uppercase tracking-[.12em] drop-shadow-[0_2px_12px_rgba(0,0,0,.8)] ${
                        banner.boss
                          ? "text-4xl text-rose-200"
                          : "gold-text text-3xl"
                      }`}
                    >
                      {banner.title}
                    </p>

                    {
                      banner.sub
                        ? (
                            <p className={`mt-1 text-sm font-bold uppercase tracking-[.2em] ${banner.boss ? "text-amber-200" : "text-amber-100/80"}`}>
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

        {/* Ready: nothing moves until the first tap. */}
        <div
          aria-hidden={!ready}
          className={`pointer-events-none absolute inset-x-0 top-[61%] flex justify-center px-6 [@media(max-height:500px)]:top-auto [@media(max-height:500px)]:bottom-[18%] transition-opacity duration-200 ease-out motion-reduce:transition-none ${ready && !paused && !result ? "opacity-100" : "opacity-0"}`}
        >
          <div className="rounded-2xl border border-[rgb(242_196_90/.35)] bg-[rgb(6_9_22/.72)] px-6 py-4 text-center backdrop-blur-sm [@media(max-height:500px)]:px-4 [@media(max-height:500px)]:py-2.5">
            <p className="gold-text whitespace-nowrap font-display text-2xl font-black [@media(max-height:500px)]:text-xl">
              Tap to start
            </p>

            <p className="mt-1.5 text-sm font-semibold text-amber-100">
              Then tap to throw a card
            </p>

            <p className="mt-1 text-xs text-zinc-400 [@media(max-height:500px)]:hidden">
              Don&apos;t hit a card that&apos;s already stuck
            </p>

            <p className="mt-1 hidden text-xs text-zinc-400 pointer-fine:block [@media(max-height:500px)]:hidden">
              Click or press Space · P pauses
            </p>
          </div>
        </div>

        {
          paused && !result
            ? (
                <div
                  data-strike-ui
                  className="absolute inset-0 z-10 flex items-center justify-center bg-[rgb(3_5_15/.72)] px-6 backdrop-blur-[2px]"
                >
                  <div className="panel w-full max-w-xs p-5 text-center">
                    <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
                      Paused
                    </p>

                    <p className="gold-text mt-2 font-display text-3xl font-black tabular-nums">
                      {score} pts
                    </p>

                    <p className="mt-1 text-xs font-semibold uppercase tracking-[.2em] text-amber-200/70">
                      Stage {stage}
                    </p>

                    {
                      confirmEnd
                        ? (
                            <>
                              <p className="mt-3 text-sm leading-6 text-zinc-300">
                                {
                                  run.mode === "daily"
                                    ? "End your Daily Strike here? This becomes your score for today."
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
                                  Keep throwing
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
                    data-strike-ui
                    className="panel arena-frame w-full max-w-sm p-5 text-center"
                  >
                    <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
                      {
                        result.mode === "daily"
                          ? "Daily Strike"
                          : "Practice run"
                      }
                      {
                        result.end === "clash"
                          ? " · Card clash"
                          : ""
                      }
                    </p>

                    <p className="gold-text mt-1 font-display text-6xl font-black leading-none tabular-nums">
                      {result.score}
                    </p>

                    <p className="mt-1 text-xs font-semibold uppercase tracking-[.2em] text-amber-200/80">
                      {result.stages} {result.stages === 1 ? "wheel" : "wheels"}
                      {
                        result.bosses > 0
                          ? ` · ${result.bosses} ${result.bosses === 1 ? "boss" : "bosses"}`
                          : ""
                      }
                      {
                        result.orbs > 0
                          ? ` · ${result.orbs} ${result.orbs === 1 ? "eye" : "eyes"}`
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
                                Checking your throws...
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
