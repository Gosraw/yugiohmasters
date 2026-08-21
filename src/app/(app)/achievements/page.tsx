import Link from "next/link";

import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Coins,
  Crown,
  Flame,
  Gem,
  Home,
  Layers3,
  LockKeyhole,
  Medal,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  Vault,
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

type Profile = {
  id: string;
  duel_points: number;
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

  status:
    | "pending"
    | "accepted"
    | "result_submitted"
    | "disputed"
    | "completed"
    | "cancelled"
    | "declined";

  match_type:
    | "league"
    | "practice";

  wager_type:
    | "none"
    | "dp"
    | "card";

  completed_at:
    | string
    | null;

  created_at: string;
};

type Trade = {
  id: string;

  sender_id: string;
  receiver_id: string;

  status:
    | "draft"
    | "pending"
    | "accepted"
    | "declined"
    | "cancelled";
};

type Deck = {
  id: string;

  status:
    | "draft"
    | "ready"
    | "archived";

  is_active: boolean;
};

type Achievement = {
  id: string;
  name: string;
  subtitle: string;
  description: string;

  progress: number;
  target: number;

  unlocked: boolean;

  tier:
    | "bronze"
    | "silver"
    | "gold"
    | "legendary";

  icon:
    typeof Trophy;
};

// =========================================================
// HELPERS
// =========================================================

function clampProgress(
  value: number,
  target: number
) {
  if (target <= 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.round(
      (value / target) *
        100
    )
  );
}

function tierClasses(
  tier: Achievement["tier"],
  unlocked: boolean
) {
  if (!unlocked) {
    return {
      border:
        "border-white/[0.07]",

      background:
        "bg-white/[0.018]",

      icon:
        "text-zinc-700",

      label:
        "text-zinc-600",
    };
  }

  if (
    tier ===
    "legendary"
  ) {
    return {
      border:
        "border-violet-300/30",

      background:
        "bg-violet-300/[0.055]",

      icon:
        "text-violet-200",

      label:
        "text-violet-200",
    };
  }

  if (tier === "gold") {
    return {
      border:
        "border-amber-300/30",

      background:
        "bg-amber-300/[0.055]",

      icon:
        "text-amber-200",

      label:
        "text-amber-200",
    };
  }

  if (
    tier ===
    "silver"
  ) {
    return {
      border:
        "border-cyan-300/25",

      background:
        "bg-cyan-300/[0.045]",

      icon:
        "text-cyan-200",

      label:
        "text-cyan-200",
    };
  }

  return {
    border:
      "border-orange-300/25",

    background:
      "bg-orange-300/[0.04]",

    icon:
      "text-orange-200",

    label:
      "text-orange-200",
  };
}

function tierLabel(
  tier: Achievement["tier"]
) {
  if (
    tier ===
    "legendary"
  ) {
    return "Legendary";
  }

  if (tier === "gold") {
    return "Gold";
  }

  if (
    tier ===
    "silver"
  ) {
    return "Silver";
  }

  return "Bronze";
}

function resultForPlayer(
  match: Match,
  userId: string
) {
  if (
    match.result ===
      "draw" ||
    !match.winner_id
  ) {
    return "D";
  }

  if (
    match.winner_id ===
    userId
  ) {
    return "W";
  }

  return "L";
}

