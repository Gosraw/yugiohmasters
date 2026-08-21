import type {
  requireUser,
} from "@/lib/supabase/queries";

// =========================================================
// SHARED LEAGUE STATS
//
// Read-only helpers for Rivalries, the League Record Book,
// the Activity Feed and the Trophy Room. Everything here is
// derived from data the app already collects automatically
// (matches, card_instances, competition results). Nothing
// here requires a player to type in anything about how a
// physical duel actually went beyond the final result.
//
// These helpers never write to the database.
// =========================================================

type SupabaseClient =
  Awaited<
    ReturnType<typeof requireUser>
  >["supabase"];

export type StatsMatch = {
  id: string;
  player_one_id: string;
  player_two_id: string;

  winner_id: string | null;

  result:
    | "player_one_win"
    | "player_two_win"
    | "draw"
    | null;

  status:
    | "pending"
    | "accepted"
    | "result_submitted"
    | "disputed"
    | "completed"
    | "cancelled"
    | "declined";

  match_type: "league" | "practice";

  wager_type: "none" | "dp" | "card";

  completed_at: string | null;
  created_at: string;
};

export type StatsProfile = {
  id: string;
  username: string | null;
  duelist_name: string;
  custom_title: string | null;
};

// =========================================================
// LEAGUE + PROFILE LOOKUP
// =========================================================

export async function getLeagueIdForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("profile_id", userId)
    .limit(1)
    .maybeSingle();

  return data?.league_id ?? null;
}

