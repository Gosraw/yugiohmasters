import Link from "next/link";

import type {
  Metadata,
} from "next";

import {
  ChevronRight,
  Mountain,
  Swords,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  loadClimberPageData,
} from "@/lib/games/climber-data";

// =========================================================
// MINI GAMES HUB (2.0)
//
// docs/V2_PLAN.md, "Mini games (under Play)". Skill games with a
// daily challenge (same level for everyone, 1 attempt) and a
// weekly board (unlimited practice, best score counts). Rewards
// only go to the leaderboard winners.
// =========================================================

export const metadata: Metadata = {
  title: "Mini games",
};

export default async function GamesPage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const climber =
    await loadClimberPageData(
      supabase,
      userId
    );

  const leader =
    climber.dayBoard[0] ?? null;

  const dailyLine =
    climber.daily.status === "open"
      ? "Today's Daily Climb is waiting for you."
      : climber.daily.score !== null
        ? `Today: ${climber.daily.score.toLocaleString("en-US")} m`
        : "Daily Climb used for today.";

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

      <Link
        href="/games/climber"
        className="arena-frame panel group relative mt-6 flex items-center gap-4 overflow-hidden p-5 transition-transform duration-150 active:scale-[.99] motion-reduce:transition-none"
      >
        <div className="spell-glow -right-10 -top-10 h-40 w-40" />

        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-300/10 text-amber-300 shadow-[0_0_20px_rgba(242,196,90,.2)]">
          <Mountain
            size={26}
          />
        </div>

        <div className="relative min-w-0 flex-1">
          <p className="font-display text-lg font-bold text-amber-100">
            Pyramid Climb
          </p>

          <p className="mt-0.5 text-sm leading-5 text-zinc-400">
            Bounce your Boss up the Millennium pyramid.
          </p>

          <p className="mt-2 text-xs font-semibold text-amber-200/90">
            {dailyLine}
          </p>

          {
            leader
              ? (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Leading today: {leader.name} · {leader.score.toLocaleString("en-US")} m
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

      <Link
        href="/games/autobattler"
        className="panel group relative mt-3 flex items-center gap-4 overflow-hidden p-5 transition-transform duration-150 active:scale-[.99] motion-reduce:transition-none"
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-300/10 text-amber-300">
          <Swords
            size={24}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold text-amber-100">
            Shadow Arena
          </p>

          <p className="mt-0.5 text-sm leading-5 text-zinc-400">
            Auto battler: build a team from a shared shop and take on 20 Boss waves.
          </p>
        </div>

        <ChevronRight
          size={20}
          className="shrink-0 text-amber-300/70"
        />
      </Link>
    </main>
  );
}
