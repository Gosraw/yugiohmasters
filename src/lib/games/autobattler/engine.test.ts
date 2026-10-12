import {
  describe,
  expect,
  it,
} from "vitest";

import {
  applyAction,
  bossWave,
  createRun,
  replayLog,
  resolveCombat,
  restoreRun,
  runScore,
  validateRun,
  castleDamage,
  foeFor,
  laneCounts,
  BOARD_MAX,
  ENGINE_VERSION,
  MAX_WAVES,
  START_HEALTH,
  type BossUnitSpec,
  type BossWave,
  type GhostTrap,
  type Run,
  type Unit,
} from "./engine";

import {
  playBotRun,
} from "./bot";

import {
  ROUTES,
  UNITS,
  UNIT_BY_ID,
} from "./units";

// ---------------------------------------------------------
// helpers
// ---------------------------------------------------------

let uidCounter = 500;

function unitOf(
  id: string,
  atk?: number,
  hp?: number,
  golden = false,
  lane = 1,
  defense = false
): Unit {
  const def =
    UNIT_BY_ID.get(id);

  if (!def) {
    throw new Error(`unknown unit ${id}`);
  }

  uidCounter += 1;

  return {
    uid: uidCounter,
    id,
    atk: atk ?? def.atk,
    hp: hp ?? def.hp,
    golden,
    lane,
    def: defense,
  };
}

function enemy(
  atk: number,
  hp: number,
  keywords: BossUnitSpec["keywords"] = [],
  power = 1,
  lane = 1,
  def = false,
  level = 4
): BossUnitSpec {
  return {
    name: "Dummy",
    img: "",
    atk,
    hp,
    boss: false,
    keywords,
    power,
    level,
    lane,
    def,
  };
}

function wave(
  units: BossUnitSpec[],
  number = 1,
  traps: GhostTrap[] = []
): BossWave {
  return {
    wave: number,
    route: "test",
    routeName: "Test",
    tier: 1,
    units,
    traps,
  };
}

function fight(
  board: Unit[],
  foes: BossUnitSpec[],
  seed = "fight",
  options: {
    mine?: GhostTrap[];
    theirs?: GhostTrap[];
    wave?: number;
  } = {}
) {
  return resolveCombat(
    board,
    {
      ...wave(foes, options.wave ?? 1, options.theirs ?? []),
      routeName: seed,
    },
    true,
    options.mine ?? []
  );
}

/** A unit id with the given ability and no tribe / attribute synergy noise. */
function idWith(
  ability: string
) {
  const def =
    UNITS.find(
      (unit) => unit.ability === ability
    );

  if (!def) {
    throw new Error(`no unit with ${ability}`);
  }

  return def.id;
}

function forceShop(
  run: Run,
  ids: string[]
) {
  // Test setup only: put specific units in the shop (taking them
  // out of the pool like a real roll would).
  for (const id of run.state.shop) {
    if (id) {
      run.state.pool[id] += 1;
    }
  }

  run.state.shop = ids.map(
    (id) => {
      run.state.pool[id] -= 1;

      return id;
    }
  );
}

// ---------------------------------------------------------
// data
// ---------------------------------------------------------

