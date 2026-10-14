import {
  createPrng,
} from "./prng";

// =========================================================
// GIZA PEAKS - shared, pure TriPeaks solitaire engine (no DOM).
//
// Three pyramids of overlapping cards (28 in the tableau), a stock
// pile and a waste card. Play an UNCOVERED tableau card that is one
// rank higher or lower than the waste card (A-K, and K <-> A wraps
// around) onto the waste, or draw the next stock card onto the
// waste. Plays in a row without drawing build a CHAIN: the n-th
// card of a chain is worth n x 10 points. Taking a peak top is a
// bonus; clearing all three peaks (= the whole tableau) pays a
// round bonus plus a bonus per stock card left, and deals the next
// ROUND from a fresh seeded shuffle with one card less in the stock
// (23, 22, 21, ... down to 16). The run ends when the stock is
// empty and no card can be played ("No moves").
//
// The exact same code runs in the browser (live play) and in the
// server action (replay to validate a submitted run):
//
//   * Integer maths only; randomness only from the seeded PRNG
//     (one fresh shuffle per round: seed + round number, so the
//     deal never depends on what the player did).
//   * Inputs are a list of actions stamped with the run clock
//     (60 ticks per second, only counted while not paused):
//     play(cardIndex) or draw. Two actions are at least
//     MIN_ACTION_GAP ticks apart (at most ~8.6 per second) and a
//     fresh deal locks input for DEAL_TICKS. That is what bounds
//     the score per tick for the catalog (see SCORE_PER_TICK_BOUND).
//
// Tableau indices (TriPeaks rows, peak tops first):
//
//   row 0:  0           1           2          (peak tops)
//   row 1:  3  4        5  6        7  8
//   row 2:  9 10 11    12 13 14    15 16 17
//   row 3: 18 19 20 21 22 23 24 25 26 27      (face up at the deal)
//
// A card is uncovered (face up, playable when the rank fits) once
// both cards of the row below that overlap it are gone.
// =========================================================

/** Database game key (mini_game_catalog / game_runs.game). */
export const PEAKS_GAME = "giza_peaks";

export const ENGINE_VERSION = 1;

export const TICKS_PER_SECOND = 60;

/** 30 minutes of (unpaused) play: the same cap submit_game_run() enforces. */
export const MAX_TICKS =
  30 * 60 * TICKS_PER_SECOND;

/** Minimum ticks between two actions (60 / 7 = at most ~8.6 actions per second). */
export const MIN_ACTION_GAP = 7;

/** Input is locked this long after every deal (the deal animation). */
export const DEAL_TICKS = 60;

export const TABLEAU_SIZE = 28;

export const RANKS = 13;

export const SUITS = 4;

export const DECK_SIZE =
  RANKS * SUITS;

/** K <-> A counts as one apart (classic TriPeaks). */
export const WRAP_AROUND = true;

/** Points for a played card = PLAY_POINTS x its place in the chain. */
export const PLAY_POINTS = 10;

/** Taking a peak top (indices 0-2). */
export const PEAK_BONUS = 150;

/** Clearing the whole tableau (all three peaks). */
export const CLEAR_BONUS = 1000;

/** Per stock card still unused when the round is cleared. */
export const STOCK_BONUS = 50;

export const FIRST_STOCK = 23;

export const MIN_STOCK = 16;

export const MAX_ACTIONS =
  Math.floor(MAX_TICKS / MIN_ACTION_GAP) + 1;

/**
 * Catalog bound (mini_game_catalog for 'giza_peaks'):
 *   score <= ceil(ticks * SCORE_PER_TICK_BOUND) + SCORE_FLAT_BOUND
 *
 * Why it always holds:
 *   * A cleared round is worth at most
 *       chain points  10 x (1 + 2 + ... + 28) = 4060
 *     + peak tops     3 x 150                 =  450
 *     + clear         1000
 *     + stock left    23 x 50                 = 1150   (stock <= 23)
 *     = 6660 points.
 *   * It takes at least DEAL_TICKS (input lock after its deal) plus
 *     27 gaps of MIN_ACTION_GAP between its 28 plays:
 *     60 + 27 x 7 = 249 ticks. 27 x 249 = 6723 >= 6660, so every
 *     finished round fits inside 27 points per tick.
 *   * Only the round still in progress can be ahead of that: with
 *     at most 27 plays and two peak tops it is worth at most
 *     10 x (1 + ... + 27) + 2 x 150 = 4080 < 4200, the flat part.
 *   Draws are worth nothing. The tests in peaks-engine.test.ts
 *   check this analytically and after every action of bot runs.
 */
