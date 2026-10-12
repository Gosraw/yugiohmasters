"use client";

import {
  ChevronsDown,
  Shield,
  Sword,
  TriangleAlert,
} from "lucide-react";

import {
  useRef,
  useState,
} from "react";

import {
  boardSynergies,
  isGhostFoe,
  LANE_MAX,
  LANES,
  START_HEALTH,
  type Foe,
  type RunState,
  type TrapCard,
  type Unit,
} from "@/lib/games/autobattler/engine";

import {
  ATTRIBUTE_STYLE,
  TRAP_BY_ID,
  UNIT_BY_ID,
  abilityShort,
  abilityText,
  trapShort,
  type Ability,
  type Attribute,
  type UnitDef,
} from "@/lib/games/autobattler/units";

import {
  CardFrame,
} from "./card-frame";

import {
  ABILITY_ICON,
} from "./unit-tile";

import styles from "./arena.module.css";

// =========================================================
// SHADOW ARENA - the shop-phase battlefield, one clear screen:
//   OpponentStrip  compact enemy lanes on top (tap = scout)
//   MyField        your 3 lanes in the centre + your castle
//   ShopRow        a shop card explained in one line
// Tap-to-place: select a card -> the lanes light up -> tap a
// lane. Tap a placed monster to flip ATTACK / DEFENSE; hold it
// for its card + more options. A lane with enemy attackers and
// nobody of yours glows red.
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

