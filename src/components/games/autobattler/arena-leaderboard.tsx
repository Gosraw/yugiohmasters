"use client";

import {
  Crown,
  Heart,
} from "lucide-react";

import {
  useState,
} from "react";

import {
  describeScore,
} from "@/lib/games/autobattler/engine";

import type {
  ArenaBoardRow,
  ArenaBoards,
} from "@/lib/games/autobattler/data";

// =========================================================
// Shadow Arena leaderboards: Today (daily challenge, one try
// each) and This week (best practice run). Score = waves
// survived, then health left, then waves won.
// =========================================================

const MEDAL = [
  "text-amber-300 border-amber-300/50 bg-amber-300/15",
  "text-zinc-200 border-zinc-300/40 bg-zinc-300/10",
  "text-orange-300 border-orange-300/40 bg-orange-300/10",
];

export function ArenaScore({
  score,
}: {
  score: number;
}) {
  const {
    survived,
    health,
  } = describeScore(score);

  return (
    <span className="flex flex-col items-end leading-tight">
      <span className="font-display text-base font-bold tabular-nums text-amber-100">
        Wave {survived}
      </span>

      {
        health > 0
          ? (
              <span className="flex items-center gap-0.5 text-[11px] font-semibold tabular-nums text-rose-300/90">
                <Heart
                  size={10}
                  aria-hidden
                />
                {health} left
              </span>
            )
          : null
      }
    </span>
  );
}

function Rows({
  rows,
  userId,
  emptyText,
  showRuns,
}: {
  rows: ArenaBoardRow[];
  userId: string;
  emptyText: string;
  showRuns: boolean;
}) {
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
            row.profileId === userId;

          return (
            <li
              key={row.profileId}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
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

              <ArenaScore
                score={row.score}
              />
            </li>
          );
        }
      )}
    </ol>
  );
}

export function ArenaLeaderboards({
  boards,
  userId,
  initialTab = "day",
}: {
  boards: ArenaBoards;
  userId: string;
  initialTab?: "day" | "week";
}) {
  const [tab, setTab] =
    useState<"day" | "week">(initialTab);

  return (
    <div>
      <div
        className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/20 p-1"
        role="tablist"
      >
        {(["day", "week"] as const).map(
          (key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`min-h-11 rounded-lg text-sm font-bold transition ${
                tab === key
                  ? "bg-amber-300/15 text-amber-100"
                  : "text-zinc-400"
              }`}
            >
              {key === "day" ? "Today" : "This week"}
            </button>
          )
        )}
      </div>

      <div className="mt-3">
        {
          tab === "day"
            ? (
                <Rows
                  rows={boards.day}
                  userId={userId}
                  emptyText="Nobody has played today's Daily Arena yet."
                  showRuns={false}
                />
              )
            : (
                <Rows
                  rows={boards.weekBoard}
                  userId={userId}
                  emptyText="No practice runs this week yet. Best run counts."
                  showRuns
                />
              )
        }
      </div>
    </div>
  );
}
