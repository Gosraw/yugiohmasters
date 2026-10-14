import {
  createPrng,
  type Prng,
} from "./prng";

// =========================================================
// OBELISK RUSH - shared, pure simulation (no DOM).
//
// A Timberman-style two-side tapper: a tall obelisk stands in the
// middle, your duelist stands on its left or right. Every input is
// a SIDE: you move to that side and strike, the bottom stone block
// breaks off and the whole obelisk drops one block.
//
// Some blocks carry a blade sticking out on one side. You are cut
// (run over) when, after your move, a blade is on your side at your
// height:
//   * "walk": you moved into the side where the bottom block (the
//     one you were about to strike) has its blade;
//   * "fall": you struck, and the block that dropped down to your
//     height has its blade on your side.
//
// A sand timer drains every tick (faster every TIER_EVERY strikes)
// and each strike refills it a little; empty = run over. Golden Ra
// blocks give RA_BONUS extra points and a bigger refill.
// Score = strikes + Ra bonus.
//
// The exact same code runs in the browser (live play) and in the
// server action (replay to validate a submitted run), so it follows
// the same rules as stack-engine.ts / climber-engine.ts:
//
//   1. Fixed timestep: one step = one tick = 1/60 s. The timer is
//      an INTEGER counter, so it is exact everywhere.
//   2. Only + - * / Math.min / Math.max / Math.floor.
//   3. Randomness only from the seeded PRNG, drawn in a fixed order
//      per generated block (4 draws, always), so the obelisk is the
//      same sequence of blocks for a seed no matter WHEN or from
//      which side the player strikes.
//
// Always solvable: two neighbouring blocks never have blades on
// OPPOSITE sides (a blade block is followed by a clean block or, at
// higher levels, by a blade on the SAME side). So for any bottom
// pair there is always one side that is safe for both: the strike
// is never forced into a blade.
// =========================================================

/** Database game key (mini_game_catalog / game_runs.game). */
export const OBELISK_GAME = "obelisk_rush";

export const ENGINE_VERSION = 1;

export const TICKS_PER_SECOND = 60;

/** 30 minutes: the same cap submit_game_run() enforces. */
export const MAX_TICKS =
  30 * 60 * TICKS_PER_SECOND;

/**
 * At most one strike every MIN_STRIKE_GAP ticks (15 per second).
 * Fast two-thumb alternating taps top out around 8-12 per second,
 * so this never slows a real player down (an early tap waits a few
 * milliseconds in the client queue), but it bounds a bot / tampered
 * log. The database bound (max_score_per_tick = 0.375) is derived
 * from it, see maxScoreFor().
 */
export const MIN_STRIKE_GAP = 4;

/** Timer units (integers). Full bar. */
export const TIMER_MAX = 12000;

/** The bar starts a bit over half full; it only drains after the first strike. */
export const TIMER_START = 7200;

/** Refill per strike. */
export const STRIKE_REFILL = 384;

/** Refill for a golden Ra block (instead of STRIKE_REFILL). */
export const RA_REFILL = 1152;

/** Extra points for striking a Ra block. */
export const RA_BONUS = 5;

/** Ra blocks can only be block #9, #19, #29, ... (index % RA_EVERY === RA_EVERY - 1). */
export const RA_EVERY = 10;

/** Speed tier goes up every TIER_EVERY strikes. */
export const TIER_EVERY = 25;

export const MAX_TIER = 12;

/** Timer drain per tick: DRAIN_BASE + DRAIN_STEP * tier. */
export const DRAIN_BASE = 18;

export const DRAIN_STEP = 3;

/** The first blocks never have a blade. */
export const SAFE_START = 3;

/** Blocks kept generated above the player (renderer draws these). */
export const LOOKAHEAD = 14;

/** Strikes this close together (ticks) keep the combo going. */
export const COMBO_GAP = 30;

/** Stone tones the renderer can pick from (0..TONES-1). */
export const TONES = 4;

export type Side =
  | "L"
  | "R";

