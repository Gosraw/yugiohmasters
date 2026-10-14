import {
  createPrng,
  type Prng,
} from "./prng";

// =========================================================
// PYRAMID STACK - shared, pure simulation (no DOM).
//
// A Stack-style tower: a sandstone block slides back and forth
// over the top of the tower; one tap drops it. Whatever hangs
// over the edge is sliced off, so the tower gets narrower, unless
// the drop is PERFECT (within PERFECT_TOLERANCE): then the block
// snaps exactly onto the one below and keeps its full size. Three
// perfects in a row and every perfect after that grows the block
// back a little (up to the original size). Missing the tower
// completely ends the run. Score = blocks stacked.
//
// The exact same code runs in the browser (live play) and in the
// server action (replay to validate a submitted run), so it follows
// the same rules as climber-engine.ts:
//
//   1. Fixed timestep: one step = one tick = 1/60 s.
//   2. Only + - * / Math.abs / Math.min / Math.max / Math.floor.
//      (IEEE-754 exact, identical in V8 and JavaScriptCore.)
//   3. Randomness only from the seeded PRNG, drawn in a fixed order
//      per spawned block (start side, speed jitter, stone tone), so
//      the draws never depend on WHEN the player taps.
//
// Coordinates: the tower stands on a square base BASE_SIZE wide,
// centred on (0, 0) in the ground plane (x, z). Even levels slide
// along x, odd levels along z (the renderer draws that as coming in
// from the left / from the right in an isometric view).
// =========================================================

/** Database game key (mini_game_catalog / game_runs.game). */
export const STACK_GAME = "pyramid_stack";

export const ENGINE_VERSION = 1;

export const TICKS_PER_SECOND = 60;

/** 30 minutes: the same cap submit_game_run() enforces. */
export const MAX_TICKS =
  30 * 60 * TICKS_PER_SECOND;

export const BASE_SIZE = 100;

/** How far (from the tower centre) a block slides out on each side. */
export const SLIDE_RANGE = 140;

/** |offset| at or below this counts as a perfect drop. */
export const PERFECT_TOLERANCE = 4;

/** Perfects in a row before the block starts growing back. */
export const GROW_COMBO = 3;

/** How much a combo perfect grows the block (along its axis). */
export const GROW_STEP = 6;

/**
 * A new block ignores taps for its first ticks: a double tap can't
 * throw the next block away, and it bounds the score per tick
 * (max_score_per_tick = 0.1 in the mini_game_catalog row).
 */
export const MIN_LIVE_TICKS = 10;

const SPEED_BASE = 1.9;

const SPEED_RAMP = 0.03;

const SPEED_MAX = 4.0;

/** Stone tones the renderer can pick from (0..TONES-1). */
export const TONES = 6;

export type Slab = {
  level: number;
  x: number;
  z: number;
  w: number;
  d: number;
  tone: number;
  perfect: boolean;
};

export type MovingBlock = {
  level: number;
  /** 0 = slides along x, 1 = slides along z. */
  axis: 0 | 1;
  x: number;
  z: number;
  w: number;
  d: number;
  dir: 1 | -1;
  speed: number;
  tone: number;
  /** Ticks since it spawned. */
  live: number;
};

/** A sliced-off (or missed) piece, for the renderer to drop. */
export type Piece = {
  level: number;
  x: number;
  z: number;
  w: number;
  d: number;
  tone: number;
};

export type StackEvent =
  | {
      type: "place";
      level: number;
      perfect: boolean;
      combo: number;
      grew: boolean;
      cut: Piece | null;
    }
  | {
      type: "miss";
      piece: Piece;
    };

export type StackSim = {
  seed: string;
  rng: Prng;
  tick: number;
  dead: boolean;
  timedOut: boolean;
  /** Blocks stacked (= score). */
  placed: number;
  combo: number;
  bestCombo: number;
  perfects: number;
  /** slabs[0] is the base; slabs[n] the n-th stacked block. */
  slabs: Slab[];
  moving: MovingBlock;
  /** Previous-tick position of the moving block (render interpolation). */
  prevPos: number;
  /** Events of the LAST step only. */
  events: StackEvent[];
};