function getCurrentWinStreak(
  matches: Match[],
  userId: string
) {
  const ordered =
    [...matches].sort(
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

  let streak = 0;

  for (
    const match of ordered
  ) {
    if (
      resultForPlayer(
        match,
        userId
      ) !== "W"
    ) {
      break;
    }

    streak += 1;
  }

  return streak;
}

// =========================================================
// PAGE
// =========================================================

export default async function AchievementsPage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  // ======================================================
  // LEAGUE
  // ======================================================

  const {
    data: membership,
    error: membershipError,
  } = await supabase
    .from(
      "league_members"
    )
    .select(
      "league_id"
    )
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
  // PROFILE / DP
  // ======================================================

  const {
    data: profileData,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select(
      "id,duel_points"
    )
    .eq(
      "id",
      userId
    )
    .maybeSingle();

  if (
    profileError ||
    !profileData
  ) {
    throw new Error(
      "Profiel kon niet worden geladen."
    );
  }

  const profile =
    profileData as Profile;

  // ======================================================
  // MATCHES
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
        status,
        match_type,
        wager_type,
        completed_at,
        created_at
      `
    )
    .eq(
      "league_id",
      leagueId
    )
    .or(
      `player_one_id.eq.${userId},player_two_id.eq.${userId}`
    );

  if (matchError) {
    throw new Error(
      matchError.message
    );
  }

  const matches =
    (matchData ??
      []) as Match[];

  const completedLeagueMatches =
    matches.filter(
      (match) =>
        match.status ===
          "completed" &&
        match.match_type ===
          "league"
    );

  const leagueWins =
    completedLeagueMatches.filter(
      (match) =>
        match.winner_id ===
        userId
    ).length;

  const currentWinStreak =
    getCurrentWinStreak(
      completedLeagueMatches,
      userId
    );

  // ======================================================
  // RIVAL DOMINATION
  // ======================================================

  const winsByOpponent =
    new Map<
      string,
      number
    >();

  for (
    const match of
    completedLeagueMatches
  ) {
    if (
      match.winner_id !==
      userId
    ) {
      continue;
    }

    const opponentId =
      match.player_one_id ===
      userId
        ? match.player_two_id
        : match.player_one_id;

    winsByOpponent.set(
      opponentId,
      (winsByOpponent.get(
        opponentId
      ) ?? 0) + 1
    );
  }

  const mostWinsVsOneRival =
    Math.max(
      0,
      ...winsByOpponent.values()
    );

  // ======================================================
  // PRACTICE WAGERS
  // ======================================================

  const completedPracticeWagers =
    matches.filter(
      (match) =>
        match.status ===
          "completed" &&
        match.match_type ===
          "practice" &&
        match.wager_type !==
          "none"
    );

  const wagerWins =
    completedPracticeWagers.filter(
      (match) =>
        match.winner_id ===
        userId
    ).length;

  // ======================================================
  // TRADES
  // ======================================================

  const {
    data: tradeData,
    error: tradeError,
  } = await supabase
    .from("trades")
    .select(
      `
        id,
        sender_id,
        receiver_id,
        status
      `
    )
    .eq(
      "league_id",
      leagueId
    )
    .or(
      `sender_id.eq.${userId},receiver_id.eq.${userId}`
    );

  if (tradeError) {
    throw new Error(
      tradeError.message
    );
  }

  const trades =
    (tradeData ??
      []) as Trade[];

  const completedTrades =
    trades.filter(
      (trade) =>
        trade.status ===
        "accepted"
    ).length;

  // ======================================================
  // COLLECTION
  // ======================================================

  const {
    count:
      physicalCardCount,
    error:
      collectionError,
  } = await supabase
    .from(
      "card_instances"
    )
    .select(
      "id",
      {
        count: "exact",
        head: true,
      }
    )
    .eq(
      "current_owner_id",
      userId
    );

  if (
    collectionError
  ) {
    throw new Error(
      collectionError.message
    );
  }

  const collectionCount =
    physicalCardCount ??
    0;

  // ======================================================
  // DECKS
  // ======================================================

  const {
    data: deckData,
    error: deckError,
  } = await supabase
    .from("decks")
    .select(
      "id,status,is_active"
    )
    .eq(
      "league_id",
      leagueId
    )
    .eq(
      "owner_id",
      userId
    );

  if (deckError) {
    throw new Error(
      deckError.message
    );
  }

  const decks =
    (deckData ??
      []) as Deck[];

  const readyDeckCount =
    decks.filter(
      (deck) =>
        deck.status ===
        "ready"
    ).length;

  const hasActiveReadyDeck =
    decks.some(
      (deck) =>
        deck.status ===
          "ready" &&
        deck.is_active
    );

  // ======================================================
  // ACHIEVEMENTS
  // ======================================================

  const achievements:
    Achievement[] =
    [
      {
        id:
          "first-blood",

        name:
          "First Blood",

        subtitle:
          "Win your first official duel",

        description:
          "Claim your first confirmed victory in a League Duel.",

        progress:
          leagueWins,

        target:
          1,

        unlocked:
          leagueWins >=
          1,

        tier:
          "bronze",

        icon:
          Swords,
      },

      {
        id:
          "seasoned-duelist",

        name:
          "Seasoned Duelist",

        subtitle:
          "Complete 10 League Duels",

        description:
          "Prove that you keep showing up when the ranking is on the line.",

        progress:
          completedLeagueMatches.length,

        target:
          10,

        unlocked:
          completedLeagueMatches.length >=
          10,

        tier:
          "silver",

        icon:
          ShieldCheck,
      },

      {
        id:
          "on-fire",

        name:
          "On Fire",

        subtitle:
          "Win 3 League Duels in a row",

        description:
          "Build a three-match official winning streak.",

        progress:
          currentWinStreak,

        target:
          3,

        unlocked:
          currentWinStreak >=
          3,

        tier:
          "silver",

        icon:
          Flame,
      },

      {
        id:
          "unstoppable",

        name:
          "Unstoppable",

        subtitle:
          "Win 5 League Duels in a row",

        description:
          "Five consecutive official victories. Your rivals have a problem.",

        progress:
          currentWinStreak,

        target:
          5,

        unlocked:
          currentWinStreak >=
          5,

        tier:
          "legendary",

        icon:
          Crown,
      },

      {
        id:
          "rival-crusher",

        name:
          "Rival Crusher",

        subtitle:
          "Defeat one rival 3 times",

        description:
          "Score three official League victories against the same opponent.",

        progress:
          mostWinsVsOneRival,

        target:
          3,

        unlocked:
          mostWinsVsOneRival >=
          3,

        tier:
          "gold",

        icon:
          Trophy,
      },

      {
        id:
          "trade-initiate",

        name:
          "Trade Initiate",

        subtitle:
          "Complete your first trade",

        description:
          "Successfully exchange physical card copies with another duelist.",

        progress:
          completedTrades,

        target:
          1,

        unlocked:
          completedTrades >=
          1,

        tier:
          "bronze",

        icon:
          Repeat2,
      },

      {
        id:
          "trade-master",

        name:
          "Trade Master",

        subtitle:
          "Complete 5 trades",

        description:
          "Become one of the league's most active card negotiators.",

        progress:
          completedTrades,

        target:
          5,

        unlocked:
          completedTrades >=
          5,

        tier:
          "gold",

        icon:
          Repeat2,
      },

      {
        id:
          "collector",

        name:
          "Collector",

        subtitle:
          "Own 25 physical cards",

        description:
          "Build a collection of at least twenty-five tracked physical card copies.",

        progress:
          collectionCount,

        target:
          25,

        unlocked:
          collectionCount >=
          25,

        tier:
          "silver",

        icon:
          Gem,
      },

      {
        id:
          "vault-keeper",

        name:
          "Vault Keeper",

        subtitle:
          "Own 50 physical cards",

        description:
          "Reach fifty physical card copies in your personal Collection.",

        progress:
          collectionCount,

        target:
          50,

        unlocked:
          collectionCount >=
          50,

        tier:
          "gold",

        icon:
          Vault,
      },

      {
        id:
          "battle-ready",

        name:
          "Battle Ready",

        subtitle:
          "Activate a Ready Deck",

        description:
          "Prepare a legal Ready deck and make it your active battle deck.",

        progress:
          hasActiveReadyDeck
            ? 1
            : 0,

        target:
          1,

        unlocked:
          hasActiveReadyDeck,

        tier:
          "bronze",

        icon:
          Layers3,
      },

      {
        id:
          "deck-builder",

        name:
          "Deck Architect",

        subtitle:
          "Build 3 Ready Decks",

        description:
          "Maintain three different decks that have reached Ready status.",

        progress:
          readyDeckCount,

        target:
          3,

        unlocked:
          readyDeckCount >=
          3,

        tier:
          "gold",

        icon:
          Layers3,
      },

      {
        id:
          "high-roller",

        name:
          "High Roller",

        subtitle:
          "Win a Practice Wager",

        description:
          "Win a confirmed Practice Duel where DP or a physical card was on the line.",

        progress:
          wagerWins,

        target:
          1,

        unlocked:
          wagerWins >=
          1,

        tier:
          "gold",

        icon:
          LockKeyhole,
      },

      {
        id:
          "duel-banker",

        name:
          "Duel Banker",

        subtitle:
          "Hold 500 DP",

        description:
          "Accumulate five hundred Duel Points earned through official competition.",

        progress:
          profile.duel_points,

        target:
          500,

        unlocked:
          profile.duel_points >=
          500,

        tier:
          "gold",

        icon:
          Coins,
      },

      {
        id:
          "dp-legend",

        name:
          "DP Legend",

        subtitle:
          "Hold 1000 DP",

        description:
          "Reach four digits in your Duel Point balance.",

        progress:
          profile.duel_points,

        target:
          1000,

        unlocked:
          profile.duel_points >=
          1000,

        tier:
          "legendary",

        icon:
          Zap,
      },
    ];

  const unlocked =
    achievements.filter(
      (achievement) =>
        achievement.unlocked
    );

  const locked =
    achievements.filter(
      (achievement) =>
        !achievement.unlocked
    );

  const completion =
    achievements.length >
    0
      ? Math.round(
          (unlocked.length /
            achievements.length) *
            100
        )
      : 0;

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* BACKGROUND */}

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-amber-400/[0.055] blur-[150px]" />

        <div className="absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-violet-500/[0.06] blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* NAV */}

        <nav className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300 transition hover:border-amber-300/40 hover:bg-amber-300/10"
          >
            <ArrowLeft
              size={17}
            />

            Back
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-sm font-bold text-zinc-400 transition hover:border-white/20 hover:text-zinc-100"
          >
            <Home
              size={16}
            />

            Home
          </Link>
        </nav>

        {/* HERO */}

        <header className="arena-frame relative mt-6 overflow-hidden rounded-[28px] border border-amber-300/15 bg-gradient-to-br from-white/[0.045] via-black/45 to-black/75 p-6 shadow-[0_30px_100px_rgba(0,0,0,.45)] sm:p-8">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-amber-400/[0.07] blur-[100px]" />

            <div className="absolute bottom-[-100px] left-[20%] h-64 w-64 rounded-full bg-violet-500/[0.06] blur-[100px]" />
          </div>

          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-amber-200">
                <Award
                  size={12}
                />

                Duelist Legacy
              </div>

              <h1 className="gold-text mt-5 text-4xl font-black sm:text-5xl">
                Achievements
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                Build your reputation through League Duels, rivalries, deck building, collecting, trading and high-stakes Practice Duels.
              </p>
            </div>

            <div className="min-w-[220px] rounded-2xl border border-amber-300/15 bg-black/30 p-5">
              <div className="flex items-center gap-2">
                <Trophy
                  size={16}
                  className="text-amber-300"
                />

                <p className="text-[9px] font-black uppercase tracking-[.18em] text-zinc-600">
                  Legacy Progress
                </p>
              </div>

              <p className="mt-3 text-4xl font-black text-amber-100">
                {completion}%
              </p>

              <p className="mt-1 text-xs text-zinc-600">
                {unlocked.length} /{" "}
                {achievements.length} unlocked
              </p>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full rounded-full bg-amber-300"
                  style={{
                    width: `${completion}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </header>

        {/* STATS */}

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="panel p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Unlocked
            </p>

            <p className="mt-1 text-2xl font-black text-emerald-200">
              {unlocked.length}
            </p>
          </div>

          <div className="panel p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Remaining
            </p>

            <p className="mt-1 text-2xl font-black text-zinc-300">
              {locked.length}
            </p>
          </div>

          <div className="panel p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Duel Points
            </p>

            <p className="mt-1 text-2xl font-black text-cyan-200">
              {profile.duel_points}
            </p>
          </div>

          <div className="panel p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              League Wins
            </p>

            <p className="mt-1 text-2xl font-black text-amber-200">
              {leagueWins}
            </p>
          </div>
        </section>

        {/* UNLOCKED */}

        <section className="mt-8">
          <div className="flex items-center gap-3">
            <Trophy
              size={19}
              className="text-amber-300"
            />

            <div>
              <p className="text-[9px] font-black uppercase tracking-[.2em] text-amber-300">
                Trophy Cabinet
              </p>

              <h2 className="mt-1 text-2xl font-black">
                Unlocked
              </h2>
            </div>
          </div>

          {unlocked.length ===
          0 ? (
            <div className="panel mt-4 p-8 text-center">
              <Medal
                size={30}
                className="mx-auto text-zinc-700"
              />

              <p className="mt-4 font-black">
                Your legacy starts now
              </p>

              <p className="mt-2 text-sm text-zinc-600">
                Complete your first objectives to unlock achievements.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {unlocked.map(
                (achievement) => {
                  const styles =
                    tierClasses(
                      achievement.tier,
                      true
                    );

                  const Icon =
                    achievement.icon;

                  return (
                    <div
                      key={
                        achievement.id
                      }
                      className={`relative overflow-hidden rounded-2xl border p-5 ${styles.border} ${styles.background}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-black/20 ${styles.icon}`}
                        >
                          <Icon
                            size={21}
                          />
                        </div>

                        <CheckCircle2
                          size={17}
                          className="text-emerald-300"
                        />
                      </div>

                      <p
                        className={`mt-4 text-[9px] font-black uppercase tracking-[.18em] ${styles.label}`}
                      >
                        {tierLabel(
                          achievement.tier
                        )}
                      </p>

                      <h3 className="mt-1 text-xl font-black">
                        {
                          achievement.name
                        }
                      </h3>

                      <p className="mt-1 text-xs font-bold text-zinc-400">
                        {
                          achievement.subtitle
                        }
                      </p>

                      <p className="mt-3 text-sm leading-6 text-zinc-600">
                        {
                          achievement.description
                        }
                      </p>

                      <div className="mt-4 rounded-xl border border-emerald-300/10 bg-emerald-300/[0.035] p-3">
                        <p className="text-[9px] font-black uppercase tracking-wider text-emerald-300">
                          Achievement Unlocked
                        </p>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </section>

        {/* LOCKED */}

        {locked.length >
          0 && (
          <section className="mt-10 border-t border-white/[0.05] pt-8">
            <div className="flex items-center gap-3">
              <LockKeyhole
                size={18}
                className="text-zinc-600"
              />

              <div>
                <p className="text-[9px] font-black uppercase tracking-[.2em] text-zinc-600">
                  Next Objectives
                </p>

                <h2 className="mt-1 text-2xl font-black text-zinc-300">
                  Locked Achievements
                </h2>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {locked.map(
                (achievement) => {
                  const styles =
                    tierClasses(
                      achievement.tier,
                      false
                    );

                  const Icon =
                    achievement.icon;

                  const percentage =
                    clampProgress(
                      achievement.progress,
                      achievement.target
                    );

                  return (
                    <div
                      key={
                        achievement.id
                      }
                      className={`rounded-2xl border p-5 ${styles.border} ${styles.background}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] bg-black/20 ${styles.icon}`}
                        >
                          <Icon
                            size={20}
                          />
                        </div>

                        <LockKeyhole
                          size={15}
                          className="text-zinc-700"
                        />
                      </div>

                      <p className="mt-4 text-[9px] font-black uppercase tracking-[.18em] text-zinc-700">
                        {tierLabel(
                          achievement.tier
                        )}
                      </p>

                      <h3 className="mt-1 text-lg font-black text-zinc-400">
                        {
                          achievement.name
                        }
                      </h3>

                      <p className="mt-1 text-xs font-bold text-zinc-600">
                        {
                          achievement.subtitle
                        }
                      </p>

                      <p className="mt-3 text-sm leading-6 text-zinc-700">
                        {
                          achievement.description
                        }
                      </p>

                      <div className="mt-5">
                        <div className="flex items-center justify-between gap-3 text-[9px] font-black uppercase tracking-wider text-zinc-600">
                          <span>
                            Progress
                          </span>

                          <span>
                            {Math.min(
                              achievement.progress,
                              achievement.target
                            )}{" "}
                            /{" "}
                            {
                              achievement.target
                            }
                          </span>
                        </div>

                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                          <div
                            className="h-full rounded-full bg-zinc-600"
                            style={{
                              width: `${percentage}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          </section>
        )}

        {/* INFO */}

        <section className="panel mt-8 p-5">
          <div className="flex items-start gap-3">
            <Sparkles
              size={18}
              className="mt-0.5 shrink-0 text-violet-300"
            />

            <div>
              <p className="font-black">
                Duelist Legacy
              </p>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Achievements are calculated from your real league activity. Practice Duels never count toward official League-win or streak achievements, but wagers can unlock their own milestones.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}