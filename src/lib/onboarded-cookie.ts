import type { SupabaseClient } from "@supabase/supabase-js";

// =========================================================
// "dc_onboarded" cookie (performance shortcut for src/proxy.ts)
//
// Once a player is a league member and fully onboarded, the proxy
// sets this short-lived cookie so it can skip the membership /
// welcome-pack / onboarding-gate queries on every request. The value
// is "<user id>:<league id>:<current season number>". The app layout
// compares the league + season part with what it loads anyway; on a
// mismatch (e.g. right after a season reset, when the player has no
// league yet) the cookie is cleared and the gate runs again, instead
// of the player seeing "No league found" until the cookie expires.
// =========================================================

export const ONBOARDED_COOKIE =
  "dc_onboarded";

export const ONBOARDED_MAX_AGE =
  60 * 15;

export function buildOnboardedCookieValue(
  userId: string,
  leagueId: string,
  seasonNumber: number
) {
  return `${userId}:${leagueId}:${seasonNumber}`;
}

export function parseOnboardedCookieValue(
  value: string | undefined | null
) {
  const [
    userId,
    leagueId,
    season,
  ] = (value ?? "").split(":");

  if (
    !userId ||
    !leagueId ||
    !season
  ) {
    return null;
  }

  return {
    userId,
    leagueId,
    seasonNumber: Number(season),
  };
}

// The current season number (seasons.is_current), 0 when none is
// marked current. Readable by every signed-in player.
export async function getCurrentSeasonNumber(
  supabase: SupabaseClient
): Promise<number> {
  const {
    data,
  } = await supabase
    .from("seasons")
    .select("season_number")
    .eq("is_current", true)
    .maybeSingle();

  return Number(
    (data as { season_number: number } | null)?.season_number ?? 0
  );
}
