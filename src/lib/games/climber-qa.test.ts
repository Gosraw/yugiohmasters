import { describe, expect, it } from "vitest";

import {
  JUMP_HEIGHT,
  JUMP_V,
  STEER_MAX,
  WORLD_W,
  createClimber,
  stepClimber,
  wrapX,
  type ClimberSim,
  type Platform,
} from "./climber-engine";

// QA invariants for Pyramid Climb level generation. Physics constants
// are measured from the engine itself (not copied), so retuning the
// jump keeps these tests meaningful.

function measuredGravity() {
  const sim = createClimber("qa-gravity");
  const before = sim.vy;
  stepClimber(sim, 0);
  return before - sim.vy;
}

/** Sideways distance covered after t ticks of full steering from rest. */
function measuredReach(ticks: number) {
  const sim = createClimber("qa-reach");
  let travelled = 0;
  for (let i = 0; i < ticks && !sim.dead; i++) {
    const before = sim.x;
    stepClimber(sim, STEER_MAX);
    let d = wrapX(sim.x - before);
    if (d > WORLD_W / 2) d -= WORLD_W;
    travelled += d;
  }
  return travelled;
}

/** Ticks from a normal bounce until the feet come down through `rise`. */
function landingTicks(rise: number, gravity: number) {
  let y = 0;
  let vy = JUMP_V;
  for (let t = 1; t < 400; t++) {
    const prev = y;
    vy -= gravity;
    y += vy;
    if (vy < 0 && prev >= rise && y <= rise) return t;
    if (vy < 0 && y < rise) return null;
  }
  return null;
}

function wrapDist(a: number, b: number) {
  const d = Math.abs(wrapX(a) - wrapX(b));
  return Math.min(d, WORLD_W - d);
}

/** Generates the level up to `height` without playing it. */
function generateTo(seed: string, height: number): ClimberSim {
  const sim = createClimber(seed);
  sim.camBottom = height;
  sim.y = height + 100;
  sim.vy = 0;
  stepClimber(sim, 0);
  return sim;
}

describe("pyramid climb QA: level generation", () => {
  const gravity = measuredGravity();
  const reachCache = new Map<number, number>();
  const reach = (t: number) => {
    if (!reachCache.has(t)) reachCache.set(t, measuredReach(t));
    return reachCache.get(t)!;
  };

  const canReach = (a: Platform, b: Platform) => {
    const rise = b.y - a.y;
    if (rise >= JUMP_HEIGHT) return false;
    const t = landingTicks(rise, gravity);
    if (t === null) return false;
    // Moving platforms: optimistic (any point of either swing).
    const slack = a.range + b.range;
    return wrapDist(a.baseX, b.baseX) - slack <= reach(t) + b.w / 2 + 11;
  };

  it("measured jump matches the tuning constants", () => {
    // The discrete arc tops out within 5% of JUMP_HEIGHT.
    const apex = (JUMP_V * JUMP_V) / (2 * gravity);
    expect(apex).toBeGreaterThan(JUMP_HEIGHT * 0.95);
    expect(apex).toBeLessThan(JUMP_HEIGHT * 1.05);
  });

  it("every level is climbable to 3,000 m (no unreachable gap)", () => {
    for (let i = 0; i < 30; i++) {
      const sim = generateTo(`qa-climbable-${i}`, 30000);
      const platforms = [...sim.platforms].sort((a, b) => a.y - b.y);
      const ok = platforms.map((_, index) => index === 0);
      let highest = 0;
      for (let j = 1; j < platforms.length; j++) {
        for (let k = j - 1; k >= 0 && platforms[j].y - platforms[k].y < JUMP_HEIGHT; k--) {
          if (ok[k] && canReach(platforms[k], platforms[j])) {
            ok[j] = true;
            break;
          }
        }
        if (ok[j]) highest = Math.max(highest, platforms[j].y);
      }
      expect(highest, `seed qa-climbable-${i}`).toBeGreaterThanOrEqual(30000);
    }
  });

  it("there is always something to land on within one bounce above", () => {
    for (let i = 0; i < 30; i++) {
      const sim = generateTo(`qa-density-${i}`, 30000);
      const ys = sim.platforms.map((p) => p.y).sort((a, b) => a - b);
      for (let j = 1; j < ys.length; j++) {
        expect(ys[j] - ys[j - 1]).toBeLessThan(JUMP_HEIGHT);
      }
    }
  });
});
