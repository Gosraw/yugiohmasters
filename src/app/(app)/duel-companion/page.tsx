import Link from "next/link";

import {
  ArrowLeft,
  Swords,
} from "lucide-react";

import {
  DuelCompanion,
} from "@/components/duel-companion";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  getLeagueIdForUser,
} from "@/lib/league-stats";

import {
  getActiveSeasonCompetition,
} from "@/lib/competitions/season";

export const dynamic = "force-dynamic";

export default async function DuelCompanionPage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const leagueId =
    await getLeagueIdForUser(
      supabase,
      userId
    );

  // During a season, the result belongs on the This Round screen
  // (a practice duel is the exception, so it stays as a second
  // option).
  const season =
    leagueId
      ? await getActiveSeasonCompetition(
          supabase,
          leagueId
        )
      : null;

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-amber-400/[0.06] blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-lg px-4 py-6 sm:px-6">
        <Link
          href="/"
          className="inline-flex cursor-pointer items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-500 transition-colors hover:text-amber-200"
        >
          <ArrowLeft size={14} />
          Back Home
        </Link>

        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-amber-200">
          <Swords size={12} />
          Duel Companion
        </div>

        <h1 className="gold-text mt-4 text-3xl font-black">
          Live Duel Tools
        </h1>

        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Life Points, dice, coin flip and a duel timer for your physical
          match. Nothing here is saved - it&apos;s just a handy tool to have
          open on your phone during the duel. When you&apos;re done, submit
          the result as normal.
        </p>

        <div className="mt-6">
          <DuelCompanion />
        </div>

        {season ? (
          <>
            <Link
              href={`/competitions/${season.id}/round`}
              className="primary-button mt-6 flex cursor-pointer items-center justify-center gap-2"
            >
              <Swords size={16} />
              Tap the Winner: This Round
            </Link>

            <Link
              href="/matches/new"
              className="mt-3 block py-2 text-center text-xs font-bold text-zinc-500 transition-colors hover:text-zinc-300"
            >
              Was it a practice duel? Record it here
            </Link>
          </>
        ) : (
          <Link
            href="/matches/new"
            className="primary-button mt-6 flex cursor-pointer items-center justify-center gap-2"
          >
            <Swords size={16} />
            Submit Duel Result
          </Link>
        )}
      </div>
    </main>
  );
}