export async function getLeagueProfiles(
  supabase: SupabaseClient,
  leagueId: string
): Promise<StatsProfile[]> {
  const { data: memberData, error: memberError } = await supabase
    .from("league_members")
    .select("profile_id")
    .eq("league_id", leagueId);

  if (memberError) {
    throw new Error(memberError.message);
  }

  const memberIds = (memberData ?? []).map(
    (row: { profile_id: string }) => row.profile_id
  );

  if (memberIds.length === 0) {
    return [];
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id,username,duelist_name,custom_title")
    .in("id", memberIds);

  if (profileError) {
    throw new Error(profileError.message);
  }

  return (profileData ?? []) as StatsProfile[];
}

export function profileName(profile: StatsProfile | undefined | null) {
  if (!profile) return "Unknown Duelist";
  return profile.duelist_name ?? profile.username ?? "Duelist";
}

// =========================================================
// MATCHES
//
// `matches` is readable league-wide for any league member
// (see matches_read_league RLS policy) so this is one query
// for the whole league, not one query per player.
// =========================================================

const MATCH_COLUMNS = `
  id,
  player_one_id,
  player_two_id,
  winner_id,
  result,
  status,
  match_type,
  wager_type,
  completed_at,
  created_at
`;

export async function getCompletedLeagueMatches(
  supabase: SupabaseClient,
  leagueId: string
): Promise<StatsMatch[]> {
  const { data, error } = await supabase
    .from("matches")
    .select(MATCH_COLUMNS)
    .eq("league_id", leagueId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as StatsMatch[];
}

export function resultFor(
  match: StatsMatch,
  playerId: string
): "W" | "L" | "D" {
  if (match.result === "draw" || !match.winner_id) return "D";
  return match.winner_id === playerId ? "W" : "L";
}

export function opponentOf(match: StatsMatch, playerId: string) {
  return match.player_one_id === playerId
    ? match.player_two_id
    : match.player_one_id;
}

export function involvesPlayer(match: StatsMatch, playerId: string) {
  return (
    match.player_one_id === playerId || match.player_two_id === playerId
  );
}

function byRecencyDesc(a: StatsMatch, b: StatsMatch) {
  const aTime = new Date(a.completed_at ?? a.created_at).getTime();
  const bTime = new Date(b.completed_at ?? b.created_at).getTime();
  return bTime - aTime;
}

/**
 * Current streak for a player across a set of their own completed
 * matches (most recent first, or unsorted — this sorts internally).
 * Returns e.g. { type: "W", count: 4 } or { type: null, count: 0 }
 * when the player has no completed matches at all.
 */
export function currentStreak(
  playerMatches: StatsMatch[],
  playerId: string
): { type: "W" | "L" | "D" | null; count: number } {
  const ordered = [...playerMatches].sort(byRecencyDesc);

  if (ordered.length === 0) {
    return { type: null, count: 0 };
  }

  const leadType = resultFor(ordered[0], playerId);
  let count = 0;

  for (const match of ordered) {
    if (resultFor(match, playerId) !== leadType) break;
    count += 1;
  }

  return { type: leadType, count };
}

export function longestWinStreak(
  playerMatches: StatsMatch[],
  playerId: string
): number {
  const ordered = [...playerMatches].sort(
    (a, b) => byRecencyDesc(b, a) // ascending (oldest first)
  );

  let longest = 0;
  let running = 0;

  for (const match of ordered) {
    if (resultFor(match, playerId) === "W") {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }

  return longest;
}

// =========================================================
// HEAD-TO-HEAD / RIVALRIES
// =========================================================

export type HeadToHead = {
  opponentId: string;

  totalEncounters: number;
  winsA: number;
  winsB: number;
  draws: number;

  leagueEncounters: number;
  practiceEncounters: number;
  wageredEncounters: number;

  leaderId: string | null; // who is ahead overall, null if tied
  leadMargin: number;

  streak: { holderId: string | null; count: number };

  encounters: StatsMatch[]; // all encounters, most recent first
};

export function computeHeadToHead(
  allMatches: StatsMatch[],
  playerA: string,
  playerB: string
): HeadToHead {
  const encounters = allMatches
    .filter(
      (match) =>
        (match.player_one_id === playerA &&
          match.player_two_id === playerB) ||
        (match.player_one_id === playerB &&
          match.player_two_id === playerA)
    )
    .sort(byRecencyDesc);

  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let leagueEncounters = 0;
  let practiceEncounters = 0;
  let wageredEncounters = 0;

  for (const match of encounters) {
    if (match.match_type === "league") leagueEncounters += 1;
    else practiceEncounters += 1;

    if (match.wager_type !== "none") wageredEncounters += 1;

    const outcome = resultFor(match, playerA);
    if (outcome === "W") winsA += 1;
    else if (outcome === "L") winsB += 1;
    else draws += 1;
  }

  let leaderId: string | null = null;
  if (winsA > winsB) leaderId = playerA;
  else if (winsB > winsA) leaderId = playerB;

  const streakInfo = currentStreak(encounters, playerA);
  const streakHolder =
    streakInfo.type === "W"
      ? playerA
      : streakInfo.type === "L"
        ? playerB
        : null;

  return {
    opponentId: playerB,
    totalEncounters: encounters.length,
    winsA,
    winsB,
    draws,
    leagueEncounters,
    practiceEncounters,
    wageredEncounters,
    leaderId,
    leadMargin: Math.abs(winsA - winsB),
    streak: {
      holderId: streakInfo.type === "D" ? null : streakHolder,
      count: streakInfo.type === "D" ? 0 : streakInfo.count,
    },
    encounters,
  };
}

export type RivalSummary = {
  opponentId: string;
  wins: number;
  losses: number;
  draws: number;
  total: number;
  lastEncounterAt: string;
};

/**
 * One row per opponent the given player has ever faced, sorted
 * by total encounters (most-played rivalry first).
 */
export function computeRivalSummaries(
  allMatches: StatsMatch[],
  playerId: string
): RivalSummary[] {
  const byOpponent = new Map<string, RivalSummary>();

  const playerMatches = allMatches.filter((match) =>
    involvesPlayer(match, playerId)
  );

  for (const match of playerMatches) {
    const opponentId = opponentOf(match, playerId);
    const outcome = resultFor(match, playerId);
    const at = match.completed_at ?? match.created_at;

    const existing = byOpponent.get(opponentId) ?? {
      opponentId,
      wins: 0,
      losses: 0,
      draws: 0,
      total: 0,
      lastEncounterAt: at,
    };

    if (outcome === "W") existing.wins += 1;
    else if (outcome === "L") existing.losses += 1;
    else existing.draws += 1;

    existing.total += 1;

    if (new Date(at).getTime() > new Date(existing.lastEncounterAt).getTime()) {
      existing.lastEncounterAt = at;
    }

    byOpponent.set(opponentId, existing);
  }

  return [...byOpponent.values()].sort((a, b) => b.total - a.total);
}

// =========================================================
// LEAGUE RECORD BOOK
//
// Small friend-group leagues have small sample sizes, so any
// "rate" style record (win %) needs a sensible minimum number
// of duels before it's eligible — otherwise a 1-0 record beats
// a 15-4 record, which is not fun or meaningful.
// =========================================================

export const MIN_DUELS_FOR_WIN_RATE = 5;

export type RecordEntry = {
  id: string;
  title: string;
  description: string;
  holderId: string | null;
  holderValue: string;
  eligible: boolean;
};

export function computeWinRateRecord(
  allMatches: StatsMatch[],
  profiles: StatsProfile[]
): RecordEntry {
  let bestId: string | null = null;
  let bestRate = -1;
  let bestWins = 0;
  let bestTotal = 0;

  for (const profile of profiles) {
    const own = allMatches.filter(
      (match) =>
        involvesPlayer(match, profile.id) &&
        match.match_type === "league"
    );

    if (own.length < MIN_DUELS_FOR_WIN_RATE) continue;

    const wins = own.filter(
      (match) => resultFor(match, profile.id) === "W"
    ).length;

    const rate = wins / own.length;

    if (rate > bestRate) {
      bestRate = rate;
      bestId = profile.id;
      bestWins = wins;
      bestTotal = own.length;
    }
  }

  return {
    id: "best-win-rate",
    title: "Best Win Rate",
    description: `Minimum ${MIN_DUELS_FOR_WIN_RATE} league duels to qualify.`,
    holderId: bestId,
    holderValue:
      bestId === null
        ? "Not yet decided"
        : `${Math.round(bestRate * 100)}% (${bestWins}-${bestTotal - bestWins})`,
    eligible: bestId !== null,
  };
}

export function computeMostDuelsRecord(
  allMatches: StatsMatch[],
  profiles: StatsProfile[]
): RecordEntry {
  let bestId: string | null = null;
  let bestCount = 0;

  for (const profile of profiles) {
    const count = allMatches.filter((match) =>
      involvesPlayer(match, profile.id)
    ).length;

    if (count > bestCount) {
      bestCount = count;
      bestId = profile.id;
    }
  }

  return {
    id: "most-duels",
    title: "Most Duels Played",
    description: "League and practice duels combined.",
    holderId: bestId,
    holderValue: bestId === null ? "—" : `${bestCount} duels`,
    eligible: bestId !== null,
  };
}

export function computeLongestStreakRecord(
  allMatches: StatsMatch[],
  profiles: StatsProfile[]
): RecordEntry {
  let bestId: string | null = null;
  let bestStreak = 0;

  for (const profile of profiles) {
    const own = allMatches.filter(
      (match) =>
        involvesPlayer(match, profile.id) &&
        match.match_type === "league"
    );

    const streak = longestWinStreak(own, profile.id);

    if (streak > bestStreak) {
      bestStreak = streak;
      bestId = profile.id;
    }
  }

  return {
    id: "longest-streak",
    title: "Longest League Win Streak",
    description: "Longest run of consecutive league duel wins, ever.",
    holderId: bestId,
    holderValue: bestId === null ? "—" : `${bestStreak} in a row`,
    eligible: bestId !== null && bestStreak > 0,
  };
}

export function computeCurrentStreakRecord(
  allMatches: StatsMatch[],
  profiles: StatsProfile[]
): RecordEntry {
  let bestId: string | null = null;
  let bestStreak = 0;

  for (const profile of profiles) {
    const own = allMatches.filter(
      (match) =>
        involvesPlayer(match, profile.id) &&
        match.match_type === "league"
    );

    const streak = currentStreak(own, profile.id);

    if (streak.type === "W" && streak.count > bestStreak) {
      bestStreak = streak.count;
      bestId = profile.id;
    }
  }

  return {
    id: "current-streak",
    title: "Hottest Current Streak",
    description: "Who is on a win streak right now.",
    holderId: bestId,
    holderValue: bestId === null ? "No one is on a streak" : `${bestStreak} in a row`,
    eligible: bestId !== null,
  };
}

export function computeBiggestRivalryRecord(
  allMatches: StatsMatch[],
  profiles: StatsProfile[]
): RecordEntry & { opponentId: string | null } {
  let bestPair: [string, string] | null = null;
  let bestCount = 0;

  const seen = new Set<string>();

  for (const profile of profiles) {
    for (const opponent of profiles) {
      if (profile.id >= opponent.id) continue;

      const key = `${profile.id}:${opponent.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const count = allMatches.filter(
        (match) =>
          (match.player_one_id === profile.id &&
            match.player_two_id === opponent.id) ||
          (match.player_one_id === opponent.id &&
            match.player_two_id === profile.id)
      ).length;

      if (count > bestCount) {
        bestCount = count;
        bestPair = [profile.id, opponent.id];
      }
    }
  }

  return {
    id: "biggest-rivalry",
    title: "Biggest Rivalry",
    description: "The pair who have faced each other the most.",
    holderId: bestPair?.[0] ?? null,
    opponentId: bestPair?.[1] ?? null,
    holderValue: bestPair === null ? "—" : `${bestCount} duels`,
    eligible: bestPair !== null && bestCount > 0,
  };
}

export type CollectionCount = {
  profileId: string;
  count: number;
};

export function computeBiggestCollectionRecord(
  counts: CollectionCount[]
): RecordEntry {
  let best: CollectionCount | null = null;

  for (const entry of counts) {
    if (!best || entry.count > best.count) {
      best = entry;
    }
  }

  return {
    id: "biggest-collection",
    title: "Biggest Collection",
    description: "Most physical cards currently owned.",
    holderId: best?.profileId ?? null,
    holderValue: best ? `${best.count} cards` : "—",
    eligible: Boolean(best && best.count > 0),
  };
}

export type CompetitionWinCount = {
  profileId: string;
  wins: number;
};

export function computeMostCompetitionWinsRecord(
  counts: CompetitionWinCount[]
): RecordEntry {
  let best: CompetitionWinCount | null = null;

  for (const entry of counts) {
    if (!best || entry.wins > best.wins) {
      best = entry;
    }
  }

  return {
    id: "most-competition-wins",
    title: "Most Competitions Won",
    description: "First-place finishes in completed competitions.",
    holderId: best && best.wins > 0 ? best.profileId : null,
    holderValue: best && best.wins > 0 ? `${best.wins} title${best.wins === 1 ? "" : "s"}` : "None yet",
    eligible: Boolean(best && best.wins > 0),
  };
}
