import {
  createPrng,
  type Prng,
} from "./prng";

// =========================================================
// MILLENNIUM STRIKE - shared, pure simulation (no DOM).
//
// A Knife Hit-style game: a golden Millennium wheel turns in the
// upper half of the screen; one tap throws a Duel Monster card
// straight up from the bottom. A card that reaches the wheel
// sticks in it and turns with it. A card that hits a card that
// is already stuck bounces off and the run is over. Stick the
// stage's number of cards to shatter the wheel; the next one
// turns trickier. Every 5th stage is a BOSS wheel themed on a
// Millennium Item with its own rotation pattern. Eye orbs on the
// rim give bonus points when a card lands on them.
//
// Score = stages cleared x STAGE_POINTS + cards stuck
//         + orbs x ORB_POINTS + bosses beaten x BOSS_BONUS.
//
// The exact same code runs in the browser (live play) and in the
// server action (replay to validate a submitted run), so it follows
// the same rules as stack-engine.ts / climber-engine.ts:
//
//   1. Fixed timestep: one step = one tick = 1/60 s.
//   2. Only + - * / Math.abs / Math.min / Math.max / Math.floor
//      (IEEE-754 exact, identical in V8 and JavaScriptCore). No
//      Math.sin: the rotation patterns are piecewise polynomials.
//   3. Randomness only from the seeded PRNG, drawn in a fixed order
//      when a stage is built (pattern, pre-stuck cards, orbs), so
//      the draws never depend on WHEN the player taps.
//
// Angles are in degrees. The wheel's angle grows clockwise on the
// screen (y points down). A card stuck at local angle `a` sits at
// world angle a + wheel angle; thrown cards always hit the wheel at
// world angle IMPACT_ANGLE (straight below the hub).
// =========================================================

/** Database game key (mini_game_catalog / game_runs.game). */
export const STRIKE_GAME = "millennium_strike";

export const ENGINE_VERSION = 1;

export const TICKS_PER_SECOND = 60;

/** 30 minutes: the same cap submit_game_run() enforces. */
export const MAX_TICKS =
  30 * 60 * TICKS_PER_SECOND;

/** World angle where a thrown card meets the rim (straight down). */
export const IMPACT_ANGLE = 90;

/** Ticks a card flies from the hand to the rim. */
export const FLIGHT_TICKS = 6;

/** Ticks after a landing before the next card can be thrown. */
export const RELOAD_TICKS = 2;

/** Fastest possible throw rhythm (one throw per this many ticks). */
export const THROW_INTERVAL =
  FLIGHT_TICKS + RELOAD_TICKS;

/** Two cards closer than this (degrees, on the rim) clash. */
export const CARD_GAP = 10;

/** A card landing within this many degrees of an orb takes it. */
export const ORB_HIT = 9;

export const ORB_POINTS = 3;

export const STAGE_POINTS = 10;

export const BOSS_BONUS = 10;

/** Ticks between shattering a wheel and the next one appearing. */
export const BREAK_TICKS = 50;

export const BOSS_BREAK_TICKS = 72;

export const BOSS_EVERY = 5;

/** Bounds the score-per-tick proof (see the catalog migration). */
export const MIN_CARDS = 6;

export const MAX_CARDS = 11;

export const MAX_ORBS = 3;

export const MAX_PRE_STUCK = 4;

/**
 * max_score_per_tick / max_score_flat in mini_game_catalog
 * (supabase/migrations/202610142020_millennium_strike.sql).
 */
export const SCORE_PER_TICK_BOUND = 0.4;

export const SCORE_FLAT_BOUND = 40;

const SPEED_MAX = 4.2;

/**
 * A "flip" cycle turns back at this fraction of the forward speed.
 * Never 1: an exactly symmetric back-and-forth would keep the wheel
 * inside one arc forever, so the far side could never be reached.
 */
export const FLIP_BACK = 0.5;

const BOSS_SPEED_MAX = 6.5;

export type PatternKind =
  | "steady"
  | "wave"
  | "pulse"
  | "burst"
  | "swing";

