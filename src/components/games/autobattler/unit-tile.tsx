import Image from "next/image";

import {
  Crosshair,
  Droplet,
  Gift,
  Ghost,
  Megaphone,
  Repeat,
  RotateCcw,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";

import type {
  LucideIcon,
} from "lucide-react";

import type {
  Ability,
} from "@/lib/games/autobattler/units";

import styles from "./arena.module.css";

// =========================================================
// One unit as a small square tile: cropped card art, tier pips,
// ability icon, attack (gold) and health (red) badges.
// Purely presentational; used by the shop, board, bench and
// combat rows.
// =========================================================

export const ABILITY_ICON: Record<Ability, LucideIcon> = {
  taunt: Shield,
  shield: Sparkles,
  revive: RotateCcw,
  pierce: Crosshair,
  rally: Megaphone,
  lastwill: Gift,
  spawn: Ghost,
  double: Repeat,
  venom: Droplet,
  ascend: TrendingUp,
  ambush: Zap,
};

type Props = {
  name: string;
  img: string;
  atk: number;
  hp: number;
  maxHp?: number;
  tier?: number;
  golden?: boolean;
  abilities?: Ability[];
  shieldUp?: boolean;
  taunt?: boolean;
  token?: boolean;
  boss?: boolean;
  selected?: boolean;
  dim?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE = {
  sm: "w-full",
  md: "w-full",
  lg: "w-full",
};

export function UnitTile({
  name,
  img,
  atk,
  hp,
  maxHp,
  tier,
  golden = false,
  abilities = [],
  shieldUp = false,
  taunt = false,
  token = false,
  boss = false,
  selected = false,
  dim = false,
  size = "md",
  className = "",
}: Props) {
  const hurt =
    maxHp !== undefined && hp < maxHp;

  const badge =
    size === "lg"
      ? "h-6 min-w-6 text-[13px]"
      : size === "md"
        ? "h-[18px] min-w-[18px] text-[11px]"
        : "h-4 min-w-4 text-[10px]";

  const icon =
    size === "lg"
      ? 13
      : 10;

  // Small tiles sit 7 to a row: keep the badges inside the tile so
  // they never overlap the neighbour.
  const corner =
    size === "sm"
      ? ["bottom-0 left-0", "bottom-0 right-0"]
      : ["-bottom-1 -left-1", "-bottom-1 -right-1"];

  return (
    <div
      className={`relative ${SIZE[size]} ${className} ${dim ? "opacity-45" : ""}`}
    >
      <div
        className={`relative aspect-square w-full overflow-hidden rounded-lg border bg-[#0b1024] ${
          golden
            ? `border-[#ffd86e] ${styles.golden}`
            : boss
              ? "border-red-400/70 shadow-[0_0_12px_rgba(248,113,113,.45)]"
              : taunt
                ? "border-sky-300/70"
                : "border-[rgb(242_196_90/.3)]"
        } ${selected ? "ring-2 ring-[#ffd86e] ring-offset-1 ring-offset-[#05081a]" : ""}`}
      >
        {
          token || !img
            ? (
                <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgba(167,139,250,.35),transparent_70%)] text-violet-200">
                  <Ghost
                    size={size === "lg" ? 28 : 18}
                    aria-hidden
                  />
                </div>
              )
            : (
                <Image
                  src={img}
                  alt={name}
                  width={168}
                  height={246}
                  unoptimized
                  draggable={false}
                  className={styles.art}
                />
              )
        }

        {
          golden
            ? (
                <div
                  aria-hidden
                  className={`pointer-events-none absolute inset-0 ${styles.shimmer}`}
                />
              )
            : null
        }

        {
          shieldUp
            ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-lg border-2 border-amber-200/80 bg-amber-200/10 shadow-[inset_0_0_12px_rgba(255,224,140,.7)]"
                />
              )
            : null
        }

        {
          tier
            ? (
                <span className="absolute left-0.5 top-0.5 rounded bg-black/70 px-1 text-[9px] font-black leading-[14px] text-amber-200">
                  {tier}★
                </span>
              )
            : null
        }

        {
          abilities.length > 0
            ? (
                <span className="absolute right-0.5 top-0.5 flex gap-0.5">
                  {abilities.slice(0, 2).map(
                    (ability) => {
                      const Icon =
                        ABILITY_ICON[ability];

                      return (
                        <span
                          key={ability}
                          className="flex items-center justify-center rounded bg-black/70 p-[2px] text-sky-200"
                        >
                          <Icon
                            size={icon}
                            aria-hidden
                          />
                        </span>
                      );
                    }
                  )}
                </span>
              )
            : null
        }
      </div>

      <span
        className={`absolute ${corner[0]} flex items-center justify-center rounded-full border border-amber-200/80 bg-gradient-to-b from-amber-300 to-amber-600 px-1 font-black tabular-nums text-[#1d1405] shadow ${badge}`}
        aria-label={`${atk} attack`}
      >
        {atk}
      </span>

      <span
        className={`absolute ${corner[1]} flex items-center justify-center rounded-full border px-1 font-black tabular-nums shadow ${badge} ${
          hurt
            ? "border-red-200/80 bg-gradient-to-b from-red-500 to-red-800 text-white"
            : "border-red-200/70 bg-gradient-to-b from-rose-400 to-rose-700 text-white"
        }`}
        aria-label={`${hp} health`}
      >
        {hp}
      </span>
    </div>
  );
}
