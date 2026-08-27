"use client";

import {
  useState,
} from "react";

import {
  CheckCircle2,
  Pencil,
} from "lucide-react";

import {
  correctCompetitionMatchResultV2,
  submitCompetitionMatchResultV2,
  submitCompetitionTiebreakMatchResult,
} from "@/app/actions/competitions";

import {
  SubmitButton,
} from "@/components/submit-button";

// =========================================================
// COMPETITION MATCH RESULT FORM (V2)
//
// Single Duel: two buttons, pick the winner directly.
// Best of 3: four legal score presets only (2-0 / 2-1 either
// way) - 3-0, 2-2 and similar illegal scores are simply not
// offered as options, on top of the server-side validation.
//
// mode="submit" for an open match's first result.
// mode="correct" for fixing an already-completed match - adds a
// required reason field and calls the correction action instead.
// mode="tiebreak" for an open tiebreak match (Track 3, 2026-08-27) -
// same score-preset UI, calls submitCompetitionTiebreakMatchResult
// instead. No reason field: a tiebreak match is always a first
// submission, never a correction (correcting a resolved tiebreak's
// match is a documented out-of-scope edge case - see the header
// comment in 202608271000_competition_tiebreaks.sql). Reusing this
// component (rather than a parallel copy) keeps the single-duel/
// best-of-3 preset logic and score validation UI in exactly one
// place, which is also why the server functions share their score
// validation code with submit_competition_match_result_v2.
// =========================================================

type CompetitionMatchResultFormV2Props = {
  matchId: string;
  competitionId: string;
  matchFormat: "single_duel" | "best_of_3";
  playerOneLabel: string;
  playerTwoLabel: string;
  mode: "submit" | "correct" | "tiebreak";
};

const BO3_PRESETS: {
  label: string;
  playerOneWins: number;
  playerTwoWins: number;
}[] = [
  { label: "2-0", playerOneWins: 2, playerTwoWins: 0 },
  { label: "2-1", playerOneWins: 2, playerTwoWins: 1 },
  { label: "1-2", playerOneWins: 1, playerTwoWins: 2 },
  { label: "0-2", playerOneWins: 0, playerTwoWins: 2 },
];

export function CompetitionMatchResultFormV2({
  matchId,
  competitionId,
  matchFormat,
  playerOneLabel,
  playerTwoLabel,
  mode,
}: CompetitionMatchResultFormV2Props) {
  const [
    selected,
    setSelected,
  ] = useState<{
    playerOneWins: number;
    playerTwoWins: number;
  } | null>(null);

  const [
    showReason,
    setShowReason,
  ] = useState(false);

  const action =
    mode === "correct"
      ? correctCompetitionMatchResultV2
      : mode === "tiebreak"
        ? submitCompetitionTiebreakMatchResult
        : submitCompetitionMatchResultV2;

  if (mode === "correct" && !showReason) {
    return (
      <button
        type="button"
        onClick={() => setShowReason(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-black text-zinc-400 transition hover:border-amber-300/30 hover:text-amber-200"
      >
        <Pencil size={11} />
        Correct result
      </button>
    );
  }

  return (
    <form
      action={action}
      className="mt-3 space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"
    >
      <input type="hidden" name="match_id" value={matchId} />
      <input type="hidden" name="competition_id" value={competitionId} />

      {selected && (
        <>
          <input
            type="hidden"
            name="player_one_duel_wins"
            value={selected.playerOneWins}
          />
          <input
            type="hidden"
            name="player_two_duel_wins"
            value={selected.playerTwoWins}
          />
        </>
      )}

      {matchFormat === "single_duel" ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              setSelected({ playerOneWins: 1, playerTwoWins: 0 })
            }
            className={`rounded-lg border px-3 py-2 text-xs font-black transition ${
              selected?.playerOneWins === 1
                ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-200"
                : "border-white/10 text-zinc-400"
            }`}
          >
            {playerOneLabel} wins
          </button>

          <button
            type="button"
            onClick={() =>
              setSelected({ playerOneWins: 0, playerTwoWins: 1 })
            }
            className={`rounded-lg border px-3 py-2 text-xs font-black transition ${
              selected?.playerTwoWins === 1
                ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-200"
                : "border-white/10 text-zinc-400"
            }`}
          >
            {playerTwoLabel} wins
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {BO3_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() =>
                setSelected({
                  playerOneWins: preset.playerOneWins,
                  playerTwoWins: preset.playerTwoWins,
                })
              }
              className={`rounded-lg border px-3 py-2 text-xs font-black transition ${
                selected?.playerOneWins === preset.playerOneWins &&
                selected?.playerTwoWins === preset.playerTwoWins
                  ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-200"
                  : "border-white/10 text-zinc-400"
              }`}
            >
              {playerOneLabel} {preset.label} {playerTwoLabel}
            </button>
          ))}
        </div>
      )}

      {mode === "correct" && (
        <label className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-zinc-500">
            Reason for correction
          </span>

          <input
            type="text"
            name="reason"
            required
            maxLength={200}
            placeholder="e.g. score was recorded wrong"
            className="field w-full text-sm"
          />
        </label>
      )}

      <SubmitButton
        pendingLabel="Saving..."
        disabled={!selected}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-xs font-black text-emerald-200 disabled:opacity-40"
      >
        <CheckCircle2 size={14} />
        {mode === "correct"
          ? "Save Correction"
          : mode === "tiebreak"
            ? "Save Tiebreak Result"
            : "Save Result"}
      </SubmitButton>
    </form>
  );
}