export type Pattern = {
  kind: PatternKind;
  /** Peak speed in degrees per tick. */
  speed: number;
  dir: 1 | -1;
  /** Ticks per cycle. */
  period: number;
  /** wave / burst: slowest speed as a fraction of `speed` (may be < 0). */
  low: number;
  /** pulse: ticks to ramp in / out at each end of a cycle. */
  ramp: number;
  /** burst: ticks of the slow "hold" at the start of each cycle. */
  hold: number;
  /** Every other cycle turns the other way (at FLIP_BACK speed). */
  flip: boolean;
  /** swing: constant drift added to the pendulum (fraction of speed). */
  bias: number;
};

export type BossItem =
  | "puzzle"
  | "eye"
  | "rod"
  | "ring"
  | "scale"
  | "key"
  | "necklace";

type BossDef = {
  item: BossItem;
  name: string;
  pattern: Omit<Pattern, "dir">;
};

/** Boss order: stage 5 = Puzzle, 10 = Eye, ... then it loops faster. */
export const BOSSES: BossDef[] = [
  {
    // Snaps back and forth: hard reversals.
    item: "puzzle",
    name: "Millennium Puzzle",
    pattern: {
      kind: "pulse",
      speed: 3.0,
      period: 78,
      low: 0,
      ramp: 12,
      hold: 0,
      flip: true,
      bias: 0,
    },
  },
  {
    // Stares (almost still), then darts, each time the other way.
    item: "eye",
    name: "Millennium Eye",
    pattern: {
      kind: "burst",
      speed: 4.6,
      period: 68,
      low: 0.08,
      ramp: 0,
      hold: 36,
      flip: true,
      bias: 0,
    },
  },
  {
    // A pendulum with a slow drift.
    item: "rod",
    name: "Millennium Rod",
    pattern: {
      kind: "swing",
      speed: 4.0,
      period: 112,
      low: 0,
      ramp: 0,
      hold: 0,
      flip: false,
      bias: 0.18,
    },
  },
  {
    // Speeds up and slows down, and turns around every cycle.
    item: "ring",
    name: "Millennium Ring",
    pattern: {
      kind: "wave",
      speed: 3.6,
      period: 104,
      low: 0.12,
      ramp: 0,
      hold: 0,
      flip: true,
      bias: 0,
    },
  },
  {
    // Tips back and forth quickly, like a balance settling.
    item: "scale",
    name: "Millennium Scale",
    pattern: {
      kind: "swing",
      speed: 3.2,
      period: 64,
      low: 0,
      ramp: 0,
      hold: 0,
      flip: false,
      bias: -0.3,
    },
  },
  {
    // Turns like a key: dead stop, then a fast quarter turn.
    item: "key",
    name: "Millennium Key",
    pattern: {
      kind: "burst",
      speed: 5.4,
      period: 62,
      low: 0,
      ramp: 0,
      hold: 30,
      flip: false,
      bias: 0,
    },
  },
  {
    // Sees what you will do: dips backwards in every cycle.
    item: "necklace",
    name: "Millennium Necklace",
    pattern: {
      kind: "wave",
      speed: 4.0,
      period: 96,
      low: -0.45,
      ramp: 0,
      hold: 0,
      flip: false,
      bias: 0,
    },
  },
];

export type StuckCard = {
  /** Local angle on the wheel (0..360). */
  a: number;
  /** Already there when the stage started (a "shadow" card). */
  pre: boolean;
};

export type Orb = {
  a: number;
  taken: boolean;
};

export type Stage = {
  /** 1-based. */
  index: number;
  boss: BossItem | null;
  bossName: string | null;
  need: number;
  pattern: Pattern;
  /** Pre-stuck cards (copied into sim.stuck when the stage starts). */
  preStuck: number[];
  orbs: Orb[];
};

