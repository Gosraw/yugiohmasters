import {
  applyAction,
  createRun,
  BOARD_MAX,
  MAX_TIER,
  UNIT_COST,
  type Run,
} from "./engine";

import {
  UNIT_BY_ID,
  type UnitDef,
} from "./units";

// =========================================================
// SHADOW ARENA - a simple greedy bot. Used by the tests (to
// produce realistic action logs) and for balance checks: a good
// human should beat it comfortably; it must never clear all 20
// waves. Not shipped to the UI.
// =========================================================

function value(
  run: Run,
  def: UnitDef,
  atk: number,
  hp: number,
  synergy: boolean
) {
  let score =
    atk + hp + def.tier * 2;

  if (def.ability === "ascend") {
    score += Math.max(0, 14 - run.state.turn);
  }

  if (synergy) {
    const counts =
      new Map<string, number>();

    for (const unit of run.state.board) {
      const other =
        UNIT_BY_ID.get(unit.id) as UnitDef;

      counts.set(other.attribute, (counts.get(other.attribute) ?? 0) + 1);

      if (other.tribe) {
        counts.set(other.tribe, (counts.get(other.tribe) ?? 0) + 1);
      }

      if (other.id === def.id && !unit.golden) {
        score += 4;
      }
    }

    score += (counts.get(def.attribute) ?? 0) * 1.5;

    if (def.tribe) {
      score += (counts.get(def.tribe) ?? 0) * 1.5;
    }
  }

  return score;
}

function act(
  run: Run,
  action: string
) {
  return applyAction(
    run,
    action
  ).ok;
}

export function playBotTurn(
  run: Run,
  options: {
    smart?: boolean;
  } = {}
) {
  const {
    state,
  } = run;

  const smart =
    options.smart ?? true;

  for (let guard = 0; guard < 60 && !state.over; guard++) {
    if (state.discover) {
      act(run, "d0");

      continue;
    }

    // Tier up when it is cheap enough or the board is full.
    if (
      state.tier < MAX_TIER &&
      state.gold >= state.tierCost &&
      (
        state.tierCost <= 3 ||
        (state.board.length >= 4 && state.turn >= 4) ||
        (state.turn >= 2 && state.tier === 1)
      )
    ) {
      if (act(run, "u")) {
        continue;
      }
    }

    // Best affordable shop unit.
    let bestSlot = -1;
    let bestValue = -Infinity;

    state.shop.forEach(
      (id, slot) => {
        if (!id) {
          return;
        }

        const def =
          UNIT_BY_ID.get(id) as UnitDef;

        const v =
          value(run, def, def.atk, def.hp, smart);

        if (v > bestValue) {
          bestValue = v;
          bestSlot = slot;
        }
      }
    );

    if (
      bestSlot >= 0 &&
      state.gold >= UNIT_COST
    ) {
      if (state.board.length < BOARD_MAX) {
        if (act(run, `b${bestSlot}`)) {
          continue;
        }
      } else {
        let weakest = state.board[0];
        let weakestValue = Infinity;

        for (const unit of state.board) {
          const def =
            UNIT_BY_ID.get(unit.id) as UnitDef;

          const v =
            value(run, def, unit.atk, unit.hp, false) + (unit.golden ? 100 : 0);

          if (v < weakestValue) {
            weakestValue = v;
            weakest = unit;
          }
        }

        if (bestValue > weakestValue + 3) {
          act(run, `s${weakest.uid}`);

          if (act(run, `b${bestSlot}`)) {
            continue;
          }
        }
      }
    }

    for (const unit of [...state.bench]) {
      if (state.board.length < BOARD_MAX) {
        act(run, `p${unit.uid}.${state.board.length}`);
      } else {
        act(run, `s${unit.uid}`);
      }
    }

    if (
      state.gold >= 1 &&
      state.gold < UNIT_COST + 1 &&
      state.gold < 3
    ) {
      break;
    }

    if (
      state.gold >= UNIT_COST + 1 ||
      (state.gold >= 1 && state.board.length >= BOARD_MAX && state.gold >= UNIT_COST)
    ) {
      if (act(run, "r")) {
        continue;
      }
    }

    break;
  }

  // Taunts to the front, then by health.
  if (smart) {
    const order =
      [...state.board].sort(
        (a, b) => {
          const ta =
            (UNIT_BY_ID.get(a.id) as UnitDef).ability === "taunt" ? 1 : 0;

          const tb =
            (UNIT_BY_ID.get(b.id) as UnitDef).ability === "taunt" ? 1 : 0;

          return tb - ta || b.hp - a.hp;
        }
      );

    order.forEach(
      (unit, position) => {
        act(run, `m${unit.uid}.${position}`);
      }
    );
  }

  return applyAction(
    run,
    "e"
  );
}

export function playBotRun(
  seed: string,
  options: {
    smart?: boolean;
  } = {}
) {
  const run =
    createRun(seed);

  while (!run.state.over) {
    playBotTurn(
      run,
      options
    );
  }

  return run;
}
