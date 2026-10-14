import {
  createPrng,
  type Prng,
} from "./prng";

// =========================================================
// TOMB BLOCKS - shared, pure simulation (no DOM).
//
// A Block Blast / 1010!-style puzzle on an 8x8 tomb floor. You
// are offered 3 sandstone shapes at a time and place each one
// anywhere it fits (no rotation). When all 3 are placed you get 3
// new ones. Every full row AND column clears at the same moment.
// The run ends when none of the shapes still in your hand fits
// anywhere on the floor.
//
// Score per placement:
//   cells placed
//   + clear bonus  10 * L(L+1)/2 * (streak + 1) / 2
//                  (L = lines cleared at once; streak = how many
//                  clearing placements in a row, capped at 10,
//                  so x1, x1.5, x2 ... x5.5)
//   + 300 when the floor is completely empty after a clear.
// The streak survives up to 2 placements without a clear; the
// 3rd placement in a row that clears nothing resets it to 0.
//
// Fairness: the seed controls ONLY the piece sequence (a shuffled
// "bag" of all shapes, refilled when empty). Pieces never depend
// on the board, so everyone on the Daily gets exactly the same
// shapes in the same order. No hold slot, no "next" preview.
//
// The exact same code runs in the browser (live play) and in the
// server action (replay to validate a submitted run). It only uses
// integers, so it is identical in every JavaScript engine.
//
// Time: a run is a list of placements; each carries `dt`, the real
// ticks (1/60 s) since the previous placement (or since the run
// started). A placement needs dt >= MIN_MOVE_TICKS (at most 5
// placements per second). For the run length only the first
// MOVE_TICK_CAP ticks of each gap count (thinking time is free),
// so even a very long careful game stays under the 30-minute
// MAX_TICKS that submit_game_run() allows; reaching it seals the
// tomb (run over, score kept).
// =========================================================

/** Database game key (mini_game_catalog / game_runs.game). */
export const TOMB_GAME = "tomb_blocks";

export const ENGINE_VERSION = 1;

export const TICKS_PER_SECOND = 60;

export const GRID = 8;

export const HAND_SIZE = 3;

/** 30 minutes: the same cap submit_game_run() enforces. */
export const MAX_TICKS =
  30 * 60 * TICKS_PER_SECOND;

/** At most 5 placements per second (anti-bot + score bound). */
export const MIN_MOVE_TICKS = 12;

/** At most 1 s of each gap counts toward the run length. */
export const MOVE_TICK_CAP = 60;

/** Sanity cap on a single reported gap (about 4.6 days). */
const MAX_REPORTED_DT = 24_000_000;

/** More placements than this can't fit in MAX_TICKS anyway. */
export const MAX_MOVES =
  Math.floor(MAX_TICKS / MIN_MOVE_TICKS) + 1;

/** Streak multiplier stops growing here (x5.5). */
export const MAX_STREAK = 10;

/** Placements in a row without a clear that end a streak. */
export const STREAK_GRACE = 3;

export const ALL_CLEAR_BONUS = 300;

/**
 * Most points one placement can ever give: a 3x3 block (9 cells)
 * clearing 3 rows + 3 columns (6 lines) at max streak, emptying
 * the floor. Used for the database bound (see the migration).
 */
export const MAX_POINTS_PER_MOVE =
  9 + (10 * 21 * (MAX_STREAK + 1)) / 2 + ALL_CLEAR_BONUS;

/** Colours the renderer can pick from (1..COLOURS). 0 = empty. */
export const COLOURS = 8;

export type Shape = {
  key: string;
  /** Cells as [row, col], top-left of the bounding box = (0, 0). */
  cells: [number, number][];
  w: number;
  h: number;
  colour: number;
};

type ShapeDef = {
  key: string;
  rows: string[];
  colour: number;
  copies: number;
};

