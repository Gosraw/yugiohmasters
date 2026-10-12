import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createPrng,
} from "../prng";

import {
  applyAction,
  bossWave,
  createRun,
  replayLog,
  resolveCombat,
  restoreRun,
  runScore,
  validateRun,
  BOARD_MAX,
  ENGINE_VERSION,
  MAX_WAVES,
  START_HEALTH,
  type BossUnitSpec,
  type BossWave,
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
  golden = false
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
  };
}

function enemy(
  atk: number,
  hp: number,
  keywords: BossUnitSpec["keywords"] = [],
  power = 1
): BossUnitSpec {
  return {
    name: "Dummy",
    img: "",
    atk,
    hp,
    boss: false,
    keywords,
    power,
  };
}

function wave(
  units: BossUnitSpec[],
  number = 1
): BossWave {
  return {
    wave: number,
    route: "test",
    routeName: "Test",
    tier: 1,
    units,
  };
}

function fight(
  board: Unit[],
  foes: BossUnitSpec[],
  seed = "fight"
) {
  return resolveCombat(
    board,
    wave(foes),
    createPrng(seed),
    true
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

      expect(verdict).toEqual({
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

  it("a run cannot go past wave 20", () => {
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
            (unit) => unitOf(unit.id, 999, 999)
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

  it("a full board sends buys to the bench; play moves them over", () => {
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
          (unit) => unitOf(unit.id)
        );

    run.state.gold = 10;

    const shopId =
      taunt;

    forceShop(
      run,
      [shopId]
    );

    expect(applyAction(run, "b0").ok).toBe(true);
    expect(run.state.bench).toHaveLength(1);

    const benchUid =
      run.state.bench[0].uid;

    expect(applyAction(run, `p${benchUid}.0`).ok).toBe(false);

    applyAction(run, `s${run.state.board[3].uid}`);

    expect(applyAction(run, `p${benchUid}.0`).ok).toBe(true);
    expect(run.state.board[0].uid).toBe(benchUid);
    expect(run.state.bench).toHaveLength(0);
  });

  it("moves reorder the board", () => {
    const run =
      createRun("move");

    const a =
      unitOf(idWith("taunt"));

    const b =
      unitOf(idWith("pierce"));

    run.state.board = [a, b];

    expect(applyAction(run, `m${b.uid}.0`).ok).toBe(true);
    expect(run.state.board.map((unit) => unit.uid)).toEqual([b.uid, a.uid]);
    expect(applyAction(run, `m${b.uid}.5`).ok).toBe(false);
  });
});

// ---------------------------------------------------------
// combat abilities
// ---------------------------------------------------------

describe("combat", () => {
  const plain =
    UNITS.find(
      (unit) => unit.ability === "taunt" && unit.tribe === "Machine"
    )!.id;

  it("an empty board loses, and damage is capped early", () => {
    const outcome =
      fight(
        [],
        [enemy(5, 5)]
      );

    expect(outcome.result).toBe("loss");
    expect(outcome.damage).toBe(2);
  });

  it("two units that cannot hurt each other tie", () => {
    const outcome =
      fight(
        [unitOf(plain, 0, 5)],
        [enemy(0, 5)]
      );

    expect(outcome.result).toBe("tie");
  });

  it("mutual destruction is a tie", () => {
    const outcome =
      fight(
        [unitOf(plain, 5, 5)],
        [enemy(5, 5)]
      );

    expect(outcome.result).toBe("tie");
  });

  it("Guardian (taunt) must be attacked first", () => {
    for (let i = 0; i < 20; i++) {
      const outcome =
        fight(
          [unitOf(plain, 1, 50)],
          [
            enemy(0, 100),
            enemy(0, 100, ["taunt"]),
            enemy(0, 100),
          ],
          `taunt-${i}`
        );

      const firstAttack =
        outcome.frames.find(
          (frame) => frame.ev.k === "attack" && frame.ev.src < 10000
        );

      expect(firstAttack?.ev).toMatchObject({
        dst: 10001,
      });
    }
  });

  it("Spellbound (shield) absorbs exactly one hit", () => {
    const outcome =
      fight(
        [unitOf(plain, 1, 3)],
        [enemy(2, 100, ["shield"])]
      );

    const foeHp =
      outcome.frames.map(
        (frame) => frame.foe[0]?.hp
      );

    // The first exchange (either side attacking) popped the
    // shield: health is still 100 after it.
    const firstHit =
      outcome.frames.findIndex(
        (frame) => frame.ev.k === "attack"
      );

    expect(outcome.frames[firstHit].foe[0].shield).toBe(false);
    expect(foeHp[firstHit]).toBe(100);
  });

  it("Reborn returns once with 1 health", () => {
    const outcome =
      fight(
        [unitOf(plain, 10, 100)],
        [enemy(1, 5, ["revive"])]
      );

    const revived =
      outcome.frames.some(
        (frame) => frame.foe[0]?.hp === 1
      );

    expect(revived).toBe(true);
    expect(outcome.result).toBe("win");
  });

  it("Pierce sends excess damage to the neighbour", () => {
    const pierce =
      UNITS.find(
        (unit) => unit.ability === "pierce" && unit.attribute !== "WIND"
      )!.id;

    const outcome =
      fight(
        [unitOf(pierce, 10, 100)],
        [
          enemy(0, 4, ["taunt"]),
          enemy(0, 50),
        ]
      );

    const afterFirst =
      outcome.frames.find(
        (frame) => frame.ev.k === "attack"
      )!;

    // 10 damage into a 4-health Guardian: 6 carries over.
    expect(afterFirst.foe).toHaveLength(1);
    expect(afterFirst.foe[0].hp).toBe(44);
  });

  it("Venom destroys whatever it damages", () => {
    const outcome =
      fight(
        [unitOf(plain, 1, 100)],
        [enemy(1, 1000, ["venom"])]
      );

    expect(outcome.result).toBe("loss");
  });

  it("Double Attack swings twice", () => {
    const double =
      UNITS.find(
        (unit) => unit.ability === "double"
      )!.id;

    const outcome =
      fight(
        [unitOf(double, 1, 100)],
        [enemy(0, 100), enemy(0, 100)],
        "double"
      );

    const attacks =
      outcome.frames.filter(
        (frame) => frame.ev.k === "attack" && frame.ev.src < 10000
      );

    // The first player turn has two consecutive attack frames by the same unit.
    expect(attacks.length).toBeGreaterThanOrEqual(2);

    const first =
      outcome.frames.findIndex(
        (frame) => frame.ev.k === "attack"
      );

    expect(outcome.frames[first].ev).toMatchObject({
      k: "attack",
    });
    expect(outcome.frames[first + 1].ev).toMatchObject({
      k: "attack",
      src: (outcome.frames[first].ev as { src: number }).src,
    });
  });

  it("Last Will buffs a random ally; Summon leaves a token", () => {
    const outcome =
      fight(
        [unitOf(plain, 50, 500)],
        [
          enemy(1, 1, ["lastwill"], 4),
          enemy(1, 30),
        ]
      );

    const buffed =
      outcome.frames.some(
        (frame) => frame.foe.some((unit) => unit.atk === 5 && unit.maxHp === 34)
      );

    expect(buffed).toBe(true);

    const spawn =
      fight(
        [unitOf(plain, 50, 500)],
        [enemy(1, 1, ["spawn"], 3)]
      );

    expect(
      spawn.frames.some(
        (frame) => frame.foe.some((unit) => unit.token && unit.atk === 3)
      )
    ).toBe(true);
  });

  it("Summon does nothing on a full board", () => {
    const foes =
      Array.from(
        {
          length: BOARD_MAX,
        },
        () => enemy(0, 1, ["spawn"], 2)
      );

    const outcome =
      fight(
        [unitOf(plain, 1, 999)],
        foes
      );

    for (const frame of outcome.frames) {
      expect(frame.foe.length).toBeLessThanOrEqual(BOARD_MAX);
    }
  });

  it("Ambush hits before any attack", () => {
    const outcome =
      fight(
        [unitOf(plain, 1, 100)],
        [enemy(1, 3, ["ambush"], 3)]
      );

    expect(outcome.frames[1].ev.k).toBe("ambush");
    expect(outcome.frames[1].mine[0].hp).toBe(97);
  });

  it("attribute synergy: 3 EARTH units get +1/+2", () => {
    const earth =
      UNITS.filter(
        (unit) => unit.attribute === "EARTH" && unit.ability === "taunt"
      );

    const extraEarth =
      UNITS.filter(
        (unit) => unit.attribute === "EARTH" && unit.ability === "pierce"
      );

    const ids =
      [...earth, ...extraEarth].slice(0, 3);

    expect(ids).toHaveLength(3);

    const board =
      ids.map(
        (def) => unitOf(def.id, 1, 10)
      );

    const outcome =
      fight(
        board,
        [enemy(0, 999)]
      );

    const start =
      outcome.frames[0].mine;

    for (const unit of start) {
      expect(unit.hp).toBeGreaterThanOrEqual(12);
      expect(unit.atk).toBeGreaterThanOrEqual(2);
    }
  });

  it("Boss waves grow and stay within the board limit", () => {
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
      expect(total).toBeGreaterThanOrEqual(previous);

      previous = total;
    }
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
