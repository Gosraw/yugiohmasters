import { describe, expect, it } from "vitest";

import {
  CELLS,
  DIRS,
  ENGINE_VERSION,
  MAX_INPUTS,
  MAX_SCORE_FLAT,
  MAX_SCORE_PER_TICK,
  MAX_TICKS,
  TICKS_PER_MOVE,
  UNDO_TIER,
  applyInput,
  canUndo,
  comboBonus,
  createMerge,
  finishInputs,
  hasAnyMove,
  isOver,
  maxScoreForTicks,
  mergeTicks,
  replayMerge,
  slideBoard,
  spawnTile,
  tileValue,
  validateMergeRun,
  type Dir,
  type MergeInput,
  type MergeState,
} from "./merge-engine";

import { createPrng } from "./prng";

/** Board from 4 rows of tile VALUES (0 = empty). */
function board(rows: number[][]) {
  return rows.flat().map((value) => (value === 0 ? 0 : Math.log2(value)));
}

function values(exps: number[]) {
  const out: number[][] = [];
  for (let r = 0; r < 4; r++) out.push(exps.slice(r * 4, r * 4 + 4).map(tileValue));
  return out;
}

function withBoard(seed: string, rows: number[][]): MergeState {
  const state = createMerge(seed);
  state.board = board(rows);
  state.maxExp = Math.max(...state.board);
  return state;
}

/** Heuristic for the greedy bot: empty cells, corner order, points. */
function evaluate(exps: number[]) {
  let empty = 0;
  let mono = 0;
  for (let cell = 0; cell < CELLS; cell++) {
    if (exps[cell] === 0) empty += 1;
    // Weight the bottom-left corner most (snake order).
    const row = Math.floor(cell / 4);
    const col = cell % 4;
    const weight = row * 4 + (row % 2 === 1 ? col : 3 - col);
    mono += exps[cell] * exps[cell] * weight;
  }
  return empty * 40 + mono;
}

type Bot = (state: MergeState, rng: ReturnType<typeof createPrng>) => Dir | null;

const greedyBot: Bot = (state) => {
  let best: Dir | null = null;
  let bestScore = -Infinity;
  for (const dir of ["D", "L", "R", "U"] as Dir[]) {
    const slid = slideBoard(state.board, dir);
    if (!slid.moved) continue;
    const score = evaluate(slid.board) + slid.points * 2 - (dir === "U" ? 5000 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = dir;
    }
  }
  return best;
};

const randomBot: Bot = (state, rng) => {
  const valid = DIRS.filter((dir) => slideBoard(state.board, dir).moved);
  return valid.length === 0 ? null : valid[rng.int(0, valid.length - 1)];
};

/** Plays until over; checks the score bound after EVERY input. */
function playBot(seed: string, bot: Bot, options: { useUndo?: boolean; limit?: number } = {}) {
  const state = createMerge(seed);
  const rng = createPrng(`bot:${seed}`);
  let log = "";
  let maxSeen = 0;
  while (!isOver(state) && log.length < (options.limit ?? MAX_INPUTS)) {
    let input: MergeInput | null = null;
    if (options.useUndo && canUndo(state) && !hasAnyMove(state.board)) input = "Z";
    else input = bot(state, rng);
    if (!input) break;
    const result = applyInput(state, input);
    expect(result).not.toBeNull();
    log += input;
    expect(state.score).toBeLessThanOrEqual(maxScoreForTicks(mergeTicks(log.length)));
    maxSeen = Math.max(maxSeen, state.maxExp);
  }
  return { state, log, maxSeen };
}

