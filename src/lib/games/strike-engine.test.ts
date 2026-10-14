import { describe, expect, it } from "vitest";

import {
  BOSSES,
  BOSS_BONUS,
  BREAK_TICKS,
  CARD_GAP,
  ENGINE_VERSION,
  FLIGHT_TICKS,
  FLIP_BACK,
  IMPACT_ANGLE,
  MAX_CARDS,
  MAX_ORBS,
  MAX_TICKS,
  MIN_CARDS,
  ORB_HIT,
  ORB_POINTS,
  SCORE_FLAT_BOUND,
  SCORE_PER_TICK_BOUND,
  STAGE_POINTS,
  THROW_INTERVAL,
  ThrowRecorder,
  angleDistance,
  canThrow,
  createStrike,
  decodeThrows,
  makeStage,
  mod360,
  predictImpact,
  simulateThrows,
  stepStrike,
  strikeScore,
  validateStrikeRun,
  wheelVelocity,
  type StrikeInputs,
  type StrikeSim,
} from "./strike-engine";

import { createPrng } from "./prng";

function safeAt(sim: StrikeSim, angle: number, margin: number) {
  return sim.stuck.every((card) => angleDistance(angle, card.a) >= CARD_GAP + margin);
}

function orbAt(sim: StrikeSim, angle: number) {
  return sim.stage.orbs.some((orb) => !orb.taken && angleDistance(angle, orb.a) <= ORB_HIT - 0.5);
}

/**
 * A bot that throws when the predicted landing spot is safe. With
 * `lag` > 0 its throw goes out up to `lag` ticks late (human
 * reaction), so it misjudges fast wheels and eventually clashes.
 */
function playBot(seed: string, botSeed: string, options: { lag?: number; margin?: number; maxTicks?: number; greedy?: boolean } = {}) {
  const { lag = 0, margin = 1, maxTicks = 60 * 60 * 8, greedy = false } = options;
  const sim = createStrike(seed);
  const rec = new ThrowRecorder();
  const rng = createPrng(botSeed);
  let pending = -1;
  const boundViolations: number[] = [];
  while (!sim.dead && sim.tick < maxTicks) {
    let throwCard = false;
    if (canThrow(sim)) {
      if (pending > 0) {
        pending -= 1;
      } else if (pending === 0) {
        throwCard = true;
        pending = -1;
      } else {
        const at = predictImpact(sim);
        const wantsOrb = greedy && sim.stage.orbs.some((orb) => !orb.taken);
        const go = safeAt(sim, at, margin) && (!wantsOrb || orbAt(sim, at) || sim.stageTick % 97 === 96);
        if (go) {
          if (lag > 0) {
            pending = rng.int(0, lag);
            if (pending === 0) {
              throwCard = true;
              pending = -1;
            }
          } else {
            throwCard = true;
          }
        }
      }
    }
    if (throwCard) rec.record(sim.tick);
    stepStrike(sim, throwCard);
    if (strikeScore(sim) > Math.ceil(sim.tick * SCORE_PER_TICK_BOUND) + SCORE_FLAT_BOUND) {
      boundViolations.push(sim.tick);
    }
  }
  const inputs = rec.finish(sim.dead && !sim.timedOut ? "clash" : "quit", sim.tick);
  return { sim, inputs, score: strikeScore(sim), boundViolations };
}

