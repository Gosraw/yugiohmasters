import { describe, expect, it } from "vitest";

import {
  ActionRecorder,
  CLEAR_BONUS,
  COVERED_BY,
  DEAL_TICKS,
  DRAW,
  ENGINE_VERSION,
  FIRST_STOCK,
  HALF_X_OF,
  MAX_TICKS,
  MIN_ACTION_GAP,
  MIN_STOCK,
  PEAK_BONUS,
  PLAY_POINTS,
  ROW_OF,
  SCORE_FLAT_BOUND,
  SCORE_PER_TICK_BOUND,
  STOCK_BONUS,
  TABLEAU_SIZE,
  applyAction,
  canPlayCard,
  createPeaks,
  decodeActions,
  isUncovered,
  nextActionTick,
  peaksScore,
  playableIndices,
  rankOf,
  ranksTouch,
  shuffledDeck,
  simulateActions,
  stockForRound,
  validatePeaksRun,
  wasteTop,
  type PeaksInputs,
  type PeaksSim,
} from "./peaks-engine";

import { createPrng } from "./prng";

type Bot = (sim: PeaksSim, rng: ReturnType<typeof createPrng>) => number;

const randomBot: Bot = (sim, rng) => {
  const plays = playableIndices(sim);
  return plays.length ? plays[rng.int(0, plays.length - 1)] : DRAW;
};

/** Full-information lookahead: plays the card that starts the longest chain. */
const lookaheadBot: Bot = (sim) => {
  const tab = sim.tableau.slice();
  let best = DRAW;
  let bestLength = 0;
  let nodes = 0;

  const dfs = (top: number, length: number, first: number) => {
    nodes += 1;
    if (length > bestLength) {
      bestLength = length;
      best = first;
    }
    if (nodes > 20000) return;
    for (let i = 0; i < TABLEAU_SIZE; i++) {
      if (tab[i] < 0 || !COVERED_BY[i].every((b) => tab[b] < 0)) continue;
      if (!ranksTouch(rankOf(tab[i]), rankOf(top))) continue;
      const card = tab[i];
      tab[i] = -1;
      dfs(card, length + 1, first < 0 ? i : first);
      tab[i] = card;
    }
  };

  dfs(wasteTop(sim), 0, -1);
  return best;
};

/**
 * Plays a whole run, acting `pace` ticks after the earliest allowed
 * tick (0 = as fast as the engine allows). Checks the catalog bound
 * after every action.
 */
function playRun(seed: string, bot: Bot, options: { pace?: number; maxActions?: number } = {}) {
  const { pace = 0, maxActions = 100000 } = options;
  const sim = createPeaks(seed);
  const rng = createPrng(`bot:${seed}`);
  const rec = new ActionRecorder();
  let worstSlack = Infinity;
  let actions = 0;

  while (!sim.over && actions < maxActions) {
    const tick = nextActionTick(sim) + pace;
    if (tick >= MAX_TICKS) break;
    const action = bot(sim, rng);
    const refused = applyAction(sim, tick, action);
    expect(refused).toBeNull();
    rec.record(tick, action);
    actions += 1;
    const bound = Math.ceil((tick + 1) * SCORE_PER_TICK_BOUND) + SCORE_FLAT_BOUND;
    worstSlack = Math.min(worstSlack, bound - peaksScore(sim));
  }

  const ticks = sim.lastActionTick + 1;
  return { sim, rec, ticks, worstSlack, inputs: rec.finish(sim.over ? "nomoves" : "quit", ticks) };
}

/** First seed whose lookahead run clears at least `rounds` rounds. */
function seedClearing(rounds: number) {
  for (let i = 0; i < 400; i++) {
    const seed = `clear-${i}`;
    const run = playRun(seed, lookaheadBot, { pace: 3 });
    if (run.sim.roundsCleared >= rounds) return { seed, run };
  }
  throw new Error("no clearing seed found");
}