/** Enemy attackers per lane (for "open lane" warnings). */
export function threatsByLane(
  foe: Foe
) {
  const counts = [
    0,
    0,
    0,
  ];

  for (const unit of foePreview(foe)) {
    if (!unit.def) {
      counts[unit.lane] += 1;
    }
  }

  return counts;
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

export function AttributeBadge({
  attribute,
  className = "",
}: {
  attribute: Attribute | null | undefined;
  className?: string;
}) {
  if (!attribute) {
    return null;
  }

  const style =
    ATTRIBUTE_STYLE[attribute];

  return (
    <span
      title={attribute}
      aria-label={attribute}
      className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[8px] font-black leading-none ring-1 ring-black/50 ${style.className} ${className}`}
    >
      {style.glyph}
    </span>
  );
}

export function AbilityBadge({
  ability,
  className = "",
}: {
  ability: Ability | null | undefined;
  className?: string;
}) {
  if (!ability) {
    return null;
  }

  const Icon =
    ABILITY_ICON[ability];

  return (
    <span
      className={`inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-amber-200 ring-1 ring-amber-200/40 ${className}`}
    >
      <Icon
        size={10}
        aria-hidden
      />
    </span>
  );
}

/** A unit on the field: art, sword/shield, two big numbers. */
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
  ability,
  attribute,
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
  ability?: Ability | null;
  attribute?: Attribute | null;
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

      {
        small
          ? null
          : (
              <span className="absolute right-0.5 top-0.5 flex flex-col gap-0.5">
                <AbilityBadge
                  ability={ability}
                />

                <AttributeBadge
                  attribute={attribute}
                />
              </span>
            )
      }

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

/** The opponent, compact: castle + 3 lanes of tiny tokens. */
export function OpponentStrip({
  foe,
  label,
  wave,
  onOpen,
}: {
  foe: Foe;
  label: string;
  wave: number;
  onOpen: () => void;
}) {
  const enemies =
    foePreview(foe);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Wave ${wave}: ${label}. Tap to scout.`}
      className="relative w-full overflow-hidden rounded-2xl border border-red-400/30 bg-[linear-gradient(180deg,rgba(110,18,18,.6),rgba(30,8,12,.75))] px-2 pb-1.5 pt-1 text-left active:scale-[.99]"
    >
      <span className="flex items-center gap-1.5">
        <span className={styles.castle} aria-hidden />

        <span className="min-w-0 flex-1 truncate text-[11px] font-black uppercase tracking-[.14em] text-red-100">
          Wave {wave} · {label}
        </span>

        <span className="text-[10px] font-bold text-red-200/70">
          Scout ›
        </span>
      </span>

      <span className="mt-1 grid grid-cols-3 gap-1.5">
        {Array.from(
          {
            length: LANES,
          },
          (_, lane) => {
            const theirs =
              enemies.filter(
                (unit) => unit.lane === lane
              );

            const trapSet =
              foe.traps.some(
                (trap) => trap.lane === lane
              );

            return (
              <span
                key={lane}
                className="flex min-h-9 items-center justify-center gap-0.5 rounded-lg bg-black/30 px-0.5"
              >
                {theirs.length === 0 && !trapSet
                  ? (
                      <span className="text-[10px] text-zinc-500">
                        empty
                      </span>
                    )
                  : null}

                {theirs.slice(0, 3).map(
                  (unit, i) => (
                    <span
                      key={`${unit.name}-${i}`}
                      className="flex w-[30px] flex-col items-center"
                    >
                      <span
                        className={`relative h-[22px] w-[22px] overflow-hidden rounded-md border bg-[#0b1024] ${unit.boss ? "border-red-400" : unit.golden ? "border-amber-300" : "border-red-200/40"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={unit.img}
                          alt=""
                          className={`${styles.art} ${unit.def ? "rotate-90" : ""}`}
                          draggable={false}
                        />
                      </span>

                      <span className={`text-[9px] font-black tabular-nums leading-3 ${unit.def ? "text-sky-200" : "text-amber-200"}`}>
                        {unit.def ? `D${unit.hp}` : `${unit.atk}`}
                      </span>
                    </span>
                  )
                )}

                {
                  trapSet
                    ? (
                        <span
                          className="ml-0.5 h-6 w-4 shrink-0 rounded-[3px] border border-[#e58ab9]/60 bg-[radial-gradient(circle,#b2477f,#3d0f29)]"
                          aria-label="A face-down trap"
                        />
                      )
                    : null
                }
              </span>
            );
          }
        )}
      </span>
    </button>
  );
}

type FieldProps = {
  view: RunState;
  threats: number[];
  /** A card is picked (shop / bench / board / trap): lanes light up. */
  placing: boolean;
  selectedUid: number | null;
  onTapUnit: (unit: Unit) => void;
  onHoldUnit: (unit: Unit) => void;
  onTapTrap: (trap: TrapCard) => void;
  onTapLane: (lane: number) => void;
  /** Take all free height (shop tray closed) or a fixed share. */
  grow?: boolean;
};

export function MyField({
  view,
  threats,
  placing,
  selectedUid,
  onTapUnit,
  onHoldUnit,
  onTapTrap,
  onTapLane,
  grow = false,
}: FieldProps) {
  const lp =
    Math.max(0, view.health);

  return (
    <section
      aria-label="Your field"
      className={`relative flex flex-col overflow-hidden rounded-2xl border border-amber-300/20 bg-[#05070f] ${grow ? "min-h-0 flex-1" : "h-[clamp(232px,35dvh,300px)] shrink-0"}`}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center opacity-35"
        style={{
          backgroundImage: "url(/v2/temple-night.jpg)",
        }}
      />

      <div className="relative grid min-h-0 flex-1 grid-cols-3 gap-1.5 p-1.5">
        {Array.from(
          {
            length: LANES,
          },
          (_, lane) => {
            const stack =
              laneStack(view.board, lane);

            const trap =
              view.traps.find(
                (t) => t.lane === lane
              ) ?? null;

            const open =
              threats[lane] > 0 &&
              stack.length === 0;

            const full =
              stack.length >= LANE_MAX;

            return (
              <div
                key={lane}
                data-drop={`lane:${lane}`}
                role="button"
                tabIndex={0}
                aria-label={`${LANE_NAMES[lane]} lane: ${stack.length} of ${LANE_MAX} monsters${trap ? ", 1 trap" : ""}. ${threats[lane]} enemy attackers.`}
                onClick={() => onTapLane(lane)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onTapLane(lane);
                  }
                }}
                className={`${styles.lanePath} flex min-h-0 flex-col items-center gap-1 rounded-xl border p-1 transition ${
                  placing
                    ? full
                      ? "border-white/10 opacity-60"
                      : `border-amber-300/80 ${styles.laneGlow}`
                    : open
                      ? `border-red-400/80 ${styles.laneDanger}`
                      : "border-amber-100/10"
                }`}
              >
                <span
                  className={`flex h-4 items-center gap-0.5 text-[9px] font-black uppercase tracking-wider ${open ? "text-red-300" : threats[lane] > 0 ? "text-amber-200/80" : "text-zinc-500"}`}
                >
                  {
                    open
                      ? (
                          <>
                            <TriangleAlert
                              size={11}
                              aria-hidden
                            />
                            Open · {threats[lane]}
                          </>
                        )
                      : threats[lane] > 0
                        ? (
                            <>
                              <ChevronsDown
                                size={12}
                                aria-hidden
                              />
                              {threats[lane]} coming
                            </>
                          )
                        : LANE_NAMES[lane]
                  }
                </span>

                <div className="flex w-full flex-1 flex-col items-center justify-end gap-1">
                  {Array.from(
                    {
                      length: LANE_MAX - stack.length,
                    },
                    (_, i) => (
                      <div
                        key={`empty-${i}`}
                        className="aspect-square w-[50px] rounded-lg border border-dashed border-amber-100/15"
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
                          label={`${unit.golden ? "Golden " : ""}${def.name}, ${unit.atk} ATK ${unit.hp} DEF, ${unit.def ? "DEFENSE" : "ATTACK"} position. ${abilityShort(def.ability, def.power)}. Tap to switch, hold for details.`}
                          className="w-[50px] select-none active:scale-95 [-webkit-touch-callout:none]"
                        >
                          <FieldToken
                            img={def.art ?? def.img}
                            atk={unit.atk}
                            hp={unit.hp}
                            def={unit.def}
                            golden={unit.golden}
                            selected={selectedUid === unit.uid}
                            ability={def.ability}
                            attribute={def.attribute}
                          />
                        </HoldButton>
                      );
                    }
                  )}
                </div>

                {
                  trap
                    ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onTapTrap(trap);
                          }}
                          aria-label={`Your face-down ${TRAP_BY_ID.get(trap.id)?.name} in this lane`}
                          className="min-h-11 w-8 active:scale-95"
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
                          className="flex h-11 w-8 items-center justify-center rounded-[5px] border border-dashed border-pink-200/20 text-[7px] font-bold uppercase text-pink-200/40"
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

      {/* your castle */}
      <div className="relative flex h-8 shrink-0 items-center gap-2 border-t border-sky-300/30 bg-[linear-gradient(0deg,rgba(20,50,120,.6),rgba(10,20,50,.2))] px-3">
        <span className={styles.castle} aria-hidden />

        <span className="text-[10px] font-black uppercase tracking-[.16em] text-sky-100">
          Your castle
        </span>

        <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-black/50">
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#38bdf8,#a5f3fc)]"
            style={{
              width: `${(lp * 100) / START_HEALTH}%`,
            }}
          />
        </span>

        <span className="font-display text-sm font-black tabular-nums text-sky-50">
          {lp} LP
        </span>
      </div>
    </section>
  );
}

/** Would buying `id` lift a synergy to 3 or 5? ("DARK 3") */
export function synergyHint(
  board: Unit[],
  id: string
) {
  const def =
    UNIT_BY_ID.get(id);

  if (
    !def ||
    board.some((unit) => unit.id === id)
  ) {
    return null;
  }

  const before =
    new Map(
      boardSynergies(board).map(
        (syn) => [syn.key, syn.count]
      )
    );

  for (const key of [def.tribe, def.attribute]) {
    if (!key) {
      continue;
    }

    const next =
      (before.get(key) ?? 0) + 1;

    if (next === 3 || next === 5) {
      return `${key} ${next}`;
    }
  }

  return null;
}

/** One shop card, explained: art, name, ability line, ATK/DEF. */
export function ShopRow({
  id,
  board,
  selected,
  affordable,
  onTap,
}: {
  id: string;
  board: Unit[];
  selected: boolean;
  affordable: boolean;
  onTap: () => void;
}) {
  const unit =
    UNIT_BY_ID.get(id);

  const trap =
    TRAP_BY_ID.get(id);

  const hint =
    unit ? synergyHint(board, id) : null;

  const Icon =
    unit ? ABILITY_ICON[unit.ability] : null;

  return (
    <button
      type="button"
      onClick={onTap}
      aria-pressed={selected}
      aria-label={
        unit
          ? `${unit.name}, tier ${unit.tier}, ${unit.atk} ATK ${unit.hp} DEF. ${abilityShort(unit.ability, unit.power, { rallyBy: unit.rallyBy, tribe: unit.tribe, attribute: unit.attribute })}`
          : `Trap: ${trap?.name}. ${trap ? trapShort(trap) : ""}`
      }
      className={`flex min-h-11 w-full items-center gap-2 rounded-xl border px-1.5 py-1 text-left transition active:scale-[.99] ${
        selected
          ? "border-amber-200 bg-amber-300/15"
          : trap
            ? "border-pink-300/30 bg-pink-950/30"
            : hint
              ? "border-amber-300/50 bg-amber-300/5"
              : "border-white/10 bg-white/[.03]"
      } ${affordable ? "" : "opacity-55"}`}
    >
      <span className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-md border ${trap ? "border-[#e58ab9]/70" : "border-[#e5a463]/60"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={unit?.art ?? unit?.img ?? trap?.art ?? trap?.img ?? ""}
          alt=""
          className={styles.art}
          draggable={false}
        />

        <span className="absolute left-0 top-0 rounded-br bg-black/75 px-0.5 text-[8px] font-black leading-3 text-amber-300">
          T{unit?.tier ?? trap?.tier}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="truncate text-[12px] font-bold leading-4 text-zinc-50">
            {unit?.name ?? trap?.name}
          </span>

          {
            unit
              ? (
                  <AttributeBadge
                    attribute={unit.attribute}
                  />
                )
              : null
          }
        </span>

        <span className="flex items-center gap-1 text-[10.5px] leading-4 text-zinc-300">
          {
            Icon
              ? (
                  <Icon
                    size={11}
                    className="shrink-0 text-amber-300"
                    aria-hidden
                  />
                )
              : (
                  <span className="shrink-0 rounded bg-pink-500/30 px-1 text-[8px] font-black uppercase text-pink-100">
                    Trap
                  </span>
                )
          }

          <span className="truncate">
            {
              unit
                ? abilityShort(
                    unit.ability,
                    unit.power,
                    {
                      rallyBy: unit.rallyBy,
                      tribe: unit.tribe,
                      attribute: unit.attribute,
                    }
                  )
                : trap
                  ? trapShort(trap)
                  : ""
            }
          </span>
        </span>

        {
          unit
            ? (
                <span className="flex items-center gap-1 text-[9.5px] leading-3 text-zinc-500">
                  {unit.tribe ?? unit.race} · Level {unit.level}
                  {
                    hint
                      ? (
                          <span className="rounded-full bg-amber-300/25 px-1.5 font-black text-amber-100">
                            → {hint}
                          </span>
                        )
                      : null
                  }
                </span>
              )
            : null
        }
      </span>

      {
        unit
          ? (
              <span className="flex shrink-0 flex-col items-end font-display font-black leading-4 tabular-nums">
                <span className="text-[15px] text-amber-200">
                  {unit.atk}
                </span>

                <span className="text-[13px] text-sky-200">
                  {unit.hp}
                </span>
              </span>
            )
          : null
      }
    </button>
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
