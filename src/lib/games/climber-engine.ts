import {
  createPrng,
  type Prng,
} from "./prng";

// =========================================================
// PYRAMID CLIMB - shared, pure simulation (no DOM).
//
// The exact same code runs in the browser (live play) and in the
// server action (replay to validate a submitted run). That only
// works if every step is bit-for-bit deterministic on every
// JavaScript engine, so this file follows three rules:
//
//   1. Fixed timestep: one step = one tick = 1/60 s. Real frame
//      time never enters the simulation.
//   2. Only + - * / Math.floor / Math.abs / Math.min / Math.max.
//      These are exactly specified by IEEE-754 and identical in
//      V8 (Node, Chrome) and JavaScriptCore (iOS Safari).
//      NO Math.sin / cos / pow / exp / sqrt / random here: moving
//      platforms use a triangle wave, distances are compared
//      squared.
//   3. Randomness comes only from the seeded PRNG, and only the
//      level generator draws from it, always in the same order
//      (generation is driven by height, never by player input).
//
// Coordinates: world units, x in [0, WORLD_W) wrapping around,
// y grows UPWARD (y = 0 is the starting floor). The player's y is
// the bottom of the sprite (its feet).
//
// Score = highest height reached / 10 ("metres").
// =========================================================

export const ENGINE_VERSION = 1;

export const TICKS_PER_SECOND = 60;

export const WORLD_W = 400;

export const STEER_MAX = 4;

/** Hard cap on run length (30 minutes): bounds server replay cost. */
export const MAX_TICKS =
  30 * 60 * TICKS_PER_SECOND;

const GRAVITY = 0.42;

/** Normal bounce: apex ~286 units above the platform. */
export const JUMP_V = 15.5;

/** "Pot of Greed" boost: apex ~870 units. */
const BOOST_V = 27;

/** Monster Reborn revive launch. */
const REVIVE_V = 22;

const MAX_VX = 6.5;

const STEER_ACCEL = 0.2;

export const PLAYER_HALF_W = 18;

export const PLAYER_H = 36;

/** Half-width of the player's "feet" for landing checks. */
const FOOT_HALF_W = 12;

/** Camera bottom trails the player's height by this much. */
export const CAMERA_OFFSET = 330;

/** Falling this far below the camera bottom = out. */
export const DEATH_DEPTH = 60;

const GENERATE_AHEAD = 1400;

const PRUNE_BELOW = 220;

/** Height (world units) at which difficulty reaches 1. */
const DIFFICULTY_HEIGHT = 20000;

/** Largest gap between consecutive path platforms (< apex 286). */
const MAX_GAP = 238;

const SLOW_TICKS = 240;

const SLOW_SCALE = 0.6;

const STUN_TICKS = 45;

const REVIVE_INVULN_TICKS = 150;

const BOOST_SHIELD_TICKS = 70;

const MAX_LIVES = 3;

export const ITEM_RADIUS = 16;

export const TRAP_HALF_W = 15;

export const TRAP_HALF_H = 21;

export type PlatformKind =
  | "ground"
  | "normal"
  | "crumble"
  | "moving";

export type Platform = {
  id: number;
  kind: PlatformKind;
  /** Centre x (for moving platforms: centre of the swing). */
  baseX: number;
  /** Top surface height. */
  y: number;
  w: number;
  /** Swing half-width (moving only). */
  range: number;
  /** Swing cycles per world tick (moving only). */
  speed: number;
  phase: number;
  /** Bounces left; -1 = unlimited. */
  hp: number;
  broken: boolean;
  brokenAt: number;
  /** Visual glyph index (render only, drawn from the PRNG). */
  glyph: number;
};

export type ItemKind =
  | "reborn"
  | "swords"
  | "pot";

export type Item = {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  taken: boolean;
};

export type Trap = {
  id: number;
  x: number;
  /** Centre height. */
  y: number;
  hit: boolean;
};

export type SimEventType =
  | "bounce"
  | "crumble"
  | "pickup"
  | "trap"
  | "revive"
  | "death";

export type SimEvent = {
  type: SimEventType;
  x: number;
  y: number;
  kind?: ItemKind | PlatformKind;
};

type Generator = {
  rng: Prng;
  nextId: number;
  lastY: number;
  lastX: number;
};

