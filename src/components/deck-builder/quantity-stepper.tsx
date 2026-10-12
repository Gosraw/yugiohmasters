"use client";

import {
  Ban,
  Minus,
  Plus,
} from "lucide-react";

// Add/remove control used on browse tiles, deck rows and the detail
// sheet. Every button is at least 44px tall (the old Remove button
// was 24px) and reacts on press (:active), not on release.

const BUTTON_BASE =
  "flex cursor-pointer touch-manipulation select-none items-center justify-center transition-[transform,background-color,border-color] duration-100 ease-out active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100";

export function QuantityStepper({
  name,
  count,
  owned,
  canAdd,
  legal,
  editable,
  size = "tile",
  onAdd,
  onRemove,
}: {
  name: string;
  count: number;
  owned: number;
  canAdd: boolean;
  legal: boolean;
  editable: boolean;
  size?: "tile" | "row" | "large";
  onAdd: () => void;
  onRemove: () => void;
}) {
  const height =
    size === "large"
      ? "h-13"
      : "h-11";

  if (!editable) {
    return (
      <p
        className={`flex ${height} items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] text-xs font-black text-zinc-400`}
      >
        {count > 0
          ? `${count} in deck`
          : `Owned ${owned}`}
      </p>
    );
  }

  if (
    !legal &&
    count === 0
  ) {
    return (
      <p
        className={`flex ${height} items-center justify-center gap-1.5 rounded-xl border border-red-400/15 bg-red-400/[0.04] text-[11px] font-black uppercase tracking-wide text-red-300/80`}
      >
        <Ban
          size={13}
        />
        Not legal
      </p>
    );
  }

  if (count === 0) {
    return (
      <button
        type="button"
        onClick={onAdd}
        disabled={!canAdd}
        aria-label={`Add ${name} to deck`}
        className={`${BUTTON_BASE} ${height} w-full gap-1.5 rounded-xl text-sm font-black ${
          size === "large"
            ? "primary-button !p-0"
            : "border border-[var(--dc-gold-line)] bg-amber-300/10 text-amber-200 hover:bg-amber-300/15"
        }`}
      >
        <Plus
          size={size === "large" ? 20 : 17}
          strokeWidth={2.75}
        />
        {size === "large"
          ? "Add to deck"
          : "Add"}
      </button>
    );
  }

  return (
    <div
      className={`grid ${height} grid-cols-[1fr_auto_1fr] items-stretch overflow-hidden rounded-xl border border-amber-300/35 bg-amber-300/[0.07]`}
    >
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove one ${name} from deck`}
        className={`${BUTTON_BASE} min-w-11 text-amber-100 hover:bg-white/5`}
      >
        <Minus
          size={size === "large" ? 20 : 17}
          strokeWidth={2.75}
        />
      </button>

      <span
        aria-live="polite"
        className={`flex min-w-6 items-center justify-center px-0.5 font-black tabular-nums text-amber-200 ${
          size === "large"
            ? "text-base"
            : "text-[13px]"
        }`}
      >
        {count}
        <span className="text-[10px] font-bold text-amber-200/50">
          /{owned}
        </span>
      </span>

      <button
        type="button"
        onClick={onAdd}
        disabled={!canAdd}
        aria-label={`Add another ${name} to deck`}
        className={`${BUTTON_BASE} min-w-11 text-amber-100 hover:bg-white/5`}
      >
        <Plus
          size={size === "large" ? 20 : 17}
          strokeWidth={2.75}
        />
      </button>
    </div>
  );
}