export type Block = {
  /** 0 = the first block at the player's height when the run starts. */
  index: number;
  blade: Side | null;
  ra: boolean;
  tone: number;
};

export type CutBy =
  | "walk"
  | "fall";

export type ObeliskEvent =
  | {
      type: "strike";
      side: Side;
      /** The block that broke off. */
      block: Block;
      combo: number;
      ra: boolean;
      /** Strikes now reached a new speed tier. */
      tierUp: boolean;
      tier: number;
    }
  | {
      type: "cut";
      side: Side;
      by: CutBy;
      /** The block whose blade cut you. */
      block: Block;
    }
  | {
      type: "timeout";
    };

export type DeathCause =
  | "cut"
  | "time"
  | "max";

export type ObeliskSim = {
  seed: string;
  rng: Prng;
  tick: number;
  dead: boolean;
  cause: DeathCause | null;
  /** Where the duelist stands. */
  side: Side;
  /** The timer only drains after the first strike. */
  started: boolean;
  timer: number;
  strikes: number;
  raHits: number;
  bonus: number;
  combo: number;
  bestCombo: number;
  lastStrikeTick: number;
  /** blocks[0] is at the player's height (the one you strike). */
  blocks: Block[];
  nextIndex: number;
  /** Blade of the last GENERATED block (generation constraint). */
  lastBlade: Side | null;
  /** Events of the LAST step only. */
  events: ObeliskEvent[];
};

function bladeChance(
  index: number
) {
  return Math.min(
    0.72,
    0.5 + index * 0.0015
  );
}

function doubleChance(
  index: number
) {
  return index < 30
    ? 0
    : Math.min(
        0.3,
        (index - 30) * 0.002
      );
}

function generate(
  sim: ObeliskSim
) {
  const index =
    sim.nextIndex;

  // Fixed draw order per block: blade roll, side roll, Ra roll, tone.
  const bladeRoll =
    sim.rng.next();

  const sideRoll =
    sim.rng.next();

  const raRoll =
    sim.rng.next();

  const tone =
    sim.rng.int(0, TONES - 1);

  let blade: Side | null = null;

  if (index >= SAFE_START) {
    if (sim.lastBlade === null) {
      if (bladeRoll < bladeChance(index)) {
        blade = sideRoll < 0.5
          ? "L"
          : "R";
      }
    } else if (bladeRoll < doubleChance(index)) {
      // Same side only: never opposite neighbours (always solvable).
      blade = sim.lastBlade;
    }
  }

  const ra =
    blade === null &&
    index % RA_EVERY === RA_EVERY - 1 &&
    raRoll < 0.55;

  sim.blocks.push({
    index,
    blade,
    ra,
    tone,
  });

  sim.lastBlade = blade;
  sim.nextIndex = index + 1;
}

function fill(
  sim: ObeliskSim
) {
  while (sim.blocks.length < LOOKAHEAD) {
    generate(sim);
  }
}

export function createObelisk(
  seed: string
): ObeliskSim {
  const sim: ObeliskSim = {
    seed,
    rng: createPrng(seed),
    tick: 0,
    dead: false,
    cause: null,
    side: "L",
    started: false,
    timer: TIMER_START,
    strikes: 0,
    raHits: 0,
    bonus: 0,
    combo: 0,
    bestCombo: 0,
    lastStrikeTick: -MIN_STRIKE_GAP,
    blocks: [],
    nextIndex: 0,
    lastBlade: null,
    events: [],
  };

  fill(sim);

  return sim;
}

export function obeliskTier(
  sim: ObeliskSim
) {
  return Math.min(
    MAX_TIER,
    Math.floor(sim.strikes / TIER_EVERY)
  );
}

export function drainFor(
  tier: number
) {
  return DRAIN_BASE + DRAIN_STEP * Math.min(MAX_TIER, tier);
}

/** True when an input on this tick would actually strike. */
export function canStrike(
  sim: ObeliskSim
) {
  return (
    !sim.dead &&
    sim.tick - sim.lastStrikeTick >= MIN_STRIKE_GAP
  );
}

