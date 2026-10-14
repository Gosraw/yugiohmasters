import { describe, expect, it } from "vitest";

import {
  COMBO_GAP,
  DRAIN_BASE,
  ENGINE_VERSION,
  LOOKAHEAD,
  MAX_TICKS,
  MIN_STRIKE_GAP,
  RA_BONUS,
  RA_EVERY,
  SAFE_START,
  STRIKE_REFILL,
  TIER_EVERY,
  TIMER_MAX,
  TIMER_START,
  StrikeRecorder,
  canStrike,
  createObelisk,
  decodeStrikes,
  maxScoreFor,
  obeliskScore,
  obeliskTier,
  replayStrikes,
  simulateStrikes,
  stepObelisk,
  validateObeliskRun,
  type Block,
  type ObeliskInputs,
  type ObeliskSim,
  type Side,
} from "./obelisk-engine";

import { createPrng } from "./prng";

const other = (side: Side): Side => (side === "L" ? "R" : "L");

/** The side that is safe for the bottom block AND the one that drops onto you. */
function safeSide(sim: ObeliskSim): Side {
  const [a, b] = sim.blocks;
  for (const side of ["L", "R"] as Side[]) {
    if (a.blade !== side && b.blade !== side) return side;
  }
  throw new Error("unsolvable pair");
}

/** Wait `gap` ticks (no input), then strike `side`. */
function strikeAfter(sim: ObeliskSim, gap: number, side: Side, rec?: StrikeRecorder) {
  for (let i = 0; i < gap && !sim.dead; i++) stepObelisk(sim, null);
  if (sim.dead) return;
  if (!canStrike(sim)) throw new Error("cannot strike yet");
  rec?.record(sim.tick, side);
  stepObelisk(sim, side);
}

/** Bot: strikes the safe side every `gap` ticks; makes a mistake with probability `slip`. */
function playBot(seed: string, botSeed: string, gap = 10, slip = 0.01, maxStrikes = 100000) {
  const sim = createObelisk(seed);
  const rec = new StrikeRecorder();
  const rng = createPrng(botSeed);
  let first = true;
  while (!sim.dead && sim.strikes < maxStrikes && sim.tick < MAX_TICKS - gap - 2) {
    const side = rng.chance(slip) ? other(safeSide(sim)) : safeSide(sim);
    strikeAfter(sim, first ? 0 : gap, side, rec);
    first = false;
  }
  // A run that is still alive ends with a quit a little later.
  if (!sim.dead) stepObelisk(sim, null);
  const end = sim.dead ? (sim.cause === "time" ? "time" : sim.cause === "cut" ? "cut" : "quit") : "quit";
  return { sim, inputs: rec.finish(end, sim.tick), score: obeliskScore(sim) };
}

function blocksFor(seed: string, count: number): Block[] {
  const sim = createObelisk(seed);
  const out: Block[] = [];
  while (out.length < count) {
    out.push(sim.blocks[0]);
    const side = safeSide(sim);
    strikeAfter(sim, out.length === 1 ? 0 : MIN_STRIKE_GAP, side);
    if (sim.dead) throw new Error("bot died");
  }
  return out;
}