// Every orientation is its own shape (there is no rotating).
// `copies` = how often it is in one bag (48 pieces per bag).
const SHAPE_DEFS: ShapeDef[] = [
  { key: "dot", rows: ["#"], colour: 1, copies: 2 },
  { key: "dom_h", rows: ["##"], colour: 1, copies: 2 },
  { key: "dom_v", rows: ["#", "#"], colour: 1, copies: 2 },
  { key: "i3_h", rows: ["###"], colour: 2, copies: 2 },
  { key: "i3_v", rows: ["#", "#", "#"], colour: 2, copies: 2 },
  { key: "i4_h", rows: ["####"], colour: 2, copies: 2 },
  { key: "i4_v", rows: ["#", "#", "#", "#"], colour: 2, copies: 2 },
  { key: "i5_h", rows: ["#####"], colour: 8, copies: 1 },
  { key: "i5_v", rows: ["#", "#", "#", "#", "#"], colour: 8, copies: 1 },
  { key: "c3_a", rows: ["##", "#."], colour: 3, copies: 2 },
  { key: "c3_b", rows: ["##", ".#"], colour: 3, copies: 2 },
  { key: "c3_c", rows: ["#.", "##"], colour: 3, copies: 2 },
  { key: "c3_d", rows: [".#", "##"], colour: 3, copies: 2 },
  { key: "o2", rows: ["##", "##"], colour: 4, copies: 3 },
  { key: "t_d", rows: ["###", ".#."], colour: 5, copies: 1 },
  { key: "t_u", rows: [".#.", "###"], colour: 5, copies: 1 },
  { key: "t_r", rows: ["#.", "##", "#."], colour: 5, copies: 1 },
  { key: "t_l", rows: [".#", "##", ".#"], colour: 5, copies: 1 },
  { key: "l4_a", rows: ["#.", "#.", "##"], colour: 6, copies: 1 },
  { key: "l4_b", rows: [".#", ".#", "##"], colour: 6, copies: 1 },
  { key: "l4_c", rows: ["##", "#.", "#."], colour: 6, copies: 1 },
  { key: "l4_d", rows: ["##", ".#", ".#"], colour: 6, copies: 1 },
  { key: "l4_e", rows: ["###", "#.."], colour: 6, copies: 1 },
  { key: "l4_f", rows: ["###", "..#"], colour: 6, copies: 1 },
  { key: "l4_g", rows: ["#..", "###"], colour: 6, copies: 1 },
  { key: "l4_h", rows: ["..#", "###"], colour: 6, copies: 1 },
  { key: "s_h", rows: [".##", "##."], colour: 7, copies: 1 },
  { key: "z_h", rows: ["##.", ".##"], colour: 7, copies: 1 },
  { key: "s_v", rows: ["#.", "##", ".#"], colour: 7, copies: 1 },
  { key: "z_v", rows: [".#", "##", "#."], colour: 7, copies: 1 },
  { key: "l5_a", rows: ["###", "#..", "#.."], colour: 8, copies: 1 },
  { key: "l5_b", rows: ["###", "..#", "..#"], colour: 8, copies: 1 },
  { key: "l5_c", rows: ["#..", "#..", "###"], colour: 8, copies: 1 },
  { key: "l5_d", rows: ["..#", "..#", "###"], colour: 8, copies: 1 },
  { key: "o3", rows: ["###", "###", "###"], colour: 4, copies: 1 },
];

function buildShape(
  def: ShapeDef
): Shape {
  const cells: [number, number][] = [];

  def.rows.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      if (line[col] === "#") {
        cells.push([row, col]);
      }
    }
  });

  return {
    key: def.key,
    cells,
    w: Math.max(...def.rows.map((line) => line.length)),
    h: def.rows.length,
    colour: def.colour,
  };
}

export const SHAPES: Shape[] =
  SHAPE_DEFS.map(buildShape);

/** One bag: every shape index `copies` times (fixed order before shuffling). */
const BAG_TEMPLATE: number[] =
  SHAPE_DEFS.flatMap(
    (def, index) => Array.from({ length: def.copies }, () => index)
  );

