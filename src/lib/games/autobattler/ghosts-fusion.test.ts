import {
  describe,
  expect,
  it,
} from "vitest";

import {
  applyAction,
  createRun,
  fusionOptions,
  ghostIds,
  replayLog,
  restoreRun,
  runScore,
  validateRun,
  xyzOptions,
  ENGINE_VERSION,
  LEGACY_LOG_REASON,
  MAX_WAVES,
  SELL_VALUE,
  SUMMON_UNLOCK_WAVE,
  TRAP_UNLOCK_WAVE,
  type GhostBoard,
  type Run,
  type Unit,
} from "./engine";

import {
  playBotRun,
} from "./bot";

import {
  ghostTableFromRows,
  pickGhosts,
  type GhostCandidate,
} from "./ghosts";

import {
  FUSIONS,
  SPECIALS,
  UNITS,
  UNIT_BY_ID,
  XYZ_BY_RANK,
} from "./units";

// ---------------------------------------------------------
// helpers
// ---------------------------------------------------------

/** Test setup only: put specific units on the board / bench. */
function give(
  run: Run,
  ids: string[],
  where: "board" | "bench" = "board",
  golden = false
): Unit[] {
  return ids.map(
    (id) => {
      const def =
        UNIT_BY_ID.get(id);

      if (!def) {
        throw new Error(`unknown unit ${id}`);
      }

      const unit: Unit = {
        uid: run.state.nextUid,
        id,
        atk: def.atk * (golden ? 2 : 1),
        hp: def.hp * (golden ? 2 : 1),
        golden,
        lane: 1,
        def: false,
      };

      run.state.nextUid += 1;

      run.state[where].push(unit);

      return unit;
    }
  );
}

/** A run on the wave where Fusion / Xyz unlock. */
function unlockedRun(
  seed: string
) {
  const run =
    createRun(seed);

  run.state.turn = SUMMON_UNLOCK_WAVE;

  return run;
}

function recipeIndex(
  result: string
) {
  const index =
    FUSIONS.findIndex(
      (recipe) => recipe.result === result
    );

  if (index < 0) {
    throw new Error(`no recipe for ${result}`);
  }

  return index;
}

/** Ghost boards built from other bot runs (like friends' runs). */
function friendGhosts(
  seed: string
) {
  const boards =
    new Map<string, GhostBoard>();

  const candidates: GhostCandidate[] = [];

  ["ann", "bob", "cas"].forEach(
    (name) => {
      const run =
        playBotRun(`friend-${name}`);

      for (const snapshot of run.state.snapshots) {
        const id =
          `${name}-${snapshot.turn}`;

        boards.set(id, {
          id,
          name,
          units: snapshot.units,
          traps: snapshot.traps,
        });

        candidates.push({
          snapshotId: id,
          profileId: name,
          name,
          turn: snapshot.turn,
        });
      }
    }
  );

  const ghosts: (GhostBoard | null)[] =
    new Array(MAX_WAVES).fill(null);

  for (const pick of pickGhosts(seed, candidates)) {
    ghosts[pick.turn - 1] = boards.get(pick.snapshotId) ?? null;
  }

  return {
    ghosts,
    candidates,
  };
}

// ---------------------------------------------------------
// data
// ---------------------------------------------------------

describe("fusion + xyz data", () => {
  it("has one Xyz per Rank 3-8 and recipes made of shop units", () => {
    for (let rank = 3; rank <= 8; rank++) {
      expect(XYZ_BY_RANK.get(rank)?.kind).toBe("xyz");
    }

    expect(FUSIONS.length).toBeGreaterThanOrEqual(8);

    for (const recipe of FUSIONS) {
      expect(UNIT_BY_ID.get(recipe.result)?.kind).toBe("fusion");

      for (const material of recipe.materials) {
        if ("unit" in material) {
          expect(UNITS.some((unit) => unit.id === material.unit)).toBe(true);
        }
      }
    }
  });

  it("unlock in stages: traps on wave 3, Fusion / Xyz on wave 4", () => {
    const run =
      createRun("stages");

    const [a, b] =
      give(run, ["mystic-tomato", "ufo-turtle"]);

    expect(applyAction(run, `x${a.uid}.${b.uid}`).ok).toBe(false);

    for (let turn = 1; turn < TRAP_UNLOCK_WAVE; turn++) {
      expect(run.state.shop.some((id) => id !== null && id in run.state.pool && !UNIT_BY_ID.has(id))).toBe(false);

      for (let i = 0; i < 3; i++) {
        applyAction(run, "r");
      }

      expect(run.state.shop.every((id) => id === null || UNIT_BY_ID.has(id))).toBe(true);

      applyAction(run, "e");
    }

    while (run.state.turn < SUMMON_UNLOCK_WAVE) {
      applyAction(run, "e");
    }

    expect(applyAction(run, `x${a.uid}.${b.uid}`).ok).toBe(true);
  });

  it("specials are never in the shop pool", () => {
    const run =
      createRun("pool");

    for (const special of SPECIALS) {
      expect(special.id in run.state.pool).toBe(false);
    }
  });
});

