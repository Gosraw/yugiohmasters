import Link from "next/link";

import {
  ChevronRight,
} from "lucide-react";

import {
  GoalProgressBar,
} from "@/components/goal-progress-bar";

import {
  seasonPathStatus,
  tierRewardParts,
  type SeasonPathTier,
} from "@/lib/season-path";

// =========================================================
// SEASON PATH mini bar (Home -> /season)
// "Season Path · Tier 6 / 20   40 / 85 XP · next: Premium Pack"
// =========================================================

export function SeasonPathMini({
  xp,
  tiers,
}: {
  xp: number;
  tiers: SeasonPathTier[];
}) {
  if (tiers.length === 0) {
    return null;
  }

  const status =
    seasonPathStatus(
      xp,
      tiers
    );

  const nextReward =
    status.nextTier
      ? tierRewardParts(
          status.nextTier
        )[0] ?? null
      : null;

  return (
    <Link
      href="/season"
      className="group block rounded-2xl border border-[rgb(242_196_90/.28)] bg-[rgb(14_20_44/.7)] px-4 py-3 backdrop-blur-[10px] transition-colors hover:border-[rgb(242_196_90/.45)] active:scale-[0.99]"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[.14em] text-gold">
          Season Path · Tier {status.tier} / {status.maxTier}
        </span>

        <ChevronRight
          size={16}
          className="shrink-0 text-gold/70 transition-transform group-hover:translate-x-0.5"
        />
      </span>

      <span className="mt-2 block">
        <GoalProgressBar
          percent={status.percentToNext}
          label={
            status.complete
              ? "Season Path complete"
              : `Tier ${status.nextTier?.tier}: ${status.xpIntoTier} of ${status.xpForTier} XP`
          }
        />
      </span>

      <span className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-zinc-500">
        <span className="tabular-nums">
          {status.complete
            ? `${status.xp.toLocaleString("en-US")} XP · complete`
            : `${status.xpIntoTier} / ${status.xpForTier} XP`}
        </span>

        {nextReward ? (
          <span className="truncate">
            Next: {nextReward}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