export const SCORE_PER_TICK_BOUND = 27;

export const SCORE_FLAT_BOUND = 4200;

export const DRAW = -1;

/** Row of every tableau index (0 = peak tops, 3 = bottom row). */
export const ROW_OF: readonly number[] = [
  0, 0, 0,
  1, 1, 1, 1, 1, 1,
  2, 2, 2, 2, 2, 2, 2, 2, 2,
  3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
];

/** Horizontal slot of every tableau index, in HALF card widths (0..18). */
export const HALF_X_OF: readonly number[] = (() => {
  const x: number[] = [];

  for (let p = 0; p < 3; p++) {
    x.push(6 * p + 3);
  }

  for (let p = 0; p < 3; p++) {
    for (let k = 0; k < 2; k++) {
      x.push(6 * p + 2 * k + 2);
    }
  }

  for (let j = 0; j < 9; j++) {
    x.push(2 * j + 1);
  }

  for (let j = 0; j < 10; j++) {
    x.push(2 * j);
  }

  return x;
})();

/** The two cards (row below) that overlap each tableau card. */
export const COVERED_BY: readonly (readonly number[])[] = (() => {
  const covers: number[][] = [];

  for (let p = 0; p < 3; p++) {
    covers.push([3 + 2 * p, 4 + 2 * p]);
  }

  for (let p = 0; p < 3; p++) {
    for (let k = 0; k < 2; k++) {
      covers.push([9 + 3 * p + k, 10 + 3 * p + k]);
    }
  }

  for (let j = 0; j < 9; j++) {
    covers.push([18 + j, 19 + j]);
  }

  for (let j = 0; j < 10; j++) {
    covers.push([]);
  }

  return covers;
})();

/** Which peak (0-2) a tableau index belongs to, for bursts; -1 = shared base card. */
export function peakOf(
  index: number
) {
  if (index < 3) return index;
  if (index < 9) return Math.floor((index - 3) / 2);
  if (index < 18) return Math.floor((index - 9) / 3);

  const j = index - 18;

  if (j === 3 || j === 6) return -1;

  return Math.min(2, Math.floor(j / 3));
}

/** 1 = Ace ... 11 = J, 12 = Q, 13 = K. */
export function rankOf(
  card: number
) {
  return (card % RANKS) + 1;
}

/** 0 = Eye, 1 = Puzzle, 2 = Ankh, 3 = Scarab. */
export function suitOf(
  card: number
) {
  return Math.floor(card / RANKS);
}

export function rankLabel(
  rank: number
) {
  switch (rank) {
    case 1:
      return "A";
    case 11:
      return "J";
    case 12:
      return "Q";
    case 13:
      return "K";
    default:
      return String(rank);
  }
}

export function ranksTouch(
  a: number,
  b: number
) {
  const d = Math.abs(a - b);

  return (
    d === 1 ||
    (WRAP_AROUND && d === RANKS - 1)
  );
}

export function stockForRound(
  round: number
) {
  return Math.max(
    MIN_STOCK,
    FIRST_STOCK - (round - 1)
  );
}

export type PeaksEvent =
  | {
      type: "play";
      index: number;
      card: number;
      chain: number;
      points: number;
      peak: boolean;
    }
  | {
      type: "draw";
      card: number;
    }
  | {
      type: "clear";
      round: number;
      bonus: number;
      stockLeft: number;
    }
  | {
      type: "deal";
      round: number;
      stock: number;
    }
  | {
      type: "nomoves";
    };

export type PeaksSim = {
  seed: string;
  /** 1-based round being played. */
  round: number;
  /** Card id per tableau slot, -1 = played. */
  tableau: number[];
  /** Next card to draw is the LAST one. */
  stock: number[];
  /** Top card is the LAST one (only this round's). */
  waste: number[];
  chain: number;
  bestChain: number;
  score: number;
  cardsPlayed: number;
  peaksTaken: number;
  roundsCleared: number;
  draws: number;
  /** Tick of the last accepted action (-MIN_ACTION_GAP before the first). */
  lastActionTick: number;
  /** No action before this tick (deal animation). */
  lockedUntil: number;
  /** Stock empty and nothing playable: the run is over. */
  over: boolean;
  /** Events of the LAST action only. */
  events: PeaksEvent[];
};

