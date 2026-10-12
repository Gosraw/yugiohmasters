"use client";

import {
  ChevronsUp,
  Coins,
  Heart,
  Layers,
  Lock,
  LogOut,
  RefreshCw,
  Shield,
  Snowflake,
  Sparkles,
  Sword,
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

import {
  applyAction,
  boardSynergies,
  damageCap,
  foeFor,
  foeName,
  ghostIds,
  isGhostFoe,
  isTrapId,
  laneCounts,
  restoreRun,
  runScore,
  turnSeconds,
  BENCH_MAX,
  BOARD_MAX,
  ENGINE_VERSION,
  LANE_MAX,
  MAX_TIER,
  MAX_WAVES,
  ROLL_COST,
  SELL_VALUE,
  START_HEALTH,
  SUMMON_UNLOCK_WAVE,
  TRAP_UNLOCK_WAVE,
  UNIT_COST,
  type CombatResult,
  type GhostBoard,
  type Run,
  type RunState,
  type TrapCard,
  type Unit,
} from "@/lib/games/autobattler/engine";

import {
  ABILITY_LABEL,
  SYNERGY_TEXT,
  TRAP_BY_ID,
  UNIT_BY_ID,
  abilityText,
  trapText,
  type SynergyKey,
  type UnitDef,
} from "@/lib/games/autobattler/units";

import {
  ArenaCombat,
} from "./arena-combat";

import {
  CardFrame,
} from "./card-frame";

import {
  LANE_NAMES,
  LaneBoard,
  ScoutField,
} from "./lane-board";

import {
  SummonFlash,
  SummonPanel,
  summonCount,
  type SummonMoment,
} from "./summon";

import styles from "./arena.module.css";

// =========================================================
// SHADOW ARENA - the run itself (shop phase + combat playback).
//
// Holds the engine Run in a ref and renders a cloned snapshot.
// Every player action goes through applyAction() - exactly what
// the server replays later - and the log is saved to
// localStorage after each action, so a killed tab can resume.
//
// Controls (phone first, all targets >= 44px, no drag needed):
//   - tap a shop card -> the lanes light up -> tap a lane to buy
//     it straight into that lane (or "Buy" in the detail bar)
//   - tap a bench card / your trap -> tap a lane to place it
//   - tap a placed monster: flip ATTACK <-> DEFENSE
//   - hold a placed monster: its card, lane buttons, sell
// =========================================================

// v3: lanes. An older save is simply never read again (that run
// can't be submitted anymore anyway).
export const ARENA_SAVE_KEY = "dc.shadowArena.run.v3";

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
    g: (string | null)[];
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
      kind: "trap";
      uid: number;
    }
  | {
      kind: "syn";
      key: SynergyKey;
    }
  | null;

type Toast = {
  text: string;
  tone: "error" | "info";
};

type Props = {
  runId: string;
  seed: string;
  mode: "daily" | "practice";
  initialActions: string[];
  /** Friends' boards frozen into this run by the server. */
  ghosts: (GhostBoard | null)[];
  /** Date.now() at the moment the hub opened this screen. */
  openedAt: number;
  onFinished: (finish: ArenaFinish) => void;
  onLeave: () => void;
};

const UNLOCKS: Record<number, string> = {
  [TRAP_UNLOCK_WAVE]: "Traps unlocked: buy one and set it face-down on a lane.",
  [SUMMON_UNLOCK_WAVE]: "Fusion & Xyz unlocked: watch for the glowing button.",
};

function clone(
  state: RunState
): RunState {
  return structuredClone(state);
}

