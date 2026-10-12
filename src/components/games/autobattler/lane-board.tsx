"use client";

import {
  ChevronsDown,
  ChevronsUp,
  Shield,
  Sword,
  TriangleAlert,
} from "lucide-react";

import {
  useRef,
  useState,
} from "react";

import {
  isGhostFoe,
  LANE_MAX,
  LANES,
  type Foe,
  type RunState,
  type TrapCard,
  type Unit,
} from "@/lib/games/autobattler/engine";

import {
  UNIT_BY_ID,
  abilityText,
  type UnitDef,
} from "@/lib/games/autobattler/units";

import {
  CardFrame,
} from "./card-frame";

import styles from "./arena.module.css";

// =========================================================
// SHADOW ARENA - the 3-lane battlefield in the shop phase.
// Enemy castle on top (with a preview of who stands in which
// lane and how many face-down traps they set), your lanes with
// 3 slots each (front = top), your trap zone per lane and your
// castle (= your Life Points) at the bottom.
// Tap-to-place: select a card (shop / bench / trap) -> the lanes
// light up -> tap a lane. Tap a placed monster to flip it between
// ATTACK and DEFENSE; long-press it for its card + more options.
// =========================================================

export const LANE_NAMES = [
  "Left",
  "Mid",
  "Right",
];

export type FoePreviewUnit = {
  img: string;
  name: string;
  text: string;
  atk: number;
  hp: number;
  def: boolean;
  boss: boolean;
  golden: boolean;
  lane: number;
};

export function foePreview(
  foe: Foe
): FoePreviewUnit[] {
  if (isGhostFoe(foe)) {
    return foe.units.map(
      (unit) => {
        const def =
          UNIT_BY_ID.get(unit.id) as UnitDef;

        return {
          img: def.art ?? def.img,
          name: def.name,
          text: abilityText(
            def.ability,
            def.power * (unit.golden ? 2 : 1),
            {
              rallyBy: def.rallyBy,
              tribe: def.tribe,
              attribute: def.attribute,
            }
          ),
          atk: unit.atk,
          hp: unit.hp,
          def: unit.def,
          boss: false,
          golden: unit.golden,
          lane: unit.lane,
        };
      }
    );
  }

  return foe.units.map(
    (unit) => ({
      img: unit.img,
      name: unit.name,
      text:
        unit.keywords.length > 0
          ? unit.keywords
              .map(
                (keyword) => abilityText(keyword, unit.power)
              )
              .join(" ")
          : "No ability.",
      atk: unit.atk,
      hp: unit.hp,
      def: unit.def,
      boss: unit.boss,
      golden: false,
      lane: unit.lane,
    })
  );
}

/** Your units in a lane, top (front) to bottom (castle). */
export function laneStack(
  board: Unit[],
  lane: number
) {
  const inLane =
    board.filter(
      (unit) => unit.lane === lane
    );

  return [
    ...inLane.filter((unit) => unit.def),
    ...inLane.filter((unit) => !unit.def),
  ].reverse();
}

/** A unit on the field: art, ATK / DEF, sideways in DEFENSE. */
export function FieldToken({
  img,
  atk,
  hp,
  def = false,
  golden = false,
  boss = false,
  enemy = false,
  selected = false,
  small = false,
}: {
  img: string;
  atk: number;
  hp: number;
  def?: boolean;
  golden?: boolean;
  boss?: boolean;
  enemy?: boolean;
  selected?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`relative aspect-square w-full overflow-hidden rounded-lg border-2 bg-[#0b1024] shadow-[0_4px_10px_rgba(0,0,0,.55)] ${
        selected
          ? "border-amber-200 ring-2 ring-amber-200/70"
          : golden
            ? "border-amber-300"
            : boss
              ? "border-red-400"
              : enemy
                ? "border-red-300/50"
                : "border-sky-200/40"
      } ${golden ? styles.golden : ""}`}
    >
      {
        img
          ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={img}
                alt=""
                draggable={false}
                className={`${styles.art} transition-transform duration-200 ${def ? "rotate-90 scale-[.82] rounded-sm" : ""}`}
              />
            )
          : (
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold uppercase text-zinc-400">
                Token
              </span>
            )
      }

      <span
        className={`absolute left-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded text-white ${def ? "bg-sky-500/90" : "bg-amber-600/90"}`}
      >
        {
          def
            ? (
                <Shield
                  size={10}
                  aria-hidden
                />
              )
            : (
                <Sword
                  size={10}
                  aria-hidden
                />
              )
        }
      </span>

      <span
        className={`absolute inset-x-0 bottom-0 flex justify-between bg-black/75 px-1 font-display font-black tabular-nums leading-none ${small ? "py-px text-[11px]" : "py-0.5 text-[15px]"}`}
      >
        <span className={def ? "text-amber-200/45" : "text-amber-200"}>
          {atk}
        </span>

        <span className={def ? "text-sky-100" : "text-sky-200/80"}>
          {hp}
        </span>
      </span>
    </div>
  );
}

