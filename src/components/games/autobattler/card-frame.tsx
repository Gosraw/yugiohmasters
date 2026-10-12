import {
  ABILITY_LABEL,
  TRAP_BY_ID,
  UNIT_BY_ID,
} from "@/lib/games/autobattler/units";

import styles from "./arena.module.css";

// =========================================================
// SHADOW ARENA - a small Yu-Gi-Oh style card: frame colour by
// type (Effect = orange, Fusion = violet, Xyz = black, Trap =
// magenta, golden = gold foil), name bar, Level / Rank stars,
// art, ATK / DEF. Used in the shop, bench, discover and the
// Fusion / Xyz sheet. (Lane tokens use LaneUnit in lane-board.)
// =========================================================

type Props = {
  id: string;
  atk?: number;
  hp?: number;
  golden?: boolean;
  selected?: boolean;
  dim?: boolean;
  size?: "sm" | "md" | "lg";
  /** Face-down (your own set traps show their art anyway). */
  faceDown?: boolean;
};

const FRAME = {
  effect: "from-[#c97b35] to-[#7a3f16] border-[#e5a463]",
  fusion: "from-[#8d5bb7] to-[#4a2468] border-[#c49be6]",
  xyz: "from-[#2b2b33] to-[#0d0d12] border-[#8a8a96]",
  trap: "from-[#b2477f] to-[#5e1a41] border-[#e58ab9]",
  golden: "from-[#f7d774] to-[#9b6c12] border-[#fff0b0]",
};

export function CardFrame({
  id,
  atk,
  hp,
  golden = false,
  selected = false,
  dim = false,
  size = "md",
  faceDown = false,
}: Props) {
  const unit =
    UNIT_BY_ID.get(id);

  const trap =
    unit ? null : TRAP_BY_ID.get(id);

  const kind =
    trap
      ? "trap"
      : golden
        ? "golden"
        : unit?.kind ?? "effect";

  const name =
    unit?.name ?? trap?.name ?? "?";

  const stars =
    unit
      ? unit.kind === "xyz"
        ? unit.rank ?? 0
        : unit.level
      : 0;

  const tiny =
    size === "sm";

  if (faceDown) {
    return (
      <div
        className={`relative aspect-[59/86] w-full overflow-hidden rounded-[5px] border-2 border-[#6d4a1d] bg-[radial-gradient(circle_at_50%_45%,#c0812e,#5a2c0c_55%,#2a1206)] ${selected ? "ring-2 ring-amber-200" : ""}`}
        aria-label="Face-down card"
      >
        <div className="absolute inset-[18%] rounded-full border border-amber-200/40" />
      </div>
    );
  }

  return (
    <div
      className={`relative flex aspect-[59/86] w-full flex-col overflow-hidden rounded-[5px] border bg-gradient-to-b p-[3px] text-left shadow-[0_3px_10px_rgba(0,0,0,.5)] ${FRAME[kind]} ${golden ? styles.golden : ""} ${selected ? "ring-2 ring-amber-200 ring-offset-1 ring-offset-black" : ""} ${dim ? "opacity-50" : ""}`}
    >
      {
        tiny
          ? null
          : (
              <p
                className={`truncate rounded-[2px] bg-black/35 px-1 font-bold leading-tight text-white ${size === "lg" ? "text-[11px]" : "text-[8px]"}`}
              >
                {name}
              </p>
            )
      }

      {
        stars > 0 && !tiny
          ? (
              <p
                className={`truncate text-right leading-none ${unit?.kind === "xyz" ? "text-zinc-300" : "text-amber-300"} ${size === "lg" ? "text-[10px]" : "text-[7px]"}`}
                aria-label={`${unit?.kind === "xyz" ? "Rank" : "Level"} ${stars}`}
              >
                {"★".repeat(Math.min(stars, 12))}
              </p>
            )
          : null
      }

      <div className="relative mt-[2px] min-h-0 flex-1 overflow-hidden rounded-[2px] border border-black/40 bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={unit?.art ?? unit?.img ?? trap?.art ?? trap?.img ?? ""}
          alt=""
          draggable={false}
          className={styles.art}
        />

        {
          tiny && stars > 0
            ? (
                <span className="absolute left-0 top-0 rounded-br bg-black/70 px-0.5 text-[8px] font-bold leading-3 text-amber-300">
                  ★{stars}
                </span>
              )
            : null
        }
      </div>

      {
        trap
          ? (
              <p
                className={`mt-[2px] truncate rounded-[2px] bg-black/35 px-1 text-center font-bold uppercase tracking-wider text-pink-100 ${tiny ? "text-[7px]" : "text-[8px]"}`}
              >
                Trap
              </p>
            )
          : (
              <p
                className={`mt-[2px] flex justify-between rounded-[2px] bg-black/45 px-1 font-black tabular-nums leading-tight ${size === "lg" ? "text-[12px]" : tiny ? "text-[9px]" : "text-[10px]"}`}
                aria-label={`${atk ?? unit?.atk} ATK, ${hp ?? unit?.hp} DEF${unit ? `, ${ABILITY_LABEL[unit.ability]}` : ""}`}
              >
                <span className="text-amber-200">
                  {atk ?? unit?.atk}
                </span>

                <span className="text-sky-200">
                  {hp ?? unit?.hp}
                </span>
              </p>
            )
      }
    </div>
  );
}
