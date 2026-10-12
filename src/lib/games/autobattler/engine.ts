import {
  createPrng,
  type Prng,
} from "../prng";

import {
  FUSIONS,
  ROUTES,
  ROUTE_BY_CODE,
  UNITS,
  UNIT_BY_ID,
  XYZ_BY_RANK,
  type Attribute,
  type BossRouteUnit,
  type CombatKeyword,
  type FusionMaterial,
  type SynergyKey,
  type Tribe,
  type UnitDef,
} from "./units";

// =========================================================
// SHADOW ARENA - pure, deterministic auto battler engine
// (no DOM, no Date, no Math.random).
//
// The browser plays it live; the server action replays the
// recorded action log from the same seed and only trusts the
// score the replay produces. Everything random draws from the
// seeded PRNG (src/lib/games/prng.ts):
//   `${seed}:shop`           every shop roll / discover, in order
//   `${seed}:bosses`         the order of the Boss waves
//   `${seed}:combat:${turn}` target picks inside one combat
// Only integer math is used, so V8 and JavaScriptCore agree.
//
// Action log: an array of short strings, one per player action.
//   b<slot>        buy the unit in shop slot <slot>
//   s<uid>         sell unit <uid> (board or bench)
//   p<uid>.<pos>   play bench unit <uid> onto the board at <pos>
//   m<uid>.<pos>   move board unit <uid> to <pos>
//   r              refresh the shop (1 gold)
//   f              freeze / unfreeze the shop
//   u              upgrade the shop tier
//   d<i>           pick discover option <i> (after a triple)
//   x<a>.<b>       Overlay: units <a> + <b> (same Level) -> Xyz
//   c<r>.<a>[.<b>] Polymerization: fusion recipe <r> from <a>(,<b>)
//   e              end the turn -> combat vs this wave's opponent
//
// Opponents (v2): a league-mate's "ghost" board when the server
// assigned one for that turn when the run started (frozen with
// the run, see ghosts.ts), otherwise the wave's computer Boss.
// After every shop phase the board is recorded in
// state.snapshots; the server stores those (from ITS replay)
// as ghosts for friends once the run validates.
//
// Fusion / Xyz cost no gold (the materials are the price): the
// materials leave the run for good (not back to the pool) and
// the new monster keeps half of the stats they had gained.
// =========================================================

/** v2 (2026-10-12): 12 waves, ghosts, Fusion + Xyz. */
export const ENGINE_VERSION = 2;

export const MAX_WAVES = 12;

export const START_HEALTH = 20;

export const BOARD_MAX = 7;

export const BENCH_MAX = 5;

export const UNIT_COST = 3;

export const SELL_VALUE = 1;

export const ROLL_COST = 1;

export const MAX_GOLD = 10;

export const MAX_TIER = 6;

/** Cost to go from tier t to t+1 (index = current tier). */
export const TIER_UP_COST = [
  0,
  5,
  7,
  8,
  9,
  10,
];

/** Shop slots per shop tier. */
export const SHOP_SIZE = [
  0,
  3,
  4,
  4,
  5,
  5,
  6,
];

/** Copies of every unit in the run's shared pool, per unit tier. */
export const COPIES_PER_TIER = [
  0,
  7,
  6,
  6,
  5,
  4,
  3,
];

/** Hard cap per turn: bounds the server replay cost. */
export const MAX_ACTIONS_PER_TURN = 200;

export const MAX_LOG_ACTIONS =
  MAX_WAVES * MAX_ACTIONS_PER_TURN;

const MAX_COMBAT_STEPS = 400;

/** Max damage of one lost fight: waves 1-3, 4-6, 7+. */
export const DAMAGE_CAP = [
  4,
  7,
  10,
] as const;

/** Shop-phase timer (seconds) for a turn. */
export function turnSeconds(
  turn: number
) {
  return turn <= 3
    ? 30
    : Math.min(
        45,
        30 + (turn - 3) * 3
      );
}

export function waveTier(
  wave: number
) {
  return Math.min(
    MAX_TIER,
    1 + Math.floor((wave - 1) / 2)
  );
}

/** Total enemy stats (attack + health) of a Boss wave. */
export function bossBudget(
  wave: number
) {
  // Hand-tuned with the greedy bot (balance.test.ts): median
  // ~wave 9, a full clear of all 12 only now and then.
  const table = [
    0,
    4, 7, 13, 21, 31, 43, 56, 72, 92, 118,
    152, 196,
  ];

  return table[Math.min(wave, MAX_WAVES)];
}

// ---------------------------------------------------------
// Types
// ---------------------------------------------------------

export type Unit = {
  uid: number;
  id: string;
  atk: number;
  hp: number;
  golden: boolean;
};

export type WaveRecord = {
  wave: number;
  /** Boss route code, or "ghost" for a friend's board. */
  route: string;
  /** Display name of the opponent. */
  foe: string;
  result: "win" | "loss" | "tie";
  damage: number;
};

/** One unit of a recorded board (a "ghost" for friends). */
export type GhostUnit = {
  id: string;
  atk: number;
  hp: number;
  golden: boolean;
};

/** A league-mate's recorded board, frozen into a run at start. */
export type GhostBoard = {
  /** Snapshot id (server row id). */
  id: string;
  /** The friend's duelist name. */
  name: string;
  units: GhostUnit[];
};

/** Your board as it went into the fight of `turn`. */
export type BoardSnapshot = {
  turn: number;
  units: GhostUnit[];
};

export type RunState = {
  seed: string;
  turn: number;
  health: number;
  gold: number;
  maxGold: number;
  tier: number;
  tierCost: number;
  shop: (string | null)[];
  frozen: boolean;
  board: Unit[];
  bench: Unit[];
  pool: Record<string, number>;
  discover: string[] | null;
  discoverQueue: number;
  nextUid: number;
  wins: number;
  losses: number;
  ties: number;
  survived: number;
  over: boolean;
  victory: boolean;
  bossOrder: string[];
  /** Index turn - 1: the ghost you fight that turn, or null (Boss). */
  ghosts: (GhostBoard | null)[];
  snapshots: BoardSnapshot[];
  history: WaveRecord[];
  actionsThisTurn: number;
  log: string[];
};

export type Run = {
  state: RunState;
  shopRng: Prng;
};

export type CombatSnap = {
  uid: number;
  name: string;
  img: string;
  atk: number;
  hp: number;
  maxHp: number;
  shield: boolean;
  taunt: boolean;
  golden: boolean;
  boss: boolean;
  token: boolean;
  kw: CombatKeyword[];
};

export type CombatEvent =
  | {
      k: "start";
    }
  | {
      k: "ambush";
      src: number | null;
      dst: number[];
      amt: number;
    }
  | {
      k: "attack";
      src: number;
      dst: number;
    }
  | {
      k: "end";
      result: "win" | "loss" | "tie";
      damage: number;
    };

export type CombatFrame = {
  ev: CombatEvent;
  mine: CombatSnap[];
  foe: CombatSnap[];
};

export type CombatResult = {
  wave: number;
  route: string;
  foe: string;
  result: "win" | "loss" | "tie";
  damage: number;
  frames: CombatFrame[];
};

export type ApplyResult =
  | {
      ok: true;
      combat?: CombatResult;
    }
  | {
      ok: false;
      error: string;
    };

// ---------------------------------------------------------
// Run setup
// ---------------------------------------------------------

