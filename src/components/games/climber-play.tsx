"use client";

import {
  Pause,
  Play,
  Flag,
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
  InputRecorder,
  STEER_MAX,
  TICKS_PER_SECOND,
  climberScore,
  createClimber,
  decodeInputs,
  simulateInputs,
  stepClimber,
  type ClimberSim,
  type RunEnd,
  type RunInputs,
} from "@/lib/games/climber-engine";

import {
  play,
} from "@/lib/sound";

import {
  ClimberRenderer,
  type HeightMarker,
} from "./climber-renderer";

// =========================================================
// PYRAMID CLIMB - the full-screen play view.
//
// Fixed-timestep loop: requestAnimationFrame accumulates real
// time and advances the shared engine in exact 1/60 s ticks (at
// most 5 per frame, so a slow phone runs slower instead of
// skipping physics). The renderer interpolates between the last
// two ticks for smooth motion at any refresh rate.
//
// Every tick the current steering value is recorded (only
// changes are stored). That recording + the seed is the whole
// run: the server replays it to compute the real score. All input
// shaping below (touch/key ramp, tilt curve) happens BEFORE that
// point and produces plain integers, so the replay is identical.
//
// Steering (v3, STEER_MAX = 8):
//   - keys / holding a screen half: starts at 40% and ramps to full
//     over 0.15 s, so a tap nudges and a hold travels;
//   - tilt: smoothed roll angle, 3 degree dead zone, full speed at
//     24 degrees, a gentle curve so small tilts make small moves.
//
// The run waits for a first tap / key before the first bounce.
//
// Pauses on visibilitychange and saves the run to localStorage
// (seed + inputs), so if the phone kills the tab the run can be
// resumed by replaying the same inputs.
// =========================================================

const STEP_MS =
  1000 / TICKS_PER_SECOND;

const MAX_STEPS_PER_FRAME = 5;

const SAVE_KEY = "dc.climber.openRun.v1";

export type ControlMode =
  | "touch"
  | "tilt";

export type SavedRun = {
  runId: string;
  mode: "daily" | "practice";
  tick: number;
  score: number;
  rec: {
    e: number[];
    lastTick: number;
    lastSteer: number;
  };
  savedAt: number;
};

export function readSavedRun(): SavedRun | null {
  try {
    const raw =
      window.localStorage.getItem(SAVE_KEY);

    if (!raw) return null;

    const parsed =
      JSON.parse(raw) as SavedRun;

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

export function clearSavedRun() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
}

function writeSavedRun(
  run: SavedRun
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

type Props = {
  runId: string;
  seed: string;
  mode: "daily" | "practice";
  controls: ControlMode;
  spriteUrl: string | null;
  markers: HeightMarker[];
  resume: SavedRun | null;
  onFinished: (
    result: {
      score: number;
      inputs: RunInputs;
      crashed?: boolean;
    }
  ) => void;
  /** The run ended before its first tick (nothing played): it is
   *  still open and can be started again. */
  onAbandon: () => void;
  /** Filled in by the play view: ends the run safely after a crash
   *  (submits what was climbed, or abandons a run never started). */
  crashRef?: RefObject<(() => void) | null>;
};

/**
 * Catches a render crash in the play view. The hub's onCrash ends the
 * run with the inputs recorded so far, so a bug can't silently burn a
 * Daily attempt (it would otherwise stay "started" forever).
 */
export class ClimberCrashGuard extends Component<
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
    console.error("Pyramid Climb crashed", error);
    this.props.onCrash();
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-[rgb(3_5_15/.94)] px-6 text-center text-sm text-zinc-300">
          Something went wrong. Saving your climb...
        </div>
      );
    }

    return this.props.children;
  }
}