export type StrikeEvent =
  | {
      type: "throw";
    }
  | {
      type: "hit";
      /** Local angle the card stuck at. */
      a: number;
      /** Index into stage.orbs when an orb was taken. */
      orb: number | null;
      /** Cards still needed this stage. */
      left: number;
    }
  | {
      type: "clash";
      /** Local angle the card bounced at. */
      a: number;
      /** Local angle of the card it hit. */
      hit: number;
    }
  | {
      type: "break";
      stage: number;
      boss: BossItem | null;
    }
  | {
      type: "stage";
      stage: number;
      boss: BossItem | null;
    };

export type StrikeSim = {
  seed: string;
  rng: Prng;
  tick: number;
  dead: boolean;
  timedOut: boolean;
  stage: Stage;
  /** Ticks since the current wheel appeared (drives its pattern). */
  stageTick: number;
  /** Wheel angle (0..360) and the one before the last tick. */
  angle: number;
  prevAngle: number;
  /** Degrees turned in the last tick. */
  vel: number;
  /** Cards in the current wheel (pre-stuck + yours). */
  stuck: StuckCard[];
  /** Your cards stuck in the current wheel. */
  stageStuck: number;
  /** Ticks the card in the air has flown; null = none in the air. */
  flight: number | null;
  cooldown: number;
  /** > 0 while the shattered wheel is being replaced. */
  breakLeft: number;
  thrown: number;
  cardsStuck: number;
  orbsHit: number;
  stagesCleared: number;
  bossesBeaten: number;
  /** Events of the LAST step only. */
  events: StrikeEvent[];
};

// ---------------------------------------------------------
// Angle helpers (exact float ops only)
// ---------------------------------------------------------

export function mod360(
  value: number
) {
  return value - Math.floor(value / 360) * 360;
}

/** Shortest distance between two angles, 0..180. */
export function angleDistance(
  a: number,
  b: number
) {
  return Math.abs(mod360(a - b + 180) - 180);
}

function smooth(
  x: number
) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

/** Degrees the wheel turns on its `t`-th tick (t = 0, 1, ...). */
export function wheelVelocity(
  pattern: Pattern,
  t: number
) {
  const period =
    Math.max(1, pattern.period);

  const cycle =
    Math.floor(t / period);

  const local =
    t - cycle * period;

  const u =
    local / period;

  const sign =
    pattern.flip && cycle % 2 === 1
      ? -pattern.dir * FLIP_BACK
      : pattern.dir;

  // 0 -> 1 -> 0 over one cycle.
  const tri =
    u < 0.5
      ? u * 2
      : 2 - u * 2;

  let mag = 1;

  switch (pattern.kind) {
    case "steady":
      mag = 1;
      break;

    case "wave":
      mag = pattern.low + (1 - pattern.low) * smooth(tri);
      break;

    case "pulse": {
      const ramp =
        Math.max(1, pattern.ramp);

      mag = local < ramp
        ? smooth(local / ramp)
        : local > period - ramp
          ? smooth((period - local) / ramp)
          : 1;
      break;
    }

    case "burst": {
      if (local < pattern.hold) {
        mag = pattern.low;
      } else {
        const span =
          Math.max(1, period - pattern.hold);

        const v =
          (local - pattern.hold) / span;

        const bell =
          v < 0.5
            ? v * 2
            : 2 - v * 2;

        mag = pattern.low + (1 - pattern.low) * smooth(bell);
      }
      break;
    }

    case "swing":
      mag = pattern.bias + (1 - Math.abs(pattern.bias)) * (2 * smooth(tri) - 1);
      break;
  }

  return sign * pattern.speed * mag;
}

// ---------------------------------------------------------
// Stage generation (fixed draw order per stage)
// ---------------------------------------------------------

function farFrom(
  angle: number,
  others: number[],
  gap: number
) {
  for (const other of others) {
    if (angleDistance(angle, other) < gap) return false;
  }

  return true;
}

export function isBossStage(
  index: number
) {
  return index % BOSS_EVERY === 0;
}