function speedFor(
  level: number
) {
  return Math.min(
    SPEED_MAX,
    SPEED_BASE + (level - 1) * SPEED_RAMP
  );
}

function spawn(
  sim: StackSim
): MovingBlock {
  const top =
    sim.slabs[sim.slabs.length - 1];

  const level =
    top.level + 1;

  const axis: 0 | 1 =
    level % 2 === 1
      ? 0
      : 1;

  // Fixed draw order per block: side, jitter, tone.
  // Mostly from the back (classic), sometimes from the front.
  const side =
    sim.rng.chance(0.7)
      ? -1
      : 1;

  const jitter =
    sim.rng.range(0.94, 1.06);

  const tone =
    sim.rng.int(0, TONES - 1);

  return {
    level,
    axis,
    x: axis === 0
      ? top.x + side * SLIDE_RANGE
      : top.x,
    z: axis === 1
      ? top.z + side * SLIDE_RANGE
      : top.z,
    w: top.w,
    d: top.d,
    dir: side === -1
      ? 1
      : -1,
    speed: speedFor(level) * jitter,
    tone,
    live: 0,
  };
}

export function movingPos(
  block: MovingBlock
) {
  return block.axis === 0
    ? block.x
    : block.z;
}

export function createStack(
  seed: string
): StackSim {
  const sim: StackSim = {
    seed,
    rng: createPrng(seed),
    tick: 0,
    dead: false,
    timedOut: false,
    placed: 0,
    combo: 0,
    bestCombo: 0,
    perfects: 0,
    slabs: [
      {
        level: 0,
        x: 0,
        z: 0,
        w: BASE_SIZE,
        d: BASE_SIZE,
        tone: 0,
        perfect: false,
      },
    ],
    moving: null as unknown as MovingBlock,
    prevPos: 0,
    events: [],
  };

  sim.moving = spawn(sim);
  sim.prevPos = movingPos(sim.moving);

  return sim;
}

function drop(
  sim: StackSim
) {
  const block = sim.moving;

  const top =
    sim.slabs[sim.slabs.length - 1];

  const along =
    block.axis === 0;

  const pos = along
    ? block.x
    : block.z;

  const topPos = along
    ? top.x
    : top.z;

  const size = along
    ? block.w
    : block.d;

  const offset =
    pos - topPos;

  const distance =
    Math.abs(offset);

  if (distance <= PERFECT_TOLERANCE) {
    sim.combo += 1;
    sim.perfects += 1;
    sim.bestCombo = Math.max(sim.bestCombo, sim.combo);

    const grew =
      sim.combo >= GROW_COMBO &&
      size < BASE_SIZE;

    const newSize = grew
      ? Math.min(BASE_SIZE, size + GROW_STEP)
      : size;

    const slab: Slab = {
      level: block.level,
      x: top.x,
      z: top.z,
      w: along
        ? newSize
        : block.w,
      d: along
        ? block.d
        : newSize,
      tone: block.tone,
      perfect: true,
    };

    sim.slabs.push(slab);
    sim.placed += 1;

    sim.events.push({
      type: "place",
      level: block.level,
      perfect: true,
      combo: sim.combo,
      grew,
      cut: null,
    });

    return;
  }

  const overlap =
    size - distance;

  if (overlap <= 0) {
    sim.dead = true;
    sim.combo = 0;

    sim.events.push({
      type: "miss",
      piece: {
        level: block.level,
        x: block.x,
        z: block.z,
        w: block.w,
        d: block.d,
        tone: block.tone,
      },
    });

    return;
  }

  sim.combo = 0;

  // Kept part: the overlap, centred between the two blocks' edges.
  const keptCentre =
    topPos + offset / 2;

  // Cut part: what hangs over, on the side the block overshot.
  const cutSize =
    distance;

  const sign =
    offset > 0
      ? 1
      : -1;

  const cutCentre =
    keptCentre + sign * (overlap / 2 + cutSize / 2);

  const slab: Slab = {
    level: block.level,
    x: along
      ? keptCentre
      : block.x,
    z: along
      ? block.z
      : keptCentre,
    w: along
      ? overlap
      : block.w,
    d: along
      ? block.d
      : overlap,
    tone: block.tone,
    perfect: false,
  };

  sim.slabs.push(slab);
  sim.placed += 1;

  sim.events.push({
    type: "place",
    level: block.level,
    perfect: false,
    combo: 0,
    grew: false,
    cut: {
      level: block.level,
      x: along
        ? cutCentre
        : block.x,
      z: along
        ? block.z
        : cutCentre,
      w: along
        ? cutSize
        : block.w,
      d: along
        ? block.d
        : cutSize,
      tone: block.tone,
    },
  });
}

