import { describe, expect, it } from "vitest";

import {
  ALL_CLEAR_BONUS,
  ENGINE_VERSION,
  GRID,
  MAX_POINTS_PER_MOVE,
  MAX_TICKS,
  MIN_MOVE_TICKS,
  MOVE_TICK_CAP,
  SHAPES,
  canPlace,
  clearBonus,
  createTomb,
  decodeMove,
  encodeMove,
  fitsAnywhere,
  linesAfter,
  placePiece,
  replayMoves,
  runTicks,
  tombScore,
  validateTombRun,
  type TombInputs,
  type TombState,
} from "./tomb-engine";

import { createPrng } from "./prng";

/** The same bound the database applies (migration 202610142050). */
const PER_TICK = 125;
const FLAT = 100;
const dbMax = (ticks: number) => Math.ceil(ticks * PER_TICK) + FLAT;

type Move = { slot: number; row: number; col: number };

function legalMoves(state: TombState): Move[] {
  const out: Move[] = [];
  state.hand.forEach((shape, slot) => {
    if (shape === null) return;
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        if (canPlace(state.board, shape, row, col)) out.push({ slot, row, col });
      }
    }
  });
  return out;
}

/** Greedy bot: most lines, then most filled neighbours; seeded tie-break. */
function playBot(seed: string, botSeed: string, maxMoves = 400, dtOf = () => 30) {
  const state = createTomb(seed);
  const rng = createPrng(botSeed);
  const m: number[] = [];
  const t: number[] = [];
  while (!state.over && m.length < maxMoves) {
    const moves = legalMoves(state);
    let best: Move | null = null;
    let bestScore = -Infinity;
    for (const move of moves) {
      const shape = state.hand[move.slot] as number;
      const { rows, cols } = linesAfter(state.board, shape, move.row, move.col);
      let touch = 0;
      for (const [r, c] of SHAPES[shape].cells) {
        const rr = move.row + r;
        const cc = move.col + c;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = rr + dr;
          const nc = cc + dc;
          if (nr < 0 || nc < 0 || nr >= GRID || nc >= GRID || state.board[nr * GRID + nc] !== 0) touch += 1;
        }
      }
      const value = (rows.length + cols.length) * 100 + touch + rng.next();
      if (value > bestScore) {
        bestScore = value;
        best = move;
      }
    }
    if (!best) throw new Error("no legal move but not over");
    const dt = dtOf();
    const result = placePiece(state, best.slot, best.row, best.col, dt);
    if (!result.ok) throw new Error(result.reason);
    m.push(encodeMove(best.slot, best.row, best.col));
    t.push(dt);
  }
  const inputs: TombInputs = {
    v: ENGINE_VERSION,
    m,
    t,
    end: state.over ? "over" : "quit",
    ticks: runTicks(state),
  };
  return { state, inputs, score: tombScore(state) };
}

/** Fill the board directly (test helper) with colour 1 at the given cells. */
function fill(state: TombState, cells: [number, number][]) {
  for (const [r, c] of cells) state.board[r * GRID + c] = 1;
}

function shapeIndex(key: string) {
  const index = SHAPES.findIndex((shape) => shape.key === key);
  if (index < 0) throw new Error(key);
  return index;
}