describe("unit data", () => {
  it("has 60-80 units over tiers 1-6 with one ability each", () => {
    expect(UNITS.length).toBeGreaterThanOrEqual(60);
    expect(UNITS.length).toBeLessThanOrEqual(80);

    for (let tier = 1; tier <= 6; tier++) {
      expect(UNITS.filter((unit) => unit.tier === tier).length).toBeGreaterThanOrEqual(8);
    }

    for (const unit of UNITS) {
      expect(unit.atk).toBeGreaterThan(0);
      expect(unit.hp).toBeGreaterThan(0);
      expect(unit.img).toMatch(/^https:\/\//);
    }

    expect(new Set(UNITS.map((unit) => unit.id)).size).toBe(UNITS.length);
  });

  it("has 20 Boss routes, each with a Boss card", () => {
    expect(ROUTES.length).toBe(20);

    for (const route of ROUTES) {
      expect(route.units.some((unit) => unit.boss)).toBe(true);
      expect(route.keywords.length).toBe(2);
    }
  });
});

// ---------------------------------------------------------
// determinism + replay
// ---------------------------------------------------------

describe("determinism", () => {
  it("same seed gives the same shop and Boss order", () => {
    const a =
      createRun("seed-a");

    const b =
      createRun("seed-a");

    const c =
      createRun("seed-b");

    expect(a.state.shop).toEqual(b.state.shop);
    expect(a.state.bossOrder).toEqual(b.state.bossOrder);
    expect(a.state.bossOrder).toHaveLength(MAX_WAVES);
    expect(new Set(a.state.bossOrder).size).toBe(MAX_WAVES);

    expect(
      JSON.stringify([c.state.shop, c.state.bossOrder])
    ).not.toBe(
      JSON.stringify([a.state.shop, a.state.bossOrder])
    );
  });

  it("refreshes are seeded too", () => {
    const a =
      createRun("roll");

    const b =
      createRun("roll");

    for (const run of [a, b]) {
      run.state.gold = 10;
      applyAction(run, "r");
      applyAction(run, "r");
    }

    expect(a.state.shop).toEqual(b.state.shop);
  });

  it("a full bot run is identical twice", () => {
    const first =
      playBotRun("bot-determinism");

    const second =
      playBotRun("bot-determinism");

    expect(first.state.log).toEqual(second.state.log);
    expect(runScore(first.state)).toBe(runScore(second.state));
    expect(first.state.over).toBe(true);
  });

  it("combat frames are identical for the same input", () => {
    const board = [
      unitOf(idWith("double")),
      unitOf(idWith("taunt")),
    ];

    const foes = [
      enemy(2, 6),
      enemy(3, 3),
      enemy(1, 9),
    ];

    expect(fight(board, foes, "x")).toEqual(fight(board, foes, "x"));
  });
});

describe("replay validation", () => {
  it("replaying a recorded action log reproduces the score", () => {
    for (const seed of ["replay-1", "replay-2", "daily:2026-10-12:abc"]) {
      const run =
        playBotRun(seed);

      const score =
        runScore(run.state);

      const verdict =
        validateRun(
          seed,
          {
            v: ENGINE_VERSION,
            a: run.state.log,
          },
          score
        );

      expect(verdict).toMatchObject({
        ok: true,
        score,
        turns: run.state.history.length,
      });
    }
  });

  it("restoreRun rebuilds a run mid-way", () => {
    const full =
      playBotRun("restore");

    const half =
      full.state.log.slice(0, Math.floor(full.state.log.length / 2));

    const restored =
      restoreRun("restore", half);

    expect(restored).not.toBeNull();
    expect(restored?.state.log).toEqual(half);
  });

  it("rejects a claimed score that does not match", () => {
    const run =
      playBotRun("claim");

    const verdict =
      validateRun(
        "claim",
        {
          v: ENGINE_VERSION,
          a: run.state.log,
        },
        runScore(run.state) + 10000
      );

    expect(verdict.ok).toBe(false);
  });

  it("rejects a log replayed on a different seed", () => {
    const run =
      playBotRun("seed-one");

    const verdict =
      validateRun(
        "seed-two",
        {
          v: ENGINE_VERSION,
          a: run.state.log,
        },
        runScore(run.state)
      );

    expect(verdict.ok).toBe(false);
  });

  it("rejects tampered logs", () => {
    const run =
      playBotRun("tamper");

    const log =
      run.state.log;

    const score =
      runScore(run.state);

    const cases: unknown[] = [
      null,
      "nope",
      {
        v: ENGINE_VERSION + 1,
        a: log,
      },
      {
        v: ENGINE_VERSION,
        a: log.slice(0, -1),
      },
      {
        v: ENGINE_VERSION,
        a: ["b0", "b0", ...log],
      },
      {
        v: ENGINE_VERSION,
        a: ["DROP TABLE", ...log],
      },
      {
        v: ENGINE_VERSION,
        a: [...log.slice(0, 1), "s99999", ...log.slice(1)],
      },
      {
        v: ENGINE_VERSION,
        a: new Array(5000).fill("f"),
      },
    ];

    for (const tampered of cases) {
      expect(validateRun("tamper", tampered, score).ok).toBe(false);
    }
  });

  it("rejects buying gold you do not have", () => {
    const outcome =
      replayLog(
        "broke",
        {
          v: ENGINE_VERSION,
          a: ["b0", "b1"],
        }
      );

    expect(outcome.ok).toBe(false);

    if (!outcome.ok) {
      expect(outcome.reason).toMatch(/gold/i);
    }
  });

  it("a run cannot go past the last wave", () => {
    const run =
      createRun("cap");

    while (!run.state.over) {
      // Test setup: an unbeatable board so the run reaches the end.
      run.state.board =
        UNITS.filter(
          (unit) => unit.ability === "shield" || unit.ability === "taunt"
        )
          .slice(0, BOARD_MAX)
          .map(
            (unit, i) => unitOf(unit.id, 999, 999, false, i % 3)
          );

      applyAction(run, "e");
    }

    expect(run.state.victory).toBe(true);
    expect(run.state.survived).toBe(MAX_WAVES);
    expect(applyAction(run, "e").ok).toBe(false);
    expect(run.state.health).toBeGreaterThan(0);
    expect(run.state.health).toBeLessThanOrEqual(START_HEALTH);
    expect(runScore(run.state)).toBe(MAX_WAVES * 10000 + run.state.health * 100 + run.state.wins);
  });
});

// ---------------------------------------------------------
// shop rules
// ---------------------------------------------------------

describe("shop", () => {
  it("gold grows 3 -> 10 and the tier-up cost drops each turn", () => {
    const run =
      createRun("economy");

    expect(run.state.gold).toBe(3);
    expect(run.state.tierCost).toBe(5);

    run.state.board = [
      unitOf(idWith("taunt"), 999, 999),
    ];

    applyAction(run, "e");

    expect(run.state.gold).toBe(4);
    expect(run.state.tierCost).toBe(4);
    expect(applyAction(run, "u").ok).toBe(true);
    expect(run.state.tier).toBe(2);
    expect(run.state.gold).toBe(0);
    expect(run.state.tierCost).toBe(7);

    for (let i = 0; i < 10; i++) {
      applyAction(run, "e");
    }

    expect(run.state.gold).toBe(10);
  });

  it("buy costs 3, sell gives 1 and returns the copy to the pool", () => {
    const run =
      createRun("buy-sell");

    const id =
      run.state.shop[0] as string;

    const poolBefore =
      run.state.pool[id];

    expect(applyAction(run, "b0").ok).toBe(true);
    expect(run.state.gold).toBe(0);
    expect(run.state.board).toHaveLength(1);
    expect(run.state.shop[0]).toBeNull();
    expect(applyAction(run, "b0").ok).toBe(false);

    const uid =
      run.state.board[0].uid;

    expect(applyAction(run, `s${uid}`).ok).toBe(true);
    expect(run.state.gold).toBe(1);
    expect(run.state.pool[id]).toBe(poolBefore + 1);
  });

  it("freeze keeps the shop for the next turn", () => {
    const run =
      createRun("freeze");

    const shop =
      [...run.state.shop];

    applyAction(run, "f");

    run.state.board = [
      unitOf(idWith("taunt"), 999, 999),
    ];

    applyAction(run, "e");

    expect(run.state.shop).toEqual(shop);
    expect(run.state.frozen).toBe(false);
  });

  it("three copies merge into a golden unit and open a discover", () => {
    const run =
      createRun("triple");

    const id =
      UNITS.find(
        (unit) => unit.tier === 1 && unit.ability === "taunt"
      )!.id;

    run.state.gold = 9;

    forceShop(
      run,
      [id, id, id]
    );

    applyAction(run, "b0");
    applyAction(run, "b1");
    applyAction(run, "b2");

    const def =
      UNIT_BY_ID.get(id)!;

    expect(run.state.board).toHaveLength(1);
    expect(run.state.board[0].golden).toBe(true);
    expect(run.state.board[0].atk).toBe(def.atk * 2);
    expect(run.state.board[0].hp).toBe(def.hp * 2);
    expect(run.state.discover).not.toBeNull();

    const options =
      run.state.discover!;

    for (const option of options) {
      expect(UNIT_BY_ID.get(option)!.tier).toBe(2);
    }

    // Blocked until you pick.
    expect(applyAction(run, "r").ok).toBe(false);
    expect(applyAction(run, "d0").ok).toBe(true);
    expect(run.state.board).toHaveLength(2);
    expect(run.state.board[1].id).toBe(options[0]);
  });

  it("Rally buffs matching allies when played", () => {
    const rally =
      UNITS.find(
        (unit) => unit.ability === "rally" && unit.rallyBy === "tribe" && unit.tier === 1
      )!;

    const friend =
      UNITS.find(
        (unit) => unit.tribe === rally.tribe && unit.id !== rally.id && unit.ability !== "rally"
      )!;

    const stranger =
      UNITS.find(
        (unit) => unit.tribe !== rally.tribe && unit.tribe !== null && unit.ability === "taunt"
      )!;

    const run =
      createRun("rally");

    run.state.board = [
      unitOf(friend.id),
      unitOf(stranger.id),
    ];

    forceShop(
      run,
      [rally.id]
    );

    applyAction(run, "b0");

    expect(run.state.board[0].atk).toBe(friend.atk + rally.power);
    expect(run.state.board[0].hp).toBe(friend.hp + rally.power);
    expect(run.state.board[1].atk).toBe(stranger.atk);
  });

  it("Ascend grows at the end of the turn", () => {
    const ascend =
      UNITS.find(
        (unit) => unit.ability === "ascend"
      )!;

    const run =
      createRun("ascend");

    const unit =
      unitOf(ascend.id, 500, 500);

    run.state.board = [unit];

    applyAction(run, "e");

    expect(run.state.board[0].atk).toBe(500 + ascend.power);
  });

  it("a full board sends buys to the bench; play puts them in a lane", () => {
    const run =
      createRun("bench");

    const taunt =
      idWith("taunt");

    run.state.board =
      UNITS.filter(
        (unit) => unit.tier === 1 && unit.id !== taunt
      )
        .slice(0, BOARD_MAX)
        .map(
          (unit, i) => unitOf(unit.id, undefined, undefined, false, [1, 0, 2][i % 3])
        );

    run.state.gold = 10;

    forceShop(
      run,
      [taunt]
    );

    expect(applyAction(run, "b0").ok).toBe(true);
    expect(run.state.bench).toHaveLength(1);

    const benchUid =
      run.state.bench[0].uid;

    expect(applyAction(run, `p${benchUid}.0`).ok).toBe(false);

    // Free a slot in the right lane: the mid lane is still full.
    const right =
      run.state.board.find(
        (unit) => unit.lane === 2
      )!;

    applyAction(run, `s${right.uid}`);

    expect(applyAction(run, `p${benchUid}.1`).ok).toBe(false);
    expect(applyAction(run, `p${benchUid}.3`).ok).toBe(false);
    expect(applyAction(run, `p${benchUid}.2`).ok).toBe(true);
    expect(run.state.board.find((unit) => unit.uid === benchUid)?.lane).toBe(2);
    expect(run.state.bench).toHaveLength(0);
  });

  it("buys fill the emptiest lane (mid first); max 3 per lane", () => {
    const run =
      createRun("lanes");

    run.state.gold = 99;

    const ids =
      UNITS.filter(
        (unit) => unit.tier === 1
      ).slice(0, 7);

    for (const unit of ids) {
      forceShop(run, [unit.id]);

      expect(applyAction(run, "b0").ok).toBe(true);
    }

    expect(laneCounts(run.state.board)).toEqual([2, 3, 2]);
    expect(run.state.board.slice(0, 3).map((unit) => unit.lane)).toEqual([1, 0, 2]);
  });

  it("move changes lane (or goes to the front of its own lane)", () => {
    const run =
      createRun("move");

    const a =
      unitOf(idWith("taunt"), undefined, undefined, false, 1);

    const b =
      unitOf(idWith("pierce"), undefined, undefined, false, 1);

    run.state.board = [b, a];

    expect(applyAction(run, `m${b.uid}.1`).ok).toBe(true);
    expect(run.state.board.map((unit) => unit.uid)).toEqual([a.uid, b.uid]);
    expect(applyAction(run, `m${b.uid}.0`).ok).toBe(true);
    expect(b.lane).toBe(0);
    expect(applyAction(run, `m${b.uid}.5`).ok).toBe(false);
  });

  it("t toggles ATTACK / DEFENSE on the board only", () => {
    const run =
      createRun("toggle");

    const a =
      unitOf(idWith("taunt"));

    run.state.board = [a];

    expect(applyAction(run, `t${a.uid}`).ok).toBe(true);
    expect(a.def).toBe(true);
    expect(applyAction(run, `t${a.uid}`).ok).toBe(true);
    expect(a.def).toBe(false);
    expect(applyAction(run, "t9999").ok).toBe(false);
  });

  it("traps: bought into a free zone (mid first), moved, sold; 3 max", () => {
    const run =
      createRun("traps");

    run.state.gold = 99;

    for (const id of ["trap-hole", "waboku", "sakuretsu-armor"]) {
      forceShop(run, [id]);

      expect(applyAction(run, "b0").ok).toBe(true);
    }

    expect(run.state.traps.map((trap) => trap.lane)).toEqual([1, 0, 2]);
    expect(run.state.board).toHaveLength(0);

    forceShop(run, ["mirror-force"]);

    const full =
      applyAction(run, "b0");

    expect(full.ok).toBe(false);

    const [hole, waboku] =
      run.state.traps;

    // Moving onto an occupied lane swaps the two traps.
    expect(applyAction(run, `m${hole.uid}.0`).ok).toBe(true);
    expect(hole.lane).toBe(0);
    expect(waboku.lane).toBe(1);

    const pool =
      run.state.pool["trap-hole"];

    expect(applyAction(run, `s${hole.uid}`).ok).toBe(true);
    expect(run.state.traps).toHaveLength(2);
    expect(run.state.pool["trap-hole"]).toBe(pool + 1);
  });
});

// ---------------------------------------------------------
// lane combat
// ---------------------------------------------------------

describe("lane combat", () => {
  const plain =
    UNITS.find(
      (unit) => unit.ability === "pierce" && unit.attribute !== "WIND" && unit.tribe !== "Warrior" && unit.tribe !== "Dragon"
    )!.id;

  const ticks = (
    outcome: ReturnType<typeof fight>
  ) =>
    outcome.frames.filter(
      (frame) => frame.ev.k === "tick"
    );

  it("an attacker marches its empty lane one tile per tick and hits the castle", () => {
    const mine =
      unitOf(plain, 3, 5, false, 0);

    const outcome =
      fight(
        [mine],
        [enemy(0, 50, [], 1, 2, true)]
      );

    const ys =
      ticks(outcome)
        .map(
          (frame) => frame.mine.find((unit) => unit.uid === mine.uid)?.y
        )
        .filter(
          (y) => y !== undefined
        );

    expect(ys.slice(0, 3)).toEqual([2, 3, 4]);
    // Their wall still holds lane 2 at the end: 1 chip damage.
    expect(outcome.dealt).toBe(castleDamage(UNIT_BY_ID.get(plain)!.level, false, false));
    expect(outcome.damage).toBe(1);
  });

  it("front units that meet clash simultaneously", () => {
    const outcome =
      fight(
        [unitOf(plain, 5, 5)],
        [enemy(5, 5)]
      );

    expect(outcome.result).toBe("tie");
    expect(outcome.damage).toBe(0);
    expect(outcome.dealt).toBe(0);
  });

  it("a DEFENSE wall stays put, has double DEF and blocks its lane", () => {
    const wall =
      unitOf(plain, 4, 10, false, 1, true);

    const outcome =
      fight(
        [wall],
        [enemy(3, 100)]
      );

    const first =
      outcome.frames[0].mine[0];

    expect(first.maxHp).toBe(20);
    expect(first.y).toBe(1);

    for (const frame of ticks(outcome)) {
      const alive =
        frame.mine.find((unit) => unit.uid === wall.uid);

      if (alive) {
        expect(alive.y).toBe(1);
        expect(frame.castle[0]).toBe(0);
      }
    }

    // It struck back at half ATK (2): the attacker lost health.
    const foe =
      outcome.frames[outcome.frames.length - 1].foe[0];

    expect(foe === undefined || foe.hp < 100).toBe(true);
  });

  it("Guardian walls get triple DEF", () => {
    const outcome =
      fight(
        [unitOf(idWith("taunt"), 1, 10, false, 1, true)],
        [enemy(0, 1, [], 1, 0, true)]
      );

    expect(outcome.frames[0].mine[0].maxHp).toBe(30);
  });

  it("castle damage per combat is capped by wave", () => {
    const swarm =
      [0, 0, 1, 1, 2, 2, 1].map(
        (lane) => enemy(1, 1, [], 1, lane, false, 12)
      );

    expect(fight([], swarm).damage).toBe(4);
    expect(fight([], swarm, "w5", { wave: 5 }).damage).toBe(7);
    expect(fight([], swarm, "w9", { wave: 9 }).damage).toBe(10);
    expect(fight([], swarm).result).toBe("loss");
  });

  it("Pierce spills excess damage into the castle when nobody stands behind", () => {
    const outcome =
      fight(
        [unitOf(plain, 10, 50)],
        [enemy(0, 2), enemy(0, 50, [], 1, 2, true)]
      );

    expect(outcome.dealt).toBeGreaterThanOrEqual(1);
  });

  it("Spellbound absorbs one hit, Venom destroys, Reborn returns once", () => {
    const shieldId =
      idWith("shield");

    const shielded =
      fight(
        [unitOf(plain, 2, 1, false, 0, true)],
        [enemy(0, 3, ["shield"], 1, 0)]
      );

    expect(ticks(shielded).some((frame) => frame.ev.k === "tick" && frame.ev.hits.some((h) => h.amt === 0))).toBe(true);

    const venom =
      fight(
        [unitOf(idWith("venom"), 1, 50)],
        [enemy(0, 999)]
      );

    expect(venom.frames[venom.frames.length - 1].foe).toHaveLength(0);

    const reborn =
      fight(
        [unitOf(plain, 5, 1)],
        [enemy(1, 5, ["revive"])]
      );

    const foeUids =
      new Set(
        ticks(reborn).flatMap(
          (frame) => frame.foe.map((unit) => `${unit.uid}:${unit.hp}`)
        )
      );

    expect([...foeUids].some((key) => key.endsWith(":1"))).toBe(true);
    expect(shieldId).toBeTruthy();
  });

  it("stalemates end: all-DEF vs all-DEF stops at once, held lanes chip", () => {
    const outcome =
      fight(
        [unitOf(plain, 3, 9, false, 0, true)],
        [enemy(3, 9, [], 1, 2, true)]
      );

    expect(outcome.frames.filter((frame) => frame.ev.k === "tick").length).toBeLessThanOrEqual(1);
    expect(outcome.damage).toBe(1);
    expect(outcome.dealt).toBe(1);
    expect(outcome.recap).toEqual([
      "Left: You held the lane",
      "Mid: Quiet",
      "Right: They held the lane",
    ]);

    // A 0-ATK attacker stuck on a 0-counter wall: ends after STALL_TICKS.
    const stuck =
      fight(
        [unitOf(plain, 0, 9)],
        [enemy(1, 99, [], 1, 1, true)]
      );

    expect(stuck.frames.filter((frame) => frame.ev.k === "tick").length).toBeLessThan(20);
  });

  it("every death carries its cause; the recap names traps and breakthroughs", () => {
    const outcome =
      fight(
        [unitOf(plain, 9, 9, false, 0)],
        [enemy(9, 9, [], 1, 1)],
        "t",
        {
          mine: [
            {
              id: "sakuretsu-armor",
              lane: 1,
            },
          ],
        }
      );

    const deaths =
      outcome.frames.flatMap(
        (frame) => (frame.ev.k === "tick" ? frame.ev.deaths : [])
      );

    expect(deaths).toEqual([expect.objectContaining({ side: 1, lane: 1, by: "sakuretsu-armor" })]);
    expect(outcome.recap[0]).toMatch(/^Left: .* broke through, -\d+ LP to their castle/);
    expect(outcome.recap[1]).toBe("Mid: Your Sakuretsu Armor destroyed an attacker");
  });

  it("is deterministic for the same input", () => {
    const board = [
      unitOf(plain, 4, 6, false, 0),
      unitOf(idWith("ambush"), 3, 4, false, 1),
    ];

    const foes = [
      enemy(3, 6, ["lastwill"], 2, 0),
      enemy(2, 9, ["spawn"], 2, 1),
    ];

    expect(fight(board, foes, "same")).toEqual(fight(board, foes, "same"));
  });
});

// ---------------------------------------------------------
// traps
// ---------------------------------------------------------

describe("traps", () => {
  const plain =
    UNITS.find(
      (unit) => unit.ability === "pierce" && unit.attribute !== "WIND" && unit.tribe !== "Warrior" && unit.tribe !== "Dragon"
    )!.id;

  const flipsOf = (
    outcome: ReturnType<typeof fight>
  ) =>
    outcome.frames.flatMap(
      (frame) => (frame.ev.k === "tick" ? frame.ev.traps : [])
    );

  const set = (
    id: string,
    lane = 1
  ) => [
    {
      id,
      lane,
    },
  ];

  it("Sakuretsu Armor destroys the first attacker entering your half", () => {
    const outcome =
      fight([], [enemy(9, 9)], "t", { mine: set("sakuretsu-armor") });

    expect(flipsOf(outcome)).toEqual([expect.objectContaining({ side: 0, id: "sakuretsu-armor", lane: 1 })]);
    expect(outcome.damage).toBe(0);
  });

  it("Trap Hole needs 5+ ATK", () => {
    expect(flipsOf(fight([], [enemy(4, 9)], "t", { mine: set("trap-hole") }))).toHaveLength(0);
    expect(flipsOf(fight([], [enemy(5, 9)], "t", { mine: set("trap-hole") }))).toHaveLength(1);
  });

  it("Negate Attack sends the attacker back to its start", () => {
    const outcome =
      fight([], [enemy(1, 9)], "t", { mine: set("negate-attack") });

    const flipped =
      outcome.frames.find(
        (frame) => frame.ev.k === "tick" && frame.ev.traps.length > 0
      )!;

    expect(flipped.foe[0].y).toBe(1);
  });

  it("Magic Cylinder bounces the attacker and burns the enemy castle", () => {
    const outcome =
      fight([], [enemy(1, 9, [], 1, 1, false, 8)], "t", { mine: set("magic-cylinder") });

    expect(outcome.dealt).toBe(castleDamage(8, false, false));
  });

  it("Waboku: no castle damage from that lane", () => {
    const outcome =
      fight([], [enemy(1, 9)], "t", { mine: set("waboku") });

    expect(outcome.damage).toBe(0);
    expect(flipsOf(outcome)).toHaveLength(1);

    const other =
      fight([], [enemy(1, 9, [], 1, 0)], "t", { mine: set("waboku") });

    expect(other.damage).toBeGreaterThan(0);
  });

  it("Call of the Haunted revives your first destroyed monster in that lane", () => {
    const outcome =
      fight([unitOf(plain, 1, 3)], [enemy(5, 50)], "t", { mine: set("call-of-the-haunted") });

    expect(flipsOf(outcome)).toEqual([expect.objectContaining({ id: "call-of-the-haunted" })]);
  });

  it("Mirror Force destroys two attackers in the lane", () => {
    const outcome =
      fight([], [enemy(1, 9), enemy(1, 9)], "t", { mine: set("mirror-force") });

    expect(flipsOf(outcome)[0].dst).toHaveLength(2);
    expect(outcome.damage).toBe(0);
  });

  it("Dimensional Prison banishes: no Reborn", () => {
    const outcome =
      fight([], [enemy(1, 9, ["revive"])], "t", { mine: set("dimensional-prison") });

    expect(outcome.damage).toBe(0);
    expect(outcome.frames[outcome.frames.length - 1].foe).toHaveLength(0);
  });

  it("Torrential Tribute wipes every monster in the lane, yours too", () => {
    const outcome =
      fight([unitOf(plain, 1, 50, false, 1, true)], [enemy(1, 9)], "t", { mine: set("torrential-tribute") });

    expect(flipsOf(outcome)[0].dst).toHaveLength(2);
    expect(outcome.frames[outcome.frames.length - 1].mine).toHaveLength(0);
  });

  it("enemy traps hit your attackers, once per combat", () => {
    const outcome =
      fight(
        [unitOf(plain, 9, 9), unitOf(plain, 9, 9)],
        [enemy(0, 1, [], 1, 0, true)],
        "t",
        { theirs: set("sakuretsu-armor") }
      );

    expect(flipsOf(outcome)).toEqual([expect.objectContaining({ side: 1 })]);
    expect(outcome.dealt).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------
// waves
// ---------------------------------------------------------

describe("waves", () => {
  it("Boss waves grow, fit the lanes, and set traps later on", () => {
    const order =
      createRun("waves").state.bossOrder;

    let previous = 0;

    for (let w = 1; w <= MAX_WAVES; w++) {
      const bw =
        bossWave(order, w);

      const total =
        bw.units.reduce(
          (sum, unit) => sum + unit.atk + unit.hp,
          0
        );

      expect(bw.units.length).toBeGreaterThan(0);
      expect(bw.units.length).toBeLessThanOrEqual(BOARD_MAX);
      expect(Math.max(...laneCounts(bw.units))).toBeLessThanOrEqual(3);
      expect(total).toBeGreaterThanOrEqual(previous);
      expect(bw.traps.length).toBe(w >= MAX_WAVES ? 3 : w >= 8 ? 2 : w >= 5 ? 1 : 0);

      previous = total;
    }
  });

  it("the last wave is always a Boss, even with a ghost for it", () => {
    const ghost = {
      id: "g",
      name: "x",
      units: [
        {
          id: UNITS[0].id,
          atk: 1,
          hp: 1,
          golden: false,
          lane: 1,
          def: false,
        },
      ],
      traps: [],
    };

    const run =
      createRun("finale", new Array(MAX_WAVES).fill(ghost));

    expect(foeFor(run.state, 1).kind).toBe("ghost");
    expect(foeFor(run.state, MAX_WAVES).kind).toBe("boss");
  });

  it("the combat result names the wave that was fought", () => {
    const run =
      createRun("wave-label");

    const first =
      applyAction(run, "e");

    expect(first.ok && first.combat?.wave).toBe(1);
    expect(run.state.turn).toBe(2);
  });

  it("losing takes health, the run ends at 0", () => {
    const run =
      createRun("lose");

    while (!run.state.over) {
      applyAction(run, "e");
    }

    expect(run.state.health).toBe(0);
    expect(run.state.victory).toBe(false);
    expect(run.state.losses).toBeGreaterThan(0);
  });
});
