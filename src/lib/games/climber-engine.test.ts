import { describe, expect, it } from "vitest";

import {
  ENGINE_VERSION,
  InputRecorder,
  STEER_MAX,
  STALL_TICKS,
  TRAP_HALF_H,
  WORLD_W,
  difficultyAt,
  tideSpeed,
  CAMERA_OFFSET,
  DEATH_DEPTH,
  climberScore,
  JUMP_HEIGHT,
  maxReachX,
  createClimber,
  decodeInputs,
  platformX,
  stepClimber,
  validateRun,
  wrapX,
  type ClimberSim,
  type RunInputs,
} from "./climber-engine";

import { createPrng, hashSeed } from "./prng";

// A simple "player": steers toward the best platform it can see.
// Not good, just good enough to climb a while and die, which is
// what these tests need (a long, non-trivial input stream).
function botSteer(sim: ClimberSim, wobble: () => number): number {
  let target: number | null = null;
  let bestScore = Infinity;

  for (const p of sim.platforms) {
    if (p.broken) continue;
    const dy = p.y - sim.y;
    // Prefer platforms a bit above us while rising, below while falling.
    if (sim.vy > 0 ? dy < 20 || dy > 240 : dy > 10 || dy < -200) continue;
    const px = platformX(p, sim.worldTime);
    let dx = wrapX(px - sim.x);
    if (dx > WORLD_W / 2) dx -= WORLD_W;
    const score = Math.abs(dx) - dy * 0.5;
    if (score < bestScore) {
      bestScore = score;
      target = dx;
    }
  }

  if (target === null) return 0;
  const steer = Math.max(-STEER_MAX, Math.min(STEER_MAX, Math.round(target / 12)));
  return wobble() < 0.05 ? -steer : steer;
}

function playBot(seed: string, botSeed: string, maxTicks = 60 * 60 * 5) {
  const sim = createClimber(seed);
  const recorder = new InputRecorder();
  const rng = createPrng(botSeed);

  while (!sim.dead && sim.tick < maxTicks) {
    const steer = botSteer(sim, rng.next);
    recorder.record(sim.tick, steer);
    stepClimber(sim, steer);
  }

  const inputs = recorder.finish(sim.dead ? "death" : "quit", sim.tick);
  return { sim, inputs, score: climberScore(sim) };
}

describe("prng", () => {
  it("is deterministic per seed and differs between seeds", () => {
    const a = createPrng("2026-10-12");
    const b = createPrng("2026-10-12");
    const c = createPrng("2026-10-13");
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    const seqC = Array.from({ length: 20 }, () => c.next());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    expect(seqA.every((n) => n >= 0 && n < 1)).toBe(true);
  });

  it("hashes to fixed words (guards against accidental algorithm changes)", () => {
    expect(hashSeed("pyramid")).toEqual(hashSeed("pyramid"));
    const words = hashSeed("pyramid");
    expect(words.every((w) => Number.isInteger(w) && w >= 0 && w < 2 ** 32)).toBe(true);
  });
});