describe("obelisk engine basics", () => {
  it("is deterministic per seed and differs between seeds", () => {
    const pattern = (seed: string) => blocksFor(seed, 60).map((b) => `${b.blade ?? "-"}${b.ra ? "*" : ""}${b.tone}`).join("");
    expect(pattern("obelisk-daily:2026-10-14:a")).toBe(pattern("obelisk-daily:2026-10-14:a"));
    expect(pattern("obelisk-daily:2026-10-14:a")).not.toBe(pattern("obelisk-daily:2026-10-14:b"));
  });

  it("the block sequence does not depend on timing or sides", () => {
    // Slow on one side vs fast on the other: same blocks.
    const a = createObelisk("timing");
    const b = createObelisk("timing");
    const seenA: Block[] = [];
    const seenB: Block[] = [];
    for (let i = 0; i < 40 && !a.dead && !b.dead; i++) {
      seenA.push(a.blocks[0]);
      seenB.push(b.blocks[0]);
      strikeAfter(a, i === 0 ? 0 : 20, safeSide(a));
      strikeAfter(b, i === 0 ? 0 : MIN_STRIKE_GAP, safeSide(b));
    }
    expect(seenA.map((x) => x.index)).toEqual(seenB.map((x) => x.index));
    expect(seenA).toEqual(seenB);
  });

  it("starts safe: left side, no blades in the first blocks, lookahead filled", () => {
    const sim = createObelisk("start");
    expect(sim.side).toBe("L");
    expect(sim.blocks).toHaveLength(LOOKAHEAD);
    for (let i = 0; i < SAFE_START; i++) expect(sim.blocks[i].blade).toBeNull();
    expect(sim.timer).toBe(TIMER_START);
  });

  it("never puts blades on opposite sides of neighbouring blocks (always solvable)", () => {
    for (let s = 0; s < 40; s++) {
      const blocks = blocksFor(`solvable:${s}`, 400);
      for (let i = 1; i < blocks.length; i++) {
        const a = blocks[i - 1].blade;
        const b = blocks[i].blade;
        if (a && b) expect(b).toBe(a);
      }
    }
  });

  it("has blades often enough and Ra blocks only on the allowed slots", () => {
    const blocks = blocksFor("density", 500);
    const blades = blocks.filter((b) => b.blade).length;
    expect(blades).toBeGreaterThan(120);
    expect(blades).toBeLessThan(330);
    const ra = blocks.filter((b) => b.ra);
    expect(ra.length).toBeGreaterThan(10);
    for (const block of ra) {
      expect(block.index % RA_EVERY).toBe(RA_EVERY - 1);
      expect(block.blade).toBeNull();
    }
    // Some same-side doubles appear later on.
    let doubles = 0;
    for (let i = 1; i < blocks.length; i++) if (blocks[i].blade && blocks[i].blade === blocks[i - 1].blade) doubles++;
    expect(doubles).toBeGreaterThan(0);
  });

  it("a strike breaks the bottom block, drops the obelisk and scores", () => {
    const sim = createObelisk("strike");
    const second = sim.blocks[1];
    stepObelisk(sim, "R");
    expect(sim.side).toBe("R");
    expect(sim.strikes).toBe(1);
    expect(sim.blocks[0]).toBe(second);
    expect(sim.blocks).toHaveLength(LOOKAHEAD);
    expect(sim.events[0]).toMatchObject({ type: "strike", side: "R", combo: 1 });
    expect(sim.started).toBe(true);
  });

  it("walking into a blade cuts you (no strike)", () => {
    for (let s = 0; s < 200; s++) {
      const sim = createObelisk(`walk:${s}`);
      // advance until the bottom block has a blade
      let guard = 0;
      while (sim.blocks[0].blade === null && guard++ < 50) strikeAfter(sim, MIN_STRIKE_GAP, safeSide(sim));
      if (sim.dead || sim.blocks[0].blade === null) continue;
      const blade = sim.blocks[0].blade;
      const strikes = sim.strikes;
      strikeAfter(sim, MIN_STRIKE_GAP, blade);
      expect(sim.dead).toBe(true);
      expect(sim.cause).toBe("cut");
      expect(sim.events[0]).toMatchObject({ type: "cut", by: "walk", side: blade });
      expect(sim.strikes).toBe(strikes);
      return;
    }
    throw new Error("no blade found");
  });

  it("a blade dropping onto your side cuts you (the strike still counts)", () => {
    for (let s = 0; s < 200; s++) {
      const sim = createObelisk(`fall:${s}`);
      let guard = 0;
      while (!(sim.blocks[0].blade === null && sim.blocks[1].blade) && guard++ < 60) strikeAfter(sim, MIN_STRIKE_GAP, safeSide(sim));
      if (sim.dead || !sim.blocks[1].blade) continue;
      const blade = sim.blocks[1].blade;
      const strikes = sim.strikes;
      strikeAfter(sim, MIN_STRIKE_GAP, blade);
      expect(sim.dead).toBe(true);
      expect(sim.events.map((e) => e.type)).toEqual(["strike", "cut"]);
      expect(sim.events[1]).toMatchObject({ by: "fall", side: blade });
      expect(sim.strikes).toBe(strikes + 1);
      return;
    }
    throw new Error("no falling blade found");
  });

  it("ignores inputs closer than MIN_STRIKE_GAP ticks", () => {
    const sim = createObelisk("gap");
    stepObelisk(sim, "L");
    for (let i = 1; i < MIN_STRIKE_GAP; i++) {
      expect(canStrike(sim)).toBe(false);
      stepObelisk(sim, safeSide(sim));
    }
    expect(sim.strikes).toBe(1);
    expect(canStrike(sim)).toBe(true);
  });

  it("the timer waits for the first strike, drains, refills and runs out", () => {
    const sim = createObelisk("timer");
    for (let i = 0; i < 100; i++) stepObelisk(sim, null);
    expect(sim.timer).toBe(TIMER_START);
    stepObelisk(sim, "L");
    expect(sim.timer).toBe(TIMER_START + STRIKE_REFILL - DRAIN_BASE);
    const before = sim.timer;
    stepObelisk(sim, null);
    expect(sim.timer).toBe(before - DRAIN_BASE);
    let ticks = 0;
    while (!sim.dead) {
      stepObelisk(sim, null);
      ticks++;
    }
    expect(sim.cause).toBe("time");
    expect(sim.events[0]).toEqual({ type: "timeout" });
    expect(ticks).toBeGreaterThan(300);
    expect(sim.timer).toBe(0);
  });

  it("the timer never exceeds the max", () => {
    const sim = createObelisk("cap");
    stepObelisk(sim, "L");
    for (let i = 0; i < 80 && !sim.dead; i++) strikeAfter(sim, MIN_STRIKE_GAP, safeSide(sim));
    expect(sim.timer).toBeLessThanOrEqual(TIMER_MAX);
    expect(sim.timer).toBeGreaterThan(TIMER_MAX - 200);
  });

  it("speeds up every TIER_EVERY strikes", () => {
    const sim = createObelisk("tiers");
    stepObelisk(sim, safeSide(sim));
    let tierUps = 0;
    while (sim.strikes < TIER_EVERY * 3 && !sim.dead) {
      strikeAfter(sim, MIN_STRIKE_GAP, safeSide(sim));
      for (const e of sim.events) if (e.type === "strike" && e.tierUp) tierUps++;
    }
    expect(tierUps).toBe(3);
    expect(obeliskTier(sim)).toBe(3);
  });

  it("Ra blocks give bonus points", () => {
    const sim = createObelisk("ra");
    stepObelisk(sim, safeSide(sim));
    while (sim.raHits < 2 && !sim.dead && sim.strikes < 300) strikeAfter(sim, MIN_STRIKE_GAP, safeSide(sim));
    expect(sim.raHits).toBe(2);
    expect(obeliskScore(sim)).toBe(sim.strikes + 2 * RA_BONUS);
  });

  it("combo counts quick strikes and resets after a pause", () => {
    const sim = createObelisk("combo");
    stepObelisk(sim, "L");
    for (let i = 0; i < 5; i++) strikeAfter(sim, 10, safeSide(sim));
    expect(sim.combo).toBe(6);
    strikeAfter(sim, COMBO_GAP + 5, safeSide(sim));
    expect(sim.combo).toBe(1);
    expect(sim.bestCombo).toBe(6);
  });

  it("a careful bot survives a long time (the game is fair at speed)", () => {
    // 6 strikes per second, never wrong: outlasts tier 6.
    const run = playBot("fair", "careful", 10, 0, 220);
    expect(run.sim.dead).toBe(false);
    expect(run.sim.strikes).toBe(220);
  });

  it("a slow bot runs out of time", () => {
    const run = playBot("slow", "slow", 30, 0);
    expect(run.sim.cause).toBe("time");
  });
});

