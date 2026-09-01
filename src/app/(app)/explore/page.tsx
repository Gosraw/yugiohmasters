import Link from "next/link";

import {
  Activity,
  Award,
  Bell,
  BookOpen,
  Coins,
  Compass,
  Crown,
  Gamepad2,
  Layers3,
  Medal,
  Repeat2,
  Swords,
  Timer,
  Trophy,
} from "lucide-react";

import type {
  LucideIcon,
} from "lucide-react";

export const dynamic =
  "force-dynamic";

type ExploreItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  accent: string;
};

const items: ExploreItem[] = [
  {
    href: "/boss",
    label: "Boss Path",
    description: "Choose a signature monster, grind four evolution stages, and become the boss your league has to prepare for.",
    icon: Crown,
    accent: "amber",
  },
  {
    href: "/play",
    label: "Game Modes",
    description: "Competition, Best of 3, Tournament and the Life Points counter.",
    icon: Gamepad2,
    accent: "amber",
  },
  {
    href: "/wallet",
    label: "DP Wallet",
    description: "Every credit and debit to your Duel Points, in order.",
    icon: Coins,
    accent: "amber",
  },
  {
    href: "/league",
    label: "League",
    description: "Standings, rank and where you sit against everyone else.",
    icon: Trophy,
    accent: "amber",
  },
  {
    href: "/trades",
    label: "Trades",
    description: "Offer, review and complete card trades with the league.",
    icon: Repeat2,
    accent: "cyan",
  },
  {
    href: "/competitions",
    label: "Competitions",
    description: "League tournaments, standings and reward rules.",
    icon: Medal,
    accent: "violet",
  },
  {
    href: "/rivalries",
    label: "Rivalries",
    description: "Head-to-head records against every duelist you've faced.",
    icon: Swords,
    accent: "red",
  },
  {
    href: "/records",
    label: "Record Book",
    description: "League-wide bragging rights, computed from every duel.",
    icon: BookOpen,
    accent: "amber",
  },
  {
    href: "/activity",
    label: "Activity Feed",
    description: "Recent trades, duels and pulls across the league.",
    icon: Activity,
    accent: "violet",
  },
  {
    href: "/attention",
    label: "Attention Center",
    description: "Everything currently waiting on you, in one list.",
    icon: Bell,
    accent: "amber",
  },
  {
    href: "/achievements",
    label: "Achievements",
    description: "Badges and milestones you've unlocked so far.",
    icon: Award,
    accent: "cyan",
  },
  {
    href: "/perks",
    label: "Pay-To-Win",
    description: "Real-life chores and treats worth real Duel Points - claim one, get another duelist to approve it.",
    icon: Coins,
    accent: "emerald",
  },
  {
    href: "/duel-companion",
    label: "Duel Companion",
    description: "Life Points, dice, coin flip and a timer for physical duels.",
    icon: Timer,
    accent: "cyan",
  },
];

const accentStyles: Record<
  string,
  { icon: string; hover: string }
> = {
  red: {
    icon: "border-red-300/20 bg-red-300/10 text-red-300",
    hover: "hover:border-red-300/30 hover:text-red-200",
  },
  amber: {
    icon: "border-amber-300/20 bg-amber-300/10 text-amber-300",
    hover: "hover:border-amber-300/30 hover:text-amber-200",
  },
  violet: {
    icon: "border-violet-300/20 bg-violet-300/10 text-violet-300",
    hover: "hover:border-violet-300/30 hover:text-violet-200",
  },
  cyan: {
    icon: "border-cyan-300/20 bg-cyan-300/10 text-cyan-300",
    hover: "hover:border-cyan-300/30 hover:text-cyan-200",
  },
  emerald: {
    icon: "border-emerald-300/20 bg-emerald-300/10 text-emerald-300",
    hover: "hover:border-emerald-300/30 hover:text-emerald-200",
  },
};

export default function ExplorePage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-amber-400/[0.06] blur-[150px]" />

        <div className="absolute -right-40 top-40 h-[480px] w-[480px] rounded-full bg-violet-500/[0.06] blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-amber-200">
          <Compass size={12} />
          Explore
        </div>

        <h1 className="gold-text mt-4 text-3xl font-black sm:text-4xl">
          Everything Else in Duelist Circle
        </h1>

        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          The rest of your league&apos;s story - rivalries, records, activity and the tools that don&apos;t need their own spot in the main navigation.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const Icon =
              item.icon;

            const styles =
              accentStyles[
                item.accent
              ] ??
              accentStyles.amber;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`arena-frame panel group flex items-start gap-4 p-5 transition-all hover:-translate-y-0.5 ${styles.hover}`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${styles.icon}`}
                >
                  <Icon size={18} />
                </div>

                <div className="min-w-0">
                  <p className="font-black text-zinc-100">
                    {item.label}
                  </p>

                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    {item.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="duel-divider mx-auto mt-10 max-w-xs" />

        <div className="mt-8 flex justify-center">
          <Link
            href="/decks"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-black text-zinc-300 transition-all hover:-translate-y-0.5 hover:border-amber-300/25 hover:text-amber-200"
          >
            <Layers3 size={15} />
            Back to your Decks
          </Link>
        </div>
      </div>
    </main>
  );
}
