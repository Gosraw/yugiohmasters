import {
  Crown,
  Shield,
  Sparkles,
  Star,
} from "lucide-react";

import type {
  LucideIcon,
} from "lucide-react";

import type {
  CSSProperties,
} from "react";

// =========================================================
// PACK ART
//
// An original, CSS/SVG-only booster pack illustration - no
// external images, no downloads, nothing to lazy-load. Each
// pack tier gets its own silhouette treatment, gradient and
// emblem so the four pack types read as distinct physical
// objects instead of four bordered rectangles. Reused on the
// Shop page and on the pack-opening "unopened pack" moment.
//
// Deliberately NOT based on any official Yu-Gi-Oh! artwork -
// this is Duelist Circle's own booster-pack identity.
// =========================================================

export type PackTierCode =
  | "normal"
  | "premium"
  | "deluxe"
  | "special";

type PackTier = {
  gradient: string;
  ring: string;
  glowColor: string;
  icon: LucideIcon;
  tagline: string;
  ornate: boolean;
  dualTone: boolean;
};

const PACK_TIERS: Record<
  PackTierCode,
  PackTier
> = {
  normal: {
    gradient:
      "from-zinc-500 via-zinc-800 to-black",

    ring:
      "border-zinc-300/25",

    glowColor:
      "rgba(161,161,170,.25)",

    icon: Shield,

    tagline:
      "STANDARD ISSUE",

    ornate: false,

    dualTone: false,
  },

  premium: {
    gradient:
      "from-amber-400 via-amber-800 to-black",

    ring:
      "border-amber-300/35",

    glowColor:
      "rgba(252,211,77,.3)",

    icon: Star,

    tagline:
      "PREMIUM SEALED",

    ornate: false,

    dualTone: false,
  },

  deluxe: {
    gradient:
      "from-violet-400 via-fuchsia-900 to-black",

    ring:
      "border-violet-300/45",

    glowColor:
      "rgba(196,181,253,.4)",

    icon: Crown,

    tagline:
      "DELUXE EDITION",

    ornate: true,

    dualTone: false,
  },

  special: {
    gradient:
      "from-cyan-400 via-violet-700 to-black",

    ring:
      "border-cyan-300/45",

    glowColor:
      "rgba(103,232,249,.35)",

    icon: Sparkles,

    tagline:
      "LIMITED EVENT",

    ornate: false,

    dualTone: true,
  },
};

function resolveTier(
  code: string
): PackTier {
  if (
    code in PACK_TIERS
  ) {
    return PACK_TIERS[
      code as PackTierCode
    ];
  }

  return PACK_TIERS.normal;
}

export function packDisplayName(
  code: string
) {
  if (code === "normal") {
    return "Normal Pack";
  }

  if (code === "premium") {
    return "Premium Pack";
  }

  if (code === "deluxe") {
    return "Deluxe Pack";
  }

  return "Special Pack";
}

type PackArtProps = {
  code: string;

  name?: string;

  className?: string;

  animated?: boolean;

  // When true, the pack fills its parent's box (h-full w-full)
  // instead of enforcing its own 3:4 aspect ratio - used when
  // the parent already defines the aspect (e.g. the pack
  // opening reveal slot, which matches a card's own ratio).
  fill?: boolean;
};

// A single booster pack, rendered as a tall foil-pouch
// silhouette (CSS clip-path, not an image) with a tier
// gradient, a heat-seal band, an emblem medallion and a
// name plate. `animated` controls the foil sheen sweep -
// pass false for many packs rendered at once (e.g. a dense
// list) to keep animated layers to a minimum.
export function PackArt({
  code,
  name,
  className = "",
  animated = true,
  fill = false,
}: PackArtProps) {
  const tier =
    resolveTier(code);

  const Icon =
    tier.icon;

  const label =
    name ??
    packDisplayName(
      code
    );

  return (
    <div
      className={`pack-shell relative border bg-gradient-to-br shadow-[0_18px_50px_rgba(0,0,0,.45)] ${fill ? "h-full w-full" : "aspect-[3/4] w-full"} ${tier.gradient} ${tier.ring} ${className}`}
      style={
        {
          "--pack-glow":
            tier.glowColor,
        } as CSSProperties
      }
    >
      {/* Ambient tier glow */}
      <div className="pack-glow pointer-events-none absolute inset-0" />

      {/* Dual-tone diagonal split for Special */}
      {tier.dualTone && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-violet-600/40" />
      )}

      {/* Foil sheen sweep */}
      {animated && (
        <div className="pack-sheen pointer-events-none absolute inset-0" />
      )}

      {/* Heat-seal band */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[16%] bg-gradient-to-b from-white/20 via-white/[0.05] to-transparent" />

      <div className="pointer-events-none absolute inset-x-0 top-[15%] h-px bg-white/25" />

      {/* Deluxe ornamental corner flourishes */}
      {tier.ornate && (
        <>
          <div className="pointer-events-none absolute left-2 top-[19%] h-3 w-3 border-l border-t border-violet-200/50" />

          <div className="pointer-events-none absolute right-2 top-[19%] h-3 w-3 border-r border-t border-violet-200/50" />

          <div className="pointer-events-none absolute bottom-3 left-2 h-3 w-3 border-b border-l border-violet-200/50" />

          <div className="pointer-events-none absolute bottom-3 right-2 h-3 w-3 border-b border-r border-violet-200/50" />
        </>
      )}

      {/* Special event ribbon */}
      {tier.dualTone && (
        <div className="pointer-events-none absolute -right-8 top-3 w-28 rotate-45 bg-cyan-300/90 py-0.5 text-center text-[7px] font-black uppercase tracking-widest text-black shadow">
          Event
        </div>
      )}

      {/* Emblem medallion */}
      <div className="relative flex h-full flex-col items-center justify-center px-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/25 bg-black/35 text-white shadow-[0_0_25px_var(--pack-glow)] sm:h-16 sm:w-16">
          <Icon
            size={26}
            strokeWidth={
              1.8
            }
          />
        </div>

        <p className="mt-3 text-center text-[8px] font-black uppercase tracking-[.22em] text-white/70">
          {tier.tagline}
        </p>
      </div>

      {/* Name plate */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2.5 pt-6">
        <p className="truncate text-center text-[11px] font-black uppercase tracking-wide text-white">
          {label}
        </p>
      </div>
    </div>
  );
}
