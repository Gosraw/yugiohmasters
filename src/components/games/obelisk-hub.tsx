"use client";

import Link from "next/link";

import {
  ArrowLeft,
  CalendarDays,
  Loader2,
  Sparkles,
  Trophy,
} from "lucide-react";

import {
  useRouter,
} from "next/navigation";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  getObeliskRunSeed,
  startObeliskRun,
  submitObeliskRun,
} from "@/app/actions/obelisk";

import type {
  MiniGamePageData,
} from "@/lib/games/mini-game-data";

import type {
  StartGameRunResult,
  SubmitGameRunResult,
} from "@/lib/games/server-runs";

import {
  msUntilAmsterdamMidnight,
} from "@/lib/games/periods";

import {
  play,
  preloadSounds,
} from "@/lib/sound";

import {
  GameLeaderboard,
} from "./game-leaderboard";

import {
  ObeliskCrashGuard,
  ObeliskPlay,
  clearSavedObeliskRun,
  readSavedObeliskRun,
  type ObeliskRival,
  type SavedObeliskRun,
  type ObeliskOutcome,
  type ObeliskResult,
  type ObeliskRun,
} from "./obelisk-play";

// =========================================================
// OBELISK RUSH - start screen, play, game over.
//
//   menu    -> Daily Rush (1 attempt/day) or Practice
//   playing -> <ObeliskPlay> full screen; the game-over card sits on
//              top of the temple and "Play again" restarts in place
//
// Instant restart: once a run's result is in, the next Practice
// run is already requested in the background, so Play again /
// Space / a tap starts it with no wait. A prefetched run that is
// older than PREFETCH_MAX_AGE_MS is not used (its day / week
// would be stale).
// =========================================================

const PREFETCH_MAX_AGE_MS = 10 * 60 * 1000;

type Phase =
  | {
      kind: "menu";
    }
  | {
      kind: "playing";
      run: ObeliskRun;
      result: ObeliskResult | null;
    };

type Prefetched = Extract<StartGameRunResult, { ok: true }>;

