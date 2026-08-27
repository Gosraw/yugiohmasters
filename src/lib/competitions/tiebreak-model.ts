// =========================================================
// COMPETITION TIEBREAK REFERENCE MODEL (2026-08-27, Track 3)
//
// IMPORTANT - what this file is and is NOT:
//
// The actual, deployed tiebreak logic lives entirely in Postgres, in
// supabase/migrations/202608271000_competition_tiebreaks.sql
// (detect_and_create_competition_tiebreaks, start_competition_
// tiebreak, submit_competition_tiebreak_match_result). Nothing in
// this file is imported or executed by that SQL, and nothing in the
// app calls into this file either - it is not production code.
//
// It exists because this sandbox has no way to run a live Postgres
// instance (vitest itself can't even execute here - see the repo's
// test-environment notes), so the plpgsql state machine can't be
// exercised directly. This module is a hand-transcribed, pure-
// TypeScript port of that exact same logic - tie-group detection,
// the 3-player "king of the hill" opponent rotation, and the streak/
// resolution rules - so the ALGORITHM can be unit-tested and
// regression-protected even though the SQL itself cannot be. Every
// function below has a comment pointing at the SQL block it mirrors;
// keep the two in sync by hand if either changes.
//
// This is NOT a substitute for integration-testing the real RPCs
// against a live Supabase/Postgres instance, which the final report
// explicitly recommends as a follow-up outside this sandbox.
// =========================================================

export type StandingRow = {
  profileId: string;
  points: number;
  headToHeadScore: number;
  duelDifferential: number;
  duelWins: number;
};

// Mirrors detect_and_create_competition_tiebreaks's grouping query:
//   group by points, head_to_head_score, duel_differential, duel_wins
//   having count(*) in (2, 3)
// Each returned group is sorted ascending by profileId, matching the
// SQL's `array_agg(profile_id order by profile_id)`.
export function detectFullTies(
  standings: StandingRow[]
): string[][] {
  const groups = new Map<string, string[]>();

  for (const row of standings) {
    const key = `${row.points}|${row.headToHeadScore}|${row.duelDifferential}|${row.duelWins}`;
    const existing = groups.get(key) ?? [];
    existing.push(row.profileId);
    groups.set(key, existing);
  }

  const result: string[][] = [];

  for (const group of groups.values()) {
    if (group.length === 2 || group.length === 3) {
      result.push([...group].sort());
    }
  }

  return result;
}

export type MatchRecord = {
  playerA: string;
  playerB: string;
  winner: string;
  loser: string;
};

export type TiebreakState = {
  status: "pending" | "in_progress" | "resolved";
  streakHolderId: string | null;
  streakCount: number;
  resolvedOrder: string[] | null;
};

export const INITIAL_TIEBREAK_STATE: TiebreakState = {
  status: "pending",
  streakHolderId: null,
  streakCount: 0,
  resolvedOrder: null,
};

// Mirrors start_competition_tiebreak's tie_size = 2 branch: the
// tied pair play a single winner-takes-all match, always the same
// two players - there is only ever one match to schedule.
export function twoPlayerMatchup(
  tiedProfileIdsSorted: string[]
): [string, string] {
  if (tiedProfileIdsSorted.length !== 2) {
    throw new Error(
      "twoPlayerMatchup requires exactly 2 tied profile ids."
    );
  }

  return [
    tiedProfileIdsSorted[0],
    tiedProfileIdsSorted[1],
  ];
}

// Mirrors submit_competition_tiebreak_match_result's tie_size = 2
// branch: resolves immediately, winner ranks above loser.
export function applyTwoPlayerResult(
  winner: string,
  loser: string
): TiebreakState {
  return {
    status: "resolved",
    streakHolderId: null,
    streakCount: 0,
    resolvedOrder: [winner, loser],
  };
}