function strike(
  sim: ObeliskSim,
  side: Side
) {
  sim.side = side;
  sim.started = true;

  const bottom =
    sim.blocks[0];

  if (bottom.blade === side) {
    sim.dead = true;
    sim.cause = "cut";
    sim.combo = 0;

    sim.events.push({
      type: "cut",
      side,
      by: "walk",
      block: bottom,
    });

    return;
  }

  const gap =
    sim.tick - sim.lastStrikeTick;

  sim.lastStrikeTick = sim.tick;

  sim.blocks.shift();
  fill(sim);

  const tierBefore =
    obeliskTier(sim);

  sim.strikes += 1;

  sim.combo =
    sim.strikes > 1 && gap <= COMBO_GAP
      ? sim.combo + 1
      : 1;

  sim.bestCombo = Math.max(
    sim.bestCombo,
    sim.combo
  );

  if (bottom.ra) {
    sim.raHits += 1;
    sim.bonus += RA_BONUS;
  }

  sim.timer = Math.min(
    TIMER_MAX,
    sim.timer + (bottom.ra ? RA_REFILL : STRIKE_REFILL)
  );

  const tier =
    obeliskTier(sim);

  sim.events.push({
    type: "strike",
    side,
    block: bottom,
    combo: sim.combo,
    ra: bottom.ra,
    tierUp: tier > tierBefore,
    tier,
  });

  // The block that just dropped to your height.
  const next =
    sim.blocks[0];

  if (next.blade === side) {
    sim.dead = true;
    sim.cause = "cut";
    sim.combo = 0;

    sim.events.push({
      type: "cut",
      side,
      by: "fall",
      block: next,
    });
  }
}

/**
 * One tick. `input` = the side the player chose on this tick
 * (processed before the timer drains), or null. Inputs closer than
 * MIN_STRIKE_GAP ticks to the previous strike are ignored here; the
 * client only records inputs canStrike() accepts.
 */
export function stepObelisk(
  sim: ObeliskSim,
  input: Side | null
) {
  sim.events = [];

  if (sim.dead) return;

  if (
    input !== null &&
    canStrike(sim)
  ) {
    strike(sim, input);
  }

  sim.tick += 1;

  if (sim.dead) return;

  if (sim.started) {
    sim.timer -= drainFor(obeliskTier(sim));

    if (sim.timer <= 0) {
      sim.timer = 0;
      sim.dead = true;
      sim.cause = "time";
      sim.combo = 0;

      sim.events.push({
        type: "timeout",
      });

      return;
    }
  }

  if (sim.tick >= MAX_TICKS) {
    sim.dead = true;
    sim.cause = "max";
  }
}

export function obeliskScore(
  sim: ObeliskSim
) {
  return sim.strikes + sim.bonus;
}

/**
 * Highest score the engine can ever produce in `ticks` ticks (the
 * mini_game_catalog bound must stay at or above this):
 *   strikes <= floor((ticks - 1) / MIN_STRIKE_GAP) + 1   (one per 4 ticks)
 *   Ra blocks among the first k struck <= floor(k / RA_EVERY)
 *   score <= k + RA_BONUS * floor(k / 10) <= 1.5 k
 *         <= 0.375 * ticks + 1.5  ->  ceil(ticks * 0.375) + 2
 */
export function maxScoreFor(
  ticks: number
) {
  const strikes =
    Math.floor((ticks - 1) / MIN_STRIKE_GAP) + 1;

  return strikes + RA_BONUS * Math.floor(strikes / RA_EVERY);
}

// ---------------------------------------------------------
// Input recording + replay (anti-cheat)
// ---------------------------------------------------------

export type RunEnd =
  | "cut"
  | "time"
  | "quit";

/**
 * A recorded run. `e` is a delta-encoded list of strike ticks:
 * [firstStrikeTick, ticksSincePrevStrike, ...]; `s` holds the side
 * of each strike ("L" / "R"), same length as `e`.
 */