/** Only ever called from event handlers (not during render). */
function isFresh(
  startedAt: number
) {
  return Date.now() - startedAt < PREFETCH_MAX_AGE_MS;
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

const points = (
  score: number
) => `${score.toLocaleString("en-US")} ${score === 1 ? "point" : "points"}`;

type Props = {
  data: MiniGamePageData;
  userId: string;
};

export function ObeliskHub({
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
    useState<"daily" | "practice" | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [notice, setNotice] =
    useState<string | null>(null);

  const [board, setBoard] =
    useState<"day" | "week">("day");

  const [pendingResume, setPendingResume] =
    useState<(SavedObeliskRun & { seed: string }) | null>(null);

  const crashRef =
    useRef<(() => void) | null>(null);

  const prefetchRef =
    useRef<Prefetched | null>(null);

  const prefetchingRef =
    useRef(false);

  useEffect(() => {
    preloadSounds([
      "tap",
      "chime",
      "rise",
      "whoosh",
      "coins",
      "boom",
      "gameOver",
    ]);
  }, []);

  // An unfinished run (tab killed mid-run)? Offer to resume it.
  useEffect(() => {
    let cancelled = false;

    const saved =
      readSavedObeliskRun();

    if (!saved) return;

    getObeliskRunSeed(saved.runId).then(
      (result) => {
        if (cancelled) return;

        if (result.ok) {
          setPendingResume({
            ...saved,
            seed: result.seed,
          });
        } else {
          clearSavedObeliskRun();
        }
      },
      () => {}
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const weekBest =
    data.weekBoard.find(
      (row) => row.profileId === userId
    )?.score ?? null;

  const rivalFor = (
    mode: "daily" | "practice"
  ): ObeliskRival | null => {
    const leader =
      (mode === "daily"
        ? data.dayBoard
        : data.weekBoard
      ).find(
        (row) => row.profileId !== userId && row.score > 0
      );

    return leader
      ? {
          name: leader.name,
          score: leader.score,
        }
      : null;
  };

  const prefetchPractice = useCallback(() => {
    if (
      !data.hasLeague ||
      prefetchRef.current ||
      prefetchingRef.current
    ) {
      return;
    }

    prefetchingRef.current = true;

    startObeliskRun("practice").then(
      (result) => {
        prefetchingRef.current = false;

        if (result.ok) {
          prefetchRef.current = result;
        }
      },
      () => {
        prefetchingRef.current = false;
      }
    );
  }, [data.hasLeague]);

  const takePrefetched = () => {
    const ready =
      prefetchRef.current;

    prefetchRef.current = null;

    if (
      ready &&
      isFresh(ready.startedAt)
    ) {
      return ready;
    }

    return null;
  };

  const begin = (
    run: {
      runId: string;
      seed: string;
      mode: "daily" | "practice";
    },
    resume: SavedObeliskRun | null = null
  ) => {
    clearSavedObeliskRun();

    setPendingResume(null);

    setPhase({
      kind: "playing",
      run: {
        ...run,
        resume,
        previousBest: weekBest,
      },
      result: null,
    });
  };

  const start = async (
    mode: "daily" | "practice"
  ) => {
    if (busy) return;

    setError(null);
    setNotice(null);

    if (mode === "practice") {
      const ready =
        takePrefetched();

      if (ready) {
        begin(ready);
        return;
      }
    }

    if (
      mode === "daily" &&
      !window.confirm("Start your Daily Rush? You get one attempt today.")
    ) {
      return;
    }

    setBusy(mode);

    let result: StartGameRunResult;

    try {
      result = await startObeliskRun(mode);
    } catch {
      result = {
        ok: false,
        error: "Could not reach the server. Check your connection.",
      };
    }

    setBusy(null);

    if (!result.ok) {
      setError(result.error);

      // A failed restart from the game-over card goes back to the menu.
      setPhase({
        kind: "menu",
      });

      router.refresh();
      return;
    }

    begin(result);
  };

  const resume = () => {
    if (!pendingResume) return;

    setError(null);
    setNotice(null);

    setPhase({
      kind: "playing",
      run: {
        runId: pendingResume.runId,
        seed: pendingResume.seed,
        mode: pendingResume.mode,
        resume: pendingResume,
        previousBest: weekBest,
      },
      result: null,
    });

    setPendingResume(null);
  };

  const activeRun =
    phase.kind === "playing"
      ? phase.run
      : null;

  const onFinished = useCallback(
    async (
      outcome: ObeliskOutcome
    ) => {
      if (!activeRun) return;

      play("gameOver", 0, 0.6);

      if (outcome.crashed) {
        setError("The game hit a problem, so your run ended at the score you reached.");
      }

      const base: ObeliskResult = {
        mode: activeRun.mode,
        score: outcome.score,
        strikes: outcome.strikes,
        raHits: outcome.raHits,
        bestCombo: outcome.bestCombo,
        end: outcome.end,
        previousBest: activeRun.previousBest,
        response: null,
      };

      setPhase({
        kind: "playing",
        run: activeRun,
        result: base,
      });

      let response: SubmitGameRunResult;

      try {
        response = await submitObeliskRun(
          activeRun.runId,
          outcome.score,
          outcome.inputs
        );
      } catch {
        response = {
          ok: false,
          error: "Could not reach the server. Check your connection.",
        };
      }

      setPhase((current) =>
        current.kind === "playing" &&
        current.run.runId === activeRun.runId
          ? {
              ...current,
              result: {
                ...base,
                response,
              },
            }
          : current
      );

      // Next run ready before the player even asks for it.
      prefetchPractice();

      router.refresh();
    },
    [activeRun, router, prefetchPractice]
  );

  const onAbandon = useCallback(() => {
    if (!activeRun) return;

    setPendingResume({
      runId: activeRun.runId,
      mode: activeRun.mode,
      tick: 0,
      score: 0,
      rec: {
        e: [],
        s: "",
        lastTick: -1,
      },
      savedAt: Date.now(),
      seed: activeRun.seed,
    });

    setNotice(
      activeRun.mode === "daily"
        ? "Your Daily Rush hasn't started yet, so it is still yours. Resume it when you're ready."
        : "Nothing was played, so this run is still open."
    );

    setPhase({
      kind: "menu",
    });
  }, [activeRun]);

  const onCrash = useCallback(() => {
    if (crashRef.current) {
      crashRef.current();
    } else {
      onAbandon();
    }
  }, [onAbandon]);

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
  // Playing (+ game over on top of the temple)
  // ---------------------------------------------------------

  if (phase.kind === "playing") {
    return (
      <ObeliskCrashGuard
        onCrash={onCrash}
      >
        <ObeliskPlay
          run={phase.run}
          rival={rivalFor(phase.run.mode)}
          result={phase.result}
          canPlayAgain={data.hasLeague}
          starting={busy === "practice"}
          error={error}
          onFinished={onFinished}
          onAbandon={onAbandon}
          onPlayAgain={() => start("practice")}
          onExit={() => setPhase({ kind: "menu" })}
          crashRef={crashRef}
        />
      </ObeliskCrashGuard>
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
        Obelisk Rush
      </h1>

      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
        Break the endless obelisk of the Night Temple, one stone at a time.
        Tap left or right to strike from that side, dodge the blades and keep
        the sand timer from running out.
      </p>

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
        notice
          ? (
              <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                {notice}
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
                    Unfinished {pendingResume.mode === "daily" ? "Daily Rush" : "run"}
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
                      Daily Rush
                    </p>

                    <p className="mt-2 text-sm leading-6 text-zinc-300">
                      Same obelisk and blades for everyone today. One attempt.
                    </p>

                    {
                      pendingResume?.mode === "daily"
                        ? (
                            <p className="mt-4 text-sm font-semibold text-amber-100">
                              Waiting for you: resume it above.
                            </p>
                          )
                        : dailyDone
                          ? (
                              <div className="mt-4">
                                <p className="font-display text-2xl font-bold text-amber-100 tabular-nums">
                                  {
                                    data.daily.score !== null
                                      ? points(data.daily.score)
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
                                  New obelisk in {formatCountdown(msUntilAmsterdamMidnight())}
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
                                Start Daily Rush
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
                    Unlimited runs. Your best this week counts.
                  </p>

                  <p className="mt-3 text-xs text-zinc-400">
                    {
                      myWeek
                        ? `Your best: ${points(myWeek.score)} (#${myWeek.place})`
                        : "No run this week yet"
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

      <p className="mt-3 text-xs text-zinc-500">
        Tap the left or right half, click, or use ← → / A D to strike. P pauses.
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
              ? `Daily Rush · winner gets ${dayReward ? rewardText(dayReward.dp, dayReward.voucher) : "a reward"}`
              : `Best practice run · winner gets ${weekReward ? rewardText(weekReward.dp, weekReward.voucher) : "a reward"}`
          }
        </p>

        <div className="mt-4">
          <GameLeaderboard
            rows={boardRows}
            currentUserId={userId}
            showRuns={board === "week"}
            unit="pts"
            emptyText={
              board === "day"
                ? "Nobody has struck the obelisk today yet. Be the first."
                : "No practice runs this week yet."
            }
          />
        </div>

        <p className="mt-4 text-xs leading-5 text-zinc-500">
          Rewards are paid automatically shortly after the day (or week) ends.
          Ties go to whoever got there first.
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
                          {grant.description.replace(/^Obelisk Rush — /, "")}
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
          How to play
        </h2>

        <ul className="mt-3 grid gap-2 text-sm leading-6 text-zinc-300">
          <li>
            <span className="font-semibold text-zinc-100">Tap left or right.</span>
            {" "}Your duelist jumps to that side and strikes: the bottom stone breaks off and the obelisk drops one block.
            On a computer use the arrow keys or A / D.
          </li>
          <li>
            <span className="font-semibold text-rose-300">Dodge the blades.</span>
            {" "}If a blade sticks out on your side at your height, you are cut. Watch the next block down: strike from the other side.
          </li>
          <li>
            <span className="font-semibold text-zinc-100">Beat the sand timer.</span>
            {" "}It drains all the time and every strike refills it a bit. Every 25 strikes it drains faster.
          </li>
          <li>
            <span className="font-semibold text-amber-200">Golden Ra blocks:</span>
            {" "}+5 points and a big refill.
          </li>
          <li>
            <span className="font-semibold text-zinc-100">Always fair.</span>
            {" "}There is always a safe side: two blades never trap you from both sides.
          </li>
        </ul>

        <p className="mt-3 text-xs leading-5 text-zinc-500">
          Score = strikes + Ra bonus. Every run is replayed on the server before it counts.
        </p>
      </section>
    </main>
  );
}
