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

export type ActiveSeason = {
  id: string;
  name: string;
  current_round: number | null;
  total_rounds: number | null;
};

/**
 * The league's season competition: the active V2 round robin with
 * the longest schedule (newest first on a tie). There is meant to
 * be exactly one; this just picks sensibly if an old event is still
 * open.
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
      "id,name,current_round,total_rounds"
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
      "competition_type",
      "round_robin"
    )
    .not(
      "meetings_per_pairing",
      "is",
      null
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
