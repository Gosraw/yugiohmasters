"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsUp,
  Coins,
  Eye,
  Heart,
  Lock,
  LogOut,
  RefreshCw,
  Snowflake,
  Sparkles,
  Swords,
  Timer,
  Trash2,
  X,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  PointerEvent as ReactPointerEvent,
} from "react";

import {
  applyAction,
  boardSynergies,
  bossWave,
  restoreRun,
  runScore,
  turnSeconds,
  BENCH_MAX,
  BOARD_MAX,
  MAX_TIER,
  MAX_WAVES,
  ROLL_COST,
  SELL_VALUE,
  START_HEALTH,
  UNIT_COST,
  type CombatResult,
  type Run,
  type RunState,
  type Unit,
} from "@/lib/games/autobattler/engine";

import {
  ABILITY_LABEL,
  SYNERGY_TEXT,
  UNIT_BY_ID,
  abilityText,
  type Ability,
  type SynergyKey,
  type UnitDef,
} from "@/lib/games/autobattler/units";

import {
  ArenaCombat,
} from "./arena-combat";

import {
  UnitTile,
} from "./unit-tile";

import styles from "./arena.module.css";

// =========================================================
// SHADOW ARENA - the run itself (shop phase + combat playback).
//
// Holds the engine Run in a ref and renders a cloned snapshot.
// Every player action goes through applyAction() - exactly what
// the server replays later - and the log is saved to
// localStorage after each action, so a killed tab can resume.
//
// Controls (phone first, all targets >= 44px):
//   - tap a shop card, then Buy (or tap it again)
//   - tap a unit, then tap a board slot to move / play it there
//   - or drag: shop -> board buys, unit -> board slot moves,
//     unit -> the sell zone (over the shop) sells
// =========================================================

export const ARENA_SAVE_KEY = "dc.shadowArena.run.v1";

export type SavedArenaRun = {
  runId: string;
  seed: string;
  mode: "daily" | "practice";
  actions: string[];
  savedAt: number;
};

export function readSavedArenaRun(): SavedArenaRun | null {
  try {
    const raw =
      window.localStorage.getItem(ARENA_SAVE_KEY);

    if (!raw) {
      return null;
    }

    const saved =
      JSON.parse(raw) as SavedArenaRun;

    if (
      typeof saved?.runId !== "string" ||
      typeof saved.seed !== "string" ||
      !Array.isArray(saved.actions)
    ) {
      return null;
    }

    return saved;
  } catch {
    return null;
  }
}

export function clearSavedArenaRun() {
  try {
    window.localStorage.removeItem(ARENA_SAVE_KEY);
  } catch {
    // ignore
  }
}

function saveRun(
  saved: SavedArenaRun
) {
  try {
    window.localStorage.setItem(
      ARENA_SAVE_KEY,
      JSON.stringify(saved)
    );
  } catch {
    // Private mode / full storage: the run still works, it just
    // can't be resumed.
  }
}

export type ArenaFinish = {
  score: number;
  log: {
    v: number;
    a: string[];
  };
  state: RunState;
};

type Selection =
  | {
      kind: "shop";
      slot: number;
    }
  | {
      kind: "unit";
      uid: number;
    }
  | {
      kind: "syn";
      key: SynergyKey;
    }
  | null;

type DragSource =
  | {
      kind: "shop";
      slot: number;
    }
  | {
      kind: "unit";
      uid: number;
    };

type DragState = {
  source: DragSource;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  img: string;
  name: string;
};

type Props = {
  runId: string;
  seed: string;
  mode: "daily" | "practice";
  initialActions: string[];
  /** Date.now() at the moment the hub opened this screen. */
  openedAt: number;
  onFinished: (finish: ArenaFinish) => void;
  onLeave: () => void;
};

function clone(
  state: RunState
): RunState {
  return structuredClone(state);
}

function defOf(
  unit: Unit
) {
  return UNIT_BY_ID.get(unit.id) as UnitDef;
}

function unitAbilities(
  def: UnitDef
): Ability[] {
  return [def.ability];
}

