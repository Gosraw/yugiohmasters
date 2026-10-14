import {
  createPrng,
} from "./prng";

// =========================================================
// MERGE OF RA - shared, pure simulation (no DOM).
//
// A 2048-style game on a 4x4 board of Millennium tiles. One move
// slides every tile as far as it goes in one direction; two equal
// tiles that meet merge into the next tile of the ladder (Ankh 2 ->
// Scarab 4 -> ... -> Ra 2048 -> ...). A tile merges at most once per
// move. After every move that changed the board a new tile appears
// on a random empty cell (90% Ankh 2, 10% Scarab 4). The run is over
// when no move can change the board.
//
// Score: the value of every tile created by a merge (classic 2048),
// plus a COMBO bonus when one move makes 2+ merges:
//   bonus = floor(movePoints * (merges - 1) / 10)
// (2 merges +10%, 3 merges +20%, ... 8 merges +70%).
//
// Rewind (undo): the FIRST time a run reaches a Millennium Rod (512)
// it earns ONE rewind, which takes back the last move (board, score
// and the tile that spawned). Same rule for everyone, at most once
// per run, so the leaderboard stays fair.
//
// The exact same code runs in the browser (live play) and in the
// server action (replay to validate a submitted run):
//   * only integer math;
//   * randomness only from the seeded PRNG, one fresh generator per
//     spawn (seed + '#' + spawn number), so a rewind replays the
//     same spawn draws and nothing depends on WHEN the player moved.
//
// Board: 16 cells, row-major (cell = row * 4 + col), each holding
// an EXPONENT: 0 = empty, 1 = 2 (Ankh), 2 = 4 (Scarab), ...
// =========================================================

/** Database game key (mini_game_catalog / game_runs.game). */
export const MERGE_GAME = "merge_ra";

export const ENGINE_VERSION = 1;

export const SIZE = 4;

export const CELLS = SIZE * SIZE;

/**
 * A turn-based game has no real clock: every input counts as
 * TICKS_PER_MOVE ticks (1/60 s each), i.e. at most 15 moves per
 * second. ticks = TICKS_PER_MOVE * (inputs + 1). submit_game_run()
 * refuses a run whose ticks are ahead of real time, so this also
 * caps the move rate the database accepts (~16 per second on
 * average), and the catalog score bound is per tick (see
 * supabase/migrations/202610142040_merge_ra.sql).
 */
export const TICKS_PER_MOVE = 4;

/** 30 minutes of ticks: the same cap submit_game_run() enforces. */
export const MAX_TICKS = 108000;

/** At most this many inputs, so ticks never pass MAX_TICKS. */
export const MAX_INPUTS =
  MAX_TICKS / TICKS_PER_MOVE - 1;

/** Reaching this exponent (512, Millennium Rod) earns the rewind. */
export const UNDO_TIER = 9;

/** Chance that a spawned tile is a Scarab (4) instead of an Ankh (2). */
export const HIGH_SPAWN_CHANCE = 0.1;

/** Catalog bound (keep in sync with the migration). */
export const MAX_SCORE_PER_TICK = 28;

export const MAX_SCORE_FLAT = 200;

export type Dir =
  | "L"
  | "R"
  | "U"
  | "D";

/** A direction, or "Z" = use the rewind. */
export type MergeInput =
  | Dir
  | "Z";

export const DIRS: Dir[] = [
  "L",
  "R",
  "U",
  "D",
];

type Snapshot = {
  board: number[];
  score: number;
  spawns: number;
  moves: number;
  merges: number;
  maxExp: number;
  bestCombo: number;
};

export type MergeState = {
  seed: string;
  board: number[];
  score: number;
  /** Tiles spawned so far (also the PRNG index of the next spawn). */
  spawns: number;
  /** Direction moves in the current timeline (a rewind takes one back). */
  moves: number;
  /** Every accepted input, rewinds included (= recorded log length). */
  inputs: number;
  merges: number;
  /** Highest exponent on the board in the current timeline. */
  maxExp: number;
  /** Most merges in a single move. */
  bestCombo: number;
  undoEarned: boolean;
  undoCharges: number;
  /** The state before the last direction move (for the rewind). */
  prev: Snapshot | null;
};

export type Slide = {
  from: number;
  to: number;
  exp: number;
  /** This tile disappears into a merge at `to`. */
  merged: boolean;
};

export type MoveResult =
  | {
      kind: "move";
      dir: Dir;
      slides: Slide[];
      /** New tiles made by merges: cell + new exponent. */
      merges: {
        cell: number;
        exp: number;
      }[];
      points: number;
      bonus: number;
      spawn: {
        cell: number;
        exp: number;
      } | null;
      /** Exponents this run reached for the first time on this move. */
      newTiers: number[];
      earnedUndo: boolean;
    }
  | {
      kind: "undo";
    };

// ---------------------------------------------------------
// Board helpers
// ---------------------------------------------------------