// Mirrors start_competition_tiebreak's tie_size = 3 branch:
//   - no streak holder yet -> the first two sorted players play, the
//     third sits out;
//   - otherwise -> the streak holder plays whoever did NOT play in
//     the most recently completed tiebreak match (i.e. whoever sat
//     out last time - the previous match's loser sits out next).
// This is what guarantees a streak holder's two consecutive wins are
// always against two DIFFERENT opponents.
export function nextThreePlayerMatchup(
  tiedProfileIdsSorted: string[],
  state: TiebreakState,
  matchHistory: MatchRecord[]
): [string, string] {
  if (tiedProfileIdsSorted.length !== 3) {
    throw new Error(
      "nextThreePlayerMatchup requires exactly 3 tied profile ids."
    );
  }

  if (state.streakHolderId === null) {
    return [
      tiedProfileIdsSorted[0],
      tiedProfileIdsSorted[1],
    ];
  }

  const lastMatch =
    matchHistory[matchHistory.length - 1];

  if (!lastMatch) {
    throw new Error(
      "Tiebreak has a streak holder but no completed match - data inconsistency."
    );
  }

  const playerA = state.streakHolderId;

  const playerB = tiedProfileIdsSorted.find(
    (profileId) =>
      profileId !== lastMatch.playerA &&
      profileId !== lastMatch.playerB
  );

  if (!playerB) {
    throw new Error(
      "Could not determine the next tiebreak opponent - data inconsistency."
    );
  }

  return [playerA, playerB];
}

// Mirrors submit_competition_tiebreak_match_result's tie_size = 3
// branch: same winner as the current streak holder -> streak
// continues; a different winner -> streak resets to 1. Reaching 2
// consecutive wins resolves the tie, with resolvedOrder = [winner,
// most recent opponent, second most recent opponent] - always
// well-defined because of the opponent-rotation guarantee above.
// `matchHistoryBeforeThisMatch` must NOT include the match being
// applied.
export function applyThreePlayerResult(
  state: TiebreakState,
  winner: string,
  loser: string,
  matchHistoryBeforeThisMatch: MatchRecord[]
): TiebreakState {
  if (
    state.streakHolderId === null ||
    state.streakHolderId !== winner
  ) {
    return {
      status: "in_progress",
      streakHolderId: winner,
      streakCount: 1,
      resolvedOrder: null,
    };
  }

  const newStreakCount =
    state.streakCount + 1;

  if (newStreakCount < 2) {
    return {
      ...state,
      streakCount: newStreakCount,
    };
  }

  const mostRecentOpponent = loser;

  const priorWinForWinner = [
    ...matchHistoryBeforeThisMatch,
  ]
    .reverse()
    .find(
      (match) => match.winner === winner
    );

  if (!priorWinForWinner) {
    throw new Error(
      "Could not determine the tiebreak's prior deciding match - data inconsistency."
    );
  }

  const secondMostRecentOpponent =
    priorWinForWinner.loser;

  return {
    status: "resolved",
    streakHolderId: winner,
    streakCount: newStreakCount,
    resolvedOrder: [
      winner,
      mostRecentOpponent,
      secondMostRecentOpponent,
    ],
  };
}

// Convenience end-to-end simulator combining the matchup-selection
// and result-application functions above, for tests that want to
// play out a full sequence of sudden-death matches without
// hand-threading state between steps. `winners` is the sequence of
// match winners the test wants to script; the matchup (who plays
// whom) is always derived by the rotation rule, never chosen by the
// caller - exactly like the real RPCs, where the admin picks a
// winner but never the pairing.
export function simulateThreePlayerTiebreak(
  tiedProfileIdsSorted: string[],
  winners: string[]
): {
  finalState: TiebreakState;
  matchHistory: MatchRecord[];
} {
  let state: TiebreakState =
    INITIAL_TIEBREAK_STATE;

  const matchHistory: MatchRecord[] = [];

  for (const winner of winners) {
    if (state.status === "resolved") {
      throw new Error(
        "Cannot play another match - this tiebreak is already resolved (mirrors the RPC's own guard)."
      );
    }

    const [playerA, playerB] =
      nextThreePlayerMatchup(
        tiedProfileIdsSorted,
        state,
        matchHistory
      );

    if (winner !== playerA && winner !== playerB) {
      throw new Error(
        `Scripted winner ${winner} is not a participant in this matchup (${playerA} vs ${playerB}).`
      );
    }

    const loser =
      winner === playerA ? playerB : playerA;

    const historyBefore = [
      ...matchHistory,
    ];

    state = applyThreePlayerResult(
      state,
      winner,
      loser,
      historyBefore
    );

    matchHistory.push({
      playerA,
      playerB,
      winner,
      loser,
    });
  }

  return {
    finalState: state,
    matchHistory,
  };
}
