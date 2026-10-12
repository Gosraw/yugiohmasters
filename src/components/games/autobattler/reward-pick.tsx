"use client";

import {
  ArrowUp,
  Coins,
  Shield,
  Sparkles,
  Sword,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";

import type {
  RewardOption,
  Unit,
} from "@/lib/games/autobattler/engine";

import {
  TRAP_BY_ID,
  UNIT_BY_ID,
  abilityShort,
  trapShort,
  type UnitDef,
} from "@/lib/games/autobattler/units";

import {
  play,
} from "@/lib/sound";

import {
  CardFrame,
} from "./card-frame";

import {
  FieldToken,
} from "./lane-board";

import styles from "./arena.module.css";

// =========================================================
// SHADOW ARENA - "Wave won: pick 1 of 3". The 3 options are
// seeded by the engine (same for the replay). Cards fan in; an
// ATK / DEF boost then asks which monster gets it.
// =========================================================

function title(
  option: RewardOption
) {
  switch (option.kind) {
    case "card":
      return option.up ? "A stronger card" : "A free card";
    case "trap":
      return "A trap";
    case "gold":
      return `+${option.amount} gold`;
    case "atk":
      return `+${option.amount} ATK`;
    case "def":
      return `+${option.amount} DEF`;
  }
}

function line(
  option: RewardOption
) {
  if (option.kind === "card") {
    const def =
      UNIT_BY_ID.get(option.id) as UnitDef;

    return `${def.name} (${def.atk}/${def.hp}) · ${abilityShort(def.ability, def.power, { rallyBy: def.rallyBy, tribe: def.tribe, attribute: def.attribute })}`;
  }

  if (option.kind === "trap") {
    const trap =
      TRAP_BY_ID.get(option.id);

    return `${trap?.name} · ${trap ? trapShort(trap) : ""}`;
  }

  if (option.kind === "gold") {
    return "Spend it right now, this turn.";
  }

  return option.kind === "atk"
    ? "One monster on your field, for the rest of the run."
    : "One monster on your field, for the rest of the run.";
}

export function RewardPick({
  options,
  board,
  onPick,
  onSkip,
}: {
  options: RewardOption[];
  board: Unit[];
  onPick: (index: number, uid: number | null) => void;
  onSkip: () => void;
}) {
  const [boost, setBoost] =
    useState<number | null>(null);

  useEffect(() => {
    play("chime");
  }, []);

  const chosen =
    boost !== null ? options[boost] : null;

  return (
    <div
      className="fixed inset-0 z-[74] flex flex-col items-center justify-center gap-4 bg-black/80 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Wave won: pick a reward"
    >
      <div className="text-center">
        <p className="text-[11px] font-black uppercase tracking-[.3em] text-amber-300/90">
          Wave won
        </p>

        <p className="gold-text font-display text-2xl font-black">
          {chosen ? "Pick a monster" : "Pick 1 reward"}
        </p>
      </div>

      {
        chosen && (chosen.kind === "atk" || chosen.kind === "def")
          ? (
              <div className="w-full max-w-sm">
                <div className="grid grid-cols-4 gap-2">
                  {board.map(
                    (unit) => {
                      const def =
                        UNIT_BY_ID.get(unit.id) as UnitDef;

                      return (
                        <button
                          key={unit.uid}
                          type="button"
                          onClick={() => onPick(boost as number, unit.uid)}
                          aria-label={`Give ${title(chosen)} to ${def.name}`}
                          className="min-h-11 active:scale-95"
                        >
                          <FieldToken
                            img={def.art ?? def.img}
                            atk={unit.atk}
                            hp={unit.hp}
                            def={unit.def}
                            golden={unit.golden}
                            ability={def.ability}
                            attribute={def.attribute}
                          />
                        </button>
                      );
                    }
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setBoost(null)}
                  className="mt-3 min-h-11 w-full rounded-xl border border-white/15 bg-white/5 text-sm font-bold text-zinc-200"
                >
                  Back
                </button>
              </div>
            )
          : (
              <div className="flex w-full max-w-sm justify-center gap-2">
                {options.map(
                  (option, index) => (
                    <button
                      key={`${option.kind}-${index}`}
                      type="button"
                      onClick={() => {
                        if (option.kind === "atk" || option.kind === "def") {
                          setBoost(index);
                        } else {
                          onPick(index, null);
                        }
                      }}
                      className={`flex w-1/3 flex-col items-center gap-1.5 rounded-xl border border-amber-300/40 bg-[linear-gradient(180deg,rgba(40,30,10,.9),rgba(12,10,20,.95))] p-2 text-center shadow-[0_8px_24px_rgba(0,0,0,.6)] active:scale-95 ${styles.fanIn}`}
                      style={{
                        animationDelay: `${index * 110}ms`,
                        ["--fan" as string]: `${(index - 1) * 6}deg`,
                      }}
                    >
                      <div className="w-full">
                        {
                          option.kind === "card" || option.kind === "trap"
                            ? (
                                <CardFrame
                                  id={option.id}
                                  size="lg"
                                />
                              )
                            : (
                                <div className="flex aspect-[59/86] w-full items-center justify-center rounded-[5px] border border-amber-300/40 bg-[radial-gradient(circle,#3a2a0a,#0d0a05)] text-amber-200">
                                  {
                                    option.kind === "gold"
                                      ? (
                                          <Coins
                                            size={34}
                                            aria-hidden
                                          />
                                        )
                                      : option.kind === "atk"
                                        ? (
                                            <Sword
                                              size={34}
                                              aria-hidden
                                            />
                                          )
                                        : (
                                            <Shield
                                              size={34}
                                              className="text-sky-200"
                                              aria-hidden
                                            />
                                          )
                                  }
                                </div>
                              )
                        }
                      </div>

                      <span className="flex items-center gap-1 text-[12px] font-black text-amber-100">
                        {
                          option.kind === "card" && option.up
                            ? (
                                <ArrowUp
                                  size={12}
                                  aria-hidden
                                />
                              )
                            : (
                                <Sparkles
                                  size={12}
                                  aria-hidden
                                />
                              )
                        }
                        {title(option)}
                      </span>

                      <span className="line-clamp-3 text-[10px] leading-[13px] text-zinc-300">
                        {line(option)}
                      </span>
                    </button>
                  )
                )}
              </div>
            )
      }

      {
        chosen
          ? null
          : (
              <button
                type="button"
                onClick={onSkip}
                className="min-h-11 px-4 text-xs font-bold text-zinc-400 underline-offset-2 hover:underline"
              >
                Later (it is lost when you fight)
              </button>
            )
      }
    </div>
  );
}
