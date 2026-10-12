"use client";

import Link from "next/link";

import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  Heart,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  Skull,
  Swords,
  Trophy,
} from "lucide-react";

import {
  useRouter,
} from "next/navigation";

import {
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import {
  resumeArenaRun,
  startArenaRun,
  submitArenaRun,
  type SubmitArenaResult,
} from "@/app/actions/autobattler";

import type {
  ArenaBoards,
  ArenaPageData,
} from "@/lib/games/autobattler/data";

import {
  describeScore,
  BOARD_MAX,
  MAX_WAVES,
  START_HEALTH,
  type RunState,
} from "@/lib/games/autobattler/engine";

import {
  ABILITY_LABEL,
  ROUTE_BY_CODE,
  SYNERGY_TEXT,
  abilityText,
  type Ability,
} from "@/lib/games/autobattler/units";

import {
  ARENA_SAVE_KEY,
  ArenaPlay,
  clearSavedArenaRun,
  readSavedArenaRun,
  type ArenaFinish,
  type SavedArenaRun,
} from "./arena-play";

import {
  ArenaLeaderboards,
  ArenaScore,
} from "./arena-leaderboard";

import {
  ABILITY_ICON,
} from "./unit-tile";

// =========================================================
// SHADOW ARENA - start screen, the run, game over.
// =========================================================

type Playing = {
  runId: string;
  seed: string;
  mode: "daily" | "practice";
  actions: string[];
  openedAt: number;
};

type Finished = {
  finish: ArenaFinish;
  mode: "daily" | "practice";
  submit: SubmitArenaResult | null;
  runId: string;
};

const subscribeNoop = () => () => {};

function readSaveRaw() {
  try {
    return window.localStorage.getItem(ARENA_SAVE_KEY);
  } catch {
    return null;
  }
}

const ABILITIES: Ability[] = [
  "taunt",
  "shield",
  "revive",
  "pierce",
  "double",
  "venom",
  "ambush",
  "lastwill",
  "spawn",
  "rally",
  "ascend",
];

const ABILITY_POWER: Partial<Record<Ability, number>> = {
  rally: 1,
  lastwill: 2,
  spawn: 2,
  ascend: 1,
  ambush: 3,
};

export function ArenaHub({
  data,
}: {
  data: ArenaPageData;
}) {
  const router =
    useRouter();

  const [playing, setPlaying] =
    useState<Playing | null>(null);

  const [finished, setFinished] =
    useState<Finished | null>(null);

  const [boards, setBoards] =
    useState<ArenaBoards>(data);

  const [busy, setBusy] =
    useState<"daily" | "practice" | "resume" | "submit" | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [hiddenSave, setHiddenSave] =
    useState<string | null>(null);

  const saveRaw =
    useSyncExternalStore(
      subscribeNoop,
      readSaveRaw,
      () => null
    );

  const saved: SavedArenaRun | null =
    useMemo(
      () => {
        if (!saveRaw) {
          return null;
        }

        try {
          const parsed =
            JSON.parse(saveRaw) as SavedArenaRun;

          return parsed?.runId && parsed.runId !== hiddenSave
            ? parsed
            : null;
        } catch {
          return null;
        }
      },
      [saveRaw, hiddenSave]
    );

  const start = async (
    mode: "daily" | "practice"
  ) => {
    setBusy(mode);
    setError(null);

    const result =
      await startArenaRun(mode);

    setBusy(null);

    if (!result.ok) {
      setError(result.error);

      return;
    }

    clearSavedArenaRun();

    setFinished(null);
    setPlaying({
      runId: result.runId,
      seed: result.seed,
      mode: result.mode,
      actions: [],
      openedAt: Date.now(),
    });
  };

  const resume = async () => {
    const current =
      readSavedArenaRun();

    if (!current) {
      return;
    }

    setBusy("resume");
    setError(null);

    const result =
      await resumeArenaRun(current.runId);

    setBusy(null);

    if (!result.ok) {
      clearSavedArenaRun();
      setHiddenSave(current.runId);
      setError(result.error);

      return;
    }

    setPlaying({
      runId: current.runId,
      seed: result.seed,
      mode: result.mode,
      actions: current.actions,
      openedAt: Date.now(),
    });
  };

  const submit = async (
    target: Finished
  ) => {
    setBusy("submit");

    let result: SubmitArenaResult;

    try {
      result =
        await submitArenaRun(
          target.runId,
          target.finish.score,
          target.finish.log
        );
    } catch {
      setBusy(null);
      setFinished({
        ...target,
        submit: {
          ok: false,
          error: "Could not reach the server. Check your connection and retry.",
          boards: null,
        },
      });

      return;
    }

    setBusy(null);

    // Accepted or definitively rejected: the save is done with.
    // (A network failure above keeps it so "Retry" works.)
    clearSavedArenaRun();
    setHiddenSave(target.runId);

    if (result.boards) {
      setBoards(result.boards);
    }

    setFinished({
      ...target,
      submit: result,
    });

    router.refresh();
  };

  const onFinished = (
    finish: ArenaFinish
  ) => {
    if (!playing) {
      return;
    }

    const target: Finished = {
      finish,
      mode: playing.mode,
      submit: null,
      runId: playing.runId,
    };

    setPlaying(null);
    setFinished(target);

    submit(target);
  };

  if (playing) {
    return (
      <ArenaPlay
        key={playing.runId}
        runId={playing.runId}
        seed={playing.seed}
        mode={playing.mode}
        initialActions={playing.actions}
        openedAt={playing.openedAt}
        onFinished={onFinished}
        onLeave={() => {
          setPlaying(null);
          setHiddenSave(null);
          router.refresh();
        }}
      />
    );
  }

  if (finished) {
    return (
      <GameOver
        finished={finished}
        boards={boards}
        userId={data.userId}
        busy={busy === "submit"}
        onRetrySubmit={() => submit(finished)}
        onPractice={() => start("practice")}
        onBack={() => setFinished(null)}
        startingPractice={busy === "practice"}
      />
    );
  }

  const dailyUsed =
    data.daily.status !== "open";

  const resumeAvailable =
    saved !== null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <Link
        href="/games"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-zinc-400"
      >
        <ArrowLeft
          size={16}
          aria-hidden
        />
        Mini games
      </Link>

      <p className="mt-2 text-xs font-bold uppercase tracking-[.22em] text-amber-300">
        Auto battler
      </p>

      <h1 className="gold-text mt-1 text-3xl font-black sm:text-4xl">
        Shadow Arena
      </h1>

      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
        Recruit monsters from a shared shop, build synergies, then watch them fight
        20 Boss waves on their own. You have {START_HEALTH} health and a turn
        timer. How far can you get?
      </p>

      {
        error
          ? (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-100"
              >
                {error}
              </p>
            )
          : null
      }

      {
        !data.hasLeague
          ? (
              <p className="panel mt-5 p-4 text-sm text-zinc-300">
                Join a league first to play the arena.
              </p>
            )
          : (
              <div className="mt-5 grid gap-3">
                {
                  resumeAvailable
                    ? (
                        <button
                          type="button"
                          onClick={resume}
                          disabled={busy !== null}
                          className="panel flex min-h-16 items-center gap-3 border-amber-300/50 p-4 text-left active:scale-[.99]"
                        >
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-300/40 bg-amber-300/15 text-amber-200">
                            {
                              busy === "resume"
                                ? (
                                    <Loader2
                                      size={20}
                                      className="animate-spin"
                                      aria-hidden
                                    />
                                  )
                                : (
                                    <RotateCcw
                                      size={20}
                                      aria-hidden
                                    />
                                  )
                            }
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block font-display text-base font-bold text-amber-100">
                              Resume your run
                            </span>

                            <span className="block text-xs text-zinc-400">
                              {saved?.mode === "daily" ? "Daily Arena" : "Practice"} · saved on this device
                            </span>
                          </span>
                        </button>
                      )
                    : null
                }

                <div className="arena-frame panel relative overflow-hidden p-5">
                  <div className="spell-glow -right-10 -top-10 h-40 w-40" />

                  <div className="relative flex items-start gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-300/10 text-amber-300">
                      <CalendarDays
                        size={22}
                        aria-hidden
                      />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="font-display text-lg font-bold text-amber-100">
                        Daily Arena
                      </p>

                      <p className="mt-0.5 text-sm leading-5 text-zinc-400">
                        Same shop and Bosses for everyone today. One attempt.
                      </p>
                    </div>
                  </div>

                  {
                    dailyUsed
                      ? (
                          <div className="relative mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                            <span className="text-sm text-zinc-300">
                              {
                                data.daily.status === "validated"
                                  ? "Your daily run"
                                  : data.daily.status === "started"
                                    ? "Daily run in progress"
                                    : "Daily run not counted"
                              }
                            </span>

                            {
                              data.daily.score !== null
                                ? (
                                    <ArenaScore
                                      score={data.daily.score}
                                    />
                                  )
                                : (
                                    <span className="text-xs font-semibold text-zinc-500">
                                      Back at midnight
                                    </span>
                                  )
                            }
                          </div>
                        )
                      : (
                          <button
                            type="button"
                            onClick={() => start("daily")}
                            disabled={busy !== null}
                            className="primary-button relative mt-4 flex min-h-12 w-full items-center justify-center gap-2"
                          >
                            {
                              busy === "daily"
                                ? (
                                    <Loader2
                                      size={18}
                                      className="animate-spin"
                                      aria-hidden
                                    />
                                  )
                                : (
                                    <Swords
                                      size={18}
                                      aria-hidden
                                    />
                                  )
                            }
                            Enter today&apos;s arena
                          </button>
                        )
                  }
                </div>

                <div className="panel p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-300/30 bg-sky-400/10 text-sky-200">
                      <Play
                        size={22}
                        aria-hidden
                      />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="font-display text-lg font-bold text-amber-100">
                        Practice
                      </p>

                      <p className="mt-0.5 text-sm leading-5 text-zinc-400">
                        A fresh shop every run, as often as you like. Your best run
                        this week counts.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => start("practice")}
                    disabled={busy !== null}
                    className="relative mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--dc-radius-md)] border border-sky-300/40 bg-sky-400/10 font-bold text-sky-100 active:scale-[.99] disabled:opacity-60"
                  >
                    {
                      busy === "practice"
                        ? (
                            <Loader2
                              size={18}
                              className="animate-spin"
                              aria-hidden
                            />
                          )
                        : null
                    }
                    Start a practice run
                  </button>
                </div>
              </div>
            )
      }

      <Rules />

      <section className="panel mt-4 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Trophy
            size={18}
            className="text-amber-300"
            aria-hidden
          />

          <h2 className="font-display text-lg font-bold text-amber-100">
            Leaderboards
          </h2>
        </div>

        <ArenaLeaderboards
          boards={boards}
          userId={data.userId}
        />

        {
          data.rewards.length > 0
            ? (
                <p className="mt-3 text-xs leading-5 text-zinc-500">
                  Rewards:{" "}
                  {data.rewards
                    .map(
                      (rule) =>
                        `${rule.period === "day" ? "daily" : "weekly"} #${rule.place} +${rule.dp} DP${rule.voucher ? " + a pack voucher" : ""}`
                    )
                    .join(" · ")}
                  . Paid automatically after the day / week ends.
                </p>
              )
            : null
        }
      </section>
    </main>
  );
}