function shuffledBossOrder(
  seed: string
) {
  const rng =
    createPrng(`${seed}:bosses`);

  const codes =
    ROUTES.map(
      (route) => route.code
    );

  for (let i = codes.length - 1; i > 0; i--) {
    const j =
      rng.int(0, i);

    [codes[i], codes[j]] = [codes[j], codes[i]];
  }

  return codes.slice(0, MAX_WAVES);
}

/**
 * Clean up a ghost list (from the server or the browser): index
 * turn - 1, unknown units dropped, numbers clamped. Both the
 * browser and the server replay run this, so they agree.
 */
export function normalizeGhosts(
  input: unknown
): (GhostBoard | null)[] {
  const out: (GhostBoard | null)[] =
    new Array(MAX_WAVES).fill(null);

  if (!Array.isArray(input)) {
    return out;
  }

  input.forEach(
    (entry, index) => {
      if (
        index >= MAX_WAVES ||
        typeof entry !== "object" ||
        entry === null
      ) {
        return;
      }

      const raw =
        entry as {
          id?: unknown;
          name?: unknown;
          units?: unknown;
        };

      if (
        typeof raw.id !== "string" ||
        raw.id.length === 0 ||
        raw.id.length > 64 ||
        !Array.isArray(raw.units)
      ) {
        return;
      }

      const units: GhostUnit[] = [];

      for (const item of raw.units.slice(0, BOARD_MAX)) {
        const unit =
          item as Partial<GhostUnit> | null;

        if (
          !unit ||
          typeof unit.id !== "string" ||
          !UNIT_BY_ID.has(unit.id) ||
          !Number.isInteger(unit.atk) ||
          !Number.isInteger(unit.hp)
        ) {
          continue;
        }

        units.push({
          id: unit.id,
          atk: Math.min(9999, Math.max(0, unit.atk as number)),
          hp: Math.min(9999, Math.max(1, unit.hp as number)),
          golden: unit.golden === true,
        });
      }

      if (units.length === 0) {
        return;
      }

      out[index] = {
        id: raw.id,
        name:
          typeof raw.name === "string" && raw.name.trim()
            ? raw.name.trim().slice(0, 40)
            : "A friend",
        units,
      };
    }
  );

  return out;
}

/** The ghost snapshot id per turn (null = Boss): goes into the log. */
export function ghostIds(
  ghosts: readonly (GhostBoard | null)[]
) {
  return Array.from(
    {
      length: MAX_WAVES,
    },
    (_, i) => ghosts[i]?.id ?? null
  );
}

export function createRun(
  seed: string,
  ghosts: unknown = []
): Run {
  const pool: Record<string, number> = {};

  for (const unit of UNITS) {
    pool[unit.id] =
      COPIES_PER_TIER[unit.tier];
  }

  const state: RunState = {
    seed,
    turn: 1,
    health: START_HEALTH,
    gold: 3,
    maxGold: 3,
    tier: 1,
    tierCost: TIER_UP_COST[1],
    shop: [],
    frozen: false,
    board: [],
    bench: [],
    pool,
    discover: null,
    discoverQueue: 0,
    nextUid: 1,
    wins: 0,
    losses: 0,
    ties: 0,
    survived: 0,
    over: false,
    victory: false,
    bossOrder: shuffledBossOrder(seed),
    ghosts: normalizeGhosts(ghosts),
    snapshots: [],
    history: [],
    actionsThisTurn: 0,
    log: [],
  };

  const run: Run = {
    state,
    shopRng: createPrng(`${seed}:shop`),
  };

  rollShop(run);

  return run;
}

export function runScore(
  state: RunState
) {
  return (
    state.survived * 10000 +
    Math.max(0, state.health) * 100 +
    state.wins
  );
}

export function describeScore(
  score: number
) {
  const survived =
    Math.floor(score / 10000);

  const health =
    Math.floor((score % 10000) / 100);

  const wins =
    score % 100;

  return {
    survived,
    health,
    wins,
  };
}

// ---------------------------------------------------------
// Shop
// ---------------------------------------------------------

function drawFromPool(
  run: Run,
  minTier: number,
  maxTier: number,
  exclude?: Set<string>
): string | null {
  const {
    pool,
  } = run.state;

  let total = 0;

  for (const unit of UNITS) {
    if (
      unit.tier >= minTier &&
      unit.tier <= maxTier &&
      !exclude?.has(unit.id)
    ) {
      total += pool[unit.id];
    }
  }

  if (total <= 0) {
    return null;
  }

  let pick =
    run.shopRng.int(0, total - 1);

  for (const unit of UNITS) {
    if (
      unit.tier < minTier ||
      unit.tier > maxTier ||
      exclude?.has(unit.id)
    ) {
      continue;
    }

    if (pick < pool[unit.id]) {
      pool[unit.id] -= 1;

      return unit.id;
    }

    pick -= pool[unit.id];
  }

  return null;
}

function returnShop(
  state: RunState
) {
  for (const id of state.shop) {
    if (id) {
      state.pool[id] += 1;
    }
  }

  state.shop = [];
}

function rollShop(
  run: Run
) {
  const {
    state,
  } = run;

  returnShop(state);

  const shop: (string | null)[] = [];

  for (let i = 0; i < SHOP_SIZE[state.tier]; i++) {
    shop.push(
      drawFromPool(
        run,
        1,
        state.tier
      )
    );
  }

  state.shop = shop;
}

function newUnit(
  state: RunState,
  id: string
): Unit {
  const def =
    UNIT_BY_ID.get(id) as UnitDef;

  const unit: Unit = {
    uid: state.nextUid,
    id,
    atk: def.atk,
    hp: def.hp,
    golden: false,
  };

  state.nextUid += 1;

  return unit;
}

function triggerRally(
  state: RunState,
  unit: Unit
) {
  const def =
    UNIT_BY_ID.get(unit.id) as UnitDef;

  if (def.ability !== "rally") {
    return;
  }

  const amount =
    def.power * (unit.golden ? 2 : 1);

  for (const other of state.board) {
    if (other.uid === unit.uid) {
      continue;
    }

    const otherDef =
      UNIT_BY_ID.get(other.id) as UnitDef;

    const matches =
      def.rallyBy === "tribe"
        ? def.tribe !== null && otherDef.tribe === def.tribe
        : otherDef.attribute === def.attribute;

    if (matches) {
      other.atk += amount;
      other.hp += amount;
    }
  }
}

/** Board if there is room (Rally triggers), else bench. */
function placeUnit(
  state: RunState,
  unit: Unit
) {
  if (state.board.length < BOARD_MAX) {
    state.board.push(unit);

    triggerRally(
      state,
      unit
    );
  } else {
    state.bench.push(unit);
  }
}

function hasRoom(
  state: RunState
) {
  return (
    state.board.length < BOARD_MAX ||
    state.bench.length < BENCH_MAX
  );
}