export type ClimberSim = {
  seed: string;
  tick: number;
  /** Advances slower during slow motion; drives moving platforms. */
  worldTime: number;

  x: number;
  y: number;
  vx: number;
  vy: number;
  prevX: number;
  prevY: number;

  camBottom: number;
  prevCamBottom: number;
  maxY: number;

  lives: number;
  slowTicks: number;
  shieldTicks: number;
  stunTicks: number;
  invulnTicks: number;
  lastBounceTick: number;

  dead: boolean;
  timedOut: boolean;

  platforms: Platform[];
  items: Item[];
  traps: Trap[];

  /** What happened during the last step (for sound/particles). */
  events: SimEvent[];

  gen: Generator;
};

// ---------------------------------------------------------
// Small deterministic helpers
// ---------------------------------------------------------

export function wrapX(
  x: number
) {
  return x - Math.floor(x / WORLD_W) * WORLD_W;
}

/** Shortest horizontal distance on the wrapping world. */
export function wrapDist(
  a: number,
  b: number
) {
  const d =
    Math.abs(
      wrapX(a) - wrapX(b)
    );

  return Math.min(
    d,
    WORLD_W - d
  );
}

/** Triangle wave in [-1, 1] with period 1. */
function tri(
  t: number
) {
  const f =
    t - Math.floor(t);

  return 1 - 4 * Math.abs(f - 0.5);
}

function clamp(
  value: number,
  min: number,
  max: number
) {
  return Math.min(
    max,
    Math.max(min, value)
  );
}

export function difficultyAt(
  height: number
) {
  return clamp(
    height / DIFFICULTY_HEIGHT,
    0,
    1
  );
}

export function platformX(
  platform: Platform,
  worldTime: number
) {
  if (platform.kind !== "moving") {
    return platform.baseX;
  }

  return wrapX(
    platform.baseX +
      tri(worldTime * platform.speed + platform.phase) * platform.range
  );
}

export function scoreForHeight(
  height: number
) {
  return Math.max(
    0,
    Math.floor(height / 10)
  );
}

export function climberScore(
  sim: ClimberSim
) {
  return scoreForHeight(sim.maxY);
}

// ---------------------------------------------------------
// Level generation (seeded, height-driven)
// ---------------------------------------------------------

function newPlatform(
  gen: Generator,
  kind: PlatformKind,
  baseX: number,
  y: number,
  d: number
): Platform {
  const rng =
    gen.rng;

  const w =
    kind === "ground"
      ? WORLD_W
      : 70 - 20 * d + rng.range(-4, 4);

  const moving =
    kind === "moving";

  return {
    id: gen.nextId++,
    kind,
    baseX: wrapX(baseX),
    y,
    w,
    range: moving
      ? rng.range(30, 60 + 90 * d)
      : 0,
    speed: moving
      ? rng.range(0.004, 0.007) * (1 + 1.3 * d)
      : 0,
    phase: moving
      ? rng.next()
      : 0,
    hp:
      kind === "crumble"
        ? 1
        : kind === "ground"
          ? 4
          : -1,
    broken: false,
    brokenAt: -1,
    glyph: rng.int(0, 7),
  };
}

function generateRow(
  sim: ClimberSim
) {
  const gen =
    sim.gen;

  const rng =
    gen.rng;

  const h =
    gen.lastY;

  const d =
    difficultyAt(h);

  const gap =
    Math.min(
      MAX_GAP,
      52 + 150 * d + rng.range(0, 30 + 45 * d)
    );

  const y =
    h + gap;

  const x =
    wrapX(
      gen.lastX + rng.range(-1, 1) * (70 + 110 * d)
    );

  let kind: PlatformKind =
    "normal";

  if (
    h > 600 &&
    rng.chance(0.08 + 0.32 * d)
  ) {
    kind = "moving";
  } else if (
    h > 1200 &&
    rng.chance(0.05 + 0.28 * d)
  ) {
    kind = "crumble";
  }

  const main =
    newPlatform(
      gen,
      kind,
      x,
      y,
      d
    );

  sim.platforms.push(main);

  // Extra platforms: plenty low down, scarce higher up. Higher
  // up, more of them are crumbling Trap cards (decoys).
  if (rng.chance(0.75 - 0.6 * d)) {
    const extraKind: PlatformKind =
      h > 900 && rng.chance(0.15 + 0.45 * d)
        ? "crumble"
        : "normal";

    sim.platforms.push(
      newPlatform(
        gen,
        extraKind,
        x + rng.range(110, WORLD_W - 110),
        h + rng.range(0.25, 0.85) * gap,
        d
      )
    );
  }

  // Spell card power-ups sit just above a path platform.
  if (
    h > 700 &&
    kind !== "crumble" &&
    rng.chance(0.07)
  ) {
    const roll =
      rng.next();

    const itemKind: ItemKind =
      roll < 0.18
        ? "reborn"
        : roll < 0.5
          ? "swords"
          : "pot";

    sim.items.push({
      id: gen.nextId++,
      kind: itemKind,
      x: main.baseX,
      y: y + 40,
      taken: false,
    });
  }

  // Trap card obstacles float off the path.
  if (
    h > 1800 &&
    rng.chance(0.06 + 0.32 * d)
  ) {
    sim.traps.push({
      id: gen.nextId++,
      x: wrapX(x + WORLD_W / 2 + rng.range(-70, 70)),
      y: h + gap * rng.range(0.3, 0.7),
      hit: false,
    });
  }

  gen.lastY = y;
  gen.lastX = x;
}