export function makeStage(
  rng: Prng,
  index: number
): Stage {
  const boss =
    isBossStage(index);

  const cycle =
    Math.floor((index - 1) / BOSS_EVERY);

  const tier =
    Math.min(3, cycle);

  // Draw order (always all four, so it never depends on the branch).
  const kindRoll = rng.next();
  const dir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
  const jitter = rng.range(0.92, 1.08);
  const periodRoll = rng.next();

  const speedBase =
    Math.min(SPEED_MAX, 1.5 + (index - 1) * 0.07);

  let pattern: Pattern;
  let need: number;
  let bossItem: BossItem | null = null;
  let bossName: string | null = null;

  if (boss) {
    const bossIndex =
      index / BOSS_EVERY - 1;

    const def =
      BOSSES[bossIndex % BOSSES.length];

    const lap =
      Math.floor(bossIndex / BOSSES.length);

    bossItem = def.item;
    bossName = def.name;

    pattern = {
      ...def.pattern,
      dir,
      speed: Math.min(BOSS_SPEED_MAX, def.pattern.speed * (1 + lap * 0.15) * jitter),
    };

    need = Math.min(MAX_CARDS, 8 + Math.floor(bossIndex / 2));
  } else {
    need = Math.min(10, MIN_CARDS + Math.floor((index - 1) / 3));

    const base: Pattern = {
      kind: "steady",
      speed: speedBase * jitter,
      dir,
      period: 120,
      low: 0,
      ramp: 0,
      hold: 0,
      flip: false,
      bias: 0,
    };

    let kind: PatternKind = "steady";

    if (index === 1) {
      kind = "steady";
    } else if (tier === 0) {
      kind = kindRoll < 0.6 ? "steady" : "wave";
    } else if (tier === 1) {
      kind = kindRoll < 0.3 ? "steady" : kindRoll < 0.65 ? "wave" : "pulse";
    } else if (tier === 2) {
      kind = kindRoll < 0.2 ? "wave" : kindRoll < 0.55 ? "pulse" : "burst";
    } else {
      kind = kindRoll < 0.15 ? "steady" : kindRoll < 0.4 ? "wave" : kindRoll < 0.7 ? "pulse" : "burst";
    }

    switch (kind) {
      case "steady":
        pattern = base;
        break;

      case "wave":
        pattern = {
          ...base,
          kind,
          speed: speedBase * 1.3 * jitter,
          low: 0.22,
          period: 120 + Math.floor(periodRoll * 80),
        };
        break;

      case "pulse":
        pattern = {
          ...base,
          kind,
          speed: speedBase * 1.15 * jitter,
          period: 96 + Math.floor(periodRoll * 70),
          ramp: 20,
          flip: true,
        };
        break;

      default: {
        const period =
          80 + Math.floor(periodRoll * 50);

        pattern = {
          ...base,
          kind: "burst",
          speed: speedBase * 1.7 * jitter,
          period,
          low: 0.08,
          hold: Math.floor(period / 2),
          flip: tier >= 3 && periodRoll > 0.6,
        };
      }
    }
  }

  // ---- pre-stuck "shadow" cards ----
  const preCount =
    index === 1
      ? 0
      : boss
        ? Math.min(MAX_PRE_STUCK, 1 + Math.min(2, Math.floor((index / BOSS_EVERY - 1) / 2)))
        : rng.int(0, Math.min(3, 1 + Math.floor(index / 5)));

  const preStuck: number[] = [];

  for (let i = 0; i < preCount; i++) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle =
        Math.floor(rng.next() * 360);

      if (farFrom(angle, preStuck, CARD_GAP * 2 + 4)) {
        preStuck.push(angle);
        break;
      }
    }
  }

  // ---- Eye orbs ----
  const orbCount =
    index === 1
      ? 1
      : boss
        ? MAX_ORBS
        : rng.int(0, 2);

  const orbAngles: number[] = [];

  for (let i = 0; i < orbCount; i++) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle =
        Math.floor(rng.next() * 360);

      if (
        farFrom(angle, preStuck, CARD_GAP + ORB_HIT) &&
        farFrom(angle, orbAngles, ORB_HIT * 2 + 2)
      ) {
        orbAngles.push(angle);
        break;
      }
    }
  }

  return {
    index,
    boss: bossItem,
    bossName,
    need,
    pattern,
    preStuck,
    orbs: orbAngles.map(
      (a) => ({
        a,
        taken: false,
      })
    ),
  };
}