/** Three normal copies of a unit merge into one golden unit. */
function checkTriples(
  run: Run
) {
  const {
    state,
  } = run;

  for (;;) {
    const counts =
      new Map<string, number>();

    let tripled: string | null =
      null;

    for (const unit of [...state.board, ...state.bench]) {
      if (
        unit.golden ||
        isSpecialUnit(unit)
      ) {
        continue;
      }

      const count =
        (counts.get(unit.id) ?? 0) + 1;

      counts.set(unit.id, count);

      if (
        count >= 3 &&
        tripled === null
      ) {
        tripled = unit.id;
      }
    }

    if (!tripled) {
      break;
    }

    const def =
      UNIT_BY_ID.get(tripled) as UnitDef;

    const copies =
      [...state.board, ...state.bench]
        .filter(
          (unit) => !unit.golden && unit.id === tripled
        )
        .slice(0, 3);

    const golden: Unit = {
      uid: state.nextUid,
      id: tripled,
      atk: copies.reduce((sum, unit) => sum + unit.atk, 0) - def.atk,
      hp: copies.reduce((sum, unit) => sum + unit.hp, 0) - def.hp,
      golden: true,
    };

    state.nextUid += 1;

    const copyUids =
      new Set(
        copies.map(
          (unit) => unit.uid
        )
      );

    const boardIndex =
      state.board.findIndex(
        (unit) => copyUids.has(unit.uid)
      );

    if (boardIndex >= 0) {
      state.board[boardIndex] = golden;

      state.board =
        state.board.filter(
          (unit) => !copyUids.has(unit.uid)
        );

      state.bench =
        state.bench.filter(
          (unit) => !copyUids.has(unit.uid)
        );
    } else {
      const benchIndex =
        state.bench.findIndex(
          (unit) => copyUids.has(unit.uid)
        );

      state.bench[benchIndex] = golden;

      state.bench =
        state.bench.filter(
          (unit) => !copyUids.has(unit.uid)
        );
    }

    state.discoverQueue += 1;
  }

  openDiscover(run);
}

function openDiscover(
  run: Run
) {
  const {
    state,
  } = run;

  while (
    state.discover === null &&
    state.discoverQueue > 0
  ) {
    state.discoverQueue -= 1;

    const tier =
      Math.min(
        MAX_TIER,
        state.tier + 1
      );

    const options: string[] = [];

    const taken =
      new Set<string>();

    for (let i = 0; i < 3; i++) {
      const id =
        drawFromPool(
          run,
          tier,
          tier,
          taken
        );

      if (!id) {
        break;
      }

      taken.add(id);

      options.push(id);
    }

    if (options.length > 0) {
      state.discover = options;
    }
  }
}

function pickDiscover(
  run: Run,
  index: number
): string | null {
  const {
    state,
  } = run;

  if (!state.discover) {
    return "Nothing to discover.";
  }

  if (
    index < 0 ||
    index >= state.discover.length
  ) {
    return "Unknown discover option.";
  }

  if (!hasRoom(state)) {
    return "No room: sell a unit first.";
  }

  const chosen =
    state.discover[index];

  state.discover.forEach(
    (id, i) => {
      if (i !== index) {
        state.pool[id] += 1;
      }
    }
  );

  state.discover = null;

  placeUnit(
    state,
    newUnit(
      state,
      chosen
    )
  );

  checkTriples(run);

  return null;
}

function findUnit(
  state: RunState,
  uid: number
) {
  const boardIndex =
    state.board.findIndex(
      (unit) => unit.uid === uid
    );

  if (boardIndex >= 0) {
    return {
      where: "board" as const,
      index: boardIndex,
      unit: state.board[boardIndex],
    };
  }

  const benchIndex =
    state.bench.findIndex(
      (unit) => unit.uid === uid
    );

  if (benchIndex >= 0) {
    return {
      where: "bench" as const,
      index: benchIndex,
      unit: state.bench[benchIndex],
    };
  }

  return null;
}

// ---------------------------------------------------------
// Fusion + Xyz
// ---------------------------------------------------------

/** The Xyz two units of this Level make (Rank = Level), if any. */
export function xyzForLevel(
  level: number
): UnitDef | null {
  return XYZ_BY_RANK.get(level) ?? null;
}

function canBeXyzMaterial(
  unit: Unit
) {
  const def =
    UNIT_BY_ID.get(unit.id);

  return (
    def !== undefined &&
    def.kind === undefined &&
    xyzForLevel(def.level) !== null
  );
}

function matchesMaterial(
  unit: Unit,
  material: FusionMaterial
) {
  const def =
    UNIT_BY_ID.get(unit.id);

  if (
    !def ||
    def.kind !== undefined
  ) {
    return false;
  }

  if ("tribe" in material) {
    return def.tribe === material.tribe;
  }

  return (
    unit.id === material.unit &&
    (!material.golden || unit.golden)
  );
}

/**
 * Replace the materials with the new monster: it takes the board
 * slot of the leftmost material on the board (else the bench slot
 * of the first one) and keeps half of the stats the materials had
 * gained above their base stats.
 */
function summonSpecial(
  run: Run,
  resultId: string,
  materials: Unit[]
) {
  const {
    state,
  } = run;

  const def =
    UNIT_BY_ID.get(resultId) as UnitDef;

  let bonusAtk = 0;
  let bonusHp = 0;

  for (const unit of materials) {
    const base =
      UNIT_BY_ID.get(unit.id) as UnitDef;

    bonusAtk += Math.max(0, unit.atk - base.atk);
    bonusHp += Math.max(0, unit.hp - base.hp);
  }

  const result: Unit = {
    uid: state.nextUid,
    id: resultId,
    atk: def.atk + Math.floor(bonusAtk / 2),
    hp: def.hp + Math.floor(bonusHp / 2),
    golden: false,
  };

  state.nextUid += 1;

  const uids =
    new Set(
      materials.map(
        (unit) => unit.uid
      )
    );

  const boardIndex =
    state.board.findIndex(
      (unit) => uids.has(unit.uid)
    );

  if (boardIndex >= 0) {
    state.board[boardIndex] = result;
  } else {
    const benchIndex =
      state.bench.findIndex(
        (unit) => uids.has(unit.uid)
      );

    state.bench[benchIndex] = result;
  }

  state.board =
    state.board.filter(
      (unit) => !uids.has(unit.uid)
    );

  state.bench =
    state.bench.filter(
      (unit) => !uids.has(unit.uid)
    );

  if (boardIndex >= 0) {
    triggerRally(
      state,
      result
    );
  }

  return result;
}

function overlay(
  run: Run,
  uidA: number,
  uidB: number
): string | null {
  const {
    state,
  } = run;

  if (uidA === uidB) {
    return "Pick two different units.";
  }

  const a =
    findUnit(state, uidA);

  const b =
    findUnit(state, uidB);

  if (
    !a ||
    !b
  ) {
    return "No such unit.";
  }

  if (
    !canBeXyzMaterial(a.unit) ||
    !canBeXyzMaterial(b.unit)
  ) {
    return "Only Level 3-8 shop monsters can be overlaid.";
  }

  const level =
    (UNIT_BY_ID.get(a.unit.id) as UnitDef).level;

  if ((UNIT_BY_ID.get(b.unit.id) as UnitDef).level !== level) {
    return "Overlay needs two monsters of the same Level.";
  }

  summonSpecial(
    run,
    (xyzForLevel(level) as UnitDef).id,
    [
      a.unit,
      b.unit,
    ]
  );

  return null;
}

