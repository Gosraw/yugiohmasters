import {
  Ban,
  Hash,
} from "lucide-react";

import {
  copyLimitLabel,
} from "./types";

// Our own banlist (duelist_circle_card_limits for the active
// format): "Forbidden", "Max 1" or "Max 2". Renders nothing for a
// card without an extra limit.
export function CopyLimitBadge({
  limit,
  size = "sm",
}: {
  limit: number | null;
  size?: "sm" | "md";
}) {
  const label =
    copyLimitLabel(
      limit
    );

  if (!label) {
    return null;
  }

  const forbidden =
    limit === 0;

  const Icon =
    forbidden
      ? Ban
      : Hash;

  return (
    <span
      data-testid="copy-limit-badge"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-black uppercase tracking-wider ${
        forbidden
          ? "border-red-300/30 bg-red-300/10 text-red-300"
          : "border-amber-300/30 bg-amber-300/10 text-amber-200"
      } ${
        size === "md"
          ? "px-2 py-0.5 text-[10px]"
          : "px-1.5 py-px text-[8px]"
      }`}
    >
      <Icon
        size={
          size === "md"
            ? 10
            : 8
        }
      />
      {label}
    </span>
  );
}
