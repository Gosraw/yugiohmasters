import {
  Check,
  Gift,
} from "lucide-react";

import {
  GoalProgressBar,
} from "@/components/goal-progress-bar";

import {
  HomeCard,
} from "@/components/home-card";

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
// HOME: WEEKLY GOALS card (2.0)
//
// Three goals with a progress bar each ("Play 3 season duels
// ▓▓▓░ 2/3"), plus the "all done" voucher. Progress and payouts
// come from get_my_season_overview - this only renders them.
// =========================================================

export function HomeWeeklyGoals({
  weekly,
}: {
  weekly: WeeklyGoals | null;
}) {
  if (!weekly || weekly.items.length === 0) {
    return (
      <HomeCard
        title="Weekly goals"
        href="/season"
        hrefLabel="Season"
      >
        <p className="text-sm text-zinc-500">
          New goals arrive every Monday.
        </p>
      </HomeCard>
    );
  }

  const done =
    weeklyGoalsDone(
      weekly.items
    );

  const total =
    weekly.items.length;

  const resets =
    resetsInLabel(
      weekly.endsAt
    );

  return (
    <HomeCard
      title={`Weekly goals · ${done} / ${total}`}
      aside={resets}
      href="/season"
      hrefLabel="Details"
    >
      <ul className="space-y-2">
        {weekly.items.map(
          (item) => (
            <li
              key={item.id}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,32%)_auto] items-center gap-2.5 py-0.5 text-[13px]"
            >
              <span
                className={`line-clamp-2 leading-snug ${
                  item.completed
                    ? "text-zinc-400"
                    : "text-zinc-100"
                }`}
              >
                {item.title}
              </span>

              <GoalProgressBar
                percent={goalPercent(
                  item.progress,
                  item.target
                )}
                label={`${item.title}: ${item.progress} of ${item.target}`}
              />

              <span className="flex w-9 justify-end text-[11px] font-semibold tabular-nums text-zinc-400">
                {item.completed ? (
                  <Check
                    size={15}
                    className="text-gold-bright"
                    aria-label="Done"
                  />
                ) : (
                  `${item.progress}/${item.target}`
                )}
              </span>
            </li>
          )
        )}
      </ul>

      {weekly.bonus.voucherType && weekly.bonus.voucherQuantity > 0 ? (
        <p
          className={`mt-2.5 flex items-center gap-1.5 border-t border-white/[0.06] pt-2.5 text-[12px] ${
            weekly.bonus.granted
              ? "text-gold"
              : "text-zinc-500"
          }`}
        >
          <Gift
            size={13}
            className="shrink-0"
          />

          {weekly.bonus.granted
            ? `${voucherLabel(weekly.bonus.voucherType)} earned for finishing every goal`
            : `Finish all ${total}: ${voucherLabel(weekly.bonus.voucherType)}`}
        </p>
      ) : null}
    </HomeCard>
  );
}
