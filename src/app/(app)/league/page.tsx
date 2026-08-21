import Link from "next/link";

import {
  Activity,
  ArrowLeft,
  Crown,
  Flame,
  Home,
  Medal,
  Minus,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  UserRound,
  Zap,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

export const dynamic =
  "force-dynamic";

// =========================================================
// TYPES
// =========================================================

type LeagueMember = {
  profile_id: string;
  role: string;
};

type Profile = {
  id: string;
  username: string | null;
  duelist_name: string;
  custom_title: string | null;
  avatar_url: string | null;
  boss_monster_option_id: string | null;
  accent_theme: string | null;
};

type BossMonster = {
  id: string;
  name: string;
  image_url: string | null;
};

type Match = {
  id: string;

  player_one_id: string;
  player_two_id: string;

  winner_id:
    | string
    | null;

  result:
    | "player_one_win"
    | "player_two_win"
    | "draw"
    | null;

  completed_at:
    | string
    | null;

  created_at: string;
};

type StreakType =
  | "W"
  | "L"
  | "D"
  | null;

type PlayerStanding = {
  profile: Profile;

  bossMonster:
    | BossMonster
    | null;

  wins: number;
  losses: number;
  draws: number;
  played: number;

  points: number;
  winRate: number;

  streakType: StreakType;
  streakCount: number;

  rank: number;
};

type Rivalry = {
  playerOne: Profile;
  playerTwo: Profile;

  playerOneBoss:
    | BossMonster
    | null;

  playerTwoBoss:
    | BossMonster
    | null;

  playerOneWins: number;
  playerTwoWins: number;
  draws: number;
  played: number;

  difference: number;
};

// =========================================================
// HELPERS
// =========================================================

function playerName(
  profile:
    | Profile
    | undefined
) {
  return (
    profile?.duelist_name ??
    profile?.username ??
    "Duelist"
  );
}

function formatDate(
  value:
    | string
    | null
) {
  if (!value) {
    return "—";
  }

  return new Date(
    value
  ).toLocaleDateString(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

function rankLabel(
  rank: number
) {
  if (rank === 1) {
    return "League Champion";
  }

  if (rank === 2) {
    return "Top Challenger";
  }

  if (rank === 3) {
    return "Rising Duelist";
  }

  return "League Duelist";
}

function RankIcon({
  rank,
}: {
  rank: number;
}) {
  if (rank === 1) {
    return (
      <Crown
        size={22}
        className="text-amber-300"
      />
    );
  }

  if (rank === 2) {
    return (
      <Medal
        size={22}
        className="text-zinc-300"
      />
    );
  }

  if (rank === 3) {
    return (
      <Medal
        size={22}
        className="text-orange-300"
      />
    );
  }

  return (
    <ShieldCheck
      size={20}
      className="text-zinc-500"
    />
  );
}

function resultForPlayer(
  match: Match,
  profileId: string
): StreakType {
  if (
    match.result ===
    "draw"
  ) {
    return "D";
  }

  if (
    match.winner_id ===
    profileId
  ) {
    return "W";
  }

  if (
    match.winner_id
  ) {
    return "L";
  }

  return "D";
}

function calculateStreak(
  matches: Match[],
  profileId: string
) {
  const playerMatches =
    matches
      .filter(
        (match) =>
          match.player_one_id ===
            profileId ||
          match.player_two_id ===
            profileId
      )
      .sort(
        (a, b) =>
          new Date(
            b.completed_at ??
              b.created_at
          ).getTime() -
          new Date(
            a.completed_at ??
              a.created_at
          ).getTime()
      );

  if (
    playerMatches.length ===
    0
  ) {
    return {
      type:
        null as StreakType,

      count: 0,
    };
  }

  const firstResult =
    resultForPlayer(
      playerMatches[0],
      profileId
    );

  let count = 0;

  for (
    const match of
    playerMatches
  ) {
    if (
      resultForPlayer(
        match,
        profileId
      ) !== firstResult
    ) {
      break;
    }

    count += 1;
  }

  return {
    type: firstResult,
    count,
  };
}

function streakLabel(
  type: StreakType,
  count: number
) {
  if (
    !type ||
    count === 0
  ) {
    return "No streak";
  }

  if (type === "W") {
    return `W${count}`;
  }

  if (type === "L") {
    return `L${count}`;
  }

  return `D${count}`;
}

// =========================================================
// PAGE
// =========================================================

export default async function LeaguePage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  // ======================================================
  // CURRENT LEAGUE
  // ======================================================

  const {
    data: membership,
    error: membershipError,
  } = await supabase
    .from("league_members")
    .select("league_id")
    .eq(
      "profile_id",
      userId
    )
    .limit(1)
    .maybeSingle();

  if (
    membershipError ||
    !membership
  ) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="panel p-6">
          Geen league gevonden.
        </div>
      </main>
    );
  }

  const leagueId =
    membership.league_id;

  // ======================================================
  // LEAGUE INFO
  // ======================================================

  const {
    data: league,
    error: leagueError,
  } = await supabase
    .from("leagues")
    .select("id,name")
    .eq(
      "id",
      leagueId
    )
    .maybeSingle();

  if (leagueError) {
    throw new Error(
      leagueError.message
    );
  }

  // ======================================================
  // MEMBERS
  // ======================================================

  const {
    data: memberData,
    error: memberError,
  } = await supabase
    .from("league_members")
    .select(
      "profile_id,role"
    )
    .eq(
      "league_id",
      leagueId
    );

  if (memberError) {
    throw new Error(
      memberError.message
    );
  }

  const members =
    (memberData ??
      []) as LeagueMember[];

  const profileIds =
    members.map(
      (member) =>
        member.profile_id
    );

  // ======================================================
  // PROFILES
  // ======================================================

  let profiles:
    Profile[] =
    [];

  if (
    profileIds.length >
    0
  ) {
    const {
      data: profileData,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select(
        `
          id,
          username,
          duelist_name,
          custom_title,
          avatar_url,
          boss_monster_option_id,
          accent_theme
        `
      )
      .in(
        "id",
        profileIds
      );

    if (profileError) {
      throw new Error(
        profileError.message
      );
    }

    profiles =
      (profileData ??
        []) as Profile[];
  }

  const profileMap =
    new Map(
      profiles.map(
        (profile) => [
          profile.id,
          profile,
        ]
      )
    );

  // ======================================================
  // BOSS MONSTERS
  // ======================================================

  const bossIds = [
    ...new Set(
      profiles
        .map(
          (profile) =>
            profile
              .boss_monster_option_id
        )
        .filter(
          (
            value
          ): value is string =>
            Boolean(value)
        )
    ),
  ];

  let bossMonsters:
    BossMonster[] =
    [];

  if (
    bossIds.length >
    0
  ) {
    const {
      data: bossData,
      error: bossError,
    } = await supabase
      .from(
        "boss_monster_options"
      )
      .select(
        "id,name,image_url"
      )
      .in(
        "id",
        bossIds
      );

    if (bossError) {
      throw new Error(
        bossError.message
      );
    }

    bossMonsters =
      (bossData ??
        []) as BossMonster[];
  }

  const bossMap =
    new Map(
      bossMonsters.map(
        (boss) => [
          boss.id,
          boss,
        ]
      )
    );

  function bossForProfile(
    profile: Profile
  ) {
    if (
      !profile
        .boss_monster_option_id
    ) {
      return null;
    }

    return (
      bossMap.get(
        profile
          .boss_monster_option_id
      ) ?? null
    );
  }

  // ======================================================
  // OFFICIAL LEAGUE MATCHES ONLY
  //
  // Practice duels never enter:
  // - standings
  // - streaks
  // - rivalries
  // - recent league history
  // ======================================================

  const {
    data: matchData,
    error: matchError,
  } = await supabase
    .from("matches")
    .select(
      `
        id,
        player_one_id,
        player_two_id,
        winner_id,
        result,
        completed_at,
        created_at
      `
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
      "match_type",
      "league"
    )
    .order(
      "completed_at",
      {
        ascending: false,
      }
    );

  if (matchError) {
    throw new Error(
      matchError.message
    );
  }

  const matches =
    (matchData ??
      []) as Match[];

  // ======================================================
  // STANDINGS
  // ======================================================

  const standings:
    PlayerStanding[] =
    profiles.map(
      (profile) => {
        const playerMatches =
          matches.filter(
            (match) =>
              match.player_one_id ===
                profile.id ||
              match.player_two_id ===
                profile.id
          );

        const wins =
          playerMatches.filter(
            (match) =>
              match.winner_id ===
              profile.id
          ).length;

        const losses =
          playerMatches.filter(
            (match) =>
              match.winner_id !==
                null &&
              match.winner_id !==
                profile.id
          ).length;

        const draws =
          playerMatches.filter(
            (match) =>
              match.result ===
                "draw" ||
              match.winner_id ===
                null
          ).length;

        const played =
          playerMatches.length;

        const points =
          wins * 3 +
          draws;

        const winRate =
          played > 0
            ? Math.round(
                (wins /
                  played) *
                  100
              )
            : 0;

        const streak =
          calculateStreak(
            matches,
            profile.id
          );

        return {
          profile,

          bossMonster:
            bossForProfile(
              profile
            ),

          wins,
          losses,
          draws,
          played,

          points,
          winRate,

          streakType:
            streak.type,

          streakCount:
            streak.count,

          rank: 0,
        };
      }
    );

  standings.sort(
    (a, b) =>
      b.points -
        a.points ||
      b.wins -
        a.wins ||
      b.winRate -
        a.winRate ||
      playerName(
        a.profile
      ).localeCompare(
        playerName(
          b.profile
        )
      )
  );

  standings.forEach(
    (
      standing,
      index
    ) => {
      standing.rank =
        index + 1;
    }
  );

  // ======================================================
  // RIVALRIES
  // ======================================================

  const rivalries:
    Rivalry[] =
    [];

  for (
    let i = 0;
    i <
    profiles.length;
    i += 1
  ) {
    for (
      let j = i + 1;
      j <
      profiles.length;
      j += 1
    ) {
      const playerOne =
        profiles[i];

      const playerTwo =
        profiles[j];

      const rivalryMatches =
        matches.filter(
          (match) =>
            (match.player_one_id ===
              playerOne.id &&
              match.player_two_id ===
                playerTwo.id) ||
            (match.player_one_id ===
              playerTwo.id &&
              match.player_two_id ===
                playerOne.id)
        );

      const playerOneWins =
        rivalryMatches.filter(
          (match) =>
            match.winner_id ===
            playerOne.id
        ).length;

      const playerTwoWins =
        rivalryMatches.filter(
          (match) =>
            match.winner_id ===
            playerTwo.id
        ).length;

      const draws =
        rivalryMatches.filter(
          (match) =>
            match.result ===
              "draw" ||
            match.winner_id ===
              null
        ).length;

      rivalries.push({
        playerOne,
        playerTwo,

        playerOneBoss:
          bossForProfile(
            playerOne
          ),

        playerTwoBoss:
          bossForProfile(
            playerTwo
          ),

        playerOneWins,
        playerTwoWins,
        draws,

        played:
          rivalryMatches.length,

        difference:
          Math.abs(
            playerOneWins -
              playerTwoWins
          ),
      });
    }
  }

  const activeRivalries =
    rivalries.filter(
      (rivalry) =>
        rivalry.played > 0
    );

  const closestRivalry =
    [...activeRivalries].sort(
      (a, b) =>
        a.difference -
          b.difference ||
        b.played -
          a.played
    )[0];

  // ======================================================
  // SUMMARY
  // ======================================================

  const currentStanding =
    standings.find(
      (standing) =>
        standing.profile.id ===
        userId
    );

  const hottestStanding =
    [...standings]
      .filter(
        (standing) =>
          standing.streakType ===
            "W" &&
          standing.streakCount >
            0
      )
      .sort(
        (a, b) =>
          b.streakCount -
          a.streakCount
      )[0];

  const recentMatches =
    matches.slice(
      0,
      5
    );

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* BACKGROUND */}

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-amber-400/[0.06] blur-[150px]" />

        <div className="absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-violet-500/[0.06] blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ==================================================
            NAVIGATION
        ================================================== */}

        <nav className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300 transition-all hover:border-amber-300/40 hover:bg-amber-300/10"
          >
            <ArrowLeft
              size={17}
            />

            Back
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-sm font-bold text-zinc-400 transition-all hover:border-white/20 hover:text-zinc-100"
          >
            <Home
              size={16}
            />

            Home
          </Link>
        </nav>

        {/* ==================================================
            HERO
        ================================================== */}

        <header className="arena-frame relative mt-6 overflow-hidden rounded-[28px] border border-amber-300/15 bg-gradient-to-br from-white/[0.045] via-black/45 to-black/70 p-6 shadow-[0_30px_100px_rgba(0,0,0,.45)] sm:p-8">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-amber-400/[0.06] blur-[100px]" />

            <div className="absolute bottom-[-100px] left-[20%] h-64 w-64 rounded-full bg-violet-500/[0.05] blur-[100px]" />
          </div>

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-amber-200">
                <Trophy
                  size={12}
                />

                Official Competition
              </div>

              <p className="mt-5 text-xs font-black uppercase tracking-[.28em] text-zinc-500">
                {league?.name ??
                  "Duelist Circle"}
              </p>

              <h1 className="gold-text mt-2 text-4xl font-black sm:text-5xl">
                Duelist League
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                Challenge your rivals, play the actual duel in person or externally, then record the confirmed result here.
              </p>
            </div>

            {currentStanding && (
              <div className="rounded-2xl border border-amber-300/15 bg-black/30 px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-[.2em] text-zinc-600">
                  Your Position
                </p>

                <div className="mt-2 flex items-center gap-3">
                  <RankIcon
                    rank={
                      currentStanding.rank
                    }
                  />

                  <div>
                    <p className="text-2xl font-black text-amber-200">
                      #
                      {
                        currentStanding.rank
                      }
                    </p>

                    <p className="text-xs text-zinc-500">
                      {rankLabel(
                        currentStanding.rank
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* ==================================================
            QUICK STATS
        ================================================== */}

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="panel p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Duelists
            </p>

            <p className="mt-1 text-2xl font-black">
              {profiles.length}
            </p>
          </div>

          <div className="panel p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              League Duels
            </p>

            <p className="mt-1 text-2xl font-black text-cyan-200">
              {matches.length}
            </p>
          </div>

          <div className="panel p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Leader
            </p>

            <p className="mt-1 truncate text-lg font-black text-amber-200">
              {standings[0]
                ? playerName(
                    standings[0]
                      .profile
                  )
                : "—"}
            </p>
          </div>

          <div className="panel p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Hot Streak
            </p>

            <p className="mt-1 truncate text-lg font-black text-orange-200">
              {hottestStanding
                ? `${playerName(
                    hottestStanding
                      .profile
                  )} · W${
                    hottestStanding
                      .streakCount
                  }`
                : "—"}
            </p>
          </div>
        </section>

        {/* ==================================================
            STANDINGS
        ================================================== */}

        <section className="mt-8">
          <div className="flex items-center gap-3">
            <Crown
              size={19}
              className="text-amber-300"
            />

            <div>
              <p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-300">
                Current Order
              </p>

              <h2 className="mt-1 text-2xl font-black">
                League Standings
              </h2>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {standings.map(
              (standing) => {
                const isCurrentUser =
                  standing
                    .profile.id ===
                  userId;

                return (
                  <div
                    key={
                      standing
                        .profile.id
                    }
                    className={`panel relative overflow-hidden p-5 ${
                      standing.rank ===
                      1
                        ? "border-amber-300/25"
                        : isCurrentUser
                          ? "border-cyan-300/20"
                          : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20">
                          <RankIcon
                            rank={
                              standing.rank
                            }
                          />
                        </div>

                        <div className="min-w-0">
                          <p className="text-[9px] font-black uppercase tracking-[.18em] text-zinc-600">
                            Rank{" "}
                            {
                              standing.rank
                            }
                          </p>

                          <h3 className="mt-1 truncate text-xl font-black">
                            {playerName(
                              standing.profile
                            )}
                          </h3>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-3xl font-black text-amber-200">
                          {
                            standing.points
                          }
                        </p>

                        <p className="text-[8px] font-black uppercase tracking-wider text-zinc-600">
                          LP
                        </p>
                      </div>
                    </div>

                    <p className="mt-4 text-xs font-black uppercase tracking-[.14em] text-violet-300">
                      {standing
                        .profile
                        .custom_title ??
                        rankLabel(
                          standing.rank
                        )}
                    </p>

                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                      <Sparkles
                        size={14}
                        className="shrink-0 text-violet-300"
                      />

                      <div className="min-w-0">
                        <p className="text-[8px] font-black uppercase tracking-wider text-zinc-600">
                          Boss Monster
                        </p>

                        <p className="mt-1 truncate text-sm font-black text-zinc-300">
                          {standing
                            .bossMonster
                            ?.name ??
                            "Unbound"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                        <p className="text-lg font-black text-emerald-200">
                          {
                            standing.wins
                          }
                        </p>

                        <p className="text-[8px] font-black text-zinc-600">
                          W
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                        <p className="text-lg font-black text-red-200">
                          {
                            standing.losses
                          }
                        </p>

                        <p className="text-[8px] font-black text-zinc-600">
                          L
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                        <p className="text-lg font-black text-zinc-300">
                          {
                            standing.draws
                          }
                        </p>

                        <p className="text-[8px] font-black text-zinc-600">
                          D
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                        <p className="text-lg font-black text-cyan-200">
                          {
                            standing.winRate
                          }
                          %
                        </p>

                        <p className="text-[8px] font-black text-zinc-600">
                          WR
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[9px] font-black uppercase ${
                          standing.streakType ===
                          "W"
                            ? "border-orange-300/20 bg-orange-300/[0.06] text-orange-200"
                            : standing.streakType ===
                                "L"
                              ? "border-red-300/20 bg-red-300/[0.05] text-red-200"
                              : "border-zinc-500/20 bg-zinc-500/[0.05] text-zinc-400"
                        }`}
                      >
                        {standing.streakType ===
                        "W" ? (
                          <Flame
                            size={11}
                          />
                        ) : (
                          <Activity
                            size={11}
                          />
                        )}

                        {streakLabel(
                          standing.streakType,
                          standing.streakCount
                        )}
                      </div>

                      {isCurrentUser && (
                        <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-cyan-200">
                          <UserRound
                            size={11}
                          />

                          You
                        </span>
                      )}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </section>

        {/* ==================================================
            CLOSEST RIVALRY
        ================================================== */}

        {closestRivalry && (
          <section className="relative mt-8 overflow-hidden rounded-[24px] border border-red-300/15 bg-gradient-to-r from-red-500/[0.035] via-black/30 to-violet-500/[0.035] p-6">
            <div className="flex items-center gap-2">
              <Swords
                size={18}
                className="text-red-300"
              />

              <div>
                <p className="text-[9px] font-black uppercase tracking-[.2em] text-red-300">
                  Closest Rivalry
                </p>

                <h2 className="mt-1 text-xl font-black">
                  Battle for Supremacy
                </h2>
              </div>
            </div>

            <div className="mt-6 grid items-center gap-5 md:grid-cols-[1fr_auto_1fr]">
              <div className="text-center md:text-right">
                <p className="text-xl font-black">
                  {playerName(
                    closestRivalry
                      .playerOne
                  )}
                </p>

                <p className="mt-1 text-xs text-violet-300">
                  {closestRivalry
                    .playerOneBoss
                    ?.name ??
                    "Unbound"}
                </p>

                <p className="mt-3 text-4xl font-black text-emerald-200">
                  {
                    closestRivalry
                      .playerOneWins
                  }
                </p>
              </div>

              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-red-300/20 bg-red-300/[0.05]">
                  <Swords
                    size={20}
                    className="text-red-200"
                  />
                </div>

                <p className="mt-2 text-[9px] font-black uppercase tracking-wider text-zinc-600">
                  {
                    closestRivalry.played
                  }{" "}
                  duels
                </p>

                {closestRivalry.draws >
                  0 && (
                  <p className="mt-1 text-[9px] font-black text-zinc-500">
                    {
                      closestRivalry.draws
                    }{" "}
                    draw
                    {closestRivalry.draws ===
                    1
                      ? ""
                      : "s"}
                  </p>
                )}
              </div>

              <div className="text-center md:text-left">
                <p className="text-xl font-black">
                  {playerName(
                    closestRivalry
                      .playerTwo
                  )}
                </p>

                <p className="mt-1 text-xs text-violet-300">
                  {closestRivalry
                    .playerTwoBoss
                    ?.name ??
                    "Unbound"}
                </p>

                <p className="mt-3 text-4xl font-black text-emerald-200">
                  {
                    closestRivalry
                      .playerTwoWins
                  }
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ==================================================
            ALL HEAD TO HEAD
        ================================================== */}

        {rivalries.length >
          0 && (
          <section className="mt-8">
            <div className="flex items-center gap-2">
              <Swords
                size={18}
                className="text-cyan-300"
              />

              <div>
                <p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-300">
                  Rival Records
                </p>

                <h2 className="mt-1 text-2xl font-black">
                  Head to Head
                </h2>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {rivalries.map(
                (rivalry) => (
                  <div
                    key={`${rivalry.playerOne.id}-${rivalry.playerTwo.id}`}
                    className="panel p-5"
                  >
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <div className="min-w-0 text-right">
                        <p className="truncate text-sm font-black">
                          {playerName(
                            rivalry.playerOne
                          )}
                        </p>

                        <p className="mt-2 text-2xl font-black text-emerald-200">
                          {
                            rivalry.playerOneWins
                          }
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="h-px w-3 bg-white/10" />

                        <Swords
                          size={14}
                          className="text-zinc-600"
                        />

                        <div className="h-px w-3 bg-white/10" />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-black">
                          {playerName(
                            rivalry.playerTwo
                          )}
                        </p>

                        <p className="mt-2 text-2xl font-black text-emerald-200">
                          {
                            rivalry.playerTwoWins
                          }
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-white/[0.06] pt-3 text-center">
                      {rivalry.played ===
                      0 ? (
                        <p className="text-xs text-zinc-600">
                          No official duel yet
                        </p>
                      ) : (
                        <p className="text-xs text-zinc-500">
                          {
                            rivalry.played
                          }{" "}
                          official duel
                          {rivalry.played ===
                          1
                            ? ""
                            : "s"}

                          {rivalry.draws >
                          0
                            ? ` · ${rivalry.draws} draw${
                                rivalry.draws ===
                                1
                                  ? ""
                                  : "s"
                              }`
                            : ""}
                        </p>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {/* ==================================================
            RECENT LEAGUE RESULTS
        ================================================== */}

        <section className="mt-8">
          <div className="flex items-center gap-2">
            <Activity
              size={18}
              className="text-violet-300"
            />

            <div>
              <p className="text-[9px] font-black uppercase tracking-[.2em] text-violet-300">
                Official History
              </p>

              <h2 className="mt-1 text-2xl font-black">
                Recent League Duels
              </h2>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {recentMatches.length ===
            0 ? (
              <div className="panel p-6 text-center">
                <Swords
                  size={22}
                  className="mx-auto text-zinc-600"
                />

                <p className="mt-3 font-black">
                  No League Duels Yet
                </p>

                <p className="mt-1 text-sm text-zinc-600">
                  The first confirmed League Duel will appear here.
                </p>
              </div>
            ) : (
              recentMatches.map(
                (match) => {
                  const playerOne =
                    profileMap.get(
                      match.player_one_id
                    );

                  const playerTwo =
                    profileMap.get(
                      match.player_two_id
                    );

                  const isDraw =
                    match.result ===
                      "draw" ||
                    !match.winner_id;

                  return (
                    <Link
                      key={
                        match.id
                      }
                      href={`/matches/${match.id}`}
                      className="panel block p-4 transition-all hover:-translate-y-0.5 hover:border-amber-300/15"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span
                              className={`font-black ${
                                match.winner_id ===
                                playerOne?.id
                                  ? "text-emerald-200"
                                  : "text-zinc-300"
                              }`}
                            >
                              {playerName(
                                playerOne
                              )}
                            </span>

                            <span className="text-[10px] font-black text-zinc-700">
                              VS
                            </span>

                            <span
                              className={`font-black ${
                                match.winner_id ===
                                playerTwo?.id
                                  ? "text-emerald-200"
                                  : "text-zinc-300"
                              }`}
                            >
                              {playerName(
                                playerTwo
                              )}
                            </span>
                          </div>

                          <p className="mt-2 text-xs text-zinc-600">
                            {isDraw
                              ? "Draw"
                              : `${playerName(
                                  profileMap.get(
                                    match.winner_id ??
                                      ""
                                  )
                                )} won`}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          {isDraw ? (
                            <Minus
                              size={17}
                              className="ml-auto text-zinc-500"
                            />
                          ) : (
                            <Trophy
                              size={17}
                              className="ml-auto text-amber-300"
                            />
                          )}

                          <p className="mt-1 text-[9px] font-bold text-zinc-600">
                            {formatDate(
                              match.completed_at
                            )}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                }
              )
            )}
          </div>
        </section>

        {/* ==================================================
            RULES / EXTERNAL PLAY
        ================================================== */}

        <section className="panel mt-8 p-5">
          <div className="flex items-start gap-3">
            <Zap
              size={18}
              className="mt-0.5 shrink-0 text-amber-300"
            />

            <div>
              <p className="font-black">
                How League Duels Work
              </p>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                League Duels are played physically or through an external dueling platform. This app handles challenges, confirmed results, standings and rewards — it does not simulate the duel itself.
              </p>

              <p className="mt-3 text-xs font-bold text-zinc-600">
                Win = 3 LP · Draw = 1 LP · Loss = 0 LP · Practice Duels do not affect League standings.
              </p>
            </div>
          </div>
        </section>

        {/* ==================================================
            ACTION
        ================================================== */}

        <div className="mt-6">
          <Link
            href="/matches"
            className="primary-button inline-flex items-center justify-center gap-2"
          >
            <Swords
              size={17}
            />

            Go to Duels
          </Link>
        </div>
      </div>
    </main>
  );
}