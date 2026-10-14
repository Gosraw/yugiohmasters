import { describe, expect, it } from "vitest";

import {
  BASE_SIZE,
  ENGINE_VERSION,
  GROW_STEP,
  MAX_TICKS,
  MIN_LIVE_TICKS,
  PERFECT_TOLERANCE,
  SLIDE_RANGE,
  TapRecorder,
  canDrop,
  createStack,
  decodeTaps,
  movingPos,
  simulateTaps,
  stackScore,
  stepStack,
  validateStackRun,
  type StackInputs,
  type StackSim,
} from "./stack-engine";

import { createPrng } from "./prng";

function offsetOf(sim: StackSim) {
  const top = sim.slabs[sim.slabs.length - 1];
  return movingPos(sim.moving) - (sim.moving.axis === 0 ? top.x : top.z);
}

/** Steps until the block is within `target` of the tower centre, then taps. */
function stepUntilAligned(sim: StackSim, target: number, rec?: TapRecorder) {
  for (let guard = 0; guard < 2000 && !sim.dead; guard++) {
    if (canDrop(sim) && Math.abs(offsetOf(sim) - target) <= sim.moving.speed / 2 + 1e-9) {
      rec?.record(sim.tick);
      stepStack(sim, true);
      return;
    }
    stepStack(sim, false);
  }
  throw new Error("never aligned");
}

/** A bot that aims for the centre with a seeded error; dies eventually. */
function playBot(seed: string, botSeed: string, errorScale = 4) {
  const sim = createStack(seed);
  const rec = new TapRecorder();
  const rng = createPrng(botSeed);
  let aim = rng.range(-errorScale, errorScale);
  while (!sim.dead && sim.tick < 60 * 60 * 10) {
    const tap = canDrop(sim) && Math.abs(offsetOf(sim) - aim) <= sim.moving.speed / 2;
    if (tap) {
      rec.record(sim.tick);
      aim = rng.range(-errorScale, errorScale) * (1 + sim.placed / 40);
    }
    stepStack(sim, tap);
  }
  const inputs = rec.finish(sim.dead && !sim.timedOut ? "miss" : "quit", sim.tick);
  return { sim, inputs, score: stackScore(sim) };
}

