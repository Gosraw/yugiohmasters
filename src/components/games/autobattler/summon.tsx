"use client";

import {
  Layers,
  Sparkles,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";

import {
  fusionOptions,
  xyzOptions,
  OVERLAY_COST,
  type RunState,
  type Unit,
} from "@/lib/games/autobattler/engine";

import {
  ABILITY_LABEL,
  UNIT_BY_ID,
  type UnitDef,
} from "@/lib/games/autobattler/units";

import {
  play,
} from "@/lib/sound";

import {
  UnitTile,
} from "./unit-tile";

import styles from "./arena.module.css";

// =========================================================
// SHADOW ARENA - Fusion + Xyz: the "Summon" sheet content and the
// full-screen summon moment. Self-contained on purpose (the board
// UI around it is going to be rebuilt): it only needs the run
// state and an `act` callback that sends engine actions
// (c<recipe>.<uid>[.<uid>] / x<uid>.<uid>).
// =========================================================

export type SummonMoment = {
  kind: "fusion" | "xyz";
  id: string;
  atk: number;
  hp: number;
};

function defOf(
  id: string
) {
  return UNIT_BY_ID.get(id) as UnitDef;
}

/** Why an Overlay can't happen right now (null = it can). */
function overlayBlock(
  state: RunState
) {
  return state.overlayUsed
    ? "One Overlay per turn: used."
    : state.gold < OVERLAY_COST
      ? `Overlay needs ${OVERLAY_COST} gold.`
      : null;
}

/** How many Fusion / Xyz summons are possible right now. */
export function summonCount(
  state: RunState
) {
  return (
    fusionOptions(state).length +
    (overlayBlock(state) ? 0 : xyzOptions(state).length)
  );
}

export function SummonPanel({
  state,
  onSummon,
}: {
  state: RunState;
  onSummon: (action: string) => void;
}) {
  const fusions =
    fusionOptions(state);

  const blocked =
    overlayBlock(state);

  const xyz =
    xyzOptions(state);

  // Picked Xyz materials per Rank (default: the two weakest).
  const [picked, setPicked] =
    useState<Record<number, number[]>>({});

  const pickFor = (
    rank: number,
    units: Unit[]
  ) => {
    const chosen =
      (picked[rank] ?? []).filter(
        (uid) => units.some((unit) => unit.uid === uid)
      );

    if (chosen.length === 2) {
      return chosen;
    }

    const rest =
      [...units]
        .filter(
          (unit) => !chosen.includes(unit.uid)
        )
        .sort(
          (a, b) => Number(a.golden) - Number(b.golden) || a.atk + a.hp - (b.atk + b.hp)
        );

    return [
      ...chosen,
      ...rest.map((unit) => unit.uid),
    ].slice(0, 2);
  };

  const toggle = (
    rank: number,
    units: Unit[],
    uid: number
  ) => {
    const current =
      pickFor(rank, units);

    const next =
      current.includes(uid)
        ? current.filter((id) => id !== uid)
        : [...current.slice(-1), uid];

    setPicked({
      ...picked,
      [rank]: next,
    });
  };

  return (
    <div className="grid grid-cols-1 gap-3">
      {fusions.map(
        (option) => {
          const result =
            defOf(option.result);

          const materials =
            option.uids.map(
              (uid) => [...state.board, ...state.bench].find((unit) => unit.uid === uid)
            );

          return (
            <div
              key={`f-${option.recipe}`}
              className="flex min-w-0 items-center gap-3 rounded-xl border border-fuchsia-300/25 bg-fuchsia-500/5 p-2"
            >
              <div className="w-14 shrink-0 pb-1">
                <UnitTile
                  name={result.name}
                  img={result.img}
                  atk={result.atk}
                  hp={result.hp}
                  abilities={[result.ability]}
                  size="md"
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[.18em] text-fuchsia-200/80">
                  Polymerization
                </p>

                <p className="truncate text-sm font-bold text-amber-100">
                  {result.name}
                </p>

                <p className="text-[11px] leading-4 text-zinc-400">
                  {materials.map((unit) => (unit ? `${unit.golden ? "Golden " : ""}${defOf(unit.id).name}` : "?")).join(" + ")}
                  {" · "}
                  {ABILITY_LABEL[result.ability]}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onSummon(`c${option.recipe}.${option.uids.join(".")}`)}
                className="primary-button min-h-11 shrink-0 px-3 text-sm"
              >
                Fuse
              </button>
            </div>
          );
        }
      )}

      {xyz.map(
        (option) => {
          const result =
            defOf(option.result);

          const chosen =
            pickFor(option.rank, option.units);

          return (
            <div
              key={`x-${option.rank}`}
              className="min-w-0 rounded-xl border border-sky-300/25 bg-sky-500/5 p-2"
            >
              <div className="flex items-center gap-3">
                <div className="w-14 shrink-0 pb-1">
                  <UnitTile
                    name={result.name}
                    img={result.img}
                    atk={result.atk}
                    hp={result.hp}
                    abilities={[result.ability]}
                    size="md"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[.18em] text-sky-200/80">
                    Overlay · Rank {option.rank}
                  </p>

                  <p className="truncate text-sm font-bold text-amber-100">
                    {result.name}
                  </p>

                  <p className="text-[11px] leading-4 text-zinc-400">
                    {blocked ?? `Pick two Level ${option.rank} monsters`} · {ABILITY_LABEL[result.ability]}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={chosen.length !== 2 || blocked !== null}
                  onClick={() => onSummon(`x${chosen[0]}.${chosen[1]}`)}
                  className="primary-button min-h-11 shrink-0 px-3 text-sm disabled:opacity-50"
                >
                  Overlay {OVERLAY_COST}
                </button>
              </div>

              <div className="mt-2 grid grid-cols-6 gap-1.5">
                {option.units.map(
                  (unit) => {
                    const def =
                      defOf(unit.id);

                    const on =
                      chosen.includes(unit.uid);

                    return (
                      <button
                        key={unit.uid}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${def.name}, ${unit.atk} attack ${unit.hp} health`}
                        onClick={() => toggle(option.rank, option.units, unit.uid)}
                        className="min-h-11 pb-1 active:scale-95"
                      >
                        <UnitTile
                          name={def.name}
                          img={def.img}
                          atk={unit.atk}
                          hp={unit.hp}
                          golden={unit.golden}
                          selected={on}
                          dim={!on}
                          size="sm"
                        />
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          );
        }
      )}

      <p className="text-[11px] leading-4 text-zinc-500">
        Fusion is free and Overlay costs {OVERLAY_COST} gold (once per turn): the
        materials are the real price. The new monster keeps half of the stats they had
        gained.
      </p>
    </div>
  );
}

/** Full-screen flash + the new card rising. Calls onDone after ~1.6s. */
export function SummonFlash({
  moment,
  onDone,
}: {
  moment: SummonMoment;
  onDone: () => void;
}) {
  const def =
    defOf(moment.id);

  useEffect(() => {
    play("rise");

    const boom =
      window.setTimeout(
        () => play("boom"),
        420
      );

    const done =
      window.setTimeout(
        onDone,
        1600
      );

    return () => {
      window.clearTimeout(boom);
      window.clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDone}
      className={`fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-black/80 px-6 ${styles.summonFade}`}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${moment.kind === "xyz" ? styles.summonFlashXyz : styles.summonFlash}`}
      />

      <p className={`relative flex items-center gap-2 font-display text-sm font-black uppercase tracking-[.3em] ${moment.kind === "xyz" ? "text-sky-200" : "text-fuchsia-200"}`}>
        {
          moment.kind === "xyz"
            ? (
                <Layers
                  size={16}
                  aria-hidden
                />
              )
            : (
                <Sparkles
                  size={16}
                  aria-hidden
                />
              )
        }
        {moment.kind === "xyz" ? "Xyz Summon!" : "Fusion Summon!"}
      </p>

      <div className={`relative w-40 ${styles.summonRise}`}>
        <UnitTile
          name={def.name}
          img={def.img}
          atk={moment.atk}
          hp={moment.hp}
          abilities={[def.ability]}
          size="lg"
        />
      </div>

      <p className="gold-text relative text-center font-display text-2xl font-black">
        {def.name}
      </p>
    </div>
  );
}