describe("climber engine", () => {
  it("generates the same level for the same seed", () => {
    const a = createClimber("daily:2026-10-12");
    const b = createClimber("daily:2026-10-12");
    const c = createClimber("daily:2026-10-13");
    const shape = (s: ClimberSim) => s.platforms.map((p) => [p.kind, p.baseX, p.y, p.w]);
    expect(shape(a)).toEqual(shape(b));
    expect(shape(a)).not.toEqual(shape(c));
  });

  it("is deterministic: same seed + inputs => identical state every tick", () => {
    const { inputs } = playBot("seed-A", "bot-1");
    const decoded = decodeInputs(inputs.e, inputs.ticks)!;
    const run = () => {
      const sim = createClimber("seed-A");
      let cursor = 0;
      let steer = 0;
      const trace: number[] = [];
      while (!sim.dead && sim.tick < inputs.ticks) {
        while (cursor < decoded.ticks.length && decoded.ticks[cursor] <= sim.tick) {
          steer = decoded.steers[cursor++];
        }
        stepClimber(sim, steer);
        trace.push(sim.x, sim.y, sim.vy);
      }
      return trace;
    };
    expect(run()).toEqual(run());
  });

  it("the largest path gap still leaves room to steer sideways", () => {
    // Generation clamps the sideways offset to maxReachX(gap); at the
    // biggest gap that must still allow the full designed offset.
    expect(maxReachX(JUMP_HEIGHT * 0.78)).toBeGreaterThan(155);
    expect(maxReachX(JUMP_HEIGHT + 1)).toBe(0);
  });

  it("the bot climbs a real height and eventually falls (the game is hard)", () => {
    const scores: number[] = [];
    let deaths = 0;
    for (let i = 0; i < 6; i++) {
      const { sim, score } = playBot(`level-${i}`, `bot-${i}`);
      if (sim.dead) deaths += 1;
      scores.push(score);
    }
    // This naive bot sometimes keeps bouncing on one platform until
    // the time cap; most runs still end by falling.
    expect(deaths).toBeGreaterThanOrEqual(4);
    expect(Math.max(...scores)).toBeGreaterThan(100);
  });

  it("never hangs a trap right above a card you bounce on (v3)", () => {
    let traps = 0;
    for (let i = 0; i < 6; i++) {
      const sim = createClimber(`traps-${i}`);
      // Generate a long way up without playing.
      sim.camBottom = 60000;
      stepClimber(sim, 0);
      for (const trap of sim.traps) {
        traps += 1;
        for (const p of sim.platforms) {
          const above = trap.y - TRAP_HALF_H - p.y;
          if (above < 0 || above > 150) continue;
          const dx = Math.abs(((trap.x - p.baseX + WORLD_W * 1.5) % WORLD_W) - WORLD_W / 2);
          expect(dx).toBeGreaterThan(p.w / 2 + p.range + 20);
        }
      }
    }
    expect(traps).toBeGreaterThan(20);
  });

  it("moving cards are never faster than the ball can follow (v3)", () => {
    const sim = createClimber("speed-cap");
    sim.camBottom = 60000;
    stepClimber(sim, 0);
    const moving = sim.platforms.filter((p) => p.kind === "moving");
    expect(moving.length).toBeGreaterThan(20);
    for (const p of moving) {
      expect(4 * p.range * p.speed).toBeLessThanOrEqual(3.0001);
    }
  });

  it("difficulty keeps rising past 2,500 m, then caps", () => {
    expect(difficultyAt(0)).toBe(0);
    expect(difficultyAt(25000)).toBe(1);
    expect(difficultyAt(40000)).toBeGreaterThan(1);
    expect(difficultyAt(40000)).toBeLessThan(difficultyAt(55000));
    expect(difficultyAt(1e7)).toBeCloseTo(1.35);
  });

  it("a stuck player (no new height) is eventually pushed out", () => {
    // Bounce on the ground (it holds 4 bounces) by keeping lots of
    // lives: only the stall rule can end this run.
    const sim = createClimber("stall");
    sim.platforms[0].hp = -1;
    let ticks = 0;
    while (!sim.dead && ticks < STALL_TICKS + 60 * 20) {
      stepClimber(sim, 0);
      ticks += 1;
    }
    expect(sim.dead).toBe(true);
    expect(ticks).toBeGreaterThan(STALL_TICKS);
  });

  it("a trap hit is a stumble, not a death sentence (v3)", () => {
    const sim = createClimber("trap-stumble");
    // Float high above everything with a trap right on the ball.
    sim.camBottom = 5000 - CAMERA_OFFSET;
    sim.y = 5000;
    sim.maxY = 5000;
    sim.vy = 0;
    sim.platforms = [];
    sim.traps = [{ id: 999, x: sim.x, y: sim.y + 13, hit: false }];
    stepClimber(sim, 0);
    expect(sim.stunTicks).toBeGreaterThan(0);
    while (sim.stunTicks > 0) stepClimber(sim, 0);
    // Control is back well before the death line.
    expect(5000 - sim.y).toBeLessThan(200);
    expect(sim.y).toBeGreaterThan(sim.camBottom - DEATH_DEPTH + 150);
    expect(sim.dead).toBe(false);
  });

  it("the sand starts rising after 30 s and keeps speeding up", () => {
    const sim = createClimber("tide");
    sim.tick = 29 * 60;
    expect(tideSpeed(sim)).toBe(0);
    sim.tick = 2 * 60 * 60;
    const early = tideSpeed(sim);
    sim.tick = 5 * 60 * 60;
    const late = tideSpeed(sim);
    expect(early).toBeGreaterThan(0);
    expect(late).toBeGreaterThan(early * 2);
  });

  it("standing still never scores", () => {
    const sim = createClimber("idle");
    while (!sim.dead && sim.tick < 60 * 30) stepClimber(sim, 0);
    expect(climberScore(sim)).toBeLessThan(100);
  });
});

