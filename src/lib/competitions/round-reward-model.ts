// =========================================================
// ROUND REWARD SETTLEMENT REFERENCE MODEL
// (2026-08-30; rewritten 2026-10-12 for 2.0 full-cycle rounds)
//
// Same caveat as ./match-reward-model.ts and ./tiebreak-model.ts:
// this is a hand-transcribed, pure-TypeScript port of logic that
// actually lives in Postgres - public._settle_round_cycle and
// public._round_cycle_expected_grants in
// supabase/migrations/202610120120_round_rewards_resettle_on_
// correction.sql (settle_round_rewards_v2 is a thin wrapper).
// Nothing here is imported by the app or the SQL; it exists so the
// settlement LOGIC can be unit-tested without a database. Keep it in
// sync by hand if the SQL changes. The same scenarios run against
// the real functions in scripts/sql-tests/02_* and 03_*.
//
// THE MODEL
// - One "round" is one FULL CYCLE: every pair of players meets once.
//   With 3 players that is 3 schedule rounds (one match each, one
//   player has a bye), so schedule rounds 1-3 = round 1, 4-6 =
//   round 2, ... With an even player count N a cycle is N - 1
//   schedule rounds.
// - A cycle settles only when ALL its matches exist and are
//   completed. Tiebreak matches never belong to a cycle.
// - Rewards per cycle (current league defaults, all configurable per
//   competition in competition_round_reward_rules):
//     participation (everyone): 300 DP + 1 Premium Pack voucher
//     1st: +400 DP + 1 Normal Pack voucher
//     2nd: +300 DP
//     3rd: +200 DP
// - Placement inside a cycle: points (win 3, draw 1) desc, wins desc,
//   duel difference desc, duels won desc, then profile id ascending.
// - Settling is "make the active grants equal the expected grants":
//   grant what is missing first, then reverse what is no longer
//   expected (an admin correction moved someone). Reversals never
//   drive a balance below 0 - the shortfall is recorded.
// =========================================================

export type RoundRewardRole =
  | "participation"
  | "round_winner"
  | "round_runner_up"
  | "round_third";

export type VoucherType =
  | "normal_pack"
  | "premium_pack"
  | "deluxe_pack"
  | "special_pack";

export type RoundRewardRule = {
  duelPoints: number;
  voucherType: VoucherType | null;
  voucherQuantity: number;
};

// league_economy_defaults as seeded today (round_participation_dp,
// round_first_dp, round_second_dp, round_third_dp + vouchers).
export const DEFAULT_ROUND_REWARD_RULES: Record<
  RoundRewardRole,
  RoundRewardRule
> = {
  participation: {
    duelPoints: 300,
    voucherType: "premium_pack",
    voucherQuantity: 1,
  },
  round_winner: {
    duelPoints: 400,
    voucherType: "normal_pack",
    voucherQuantity: 1,
  },
  round_runner_up: {
    duelPoints: 300,
    voucherType: null,
    voucherQuantity: 0,
  },
  round_third: {
    duelPoints: 200,
    voucherType: null,
    voucherQuantity: 0,
  },
};

const PLACEMENT_ROLES: Record<number, RoundRewardRole> = {
  1: "round_winner",
  2: "round_runner_up",
  3: "round_third",
};

// Schedule rounds per full cycle (cycle_size in the SQL).
export function cycleSize(
  playerCount: number
): number {
  return playerCount % 2 === 0
    ? playerCount - 1
    : playerCount;
}

// Matches per full cycle: every pair once.
export function expectedMatchesPerCycle(
  playerCount: number
): number {
  return (playerCount * (playerCount - 1)) / 2;
}

// The logical round ("Round N" in the wallet) a schedule round
// belongs to.
export function logicalRoundFor(
  scheduleRound: number,
  playerCount: number
): number {
  return Math.floor((scheduleRound - 1) / cycleSize(playerCount)) + 1;
}

export function cycleBounds(
  logicalRound: number,
  playerCount: number
): { start: number; end: number } {
  const size = cycleSize(playerCount);

  return {
    start: (logicalRound - 1) * size + 1,
    end: logicalRound * size,
  };
}

export type CycleMatch = {
  playerOneId: string;
  playerTwoId: string;
  winnerId: string | null;
  playerOneDuelWins: number;
  playerTwoDuelWins: number;
  status: string;
};

// Mirrors the guard in _settle_round_cycle: never settle a partial
// cycle. `cycleMatches` are the non-tiebreak matches whose schedule
// round falls inside the cycle's bounds.
export function isCycleReadyToSettle(
  cycleMatches: CycleMatch[],
  playerCount: number
): boolean {
  if (playerCount < 2) {
    return false;
  }

  return (
    cycleMatches.length === expectedMatchesPerCycle(playerCount) &&
    cycleMatches.every(
      (match) => match.status === "completed"
    )
  );
}

