import {
  Crown,
} from "lucide-react";

import type {
  BoardRow,
} from "@/lib/games/climber-data";

// =========================================================
// Mini game leaderboard list. Plain component (no hooks), used
// by the Pyramid Climb screen and the /games hub.
// =========================================================

type Props = {
  rows: BoardRow[];
  currentUserId: string;
  emptyText: string;
  showRuns?: boolean;
};

const MEDAL = [
  "text-amber-300 border-amber-300/50 bg-amber-300/15",
  "text-zinc-200 border-zinc-300/40 bg-zinc-300/10",
  "text-orange-300 border-orange-300/40 bg-orange-300/10",
];

export function GameLeaderboard({
  rows,
  currentUserId,
  emptyText,
  showRuns = false,
}: Props) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-sm text-zinc-400">
        {emptyText}
      </p>
    );
  }

  return (
    <ol className="grid gap-1.5">
      {rows.map(
        (row) => {
          const isMe =
            row.profileId === currentUserId;

          return (
            <li
              key={row.profileId}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                isMe
                  ? "border-[rgb(242_196_90/.45)] bg-[rgb(242_196_90/.08)]"
                  : "border-white/5 bg-white/[.02]"
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-black tabular-nums ${
                  MEDAL[row.place - 1] ?? "border-white/10 text-zinc-400"
                }`}
              >
                {
                  row.place === 1
                    ? (
                        <Crown
                          size={15}
                          aria-label="1st"
                        />
                      )
                    : row.place
                }
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-zinc-100">
                  {row.name}
                  {
                    isMe
                      ? (
                          <span className="ml-1.5 text-xs font-bold text-amber-300">
                            you
                          </span>
                        )
                      : null
                  }
                </span>

                {
                  showRuns
                    ? (
                        <span className="block text-xs text-zinc-500">
                          {row.runs} {row.runs === 1 ? "run" : "runs"}
                        </span>
                      )
                    : null
                }
              </span>

              <span className="font-display text-base font-bold tabular-nums text-amber-100">
                {row.score.toLocaleString("en-US")}
                <span className="ml-0.5 text-xs font-semibold text-zinc-400">
                  m
                </span>
              </span>
            </li>
          );
        }
      )}
    </ol>
  );
}
