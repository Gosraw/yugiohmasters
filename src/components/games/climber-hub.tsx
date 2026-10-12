"use client";

import Link from "next/link";

import {
  ArrowLeft,
  CalendarDays,
  Hand,
  Loader2,
  RotateCcw,
  Smartphone,
  Sparkles,
  Trophy,
} from "lucide-react";

import {
  useRouter,
} from "next/navigation";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import {
  getClimberRunSeed,
  startClimberRun,
  submitClimberRun,
  type SubmitRunResult,
} from "@/app/actions/games";

import type {
  ClimberPageData,
} from "@/lib/games/climber-data";

import {
  msUntilAmsterdamMidnight,
} from "@/lib/games/periods";

import type {
  RunInputs,
} from "@/lib/games/climber-engine";

import {
  play,
} from "@/lib/sound";

import {
  ClimberPlay,
  clearSavedRun,
  readSavedRun,
  type ControlMode,
  type SavedRun,
} from "./climber-play";

import {
  GameLeaderboard,
} from "./game-leaderboard";

// =========================================================
// PYRAMID CLIMB - start screen, play, game over.
//
//   menu       -> Daily Climb (1 attempt/day) or Practice
//   playing    -> <ClimberPlay> full screen
//   submitting -> the server replays the run
//   result     -> score + place, play again
//
// Leaderboards come from the server component; router.refresh()
// reloads them after every run.
// =========================================================

type ActiveRun = {
  runId: string;
  seed: string;
  mode: "daily" | "practice";
  resume: SavedRun | null;
};

type Phase =
  | {
      kind: "menu";
    }
  | {
      kind: "playing";
      run: ActiveRun;
    }
  | {
      kind: "submitting";
      mode: "daily" | "practice";
      score: number;
    }
  | {
      kind: "result";
      mode: "daily" | "practice";
      score: number;
      result: SubmitRunResult;
    };

const CONTROLS_KEY = "dc.climber.controls.v1";

const subscribeNoop = () => () => {};

function readControls(): ControlMode {
  try {
    return window.localStorage.getItem(CONTROLS_KEY) === "tilt"
      ? "tilt"
      : "touch";
  } catch {
    return "touch";
  }
}

