import {
  ReactNode,
} from "react";

// =========================================================
// STATUS BADGE
//
// Small status pill with a consistent color language used
// everywhere a match/trade/deck/competition status is shown:
// neutral = waiting, info = in progress, success = good/done,
// warning = needs attention, danger = failed/disputed.
// =========================================================

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

const toneStyles: Record<
  StatusTone,
  string
> = {
  neutral:
    "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",

  info:
    "border-cyan-300/30 bg-cyan-300/10 text-cyan-200",

  success:
    "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",

  warning:
    "border-amber-300/35 bg-amber-300/10 text-amber-200",

  danger:
    "border-red-400/30 bg-red-400/10 text-red-300",
};

type StatusBadgeProps = {
  tone?: StatusTone;

  icon?: ReactNode;

  children: ReactNode;

  className?: string;
};

export function StatusBadge({
  tone = "neutral",
  icon,
  children,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${toneStyles[tone]} ${className ?? ""}`}
    >
      {icon}
      {children}
    </span>
  );
}

// =========================================================
// COMMON STATUS -> TONE MAPPINGS
//
// Optional helpers so call sites don't have to re-derive the
// same tone logic for the statuses already used in the schema.
// =========================================================

export function matchStatusTone(
  status: string
): StatusTone {
  switch (status) {
    case "completed":
      return "success";
    case "disputed":
      return "danger";
    case "cancelled":
    case "declined":
      return "neutral";
    case "accepted":
    case "result_submitted":
      return "info";
    default:
      return "warning";
  }
}

export function tradeStatusTone(
  status: string
): StatusTone {
  switch (status) {
    case "accepted":
      return "success";
    case "declined":
    case "cancelled":
      return "neutral";
    case "pending":
      return "warning";
    default:
      return "info";
  }
}

export function deckStatusTone(
  status: string
): StatusTone {
  switch (status) {
    case "ready":
      return "success";
    case "archived":
      return "neutral";
    default:
      return "warning";
  }
}
