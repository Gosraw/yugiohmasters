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
