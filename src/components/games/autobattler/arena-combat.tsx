"use client";

import {
  FastForward,
  Shield,
  Skull,
  Swords,
  Trophy,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  LANE_LEN,
  LANES,
  type CombatFrame,
  type CombatResult,
  type CombatSnap,
} from "@/lib/games/autobattler/engine";

import {
  TRAP_BY_ID,
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
// SHADOW ARENA - combat playback on the 3-lane battlefield.
//
// The engine already resolved the fight; this only replays its
// frames (one per tick). Only four things move: monsters march
// (CSS transition on their tile), clashing monsters shake with a
// damage number, a trap flips up BIG ("MIRROR FORCE!"), and a hit
// castle shakes while its Life Points count down. 1x / 2x / Skip.
// Afterwards: a 3-line recap, one line per lane. With
// prefers-reduced-motion: no shaking or sliding.
// =========================================================

type Props = {
  combat: CombatResult;
  routeName: string;
  healthBefore: number;
  onDone: () => void;
};

type Floater = {
  key: number;
  lane: number;
  row: number;
  text: string;
  tone: "hit" | "castle" | "zero";
};

const TICK_MS = 300;

function wait(
  ms: number
) {
  return new Promise<void>(
    (resolve) => {
      window.setTimeout(resolve, ms);
    }
  );
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Row 0 = top (enemy castle side) .. LANE_LEN - 1 = bottom. */
function rowOf(
  unit: CombatSnap,
  mine: boolean
) {
  const absolute =
    mine
      ? unit.y
      : LANE_LEN + 1 - unit.y;

  return LANE_LEN - absolute;
}

export function ArenaCombat({
  combat,
  routeName,
  healthBefore,
  onDone,
}: Props) {
  const {
    frames,
  } = combat;

  const [index, setIndex] =
    useState(0);

  const [dying, setDying] =
    useState<{
      unit: CombatSnap;
      mine: boolean;
    }[]>([]);

  const [floaters, setFloaters] =
    useState<Floater[]>([]);

  const [flashed, setFlashed] =
    useState<Set<number>>(new Set());

  const [trapBanner, setTrapBanner] =
    useState<{
      id: string;
      mine: boolean;
    } | null>(null);

  const [shake, setShake] =
    useState<0 | 1 | null>(null);

  const [finished, setFinished] =
    useState(false);

  const [fast, setFast] =
    useState(false);

  const speed =
    useRef(1);

  const skipped =
    useRef(false);

  const floaterKey =
    useRef(0);

  const shown: CombatFrame =
    frames[Math.min(index, frames.length - 1)];

  const finish = useCallback(
    () => {
      skipped.current = true;
      setIndex(frames.length - 1);
      setDying([]);
      setFloaters([]);
      setTrapBanner(null);
      setShake(null);
      setFinished(true);
    },
    [frames.length]
  );

  useEffect(() => {
    let cancelled = false;

    const reduced =
      prefersReducedMotion();

    async function run() {
      await wait(350);

      for (let i = 1; i < frames.length; i++) {
        if (
          cancelled ||
          skipped.current
        ) {
          return;
        }

        const prev =
          frames[i - 1];

        const cur =
          frames[i];

        const ev =
          cur.ev;

        if (ev.k === "end") {
          break;
        }

        // Where everyone stood before this tick (for numbers).
        const where =
          new Map<number, {
            lane: number;
            row: number;
          }>();

        for (const unit of prev.mine) {
          where.set(unit.uid, {
            lane: unit.lane,
            row: rowOf(unit, true),
          });
        }

        for (const unit of prev.foe) {
          where.set(unit.uid, {
            lane: unit.lane,
            row: rowOf(unit, false),
          });
        }

        const next: Floater[] = [];

        const hits =
          ev.k === "tick"
            ? ev.hits
            : ev.k === "ambush"
              ? ev.dst.map(
                  (dst) => ({
                    src: ev.src ?? -1,
                    dst,
                    amt: ev.amt,
                  })
                )
              : [];

        for (const hit of hits) {
          const at =
            where.get(hit.dst);

          if (at) {
            floaterKey.current += 1;

            next.push({
              key: floaterKey.current,
              lane: at.lane,
              row: at.row,
              text: hit.amt === 0 ? "Blocked" : `-${hit.amt}`,
              tone: hit.amt === 0 ? "zero" : "hit",
            });
          }
        }

        if (ev.k === "tick") {
          for (const hit of ev.castle) {
            floaterKey.current += 1;

            next.push({
              key: floaterKey.current,
              lane: hit.lane,
              row: hit.side === 0 ? LANE_LEN - 1 : 0,
              text: `-${hit.amt} LP`,
              tone: "castle",
            });
          }
        }

        // A trap flips: pause on the banner.
        if (
          ev.k === "tick" &&
          ev.traps.length > 0
        ) {
          const flip =
            ev.traps[0];

          setTrapBanner({
            id: flip.id,
            mine: flip.side === 0,
          });

          play("whoosh");

          await wait(1000 / speed.current);

          if (
            cancelled ||
            skipped.current
          ) {
            return;
          }

          setTrapBanner(null);
        }

        // Destroyed this tick: shatter where they stood.
        const goneMine =
          prev.mine.filter(
            (unit) => !cur.mine.some((other) => other.uid === unit.uid)
          );

        const goneFoe =
          prev.foe.filter(
            (unit) => !cur.foe.some((other) => other.uid === unit.uid)
          );

        setDying([
          ...goneMine.map(
            (unit) => ({
              unit,
              mine: true,
            })
          ),
          ...goneFoe.map(
            (unit) => ({
              unit,
              mine: false,
            })
          ),
        ]);

        setFlashed(new Set(hits.filter((hit) => hit.amt > 0).map((hit) => hit.dst)));
        setFloaters((list) => [...list.slice(-10), ...next]);
        setIndex(i);

        if (
          ev.k === "tick" &&
          ev.castle.length > 0
        ) {
          play("boom");

          if (!reduced) {
            setShake(ev.castle[0].side);
          }
        }

        await wait((ev.k === "ambush" ? 450 : TICK_MS) / speed.current);

        setShake(null);
        setDying([]);
        setFlashed(new Set());
      }

      if (
        !cancelled &&
        !skipped.current
      ) {
        setIndex(frames.length - 1);
        setFinished(true);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [frames]);

  // Old floaters fade out on their own (CSS), then get dropped.
  useEffect(() => {
    if (floaters.length === 0) {
      return;
    }

    const timer =
      window.setTimeout(
        () => setFloaters((list) => list.slice(1)),
        800
      );

    return () => {
      window.clearTimeout(timer);
    };
  }, [floaters]);

  const myLp =
    Math.max(0, healthBefore - shown.castle[0]);

  const tokenStyle = (
    lane: number,
    row: number
  ) => ({
    left: `calc(${(lane * 100) / LANES}% + ${100 / LANES / 2}% )`,
    top: `${(row * 100) / LANE_LEN}%`,
    height: `${100 / LANE_LEN}%`,
  });

  const renderUnit = (
    unit: CombatSnap,
    mine: boolean,
    gone = false
  ) => (
    <div
      key={`${mine ? "m" : "f"}-${unit.uid}`}
      className={`absolute z-10 aspect-square -translate-x-1/2 p-[2px] ${styles.marcher} ${gone ? styles.dying : ""} ${flashed.has(unit.uid) ? styles.shake : ""}`}
      style={tokenStyle(unit.lane, rowOf(unit, mine))}
    >
      <FieldToken
        img={unit.img}
        atk={unit.atk}
        hp={unit.hp}
        def={unit.def}
        golden={unit.golden}
        boss={unit.boss}
        enemy={!mine}
        small
      />
    </div>
  );

  const result =
    combat.result;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[.2em] text-red-300/90">
            Wave {combat.wave}
          </p>

          <p className="truncate font-display text-base font-bold text-amber-100">
            {routeName}
          </p>
        </div>

        {
          finished
            ? null
            : (
                <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    speed.current = fast ? 1 : 2;
                    setFast(!fast);
                  }}
                  aria-pressed={fast}
                  className={`min-h-11 min-w-11 rounded-xl border px-2.5 text-sm font-black active:scale-95 ${fast ? "border-amber-200 bg-amber-300/20 text-amber-50" : "border-white/15 bg-white/5 text-zinc-200"}`}
                >
                  {fast ? "2×" : "1×"}
                </button>

                <button
                  type="button"
                  onClick={finish}
                  className="flex min-h-11 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-bold text-zinc-200 active:scale-95"
                >
                  <FastForward
                    size={16}
                    aria-hidden
                  />
                  Skip
                </button>
                </div>
              )
        }
      </div>

      <div className="relative mx-3 mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-amber-300/20 bg-[#05070f]">
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{
            backgroundImage: "url(/v2/temple-night.jpg)",
          }}
        />

        {/* enemy castle */}
        <div
          className={`relative flex min-h-11 items-center justify-center gap-2 border-b border-red-400/30 bg-[linear-gradient(180deg,rgba(120,20,20,.6),rgba(60,10,10,.2))] ${shake === 1 ? styles.shake : ""}`}
        >
          <span className={styles.castle} aria-hidden />

          <span className="text-[11px] font-bold uppercase tracking-[.16em] text-red-100">
            Enemy castle
            {
              shown.castle[1] > 0
                ? ` · hit for ${shown.castle[1]}`
                : ""
            }
          </span>

          {
            shown.traps[1].length > 0
              ? (
                  <span className="flex gap-0.5" aria-label="Enemy traps">
                    {shown.traps[1].map(
                      (trap) => (
                        <span
                          key={trap.lane}
                          className={`h-5 w-3.5 rounded-[2px] border ${trap.used ? "border-pink-200/20 bg-pink-950/40" : "border-[#e58ab9]/70 bg-[radial-gradient(circle,#b2477f,#3d0f29)]"}`}
                        />
                      )
                    )}
                  </span>
                )
              : null
          }
        </div>

        {/* the lanes */}
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0 grid grid-cols-3 gap-1.5 px-1.5">
            {Array.from(
              {
                length: LANES,
              },
              (_, lane) => (
                <div
                  key={lane}
                  className={`${styles.lanePath} rounded-lg`}
                />
              )
            )}
          </div>

          <div className="absolute inset-y-1 inset-x-1.5">
            {shown.foe.map((unit) => renderUnit(unit, false))}
            {shown.mine.map((unit) => renderUnit(unit, true))}
            {dying.map((entry) => renderUnit(entry.unit, entry.mine, true))}

            {floaters.map(
              (floater) => (
                <span
                  key={floater.key}
                  className={`pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap font-display text-sm font-black drop-shadow-[0_2px_2px_rgba(0,0,0,.9)] ${styles.float} ${
                    floater.tone === "castle"
                      ? "text-red-300"
                      : floater.tone === "zero"
                        ? "text-sky-200"
                        : "text-amber-100"
                  }`}
                  style={tokenStyle(floater.lane, floater.row)}
                >
                  {floater.text}
                </span>
              )
            )}
          </div>
        </div>

        {/* your castle */}
        <div
          className={`relative flex min-h-12 items-center justify-center gap-2 border-t border-sky-300/30 bg-[linear-gradient(0deg,rgba(20,50,120,.6),rgba(10,20,50,.2))] ${shake === 0 ? styles.shake : ""}`}
        >
          <span className={styles.castle} aria-hidden />

          <span className="font-display text-lg font-black tabular-nums text-sky-50">
            {myLp}
            <span className="ml-1 text-[11px] font-bold text-sky-200/70">
              LP
            </span>
          </span>

          {
            shown.traps[0].length > 0
              ? (
                  <span className="flex gap-0.5" aria-label="Your traps">
                    {shown.traps[0].map(
                      (trap) => (
                        <span
                          key={trap.lane}
                          className={`h-5 w-3.5 rounded-[2px] border ${trap.used ? "border-pink-200/20 bg-pink-950/40" : "border-[#e58ab9]/70 bg-[radial-gradient(circle,#b2477f,#3d0f29)]"}`}
                        />
                      )
                    )}
                  </span>
                )
              : null
          }
        </div>

        {/* TRAP CARD! */}
        {
          trapBanner
            ? (
                <div
                  role="status"
                  className={`absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-black/80 ${styles.banner}`}
                >
                  <p className="text-[11px] font-bold uppercase tracking-[.3em] text-zinc-300">
                    {trapBanner.mine ? "Your" : "Their"} trap card
                  </p>

                  <div className={`w-28 ${styles.trapFlip}`}>
                    <CardFrame
                      id={trapBanner.id}
                      size="lg"
                    />
                  </div>

                  <p className={`px-4 text-center font-display text-3xl font-black uppercase leading-tight tracking-wide drop-shadow-[0_3px_6px_rgba(0,0,0,.9)] ${trapBanner.mine ? "text-pink-200" : "text-red-300"}`}>
                    {TRAP_BY_ID.get(trapBanner.id)?.name}!
                  </p>
                </div>
              )
            : null
        }

        {/* result */}
        {
          finished
            ? (
                <div className="absolute inset-x-0 bottom-0 z-30 p-3">
                  <div className={`rounded-2xl border border-amber-300/25 bg-[#0a0e1f]/95 p-4 text-center shadow-[0_-8px_30px_rgba(0,0,0,.6)] ${styles.banner}`}>
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/10">
                      {
                        result === "win"
                          ? (
                              <Trophy
                                size={20}
                                className="text-amber-300"
                                aria-hidden
                              />
                            )
                          : result === "loss"
                            ? (
                                <Skull
                                  size={20}
                                  className="text-rose-400"
                                  aria-hidden
                                />
                              )
                            : (
                                <Swords
                                  size={20}
                                  className="text-zinc-300"
                                  aria-hidden
                                />
                              )
                      }
                    </div>

                    <p className="mt-1 font-display text-2xl font-black text-amber-100">
                      {result === "win" ? "Victory" : result === "loss" ? "Defeat" : "Draw"}
                    </p>

                    <p className="mt-1 text-sm text-zinc-300">
                      {
                        combat.damage > 0
                          ? `Your castle took ${combat.damage} damage (max ${combat.cap}) · ${Math.max(0, healthBefore - combat.damage)} LP left`
                          : (
                              <span className="inline-flex items-center gap-1">
                                <Shield
                                  size={14}
                                  className="text-sky-300"
                                  aria-hidden
                                />
                                Your castle held. No damage.
                              </span>
                            )
                      }
                    </p>

                    <ul className="mt-2 grid gap-0.5 text-left text-[12px] leading-4 text-zinc-300">
                      {combat.recap.map(
                        (line) => (
                          <li key={line}>
                            {line}
                          </li>
                        )
                      )}
                    </ul>

                    <button
                      type="button"
                      onClick={onDone}
                      autoFocus
                      className="primary-button mt-3 min-h-12 w-full"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )
            : null
        }
      </div>

      <div className="h-[max(.75rem,env(safe-area-inset-bottom))]" />
    </div>
  );
}
