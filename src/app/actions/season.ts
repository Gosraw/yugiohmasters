"use server";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  EMPTY_SEASON_OVERVIEW,
  parseSeasonOverview,
  type SeasonOverview,
} from "@/lib/weekly-goals";

// =========================================================
// SEASON OVERVIEW (2.0: weekly goals + Season Path)
//
// One RPC, get_my_season_overview (migration 202610120810): it
// recomputes the signed-in player's weekly goal progress from real
// events, pays newly completed goals / reached Season Path tiers
// (idempotent, all DP via _credit_duel_points) and returns
// everything Home and /season show. Any reward it just paid shows
// up in the reward pop-up on the next check, like every other
// ledger credit.
//
// Never throws: if the season tables are missing or the call fails,
// Home just renders without goals rather than breaking.
// =========================================================

export async function getSeasonOverview(): Promise<SeasonOverview> {
  const {
    supabase,
  } = await requireUser();

  try {
    const {
      data,
      error,
    } = await supabase.rpc(
      "get_my_season_overview"
    );

    if (error) {
      console.error(
        "get_my_season_overview failed:",
        error.message
      );

      return EMPTY_SEASON_OVERVIEW;
    }

    return parseSeasonOverview(
      data
    );
  } catch (error) {
    console.error(
      "get_my_season_overview failed:",
      error
    );

    return EMPTY_SEASON_OVERVIEW;
  }
}
