import {
  Ban,
  CircleHelp,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import {
  getMasterDuelStatusMeta,
} from "@/lib/master-duel";

import type {
  MasterDuelStatus,
} from "@/lib/master-duel";

// =========================================================
// MASTER DUEL STATUS BADGE
//
// A small pill, same visual language as the other metadata
// pills already used in Collection/Card Detail (rarity, "For
// Trade", lock state etc.) - never placed over card artwork,
// always sits alongside those other pills. `size="sm"` for
// dense grids, `size="md"` for a card detail stats panel.
// =========================================================

const TONE_STYLES: Record<
  string,
  string
> = {
  legal:
    "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",

  restricted:
    "border-amber-300/30 bg-amber-300/10 text-amber-200",

  blocked:
    "border-red-300/30 bg-red-300/10 text-red-300",

  unknown:
    "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
};

const TONE_ICON: Record<
  string,
  typeof ShieldCheck
> = {
  legal: ShieldCheck,
  restricted: ShieldAlert,
  blocked: Ban,
  unknown: CircleHelp,
};

export function MasterDuelBadge({
  status,
  size = "sm",
  className = "",
}: {
  status: MasterDuelStatus;

  size?: "sm" | "md";

  className?: string;
}) {
  const meta =
    getMasterDuelStatusMeta(
      status
    );

  const Icon =
    TONE_ICON[meta.tone];

  const toneClass =
    TONE_STYLES[meta.tone];

  if (size === "md") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${toneClass} ${className}`}
      >
        <Icon
          size={11}
        />

        {meta.label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${toneClass} ${className}`}
    >
      <Icon
        size={8}
      />

      {meta.shortLabel}
    </span>
  );
}