/** Tap vs long-press (450ms) on a placed monster. */
function HoldButton({
  onTap,
  onHold,
  label,
  className,
  children,
}: {
  onTap: () => void;
  onHold: () => void;
  label: string;
  className: string;
  children: React.ReactNode;
}) {
  const timer =
    useRef<number | null>(null);

  const held =
    useRef(false);

  const clear = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return (
    <button
      type="button"
      aria-label={label}
      className={className}
      onPointerDown={() => {
        held.current = false;
        clear();
        timer.current =
          window.setTimeout(
            () => {
              held.current = true;
              onHold();
            },
            450
          );
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();

        if (!held.current) {
          onTap();
        }

        held.current = false;
      }}
    >
      {children}
    </button>
  );
}

type Props = {
  view: RunState;
  foe: Foe;
  foeLabel: string;
  /** A card is picked (shop / bench / board / trap): lanes light up. */
  placing: boolean;
  selectedUid: number | null;
  onTapUnit: (unit: Unit) => void;
  onHoldUnit: (unit: Unit) => void;
  onTapTrap: (trap: TrapCard) => void;
  onTapLane: (lane: number) => void;
  onScout: () => void;
};

export function LaneBoard({
  view,
  foe,
  foeLabel,
  placing,
  selectedUid,
  onTapUnit,
  onHoldUnit,
  onTapTrap,
  onTapLane,
  onScout,
}: Props) {
  const enemies =
    foePreview(foe);

  return (
    <section
      aria-label="Battlefield"
      className="relative overflow-hidden rounded-2xl border border-amber-300/20 bg-[#05070f]"
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center opacity-35"
        style={{
          backgroundImage: "url(/v2/temple-night.jpg)",
        }}
      />

      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(60,8,8,.55),rgba(3,5,15,.35)_30%,rgba(3,5,15,.35)_70%,rgba(8,20,48,.7))]"
      />

      {/* ---- enemy castle ---- */}
      <button
        type="button"
        onClick={onScout}
        className="relative flex min-h-11 w-full items-center justify-center gap-2 border-b border-red-400/30 bg-[linear-gradient(180deg,rgba(120,20,20,.55),rgba(60,10,10,.2))] px-3 text-left"
      >
        <span className={styles.castle} aria-hidden />

        <span className="min-w-0">
          <span className="block text-[10px] font-bold uppercase tracking-[.18em] text-red-200/80">
            Wave {view.turn} · tap to scout
          </span>

          <span className="block truncate font-display text-[13px] font-bold text-red-50">
            {foeLabel}
          </span>
        </span>
      </button>

      {/* ---- lanes ---- */}
      <div className="relative grid grid-cols-3 gap-1.5 p-1.5">
        {Array.from(
          {
            length: LANES,
          },
          (_, lane) => {
            const theirs =
              enemies.filter(
                (unit) => unit.lane === lane
              );

            const theirAttackers =
              theirs.filter(
                (unit) => !unit.def
              ).length;

            const theirTraps =
              foe.traps.filter(
                (trap) => trap.lane === lane
              ).length;

            const stack =
              laneStack(view.board, lane);

            const trap =
              view.traps.find(
                (t) => t.lane === lane
              ) ?? null;

            const open =
              theirAttackers > 0 &&
              stack.length === 0;

            const full =
              stack.length >= LANE_MAX;

            return (
              <div
                key={lane}
                data-drop={`lane:${lane}`}
                role="button"
                tabIndex={0}
                aria-label={`${LANE_NAMES[lane]} lane: ${stack.length} of ${LANE_MAX} monsters${trap ? ", 1 trap" : ""}. ${theirAttackers} enemy attackers.`}
                onClick={() => onTapLane(lane)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onTapLane(lane);
                  }
                }}
                className={`flex flex-col gap-1 rounded-xl border p-1 transition ${
                  placing
                    ? full
                      ? "border-white/10 bg-black/30"
                      : "border-amber-300/70 bg-amber-300/15 shadow-[0_0_14px_rgba(242,196,90,.35)]"
                    : open
                      ? "border-red-400/70 bg-red-950/30 shadow-[0_0_16px_rgba(248,113,113,.4)]"
                      : "border-white/10 bg-[linear-gradient(180deg,rgba(80,64,40,.28),rgba(40,32,22,.35))]"
                }`}
              >
                {/* enemy side of the lane */}
                <div className="flex min-h-7 items-center justify-center gap-0.5">
                  {theirs.slice(0, 3).map(
                    (unit, i) => (
                      <span
                        key={`${unit.name}-${i}`}
                        className={`relative h-6 w-6 shrink-0 overflow-hidden rounded-full border bg-[#0b1024] ${unit.boss ? "border-red-400" : unit.golden ? "border-amber-300" : "border-red-200/40"}`}
                        title={`${unit.name} ${unit.atk}/${unit.hp}${unit.def ? " (DEF)" : ""}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={unit.img}
                          alt=""
                          className={`${styles.art} ${unit.def ? "rotate-90" : ""}`}
                          draggable={false}
                        />
                      </span>
                    )
                  )}

                  {
                    theirTraps > 0
                      ? (
                          <span
                            className="ml-0.5 h-6 w-4 shrink-0 rounded-[3px] border border-[#e58ab9]/60 bg-[radial-gradient(circle,#b2477f,#3d0f29)]"
                            title="A face-down trap"
                            aria-label="Enemy trap set"
                          />
                        )
                      : null
                  }
                </div>

                <div
                  className={`flex h-4 items-center justify-center gap-0.5 text-[9px] font-black uppercase tracking-wider ${
                    open
                      ? "text-red-300"
                      : theirAttackers > 0
                        ? "text-amber-200/80"
                        : "text-zinc-600"
                  }`}
                >
                  {
                    open
                      ? (
                          <>
                            <TriangleAlert
                              size={11}
                              aria-hidden
                            />
                            Open
                          </>
                        )
                      : theirAttackers > 0
                        ? (
                            <>
                              <ChevronsDown
                                size={12}
                                aria-hidden
                              />
                              {theirAttackers}
                            </>
                          )
                        : null
                  }
                </div>

                {/* your slots: front on top */}
                <div className={`${styles.lanePath} flex flex-col gap-1 rounded-lg p-1`}>
                  {Array.from(
                    {
                      length: LANE_MAX - stack.length,
                    },
                    (_, i) => (
                      <div
                        key={`empty-${i}`}
                        className="mx-auto aspect-square w-[62%] rounded-lg border border-dashed border-amber-100/15"
                      />
                    )
                  )}

                  {stack.map(
                    (unit) => {
                      const def =
                        UNIT_BY_ID.get(unit.id) as UnitDef;

                      return (
                        <HoldButton
                          key={unit.uid}
                          onTap={() => onTapUnit(unit)}
                          onHold={() => onHoldUnit(unit)}
                          label={`${unit.golden ? "Golden " : ""}${def.name}, ${unit.atk} ATK ${unit.hp} DEF, ${unit.def ? "DEFENSE" : "ATTACK"} position. Tap to switch, hold for details.`}
                          className="mx-auto min-h-11 w-[62%] select-none active:scale-95 [-webkit-touch-callout:none]"
                        >
                          <FieldToken
                            img={def.art ?? def.img}
                            atk={unit.atk}
                            hp={unit.hp}
                            def={unit.def}
                            golden={unit.golden}
                            selected={selectedUid === unit.uid}
                          />
                        </HoldButton>
                      );
                    }
                  )}
                </div>

                <div className="flex h-4 items-center justify-center text-[9px] font-black uppercase tracking-wider text-sky-200/70">
                  {
                    stack.some((unit) => !unit.def)
                      ? (
                          <ChevronsUp
                            size={12}
                            aria-label="Your attackers march up this lane"
                          />
                        )
                      : stack.length > 0
                        ? "Wall"
                        : null
                  }
                </div>

                {/* your trap zone */}
                {
                  trap
                    ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onTapTrap(trap);
                          }}
                          aria-label="Your face-down trap in this lane"
                          className="mx-auto min-h-11 w-9 active:scale-95"
                        >
                          <CardFrame
                            id={trap.id}
                            size="sm"
                            selected={selectedUid === trap.uid}
                          />
                        </button>
                      )
                    : (
                        <div
                          className="mx-auto flex aspect-[59/86] w-9 items-center justify-center rounded-[5px] border border-dashed border-pink-200/20 text-[8px] font-bold uppercase text-pink-200/40"
                          aria-hidden
                        >
                          Trap
                        </div>
                      )
                }
              </div>
            );
          }
        )}
      </div>

      {/* ---- your castle ---- */}
      <div className="relative flex min-h-10 items-center justify-center gap-2 border-t border-sky-300/30 bg-[linear-gradient(0deg,rgba(20,50,120,.55),rgba(10,20,50,.2))] px-3">
        <span className={styles.castle} aria-hidden />

        <span className="text-[11px] font-bold uppercase tracking-[.18em] text-sky-100/90">
          Your castle · {view.health} LP
        </span>
      </div>
    </section>
  );
}

/** Scout: the next opponent's 3 lanes (positions, face-down traps). */
export function ScoutField({
  foe,
}: {
  foe: Foe;
}) {
  const enemies =
    foePreview(foe);

  const [picked, setPicked] =
    useState<FoePreviewUnit | null>(null);

  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-red-400/25 bg-[linear-gradient(180deg,rgba(80,14,14,.5),rgba(10,12,28,.6))] p-1.5">
        {Array.from(
          {
            length: LANES,
          },
          (_, lane) => {
            const theirs =
              enemies.filter(
                (unit) => unit.lane === lane
              );

            // Front (nearest you) at the bottom, walls at the top.
            const ordered = [
              ...theirs.filter((unit) => unit.def),
              ...theirs.filter((unit) => !unit.def),
            ];

            const trapSet =
              foe.traps.some(
                (trap) => trap.lane === lane
              );

            return (
              <div
                key={lane}
                className={`${styles.lanePath} flex min-h-40 flex-col gap-1 rounded-lg p-1`}
              >
                <p className="text-center text-[10px] font-bold uppercase tracking-wider text-red-100/70">
                  {LANE_NAMES[lane]}
                </p>

                <div className="mx-auto h-7 w-5">
                  {
                    trapSet
                      ? (
                          <CardFrame
                            id=""
                            faceDown
                          />
                        )
                      : null
                  }
                </div>

                {ordered.map(
                  (unit, i) => (
                    <button
                      key={`${unit.name}-${i}`}
                      type="button"
                      onClick={() => setPicked(unit)}
                      aria-label={`${unit.name}, ${unit.atk} ATK ${unit.hp} DEF${unit.def ? ", DEFENSE" : ""}`}
                      className="min-h-11 active:scale-95"
                    >
                      <FieldToken
                        img={unit.img}
                        atk={unit.atk}
                        hp={unit.hp}
                        def={unit.def}
                        boss={unit.boss}
                        golden={unit.golden}
                        enemy
                        selected={picked === unit}
                      />
                    </button>
                  )
                )}

                {
                  theirs.length === 0
                    ? (
                        <p className="m-auto text-center text-[10px] text-zinc-500">
                          Empty
                        </p>
                      )
                    : null
                }
              </div>
            );
          }
        )}
      </div>

      <p className="mt-2 min-h-10 rounded-xl border border-white/5 bg-white/[.03] px-3 py-2 text-xs leading-5 text-zinc-300">
        {
          picked
            ? (
                <>
                  <span className="font-bold text-zinc-100">
                    {picked.boss ? "BOSS · " : ""}
                    {picked.name}
                    {picked.def ? " (DEF wall)" : ""}:
                  </span>{" "}
                  {picked.text}
                </>
              )
            : "Tap a monster to read its ability. Face-down cards are traps: you will see which one when it springs."
        }
      </p>
    </div>
  );
}