describe("stack engine basics", () => {
  it("is deterministic per seed and differs between seeds", () => {
    const spawns = (seed: string) => {
      const sim = createStack(seed);
      const out: number[] = [];
      for (let i = 0; i < 12; i++) {
        out.push(sim.moving.dir, Math.round(sim.moving.speed * 1000), sim.moving.tone);
        stepUntilAligned(sim, 0);
      }
      return out;
    };
    expect(spawns("daily:2026-10-14:a")).toEqual(spawns("daily:2026-10-14:a"));
    expect(spawns("daily:2026-10-14:a")).not.toEqual(spawns("daily:2026-10-14:b"));
  });

  it("alternates the slide axis and starts the block outside the tower", () => {
    const sim = createStack("axis");
    expect(sim.moving.axis).toBe(0);
    expect(Math.abs(offsetOf(sim))).toBe(SLIDE_RANGE);
    stepUntilAligned(sim, 0);
    expect(sim.moving.axis).toBe(1);
    stepUntilAligned(sim, 0);
    expect(sim.moving.axis).toBe(0);
  });

  it("ignores taps while the block is fresh (no double-tap deaths)", () => {
    const sim = createStack("fresh");
    for (let i = 0; i < MIN_LIVE_TICKS; i++) {
      expect(canDrop(sim)).toBe(false);
      stepStack(sim, true);
    }
    expect(sim.dead).toBe(false);
    expect(sim.placed).toBe(0);
    expect(canDrop(sim)).toBe(true);
  });

  it("a perfect drop keeps the full size and builds a combo", () => {
    const sim = createStack("perfect");
    stepUntilAligned(sim, 0);
    expect(sim.events[0]).toMatchObject({ type: "place", perfect: true, combo: 1, cut: null });
    const slab = sim.slabs[1];
    expect(slab.w).toBe(BASE_SIZE);
    expect(slab.d).toBe(BASE_SIZE);
    expect(slab.x).toBe(0);
    expect(slab.z).toBe(0);
    stepUntilAligned(sim, 0);
    expect(sim.combo).toBe(2);
  });

  it("slices the overhang and keeps the overlap", () => {
    const sim = createStack("slice");
    stepUntilAligned(sim, 20);
    const event = sim.events[0];
    expect(event.type).toBe("place");
    if (event.type !== "place") return;
    expect(event.perfect).toBe(false);
    const slab = sim.slabs[1];
    const off = slab.x * 2; // kept centre = offset / 2
    expect(slab.w).toBeCloseTo(BASE_SIZE - Math.abs(off), 9);
    expect(event.cut).not.toBeNull();
    expect(event.cut!.w + slab.w).toBeCloseTo(BASE_SIZE, 9);
    // Cut piece sits right next to the kept part, on the overshoot side.
    expect(event.cut!.x - event.cut!.w / 2).toBeCloseTo(slab.x + slab.w / 2, 9);
    expect(sim.combo).toBe(0);
  });

  it("grows the block back after 3 perfects in a row", () => {
    const sim = createStack("grow");
    stepUntilAligned(sim, 30); // x size 70
    stepUntilAligned(sim, 0); // z axis, perfect 1
    stepUntilAligned(sim, 0); // x axis, perfect 2
    const before = sim.slabs[sim.slabs.length - 1].w;
    stepUntilAligned(sim, 0); // z axis, perfect 3 -> z already full, no growth
    stepUntilAligned(sim, 0); // x axis, perfect 4 -> grows x
    const event = sim.events[0];
    expect(event).toMatchObject({ type: "place", perfect: true, grew: true });
    expect(sim.slabs[sim.slabs.length - 1].w).toBeCloseTo(before + GROW_STEP, 9);
    expect(sim.combo).toBe(4);
  });

  it("never grows past the base size", () => {
    const sim = createStack("cap");
    for (let i = 0; i < 8; i++) stepUntilAligned(sim, 0);
    for (const slab of sim.slabs) {
      expect(slab.w).toBeLessThanOrEqual(BASE_SIZE);
      expect(slab.d).toBeLessThanOrEqual(BASE_SIZE);
    }
  });

  it("treats a drop within the tolerance as perfect and snaps it", () => {
    const sim = createStack("tol");
    stepUntilAligned(sim, PERFECT_TOLERANCE - 1);
    expect(sim.slabs[1]).toMatchObject({ x: 0, w: BASE_SIZE, perfect: true });
  });

  it("missing the tower completely ends the run", () => {
    const sim = createStack("miss");
    for (let i = 0; i < MIN_LIVE_TICKS; i++) stepStack(sim, false);
    // Still far out: the block starts SLIDE_RANGE away and moves < 5/tick.
    expect(Math.abs(offsetOf(sim))).toBeGreaterThan(BASE_SIZE);
    stepStack(sim, true);
    expect(sim.dead).toBe(true);
    expect(sim.events[0].type).toBe("miss");
    expect(sim.placed).toBe(0);
  });

  it("speeds up gently and caps", () => {
    const sim = createStack("speed");
    const first = sim.moving.speed;
    for (let i = 0; i < 90; i++) stepUntilAligned(sim, 0);
    expect(sim.moving.speed).toBeGreaterThan(first * 1.5);
    expect(sim.moving.speed).toBeLessThanOrEqual(4.0 * 1.06 + 1e-9);
  });

  it("keeps the block inside its slide range", () => {
    const sim = createStack("range");
    for (let i = 0; i < 2000; i++) {
      stepStack(sim, false);
      expect(Math.abs(offsetOf(sim))).toBeLessThanOrEqual(SLIDE_RANGE + 1e-9);
    }
  });
});

