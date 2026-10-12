// =========================================================
// MILLENNIUM GLYPHS (Season 2, Night Temple)
//
// Small original SVG marks used by the big moments (pack
// opening, Legendary pulls, Boss evolution): an Eye of Wudjat
// and a row of simple temple glyphs. Drawn with `currentColor`
// so the caller decides the gold tone, and kept as plain SVG
// strokes (no fonts) because Unicode hieroglyphs are missing on
// many phones.
// =========================================================

export function EyeOfWudjat({
  className = "",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 44"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M6 9 Q32 -1 58 7"
      />

      <path
        d="M7 21 Q32 5 57 21 Q32 32 7 21 Z"
      />

      <circle
        cx={32}
        cy={19.5}
        r={5.5}
        fill="currentColor"
      />

      <path
        d="M27 28 L24.5 41"
      />

      <path
        d="M39 27.5 Q45 36 51.5 34 Q56 32 53 28.5 Q50.5 26.5 48.5 29"
      />
    </svg>
  );
}

// One repeating unit: ankh, eye, feather, water, sun disc,
// reed. The band tiles it horizontally.
function GlyphUnit({
  x,
}: {
  x: number;
}) {
  return (
    <g
      transform={`translate(${x} 0)`}
    >
      {/* ankh */}
      <ellipse
        cx={8}
        cy={6}
        rx={3}
        ry={4}
      />
      <path
        d="M8 10 V20 M3 12 H13"
      />

      {/* eye */}
      <path
        d="M22 12 Q29 6 36 12 Q29 16 22 12 Z"
      />
      <circle
        cx={29}
        cy={11.5}
        r={1.6}
        fill="currentColor"
      />

      {/* feather */}
      <path
        d="M46 20 Q44 10 48 3 Q50 11 46 20 M46 20 V22"
      />

      {/* water */}
      <path
        d="M56 12 l2.5 -3 l2.5 3 l2.5 -3 l2.5 3 l2.5 -3 l2.5 3"
      />

      {/* sun disc */}
      <circle
        cx={80}
        cy={11}
        r={5}
      />
      <circle
        cx={80}
        cy={11}
        r={1.4}
        fill="currentColor"
      />

      {/* reed */}
      <path
        d="M94 21 V5 Q97 3 99 6 Q96 7 94 9"
      />
    </g>
  );
}

export function GlyphBand({
  className = "",
  units = 3,
}: {
  className?: string;
  units?: number;
}) {
  const width =
    units * 108;

  return (
    <svg
      viewBox={`0 0 ${width} 24`}
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {Array.from({
        length: units,
      }).map(
        (_, index) => (
          <GlyphUnit
            key={index}
            x={
              index * 108 +
              2
            }
          />
        )
      )}
    </svg>
  );
}

// Deterministic "random" sand grains so server and client render
// the same markup (no Math.random in render).
const SAND_GRAINS =
  Array.from(
    {
      length: 18,
    },
    (_, index) => {
      const seed =
        (index * 37) % 100;

      return {
        left: `${(seed * 0.97 + 2) % 100}%`,
        bottom: `${(index * 13) % 30}%`,
        size:
          index % 3 === 0
            ? 3
            : 2,
        dx: `${((index * 29) % 40) - 20}px`,
        rise: `${140 + ((index * 41) % 120)}px`,
        duration: `${2.4 + ((index * 7) % 16) / 10}s`,
        delay: `${((index * 11) % 24) / 10}s`,
      };
    }
  );

// Drifting golden sand, transform/opacity only. Parent must be
// `relative` and is expected to clip (overflow-hidden) if needed.
export function SandParticles({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
    >
      {SAND_GRAINS.map(
        (grain, index) => (
          <span
            key={index}
            className="dc-sand absolute rounded-full"
            style={
              {
                left: grain.left,
                bottom:
                  grain.bottom,
                width: grain.size,
                height:
                  grain.size,
                animationDuration:
                  grain.duration,
                animationDelay:
                  grain.delay,
                "--sand-dx":
                  grain.dx,
                "--sand-rise":
                  grain.rise,
              } as React.CSSProperties
            }
          />
        )
      )}
    </div>
  );
}