describe("strike engine basics", () => {
  it("is deterministic per seed and differs between seeds", () => {
    const stages = (seed: string) => {
      const rng = createPrng(seed);
      const out: unknown[] = [];
      for (let i = 1; i <= 12; i++) {
        const stage = makeStage(rng, i);
        out.push(stage.pattern, stage.preStuck, stage.orbs.map((orb) => orb.a), stage.need);
      }
      return JSON.stringify(out);
    };
    expect(stages("strike-daily:2026-10-14:a")).toBe(stages("strike-daily:2026-10-14:a"));
    expect(stages("strike-daily:2026-10-14:a")).not.toBe(stages("strike-daily:2026-10-14:b"));
  });

  it("starts gently: stage 1 is steady, needs 6 cards, no shadow cards, one orb", () => {
    for (let i = 0; i < 20; i++) {
      const sim = createStrike(`s1-${i}`);
      expect(sim.stage.pattern.kind).toBe("steady");
      expect(sim.stage.need).toBe(MIN_CARDS);
      expect(sim.stuck).toEqual([]);
      expect(sim.stage.orbs.length).toBe(1);
      expect(sim.stage.boss).toBeNull();
    }
  });

  it("every 5th stage is a boss in Millennium Item order", () => {
    const rng = createPrng("bosses");
    for (let i = 1; i <= 40; i++) {
      const stage = makeStage(rng, i);
      if (i % 5 === 0) {
        expect(stage.boss).toBe(BOSSES[(i / 5 - 1) % BOSSES.length].item);
        expect(stage.orbs.length).toBe(MAX_ORBS);
        expect(stage.preStuck.length).toBeGreaterThanOrEqual(1);
      } else {
        expect(stage.boss).toBeNull();
      }
      expect(stage.need).toBeGreaterThanOrEqual(MIN_CARDS);
      expect(stage.need).toBeLessThanOrEqual(MAX_CARDS);
      expect(stage.orbs.length).toBeLessThanOrEqual(MAX_ORBS);
      // Shadow cards never overlap each other; orbs are reachable and one card takes at most one orb.
      for (let a = 0; a < stage.preStuck.length; a++) {
        for (let b = a + 1; b < stage.preStuck.length; b++) {
          expect(angleDistance(stage.preStuck[a], stage.preStuck[b])).toBeGreaterThanOrEqual(CARD_GAP * 2);
        }
      }
      for (const orb of stage.orbs) {
        for (const pre of stage.preStuck) expect(angleDistance(orb.a, pre)).toBeGreaterThanOrEqual(CARD_GAP + ORB_HIT);
      }
      for (let a = 0; a < stage.orbs.length; a++) {
        for (let b = a + 1; b < stage.orbs.length; b++) {
          expect(angleDistance(stage.orbs[a].a, stage.orbs[b].a)).toBeGreaterThan(ORB_HIT * 2);
        }
      }
    }
  });

  it("rotation gets harder: later normal stages use reversing / stop-and-go patterns", () => {
    const kinds = new Set<string>();
    for (let s = 0; s < 30; s++) {
      const rng = createPrng(`kinds-${s}`);
      for (let i = 1; i <= 14; i++) {
        const stage = makeStage(rng, i);
        if (i >= 11 && !stage.boss) kinds.add(stage.pattern.kind);
        if (i <= 4) expect(["steady", "wave"]).toContain(stage.pattern.kind);
      }
    }
    expect(kinds.has("pulse")).toBe(true);
    expect(kinds.has("burst")).toBe(true);
  });

  it("wheel patterns: steady is constant, pulse reverses, burst holds then darts", () => {
    const base = { speed: 2, dir: 1 as const, period: 100, low: 0.1, ramp: 10, hold: 50, flip: false, bias: 0 };
    expect(wheelVelocity({ ...base, kind: "steady" }, 0)).toBe(2);
    expect(wheelVelocity({ ...base, kind: "steady" }, 12345)).toBe(2);
    const pulse = { ...base, kind: "pulse" as const, flip: true };
    expect(wheelVelocity(pulse, 50)).toBe(2);
    expect(wheelVelocity(pulse, 150)).toBeCloseTo(-2 * FLIP_BACK, 9);
    expect(Math.abs(wheelVelocity(pulse, 0))).toBe(0);
    const burst = { ...base, kind: "burst" as const };
    expect(wheelVelocity(burst, 10)).toBeCloseTo(0.2, 9);
    expect(wheelVelocity(burst, 75)).toBeCloseTo(2, 9);
    const swing = { ...base, kind: "swing" as const };
    expect(wheelVelocity(swing, 0)).toBeCloseTo(-2, 9);
    expect(wheelVelocity(swing, 50)).toBeCloseTo(2, 9);
  });

  it("every wheel keeps turning all the way round (no stage traps the throws in one arc)", () => {
    for (let s = 0; s < 40; s++) {
      const rng = createPrng(`reach-${s}`);
      for (let i = 1; i <= 45; i++) {
        const stage = makeStage(rng, i);
        let angle = 0;
        let lo = 0;
        let hi = 0;
        for (let t = 0; t < 60 * 20; t++) {
          angle += wheelVelocity(stage.pattern, t);
          lo = Math.min(lo, angle);
          hi = Math.max(hi, angle);
        }
        expect(hi - lo, `stage ${i} (${stage.pattern.kind}) seed ${s}`).toBeGreaterThanOrEqual(360);
      }
    }
  });

  it("a perfect player never gets stuck: 25+ stages for every seed", () => {
    for (let i = 0; i < 6; i++) {
      const run = playBot(`deep-${i}`, "p", { margin: 0.5, maxTicks: 60 * 60 * 8 });
      expect(run.sim.stagesCleared, `seed deep-${i}`).toBeGreaterThanOrEqual(25);
    }
  });

  it("a thrown card flies FLIGHT_TICKS and sticks where predicted", () => {
    const sim = createStrike("stick");
    for (let i = 0; i < 30; i++) stepStrike(sim, false);
    const predicted = predictImpact(sim);
    stepStrike(sim, true);
    expect(sim.events[0]).toEqual({ type: "throw" });
    for (let i = 1; i < FLIGHT_TICKS; i++) {
      expect(sim.flight).toBe(i);
      stepStrike(sim, false);
    }
    expect(sim.flight).toBeNull();
    const hit = sim.events.find((e) => e.type === "hit");
    expect(hit).toBeDefined();
    if (hit?.type !== "hit") return;
    expect(hit.a).toBeCloseTo(predicted, 9);
    expect(hit.a).toBeCloseTo(mod360(IMPACT_ANGLE - sim.angle), 9);
    expect(sim.cardsStuck).toBe(1);
    expect(strikeScore(sim)).toBe(1 + (hit.orb !== null ? ORB_POINTS : 0));
  });

  it("ignores throws while a card is in the air and during the reload", () => {
    const sim = createStrike("busy");
    stepStrike(sim, true);
    let thrown = 1;
    for (let i = 1; i < THROW_INTERVAL; i++) {
      expect(canThrow(sim)).toBe(false);
      stepStrike(sim, true);
    }
    expect(sim.thrown).toBe(thrown);
    expect(canThrow(sim)).toBe(true);
    stepStrike(sim, true);
    thrown += 1;
    expect(sim.thrown).toBe(thrown);
  });

  it("hitting a stuck card is a clash and ends the run", () => {
    const sim = createStrike("clash");
    // Throw two cards back to back on a slow steady wheel: the second
    // lands only THROW_INTERVAL ticks of rotation later, which is less
    // than CARD_GAP on stage 1.
    expect(Math.abs(sim.stage.pattern.speed) * THROW_INTERVAL).toBeLessThan(CARD_GAP + 4);
    let guard = 0;
    while (!sim.dead && guard++ < 200) stepStrike(sim, canThrow(sim));
    expect(sim.dead).toBe(true);
    expect(sim.timedOut).toBe(false);
    const clash = sim.events.find((e) => e.type === "clash");
    expect(clash).toBeDefined();
    if (clash?.type !== "clash") return;
    expect(angleDistance(clash.a, clash.hit)).toBeLessThan(CARD_GAP);
    stepStrike(sim, true);
    expect(sim.events).toEqual([]);
  });

  it("sticking the needed cards shatters the wheel and starts the next stage", () => {
    const sim = createStrike("clear");
    const rec = new ThrowRecorder();
    let broke = false;
    let started = false;
    let breakTick = 0;
    while (!started && sim.tick < 5000) {
      const go = canThrow(sim) && safeAt(sim, predictImpact(sim), 2);
      if (go) rec.record(sim.tick);
      stepStrike(sim, go);
      for (const e of sim.events) {
        if (e.type === "break") {
          broke = true;
          breakTick = sim.tick;
          expect(sim.stagesCleared).toBe(1);
          expect(canThrow(sim)).toBe(false);
        }
        if (e.type === "stage") {
          started = true;
          expect(e.stage).toBe(2);
          expect(sim.tick - breakTick).toBe(BREAK_TICKS);
        }
      }
    }
    expect(broke).toBe(true);
    expect(sim.stage.index).toBe(2);
    expect(sim.stageStuck).toBe(0);
    expect(sim.stuck.every((card) => card.pre)).toBe(true);
    expect(strikeScore(sim)).toBe(STAGE_POINTS + MIN_CARDS + sim.orbsHit * ORB_POINTS);
  });

  it("a skilled bot reaches and beats boss wheels", () => {
    const run = playBot("boss-run", "skill", { margin: 1.5, maxTicks: 60 * 60 * 6 });
    expect(run.sim.stagesCleared).toBeGreaterThanOrEqual(5);
    expect(run.sim.bossesBeaten).toBeGreaterThanOrEqual(1);
    expect(run.score).toBe(
      run.sim.stagesCleared * STAGE_POINTS + run.sim.cardsStuck + run.sim.orbsHit * ORB_POINTS + run.sim.bossesBeaten * BOSS_BONUS
    );
  });
});