describe("obelisk replay validation", () => {
  it("validates an honest run and returns the replayed score", () => {
    const run = playBot("obelisk-practice:abc", "bot1", 9, 0.02);
    expect(run.score).toBeGreaterThan(3);
    const verdict = validateObeliskRun("obelisk-practice:abc", run.inputs, run.score);
    expect(verdict).toEqual({ ok: true, score: run.score, ticks: run.inputs.ticks });
  });

  it("validates many seeds and endings (record -> replay is exact)", () => {
    const ends = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const seed = `obelisk-practice:${i}`;
      const run = playBot(seed, `b${i}`, 5 + (i % 5) * 5, 0.004 + (i % 3) * 0.01);
      ends.add(run.inputs.end);
      const verdict = validateObeliskRun(seed, JSON.parse(JSON.stringify(run.inputs)), run.score);
      expect(verdict.ok).toBe(true);
    }
    expect(ends.has("cut")).toBe(true);
    expect(ends.has("time")).toBe(true);
  });

  it("validates a quit mid-run", () => {
    const sim = createObelisk("quit");
    const rec = new StrikeRecorder();
    strikeAfter(sim, 0, safeSide(sim), rec);
    for (let i = 0; i < 6; i++) strikeAfter(sim, 8, safeSide(sim), rec);
    for (let i = 0; i < 30; i++) stepObelisk(sim, null);
    const inputs = rec.finish("quit", sim.tick);
    expect(validateObeliskRun("quit", inputs, obeliskScore(sim))).toMatchObject({ ok: true, score: 7 });
  });

  it("rejects an inflated score", () => {
    const run = playBot("tamper1", "bot", 9, 0.02);
    const verdict = validateObeliskRun("tamper1", run.inputs, run.score + 1);
    expect(verdict).toMatchObject({ ok: false, reason: "Score does not match the replay.", replayScore: run.score });
  });

  it("rejects a run replayed on another seed", () => {
    const run = playBot("tamper2", "bot", 9, 0.01);
    expect(run.score).toBeGreaterThan(10);
    expect(validateObeliskRun("other-seed", run.inputs, run.score).ok).toBe(false);
  });

  it("rejects shifted inputs / flipped sides / a fake length / the wrong ending", () => {
    const run = playBot("tamper3", "bot", 9, 0.01);
    const shifted: ObeliskInputs = { ...run.inputs, e: [run.inputs.e[0] + 1, ...run.inputs.e.slice(1)] };
    expect(validateObeliskRun("tamper3", shifted, run.score).ok).toBe(false);
    const flipped: ObeliskInputs = { ...run.inputs, s: run.inputs.s.replace(/./g, (c) => (c === "L" ? "R" : "L")) };
    expect(validateObeliskRun("tamper3", flipped, run.score).ok).toBe(false);
    expect(validateObeliskRun("tamper3", { ...run.inputs, ticks: run.inputs.ticks + 600 }, run.score).ok).toBe(false);
    expect(validateObeliskRun("tamper3", { ...run.inputs, end: "quit" }, run.score).ok).toBe(false);
    const cut: ObeliskInputs = { ...run.inputs, e: run.inputs.e.slice(0, -1), s: run.inputs.s.slice(0, -1) };
    expect(validateObeliskRun("tamper3", cut, run.score).ok).toBe(false);
  });

  it("rejects inputs the engine would ignore (spam inside the strike gap)", () => {
    const sim = createObelisk("spamgap");
    const rec = new StrikeRecorder();
    strikeAfter(sim, 0, "L", rec);
    // A tampered log with a strike only 1 tick later.
    const inputs: ObeliskInputs = { v: ENGINE_VERSION, e: [0, 1], s: "LL", end: "quit", ticks: 50 };
    expect(validateObeliskRun("spamgap", inputs, 2)).toMatchObject({ ok: false, reason: "Replay does not match the run." });
    expect(validateObeliskRun("spamgap", inputs, 1)).toMatchObject({ ok: false });
  });

  it("rejects inputs after the run ended", () => {
    const run = playBot("after", "bot", 9, 0.05);
    expect(run.inputs.end).not.toBe("quit");
    const extra: ObeliskInputs = { ...run.inputs, e: [...run.inputs.e, 5], s: `${run.inputs.s}L`, ticks: run.inputs.ticks + 10 };
    expect(validateObeliskRun("after", extra, run.score).ok).toBe(false);
  });

  it("rejects malformed inputs", () => {
    const base = { v: ENGINE_VERSION, end: "cut", ticks: 100 };
    expect(validateObeliskRun("s", null, 0)).toMatchObject({ ok: false, reason: "No inputs." });
    expect(validateObeliskRun("s", { ...base, v: 99, e: [], s: "" }, 0)).toMatchObject({ ok: false });
    expect(validateObeliskRun("s", { ...base, end: "win", e: [], s: "" }, 0)).toMatchObject({ reason: "Unknown run ending." });
    expect(validateObeliskRun("s", { ...base, ticks: MAX_TICKS + 1, e: [], s: "" }, 0)).toMatchObject({ reason: "Impossible run length." });
    expect(validateObeliskRun("s", { ...base, ticks: 0, e: [], s: "" }, 0)).toMatchObject({ reason: "Impossible run length." });
    expect(validateObeliskRun("s", { ...base, e: [10, 0], s: "LR" }, 0)).toMatchObject({ reason: "Malformed inputs." });
    expect(validateObeliskRun("s", { ...base, e: [-1], s: "L" }, 0)).toMatchObject({ reason: "Malformed inputs." });
    expect(validateObeliskRun("s", { ...base, e: [1.5], s: "L" }, 0)).toMatchObject({ reason: "Malformed inputs." });
    expect(validateObeliskRun("s", { ...base, e: [100], s: "L" }, 0)).toMatchObject({ reason: "Malformed inputs." });
    expect(validateObeliskRun("s", { ...base, e: [10], s: "X" }, 0)).toMatchObject({ reason: "Malformed inputs." });
    expect(validateObeliskRun("s", { ...base, e: [10, 5], s: "L" }, 0)).toMatchObject({ reason: "Malformed inputs." });
    expect(validateObeliskRun("s", { ...base, e: [10] }, 0)).toMatchObject({ reason: "Malformed inputs." });
    expect(validateObeliskRun("s", { ...base, e: "10,20", s: "LR" }, 0)).toMatchObject({ reason: "Malformed inputs." });
    expect(validateObeliskRun("s", { ...base, e: [], s: "" }, -1)).toMatchObject({ reason: "Impossible score." });
  });

  it("a spammer / perfect bot cannot beat the per-tick bound used by the database", () => {
    // Input on every single tick with the safe side: the engine only acts every MIN_STRIKE_GAP ticks.
    const sim = createObelisk("spam");
    while (!sim.dead && sim.tick < 20000) stepObelisk(sim, safeSide(sim));
    expect(sim.strikes).toBeGreaterThan(1000);
    const db = (ticks: number) => Math.ceil(ticks * 0.375) + 2; // mini_game_catalog row
    expect(obeliskScore(sim)).toBeLessThanOrEqual(maxScoreFor(sim.tick));
    expect(obeliskScore(sim)).toBeLessThanOrEqual(db(sim.tick));
    for (const ticks of [1, 2, 3, 4, 5, 39, 40, 41, 400, 4000, MAX_TICKS]) {
      expect(maxScoreFor(ticks)).toBeLessThanOrEqual(db(ticks));
    }
  });

  it("decodes strikes and refuses strikes at or after the end", () => {
    expect(decodeStrikes([5, 4, 10], "LRL", 100)).toEqual([
      { tick: 5, side: "L" },
      { tick: 9, side: "R" },
      { tick: 19, side: "L" },
    ]);
    expect(decodeStrikes([0], "R", 1)).toEqual([{ tick: 0, side: "R" }]);
    expect(decodeStrikes([1], "R", 1)).toBeNull();
  });

  it("simulateStrikes resumes a saved run to the same state", () => {
    const run = playBot("resume", "bot", 9, 0.02);
    const strikes = decodeStrikes(run.inputs.e, run.inputs.s, run.inputs.ticks)!;
    const half = Math.floor(run.inputs.ticks / 2);
    const resumed = simulateStrikes("resume", strikes, half);
    expect(resumed.tick).toBe(half);
    const full = replayStrikes("resume", strikes, run.inputs.ticks);
    expect(full.ignored).toBe(0);
    expect(obeliskScore(full.sim)).toBe(run.score);
  });
});
