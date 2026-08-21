import Link from "next/link";

import {
  ArrowLeft,
  Coins,
  Crown,
  Flame,
  Minus,
  Swords,
} from "lucide-react";

import {
  notFound,
} from "next/navigation";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  computeHeadToHead,
  getCompletedLeagueMatches,
  getLeagueIdForUser,
  getLeagueProfiles,
  profileName,
} from "@/lib/league-stats";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function RivalryDetailPage({
  params,
}: {
  params: Promise<{ opponentId: string }>;
}) {
  const { opponentId } = await params;

  const { supabase, userId } = await requireUser();

  if (opponentId === userId) {
    notFound();
  }

  const leagueId = await getLeagueIdForUser(supabase, userId);

  if (!leagueId) {
    notFound();
  }

  const [matches, profiles] = await Promise.all([
    getCompletedLeagueMatches(supabase, leagueId),
    getLeagueProfiles(supabase, leagueId),
  ]);

  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const opponent = profileMap.get(opponentId);

  if (!opponent) {
    notFound();
  }

  const h2h = computeHeadToHead(matches, userId, opponentId);

  if (h2h.totalEncounters === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Link
          href="/rivalries"
          className="inline-flex cursor-pointer items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-500 hover:text-amber-200"
        >
          <ArrowLeft size={14} />
          Back to Rivalries
        </Link>

        <div className="panel mt-6 p-8 text-center">
          <p className="text-lg font-black text-zinc-200">
            No duels yet against {profileName(opponent)}
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            Send them a challenge to start this rivalry.
          </p>

          <Link
            href={`/matches/new?opponent=${opponentId}`}
            className="primary-button mt-5 inline-flex cursor-pointer items-center gap-2"
          >
            <Swords size={15} />
            Challenge {profileName(opponent)}
          </Link>
        </div>
      </main>
    );
  }

  const youLead = h2h.leaderId === userId;
  const theyLead = h2h.leaderId === opponentId;

  const youStreak = h2h.streak.holderId === userId;
  const theyStreak = h2h.streak.holderId === opponentId;

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-red-500/[0.07] blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <Link
          href="/rivalries"
          className="inline-flex cursor-pointer items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-500 transition-colors hover:text-amber-200"
        >
          <ArrowLeft size={14} />
          Back to Rivalries
        </Link>

        {/* =================================================
            HEADER / SCORE
        ================================================= */}

        <section className="panel relative mt-4 overflow-hidden p-6 sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-300/20 bg-red-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-red-200">
            <Swords size={12} />
            Rivalry
          </div>

          <h1 className="gold-text mt-4 text-2xl font-black sm:text-3xl">
            You vs. {profileName(opponent)}
          </h1>

          <div className="mt-6 grid grid-cols-3 items-center gap-3 text-center">
            <div>
              <p
                className={`text-4xl font-black ${
                  youLead ? "text-emerald-300" : "text-zinc-200"
                }`}
              >
                {h2h.winsA}
              </p>
              <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-zinc-600">
                Your Wins
              </p>
            </div>

            <div>
              <p className="text-2xl font-black text-zinc-600">
                {h2h.draws > 0 ? `${h2h.draws} draws` : "vs"}
              </p>
              <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-zinc-700">
                {h2h.totalEncounters} duels
              </p>
            </div>

            <div>
              <p
                className={`text-4xl font-black ${
                  theyLead ? "text-red-300" : "text-zinc-200"
                }`}
              >
                {h2h.winsB}
              </p>
              <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-zinc-600">
                Their Wins
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {youLead && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-200">
                <Crown size={12} />
                You&apos;re leading by {h2h.leadMargin}
              </span>
            )}
            {theyLead && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-300/30 bg-red-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-200">
                <Crown size={12} />
                {profileName(opponent)} leads by {h2h.leadMargin}
              </span>
            )}
            {!youLead && !theyLead && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-500/30 bg-zinc-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                <Minus size={12} />
                Dead even
              </span>
            )}

            {youStreak && h2h.streak.count >= 2 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-200">
                <Flame size={12} />
                You&apos;re on a {h2h.streak.count}-duel streak
              </span>
            )}
            {theyStreak && h2h.streak.count >= 2 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-200">
                <Flame size={12} />
                {profileName(opponent)} is on a {h2h.streak.count}-duel streak
              </span>
            )}

            {h2h.wageredEncounters > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-200">
                <Coins size={12} />
                {h2h.wageredEncounters} wagered
              </span>
            )}
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3 border-t border-white/[0.06] pt-6">
            <div className="text-center">
              <p className="text-sm font-black text-zinc-200">
                {h2h.leagueEncounters}
              </p>
              <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
                League Duels
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm font-black text-zinc-200">
                {h2h.practiceEncounters}
              </p>
              <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
                Practice Duels
              </p>
            </div>
          </div>

          <Link
            href={`/matches/new?opponent=${opponentId}`}
            className="primary-button mt-6 flex cursor-pointer items-center justify-center gap-2 transition-all hover:-translate-y-0.5 active:scale-[0.97]"
          >
            <Swords size={16} />
            Rematch {profileName(opponent)}
          </Link>
        </section>

        {/* =================================================
            RECENT ENCOUNTERS
        ================================================= */}

        <section className="panel mt-6 p-6">
          <h2 className="text-lg font-black text-zinc-200">
            Recent Encounters
          </h2>

          <div className="mt-4 space-y-2">
            {h2h.encounters.slice(0, 15).map((match) => {
              const won = match.winner_id === userId;
              const drew = match.result === "draw" || !match.winner_id;

              return (
                <div
                  key={match.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.05] bg-white/[0.015] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black ${
                        drew
                          ? "bg-zinc-500/15 text-zinc-400"
                          : won
                            ? "bg-emerald-400/15 text-emerald-300"
                            : "bg-red-400/15 text-red-300"
                      }`}
                    >
                      {drew ? "D" : won ? "W" : "L"}
                    </span>

                    <div>
                      <p className="text-sm font-bold text-zinc-200 capitalize">
                        {match.match_type} Duel
                      </p>
                      <p className="text-xs text-zinc-600">
                        {formatDate(match.completed_at ?? match.created_at)}
                      </p>
                    </div>
                  </div>

                  <Link
                    href={`/matches/${match.id}`}
                    className="cursor-pointer text-xs font-black uppercase tracking-wider text-zinc-600 hover:text-amber-300"
                  >
                    View
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
