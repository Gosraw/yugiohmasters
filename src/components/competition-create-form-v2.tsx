"use client";

import {
  useMemo,
  useState,
} from "react";

import {
  Plus,
  Users,
} from "lucide-react";

import {
  createCompetitionV2,
} from "@/app/actions/competitions";

import {
  SubmitButton,
} from "@/components/submit-button";

// =========================================================
// COMPETITION CREATE FORM (V2)
//
// Admin picks name, players, meetings per pairing (1x/2x/3x/
// custom) and match format, and sees a live preview before
// creating anything - total matches and (for Best of 3) the
// maximum possible duels, with an explicit note that Best of 3
// ends early on a 2-0.
// =========================================================

type LeagueMemberOption = {
  profileId: string;
  label: string;
};

type CompetitionCreateFormV2Props = {
  leagueId: string;
  members: LeagueMemberOption[];
};

const MEETING_PRESETS = [1, 2, 3];

export function CompetitionCreateFormV2({
  leagueId,
  members,
}: CompetitionCreateFormV2Props) {
  const [
    selectedIds,
    setSelectedIds,
  ] = useState<
    Set<string>
  >(new Set());

  const [
    meetingsMode,
    setMeetingsMode,
  ] = useState<
    "1" | "2" | "3" | "custom"
  >("1");

  const [
    customMeetings,
    setCustomMeetings,
  ] = useState("4");

  const [
    matchFormat,
    setMatchFormat,
  ] = useState<
    "single_duel" | "best_of_3"
  >("single_duel");

  const meetings = useMemo(() => {
    if (meetingsMode === "custom") {
      const parsed = Number.parseInt(
        customMeetings,
        10
      );

      return Number.isFinite(parsed) && parsed >= 1
        ? parsed
        : 1;
    }

    return Number.parseInt(meetingsMode, 10);
  }, [meetingsMode, customMeetings]);

  const playerCount = selectedIds.size;

  const totalMatches =
    playerCount >= 2
      ? ((playerCount * (playerCount - 1)) / 2) * meetings
      : 0;

  const maxDuels =
    matchFormat === "best_of_3"
      ? totalMatches * 3
      : totalMatches;

  function toggle(profileId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (next.has(profileId)) {
        next.delete(profileId);
      } else {
        next.add(profileId);
      }

      return next;
    });
  }

  return (
    <form
      action={createCompetitionV2}
      className="mt-6 space-y-5"
    >
      <input
        type="hidden"
        name="league_id"
        value={leagueId}
      />

      <input
        type="hidden"
        name="meetings_per_pairing"
        value={meetings}
      />

      <input
        type="hidden"
        name="match_format"
        value={matchFormat}
      />

      <label className="block">
        <span className="mb-2 block text-xs font-black uppercase tracking-wider text-zinc-500">
          Name
        </span>

        <input
          type="text"
          name="name"
          required
          maxLength={100}
          placeholder="Season 1 Circuit"
          className="field w-full"
        />
      </label>

      <div>
        <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-500">
          <Users size={13} />
          Players
        </span>

        <div className="space-y-2">
          {members.map((member) => (
            <label
              key={member.profileId}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"
            >
              <input
                type="checkbox"
                name="player_ids"
                value={member.profileId}
                checked={selectedIds.has(member.profileId)}
                onChange={() => toggle(member.profileId)}
                className="h-4 w-4"
              />

              <span className="font-bold text-zinc-200">
                {member.label}
              </span>
            </label>
          ))}
        </div>

        {playerCount < 2 && (
          <p className="mt-2 text-xs text-amber-300">
            Select at least 2 players.
          </p>
        )}
      </div>

      <div>
        <span className="mb-2 block text-xs font-black uppercase tracking-wider text-zinc-500">
          Meetings per pairing
        </span>

        <div className="flex flex-wrap gap-2">
          {MEETING_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() =>
                setMeetingsMode(
                  String(preset) as "1" | "2" | "3"
                )
              }
              className={`rounded-xl border px-4 py-2 text-sm font-black transition ${
                meetingsMode === String(preset)
                  ? "border-amber-300/40 bg-amber-300/10 text-amber-200"
                  : "border-white/10 bg-white/[0.02] text-zinc-400"
              }`}
            >
              {preset}×
            </button>
          ))}

          <button
            type="button"
            onClick={() => setMeetingsMode("custom")}
            className={`rounded-xl border px-4 py-2 text-sm font-black transition ${
              meetingsMode === "custom"
                ? "border-amber-300/40 bg-amber-300/10 text-amber-200"
                : "border-white/10 bg-white/[0.02] text-zinc-400"
            }`}
          >
            Custom
          </button>

          {meetingsMode === "custom" && (
            <input
              type="number"
              min={1}
              value={customMeetings}
              onChange={(event) =>
                setCustomMeetings(event.target.value)
              }
              className="field w-20"
            />
          )}
        </div>
      </div>

      <div>
        <span className="mb-2 block text-xs font-black uppercase tracking-wider text-zinc-500">
          Match Format
        </span>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMatchFormat("single_duel")}
            className={`rounded-xl border px-4 py-2 text-sm font-black transition ${
              matchFormat === "single_duel"
                ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-200"
                : "border-white/10 bg-white/[0.02] text-zinc-400"
            }`}
          >
            Single Duel
          </button>

          <button
            type="button"
            onClick={() => setMatchFormat("best_of_3")}
            className={`rounded-xl border px-4 py-2 text-sm font-black transition ${
              matchFormat === "best_of_3"
                ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-200"
                : "border-white/10 bg-white/[0.02] text-zinc-400"
            }`}
          >
            Best of 3
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-4">
        <p className="text-xs font-black uppercase tracking-wider text-amber-300">
          Preview
        </p>

        <p className="mt-2 text-sm leading-6 text-zinc-300">
          {playerCount} players · {meetings} meeting{meetings === 1 ? "" : "s"} per pairing ·{" "}
          <span className="font-black text-zinc-100">
            {totalMatches} matches total
          </span>{" "}
          ·{" "}
          {matchFormat === "best_of_3"
            ? "Best of 3"
            : "Single Duel"}
          {matchFormat === "best_of_3" && (
            <>
              {" "}
              · maximum {maxDuels} duels
            </>
          )}
        </p>

        {matchFormat === "best_of_3" && (
          <p className="mt-1 text-xs text-zinc-500">
            Best of 3 ends early on a 2-0 - the third duel is never required.
          </p>
        )}
      </div>

      <SubmitButton
        pendingLabel="Creating..."
        disabled={playerCount < 2}
        className="primary-button inline-flex w-full items-center justify-center gap-2"
      >
        <Plus size={17} />
        Create Competition
      </SubmitButton>
    </form>
  );
}