// ---------------------------------------------------------
// Xyz
// ---------------------------------------------------------

describe("overlay (Xyz)", () => {
  it("two Level 4 units become Number 39: Utopia in the first board slot", () => {
    const run =
      unlockedRun("xyz");

    const [a, b] =
      give(run, ["mystic-tomato", "ufo-turtle"]);

    // Some gained stats: half of them carry over.
    a.atk += 4;
    b.hp += 6;

    const poolBefore = {
      ...run.state.pool,
    };

    expect(applyAction(run, `x${a.uid}.${b.uid}`).ok).toBe(true);

    const utopia =
      XYZ_BY_RANK.get(4)!;

    expect(run.state.board).toHaveLength(1);
    expect(run.state.board[0].id).toBe(utopia.id);
    expect(run.state.board[0].atk).toBe(utopia.atk + 2);
    expect(run.state.board[0].hp).toBe(utopia.hp + 3);
    expect(run.state.pool).toEqual(poolBefore);
  });

  it("works across board and bench, and shows up in xyzOptions", () => {
    const run =
      unlockedRun("xyz-bench");

    give(run, ["mystic-tomato"]);
    give(run, ["mother-grizzly"], "bench");

    const options =
      xyzOptions(run.state);

    expect(options).toHaveLength(1);
    expect(options[0].rank).toBe(4);

    const [a, b] =
      options[0].units;

    expect(applyAction(run, `x${b.uid}.${a.uid}`).ok).toBe(true);
    expect(run.state.board.map((unit) => unit.id)).toEqual([XYZ_BY_RANK.get(4)!.id]);
    expect(run.state.bench).toHaveLength(0);
  });

  it("rejects different Levels, the same unit twice, Level 1-2 and specials", () => {
    const run =
      unlockedRun("xyz-bad");

    const [four, three, two, twoB] =
      give(run, ["mystic-tomato", "baby-dragon", "jinzo-7", "man-eater-bug"]);

    expect(applyAction(run, `x${four.uid}.${three.uid}`).ok).toBe(false);
    expect(applyAction(run, `x${four.uid}.${four.uid}`).ok).toBe(false);
    expect(applyAction(run, `x${two.uid}.${twoB.uid}`).ok).toBe(false);
    expect(applyAction(run, `x${four.uid}.99999`).ok).toBe(false);

    const [utopia] =
      give(run, [XYZ_BY_RANK.get(4)!.id]);

    expect(applyAction(run, `x${four.uid}.${utopia.uid}`).ok).toBe(false);
    expect(run.state.board).toHaveLength(5);
  });

  it("costs 1 gold and works once per turn", () => {
    const run =
      unlockedRun("xyz-limit");

    const [a, b, c, d] =
      give(run, ["mystic-tomato", "ufo-turtle", "mother-grizzly", "pyramid-turtle"]);

    run.state.gold = 0;

    expect(applyAction(run, `x${a.uid}.${b.uid}`).ok).toBe(false);

    run.state.gold = 5;

    expect(applyAction(run, `x${a.uid}.${b.uid}`).ok).toBe(true);
    expect(run.state.gold).toBe(4);
    expect(applyAction(run, `x${c.uid}.${d.uid}`).ok).toBe(false);

    applyAction(run, "e");

    expect(run.state.overlayUsed).toBe(false);
    expect(applyAction(run, `x${c.uid}.${d.uid}`).ok).toBe(true);
  });

  it("selling a special gives gold and leaves the pool alone", () => {
    const run =
      unlockedRun("sell-special");

    const [utopia] =
      give(run, [XYZ_BY_RANK.get(4)!.id]);

    const gold =
      run.state.gold;

    expect(applyAction(run, `s${utopia.uid}`).ok).toBe(true);
    expect(run.state.gold).toBe(gold + SELL_VALUE);
    expect(Object.values(run.state.pool).every(Number.isInteger)).toBe(true);
  });
});

