import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  getLeagueIdForUser,
} from "@/lib/league-stats";

import {
  amsterdamDay,
  isoWeekKey,
} from "../periods";

// =========================================================
// Server-side data for the Shadow Arena screens. Runs as the
// signed-in player: RLS + the SECURITY DEFINER RPCs from
// 202610120700_mini_games.sql decide what they can see.
// =========================================================

export const ARENA_GAME = "auto_battler";

export type ArenaBoardRow = {
  place: number;
  profileId: string;
  name: string;
  score: number;
  runs: number;
};

export type ArenaReward = {
  period: "day" | "week";
  place: number;
  dp: number;
  voucher: string | null;
};

export type ArenaBoards = {
  today: string;
  week: string;
  day: ArenaBoardRow[];
  weekBoard: ArenaBoardRow[];
};

export type ArenaPageData = ArenaBoards & {
  hasLeague: boolean;
  userId: string;
  daily: {
    status: "open" | "started" | "validated" | "rejected";
    score: number | null;
    runId: string | null;
  };
  rewards: ArenaReward[];
};

type LeaderboardRpcRow = {
  place: number;
  profile_id: string;
  duelist_name: string;
  best_score: number;
  runs: number;
};

export async function loadArenaLeaderboard(
  supabase: SupabaseClient,
  period: "day" | "week",
  periodKey: string
): Promise<ArenaBoardRow[]> {
  const {
    data,
  } = await supabase.rpc(
    "mini_game_leaderboard",
    {
      target_game: ARENA_GAME,
      target_period: period,
      target_period_key: periodKey,
    }
  );

  return ((data ?? []) as LeaderboardRpcRow[]).map(
    (row) => ({
      place: row.place,
      profileId: row.profile_id,
      name: row.duelist_name,
      score: row.best_score,
      runs: row.runs,
    })
  );
}

export async function loadArenaBoards(
  supabase: SupabaseClient
): Promise<ArenaBoards> {
  const today =
    amsterdamDay();

  const week =
    isoWeekKey(today);

  const [
    day,
    weekBoard,
  ] = await Promise.all([
    loadArenaLeaderboard(
      supabase,
      "day",
      today
    ),
    loadArenaLeaderboard(
      supabase,
      "week",
      week
    ),
  ]);

  return {
    today,
    week,
    day,
    weekBoard,
  };
}

/**
 * Pays the winners of every finished day / week that was not
 * settled yet (idempotent in the database). Called lazily when
 * the arena loads, so no cron job is needed.
 */
export async function settleArenaPeriods(
  supabase: SupabaseClient
) {
  for (const period of ["day", "week"] as const) {
    try {
      await supabase.rpc(
        "settle_mini_game_period",
        {
          target_game: ARENA_GAME,
          target_period: period,
        }
      );
    } catch {
      // Never break the page over a settlement hiccup; the next
      // visit tries again.
    }
  }
}

export async function loadArenaPageData(
  supabase: SupabaseClient,
  userId: string
): Promise<ArenaPageData> {
  const leagueId =
    await getLeagueIdForUser(
      supabase,
      userId
    );

  if (!leagueId) {
    const today =
      amsterdamDay();

    return {
      hasLeague: false,
      userId,
      today,
      week: isoWeekKey(today),
      day: [],
      weekBoard: [],
      daily: {
        status: "open",
        score: null,
        runId: null,
      },
      rewards: [],
    };
  }

  await settleArenaPeriods(supabase);

  const [
    boards,
    dailyRun,
    rewards,
  ] = await Promise.all([
    loadArenaBoards(supabase),
    supabase
      .from("game_runs")
      .select("id,status,score")
      .eq(
        "profile_id",
        userId
      )
      .eq(
        "game",
        ARENA_GAME
      )
      .eq(
        "mode",
        "daily"
      )
      .eq(
        "day",
        amsterdamDay()
      )
      .maybeSingle(),
    supabase
      .from("mini_game_reward_config")
      .select("period,place,dp,voucher_pack_code")
      .eq(
        "game",
        ARENA_GAME
      )
      .order("period")
      .order("place"),
  ]);

  const dailyRow =
    dailyRun.data as {
      id: string;
      status: "started" | "validated" | "rejected";
      score: number | null;
    } | null;

  return {
    hasLeague: true,
    userId,
    ...boards,
    daily: {
      status: dailyRow?.status ?? "open",
      score: dailyRow?.score ?? null,
      runId: dailyRow?.id ?? null,
    },
    rewards: (
      (rewards.data ?? []) as {
        period: "day" | "week";
        place: number;
        dp: number;
        voucher_pack_code: string | null;
      }[]
    ).map(
      (row) => ({
        period: row.period,
        place: row.place,
        dp: row.dp,
        voucher: row.voucher_pack_code,
      })
    ),
  };
}
