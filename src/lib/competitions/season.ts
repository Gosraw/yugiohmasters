import type {
  requireUser,
} from "@/lib/supabase/queries";

type SupabaseClient =
  Awaited<
    ReturnType<typeof requireUser>
  >["supabase"];

// =========================================================
// SEASON COMPETITION HELPERS (2.0)
//
// docs/V2_PLAN.md: one long season competition. A ROUND is one full
// cycle in which every pair plays once (3 players -> 3 duels).
//
// generate_round_robin_matches_v2 numbers matches by SCHEDULE round
// (circle method: an odd player count gets a bye, so 3 players ->
// one duel per schedule round). _settle_round_cycle (migration
// 202610120120) pays round rewards per full cycle and stores the
// LOGICAL round number on the grant and ledger rows ("Round 2
// complete"). These helpers convert between the two exactly the way
// _settle_round_cycle does, so the UI always talks about the same
// "Round N" the wallet and the reward pop-up show.
// =========================================================

export const SEASON_DEFAULT_ROUNDS = 39;

export const SEASON_MAX_ROUNDS = 120;

/** Schedule rounds needed for everyone to face everyone once. */
export function scheduleRoundsPerCycle(
  playerCount: number
) {
  if (playerCount < 2) {
    return 1;
  }

  return playerCount % 2 === 0
    ? playerCount - 1
    : playerCount;
}

/** Duels in one full round (every pair once). */
export function duelsPerRound(
  playerCount: number
) {
  if (playerCount < 2) {
    return 0;
  }

  return (playerCount * (playerCount - 1)) / 2;
}

/** The season round ("Round N") a schedule round belongs to. */
export function logicalRoundFor(
  scheduleRound: number,
  playerCount: number
) {
  const cycle =
    scheduleRoundsPerCycle(
      playerCount
    );

  return Math.floor(
    (Math.max(1, scheduleRound) - 1) / cycle
  ) + 1;
}

/** Total season rounds for a schedule with `totalScheduleRounds`. */
export function totalLogicalRounds(
  totalScheduleRounds: number | null,
  playerCount: number
) {
  if (!totalScheduleRounds || totalScheduleRounds < 1) {
    return 0;
  }

  return logicalRoundFor(
    totalScheduleRounds,
    playerCount
  );
}

/**
 * The season rounds paid out together with `round` (migration
 * 202611271000: competitions.reward_rounds_per_payout from
 * reward_grouping_from_round). Mirrors _competition_reward_block:
 * rounds before the grouping start pay one by one, and the last
 * block stops at the season's final round.
 */
export function rewardBlockFor(
  round: number,
  roundsPerPayout: number,
  groupingFromRound: number,
  totalRounds: number
) {
  const perPayout =
    Math.max(
      1,
      Math.floor(roundsPerPayout)
    );

  const from =
    Math.max(
      1,
      Math.floor(groupingFromRound)
    );

  if (
    perPayout === 1 ||
    round < from
  ) {
    return {
      first: round,
      last: round,
    };
  }

  const first =
    from +
    Math.floor(
      (round - from) / perPayout
    ) *
      perPayout;

  const fullLast =
    first +
    perPayout -
    1;

  return {
    first,
    last:
      totalRounds >= round
        ? Math.min(
            fullLast,
            totalRounds
          )
        : fullLast,
  };
}

/** "Round 4" or "Rounds 4-6". */
export function roundRangeLabel(
  block: {
    first: number;
    last: number;
  }
) {
  return block.first === block.last
    ? `Round ${block.last}`
    : `Rounds ${block.first}–${block.last}`;
}

export type ActiveSeason = {
  id: string;
  name: string;
  current_round: number | null;
  total_rounds: number | null;
};

export type LatestSeason = ActiveSeason & {
  status: "active" | "completed";
};

const SEASON_COLUMNS =
  "id,name,current_round,total_rounds";

/**
 * The league's running season competition (competitions.is_season,
 * migration 202610121500 - a custom competition is never "the
 * season"). The database allows at most one draft/active season per
 * league; the ordering just picks sensibly if that ever changes.
 */
export async function getActiveSeasonCompetition(
  supabase: SupabaseClient,
  leagueId: string
): Promise<ActiveSeason | null> {
  const {
    data,
    error,
  } = await supabase
    .from("competitions")
    .select(
      SEASON_COLUMNS
    )
    .eq(
      "league_id",
      leagueId
    )
    .eq(
      "status",
      "active"
    )
    .eq(
      "is_season",
      true
    )
    .order(
      "total_rounds",
      {
        ascending: false,
        nullsFirst: false,
      }
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    )
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      error.message
    );
  }

  return (data as ActiveSeason | null) ?? null;
}

/**
 * The running season, or else the most recently finished one (for
 * "Season complete" screens and the league table between seasons).
 */
export async function getLatestSeasonCompetition(
  supabase: SupabaseClient,
  leagueId: string
): Promise<LatestSeason | null> {
  const active =
    await getActiveSeasonCompetition(
      supabase,
      leagueId
    );

  if (active) {
    return {
      ...active,
      status: "active",
    };
  }

  const {
    data,
    error,
  } = await supabase
    .from("competitions")
    .select(
      SEASON_COLUMNS
    )
    .eq(
      "league_id",
      leagueId
    )
    .eq(
      "status",
      "completed"
    )
    .eq(
      "is_season",
      true
    )
    .order(
      "completed_at",
      {
        ascending: false,
        nullsFirst: false,
      }
    )
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data
    ? {
        ...(data as ActiveSeason),
        status: "completed",
      }
    : null;
}

/**
 * Name for a new season competition: the current row of the
 * `seasons` table ("Season 2"), never a hard-coded number.
 */
export async function getCurrentSeasonName(
  supabase: SupabaseClient
): Promise<string> {
  const {
    data,
  } = await supabase
    .from("seasons")
    .select(
      "name"
    )
    .eq(
      "is_current",
      true
    )
    .maybeSingle();

  const name =
    (data as { name: string } | null)?.name?.trim();

  return name || "Season";
}
