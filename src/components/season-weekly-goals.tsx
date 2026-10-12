import {
  Check,
  Gift,
  Package,
  Repeat2,
  Swords,
} from "lucide-react";

import type {
  LucideIcon,
} from "lucide-react";

import {
  GoalProgressBar,
} from "@/components/goal-progress-bar";

import {
  voucherLabel,
} from "@/lib/match-settlement-summary";

import {
  goalPercent,
  resetsInLabel,
  weeklyGoalsDone,
  type WeeklyGoals,
} from "@/lib/weekly-goals";

// =========================================================
// WEEKLY GOALS detail (/season)
// Each goal with its explanation, reward and progress.
// =========================================================

const CATEGORY_ICON: Record<string, LucideIcon> = {
  play: Swords,
  collect: Package,
  trade: Repeat2,
};

export function SeasonWeeklyGoals({
  weekly,
  goalXp,
}: {
  weekly: WeeklyGoals | null;
  goalXp: number;
}) {
  if (!weekly || weekly.items.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        New weekly goals arrive every Monday.
      </p>
    );
  }

  const done =
    weeklyGoalsDone(
      weekly.items
    );

  const resets =
    resetsInLabel(
      weekly.endsAt
    );

  return (
    <div>
      <p className="text-[12px] text-zinc-500">
        {done} of {weekly.items.length} done
        {resets ? ` · ${resets}` : ""}
      </p>

      <ul className="mt-3 space-y-2.5">
        {weekly.items.map(
          (item) => {
            const Icon =
              CATEGORY_ICON[item.category] ?? Swords;

            return (
              <li
                key={item.id}
                className={`rounded-2xl border px-3.5 py-3 ${
                  item.completed
                    ? "border-[rgb(242_196_90/.35)] bg-[rgb(242_196_90/.06)]"
                    : "border-[rgb(242_196_90/.18)] bg-[rgb(14_20_44/.7)]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[rgb(120_150_230/.25)] bg-[rgb(40_60_120/.35)] text-gold">
                    {item.completed ? (
                      <Check
                        size={16}
                        aria-label="Done"
                      />
                    ) : (
                      <Icon
                        size={15}
                      />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[14px] font-semibold text-zinc-50">
                        {item.title}
                      </p>

                      <p className="shrink-0 text-[11px] font-semibold text-gold">
                        +{item.dpReward.toLocaleString("en-US")} DP
                        {goalXp > 0 ? ` · +${goalXp.toLocaleString("en-US")} XP` : ""}
                      </p>
                    </div>

                    {item.description ? (
                      <p className="mt-0.5 text-[12px] leading-5 text-zinc-500">
                        {item.description}
                      </p>
                    ) : null}

                    <div className="mt-2 flex items-center gap-2">
                      <GoalProgressBar
                        percent={goalPercent(
                          item.progress,
                          item.target
                        )}
                        label={`${item.title}: ${item.progress} of ${item.target}`}
                      />

                      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-zinc-400">
                        {item.progress}/{item.target}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            );
          }
        )}
      </ul>

      {weekly.bonus.voucherType && weekly.bonus.voucherQuantity > 0 ? (
        <p
          className={`mt-3 flex items-center gap-2 text-[13px] ${
            weekly.bonus.granted
              ? "text-gold"
              : "text-zinc-400"
          }`}
        >
          <Gift
            size={15}
            className="shrink-0"
          />

          {weekly.bonus.granted
            ? `All done: ${voucherLabel(weekly.bonus.voucherType)} added to your vouchers.`
            : `Finish all ${weekly.items.length} goals for a ${voucherLabel(weekly.bonus.voucherType)}.`}
        </p>
      ) : null}
    </div>
  );
}