function startStage(
  sim: StrikeSim,
  index: number
) {
  sim.stage = makeStage(sim.rng, index);
  sim.stageTick = 0;
  sim.angle = 0;
  sim.prevAngle = 0;
  sim.vel = 0;
  sim.stageStuck = 0;
  sim.stuck = sim.stage.preStuck.map(
    (a) => ({
      a,
      pre: true,
    })
  );
}

export function createStrike(
  seed: string
): StrikeSim {
  const sim: StrikeSim = {
    seed,
    rng: createPrng(seed),
    tick: 0,
    dead: false,
    timedOut: false,
    stage: null as unknown as Stage,
    stageTick: 0,
    angle: 0,
    prevAngle: 0,
    vel: 0,
    stuck: [],
    stageStuck: 0,
    flight: null,
    cooldown: 0,
    breakLeft: 0,
    thrown: 0,
    cardsStuck: 0,
    orbsHit: 0,
    stagesCleared: 0,
    bossesBeaten: 0,
    events: [],
  };

  startStage(sim, 1);

  return sim;
}

/** True when a throw on this tick would actually leave the hand. */
export function canThrow(
  sim: StrikeSim
) {
  return (
    !sim.dead &&
    sim.flight === null &&
    sim.cooldown === 0 &&
    sim.breakLeft === 0
  );
}

/** Local angle a card thrown NOW would land at (bots / tests / aim hint). */
export function predictImpact(
  sim: StrikeSim
) {
  let angle = sim.angle;

  for (let i = 0; i < FLIGHT_TICKS; i++) {
    angle = mod360(angle + wheelVelocity(sim.stage.pattern, sim.stageTick + i));
  }

  return mod360(IMPACT_ANGLE - angle);
}

function land(
  sim: StrikeSim
) {
  const local =
    mod360(IMPACT_ANGLE - sim.angle);

  for (const card of sim.stuck) {
    if (angleDistance(local, card.a) < CARD_GAP) {
      sim.dead = true;

      sim.events.push({
        type: "clash",
        a: local,
        hit: card.a,
      });

      return;
    }
  }

  sim.stuck.push({
    a: local,
    pre: false,
  });

  sim.stageStuck += 1;
  sim.cardsStuck += 1;

  let orbIndex: number | null = null;

  for (let i = 0; i < sim.stage.orbs.length; i++) {
    const orb = sim.stage.orbs[i];

    if (
      !orb.taken &&
      angleDistance(local, orb.a) <= ORB_HIT
    ) {
      orb.taken = true;
      orbIndex = i;
      sim.orbsHit += 1;
      break;
    }
  }

  const left =
    sim.stage.need - sim.stageStuck;

  sim.events.push({
    type: "hit",
    a: local,
    orb: orbIndex,
    left,
  });

  if (left <= 0) {
    sim.stagesCleared += 1;

    if (sim.stage.boss) sim.bossesBeaten += 1;

    sim.breakLeft = sim.stage.boss
      ? BOSS_BREAK_TICKS
      : BREAK_TICKS;

    sim.events.push({
      type: "break",
      stage: sim.stage.index,
      boss: sim.stage.boss,
    });
  }
}

/**
 * One tick. `throwCard` = the player threw on this tick (processed
 * before the wheel turns). Ignored unless canThrow(sim).
 */