/** Cells of each line, front first (the side tiles slide towards). */
function linesFor(
  dir: Dir
): number[][] {
  const lines: number[][] = [];

  for (let i = 0; i < SIZE; i++) {
    const line: number[] = [];

    for (let j = 0; j < SIZE; j++) {
      switch (dir) {
        case "L":
          line.push(i * SIZE + j);
          break;
        case "R":
          line.push(i * SIZE + (SIZE - 1 - j));
          break;
        case "U":
          line.push(j * SIZE + i);
          break;
        case "D":
          line.push((SIZE - 1 - j) * SIZE + i);
          break;
      }
    }

    lines.push(line);
  }

  return lines;
}

const LINES: Record<Dir, number[][]> = {
  L: linesFor("L"),
  R: linesFor("R"),
  U: linesFor("U"),
  D: linesFor("D"),
};

export function tileValue(
  exp: number
) {
  return exp <= 0
    ? 0
    : 2 ** exp;
}

function boardMax(
  board: number[]
) {
  let max = 0;

  for (const exp of board) {
    if (exp > max) max = exp;
  }

  return max;
}

/**
 * Slides one board in one direction (no spawn). Pure: returns the
 * new board and what moved; `moved` is false when nothing changed.
 */
export function slideBoard(
  board: number[],
  dir: Dir
) {
  const next =
    new Array<number>(CELLS).fill(0);

  const slides: Slide[] = [];

  const merges: {
    cell: number;
    exp: number;
  }[] = [];

  let points = 0;
  let moved = false;

  for (const line of LINES[dir]) {
    let write = 0;
    // Slide index of the tile at line[write - 1] if it can still merge.
    let open = -1;

    for (const cell of line) {
      const exp = board[cell];

      if (exp === 0) continue;

      if (
        open >= 0 &&
        slides[open].exp === exp
      ) {
        const target =
          line[write - 1];

        slides[open].merged = true;

        slides.push({
          from: cell,
          to: target,
          exp,
          merged: true,
        });

        next[target] = exp + 1;

        merges.push({
          cell: target,
          exp: exp + 1,
        });

        points += tileValue(exp + 1);
        moved = true;
        open = -1;
        continue;
      }

      const target =
        line[write];

      if (target !== cell) moved = true;

      next[target] = exp;

      slides.push({
        from: cell,
        to: target,
        exp,
        merged: false,
      });

      open = slides.length - 1;
      write += 1;
    }
  }

  return {
    board: next,
    slides,
    merges,
    points,
    moved,
  };
}

export function canMoveDir(
  board: number[],
  dir: Dir
) {
  return slideBoard(board, dir).moved;
}

export function hasAnyMove(
  board: number[]
) {
  for (let cell = 0; cell < CELLS; cell++) {
    const exp = board[cell];

    if (exp === 0) return true;

    const col = cell % SIZE;

    if (
      col < SIZE - 1 &&
      board[cell + 1] === exp
    ) {
      return true;
    }

    if (
      cell + SIZE < CELLS &&
      board[cell + SIZE] === exp
    ) {
      return true;
    }
  }

  return false;
}

export function comboBonus(
  points: number,
  mergeCount: number
) {
  return mergeCount >= 2
    ? Math.floor((points * (mergeCount - 1)) / 10)
    : 0;
}

// ---------------------------------------------------------
// Spawns
// ---------------------------------------------------------

/** Spawn number `index` for this seed on this board (null = full). */
export function spawnTile(
  seed: string,
  index: number,
  board: number[]
) {
  const empty: number[] = [];

  for (let cell = 0; cell < CELLS; cell++) {
    if (board[cell] === 0) empty.push(cell);
  }

  if (empty.length === 0) return null;

  // Fixed draw order: cell, then value.
  const rng =
    createPrng(`${seed}#${index}`);

  const cell =
    empty[Math.floor(rng.next() * empty.length)];

  const exp =
    rng.next() < HIGH_SPAWN_CHANCE
      ? 2
      : 1;

  return {
    cell,
    exp,
  };
}

function addSpawn(
  state: MergeState
) {
  const spawn =
    spawnTile(
      state.seed,
      state.spawns,
      state.board
    );

  state.spawns += 1;

  if (spawn) {
    state.board[spawn.cell] = spawn.exp;
    state.maxExp = Math.max(state.maxExp, spawn.exp);
  }

  return spawn;
}

// ---------------------------------------------------------
// State
// ---------------------------------------------------------

export function createMerge(
  seed: string
): MergeState {
  const state: MergeState = {
    seed,
    board: new Array<number>(CELLS).fill(0),
    score: 0,
    spawns: 0,
    moves: 0,
    inputs: 0,
    merges: 0,
    maxExp: 0,
    bestCombo: 0,
    undoEarned: false,
    undoCharges: 0,
    prev: null,
  };

  addSpawn(state);
  addSpawn(state);

  return state;
}

export function canUndo(
  state: MergeState
) {
  return (
    state.undoCharges > 0 &&
    state.prev !== null
  );
}

/** No direction changes the board and no rewind is left. */
export function isOver(
  state: MergeState
) {
  return (
    !hasAnyMove(state.board) &&
    !canUndo(state)
  );
}

