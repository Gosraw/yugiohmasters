// =========================================================
// ROUND REWARD SETTLEMENT REFERENCE MODEL
// (2026-08-30, autonomous work session Priority 1)
//
// Same caveat as ./match-reward-model.ts and ./tiebreak-model.ts:
// this is a hand-transcribed, pure-TypeScript port of logic that
// actually lives in Postgres - public.settle_round_rewards_v2, in
// supabase/migrations/202608301500_round_reward_settlement_and_auto_
// finalize.sql. Nothing here is imported by the app or the SQL; it
// exists purely so the settlement LOGIC (who is a round participant,
// who is a round winner, what the idempotency key looks like) can be
// unit-tested in a sandbox that cannot run Postgres or execute
// vitest against this repo's native-binary dependencies. Keep this
// in sync by hand if the SQL changes.
// =========================================================

export type RoundMatch = {
  playerOneId: string;
  playerTwoId: string;
  winnerId: string | null;
  status: string;
};

// Mirrors settle_round_rewards_v2's two early-return guards: a round
// with zero matches, or any match not yet 'completed', is not ready
// to settle.
export function isRoundReadyToSettle(
  matches: RoundMatch[]
): boolean {
  if (matches.length === 0) {
    return false;
  }

  return matches.every(
    (match) => match.status === "completed"
  );
}

// Mirrors the 'participation' loop: every distinct profile appearing
// as either player across every match in the round.
export function roundParticipants(
  matches: RoundMatch[]
): string[] {
  const ids = new Set<string>();

  for (const match of matches) {
    ids.add(match.playerOneId);
    ids.add(match.playerTwoId);
  }

  return Array.from(ids);
}

// Mirrors the 'round_winner' loop: the distinct winner_id of every
// individual match in the round (NOT a single round-wide winner - a
// round-robin round is several simultaneous matches, so more than
// one player can legitimately earn this reward for the same round).
export function roundWinners(
  matches: RoundMatch[]
): string[] {
  const ids = new Set<string>();

  for (const match of matches) {
    if (match.winnerId !== null) {
      ids.add(match.winnerId);
    }
  }

  return Array.from(ids);
}

export type RoundRewardRole = "participation" | "round_winner";

// Mirrors the partial unique index
// competition_round_reward_grants_active_unique on
// (competition_id, round_number, profile_id, reward_role) where
// status = 'granted' - this tuple is the idempotency key. Two calls
// to settle_round_rewards_v2 for the same round produce the exact
// same set of keys, so the second call's inserts are all skipped by
// the "already granted" exists() check.
export function roundRewardGrantKey(
  competitionId: string,
  roundNumber: number,
  profileId: string,
  role: RoundRewardRole
): string {
  return `${competitionId}:${roundNumber}:${profileId}:${role}`;
}

// Computes the full, de-duplicated set of grant keys a settlement
// call for this round would attempt to create - useful for asserting
// "settling the same round twice never grows the grant set" without
// needing a real database.
export function computeRoundRewardGrantKeys(
  competitionId: string,
  roundNumber: number,
  matches: RoundMatch[]
): string[] {
  if (!isRoundReadyToSettle(matches)) {
    return [];
  }

  const participationKeys = roundParticipants(matches).map(
    (profileId) =>
      roundRewardGrantKey(
        competitionId,
        roundNumber,
        profileId,
        "participation"
      )
  );

  const winnerKeys = roundWinners(matches).map(
    (profileId) =>
      roundRewardGrantKey(
        competitionId,
        roundNumber,
        profileId,
        "round_winner"
      )
  );

  return [...participationKeys, ...winnerKeys];
}