function ensureGenerated(
  sim: ClimberSim
) {
  const limit =
    sim.camBottom + GENERATE_AHEAD;

  while (sim.gen.lastY < limit) {
    generateRow(sim);
  }
}

function prune(
  sim: ClimberSim
) {
  const floor =
    sim.camBottom - PRUNE_BELOW;

  sim.platforms =
    sim.platforms.filter(
      (p) => p.y >= floor
    );

  sim.items =
    sim.items.filter(
      (item) => item.y >= floor && !item.taken
    );

  sim.traps =
    sim.traps.filter(
      (trap) => trap.y >= floor
    );
}

// ---------------------------------------------------------
// Public API
// ---------------------------------------------------------

export function createClimber(
  seed: string
): ClimberSim {
  const gen: Generator = {
    rng: createPrng(`pyramid-climb/v${ENGINE_VERSION}/${seed}`),
    nextId: 1,
    lastY: 0,
    lastX: WORLD_W / 2,
  };

  const sim: ClimberSim = {
    seed,
    tick: 0,
    worldTime: 0,
    x: WORLD_W / 2,
    y: 0,
    vx: 0,
    vy: JUMP_V,
    prevX: WORLD_W / 2,
    prevY: 0,
    camBottom: -80,
    prevCamBottom: -80,
    maxY: 0,
    lives: 0,
    slowTicks: 0,
    shieldTicks: 0,
    stunTicks: 0,
    invulnTicks: 0,
    lastBounceTick: 0,
    dead: false,
    timedOut: false,
    platforms: [],
    items: [],
    traps: [],
    events: [],
    gen,
  };

  sim.platforms.push(
    newPlatform(
      gen,
      "ground",
      WORLD_W / 2,
      0,
      0
    )
  );

  ensureGenerated(sim);

  return sim;
}

function normaliseSteer(
  steer: number
) {
  if (!Number.isFinite(steer)) {
    return 0;
  }

  return clamp(
    Math.trunc(steer),
    -STEER_MAX,
    STEER_MAX
  );
}

/**
 * Advance the simulation by exactly one tick with the given
 * steering input (integer -STEER_MAX..STEER_MAX; negative = left).
 */