describe("strike replay validation", () => {
  it("validates an honest run and returns the replayed score", () => {
    const run = playBot("strike-practice:abc", "bot1", { lag: 6 });
    expect(run.sim.dead).toBe(true);
    expect(run.score).toBeGreaterThan(3);
    const verdict = validateStrikeRun("strike-practice:abc", run.inputs, run.score);
    expect(verdict).toEqual({ ok: true, score: run.score, ticks: run.inputs.ticks });
  });

  it("validates many seeds (record -> replay is exact)", () => {
    for (let i = 0; i < 25; i++) {
      const seed = `strike-practice:${i}`;
      const run = playBot(seed, `b${i}`, { lag: 2 + (i % 8) * 2, margin: i % 3 });
      const verdict = validateStrikeRun(seed, JSON.parse(JSON.stringify(run.inputs)), run.score);
      expect(verdict.ok).toBe(true);
    }
  });

  it("validates a quit mid-run", () => {
    const run = playBot("quit", "bot", { maxTicks: 900, margin: 2 });
    expect(run.sim.dead).toBe(false);
    expect(run.inputs.end).toBe("quit");
    expect(validateStrikeRun("quit", run.inputs, run.score)).toMatchObject({ ok: true, score: run.score });
  });

  it("rejects an inflated score", () => {
    const run = playBot("tamper1", "bot", { lag: 6 });
    const verdict = validateStrikeRun("tamper1", run.inputs, run.score + 1);
    expect(verdict).toMatchObject({ ok: false, reason: "Score does not match the replay.", replayScore: run.score });
    expect(validateStrikeRun("tamper1", run.inputs, run.score + STAGE_POINTS).ok).toBe(false);
  });

  it("rejects a run replayed on another seed", () => {
    const run = playBot("tamper2", "bot", { lag: 6 });
    expect(validateStrikeRun("other-seed", run.inputs, run.score).ok).toBe(false);
  });

  it("rejects shifted throws / a fake length / the wrong ending / dropped throws", () => {
    const run = playBot("tamper3", "bot", { lag: 6 });
    expect(run.inputs.e.length).toBeGreaterThan(4);
    const shifted: StrikeInputs = { ...run.inputs, e: [run.inputs.e[0] + 1, ...run.inputs.e.slice(1)] };
    expect(validateStrikeRun("tamper3", shifted, run.score).ok).toBe(false);
    expect(validateStrikeRun("tamper3", { ...run.inputs, ticks: run.inputs.ticks + 600 }, run.score).ok).toBe(false);
    expect(validateStrikeRun("tamper3", { ...run.inputs, end: "quit" }, run.score).ok).toBe(false);
    const cut: StrikeInputs = { ...run.inputs, e: run.inputs.e.slice(0, -1) };
    expect(validateStrikeRun("tamper3", cut, run.score).ok).toBe(false);
    // A throw added after the clash is never replayed: rejected.
    const extra: StrikeInputs = { ...run.inputs, e: [...run.inputs.e] };
    const last = decodeThrows(run.inputs.e, run.inputs.ticks)!.at(-1)!;
    if (last < run.inputs.ticks - 2) {
      extra.e.push(1);
      expect(validateStrikeRun("tamper3", extra, run.score).ok).toBe(false);
    }
  });

  it("rejects throws the engine would ignore (card still in the air)", () => {
    const sim = createStrike("ghost");
    const rec = new ThrowRecorder();
    for (let i = 0; i < 20; i++) stepStrike(sim, false);
    rec.record(sim.tick);
    stepStrike(sim, true);
    rec.record(sim.tick); // in flight: an honest client never records this
    stepStrike(sim, true);
    for (let i = 0; i < 20; i++) stepStrike(sim, false);
    const inputs = rec.finish("quit", sim.tick);
    expect(validateStrikeRun("ghost", inputs, strikeScore(sim))).toMatchObject({ ok: false, reason: "Replay does not match the run." });
  });

  it("rejects malformed inputs", () => {
    const base = { v: ENGINE_VERSION, end: "clash", ticks: 100 };
    expect(validateStrikeRun("s", null, 0)).toMatchObject({ ok: false, reason: "No inputs." });
    expect(validateStrikeRun("s", { ...base, v: 99, e: [] }, 0)).toMatchObject({ ok: false });
    expect(validateStrikeRun("s", { ...base, end: "win", e: [] }, 0)).toMatchObject({ reason: "Unknown run ending." });
    expect(validateStrikeRun("s", { ...base, ticks: MAX_TICKS + 1, e: [] }, 0)).toMatchObject({ reason: "Impossible run length." });
    expect(validateStrikeRun("s", { ...base, ticks: 0, e: [] }, 0)).toMatchObject({ reason: "Impossible run length." });
    expect(validateStrikeRun("s", { ...base, e: [10, 0] }, 0)).toMatchObject({ reason: "Malformed inputs." });
    expect(validateStrikeRun("s", { ...base, e: [-1] }, 0)).toMatchObject({ reason: "Malformed inputs." });
    expect(validateStrikeRun("s", { ...base, e: [1.5] }, 0)).toMatchObject({ reason: "Malformed inputs." });
    expect(validateStrikeRun("s", { ...base, e: [100] }, 0)).toMatchObject({ reason: "Malformed inputs." });
    expect(validateStrikeRun("s", { ...base, e: "10,20" }, 0)).toMatchObject({ reason: "Malformed inputs." });
    expect(validateStrikeRun("s", { ...base, e: [] }, -1)).toMatchObject({ reason: "Impossible score." });
    // No throws at all: the wheel just turns, nobody clashes.
    expect(validateStrikeRun("s", { ...base, e: [] }, 0)).toMatchObject({ reason: "Replay does not match the run." });
    expect(validateStrikeRun("s", { ...base, end: "quit", e: [] }, 0)).toMatchObject({ ok: true, score: 0 });
  });

  it("a throw spammer cannot beat the per-tick bound used by the database", () => {
    const sim = createStrike("spam");
    while (!sim.dead && sim.tick < 5000) {
      stepStrike(sim, true);
      expect(strikeScore(sim)).toBeLessThanOrEqual(Math.ceil(sim.tick * SCORE_PER_TICK_BOUND) + SCORE_FLAT_BOUND);
    }
  });

  it("perfect and orb-greedy bots stay under the bound at every tick", () => {
    for (let i = 0; i < 6; i++) {
      const perfect = playBot(`bound-${i}`, "p", { margin: 0.01, maxTicks: 60 * 60 * 10 });
      expect(perfect.boundViolations).toEqual([]);
      const greedy = playBot(`bound-${i}`, "g", { margin: 0.5, greedy: true, maxTicks: 60 * 60 * 10 });
      expect(greedy.boundViolations).toEqual([]);
      expect(greedy.sim.stagesCleared).toBeGreaterThan(3);
    }
  });

  it("the bound holds analytically for the worst stage", () => {
    // One stage: at most need cards, MAX_ORBS orbs, stage + boss points,
    // and at least need * THROW_INTERVAL - RELOAD + BREAK_TICKS ticks.
    for (let need = MIN_CARDS; need <= MAX_CARDS; need++) {
      const points = need + MAX_ORBS * ORB_POINTS + STAGE_POINTS + BOSS_BONUS;
      const ticks = need * THROW_INTERVAL - (THROW_INTERVAL - FLIGHT_TICKS) + BREAK_TICKS;
      expect(points).toBeLessThanOrEqual(ticks * SCORE_PER_TICK_BOUND);
      expect(points).toBeLessThanOrEqual(SCORE_FLAT_BOUND);
    }
  });

  it("decodes throws and refuses throws at or after the end", () => {
    expect(decodeThrows([5, 1, 10], 100)).toEqual([5, 6, 16]);
    expect(decodeThrows([0], 1)).toEqual([0]);
    expect(decodeThrows([1], 1)).toBeNull();
  });

  it("simulateThrows resumes a saved run to the same state", () => {
    const run = playBot("resume", "bot", { lag: 6 });
    const throws = decodeThrows(run.inputs.e, run.inputs.ticks)!;
    const half = Math.floor(run.inputs.ticks / 2);
    const resumed = simulateThrows("resume", throws, half);
    expect(resumed.sim.tick).toBe(half);
    const full = simulateThrows("resume", throws, run.inputs.ticks);
    expect(strikeScore(full.sim)).toBe(run.score);
    expect(full.unused).toBe(0);
  });
});