function fuse(
  run: Run,
  recipeIndex: number,
  uids: number[]
): string | null {
  const {
    state,
  } = run;

  const recipe =
    FUSIONS[recipeIndex];

  if (!recipe) {
    return "Unknown fusion.";
  }

  if (
    uids.length !== recipe.materials.length ||
    new Set(uids).size !== uids.length
  ) {
    return "Wrong fusion materials.";
  }

  const materials: Unit[] = [];

  for (let i = 0; i < uids.length; i++) {
    const found =
      findUnit(state, uids[i]);

    if (
      !found ||
      !matchesMaterial(found.unit, recipe.materials[i])
    ) {
      return "Wrong fusion materials.";
    }

    materials.push(found.unit);
  }

  summonSpecial(
    run,
    recipe.result,
    materials
  );

  return null;
}

/** Fusions you can make right now, with the materials auto-picked. */
export function fusionOptions(
  state: Pick<RunState, "board" | "bench">
): {
  recipe: number;
  result: string;
  uids: number[];
}[] {
  const owned =
    [...state.bench, ...state.board];

  const options: {
    recipe: number;
    result: string;
    uids: number[];
  }[] = [];

  FUSIONS.forEach(
    (recipe, index) => {
      const used =
        new Set<number>();

      // Named materials first, so "any Dragon" can't eat the
      // unit a named slot needs.
      const order =
        recipe.materials
          .map(
            (material, i) => ({
              material,
              i,
            })
          )
          .sort(
            (x, y) => Number("tribe" in x.material) - Number("tribe" in y.material)
          );

      const picked: number[] =
        new Array(recipe.materials.length).fill(-1);

      for (const {
        material,
        i,
      } of order) {
        const candidates =
          owned
            .filter(
              (unit) => !used.has(unit.uid) && matchesMaterial(unit, material)
            )
            // Spare golden units and big stats where possible.
            .sort(
              (x, y) => Number(x.golden) - Number(y.golden) || x.atk + x.hp - (y.atk + y.hp) || x.uid - y.uid
            );

        if (candidates.length === 0) {
          return;
        }

        used.add(candidates[0].uid);

        picked[i] = candidates[0].uid;
      }

      options.push({
        recipe: index,
        result: recipe.result,
        uids: picked,
      });
    }
  );

  return options;
}

/** Levels with 2+ units that can be overlaid, and their units. */
export function xyzOptions(
  state: Pick<RunState, "board" | "bench">
): {
  rank: number;
  result: string;
  units: Unit[];
}[] {
  const byLevel =
    new Map<number, Unit[]>();

  for (const unit of [...state.board, ...state.bench]) {
    if (!canBeXyzMaterial(unit)) {
      continue;
    }

    const level =
      (UNIT_BY_ID.get(unit.id) as UnitDef).level;

    byLevel.set(level, [...(byLevel.get(level) ?? []), unit]);
  }

  return [...byLevel.entries()]
    .filter(
      ([, units]) => units.length >= 2
    )
    .sort(
      ([a], [b]) => b - a
    )
    .map(
      ([level, units]) => ({
        rank: level,
        result: (xyzForLevel(level) as UnitDef).id,
        units,
      })
    );
}

/** Fusion / Xyz monster (not in the shop pool, never triples). */
export function isSpecialUnit(
  unit: Pick<Unit, "id">
) {
  return UNIT_BY_ID.get(unit.id)?.kind !== undefined;
}

// ---------------------------------------------------------
// Boss waves
// ---------------------------------------------------------

export type BossUnitSpec = {
  name: string;
  img: string;
  atk: number;
  hp: number;
  boss: boolean;
  keywords: CombatKeyword[];
  power: number;
};

export type BossWave = {
  kind?: "boss";
  wave: number;
  route: string;
  routeName: string;
  tier: number;
  units: BossUnitSpec[];
};

function splitStats(
  budget: number,
  card: BossRouteUnit
) {
  const total =
    card.cardAtk + card.cardDef;

  // Integer percent so every engine computes the same split.
  const sharePct =
    total > 0
      ? Math.min(65, Math.max(35, Math.floor((card.cardAtk * 100) / total)))
      : 50;

  const atk =
    Math.max(
      1,
      Math.floor((budget * sharePct + 50) / 100)
    );

  return {
    atk,
    hp: Math.max(1, budget - atk),
  };
}

export function bossWave(
  bossOrder: string[],
  wave: number
): BossWave {
  const route =
    ROUTE_BY_CODE.get(bossOrder[(wave - 1) % bossOrder.length]) ?? ROUTES[0];

  const count =
    Math.min(
      BOARD_MAX,
      1 + Math.floor(wave / 2)
    );

  const includeBoss =
    wave >= 4;

  const regular =
    route.units.filter(
      (unit) => !unit.boss
    );

  const bossCard =
    route.units.find(
      (unit) => unit.boss
    ) ?? regular[regular.length - 1];

  const wanted =
    count - (includeBoss ? 1 : 0);

  const offset =
    regular.length > wanted
      ? Math.floor(((wave - 1) * (regular.length - wanted)) / (MAX_WAVES - 1))
      : 0;

  const picks: {
    card: BossRouteUnit;
    boss: boolean;
  }[] = [];

  for (let i = 0; i < wanted; i++) {
    picks.push({
      card: regular[(offset + i) % regular.length],
      boss: false,
    });
  }

  if (includeBoss) {
    picks.splice(
      Math.floor(picks.length / 2),
      0,
      {
        card: bossCard,
        boss: true,
      }
    );
  }

  // Weights in tenths: the Boss card carries 1.8x a regular unit.
  const weights =
    picks.map(
      (pick) => (pick.boss ? 18 : 10)
    );

  const weightSum =
    weights.reduce(
      (sum, weight) => sum + weight,
      0
    );

  const budget =
    bossBudget(wave);

  const keywordUnits =
    Math.min(
      picks.length,
      Math.floor(wave / 2)
    );

  const power =
    1 + Math.floor(wave / 2);

  let regularIndex = 0;

  const units =
    picks.map(
      (pick, i): BossUnitSpec => {
        const share =
          Math.max(
            2,
            Math.floor((budget * weights[i]) / weightSum)
          );

        const stats =
          splitStats(
            share,
            pick.card
          );

        const keywords: CombatKeyword[] = [];

        if (pick.boss) {
          keywords.push(route.keywords[0]);

          if (wave >= 9) {
            keywords.push(route.keywords[1]);
          }
        } else {
          if (regularIndex < keywordUnits) {
            keywords.push(route.keywords[regularIndex % route.keywords.length]);
          }

          regularIndex += 1;
        }

        return {
          name: pick.card.name,
          img: pick.card.img,
          atk: stats.atk,
          hp: stats.hp,
          boss: pick.boss,
          keywords,
          power,
        };
      }
    );

  return {
    kind: "boss",
    wave,
    route: route.code,
    routeName: route.name,
    tier: waveTier(wave),
    units,
  };
}

/** A friend's recorded board as this turn's opponent. */
export type GhostWave = {
  kind: "ghost";
  wave: number;
  tier: number;
  ghostId: string;
  name: string;
  units: GhostUnit[];
};

export type Foe =
  | BossWave
  | GhostWave;

export function isGhostFoe(
  foe: Foe
): foe is GhostWave {
  return foe.kind === "ghost";
}

/** Who you fight on `turn`: the frozen ghost, else the Boss wave. */
export function foeFor(
  state: Pick<RunState, "bossOrder" | "ghosts">,
  turn: number
): Foe {
  const ghost =
    state.ghosts[turn - 1] ?? null;

  if (ghost) {
    return {
      kind: "ghost",
      wave: turn,
      tier: waveTier(turn),
      ghostId: ghost.id,
      name: ghost.name,
      units: ghost.units,
    };
  }

  return bossWave(
    state.bossOrder,
    turn
  );
}

