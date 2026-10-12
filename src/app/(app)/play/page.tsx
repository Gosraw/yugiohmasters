import Link from "next/link";

import {
  ChevronRight,
  Gamepad2,
  History,
  Swords,
  Timer,
  Trophy,
} from "lucide-react";

import type {
  LucideIcon,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  getLeagueIdForUser,
} from "@/lib/league-stats";

import {
  getActiveSeasonCompetition,
  logicalRoundFor,
  totalLogicalRounds,
} from "@/lib/competitions/season";

// =========================================================
// PLAY HUB (2.0)
//
// One of the five bottom-nav hubs (docs/V2_PLAN.md,
// "Simplicity & navigation"). Everything you do at the table
// starts here and routes to the real, already-working page:
//   - Season competition: the featured card goes straight to
//     the active season's "This Round" screen (tap the winners,
//     standings below). Without a running season it opens the
//     competitions page, where the admin starts one.
//   - Record a duel: a practice duel, tap the winner (optional
//     DP/card wager lives there too).
//   - Duel history: the matches list.
//   - Duel Companion: Life Points counter, dice, coin, timer.
//   - League standings: the league table.
//
// Mini games live on their own /games hub (Pyramid Climb, Auto
// Battler) with daily/weekly leaderboards.
// =========================================================

type PlayLink = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

const LINKS: PlayLink[] = [
  {
    href: "/matches/new",
    label: "Practice Duel",
    description: "Played a friendly duel? Tap who won. Add a DP or card wager if you dare.",
    icon: Swords,
  },
  {
    href: "/games",
    label: "Mini Games",
    description: "Pyramid Climb and more — daily and weekly leaderboards with rewards.",
    icon: Gamepad2,
  },
  {
    href: "/duel-companion",
    label: "Duel Companion",
    description: "Life Points counter, dice, coin flip and a duel timer for the table.",
    icon: Timer,
  },
  {
    href: "/matches",
    label: "Duel History",
    description: "Open challenges, results to confirm and every duel you've played.",
    icon: History,
  },
  {
    href: "/league",
    label: "League Standings",
    description: "Who's on top, and where you stand against everyone else.",
    icon: Trophy,
  },
];

async function getFeatured(): Promise<PlayLink> {
  const {
    supabase,
    userId,
  } = await requireUser();

  const leagueId =
    await getLeagueIdForUser(
      supabase,
      userId
    );

  const season =
    leagueId
      ? await getActiveSeasonCompetition(
          supabase,
          leagueId
        )
      : null;

  if (!season) {
    return {
      href: "/competitions",
      label: "Season Competition",
      description: "No season running yet. The admin starts it on the competitions page.",
      icon: Trophy,
    };
  }

  const {
    count,
  } = await supabase
    .from("competition_players")
    .select(
      "profile_id",
      {
        count: "exact",
        head: true,
      }
    )
    .eq(
      "competition_id",
      season.id
    );

  const playerCount =
    count ?? 0;

  const seasonRounds =
    totalLogicalRounds(
      season.total_rounds,
      playerCount
    );

  const round =
    season.current_round !== null
      ? logicalRoundFor(
          season.current_round,
          playerCount
        )
      : null;

  return {
    href: `/competitions/${season.id}/round`,
    label:
      round !== null
        ? `Round ${round}${seasonRounds > 0 ? ` of ${seasonRounds}` : ""}`
        : season.name,
    description:
      round !== null
        ? `${season.name}: tap the winners, see the standings.`
        : "Every duel has a result. See the final standings.",
    icon: Swords,
  };
}

export default async function PlayPage() {
  const FEATURED =
    await getFeatured();

  const FeaturedIcon =
    FEATURED.icon;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
        Play
      </p>

      <h1 className="gold-text mt-2 text-3xl font-black sm:text-4xl">
        Ready to duel?
      </h1>

      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
        Play at the table, then come back here to record the result.
      </p>

      {/* FEATURED: the season competition */}

      <Link
        href={
          FEATURED.href
        }
        className="arena-frame panel group relative mt-6 flex items-center gap-4 overflow-hidden p-5 transition-all hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <div className="spell-glow -right-10 -top-10 h-40 w-40" />

        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-300/10 text-amber-300 shadow-[0_0_20px_rgba(242,196,90,.2)]">
          <FeaturedIcon
            size={22}
          />
        </div>

        <div className="relative min-w-0 flex-1">
          <p className="font-display text-lg font-bold text-amber-100">
            {
              FEATURED.label
            }
          </p>

          <p className="mt-0.5 text-sm leading-5 text-zinc-400">
            {
              FEATURED.description
            }
          </p>
        </div>

        <ChevronRight
          size={20}
          className="relative shrink-0 text-amber-300/70 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        />
      </Link>

      {/* EVERYTHING ELSE */}

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {LINKS.map(
          (link) => {
            const Icon =
              link.icon;

            return (
              <Link
                key={
                  link.href
                }
                href={
                  link.href
                }
                className="panel group flex items-start gap-3.5 p-4 transition-all hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/[0.07] text-amber-300">
                  <Icon
                    size={18}
                  />
                </div>

                <div className="min-w-0">
                  <p className="font-black text-zinc-100">
                    {
                      link.label
                    }
                  </p>

                  <p className="mt-0.5 text-xs leading-5 text-zinc-400">
                    {
                      link.description
                    }
                  </p>
                </div>
              </Link>
            );
          }
        )}
      </div>
    </main>
  );
}
