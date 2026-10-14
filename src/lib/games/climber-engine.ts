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
//   2. Only + - * / Math.floor / Math.abs / Math.min / Math.max
//      and Math.sqrt. These are exactly specified by IEEE-754
//      (sqrt is correctly rounded) and identical in V8 (Node,
//      Chrome) and JavaScriptCore (iOS Safari).
//      NO Math.sin / cos / pow / exp / random here: moving
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

export const ENGINE_VERSION = 3;

export const TICKS_PER_SECOND = 60;

export const WORLD_W = 400;

/** Steering resolution: integer -STEER_MAX..STEER_MAX. v3 doubled it
 *  (4 -> 8) so tilt can be proportional and touch can ramp in. */
export const STEER_MAX = 8;

/** Hard cap on run length (30 minutes): bounds server replay cost. */
export const MAX_TICKS =
  30 * 60 * TICKS_PER_SECOND;

// Jump tuning (v2, 2026-10-14). Designed from the jump itself, not
// from a gravity constant: pick the bounce HEIGHT and the TIME to
// reach the top, then derive gravity and launch speed
// (g = 2h / t^2, v = 2h / t - Kyle Pittman, "Building a Better
// Jump", GDC 2016). v1 bounced 286 units in 0.62 s with a fast,
// twitchy sideways speed and felt hectic on a phone.
//
// One bounce = ~1/4 of the visible screen, top reached in 0.6 s,
// like Doodle Jump: calm enough to read the next platform, quick
// enough to keep a rhythm.

/** Normal bounce height (world units). */
export const JUMP_HEIGHT = 220;

/** Ticks from a bounce to the top of the arc (36 = 0.6 s). */
const JUMP_APEX_TICKS = 44;

const GRAVITY =
  (2 * JUMP_HEIGHT) / (JUMP_APEX_TICKS * JUMP_APEX_TICKS);

export const JUMP_V =
  (2 * JUMP_HEIGHT) / JUMP_APEX_TICKS;

/** Launch speed that reaches `height` under GRAVITY. */
function launchSpeedFor(
  height: number
) {
  return Math.sqrt(2 * GRAVITY * height);
}

/** "Pot of Greed" boost: three normal bounces high. */
const BOOST_V = launchSpeedFor(JUMP_HEIGHT * 3);

/** Monster Reborn revive launch: two bounces high. */
const REVIVE_V = launchSpeedFor(JUMP_HEIGHT * 2);

/** Top sideways speed: crossing the whole tower takes ~1.4 s. */
const MAX_VX = 3.9;

/** How quickly sideways speed follows the input (per tick): full
 *  speed in ~0.3 s, so a short tap nudges and a hold travels. */
const STEER_ACCEL = 0.14;

/** The ball: ~6.5% of the tower width (v1 was 9%). */
export const PLAYER_HALF_W = 13;

export const PLAYER_H = 26;

/** Half-width of the player's "feet" for landing checks: a little
 *  wider than the ball looks (13), so a ball that visibly grazes the
 *  card edge still lands. v2 used 11, narrower than the ball, which
 *  made edge landings feel like the game cheated. */
const FOOT_HALF_W = 15;

/** Camera bottom trails the player's height by this much. */
export const CAMERA_OFFSET = 330;

/** Falling this far below the camera bottom = out. */
export const DEATH_DEPTH = 60;

/** No new height for this long (6 s) and the floor starts rising:
 *  a player stuck under a broken Trap card (no way up left) falls out
 *  instead of bouncing forever. Waiting out a moving card takes at
 *  most ~5 s, so fair waiting is never punished. */
export const STALL_TICKS = 360;

/** How fast the floor rises while stalled (units per tick). */
const STALL_CREEP = 0.8;

// Rising sand (v3). Like Icy Tower's speeding-up scroll: after
// 30 s the floor starts to rise on its own, as a growing fraction of
// how fast the level at your height can be climbed (100% at 5.5 min,
// then more). Careful play is never rushed early on, but no run lasts
// forever, and the Daily board can't be won by stalling.
const TIDE_START_TICKS = 30 * TICKS_PER_SECOND;

