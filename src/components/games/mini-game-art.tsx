// =========================================================
// Mini game tile art for the /games hub (2.0). Plain component
// (no hooks): one small Night Temple scene per game, drawn in the
// same style (gold line art on a dusk sky) so the menu reads as
// one set. Unknown ids fall back to a plain gold frame.
// =========================================================

type Props = {
  game: string;
  className?: string;
};

const GOLD = "#f2c45a";
const GOLD_SOFT = "rgba(242,196,90,.55)";
const SAND = "#d9a95b";

/** Sky gradient per game (top colour, bottom colour). */
const SKY: Record<string, [string, string]> = {
  pyramid_climb: [
    "#1b1f4a",
    "#4a2a4f",
  ],
  pyramid_stack: [
    "#241a45",
    "#7a3f3a",
  ],
  millennium_strike: [
    "#141a3a",
    "#3b2c18",
  ],
  obelisk_rush: [
    "#0f1733",
    "#2c2346",
  ],
  merge_ra: [
    "#16163a",
    "#5a2a1c",
  ],
  giza_peaks: [
    "#121a3d",
    "#4a2b3a",
  ],
  tomb_blocks: [
    "#101634",
    "#3e2a1a",
  ],
  auto_battler: [
    "#1d1236",
    "#3d1a2c",
  ],
};