/** True when a tap on this tick would actually drop the block. */
export function canDrop(
  sim: StackSim
) {
  return (
    !sim.dead &&
    sim.moving.live >= MIN_LIVE_TICKS
  );
}

/**
 * One tick. `tap` = the player tapped on this tick (processed
 * before the block moves). Taps during MIN_LIVE_TICKS are ignored.
 */
export function stepStack(
  sim: StackSim,
  tap: boolean
) {
  sim.events = [];

  if (sim.dead) return;

  if (
    tap &&
    canDrop(sim)
  ) {
    drop(sim);

    if (!sim.dead) {
      sim.moving = spawn(sim);
      sim.prevPos = movingPos(sim.moving);
    }
  }

  sim.tick += 1;

  if (sim.dead) return;

  const block = sim.moving;

  sim.prevPos = movingPos(block);

  const top =
    sim.slabs[sim.slabs.length - 1];

  const centre = block.axis === 0
    ? top.x
    : top.z;

  const lo =
    centre - SLIDE_RANGE;

  const hi =
    centre + SLIDE_RANGE;

  let pos =
    movingPos(block) + block.dir * block.speed;

  if (pos > hi) {
    pos = hi - (pos - hi);
    block.dir = -1;
  } else if (pos < lo) {
    pos = lo + (lo - pos);
    block.dir = 1;
  }

  if (block.axis === 0) {
    block.x = pos;
  } else {
    block.z = pos;
  }

  block.live += 1;

  if (sim.tick >= MAX_TICKS) {
    sim.dead = true;
    sim.timedOut = true;
  }
}

export function stackScore(
  sim: StackSim
) {
  return sim.placed;
}

// ---------------------------------------------------------
// Input recording + replay (anti-cheat)
// ---------------------------------------------------------

export type RunEnd =
  | "miss"
  | "quit";

/**
 * A recorded run. `e` is a delta-encoded list of tap ticks:
 * [firstTapTick, ticksSincePrevTap, ...] (every delta after the
 * first is at least 1: one tap per tick at most).
 */
export type StackInputs = {
  v: typeof ENGINE_VERSION;
  e: number[];
  end: RunEnd;
  ticks: number;
};

export class TapRecorder {
  private events: number[] = [];

  private lastTick = -1;

  /** Call with sim.tick BEFORE stepStack(sim, true). */
  record(
    tick: number
  ) {
    if (tick <= this.lastTick) return;

    this.events.push(
      this.lastTick < 0
        ? tick
        : tick - this.lastTick
    );

    this.lastTick = tick;
  }

  finish(
    end: RunEnd,
    ticks: number
  ): StackInputs {
    return {
      v: ENGINE_VERSION,
      e: [...this.events],
      end,
      ticks,
    };
  }

  snapshot() {
    return {
      e: [...this.events],
      lastTick: this.lastTick,
    };
  }