export function ClimberPlay({
  runId,
  seed,
  mode,
  controls,
  spriteUrl,
  markers,
  resume,
  onFinished,
  onAbandon,
  crashRef,
}: Props) {
  const containerRef =
    useRef<HTMLDivElement>(null);

  // Full-screen wrapper: touches on the dark side areas (landscape,
  // wide screens) steer too, split at the middle of the screen.
  const wrapperRef =
    useRef<HTMLDivElement>(null);

  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  const insetRef =
    useRef<HTMLDivElement>(null);

  // A saved run with progress resumes on the pause card; one saved
  // before its first tick simply starts fresh (ready screen).
  const resuming =
    resume !== null &&
    resume.runId === runId &&
    resume.tick > 0;

  const pausedRef =
    useRef(resuming);

  const finishedRef =
    useRef(false);

  const [paused, setPaused] =
    useState(resuming);

  const [pausedScore, setPausedScore] =
    useState(
      resuming
        ? resume.score ?? 0
        : 0
    );

  const [confirmEnd, setConfirmEnd] =
    useState(false);

  // Fresh runs wait for a first tap / key ("ready"); resumed runs
  // start on the pause card instead.
  const [ready, setReady] =
    useState(!resuming);

  const readyRef =
    useRef(!resuming);

  // Engine + recorder live in refs: the loop never re-renders React.
  const simRef =
    useRef<ClimberSim | null>(null);

  const recorderRef =
    useRef<InputRecorder | null>(null);

  const steerRef = useRef({
    keys: [] as number[],
    pointers: new Map<number, number>(),
    pointerOrder: [] as number[],
    tilt: 0,
    tiltRoll: null as number | null,
  });

  const onFinishedRef =
    useRef(onFinished);

  const onAbandonRef =
    useRef(onAbandon);

  useEffect(() => {
    onFinishedRef.current = onFinished;
    onAbandonRef.current = onAbandon;
  }, [onFinished, onAbandon]);

  const save = useCallback(() => {
    const sim = simRef.current;
    const recorder = recorderRef.current;

    if (
      !sim ||
      !recorder ||
      finishedRef.current
    ) {
      return;
    }

    writeSavedRun({
      runId,
      mode,
      tick: sim.tick,
      score: climberScore(sim),
      rec: recorder.snapshot(),
      savedAt: Date.now(),
    });
  }, [runId, mode]);

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

    // Nothing played yet (ended from the pause card before the first
    // tap, or a crash right away): the server would reject a 0-tick
    // run and the Daily attempt would be lost. Keep it open instead.
    if (sim.tick === 0) {
      writeSavedRun({
        runId,
        mode,
        tick: 0,
        score: 0,
        rec: recorder.snapshot(),
        savedAt: Date.now(),
      });
      onAbandonRef.current();
      return;
    }

    clearSavedRun();

    onFinishedRef.current({
      score: climberScore(sim),
      inputs: recorder.finish(
        end,
        sim.tick
      ),
      crashed,
    });
  }, [runId, mode]);

  const setPause = useCallback((
    value: boolean
  ) => {
    if (finishedRef.current) return;

    pausedRef.current = value;
    setPaused(value);
    setConfirmEnd(false);

    if (simRef.current) {
      setPausedScore(climberScore(simRef.current));
    }

    if (value) save();
  }, [save]);

  // ---------------------------------------------------------
  // Main effect: sim, renderer, loop, inputs.
  // ---------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const wrapper = wrapperRef.current;

    if (!canvas || !container || !wrapper) return;

    const reducedMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Build (or rebuild from a saved run) the simulation.
    let sim: ClimberSim;
    let recorder: InputRecorder;

    if (
      resume &&
      resume.runId === runId
    ) {
      const decoded =
        decodeInputs(
          resume.rec.e,
          resume.tick + 1
        );

      sim = decoded
        ? simulateInputs(seed, decoded, resume.tick)
        : createClimber(seed);

      recorder = decoded
        ? InputRecorder.restore(resume.rec)
        : new InputRecorder();
    } else {
      sim = createClimber(seed);
      recorder = new InputRecorder();
    }

    simRef.current = sim;
    recorderRef.current = recorder;

    const renderer =
      new ClimberRenderer(
        canvas,
        {
          reducedMotion,
          markers,
        }
      );

    if (sim.tick > 0) {
      renderer.primeProgress(sim);
    }

    if (spriteUrl) {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => renderer.setBossImage(image);
      image.src = spriteUrl;
    }

    let insetTop = 0;

    const measure = () => {
      const rect = container.getBoundingClientRect();
      renderer.resize(rect.width, rect.height);
      insetTop = insetRef.current
        ? parseFloat(getComputedStyle(insetRef.current).paddingTop) || 0
        : 0;
      renderer.setInsetTop(insetTop);
    };

    measure();

    const resizeObserver =
      new ResizeObserver(measure);

    resizeObserver.observe(container);

    // ---- steering ----
    const steer = steerRef.current;

    const begin = () => {
      if (!readyRef.current) return;
      readyRef.current = false;
      setReady(false);
    };

    /** Direction held on keys / screen halves: -1, 0 or 1. */
    const heldDir = () => {
      if (steer.keys.length > 0) {
        return steer.keys[steer.keys.length - 1];
      }

      if (steer.pointerOrder.length > 0) {
        const id = steer.pointerOrder[steer.pointerOrder.length - 1];
        return steer.pointers.get(id) ?? 0;
      }

      return 0;
    };

    // Ramp: 40% on the first tick, full after 9 ticks (0.15 s).
    let rampDir = 0;
    let rampTicks = 0;

    const currentSteer = () => {
      const dir = heldDir();

      if (dir !== rampDir) {
        rampDir = dir;
        rampTicks = 0;
      }

      if (dir !== 0) {
        const k = Math.min(1, 0.4 + (0.6 * (rampTicks + 1)) / 9);
        rampTicks += 1;
        return dir * Math.round(STEER_MAX * k);
      }

      return controls === "tilt"
        ? steer.tilt
        : 0;
    };

    const keyDir = (
      key: string
    ) => {
      if (key === "ArrowLeft" || key === "a" || key === "A") return -1;
      if (key === "ArrowRight" || key === "d" || key === "D") return 1;
      return 0;
    };

    const onKeyDown = (
      event: KeyboardEvent
    ) => {
      if (event.key === "Escape" || event.key === "p" || event.key === "P") {
        if (readyRef.current) return;
        setPause(!pausedRef.current);
        return;
      }

      if (
        readyRef.current &&
        !pausedRef.current &&
        (event.key === " " || event.key === "Enter" || event.key === "ArrowUp")
      ) {
        event.preventDefault();
        begin();
        return;
      }

      const dir = keyDir(event.key);
      if (!dir) return;
      event.preventDefault();
      if (event.repeat) return;
      if (!pausedRef.current) begin();
      steer.keys = steer.keys.filter((d) => d !== dir);
      steer.keys.push(dir);
    };

    const onKeyUp = (
      event: KeyboardEvent
    ) => {
      const dir = keyDir(event.key);
      if (!dir) return;
      steer.keys = steer.keys.filter((d) => d !== dir);
    };

    const sideOf = (
      event: PointerEvent
    ) => {
      const rect = wrapper.getBoundingClientRect();
      return event.clientX - rect.left < rect.width / 2 ? -1 : 1;
    };

    const onPointerDown = (
      event: PointerEvent
    ) => {
      if (pausedRef.current) return;

      // Buttons (pause) and cards handle their own taps.
      if (
        event.target instanceof Element &&
        event.target.closest("button, [data-climber-ui]")
      ) {
        return;
      }

      event.preventDefault();

      // The tap that starts the run only starts it (tilt players
      // should not get a surprise sideways push).
      if (readyRef.current) {
        begin();
        if (controls === "tilt") return;
      }

      steer.pointers.set(event.pointerId, sideOf(event));
      steer.pointerOrder = steer.pointerOrder.filter((id) => id !== event.pointerId);
      steer.pointerOrder.push(event.pointerId);

      try {
        wrapper.setPointerCapture(event.pointerId);
      } catch {
        // Pointer already gone (released between event and capture).
      }
    };

    const onPointerMove = (
      event: PointerEvent
    ) => {
      if (!steer.pointers.has(event.pointerId)) return;
      steer.pointers.set(event.pointerId, sideOf(event));
    };

    const onPointerUp = (
      event: PointerEvent
    ) => {
      steer.pointers.delete(event.pointerId);
      steer.pointerOrder = steer.pointerOrder.filter((id) => id !== event.pointerId);
    };

    // Tilt: left/right roll of the phone (gamma; beta in landscape),
    // low-pass filtered against sensor jitter, then a dead zone and a
    // response curve, quantised to the engine's integer levels with
    // hysteresis so a steady hand does not flood the recording.
    const TILT_DEAD = 3;
    const TILT_FULL = 24;

    const onOrientation = (
      event: DeviceOrientationEvent
    ) => {
      const angle =
        typeof screen !== "undefined" && screen.orientation
          ? screen.orientation.angle
          : 0;

      const raw =
        angle === 90
          ? event.beta ?? 0
          : angle === 270 || angle === -90
            ? -(event.beta ?? 0)
            : event.gamma ?? 0;

      const roll =
        steer.tiltRoll === null
          ? raw
          : steer.tiltRoll + (raw - steer.tiltRoll) * 0.45;

      steer.tiltRoll = roll;

      const n = Math.min(
        1,
        Math.max(0, (Math.abs(roll) - TILT_DEAD) / (TILT_FULL - TILT_DEAD))
      );

      // n * (0.35 + 0.65 n): half tilt = ~34% speed, full = 100%.
      const target =
        Math.sign(roll) * n * (0.35 + 0.65 * n) * STEER_MAX;

      if (
        Math.abs(target - steer.tilt) > 0.6 ||
        (target === 0 && steer.tilt !== 0)
      ) {
        steer.tilt = Math.max(
          -STEER_MAX,
          Math.min(STEER_MAX, Math.round(target))
        );
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    wrapper.addEventListener("pointerdown", onPointerDown);
    wrapper.addEventListener("pointermove", onPointerMove);
    wrapper.addEventListener("pointerup", onPointerUp);
    wrapper.addEventListener("pointercancel", onPointerUp);
    wrapper.addEventListener("lostpointercapture", onPointerUp);

    if (controls === "tilt") {
      window.addEventListener("deviceorientation", onOrientation);
    }

    // ---- pause when hidden ----
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        setPause(true);
      }
    };

    const onPageHide = () => save();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    // ---- keep the screen awake while playing (best effort) ----
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

    // ---- haptics + sound (tiny; sound obeys the global mute) ----
    const canVibrate =
      typeof navigator.vibrate === "function";

    const feedback = (
      current: ClimberSim
    ) => {
      for (const event of current.events) {
        if (event.type === "bounce") {
          if (canVibrate) navigator.vibrate(6);
        } else if (event.type === "trap") {
          if (canVibrate) navigator.vibrate(20);
        } else if (event.type === "pickup") {
          if (canVibrate) navigator.vibrate(12);
          play(event.kind === "pot" ? "whoosh" : "chime", 0, 0.35);
        } else if (event.type === "revive") {
          play("chime", 0, 0.35);
        }
      }
    };

    // ---- loop ----
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastSave = performance.now();
    // A resumed run that had already ended hands over right away.
    let deathAt = sim.dead ? performance.now() : 0;

    // Any error in the loop ends the run safely: what was climbed is
    // submitted (or a run never started stays open) instead of the
    // Daily attempt hanging as "started" forever.
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
        console.error("Pyramid Climb loop crashed", error);
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
          const value = currentSteer();
          recorder.record(sim.tick, value);
          stepClimber(sim, value);
          renderer.onEvents(sim.events);
          feedback(sim);

          acc -= STEP_MS;
          steps += 1;
        }

        if (steps === MAX_STEPS_PER_FRAME) {
          // Too slow to keep up: drop the backlog (the game runs
          // slower; physics never skip).
          acc = 0;
        }

        if (now - lastSave > 5000) {
          lastSave = now;
          save();
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

      renderer.draw(sim, alpha, pausedRef.current ? 0 : elapsed / 1000);
      renderer.drawHud(sim, insetTop);

      // A short beat after falling out, then hand over.
      if (
        sim.dead &&
        !finishedRef.current &&
        deathAt > 0 &&
        now - deathAt > 650
      ) {
        finish("death");
      }
    };

    raf = requestAnimationFrame(frame);

    // Lock page scrolling / rubber-banding during play.
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
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("deviceorientation", onOrientation);
      wrapper.removeEventListener("pointerdown", onPointerDown);
      wrapper.removeEventListener("pointermove", onPointerMove);
      wrapper.removeEventListener("pointerup", onPointerUp);
      wrapper.removeEventListener("pointercancel", onPointerUp);
      wrapper.removeEventListener("lostpointercapture", onPointerUp);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      wakeLock?.release().catch(() => {});
      html.style.overscrollBehavior = previousOverscroll;
      document.body.style.overflow = previousOverflow;
    };
    // The run is fixed for the lifetime of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, seed]);

  const endRun = () => {
    if (finishedRef.current) return;
    pausedRef.current = true;
    finish("quit");
  };

  return (
    // The tower always plays in a portrait column: on a phone that is
    // the whole screen, on a wide laptop window it is a centred strip
    // (like Doodle Jump on desktop). Without it the world scaled to
    // the full window width and only a sliver of the tower showed.
    <div
      ref={wrapperRef}
      className="fixed inset-0 z-[55] flex h-[100dvh] w-full touch-none select-none justify-center overflow-hidden overscroll-none bg-[radial-gradient(ellipse_at_center,#0b1230_0%,#03050f_70%)] [-webkit-touch-callout:none] [-webkit-user-select:none]"
    >
    {/* Column aspect 400:820 = the renderer's VIEW_H: every screen sees
        the same amount of tower ahead of the ball. */}
    <div
      ref={containerRef}
      className="@container relative h-full w-full max-w-[calc(100dvh*0.4878)] touch-none select-none overflow-hidden overscroll-none bg-[#03050f] shadow-[0_0_0_1px_rgba(242,196,90,.18),0_0_60px_rgba(0,0,0,.6)]"
      role="application"
      aria-label="Pyramid Climb. Press Space or tap to start. Steer with the left and right arrow keys, by holding the left or right half of the screen, or by tilting your phone."
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
      />

      {/* Measures env(safe-area-inset-top) for the canvas HUD. */}
      <div
        ref={insetRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-0 w-0 pt-[env(safe-area-inset-top,0px)]"
      />

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

      <p className="pointer-events-none absolute right-16 top-[calc(env(safe-area-inset-top,0px)+24px)] hidden text-[10px] font-bold uppercase tracking-[.2em] text-amber-200/70 @[340px]:block">
        {
          mode === "daily"
            ? "Daily Climb"
            : "Practice"
        }
      </p>

      {/* Ready: nothing moves until the first tap / key. The canvas
          underneath still receives the tap (pointer-events-none). */}
      <div
        aria-hidden={!ready}
        className={`pointer-events-none absolute inset-0 transition-opacity duration-200 ease-out motion-reduce:transition-none ${ready && !paused ? "opacity-100" : "opacity-0"}`}
      >
        <div className="absolute inset-x-0 top-[24%] flex justify-center px-6">
          <div className="rounded-2xl border border-[rgb(242_196_90/.35)] bg-[rgb(6_9_22/.78)] px-6 py-4 text-center backdrop-blur-sm">
            <p className="gold-text font-display text-2xl font-black">
              Tap to start
            </p>

            <p className="mt-1.5 text-sm font-semibold text-amber-100">
              {
                controls === "tilt"
                  ? "Tilt your phone to steer"
                  : "Hold the left or right side to steer"
              }
            </p>

            <p className="mt-1 hidden text-xs text-zinc-400 pointer-fine:block">
              or press Space · steer with ← → or A / D
            </p>
          </div>
        </div>

        {
          controls === "touch"
            ? (
                <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+20px)] grid grid-cols-2 pointer-fine:hidden gap-px px-3 text-[11px] font-bold uppercase tracking-[.18em] text-amber-200/80">
                  <p className="rounded-l-full border border-r-0 border-[rgb(242_196_90/.25)] bg-[rgb(6_9_22/.55)] py-2.5 text-center">
                    ‹ Left
                  </p>

                  <p className="rounded-r-full border border-l-0 border-[rgb(242_196_90/.25)] bg-[rgb(6_9_22/.55)] py-2.5 text-center">
                    Right ›
                  </p>
                </div>
              )
            : null
        }
      </div>

      {
        paused
          ? (
              <div
                data-climber-ui
                className="absolute inset-0 z-10 flex items-center justify-center bg-[rgb(3_5_15/.72)] px-6 backdrop-blur-[2px]"
              >
                <div className="panel w-full max-w-xs p-5 text-center">
                  <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
                    Paused
                  </p>

                  <p className="gold-text mt-2 font-display text-3xl font-black">
                    {
                      pausedScore.toLocaleString("en-US")
                    } m
                  </p>

                  {
                    confirmEnd
                      ? (
                          <>
                            <p className="mt-3 text-sm leading-6 text-zinc-300">
                              {
                                mode === "daily"
                                  ? "End your Daily Climb here? This height becomes your score for today."
                                  : "End this run here? This height counts for the weekly board."
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
                                Keep climbing
                              </button>
                            </div>
                          </>
                        )
                      : (
                          <div className="mt-4 grid gap-2">
                            <button
                              type="button"
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
    </div>
    </div>
  );
}