export function foeName(
  foe: Foe
) {
  return isGhostFoe(foe)
    ? `${foe.name}'s board`
    : foe.routeName;
}

// ---------------------------------------------------------
// Combat
// ---------------------------------------------------------

type CUnit = {
  uid: number;
  side: 0 | 1;
  name: string;
  img: string;
  attribute: Attribute | null;
  tribe: Tribe | null;
  atk: number;
  hp: number;
  maxHp: number;
  golden: boolean;
  boss: boolean;
  token: boolean;
  taunt: boolean;
  shield: boolean;
  revive: boolean;
  reviveFull: boolean;
  pierce: boolean;
  double: boolean;
  venom: boolean;
  lastwill: number;
  spawn: number;
  ambush: number;
};

function blankCUnit(
  uid: number,
  side: 0 | 1,
  name: string,
  img: string
): CUnit {
  return {
    uid,
    side,
    name,
    img,
    attribute: null,
    tribe: null,
    atk: 0,
    hp: 1,
    maxHp: 1,
    golden: false,
    boss: false,
    token: false,
    taunt: false,
    shield: false,
    revive: false,
    reviveFull: false,
    pierce: false,
    double: false,
    venom: false,
    lastwill: 0,
    spawn: 0,
    ambush: 0,
  };
}

function applyKeyword(
  unit: CUnit,
  keyword: CombatKeyword,
  power: number
) {
  switch (keyword) {
    case "taunt":
      unit.taunt = true;
      break;
    case "shield":
      unit.shield = true;
      break;
    case "revive":
      unit.revive = true;
      break;
    case "pierce":
      unit.pierce = true;
      break;
    case "double":
      unit.double = true;
      break;
    case "venom":
      unit.venom = true;
      break;
    case "lastwill":
      unit.lastwill += power;
      break;
    case "spawn":
      unit.spawn = Math.max(unit.spawn, power);
      break;
    case "ambush":
      unit.ambush += power;
      break;
  }
}

export type SynergyState = {
  key: SynergyKey;
  count: number;
  level: 0 | 1 | 2;
};

/** Attribute + tribe counts over different units on the board. */
export function boardSynergies(
  board: Pick<Unit, "id">[]
): SynergyState[] {
  const counts =
    new Map<SynergyKey, Set<string>>();

  for (const unit of board) {
    const def =
      UNIT_BY_ID.get(unit.id);

    if (!def) {
      continue;
    }

    const keys: SynergyKey[] = [def.attribute];

    if (def.tribe) {
      keys.push(def.tribe);
    }

    for (const key of keys) {
      const set =
        counts.get(key) ?? new Set<string>();

      set.add(def.id);

      counts.set(key, set);
    }
  }

  return [...counts.entries()]
    .map(
      ([key, set]): SynergyState => ({
        key,
        count: set.size,
        level:
          set.size >= 5
            ? 2
            : set.size >= 3
              ? 1
              : 0,
      })
    );
}

function playerCombatUnits(
  board: Pick<Unit, "id" | "atk" | "hp" | "golden">[],
  side: 0 | 1 = 0
): {
  units: CUnit[];
  fire: 0 | 1 | 2;
  fiend: 0 | 1 | 2;
} {
  const synergies =
    new Map(
      boardSynergies(board).map(
        (syn) => [syn.key, syn.level]
      )
    );

  const level = (
    key: SynergyKey
  ) => synergies.get(key) ?? 0;

  const units =
    board.map(
      (unit, index): CUnit => {
        const def =
          UNIT_BY_ID.get(unit.id) as UnitDef;

        const cu =
          blankCUnit(
            side === 0 ? (unit as Unit).uid : 10000 + index,
            side,
            def.name,
            def.img
          );

        cu.attribute = def.attribute;
        cu.tribe = def.tribe;
        cu.atk = unit.atk;
        cu.hp = unit.hp;
        cu.golden = unit.golden;

        if (
          def.ability !== "rally" &&
          def.ability !== "ascend"
        ) {
          applyKeyword(
            cu,
            def.ability,
            def.power * (unit.golden ? 2 : 1)
          );
        }

        return cu;
      }
    );

  const add = (
    filter: (unit: CUnit) => boolean,
    atk: number,
    hp: number
  ) => {
    for (const unit of units) {
      if (filter(unit)) {
        unit.atk += atk;
        unit.hp += hp;
      }
    }
  };

  // Attributes
  if (level("DARK") > 0) {
    add((u) => u.attribute === "DARK", level("DARK") === 2 ? 5 : 2, 0);
  }

  if (level("EARTH") > 0) {
    add((u) => u.attribute === "EARTH", level("EARTH") === 2 ? 3 : 1, level("EARTH") === 2 ? 5 : 2);
  }

  if (level("WATER") > 0) {
    add((u) => u.attribute === "WATER", level("WATER") === 2 ? 1 : 0, level("WATER") === 2 ? 7 : 3);
  }

  if (level("LIGHT") > 0) {
    const lights =
      units.filter(
        (u) => u.attribute === "LIGHT"
      );

    for (const unit of level("LIGHT") === 2 ? lights : lights.slice(0, 1)) {
      unit.shield = true;
    }
  }

  if (level("WIND") > 0) {
    const winds =
      units.filter(
        (u) => u.attribute === "WIND"
      );

    for (const unit of level("WIND") === 2 ? winds : winds.slice(0, 1)) {
      unit.double = true;
    }
  }

  // Tribes
  if (level("Dragon") > 0) {
    const big =
      level("Dragon") === 2;

    add((u) => u.tribe === "Dragon", big ? 4 : 2, big ? 4 : 2);

    if (big) {
      for (const unit of units) {
        if (unit.tribe === "Dragon") {
          unit.pierce = true;
        }
      }
    }
  }

  if (level("Spellcaster") > 0) {
    add(() => true, level("Spellcaster") === 2 ? 3 : 1, 0);
  }

  if (level("Warrior") > 0) {
    for (const unit of units) {
      if (unit.tribe === "Warrior") {
        unit.pierce = true;

        if (level("Warrior") === 2) {
          unit.atk += 3;
        }
      }
    }
  }

  if (level("Zombie") > 0) {
    for (const unit of units) {
      if (unit.tribe === "Zombie") {
        unit.revive = true;
        unit.reviveFull = level("Zombie") === 2;
      }
    }
  }

  if (level("Machine") > 0) {
    add((u) => u.tribe === "Machine", level("Machine") === 2 ? 2 : 0, level("Machine") === 2 ? 8 : 4);
  }

  if (level("Beast") > 0) {
    for (const unit of units) {
      if (unit.tribe === "Beast") {
        unit.lastwill += level("Beast") === 2 ? 3 : 1;
      }
    }
  }

  if (level("Aqua") > 0) {
    add((u) => u.tribe === "Aqua", level("Aqua") === 2 ? 3 : 1, level("Aqua") === 2 ? 6 : 3);
  }

  for (const unit of units) {
    unit.maxHp = unit.hp;
  }

  return {
    units,
    fire: level("FIRE") as 0 | 1 | 2,
    fiend: level("Fiend") as 0 | 1 | 2,
  };
}

