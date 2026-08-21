import Link from "next/link";

import {
  ArrowRight,
  Flame,
  Minus,
  Swords,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  computeRivalSummaries,
  currentStreak,
  getCompletedLeagueMatches,
  getLeagueIdForUser,
  getLeagueProfiles,
  involvesPlayer,
  profileName,
} from "@/lib/league-stats";

import {
  EmptyState,
} from "@/components/empty-state";

export const dynamic = "force-dynamic";

export default async function RivalriesPage() {
  const { supabase, userId } = await requireUser();

  const leagueId = await getLeagueIdForUser(supabase, userId);

  if (!leagueId) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState
          icon={<Users size={22} />}
          title="No league yet"
          description="Join a league to start building rivalries."
        />
      </main>
    );
  }

  const [matches, profiles] = await Promise.all([
    getCompletedLeagueMatches(supabase, leagueId),
    getLeagueProfiles(supabase, leagueId),
  ]);

  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

  const rivals = computeRivalSummaries(matches, userId);

  const ownMatches = matches.filter((match) => involvesPlayer(match, userId));

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-red-500/[0.06] blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-red-300/20 bg-red-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-red-200">
          <Swords size={12} />
          Rivalries
        </div>

        <h1 className="gold-text mt-4 text-3xl font-black sm:text-4xl">
          Your Rivals
        </h1>

        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          Every league and practice duel you have ever played against every
          opponent, tallied automatically. No manual tracking - just the
          results you already submitted.
        </p>

        {rivals.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={<Swords size={22} />}
              title="No rivalries yet"
              description="Play your first duel to start a rivalry."
              action={
                <Link
                  href="/matches/new"
                  className="primary-button inline-flex cursor-pointer items-center gap-2"
                >
                  <Swords size={15} />
                  Challenge a Player
                </Link>
              }
            />
          </div>
        ) : (
          <div className="mt-8 grid gap-3">
            {rivals.map((rival) => {
              const opponent = profileMap.get(rival.opponentId);
              const opponentMatches = ownMatches.filter(
                (match) =>
                  match.player_one_id === rival.opponentId ||
                  match.player_two_id === rival.opponentId
              );
              const streak = currentStreak(opponentMatches, userId);

              const leading =
                rival.wins > rival.losses
                  ? "up"
                  : rival.losses > rival.wins
                    ? "down"
                    : "even";

              return (
                <Link
                  key={rival.opponentId}
                  href={`/rivalries/${rival.opponentId}`}
                  className="panel group relative flex cursor-pointer items-center justify-between gap-4 overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:border-amber-300/25"
                >
                  <div className="min-w-0">
                    <p className="truncate text-lg font-black text-zinc-100 group-hover:text-amber-200">
                      {profileName(opponent)}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                      <span>
                        {rival.wins}-{rival.losses}
                        {rival.draws > 0 ? `-${rival.draws}` : ""}
                      </span>
                      <span>·</span>
                      <span>{rival.total} encounters</span>
                      {streak.type === "W" && streak.count >= 2 && (
                        <span className="inline-flex items-center gap-1 font-black text-amber-300">
                          <Flame size={12} />
                          {streak.count} win streak
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                        leading === "up"
                          ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
                          : leading === "down"
                            ? "border-red-300/30 bg-red-300/10 text-red-200"
                            : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400"
                      }`}
                    >
                      {leading === "up" && <TrendingUp size={11} />}
                      {leading === "down" && <TrendingDown size={11} />}
                      {leading === "even" && <Minus size={11} />}
                      {leading === "up"
                        ? "You lead"
                        : leading === "down"
                          ? "They lead"
                          : "Even"}
                    </span>

                    <ArrowRight
                      size={16}
                      className="text-zinc-600 transition-transform group-hover:translate-x-1 group-hover:text-amber-300"
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