function Rules() {
  return (
    <details className="panel group mt-4 p-5">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2">
        <span className="font-display text-lg font-bold text-amber-100">
          How to play
        </span>

        <ChevronDown
          size={18}
          className="text-amber-300 transition group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>

      <div className="mt-3 grid gap-3 text-sm leading-6 text-zinc-300">
        <p>
          <strong className="text-amber-100">Each turn</strong> you get gold (3 on turn 1,
          +1 per turn, up to 10). Units cost 3, refreshing the shop costs 1, selling gives 1.
          Freeze keeps the shop for next turn. Upgrading the shop tier unlocks stronger
          monsters, and gets 1 cheaper every turn you wait.
        </p>

        <p>
          <strong className="text-amber-100">Board:</strong> up to {BOARD_MAX} units. When the
          timer runs out (or you press Fight) your board battles the wave on its own.
          Units attack left to right, each picking a random target (Guardians first).
        </p>

        <p>
          <strong className="text-amber-100">Pool:</strong> every run has one shared pool with
          limited copies of each monster. Three copies of the same monster merge into a
          golden one (double stats) and you discover a free unit from the next tier.
        </p>

        <p>
          <strong className="text-amber-100">Losing</strong> a wave costs health (wave tier +
          1 per enemy left, the Boss counts 2). At 0 health the run ends. Score = waves
          survived, then health left. Clear all {MAX_WAVES} Bosses for a perfect run.
        </p>

        <div>
          <p className="font-bold text-amber-100">
            Abilities
          </p>

          <ul className="mt-1 grid gap-1.5">
            {ABILITIES.map(
              (ability) => {
                const Icon =
                  ABILITY_ICON[ability];

                return (
                  <li
                    key={ability}
                    className="flex gap-2 text-xs leading-5"
                  >
                    <Icon
                      size={14}
                      className="mt-0.5 shrink-0 text-sky-200"
                      aria-hidden
                    />

                    <span>
                      <span className="sr-only">
                        {ABILITY_LABEL[ability]}:
                      </span>
                      {abilityText(
                        ability,
                        ABILITY_POWER[ability] ?? 1,
                        {
                          rallyBy: "tribe",
                          tribe: null,
                        }
                      ).replace("same-type", "same type (or attribute)")}
                    </span>
                  </li>
                );
              }
            )}
          </ul>
        </div>

        <div>
          <p className="font-bold text-amber-100">
            Synergies (3 / 5 different units)
          </p>

          <ul className="mt-1 grid gap-1 text-xs leading-5">
            {Object.entries(SYNERGY_TEXT).map(
              ([key, [three, five]]) => (
                <li key={key}>
                  <span className="font-bold text-amber-200">
                    {key}:
                  </span>{" "}
                  {three} <span className="text-zinc-500">5:</span> {five}
                </li>
              )
            )}
          </ul>
        </div>
      </div>
    </details>
  );
}

