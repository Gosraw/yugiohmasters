"use client";

import {
  Pause,
  Play,
  Flag,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
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
  ClimberRenderer,
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
// run: the server replays it to compute the real score.
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
  bestScore: number | null;
  resume: SavedRun | null;
  onFinished: (
    result: {
      score: number;
      inputs: RunInputs;
    }
  ) => void;
};

export function ClimberPlay({
  runId,
  seed,
  mode,
  controls,
  spriteUrl,
  bestScore,
  resume,
  onFinished,
}: Props) {
  const containerRef =
    useRef<HTMLDivElement>(null);

  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  const insetRef =
    useRef<HTMLDivElement>(null);

  const resuming =
    resume !== null &&
    resume.runId === runId;

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

  const [hint, setHint] =
    useState(true);

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
  });

  const onFinishedRef =
    useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

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
    end: RunEnd
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

    clearSavedRun();

    onFinishedRef.current({
      score: climberScore(sim),
      inputs: recorder.finish(
        end,
        sim.tick
      ),
    });
  }, []);

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

    if (!canvas || !container) return;

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
          bestScore,
        }
      );

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
    };

    measure();

    const resizeObserver =
      new ResizeObserver(measure);

    resizeObserver.observe(container);

    // ---- steering ----
    const steer = steerRef.current;

    const currentSteer = () => {
      if (steer.keys.length > 0) {
        return steer.keys[steer.keys.length - 1];
      }

      if (steer.pointerOrder.length > 0) {
        const id = steer.pointerOrder[steer.pointerOrder.length - 1];
        return steer.pointers.get(id) ?? 0;
      }

      return controls === "tilt"
        ? steer.tilt
        : 0;
    };

    const keyDir = (
      key: string
    ) => {
      if (key === "ArrowLeft" || key === "a" || key === "A") return -STEER_MAX;
      if (key === "ArrowRight" || key === "d" || key === "D") return STEER_MAX;
      return 0;
    };

    const onKeyDown = (
      event: KeyboardEvent
    ) => {
      if (event.key === "Escape" || event.key === "p" || event.key === "P") {
        setPause(!pausedRef.current);
        return;
      }

      const dir = keyDir(event.key);
      if (!dir) return;
      event.preventDefault();
      if (event.repeat) return;
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

    const onPointerDown = (
      event: PointerEvent
    ) => {
      if (pausedRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const dir = event.clientX - rect.left < rect.width / 2 ? -STEER_MAX : STEER_MAX;
      steer.pointers.set(event.pointerId, dir);
      steer.pointerOrder = steer.pointerOrder.filter((id) => id !== event.pointerId);
      steer.pointerOrder.push(event.pointerId);
      canvas.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };

    const onPointerMove = (
      event: PointerEvent
    ) => {
      if (!steer.pointers.has(event.pointerId)) return;
      const rect = canvas.getBoundingClientRect();
      steer.pointers.set(
        event.pointerId,
        event.clientX - rect.left < rect.width / 2 ? -STEER_MAX : STEER_MAX
      );
    };

    const onPointerUp = (
      event: PointerEvent
    ) => {
      steer.pointers.delete(event.pointerId);
      steer.pointerOrder = steer.pointerOrder.filter((id) => id !== event.pointerId);
    };

    // Tilt: left/right roll of the phone (gamma), quantised to the
    // engine's integer steering levels with a little hysteresis so
    // a steady hand does not flood the recording with changes.
    const onOrientation = (
      event: DeviceOrientationEvent
    ) => {
      const angle =
        typeof screen !== "undefined" && screen.orientation
          ? screen.orientation.angle
          : 0;

      let roll =
        angle === 90
          ? event.beta ?? 0
          : angle === 270 || angle === -90
            ? -(event.beta ?? 0)
            : event.gamma ?? 0;

      roll = Math.max(-40, Math.min(40, roll));

      const raw = roll / 5;
      const current = steer.tilt;

      if (Math.abs(raw - current) > 0.65) {
        const next = Math.abs(roll) < 3 ? 0 : Math.round(raw);
        steer.tilt = Math.max(-STEER_MAX, Math.min(STEER_MAX, next));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

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

    // ---- loop ----
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastSave = performance.now();
    // A resumed run that had already ended hands over right away.
    let deathAt = sim.dead ? performance.now() : 0;

    const frame = (
      now: number
    ) => {
      raf = requestAnimationFrame(frame);

      const elapsed = Math.min(250, now - last);
      last = now;

      if (
        !pausedRef.current &&
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

          if (sim.events.some((e) => e.type === "trap")) {
            navigator.vibrate?.(18);
          }

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

    const hintTimer =
      window.setTimeout(
        () => setHint(false),
        2600
      );

    // Lock page scrolling / rubber-banding during play.
    const html = document.documentElement;
    const previousOverscroll = html.style.overscrollBehavior;
    const previousOverflow = document.body.style.overflow;
    html.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(hintTimer);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("deviceorientation", onOrientation);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
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
      className="fixed inset-0 z-[55] flex h-[100dvh] w-full touch-none select-none justify-center overflow-hidden overscroll-none bg-[radial-gradient(ellipse_at_center,#0b1230_0%,#03050f_70%)] [-webkit-touch-callout:none] [-webkit-user-select:none]"
    >
    <div
      ref={containerRef}
      className="relative h-full w-full max-w-[calc(100dvh*0.6)] touch-none select-none overflow-hidden overscroll-none bg-[#03050f] shadow-[0_0_0_1px_rgba(242,196,90,.18),0_0_60px_rgba(0,0,0,.6)]"
      role="application"
      aria-label="Pyramid Climb. Steer with the left and right arrow keys, by holding the left or right half of the screen, or by tilting your phone."
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
        className="absolute right-3 top-[calc(env(safe-area-inset-top,0px)+12px)] flex h-11 w-11 items-center justify-center rounded-full border border-[rgb(242_196_90/.35)] bg-[rgb(6_9_22/.6)] text-amber-200 backdrop-blur-sm transition-transform duration-100 active:scale-95"
      >
        {
          paused
            ? <Play size={18} />
            : <Pause size={18} />
        }
      </button>

      <p className="pointer-events-none absolute right-16 top-[calc(env(safe-area-inset-top,0px)+24px)] text-[10px] font-bold uppercase tracking-[.2em] text-amber-200/70">
        {
          mode === "daily"
            ? "Daily Climb"
            : "Practice"
        }
      </p>

      {
        !paused
          ? (
              <div
                className={`pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+28px)] flex justify-center px-4 transition-opacity duration-500 ease-out ${hint ? "opacity-100" : "opacity-0"}`}
              >
                <p className="rounded-full border border-[rgb(242_196_90/.3)] bg-[rgb(6_9_22/.7)] px-4 py-2 text-xs font-semibold text-amber-100 backdrop-blur-sm">
                  {
                    controls === "tilt"
                      ? "Tilt your phone to steer"
                      : "Hold the left or right side to steer"
                  }
                </p>
              </div>
            )
          : null
      }

      {
        paused
          ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[rgb(3_5_15/.72)] px-6 backdrop-blur-[2px]">
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