function bossCombatUnits(
  wave: BossWave
): CUnit[] {
  return wave.units.map(
    (spec, i) => {
      const cu =
        blankCUnit(
          10000 + i,
          1,
          spec.name,
          spec.img
        );

      cu.atk = spec.atk;
      cu.hp = spec.hp;
      cu.maxHp = spec.hp;
      cu.boss = spec.boss;

      for (const keyword of spec.keywords) {
        applyKeyword(
          cu,
          keyword,
          spec.power
        );
      }

      return cu;
    }
  );
}

function keywordsOf(
  unit: CUnit
): CombatKeyword[] {
  const out: CombatKeyword[] = [];

  if (unit.taunt) out.push("taunt");
  if (unit.shield) out.push("shield");
  if (unit.revive) out.push("revive");
  if (unit.pierce) out.push("pierce");
  if (unit.double) out.push("double");
  if (unit.venom) out.push("venom");
  if (unit.lastwill > 0) out.push("lastwill");
  if (unit.spawn > 0) out.push("spawn");
  if (unit.ambush > 0) out.push("ambush");

  return out;
}

function snap(
  units: CUnit[]
): CombatSnap[] {
  return units.map(
    (unit) => ({
      uid: unit.uid,
      name: unit.name,
      img: unit.img,
      atk: unit.atk,
      hp: unit.hp,
      maxHp: unit.maxHp,
      shield: unit.shield,
      taunt: unit.taunt,
      golden: unit.golden,
      boss: unit.boss,
      token: unit.token,
      kw: keywordsOf(unit),
    })
  );
}

export function resolveCombat(
  board: Unit[],
  wave: Foe,
  rng: Prng,
  record: boolean
): {
  result: "win" | "loss" | "tie";
  damage: number;
  frames: CombatFrame[];
} {
  const player =
    playerCombatUnits(board);

  // A ghost is a player board too: same synergies, other side.
  const foe =
    isGhostFoe(wave)
      ? playerCombatUnits(
          wave.units,
          1
        )
      : {
          units: bossCombatUnits(wave),
          fire: 0 as const,
          fiend: 0 as const,
        };

  const sides: [CUnit[], CUnit[]] = [
    player.units,
    foe.units,
  ];

  const frames: CombatFrame[] = [];

  let tokenUid = 20000;

  const push = (
    ev: CombatEvent
  ) => {
    if (record) {
      frames.push({
        ev,
        mine: snap(sides[0]),
        foe: snap(sides[1]),
      });
    }
  };

  const alive = (
    side: 0 | 1
  ) => sides[side].length > 0;

  const hit = (
    target: CUnit,
    amount: number,
    venom: boolean,
    pierce: boolean
  ) => {
    if (
      amount <= 0 ||
      target.hp <= 0
    ) {
      return;
    }

    if (target.shield) {
      target.shield = false;

      return;
    }

    const before =
      target.hp;

    target.hp -= amount;

    if (
      venom &&
      target.hp > 0
    ) {
      target.hp = 0;
    }

    if (
      pierce &&
      amount > before
    ) {
      const list =
        sides[target.side];

      const index =
        list.indexOf(target);

      const neighbour =
        list.slice(index + 1).find((unit) => unit.hp > 0) ??
        list.slice(0, Math.max(0, index)).reverse().find((unit) => unit.hp > 0);

      if (neighbour) {
        hit(
          neighbour,
          amount - before,
          false,
          false
        );
      }
    }
  };

  const processDeaths = () => {
    for (const side of [0, 1] as const) {
      const list =
        sides[side];

      let i = 0;

      while (i < list.length) {
        const unit =
          list[i];

        if (unit.hp > 0) {
          i += 1;

          continue;
        }

        list.splice(i, 1);

        if (unit.lastwill > 0) {
          const allies =
            list.filter(
              (ally) => ally.hp > 0
            );

          if (allies.length > 0) {
            const ally =
              allies[rng.int(0, allies.length - 1)];

            ally.atk += unit.lastwill;
            ally.hp += unit.lastwill;
            ally.maxHp += unit.lastwill;
          }
        }

        let insertAt = i;

        if (
          unit.spawn > 0 &&
          list.length < BOARD_MAX
        ) {
          const token =
            blankCUnit(
              tokenUid,
              side,
              "Token",
              ""
            );

          tokenUid += 1;

          token.atk = unit.spawn;
          token.hp = unit.spawn;
          token.maxHp = unit.spawn;
          token.token = true;

          list.splice(insertAt, 0, token);

          insertAt += 1;
        }

        if (
          unit.revive &&
          list.length < BOARD_MAX
        ) {
          unit.revive = false;
          unit.hp = unit.reviveFull ? unit.maxHp : 1;
          unit.lastwill = 0;
          unit.spawn = 0;

          list.splice(insertAt, 0, unit);
        }
      }
    }
  };

  push({
    k: "start",
  });

  // ---- Start of combat ----
  // (Bosses have no FIRE / Fiend synergy, so a Boss fight draws
  // exactly the same random numbers as before ghosts existed.)
  const synergyOf = [
    player,
    foe,
  ] as const;

  for (const side of [0, 1] as const) {
    const fiend =
      synergyOf[side].fiend;

    if (fiend > 0) {
      for (const unit of sides[side === 0 ? 1 : 0]) {
        unit.atk = Math.max(
          0,
          unit.atk - (fiend === 2 ? 3 : 1)
        );
      }
    }
  }

  for (const side of [0, 1] as const) {
    const fire =
      synergyOf[side].fire;

    const enemy =
      sides[side === 0 ? 1 : 0];

    if (
      fire === 0 ||
      enemy.length === 0
    ) {
      continue;
    }

    const targets =
      fire === 2
        ? [...enemy]
        : [enemy[rng.int(0, enemy.length - 1)]];

    for (const target of targets) {
      hit(target, 3, false, false);
    }

    processDeaths();

    push({
      k: "ambush",
      src: null,
      dst: targets.map((unit) => unit.uid),
      amt: 3,
    });
  }

  for (const side of [0, 1] as const) {
    for (const unit of [...sides[side]]) {
      const enemy =
        sides[side === 0 ? 1 : 0];

      if (
        unit.ambush <= 0 ||
        unit.hp <= 0 ||
        !sides[side].includes(unit) ||
        enemy.length === 0
      ) {
        continue;
      }

      const target =
        enemy[rng.int(0, enemy.length - 1)];

      hit(
        target,
        unit.ambush,
        false,
        false
      );

      processDeaths();

      push({
        k: "ambush",
        src: unit.uid,
        dst: [target.uid],
        amt: unit.ambush,
      });
    }
  }

  // ---- Attacks ----
  let attacker: 0 | 1 =
    sides[0].length > sides[1].length
      ? 0
      : sides[1].length > sides[0].length
        ? 1
        : rng.chance(0.5)
          ? 0
          : 1;

  const next = [
    0,
    0,
  ];

  const pickAttacker = (
    side: 0 | 1
  ) => {
    const list =
      sides[side];

    for (let k = 0; k < list.length; k++) {
      const index =
        (next[side] + k) % list.length;

      if (list[index].atk > 0) {
        return list[index];
      }
    }

    return null;
  };

  for (let step = 0; step < MAX_COMBAT_STEPS; step++) {
    if (
      !alive(0) ||
      !alive(1)
    ) {
      break;
    }

    const unit =
      pickAttacker(attacker);

    if (!unit) {
      if (!pickAttacker(attacker === 0 ? 1 : 0)) {
        break;
      }

      attacker = attacker === 0 ? 1 : 0;

      continue;
    }

    const own =
      sides[attacker];

    const enemySide =
      attacker === 0 ? 1 : 0;

    const position =
      own.indexOf(unit);

    const swings =
      unit.double ? 2 : 1;

    for (let swing = 0; swing < swings; swing++) {
      const enemy =
        sides[enemySide];

      if (
        unit.hp <= 0 ||
        !own.includes(unit) ||
        enemy.length === 0
      ) {
        break;
      }

      const taunts =
        enemy.filter(
          (foe) => foe.taunt
        );

      const choices =
        taunts.length > 0
          ? taunts
          : enemy;

      const target =
        choices[rng.int(0, choices.length - 1)];

      const dealt =
        unit.atk;

      const taken =
        target.atk;

      hit(
        target,
        dealt,
        unit.venom,
        unit.pierce
      );

      hit(
        unit,
        taken,
        target.venom,
        false
      );

      processDeaths();

      push({
        k: "attack",
        src: unit.uid,
        dst: target.uid,
      });
    }

    const nowAt =
      own.indexOf(unit);

    next[attacker] =
      nowAt >= 0
        ? nowAt + 1
        : position;

    attacker = enemySide;
  }

  const result: "win" | "loss" | "tie" =
    alive(0) && !alive(1)
      ? "win"
      : alive(1) && !alive(0)
        ? "loss"
        : "tie";

  let damage = 0;

  if (result === "loss") {
    damage =
      wave.tier +
      sides[1].reduce(
        (sum, unit) => sum + (unit.boss ? 2 : 1),
        0
      );

    const cap =
      wave.wave <= 3
        ? DAMAGE_CAP[0]
        : wave.wave <= 6
          ? DAMAGE_CAP[1]
          : DAMAGE_CAP[2];

    damage = Math.min(cap, damage);
  }

  push({
    k: "end",
    result,
    damage,
  });

  return {
    result,
    damage,
    frames,
  };
}

