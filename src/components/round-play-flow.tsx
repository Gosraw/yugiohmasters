"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  CheckCircle2,
  Crown,
  LoaderCircle,
  PartyPopper,
  Swords,
  Undo2,
} from "lucide-react";

import {
  submitCompetitionMatchResultV2,
} from "@/app/actions/competitions";

import {
  requestRewardCheck,
} from "@/components/reward-popup";

import {
  play,
} from "@/lib/sound";

// =========================================================
// ROUND PLAY FLOW (2.0 "This Round")
//
// Top of /competitions/[id]/round: the current pairing as
// "X vs Y" with two big winner buttons. A tap starts a short
// "saving..." window with Undo (a mis-tap on a phone should not
// need an admin correction; leaving the page during that window
// saves the tap at once instead of dropping it); then the result
// goes to
// submit_competition_match_result_v2 and the server re-renders the
// page, so the next open pairing slides in. Finishing the last
// duel of a round shows a "Round N complete" banner above the next
// round; the DP itself arrives through the global reward pop-up.
// =========================================================

export type RoundPairing = {
  id: string;
  playerOne: {
    id: string;
    name: string;
  };
  playerTwo: {
    id: string;
    name: string;
  };
  status: "open" | "completed";
  winnerId: string | null;
  canSubmit: boolean;
};

type Pending = {
  pairingId: string;
  winnerId: string;
  loserScore: 0 | 1;
};

type Saved = {
  round: number;
  winnerName: string;
  loserName: string;
  roundComplete: boolean;
};

const UNDO_WINDOW_MS = 2200;

function scoreFor(
  pairing: RoundPairing,
  winnerId: string,
  matchFormat: "single_duel" | "best_of_3",
  loserScore: 0 | 1
) {
  const winnerScore =
    matchFormat === "best_of_3"
      ? 2
      : 1;

  const otherScore =
    matchFormat === "best_of_3"
      ? loserScore
      : 0;

  return winnerId === pairing.playerOne.id
    ? {
        one: winnerScore,
        two: otherScore,
      }
    : {
        one: otherScore,
        two: winnerScore,
      };
}