export type PlaceEvent = {
  slot: number;
  shape: number;
  row: number;
  col: number;
  /** Board cells the piece now covers ([row, col]). */
  cells: [number, number][];
  rows: number[];
  cols: number[];
  lines: number;
  placePoints: number;
  bonus: number;
  allClear: boolean;
  gained: number;
  streak: number;
  /** A fresh hand of 3 was dealt after this placement. */
  dealt: boolean;
};

export type TombState = {
  seed: string;
  rng: Prng;
  bag: number[];
  /** Row-major GRID*GRID; 0 = empty, else the colour (1..COLOURS). */
  board: number[];
  /** Shape index per slot; null = already placed. */
  hand: (number | null)[];
  hands: number;
  score: number;
  moves: number;
  linesCleared: number;
  streak: number;
  bestStreak: number;
  sinceClear: number;
  /** Counted run length (see header). */
  ticks: number;
  over: boolean;
  /** Ended because the run reached MAX_TICKS. */
  sealed: boolean;
  /** At game over: the slots that could not be placed anywhere. */
  stuck: number[];
};

function refillBag(
  state: TombState
) {
  const bag = [...BAG_TEMPLATE];

  // Fisher-Yates with the seeded PRNG: the draw order depends only
  // on the seed, never on the board or the player.
  for (let i = bag.length - 1; i > 0; i--) {
    const j = state.rng.int(0, i);
    const swap = bag[i];
    bag[i] = bag[j];
    bag[j] = swap;
  }

  // Drawn from the end (pop), so reverse to keep "first shuffled
  // = first dealt" readable when debugging.
  state.bag = bag.reverse();
}

function drawPiece(
  state: TombState
) {
  if (state.bag.length === 0) {
    refillBag(state);
  }

  return state.bag.pop() as number;
}

function dealHand(
  state: TombState
) {
  state.hand = [];

  for (let i = 0; i < HAND_SIZE; i++) {
    state.hand.push(drawPiece(state));
  }

  state.hands += 1;
}

export function createTomb(
  seed: string
): TombState {
  const state: TombState = {
    seed,
    rng: createPrng(seed),
    bag: [],
    board: new Array(GRID * GRID).fill(0),
    hand: [],
    hands: 0,
    score: 0,
    moves: 0,
    linesCleared: 0,
    streak: 0,
    bestStreak: 0,
    sinceClear: 0,
    ticks: 0,
    over: false,
    sealed: false,
    stuck: [],
  };

  dealHand(state);

  return state;
}

/** True when `shape` can sit with its top-left corner at (row, col). */
export function canPlace(
  board: number[],
  shape: number,
  row: number,
  col: number
) {
  const piece = SHAPES[shape];

  if (
    !piece ||
    !Number.isInteger(row) ||
    !Number.isInteger(col) ||
    row < 0 ||
    col < 0 ||
    row + piece.h > GRID ||
    col + piece.w > GRID
  ) {
    return false;
  }

  for (const [r, c] of piece.cells) {
    if (board[(row + r) * GRID + col + c] !== 0) {
      return false;
    }
  }

  return true;
}

export function fitsAnywhere(
  board: number[],
  shape: number
) {
  const piece = SHAPES[shape];

  for (let row = 0; row + piece.h <= GRID; row++) {
    for (let col = 0; col + piece.w <= GRID; col++) {
      if (canPlace(board, shape, row, col)) {
        return true;
      }
    }
  }

  return false;
}

/** Rows and columns that would be full after placing the shape there. */
export function linesAfter(
  board: number[],
  shape: number,
  row: number,
  col: number
) {
  const next = [...board];

  for (const [r, c] of SHAPES[shape].cells) {
    next[(row + r) * GRID + col + c] = 1;
  }

  return fullLines(next);
}