/** Fresh seeded shuffle for one round (Fisher-Yates). */
export function shuffledDeck(
  seed: string,
  round: number
) {
  const rng =
    createPrng(`${seed}|peaks-round:${round}`);

  const deck: number[] = [];

  for (let i = 0; i < DECK_SIZE; i++) {
    deck.push(i);
  }

  for (let i = DECK_SIZE - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const swap = deck[i];

    deck[i] = deck[j];
    deck[j] = swap;
  }

  return deck;
}

function deal(
  sim: PeaksSim,
  round: number,
  tick: number
) {
  const deck =
    shuffledDeck(sim.seed, round);

  const stockSize =
    stockForRound(round);

  sim.round = round;
  sim.tableau = deck.slice(0, TABLEAU_SIZE);
  sim.waste = [deck[TABLEAU_SIZE]];
  sim.stock = deck.slice(TABLEAU_SIZE + 1, TABLEAU_SIZE + 1 + stockSize);
  sim.chain = 0;
  sim.lockedUntil = tick + DEAL_TICKS;

  sim.events.push({
    type: "deal",
    round,
    stock: stockSize,
  });
}

export function createPeaks(
  seed: string
): PeaksSim {
  const sim: PeaksSim = {
    seed,
    round: 0,
    tableau: [],
    stock: [],
    waste: [],
    chain: 0,
    bestChain: 0,
    score: 0,
    cardsPlayed: 0,
    peaksTaken: 0,
    roundsCleared: 0,
    draws: 0,
    lastActionTick: -MIN_ACTION_GAP,
    lockedUntil: 0,
    over: false,
    events: [],
  };

  deal(sim, 1, 0);

  return sim;
}

export function wasteTop(
  sim: PeaksSim
) {
  return sim.waste[sim.waste.length - 1];
}

export function isUncovered(
  sim: PeaksSim,
  index: number
) {
  if (
    index < 0 ||
    index >= TABLEAU_SIZE ||
    sim.tableau[index] < 0
  ) {
    return false;
  }

  return COVERED_BY[index].every(
    (below) => sim.tableau[below] < 0
  );
}

export function canPlayCard(
  sim: PeaksSim,
  index: number
) {
  return (
    !sim.over &&
    isUncovered(sim, index) &&
    ranksTouch(
      rankOf(sim.tableau[index]),
      rankOf(wasteTop(sim))
    )
  );
}

export function playableIndices(
  sim: PeaksSim
) {
  const out: number[] = [];

  for (let i = 0; i < TABLEAU_SIZE; i++) {
    if (canPlayCard(sim, i)) out.push(i);
  }

  return out;
}

export function hasMove(
  sim: PeaksSim
) {
  return (
    sim.stock.length > 0 ||
    playableIndices(sim).length > 0
  );
}

/** First tick at which an action would be accepted. */
export function nextActionTick(
  sim: PeaksSim
) {
  return Math.max(
    sim.lastActionTick + MIN_ACTION_GAP,
    sim.lockedUntil
  );
}

export function canActAt(
  sim: PeaksSim,
  tick: number
) {
  return (
    !sim.over &&
    tick < MAX_TICKS &&
    tick >= nextActionTick(sim)
  );
}

/**
 * One action at `tick`: DRAW (-1) or play(tableau index).
 * Returns null when accepted, or why it was refused (the state is
 * then unchanged; the client never records refused actions).
 */
export function applyAction(
  sim: PeaksSim,
  tick: number,
  action: number
): string | null {
  sim.events = [];

  if (sim.over) {
    return "The run is over.";
  }

  if (
    !Number.isInteger(tick) ||
    tick < 0 ||
    tick >= MAX_TICKS
  ) {
    return "Impossible tick.";
  }

  if (tick < nextActionTick(sim)) {
    return "Too fast.";
  }

  if (action === DRAW) {
    const card = sim.stock.pop();

    if (card === undefined) {
      return "The stock is empty.";
    }

    sim.waste.push(card);
    sim.chain = 0;
    sim.draws += 1;
    sim.lastActionTick = tick;

    sim.events.push({
      type: "draw",
      card,
    });
  } else {
    if (
      !Number.isInteger(action) ||
      !canPlayCard(sim, action)
    ) {
      return "That card can't be played.";
    }

    const card = sim.tableau[action];
    const peak = action < 3;

    sim.tableau[action] = -1;
    sim.waste.push(card);
    sim.chain += 1;
    sim.bestChain = Math.max(sim.bestChain, sim.chain);
    sim.cardsPlayed += 1;

    const points =
      PLAY_POINTS * sim.chain +
      (peak ? PEAK_BONUS : 0);

    sim.score += points;

    if (peak) sim.peaksTaken += 1;

    sim.lastActionTick = tick;

    sim.events.push({
      type: "play",
      index: action,
      card,
      chain: sim.chain,
      points,
      peak,
    });

    if (sim.tableau.every((slot) => slot < 0)) {
      const stockLeft = sim.stock.length;

      const bonus =
        CLEAR_BONUS + STOCK_BONUS * stockLeft;

      sim.score += bonus;
      sim.roundsCleared += 1;

      sim.events.push({
        type: "clear",
        round: sim.round,
        bonus,
        stockLeft,
      });

      deal(sim, sim.round + 1, tick);
    }
  }

  if (!hasMove(sim)) {
    sim.over = true;

    sim.events.push({
      type: "nomoves",
    });
  }

  return null;
}

