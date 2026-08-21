import Link from "next/link";

import {
  BookOpen,
  Flame,
  Layers3,
  Repeat2,
  Swords,
  Trophy,
} from "lucide-react";

import type {
  ReactNode,
} from "react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  computeBiggestCollectionRecord,
  computeBiggestRivalryRecord,
  computeCurrentStreakRecord,
  computeLongestStreakRecord,
  computeMostCompetitionWinsRecord,
  computeMostDuelsRecord,
  computeWinRateRecord,
  getCompletedLeagueMatches,
  getLeagueIdForUser,
  getLeagueProfiles,
  profileName,
  type RecordEntry,
  MIN_DUELS_FOR_WIN_RATE,
} from "@/lib/league-stats";

export const dynamic = "force-dynamic";

function RecordCard({
  record,
  icon,
  holderName,
  opponentName,
}: {
  record: RecordEntry;
  icon: ReactNode;
  holderName: string;
  opponentName?: string;
}) {
  return (
    <div className="panel relative overflow-hidden p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-300/15 bg-amber-300/[0.05] text-amber-300">
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[.18em] text-zinc-600">
            {record.title}
          </p>

          {record.eligible ? (
            <>
              <p className="mt-1 truncate text-lg font-black text-zinc-100">
                {holderName}
                {opponentName ? ` vs. ${opponentName}` : ""}
              </p>
              <p className="mt-0.5 text-sm font-bold text-amber-300">
                {record.holderValue}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm font-bold text-zinc-600">
              Not enough data yet
            </p>
          )}

          <p className="mt-2 text-xs leading-5 text-zinc-600">
            {record.description}
          </p>
        </div>
      </div>
    </div>
  );
}

