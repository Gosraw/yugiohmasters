import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  getLeagueIdForUser,
} from "@/lib/league-stats";

import {
  amsterdamDay,
  isoWeekKey,
} from "./periods";

import type {
  BoardRow,
  RecentGrant,
  RewardRule,
} from "./climber-data";

// =========================================================
// Server-side data for ANY catalog mini game (the shared
// game_runs / mini_game_leaderboard / settle_mini_game_period
// machinery from 202610120700_mini_games.sql). Runs as the
// signed-in player. New games use these instead of copying the
// per-game loaders in climber-data.ts / autobattler/data.ts.
// =========================================================

export type DailyStatus = {
  status: "open" | "started" | "validated" | "rejected";
  score: number | null;
};

export type MiniGamePageData = {
  game: string;
  hasLeague: boolean;
  today: string;
  week: string;
  daily: DailyStatus;
  dayBoard: BoardRow[];
  weekBoard: BoardRow[];
  rewards: RewardRule[];
  recentGrants: RecentGrant[];
};

export type MiniGameSummary = {
  game: string;
  hasLeague: boolean;
  daily: DailyStatus;
  leader: BoardRow | null;
};

type LeaderboardRpcRow = {
  place: number;
  profile_id: string;
  duelist_name: string;
  best_score: number;
  runs: number;
};

export async function loadGameLeaderboard(
  supabase: SupabaseClient,
  game: string,
  period: "day" | "week",
  periodKey?: string
): Promise<BoardRow[]> {
  const {
    data,
  } = await supabase.rpc(
    "mini_game_leaderboard",
    {
      target_game: game,
      target_period: period,
      target_period_key: periodKey ?? null,
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

/**
 * Pays the winners of every finished day / week of this game that
 * was not settled yet (idempotent in the database). Called lazily
 * when a games screen loads, so no cron job is needed.
 */
export async function settleGamePeriods(
  supabase: SupabaseClient,
  game: string
) {
  for (const period of ["day", "week"] as const) {
    try {
      await supabase.rpc(
        "settle_mini_game_period",
        {
          target_game: game,
          target_period: period,
        }
      );
    } catch {
      // Never break the page over a settlement hiccup; the next
      // visit tries again.
    }
  }
}

async function loadDailyStatus(
  supabase: SupabaseClient,
  userId: string,
  game: string,
  today: string
): Promise<DailyStatus> {
  const {
    data,
  } = await supabase
    .from("game_runs")
    .select("status,score")
    .eq(
      "profile_id",
      userId
    )
    .eq(
      "game",
      game
    )
    .eq(
      "mode",
      "daily"
    )
    .eq(
      "day",
      today
    )
    .maybeSingle();

  const row =
    data as {
      status: "started" | "validated" | "rejected";
      score: number | null;
    } | null;

  return {
    status: row?.status ?? "open",
    score: row?.score ?? null,
  };
}

/** Small summary for the /games hub card. Also settles finished periods. */
export async function loadMiniGameSummary(
  supabase: SupabaseClient,
  userId: string,
  game: string,
  leagueId: string | null
): Promise<MiniGameSummary> {
  const today =
    amsterdamDay();

  if (!leagueId) {
    return {
      game,
      hasLeague: false,
      daily: {
        status: "open",
        score: null,
      },
      leader: null,
    };
  }

  await settleGamePeriods(
    supabase,
    game
  );

  const [
    dayBoard,
    daily,
  ] = await Promise.all([
    loadGameLeaderboard(
      supabase,
      game,
      "day",
      today
    ),
    loadDailyStatus(
      supabase,
      userId,
      game,
      today
    ),
  ]);

  return {
    game,
    hasLeague: true,
    daily,
    leader: dayBoard[0] ?? null,
  };
}

export async function loadMiniGamePageData(
  supabase: SupabaseClient,
  userId: string,
  game: string
): Promise<MiniGamePageData> {
  const today =
    amsterdamDay();

  const week =
    isoWeekKey(today);

  const leagueId =
    await getLeagueIdForUser(
      supabase,
      userId
    );

  if (!leagueId) {
    return {
      game,
      hasLeague: false,
      today,
      week,
      daily: {
        status: "open",
        score: null,
      },
      dayBoard: [],
      weekBoard: [],
      rewards: [],
      recentGrants: [],
    };
  }

  await settleGamePeriods(
    supabase,
    game
  );

  const [
    dayBoard,
    weekBoard,
    daily,
    rewards,
    grants,
  ] = await Promise.all([
    loadGameLeaderboard(
      supabase,
      game,
      "day",
      today
    ),
    loadGameLeaderboard(
      supabase,
      game,
      "week",
      week
    ),
    loadDailyStatus(
      supabase,
      userId,
      game,
      today
    ),
    supabase
      .from("mini_game_reward_config")
      .select("period,place,dp,voucher_pack_code")
      .eq(
        "game",
        game
      )
      .order("period")
      .order("place"),
    supabase
      .from("mini_game_reward_grants")
      .select("id,description,duel_points,voucher_type,profiles(duelist_name)")
      .eq(
        "game",
        game
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(4),
  ]);

  return {
    game,
    hasLeague: true,
    today,
    week,
    daily,
    dayBoard,
    weekBoard,
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
    recentGrants: (
      (grants.data ?? []) as unknown as {
        id: string;
        description: string;
        duel_points: number;
        voucher_type: string | null;
        profiles: {
          duelist_name: string;
        } | null;
      }[]
    ).map(
      (row) => ({
        id: row.id,
        description: row.description,
        name: row.profiles?.duelist_name ?? "Someone",
        dp: row.duel_points,
        voucher: row.voucher_type,
      })
    ),
  };
}
