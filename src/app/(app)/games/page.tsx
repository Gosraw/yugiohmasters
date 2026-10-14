import Link from "next/link";

import type {
  Metadata,
} from "next";

import {
  ChevronRight,
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
  type MiniGameEntry,
} from "@/lib/games/registry";

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

function dailyLine(
  game: MiniGameEntry,
  summary: MiniGameSummary
) {
  if (summary.daily.status === "open") {
    return `Today's ${game.dailyName} is waiting for you.`;
  }

  return summary.daily.score !== null
    ? `Today: ${game.formatScore(summary.daily.score)}`
    : `${game.dailyName} used for today.`;
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
        Pure skill, nothing to look up. A daily challenge for everyone and a
        weekly board you can grind. Winners earn Duel Points.
      </p>

      <div className="mt-6 grid gap-3">
        {MINI_GAMES.map(
          (game, index) => {
            const Icon =
              game.icon;

            const summary =
              summaries[index];

            return (
              <Link
                key={game.id}
                href={game.href}
                className="arena-frame panel group relative flex items-center gap-4 overflow-hidden p-5 transition-transform duration-150 active:scale-[.99] motion-reduce:transition-none"
              >
                <div className="spell-glow -right-10 -top-10 h-40 w-40" />

                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-300/10 text-amber-300 shadow-[0_0_20px_rgba(242,196,90,.2)]">
                  <Icon
                    size={26}
                  />
                </div>

                <div className="relative min-w-0 flex-1">
                  <p className="font-display text-lg font-bold text-amber-100">
                    {game.title}
                  </p>

                  <p className="mt-0.5 text-sm leading-5 text-zinc-400">
                    {game.tagline}
                  </p>

                  {
                    summary?.hasLeague
                      ? (
                          <p className="mt-2 text-xs font-semibold text-amber-200/90">
                            {dailyLine(game, summary)}
                          </p>
                        )
                      : null
                  }

                  {
                    summary?.leader
                      ? (
                          <p className="mt-0.5 text-xs text-zinc-500">
                            Leading today: {summary.leader.name} · {game.formatScore(summary.leader.score)}
                          </p>
                        )
                      : null
                  }
                </div>

                <ChevronRight
                  size={20}
                  className="relative shrink-0 text-amber-300/70"
                />
              </Link>
            );
          }
        )}
      </div>
    </main>
  );
}