describe("merge engine: sliding and merging", () => {
  it("slides tiles to the wall and merges equal pairs once per move", () => {
    const state = withBoard("rules", [
      [2, 2, 2, 2],
      [2, 0, 2, 4],
      [4, 4, 8, 8],
      [0, 0, 0, 2],
    ]);
    const before = state.score;
    const result = applyInput(state, "L");
    expect(result?.kind).toBe("move");
    const after = values(state.board);
    // Spawned tile lands somewhere empty; compare the slid board.
    const slid = values(slideBoard(board([
      [2, 2, 2, 2],
      [2, 0, 2, 4],
      [4, 4, 8, 8],
      [0, 0, 0, 2],
    ]), "L").board);
    expect(slid).toEqual([
      [4, 4, 0, 0],
      [4, 4, 0, 0],
      [8, 16, 0, 0],
      [2, 0, 0, 0],
    ]);
    expect(after.flat().filter((v, i) => v !== slid.flat()[i]).length).toBe(1);
    // 4+4 + 4 + 8+16 = 36 points, 5 merges -> +40% combo bonus.
    expect(result?.kind === "move" && result.points).toBe(36);
    expect(result?.kind === "move" && result.bonus).toBe(comboBonus(36, 5));
    expect(comboBonus(36, 5)).toBe(14);
    expect(state.score - before).toBe(50);
  });

  it("never chain-merges a freshly merged tile in the same move", () => {
    expect(values(slideBoard(board([[4, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), "L").board)[0]).toEqual([4, 4, 0, 0]);
    expect(values(slideBoard(board([[2, 2, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), "L").board)[0]).toEqual([4, 4, 0, 0]);
    expect(values(slideBoard(board([[2, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), "R").board)[0]).toEqual([0, 0, 2, 4]);
  });

  it("handles all four directions", () => {
    const start = board([
      [2, 0, 0, 0],
      [2, 0, 0, 0],
      [0, 0, 0, 4],
      [0, 0, 0, 4],
    ]);
    expect(values(slideBoard(start, "U").board)).toEqual([
      [4, 0, 0, 8],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(values(slideBoard(start, "D").board)).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [4, 0, 0, 8],
    ]);
    expect(values(slideBoard(start, "R").board)).toEqual([
      [0, 0, 0, 2],
      [0, 0, 0, 2],
      [0, 0, 0, 4],
      [0, 0, 0, 4],
    ]);
  });

  it("rejects a move that changes nothing (no spawn, no input used)", () => {
    const state = withBoard("still", [
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(applyInput(state, "L")).toBeNull();
    expect(applyInput(state, "U")).toBeNull();
    expect(state.inputs).toBe(0);
    expect(applyInput(state, "R")).not.toBeNull();
  });

  it("detects game over", () => {
    const state = withBoard("over", [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    expect(hasAnyMove(state.board)).toBe(false);
    expect(isOver(state)).toBe(true);
    for (const dir of DIRS) expect(applyInput(state, dir)).toBeNull();
  });
});

describe("merge engine: seeded spawns", () => {
  it("is deterministic per seed and differs between seeds", () => {
    const a1 = playBot("merge-daily:2026-10-14:a", greedyBot, { limit: 200 });
    const a2 = playBot("merge-daily:2026-10-14:a", greedyBot, { limit: 200 });
    const b = playBot("merge-daily:2026-10-14:b", greedyBot, { limit: 200 });
    expect(a1.state.board).toEqual(a2.state.board);
    expect(a1.log).toEqual(a2.log);
    expect(a1.state.score).toBe(a2.state.score);
    expect(createMerge("x").board).toEqual(createMerge("x").board);
    expect(`${a1.log}|${a1.state.board}`).not.toEqual(`${b.log}|${b.state.board}`);
  });

  it("spawns two tiles at the start and ~90% Ankh (2) / ~10% Scarab (4)", () => {
    const start = createMerge("start");
    expect(start.board.filter((exp) => exp > 0).length).toBe(2);
    const empty = new Array<number>(CELLS).fill(0);
    let fours = 0;
    for (let i = 0; i < 4000; i++) {
      const spawn = spawnTile("ratio", i, empty);
      expect(spawn?.exp === 1 || spawn?.exp === 2).toBe(true);
      if (spawn?.exp === 2) fours += 1;
    }
    expect(fours / 4000).toBeGreaterThan(0.07);
    expect(fours / 4000).toBeLessThan(0.13);
  });
});

describe("merge engine: rewind (undo)", () => {
  it("is earned once at 512 and restores board, score and the spawn", () => {
    const state = withBoard("undo", [
      [256, 256, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 2],
    ]);
    expect(applyInput(state, "Z")).toBeNull();
    const before = { board: [...state.board], score: state.score, spawns: state.spawns };
    const result = applyInput(state, "L");
    expect(result?.kind === "move" && result.earnedUndo).toBe(true);
    expect(result?.kind === "move" && result.newTiers).toContain(UNDO_TIER);
    expect(state.score).toBe(before.score + 512);
    const spawnedBoard = [...state.board];
    expect(canUndo(state)).toBe(true);
    expect(applyInput(state, "Z")?.kind).toBe("undo");
    expect(state.board).toEqual(before.board);
    expect(state.score).toBe(before.score);
    // Same move again: the same spawn (draws are per spawn number).
    applyInput(state, "L");
    expect(state.board).toEqual(spawnedBoard);
    // Only once per run, even after reaching 512 again.
    expect(canUndo(state)).toBe(false);
    expect(applyInput(state, "Z")).toBeNull();
  });

  it("keeps a stuck board alive while the rewind is unused", () => {
    const state = withBoard("stuck", [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    state.undoEarned = true;
    state.undoCharges = 1;
    state.prev = { board: board([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 0, 2]]), score: 0, spawns: 2, moves: 0, merges: 0, maxExp: 2, bestCombo: 0 };
    expect(isOver(state)).toBe(false);
    expect(applyInput(state, "Z")?.kind).toBe("undo");
    expect(isOver(state)).toBe(false);
  });
});

describe("merge engine: replay validation", () => {
  const seed = "merge-practice:0123456789abcdef";

  function honestRun(useUndo = false) {
    const { state, log } = playBot(seed, greedyBot, { useUndo });
    return { state, inputs: finishInputs(log, "over") };
  }

  it("accepts an honest finished run and returns the replayed score", () => {
    const { state, inputs } = honestRun();
    expect(isOver(state)).toBe(true);
    expect(inputs.v).toBe(ENGINE_VERSION);
    expect(inputs.ticks).toBe(TICKS_PER_MOVE * (inputs.m.length + 1));
    const verdict = validateMergeRun(seed, inputs, state.score);
    expect(verdict).toEqual({ ok: true, score: state.score, ticks: inputs.ticks });
  });

  it("accepts a run that used the rewind", () => {
    // Find a seed where the greedy bot reaches 512 and gets stuck later.
    for (let i = 0; i < 40; i++) {
      const s = `merge-undo:${i}`;
      const { state, log } = playBot(s, greedyBot, { useUndo: true });
      if (!log.includes("Z")) continue;
      expect(validateMergeRun(s, finishInputs(log, "over"), state.score)).toMatchObject({ ok: true, score: state.score });
      return;
    }
    throw new Error("no seed used the rewind");
  });

  it("accepts an early quit with the score so far", () => {
    const { state, log } = playBot(seed, greedyBot, { limit: 30 });
    expect(validateMergeRun(seed, finishInputs(log, "quit"), state.score)).toMatchObject({ ok: true });
    // ...but not claimed as "over" while moves are left.
    expect(validateMergeRun(seed, finishInputs(log, "over"), state.score)).toMatchObject({ ok: false });
  });

  it("rejects an inflated score", () => {
    const { state, inputs } = honestRun();
    const verdict = validateMergeRun(seed, inputs, state.score + 4);
    expect(verdict).toMatchObject({ ok: false, reason: "Score does not match the replay.", replayScore: state.score });
  });

  it("rejects the inputs replayed on another seed", () => {
    const { state, inputs } = honestRun();
    const verdict = validateMergeRun("merge-practice:someone-else", inputs, state.score);
    expect(verdict.ok).toBe(false);
  });

  it("rejects an invalid move (a direction that moves nothing)", () => {
    const { log } = playBot(seed, greedyBot, { limit: 60 });
    // Replay to find a point where some direction is a no-op, insert it.
    const state = createMerge(seed);
    for (let i = 0; i < log.length; i++) {
      const blocked = DIRS.find((dir) => !slideBoard(state.board, dir).moved);
      if (blocked) {
        const tampered = log.slice(0, i) + blocked + log.slice(i);
        const verdict = validateMergeRun(seed, finishInputs(tampered, "quit"), 0);
        expect(verdict).toMatchObject({ ok: false, reason: `Invalid move #${i + 1}.` });
        return;
      }
      applyInput(state, log[i] as MergeInput);
    }
    throw new Error("no blocked direction found");
  });

  it("rejects extra moves after game over", () => {
    const { state, inputs } = honestRun();
    for (const extra of ["L", "R", "U", "D", "Z"]) {
      const verdict = validateMergeRun(seed, { ...inputs, m: inputs.m + extra, ticks: mergeTicks(inputs.m.length + 1) }, state.score);
      expect(verdict).toMatchObject({ ok: false, reason: "Moves after the game ended." });
    }
  });

  it("rejects a rewind that was never earned", () => {
    const verdict = validateMergeRun(seed, finishInputs("Z", "quit"), 0);
    expect(verdict).toMatchObject({ ok: false, reason: "Invalid move #1." });
  });

  it("rejects malformed inputs, wrong ticks and wrong versions", () => {
    const { state, inputs } = honestRun();
    expect(validateMergeRun(seed, null, 0)).toMatchObject({ ok: false });
    expect(validateMergeRun(seed, { ...inputs, v: 99 }, state.score)).toMatchObject({ ok: false });
    expect(validateMergeRun(seed, { ...inputs, end: "won" }, state.score)).toMatchObject({ ok: false });
    expect(validateMergeRun(seed, { ...inputs, m: inputs.m.replace(/L/, "X") }, state.score)).toMatchObject({ ok: false, reason: "Malformed inputs." });
    expect(validateMergeRun(seed, { ...inputs, m: ["L", "R"] }, state.score)).toMatchObject({ ok: false, reason: "Malformed inputs." });
    expect(validateMergeRun(seed, { ...inputs, ticks: inputs.ticks + 4 }, state.score)).toMatchObject({ ok: false, reason: "Impossible run length." });
    expect(validateMergeRun(seed, { ...inputs, ticks: 1 }, state.score)).toMatchObject({ ok: false, reason: "Impossible run length." });
    expect(validateMergeRun(seed, inputs, -1)).toMatchObject({ ok: false });
    expect(validateMergeRun(seed, inputs, 1.5)).toMatchObject({ ok: false });
    expect(validateMergeRun(seed, finishInputs("L".repeat(MAX_INPUTS + 1), "quit"), 0)).toMatchObject({ ok: false, reason: "Malformed inputs." });
  });

  it("replayMerge reports where a log stops being valid", () => {
    const { log } = playBot(seed, greedyBot, { limit: 20 });
    expect(replayMerge(seed, log).failedAt).toBe(-1);
  });
});

describe("merge engine: catalog score bound", () => {
  it("keeps every run (greedy, random, rewind) under ceil(ticks * 28) + 200 at every input", () => {
    // playBot asserts the bound after every input.
    for (let i = 0; i < 6; i++) {
      playBot(`bound-greedy:${i}`, greedyBot, { useUndo: true });
      playBot(`bound-random:${i}`, randomBot);
    }
  });

  it("matches the analytic worst case", () => {
    // Mass on the board grows by at most 4 per spawn (2 + 1 per move).
    // Each unit of mass is counted at most 16 times (2 -> 2^17), and
    // the combo bonus adds at most 70% (8 merges): score <= 1.7 * 16
    // * 4 * (moves + 2) = 108.8 * (moves + 2). With ticks = 4 *
    // (inputs + 1) >= 4 * (moves + 1): score <= 27.2 * ticks + 108.8.
    for (const inputs of [0, 1, 10, 1000, MAX_INPUTS]) {
      const ticks = mergeTicks(inputs);
      expect(1.7 * 16 * 4 * (inputs + 2)).toBeLessThanOrEqual(maxScoreForTicks(ticks));
    }
    expect(MAX_SCORE_PER_TICK).toBeGreaterThanOrEqual(27.2);
    expect(MAX_SCORE_FLAT).toBeGreaterThanOrEqual(109);
    expect(mergeTicks(MAX_INPUTS)).toBe(MAX_TICKS);
  });

  it("an honest greedy run reaches high tiers and stays far under the bound", () => {
    const { state, log, maxSeen } = playBot("strong-run", greedyBot, { useUndo: true });
    expect(maxSeen).toBeGreaterThanOrEqual(8);
    expect(state.score).toBeLessThan(maxScoreForTicks(mergeTicks(log.length)) / 5);
  });
});