  static restore(snapshot: {
    e: number[];
    lastTick: number;
  }) {
    const recorder =
      new TapRecorder();

    recorder.events = [...snapshot.e];
    recorder.lastTick = snapshot.lastTick;

    return recorder;
  }
}

/** Validates shape and decodes to absolute tap ticks; null = malformed. */
export function decodeTaps(
  events: unknown,
  totalTicks: number
): number[] | null {
  if (
    !Array.isArray(events) ||
    events.length > totalTicks ||
    events.length > MAX_TICKS
  ) {
    return null;
  }

  const ticks: number[] = [];

  let tick = 0;

  for (let i = 0; i < events.length; i++) {
    const dt =
      events[i];

    if (
      !Number.isInteger(dt) ||
      dt < (i === 0 ? 0 : 1)
    ) {
      return null;
    }

    tick = i === 0
      ? dt
      : tick + dt;

    if (tick >= totalTicks) {
      return null;
    }

    ticks.push(tick);
  }

  return ticks;
}

/** Re-simulate from seed + tap ticks, up to `uptoTick` (or the miss). */
export function simulateTaps(
  seed: string,
  taps: number[],
  uptoTick: number
) {
  const sim =
    createStack(seed);

  let cursor = 0;

  while (
    !sim.dead &&
    sim.tick < uptoTick
  ) {
    const tap =
      cursor < taps.length &&
      taps[cursor] === sim.tick;

    if (tap) cursor += 1;

    stepStack(
      sim,
      tap
    );
  }

  return sim;
}

export type RunVerdict =
  | {
      ok: true;
      score: number;
      ticks: number;
    }
  | {
      ok: false;
      reason: string;
      replayScore?: number;
    };

/**
 * Server-side validation: replays the run and checks that the
 * client's claims (score, length, how it ended) match exactly.
 */
export function validateStackRun(
  seed: string,
  inputs: unknown,
  claimedScore: number
): RunVerdict {
  if (
    typeof inputs !== "object" ||
    inputs === null
  ) {
    return {
      ok: false,
      reason: "No inputs.",
    };
  }

  const run =
    inputs as Partial<StackInputs>;

  if (run.v !== ENGINE_VERSION) {
    return {
      ok: false,
      reason: "Game version changed. Reload the page.",
    };
  }

  if (
    run.end !== "miss" &&
    run.end !== "quit"
  ) {
    return {
      ok: false,
      reason: "Unknown run ending.",
    };
  }

  const ticks =
    run.ticks;

  if (
    typeof ticks !== "number" ||
    !Number.isInteger(ticks) ||
    ticks < 1 ||
    ticks > MAX_TICKS
  ) {
    return {
      ok: false,
      reason: "Impossible run length.",
    };
  }

  if (
    !Number.isInteger(claimedScore) ||
    claimedScore < 0
  ) {
    return {
      ok: false,
      reason: "Impossible score.",
    };
  }

  const taps =
    decodeTaps(
      run.e,
      ticks
    );

  if (!taps) {
    return {
      ok: false,
      reason: "Malformed inputs.",
    };
  }

  const sim =
    simulateTaps(
      seed,
      taps,
      ticks
    );

  const replayScore =
    stackScore(sim);

  if (run.end === "miss") {
    if (
      !sim.dead ||
      sim.timedOut ||
      sim.tick !== ticks
    ) {
      return {
        ok: false,
        reason: "Replay does not match the run.",
        replayScore,
      };
    }
  } else if (
    sim.tick !== ticks ||
    (sim.dead && !sim.timedOut)
  ) {
    return {
      ok: false,
      reason: "Replay does not match the run.",
      replayScore,
    };
  }

  if (replayScore !== claimedScore) {
    return {
      ok: false,
      reason: "Score does not match the replay.",
      replayScore,
    };
  }

  return {
    ok: true,
    score: replayScore,
    ticks,
  };
}
