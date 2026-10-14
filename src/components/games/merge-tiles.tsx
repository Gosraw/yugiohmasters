import type {
  CSSProperties,
} from "react";

// =========================================================
// MERGE OF RA - the tile ladder (names, colours, icons).
// Plain components (no hooks). Exponent 1 = 2 (Ankh), 2 = 4
// (Scarab), ... 11 = 2048 (Ra); beyond Ra the Winged Dragon keeps
// transforming. Every icon is gold-line art in a 24x24 box.
// =========================================================

export type Tier = {
  name: string;
  /** Tile background, top -> bottom. */
  from: string;
  to: string;
  /** Icon + number colour. */
  ink: string;
  /** Rim colour. */
  rim: string;
  /** Outer glow (0 = none). */
  glow: number;
};

const TIERS: Record<number, Tier> = {
  1: {
    name: "Ankh",
    from: "#2c3150",
    to: "#1d2036",
    ink: "#e9e2cc",
    rim: "rgba(233,226,204,.22)",
    glow: 0,
  },
  2: {
    name: "Scarab",
    from: "#185a5e",
    to: "#0e3740",
    ink: "#86f2dd",
    rim: "rgba(134,242,221,.3)",
    glow: 0,
  },
  3: {
    name: "Wedjat Eye",
    from: "#26468f",
    to: "#172a5c",
    ink: "#a9c6ff",
    rim: "rgba(169,198,255,.32)",
    glow: 0,
  },
  4: {
    name: "Djed",
    from: "#52318f",
    to: "#2f1b5a",
    ink: "#d2bcff",
    rim: "rgba(210,188,255,.32)",
    glow: 0,
  },
  5: {
    name: "Lotus",
    from: "#842a60",
    to: "#4f1639",
    ink: "#ffc0e2",
    rim: "rgba(255,192,226,.32)",
    glow: 0,
  },
  6: {
    name: "Sphinx",
    from: "#93622a",
    to: "#5c3a14",
    ink: "#ffe0aa",
    rim: "rgba(255,224,170,.36)",
    glow: 0,
  },
  7: {
    name: "Pyramid",
    from: "#c9722c",
    to: "#7a3410",
    ink: "#ffeedd",
    rim: "rgba(255,243,204,.45)",
    glow: 0.25,
  },
  8: {
    name: "Millennium Puzzle",
    from: "#e0b03c",
    to: "#9a6c12",
    ink: "#2a1a02",
    rim: "rgba(255,240,190,.6)",
    glow: 0.4,
  },
  9: {
    name: "Millennium Rod",
    from: "#f8c7ac",
    to: "#bd5f4c",
    ink: "#2a0c02",
    rim: "rgba(255,246,214,.7)",
    glow: 0.55,
  },
  10: {
    name: "Millennium Ring",
    from: "#fff8e0",
    to: "#d6b45e",
    ink: "#3a2400",
    rim: "rgba(255,250,230,.8)",
    glow: 0.7,
  },
  11: {
    name: "Ra",
    from: "#ffa344",
    to: "#c2340b",
    ink: "#fff6d6",
    rim: "rgba(255,236,190,.85)",
    glow: 0.9,
  },
  12: {
    name: "Ra · Sphinx Mode",
    from: "#ff7a8a",
    to: "#9f1239",
    ink: "#fff1f2",
    rim: "rgba(255,228,230,.85)",
    glow: 0.95,
  },
  13: {
    name: "Ra · Phoenix Mode",
    from: "#ff8a3d",
    to: "#7c2d12",
    ink: "#fff7ed",
    rim: "rgba(255,237,213,.9)",
    glow: 1,
  },
  14: {
    name: "Immortal Phoenix",
    from: "#ffe9a8",
    to: "#f59e0b",
    ink: "#451a03",
    rim: "rgba(255,255,255,.9)",
    glow: 1,
  },
};

const BEYOND: Tier = {
  name: "Eternal Ra",
  from: "#ffffff",
  to: "#fcd34d",
  ink: "#7c2d12",
  rim: "rgba(255,255,255,.95)",
  glow: 1,
};

export function tierOf(
  exp: number
): Tier {
  return TIERS[exp] ?? BEYOND;
}

export function tierName(
  exp: number
) {
  return tierOf(exp).name;
}

/** The ladder shown in the "How to play" legend. */
export const LADDER = [
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
];

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function RaDisc() {
  return (
    <>
      <circle
        cx="12"
        cy="10.5"
        r="3.9"
        fill="currentColor"
      />
      <path
        {...STROKE}
        d="M7.6 12.2C5 12.8 3 12.2 1.8 10.3c2.4.3 4 .1 5.6-.9M16.4 12.2c2.6.6 4.6 0 5.8-1.9-2.4.3-4 .1-5.6-.9M8.4 17.6c1.2-1.1 2.4-1.7 3.6-1.7s2.4.6 3.6 1.7M12 2.6v1.6M7.9 4.3l.8 1.3M16.1 4.3l-.8 1.3"
      />
    </>
  );
}