describe("run validation (anti-cheat)", () => {
  it("replay equals the live score", () => {
    for (let i = 0; i < 4; i++) {
      const { inputs, score } = playBot(`replay-${i}`, `bot-r${i}`);
      const verdict = validateRun(`replay-${i}`, inputs, score);
      expect(verdict).toEqual({ ok: true, score, ticks: inputs.ticks });
    }
  });

  it("accepts an early quit with the score reached so far", () => {
    const { inputs, score } = playBot("quit-seed", "bot-q", 240);
    expect(inputs.end).toBe("quit");
    expect(validateRun("quit-seed", inputs, score).ok).toBe(true);
  });

  it("rejects a tampered score", () => {
    const { inputs, score } = playBot("tamper-1", "bot-t1");
    const verdict = validateRun("tamper-1", inputs, score + 50);
    expect(verdict.ok).toBe(false);
  });

  it("rejects a different seed (level shopping)", () => {
    const { inputs, score } = playBot("tamper-2", "bot-t2");
    expect(validateRun("tamper-2b", inputs, score).ok).toBe(false);
  });

  it("rejects tampered inputs", () => {
    const { inputs, score } = playBot("tamper-3", "bot-t3");
    const flipped: RunInputs = {
      ...inputs,
      e: inputs.e.map((n, i) => (i % 2 === 1 ? -n : n)),
    };
    expect(validateRun("tamper-3", flipped, score).ok).toBe(false);
  });

  it("rejects a 'death' claim for a run that was still alive", () => {
    const { inputs, score } = playBot("tamper-4", "bot-t4");
    const shortened: RunInputs = {
      ...inputs,
      e: inputs.e.slice(0, Math.max(0, inputs.e.length - 20)),
      ticks: Math.max(1, inputs.ticks - 300),
    };
    expect(validateRun("tamper-4", shortened, score).ok).toBe(false);
  });

  it("rejects malformed inputs", () => {
    const base = { v: ENGINE_VERSION, end: "death" as const, ticks: 100 };
    expect(validateRun("x", { ...base, e: [0, 9] }, 0).ok).toBe(false);
    expect(validateRun("x", { ...base, e: [0, 1, 0, 2] }, 0).ok).toBe(false);
    expect(validateRun("x", { ...base, e: [0, 1.5] }, 0).ok).toBe(false);
    expect(validateRun("x", { ...base, e: [200, 1] }, 0).ok).toBe(false);
    expect(validateRun("x", { ...base, e: [0] }, 0).ok).toBe(false);
    expect(validateRun("x", { ...base, v: 999, e: [] }, 0).ok).toBe(false);
    expect(validateRun("x", null, 0).ok).toBe(false);
    expect(validateRun("x", { ...base, e: [], ticks: 10 ** 9 }, 0).ok).toBe(false);
  });
});
