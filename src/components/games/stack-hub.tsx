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
  getStackRunSeed,
  startStackRun,
  submitStackRun,
} from "@/app/actions/stack";

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
  StackCrashGuard,
  StackPlay,
  clearSavedStackRun,
  readSavedStackRun,
  type SavedStackRun,
  type StackOutcome,
  type StackResult,
  type StackRun,
} from "./stack-play";

import type {
  StackMarker,
} from "./stack-renderer";

// =========================================================
// PYRAMID STACK - start screen, play, game over.
//
//   menu    -> Daily Stack (1 attempt/day) or Practice
//   playing -> <StackPlay> full screen; the game-over card sits on
//              top of the tower and "Play again" restarts in place
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
      run: StackRun;
      result: StackResult | null;
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

const blocks = (
  score: number
) => `${score.toLocaleString("en-US")} ${score === 1 ? "block" : "blocks"}`;

type Props = {
  data: MiniGamePageData;
  userId: string;
};

export function StackHub({
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
    useState<(SavedStackRun & { seed: string }) | null>(null);

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
      "gameOver",
    ]);
  }, []);

  // An unfinished run (tab killed mid-stack)? Offer to resume it.
  useEffect(() => {
    let cancelled = false;

    const saved =
      readSavedStackRun();

    if (!saved) return;

    getStackRunSeed(saved.runId).then(
      (result) => {
        if (cancelled) return;

        if (result.ok) {
          setPendingResume({
            ...saved,
            seed: result.seed,
          });
        } else {
          clearSavedStackRun();
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

  const markersFor = (
    mode: "daily" | "practice"
  ): StackMarker[] => {
    const list: StackMarker[] = [];

    if (weekBest) {
      list.push({
        score: weekBest,
        label: "YOUR BEST",
        kind: "best",
      });
    }

    const leader =
      (mode === "daily"
        ? data.dayBoard
        : data.weekBoard
      ).find(
        (row) => row.profileId !== userId && row.score > 0
      );

    if (leader) {
      list.push({
        score: leader.score,
        label: leader.name.length > 14
          ? `${leader.name.slice(0, 13)}…`
          : leader.name,
        kind: "rival",
      });
    }

    return list;
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

    startStackRun("practice").then(
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
    resume: SavedStackRun | null = null
  ) => {
    clearSavedStackRun();

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
      !window.confirm("Start your Daily Stack? You get one attempt today.")
    ) {
      return;
    }

    setBusy(mode);

    let result: StartGameRunResult;

    try {
      result = await startStackRun(mode);
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
      outcome: StackOutcome
    ) => {
      if (!activeRun) return;

      play("gameOver", 0, 0.6);

      if (outcome.crashed) {
        setError("The game hit a problem, so your run ended at the height you reached.");
      }

      const base: StackResult = {
        mode: activeRun.mode,
        score: outcome.score,
        perfects: outcome.perfects,
        bestCombo: outcome.bestCombo,
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
        response = await submitStackRun(
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
        lastTick: -1,
      },
      savedAt: Date.now(),
      seed: activeRun.seed,
    });

    setNotice(
      activeRun.mode === "daily"
        ? "Your Daily Stack hasn't started yet, so it is still yours. Resume it when you're ready."
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
  // Playing (+ game over on top of the tower)
  // ---------------------------------------------------------

  if (phase.kind === "playing") {
    return (
      <StackCrashGuard
        onCrash={onCrash}
      >
        <StackPlay
          run={phase.run}
          markers={markersFor(phase.run.mode)}
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
      </StackCrashGuard>
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
        Pyramid Stack
      </h1>

      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
        Build the tallest pyramid tower in the Night Temple. One tap drops the
        sliding block: whatever hangs over the edge is cut off. Land it
        perfectly to keep it wide.
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
                    Unfinished {pendingResume.mode === "daily" ? "Daily Stack" : "run"}
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
                      Daily Stack
                    </p>

                    <p className="mt-2 text-sm leading-6 text-zinc-300">
                      Same blocks and speeds for everyone today. One attempt.
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
                                      ? blocks(data.daily.score)
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
                                  New stack in {formatCountdown(msUntilAmsterdamMidnight())}
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
                                Start Daily Stack
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
                        ? `Your best: ${blocks(myWeek.score)} (#${myWeek.place})`
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
        Tap anywhere, click or press Space to drop. P pauses.
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
              ? `Daily Stack · winner gets ${dayReward ? rewardText(dayReward.dp, dayReward.voucher) : "a reward"}`
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
                ? "Nobody has stacked today yet. Be the first."
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
                          {grant.description.replace(/^Pyramid Stack — /, "")}
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
          How to stack
        </h2>

        <ul className="mt-3 grid gap-2 text-sm leading-6 text-zinc-300">
          <li>
            <span className="font-semibold text-zinc-100">Tap to drop.</span>
            {" "}Blocks slide in from the left and the right, one after another.
          </li>
          <li>
            <span className="font-semibold text-zinc-100">Overhang is cut off.</span>
            {" "}The part that misses the block below falls away, so the tower gets narrower.
          </li>
          <li>
            <span className="font-semibold text-amber-200">Perfect drop:</span>
            {" "}land it (almost) exactly on top and it keeps its full size and flashes gold.
          </li>
          <li>
            <span className="font-semibold text-amber-200">Combo:</span>
            {" "}three perfects in a row and every perfect after that grows the block back a little.
          </li>
          <li>
            <span className="font-semibold text-zinc-100">Miss completely</span>
            {" "}and the run is over. Blocks speed up slowly as the tower rises.
          </li>
        </ul>

        <p className="mt-3 text-xs leading-5 text-zinc-500">
          Score = blocks stacked. Every run is replayed on the server before it counts.
        </p>
      </section>
    </main>
  );
}