export function stepClimber(
  sim: ClimberSim,
  rawSteer: number
) {
  sim.events = [];

  if (sim.dead) {
    return;
  }

  const steer =
    normaliseSteer(rawSteer);

  sim.prevX = sim.x;
  sim.prevY = sim.y;
  sim.prevCamBottom = sim.camBottom;

  const scale =
    sim.slowTicks > 0
      ? SLOW_SCALE
      : 1;

  sim.worldTime += scale;

  // Horizontal: ease toward the steering target, wrap around.
  const targetVx =
    sim.stunTicks > 0
      ? 0
      : (steer / STEER_MAX) * MAX_VX;

  sim.vx += (targetVx - sim.vx) * STEER_ACCEL * scale;
  sim.x = wrapX(sim.x + sim.vx * scale);

  // Vertical.
  const prevFeet =
    sim.y;

  sim.vy -= GRAVITY * scale;
  sim.y += sim.vy * scale;

  // Landing: only while falling, only when not stunned, and only
  // on a platform whose top the feet crossed this tick. The
  // highest crossed platform wins.
  if (
    sim.vy < 0 &&
    sim.stunTicks === 0
  ) {
    let best: Platform | null =
      null;

    for (const p of sim.platforms) {
      if (
        p.broken ||
        prevFeet < p.y ||
        sim.y > p.y
      ) {
        continue;
      }

      const px =
        platformX(
          p,
          sim.worldTime
        );

      if (wrapDist(sim.x, px) > p.w / 2 + FOOT_HALF_W) {
        continue;
      }

      if (
        best === null ||
        p.y > best.y
      ) {
        best = p;
      }
    }

    if (best) {
      sim.y = best.y;
      sim.vy = JUMP_V;
      sim.lastBounceTick = sim.tick;

      sim.events.push({
        type: "bounce",
        x: sim.x,
        y: best.y,
        kind: best.kind,
      });

      if (best.hp > 0) {
        best.hp -= 1;

        if (best.hp === 0) {
          best.broken = true;
          best.brokenAt = sim.tick;

          sim.events.push({
            type: "crumble",
            x: platformX(best, sim.worldTime),
            y: best.y,
            kind: best.kind,
          });
        }
      }
    }
  }

  const bodyY =
    sim.y + PLAYER_H / 2;

  // Spell card pick-ups.
  for (const item of sim.items) {
    if (item.taken) {
      continue;
    }

    const dx =
      wrapDist(
        sim.x,
        item.x
      );

    const dy =
      bodyY - item.y;

    const reach =
      ITEM_RADIUS + PLAYER_HALF_W;

    if (dx * dx + dy * dy > reach * reach) {
      continue;
    }

    item.taken = true;

    if (item.kind === "reborn") {
      sim.lives = Math.min(
        MAX_LIVES,
        sim.lives + 1
      );
    } else if (item.kind === "swords") {
      sim.slowTicks = SLOW_TICKS;
      sim.shieldTicks = SLOW_TICKS;
    } else {
      sim.vy = Math.max(
        sim.vy,
        BOOST_V
      );
      sim.shieldTicks = Math.max(
        sim.shieldTicks,
        BOOST_SHIELD_TICKS
      );
      sim.stunTicks = 0;
    }

    sim.events.push({
      type: "pickup",
      x: item.x,
      y: item.y,
      kind: item.kind,
    });
  }

  // Trap card obstacles: touching one knocks you down.
  if (
    sim.shieldTicks === 0 &&
    sim.invulnTicks === 0
  ) {
    for (const trap of sim.traps) {
      if (trap.hit) {
        continue;
      }

      if (
        wrapDist(sim.x, trap.x) < TRAP_HALF_W + PLAYER_HALF_W - 4 &&
        Math.abs(bodyY - trap.y) < TRAP_HALF_H + PLAYER_H / 2 - 4
      ) {
        trap.hit = true;
        sim.stunTicks = STUN_TICKS;
        sim.vy = Math.min(
          sim.vy,
          -4
        );
        sim.vx = 0;

        sim.events.push({
          type: "trap",
          x: trap.x,
          y: trap.y,
        });

        break;
      }
    }
  }

  // Timers (real ticks, not scaled by slow motion).
  if (sim.slowTicks > 0) sim.slowTicks -= 1;
  if (sim.shieldTicks > 0) sim.shieldTicks -= 1;
  if (sim.stunTicks > 0) sim.stunTicks -= 1;
  if (sim.invulnTicks > 0) sim.invulnTicks -= 1;

  // Camera only ever moves up.
  if (sim.y > sim.maxY) {
    sim.maxY = sim.y;
  }

  sim.camBottom = Math.max(
    sim.camBottom,
    sim.y - CAMERA_OFFSET
  );

  // Fell out of the pyramid.
  if (sim.y < sim.camBottom - DEATH_DEPTH) {
    if (sim.lives > 0) {
      sim.lives -= 1;
      sim.y = sim.camBottom + 20;
      sim.prevY = sim.y;
      sim.vy = REVIVE_V;
      sim.vx = 0;
      sim.stunTicks = 0;
      sim.invulnTicks = REVIVE_INVULN_TICKS;

      sim.events.push({
        type: "revive",
        x: sim.x,
        y: sim.y,
      });
    } else {
      sim.dead = true;

      sim.events.push({
        type: "death",
        x: sim.x,
        y: sim.y,
      });
    }
  }

  sim.tick += 1;

  if (
    !sim.dead &&
    sim.tick >= MAX_TICKS
  ) {
    sim.dead = true;
    sim.timedOut = true;
  }

  ensureGenerated(sim);

  if (sim.tick % 60 === 0) {
    prune(sim);
  }
}

