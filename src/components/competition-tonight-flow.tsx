"use client";

import {
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import Link from "next/link";

import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Play,
  Sparkles,
  Swords,
} from "lucide-react";

import {
  confirmBossAchievementEvent,
} from "@/app/actions/boss-routes";

import {
  CompetitionMatchResultFormV2,
} from "@/components/competition-match-result-form-v2";

import {
  MatchResultSummary,
} from "@/components/match-result-summary";

import type {
  MatchResultActionState,
} from "@/app/actions/competitions";

export type TonightProfile = {
  id: string;
  username: string | null;
  duelist_name: string | null;
};

export type TonightMatch = {
  id: string;
  player_one_id: string;
  player_two_id: string;
  status: string;
  winner_id: string | null;
  round_number: number | null;
  meeting_number: number | null;
  match_format: "single_duel" | "best_of_3";
  player_one_duel_wins: number;
  player_two_duel_wins: number;
};

export type TonightBossEvent = {
  id: string;
  label: string;
  description: string | null;
  isFinishingBlow: boolean;
};

export type TonightBossPath = {
  id: string;
  profileId: string;
  routeName: string;
  currentStage: number;
  events: TonightBossEvent[];
};

type CompetitionTonightFlowProps = {
  competitionId: string;
  currentUserId: string;
  matchFormat: "single_duel" | "best_of_3";
  currentRound: number | null;
  totalRounds: number | null;
  matches: TonightMatch[];
  profiles: TonightProfile[];
  bossPaths: TonightBossPath[];
};

function labelFor(
  profiles: TonightProfile[],
  profileId: string
) {
  const profile = profiles.find((p) => p.id === profileId);
  return profile?.duelist_name ?? profile?.username ?? "Duelist";
}

function BossEventRow({
  matchId,
  playerBossPathId,
  event,
}: {
  matchId: string;
  playerBossPathId: string;
  event: TonightBossEvent;
}) {
  const [
    state,
    setState,
  ] = useState<"idle" | "pending" | "done" | "skipped" | "error">("idle");

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  async function confirmYes() {
    setState("pending");
    setError(null);

    const formData = new FormData();
    formData.set("match_id", matchId);
    formData.set("player_boss_path_id", playerBossPathId);
    formData.set("event_id", event.id);

    try {
      await confirmBossAchievementEvent(formData);
      setState("done");
    } catch (err) {
      setState("error");
      setError(
        err instanceof Error ? err.message : "Could not confirm this event."
      );
    }
  }

  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black text-zinc-200">
            {event.label}
            {event.isFinishingBlow && (
              <span className="ml-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300">
                Finishing Blow
              </span>
            )}
          </p>
          {event.description && (
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {event.description}
            </p>
          )}
        </div>

        {state === "done" ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-[10px] font-black text-emerald-200">
            <CheckCircle2 size={12} />
            Yes
          </span>
        ) : state === "skipped" ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-[10px] font-black text-zinc-500">
            <Circle size={12} />
            No
          </span>
        ) : (
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={confirmYes}
              disabled={state === "pending"}
              className="rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1.5 text-[10px] font-black text-emerald-200 disabled:opacity-40"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setState("skipped")}
              disabled={state === "pending"}
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-black text-zinc-500 disabled:opacity-40"
            >
              No
            </button>
          </div>
        )}
      </div>

      {state === "error" && error && (
        <p className="mt-1.5 text-[10px] font-bold text-red-300">{error}</p>
      )}
    </div>
  );
}

