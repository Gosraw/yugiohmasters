"use client";

import {
  FastForward,
  Heart,
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

import type {
  CombatFrame,
  CombatResult,
  CombatSnap,
} from "@/lib/games/autobattler/engine";

import {
  UnitTile,
} from "./unit-tile";

import styles from "./arena.module.css";

// =========================================================
// Combat playback. The engine already resolved the fight; this
// only replays its frames: attacker lunges at its target, damage
// numbers float up, the dead fade out, tokens pop in.
// With prefers-reduced-motion there is no movement, just the
// numbers. "Skip" jumps straight to the result.
// =========================================================

type Floater = {
  id: number;
  uid: number;
  text: string;
  tone: "dmg" | "buff" | "block";
};

type Props = {
  combat: CombatResult;
  routeName: string;
  healthBefore: number;
  onDone: () => void;
};

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

function allUnits(
  frame: CombatFrame
) {
  return [...frame.mine, ...frame.foe];
}

export function ArenaCombat({
  combat,
  routeName,
  healthBefore,
  onDone,
}: Props) {
  const frames =
    combat.frames;

  const [shown, setShown] =
    useState<CombatFrame>(frames[0]);

  const [dying, setDying] =
    useState<Set<number>>(() => new Set());

  const [appearing, setAppearing] =
    useState<Set<number>>(() => new Set());

  const [hitUids, setHitUids] =
    useState<Set<number>>(() => new Set());

  const [floaters, setFloaters] =
    useState<Floater[]>([]);

  const [finished, setFinished] =
    useState(false);

  const tiles =
    useRef(new Map<number, HTMLElement>());

  const skipped =
    useRef(false);

  const floaterId =
    useRef(0);

  const register = useCallback(
    (uid: number) => (el: HTMLElement | null) => {
      if (el) {
        tiles.current.set(uid, el);
      } else {
        tiles.current.delete(uid);
      }
    },
    []
  );

  const finish = useCallback(
    () => {
      skipped.current = true;

      setShown(frames[frames.length - 1]);
      setDying(new Set());
      setAppearing(new Set());
      setHitUids(new Set());
      setFloaters([]);
      setFinished(true);
    },
    [frames]
  );

  useEffect(() => {
    let cancelled = false;

    const reduced =
      prefersReducedMotion();

    // Long fights play faster so a wave never takes ages.
    const beat =
      Math.max(
        reduced ? 220 : 260,
        Math.min(
          620,
          Math.floor(15000 / Math.max(1, frames.length))
        )
      );

    async function run() {
      await wait(450);

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

        // 1. Lunge (attack) - measured from the live tiles.
        if (
          ev.k === "attack" &&
          !reduced
        ) {
          const src =
            tiles.current.get(ev.src);

          const dst =
            tiles.current.get(ev.dst);

          if (
            src &&
            dst
          ) {
            const a =
              src.getBoundingClientRect();

            const b =
              dst.getBoundingClientRect();

            const dx =
              (b.left + b.width / 2 - (a.left + a.width / 2)) * 0.82;

            const dy =
              (b.top + b.height / 2 - (a.top + a.height / 2)) * 0.82;

            src.style.zIndex = "20";

            const animation =
              src.animate(
                [
                  {
                    transform: "translate(0, 0) scale(1)",
                  },
                  {
                    transform: `translate(${dx}px, ${dy}px) scale(1.08)`,
                    offset: 0.5,
                  },
                  {
                    transform: "translate(0, 0) scale(1)",
                  },
                ],
                {
                  duration: Math.min(420, beat),
                  easing: "cubic-bezier(.45,.05,.35,1)",
                }
              );

            await wait(Math.min(420, beat) * 0.5);

            animation.finished
              .then(() => {
                src.style.zIndex = "";
              })
              .catch(() => {});
          }
        }

        if (
          cancelled ||
          skipped.current
        ) {
          return;
        }

        // 2. Impact: numbers + who dies, still on the old layout.
        const before =
          new Map(
            allUnits(prev).map(
              (unit) => [unit.uid, unit]
            )
          );

        const after =
          new Map(
            allUnits(cur).map(
              (unit) => [unit.uid, unit]
            )
          );

        const newFloaters: Floater[] = [];

        const nextDying =
          new Set<number>();

        const nextHit =
          new Set<number>();

        const nextAppear =
          new Set<number>();

        for (const [uid, old] of before) {
          const now =
            after.get(uid);

          if (!now) {
            nextDying.add(uid);
            nextHit.add(uid);

            continue;
          }

          if (now.hp < old.hp) {
            nextHit.add(uid);

            newFloaters.push({
              id: floaterId.current++,
              uid,
              text: `-${old.hp - now.hp}`,
              tone: "dmg",
            });
          } else if (
            old.shield &&
            !now.shield
          ) {
            newFloaters.push({
              id: floaterId.current++,
              uid,
              text: "Blocked",
              tone: "block",
            });
          } else if (
            now.atk > old.atk ||
            now.maxHp > old.maxHp
          ) {
            newFloaters.push({
              id: floaterId.current++,
              uid,
              text: `+${now.atk - old.atk}/+${now.maxHp - old.maxHp}`,
              tone: "buff",
            });
          } else if (now.hp > old.hp) {
            // Reborn
            newFloaters.push({
              id: floaterId.current++,
              uid,
              text: "Reborn",
              tone: "buff",
            });
          }
        }

        for (const uid of after.keys()) {
          if (!before.has(uid)) {
            nextAppear.add(uid);
          }
        }

        setFloaters(
          (list) => [...list.slice(-12), ...newFloaters]
        );

        setHitUids(nextHit);
        setDying(nextDying);

        await wait(nextDying.size > 0 ? Math.max(260, beat * 0.55) : beat * 0.45);

        if (
          cancelled ||
          skipped.current
        ) {
          return;
        }

        // 3. Settle on the new layout.
        setDying(new Set());
        setHitUids(new Set());
        setAppearing(nextAppear);
        setShown(cur);

        await wait(beat * 0.5);
      }

      if (
        !cancelled &&
        !skipped.current
      ) {
        setShown(frames[frames.length - 1]);
        setFinished(true);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [frames]);

  const renderRow = (
    units: CombatSnap[],
    side: "mine" | "foe"
  ) => (
    <div
      className="grid grid-cols-7 gap-1"
      aria-label={side === "mine" ? "Your units" : "Enemy units"}
    >
      {Array.from(
        {
          length: 7,
        },
        (_, slot) => {
          // Centre the row like a real board.
          const offset =
            Math.floor((7 - units.length) / 2);

          const unit =
            units[slot - offset];

          if (!unit) {
            return (
              <div
                key={`empty-${side}-${slot}`}
                className="aspect-square"
              />
            );
          }

          return (
            <div
              key={unit.uid}
              ref={register(unit.uid)}
              className={`relative ${dying.has(unit.uid) ? styles.dying : ""} ${appearing.has(unit.uid) ? styles.appear : ""} ${hitUids.has(unit.uid) ? styles.hit : ""}`}
            >
              <UnitTile
                name={unit.name}
                img={unit.img}
                atk={unit.atk}
                hp={unit.hp}
                maxHp={unit.maxHp}
                golden={unit.golden}
                abilities={unit.kw.filter((kw) => kw !== "shield")}
                shieldUp={unit.shield}
                taunt={unit.taunt}
                token={unit.token}
                boss={unit.boss}
                size="sm"
              />

              {floaters
                .filter(
                  (floater) => floater.uid === unit.uid
                )
                .map(
                  (floater) => (
                    <span
                      key={floater.id}
                      className={`${styles.float} ${
                        floater.tone === "dmg"
                          ? "text-red-400"
                          : floater.tone === "buff"
                            ? "text-emerald-300 text-sm"
                            : "text-amber-200 text-xs"
                      }`}
                    >
                      {floater.text}
                    </span>
                  )
                )}
            </div>
          );
        }
      )}
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
              )
        }
      </div>

      <div className="relative flex flex-1 flex-col justify-center gap-6 px-3">
        <div className="rounded-2xl border border-red-400/15 bg-red-950/20 p-2">
          {renderRow(shown.foe, "foe")}
        </div>

        <div className="flex items-center justify-center gap-2 text-amber-300/70">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-300/40" />
          <Swords
            size={18}
            aria-hidden
          />
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-300/40" />
        </div>

        <div className="rounded-2xl border border-amber-300/15 bg-amber-950/10 p-2">
          {renderRow(shown.mine, "mine")}
        </div>

        {
          finished
            ? (
                <div
                  className={`absolute inset-x-3 top-1/2 -translate-y-1/2 ${styles.banner}`}
                  role="status"
                >
                  <div
                    className={`panel mx-auto max-w-xs p-5 text-center ${
                      result === "win"
                        ? "border-amber-300/50"
                        : result === "loss"
                          ? "border-red-400/50"
                          : ""
                    }`}
                  >
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/10">
                      {
                        result === "win"
                          ? (
                              <Trophy
                                size={24}
                                className="text-amber-300"
                                aria-hidden
                              />
                            )
                          : result === "loss"
                            ? (
                                <Skull
                                  size={24}
                                  className="text-red-300"
                                  aria-hidden
                                />
                              )
                            : (
                                <Swords
                                  size={24}
                                  className="text-zinc-300"
                                  aria-hidden
                                />
                              )
                      }
                    </div>

                    <p className="mt-2 font-display text-2xl font-black text-amber-100">
                      {
                        result === "win"
                          ? "Victory"
                          : result === "loss"
                            ? "Defeat"
                            : "Draw"
                      }
                    </p>

                    <p className="mt-1 text-sm text-zinc-300">
                      {
                        result === "loss"
                          ? (
                              <span className="inline-flex items-center gap-1">
                                You take {combat.damage} damage
                                <Heart
                                  size={13}
                                  className="text-rose-400"
                                  aria-hidden
                                />
                                {Math.max(0, healthBefore - combat.damage)} left
                              </span>
                            )
                          : result === "win"
                            ? "The wave is broken. No damage taken."
                            : "Nobody is left standing. No damage."
                      }
                    </p>

                    <button
                      type="button"
                      onClick={onDone}
                      autoFocus
                      className="primary-button mt-4 min-h-12 w-full"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )
            : null
        }
      </div>
    </div>
  );
}