function Scene({
  game,
}: {
  game: string;
}) {
  switch (game) {
    case "pyramid_climb":
      return (
        <>
          <circle
            cx="47"
            cy="15"
            r="5"
            fill="#fff3c8"
            opacity=".85"
          />
          <path
            d="M6 54 L32 20 L58 54 Z"
            fill="rgba(217,169,91,.18)"
            stroke={GOLD}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M14 44 H50 M21 34 H43 M27 26 H37"
            stroke={GOLD_SOFT}
            strokeWidth="1.5"
          />
          <rect
            x="29"
            y="13"
            width="6"
            height="6"
            rx="1.5"
            fill={GOLD}
          />
        </>
      );

    case "pyramid_stack":
      return (
        <>
          <path
            d="M16 50 L32 42 L48 50 L32 58 Z"
            fill="rgba(217,169,91,.35)"
            stroke={GOLD}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M18 41 L32 34 L46 41 L32 48 Z"
            fill="rgba(217,169,91,.45)"
            stroke={GOLD}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M20 32 L32 26 L44 32 L32 38 Z"
            fill={SAND}
            stroke={GOLD}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M30 12 L42 18 L30 24 L18 18 Z"
            fill="#fff3c8"
            stroke={GOLD}
            strokeWidth="1.5"
            strokeLinejoin="round"
            opacity=".95"
          />
          <path
            d="M45 12 h8 M49 8 v8"
            stroke={GOLD_SOFT}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      );

    case "millennium_strike":
      return (
        <>
          {/* Cards stuck in the rim, pointing outwards. */}
          {
            [
              -150,
              -40,
              35,
            ].map(
              (angle) => (
                <rect
                  key={angle}
                  x="29.5"
                  y="2"
                  width="5"
                  height="9"
                  rx="1"
                  fill={SAND}
                  stroke={GOLD}
                  strokeWidth=".8"
                  transform={`rotate(${angle} 32 25)`}
                />
              )
            )
          }
          <circle
            cx="32"
            cy="25"
            r="15"
            fill="rgba(217,169,91,.28)"
            stroke={GOLD}
            strokeWidth="2"
          />
          <circle
            cx="32"
            cy="25"
            r="10"
            fill="none"
            stroke={GOLD_SOFT}
            strokeWidth="1"
          />
          <path
            d="M25 25 Q32 19 39 25 Q32 31 25 25 Z"
            fill="none"
            stroke={GOLD}
            strokeWidth="1.4"
          />
          <circle
            cx="32"
            cy="25"
            r="2.2"
            fill={GOLD}
          />
          <rect
            x="29.5"
            y="47"
            width="5"
            height="9"
            rx="1"
            fill="#fff3c8"
            stroke={GOLD}
            strokeWidth=".8"
          />
          <path
            d="M32 59 V62 M28 58 V61 M36 58 V61"
            stroke={GOLD_SOFT}
            strokeWidth="1"
            strokeLinecap="round"
          />
        </>
      );

    case "obelisk_rush":
      return (
        <>
          <path
            d="M26 58 V14 L32 6 L38 14 V58 Z"
            fill="rgba(217,169,91,.22)"
            stroke={GOLD}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M26 24 H38 M26 34 H38 M26 44 H38"
            stroke={GOLD_SOFT}
            strokeWidth="1.2"
          />
          <path
            d="M38 28 L52 30 L38 32 Z"
            fill="#e8edf5"
            stroke={GOLD}
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <path
            d="M26 38 L12 40 L26 42 Z"
            fill="#e8edf5"
            stroke={GOLD}
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <path
            d="M44 50 L52 44"
            stroke="#fff3c8"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </>
      );

    case "merge_ra":
      return (
        <>
          {/* 2x2 of the 4x4 board, the gold Ra disc on top. */}
          {
            [
              [10, 30],
              [32, 30],
              [10, 46],
              [32, 46],
            ].map(
              ([x, y], index) => (
                <rect
                  key={`${x}-${y}`}
                  x={x}
                  y={y}
                  width="20"
                  height="14"
                  rx="3"
                  fill={index === 1 ? "rgba(217,169,91,.45)" : "rgba(217,169,91,.18)"}
                  stroke={GOLD_SOFT}
                  strokeWidth="1.2"
                />
              )
            )
          }
          <circle
            cx="32"
            cy="17"
            r="7"
            fill={GOLD}
          />
          <path
            d="M24 18 C18 19 14 17 11 13 C16 14 20 14 24 12 M40 18 C46 19 50 17 53 13 C48 14 44 14 40 12"
            stroke="#fff3c8"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />
        </>
      );

    case "giza_peaks":
      return (
        <>
          <path
            d="M3 40 L13 22 L23 40 Z M22 40 L32 18 L42 40 Z M41 40 L51 22 L61 40 Z"
            fill="rgba(217,169,91,.18)"
            stroke={GOLD_SOFT}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <rect
            x="17"
            y="34"
            width="15"
            height="21"
            rx="2"
            transform="rotate(-12 24.5 44.5)"
            fill="#3a2010"
            stroke={GOLD}
            strokeWidth="1.2"
          />
          <rect
            x="28"
            y="33"
            width="16"
            height="22"
            rx="2"
            fill={SAND}
            stroke={GOLD}
            strokeWidth="1.2"
          />
          <rect
            x="30"
            y="35"
            width="12"
            height="6"
            rx="1"
            fill="#fff3c8"
          />
          <path
            d="M31.4 40 L33.4 35.8 L35.4 40 M32.2 38.5 h2.4"
            stroke="#1b1206"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M31 48 Q36 44 41 48 Q36 51.5 31 48 Z"
            fill="none"
            stroke="#1b1206"
            strokeWidth="1.2"
          />
          <circle
            cx="36"
            cy="47.8"
            r="1.3"
            fill="#1b1206"
          />
        </>
      );

    case "tomb_blocks":
      return (
        <>
          {/* 4x4 corner of the tomb floor, an L piece dropping in. */}
          <rect
            x="10"
            y="24"
            width="44"
            height="32"
            rx="3"
            fill="rgba(10,13,32,.7)"
            stroke={GOLD_SOFT}
            strokeWidth="1.2"
          />
          {
            [
              [12, 45, "#2f62d6"],
              [22, 45, "#2f62d6"],
              [32, 45, "#e6b13a"],
              [42, 45, "#e6b13a"],
              [12, 35, "#d4482f"],
              [42, 35, "#e6b13a"],
              [22, 10, SAND],
              [22, 20, SAND],
              [32, 20, SAND],
            ].map(
              ([x, y, fill]) => (
                <rect
                  key={`${x}-${y}`}
                  x={x as number}
                  y={y as number}
                  width="9"
                  height="9"
                  rx="2"
                  fill={fill as string}
                  stroke={GOLD}
                  strokeWidth="1"
                />
              )
            )
          }
          <path
            d="M12 49.5 H51"
            stroke="#fff3c8"
            strokeWidth="1.2"
            opacity=".7"
          />
        </>
      );

    case "auto_battler":
      return (
        <>
          <path
            d="M14 50 L44 14 M44 14 l6 -2 -2 6 M18 42 l6 6"
            stroke={GOLD}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M50 50 L20 14 M20 14 l-6 -2 2 6 M46 42 l-6 6"
            stroke="#fff3c8"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <circle
            cx="32"
            cy="31"
            r="4"
            fill={GOLD}
            opacity=".9"
          />
        </>
      );

    default:
      return (
        <rect
          x="16"
          y="16"
          width="32"
          height="32"
          rx="6"
          fill="none"
          stroke={GOLD}
          strokeWidth="2"
        />
      );
  }
}

export function MiniGameArt({
  game,
  className = "",
}: Props) {
  const [
    top,
    bottom,
  ] = SKY[game] ?? [
    "#141a3a",
    "#2c2346",
  ];

  const gradientId =
    `mini-game-sky-${game}`;

  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0"
            stopColor={top}
          />
          <stop
            offset="1"
            stopColor={bottom}
          />
        </linearGradient>
      </defs>

      <rect
        width="64"
        height="64"
        fill={`url(#${gradientId})`}
      />

      <circle
        cx="9"
        cy="9"
        r=".8"
        fill="#fff3c8"
        opacity=".7"
      />

      <circle
        cx="20"
        cy="5"
        r=".6"
        fill="#fff3c8"
        opacity=".5"
      />

      <circle
        cx="56"
        cy="30"
        r=".7"
        fill="#fff3c8"
        opacity=".55"
      />

      <Scene
        game={game}
      />
    </svg>
  );
}