// ---------------------------------------------------------
// Fusion
// ---------------------------------------------------------

describe("polymerization (Fusion)", () => {
  it("Dark Magician + Buster Blader = Dark Paladin", () => {
    const run =
      unlockedRun("fusion");

    const [dm, bb] =
      give(run, ["dark-magician", "buster-blader"]);

    const option =
      fusionOptions(run.state).find(
        (o) => o.result === "dark-paladin"
      );

    expect(option?.uids.sort()).toEqual([dm.uid, bb.uid].sort());

    const index =
      recipeIndex("dark-paladin");

    // Materials in the wrong order do not match the recipe.
    expect(applyAction(run, `c${index}.${bb.uid}.${dm.uid}`).ok).toBe(false);
    expect(applyAction(run, `c${index}.${dm.uid}.${bb.uid}`).ok).toBe(true);
    expect(run.state.board.map((unit) => unit.id)).toEqual(["dark-paladin"]);
  });

  it("'any Dragon' materials: Dark Magician Girl + a Dragon", () => {
    const run =
      unlockedRun("fusion-tribe");

    const [dmg, dragon, warrior] =
      give(run, ["dark-magician-girl", "baby-dragon", "command-knight"]);

    const index =
      recipeIndex("dark-magician-girl-the-dragon-knight");

    expect(applyAction(run, `c${index}.${dmg.uid}.${warrior.uid}`).ok).toBe(false);
    expect(applyAction(run, `c${index}.${dmg.uid}.${dragon.uid}`).ok).toBe(true);
    expect(run.state.board.map((unit) => unit.id)).toEqual([
      "dark-magician-girl-the-dragon-knight",
      "command-knight",
    ]);
  });

  it("Blue-Eyes Ultimate Dragon needs a golden Blue-Eyes (three copies)", () => {
    const run =
      unlockedRun("beud");

    const index =
      recipeIndex("blue-eyes-ultimate-dragon");

    const [plain] =
      give(run, ["blue-eyes-white-dragon"]);

    expect(applyAction(run, `c${index}.${plain.uid}`).ok).toBe(false);

    const [golden] =
      give(run, ["blue-eyes-white-dragon"], "bench", true);

    expect(applyAction(run, `c${index}.${golden.uid}`).ok).toBe(true);
    expect(run.state.bench.map((unit) => unit.id)).toEqual(["blue-eyes-ultimate-dragon"]);
  });

  it("unknown recipes and wrong material counts are rejected", () => {
    const run =
      unlockedRun("fusion-bad");

    const [dm, bb] =
      give(run, ["dark-magician", "buster-blader"]);

    expect(applyAction(run, `c99.${dm.uid}.${bb.uid}`).ok).toBe(false);
    expect(applyAction(run, `c${recipeIndex("dark-paladin")}.${dm.uid}`).ok).toBe(false);
  });

  it("bot runs with Fusion / Xyz replay to the same score", () => {
    let summons = 0;

    for (let i = 0; i < 12; i++) {
      const run =
        playBotRun(`summon-${i}`);

      summons += run.state.log.filter((a) => /^[xc]/.test(a)).length;

      const verdict =
        validateRun(
          `summon-${i}`,
          {
            v: ENGINE_VERSION,
            a: run.state.log,
          },
          runScore(run.state)
        );

      expect(verdict.ok).toBe(true);
    }

    expect(summons).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------
// Ghosts
// ---------------------------------------------------------

describe("ghost assignment", () => {
  const candidates: GhostCandidate[] = [];

  for (const friend of ["p-a", "p-b", "p-c"]) {
    for (let turn = 1; turn <= (friend === "p-c" ? 5 : MAX_WAVES); turn++) {
      candidates.push({
        snapshotId: `${friend}-${turn}`,
        profileId: friend,
        name: friend,
        turn,
      });
    }
  }

  it("is deterministic and independent of input order", () => {
    const first =
      pickGhosts("seed-1", candidates);

    expect(pickGhosts("seed-1", candidates)).toEqual(first);
    expect(pickGhosts("seed-1", [...candidates].reverse())).toEqual(first);
    // The last wave is always a Boss.
    expect(first).toHaveLength(MAX_WAVES - 1);
  });

  it("rotates between friends and falls back when one has no board", () => {
    const picks =
      pickGhosts("seed-2", candidates);

    const owners =
      picks.map(
        (pick) => pick.snapshotId.split("-").slice(0, 2).join("-")
      );

    for (let i = 1; i < owners.length; i++) {
      expect(owners[i]).not.toBe(owners[i - 1]);
    }

    // p-c only reached turn 5.
    for (const pick of picks) {
      if (pick.turn > 5) {
        expect(pick.snapshotId.startsWith("p-c")).toBe(false);
      }
    }
  });

  it("no friends = no ghosts (Boss waves)", () => {
    expect(pickGhosts("x", [])).toEqual([]);

    const run =
      createRun("bosses");

    expect(run.state.ghosts.every((ghost) => ghost === null)).toBe(true);
  });

  it("frozen rows map to turns; bad units are dropped", () => {
    const table =
      ghostTableFromRows([
        {
          turn: 2,
          snapshot_id: "snap-2",
          ghost_name: "Bossg",
          board: {
            units: [
            {
              id: "kuriboh",
              atk: 1,
              hp: 5,
              golden: false,
            },
              {
                id: "not-a-card",
                atk: 1,
                hp: 1,
                golden: false,
              },
            ],
          },
        },
        {
          turn: 40,
          snapshot_id: "too-late",
          ghost_name: "x",
          board: {
            units: [],
          },
        },
      ]);

    expect(table).toHaveLength(MAX_WAVES);
    expect(table[1]?.units).toHaveLength(1);
    expect(ghostIds(table)).toEqual([null, "snap-2", ...new Array(MAX_WAVES - 2).fill(null)]);
  });
});

describe("ghost runs", () => {
  it("fight the friend's board and replay to the live score", () => {
    const {
      ghosts,
    } = friendGhosts("ghost-run");

    expect(ghosts.some(Boolean)).toBe(true);

    const run =
      playBotRun(
        "ghost-run",
        {
          ghosts,
        }
      );

    const ghostTurns =
      run.state.history.filter(
        (wave) => wave.route === "ghost"
      );

    expect(ghostTurns.length).toBeGreaterThan(0);
    expect(ghostTurns[0].foe).toMatch(/'s board$/);

    const score =
      runScore(run.state);

    const verdict =
      validateRun(
        "ghost-run",
        {
          v: ENGINE_VERSION,
          a: run.state.log,
          g: ghostIds(ghosts),
        },
        score,
        ghosts
      );

    expect(verdict.ok).toBe(true);

    if (verdict.ok) {
      expect(verdict.score).toBe(score);
      expect(verdict.snapshots).toEqual(run.state.snapshots);
    }

    // Resume mid-run with the same ghosts.
    const restored =
      restoreRun("ghost-run", run.state.log.slice(0, 10), ghosts);

    expect(restored?.state.ghosts).toEqual(run.state.ghosts);
  });

  it("rejects tampered or missing ghost ids", () => {
    const {
      ghosts,
    } = friendGhosts("ghost-tamper");

    const run =
      playBotRun(
        "ghost-tamper",
        {
          ghosts,
        }
      );

    const score =
      runScore(run.state);

    const ids =
      ghostIds(ghosts);

    const swapped =
      [...ids];

    const turn =
      swapped.findIndex(Boolean);

    swapped[turn] = "someone-else";

    const cases: unknown[] = [
      // missing
      {
        v: ENGINE_VERSION,
        a: run.state.log,
      },
      // swapped id
      {
        v: ENGINE_VERSION,
        a: run.state.log,
        g: swapped,
      },
      // too long
      {
        v: ENGINE_VERSION,
        a: run.state.log,
        g: [...ids, "extra"],
      },
      // not an array
      {
        v: ENGINE_VERSION,
        a: run.state.log,
        g: "ids",
      },
    ];

    for (const tampered of cases) {
      expect(validateRun("ghost-tamper", tampered, score, ghosts).ok).toBe(false);
    }

    // Claiming ghosts on a run the server froze without any.
    expect(
      replayLog(
        "ghost-tamper",
        {
          v: ENGINE_VERSION,
          a: run.state.log,
          g: ids,
        },
        []
      ).ok
    ).toBe(false);

    // Same ids but different boards on the server: the replay
    // follows the server's boards, so the score can't be faked.
    const weaker =
      ghosts.map(
        (ghost) =>
          ghost
            ? {
                ...ghost,
                units: ghost.units.slice(0, 1),
              }
            : null
      );

    const verdict =
      validateRun(
        "ghost-tamper",
        {
          v: ENGINE_VERSION,
          a: run.state.log,
          g: ids,
        },
        score,
        weaker
      );

    if (verdict.ok) {
      // Only possible if every fight ended the same way.
      expect(verdict.score).toBe(score);
    }
  });

  it("ghost boards keep their lanes, positions and traps", () => {
    const table =
      ghostTableFromRows([
        {
          turn: 1,
          snapshot_id: "snap-1",
          ghost_name: "Bossg",
          board: {
            units: [
              {
                id: "kuriboh",
                atk: 1,
                hp: 9,
                golden: false,
                lane: 0,
                def: true,
              },
              {
                id: "sangan",
                atk: 2,
                hp: 2,
                golden: false,
                lane: 7,
                def: false,
              },
            ],
            traps: [
              {
                id: "sakuretsu-armor",
                lane: 1,
              },
              {
                id: "waboku",
                lane: 1,
              },
              {
                id: "not-a-trap",
                lane: 2,
              },
            ],
          },
        },
      ]);

    const ghost =
      table[0]!;

    expect(ghost.units.map((unit) => [unit.lane, unit.def])).toEqual([[0, true], [1, false]]);
    expect(ghost.traps).toEqual([{ id: "sakuretsu-armor", lane: 1 }]);

    // Its trap fires on the player's first attacker in that lane.
    const run =
      createRun("ghost-trap", table);

    give(run, ["mystic-tomato"]);

    const outcome =
      applyAction(run, "e", { record: true });

    const flipped =
      outcome.ok
        ? outcome.combat?.frames.flatMap((frame) => (frame.ev.k === "tick" ? frame.ev.traps : []))
        : [];

    expect(outcome.ok && outcome.combat?.foe).toBe("Bossg's board");
    expect(flipped).toEqual([expect.objectContaining({ side: 1, id: "sakuretsu-armor" })]);
  });

  it("old schema-1 boards (no lanes) get an auto layout", () => {
    const [ghost] =
      ghostTableFromRows([
        {
          turn: 1,
          snapshot_id: "old",
          ghost_name: "Old",
          board: {
            units: [
              { id: "kuriboh", atk: 1, hp: 9, golden: false },
              { id: "sangan", atk: 3, hp: 2, golden: false },
              { id: "mystic-tomato", atk: 3, hp: 3, golden: false },
              { id: "gone-card", atk: 3, hp: 3, golden: false },
            ],
          },
        },
      ]);

    expect(ghost?.units.map((unit) => [unit.id, unit.lane, unit.def])).toEqual([
      ["kuriboh", 1, true],
      ["sangan", 0, false],
      ["mystic-tomato", 2, false],
    ]);
    expect(ghost?.traps).toEqual([]);
  });

  it("snapshots record lanes, positions and traps", () => {
    const run =
      createRun("snap-traps");

    run.state.gold = 9;

    const [unit] =
      give(run, ["kuriboh"]);

    run.state.traps.push({
      uid: 999,
      id: "waboku",
      lane: 2,
    });

    applyAction(run, `t${unit.uid}`);
    applyAction(run, "e");

    expect(run.state.snapshots[0]).toEqual({
      turn: 1,
      units: [expect.objectContaining({ id: "kuriboh", lane: 1, def: true })],
      traps: [{ id: "waboku", lane: 2 }],
    });
  });

  it("records the board of every turn as a snapshot", () => {
    const run =
      playBotRun("snapshots");

    expect(run.state.snapshots.map((s) => s.turn)).toEqual(
      run.state.history.map((wave) => wave.wave)
    );

    for (const snapshot of run.state.snapshots) {
      expect(snapshot.units.length).toBeLessThanOrEqual(7);
    }
  });
});

// ---------------------------------------------------------
// Old (v1) runs
// ---------------------------------------------------------

describe("legacy v1 / v2 logs", () => {
  it("are rejected cleanly, never crash", () => {
    const legacy = {
      v: 1,
      a: ["b0", "e", "e", "e"],
    };

    const outcome =
      replayLog(
        "old-run",
        legacy
      );

    expect(outcome).toEqual({
      ok: false,
      reason: LEGACY_LOG_REASON,
    });

    expect(validateRun("old-run", legacy, 50000).ok).toBe(false);

    // v2 (pre-lanes) logs too.
    expect(replayLog("old-run", { v: 2, a: ["e"], g: [] })).toEqual({
      ok: false,
      reason: LEGACY_LOG_REASON,
    });

    // A v1 log that used v1-only numbers (wave 20 etc.) is the same.
    expect(
      validateRun(
        "old-run",
        {
          v: 1,
          a: new Array(300).fill("e"),
        },
        203020
      ).ok
    ).toBe(false);
  });
});
