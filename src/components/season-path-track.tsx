import {
  Check,
  Crown,
  Gift,
  Lock,
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
// SEASON PATH TRACK (/season)
//
// All tiers top to bottom: claimed ones glow gold with a check,
// the tier you are working on shows its own progress bar, later
// tiers are dimmed with a lock. Rewards are granted automatically
// by the database when a tier is reached - there is nothing to
// tap; "Claimed" means it is already in your wallet.
// =========================================================

export function SeasonPathTrack({
  xp,
  tiers,
}: {
  xp: number;
  tiers: SeasonPathTier[];
}) {
  const status =
    seasonPathStatus(
      xp,
      tiers
    );

  const ordered = [
    ...tiers,
  ].sort(
    (a, b) =>
      a.tier - b.tier
  );

  return (
    <ol className="relative space-y-2">
      {ordered.map(
        (tier) => {
          const reached =
            tier.granted ||
            tier.tier <= status.tier;

          const current =
            status.nextTier?.tier ===
            tier.tier;

          const special =
            Boolean(
              tier.label ||
                tier.title_reward
            );

          const parts =
            tierRewardParts(
              tier
            );

          return (
            <li
              key={tier.tier}
              aria-current={
                current
                  ? "step"
                  : undefined
              }
              className={`relative flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
                current
                  ? "border-[rgb(255_216_110/.6)] bg-[rgb(242_196_90/.08)] shadow-[0_0_24px_rgb(242_196_90/.18)]"
                  : reached
                    ? "border-[rgb(242_196_90/.28)] bg-[rgb(14_20_44/.7)]"
                    : "border-white/[0.06] bg-[rgb(10_14_32/.55)]"
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-display text-sm font-bold tabular-nums ${
                  reached
                    ? "border-[rgb(255_216_110/.7)] bg-gradient-to-b from-[#ffd86e] to-[#c98e2c] text-[#1d1405]"
                    : current
                      ? "border-[rgb(242_196_90/.6)] text-gold"
                      : "border-white/10 text-zinc-500"
                }`}
              >
                {tier.tier}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[.12em] text-zinc-500">
                  {special ? (
                    tier.title_reward ? (
                      <Crown
                        size={12}
                        className="text-gold"
                      />
                    ) : (
                      <Gift
                        size={12}
                        className="text-gold"
                      />
                    )
                  ) : null}

                  <span className="truncate">
                    {tier.label ?? `Tier ${tier.tier}`} · {tier.cumulative_xp.toLocaleString("en-US")} XP
                  </span>
                </p>

                <p
                  className={`mt-0.5 text-[14px] font-semibold ${
                    reached || current
                      ? "text-zinc-50"
                      : "text-zinc-400"
                  }`}
                >
                  {parts.join(" + ") || "—"}
                </p>

                {current ? (
                  <div className="mt-2 flex items-center gap-2">
                    <GoalProgressBar
                      percent={status.percentToNext}
                      label={`Tier ${tier.tier}: ${status.xpIntoTier.toLocaleString("en-US")} of ${status.xpForTier.toLocaleString("en-US")} XP`}
                    />

                    <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">
                      {status.xpIntoTier}/{status.xpForTier}
                    </span>
                  </div>
                ) : null}
              </div>

              <span className="shrink-0 text-[11px] font-semibold">
                {tier.granted ? (
                  <span className="inline-flex items-center gap-1 text-gold-bright">
                    <Check
                      size={14}
                    />
                    Claimed
                  </span>
                ) : current ? null : (
                  <Lock
                    size={14}
                    className="text-zinc-600"
                    aria-label="Locked"
                  />
                )}
              </span>
            </li>
          );
        }
      )}
    </ol>
  );
}
