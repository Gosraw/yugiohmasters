import {
  createPrng,
  type Prng,
} from "../prng";

import {
  FUSIONS,
  ROUTES,
  ROUTE_BY_CODE,
  TRAPS,
  TRAP_BY_ID,
  UNITS,
  UNIT_BY_ID,
  XYZ_BY_RANK,
  type Attribute,
  type BossRouteUnit,
  type CombatKeyword,
  type FusionMaterial,
  type SynergyKey,
  type TrapDef,
  type Tribe,
  type UnitDef,
} from "./units";

// =========================================================
// SHADOW ARENA - pure, deterministic auto battler engine
// (no DOM, no Date, no Math.random).
//
// The browser plays it live; the server action replays the
// recorded action log from the same seed (and the ghost list the
// server froze for the run) and only trusts the replayed score.
// Everything random draws from the seeded PRNG (../prng.ts):
//   `${seed}:shop`           every shop roll / discover, in order
//   `${seed}:bosses`         the order of the Boss waves
// Combat itself has NO randomness: every target is a fixed rule
// (luck lives in shop rolls, discovers, which ghost / Boss you
// meet and which trap lies face-down). Only integer math is used,
// so V8 and JavaScriptCore agree.
//
// v3 (phase 2): a 3-LANE CASTLE BATTLEFIELD. Each side has a
// castle at its end of three lanes; your castle's HP is your
// health for the whole run. Board monsters stand in a lane
// (max 3 per lane, 7 in total) in ATTACK or DEFENSE position.
// Combat is a fixed tick simulation:
//   1. clash: the front monsters of both sides that stand next
//      to each other in a lane hit each other (simultaneously);
//   2. move: ATTACK monsters step one tile toward the enemy
//      castle (blocked by any monster in front of them); one that
//      steps into the castle deals its castle damage and leaves.
// DEFENSE monsters never move: a wall near your castle with
// double DEF (triple with Guardian) that strikes back at half ATK.
// Trap Cards are set on a lane (max 1 per lane) and trigger once
// per combat (they stay for later turns). When nobody can attack
// any more (or nothing happened for STALL_TICKS ticks) the fight
// ends and every lane held by only one side chips the other
// castle for 1. The castle damage you take in one combat is
// capped per wave (DAMAGE_CAP). Traps unlock on wave
// TRAP_UNLOCK_WAVE, Fusion / Xyz on SUMMON_UNLOCK_WAVE.
//
// Action log: an array of short strings, one per player action.
//   b<slot>        buy the unit / trap in shop slot <slot>
//   s<uid>         sell unit or trap <uid>
//   p<uid>.<lane>  play bench unit <uid> into lane 0-2
//   m<uid>.<lane>  move board unit (or trap) <uid> to lane 0-2
//                  (its own lane: to the front of that lane)
//   t<uid>         toggle ATTACK / DEFENSE position
//   r              refresh the shop (1 gold)
//   f              freeze / unfreeze the shop
//   u              upgrade the shop tier
//   d<i>           pick discover option <i> (after a triple)
//   x<a>.<b>       Overlay: units <a> + <b> (same Level) -> Xyz
//                  (1 gold, once per turn)
//   c<r>.<a>[.<b>] Polymerization: fusion recipe <r> (free)
//   w<i>[.<uid>]   take reward option <i> (after a won wave; the
//                  ATK / DEF boosts name the monster <uid>)
//   e              end the turn -> combat vs this wave's opponent
//                  (an untaken reward is forfeited)
//
// Opponents: a league-mate's "ghost" board (units, lanes,
// positions, traps) when the server assigned one for that turn
// when the run started (see ghosts.ts), otherwise the wave's
// computer Boss. The LAST wave is always a Boss.
// =========================================================

/** v4 (2026-10-12): v3 lanes + a reward pick after won waves. */
export const ENGINE_VERSION = 4;

/**
 * Shape of a stored ghost board, separate from ENGINE_VERSION so
 * balance changes don't empty the friends' ghost pool.
 *   1 = units only (engine v2), auto-laid-out when read
 *   2 = units with lane + position, plus traps
 */
export const BOARD_SCHEMA = 2;

/** First wave with traps in the shop. */
export const TRAP_UNLOCK_WAVE = 3;

/** First wave with Polymerization / Overlay. */
export const SUMMON_UNLOCK_WAVE = 4;

/** A fight with no change for this many ticks ends (stalemate). */
export const STALL_TICKS = 3;

export const MAX_WAVES = 12;

export const START_HEALTH = 20;

export const BOARD_MAX = 7;

export const LANES = 3;

/** Monsters per lane, per side. */
export const LANE_MAX = 3;

/** Tiles between the castles: 1..LANE_LEN (castles at 0 and LANE_LEN + 1). */
export const LANE_LEN = 8;

/** Tiles 1..HALF are your half of a lane. */
export const HALF = 4;

export const BENCH_MAX = 5;

export const TRAP_MAX = LANES;

export const UNIT_COST = 3;

export const OVERLAY_COST = 1;

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

/** Copies of every trap in the pool, per trap tier. */
export const TRAP_COPIES = [
  0,
  3,
  3,
  3,
  2,
  2,
  2,
];

/** Hard cap per turn: bounds the server replay cost. */
export const MAX_ACTIONS_PER_TURN = 200;

export const MAX_LOG_ACTIONS =
  MAX_WAVES * MAX_ACTIONS_PER_TURN;

/** Combat length cap (ticks). */
export const MAX_TICKS = 40;

/** Max castle damage of one combat: waves 1-3, 4-6, 7+. */
export const DAMAGE_CAP = [
  4,
  7,
  10,
] as const;

/** Lane fill order for automatic placement: mid, left, right. */
const LANE_ORDER = [
  1,
  0,
  2,
];

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

export function damageCap(
  wave: number
) {
  return wave <= 3
    ? DAMAGE_CAP[0]
    : wave <= 6
      ? DAMAGE_CAP[1]
      : DAMAGE_CAP[2];
}