describe("stack replay validation", () => {
  it("validates an honest run and returns the replayed score", () => {
    const run = playBot("practice:abc", "bot1");
    expect(run.score).toBeGreaterThan(3);
    const verdict = validateStackRun("practice:abc", run.inputs, run.score);
    expect(verdict).toEqual({ ok: true, score: run.score, ticks: run.inputs.ticks });
  });

  it("validates many seeds (record -> replay is exact)", () => {
    for (let i = 0; i < 25; i++) {
      const seed = `stack-practice:${i}`;
      const run = playBot(seed, `b${i}`, 1 + (i % 6) * 3);
      const verdict = validateStackRun(seed, JSON.parse(JSON.stringify(run.inputs)), run.score);
      expect(verdict.ok).toBe(true);
    }
  });

  it("validates a quit mid-run", () => {
    const sim = createStack("quit");
    const rec = new TapRecorder();
    for (let i = 0; i < 5; i++) stepUntilAligned(sim, 0, rec);
    for (let i = 0; i < 30; i++) stepStack(sim, false);
    const inputs = rec.finish("quit", sim.tick);
    expect(validateStackRun("quit", inputs, 5)).toMatchObject({ ok: true, score: 5 });
  });

  it("rejects an inflated score", () => {
    const run = playBot("tamper1", "bot");
    const verdict = validateStackRun("tamper1", run.inputs, run.score + 1);
    expect(verdict).toMatchObject({ ok: false, reason: "Score does not match the replay.", replayScore: run.score });
  });

  it("rejects a run replayed on another seed", () => {
    const run = playBot("tamper2", "bot");
    expect(validateStackRun("other-seed", run.inputs, run.score).ok).toBe(false);
  });

  it("rejects shifted taps / a fake length / the wrong ending", () => {
    const run = playBot("tamper3", "bot");
    const shifted: StackInputs = { ...run.inputs, e: [run.inputs.e[0] + 1, ...run.inputs.e.slice(1)] };
    expect(validateStackRun("tamper3", shifted, run.score).ok).toBe(false);
    expect(validateStackRun("tamper3", { ...run.inputs, ticks: run.inputs.ticks + 600 }, run.score).ok).toBe(false);
    expect(validateStackRun("tamper3", { ...run.inputs, end: "quit" }, run.score).ok).toBe(false);
    const cut: StackInputs = { ...run.inputs, e: run.inputs.e.slice(0, -1) };
    expect(validateStackRun("tamper3", cut, run.score).ok).toBe(false);
  });

  it("rejects malformed inputs", () => {
    const base = { v: ENGINE_VERSION, end: "miss", ticks: 100 };
    expect(validateStackRun("s", null, 0)).toMatchObject({ ok: false, reason: "No inputs." });
    expect(validateStackRun("s", { ...base, v: 99, e: [] }, 0)).toMatchObject({ ok: false });
    expect(validateStackRun("s", { ...base, end: "win", e: [] }, 0)).toMatchObject({ reason: "Unknown run ending." });
    expect(validateStackRun("s", { ...base, ticks: MAX_TICKS + 1, e: [] }, 0)).toMatchObject({ reason: "Impossible run length." });
    expect(validateStackRun("s", { ...base, ticks: 0, e: [] }, 0)).toMatchObject({ reason: "Impossible run length." });
    expect(validateStackRun("s", { ...base, e: [10, 0] }, 0)).toMatchObject({ reason: "Malformed inputs." });
    expect(validateStackRun("s", { ...base, e: [-1] }, 0)).toMatchObject({ reason: "Malformed inputs." });
    expect(validateStackRun("s", { ...base, e: [1.5] }, 0)).toMatchObject({ reason: "Malformed inputs." });
    expect(validateStackRun("s", { ...base, e: [100] }, 0)).toMatchObject({ reason: "Malformed inputs." });
    expect(validateStackRun("s", { ...base, e: "10,20" }, 0)).toMatchObject({ reason: "Malformed inputs." });
    expect(validateStackRun("s", { ...base, e: [] }, -1)).toMatchObject({ reason: "Impossible score." });
  });

  it("a tap spammer cannot beat the per-tick bound used by the database", () => {
    // Tap on every single tick: the engine ignores fresh-block taps.
    const sim = createStack("spam");
    const taps: number[] = [];
    while (!sim.dead && sim.tick < 5000) {
      taps.push(sim.tick);
      stepStack(sim, true);
    }
    // mini_game_catalog: ceil(ticks * 0.1) + 2
    expect(stackScore(sim)).toBeLessThanOrEqual(Math.ceil(sim.tick * 0.1) + 2);
    // and a perfect bot too
    const perfect = createStack("bound");
    for (let i = 0; i < 200; i++) stepUntilAligned(perfect, 0);
    expect(stackScore(perfect)).toBeLessThanOrEqual(Math.ceil(perfect.tick * 0.1) + 2);
  });

  it("decodes taps and refuses taps at or after the end", () => {
    expect(decodeTaps([5, 1, 10], 100)).toEqual([5, 6, 16]);
    expect(decodeTaps([0], 1)).toEqual([0]);
    expect(decodeTaps([1], 1)).toBeNull();
  });

  it("simulateTaps resumes a saved run to the same state", () => {
    const run = playBot("resume", "bot");
    const taps = decodeTaps(run.inputs.e, run.inputs.ticks)!;
    const half = Math.floor(run.inputs.ticks / 2);
    const resumed = simulateTaps("resume", taps, half);
    expect(resumed.tick).toBe(half);
    const full = simulateTaps("resume", taps, run.inputs.ticks);
    expect(stackScore(full)).toBe(run.score);
  });
});