export function RoundPlayFlow({
  competitionId,
  roundNumber,
  matchFormat,
  pairings,
  currentUserId,
}: {
  competitionId: string;
  roundNumber: number;
  matchFormat: "single_duel" | "best_of_3";
  pairings: RoundPairing[];
  currentUserId: string;
}) {
  const router =
    useRouter();

  const [
    isSaving,
    startSaving,
  ] = useTransition();

  const open = pairings.filter(
    (pairing) => pairing.status === "open"
  );

  const done = pairings.filter(
    (pairing) => pairing.status === "completed"
  );

  // Prefer a duel the viewer plays in, so each player lands on
  // their own next duel when they open the page.
  const defaultFocus =
    open.find(
      (pairing) =>
        pairing.canSubmit &&
        (pairing.playerOne.id === currentUserId ||
          pairing.playerTwo.id === currentUserId)
    ) ??
    open.find(
      (pairing) => pairing.canSubmit
    ) ??
    open[0];

  const [
    chosenId,
    setChosenId,
  ] = useState<string | null>(null);

  const focused =
    open.find(
      (pairing) => pairing.id === chosenId
    ) ?? defaultFocus;

  const [
    pending,
    setPending,
  ] = useState<Pending | null>(null);

  const [
    bestOfThreeWinner,
    setBestOfThreeWinner,
  ] = useState<string | null>(null);

  const [
    saved,
    setSaved,
  ] = useState<Saved | null>(null);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const timer =
    useRef<number | null>(null);

  // The tap that is still inside its Undo window. Leaving the page
  // (link, back button, app switch, closing the tab) must not lose
  // it: it is saved right away instead (see the effect below).
  const pendingChoice =
    useRef<Pending | null>(null);

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function resultFormData(
    choice: Pending
  ) {
    const pairing = pairings.find(
      (item) => item.id === choice.pairingId
    );

    if (!pairing) {
      return null;
    }

    const score = scoreFor(
      pairing,
      choice.winnerId,
      matchFormat,
      choice.loserScore
    );

    const formData = new FormData();
    formData.set("match_id", pairing.id);
    formData.set("competition_id", competitionId);
    formData.set("player_one_duel_wins", String(score.one));
    formData.set("player_two_duel_wins", String(score.two));

    return {
      pairing,
      formData,
    };
  }

  const flushRef =
    useRef<(leaving: boolean) => void>(() => {});

  function commit(
    choice: Pending
  ) {
    clearTimer();
    pendingChoice.current = null;

    const built =
      resultFormData(choice);

    if (!built) {
      setPending(null);
      return;
    }

    const {
      pairing,
      formData,
    } = built;

    const winnerName =
      choice.winnerId === pairing.playerOne.id
        ? pairing.playerOne.name
        : pairing.playerTwo.name;

    const loserName =
      choice.winnerId === pairing.playerOne.id
        ? pairing.playerTwo.name
        : pairing.playerOne.name;

    const roundComplete =
      open.length === 1 &&
      open[0].id === pairing.id;

    startSaving(async () => {
      const result =
        await submitCompetitionMatchResultV2(
          {
            status: "idle",
          },
          formData
        );

      setPending(null);
      setBestOfThreeWinner(null);
      setChosenId(null);

      if (result.status === "error") {
        // Someone else (the opponent on their own phone) was
        // faster: the duel is already recorded, just reload.
        if (/already has a result/i.test(result.error)) {
          setError(
            "This duel was already recorded by someone else."
          );
        } else {
          setError(result.error);
        }

        router.refresh();
        return;
      }

      setError(null);

      setSaved({
        round: roundNumber,
        winnerName,
        loserName,
        roundComplete,
      });

      play(roundComplete ? "roundComplete" : "chime");

      requestRewardCheck();
      router.refresh();
    });
  }

  function choose(
    pairingId: string,
    winnerId: string,
    loserScore: 0 | 1 = 0
  ) {
    const choice: Pending = {
      pairingId,
      winnerId,
      loserScore,
    };

    setError(null);
    setSaved(null);
    setPending(choice);

    clearTimer();

    pendingChoice.current = choice;

    timer.current = window.setTimeout(
      () => commit(choice),
      UNDO_WINDOW_MS
    );
  }

  function undo() {
    clearTimer();
    pendingChoice.current = null;
    setPending(null);
    setBestOfThreeWinner(null);
  }

  // Updated after every render (refs may not be written during
  // render), so the listeners always save the current tap.
  useEffect(() => {
    flushRef.current = (
      leaving: boolean
    ) => {
      const choice =
        pendingChoice.current;

      if (!choice || timer.current === null) {
        return;
      }

      if (!leaving) {
        commit(choice);
        return;
      }

      // Unmounting: no UI left to update, just save the result.
      clearTimer();
      pendingChoice.current = null;

      const built =
        resultFormData(choice);

      if (!built) {
        return;
      }

      void submitCompetitionMatchResultV2(
        {
          status: "idle",
        },
        built.formData
      )
        .then(() => {
          requestRewardCheck();
        })
        .catch(() => {
          // Nothing to show it on any more; the round screen shows
          // the duel as still open next time.
        });
    };
  });

  useEffect(() => {
    function onHide() {
      if (document.visibilityState === "hidden") {
        flushRef.current(false);
      }
    }

    function onPageHide() {
      flushRef.current(false);
    }

    document.addEventListener(
      "visibilitychange",
      onHide
    );

    window.addEventListener(
      "pagehide",
      onPageHide
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        onHide
      );

      window.removeEventListener(
        "pagehide",
        onPageHide
      );

      flushRef.current(true);
    };
  }, []);

  const tapWinner = (
    pairing: RoundPairing,
    winnerId: string
  ) => {
    if (matchFormat === "best_of_3") {
      setBestOfThreeWinner(winnerId);
      return;
    }

    choose(pairing.id, winnerId);
  };

  const pendingWinnerName =
    pending && focused
      ? pending.winnerId === focused.playerOne.id
        ? focused.playerOne.name
        : focused.playerTwo.name
      : null;

  return (
    <div className="mt-5">
      {saved && (
        <div
          role="status"
          className={`mb-3 flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm font-bold transition-opacity duration-300 starting:opacity-0 ${
            saved.roundComplete
              ? "border-amber-300/40 bg-amber-300/10 text-amber-100"
              : "border-emerald-300/25 bg-emerald-300/[0.07] text-emerald-100"
          }`}
        >
          {saved.roundComplete ? (
            <PartyPopper
              size={18}
              className="shrink-0 text-amber-300"
            />
          ) : (
            <CheckCircle2
              size={18}
              className="shrink-0 text-emerald-300"
            />
          )}

          <span>
            {saved.roundComplete
              ? `Round ${saved.round} complete! ${saved.winnerName} beat ${saved.loserName}.`
              : `${saved.winnerName} beat ${saved.loserName}.`}
          </span>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-200"
        >
          {error}
        </p>
      )}

      {/* PROGRESS */}

      <div
        className="flex items-center gap-1.5"
        aria-label={`${done.length} of ${pairings.length} duels played`}
      >
        {pairings.map(
          (pairing) => (
            <span
              key={pairing.id}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                pairing.status === "completed"
                  ? "bg-amber-300"
                  : pairing.id === focused?.id
                    ? "bg-amber-300/35"
                    : "bg-white/[0.08]"
              }`}
            />
          )
        )}
      </div>

      <p className="mt-1.5 text-[11px] font-bold text-zinc-500">
        {done.length} of {pairings.length} duels played
      </p>

      {/* CURRENT PAIRING */}

      {focused ? (
        <section
          key={focused.id}
          className="arena-frame panel relative mt-3 overflow-hidden p-4 transition-[opacity,transform] duration-300 ease-[cubic-bezier(.23,1,.32,1)] starting:translate-y-2 starting:opacity-0 motion-reduce:transform-none motion-reduce:starting:transform-none"
        >
          <p className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.2em] text-amber-300/80">
            <Swords
              size={12}
            />
            Now playing
          </p>

          <div className="mt-2 flex items-center justify-center gap-3 text-center">
            <span className="min-w-0 flex-1 truncate text-right text-xl font-black text-zinc-100">
              {focused.playerOne.name}
            </span>

            <span className="font-display shrink-0 text-xs font-bold text-amber-300/70">
              VS
            </span>

            <span className="min-w-0 flex-1 truncate text-left text-xl font-black text-zinc-100">
              {focused.playerTwo.name}
            </span>
          </div>

          {pending && pending.pairingId === focused.id ? (
            <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/[0.08] p-4">
              <p className="text-center text-base font-black text-amber-100">
                {pendingWinnerName} wins
                {matchFormat === "best_of_3"
                  ? ` 2–${pending.loserScore}`
                  : ""}
              </p>

              <div
                aria-hidden
                className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.08]"
              >
                <div
                  className="h-full w-full origin-left rounded-full bg-amber-300"
                  style={{
                    animation: isSaving
                      ? undefined
                      : `round-undo-shrink ${UNDO_WINDOW_MS}ms linear forwards`,
                  }}
                />
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={undo}
                  disabled={isSaving}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--dc-radius-md)] border border-white/15 px-3 py-3 text-sm font-black text-zinc-200 transition-colors hover:border-white/30 disabled:opacity-40"
                >
                  <Undo2
                    size={15}
                  />
                  Undo
                </button>

                <button
                  type="button"
                  onClick={() => commit(pending)}
                  disabled={isSaving}
                  className="primary-button inline-flex flex-1 items-center justify-center gap-1.5 text-sm"
                >
                  {isSaving ? (
                    <>
                      <LoaderCircle
                        size={15}
                        className="animate-spin motion-reduce:animate-none"
                      />
                      Saving...
                    </>
                  ) : (
                    "Save now"
                  )}
                </button>
              </div>
            </div>
          ) : bestOfThreeWinner ? (
            <div className="mt-4">
              <p className="text-center text-[11px] font-black uppercase tracking-wider text-zinc-500">
                Final score
              </p>

              <div className="mt-2 grid grid-cols-2 gap-2.5">
                {([0, 1] as const).map(
                  (loserScore) => (
                    <button
                      key={loserScore}
                      type="button"
                      onClick={() =>
                        choose(
                          focused.id,
                          bestOfThreeWinner,
                          loserScore
                        )
                      }
                      className="min-h-16 rounded-2xl border border-amber-300/30 bg-amber-300/[0.07] text-lg font-black text-amber-100 transition-transform active:scale-[.97] motion-reduce:active:scale-100"
                    >
                      2–{loserScore}
                    </button>
                  )
                )}
              </div>

              <button
                type="button"
                onClick={() => setBestOfThreeWinner(null)}
                className="mt-2 w-full py-2 text-xs font-bold text-zinc-500"
              >
                Back
              </button>
            </div>
          ) : (
            <>
              <p className="mt-4 text-center text-[11px] font-black uppercase tracking-[.2em] text-zinc-500">
                Who won?
              </p>

              <div className="mt-2 grid grid-cols-2 gap-2.5">
                {[focused.playerOne, focused.playerTwo].map(
                  (player) => (
                    <button
                      key={player.id}
                      type="button"
                      disabled={!focused.canSubmit || isSaving}
                      onClick={() =>
                        tapWinner(
                          focused,
                          player.id
                        )
                      }
                      className="group flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border border-amber-300/30 bg-gradient-to-b from-amber-300/[0.12] to-amber-300/[0.03] px-2 py-3 text-center transition-[transform,border-color,background-color] duration-150 ease-out hover:border-amber-300/60 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:active:scale-100"
                    >
                      <Crown
                        size={20}
                        className="text-amber-300"
                      />

                      <span className="w-full truncate text-base font-black text-zinc-100">
                        {player.name}
                      </span>

                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-300/70">
                        won
                      </span>
                    </button>
                  )
                )}
              </div>

              {!focused.canSubmit && (
                <p className="mt-3 text-center text-xs text-zinc-500">
                  Only {focused.playerOne.name}, {focused.playerTwo.name} or the admin can record this duel.
                </p>
              )}
            </>
          )}
        </section>
      ) : (
        <section className="panel mt-3 p-5 text-center text-sm font-bold text-zinc-400">
          Every duel of this round has a result.
        </section>
      )}

      {/* UP NEXT */}

      {open.length > 1 && (
        <div className="mt-3">
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-zinc-500">
            Also this round
          </p>

          <ul className="mt-1.5 grid gap-1.5">
            {open
              .filter(
                (pairing) => pairing.id !== focused?.id
              )
              .map(
                (pairing) => (
                  <li key={pairing.id}>
                    <button
                      type="button"
                      onClick={() => {
                        undo();
                        setChosenId(pairing.id);
                      }}
                      disabled={isSaving}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-3 text-left text-sm font-bold text-zinc-300 transition-colors hover:border-amber-300/30 disabled:opacity-40"
                    >
                      <span className="truncate">
                        {pairing.playerOne.name} vs {pairing.playerTwo.name}
                      </span>

                      <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-amber-300/80">
                        Play this
                      </span>
                    </button>
                  </li>
                )
              )}
          </ul>
        </div>
      )}

      {/* DONE THIS ROUND */}

      {done.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-zinc-500">
            Played
          </p>

          <ul className="mt-1.5 grid gap-1.5">
            {done.map(
              (pairing) => {
                const winner =
                  pairing.winnerId === pairing.playerOne.id
                    ? pairing.playerOne
                    : pairing.playerTwo;

                const loser =
                  winner.id === pairing.playerOne.id
                    ? pairing.playerTwo
                    : pairing.playerOne;

                return (
                  <li
                    key={pairing.id}
                    className="flex items-center gap-2 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.04] px-3.5 py-2.5 text-sm"
                  >
                    <CheckCircle2
                      size={15}
                      className="shrink-0 text-emerald-300"
                    />

                    <span className="min-w-0 truncate text-zinc-300">
                      <span className="font-black text-zinc-100">
                        {winner.name}
                      </span>{" "}
                      beat {loser.name}
                    </span>
                  </li>
                );
              }
            )}
          </ul>
        </div>
      )}

      <style>{`
        @keyframes round-undo-shrink {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="round-undo-shrink"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
