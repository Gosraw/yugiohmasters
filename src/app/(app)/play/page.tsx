import Link from "next/link";

import {
  ChevronRight,
  History,
  Swords,
  Timer,
  Trophy,
} from "lucide-react";

import type {
  LucideIcon,
} from "lucide-react";

// =========================================================
// PLAY HUB (2.0)
//
// One of the five bottom-nav hubs (docs/V2_PLAN.md,
// "Simplicity & navigation"). Everything you do at the table
// starts here and routes to the real, already-working page:
//   - Season competition: the competitions system (rounds,
//     standings, championship rewards).
//   - New duel: a practice match on the existing match
//     creation flow (optional DP/card wager lives there).
//   - Duel history: the matches list.
//   - Duel Companion: Life Points counter, dice, coin, timer.
//   - League standings: the league table.
//
// TODO(2.0 mini games): add the Climber and Auto battler
// entries here once they exist (plan steps 10-11). Don't add
// a "coming soon" placeholder card in the meantime.
// =========================================================

type PlayLink = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

const FEATURED: PlayLink = {
  href: "/competitions",
  label: "Season Competition",
  description: "This round's duels, the standings and the championship race.",
  icon: Trophy,
};

const LINKS: PlayLink[] = [
  {
    href: "/matches/new",
    label: "New Duel",
    description: "Challenge a friend to a practice duel. Add a DP or card wager if you dare.",
    icon: Swords,
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

export default function PlayPage() {
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