function GameOver({
  finished,
  boards,
  userId,
  busy,
  onRetrySubmit,
  onPractice,
  onBack,
  startingPractice,
}: {
  finished: Finished;
  boards: ArenaBoards;
  userId: string;
  busy: boolean;
  onRetrySubmit: () => void;
  onPractice: () => void;
  onBack: () => void;
  startingPractice: boolean;
}) {
  const state: RunState =
    finished.finish.state;

  const {
    survived,
    health,
    wins,
  } = describeScore(finished.finish.score);

  const lastWave =
    state.history[state.history.length - 1];

  const fellTo =
    lastWave
      ? ROUTE_BY_CODE.get(lastWave.route)?.name ?? null
      : null;

  const submit =
    finished.submit;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <div className="arena-frame panel relative overflow-hidden p-6 text-center">
        <div className="spell-glow -right-10 -top-10 h-40 w-40" />

        <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/10">
          {
            state.victory
              ? (
                  <Trophy
                    size={28}
                    className="text-amber-300"
                    aria-hidden
                  />
                )
              : (
                  <Skull
                    size={28}
                    className="text-red-300"
                    aria-hidden
                  />
                )
          }
        </div>

        <p className="relative mt-3 text-xs font-bold uppercase tracking-[.22em] text-amber-300">
          {finished.mode === "daily" ? "Daily Arena" : "Practice run"}
        </p>

        <h1 className="gold-text relative mt-1 text-4xl font-black">
          {state.victory ? "Arena cleared!" : `Wave ${survived}`}
        </h1>

        <p className="relative mt-2 text-sm text-zinc-300">
          {
            state.victory
              ? `All ${MAX_WAVES} Bosses defeated with ${health} health left.`
              : `You survived ${survived} ${survived === 1 ? "wave" : "waves"}${fellTo ? ` and fell to the ${fellTo} wave` : ""}.`
          }
        </p>

        <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat
            label="Survived"
            value={`${survived}/${MAX_WAVES}`}
          />

          <Stat
            label="Won"
            value={String(wins)}
          />

          <Stat
            label="Health"
            value={String(health)}
            icon={
              <Heart
                size={12}
                className="text-rose-400"
                aria-hidden
              />
            }
          />
        </div>

        <div
          className="relative mt-4 flex flex-wrap justify-center gap-1"
          aria-label="Wave results"
        >
          {state.history.map(
            (wave) => (
              <span
                key={wave.wave}
                title={`Wave ${wave.wave}: ${wave.result}`}
                className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-black ${
                  wave.result === "win"
                    ? "bg-amber-300/25 text-amber-100"
                    : wave.result === "loss"
                      ? "bg-red-500/25 text-red-200"
                      : "bg-white/10 text-zinc-300"
                }`}
              >
                {wave.wave}
              </span>
            )
          )}
        </div>

        <div
          className="relative mt-5 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm"
          role="status"
        >
          {
            busy || !submit
              ? (
                  <span className="inline-flex items-center gap-2 text-zinc-300">
                    <Loader2
                      size={16}
                      className="animate-spin"
                      aria-hidden
                    />
                    Checking your run on the server...
                  </span>
                )
              : submit.ok
                ? (
                    <span className="inline-flex items-center gap-2 text-emerald-200">
                      <ShieldCheck
                        size={16}
                        aria-hidden
                      />
                      Verified.{" "}
                      {
                        submit.place !== null
                          ? `You're #${submit.place} of ${submit.players} ${submit.mode === "daily" ? "today" : "this week"}.`
                          : "Saved."
                      }
                    </span>
                  )
                : (
                    <span className="text-red-200">
                      {submit.error}
                      {
                        submit.error.startsWith("Could not reach")
                          ? (
                              <button
                                type="button"
                                onClick={onRetrySubmit}
                                className="ml-2 min-h-11 rounded-lg border border-red-300/40 px-3 font-bold"
                              >
                                Retry
                              </button>
                            )
                          : null
                      }
                    </span>
                  )
          }
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onBack}
            className="min-h-12 rounded-[var(--dc-radius-md)] border border-white/15 bg-white/5 text-sm font-bold text-zinc-200"
          >
            Back
          </button>

          <button
            type="button"
            onClick={onPractice}
            disabled={startingPractice || busy}
            className="primary-button flex min-h-12 items-center justify-center gap-2 text-sm"
          >
            {
              startingPractice
                ? (
                    <Loader2
                      size={16}
                      className="animate-spin"
                      aria-hidden
                    />
                  )
                : null
            }
            Practice again
          </button>
        </div>
      </div>

      <section className="panel mt-4 p-5">
        <h2 className="mb-3 font-display text-lg font-bold text-amber-100">
          Leaderboards
        </h2>

        <ArenaLeaderboards
          boards={boards}
          userId={userId}
          initialTab={finished.mode === "daily" ? "day" : "week"}
        />
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2">
      <p className="flex items-center justify-center gap-1 font-display text-xl font-black tabular-nums text-amber-100">
        {icon}
        {value}
      </p>

      <p className="text-[10px] font-bold uppercase tracking-[.16em] text-zinc-500">
        {label}
      </p>
    </div>
  );
}