export function peaksScore(
  sim: PeaksSim
) {
  return sim.score;
}

// ---------------------------------------------------------
// Input recording + replay (anti-cheat)
// ---------------------------------------------------------

export type RunEnd =
  | "nomoves"
  | "quit";

export type PeaksAction = {
  /** Run-clock tick of the action. */
  t: number;
  /** DRAW (-1) or a tableau index (0-27). */
  a: number;
};

/**
 * A recorded run. `e` is a flat list of [ticksSincePrevAction,
 * action] pairs (the first delta counts from tick 0); action -1 =
 * draw, 0-27 = play that tableau card. `ticks` = run length.
 */
export type PeaksInputs = {
  v: typeof ENGINE_VERSION;
  e: number[];
  end: RunEnd;
  ticks: number;
};

export class ActionRecorder {
  private events: number[] = [];

  private lastTick = 0;

  /** Call with the tick of an action applyAction() ACCEPTED. */
  record(
    tick: number,
    action: number
  ) {
    this.events.push(
      tick - this.lastTick,
      action
    );

    this.lastTick = tick;
  }

  finish(
    end: RunEnd,
    ticks: number
  ): PeaksInputs {
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
      new ActionRecorder();

    recorder.events = [...snapshot.e];
    recorder.lastTick = snapshot.lastTick;

    return recorder;
  }
}

/** Validates shape and decodes to absolute actions; null = malformed. */
export function decodeActions(
  events: unknown,
  totalTicks: number
): PeaksAction[] | null {
  if (
    !Array.isArray(events) ||
    events.length % 2 !== 0 ||
    events.length / 2 > MAX_ACTIONS
  ) {
    return null;
  }

  const actions: PeaksAction[] = [];

  let tick = 0;

  for (let i = 0; i < events.length; i += 2) {
    const dt = events[i];
    const action = events[i + 1];

    if (
      !Number.isInteger(dt) ||
      dt < 0 ||
      !Number.isInteger(action) ||
      action < DRAW ||
      action >= TABLEAU_SIZE
    ) {
      return null;
    }

    tick += dt;

    if (tick >= totalTicks) {
      return null;
    }

    actions.push({
      t: tick,
      a: action,
    });
  }

  return actions;
}

/** Replays actions in order; stops at the first refused one. */
export function simulateActions(
  seed: string,
  actions: PeaksAction[]
) {
  const sim =
    createPeaks(seed);

  for (let i = 0; i < actions.length; i++) {
    const refused =
      applyAction(
        sim,
        actions[i].t,
        actions[i].a
      );

    if (refused) {
      return {
        sim,
        refusedAt: i,
        reason: refused,
      };
    }
  }

  return {
    sim,
    refusedAt: -1,
    reason: null,
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
 */
export function validatePeaksRun(
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
    inputs as Partial<PeaksInputs>;

  if (run.v !== ENGINE_VERSION) {
    return {
      ok: false,
      reason: "Game version changed. Reload the page.",
    };
  }

  if (
    run.end !== "nomoves" &&
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

  const actions =
    decodeActions(
      run.e,
      ticks
    );

  if (!actions) {
    return {
      ok: false,
      reason: "Malformed inputs.",
    };
  }

  const {
    sim,
    refusedAt,
  } = simulateActions(
    seed,
    actions
  );

  const replayScore =
    peaksScore(sim);

  if (refusedAt >= 0) {
    return {
      ok: false,
      reason: "Replay does not match the run.",
      replayScore,
    };
  }

  if (
    (run.end === "nomoves" && !sim.over) ||
    (run.end === "quit" && sim.over)
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