// ---------------------------------------------------------
// Turn flow
// ---------------------------------------------------------

function startNextTurn(
  run: Run
) {
  const {
    state,
  } = run;

  state.turn += 1;
  state.maxGold = Math.min(MAX_GOLD, state.turn + 2);
  state.gold = state.maxGold;
  state.tierCost = Math.max(0, state.tierCost - 1);
  state.actionsThisTurn = 0;

  if (state.frozen) {
    state.frozen = false;
  } else {
    rollShop(run);
  }
}

function endTurn(
  run: Run,
  record: boolean
): CombatResult {
  const {
    state,
  } = run;

  // An open discover is resolved for you (first option), or
  // dropped back into the pool when there is no room at all.
  while (state.discover) {
    if (pickDiscover(run, 0) !== null) {
      for (const id of state.discover ?? []) {
        state.pool[id] += 1;
      }

      state.discover = null;
      state.discoverQueue = 0;
    }
  }

  // Ascend (end of turn), board only.
  for (const unit of state.board) {
    const def =
      UNIT_BY_ID.get(unit.id) as UnitDef;

    if (def.ability === "ascend") {
      const amount =
        def.power * (unit.golden ? 2 : 1);

      unit.atk += amount;
      unit.hp += amount;
    }
  }

  // The board that goes into this fight: a ghost for friends.
  state.snapshots.push({
    turn: state.turn,
    units: state.board.map(
      (unit) => ({
        id: unit.id,
        atk: unit.atk,
        hp: unit.hp,
        golden: unit.golden,
      })
    ),
  });

  const wave =
    foeFor(
      state,
      state.turn
    );

  const name =
    foeName(wave);

  const route =
    isGhostFoe(wave)
      ? "ghost"
      : wave.route;

  const combat =
    resolveCombat(
      state.board,
      wave,
      createPrng(`${state.seed}:combat:${state.turn}`),
      record
    );

  if (combat.result === "win") {
    state.wins += 1;
  } else if (combat.result === "loss") {
    state.losses += 1;
    state.health -= combat.damage;
  } else {
    state.ties += 1;
  }

  state.history.push({
    wave: state.turn,
    route,
    foe: name,
    result: combat.result,
    damage: combat.damage,
  });

  if (state.health <= 0) {
    state.health = 0;
    state.over = true;
  } else {
    state.survived += 1;

    if (state.turn >= MAX_WAVES) {
      state.over = true;
      state.victory = true;
    } else {
      startNextTurn(run);
    }
  }

  return {
    wave: wave.wave,
    route,
    foe: name,
    result: combat.result,
    damage: combat.damage,
    frames: combat.frames,
  };
}

const ACTION_RE =
  /^(?:b(\d)|s(\d{1,5})|p(\d{1,5})\.(\d)|m(\d{1,5})\.(\d)|(r)|(f)|(u)|d(\d)|(e)|x(\d{1,5})\.(\d{1,5})|c(\d{1,2})\.(\d{1,5})(?:\.(\d{1,5}))?)$/;

const MAX_ACTION_LENGTH = 16;

export function isActionString(
  action: unknown
): action is string {
  return (
    typeof action === "string" &&
    action.length <= MAX_ACTION_LENGTH &&
    ACTION_RE.test(action)
  );
}

/**
 * Apply one action. Illegal actions change nothing and return
 * ok: false (the UI never sends them; a replayed log that
 * contains one is rejected).
 */
export function applyAction(
  run: Run,
  action: string,
  options: {
    record?: boolean;
  } = {}
): ApplyResult {
  const {
    state,
  } = run;

  if (state.over) {
    return {
      ok: false,
      error: "The run is over.",
    };
  }

  const match =
    typeof action === "string" && action.length <= MAX_ACTION_LENGTH
      ? ACTION_RE.exec(action)
      : null;

  if (!match) {
    return {
      ok: false,
      error: "Unknown action.",
    };
  }

  if (state.actionsThisTurn >= MAX_ACTIONS_PER_TURN) {
    return {
      ok: false,
      error: "Too many actions this turn.",
    };
  }

  const error =
    applyMatched(
      run,
      match
    );

  if (typeof error === "string") {
    return {
      ok: false,
      error,
    };
  }

  state.log.push(action);

  if (error === null) {
    state.actionsThisTurn += 1;

    return {
      ok: true,
    };
  }

  // End of turn: combat happened.
  return {
    ok: true,
    combat: endTurn(
      run,
      options.record ?? false
    ),
  };
}