export type CycleStanding = {
  profileId: string;
  placement: number;
  points: number;
  wins: number;
  draws: number;
  duelDiff: number;
  duelWins: number;
};

// Mirrors the `stats` + `ranked` CTEs of _round_cycle_expected_grants.
export function rankCycle(
  roster: string[],
  cycleMatches: CycleMatch[]
): CycleStanding[] {
  const standings = Array.from(new Set(roster)).map(
    (profileId) => {
      let wins = 0;
      let draws = 0;
      let duelWins = 0;
      let duelDiff = 0;

      for (const match of cycleMatches) {
        const isOne = match.playerOneId === profileId;
        const isTwo = match.playerTwoId === profileId;

        if (!isOne && !isTwo) {
          continue;
        }

        if (match.winnerId === profileId) {
          wins += 1;
        } else if (match.winnerId === null) {
          draws += 1;
        }

        const mine = isOne
          ? match.playerOneDuelWins
          : match.playerTwoDuelWins;
        const theirs = isOne
          ? match.playerTwoDuelWins
          : match.playerOneDuelWins;

        duelWins += mine;
        duelDiff += mine - theirs;
      }

      return {
        profileId,
        placement: 0,
        points: wins * 3 + draws,
        wins,
        draws,
        duelDiff,
        duelWins,
      };
    }
  );

  standings.sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      b.duelDiff - a.duelDiff ||
      b.duelWins - a.duelWins ||
      (a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0)
  );

  return standings.map(
    (standing, index) => ({
      ...standing,
      placement: index + 1,
    })
  );
}

export type ExpectedRoundGrant = {
  profileId: string;
  role: RoundRewardRole;
  placement: number;
};

// Mirrors _round_cycle_expected_grants: participation for the whole
// roster (bye players included) + one grant each for places 1..3.
export function expectedRoundGrants(
  roster: string[],
  cycleMatches: CycleMatch[]
): ExpectedRoundGrant[] {
  const ranked = rankCycle(roster, cycleMatches);

  const participation = ranked.map(
    (standing): ExpectedRoundGrant => ({
      profileId: standing.profileId,
      role: "participation",
      placement: standing.placement,
    })
  );

  const placements = ranked
    .filter((standing) => standing.placement <= 3)
    .map(
      (standing): ExpectedRoundGrant => ({
        profileId: standing.profileId,
        role: PLACEMENT_ROLES[standing.placement],
        placement: standing.placement,
      })
    );

  return [...participation, ...placements];
}

// Mirrors the partial unique index competition_round_reward_grants_
// active_unique on (competition_id, round_number, profile_id,
// reward_role) where status = 'granted': at most one ACTIVE grant
// per key. round_number stores the LOGICAL round.
export function roundRewardGrantKey(
  competitionId: string,
  logicalRound: number,
  profileId: string,
  role: RoundRewardRole
): string {
  return `${competitionId}:${logicalRound}:${profileId}:${role}`;
}

export type ActiveRoundGrant = {
  profileId: string;
  role: RoundRewardRole;
};

// Mirrors the two loops of _settle_round_cycle. toGrant is applied
// first, then toReverse. Applying the result and diffing again
// yields two empty lists - that is the idempotency guarantee.
export function diffRoundGrants(
  active: ActiveRoundGrant[],
  expected: ExpectedRoundGrant[]
): {
  toGrant: ExpectedRoundGrant[];
  toReverse: ActiveRoundGrant[];
} {
  const key = (grant: ActiveRoundGrant) => `${grant.profileId}:${grant.role}`;
  const activeKeys = new Set(active.map(key));
  const expectedKeys = new Set(expected.map(key));

  return {
    toGrant: expected.filter(
      (grant) => !activeKeys.has(key(grant))
    ),
    toReverse: active.filter(
      (grant) => !expectedKeys.has(key(grant))
    ),
  };
}

// Mirrors _reverse_round_reward_grant's DP part
// (_debit_duel_points with allow_partial): take back at most what
// the player currently has.
export function computeRoundReversal(
  grantedDuelPoints: number,
  currentBalance: number
): { recovered: number; unrecovered: number } {
  const recovered = Math.max(
    0,
    Math.min(currentBalance, grantedDuelPoints)
  );

  return {
    recovered,
    unrecovered: grantedDuelPoints - recovered,
  };
}

// Total DP a player receives for one settled cycle under `rules`.
export function roundDuelPointsFor(
  profileId: string,
  expected: ExpectedRoundGrant[],
  rules: Record<RoundRewardRole, RoundRewardRule> = DEFAULT_ROUND_REWARD_RULES
): number {
  return expected
    .filter((grant) => grant.profileId === profileId)
    .reduce(
      (sum, grant) => sum + rules[grant.role].duelPoints,
      0
    );
}