describe("layout", () => {
  it("has 28 slots in rows of 3 / 6 / 9 / 10", () => {
    expect(ROW_OF).toHaveLength(TABLEAU_SIZE);
    expect(HALF_X_OF).toHaveLength(TABLEAU_SIZE);
    expect(COVERED_BY).toHaveLength(TABLEAU_SIZE);
    expect([0, 1, 2, 3].map((r) => ROW_OF.filter((x) => x === r).length)).toEqual([3, 6, 9, 10]);
  });

  it("every card is overlapped by the two cards half a width either side in the row below", () => {
    for (let i = 0; i < TABLEAU_SIZE; i++) {
      if (ROW_OF[i] === 3) {
        expect(COVERED_BY[i]).toEqual([]);
        continue;
      }
      expect(COVERED_BY[i]).toHaveLength(2);
      for (const below of COVERED_BY[i]) {
        expect(ROW_OF[below]).toBe(ROW_OF[i] + 1);
        expect(Math.abs(HALF_X_OF[below] - HALF_X_OF[i])).toBe(1);
      }
    }
  });

  it("deals 28 + 1 waste + 23 stock, only the bottom row face up", () => {
    const sim = createPeaks("layout");
    expect(sim.tableau).toHaveLength(28);
    expect(sim.waste).toHaveLength(1);
    expect(sim.stock).toHaveLength(FIRST_STOCK);
    const all = [...sim.tableau, ...sim.waste, ...sim.stock];
    expect(new Set(all).size).toBe(all.length);
    for (let i = 0; i < TABLEAU_SIZE; i++) {
      expect(isUncovered(sim, i)).toBe(ROW_OF[i] === 3);
    }
  });

  it("stock shrinks one card per round down to 16", () => {
    expect([1, 2, 3, 7, 8, 9, 30].map(stockForRound)).toEqual([23, 22, 21, 17, 16, 16, 16]);
    expect(MIN_STOCK).toBe(16);
  });
});

describe("rules", () => {
  it("ranks touch one apart, and K <-> A wraps", () => {
    expect(ranksTouch(5, 6)).toBe(true);
    expect(ranksTouch(6, 5)).toBe(true);
    expect(ranksTouch(13, 1)).toBe(true);
    expect(ranksTouch(1, 13)).toBe(true);
    expect(ranksTouch(5, 7)).toBe(false);
    expect(ranksTouch(5, 5)).toBe(false);
    expect(ranksTouch(12, 1)).toBe(false);
  });

  it("deals are seeded per round and per seed", () => {
    expect(shuffledDeck("a", 1)).toEqual(shuffledDeck("a", 1));
    expect(shuffledDeck("a", 1)).not.toEqual(shuffledDeck("a", 2));
    expect(shuffledDeck("a", 1)).not.toEqual(shuffledDeck("b", 1));
    expect([...shuffledDeck("a", 1)].sort((x, y) => x - y)).toEqual(Array.from({ length: 52 }, (_, i) => i));
  });

  it("locks input during the deal and enforces the action gap", () => {
    const sim = createPeaks("gap");
    expect(applyAction(sim, DEAL_TICKS - 1, DRAW)).toBe("Too fast.");
    expect(applyAction(sim, DEAL_TICKS, DRAW)).toBeNull();
    expect(applyAction(sim, DEAL_TICKS + MIN_ACTION_GAP - 1, DRAW)).toBe("Too fast.");
    expect(applyAction(sim, DEAL_TICKS + MIN_ACTION_GAP, DRAW)).toBeNull();
    expect(applyAction(sim, MAX_TICKS, DRAW)).toBe("Impossible tick.");
  });

  it("refuses covered cards and cards of the wrong rank", () => {
    const sim = createPeaks("refuse");
    expect(applyAction(sim, 100, 0)).toBe("That card can't be played.");
    const wrong = [18, 19, 20, 21, 22, 23, 24, 25, 26, 27].find((i) => !canPlayCard(sim, i));
    expect(wrong).toBeDefined();
    expect(applyAction(sim, 100, wrong as number)).toBe("That card can't be played.");
    expect(applyAction(sim, 100, 99)).toBe("That card can't be played.");
  });

  it("chains score 10, 20, 30... and a draw resets the chain", () => {
    for (let i = 0; i < 200; i++) {
      const sim = createPeaks(`chain-${i}`);
      let tick = DEAL_TICKS;
      const gained: number[] = [];
      while (gained.length < 2) {
        const plays = playableIndices(sim);
        if (plays.length === 0 || plays.some((p) => p < 3)) break;
        const before = sim.score;
        expect(applyAction(sim, tick, plays[0])).toBeNull();
        gained.push(sim.score - before);
        tick += MIN_ACTION_GAP;
      }
      if (gained.length < 2) continue;
      expect(gained).toEqual([PLAY_POINTS, 2 * PLAY_POINTS]);
      expect(sim.chain).toBe(2);
      expect(applyAction(sim, tick, DRAW)).toBeNull();
      expect(sim.chain).toBe(0);
      return;
    }
    throw new Error("no seed with a 2-chain found");
  });

  it("clearing all three peaks pays the bonuses and deals the next round", () => {
    const { seed, run } = seedClearing(1);
    const actions = decodeActions(run.inputs.e, run.inputs.ticks)!;
    const sim = createPeaks(seed);
    for (const action of actions) {
      const before = { score: sim.score, round: sim.round, stock: sim.stock.length, chain: sim.chain };
      expect(applyAction(sim, action.t, action.a)).toBeNull();
      const play = sim.events.find((e) => e.type === "play");
      if (play && play.type === "play") {
        expect(play.points).toBe(PLAY_POINTS * (before.chain + 1) + (play.peak ? PEAK_BONUS : 0));
      }
      if (sim.round !== before.round) {
        const clear = sim.events.find((e) => e.type === "clear");
        expect(clear).toBeDefined();
        expect(sim.score - before.score).toBe(PLAY_POINTS * (before.chain + 1) + PEAK_BONUS + CLEAR_BONUS + STOCK_BONUS * before.stock);
        expect(sim.stock).toHaveLength(stockForRound(sim.round));
        expect(sim.waste).toHaveLength(1);
        expect(sim.chain).toBe(0);
        expect(sim.lockedUntil).toBe(action.t + DEAL_TICKS);
        expect(sim.tableau.every((c) => c >= 0)).toBe(true);
        break;
      }
    }
    expect(sim.roundsCleared).toBe(1);
    expect(sim.peaksTaken).toBe(3);
  });

  it("ends with No moves when the stock is empty and nothing fits; nothing is accepted after", () => {
    const run = playRun("ends", randomBot, { pace: 2 });
    expect(run.sim.over).toBe(true);
    expect(run.sim.stock).toHaveLength(0);
    expect(playableIndices(run.sim)).toEqual([]);
    expect(run.sim.events.at(-1)).toEqual({ type: "nomoves" });
    expect(applyAction(run.sim, MAX_TICKS - 1, DRAW)).toBe("The run is over.");
  });
});