/** string = error, null = done, "end" marker = end turn. */
function applyMatched(
  run: Run,
  match: RegExpExecArray
): string | null | {
  end: true;
} {
  const {
    state,
  } = run;

  const blockedByDiscover =
    state.discover !== null;

  // ---- buy ----
  if (match[1] !== undefined) {
    if (blockedByDiscover) {
      return "Pick a discover option first.";
    }

    const slot =
      Number(match[1]);

    const id =
      state.shop[slot];

    if (!id) {
      return "Nothing in that slot.";
    }

    if (state.gold < UNIT_COST) {
      return "Not enough gold.";
    }

    if (!hasRoom(state)) {
      return "Board and bench are full.";
    }

    state.gold -= UNIT_COST;
    state.shop[slot] = null;

    placeUnit(
      state,
      newUnit(
        state,
        id
      )
    );

    checkTriples(run);

    return null;
  }

  // ---- sell ----
  if (match[2] !== undefined) {
    if (blockedByDiscover) {
      return "Pick a discover option first.";
    }

    const found =
      findUnit(
        state,
        Number(match[2])
      );

    if (!found) {
      return "No such unit.";
    }

    if (found.where === "board") {
      state.board.splice(found.index, 1);
    } else {
      state.bench.splice(found.index, 1);
    }

    // Fusion / Xyz monsters never were in the pool.
    if (found.unit.id in state.pool) {
      state.pool[found.unit.id] += found.unit.golden ? 3 : 1;
    }

    state.gold += SELL_VALUE;

    return null;
  }

  // ---- play from bench ----
  if (match[3] !== undefined) {
    if (blockedByDiscover) {
      return "Pick a discover option first.";
    }

    const found =
      findUnit(
        state,
        Number(match[3])
      );

    if (
      !found ||
      found.where !== "bench"
    ) {
      return "That unit is not on the bench.";
    }

    if (state.board.length >= BOARD_MAX) {
      return "The board is full.";
    }

    const position =
      Math.min(
        Number(match[4]),
        state.board.length
      );

    state.bench.splice(found.index, 1);
    state.board.splice(position, 0, found.unit);

    triggerRally(
      state,
      found.unit
    );

    return null;
  }

  // ---- move on board ----
  if (match[5] !== undefined) {
    const found =
      findUnit(
        state,
        Number(match[5])
      );

    if (
      !found ||
      found.where !== "board"
    ) {
      return "That unit is not on the board.";
    }

    const position =
      Number(match[6]);

    if (position >= state.board.length) {
      return "No such board position.";
    }

    state.board.splice(found.index, 1);
    state.board.splice(position, 0, found.unit);

    return null;
  }

  // ---- refresh ----
  if (match[7] !== undefined) {
    if (blockedByDiscover) {
      return "Pick a discover option first.";
    }

    if (state.gold < ROLL_COST) {
      return "Not enough gold.";
    }

    state.gold -= ROLL_COST;
    state.frozen = false;

    rollShop(run);

    return null;
  }

  // ---- freeze ----
  if (match[8] !== undefined) {
    state.frozen = !state.frozen;

    return null;
  }

  // ---- tier up ----
  if (match[9] !== undefined) {
    if (state.tier >= MAX_TIER) {
      return "Already at the highest tier.";
    }

    if (state.gold < state.tierCost) {
      return "Not enough gold.";
    }

    state.gold -= state.tierCost;
    state.tier += 1;
    state.tierCost = state.tier < MAX_TIER ? TIER_UP_COST[state.tier] : 0;

    return null;
  }

  // ---- discover ----
  if (match[10] !== undefined) {
    return pickDiscover(
      run,
      Number(match[10])
    );
  }

  // ---- Overlay (Xyz) ----
  if (match[12] !== undefined) {
    if (blockedByDiscover) {
      return "Pick a discover option first.";
    }

    return overlay(
      run,
      Number(match[12]),
      Number(match[13])
    );
  }

  // ---- Polymerization (Fusion) ----
  if (match[14] !== undefined) {
    if (blockedByDiscover) {
      return "Pick a discover option first.";
    }

    const uids = [
      Number(match[15]),
    ];

    if (match[16] !== undefined) {
      uids.push(Number(match[16]));
    }

    return fuse(
      run,
      Number(match[14]),
      uids
    );
  }

  // ---- end turn ----
  return {
    end: true,
  };
}

// ---------------------------------------------------------
// Replay / validation (server)
// ---------------------------------------------------------

export type RunLog = {
  v: number;
  a: string[];
  /** Ghost snapshot id per turn the browser played against. */
  g?: (string | null)[];
};

export const LEGACY_LOG_REASON =
  "This run was played on an older version of the Shadow Arena.";

export type ReplayOutcome =
  | {
      ok: true;
      score: number;
      state: RunState;
    }
  | {
      ok: false;
      reason: string;
    };

/**
 * Replay a run. `ghosts` must be the list the SERVER froze for
 * this run at start (never the browser's copy): the log only says
 * which ghost ids the browser saw, and they must match.
 */
export function replayLog(
  seed: string,
  log: unknown,
  ghosts: unknown = []
): ReplayOutcome {
  if (
    typeof log === "object" &&
    log !== null &&
    typeof (log as RunLog).v === "number" &&
    (log as RunLog).v < ENGINE_VERSION
  ) {
    return {
      ok: false,
      reason: LEGACY_LOG_REASON,
    };
  }

  if (
    typeof log !== "object" ||
    log === null ||
    (log as RunLog).v !== ENGINE_VERSION ||
    !Array.isArray((log as RunLog).a)
  ) {
    return {
      ok: false,
      reason: "Malformed action log.",
    };
  }

  const table =
    normalizeGhosts(ghosts);

  const expected =
    ghostIds(table);

  const claimed =
    (log as RunLog).g ?? [];

  if (
    !Array.isArray(claimed) ||
    claimed.length > MAX_WAVES ||
    expected.some(
      (id, i) => (claimed[i] ?? null) !== id
    )
  ) {
    return {
      ok: false,
      reason: "The ghost opponents do not match this run.",
    };
  }

  const actions =
    (log as RunLog).a;

  if (actions.length > MAX_LOG_ACTIONS) {
    return {
      ok: false,
      reason: "Action log too long.",
    };
  }

  const run =
    createRun(
      seed,
      table
    );

  for (let i = 0; i < actions.length; i++) {
    const action =
      actions[i];

    if (!isActionString(action)) {
      return {
        ok: false,
        reason: `Unknown action #${i + 1}.`,
      };
    }

    const outcome =
      applyAction(
        run,
        action
      );

    if (!outcome.ok) {
      return {
        ok: false,
        reason: `Illegal action #${i + 1} (${action}): ${outcome.error}`,
      };
    }
  }

  if (!run.state.over) {
    return {
      ok: false,
      reason: "The run did not finish.",
    };
  }

  return {
    ok: true,
    score: runScore(run.state),
    state: run.state,
  };
}

export type RunVerdict =
  | {
      ok: true;
      score: number;
      turns: number;
      /** From the replay: what friends may fight as ghosts. */
      snapshots: BoardSnapshot[];
    }
  | {
      ok: false;
      reason: string;
    };

export function validateRun(
  seed: string,
  log: unknown,
  claimedScore: number,
  ghosts: unknown = []
): RunVerdict {
  const outcome =
    replayLog(
      seed,
      log,
      ghosts
    );

  if (!outcome.ok) {
    return outcome;
  }

  if (outcome.score !== claimedScore) {
    return {
      ok: false,
      reason: "Score does not match the replay.",
    };
  }

  return {
    ok: true,
    score: outcome.score,
    turns: outcome.state.history.length,
    snapshots: outcome.state.snapshots,
  };
}

/** Rebuild a run (e.g. after the tab was closed) from its log. */
export function restoreRun(
  seed: string,
  actions: string[],
  ghosts: unknown = []
): Run | null {
  const run =
    createRun(
      seed,
      ghosts
    );

  for (const action of actions) {
    if (!applyAction(run, action).ok) {
      return null;
    }
  }

  return run;
}