export default async function RecordBookPage() {
  const { supabase, userId } = await requireUser();

  const leagueId = await getLeagueIdForUser(supabase, userId);

  if (!leagueId) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="panel p-6 text-center text-zinc-500">
          No league found.
        </div>
      </main>
    );
  }

  const [matches, profiles] = await Promise.all([
    getCompletedLeagueMatches(supabase, leagueId),
    getLeagueProfiles(supabase, leagueId),
  ]);

  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

  // =======================================================
  // COLLECTION SIZES (one query, grouped client-side)
  // =======================================================

  const { data: instanceData, error: instanceError } = await supabase
    .from("card_instances")
    .select("current_owner_id")
    .eq("league_id", leagueId);

  if (instanceError) {
    throw new Error(instanceError.message);
  }

  const collectionCounts = new Map<string, number>();
  for (const row of (instanceData ?? []) as { current_owner_id: string }[]) {
    collectionCounts.set(
      row.current_owner_id,
      (collectionCounts.get(row.current_owner_id) ?? 0) + 1
    );
  }

  const collectionRecord = computeBiggestCollectionRecord(
    [...collectionCounts.entries()].map(([profileId, count]) => ({
      profileId,
      count,
    }))
  );

  // =======================================================
  // COMPETITION WINS
  //
  // competitions / competition_results behave as league-wide
  // readable today (proven by the existing Competitions pages
  // querying them without a participant filter), so this stays
  // read-only and safe.
  // =======================================================

  const competitionWinCounts = new Map<string, number>();

  const { data: completedCompetitions, error: competitionsError } =
    await supabase
      .from("competitions")
      .select("id")
      .eq("league_id", leagueId)
      .eq("status", "completed");

  if (!competitionsError && completedCompetitions && completedCompetitions.length > 0) {
    const competitionIds = completedCompetitions.map(
      (row: { id: string }) => row.id
    );

    const { data: resultsData, error: resultsError } = await supabase
      .from("competition_results")
      .select("profile_id,placement")
      .in("competition_id", competitionIds)
      .eq("placement", 1);

    if (!resultsError && resultsData) {
      for (const row of resultsData as {
        profile_id: string;
        placement: number;
      }[]) {
        competitionWinCounts.set(
          row.profile_id,
          (competitionWinCounts.get(row.profile_id) ?? 0) + 1
        );
      }
    }
  }

  const competitionRecord = computeMostCompetitionWinsRecord(
    [...competitionWinCounts.entries()].map(([profileId, wins]) => ({
      profileId,
      wins,
    }))
  );

  // =======================================================
  // TRADES (via the new trade_activity view - safe to skip if
  // the migration hasn't been applied to this database yet)
  // =======================================================

  let mostTradesEntry: { profileId: string; count: number } | null = null;

  try {
    const { data: tradeData, error: tradeError } = await supabase
      .from("trade_activity")
      .select("sender_id,receiver_id")
      .eq("league_id", leagueId);

    if (!tradeError && tradeData) {
      const counts = new Map<string, number>();
      for (const row of tradeData as {
        sender_id: string;
        receiver_id: string;
      }[]) {
        counts.set(row.sender_id, (counts.get(row.sender_id) ?? 0) + 1);
        counts.set(row.receiver_id, (counts.get(row.receiver_id) ?? 0) + 1);
      }
      for (const [profileId, count] of counts) {
        if (!mostTradesEntry || count > mostTradesEntry.count) {
          mostTradesEntry = { profileId, count };
        }
      }
    }
  } catch {
    // trade_activity view not available yet - skip this record
  }

  // =======================================================
  // MATCH-BASED RECORDS
  // =======================================================

  const winRateRecord = computeWinRateRecord(matches, profiles);
  const mostDuelsRecord = computeMostDuelsRecord(matches, profiles);
  const longestStreakRecord = computeLongestStreakRecord(matches, profiles);
  const currentStreakRecord = computeCurrentStreakRecord(matches, profiles);
  const rivalryRecord = computeBiggestRivalryRecord(matches, profiles);

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-amber-400/[0.06] blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-amber-200">
          <BookOpen size={12} />
          League Record Book
        </div>

        <h1 className="gold-text mt-4 text-3xl font-black sm:text-4xl">
          The Hall of Records
        </h1>

        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          League-wide bragging rights, computed automatically from every
          duel, trade and competition. Win-rate records need at least{" "}
          {MIN_DUELS_FOR_WIN_RATE} league duels so a lucky first game can not
          steal the crown.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <RecordCard
            record={winRateRecord}
            icon={<Trophy size={17} />}
            holderName={profileName(profileMap.get(winRateRecord.holderId ?? ""))}
          />

          <RecordCard
            record={longestStreakRecord}
            icon={<Flame size={17} />}
            holderName={profileName(
              profileMap.get(longestStreakRecord.holderId ?? "")
            )}
          />

          <RecordCard
            record={currentStreakRecord}
            icon={<Flame size={17} />}
            holderName={profileName(
              profileMap.get(currentStreakRecord.holderId ?? "")
            )}
          />

          <RecordCard
            record={mostDuelsRecord}
            icon={<Swords size={17} />}
            holderName={profileName(profileMap.get(mostDuelsRecord.holderId ?? ""))}
          />

          <RecordCard
            record={rivalryRecord}
            icon={<Swords size={17} />}
            holderName={profileName(profileMap.get(rivalryRecord.holderId ?? ""))}
            opponentName={profileName(
              profileMap.get(rivalryRecord.opponentId ?? "")
            )}
          />

          <RecordCard
            record={collectionRecord}
            icon={<Layers3 size={17} />}
            holderName={profileName(
              profileMap.get(collectionRecord.holderId ?? "")
            )}
          />

          <RecordCard
            record={competitionRecord}
            icon={<Trophy size={17} />}
            holderName={profileName(
              profileMap.get(competitionRecord.holderId ?? "")
            )}
          />

          {mostTradesEntry && (
            <RecordCard
              record={{
                id: "most-trades",
                title: "Most Active Trader",
                description: "Accepted trades completed.",
                holderId: mostTradesEntry.profileId,
                holderValue: `${mostTradesEntry.count} trades`,
                eligible: true,
              }}
              icon={<Repeat2 size={17} />}
              holderName={profileName(
                profileMap.get(mostTradesEntry.profileId)
              )}
            />
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/rivalries"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-black text-zinc-300 transition-all hover:-translate-y-0.5 hover:border-amber-300/25 hover:text-amber-200"
          >
            <Swords size={15} />
            View Rivalries
          </Link>
        </div>
      </div>
    </main>
  );
}