// ---------------------------------------------------------
// Input recording + replay (anti-cheat)
// ---------------------------------------------------------

export type RunEnd =
  | "death"
  | "quit";

/**
 * A recorded run. `e` is a flat, delta-encoded list of steering
 * changes: [ticksSincePrevChange, steer, ticksSincePrevChange,
 * steer, ...]. Steering is 0 until the first change.
 */
export type RunInputs = {
  v: typeof ENGINE_VERSION;
  e: number[];
  end: RunEnd;
  ticks: number;
};

export class InputRecorder {
  private events: number[] = [];

  private lastTick = 0;

  private lastSteer = 0;

  /** Call once per tick, BEFORE stepClimber, with the same steer. */
  record(
    tick: number,
    steer: number
  ) {
    if (steer === this.lastSteer) {
      return;
    }

    this.events.push(
      tick - this.lastTick,
      steer
    );

    this.lastTick = tick;
    this.lastSteer = steer;
  }

  finish(
    end: RunEnd,
    ticks: number
  ): RunInputs {
    return {
      v: ENGINE_VERSION,
      e: [...this.events],
      end,
      ticks,
    };
  }

  /** Raw events so far (for saving an in-progress run). */
  snapshot() {
    return {
      e: [...this.events],
      lastTick: this.lastTick,
      lastSteer: this.lastSteer,
    };
  }

  static restore(snapshot: {
    e: number[];
    lastTick: number;
    lastSteer: number;
  }) {
    const recorder =
      new InputRecorder();

    recorder.events = [...snapshot.e];
    recorder.lastTick = snapshot.lastTick;
    recorder.lastSteer = snapshot.lastSteer;

    return recorder;
  }
}

/** Max events: one change per tick at most. */
const MAX_EVENT_NUMBERS =
  MAX_TICKS * 2;

export type DecodedInputs = {
  ticks: number[];
  steers: number[];
};

/** Validates shape and decodes to absolute ticks; null = malformed. */
export function decodeInputs(
  events: unknown,
  totalTicks: number
): DecodedInputs | null {
  if (
    !Array.isArray(events) ||
    events.length % 2 !== 0 ||
    events.length > MAX_EVENT_NUMBERS
  ) {
    return null;
  }

  const ticks: number[] = [];

  const steers: number[] = [];

  let tick = 0;

  for (let i = 0; i < events.length; i += 2) {
    const dt =
      events[i];

    const steer =
      events[i + 1];

    if (
      !Number.isInteger(dt) ||
      !Number.isInteger(steer) ||
      dt < (i === 0 ? 0 : 1) ||
      steer < -STEER_MAX ||
      steer > STEER_MAX
    ) {
      return null;
    }

    tick += dt;

    if (tick >= totalTicks) {
      return null;
    }

    ticks.push(tick);
    steers.push(steer);
  }

  return {
    ticks,
    steers,
  };
}

/**
 * Re-simulate a level from seed + inputs. Steps exactly up to
 * `uptoTick` (or until the player is out, whichever is first).
 */
export function simulateInputs(
  seed: string,
  decoded: DecodedInputs,
  uptoTick: number
) {
  const sim =
    createClimber(seed);

  let cursor = 0;

  let steer = 0;

  while (
    !sim.dead &&
    sim.tick < uptoTick
  ) {
    while (
      cursor < decoded.ticks.length &&
      decoded.ticks[cursor] <= sim.tick
    ) {
      steer = decoded.steers[cursor];
      cursor += 1;
    }

    stepClimber(
      sim,
      steer
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
      /** The score the replay produced, when it got that far. */
      replayScore?: number;
    };

/**
 * Server-side validation: replays the run and checks that the
 * client's claims (score, length, how it ended) match exactly.
 */
export function validateRun(
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
    inputs as Partial<RunInputs>;

  if (run.v !== ENGINE_VERSION) {
    return {
      ok: false,
      reason: "Game version changed. Reload the page.",
    };
  }

  if (
    run.end !== "death" &&
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

  const decoded =
    decodeInputs(
      run.e,
      ticks
    );

  if (!decoded) {
    return {
      ok: false,
      reason: "Malformed inputs.",
    };
  }

  const sim =
    simulateInputs(
      seed,
      decoded,
      ticks
    );

  const replayScore =
    climberScore(sim);

  if (run.end === "death") {
    if (
      !sim.dead ||
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
