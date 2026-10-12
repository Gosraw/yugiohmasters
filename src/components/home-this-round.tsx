import Link from "next/link";

import {
  HomeCard,
} from "@/components/home-card";

// =========================================================
// HOME: THIS ROUND card (2.0)
//
// Your next pairing in the season competition ("BossG VS Fardin")
// with a link to the round screen (/competitions/[id]/round), where
// the winner is tapped. Quiet states when you already played every
// duel of this round, when the season is finished, or when no
// season competition is running.
// =========================================================

export type HomeRoundState =
  | {
      state: "none";
    }
  | {
      state: "finished";
      competitionId: string;
      competitionName: string;
    }
  | {
      state: "play" | "waiting";
      competitionId: string;
      round: number;
      totalRounds: number;
      myName: string;
      opponentName: string | null;
      duelsPlayed: number;
      duelsInRound: number;
    };

function Duelist({
  name,
  me = false,
}: {
  name: string;
  me?: boolean;
}) {
  return (
    <span
      className={`min-w-0 flex-1 truncate rounded-xl border px-2 py-2.5 text-center text-[13px] font-semibold ${
        me
          ? "border-[rgb(242_196_90/.35)] bg-[rgb(242_196_90/.08)] text-zinc-50"
          : "border-[rgb(120_150_230/.25)] bg-[rgb(40_60_120/.35)] text-zinc-100"
      }`}
    >
      {name}
    </span>
  );
}

export function HomeThisRound({
  round,
}: {
  round: HomeRoundState;
}) {
  if (round.state === "none") {
    return (
      <HomeCard title="This round">
        <p className="text-sm text-zinc-500">
          No season round is running yet.
        </p>
      </HomeCard>
    );
  }

  const href =
    `/competitions/${round.competitionId}/round`;

  if (round.state === "finished") {
    return (
      <HomeCard
        title="Season complete"
        href={`/competitions/${round.competitionId}`}
        hrefLabel="Final standings"
      >
        <p className="text-sm text-zinc-400">
          {round.competitionName} is complete. Every duel has been played.
        </p>
      </HomeCard>
    );
  }

  const roundLabel =
    round.totalRounds > 0
      ? `Round ${round.round} of ${round.totalRounds}`
      : `Round ${round.round}`;

  return (
    <HomeCard
      title={`This round · Round ${round.round}`}
      aside={`${round.duelsPlayed} / ${round.duelsInRound} played`}
    >
      {round.state === "play" && round.opponentName ? (
        <Link
          href={href}
          aria-label={`${roundLabel}: you vs ${round.opponentName}. Open the round to tap the winner.`}
          className="group block rounded-xl transition-transform active:scale-[0.99]"
        >
          <span className="mt-1 flex items-center justify-between gap-2">
            <Duelist
              name={round.myName}
              me
            />

            <b className="font-display text-sm text-gold">
              VS
            </b>

            <Duelist
              name={round.opponentName}
            />
          </span>

          <span className="mt-2.5 flex items-center justify-between text-[12px]">
            <span className="text-zinc-500">
              {roundLabel}
            </span>

            <span className="font-semibold text-gold transition-colors group-hover:text-gold-bright">
              Tap the winner →
            </span>
          </span>
        </Link>
      ) : (
        <Link
          href={href}
          className="flex min-h-11 items-center justify-between gap-3 text-[13px]"
        >
          <span className="text-zinc-400">
            You&apos;ve played your duels. Waiting on the others.
          </span>

          <span className="shrink-0 font-semibold text-gold">
            Standings →
          </span>
        </Link>
      )}
    </HomeCard>
  );
}