export function ArenaPlay({
  runId,
  seed,
  mode,
  initialActions,
  ghosts,
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
      healthBefore: number;
    } | null>(null);

  const [deadline, setDeadline] =
    useState<number | null>(null);

  const [now, setNow] =
    useState(openedAt);

  const [toast, setToast] =
    useState<Toast | null>(null);

  const [scoutOpen, setScoutOpen] =
    useState(false);

  const [summonOpen, setSummonOpen] =
    useState(false);

  const [summonMoment, setSummonMoment] =
    useState<SummonMoment | null>(null);

  const [confirmLeave, setConfirmLeave] =
    useState(false);

  const endingRef =
    useRef(false);

  const toastTimer =
    useRef<number | null>(null);

  // ---- boot (new run or resume) ----
  useEffect(() => {
    const run =
      restoreRun(
        seed,
        initialActions,
        ghosts
      ) ?? restoreRun(seed, [], ghosts);

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
  }, [seed, initialActions, ghosts]);

  const flash = useCallback(
    (text: string, tone: Toast["tone"] = "error") => {
      setToast({
        text,
        tone,
      });

      if (toastTimer.current) {
        window.clearTimeout(toastTimer.current);
      }

      toastTimer.current =
        window.setTimeout(
          () => setToast(null),
          tone === "info" ? 3200 : 1800
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
        setDeadline(null);
        setSelected(null);
        setScoutOpen(false);
        setSummonOpen(false);
        setCombat({
          result: outcome.combat,
          healthBefore,
        });
      }

      // Fusion / Xyz: the newest unit is the summoned monster.
      if (/^[cx]/.test(action)) {
        const made =
          [...run.state.board, ...run.state.bench].find(
            (unit) => unit.uid === run.state.nextUid - 1
          );

        setSummonOpen(false);
        setSelected(null);

        if (made) {
          setSummonMoment({
            kind: action.startsWith("x") ? "xyz" : "fusion",
            id: made.id,
            atk: made.atk,
            hp: made.hp,
          });
        }
      }

      setView(clone(run.state));

      return true;
    },
    [flash, mode, runId, seed]
  );

  const summonDone = useCallback(
    () => setSummonMoment(null),
    []
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
            v: ENGINE_VERSION,
            a: [...run.state.log],
            g: ghostIds(run.state.ghosts),
          },
          state: clone(run.state),
        });

        return;
      }

      const unlock =
        UNLOCKS[run.state.turn];

      if (unlock) {
        flash(unlock, "info");
      }

      const t =
        Date.now();

      setNow(t);
      setDeadline(t + turnSeconds(run.state.turn) * 1000);
    },
    [flash, onFinished]
  );

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

  const nextFoe =
    foeFor(
      view,
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

  const selectedTrap =
    selected?.kind === "trap"
      ? view.traps.find(
          (trap) => trap.uid === selected.uid
        ) ?? null
      : null;

  const selectedShopId =
    selected?.kind === "shop"
      ? view.shop[selected.slot] ?? null
      : null;

  const placing =
    selectedShopId !== null ||
    selectedUnit !== null ||
    selectedTrap !== null;

  const summons =
    view.turn >= SUMMON_UNLOCK_WAVE
      ? summonCount(view)
      : 0;

  const lowTime =
    deadline !== null &&
    secondsLeft <= 10;

  /** The tapped lane receives whatever is selected. */
  const tapLane = (
    lane: number
  ) => {
    const run =
      runRef.current;

    if (!run) {
      return;
    }

    if (selected?.kind === "shop") {
      const id =
        view.shop[selected.slot];

      if (!id) {
        return;
      }

      const trap =
        isTrapId(id);

      const before =
        trap ? run.state.traps.length : run.state.board.length;

      const bought =
        act(`b${selected.slot}`);

      setSelected(null);

      if (!bought) {
        return;
      }

      if (trap) {
        const card =
          run.state.traps[run.state.traps.length - 1];

        if (
          run.state.traps.length > before &&
          card.lane !== lane
        ) {
          act(`m${card.uid}.${lane}`);
        }

        return;
      }

      // Bought straight onto the board: move it to that lane.
      if (run.state.board.length > before) {
        const unit =
          run.state.board[run.state.board.length - 1];

        if (
          unit.lane !== lane &&
          laneCounts(run.state.board)[lane] < LANE_MAX
        ) {
          act(`m${unit.uid}.${lane}`);
        }
      }

      return;
    }

    if (selectedTrap) {
      act(`m${selectedTrap.uid}.${lane}`);
      setSelected(null);

      return;
    }

    if (selectedUnit) {
      const onBoard =
        view.board.some(
          (unit) => unit.uid === selectedUnit.uid
        );

      act(onBoard ? `m${selectedUnit.uid}.${lane}` : `p${selectedUnit.uid}.${lane}`);
      setSelected(null);
    }
  };

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
              <div className="mx-auto flex h-full w-full max-w-md flex-col pt-[env(safe-area-inset-top)]">
                <ArenaCombat
                  combat={combat.result}
                  routeName={combat.result.foe}
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
                      /{START_HEALTH} LP
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

                {/* ---- shop ---- */}
                <section
                  aria-label="Shop"
                  className="rounded-2xl border border-[rgb(242_196_90/.18)] bg-[linear-gradient(180deg,rgba(18,26,56,.8),rgba(10,14,34,.85))] p-2"
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
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
                      gridTemplateColumns: `repeat(${Math.max(4, view.shop.length)}, minmax(0, 1fr))`,
                    }}
                  >
                    {view.shop.map(
                      (id, slot) => {
                        if (!id) {
                          return (
                            <div
                              key={`shop-${slot}`}
                              className="aspect-[59/86] rounded-[5px] border border-dashed border-white/10"
                            />
                          );
                        }

                        const unit =
                          UNIT_BY_ID.get(id);

                        const trap =
                          TRAP_BY_ID.get(id);

                        return (
                          <button
                            key={`shop-${slot}-${id}`}
                            type="button"
                            onClick={() =>
                              setSelected(
                                selected?.kind === "shop" && selected.slot === slot
                                  ? null
                                  : {
                                      kind: "shop",
                                      slot,
                                    }
                              )
                            }
                            aria-label={
                              unit
                                ? `${unit.name}, tier ${unit.tier}, ${unit.atk} ATK ${unit.hp} DEF, ${ABILITY_LABEL[unit.ability]}`
                                : `Trap: ${trap?.name}`
                            }
                            className={`relative transition active:scale-95 ${view.gold < UNIT_COST ? "opacity-60" : ""}`}
                          >
                            <CardFrame
                              id={id}
                              selected={selected?.kind === "shop" && selected.slot === slot}
                            />
                          </button>
                        );
                      }
                    )}
                  </div>
                </section>

                {/* ---- synergies + Fusion/Xyz ---- */}
                <div className="flex min-h-9 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
                  {
                    summons > 0
                      ? (
                          <button
                            type="button"
                            onClick={() => setSummonOpen(true)}
                            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-fuchsia-300/60 bg-[linear-gradient(90deg,rgba(168,85,247,.35),rgba(56,130,246,.35))] px-3 text-xs font-black text-fuchsia-50 ${styles.summonGlow}`}
                          >
                            <Layers
                              size={14}
                              aria-hidden
                            />
                            Fusion / Xyz
                            <span className="rounded bg-white/20 px-1 tabular-nums">
                              {summons}
                            </span>
                          </button>
                        )
                      : null
                  }

                  {
                    synergies.length === 0 && summons === 0
                      ? (
                          <p className="text-[11px] text-zinc-500">
                            3 monsters of one attribute or type = a synergy bonus.
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
                              className={`flex h-9 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11px] font-bold ${
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

                {/* ---- battlefield ---- */}
                <LaneBoard
                  view={view}
                  foe={nextFoe}
                  foeLabel={foeName(nextFoe)}
                  placing={placing}
                  selectedUid={selectedUnit?.uid ?? selectedTrap?.uid ?? null}
                  onTapUnit={(unit) => {
                    if (placing && selectedUnit?.uid !== unit.uid) {
                      tapLane(unit.lane);

                      return;
                    }

                    setSelected(null);
                    act(`t${unit.uid}`);
                  }}
                  onHoldUnit={(unit) =>
                    setSelected({
                      kind: "unit",
                      uid: unit.uid,
                    })
                  }
                  onTapTrap={(trap) =>
                    setSelected(
                      selectedTrap?.uid === trap.uid
                        ? null
                        : {
                            kind: "trap",
                            uid: trap.uid,
                          }
                    )
                  }
                  onTapLane={tapLane}
                  onScout={() => setScoutOpen(true)}
                />

                {/* ---- bench ---- */}
                {
                  view.bench.length > 0
                    ? (
                        <section aria-label="Bench">
                          <p className="mb-1 text-[11px] font-bold uppercase tracking-[.18em] text-zinc-400">
                            Bench {view.bench.length}/{BENCH_MAX} · tap, then tap a lane
                          </p>

                          <div className="grid grid-cols-6 gap-1.5">
                            {view.bench.map(
                              (unit) => {
                                const def =
                                  UNIT_BY_ID.get(unit.id) as UnitDef;

                                return (
                                  <button
                                    key={`b-${unit.uid}`}
                                    type="button"
                                    onClick={() =>
                                      setSelected(
                                        selectedUnit?.uid === unit.uid
                                          ? null
                                          : {
                                              kind: "unit",
                                              uid: unit.uid,
                                            }
                                      )
                                    }
                                    aria-label={`${def.name} on the bench, ${unit.atk} ATK ${unit.hp} DEF`}
                                    className="min-h-11 active:scale-95"
                                  >
                                    <CardFrame
                                      id={unit.id}
                                      atk={unit.atk}
                                      hp={unit.hp}
                                      golden={unit.golden}
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
                  selectedTrap={selectedTrap}
                  selectedShopId={selectedShopId}
                  act={act}
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

      {/* ---- toast ---- */}
      {
        toast
          ? (
              <div
                role="status"
                className="pointer-events-none fixed inset-x-0 top-20 z-[75] flex justify-center px-4"
              >
                <p
                  className={`rounded-full border px-4 py-2 text-center text-sm font-semibold shadow-lg ${
                    toast.tone === "info"
                      ? "border-amber-200/50 bg-[#1a1408]/95 text-amber-100"
                      : "border-red-300/40 bg-red-950/90 text-red-100"
                  }`}
                >
                  {toast.text}
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
                          className="rounded-xl border border-amber-300/30 bg-amber-300/5 p-2 text-left active:scale-95"
                        >
                          <CardFrame
                            id={id}
                            size="lg"
                          />

                          <span className="mt-1.5 block text-[11px] leading-4 text-zinc-400">
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
                title={`Wave ${view.turn}: ${foeName(nextFoe)}`}
                subtitle={
                  `${isGhostFoe(nextFoe) ? "A friend's board from their own run. " : ""}Their attackers march down; whatever reaches your castle costs LP (max ${damageCap(view.turn)} this wave).`
                }
                onClose={() => setScoutOpen(false)}
              >
                <ScoutField
                  foe={nextFoe}
                />
              </Sheet>
            )
          : null
      }

      {/* ---- Fusion / Xyz ---- */}
      {
        summonOpen && !combat && !view.discover
          ? (
              <Sheet
                title="Fusion & Xyz"
                subtitle="Polymerization fuses a classic pair (free). Overlay turns two monsters of the same Level into an Xyz of that Rank (1 gold, once per turn)."
                onClose={() => setSummonOpen(false)}
              >
                <SummonPanel
                  state={view}
                  onSummon={(action) => {
                    act(action);
                  }}
                />
              </Sheet>
            )
          : null
      }

      {
        summonMoment
          ? (
              <SummonFlash
                moment={summonMoment}
                onDone={summonDone}
              />
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
// Detail bar: what the selected thing is and what you can do.
// ---------------------------------------------------------

function LaneButtons({
  current,
  onPick,
}: {
  current: number | null;
  onPick: (lane: number) => void;
}) {
  return (
    <>
      {LANE_NAMES.map(
        (name, lane) => (
          <button
            key={name}
            type="button"
            onClick={() => onPick(lane)}
            aria-pressed={current === lane}
            className={`min-h-11 min-w-11 rounded-xl border px-2.5 text-xs font-bold ${
              current === lane
                ? "border-amber-200 bg-amber-300/20 text-amber-50"
                : "border-white/15 bg-white/5 text-zinc-200"
            }`}
          >
            {name}
          </button>
        )
      )}
    </>
  );
}

function DetailPanel({
  view,
  selected,
  selectedUnit,
  selectedTrap,
  selectedShopId,
  act,
  onClose,
}: {
  view: RunState;
  selected: Selection;
  selectedUnit: Unit | null;
  selectedTrap: TrapCard | null;
  selectedShopId: string | null;
  act: (action: string) => boolean;
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

  const trapId =
    selectedTrap?.id ??
    (selectedShopId && isTrapId(selectedShopId) ? selectedShopId : null);

  if (trapId) {
    const trap =
      TRAP_BY_ID.get(trapId);

    return (
      <div className="relative flex gap-3 rounded-2xl border border-pink-300/25 bg-black/30 p-3 pr-12">
        <CloseButton
          onClick={onClose}
        />

        <div className="w-14 shrink-0">
          <CardFrame
            id={trapId}
          />
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-pink-100">
            {trap?.name}
          </p>

          <p className="mt-0.5 text-xs leading-5 text-zinc-300">
            {trap ? trapText(trap) : ""} Triggers once per combat; it stays set.
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {
              selectedTrap
                ? (
                    <>
                      <LaneButtons
                        current={selectedTrap.lane}
                        onPick={(lane) => {
                          act(`m${selectedTrap.uid}.${lane}`);
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => {
                          if (act(`s${selectedTrap.uid}`)) {
                            onClose();
                          }
                        }}
                        className="flex min-h-11 items-center gap-1 rounded-xl border border-red-300/30 bg-red-500/10 px-3 text-xs font-bold text-red-100"
                      >
                        <Trash2
                          size={13}
                          aria-hidden
                        />
                        +{SELL_VALUE}
                      </button>
                    </>
                  )
                : (
                    <p className="text-[11px] text-amber-200/80">
                      Tap a lane to buy and set it there.
                    </p>
                  )
            }
          </div>
        </div>
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
        Tap a shop card, then a lane. Tap a monster on the field to switch
        ATTACK (marches) and DEFENSE (a wall with double DEF); hold it for more.
        Open lanes glow red.
      </p>
    );
  }

  const golden =
    selectedUnit?.golden ?? false;

  const onBoard =
    selectedUnit !== null &&
    view.board.some(
      (unit) => unit.uid === selectedUnit.uid
    );

  return (
    <div className="relative flex gap-3 rounded-2xl border border-amber-300/20 bg-black/30 p-3 pr-12">
      <CloseButton
        onClick={onClose}
      />

      <div className="w-14 shrink-0">
        <CardFrame
          id={def.id}
          atk={selectedUnit?.atk}
          hp={selectedUnit?.hp}
          golden={golden}
        />
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-amber-100">
          {golden ? "Golden " : ""}
          {def.name}
        </p>

        <p className="text-[11px] text-zinc-400">
          {def.kind === "xyz" ? `Xyz Rank ${def.rank}` : def.kind === "fusion" ? "Fusion" : `Tier ${def.tier} · Level ${def.level}`} · {def.attribute}
          {def.tribe ? ` · ${def.tribe}` : ""}
        </p>

        <p className="mt-0.5 text-xs leading-5 text-zinc-200">
          {abilityText(
            def.ability,
            def.power * (golden ? 2 : 1),
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
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (act(`b${selected.slot}`)) {
                          onClose();
                        }
                      }}
                      disabled={view.gold < UNIT_COST}
                      className="primary-button flex min-h-11 items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50"
                    >
                      <Coins
                        size={14}
                        aria-hidden
                      />
                      Buy {UNIT_COST}
                    </button>

                    <p className="self-center text-[11px] text-amber-200/80">
                      or tap a lane
                    </p>
                  </>
                )
              : null
          }

          {
            selectedUnit && onBoard
              ? (
                  <>
                    <button
                      type="button"
                      onClick={() => act(`t${selectedUnit.uid}`)}
                      className="flex min-h-11 items-center gap-1 rounded-xl border border-sky-300/40 bg-sky-400/10 px-3 text-xs font-bold text-sky-100"
                    >
                      {
                        selectedUnit.def
                          ? (
                              <Shield
                                size={13}
                                aria-hidden
                              />
                            )
                          : (
                              <Sword
                                size={13}
                                aria-hidden
                              />
                            )
                      }
                      {selectedUnit.def ? "DEF" : "ATK"}
                    </button>

                    <LaneButtons
                      current={selectedUnit.lane}
                      onPick={(lane) => {
                        act(`m${selectedUnit.uid}.${lane}`);
                      }}
                    />
                  </>
                )
              : selectedUnit
                ? (
                    <LaneButtons
                      current={null}
                      onPick={(lane) => {
                        if (act(`p${selectedUnit.uid}.${lane}`)) {
                          onClose();
                        }
                      }}
                    />
                  )
                : null
          }

          {
            selectedUnit
              ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (act(`s${selectedUnit.uid}`)) {
                        onClose();
                      }
                    }}
                    className="flex min-h-11 items-center gap-1 rounded-xl border border-red-300/30 bg-red-500/10 px-3 text-xs font-bold text-red-100"
                  >
                    <Trash2
                      size={13}
                      aria-hidden
                    />
                    +{SELL_VALUE}
                  </button>
                )
              : null
          }
        </div>

        {
          selectedUnit && !onBoard && view.board.length >= BOARD_MAX
            ? (
                <p className="mt-1 text-[11px] text-zinc-500">
                  The field is full ({BOARD_MAX}): sell one first.
                </p>
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
