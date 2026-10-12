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

// =========================================================
// Server-side data for the Pyramid Climb screens. Runs as the
// signed-in player (RLS + the SECURITY DEFINER RPCs from
// 202610120700_mini_games.sql decide what they can see).
// =========================================================

export const CLIMBER_GAME = "pyramid_climb";

export type BoardRow = {
  place: number;
  profileId: string;
  name: string;
  score: number;
  runs: number;
};

export type RewardRule = {
  period: "day" | "week";
  place: number;
  dp: number;
  voucher: string | null;
};

export type RecentGrant = {
  id: string;
  description: string;
  name: string;
  dp: number;
  voucher: string | null;
};

export type ClimberPageData = {
  hasLeague: boolean;
  today: string;
  week: string;
  daily: {
    status: "open" | "started" | "validated" | "rejected";
    score: number | null;
  };
  dayBoard: BoardRow[];
  weekBoard: BoardRow[];
  rewards: RewardRule[];
  recentGrants: RecentGrant[];
  sprite: {
    name: string;
    imageUrl: string;
  } | null;
};

type LeaderboardRpcRow = {
  place: number;
  profile_id: string;
  duelist_name: string;
  best_score: number;
  runs: number;
};

export async function loadLeaderboard(
  supabase: SupabaseClient,
  period: "day" | "week",
  periodKey?: string
): Promise<BoardRow[]> {
  const {
    data,
  } = await supabase.rpc(
    "mini_game_leaderboard",
    {
      target_game: CLIMBER_GAME,
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
 * Pays the winners of every finished day / week that was not
 * settled yet (idempotent in the database). Called lazily when
 * the games screens load, so no cron job is needed.
 */
export async function settleFinishedPeriods(
  supabase: SupabaseClient
) {
  for (const period of ["day", "week"] as const) {
    try {
      await supabase.rpc(
        "settle_mini_game_period",
        {
          target_game: CLIMBER_GAME,
          target_period: period,
        }
      );
    } catch {
      // Never break the page over a settlement hiccup; the next
      // visit tries again.
    }
  }
}

async function loadBossSprite(
  supabase: SupabaseClient,
  userId: string
): Promise<ClimberPageData["sprite"]> {
  const {
    data: path,
  } = await supabase
    .from("player_boss_paths")
    .select("route_id,current_stage")
    .eq(
      "profile_id",
      userId
    )
    .order(
      "current_stage",
      {
        ascending: false,
      }
    )
    .order(
      "route_slot",
      {
        ascending: true,
      }
    )
    .limit(1)
    .maybeSingle();

  if (!path) {
    return null;
  }

  const {
    data: stage,
  } = await supabase
    .from("boss_route_stages")
    .select("card_catalog(name,image_url_cropped,image_url_small)")
    .eq(
      "route_id",
      path.route_id
    )
    .eq(
      "stage_number",
      path.current_stage
    )
    .maybeSingle();

  const card =
    (stage as {
      card_catalog: {
        name: string;
        image_url_cropped: string | null;
        image_url_small: string | null;
      } | null;
    } | null)?.card_catalog;

  const imageUrl =
    card?.image_url_cropped ?? card?.image_url_small ?? null;

  if (!card || !imageUrl) {
    return null;
  }

  return {
    name: card.name,
    imageUrl,
  };
}

export async function loadClimberPageData(
  supabase: SupabaseClient,
  userId: string
): Promise<ClimberPageData> {
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
      sprite: null,
    };
  }

  await settleFinishedPeriods(supabase);

  const [
    dayBoard,
    weekBoard,
    dailyRun,
    rewards,
    grants,
    sprite,
  ] = await Promise.all([
    loadLeaderboard(
      supabase,
      "day",
      today
    ),
    loadLeaderboard(
      supabase,
      "week",
      week
    ),
    supabase
      .from("game_runs")
      .select("status,score")
      .eq(
        "profile_id",
        userId
      )
      .eq(
        "game",
        CLIMBER_GAME
      )
      .eq(
        "mode",
        "daily"
      )
      .eq(
        "day",
        today
      )
      .maybeSingle(),
    supabase
      .from("mini_game_reward_config")
      .select("period,place,dp,voucher_pack_code")
      .eq(
        "game",
        CLIMBER_GAME
      )
      .order("period")
      .order("place"),
    supabase
      .from("mini_game_reward_grants")
      .select("id,description,duel_points,voucher_type,profiles(duelist_name)")
      .eq(
        "game",
        CLIMBER_GAME
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(4),
    loadBossSprite(
      supabase,
      userId
    ),
  ]);

  const dailyRow =
    dailyRun.data as {
      status: "started" | "validated" | "rejected";
      score: number | null;
    } | null;

  return {
    hasLeague: true,
    today,
    week,
    daily: {
      status: dailyRow?.status ?? "open",
      score: dailyRow?.score ?? null,
    },
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
    sprite,
  };
}