/** Total enemy stats (attack + health) of a Boss wave. */
export function bossBudget(
  wave: number
) {
  // Hand-tuned with the greedy bot (balance.test.ts, rewards
  // included): median ~wave 9, a full clear ~1 in 5.
  const table = [
    0,
    4, 7, 13, 21, 32, 44, 59, 77, 100, 128,
    164, 210,
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
  /** 0 left, 1 mid, 2 right (board only). */
  lane: number;
  /** DEFENSE position (a wall that does not march). */
  def: boolean;
};

/** A Trap Card you own, set face-down on a lane. */
export type TrapCard = {
  uid: number;
  id: string;
  lane: number;
};

/** One of the 3 rewards offered after a won wave (seeded). */
export type RewardOption =
  | {
      kind: "card";
      id: string;
      /** Drawn one tier above your shop tier. */
      up: boolean;
    }
  | {
      kind: "trap";
      id: string;
    }
  | {
      kind: "gold";
      amount: number;
    }
  | {
      kind: "atk";
      amount: number;
    }
  | {
      kind: "def";
      amount: number;
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
  lane: number;
  def: boolean;
};

export type GhostTrap = {
  id: string;
  lane: number;
};

/** A league-mate's recorded board, frozen into a run at start. */
export type GhostBoard = {
  /** Snapshot id (server row id). */
  id: string;
  /** The friend's duelist name. */
  name: string;
  units: GhostUnit[];
  traps: GhostTrap[];
};

/** Your board (and traps) as it went into the fight of `turn`. */
export type BoardSnapshot = {
  turn: number;
  units: GhostUnit[];
  traps: GhostTrap[];
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
  traps: TrapCard[];
  pool: Record<string, number>;
  discover: string[] | null;
  discoverQueue: number;
  /** Reward options after a won wave (null = none open). */
  reward: RewardOption[] | null;
  nextUid: number;
  overlayUsed: boolean;
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
  lane: number;
  /** Tile 1..LANE_LEN, counted from YOUR castle (both sides). */
  y: number;
  def: boolean;
};

export type TrapSnap = {
  lane: number;
  id: string;
  used: boolean;
};

export type HitCause =
  | "attack"
  | "counter"
  | "pierce"
  | "ambush"
  | "fire";

export type CombatHit = {
  src: number;
  dst: number;
  amt: number;
  cause: HitCause;
};

export type CastleHit = {
  /** The side whose castle is hit (0 = yours). */
  side: 0 | 1;
  lane: number;
  amt: number;
  /** -1 for "lane held" chip damage at the end. */
  src: number;
  cause: "breakthrough" | "pierce" | "reflect" | "held";
};

export type CombatDeath = {
  uid: number;
  side: 0 | 1;
  lane: number;
  /** "battle", "venom", or the trap id that destroyed it. */
  by: string;
  src: number;
};

export type TrapFlip = {
  /** The side that owns the trap (0 = yours). */
  side: 0 | 1;
  lane: number;
  id: string;
  dst: number[];
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
      k: "tick";
      hits: CombatHit[];
      castle: CastleHit[];
      traps: TrapFlip[];
      deaths: CombatDeath[];
    }
  | {
      k: "end";
      result: "win" | "loss" | "tie";
      damage: number;
      dealt: number;
    };

export type CombatFrame = {
  ev: CombatEvent;
  mine: CombatSnap[];
  foe: CombatSnap[];
  traps: [TrapSnap[], TrapSnap[]];
  /** Castle damage so far (capped): [yours, theirs]. */
  castle: [number, number];
};

export type CombatResult = {
  wave: number;
  route: string;
  foe: string;
  result: "win" | "loss" | "tie";
  damage: number;
  dealt: number;
  cap: number;
  /** One line per lane (left, mid, right): what happened there. */
  recap: string[];
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

function laneOf(
  value: unknown
) {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < LANES
    ? (value as number)
    : 1;
}

/** Units + traps of a recorded board, cleaned up (ghosts, snapshots). */
function normalizeBoard(
  rawUnits: unknown,
  rawTraps: unknown
): {
  units: GhostUnit[];
  traps: GhostTrap[];
} {
  const units: GhostUnit[] = [];

  const perLane = [
    0,
    0,
    0,
  ];

  const list =
    Array.isArray(rawUnits) ? rawUnits.slice(0, BOARD_MAX) : [];

  // Schema 1 (no lanes yet): spread over the lanes, sturdy
  // units (DEF well above ATK, or Guardians) become walls.
  const legacy =
    list.length > 0 &&
    list.every(
      (item) => typeof item === "object" && item !== null && !("lane" in item)
    );

  let autoIndex = 0;

  for (const item of list) {
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

    const known =
      UNIT_BY_ID.get(unit.id) as UnitDef;

    let lane =
      legacy
        ? LANE_ORDER[autoIndex % LANES]
        : laneOf(unit.lane);

    autoIndex += 1;

    if (perLane[lane] >= LANE_MAX) {
      lane = LANE_ORDER.find((l) => perLane[l] < LANE_MAX) as number;
    }

    perLane[lane] += 1;

    units.push({
      id: unit.id,
      atk: Math.min(9999, Math.max(0, unit.atk as number)),
      hp: Math.min(9999, Math.max(1, unit.hp as number)),
      golden: unit.golden === true,
      lane,
      def: legacy
        ? known.ability === "taunt" || (unit.hp as number) >= (unit.atk as number) * 2
        : unit.def === true,
    });
  }

  const traps: GhostTrap[] = [];

  for (const item of Array.isArray(rawTraps) ? rawTraps.slice(0, TRAP_MAX) : []) {
    const trap =
      item as Partial<GhostTrap> | null;

    if (
      !trap ||
      typeof trap.id !== "string" ||
      !TRAP_BY_ID.has(trap.id)
    ) {
      continue;
    }

    const lane =
      laneOf(trap.lane);

    if (!traps.some((t) => t.lane === lane)) {
      traps.push({
        id: trap.id,
        lane,
      });
    }
  }

  return {
    units,
    traps,
  };
}

/**
 * Clean up a ghost list (from the server or the browser): index
 * turn - 1, unknown cards dropped, numbers clamped, lanes fixed.
 * Both the browser and the server replay run this, so they agree.
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
      // The last wave is always a Boss.
      if (
        index >= MAX_WAVES - 1 ||
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
          traps?: unknown;
        };

      if (
        typeof raw.id !== "string" ||
        raw.id.length === 0 ||
        raw.id.length > 64
      ) {
        return;
      }

      const board =
        normalizeBoard(
          raw.units,
          raw.traps
        );

      if (board.units.length === 0) {
        return;
      }

      out[index] = {
        id: raw.id,
        name:
          typeof raw.name === "string" && raw.name.trim()
            ? raw.name.trim().slice(0, 40)
            : "A friend",
        ...board,
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

  for (const trap of TRAPS) {
    pool[trap.id] =
      TRAP_COPIES[trap.tier];
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
    traps: [],
    pool,
    discover: null,
    discoverQueue: 0,
    reward: null,
    nextUid: 1,
    overlayUsed: false,
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
  return {
    survived: Math.floor(score / 10000),
    health: Math.floor((score % 10000) / 100),
    wins: score % 100,
  };
}

// ---------------------------------------------------------
// Shop
// ---------------------------------------------------------

type ShopCard = {
  id: string;
  tier: number;
  trap: boolean;
};

/** Shop pool order: units, then traps (fixed, so draws are stable). */
const SHOP_CARDS: readonly ShopCard[] = [
  ...UNITS.map(
    (unit) => ({
      id: unit.id,
      tier: unit.tier,
      trap: false,
    })
  ),
  ...TRAPS.map(
    (trap) => ({
      id: trap.id,
      tier: trap.tier,
      trap: true,
    })
  ),
];

export function isTrapId(
  id: string
) {
  return TRAP_BY_ID.has(id);
}

function drawFromPool(
  run: Run,
  minTier: number,
  maxTier: number,
  options: {
    exclude?: Set<string>;
    unitsOnly?: boolean;
    trapsOnly?: boolean;
    rng?: Prng;
  } = {}
): string | null {
  const {
    pool,
  } = run.state;

  const noTraps =
    options.unitsOnly ||
    run.state.turn < TRAP_UNLOCK_WAVE;

  const usable = (
    card: ShopCard
  ) =>
    card.tier >= minTier &&
    card.tier <= maxTier &&
    !(noTraps && card.trap) &&
    !(options.trapsOnly && !card.trap) &&
    !options.exclude?.has(card.id);

  let total = 0;

  for (const card of SHOP_CARDS) {
    if (usable(card)) {
      total += pool[card.id];
    }
  }

  if (total <= 0) {
    return null;
  }

  let pick =
    (options.rng ?? run.shopRng).int(0, total - 1);

  for (const card of SHOP_CARDS) {
    if (!usable(card)) {
      continue;
    }

    if (pick < pool[card.id]) {
      pool[card.id] -= 1;

      return card.id;
    }

    pick -= pool[card.id];
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
    lane: 1,
    def: false,
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

export function laneCounts(
  board: Pick<Unit, "lane">[]
) {
  const counts = [
    0,
    0,
    0,
  ];

  for (const unit of board) {
    counts[unit.lane] += 1;
  }

  return counts;
}

/** The emptiest lane with room (ties: mid, left, right). */
function pickLane(
  board: Unit[]
) {
  const counts =
    laneCounts(board);

  let best = -1;

  for (const lane of LANE_ORDER) {
    if (
      counts[lane] < LANE_MAX &&
      (best < 0 || counts[lane] < counts[best])
    ) {
      best = lane;
    }
  }

  return best;
}

/** Board if there is room (Rally triggers), else bench. */
function placeUnit(
  state: RunState,
  unit: Unit
) {
  if (state.board.length < BOARD_MAX) {
    unit.lane = pickLane(state.board);
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
      lane: 1,
      def: false,
    };

    state.nextUid += 1;

    replaceUnits(
      state,
      copies,
      golden
    );

    state.discoverQueue += 1;
  }

  openDiscover(run);
}

/**
 * Put `result` where the first of `materials` stood (the leftmost
 * on the board keeps its lane + position, else the bench slot) and
 * remove the materials.
 */
function replaceUnits(
  state: RunState,
  materials: Unit[],
  result: Unit
) {
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
    result.lane = state.board[boardIndex].lane;
    result.def = state.board[boardIndex].def;
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

  return boardIndex >= 0;
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
          {
            exclude: taken,
            unitsOnly: true,
          }
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

/** First free trap lane (mid, left, right), or -1. */
function freeTrapLane(
  state: RunState
) {
  return LANE_ORDER.find(
    (lane) => !state.traps.some((trap) => trap.lane === lane)
  ) ?? -1;
}

// ---------------------------------------------------------
// Rewards (after a won wave)
// ---------------------------------------------------------

/** Card / trap options are taken out of the pool until resolved. */
function releaseReward(
  state: RunState,
  keep: RewardOption | null
) {
  for (const option of state.reward ?? []) {
    if (
      option !== keep &&
      (option.kind === "card" || option.kind === "trap")
    ) {
      state.pool[option.id] += 1;
    }
  }

  state.reward = null;
}

/** 3 seeded options for the wave just won (`${seed}:reward:${wave}`). */
function offerReward(
  run: Run,
  wave: number
) {
  const {
    state,
  } = run;

  const rng =
    createPrng(`${state.seed}:reward:${wave}`);

  const kinds = [
    "card",
    "card_up",
    "trap",
    "gold",
    "atk",
    "def",
  ].filter(
    (kind) =>
      (kind !== "trap" || state.turn >= TRAP_UNLOCK_WAVE) &&
      ((kind !== "atk" && kind !== "def") || state.board.length > 0) &&
      (kind !== "card_up" || state.tier < MAX_TIER)
  );

  for (let i = kinds.length - 1; i > 0; i--) {
    const j =
      rng.int(0, i);

    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }

  const boost =
    Math.floor(wave / 3);

  const options: RewardOption[] = [];

  for (const kind of kinds) {
    if (options.length >= 3) {
      break;
    }

    if (
      kind === "card" ||
      kind === "card_up"
    ) {
      const tier =
        kind === "card_up"
          ? state.tier + 1
          : state.tier;

      const id =
        drawFromPool(
          run,
          tier,
          tier,
          {
            unitsOnly: true,
            rng,
          }
        );

      if (id) {
        options.push({
          kind: "card",
          id,
          up: kind === "card_up",
        });
      }
    } else if (kind === "trap") {
      const id =
        drawFromPool(
          run,
          1,
          state.tier,
          {
            trapsOnly: true,
            rng,
          }
        );

      if (id) {
        options.push({
          kind: "trap",
          id,
        });
      }
    } else if (kind === "gold") {
      options.push({
        kind: "gold",
        amount: 2,
      });
    } else if (kind === "atk") {
      options.push({
        kind: "atk",
        amount: 2 + boost,
      });
    } else {
      options.push({
        kind: "def",
        amount: 3 + boost,
      });
    }
  }

  state.reward =
    options.length > 0
      ? options
      : null;
}

function takeReward(
  run: Run,
  index: number,
  uid: number | null
): string | null {
  const {
    state,
  } = run;

  const option =
    state.reward?.[index];

  if (!option) {
    return "No such reward.";
  }

  switch (option.kind) {
    case "card":
      if (!hasRoom(state)) {
        return "No room: sell a unit first.";
      }

      releaseReward(state, option);

      placeUnit(
        state,
        newUnit(
          state,
          option.id
        )
      );

      checkTriples(run);

      return null;
    case "trap": {
      const free =
        freeTrapLane(state);

      if (free < 0) {
        return "All 3 trap zones are full: sell a trap first.";
      }

      releaseReward(state, option);

      state.traps.push({
        uid: state.nextUid,
        id: option.id,
        lane: free,
      });

      state.nextUid += 1;

      return null;
    }
    case "gold":
      releaseReward(state, option);
      state.gold += option.amount;

      return null;
    case "atk":
    case "def": {
      const target =
        state.board.find(
          (unit) => unit.uid === uid
        );

      if (!target) {
        return "Pick a monster on your field.";
      }

      releaseReward(state, option);

      if (option.kind === "atk") {
        target.atk += option.amount;
      } else {
        target.hp += option.amount;
      }

      return null;
    }
  }
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

/** Fusion / Xyz monster (not in the shop pool, never triples). */
export function isSpecialUnit(
  unit: Pick<Unit, "id">
) {
  return UNIT_BY_ID.get(unit.id)?.kind !== undefined;
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

/** Materials -> the new monster (keeps half of their gained stats). */
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
    lane: 1,
    def: false,
  };

  state.nextUid += 1;

  if (
    replaceUnits(
      state,
      materials,
      result
    )
  ) {
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

  if (state.turn < SUMMON_UNLOCK_WAVE) {
    return `Overlay unlocks on wave ${SUMMON_UNLOCK_WAVE}.`;
  }

  if (state.overlayUsed) {
    return "Only one Overlay per turn.";
  }

  if (state.gold < OVERLAY_COST) {
    return "Not enough gold.";
  }

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

  state.gold -= OVERLAY_COST;
  state.overlayUsed = true;

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

  if (state.turn < SUMMON_UNLOCK_WAVE) {
    return `Polymerization unlocks on wave ${SUMMON_UNLOCK_WAVE}.`;
  }

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
  level: number;
  lane: number;
  def: boolean;
};

export type BossWave = {
  kind?: "boss";
  wave: number;
  route: string;
  routeName: string;
  tier: number;
  units: BossUnitSpec[];
  traps: GhostTrap[];
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

/** Boss traps: one from wave 5, two from wave 8, three on the last wave. */
function bossTraps(
  routeOrder: number,
  wave: number
): GhostTrap[] {
  const count =
    wave >= MAX_WAVES
      ? 3
      : wave >= 8
        ? 2
        : wave >= 5
          ? 1
          : 0;

  const usable =
    TRAPS.filter(
      (trap) => trap.tier <= waveTier(wave) && trap.trigger === "enter"
    );

  const traps: GhostTrap[] = [];

  for (let i = 0; i < count && usable.length > 0; i++) {
    traps.push({
      id: usable[(routeOrder * 3 + wave + i * 5) % usable.length].id,
      lane: LANE_ORDER[(wave + i) % LANES],
    });
  }

  return traps;
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

  // Lanes: the Boss card holds the middle, the rest fill the
  // emptiest lane (mid, left, right).
  const perLane = [
    0,
    0,
    0,
  ];

  const laneFor = (
    boss: boolean
  ) => {
    let lane =
      boss && perLane[1] < LANE_MAX
        ? 1
        : -1;

    if (lane < 0) {
      for (const candidate of LANE_ORDER) {
        if (
          perLane[candidate] < LANE_MAX &&
          (lane < 0 || perLane[candidate] < perLane[lane])
        ) {
          lane = candidate;
        }
      }
    }

    perLane[lane] += 1;

    return lane;
  };

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
          img: pick.card.art ?? pick.card.img,
          atk: stats.atk,
          hp: stats.hp,
          boss: pick.boss,
          keywords,
          power,
          level: pick.card.level,
          lane: laneFor(pick.boss),
          // Guardians hold a lane as a wall.
          def: !pick.boss && keywords.includes("taunt"),
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
    traps: bossTraps(
      route.order,
      wave
    ),
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
  traps: GhostTrap[];
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
    turn < MAX_WAVES
      ? state.ghosts[turn - 1] ?? null
      : null;

  if (ghost) {
    return {
      kind: "ghost",
      wave: turn,
      tier: waveTier(turn),
      ghostId: ghost.id,
      name: ghost.name,
      units: ghost.units,
      traps: ghost.traps,
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
// Combat units + synergies
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
  lane: number;
  /** Tile, counted from side 0's castle (0) to side 1's (LANE_LEN + 1). */
  y: number;
  def: boolean;
  /** Castle damage when it breaks through. */
  castle: number;
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
  banished: boolean;
  gone: boolean;
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
    lane: 1,
    y: 1,
    def: false,
    castle: 1,
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
    banished: false,
    gone: false,
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

/** Castle damage of a monster that breaks through. */
export function castleDamage(
  level: number,
  golden: boolean,
  boss: boolean
) {
  return 1 + Math.floor(Math.max(0, level) / 4) + (golden ? 1 : 0) + (boss ? 1 : 0);
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
  board: Pick<Unit, "id" | "atk" | "hp" | "golden" | "lane" | "def">[],
  side: 0 | 1
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
            side === 0 ? (unit as Unit).uid ?? index + 1 : 10000 + index,
            side,
            def.name,
            def.art ?? def.img
          );

        cu.attribute = def.attribute;
        cu.tribe = def.tribe;
        cu.atk = unit.atk;
        cu.hp = unit.hp;
        cu.golden = unit.golden;
        cu.lane = unit.lane;
        cu.def = unit.def;
        cu.castle =
          castleDamage(
            def.kind === "xyz" ? def.rank ?? 4 : def.level,
            unit.golden,
            false
          );

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
      cu.boss = spec.boss;
      cu.lane = spec.lane;
      cu.def = spec.def;
      cu.castle =
        castleDamage(
          spec.level,
          false,
          spec.boss
        );

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

/**
 * Positions: per side and lane, DEFENSE walls stand nearest the
 * castle, then the attackers in board order (the last one in front).
 * DEF walls get double durability (triple with Guardian).
 */
function deploy(
  units: CUnit[]
) {
  for (let lane = 0; lane < LANES; lane++) {
    const inLane =
      units.filter(
        (unit) => unit.lane === lane
      );

    const ordered = [
      ...inLane.filter((unit) => unit.def),
      ...inLane.filter((unit) => !unit.def),
    ];

    ordered.forEach(
      (unit, i) => {
        unit.y =
          unit.side === 0
            ? 1 + i
            : LANE_LEN - i;
      }
    );
  }

  for (const unit of units) {
    if (unit.def) {
      unit.hp *= unit.taunt ? 3 : 2;
    }

    unit.maxHp = unit.hp;
  }
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
      lane: unit.lane,
      // Always counted from the owner's castle.
      y: unit.side === 0 ? unit.y : LANE_LEN + 1 - unit.y,
      def: unit.def,
    })
  );
}

// ---------------------------------------------------------
// Combat: the lane simulation
// ---------------------------------------------------------

type LiveTrap = {
  def: TrapDef;
  lane: number;
  used: boolean;
};

export function resolveCombat(
  board: Unit[],
  wave: Foe,
  record: boolean,
  myTraps: readonly GhostTrap[] = []
): {
  result: "win" | "loss" | "tie";
  damage: number;
  dealt: number;
  recap: string[];
  frames: CombatFrame[];
} {
  const player =
    playerCombatUnits(
      board,
      0
    );

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

  deploy(sides[0]);
  deploy(sides[1]);

  const traps: [LiveTrap[], LiveTrap[]] = [
    myTraps.map(
      (trap) => ({
        def: TRAP_BY_ID.get(trap.id) as TrapDef,
        lane: trap.lane,
        used: false,
      })
    ),
    wave.traps.map(
      (trap) => ({
        def: TRAP_BY_ID.get(trap.id) as TrapDef,
        lane: trap.lane,
        used: false,
      })
    ),
  ];

  const cap =
    damageCap(wave.wave);

  // Castle damage taken: [side 0, side 1].
  const taken = [
    0,
    0,
  ];

  const frames: CombatFrame[] = [];

  let tokenUid = 20000;

  let hits: CombatHit[] = [];
  let castleHits: CastleHit[] = [];
  let flips: TrapFlip[] = [];
  let deaths: CombatDeath[] = [];

  // Why each unit is about to die (for events + the recap).
  const cause =
    new Map<number, {
      by: string;
      src: number;
    }>();

  const names =
    new Map<number, string>();

  const byUid =
    new Map<number, CUnit>();

  for (const unit of [...sides[0], ...sides[1]]) {
    names.set(unit.uid, unit.name);
    byUid.set(unit.uid, unit);
  }

  // Recap raw material, per lane.
  const notes =
    Array.from(
      {
        length: LANES,
      },
      (): LaneNotes => ({
        flips: [],
        kills: [],
        castle: [0, 0],
        breaks: [0, 0],
        held: [0, 0],
      })
    );

  const push = (
    ev: CombatEvent
  ) => {
    if (record) {
      frames.push({
        ev,
        mine: snap(sides[0]),
        foe: snap(sides[1]),
        traps: [
          traps[0].map(
            (trap) => ({
              lane: trap.lane,
              id: trap.def.id,
              used: trap.used,
            })
          ),
          traps[1].map(
            (trap) => ({
              lane: trap.lane,
              id: trap.def.id,
              used: trap.used,
            })
          ),
        ],
        castle: [
          Math.min(cap, taken[0]),
          Math.min(cap, taken[1]),
        ],
      });
    }
  };

  const enemyOf = (
    side: 0 | 1
  ): 0 | 1 => (side === 0 ? 1 : 0);

  const dirOf = (
    side: 0 | 1
  ) => (side === 0 ? 1 : -1);

  /** Units of `side` in `lane`, front (nearest the enemy) first. */
  const laneUnits = (
    side: 0 | 1,
    lane: number
  ) =>
    sides[side]
      .filter(
        (unit) => unit.lane === lane && unit.hp > 0
      )
      .sort(
        (a, b) => (side === 0 ? b.y - a.y : a.y - b.y) || a.uid - b.uid
      );

  const trapOn = (
    side: 0 | 1,
    lane: number
  ) =>
    traps[side].find(
      (trap) => trap.lane === lane && !trap.used
    ) ?? null;

  const flip = (
    side: 0 | 1,
    trap: LiveTrap,
    dst: number[]
  ) => {
    trap.used = true;

    const event = {
      side,
      lane: trap.lane,
      id: trap.def.id,
      dst,
    };

    flips.push(event);
    notes[trap.lane].flips.push({
      side,
      trap: trap.def.id,
      targets: dst.map(
        (uid) => `${names.get(uid) ?? "a monster"} (${byUid.get(uid)?.atk ?? 0})`
      ),
    });
  };

  const hitCastle = (
    side: 0 | 1,
    lane: number,
    amount: number,
    src: number,
    why: CastleHit["cause"]
  ) => {
    const waboku =
      traps[side].find(
        (trap) => trap.lane === lane && trap.def.effect === "no_castle_damage"
      );

    if (waboku) {
      if (!waboku.used) {
        flip(side, waboku, [src]);
      }

      return;
    }

    taken[side] += amount;

    castleHits.push({
      side,
      lane,
      amt: amount,
      src,
      cause: why,
    });

    notes[lane].castle[side] += amount;

    if (why === "breakthrough") {
      notes[lane].breaks[side === 0 ? 1 : 0] += 1;
    }
  };

  const hit = (
    target: CUnit,
    amount: number,
    venom: boolean,
    pierce: boolean,
    src: number,
    why: HitCause
  ) => {
    if (
      amount <= 0 ||
      target.hp <= 0
    ) {
      return;
    }

    hits.push({
      src,
      dst: target.uid,
      amt: target.shield ? 0 : amount,
      cause: why,
    });

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

    if (target.hp <= 0) {
      cause.set(target.uid, {
        by: venom ? "venom" : "battle",
        src,
      });
    }

    if (
      pierce &&
      amount > before
    ) {
      // Spills into the enemy behind the target, else the castle.
      const behind =
        laneUnits(target.side, target.lane).find(
          (unit) => unit !== target && (target.side === 1 ? unit.y > target.y : unit.y < target.y)
        );

      if (behind) {
        hit(
          behind,
          amount - before,
          false,
          false,
          src,
          "pierce"
        );
      } else {
        hitCastle(
          target.side,
          target.lane,
          1,
          src,
          "pierce"
        );
      }
    }
  };

  /** Free tile behind `unit` nearest its own castle (bounce). */
  const sendBack = (
    unit: CUnit
  ) => {
    const tiles =
      unit.side === 0
        ? Array.from({ length: unit.y - 1 }, (_, i) => i + 1)
        : Array.from({ length: LANE_LEN - unit.y }, (_, i) => LANE_LEN - i);

    const free =
      tiles.find(
        (y) => !sides[0].concat(sides[1]).some((other) => other.lane === unit.lane && other.y === y && other.hp > 0)
      );

    if (free !== undefined) {
      unit.y = free;
    }
  };

  const destroy = (
    unit: CUnit,
    by: string,
    banish = false
  ) => {
    unit.hp = 0;
    unit.banished = unit.banished || banish;

    cause.set(unit.uid, {
      by,
      src: -1,
    });
  };

  /** An enemy attacker stepped into `side`'s half of its lane. */
  const enterTrap = (
    side: 0 | 1,
    intruder: CUnit
  ) => {
    const trap =
      trapOn(side, intruder.lane);

    if (
      !trap ||
      trap.def.trigger !== "enter"
    ) {
      return;
    }

    switch (trap.def.effect) {
      case "destroy_min_atk":
        if (intruder.atk < trap.def.value) {
          return;
        }

        flip(side, trap, [intruder.uid]);
        destroy(intruder, trap.def.id);
        return;
      case "destroy":
        flip(side, trap, [intruder.uid]);
        destroy(intruder, trap.def.id);
        return;
      case "banish":
        flip(side, trap, [intruder.uid]);
        destroy(intruder, trap.def.id, true);
        return;
      case "bounce":
        flip(side, trap, [intruder.uid]);
        sendBack(intruder);
        return;
      case "reflect":
        flip(side, trap, [intruder.uid]);
        hitCastle(
          intruder.side,
          intruder.lane,
          intruder.castle,
          intruder.uid,
          "reflect"
        );
        sendBack(intruder);
        return;
      case "destroy_two": {
        const victims =
          laneUnits(intruder.side, intruder.lane)
            .filter(
              (unit) => !unit.def
            )
            .slice(0, 2);

        flip(side, trap, victims.map((unit) => unit.uid));

        for (const victim of victims) {
          destroy(victim, trap.def.id);
        }

        return;
      }
      case "wipe_lane": {
        const victims = [
          ...laneUnits(0, intruder.lane),
          ...laneUnits(1, intruder.lane),
        ];

        flip(side, trap, victims.map((unit) => unit.uid));

        for (const victim of victims) {
          destroy(victim, trap.def.id);
        }

        return;
      }
      default:
        return;
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

        if (!unit.gone) {
          const why =
            cause.get(unit.uid) ?? {
              by: "battle",
              src: -1,
            };

          deaths.push({
            uid: unit.uid,
            side,
            lane: unit.lane,
            by: why.by,
            src: why.src,
          });

          const killer =
            byUid.get(why.src);

          if (
            killer &&
            (why.by === "battle" || why.by === "venom")
          ) {
            notes[unit.lane].kills.push({
              side,
              killer: `${killer.name} (${killer.atk})`,
              victim: `${unit.name} (${unit.atk})`,
            });
          }

          cause.delete(unit.uid);
        }

        if (unit.banished) {
          continue;
        }

        // Last Will: the front ally in its lane, else the front
        // ally of the leftmost lane (no randomness in combat).
        if (unit.lastwill > 0) {
          const ally =
            laneUnits(side, unit.lane)[0] ??
            [0, 1, 2]
              .map((lane) => laneUnits(side, lane)[0])
              .find(Boolean);

          if (ally) {
            ally.atk += unit.lastwill;
            ally.hp += unit.lastwill;
            ally.maxHp += unit.lastwill;
          }
        }

        const haunted =
          trapOn(side, unit.lane);

        if (unit.revive) {
          unit.revive = false;
          unit.hp = unit.reviveFull ? unit.maxHp : 1;
          unit.lastwill = 0;
          unit.spawn = 0;

          list.splice(i, 0, unit);
        } else if (
          haunted &&
          haunted.def.effect === "revive" &&
          !unit.token
        ) {
          flip(side, haunted, [unit.uid]);

          unit.hp = unit.maxHp;
          unit.lastwill = 0;
          unit.spawn = 0;

          list.splice(i, 0, unit);
        } else if (unit.spawn > 0) {
          const token =
            blankCUnit(
              tokenUid,
              side,
              "Token",
              ""
            );

          tokenUid += 1;

          names.set(token.uid, "Token");
          byUid.set(token.uid, token);

          token.atk = unit.spawn;
          token.hp = unit.spawn;
          token.maxHp = unit.spawn;
          token.token = true;
          token.lane = unit.lane;
          token.y = unit.y;

          list.splice(i, 0, token);
        }

        i += 1;
      }
    }
  };

  const flush = () => {
    const out = {
      hits,
      castle: castleHits,
      traps: flips,
      deaths,
    };

    hits = [];
    castleHits = [];
    flips = [];
    deaths = [];

    return out;
  };

  /** The front enemy of the first lane (mid, left, right) with one. */
  const firstFront = (
    side: 0 | 1
  ) =>
    LANE_ORDER.map(
      (lane) => laneUnits(side, lane)[0]
    ).find(Boolean) ?? null;

  /** The enemy with the most ATK (ties: lowest uid). */
  const strongest = (
    side: 0 | 1
  ) =>
    [...sides[side]]
      .filter(
        (unit) => unit.hp > 0
      )
      .sort(
        (a, b) => b.atk - a.atk || a.uid - b.uid
      )[0] ?? null;

  push({
    k: "start",
  });

  // ---- Start of combat: Fiend, FIRE, Ambush ----
  // (Bosses have no synergies: they draw no extra random numbers.)
  const synergyOf = [
    player,
    foe,
  ] as const;

  for (const side of [0, 1] as const) {
    const fiend =
      synergyOf[side].fiend;

    if (fiend > 0) {
      for (const unit of sides[enemyOf(side)]) {
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
      sides[enemyOf(side)];

    if (
      fire === 0 ||
      enemy.length === 0
    ) {
      continue;
    }

    // FIRE 3: the front enemy of the first busy lane; 5: everyone.
    const targets =
      fire === 2
        ? [...enemy]
        : [firstFront(enemyOf(side)) as CUnit];

    for (const target of targets) {
      hit(target, 3, false, false, -1, "fire");
    }

    processDeaths();
    flush();

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
        sides[enemyOf(side)];

      if (
        unit.ambush <= 0 ||
        unit.hp <= 0 ||
        !sides[side].includes(unit) ||
        enemy.length === 0
      ) {
        continue;
      }

      // The front enemy in its lane, else the strongest enemy.
      const target =
        laneUnits(enemyOf(side), unit.lane)[0] ??
        (strongest(enemyOf(side)) as CUnit);

      hit(target, unit.ambush, false, false, unit.uid, "ambush");

      processDeaths();
      flush();

      push({
        k: "ambush",
        src: unit.uid,
        dst: [target.uid],
        amt: unit.ambush,
      });
    }
  }

  // ---- Ticks ----
  let quiet = 0;

  for (let tick = 0; tick < MAX_TICKS && quiet < STALL_TICKS; tick++) {
    const attackers =
      sides[0].some((unit) => !unit.def) ||
      sides[1].some((unit) => !unit.def);

    if (!attackers) {
      break;
    }

    const before =
      JSON.stringify(
        [...sides[0], ...sides[1]].map(
          (unit) => [unit.uid, unit.y, unit.hp]
        )
      );

    // 1. Clash: the two front units of a lane, if adjacent.
    for (let lane = 0; lane < LANES; lane++) {
      const a =
        laneUnits(0, lane)[0];

      const b =
        laneUnits(1, lane)[0];

      if (
        !a ||
        !b ||
        b.y - a.y !== 1
      ) {
        continue;
      }

      // Simultaneous: both strike with what they had.
      const strikes = [
        {
          from: a,
          to: b,
        },
        {
          from: b,
          to: a,
        },
      ].map(
        ({
          from,
          to,
        }) => ({
          from,
          to,
          amount: from.def ? Math.floor(from.atk / 2) : from.atk,
          swings: from.double ? 2 : 1,
        })
      );

      for (const strike of strikes) {
        for (let swing = 0; swing < strike.swings; swing++) {
          if (swing > 0 && strike.to.hp <= 0) {
            break;
          }

          hit(
            strike.to,
            strike.amount,
            strike.from.venom,
            strike.from.pierce,
            strike.from.uid,
            strike.from.def ? "counter" : "attack"
          );
        }
      }
    }

    processDeaths();

    // 2. Move: attackers step forward, front first.
    for (const side of [0, 1] as const) {
      const dir =
        dirOf(side);

      for (let lane = 0; lane < LANES; lane++) {
        for (const unit of laneUnits(side, lane)) {
          if (
            unit.def ||
            unit.hp <= 0 ||
            unit.gone
          ) {
            continue;
          }

          const next =
            unit.y + dir;

          if (
            next === 0 ||
            next === LANE_LEN + 1
          ) {
            // Breaks through: castle damage, then it leaves.
            hitCastle(
              enemyOf(side),
              lane,
              unit.castle,
              unit.uid,
              "breakthrough"
            );

            unit.gone = true;
            unit.hp = 0;
            unit.banished = true;

            continue;
          }

          const blocked =
            sides[0].concat(sides[1]).some(
              (other) => other !== unit && other.lane === lane && other.y === next && other.hp > 0
            );

          if (blocked) {
            continue;
          }

          unit.y = next;

          const entered =
            side === 0
              ? next === HALF + 1
              : next === HALF;

          if (entered) {
            enterTrap(
              enemyOf(side),
              unit
            );
          }
        }
      }

      processDeaths();
    }

    const changed =
      hits.length > 0 ||
      castleHits.length > 0 ||
      flips.length > 0 ||
      JSON.stringify(
        [...sides[0], ...sides[1]].map(
          (unit) => [unit.uid, unit.y, unit.hp]
        )
      ) !== before;

    quiet =
      changed
        ? 0
        : quiet + 1;

    push({
      k: "tick",
      ...flush(),
    });
  }

  // ---- Lanes held: a lane only one side still stands in chips
  // the other castle for 1 (no stalling behind walls). ----
  for (let lane = 0; lane < LANES; lane++) {
    const mine =
      laneUnits(0, lane).length;

    const theirs =
      laneUnits(1, lane).length;

    if (mine > 0 && theirs === 0) {
      notes[lane].held[0] = 1;
      // (chip damage below is counted in notes[lane].castle)
      hitCastle(1, lane, 1, -1, "held");
    } else if (theirs > 0 && mine === 0) {
      notes[lane].held[1] = 1;
      hitCastle(0, lane, 1, -1, "held");
    }
  }

  if (castleHits.length > 0) {
    push({
      k: "tick",
      ...flush(),
    });
  }

  const recap =
    notes.map(
      (note, lane) => laneRecapLine(lane, note, sides[0].some((unit) => unit.lane === lane && unit.def))
    );

  const damage =
    Math.min(cap, taken[0]);

  const dealt =
    Math.min(cap, taken[1]);

  // Castle damage decides: more taken than dealt = loss.
  const result: "win" | "loss" | "tie" =
    damage > dealt
      ? "loss"
      : dealt > damage
        ? "win"
        : "tie";

  push({
    k: "end",
    result,
    damage,
    dealt,
  });

  return {
    result,
    damage,
    dealt,
    recap,
    frames,
  };
}

const TRAP_VERB: Record<string, string> = {
  destroy_min_atk: "destroyed",
  destroy: "destroyed",
  banish: "banished",
  destroy_two: "destroyed",
  wipe_lane: "wiped out",
  bounce: "sent back",
  reflect: "reflected",
  revive: "revived",
  no_castle_damage: "blocked damage from",
};

type LaneNotes = {
  flips: {
    side: 0 | 1;
    trap: string;
    targets: string[];
  }[];
  kills: {
    /** The side that lost the monster. */
    side: 0 | 1;
    killer: string;
    victim: string;
  }[];
  /** Castle damage taken this combat from this lane: [yours, theirs]. */
  castle: [number, number];
  /** Breakthroughs: [yours, theirs]. */
  breaks: [number, number];
  held: [number, number];
};

/**
 * "Left: Gaia (5) beat your Celtic Guardian (3) → 2 damage to your
 * castle". Numbers in brackets are ATK. Damage is before the cap.
 */
function laneRecapLine(
  lane: number,
  note: LaneNotes,
  myWall: boolean
) {
  const label =
    ["Left", "Mid", "Right"][lane];

  const parts: string[] = [];

  for (const flip of note.flips.slice(0, 1)) {
    const trap =
      TRAP_BY_ID.get(flip.trap);

    const what =
      flip.targets.length === 0
        ? "the lane"
        : flip.targets.length === 1
          ? flip.targets[0]
          : `${flip.targets.length} monsters`;

    parts.push(`${flip.side === 0 ? "your" : "their"} ${trap?.name ?? "trap"} ${TRAP_VERB[trap?.effect ?? "destroy"]} ${what}`);
  }

  const kill =
    note.kills[0];

  if (kill) {
    parts.push(
      kill.side === 0
        ? `${kill.killer} beat your ${kill.victim}`
        : `your ${kill.killer} beat ${kill.victim}`
    );

  }

  const damage: string[] = [];

  if (note.castle[0] > 0) {
    damage.push(`${note.castle[0]} damage to your castle`);
  }

  if (note.castle[1] > 0) {
    damage.push(`${note.castle[1]} damage to their castle`);
  }

  if (parts.length === 0) {
    if (note.breaks[0] + note.breaks[1] > 0) {
      parts.push(note.breaks[1] > note.breaks[0] ? "they walked through unopposed" : "you walked through unopposed");
    } else if (note.held[0] || note.held[1]) {
      parts.push(note.held[0] ? "only you stood here" : "only they stood here");
    } else {
      parts.push(myWall ? "your wall held" : "no fight here");
    }
  }

  const text =
    `${parts.join(" · ")}${damage.length > 0 ? ` → ${damage.join(", ")}` : ""}`;

  return `${label}: ${text.charAt(0).toUpperCase()}${text.slice(1)}`;
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
  state.overlayUsed = false;

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

  // An untaken reward is forfeited.
  releaseReward(state, null);

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

  const myTraps =
    state.traps.map(
      (trap) => ({
        id: trap.id,
        lane: trap.lane,
      })
    );

  // The board that goes into this fight: a ghost for friends.
  state.snapshots.push({
    turn: state.turn,
    units: state.board.map(
      (unit) => ({
        id: unit.id,
        atk: unit.atk,
        hp: unit.hp,
        golden: unit.golden,
        lane: unit.lane,
        def: unit.def,
      })
    ),
    traps: myTraps,
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
      record,
      myTraps
    );

  if (combat.result === "win") {
    state.wins += 1;
  } else if (combat.result === "loss") {
    state.losses += 1;
  } else {
    state.ties += 1;
  }

  // Whatever broke through hurts, even in a won fight.
  state.health -= combat.damage;

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
      const won =
        combat.result === "win";

      startNextTurn(run);

      if (won) {
        offerReward(
          run,
          state.turn - 1
        );
      }
    }
  }

  return {
    wave: wave.wave,
    route,
    foe: name,
    result: combat.result,
    damage: combat.damage,
    dealt: combat.dealt,
    cap: damageCap(wave.wave),
    recap: combat.recap,
    frames: combat.frames,
  };
}

const ACTION_RE =
  /^(?:b(\d)|s(\d{1,5})|p(\d{1,5})\.(\d)|m(\d{1,5})\.(\d)|(r)|(f)|(u)|d(\d)|(e)|x(\d{1,5})\.(\d{1,5})|c(\d{1,2})\.(\d{1,5})(?:\.(\d{1,5}))?|t(\d{1,5})|w(\d)(?:\.(\d{1,5}))?)$/;

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

  const lane =
    (index: number) => Number(match[index]);

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

    if (isTrapId(id)) {
      const free =
        freeTrapLane(state);

      if (free < 0) {
        return "All 3 trap zones are full: sell a trap first.";
      }

      state.gold -= UNIT_COST;
      state.shop[slot] = null;

      state.traps.push({
        uid: state.nextUid,
        id,
        lane: free,
      });

      state.nextUid += 1;

      return null;
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

  // ---- sell (unit or trap) ----
  if (match[2] !== undefined) {
    if (blockedByDiscover) {
      return "Pick a discover option first.";
    }

    const uid =
      Number(match[2]);

    const trapIndex =
      state.traps.findIndex(
        (trap) => trap.uid === uid
      );

    if (trapIndex >= 0) {
      state.pool[state.traps[trapIndex].id] += 1;
      state.traps.splice(trapIndex, 1);
      state.gold += SELL_VALUE;

      return null;
    }

    const found =
      findUnit(
        state,
        uid
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

  // ---- play from bench into a lane ----
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

    const target =
      lane(4);

    if (target >= LANES) {
      return "No such lane.";
    }

    if (state.board.length >= BOARD_MAX) {
      return "The board is full.";
    }

    if (laneCounts(state.board)[target] >= LANE_MAX) {
      return "That lane is full.";
    }

    state.bench.splice(found.index, 1);
    found.unit.lane = target;
    state.board.push(found.unit);

    triggerRally(
      state,
      found.unit
    );

    return null;
  }

  // ---- move a board unit (or a trap) to a lane ----
  if (match[5] !== undefined) {
    const uid =
      Number(match[5]);

    const target =
      lane(6);

    if (target >= LANES) {
      return "No such lane.";
    }

    const trap =
      state.traps.find(
        (t) => t.uid === uid
      );

    if (trap) {
      const other =
        state.traps.find(
          (t) => t.lane === target && t !== trap
        );

      if (other) {
        other.lane = trap.lane;
      }

      trap.lane = target;

      return null;
    }

    const found =
      findUnit(
        state,
        uid
      );

    if (
      !found ||
      found.where !== "board"
    ) {
      return "That unit is not on the board.";
    }

    if (
      found.unit.lane !== target &&
      laneCounts(state.board)[target] >= LANE_MAX
    ) {
      return "That lane is full.";
    }

    // Last in board order = front of its lane.
    state.board.splice(found.index, 1);
    found.unit.lane = target;
    state.board.push(found.unit);

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

  // ---- reward pick ----
  if (match[18] !== undefined) {
    return takeReward(
      run,
      Number(match[18]),
      match[19] !== undefined ? Number(match[19]) : null
    );
  }

  // ---- ATTACK / DEFENSE position ----
  if (match[17] !== undefined) {
    const found =
      findUnit(
        state,
        Number(match[17])
      );

    if (
      !found ||
      found.where !== "board"
    ) {
      return "That unit is not on the board.";
    }

    found.unit.def = !found.unit.def;

    return null;
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