export type ObeliskInputs = {
  v: typeof ENGINE_VERSION;
  e: number[];
  s: string;
  end: RunEnd;
  ticks: number;
};

export type StrikeInput = {
  tick: number;
  side: Side;
};

export class StrikeRecorder {
  private events: number[] = [];

  private sides = "";

  private lastTick = -1;

  /** Call with sim.tick BEFORE stepObelisk(sim, side). */
  record(
    tick: number,
    side: Side
  ) {
    if (tick <= this.lastTick) return;

    this.events.push(
      this.lastTick < 0
        ? tick
        : tick - this.lastTick
    );

    this.sides += side;
    this.lastTick = tick;
  }

  finish(
    end: RunEnd,
    ticks: number
  ): ObeliskInputs {
    return {
      v: ENGINE_VERSION,
      e: [...this.events],
      s: this.sides,
      end,
      ticks,
    };
  }

  snapshot() {
    return {
      e: [...this.events],
      s: this.sides,
      lastTick: this.lastTick,
    };
  }

  static restore(snapshot: {
    e: number[];
    s: string;
    lastTick: number;
  }) {
    const recorder =
      new StrikeRecorder();

    recorder.events = [...snapshot.e];
    recorder.sides = snapshot.s;
    recorder.lastTick = snapshot.lastTick;

    return recorder;
  }
}

/** Validates shape and decodes to absolute (tick, side); null = malformed. */
export function decodeStrikes(
  events: unknown,
  sides: unknown,
  totalTicks: number
): StrikeInput[] | null {
  if (
    !Array.isArray(events) ||
    typeof sides !== "string" ||
    sides.length !== events.length ||
    events.length > totalTicks ||
    events.length > MAX_TICKS ||
    !/^[LR]*$/.test(sides)
  ) {
    return null;
  }

  const out: StrikeInput[] = [];

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

    out.push({
      tick,
      side: sides[i] as Side,
    });
  }

  return out;
}

/**
 * Re-simulate from seed + strikes, up to `uptoTick` (or death).
 * `ignored` counts inputs the engine did not act on (too soon after
 * the previous strike, or after the run ended): an honest client
 * never records those.
 */
export function replayStrikes(
  seed: string,
  strikes: StrikeInput[],
  uptoTick: number
) {
  const sim =
    createObelisk(seed);

  let cursor = 0;
  let ignored = 0;

  while (
    !sim.dead &&
    sim.tick < uptoTick
  ) {
    let input: Side | null = null;

    if (
      cursor < strikes.length &&
      strikes[cursor].tick === sim.tick
    ) {
      input = strikes[cursor].side;
      cursor += 1;

      if (!canStrike(sim)) ignored += 1;
    }

    stepObelisk(
      sim,
      input
    );
  }

  ignored += strikes.length - cursor;

  return {
    sim,
    ignored,
  };
}

export function simulateStrikes(
  seed: string,
  strikes: StrikeInput[],
  uptoTick: number
) {
  return replayStrikes(
    seed,
    strikes,
    uptoTick
  ).sim;
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
export function validateObeliskRun(
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
    inputs as Partial<ObeliskInputs>;

  if (run.v !== ENGINE_VERSION) {
    return {
      ok: false,
      reason: "Game version changed. Reload the page.",
    };
  }

  if (
    run.end !== "cut" &&
    run.end !== "time" &&
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

  const strikes =
    decodeStrikes(
      run.e,
      run.s,
      ticks
    );

  if (!strikes) {
    return {
      ok: false,
      reason: "Malformed inputs.",
    };
  }

  const {
    sim,
    ignored,
  } = replayStrikes(
    seed,
    strikes,
    ticks
  );

  const replayScore =
    obeliskScore(sim);

  const endMatches =
    sim.tick === ticks &&
    ignored === 0 &&
    (
      run.end === "cut"
        ? sim.dead && sim.cause === "cut"
        : run.end === "time"
          ? sim.dead && sim.cause === "time"
          : !sim.dead || sim.cause === "max"
    );

  if (!endMatches) {
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
