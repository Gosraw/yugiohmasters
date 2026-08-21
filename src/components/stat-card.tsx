import {
  ReactNode,
} from "react";

// =========================================================
// STAT CARD
//
// Small icon + label + value tile used for dashboard-style
// stats (Wins, DP, Active Duels, etc). Optionally a link.
// =========================================================

type StatCardProps = {
  icon: ReactNode;

  label: string;

  value: ReactNode;

  hint?: string;

  accent?:
    | "amber"
    | "cyan"
    | "emerald"
    | "violet"
    | "red";
};

const accentStyles: Record<
  NonNullable<
    StatCardProps["accent"]
  >,
  string
> = {
  amber: "text-amber-200",
  cyan: "text-cyan-200",
  emerald: "text-emerald-200",
  violet: "text-violet-200",
  red: "text-red-200",
};

export function StatCard({
  icon,
  label,
  value,
  hint,
  accent = "amber",
}: StatCardProps) {
  return (
    <div className="panel relative min-h-[112px] overflow-hidden p-5">
      <div className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 opacity-[0.06]">
        {icon}
      </div>

      <p className="relative text-xs font-black uppercase tracking-wider text-zinc-500">
        {label}
      </p>

      <p
        className={`relative mt-2 text-3xl font-black ${accentStyles[accent]}`}
      >
        {value}
      </p>

      {hint && (
        <p className="relative mt-1 text-[9px] font-black uppercase tracking-wider text-zinc-600">
          {hint}
        </p>
      )}
    </div>
  );
}