/** Stuck: no direction works, but the rewind could still save the run. */
export function isStuck(
  state: MergeState
) {
  return !hasAnyMove(state.board);
}

/**
 * Applies one input. Returns null (and changes nothing) when the
 * input is not allowed: a direction that moves nothing, a rewind
 * that isn't available, or any input once the run is over.
 */
export function applyInput(
  state: MergeState,
  input: MergeInput
): MoveResult | null {
  if (
    isOver(state) ||
    state.inputs >= MAX_INPUTS
  ) {
    return null;
  }

  if (input === "Z") {
    if (!canUndo(state)) return null;

    const snap =
      state.prev as Snapshot;

    state.board = [...snap.board];
    state.score = snap.score;
    state.spawns = snap.spawns;
    state.moves = snap.moves;
    state.merges = snap.merges;
    state.maxExp = snap.maxExp;
    state.bestCombo = snap.bestCombo;
    state.undoCharges = 0;
    state.prev = null;
    state.inputs += 1;

    return {
      kind: "undo",
    };
  }

  if (!DIRS.includes(input)) return null;

  const slid =
    slideBoard(
      state.board,
      input
    );

  if (!slid.moved) return null;

  const snapshot: Snapshot = {
    board: [...state.board],
    score: state.score,
    spawns: state.spawns,
    moves: state.moves,
    merges: state.merges,
    maxExp: state.maxExp,
    bestCombo: state.bestCombo,
  };

  const previousMax =
    state.maxExp;

  const bonus =
    comboBonus(
      slid.points,
      slid.merges.length
    );

  state.board = slid.board;
  state.score += slid.points + bonus;
  state.merges += slid.merges.length;
  state.bestCombo = Math.max(state.bestCombo, slid.merges.length);
  state.moves += 1;
  state.inputs += 1;
  state.maxExp = Math.max(state.maxExp, boardMax(slid.board));
  state.prev = snapshot;

  const newTiers: number[] = [];

  for (let exp = previousMax + 1; exp <= state.maxExp; exp++) {
    newTiers.push(exp);
  }

  let earnedUndo = false;

  if (
    !state.undoEarned &&
    state.maxExp >= UNDO_TIER
  ) {
    state.undoEarned = true;
    state.undoCharges = 1;
    earnedUndo = true;
  }

  const spawn =
    addSpawn(state);

  return {
    kind: "move",
    dir: input,
    slides: slid.slides,
    merges: slid.merges,
    points: slid.points,
    bonus,
    spawn,
    newTiers,
    earnedUndo,
  };
}

export function mergeTicks(
  inputCount: number
) {
  return TICKS_PER_MOVE * (inputCount + 1);
}

/** The catalog's max score for a run of this many ticks. */
export function maxScoreForTicks(
  ticks: number
) {
  return Math.ceil(ticks * MAX_SCORE_PER_TICK) + MAX_SCORE_FLAT;
}

// ---------------------------------------------------------
// Input recording + replay (anti-cheat)
// ---------------------------------------------------------

export type RunEnd =
  | "over"
  | "quit";

/**
 * A recorded run. `m` is every accepted input in order, one
 * character each (L R U D, Z = rewind): its index is the move
 * number. ticks = TICKS_PER_MOVE * (m.length + 1).
 */
export type MergeInputs = {
  v: typeof ENGINE_VERSION;
  m: string;
  end: RunEnd;
  ticks: number;
};

export function finishInputs(
  log: string,
  end: RunEnd
): MergeInputs {
  return {
    v: ENGINE_VERSION,
    m: log,
    end,
    ticks: mergeTicks(log.length),
  };
}

/**
 * Replays an input log from the seed. Stops at the first input that
 * is not allowed (`failedAt` = its index, -1 when all were fine).
 */
export function replayMerge(
  seed: string,
  log: string
) {
  const state =
    createMerge(seed);

  for (let i = 0; i < log.length; i++) {
    if (isOver(state)) {
      return {
        state,
        failedAt: i,
        afterOver: true,
      };
    }

    const result =
      applyInput(
        state,
        log[i] as MergeInput
      );

    if (!result) {
      return {
        state,
        failedAt: i,
        afterOver: false,
      };
    }
  }

  return {
    state,
    failedAt: -1,
    afterOver: false,
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
export function validateMergeRun(
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
    inputs as Partial<MergeInputs>;

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

  if (
    typeof run.m !== "string" ||
    run.m.length > MAX_INPUTS ||
    !/^[LRUDZ]*$/.test(run.m)
  ) {
    return {
      ok: false,
      reason: "Malformed inputs.",
    };
  }

  if (run.ticks !== mergeTicks(run.m.length)) {
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
    replayMerge(
      seed,
      run.m
    );

  const replayScore =
    replay.state.score;

  if (replay.failedAt >= 0) {
    return {
      ok: false,
      reason: replay.afterOver
        ? "Moves after the game ended."
        : `Invalid move #${replay.failedAt + 1}.`,
      replayScore,
    };
  }

  const over =
    isOver(replay.state);

  if (
    (run.end === "over") !== over
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
    ticks: run.ticks,
  };
}