describe("tomb engine basics", () => {
  it("deals the same pieces for the same seed and different ones for another", () => {
    const bag = (seed: string) => {
      const state = createTomb(seed);
      return [...state.hand, ...state.bag];
    };
    expect(bag("daily:2026-10-14:a")).toEqual(bag("daily:2026-10-14:a"));
    expect(bag("daily:2026-10-14:a")).not.toEqual(bag("daily:2026-10-14:b"));
  });

  it("the piece sequence depends only on the seed, not on how you play", () => {
    const dealt = (botSeed: string) => {
      const state = createTomb("same-seed");
      const rng = createPrng(botSeed);
      const seen: number[] = [...(state.hand as number[])];
      for (let i = 0; i < 45 && !state.over; i++) {
        const moves = legalMoves(state);
        const pick = moves[rng.int(0, moves.length - 1)];
        const result = placePiece(state, pick.slot, pick.row, pick.col, 20);
        if (result.ok && result.event.dealt) seen.push(...(state.hand as number[]));
      }
      return seen;
    };
    const a = dealt("player-1");
    const b = dealt("player-2");
    const n = Math.min(a.length, b.length);
    expect(n).toBeGreaterThanOrEqual(6);
    expect(a.slice(0, n)).toEqual(b.slice(0, n));
  });

  it("every bag contains every shape", () => {
    const state = createTomb("bag");
    const seen = new Set<number>();
    for (let i = 0; i < 16; i++) {
      state.hand.forEach((shape) => seen.add(shape as number));
      state.hand = [null, null, null];
      // deal three more by hand (same order as the engine)
      for (let s = 0; s < 3; s++) state.hand[s] = state.bag.length ? (state.bag.pop() as number) : null;
    }
    expect(seen.size).toBe(SHAPES.length);
  });

  it("shapes are normalised and fit the grid", () => {
    for (const shape of SHAPES) {
      expect(Math.min(...shape.cells.map(([r]) => r))).toBe(0);
      expect(Math.min(...shape.cells.map(([, c]) => c))).toBe(0);
      expect(shape.w).toBeLessThanOrEqual(5);
      expect(shape.h).toBeLessThanOrEqual(5);
      expect(shape.cells.length).toBeGreaterThanOrEqual(1);
      expect(shape.cells.length).toBeLessThanOrEqual(9);
    }
  });

  it("encodes and decodes moves", () => {
    for (const [slot, row, col] of [[0, 0, 0], [2, 7, 7], [1, 3, 5]]) {
      expect(decodeMove(encodeMove(slot, row, col))).toEqual({ slot, row, col });
    }
  });

  it("places a piece, scores its cells and removes it from the hand", () => {
    const state = createTomb("place");
    const shape = state.hand[0] as number;
    const result = placePiece(state, 0, 0, 0, 30);
    expect(result.ok).toBe(true);
    expect(state.hand[0]).toBeNull();
    expect(state.score).toBe(SHAPES[shape].cells.length);
    expect(state.board.filter((cell) => cell !== 0).length).toBe(SHAPES[shape].cells.length);
    // The same slot can't be used twice.
    expect(placePiece(state, 0, 5, 5, 30).ok).toBe(false);
  });

  it("refuses overlaps, out-of-bounds and too-fast placements", () => {
    const state = createTomb("refuse");
    const shape = state.hand[0] as number;
    const piece = SHAPES[shape];
    expect(placePiece(state, 0, GRID - piece.h + 1, 0, 30).ok).toBe(false);
    expect(placePiece(state, 0, -1, 0, 30).ok).toBe(false);
    expect(placePiece(state, 0, 0, 0, MIN_MOVE_TICKS - 1).ok).toBe(false);
    expect(placePiece(state, 0, 0, 0, MIN_MOVE_TICKS).ok).toBe(true);
    const other = state.hand[1] as number;
    // On top of the first piece: overlap.
    const [r, c] = piece.cells[0];
    const [r2, c2] = SHAPES[other].cells[0];
    expect(placePiece(state, 1, r - r2, c - c2, 30).ok).toBe(false);
  });

  it("clears full rows AND columns at the same time", () => {
    const state = createTomb("clear");
    // Row 0 and column 0 full except (0,0).
    const cells: [number, number][] = [];
    for (let i = 1; i < GRID; i++) cells.push([0, i], [i, 0]);
    fill(state, cells);
    state.hand[0] = shapeIndex("dot");
    const result = placePiece(state, 0, 0, 0, 30);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.rows).toEqual([0]);
    expect(result.event.cols).toEqual([0]);
    expect(result.event.lines).toBe(2);
    expect(state.board.every((cell) => cell === 0)).toBe(true);
    expect(result.event.allClear).toBe(true);
    expect(result.event.bonus).toBe(clearBonus(2, 1) + ALL_CLEAR_BONUS);
    expect(state.score).toBe(1 + 30 + ALL_CLEAR_BONUS);
  });

  it("clear bonus grows with lines at once and with the streak", () => {
    expect(clearBonus(1, 1)).toBe(10);
    expect(clearBonus(2, 1)).toBe(30);
    expect(clearBonus(3, 1)).toBe(60);
    expect(clearBonus(1, 2)).toBe(15);
    expect(clearBonus(1, 3)).toBe(20);
    expect(clearBonus(6, 10)).toBe(1155);
    expect(clearBonus(6, 99)).toBe(1155);
    for (let lines = 1; lines <= 6; lines++) {
      for (let streak = 1; streak <= 12; streak++) {
        expect(Number.isInteger(clearBonus(lines, streak))).toBe(true);
      }
    }
  });

  it("the streak survives two quiet placements and breaks on the third", () => {
    const state = createTomb("streak");
    const clearRow = (row: number) => {
      const cells: [number, number][] = [];
      for (let c = 1; c < GRID; c++) cells.push([row, c]);
      fill(state, cells);
      state.hand[0] = shapeIndex("dot");
      const result = placePiece(state, 0, row, 0, 30);
      if (!result.ok) throw new Error(result.reason);
      return result.event;
    };
    const quiet = (row: number, col: number) => {
      state.hand[1] = shapeIndex("dot");
      const result = placePiece(state, 1, row, col, 30);
      if (!result.ok) throw new Error(result.reason);
      expect(result.event.lines).toBe(0);
    };
    expect(clearRow(7).streak).toBe(1);
    quiet(0, 0);
    quiet(0, 2);
    expect(clearRow(7).streak).toBe(2);
    quiet(0, 4);
    quiet(0, 6);
    quiet(2, 0);
    expect(state.streak).toBe(0);
    expect(clearRow(7).streak).toBe(1);
    expect(state.bestStreak).toBe(2);
  });

  it("deals a new hand only when all three are placed", () => {
    const state = createTomb("deal");
    const before = state.hands;
    const moves = () => legalMoves(state);
    let result = placePiece(state, moves()[0].slot, moves()[0].row, moves()[0].col, 30);
    expect(result.ok && result.event.dealt).toBe(false);
    result = placePiece(state, moves()[0].slot, moves()[0].row, moves()[0].col, 30);
    expect(result.ok && result.event.dealt).toBe(false);
    result = placePiece(state, moves()[0].slot, moves()[0].row, moves()[0].col, 30);
    expect(result.ok && result.event.dealt).toBe(true);
    expect(state.hands).toBe(before + 1);
    expect(state.hand.every((shape) => shape !== null)).toBe(true);
  });

  it("ends the run when no piece left in the hand fits, and says which", () => {
    const state = createTomb("over");
    // Checkerboard-ish floor with only isolated holes: nothing bigger than a dot fits.
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if ((r + c) % 2 === 0 && !(r === 0 && c === 0)) state.board[r * GRID + c] = 1;
      }
    }
    state.hand = [shapeIndex("dot"), shapeIndex("o2"), shapeIndex("i3_h")];
    expect(fitsAnywhere(state.board, shapeIndex("o2"))).toBe(false);
    const result = placePiece(state, 0, 0, 1, 30);
    expect(result.ok).toBe(true);
    expect(state.over).toBe(true);
    expect(state.stuck).toEqual([1, 2]);
    expect(placePiece(state, 1, 0, 0, 30).ok).toBe(false);
  });

  it("only the first second of each gap counts toward the run length", () => {
    const state = createTomb("ticks");
    const move = legalMoves(state)[0];
    placePiece(state, move.slot, move.row, move.col, 5000);
    expect(state.ticks).toBe(MOVE_TICK_CAP);
    const next = legalMoves(state)[0];
    placePiece(state, next.slot, next.row, next.col, MIN_MOVE_TICKS);
    expect(state.ticks).toBe(MOVE_TICK_CAP + MIN_MOVE_TICKS);
  });

  it("seals the tomb (ends the run) at MAX_TICKS", () => {
    const state = createTomb("seal");
    state.ticks = MAX_TICKS - 10;
    const move = legalMoves(state)[0];
    placePiece(state, move.slot, move.row, move.col, 60);
    expect(state.ticks).toBe(MAX_TICKS);
    expect(state.over).toBe(true);
    expect(state.sealed).toBe(true);
  });

  it("a greedy bot eventually runs out of room", () => {
    const { state } = playBot("long-run", "greedy", 5000);
    expect(state.over).toBe(true);
    expect(state.moves).toBeGreaterThan(5);
    expect(state.stuck.length).toBeGreaterThan(0);
  });
});