describe("score bound (catalog: ceil(ticks * 27) + 4200)", () => {
  it("holds analytically", () => {
    const roundMax = PLAY_POINTS * (28 * 29) / 2 + 3 * PEAK_BONUS + CLEAR_BONUS + STOCK_BONUS * FIRST_STOCK;
    const roundMinTicks = DEAL_TICKS + 27 * MIN_ACTION_GAP;
    expect(roundMax).toBe(6660);
    expect(SCORE_PER_TICK_BOUND * roundMinTicks).toBeGreaterThanOrEqual(roundMax);
    const openRoundMax = PLAY_POINTS * (27 * 28) / 2 + 2 * PEAK_BONUS;
    expect(SCORE_FLAT_BOUND).toBeGreaterThanOrEqual(openRoundMax);
  });

  it("holds after every action of max-speed bots", () => {
    let cleared = 0;
    for (let i = 0; i < 120; i++) {
      const fast = playRun(`bound-${i}`, i % 2 ? randomBot : lookaheadBot, { pace: 0 });
      expect(fast.worstSlack).toBeGreaterThanOrEqual(0);
      cleared += fast.sim.roundsCleared;
    }
    expect(cleared).toBeGreaterThan(10);
  });
});

describe("replay validation", () => {
  const honest = playRun("replay-honest", lookaheadBot, { pace: 25 });

  it("accepts an honest run", () => {
    const verdict = validatePeaksRun("replay-honest", honest.inputs, peaksScore(honest.sim));
    expect(verdict).toEqual({ ok: true, score: peaksScore(honest.sim), ticks: honest.ticks });
    expect(honest.inputs.v).toBe(ENGINE_VERSION);
    expect(honest.inputs.end).toBe("nomoves");
  });

  it("accepts a quit run part-way and a resumed recorder", () => {
    const sim = createPeaks("quit");
    const rec = new ActionRecorder();
    let tick = 0;
    for (let i = 0; i < 6; i++) {
      tick = nextActionTick(sim) + 40;
      const action = randomBot(sim, createPrng(`q${i}`));
      expect(applyAction(sim, tick, action)).toBeNull();
      rec.record(tick, action);
    }
    const resumed = ActionRecorder.restore(rec.snapshot());
    const inputs = resumed.finish("quit", tick + 300);
    expect(validatePeaksRun("quit", inputs, sim.score)).toMatchObject({ ok: true, score: sim.score });
  });

  it("rejects an inflated score", () => {
    const verdict = validatePeaksRun("replay-honest", honest.inputs, peaksScore(honest.sim) + 10);
    expect(verdict).toMatchObject({ ok: false, reason: "Score does not match the replay." });
  });

  it("rejects the same inputs on another seed", () => {
    const verdict = validatePeaksRun("some-other-seed", honest.inputs, peaksScore(honest.sim));
    expect(verdict.ok).toBe(false);
  });

  it("rejects an illegal play injected into the log", () => {
    const e = [...honest.inputs.e];
    // Replace the first draw with a covered peak top.
    const drawAt = e.findIndex((value, i) => i % 2 === 1 && value === DRAW);
    e[drawAt] = 0;
    expect(validatePeaksRun("replay-honest", { ...honest.inputs, e }, peaksScore(honest.sim))).toMatchObject({ ok: false, reason: "Replay does not match the run." });
  });

  it("rejects actions after the run ended", () => {
    const e = [...honest.inputs.e, MIN_ACTION_GAP, DRAW];
    const inputs: PeaksInputs = { ...honest.inputs, e, ticks: honest.ticks + 100 };
    expect(validatePeaksRun("replay-honest", inputs, peaksScore(honest.sim))).toMatchObject({ ok: false, reason: "Replay does not match the run." });
  });

  it("rejects a wrong ending claim", () => {
    expect(validatePeaksRun("replay-honest", { ...honest.inputs, end: "quit" }, peaksScore(honest.sim)).ok).toBe(false);
    const partial = { ...honest.inputs, e: honest.inputs.e.slice(0, 10), end: "nomoves" as const };
    expect(validatePeaksRun("replay-honest", partial, 0).ok).toBe(false);
  });

  it("rejects actions faster than the gap", () => {
    const e = [...honest.inputs.e];
    e[2] = 1; // second action 1 tick after the first
    expect(validatePeaksRun("replay-honest", { ...honest.inputs, e }, peaksScore(honest.sim)).ok).toBe(false);
  });

  it("rejects malformed inputs and other versions", () => {
    const base = honest.inputs;
    const score = peaksScore(honest.sim);
    expect(validatePeaksRun("replay-honest", null, score)).toMatchObject({ ok: false, reason: "No inputs." });
    expect(validatePeaksRun("replay-honest", { ...base, v: 99 }, score)).toMatchObject({ ok: false, reason: "Game version changed. Reload the page." });
    expect(validatePeaksRun("replay-honest", { ...base, end: "win" }, score)).toMatchObject({ ok: false, reason: "Unknown run ending." });
    expect(validatePeaksRun("replay-honest", { ...base, ticks: MAX_TICKS + 1 }, score)).toMatchObject({ ok: false, reason: "Impossible run length." });
    expect(validatePeaksRun("replay-honest", { ...base, e: [...base.e, 5] }, score)).toMatchObject({ ok: false, reason: "Malformed inputs." });
    expect(validatePeaksRun("replay-honest", { ...base, e: [0, 28] }, score)).toMatchObject({ ok: false, reason: "Malformed inputs." });
    expect(validatePeaksRun("replay-honest", { ...base, e: [-1, DRAW] }, score)).toMatchObject({ ok: false, reason: "Malformed inputs." });
    expect(validatePeaksRun("replay-honest", { ...base, e: [0.5, DRAW] }, score)).toMatchObject({ ok: false, reason: "Malformed inputs." });
    expect(validatePeaksRun("replay-honest", { ...base, ticks: honest.sim.lastActionTick }, score)).toMatchObject({ ok: false, reason: "Malformed inputs." });
    expect(validatePeaksRun("replay-honest", base, -5)).toMatchObject({ ok: false, reason: "Impossible score." });
  });

  it("replays to the same state as live play", () => {
    const actions = decodeActions(honest.inputs.e, honest.inputs.ticks)!;
    const { sim, refusedAt } = simulateActions("replay-honest", actions);
    expect(refusedAt).toBe(-1);
    expect(sim.tableau).toEqual(honest.sim.tableau);
    expect(sim.score).toBe(honest.sim.score);
    expect(sim.round).toBe(honest.sim.round);
  });
});
