import type {
  CSSProperties,
} from "react";

import {
  SHAPES,
} from "@/lib/games/tomb-engine";

import styles from "./tomb-blocks.module.css";

// =========================================================
// TOMB BLOCKS - one sandstone block and one whole piece.
// Plain components (no hooks), shared by the board, the tray,
// the dragged piece and the game-over card.
// =========================================================

/** Stone tint per colour index (1..8): lapis, turquoise, carnelian, gold, amethyst, malachite, copper, rose. */
export const TOMB_TINTS = [
  "#000000",
  "#2f62d6",
  "#17b0a0",
  "#d4482f",
  "#e6b13a",
  "#8f4fd3",
  "#2f9c5b",
  "#da7b2a",
  "#d04d88",
];

export function tintStyle(
  colour: number
) {
  return {
    "--tint": TOMB_TINTS[colour] ?? TOMB_TINTS[4],
  } as CSSProperties;
}

export function TombBlock({
  colour,
  className = "",
}: {
  colour: number;
  className?: string;
}) {
  return (
    <div
      className={`${styles.block} ${className}`}
      style={tintStyle(colour)}
    />
  );
}

type PieceProps = {
  shape: number;
  /** Size of one block in px. */
  cell: number;
  className?: string;
  blockClassName?: string;
};

export function TombPiece({
  shape,
  cell,
  className = "",
  blockClassName = "",
}: PieceProps) {
  const piece =
    SHAPES[shape];

  if (!piece) return null;

  return (
    <div
      className={`relative ${className}`}
      style={{
        width: piece.w * cell,
        height: piece.h * cell,
      }}
    >
      {piece.cells.map(
        ([row, col]) => (
          <div
            key={`${row}-${col}`}
            className="absolute"
            style={{
              left: col * cell,
              top: row * cell,
              width: cell,
              height: cell,
              padding: Math.max(1, cell * 0.04),
            }}
          >
            <TombBlock
              colour={piece.colour}
              className={blockClassName}
            />
          </div>
        )
      )}
    </div>
  );
}