export function stepStrike(
  sim: StrikeSim,
  throwCard: boolean
) {
  sim.events = [];

  if (sim.dead) return;

  if (
    throwCard &&
    canThrow(sim)
  ) {
    sim.flight = 0;
    sim.thrown += 1;

    sim.events.push({
      type: "throw",
    });
  }

  sim.tick += 1;
  sim.prevAngle = sim.angle;

  if (sim.breakLeft > 0) {
    sim.breakLeft -= 1;
    sim.vel = 0;

    if (sim.breakLeft === 0) {
      startStage(sim, sim.stage.index + 1);

      sim.events.push({
        type: "stage",
        stage: sim.stage.index,
        boss: sim.stage.boss,
      });
    }
  } else {
    sim.vel = wheelVelocity(sim.stage.pattern, sim.stageTick);
    sim.angle = mod360(sim.angle + sim.vel);
    sim.stageTick += 1;
  }

  if (sim.flight !== null) {
    sim.flight += 1;

    if (sim.flight >= FLIGHT_TICKS) {
      sim.flight = null;
      sim.cooldown = RELOAD_TICKS;
      land(sim);
    }
  } else if (sim.cooldown > 0) {
    sim.cooldown -= 1;
  }

  if (
    !sim.dead &&
    sim.tick >= MAX_TICKS
  ) {
    sim.dead = true;
    sim.timedOut = true;
  }
}

export function strikeScore(
  sim: StrikeSim
) {
  return (
    sim.stagesCleared * STAGE_POINTS +
    sim.cardsStuck +
    sim.orbsHit * ORB_POINTS +
    sim.bossesBeaten * BOSS_BONUS
  );
}

// ---------------------------------------------------------
// Input recording + replay (anti-cheat)
// ---------------------------------------------------------

export type RunEnd =
  | "clash"
  | "quit";

/**
 * A recorded run. `e` is a delta-encoded list of throw ticks:
 * [firstThrowTick, ticksSincePrevThrow, ...] (every delta after
 * the first is at least 1: one throw per tick at most).
 */
export type StrikeInputs = {
  v: typeof ENGINE_VERSION;
  e: number[];
  end: RunEnd;
  ticks: number;
};

export class ThrowRecorder {
  private events: number[] = [];

  private lastTick = -1;

  /** Call with sim.tick BEFORE stepStrike(sim, true). */
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
  ): StrikeInputs {
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
      new ThrowRecorder();

    recorder.events = [...snapshot.e];
    recorder.lastTick = snapshot.lastTick;

    return recorder;
  }
}

/** Validates shape and decodes to absolute throw ticks; null = malformed. */
export function decodeThrows(
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

/** Re-simulate from seed + throw ticks, up to `uptoTick` (or the clash). */
export function simulateThrows(
  seed: string,
  throws: number[],
  uptoTick: number
) {
  const sim =
    createStrike(seed);

  let cursor = 0;

  while (
    !sim.dead &&
    sim.tick < uptoTick
  ) {
    const throwCard =
      cursor < throws.length &&
      throws[cursor] === sim.tick;

    if (throwCard) cursor += 1;

    stepStrike(
      sim,
      throwCard
    );
  }

  return {
    sim,
    /** Throws the replay never reached (after a clash). */
    unused: throws.length - cursor,
  };
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
 * A throw the engine would ignore (card still in the air, wheel
 * shattering) is never recorded by an honest client, so one in the
 * log means the log was edited: rejected.
 */
export function validateStrikeRun(
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
    inputs as Partial<StrikeInputs>;

  if (run.v !== ENGINE_VERSION) {
    return {
      ok: false,
      reason: "Game version changed. Reload the page.",
    };
  }

  if (
    run.end !== "clash" &&
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

  const throws =
    decodeThrows(
      run.e,
      ticks
    );

  if (!throws) {
    return {
      ok: false,
      reason: "Malformed inputs.",
    };
  }

  // Replay step by step so a throw the engine would ignore is caught.
  const sim =
    createStrike(seed);

  let cursor = 0;

  while (
    !sim.dead &&
    sim.tick < ticks
  ) {
    const throwCard =
      cursor < throws.length &&
      throws[cursor] === sim.tick;

    if (throwCard) {
      if (!canThrow(sim)) {
        return {
          ok: false,
          reason: "Replay does not match the run.",
          replayScore: strikeScore(sim),
        };
      }

      cursor += 1;
    }

    stepStrike(
      sim,
      throwCard
    );
  }

  const replayScore =
    strikeScore(sim);

  if (cursor !== throws.length) {
    return {
      ok: false,
      reason: "Replay does not match the run.",
      replayScore,
    };
  }

  if (run.end === "clash") {
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
