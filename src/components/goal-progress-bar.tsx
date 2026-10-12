// =========================================================
// GOAL PROGRESS BAR (2.0, Night Temple)
//
// Thin glowing gold bar from docs/design/v2-style-options.html
// option B. Used by the weekly goals (Home + /season) and the
// Season Path. Purely presentational; `percent` is 0-100.
// The fill grows with a short CSS transition (no JS animation);
// motion-reduce turns it off.
// =========================================================

export function GoalProgressBar({
  percent,
  label,
  size = "sm",
  muted = false,
}: {
  percent: number;
  label: string;
  size?: "sm" | "md";
  muted?: boolean;
}) {
  const safePercent =
    Number.isFinite(percent)
      ? Math.min(
          100,
          Math.max(
            0,
            percent
          )
        )
      : 0;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safePercent)}
      className={`relative w-full overflow-hidden rounded-full bg-white/10 ${
        size === "md"
          ? "h-2.5"
          : "h-1.5"
      }`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${
          muted
            ? "bg-zinc-500/60"
            : "bg-gradient-to-r from-[#d79b2b] to-[#ffd86e] shadow-[0_0_10px_#ffcf5e]"
        }`}
        style={{
          width: `${safePercent}%`,
        }}
      />
    </div>
  );
}