const TIDE_FULL_TICKS = 5 * 60 * TICKS_PER_SECOND;

const TIDE_MAX_FRACTION = 1.25;

const GENERATE_AHEAD = 1400;

const PRUNE_BELOW = 220;

/** Height (world units) at which difficulty reaches 1 (2,500 m). */
const DIFFICULTY_HEIGHT = 25000;

/** Largest gap between consecutive path platforms: 78% of a
 *  bounce, so the next path platform is always reachable. */
const MAX_GAP = Math.round(JUMP_HEIGHT * 0.78);

const SLOW_TICKS = 240;

const SLOW_SCALE = 0.6;

/** A Trap card stuns for 0.33 s: you drop ~150 units and can land
 *  again, so a hit costs height, not (usually) the run. v2 stunned
 *  for 45 ticks (~530 units), deeper than the 390-unit death line:
 *  a hit without a spare life was fatal 99% of the time. */
const STUN_TICKS = 20;

/** Stun + the fall onto the safety card under the trap + most of the
 *  bounce back up (1 s). */
const TRAP_RECOVER_TICKS = 60;

const TRAP_SAND_PAUSE_TICKS = 90;

const REVIVE_INVULN_TICKS = 150;

const BOOST_SHIELD_TICKS = 70;

const MAX_LIVES = 3;

export const ITEM_RADIUS = 16;

export const TRAP_HALF_W = 15;

export const TRAP_HALF_H = 21;

/** No trap may hang lower than this above a platform it overlaps:
 *  a bounce from that platform would hit it before you can react
 *  (0.2 s of rising is ~120 units). */
const TRAP_CLEAR_ABOVE = 160;

/** Moving cards never slide faster than this (units per tick), so
 *  the ball (MAX_VX) can always catch up with one. */
const MAX_PLATFORM_SPEED = 2.4;

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
  /** After a Trap hit: the floor can't take you (and the sand pauses)
   *  while you drop onto the safety card and bounce back. */
  recoverTicks: number;
  /** After a Trap hit the sand also waits a little longer (2.5 s),
   *  so you can get from the safety card back to the path. */
  sandPauseTicks: number;
  lastBounceTick: number;
  /** Last tick the player reached a new height (stall rule). */
  lastClimbTick: number;

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

/** Past 2,500 m it keeps creeping up (to 1.35 at 6,000 m): fewer
 *  spare cards, narrower and faster ones, so a long run never
 *  settles into a plateau. */
const OVERDRIVE_MAX = 0.35;

const OVERDRIVE_HEIGHT = 35000;

export function difficultyAt(
  height: number
) {
  if (height <= DIFFICULTY_HEIGHT) {
    return clamp(
      height / DIFFICULTY_HEIGHT,
      0,
      1
    );
  }

  return 1 + Math.min(
    OVERDRIVE_MAX,
    ((height - DIFFICULTY_HEIGHT) / OVERDRIVE_HEIGHT) * OVERDRIVE_MAX
  );
}

/** Average path gap the generator uses at this height. */
function typicalGap(
  height: number
) {
  const d =
    difficultyAt(height);

  return Math.min(
    MAX_GAP,
    40 + 100 * d + (22 + 40 * d) / 2
  );
}

/** Units per tick a player gains by taking every typical path gap. */
export function climbRateAt(
  height: number
) {
  const gap =
    typicalGap(height);

  const airTicks =
    (JUMP_V + Math.sqrt(JUMP_V * JUMP_V - 2 * GRAVITY * gap)) / GRAVITY;

  return gap / airTicks;
}