describe("tomb replay validation", () => {
  it("validates an honest run and returns the replayed score", () => {
    const { inputs, score } = playBot("tomb-daily:2026-10-14:abc", "b1", 5000);
    expect(inputs.end).toBe("over");
    expect(validateTombRun("tomb-daily:2026-10-14:abc", inputs, score)).toEqual({ ok: true, score, ticks: inputs.ticks });
  });

  it("validates many seeds (record -> replay is exact) and stays under the DB bound", () => {
    for (let i = 0; i < 12; i++) {
      const seed = `tomb-practice:${i}`;
      const { inputs, score } = playBot(seed, `bot${i}`, 5000, () => MIN_MOVE_TICKS);
      const verdict = validateTombRun(seed, inputs, score);
      expect(verdict.ok).toBe(true);
      expect(score).toBeLessThanOrEqual(dbMax(inputs.ticks));
    }
  });

  it("validates a quit mid-run", () => {
    const { inputs, score, state } = playBot("quit-seed", "q", 9);
    expect(state.over).toBe(false);
    expect(inputs.end).toBe("quit");
    expect(validateTombRun("quit-seed", inputs, score).ok).toBe(true);
  });

  it("accepts a quit before any placement (score 0, length 1)", () => {
    const inputs: TombInputs = { v: ENGINE_VERSION, m: [], t: [], end: "quit", ticks: 1 };
    expect(validateTombRun("empty", inputs, 0)).toEqual({ ok: true, score: 0, ticks: 1 });
  });

  it("rejects an inflated score", () => {
    const { inputs, score } = playBot("inflate", "b", 30);
    const verdict = validateTombRun("inflate", inputs, score + 1);
    expect(verdict).toMatchObject({ ok: false, reason: "Score does not match the replay.", replayScore: score });
  });

  it("rejects a run replayed on another seed", () => {
    const { inputs, score } = playBot("seed-a", "b", 40);
    const verdict = validateTombRun("seed-b", inputs, score);
    expect(verdict.ok).toBe(false);
  });

  it("rejects an illegal placement (overlap / off the board / empty slot)", () => {
    const { inputs, score } = playBot("illegal", "b", 6);
    const overlap = { ...inputs, m: [...inputs.m] };
    // Move 2 on exactly the spot of move 1 with move 1's slot: slot already used or overlap.
    overlap.m[1] = overlap.m[0];
    expect(validateTombRun("illegal", overlap, score)).toMatchObject({ ok: false });
    const offBoard = { ...inputs, m: [...inputs.m] };
    const first = decodeMove(inputs.m[0]);
    const shape = createTomb("illegal").hand[first.slot] as number;
    offBoard.m[0] = encodeMove(first.slot, GRID - SHAPES[shape].h + 1 > 7 ? 7 : GRID - SHAPES[shape].h + 1, 7);
    if (SHAPES[shape].h > 1 || SHAPES[shape].w > 1) {
      expect(validateTombRun("illegal", offBoard, score)).toMatchObject({ ok: false });
    }
    expect(validateTombRun("illegal", { ...inputs, m: [...inputs.m, 3 * 64] , t: [...inputs.t, 30] }, score)).toMatchObject({ ok: false });
  });

  it("rejects moves after game over", () => {
    const { inputs, score, state } = playBot("after-over", "b", 5000);
    expect(state.over).toBe(true);
    // Any extra move after the end.
    const extra = { ...inputs, m: [...inputs.m, 0], t: [...inputs.t, 30] };
    expect(validateTombRun("after-over", extra, score)).toMatchObject({ ok: false, reason: "Moves after the game ended." });
  });

  it("rejects placements faster than 5 per second", () => {
    const { inputs, score } = playBot("fast", "b", 10);
    const fast = { ...inputs, t: inputs.t.map(() => MIN_MOVE_TICKS - 1) };
    expect(validateTombRun("fast", fast, score)).toMatchObject({ ok: false });
  });

  it("rejects the wrong ending or a fake length", () => {
    const over = playBot("ending", "b", 5000);
    expect(validateTombRun("ending", { ...over.inputs, end: "quit" }, over.score)).toMatchObject({ ok: false });
    const quit = playBot("ending2", "b", 8);
    expect(validateTombRun("ending2", { ...quit.inputs, end: "over" }, quit.score)).toMatchObject({ ok: false });
    expect(validateTombRun("ending2", { ...quit.inputs, ticks: quit.inputs.ticks + 1 }, quit.score)).toMatchObject({ ok: false });
    expect(validateTombRun("ending2", { ...quit.inputs, ticks: MAX_TICKS + 1 }, quit.score)).toMatchObject({ ok: false, reason: "Impossible run length." });
  });

  it("rejects malformed inputs", () => {
    const { inputs, score } = playBot("malformed", "b", 5);
    expect(validateTombRun("malformed", null, 0)).toMatchObject({ ok: false });
    expect(validateTombRun("malformed", { ...inputs, v: 99 }, score)).toMatchObject({ ok: false });
    expect(validateTombRun("malformed", { ...inputs, m: "nope" }, score)).toMatchObject({ ok: false });
    expect(validateTombRun("malformed", { ...inputs, t: inputs.t.slice(1) }, score)).toMatchObject({ ok: false, reason: "Malformed inputs." });
    expect(validateTombRun("malformed", { ...inputs, m: [...inputs.m.slice(0, -1), 1.5] }, score)).toMatchObject({ ok: false });
    expect(validateTombRun("malformed", { ...inputs, m: [...inputs.m.slice(0, -1), 999] }, score)).toMatchObject({ ok: false });
    expect(validateTombRun("malformed", inputs, -1)).toMatchObject({ ok: false });
    expect(validateTombRun("malformed", inputs, 1.5)).toMatchObject({ ok: false });
  });

  it("replayMoves resumes a saved run to the same state", () => {
    const { inputs, state } = playBot("resume", "b", 20);
    const replay = replayMoves("resume", inputs.m, inputs.t);
    expect(replay.ok).toBe(true);
    expect(replay.state.board).toEqual(state.board);
    expect(replay.state.hand).toEqual(state.hand);
    expect(replay.state.score).toBe(state.score);
    expect(replay.state.streak).toBe(state.streak);
  });

  it("no placement can beat the per-tick bound used by the database", () => {
    // The best single placement there is, after the smallest allowed gap.
    expect(MAX_POINTS_PER_MOVE).toBe(1464);
    expect(MAX_POINTS_PER_MOVE).toBeLessThanOrEqual(PER_TICK * MIN_MOVE_TICKS);
  });
});
