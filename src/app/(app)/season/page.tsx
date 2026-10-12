import Link from "next/link";

import {
  ArrowLeft,
  Crown,
  Sparkles,
} from "lucide-react";

import {
  GoalProgressBar,
} from "@/components/goal-progress-bar";

import {
  HomeCard,
} from "@/components/home-card";

import {
  SeasonPathTrack,
} from "@/components/season-path-track";

import {
  SeasonWeeklyGoals,
} from "@/components/season-weekly-goals";

import {
  seasonPathStatus,
  tierRewardParts,
} from "@/lib/season-path";

import {
  seasonWeekLabel,
} from "@/lib/weekly-goals";

import {
  getSeasonOverview,
} from "@/app/actions/season";

export const dynamic =
  "force-dynamic";

// =========================================================
// /season (2.0): the full Season Path + this week's goals.
//
// Everything is computed and paid by the database
// (get_my_season_overview, migrations 202610120800-0820): XP from
// real events, tier rewards granted automatically when reached.
// The numbers are a PROPOSAL (docs/season-sim-report.md) and live
// in config tables, so this page never hardcodes an amount.
// =========================================================

export default async function SeasonPage() {
  const overview =
    await getSeasonOverview();

  const status =
    seasonPathStatus(
      overview.path.xp,
      overview.path.tiers
    );

  const goalXp =
    overview.path.xpSources.find(
      (source) =>
        source.source ===
        "weekly_goal_completed"
    )?.xp ?? 0;

  const nextReward =
    status.nextTier
      ? tierRewardParts(
          status.nextTier
        ).join(" + ")
      : null;

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <Link
        href="/"
        className="-ml-2 inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-gold/80 transition-colors hover:text-gold-bright"
      >
        <ArrowLeft
          size={16}
        />
        Home
      </Link>

      {/* HEADER */}

      <header className="relative mt-3 overflow-hidden rounded-2xl border border-[rgb(242_196_90/.3)] px-4 pb-4 pt-16 shadow-[0_0_30px_rgb(242_196_90/.1)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[url('/v2/season/season2-banner.jpg')] bg-cover bg-[70%_center]"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-[rgb(5_8_26/.65)] to-[rgb(5_8_26/.95)]"
        />

        <p className="relative text-xs uppercase tracking-[.12em] text-zinc-300/80">
          {seasonWeekLabel(
            overview.season
          )}
        </p>

        <h1 className="relative mt-0.5 text-[26px] font-bold leading-tight text-[#f6e3b0]">
          Season Path
        </h1>

        <p className="relative mt-1 text-[13px] leading-5 text-zinc-300">
          One free reward track for the whole season. Earn XP by playing,
          and every tier you reach pays out automatically.
        </p>
      </header>

      {overview.path.tiers.length === 0 ? (
        <HomeCard
          title="Season Path"
          className="mt-5"
        >
          <p className="text-sm text-zinc-500">
            The Season Path opens when the season starts.
          </p>
        </HomeCard>
      ) : (
        <>
          {/* SUMMARY */}

          <section className="mt-5 rounded-2xl border border-[rgb(242_196_90/.35)] bg-[rgb(14_20_44/.75)] p-4 shadow-[0_0_30px_rgb(242_196_90/.12)] backdrop-blur-[10px]">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[.14em] text-gold">
                  Tier
                </p>

                <p className="font-display text-4xl font-bold leading-none text-zinc-50">
                  {status.tier}
                  <span className="text-lg text-zinc-500">
                    {" "}/ {status.maxTier}
                  </span>
                </p>
              </div>

              <p className="text-right text-[13px] tabular-nums text-zinc-400">
                <span className="block text-lg font-bold text-gold">
                  {status.xp.toLocaleString("en-US")} XP
                </span>
                {status.complete
                  ? "Path complete"
                  : `${status.xpForTier - status.xpIntoTier} XP to tier ${status.nextTier?.tier}`}
              </p>
            </div>

            <div className="mt-3">
              <GoalProgressBar
                size="md"
                percent={status.percentTotal}
                label={`Season Path: ${status.xp} XP`}
              />
            </div>

            {nextReward ? (
              <p className="mt-2.5 flex items-center gap-1.5 text-[12px] text-zinc-400">
                <Sparkles
                  size={13}
                  className="shrink-0 text-gold"
                />
                Next reward: {nextReward}
              </p>
            ) : null}

            {overview.titles.length > 0 ? (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-gold">
                <Crown
                  size={13}
                  className="shrink-0"
                />
                Title earned: {overview.titles.join(", ")}
              </p>
            ) : null}
          </section>
        </>
      )}

      {/* WEEKLY GOALS */}

      <section
        id="weekly-goals"
        className="mt-6"
      >
        <h2 className="text-lg font-bold text-[#f6e3b0]">
          This week&apos;s goals
        </h2>

        <div className="mt-2">
          <SeasonWeeklyGoals
            weekly={overview.weekly}
            goalXp={goalXp}
          />
        </div>
      </section>

      {/* HOW TO EARN XP */}

      {overview.path.xpSources.length > 0 ? (
        <HomeCard
          title="How to earn XP"
          className="mt-6"
        >
          <ul className="divide-y divide-white/[0.06] text-[13px]">
            {overview.path.xpSources.map(
              (source) => (
                <li
                  key={source.source}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="text-zinc-200">
                    {source.label}
                  </span>

                  <span className="font-semibold tabular-nums text-gold">
                    +{source.xp} XP
                  </span>
                </li>
              )
            )}
          </ul>
        </HomeCard>
      ) : null}

      {/* TRACK */}

      {overview.path.tiers.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-lg font-bold text-[#f6e3b0]">
            Rewards
          </h2>

          <p className="mt-0.5 text-[12px] text-zinc-500">
            Claimed rewards are already in your wallet.
          </p>

          <div className="mt-3">
            <SeasonPathTrack
              xp={overview.path.xp}
              tiers={overview.path.tiers}
            />
          </div>
        </section>
      ) : null}

      {/* RECENT XP */}

      {overview.path.recentXp.length > 0 ? (
        <HomeCard
          title="Recent XP"
          className="mt-6"
        >
          <ul className="divide-y divide-white/[0.06] text-[13px]">
            {overview.path.recentXp.map(
              (event, index) => (
                <li
                  key={`${event.createdAt}-${event.source}-${index}`}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0 truncate text-zinc-300">
                    {event.description}
                  </span>

                  <span className="shrink-0 font-semibold tabular-nums text-gold">
                    +{event.xp} XP
                  </span>
                </li>
              )
            )}
          </ul>
        </HomeCard>
      ) : null}
    </main>
  );
}