export function fullLines(
  board: number[]
) {
  const rows: number[] = [];
  const cols: number[] = [];

  for (let r = 0; r < GRID; r++) {
    let full = true;

    for (let c = 0; c < GRID; c++) {
      if (board[r * GRID + c] === 0) {
        full = false;
        break;
      }
    }

    if (full) rows.push(r);
  }

  for (let c = 0; c < GRID; c++) {
    let full = true;

    for (let r = 0; r < GRID; r++) {
      if (board[r * GRID + c] === 0) {
        full = false;
        break;
      }
    }

    if (full) cols.push(c);
  }

  return {
    rows,
    cols,
  };
}

/** Clear bonus for `lines` cleared at once on streak `streak` (>= 1). */
export function clearBonus(
  lines: number,
  streak: number
) {
  if (lines <= 0) return 0;

  const capped =
    Math.min(MAX_STREAK, Math.max(1, streak));

  // 10 * triangle(lines) is a multiple of 10, so this is an integer.
  return (10 * lines * (lines + 1) / 2) * (capped + 1) / 2;
}

function updateGameOver(
  state: TombState
) {
  const remaining: number[] = [];

  state.hand.forEach((shape, slot) => {
    if (shape !== null) remaining.push(slot);
  });

  const stuck =
    remaining.filter(
      (slot) => !fitsAnywhere(state.board, state.hand[slot] as number)
    );

  if (
    remaining.length > 0 &&
    stuck.length === remaining.length
  ) {
    state.over = true;
    state.stuck = stuck;
  }
}

export type PlaceResult =
  | {
      ok: true;
      event: PlaceEvent;
    }
  | {
      ok: false;
      reason: string;
    };

/**
 * Places the piece in `slot` with its top-left corner at (row, col).
 * `dt` = real ticks since the previous placement (>= MIN_MOVE_TICKS).
 * Does nothing (ok: false) when the move is not allowed.
 */
export function placePiece(
  state: TombState,
  slot: number,
  row: number,
  col: number,
  dt: number
): PlaceResult {
  if (state.over) {
    return {
      ok: false,
      reason: "The game is already over.",
    };
  }

  if (
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= HAND_SIZE ||
    state.hand[slot] === null ||
    state.hand[slot] === undefined
  ) {
    return {
      ok: false,
      reason: "That piece is not in your hand.",
    };
  }

  if (
    !Number.isInteger(dt) ||
    dt < MIN_MOVE_TICKS ||
    dt > MAX_REPORTED_DT
  ) {
    return {
      ok: false,
      reason: "Placed too fast.",
    };
  }

  const shape =
    state.hand[slot] as number;

  if (!canPlace(state.board, shape, row, col)) {
    return {
      ok: false,
      reason: "That piece does not fit there.",
    };
  }

  const piece = SHAPES[shape];

  const cells: [number, number][] =
    piece.cells.map(
      ([r, c]) => [row + r, col + c]
    );

  for (const [r, c] of cells) {
    state.board[r * GRID + c] = piece.colour;
  }

  const {
    rows,
    cols,
  } = fullLines(state.board);

  const lines =
    rows.length + cols.length;

  for (const r of rows) {
    for (let c = 0; c < GRID; c++) {
      state.board[r * GRID + c] = 0;
    }
  }

  for (const c of cols) {
    for (let r = 0; r < GRID; r++) {
      state.board[r * GRID + c] = 0;
    }
  }

  let bonus = 0;
  let allClear = false;

  if (lines > 0) {
    state.streak += 1;
    state.sinceClear = 0;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.linesCleared += lines;

    bonus = clearBonus(lines, state.streak);

    allClear = state.board.every((cell) => cell === 0);

    if (allClear) bonus += ALL_CLEAR_BONUS;
  } else {
    state.sinceClear += 1;

    if (state.sinceClear >= STREAK_GRACE) {
      state.streak = 0;
    }
  }

  const placePoints =
    piece.cells.length;

  const gained =
    placePoints + bonus;

  state.score += gained;
  state.moves += 1;
  state.ticks = Math.min(
    MAX_TICKS,
    state.ticks + Math.min(dt, MOVE_TICK_CAP)
  );

  state.hand[slot] = null;

  const dealt =
    state.hand.every((entry) => entry === null);

  if (dealt) {
    dealHand(state);
  }

  updateGameOver(state);

  if (
    !state.over &&
    state.ticks >= MAX_TICKS
  ) {
    state.over = true;
    state.sealed = true;
  }

  return {
    ok: true,
    event: {
      slot,
      shape,
      row,
      col,
      cells,
      rows,
      cols,
      lines,
      placePoints,
      bonus,
      allClear,
      gained,
      streak: lines > 0
        ? state.streak
        : 0,
      dealt,
    },
  };
}