export function ArenaPlay({
  runId,
  seed,
  mode,
  initialActions,
  openedAt,
  onFinished,
  onLeave,
}: Props) {
  const runRef =
    useRef<Run | null>(null);

  const [view, setView] =
    useState<RunState | null>(null);

  const [selected, setSelected] =
    useState<Selection>(null);

  const [combat, setCombat] =
    useState<{
      result: CombatResult;
      routeName: string;
      healthBefore: number;
    } | null>(null);

  const [deadline, setDeadline] =
    useState<number | null>(null);

  const [now, setNow] =
    useState(openedAt);

  const [toast, setToast] =
    useState<string | null>(null);

  const [scoutOpen, setScoutOpen] =
    useState(false);

  const [confirmLeave, setConfirmLeave] =
    useState(false);

  const [drag, setDrag] =
    useState<DragState | null>(null);

  const dragRef =
    useRef<DragState | null>(null);

  const endingRef =
    useRef(false);

  const toastTimer =
    useRef<number | null>(null);

  // ---- boot (new run or resume) ----
  useEffect(() => {
    const run =
      restoreRun(
        seed,
        initialActions
      ) ?? restoreRun(seed, []);

    runRef.current = run;

    const timer =
      window.setTimeout(
        () => {
          if (!run) {
            return;
          }

          setView(clone(run.state));
          setDeadline(Date.now() + turnSeconds(run.state.turn) * 1000);
        },
        0
      );

    return () => {
      window.clearTimeout(timer);
    };
  }, [seed, initialActions]);

  const flash = useCallback(
    (message: string) => {
      setToast(message);

      if (toastTimer.current) {
        window.clearTimeout(toastTimer.current);
      }

      toastTimer.current =
        window.setTimeout(
          () => setToast(null),
          1800
        );
    },
    []
  );

  const act = useCallback(
    (action: string): boolean => {
      const run =
        runRef.current;

      if (
        !run ||
        run.state.over
      ) {
        return false;
      }

      const healthBefore =
        run.state.health;

      const wave =
        run.state.turn;

      const outcome =
        applyAction(
          run,
          action,
          {
            record: true,
          }
        );

      if (!outcome.ok) {
        flash(outcome.error);

        return false;
      }

      saveRun({
        runId,
        seed,
        mode,
        actions: [...run.state.log],
        savedAt: Date.now(),
      });

      if (outcome.combat) {
        const route =
          bossWave(
            run.state.bossOrder,
            wave
          );

        setDeadline(null);
        setSelected(null);
        setScoutOpen(false);
        setCombat({
          result: outcome.combat,
          routeName: route.routeName,
          healthBefore,
        });
      }

      setView(clone(run.state));

      return true;
    },
    [flash, mode, runId, seed]
  );

  const endTurn = useCallback(
    () => {
      if (endingRef.current) {
        return;
      }

      endingRef.current = true;

      act("e");

      endingRef.current = false;
    },
    [act]
  );

  // ---- turn timer ----
  useEffect(() => {
    if (deadline === null) {
      return;
    }

    const interval =
      window.setInterval(
        () => {
          const t =
            Date.now();

          setNow(t);

          if (t >= deadline) {
            window.clearInterval(interval);

            endTurn();
          }
        },
        250
      );

    return () => {
      window.clearInterval(interval);
    };
  }, [deadline, endTurn]);

  const combatDone = useCallback(
    () => {
      const run =
        runRef.current;

      setCombat(null);

      if (!run) {
        return;
      }

      if (run.state.over) {
        onFinished({
          score: runScore(run.state),
          log: {
            v: 1,
            a: [...run.state.log],
          },
          state: clone(run.state),
        });

        return;
      }

      const t =
        Date.now();

      setNow(t);
      setDeadline(t + turnSeconds(run.state.turn) * 1000);
    },
    [onFinished]
  );

  // ---- drag & drop ----
  const performDrop = useCallback(
    (source: DragSource, target: string | null) => {
      const run =
        runRef.current;

      if (
        !run ||
        !target
      ) {
        return;
      }

      const state =
        run.state;

      if (target === "sell") {
        if (source.kind === "unit") {
          act(`s${source.uid}`);
          setSelected(null);
        }

        return;
      }

      const [zone, raw] =
        target.split(":");

      const index =
        Number(raw ?? 0);

      if (source.kind === "shop") {
        if (
          zone !== "board" &&
          zone !== "bench"
        ) {
          return;
        }

        const boardBefore =
          state.board.length;

        if (!act(`b${source.slot}`)) {
          return;
        }

        setSelected(null);

        // Bought straight onto the board: slide it to the slot it
        // was dropped on.
        if (
          zone === "board" &&
          state.board.length === boardBefore + 1
        ) {
          const bought =
            state.board[state.board.length - 1];

          const position =
            Math.min(
              index,
              state.board.length - 1
            );

          if (position !== state.board.length - 1) {
            act(`m${bought.uid}.${position}`);
          }
        }

        return;
      }

      const onBoard =
        state.board.findIndex(
          (unit) => unit.uid === source.uid
        );

      if (zone === "board") {
        if (onBoard >= 0) {
          const position =
            Math.min(
              index,
              state.board.length - 1
            );

          if (position !== onBoard) {
            act(`m${source.uid}.${position}`);
          }
        } else {
          act(`p${source.uid}.${Math.min(index, state.board.length)}`);
        }

        setSelected(null);
      }
    },
    [act]
  );

  useEffect(() => {
    if (!drag) {
      return;
    }

    const move = (
      event: PointerEvent
    ) => {
      const current =
        dragRef.current;

      if (
        !current ||
        event.pointerId !== current.pointerId
      ) {
        return;
      }

      const distance =
        Math.abs(event.clientX - current.startX) + Math.abs(event.clientY - current.startY);

      const next: DragState = {
        ...current,
        x: event.clientX,
        y: event.clientY,
        active: current.active || distance > 10,
      };

      dragRef.current = next;

      setDrag(next);
    };

    const up = (
      event: PointerEvent
    ) => {
      const current =
        dragRef.current;

      if (
        !current ||
        event.pointerId !== current.pointerId
      ) {
        return;
      }

      dragRef.current = null;

      setDrag(null);

      if (!current.active) {
        return;
      }

      const element =
        document.elementFromPoint(
          event.clientX,
          event.clientY
        );

      const target =
        element?.closest<HTMLElement>("[data-drop]")?.dataset.drop ?? null;

      performDrop(
        current.source,
        target
      );
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag, performDrop]);

  const startDrag = (
    event: ReactPointerEvent,
    source: DragSource,
    img: string,
    name: string
  ) => {
    if (
      event.button !== 0 ||
      combat
    ) {
      return;
    }

    const state: DragState = {
      source,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
      img,
      name,
    };

    dragRef.current = state;

    setDrag(state);
  };

  if (!view) {
    return (
      <div className="fixed inset-0 z-[55] flex items-center justify-center bg-[#03050f] text-sm text-zinc-400">
        Opening the arena...
      </div>
    );
  }

  // ---- derived ----
  const secondsLeft =
    deadline === null
      ? turnSeconds(view.turn)
      : Math.max(
          0,
          Math.ceil((deadline - now) / 1000)
        );

  const nextWave =
    bossWave(
      view.bossOrder,
      view.turn
    );

  const synergies =
    boardSynergies(view.board)
      .filter(
        (syn) => syn.count >= 2
      )
      .sort(
        (a, b) => b.level - a.level || b.count - a.count
      );

  const selectedUnit =
    selected?.kind === "unit"
      ? [...view.board, ...view.bench].find(
          (unit) => unit.uid === selected.uid
        ) ?? null
      : null;

  const selectedOnBoard =
    selectedUnit
      ? view.board.some(
          (unit) => unit.uid === selectedUnit.uid
        )
      : false;

  const selectedShopId =
    selected?.kind === "shop"
      ? view.shop[selected.slot] ?? null
      : null;

  const draggingOwnUnit =
    drag?.active === true &&
    drag.source.kind === "unit";

  const tapShop = (
    slot: number
  ) => {
    if (
      selected?.kind === "shop" &&
      selected.slot === slot
    ) {
      if (act(`b${slot}`)) {
        setSelected(null);
      }

      return;
    }

    setSelected({
      kind: "shop",
      slot,
    });
  };

  const tapBoardSlot = (
    index: number,
    unit: Unit | undefined
  ) => {
    if (selectedUnit) {
      if (
        unit &&
        unit.uid === selectedUnit.uid
      ) {
        setSelected(null);

        return;
      }

      if (selectedOnBoard) {
        act(`m${selectedUnit.uid}.${Math.min(index, view.board.length - 1)}`);
        setSelected(null);

        return;
      }

      // From the bench onto the board.
      act(`p${selectedUnit.uid}.${Math.min(index, view.board.length)}`);
      setSelected(null);

      return;
    }

    if (
      selected?.kind === "shop" &&
      !unit
    ) {
      performDrop(
        {
          kind: "shop",
          slot: selected.slot,
        },
        `board:${index}`
      );

      return;
    }

    if (unit) {
      setSelected({
        kind: "unit",
        uid: unit.uid,
      });
    }
  };

  const tapBench = (
    unit: Unit
  ) => {
    if (selectedUnit?.uid === unit.uid) {
      setSelected(null);

      return;
    }

    setSelected({
      kind: "unit",
      uid: unit.uid,
    });
  };

  const lowTime =
    deadline !== null &&
    secondsLeft <= 10;

  // ---- render ----
  return (
    <div
      className="fixed inset-0 z-[55] flex h-[100dvh] w-full select-none flex-col overflow-hidden overscroll-none bg-[#03050f] text-zinc-100 [-webkit-touch-callout:none]"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 60rem 28rem at 50% -10%, rgba(242,196,90,.12), transparent 70%), radial-gradient(ellipse 50rem 30rem at 50% 115%, rgba(44,69,144,.3), transparent 70%)",
      }}
    >
      {
        combat
          ? (
              <div className="mx-auto flex h-full w-full max-w-md flex-col pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
                <ArenaCombat
                  combat={combat.result}
                  routeName={combat.routeName}
                  healthBefore={combat.healthBefore}
                  onDone={combatDone}
                />
              </div>
            )
          : (
              <div className="mx-auto flex h-full w-full max-w-md flex-col gap-2 overflow-y-auto overscroll-contain px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-[max(.5rem,env(safe-area-inset-top))]">
                {/* ---- header ---- */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmLeave(true)}
                    aria-label="Leave the arena"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 active:scale-95"
                  >
                    <LogOut
                      size={17}
                      aria-hidden
                    />
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[.2em] text-amber-300/80">
                      {mode === "daily" ? "Daily Arena" : "Practice"} · Wave {view.turn}/{MAX_WAVES}
                    </p>

                    <p className="truncate font-display text-[15px] font-bold leading-5 text-amber-100">
                      Shadow Arena
                    </p>
                  </div>

                  <div
                    className={`flex h-11 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-xl border px-2.5 font-display text-lg font-black tabular-nums ${
                      lowTime
                        ? `border-red-400/60 bg-red-500/15 text-red-200 ${styles.timerLow}`
                        : "border-amber-300/30 bg-amber-300/10 text-amber-100"
                    }`}
                    role="timer"
                    aria-label={`${secondsLeft} seconds left`}
                  >
                    <Timer
                      size={16}
                      aria-hidden
                    />
                    {secondsLeft}
                  </div>
                </div>

                {/* ---- HUD ---- */}
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-rose-400/25 bg-rose-500/10 text-sm font-black tabular-nums text-rose-100">
                    <Heart
                      size={15}
                      className="text-rose-400"
                      aria-hidden
                    />
                    {view.health}
                    <span className="text-[11px] font-semibold text-rose-200/60">
                      /{START_HEALTH}
                    </span>
                  </div>

                  <div className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-amber-300/30 bg-amber-300/10 text-sm font-black tabular-nums text-amber-100">
                    <Coins
                      size={15}
                      className="text-amber-300"
                      aria-hidden
                    />
                    {view.gold}
                    <span className="text-[11px] font-semibold text-amber-200/60">
                      /{view.maxGold}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => act("u")}
                    disabled={view.tier >= MAX_TIER || view.gold < view.tierCost}
                    className="flex h-10 items-center justify-center gap-1 rounded-xl border border-sky-300/30 bg-sky-400/10 text-sm font-black text-sky-100 transition active:scale-95 disabled:opacity-60"
                    aria-label={
                      view.tier >= MAX_TIER
                        ? `Shop tier ${view.tier}, maximum`
                        : `Shop tier ${view.tier}. Upgrade for ${view.tierCost} gold`
                    }
                  >
                    <span className="tabular-nums">
                      T{view.tier}
                    </span>

                    {
                      view.tier < MAX_TIER
                        ? (
                            <span className="flex items-center gap-0.5 rounded-md bg-sky-300/15 px-1 text-[11px]">
                              <ChevronsUp
                                size={12}
                                aria-hidden
                              />
                              {view.tierCost}
                            </span>
                          )
                        : null
                    }
                  </button>
                </div>

                {/* ---- next wave (scout) ---- */}
                <button
                  type="button"
                  onClick={() => setScoutOpen(true)}
                  className="flex min-h-[3.25rem] items-center gap-2 rounded-xl border border-red-400/20 bg-red-950/25 px-2.5 py-1.5 text-left active:scale-[.99]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-bold uppercase tracking-[.18em] text-red-300/80">
                      Next: wave {view.turn}
                    </span>

                    <span className="block truncate text-[13px] font-semibold text-zinc-100">
                      {nextWave.routeName}
                    </span>
                  </span>

                  <span className="flex -space-x-2">
                    {nextWave.units.slice(0, 5).map(
                      (unit, i) => (
                        <span
                          key={`${unit.name}-${i}`}
                          className={`relative h-8 w-8 overflow-hidden rounded-full border-2 bg-[#0b1024] ${unit.boss ? "border-red-400" : "border-[#03050f]"}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={unit.img}
                            alt=""
                            className={styles.art}
                            draggable={false}
                          />
                        </span>
                      )
                    )}
                  </span>

                  <Eye
                    size={16}
                    className="shrink-0 text-red-200/70"
                    aria-label="Scout"
                  />
                </button>

                {/* ---- shop ---- */}
                <section
                  aria-label="Shop"
                  className="relative rounded-2xl border border-[rgb(242_196_90/.18)] bg-[linear-gradient(180deg,rgba(18,26,56,.8),rgba(10,14,34,.85))] p-2"
                >
                  <div className="mb-2 flex items-center gap-1.5">
                    <p className="flex-1 text-[11px] font-bold uppercase tracking-[.18em] text-amber-200/80">
                      Shop · {UNIT_COST}
                      <Coins
                        size={11}
                        className="mb-0.5 ml-0.5 inline text-amber-300"
                        aria-hidden
                      />
                    </p>

                    <button
                      type="button"
                      onClick={() => act("f")}
                      aria-pressed={view.frozen}
                      className={`flex h-11 items-center gap-1 rounded-xl border px-2.5 text-xs font-bold transition active:scale-95 ${
                        view.frozen
                          ? "border-cyan-300/70 bg-cyan-400/20 text-cyan-100"
                          : "border-white/10 bg-white/5 text-zinc-300"
                      }`}
                    >
                      {
                        view.frozen
                          ? (
                              <Lock
                                size={14}
                                aria-hidden
                              />
                            )
                          : (
                              <Snowflake
                                size={14}
                                aria-hidden
                              />
                            )
                      }
                      {view.frozen ? "Frozen" : "Freeze"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (act("r")) {
                          setSelected(null);
                        }
                      }}
                      disabled={view.gold < ROLL_COST}
                      className="flex h-11 items-center gap-1 rounded-xl border border-amber-300/40 bg-amber-300/10 px-2.5 text-xs font-bold text-amber-100 transition active:scale-95 disabled:opacity-50"
                    >
                      <RefreshCw
                        size={14}
                        aria-hidden
                      />
                      Refresh {ROLL_COST}
                    </button>
                  </div>

                  <div
                    className="grid gap-1.5"
                    style={{
                      gridTemplateColumns: `repeat(${Math.max(3, view.shop.length)}, minmax(0, 1fr))`,
                    }}
                  >
                    {view.shop.map(
                      (id, slot) => {
                        const def =
                          id ? UNIT_BY_ID.get(id) : null;

                        if (!def) {
                          return (
                            <div
                              key={`shop-${slot}`}
                              className="aspect-square rounded-lg border border-dashed border-white/10"
                            />
                          );
                        }

                        const isSelected =
                          selected?.kind === "shop" &&
                          selected.slot === slot;

                        return (
                          <button
                            key={`shop-${slot}-${def.id}`}
                            type="button"
                            onClick={() => tapShop(slot)}
                            onPointerDown={(event) =>
                              startDrag(
                                event,
                                {
                                  kind: "shop",
                                  slot,
                                },
                                def.img,
                                def.name
                              )
                            }
                            aria-label={`${def.name}, tier ${def.tier}, ${def.atk} attack ${def.hp} health. ${ABILITY_LABEL[def.ability]}.`}
                            className={`relative touch-none pb-1 transition active:scale-95 ${view.gold < UNIT_COST ? "opacity-60" : ""} ${drag?.active && drag.source.kind === "shop" && drag.source.slot === slot ? "opacity-30" : ""}`}
                          >
                            <UnitTile
                              name={def.name}
                              img={def.img}
                              atk={def.atk}
                              hp={def.hp}
                              tier={def.tier}
                              abilities={unitAbilities(def)}
                              taunt={def.ability === "taunt"}
                              selected={isSelected}
                              size="md"
                            />
                          </button>
                        );
                      }
                    )}
                  </div>

                  {
                    draggingOwnUnit
                      ? (
                          <div
                            data-drop="sell"
                            className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-red-400/70 bg-red-950/85 text-sm font-black text-red-100"
                          >
                            <Trash2
                              size={18}
                              aria-hidden
                            />
                            Drop to sell (+{SELL_VALUE})
                          </div>
                        )
                      : null
                  }
                </section>

                {/* ---- synergies ---- */}
                <div
                  className="flex min-h-7 gap-1 overflow-x-auto [scrollbar-width:none]"
                  aria-label="Synergies"
                >
                  {
                    synergies.length === 0
                      ? (
                          <p className="text-[11px] leading-7 text-zinc-500">
                            3 units of one attribute or type = a synergy bonus.
                          </p>
                        )
                      : synergies.map(
                          (syn) => (
                            <button
                              key={syn.key}
                              type="button"
                              onClick={() =>
                                setSelected({
                                  kind: "syn",
                                  key: syn.key,
                                })
                              }
                              className={`flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11px] font-bold ${
                                syn.level === 2
                                  ? "border-amber-200 bg-amber-300/30 text-amber-50"
                                  : syn.level === 1
                                    ? "border-amber-300/60 bg-amber-300/15 text-amber-100"
                                    : "border-white/10 bg-white/5 text-zinc-400"
                              }`}
                            >
                              {syn.key}
                              <span className="tabular-nums opacity-80">
                                {syn.count}/{syn.count >= 3 ? 5 : 3}
                              </span>
                            </button>
                          )
                        )
                  }
                </div>

                {/* ---- board ---- */}
                <section aria-label="Your board">
                  <p className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-[.18em] text-zinc-400">
                    <span>
                      Board {view.board.length}/{BOARD_MAX}
                    </span>

                    <span className="normal-case tracking-normal text-zinc-500">
                      Left attacks first
                    </span>
                  </p>

                  <div className="grid grid-cols-7 gap-1 rounded-2xl border border-amber-300/15 bg-amber-950/10 p-1.5">
                    {Array.from(
                      {
                        length: BOARD_MAX,
                      },
                      (_, index) => {
                        const unit =
                          view.board[index];

                        const def =
                          unit ? defOf(unit) : null;

                        const targetable =
                          (selectedUnit !== null && unit?.uid !== selectedUnit.uid) ||
                          (selected?.kind === "shop" && !unit);

                        return (
                          <button
                            key={unit ? `u-${unit.uid}` : `slot-${index}`}
                            type="button"
                            data-drop={`board:${index}`}
                            onClick={() => tapBoardSlot(index, unit)}
                            onPointerDown={
                              unit && def
                                ? (event) =>
                                    startDrag(
                                      event,
                                      {
                                        kind: "unit",
                                        uid: unit.uid,
                                      },
                                      def.img,
                                      def.name
                                    )
                                : undefined
                            }
                            aria-label={
                              unit && def
                                ? `${def.name}${unit.golden ? " (golden)" : ""}, ${unit.atk} attack ${unit.hp} health, position ${index + 1}`
                                : `Empty board slot ${index + 1}`
                            }
                            className={`relative min-h-11 touch-none pb-1 transition active:scale-95 ${drag?.active && drag.source.kind === "unit" && drag.source.uid === unit?.uid ? "opacity-30" : ""}`}
                          >
                            {
                              unit && def
                                ? (
                                    <UnitTile
                                      name={def.name}
                                      img={def.img}
                                      atk={unit.atk}
                                      hp={unit.hp}
                                      tier={def.tier}
                                      golden={unit.golden}
                                      abilities={unitAbilities(def)}
                                      taunt={def.ability === "taunt"}
                                      selected={selectedUnit?.uid === unit.uid}
                                      size="sm"
                                    />
                                  )
                                : (
                                    <div
                                      className={`aspect-square w-full rounded-lg border border-dashed ${
                                        targetable
                                          ? "border-amber-300/60 bg-amber-300/10"
                                          : "border-white/10"
                                      }`}
                                    />
                                  )
                            }
                          </button>
                        );
                      }
                    )}
                  </div>
                </section>

                {/* ---- bench ---- */}
                {
                  view.bench.length > 0
                    ? (
                        <section aria-label="Bench">
                          <p className="mb-1 text-[11px] font-bold uppercase tracking-[.18em] text-zinc-400">
                            Bench {view.bench.length}/{BENCH_MAX}
                          </p>

                          <div
                            className="grid grid-cols-7 gap-1"
                            data-drop="bench:0"
                          >
                            {view.bench.map(
                              (unit) => {
                                const def =
                                  defOf(unit);

                                return (
                                  <button
                                    key={`b-${unit.uid}`}
                                    type="button"
                                    onClick={() => tapBench(unit)}
                                    onPointerDown={(event) =>
                                      startDrag(
                                        event,
                                        {
                                          kind: "unit",
                                          uid: unit.uid,
                                        },
                                        def.img,
                                        def.name
                                      )
                                    }
                                    aria-label={`${def.name} on the bench, ${unit.atk} attack ${unit.hp} health`}
                                    className="relative min-h-11 touch-none pb-1 active:scale-95"
                                  >
                                    <UnitTile
                                      name={def.name}
                                      img={def.img}
                                      atk={unit.atk}
                                      hp={unit.hp}
                                      tier={def.tier}
                                      golden={unit.golden}
                                      abilities={unitAbilities(def)}
                                      selected={selectedUnit?.uid === unit.uid}
                                      size="sm"
                                    />
                                  </button>
                                );
                              }
                            )}
                          </div>
                        </section>
                      )
                    : null
                }

                {/* ---- detail ---- */}
                <DetailPanel
                  view={view}
                  selected={selected}
                  selectedUnit={selectedUnit}
                  selectedOnBoard={selectedOnBoard}
                  selectedShopId={selectedShopId}
                  onBuy={(slot) => {
                    if (act(`b${slot}`)) {
                      setSelected(null);
                    }
                  }}
                  onSell={(uid) => {
                    if (act(`s${uid}`)) {
                      setSelected(null);
                    }
                  }}
                  onPlay={(uid) => {
                    if (act(`p${uid}.${view.board.length}`)) {
                      setSelected(null);
                    }
                  }}
                  onMove={(uid, position) => {
                    act(`m${uid}.${position}`);
                  }}
                  onClose={() => setSelected(null)}
                />

                <div className="mt-auto pt-1">
                  <button
                    type="button"
                    onClick={endTurn}
                    className="primary-button flex min-h-[3.25rem] w-full items-center justify-center gap-2 text-base"
                  >
                    <Swords
                      size={18}
                      aria-hidden
                    />
                    Fight wave {view.turn}
                  </button>
                </div>
              </div>
            )
      }

      {/* ---- drag ghost ---- */}
      {
        drag?.active
          ? (
              <div
                aria-hidden
                className="pointer-events-none fixed z-[70] w-14 -translate-x-1/2 -translate-y-1/2 rotate-3 opacity-90 drop-shadow-[0_8px_18px_rgba(0,0,0,.6)]"
                style={{
                  left: drag.x,
                  top: drag.y,
                }}
              >
                <div className="relative aspect-square overflow-hidden rounded-lg border-2 border-amber-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={drag.img}
                    alt=""
                    className={styles.art}
                  />
                </div>
              </div>
            )
          : null
      }

      {/* ---- toast ---- */}
      {
        toast
          ? (
              <div
                role="status"
                className="pointer-events-none fixed inset-x-0 top-20 z-[75] flex justify-center px-4"
              >
                <p className="rounded-full border border-red-300/40 bg-red-950/90 px-4 py-2 text-sm font-semibold text-red-100 shadow-lg">
                  {toast}
                </p>
              </div>
            )
          : null
      }

      {/* ---- discover ---- */}
      {
        view.discover && !combat
          ? (
              <Sheet
                title="Triple! Pick a reward"
                subtitle={`Three copies became one golden unit. Choose a tier ${Math.min(MAX_TIER, view.tier + 1)} unit for free.`}
              >
                <div className="grid grid-cols-3 gap-2">
                  {view.discover.map(
                    (id, i) => {
                      const def =
                        UNIT_BY_ID.get(id) as UnitDef;

                      return (
                        <button
                          key={`${id}-${i}`}
                          type="button"
                          onClick={() => act(`d${i}`)}
                          className="rounded-xl border border-amber-300/30 bg-amber-300/5 p-2 pb-3 text-left active:scale-95"
                        >
                          <UnitTile
                            name={def.name}
                            img={def.img}
                            atk={def.atk}
                            hp={def.hp}
                            tier={def.tier}
                            abilities={unitAbilities(def)}
                            size="lg"
                          />

                          <span className="mt-2.5 block truncate text-xs font-bold text-amber-100">
                            {def.name}
                          </span>

                          <span className="block text-[11px] leading-4 text-zinc-400">
                            {ABILITY_LABEL[def.ability]}
                          </span>
                        </button>
                      );
                    }
                  )}
                </div>
              </Sheet>
            )
          : null
      }

      {/* ---- scout ---- */}
      {
        scoutOpen && !combat
          ? (
              <Sheet
                title={`Wave ${view.turn}: ${nextWave.routeName}`}
                subtitle={`Lose and you take ${nextWave.tier} damage + 1 per enemy left standing (Boss counts 2).`}
                onClose={() => setScoutOpen(false)}
              >
                <ul className="grid gap-1.5">
                  {nextWave.units.map(
                    (unit, i) => (
                      <li
                        key={`${unit.name}-${i}`}
                        className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[.03] p-2"
                      >
                        <div className="w-11 shrink-0 pb-1">
                          <UnitTile
                            name={unit.name}
                            img={unit.img}
                            atk={unit.atk}
                            hp={unit.hp}
                            boss={unit.boss}
                            size="sm"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-zinc-100">
                            {unit.boss ? "BOSS · " : ""}
                            {unit.name}
                          </p>

                          <p className="text-xs leading-4 text-zinc-400">
                            {
                              unit.keywords.length > 0
                                ? unit.keywords
                                    .map(
                                      (keyword) => abilityText(keyword, unit.power)
                                    )
                                    .join(" ")
                                : "No ability."
                            }
                          </p>
                        </div>
                      </li>
                    )
                  )}
                </ul>
              </Sheet>
            )
          : null
      }

      {/* ---- leave ---- */}
      {
        confirmLeave
          ? (
              <Sheet
                title="Leave the arena?"
                subtitle="Your run is saved on this device and you can resume it, but the clock keeps running: a run that takes far longer than its turn timers won't count."
                onClose={() => setConfirmLeave(false)}
              >
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmLeave(false)}
                    className="min-h-12 rounded-xl border border-white/15 bg-white/5 text-sm font-bold text-zinc-200"
                  >
                    Keep playing
                  </button>

                  <button
                    type="button"
                    onClick={onLeave}
                    className="min-h-12 rounded-xl border border-red-300/40 bg-red-500/15 text-sm font-bold text-red-100"
                  >
                    Leave
                  </button>
                </div>
              </Sheet>
            )
          : null
      }
    </div>
  );
}

// ---------------------------------------------------------
// Detail panel: what the selected thing is and what you can do.
// ---------------------------------------------------------

function DetailPanel({
  view,
  selected,
  selectedUnit,
  selectedOnBoard,
  selectedShopId,
  onBuy,
  onSell,
  onPlay,
  onMove,
  onClose,
}: {
  view: RunState;
  selected: Selection;
  selectedUnit: Unit | null;
  selectedOnBoard: boolean;
  selectedShopId: string | null;
  onBuy: (slot: number) => void;
  onSell: (uid: number) => void;
  onPlay: (uid: number) => void;
  onMove: (uid: number, position: number) => void;
  onClose: () => void;
}) {
  if (selected?.kind === "syn") {
    const [first, second] =
      SYNERGY_TEXT[selected.key];

    return (
      <div className="relative rounded-2xl border border-amber-300/20 bg-black/30 p-3 pr-12">
        <CloseButton
          onClick={onClose}
        />

        <p className="text-sm font-bold text-amber-100">
          {selected.key} synergy
        </p>

        <p className="mt-1 text-xs leading-5 text-zinc-300">
          <span className="font-bold text-amber-200">3:</span> {first}
          <br />
          <span className="font-bold text-amber-200">5:</span> {second}
        </p>
      </div>
    );
  }

  const def =
    selectedUnit
      ? UNIT_BY_ID.get(selectedUnit.id)
      : selectedShopId
        ? UNIT_BY_ID.get(selectedShopId)
        : null;

  if (!def) {
    return (
      <p className="rounded-2xl border border-white/5 bg-black/20 px-3 py-2.5 text-xs leading-5 text-zinc-400">
        <Sparkles
          size={12}
          className="mb-0.5 mr-1 inline text-amber-300"
          aria-hidden
        />
        Tap a card to inspect it. Drag from the shop to the board to buy, drag a unit
        onto the shop to sell. 3 copies merge into a golden unit.
      </p>
    );
  }

  const golden =
    selectedUnit?.golden ?? false;

  const power =
    def.power * (golden ? 2 : 1);

  const boardIndex =
    selectedUnit
      ? view.board.findIndex(
          (unit) => unit.uid === selectedUnit.uid
        )
      : -1;

  return (
    <div className="relative rounded-2xl border border-amber-300/20 bg-black/30 p-3 pr-12">
      <CloseButton
        onClick={onClose}
      />

      <p className="truncate text-sm font-bold text-amber-100">
        {golden ? "Golden " : ""}
        {def.name}
      </p>

      <p className="text-[11px] text-zinc-400">
        Tier {def.tier} · {def.attribute}
        {def.tribe ? ` · ${def.tribe}` : ""} ·{" "}
        <span className="font-bold text-amber-200">
          {selectedUnit?.atk ?? def.atk}
        </span>
        /
        <span className="font-bold text-rose-300">
          {selectedUnit?.hp ?? def.hp}
        </span>
      </p>

      <p className="mt-1 text-xs leading-5 text-zinc-200">
        {abilityText(
          def.ability,
          power,
          {
            rallyBy: def.rallyBy,
            tribe: def.tribe,
            attribute: def.attribute,
          }
        )}
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {
          selected?.kind === "shop"
            ? (
                <button
                  type="button"
                  onClick={() => onBuy(selected.slot)}
                  disabled={view.gold < UNIT_COST}
                  className="primary-button flex min-h-11 items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50"
                >
                  <Coins
                    size={14}
                    aria-hidden
                  />
                  Buy for {UNIT_COST}
                </button>
              )
            : null
        }

        {
          selectedUnit
            ? (
                <>
                  {
                    selectedOnBoard
                      ? (
                          <>
                            <button
                              type="button"
                              onClick={() => onMove(selectedUnit.uid, boardIndex - 1)}
                              disabled={boardIndex <= 0}
                              aria-label="Move left"
                              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-zinc-200 disabled:opacity-40"
                            >
                              <ChevronLeft
                                size={18}
                                aria-hidden
                              />
                            </button>

                            <button
                              type="button"
                              onClick={() => onMove(selectedUnit.uid, boardIndex + 1)}
                              disabled={boardIndex >= view.board.length - 1}
                              aria-label="Move right"
                              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-zinc-200 disabled:opacity-40"
                            >
                              <ChevronRight
                                size={18}
                                aria-hidden
                              />
                            </button>
                          </>
                        )
                      : (
                          <button
                            type="button"
                            onClick={() => onPlay(selectedUnit.uid)}
                            disabled={view.board.length >= BOARD_MAX}
                            className="primary-button min-h-11 px-4 py-2 text-sm disabled:opacity-50"
                          >
                            Play to board
                          </button>
                        )
                  }

                  <button
                    type="button"
                    onClick={() => onSell(selectedUnit.uid)}
                    className="flex min-h-11 items-center gap-1.5 rounded-xl border border-red-300/30 bg-red-500/10 px-3 text-sm font-bold text-red-100"
                  >
                    <Trash2
                      size={14}
                      aria-hidden
                    />
                    Sell +{SELL_VALUE}
                  </button>
                </>
              )
            : null
        }
      </div>
    </div>
  );
}

function CloseButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400"
    >
      <X
        size={16}
        aria-hidden
      />
    </button>
  );
}

function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[72] flex items-end justify-center overscroll-none bg-black/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="panel relative max-h-[85dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-b-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(event) => event.stopPropagation()}
      >
        {
          onClose
            ? (
                <CloseButton
                  onClick={onClose}
                />
              )
            : null
        }

        <p className="pr-10 font-display text-lg font-bold text-amber-100">
          {title}
        </p>

        {
          subtitle
            ? (
                <p className="mt-1 pr-6 text-xs leading-5 text-zinc-400">
                  {subtitle}
                </p>
              )
            : null
        }

        <div className="mt-3">
          {children}
        </div>
      </div>
    </div>
  );
}