function IconPaths({
  exp,
}: {
  exp: number;
}) {
  switch (exp) {
    case 1:
      // Ankh
      return (
        <path
          {...STROKE}
          d="M12 10.6c-2.2 0-3.4-2-3.4-3.9C8.6 4.5 10.1 3 12 3s3.4 1.5 3.4 3.7c0 1.9-1.2 3.9-3.4 3.9ZM5.6 12.2h12.8M12 10.6V21"
        />
      );

    case 2:
      // Scarab
      return (
        <>
          <ellipse
            {...STROKE}
            cx="12"
            cy="13.8"
            rx="4.1"
            ry="5.4"
          />
          <circle
            {...STROKE}
            cx="12"
            cy="6.3"
            r="1.8"
          />
          <path
            {...STROKE}
            d="M12 8.6v10.4M8 11.2 4.6 9.4M7.9 14.4 4 14.8M8.6 17.4 5.6 19.8M16 11.2l3.4-1.8M16.1 14.4l3.9.4M15.4 17.4l3 2.4M10.6 4.8 9.6 3M13.4 4.8l1-1.8"
          />
        </>
      );

    case 3:
      // Wedjat Eye
      return (
        <>
          <path
            {...STROKE}
            d="M3 11c3-3.6 6-4.8 9-4.8s6 1.2 9 4.8c-3 3.2-6 4.4-9 4.4S6 14.2 3 11ZM4.2 6.6C6.8 4.8 9.4 4 12 4s4.4.6 6.6 1.8M10.4 15.3 9 20.4M13.6 15.3c.8 2.4 2.6 3.4 4.8 2.6"
          />
          <circle
            cx="12"
            cy="10.8"
            r="2.3"
            fill="currentColor"
          />
        </>
      );

    case 4:
      // Djed pillar
      return (
        <path
          {...STROKE}
          d="M10 21V10.4M14 21V10.4M6.6 10.4h10.8M6.6 7.6h10.8M6.6 4.8h10.8M9 3.2v7.2M15 3.2v7.2M8 21h8"
        />
      );

    case 5:
      // Lotus
      return (
        <path
          {...STROKE}
          d="M12 18.6c-2.5-2.6-3-6.6 0-11.1 3 4.5 2.5 8.5 0 11.1ZM12 18.6c-3-.3-6.6-2.8-7.6-7.1 3.3-.2 5.9 1.8 7.6 4.3M12 18.6c3-.3 6.6-2.8 7.6-7.1-3.3-.2-5.9 1.8-7.6 4.3M6.6 21h10.8"
        />
      );

    case 6:
      // Sphinx head (nemes headdress)
      return (
        <path
          {...STROKE}
          d="M8 20.5v-8.3C8 8 9.8 5 12 4c2.2 1 4 4 4 8.2v8.3M8 12.4 4.6 19.6M16 12.4l3.4 7.2M10.2 10.4h.6M13.2 10.4h.6M12 11.6v2.2M10.6 16.2h2.8M4.2 20.5h15.6"
        />
      );

    case 7:
      // Pyramid
      return (
        <path
          {...STROKE}
          d="M2.6 19.6 12 4l9.4 15.6ZM12 4l2.6 15.6M6.2 13.6h11.4M8.6 9.6h6.6"
        />
      );

    case 8:
      // Millennium Puzzle (inverted pyramid with the eye)
      return (
        <>
          <path
            {...STROKE}
            d="M3.8 5.4h16.4L12 20.6ZM8.2 9.8c1.2-1.4 2.5-2 3.8-2s2.6.6 3.8 2c-1.2 1.4-2.5 2-3.8 2s-2.6-.6-3.8-2ZM12 2.4v3"
          />
          <circle
            cx="12"
            cy="9.8"
            r="1"
            fill="currentColor"
          />
        </>
      );

    case 9:
      // Millennium Rod
      return (
        <>
          <circle
            {...STROKE}
            cx="12"
            cy="6.4"
            r="3"
          />
          <path
            {...STROKE}
            d="M12 9.4v12.2M9 6.6C6.6 6 5 4.6 4.4 2.8M15 6.6c2.4-.6 4-2 4.6-3.8M10.2 12.2h3.6M10.6 15.2h2.8"
          />
          <circle
            cx="12"
            cy="6.4"
            r="1"
            fill="currentColor"
          />
        </>
      );

    case 10:
      // Millennium Ring
      return (
        <>
          <circle
            {...STROKE}
            cx="12"
            cy="9.6"
            r="6.4"
          />
          <path
            {...STROKE}
            d="M12 4.8 16.1 12H7.9ZM7 15.4l-.8 4.2M10 16.6l-.2 4.2M14 16.6l.2 4.2M17 15.4l.8 4.2"
          />
          <circle
            cx="12"
            cy="9.8"
            r="1"
            fill="currentColor"
          />
        </>
      );

    case 11:
      return <RaDisc />;

    case 12:
      // Ra, Sphinx Mode: the disc inside a ring.
      return (
        <>
          <RaDisc />
          <circle
            {...STROKE}
            cx="12"
            cy="10.5"
            r="6.2"
            strokeDasharray="1.6 1.8"
          />
        </>
      );

    default:
      // Phoenix modes and beyond: the disc crowned with flame.
      return (
        <>
          <RaDisc />
          <path
            {...STROKE}
            d="M9.6 6.4C9 4.6 9.8 3 11 2c-.1 1.4.4 2.2 1 2.6.6-.4 1.1-1.2 1-2.6 1.2 1 2 2.6 1.4 4.4M5 21.4c2-1.2 4.4-1.8 7-1.8s5 .6 7 1.8"
          />
        </>
      );
  }
}

export function TileIcon({
  exp,
  className = "",
  style,
}: {
  exp: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <IconPaths
        exp={exp}
      />
    </svg>
  );
}

/** Small static tile (legend, result card, HUD chip). */
export function TileBadge({
  exp,
  size = 40,
}: {
  exp: number;
  size?: number;
}) {
  const tier =
    tierOf(exp);

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[22%] border"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(160deg, ${tier.from}, ${tier.to})`,
        borderColor: tier.rim,
        color: tier.ink,
        boxShadow: tier.glow > 0
          ? `0 0 ${Math.round(size * 0.35 * tier.glow)}px rgba(255,190,80,${0.45 * tier.glow})`
          : undefined,
      }}
    >
      <TileIcon
        exp={exp}
        style={{
          width: size * 0.62,
          height: size * 0.62,
        }}
      />
    </span>
  );
}