async function requestTiltPermission(): Promise<boolean> {
  const orientation =
    (
      window as unknown as {
        DeviceOrientationEvent?: {
          requestPermission?: () => Promise<"granted" | "denied">;
        };
      }
    ).DeviceOrientationEvent;

  if (!orientation) return false;

  if (typeof orientation.requestPermission === "function") {
    try {
      return (await orientation.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }

  return true;
}

function formatCountdown(
  ms: number
) {
  const minutes =
    Math.floor(ms / 60000);

  const hours =
    Math.floor(minutes / 60);

  return hours > 0
    ? `${hours}h ${minutes % 60}m`
    : `${minutes}m`;
}

function rewardText(
  dp: number,
  voucher: string | null
) {
  const parts: string[] = [];

  if (dp > 0) parts.push(`+${dp} DP`);

  if (voucher) {
    parts.push(
      `${voucher.replace("_pack", "").replace(/^\w/, (c) => c.toUpperCase())} Pack`
    );
  }

  return parts.join(" + ");
}

type Props = {
  data: ClimberPageData;
  userId: string;
};

export function ClimberHub({
  data,
  userId,
}: Props) {
  const router =
    useRouter();

  const [phase, setPhase] =
    useState<Phase>({
      kind: "menu",
    });

  const [busy, setBusy] =
    useState<"daily" | "practice" | "resume" | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [board, setBoard] =
    useState<"day" | "week">("day");

  const [controlsChoice, setControlsChoice] =
    useState<ControlMode | null>(null);

  const [pendingResume, setPendingResume] =
    useState<(SavedRun & { seed: string }) | null>(null);

  // Read the saved preference without a hydration mismatch.
  const storedControls =
    useSyncExternalStore(
      subscribeNoop,
      readControls,
      () => "touch" as ControlMode
    );

  const tiltSupported =
    useSyncExternalStore(
      subscribeNoop,
      () => "DeviceOrientationEvent" in window,
      () => false
    );

  const controls =
    controlsChoice ?? storedControls;

  const chooseControls = (
    mode: ControlMode
  ) => {
    setControlsChoice(mode);

    try {
      window.localStorage.setItem(CONTROLS_KEY, mode);
    } catch {
      // Not remembered; fine.
    }
  };

  // An unfinished run (tab killed mid-climb)? Offer to resume it.
  useEffect(() => {
    let cancelled = false;

    const saved =
      readSavedRun();

    if (!saved) return;

    getClimberRunSeed(saved.runId).then(
      (result) => {
        if (cancelled) return;

        if (result.ok) {
          setPendingResume({
            ...saved,
            seed: result.seed,
          });
        } else {
          clearSavedRun();
        }
      },
      () => {}
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const start = async (
    mode: "daily" | "practice"
  ) => {
    if (busy) return;

    setError(null);
    setBusy(mode);

    // iOS only allows the motion-permission prompt directly inside
    // a tap, so ask before anything else is awaited.
    let useControls = controls;

    if (useControls === "tilt") {
      const granted =
        await requestTiltPermission();

      if (!granted) {
        useControls = "touch";
        chooseControls("touch");
        setError("Tilt is not available, so you will steer by touch.");
      }
    }

    if (
      mode === "daily" &&
      !window.confirm("Start your Daily Climb? You get one attempt today. Leaving mid-climb ends it.")
    ) {
      setBusy(null);
      return;
    }

    const result =
      await startClimberRun(mode);

    setBusy(null);

    if (!result.ok) {
      setError(result.error);
      router.refresh();
      return;
    }

    clearSavedRun();
    setPendingResume(null);

    setPhase({
      kind: "playing",
      run: {
        runId: result.runId,
        seed: result.seed,
        mode: result.mode,
        resume: null,
      },
    });
  };

  const resume = async () => {
    if (!pendingResume) return;

    if (controls === "tilt") {
      await requestTiltPermission();
    }

    setPhase({
      kind: "playing",
      run: {
        runId: pendingResume.runId,
        seed: pendingResume.seed,
        mode: pendingResume.mode,
        resume: pendingResume,
      },
    });

    setPendingResume(null);
  };

  const activeRun =
    phase.kind === "playing"
      ? phase.run
      : null;

  const onFinished = useCallback(
    async (
      outcome: {
        score: number;
        inputs: RunInputs;
      }
    ) => {
      if (!activeRun) return;

      play("gameOver");

      setPhase({
        kind: "submitting",
        mode: activeRun.mode,
        score: outcome.score,
      });

      let result: SubmitRunResult;

      try {
        result = await submitClimberRun(
          activeRun.runId,
          outcome.score,
          outcome.inputs
        );
      } catch {
        result = {
          ok: false,
          error: "Could not reach the server. Check your connection.",
        };
      }

      setPhase({
        kind: "result",
        mode: activeRun.mode,
        score: outcome.score,
        result,
      });

      router.refresh();
    },
    [activeRun, router]
  );

  const myWeek =
    data.weekBoard.find(
      (row) => row.profileId === userId
    );

  const myDay =
    data.dayBoard.find(
      (row) => row.profileId === userId
    );

  const dayReward =
    data.rewards.find(
      (rule) => rule.period === "day" && rule.place === 1
    );

  const weekReward =
    data.rewards.find(
      (rule) => rule.period === "week" && rule.place === 1
    );

  const dailyDone =
    data.daily.status !== "open";

  // ---------------------------------------------------------
  // Playing / result views
  // ---------------------------------------------------------

  if (phase.kind === "playing") {
    return (
      <ClimberPlay
        runId={phase.run.runId}
        seed={phase.run.seed}
        mode={phase.run.mode}
        controls={controls}
        spriteUrl={data.sprite?.imageUrl ?? null}
        bestScore={
          phase.run.mode === "daily"
            ? null
            : myWeek?.score ?? null
        }
        resume={phase.run.resume}
        onFinished={onFinished}
      />
    );
  }

  if (
    phase.kind === "submitting" ||
    phase.kind === "result"
  ) {
    const result =
      phase.kind === "result"
        ? phase.result
        : null;

    return (
      <div className="fixed inset-0 z-[55] flex h-[100dvh] items-center justify-center overflow-y-auto bg-[rgb(3_5_15/.94)] px-5 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
        <div className="spell-glow left-1/2 top-1/3 h-72 w-72 -translate-x-1/2" />

        <div className="panel arena-frame relative w-full max-w-sm p-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
            {
              phase.mode === "daily"
                ? "Daily Climb"
                : "Practice run"
            }
          </p>

          <p className="mt-3 text-sm text-zinc-400">
            You climbed
          </p>

          <p className="gold-text font-display text-6xl font-black tabular-nums">
            {phase.score.toLocaleString("en-US")}
          </p>

          <p className="text-sm font-semibold uppercase tracking-[.2em] text-amber-200/80">
            metres
          </p>

          <div className="mt-5 min-h-16 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            {
              !result
                ? (
                    <p className="flex items-center justify-center gap-2 text-sm text-zinc-300">
                      <Loader2
                        size={16}
                        className="animate-spin motion-reduce:animate-none"
                      />
                      Checking your climb...
                    </p>
                  )
                : result.ok
                  ? (
                      <>
                        <p className="text-sm font-semibold text-emerald-300">
                          Climb verified
                        </p>

                        <p className="mt-1 text-sm text-zinc-200">
                          {
                            result.place
                              ? `#${result.place} of ${result.players} ${result.mode === "daily" ? "today" : "this week"}`
                              : "Not on the board yet"
                          }
                          {
                            result.mode === "practice" &&
                            result.best !== null &&
                            result.best > result.score
                              ? ` · your best: ${result.best.toLocaleString("en-US")} m`
                              : ""
                          }
                        </p>
                      </>
                    )
                  : (
                      <p className="text-sm text-rose-300">
                        {result.error}
                      </p>
                    )
            }
          </div>

          <div className="mt-5 grid gap-2">
            {
              phase.mode === "practice"
                ? (
                    <button
                      type="button"
                      disabled={!result || busy !== null}
                      onClick={() => start("practice")}
                      className="primary-button flex w-full items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {
                        busy === "practice"
                          ? (
                              <Loader2
                                size={16}
                                className="animate-spin motion-reduce:animate-none"
                              />
                            )
                          : (
                              <RotateCcw
                                size={16}
                              />
                            )
                      }
                      Climb again
                    </button>
                  )
                : null
            }

            <button
              type="button"
              disabled={!result}
              onClick={() => setPhase({ kind: "menu" })}
              className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-200 transition-transform duration-100 active:scale-[.98] disabled:opacity-60"
            >
              Leaderboards
            </button>
          </div>

          {
            error
              ? (
                  <p className="mt-3 text-sm text-rose-300">
                    {error}
                  </p>
                )
              : null
          }
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // Menu
  // ---------------------------------------------------------

  const boardRows =
    board === "day"
      ? data.dayBoard
      : data.weekBoard;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <Link
        href="/games"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-400 hover:text-amber-200"
      >
        <ArrowLeft
          size={16}
        />
        Games
      </Link>

      <p className="mt-4 text-xs font-bold uppercase tracking-[.22em] text-amber-300">
        Mini game
      </p>

      <h1 className="gold-text mt-2 text-3xl font-black sm:text-4xl">
        Pyramid Climb
      </h1>

      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
        Bounce your Boss up the Millennium pyramid. The higher you get, the
        wider the gaps and the meaner the Traps. Pure skill: nothing to look up.
      </p>

      {
        data.sprite
          ? (
              <div className="mt-4 inline-flex items-center gap-2.5 rounded-full border border-[rgb(242_196_90/.25)] bg-black/20 py-1 pl-1 pr-3.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.sprite.imageUrl}
                  alt=""
                  className="h-8 w-8 rounded-full border border-amber-300/60 object-cover"
                />
                <span className="text-xs text-zinc-300">
                  Climbing as{" "}
                  <span className="font-semibold text-amber-100">
                    {data.sprite.name}
                  </span>
                </span>
              </div>
            )
          : null
      }

      {
        error
          ? (
              <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </p>
            )
          : null
      }

      {
        pendingResume
          ? (
              <div className="panel mt-5 flex items-center gap-3 border-amber-300/40 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-100">
                    Unfinished {pendingResume.mode === "daily" ? "Daily Climb" : "run"}
                  </p>
                  <p className="text-xs text-zinc-400">
                    Pick it up exactly where you left off.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={resume}
                  className="primary-button shrink-0 active:scale-[.98]"
                >
                  Resume
                </button>
              </div>
            )
          : null
      }

      {
        !data.hasLeague
          ? (
              <p className="panel mt-6 p-5 text-sm text-zinc-300">
                Join a league first to play and get on the leaderboards.
              </p>
            )
          : (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {/* DAILY */}
                <div className="arena-frame panel relative overflow-hidden p-5">
                  <div className="spell-glow -right-10 -top-10 h-36 w-36" />

                  <div className="relative">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-amber-300">
                      <CalendarDays
                        size={14}
                      />
                      Daily Climb
                    </p>

                    <p className="mt-2 text-sm leading-6 text-zinc-300">
                      Same pyramid for everyone today. One attempt.
                    </p>

                    {
                      dailyDone
                        ? (
                            <div className="mt-4">
                              <p className="font-display text-2xl font-bold text-amber-100 tabular-nums">
                                {
                                  data.daily.score !== null
                                    ? `${data.daily.score.toLocaleString("en-US")} m`
                                    : data.daily.status === "started"
                                      ? "Not finished"
                                      : "Not counted"
                                }
                              </p>

                              <p
                                suppressHydrationWarning
                                className="text-xs text-zinc-400"
                              >
                                {myDay ? `#${myDay.place} today · ` : ""}
                                New climb in {formatCountdown(msUntilAmsterdamMidnight())}
                              </p>
                            </div>
                          )
                        : (
                            <button
                              type="button"
                              onClick={() => start("daily")}
                              disabled={busy !== null}
                              className="primary-button mt-4 flex w-full items-center justify-center gap-2 disabled:opacity-60"
                            >
                              {
                                busy === "daily"
                                  ? (
                                      <Loader2
                                        size={16}
                                        className="animate-spin motion-reduce:animate-none"
                                      />
                                    )
                                  : null
                              }
                              Start Daily Climb
                            </button>
                          )
                    }
                  </div>
                </div>

                {/* PRACTICE */}
                <div className="panel p-5">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-amber-300">
                    <Trophy
                      size={14}
                    />
                    Practice
                  </p>

                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    A new pyramid every run. Your best this week counts.
                  </p>

                  <p className="mt-3 text-xs text-zinc-400">
                    {
                      myWeek
                        ? `Your best: ${myWeek.score.toLocaleString("en-US")} m (#${myWeek.place})`
                        : "No climb this week yet"
                    }
                  </p>

                  <button
                    type="button"
                    onClick={() => start("practice")}
                    disabled={busy !== null}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[rgb(242_196_90/.4)] bg-[rgb(242_196_90/.08)] px-4 py-3 text-sm font-bold text-amber-100 transition-transform duration-100 active:scale-[.98] disabled:opacity-60"
                  >
                    {
                      busy === "practice"
                        ? (
                            <Loader2
                              size={16}
                              className="animate-spin motion-reduce:animate-none"
                            />
                          )
                        : null
                    }
                    Practice run
                  </button>
                </div>
              </div>
            )
      }

      {/* CONTROLS */}
      <div className="mt-4 flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-[.18em] text-zinc-500">
          Steer
        </span>

        <div
          role="radiogroup"
          aria-label="Steering"
          className="inline-flex rounded-full border border-white/10 bg-black/20 p-1"
        >
          {(
            [
              {
                value: "touch",
                label: "Touch",
                icon: Hand,
              },
              {
                value: "tilt",
                label: "Tilt",
                icon: Smartphone,
              },
            ] as const
          ).map(
            (option) => {
              const Icon =
                option.icon;

              const active =
                controls === option.value;

              const disabled =
                option.value === "tilt" &&
                !tiltSupported;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={disabled}
                  onClick={() => chooseControls(option.value)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors duration-150 disabled:opacity-40 ${
                    active
                      ? "bg-amber-300 text-[#1d1405]"
                      : "text-zinc-300"
                  }`}
                >
                  <Icon
                    size={13}
                  />
                  {option.label}
                </button>
              );
            }
          )}
        </div>
      </div>

      <p className="mt-2 text-xs text-zinc-500">
        Keyboard: arrow keys or A / D. P pauses.
      </p>

      {/* LEADERBOARDS */}
      <section className="panel mt-6 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-amber-100">
            Leaderboard
          </h2>

          <div
            role="tablist"
            className="inline-flex rounded-full border border-white/10 bg-black/20 p-1"
          >
            {(
              [
                ["day", "Today"],
                ["week", "This week"],
              ] as const
            ).map(
              ([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={board === value}
                  onClick={() => setBoard(value)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-colors duration-150 ${
                    board === value
                      ? "bg-amber-300 text-[#1d1405]"
                      : "text-zinc-300"
                  }`}
                >
                  {label}
                </button>
              )
            )}
          </div>
        </div>

        <p className="mt-1 text-xs text-zinc-500">
          {
            board === "day"
              ? `Daily Climb · winner gets ${dayReward ? rewardText(dayReward.dp, dayReward.voucher) : "a reward"}`
              : `Best practice run · winner gets ${weekReward ? rewardText(weekReward.dp, weekReward.voucher) : "a reward"}`
          }
        </p>

        <div className="mt-4">
          <GameLeaderboard
            rows={boardRows}
            currentUserId={userId}
            showRuns={board === "week"}
            emptyText={
              board === "day"
                ? "Nobody has climbed today yet. Be the first."
                : "No practice runs this week yet."
            }
          />
        </div>

        <p className="mt-4 text-xs leading-5 text-zinc-500">
          Rewards are paid automatically shortly after the day (or week) ends.
          Ties go to whoever reached the height first.
        </p>
      </section>

      {
        data.recentGrants.length > 0
          ? (
              <section className="mt-4 panel p-5">
                <h2 className="flex items-center gap-2 font-display text-base font-bold text-amber-100">
                  <Sparkles
                    size={16}
                  />
                  Recent winners
                </h2>

                <ul className="mt-3 grid gap-2">
                  {data.recentGrants.map(
                    (grant) => (
                      <li
                        key={grant.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 truncate text-zinc-300">
                          <span className="font-semibold text-zinc-100">
                            {grant.name}
                          </span>
                          {" · "}
                          {grant.description.replace(/^Pyramid Climb — /, "")}
                        </span>

                        <span className="shrink-0 text-xs font-bold text-amber-300">
                          {rewardText(grant.dp, grant.voucher)}
                        </span>
                      </li>
                    )
                  )}
                </ul>
              </section>
            )
          : null
      }

      {/* HOW TO PLAY */}
      <section className="mt-4 panel p-5">
        <h2 className="font-display text-base font-bold text-amber-100">
          How to climb
        </h2>

        <ul className="mt-3 grid gap-2.5 text-sm text-zinc-300">
          {[
            ["bg-gradient-to-b from-amber-300 to-amber-700", "Gold cards", "solid steps. Bounce as often as you like."],
            ["bg-gradient-to-b from-indigo-300 to-indigo-800", "Lapis cards", "slide left and right, faster the higher you go."],
            ["bg-gradient-to-b from-pink-400 to-fuchsia-900", "Trap cards", "hold you once, then crumble."],
            ["bg-gradient-to-b from-pink-500 to-rose-950 h-5 w-3.5", "Floating Traps", "touch one and you tumble down."],
            ["bg-gradient-to-b from-emerald-300 to-teal-800 h-5 w-3.5", "Monster Reborn", "an extra life: saves you from one fall."],
            ["bg-gradient-to-b from-emerald-300 to-teal-800 h-5 w-3.5", "Swords of Revealing Light", "slow motion and a shield for a few seconds."],
            ["bg-gradient-to-b from-emerald-300 to-teal-800 h-5 w-3.5", "Pot of Greed", "a huge jump."],
          ].map(
            ([swatch, name, text]) => (
              <li
                key={name}
                className="flex items-center gap-3"
              >
                <span className="flex w-7 shrink-0 justify-center">
                  <span
                    className={`inline-block rounded-[3px] ${swatch.includes("h-5") ? swatch : `${swatch} h-2.5 w-7`}`}
                  />
                </span>
                <span>
                  <span className="font-semibold text-zinc-100">
                    {name}
                  </span>
                  {": "}
                  {text}
                </span>
              </li>
            )
          )}
        </ul>

        <p className="mt-3 text-xs leading-5 text-zinc-500">
          The screen wraps: fly off one side and you come back on the other.
          Every climb is replayed on the server before it counts.
        </p>
      </section>
    </main>
  );
}
