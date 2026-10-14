import {
  rankLabel,
  rankOf,
  suitOf,
} from "@/lib/games/peaks-engine";

// =========================================================
// GIZA PEAKS - card art (plain components, no hooks).
//
// Duel Monster-style faces sized by one CSS variable (--w = card
// width in px): a coloured frame per suit, a parchment name bar
// with the rank (the only thing that matters for play, so it is
// the biggest thing on the card) and an art box with the suit's
// Millennium symbol. Four suits instead of hearts / spades:
//
//   0 Eye    (lapis "Ritual" frame)
//   1 Puzzle (gold "Normal" frame)
//   2 Ankh   (teal "Spell" frame)
//   3 Scarab (rose "Trap" frame)
//
// The back is a Millennium card back: dark bronze, gold border,
// an oval with the Eye of Wdjat.
// =========================================================

export const SUIT_NAMES = [
  "Eye",
  "Puzzle",
  "Ankh",
  "Scarab",
] as const;

/** Frame gradient (light, dark) + the symbol colour in the name bar. */
const SUIT_STYLE: {
  frame: [string, string];
  ink: string;
}[] = [
  {
    frame: [
      "#4f78cf",
      "#1f3471",
    ],
    ink: "#2b4c9e",
  },
  {
    frame: [
      "#dba049",
      "#8a5418",
    ],
    ink: "#9a5f12",
  },
  {
    frame: [
      "#2aa08e",
      "#0e4e45",
    ],
    ink: "#127566",
  },
  {
    frame: [
      "#c04a83",
      "#5e1a41",
    ],
    ink: "#9b2b63",
  },
];

export function SuitSymbol({
  suit,
  color,
  className = "",
}: {
  suit: number;
  color: string;
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
    >
      {
        suit === 0
          ? (
              <>
                <path
                  d="M3 7.2 Q12 2.6 21 6.4"
                  {...common}
                />
                <path
                  d="M2.5 12 Q12 4.6 21.5 12 Q12 17.4 2.5 12 Z"
                  {...common}
                />
                <circle
                  cx="12"
                  cy="11.6"
                  r="2.9"
                  fill={color}
                />
                <path
                  d="M9.4 16 L8.4 21.4 M13.6 16.2 Q14.4 21.4 18.6 20.6 Q20.6 19.2 18.8 17.6"
                  {...common}
                />
              </>
            )
          : suit === 1
            ? (
                <>
                  <path
                    d="M12 1.6 V4"
                    {...common}
                  />
                  <path
                    d="M3 4.4 H21 L12 22 Z"
                    {...common}
                  />
                  <path
                    d="M8 10.2 Q12 7.2 16 10.2 Q12 13.2 8 10.2 Z"
                    {...common}
                    strokeWidth={1.6}
                  />
                  <circle
                    cx="12"
                    cy="10.2"
                    r="1.3"
                    fill={color}
                  />
                </>
              )
            : suit === 2
              ? (
                  <>
                    <ellipse
                      cx="12"
                      cy="6.6"
                      rx="3.8"
                      ry="4.6"
                      {...common}
                    />
                    <path
                      d="M4.6 12.4 H19.4 M12 11.2 V22.4"
                      {...common}
                      strokeWidth={2.6}
                    />
                  </>
                )
              : (
                  <>
                    <circle
                      cx="12"
                      cy="3.4"
                      r="2"
                      fill={color}
                    />
                    <path
                      d="M8.6 8.6 Q12 5.4 15.4 8.6"
                      {...common}
                    />
                    <ellipse
                      cx="12"
                      cy="14.6"
                      rx="5"
                      ry="6.6"
                      {...common}
                    />
                    <path
                      d="M12 8.4 V21 M7.2 11.6 L3.2 9.4 M7 15.6 L3 17 M16.8 11.6 L20.8 9.4 M17 15.6 L21 17"
                      {...common}
                      strokeWidth={1.7}
                    />
                  </>
                )
      }
    </svg>
  );
}

export function cardName(
  card: number
) {
  return `${rankLabel(rankOf(card))} of ${SUIT_NAMES[suitOf(card)]}`;
}

/** Card face; fills its parent (size it with --w on an ancestor). */
export function CardFace({
  card,
}: {
  card: number;
}) {
  const rank =
    rankOf(card);

  const suit =
    suitOf(card);

  const style =
    SUIT_STYLE[suit];

  const label =
    rankLabel(rank);

  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-[calc(var(--w)*0.08)] border border-[#2a1a08] p-[calc(var(--w)*0.055)] shadow-[0_2px_6px_rgba(0,0,0,.55)]"
      style={{
        background: `linear-gradient(160deg, ${style.frame[0]} 0%, ${style.frame[1]} 100%)`,
      }}
    >
      {/* Name bar: rank + suit symbol */}
      <div className="flex h-[38%] items-center justify-between rounded-[calc(var(--w)*0.04)] bg-[linear-gradient(180deg,#fbf0cf,#e9d39b)] pl-[calc(var(--w)*0.05)] pr-[calc(var(--w)*0.03)] shadow-[inset_0_-1px_0_rgba(90,60,10,.35)]">
        <span
          className="font-display font-black leading-none text-[#1b1206]"
          style={{
            fontSize: label.length > 1
              ? "calc(var(--w) * 0.4)"
              : "calc(var(--w) * 0.48)",
            letterSpacing: label.length > 1
              ? "-0.08em"
              : undefined,
          }}
        >
          {label}
        </span>

        <SuitSymbol
          suit={suit}
          color={style.ink}
          className="h-[calc(var(--w)*0.3)] w-[calc(var(--w)*0.3)] shrink-0"
        />
      </div>

      {/* Art box: the Millennium symbol */}
      <div className="mt-[calc(var(--w)*0.05)] flex h-[calc(62%_-_var(--w)*0.05)] items-center justify-center rounded-[calc(var(--w)*0.03)] border border-[rgba(255,226,150,.45)] bg-[radial-gradient(circle_at_50%_40%,#3a2a12_0%,#120b04_80%)]">
        <SuitSymbol
          suit={suit}
          color="#f2c45a"
          className="h-[66%] w-[66%] drop-shadow-[0_0_3px_rgba(242,196,90,.55)]"
        />
      </div>
    </div>
  );
}

/** Millennium card back; fills its parent. */
export function CardBack() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[calc(var(--w)*0.08)] border border-[#1a0f05] bg-[radial-gradient(ellipse_at_50%_45%,#5a3518_0%,#2a160a_55%,#120804_100%)] shadow-[0_2px_6px_rgba(0,0,0,.55)]">
      <div className="absolute inset-[calc(var(--w)*0.07)] rounded-[calc(var(--w)*0.05)] border border-[rgba(242,196,90,.55)]" />

      <div className="absolute left-1/2 top-1/2 flex h-[54%] w-[64%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[50%] border border-[rgba(242,196,90,.8)] bg-[radial-gradient(ellipse_at_center,#2b1708_0%,#0c0603_100%)] shadow-[0_0_6px_rgba(242,196,90,.35)]">
        <SuitSymbol
          suit={0}
          color="#f2c45a"
          className="h-[70%] w-[70%]"
        />
      </div>
    </div>
  );
}
