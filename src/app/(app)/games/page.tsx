import Link from "next/link";

import type {
  Metadata,
} from "next";

import {
  ChevronRight,
  Crown,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  getLeagueIdForUser,
} from "@/lib/league-stats";

import {
  loadMiniGameSummary,
  type MiniGameSummary,
} from "@/lib/games/mini-game-data";

import {
  MINI_GAMES,
  MINI_GAME_KINDS,
  type MiniGameEntry,
} from "@/lib/games/registry";

import {
  MiniGameArt,
} from "@/components/games/mini-game-art";

// =========================================================
// MINI GAMES HUB (2.0)
//
// docs/V2_PLAN.md, "Mini games (under Play)". Skill games with a
// daily challenge (same level for everyone, 1 attempt) and a
// weekly board (unlimited practice, best score counts). Rewards
// only go to the leaderboard winners.
//
// The list comes from src/lib/games/registry.ts: a new game adds
// one entry there and shows up here.
// =========================================================

export const metadata: Metadata = {
  title: "Mini games",
};

const CHIP =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 font-bold";

function StatusChip({
  game,
  summary,
}: {
  game: MiniGameEntry;
  summary: MiniGameSummary | null;
}) {
  if (!summary) {
    return (
      <span className={`${CHIP} border-white/10 bg-white/[.03] text-zinc-300`}>
        {game.dailyName} + weekly board
      </span>
    );
  }

  if (!summary.hasLeague) return null;

  if (summary.daily.status === "open") {
    return (
      <span className={`${CHIP} border-amber-300/45 bg-amber-300/10 text-amber-200`}>
        <span className="h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_6px_rgba(242,196,90,.9)]" />
        {game.dailyName} ready
      </span>
    );
  }

  if (summary.daily.status === "started") {
    return (
      <span className={`${CHIP} border-amber-300/30 bg-amber-300/[.06] text-amber-200/90`}>
        {game.dailyName} in progress
      </span>
    );
  }

  return (
    <span className={`${CHIP} border-emerald-300/30 bg-emerald-300/10 text-emerald-200`}>
      {
        summary.daily.score !== null
          ? `Today ${game.formatScore(summary.daily.score)}`
          : `${game.dailyName} played`
      }
    </span>
  );
}

export default async function GamesPage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const leagueId =
    await getLeagueIdForUser(
      supabase,
      userId
    );

  // Loading the hub also settles finished days / weeks (pays the
  // leaderboard winners once), for every game that shows a status.
  const summaries =
    await Promise.all(
      MINI_GAMES.map(
        (game) =>
          game.showDailyStatus
            ? loadMiniGameSummary(
                supabase,
                userId,
                game.id,
                leagueId
              )
            : Promise.resolve(null)
      )
    );

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
        Play
      </p>

      <h1 className="gold-text mt-2 text-3xl font-black sm:text-4xl">
        Mini games
      </h1>

      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
        Pure skill: quick reflex games for one thumb and strategy games
        for a thinking break. Every game has a Daily (same level for
        everyone, one attempt) and a weekly practice board. Winners earn
        Duel Points.
      </p>

      {MINI_GAME_KINDS.map(
        (section) => (
          <section
            key={section.kind}
            aria-labelledby={`games-${section.kind}`}
            className="mt-7"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2
                id={`games-${section.kind}`}
                className="shrink-0 whitespace-nowrap font-display text-sm font-bold uppercase tracking-[.16em] text-amber-200"
              >
                {section.title}
              </h2>

              <p className="min-w-0 truncate text-xs text-zinc-500">
                {section.blurb}
              </p>
            </div>

            <div className="mt-3 grid gap-3">
              {MINI_GAMES.map(
                (game, index) => ({
                  game,
                  summary: summaries[index],
                })
              ).filter(
                (entry) => entry.game.kind === section.kind
              ).map(
                ({
                  game,
                  summary,
                }) => {
                  return (
                    <Link
                      key={game.id}
                      href={game.href}
                      className="arena-frame panel group relative flex items-center gap-4 overflow-hidden p-3.5 pr-4 transition-transform duration-150 active:scale-[.99] motion-reduce:transition-none sm:p-4"
                    >
                      <div className="spell-glow -right-12 -top-12 h-36 w-36 opacity-70" />

                      <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl border border-amber-300/35 shadow-[0_0_24px_rgba(242,196,90,.16)] transition-transform duration-200 ease-out group-hover:scale-[1.04] motion-reduce:transition-none">
                        <MiniGameArt
                          game={game.id}
                          className="block h-full w-full"
                        />
                      </div>

                      <div className="relative min-w-0 flex-1">
                        <p className="font-display text-lg font-bold leading-6 text-amber-100">
                          {game.title}
                        </p>

                        <p className="line-clamp-2 text-sm leading-5 text-zinc-400">
                          {game.tagline}
                        </p>

                        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                          <StatusChip
                            game={game}
                            summary={summary}
                          />

                          {
                            summary?.leader
                              ? (
                                  <span className="inline-flex min-w-0 items-center gap-1 text-zinc-400">
                                    <Crown
                                      size={12}
                                      aria-label="Leading today"
                                      className="shrink-0 text-amber-300"
                                    />
                                    <span className="max-w-[8.5rem] truncate font-semibold text-zinc-200">
                                      {summary.leader.name}
                                    </span>
                                    <span className="shrink-0 tabular-nums">
                                      {game.formatScore(summary.leader.score)}
                                    </span>
                                  </span>
                                )
                              : summary?.hasLeague
                                ? (
                                    <span className="text-zinc-500">
                                      No leader yet today
                                    </span>
                                  )
                                : null
                          }
                        </div>
                      </div>

                      <ChevronRight
                        size={20}
                        className="relative shrink-0 text-amber-300/70 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
                      />
                    </Link>
                  );
                }
              )}
            </div>
          </section>
        )
      )}
    </main>
  );
}