export function tombScore(
  state: TombState
) {
  return state.score;
}

/** Run length to report: counted ticks, at least 1. */
export function runTicks(
  state: TombState
) {
  return Math.max(1, state.ticks);
}

// ---------------------------------------------------------
// Input recording + replay (anti-cheat)
// ---------------------------------------------------------

export type RunEnd =
  | "over"
  | "quit";

/**
 * A recorded run. `m` = one number per placement:
 * slot * 64 + row * 8 + col. `t` = its dt (real ticks since the
 * previous placement). `ticks` = runTicks() at the end.
 */
export type TombInputs = {
  v: typeof ENGINE_VERSION;
  m: number[];
  t: number[];
  end: RunEnd;
  ticks: number;
};

export function encodeMove(
  slot: number,
  row: number,
  col: number
) {
  return slot * GRID * GRID + row * GRID + col;
}

export function decodeMove(
  move: number
) {
  return {
    slot: Math.floor(move / (GRID * GRID)),
    row: Math.floor((move % (GRID * GRID)) / GRID),
    col: move % GRID,
  };
}

export type ReplayResult =
  | {
      ok: true;
      state: TombState;
    }
  | {
      ok: false;
      reason: string;
      state: TombState;
    };

/** Re-plays moves from the seed; stops at the first bad one. */
export function replayMoves(
  seed: string,
  moves: unknown,
  times: unknown
): ReplayResult {
  const state =
    createTomb(seed);

  if (
    !Array.isArray(moves) ||
    !Array.isArray(times) ||
    moves.length !== times.length ||
    moves.length > MAX_MOVES
  ) {
    return {
      ok: false,
      reason: "Malformed inputs.",
      state,
    };
  }

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const dt = times[i];

    if (
      !Number.isInteger(move) ||
      move < 0 ||
      move >= HAND_SIZE * GRID * GRID ||
      !Number.isInteger(dt)
    ) {
      return {
        ok: false,
        reason: "Malformed inputs.",
        state,
      };
    }

    if (state.over) {
      return {
        ok: false,
        reason: "Moves after the game ended.",
        state,
      };
    }

    const {
      slot,
      row,
      col,
    } = decodeMove(move as number);

    const result =
      placePiece(state, slot, row, col, dt as number);

    if (!result.ok) {
      return {
        ok: false,
        reason: `Illegal move ${i + 1}: ${result.reason}`,
        state,
      };
    }
  }

  return {
    ok: true,
    state,
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
export function validateTombRun(
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
    inputs as Partial<TombInputs>;

  if (run.v !== ENGINE_VERSION) {
    return {
      ok: false,
      reason: "Game version changed. Reload the page.",
    };
  }

  if (
    run.end !== "over" &&
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

  const replay =
    replayMoves(
      seed,
      run.m,
      run.t
    );

  const replayScore =
    tombScore(replay.state);

  if (!replay.ok) {
    return {
      ok: false,
      reason: replay.reason,
      replayScore,
    };
  }

  const state =
    replay.state;

  if (
    (run.end === "over") !== state.over ||
    runTicks(state) !== ticks
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
