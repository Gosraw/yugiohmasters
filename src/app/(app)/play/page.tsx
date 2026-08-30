import Link from "next/link";

import {
  Gamepad2,
  Medal,
  Swords,
  Timer,
  Trophy,
} from "lucide-react";

import type {
  LucideIcon,
} from "lucide-react";

// =========================================================
// GAME MODES HUB
//
// Four ways to play, each routed to the real, already-working
// destination for that mode rather than a parallel implementation:
//   - Competition / Tournament: both live inside the same
//     competitions system (competitions.competition_type), and the
//     competitions list already sections them separately - no need
//     for a second "tournament" page.
//   - Best of 3: a standalone friendly challenge is already modeled
//     as a practice match (matches.match_type = 'practice') on the
//     existing match-creation flow - no separate flow needed.
//     Optional DP/card stakes are NOT implemented here: while
//     trades.ts proves a safe escrow/atomic-settlement pattern
//     exists for cards+DP, match_dp_escrows/match_wager_cards are a
//     SEPARATE, simpler mechanism already built for exactly this
//     (see matches/new/page.tsx's wager UI) - stakes already work
//     through that existing flow, so nothing new was needed here.
//   - Life Points: the existing Duel Companion.
// =========================================================

type GameMode = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  accent: string;
};

const MODES: GameMode[] = [
  {
    href: "/competitions",
    label: "Competition",
    description: "The persistent league season - rounds, standings and championship rewards.",
    icon: Trophy,
    accent: "amber",
  },
  {
    href: "/matches/new",
    label: "Best of 3",
    description: "A standalone friendly challenge. Free to play, or stake DP/cards on the result.",
    icon: Swords,
    accent: "cyan",
  },
  {
    href: "/competitions",
    label: "Tournament",
    description: "A standalone bracket with its own prize, separate from the season standings.",
    icon: Medal,
    accent: "violet",
  },
  {
    href: "/duel-companion",
    label: "Life Points",
    description: "The table-side counter - Life Points, dice, coin flip and a duel timer.",
    icon: Timer,
    accent: "red",
  },
];

const ACCENT_STYLES: Record<
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
};

export default function PlayPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-amber-200">
        <Gamepad2 size={12} />
        Game Modes
      </div>

      <h1 className="gold-text mt-3 text-3xl font-black sm:text-4xl">
        How do you want to play?
      </h1>

      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
        Every mode records a real physical duel - pick one, play it at the
        table, then come back and enter the result.
      </p>

      <div className="mt-6 grid gap-2.5">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          const styles = ACCENT_STYLES[mode.accent] ?? ACCENT_STYLES.amber;

          return (
            <Link
              key={mode.label}
              href={mode.href}
              className={`panel group flex items-center gap-3.5 p-3.5 transition-all hover:-translate-y-0.5 ${styles.hover}`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${styles.icon}`}
              >
                <Icon size={18} />
              </div>

              <div className="min-w-0">
                <p className="font-black text-zinc-100">{mode.label}</p>
                <p className="mt-0.5 text-xs leading-5 text-zinc-500">
                  {mode.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