function MatchWizard({
  competitionId,
  currentUserId,
  match,
  matchFormat,
  profiles,
  bossPaths,
  hasNextMatch,
}: {
  competitionId: string;
  currentUserId: string;
  match: TonightMatch;
  matchFormat: "single_duel" | "best_of_3";
  profiles: TonightProfile[];
  bossPaths: TonightBossPath[];
  hasNextMatch: boolean;
}) {
  const router = useRouter();

  const [
    phase,
    setPhase,
  ] = useState<"pre" | "record" | "boss" | "complete">("pre");

  const [
    settled,
    setSettled,
  ] = useState<
    (MatchResultActionState & { status: "success" }) | null
  >(null);

  const playerOneLabel = labelFor(profiles, match.player_one_id);
  const playerTwoLabel = labelFor(profiles, match.player_two_id);

  const currentUserIsPlayer =
    currentUserId === match.player_one_id || currentUserId === match.player_two_id;

  const opponentProfileId = currentUserIsPlayer
    ? currentUserId === match.player_one_id
      ? match.player_two_id
      : match.player_one_id
    : null;

  const confirmableBossPaths = opponentProfileId
    ? bossPaths.filter(
        (path) =>
          path.profileId === opponentProfileId && path.events.length > 0
      )
    : [];

  const hasBossQuestions = confirmableBossPaths.length > 0;

  return (
    <div className="mt-4 panel p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-300">
          <Swords size={12} />
          Round {match.round_number}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-center gap-3 text-center">
        <span className="text-base font-black text-white">
          {playerOneLabel}
        </span>
        <span className="text-xs font-black text-zinc-500">VS</span>
        <span className="text-base font-black text-white">
          {playerTwoLabel}
        </span>
      </div>

      {phase === "pre" && (
        <button
          type="button"
          onClick={() => setPhase("record")}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-200"
        >
          <Play size={16} />
          Start Match
        </button>
      )}

      {phase === "record" && (
        <>
          <p className="mt-4 text-center text-[10px] font-black uppercase tracking-wider text-zinc-500">
            Who Won?
          </p>

          <CompetitionMatchResultFormV2
            matchId={match.id}
            competitionId={competitionId}
            matchFormat={matchFormat}
            playerOneLabel={playerOneLabel}
            playerTwoLabel={playerTwoLabel}
            mode="submit"
            onSettled={(state) => {
              setSettled(state);
              setPhase(hasBossQuestions ? "boss" : "complete");
            }}
          />
        </>
      )}

      {phase === "boss" && (
        <div className="mt-4 space-y-3">
          <p className="text-center text-[10px] font-black uppercase tracking-wider text-amber-300">
            Boss Progress
          </p>

          {confirmableBossPaths.map((path) => (
            <div key={path.id} className="space-y-1.5">
              <p className="text-[11px] font-black text-zinc-400">
                Confirm {labelFor(profiles, path.profileId)} · {path.routeName}{" "}
                (Stage {path.currentStage})
              </p>

              {path.events.map((event) => (
                <BossEventRow
                  key={event.id}
                  matchId={match.id}
                  playerBossPathId={path.id}
                  event={event}
                />
              ))}
            </div>
          ))}

          <button
            type="button"
            onClick={() => setPhase("complete")}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm font-black text-amber-200"
          >
            Continue
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {phase === "complete" && (
        <div className="mt-2">
          {settled?.summary ? (
            <MatchResultSummary summary={settled.summary} />
          ) : (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-300/[0.04] p-3 text-xs font-black text-emerald-200">
              <CheckCircle2 size={14} />
              Result saved.
            </div>
          )}

          {hasNextMatch ? (
            <button
              type="button"
              onClick={() => router.refresh()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-200"
            >
              Next Match
              <ArrowRight size={16} />
            </button>
          ) : (
            <Link
              href={`/competitions/${competitionId}`}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-purple-300/30 bg-purple-300/10 px-4 py-3 text-sm font-black text-purple-200"
            >
              <Sparkles size={16} />
              View Final Results
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export function CompetitionTonightFlow({
  competitionId,
  currentUserId,
  matchFormat,
  currentRound,
  matches,
  profiles,
  bossPaths,
}: CompetitionTonightFlowProps) {
  if (matches.length === 0) {
    return (
      <div className="mt-4 panel p-4 text-center text-sm font-bold text-zinc-400">
        No matches scheduled yet.
      </div>
    );
  }

  const currentMatch =
    currentRound !== null
      ? matches.find((m) => m.round_number === currentRound)
      : undefined;

  if (!currentMatch) {
    return (
      <div className="mt-4 panel p-4 text-center">
        <p className="text-sm font-black text-purple-200">
          Every match is complete. Tonight is in the books!
        </p>
        <Link
          href={`/competitions/${competitionId}`}
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-purple-300/30 bg-purple-300/10 px-4 py-2.5 text-xs font-black text-purple-200"
        >
          <Sparkles size={14} />
          View Final Results
        </Link>
      </div>
    );
  }

  const byePlayer = profiles.find(
    (p) =>
      p.id !== currentMatch.player_one_id &&
      p.id !== currentMatch.player_two_id
  );

  const hasNextMatch = matches.some(
    (m) =>
      currentRound !== null &&
      m.round_number === currentRound + 1
  );

  return (
    <>
      {byePlayer && (
        <p className="mt-3 text-center text-[11px] font-bold text-zinc-500">
          {labelFor(profiles, byePlayer.id)} sits out this round.
        </p>
      )}

      <MatchWizard
        key={currentMatch.id}
        competitionId={competitionId}
        currentUserId={currentUserId}
        match={currentMatch}
        matchFormat={matchFormat}
        profiles={profiles}
        bossPaths={bossPaths}
        hasNextMatch={hasNextMatch}
      />
    </>
  );
}