/** How fast the sand floor rises this tick (0 before it starts). */
export function tideSpeed(
  sim: ClimberSim
) {
  const fraction =
    Math.min(
      TIDE_MAX_FRACTION,
      Math.max(0, sim.tick - TIDE_START_TICKS) / TIDE_FULL_TICKS
    );

  if (fraction <= 0) {
    return 0;
  }

  return fraction * climbRateAt(sim.maxY);
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
      : 76 - 18 * d + rng.range(-4, 4);

  const moving =
    kind === "moving";

  const range =
    moving
      ? rng.range(30, 60 + 90 * d)
      : 0;

  // A triangle wave covers 4 * range per cycle.
  const speed =
    moving
      ? Math.min(
          rng.range(0.0035, 0.006) * (1 + d),
          MAX_PLATFORM_SPEED / (4 * range)
        )
      : 0;

  return {
    id: gen.nextId++,
    kind,
    baseX: wrapX(baseX),
    y,
    w,
    range,
    speed,
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

/** How far sideways (world units) a bounce can carry the ball before
 *  it comes back down to `rise` units above where it bounced, with a
 *  20% safety margin and the time it takes to reach full speed. */
export function maxReachX(
  rise: number
) {
  const under =
    JUMP_V * JUMP_V - 2 * GRAVITY * rise;

  if (under <= 0) {
    return 0;
  }

  const airTicks =
    (JUMP_V + Math.sqrt(under)) / GRAVITY;

  const spinUpTicks =
    1 / STEER_ACCEL;

  return Math.max(
    0,
    MAX_VX * (airTicks - spinUpTicks) * 0.8
  );
}

/** Where the safety card under a trap goes: just below the zone that
 *  must stay clear (so bouncing off it never hits the trap blind). */
function catchY(
  trapY: number
) {
  return trapY - TRAP_HALF_H - TRAP_CLEAR_ABOVE - 6;
}

/** Safety ledge size and its shift from under the trap toward the
 *  path (it still covers every spot a hit can drop you from). */
const CATCH_W = 104;

const CATCH_SHIFT = 28;

/** Sideways spread of where a hit can leave the ball (it then drops
 *  straight down: the stun zeroes sideways speed). */
const TRAP_HIT_SPREAD = TRAP_HALF_W + PLAYER_HALF_W - 4;

/** True when a static card below the trap already catches any hit. */
function hasCatch(
  sim: ClimberSim,
  x: number,
  y: number
) {
  const top =
    catchY(y);

  for (const p of sim.platforms) {
    if (
      p.broken ||
      p.kind === "moving" ||
      p.kind === "ground" ||
      p.kind === "crumble" ||
      p.y > top ||
      p.y < top - 90
    ) {
      continue;
    }

    if (wrapDist(x, p.baseX) + TRAP_HIT_SPREAD <= p.w / 2 + FOOT_HALF_W - 2) {
      return true;
    }
  }

  return false;
}

/** True when a safety card fits under the trap: it must not overlap
 *  another card, nor sit right under another trap. */
function catchFits(
  sim: ClimberSim,
  x: number,
  y: number
) {
  const top =
    catchY(y);

  for (const p of sim.platforms) {
    if (
      Math.abs(p.y - top) < 22 &&
      wrapDist(x, p.baseX) < p.w / 2 + p.range + CATCH_W / 2 + 10
    ) {
      return false;
    }
  }

  for (const trap of sim.traps) {
    const above =
      trap.y - TRAP_HALF_H - top;

    if (
      above >= -2 * TRAP_HALF_H &&
      above <= TRAP_CLEAR_ABOVE &&
      wrapDist(x, trap.x) < CATCH_W / 2 + TRAP_HALF_W + PLAYER_HALF_W + 12
    ) {
      return false;
    }
  }

  return true;
}

/** True when no platform sits just below this trap spot. */
function trapIsFair(
  sim: ClimberSim,
  x: number,
  y: number
) {
  const bottom =
    y - TRAP_HALF_H;

  for (const p of sim.platforms) {
    const above =
      bottom - p.y;

    if (
      above < -2 * TRAP_HALF_H ||
      above > TRAP_CLEAR_ABOVE
    ) {
      continue;
    }

    const reach =
      p.w / 2 + p.range + TRAP_HALF_W + PLAYER_HALF_W + 12;

    if (wrapDist(x, p.baseX) < reach) {
      return false;
    }
  }

  return true;
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
      40 + 100 * d + rng.range(0, 22 + 40 * d)
    );

  const y =
    h + gap;

  // Never place the next path platform further sideways than the
  // ball can travel during a bounce that lands on it (with margin):
  // every level stays climbable, the skill is in getting there.
  const offset =
    clamp(
      rng.range(-1, 1) * (60 + 95 * d),
      -maxReachX(gap),
      maxReachX(gap)
    );

  const x =
    wrapX(
      gen.lastX + offset
    );

  let kind: PlatformKind =
    "normal";

  if (
    h > 1000 &&
    rng.chance(0.08 + 0.32 * d)
  ) {
    kind = "moving";
  } else if (
    h > 1500 &&
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

  // Trap card obstacles float off the path, never right above a
  // card you could be bouncing on (that hit could not be dodged).
  if (
    h > 2500 &&
    rng.chance(0.06 + 0.32 * d)
  ) {
    const trapY =
      h + gap * rng.range(0.3, 0.7);

    const firstX =
      x + WORLD_W / 2 + rng.range(-70, 70);

    // Up to four spots, a quarter turn apart; skip if none is fair.
    for (let attempt = 0; attempt < 4; attempt++) {
      const trapX =
        wrapX(firstX + attempt * (WORLD_W / 4));

      if (!trapIsFair(sim, trapX, trapY)) {
        continue;
      }

      const catchNeeded =
        !hasCatch(sim, trapX, trapY);

      // The safety card is a wide ledge reaching toward the path, so
      // getting back after a hit is one normal jump.
      let toPath =
        wrapX(x - trapX);

      if (toPath > WORLD_W / 2) toPath -= WORLD_W;

      const catchX =
        wrapX(trapX + (toPath < 0 ? -CATCH_SHIFT : CATCH_SHIFT));

      if (
        catchNeeded &&
        !catchFits(sim, catchX, trapY)
      ) {
        continue;
      }

      sim.traps.push({
        id: gen.nextId++,
        x: trapX,
        y: trapY,
        hit: false,
      });

      // A hit knocks you straight down: there is always a solid card
      // to land on just below the stun drop, at every height.
      if (catchNeeded) {
        const ledge =
          newPlatform(
            gen,
            "normal",
            catchX,
            catchY(trapY),
            d
          );

        ledge.w = CATCH_W;
        sim.platforms.push(ledge);
      }

      break;
    }
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
    recoverTicks: 0,
    sandPauseTicks: 0,
    lastBounceTick: 0,
    lastClimbTick: 0,
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

  // Landing: only while falling, and only on a platform whose top
  // the feet crossed this tick. The highest crossed platform wins.
  // A stunned ball still lands (v3): a stun only takes away the
  // steering, so a Trap hit from above can't carry you straight
  // through the safety card below it.
  if (sim.vy < 0) {
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
      sim.stunTicks = 0;

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
        sim.recoverTicks = TRAP_RECOVER_TICKS;
        sim.sandPauseTicks = TRAP_SAND_PAUSE_TICKS;
        sim.vy = Math.min(
          sim.vy,
          -2
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
  if (sim.recoverTicks > 0) sim.recoverTicks -= 1;
  if (sim.sandPauseTicks > 0) sim.sandPauseTicks -= 1;

  // Camera only ever moves up.
  if (sim.y > sim.maxY) {
    sim.maxY = sim.y;
    sim.lastClimbTick = sim.tick;
  }

  sim.camBottom = Math.max(
    sim.camBottom,
    sim.y - CAMERA_OFFSET
  );

  const tide =
    sim.sandPauseTicks > 0
      ? 0
      : tideSpeed(sim);

  if (tide > 0) {
    sim.camBottom = Math.max(
      sim.camBottom,
      sim.prevCamBottom + tide
    );
  }

  if (
    sim.tick - sim.lastClimbTick > STALL_TICKS &&
    sim.recoverTicks === 0
  ) {
    sim.camBottom += STALL_CREEP;
  }

  // Fell out of the pyramid (not while recovering from a Trap hit:
  // the drop to the safety card may dip below the line for a moment).
  if (
    sim.recoverTicks === 0 &&
    sim.y < sim.camBottom - DEATH_DEPTH
  ) {
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
