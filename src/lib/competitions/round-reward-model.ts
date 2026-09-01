// =========================================================
// ROUND REWARD SETTLEMENT REFERENCE MODEL
// (2026-08-30, autonomous work session Priority 1;
//  2026-08-31, Phase 2 economy centralization update)
//
// Same caveat as ./match-reward-model.ts and ./tiebreak-model.ts:
// this is a hand-transcribed, pure-TypeScript port of logic that
// actually lives in Postgres - public.settle_round_rewards_v2, most
// recently redefined by
// 202608311100_phase2_economy_central_config_and_round_rewards.sql.
// Nothing here is imported by the app or the SQL; it exists purely
// so the settlement LOGIC (who is a round participant, who is a
// round winner/runner-up, what the idempotency key looks like) can
// be unit-tested in a sandbox that cannot run Postgres or execute
// vitest against this repo's native-binary dependencies. Keep this
// in sync by hand if the SQL changes.
//
// PHASE 2 CHANGE: participation is no longer "both players of every
// match in the round" - it is now every player registered in the
// competition, independent of whether they have a match this
// specific round_number. A 3-player round-robin always has exactly
// one bye per round (generate_round_robin_matches_v2 pads an odd
// player count with a synthetic null slot and silently drops any
// pairing that involves it), and the approved economy baseline pays
// the universal "round completion" reward to the bye player too -
// see this file's roundParticipants() signature change below. A new
// 'round_runner_up' role (the loser of each match) represents the
// approved "2nd place: +75 DP, no pack" tier, which the prior
// two-role model could not express.
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

// Mirrors the 'participation' loop (Phase 2 version): every player
// REGISTERED IN THE COMPETITION, not only the players who happen to
// appear in this round's match rows. The bye player in a 3-player
// round-robin round still "completes the round" and must still
// qualify - matches alone cannot tell you who that is (see this
// file's header), so the full competition roster is a required
// input here, unlike the pre-Phase-2 version.
export function roundParticipants(
  allCompetitionPlayerIds: string[]
): string[] {
  return Array.from(new Set(allCompetitionPlayerIds));
}

// Mirrors the 'round_winner' loop (1st place): the distinct winner_id
// of every individual match in the round (NOT a single round-wide
// winner - a round-robin round can have several simultaneous matches
// for a >3-player competition, so more than one player can
// legitimately earn this reward for the same round; for the real
// 3-player league there is always exactly one match per round, so
// this is a clean "1st place").
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

// Mirrors the 'round_runner_up' loop (2nd place, added in Phase 2):
// the participant of each completed match who is NOT that match's
// winner. A player with no match this round (the bye) never appears
// here - they only ever qualify for 'participation', which is
// exactly the approved "3rd: no additional placement bonus."
export function roundRunnersUp(
  matches: RoundMatch[]
): string[] {
  const ids = new Set<string>();

  for (const match of matches) {
    if (match.winnerId === null) {
      continue;
    }

    const loserId =
      match.winnerId === match.playerOneId
        ? match.playerTwoId
        : match.playerOneId;

    ids.add(loserId);
  }

  return Array.from(ids);
}

export type RoundRewardRole =
  | "participation"
  | "round_winner"
  | "round_runner_up";

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
// needing a real database. allCompetitionPlayerIds is every player
// registered in the competition (competition_players), independent
// of who has a match this specific round.
export function computeRoundRewardGrantKeys(
  competitionId: string,
  roundNumber: number,
  allCompetitionPlayerIds: string[],
  matches: RoundMatch[]
): string[] {
  if (!isRoundReadyToSettle(matches)) {
    return [];
  }

  const participationKeys = roundParticipants(allCompetitionPlayerIds).map(
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

  const runnerUpKeys = roundRunnersUp(matches).map(
    (profileId) =>
      roundRewardGrantKey(
        competitionId,
        roundNumber,
        profileId,
        "round_runner_up"
      )
  );

  return [...participationKeys, ...winnerKeys, ...runnerUpKeys];
}
