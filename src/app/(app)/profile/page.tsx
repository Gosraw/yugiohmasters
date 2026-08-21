import Image from "next/image";
import Link from "next/link";

import {
  ArrowLeft,
  Award,
  Bell,
  BookOpen,
  CheckCircle2,
  Crown,
  Flame,
  Home,
  LockKeyhole,
  Medal,
  Rss,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Swords,
  Timer,
  Trophy,
  UserRound,
  Zap,
} from "lucide-react";

import {
  chooseBossMonster,
  equipAchievementTitle,
  unequipAchievementTitle,
} from "@/app/actions/profile";

import {
  ProfileForm,
} from "@/components/profile-form";

import {
  SubmitButton,
} from "@/components/submit-button";

import {
  ACHIEVEMENT_REWARDS,
  type AchievementRewardId,
} from "@/lib/achievement-rewards";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  computeRivalSummaries,
  currentStreak,
  getLeagueProfiles,
  involvesPlayer,
  profileName,
} from "@/lib/league-stats";

export const dynamic =
  "force-dynamic";

// =========================================================
// TYPES
// =========================================================

type Profile = {
  id: string;

  username:
    | string
    | null;

  duelist_name: string;

  avatar_url:
    | string
    | null;

  custom_title:
    | string
    | null;

  catchphrase:
    | string
    | null;

  bio:
    | string
    | null;

  favorite_play_style:
    | string
    | null;

  favorite_card_type:
    | string
    | null;

  favorite_attribute:
    | string
    | null;

  favorite_monster_type:
    | string
    | null;

  boss_monster_option_id:
    | string
    | null;

  accent_theme:
    | string
    | null;

  signature_quote:
    | string
    | null;

  profile_banner_url:
    | string
    | null;

  boss_personality:
    | string
    | null;

  duel_points: number;
};

type BossMonsterOption = {
  id: string;
  name: string;

  subtitle:
    | string
    | null;

  image_url:
    | string
    | null;

  active: boolean;
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
  status:
    | "draft"
    | "pending"
    | "accepted"
    | "declined"
    | "cancelled";
};

type Deck = {
  status:
    | "draft"
    | "ready"
    | "archived";

  is_active: boolean;
};

// =========================================================
// HELPERS
// =========================================================

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
    const match of
    ordered
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

export default async function ProfilePage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  // ======================================================
  // PROFILE
  // ======================================================

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
        avatar_url,
        custom_title,
        catchphrase,
        bio,
        favorite_play_style,
        favorite_card_type,
        favorite_attribute,
        favorite_monster_type,
        boss_monster_option_id,
        accent_theme,
        signature_quote,
        profile_banner_url,
        boss_personality,
        duel_points
      `
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
  // BOSS MONSTERS
  // ======================================================

  const {
    data: bossOptionsData,
    error: bossOptionsError,
  } = await supabase
    .from(
      "boss_monster_options"
    )
    .select(
      `
        id,
        name,
        subtitle,
        image_url,
        active
      `
    )
    .eq(
      "active",
      true
    )
    .order(
      "sort_order",
      {
        ascending: true,
      }
    );

  if (
    bossOptionsError
  ) {
    throw new Error(
      bossOptionsError.message
    );
  }

  const bossOptions =
    (bossOptionsData ??
      []) as BossMonsterOption[];

  const boss =
    bossOptions.find(
      (option) =>
        option.id ===
        profile
          .boss_monster_option_id
    ) ?? null;

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

  const leagueMatches =
    matches.filter(
      (match) =>
        match.status ===
          "completed" &&
        match.match_type ===
          "league"
    );

  const wins =
    leagueMatches.filter(
      (match) =>
        match.winner_id ===
        userId
    ).length;

  const losses =
    leagueMatches.filter(
      (match) =>
        match.winner_id !==
          null &&
        match.winner_id !==
          userId
    ).length;

  const draws =
    leagueMatches.filter(
      (match) =>
        match.result ===
          "draw" ||
        match.winner_id ===
          null
    ).length;

  const winStreak =
    getCurrentWinStreak(
      leagueMatches,
      userId
    );

  // ======================================================
  // TROPHY ROOM: TOP RIVAL
  // ======================================================

  const leagueProfiles =
    await getLeagueProfiles(
      supabase,
      leagueId
    );

  const rivalSummaries =
    computeRivalSummaries(
      matches.filter(
        (match) =>
          match.status === "completed"
      ),
      userId
    );

  const topRival = rivalSummaries[0] ?? null;

  const topRivalProfile = topRival
    ? leagueProfiles.find(
        (candidate) => candidate.id === topRival.opponentId
      )
    : null;

  const topRivalStreak = topRival
    ? currentStreak(
        matches.filter(
          (match) =>
            match.status === "completed" &&
            involvesPlayer(match, topRival.opponentId) &&
            involvesPlayer(match, userId)
        ),
        userId
      )
    : null;

  // ======================================================
  // RIVALRY WINS
  // ======================================================

  const rivalWins =
    new Map<
      string,
      number
    >();

  for (
    const match of
    leagueMatches
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

    rivalWins.set(
      opponentId,
      (rivalWins.get(
        opponentId
      ) ?? 0) + 1
    );
  }

  const mostWinsVsRival =
    Math.max(
      0,
      ...rivalWins.values()
    );

  // ======================================================
  // PRACTICE WAGER WINS
  // ======================================================

  const wagerWins =
    matches.filter(
      (match) =>
        match.status ===
          "completed" &&
        match.match_type ===
          "practice" &&
        match.wager_type !==
          "none" &&
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
    .select("status")
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
      collectionCountRaw,
    error: collectionError,
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
    collectionCountRaw ??
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
      "status,is_active"
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

  const readyDecks =
    decks.filter(
      (deck) =>
        deck.status ===
        "ready"
    );

  const hasActiveReadyDeck =
    readyDecks.some(
      (deck) =>
        deck.is_active
    );

  // ======================================================
  // UNLOCKED ACHIEVEMENT TITLES
  // ======================================================

  const unlockedAchievementIds =
    new Set<
      AchievementRewardId
    >();

  if (
    wins >= 1
  ) {
    unlockedAchievementIds.add(
      "first-blood"
    );
  }

  if (
    leagueMatches.length >=
    10
  ) {
    unlockedAchievementIds.add(
      "seasoned-duelist"
    );
  }

  if (
    winStreak >= 3
  ) {
    unlockedAchievementIds.add(
      "on-fire"
    );
  }

  if (
    winStreak >= 5
  ) {
    unlockedAchievementIds.add(
      "unstoppable"
    );
  }

  if (
    mostWinsVsRival >=
    3
  ) {
    unlockedAchievementIds.add(
      "rival-crusher"
    );
  }

  if (
    completedTrades >=
    1
  ) {
    unlockedAchievementIds.add(
      "trade-initiate"
    );
  }

  if (
    completedTrades >=
    5
  ) {
    unlockedAchievementIds.add(
      "trade-master"
    );
  }

  if (
    collectionCount >=
    25
  ) {
    unlockedAchievementIds.add(
      "collector"
    );
  }

  if (
    collectionCount >=
    50
  ) {
    unlockedAchievementIds.add(
      "vault-keeper"
    );
  }

  if (
    hasActiveReadyDeck
  ) {
    unlockedAchievementIds.add(
      "battle-ready"
    );
  }

  if (
    readyDecks.length >=
    3
  ) {
    unlockedAchievementIds.add(
      "deck-builder"
    );
  }

  if (
    wagerWins >= 1
  ) {
    unlockedAchievementIds.add(
      "high-roller"
    );
  }

  if (
    profile.duel_points >=
    500
  ) {
    unlockedAchievementIds.add(
      "duel-banker"
    );
  }

  if (
    profile.duel_points >=
    1000
  ) {
    unlockedAchievementIds.add(
      "dp-legend"
    );
  }

  const unlockedTitleRewards =
    ACHIEVEMENT_REWARDS.filter(
      (reward) =>
        unlockedAchievementIds.has(
          reward.achievementId
        ) &&
        (
          reward.rewardType ===
            "title" ||
          reward.rewardType ===
            "prestige"
        )
    );

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* BACKGROUND */}

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-amber-400/[0.05] blur-[150px]" />

        <div className="absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-violet-500/[0.06] blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {/* NAVIGATION */}

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

        {/* ==================================================
            HERO
        ================================================== */}

        <section className="relative mt-6 overflow-hidden rounded-[28px] border border-amber-300/15 bg-gradient-to-br from-white/[0.045] via-black/45 to-black/75 shadow-[0_30px_100px_rgba(0,0,0,.45)]">
          {profile.profile_banner_url && (
            <div className="pointer-events-none absolute inset-0 opacity-20">
              <Image
                src={
                  profile.profile_banner_url
                }
                alt=""
                fill
                sizes="100vw"
                className="object-cover"
                unoptimized
              />

              <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/50" />
            </div>
          )}

          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-violet-500/[0.08] blur-[100px]" />

            <div className="absolute bottom-[-120px] left-[20%] h-64 w-64 rounded-full bg-amber-400/[0.05] blur-[90px]" />
          </div>

          <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_.7fr] lg:items-center">
            {/* IDENTITY */}

            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-amber-200">
                <Crown
                  size={12}
                />

                Duelist Identity
              </div>

              <h1 className="gold-text mt-5 text-4xl font-black sm:text-5xl">
                {
                  profile.duelist_name
                }
              </h1>

              <p className="mt-2 text-sm font-black uppercase tracking-[.18em] text-violet-300">
                {profile.custom_title ??
                  "League Duelist"}
              </p>

              {profile.catchphrase && (
                <p className="mt-4 max-w-xl text-lg font-semibold italic leading-7 text-zinc-300">
                  &ldquo;
                  {
                    profile.catchphrase
                  }
                  &rdquo;
                </p>
              )}

              {profile.signature_quote && (
                <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">
                  {
                    profile.signature_quote
                  }
                </p>
              )}

              <div className="mt-6 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-200">
                  <Trophy
                    size={11}
                  />

                  {wins} Wins
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/20 bg-red-400/[0.07] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-200">
                  <Swords
                    size={11}
                  />

                  {losses} Losses
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-500/20 bg-zinc-500/[0.07] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                  {draws} Draws
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-200">
                  <Zap
                    size={11}
                  />

                  {
                    profile.duel_points
                  }{" "}
                  DP
                </span>
              </div>
            </div>

            {/* AVATAR */}

            <div className="flex justify-center lg:justify-end">
              <div className="relative flex h-44 w-44 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/40 shadow-[0_0_70px_rgba(139,92,246,.10)]">
                <div className="pointer-events-none absolute inset-3 z-10 rounded-full border border-violet-300/10" />

                {profile.avatar_url ? (
                  <Image
                    src={
                      profile.avatar_url
                    }
                    alt={
                      profile.duelist_name
                    }
                    fill
                    sizes="176px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <UserRound
                    size={58}
                    className="text-zinc-600"
                  />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ==================================================
            BOSS MONSTER
        ================================================== */}

        <section className="panel relative mt-6 overflow-hidden p-6">
          <div className="pointer-events-none absolute right-[-60px] top-[-60px] h-56 w-56 rounded-full bg-violet-500/[0.07] blur-3xl" />

          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles
                  size={17}
                  className="text-violet-300"
                />

                <p className="text-xs font-black uppercase tracking-[.2em] text-violet-300">
                  Boss Monster
                </p>
              </div>

              <h2 className="mt-3 text-2xl font-black">
                {boss?.name ??
                  "Unbound"}
              </h2>

              {boss?.subtitle && (
                <p className="mt-1 text-xs font-bold uppercase tracking-wider text-zinc-600">
                  {
                    boss.subtitle
                  }
                </p>
              )}

              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">
                {boss
                  ? `Personality: ${profile.boss_personality ?? "sarcastic"}. Your Boss Monster represents your identity inside the league.`
                  : "Your Boss Monster has not been chosen yet."}
              </p>
            </div>

            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-violet-300/15 bg-violet-300/[0.04]">
              {boss?.image_url ? (
                <Image
                  src={
                    boss.image_url
                  }
                  alt={
                    boss.name
                  }
                  fill
                  sizes="96px"
                  className="object-contain"
                  unoptimized
                />
              ) : boss ? (
                <Crown
                  size={30}
                  className="text-amber-300"
                />
              ) : (
                <Sparkles
                  size={28}
                  className="text-violet-300"
                />
              )}
            </div>
          </div>

          {/* BOSS OPTIONS */}

          <div className="relative mt-6 border-t border-white/[0.06] pt-5">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-zinc-600">
              Choose Boss Monster
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {bossOptions.map(
                (option) => {
                  const selected =
                    option.id ===
                    profile
                      .boss_monster_option_id;

                  return (
                    <form
                      key={
                        option.id
                      }
                      action={
                        chooseBossMonster
                      }
                    >
                      <input
                        type="hidden"
                        name="boss_monster_option_id"
                        value={
                          option.id
                        }
                      />

                      <SubmitButton
                        pendingLabel="Selecting..."
                        className={`w-full rounded-xl border p-4 text-left transition ${
                          selected
                            ? "border-violet-300/30 bg-violet-300/[0.06]"
                            : "border-white/[0.07] bg-white/[0.02] hover:border-violet-300/20"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-black text-zinc-200">
                              {
                                option.name
                              }
                            </p>

                            <p className="mt-1 truncate text-[10px] text-zinc-600">
                              {option.subtitle ??
                                "Boss Monster"}
                            </p>
                          </div>

                          {selected && (
                            <CheckCircle2
                              size={16}
                              className="shrink-0 text-emerald-300"
                            />
                          )}
                        </div>
                      </SubmitButton>
                    </form>
                  );
                }
              )}
            </div>
          </div>
        </section>

        {/* ==================================================
            TITLE SHOWCASE
        ================================================== */}

        <section className="panel relative mt-6 overflow-hidden p-6">
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-400/[0.05] blur-3xl" />

          <div className="relative">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Award
                    size={17}
                    className="text-amber-300"
                  />

                  <p className="text-xs font-black uppercase tracking-[.2em] text-amber-300">
                    Duelist Title
                  </p>
                </div>

                <h2 className="mt-3 text-2xl font-black">
                  Reputation
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                  Titles are earned through achievements. Equip one to display it across the League, Duels and Trades.
                </p>
              </div>

              <div className="rounded-2xl border border-violet-300/15 bg-violet-300/[0.035] px-4 py-3 sm:min-w-[190px]">
                <p className="text-[9px] font-black uppercase tracking-[.18em] text-zinc-600">
                  Equipped
                </p>

                <p className="mt-2 font-black text-violet-200">
                  {profile.custom_title ??
                    "League Duelist"}
                </p>
              </div>
            </div>

            {unlockedTitleRewards.length >
            0 ? (
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {unlockedTitleRewards.map(
                  (reward) => {
                    const equipped =
                      profile.custom_title ===
                      reward.rewardValue;

                    return (
                      <div
                        key={
                          reward.achievementId
                        }
                        className={`rounded-2xl border p-4 ${
                          equipped
                            ? "border-amber-300/30 bg-amber-300/[0.055]"
                            : "border-white/[0.07] bg-white/[0.02]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 items-start gap-3">
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                                reward.tier ===
                                "legendary"
                                  ? "border-violet-300/20 bg-violet-300/[0.06]"
                                  : reward.tier ===
                                      "gold"
                                    ? "border-amber-300/20 bg-amber-300/[0.06]"
                                    : "border-cyan-300/15 bg-cyan-300/[0.04]"
                              }`}
                            >
                              {reward.tier ===
                              "legendary" ? (
                                <Crown
                                  size={18}
                                  className="text-violet-200"
                                />
                              ) : (
                                <Medal
                                  size={18}
                                  className="text-amber-300"
                                />
                              )}
                            </div>

                            <div className="min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-[.16em] text-zinc-600">
                                {
                                  reward.tier
                                }
                              </p>

                              <p className="mt-1 truncate text-lg font-black text-zinc-200">
                                {
                                  reward.rewardValue
                                }
                              </p>

                              <p className="mt-2 text-xs leading-5 text-zinc-600">
                                {
                                  reward.description
                                }
                              </p>
                            </div>
                          </div>

                          {equipped && (
                            <CheckCircle2
                              size={17}
                              className="shrink-0 text-emerald-300"
                            />
                          )}
                        </div>

                        <div className="mt-4 border-t border-white/[0.05] pt-4">
                          {equipped ? (
                            <form
                              action={
                                unequipAchievementTitle
                              }
                            >
                              <SubmitButton
                                pendingLabel="Unequipping..."
                                className="inline-flex items-center gap-2 rounded-xl border border-zinc-500/20 bg-white/[0.02] px-3 py-2 text-xs font-black text-zinc-400 transition hover:text-zinc-200"
                              >
                                <LockKeyhole
                                  size={13}
                                />

                                Unequip Title
                              </SubmitButton>
                            </form>
                          ) : (
                            <form
                              action={
                                equipAchievementTitle
                              }
                            >
                              <input
                                type="hidden"
                                name="achievement_id"
                                value={
                                  reward.achievementId
                                }
                              />

                              <SubmitButton
                                pendingLabel="Equipping..."
                                className="inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-xs font-black text-amber-200 transition hover:border-amber-300/35 hover:bg-amber-300/[0.1]"
                              >
                                <Crown
                                  size={13}
                                />

                                Equip Title
                              </SubmitButton>
                            </form>
                          )}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-6 text-center">
                <LockKeyhole
                  size={24}
                  className="mx-auto text-zinc-700"
                />

                <p className="mt-3 font-black text-zinc-400">
                  No titles unlocked yet
                </p>

                <p className="mt-2 text-sm text-zinc-600">
                  Complete achievements to earn duelist titles.
                </p>
              </div>
            )}

            <div className="mt-5 border-t border-white/[0.06] pt-4">
              <Link
                href="/achievements"
                className="inline-flex items-center gap-2 text-sm font-black text-violet-300 transition hover:text-violet-200"
              >
                <Trophy
                  size={15}
                />

                Open Trophy Cabinet
              </Link>
            </div>
          </div>
        </section>

        {/* ==================================================
            STATS
        ================================================== */}

        <section className="mt-6 grid gap-3 sm:grid-cols-4">
          <div className="panel relative min-h-[105px] overflow-hidden p-5">
            <Trophy
              size={38}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white opacity-[0.04]"
            />

            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
              Victories
            </p>

            <p className="mt-2 text-3xl font-black text-emerald-200">
              {wins}
            </p>
          </div>

          <div className="panel relative min-h-[105px] overflow-hidden p-5">
            <Swords
              size={38}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white opacity-[0.04]"
            />

            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
              Defeats
            </p>

            <p className="mt-2 text-3xl font-black text-red-200">
              {losses}
            </p>
          </div>

          <div className="panel relative min-h-[105px] overflow-hidden p-5">
            <ShieldCheck
              size={38}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white opacity-[0.04]"
            />

            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
              Draws
            </p>

            <p className="mt-2 text-3xl font-black text-zinc-300">
              {draws}
            </p>
          </div>

          <div className="panel relative min-h-[105px] overflow-hidden p-5">
            <Zap
              size={38}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white opacity-[0.04]"
            />

            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
              Duel Points
            </p>

            <p className="mt-2 text-3xl font-black text-cyan-200">
              {
                profile.duel_points
              }
            </p>
          </div>
        </section>

        {/* ==================================================
            TROPHY ROOM
        ================================================== */}

        <section className="panel relative mt-6 overflow-hidden p-6">
          <div className="flex items-center gap-2">
            <ScrollText
              size={18}
              className="text-amber-300"
            />

            <div>
              <p className="text-[9px] font-black uppercase tracking-[.18em] text-zinc-600">
                Trophy Room
              </p>

              <h2 className="mt-1 text-xl font-black text-zinc-100">
                Legacy &amp; Rivalries
              </h2>
            </div>
          </div>

          {topRival && topRivalProfile ? (
            <Link
              href={`/rivalries/${topRival.opponentId}`}
              className="group mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-red-300/15 bg-red-300/[0.03] p-4 transition-all hover:-translate-y-0.5 hover:border-red-300/30"
            >
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-wider text-red-300">
                  Top Rival
                </p>
                <p className="mt-1 truncate text-lg font-black text-zinc-100 group-hover:text-red-200">
                  {profileName(topRivalProfile)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {topRival.wins}-{topRival.losses}
                  {topRival.draws > 0 ? `-${topRival.draws}` : ""} across{" "}
                  {topRival.total} duels
                  {topRivalStreak &&
                  topRivalStreak.type === "W" &&
                  topRivalStreak.count >= 2
                    ? ` · ${topRivalStreak.count}-duel streak`
                    : ""}
                </p>
              </div>

              <Swords
                size={20}
                className="shrink-0 text-red-300/60 transition-transform group-hover:translate-x-1"
              />
            </Link>
          ) : (
            <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm text-zinc-500">
              Play your first duel to start a rivalry.
            </div>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Link
              href="/rivalries"
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-black uppercase tracking-wider text-zinc-300 transition-all hover:-translate-y-0.5 hover:border-red-300/25 hover:text-red-200"
            >
              <Swords size={14} />
              Rivalries
            </Link>

            <Link
              href="/records"
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-black uppercase tracking-wider text-zinc-300 transition-all hover:-translate-y-0.5 hover:border-amber-300/25 hover:text-amber-200"
            >
              <BookOpen size={14} />
              Record Book
            </Link>

            <Link
              href="/activity"
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-black uppercase tracking-wider text-zinc-300 transition-all hover:-translate-y-0.5 hover:border-violet-300/25 hover:text-violet-200"
            >
              <Rss size={14} />
              Activity
            </Link>

            <Link
              href="/attention"
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-black uppercase tracking-wider text-zinc-300 transition-all hover:-translate-y-0.5 hover:border-amber-300/25 hover:text-amber-200"
            >
              <Bell size={14} />
              Attention
            </Link>

            <Link
              href="/duel-companion"
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-black uppercase tracking-wider text-zinc-300 transition-all hover:-translate-y-0.5 hover:border-cyan-300/25 hover:text-cyan-200"
            >
              <Timer size={14} />
              Duel Tools
            </Link>
          </div>

          {winStreak >= 2 && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.03] px-4 py-3">
              <Flame
                size={16}
                className="text-amber-300"
              />
              <p className="text-sm font-bold text-amber-200">
                You&apos;re on a {winStreak}-duel league win streak.
              </p>
            </div>
          )}
        </section>

        {/* ==================================================
            PERSONALIZATION
        ================================================== */}

        <section className="panel relative mt-6 overflow-hidden p-6">
          <Zap
            size={48}
            className="pointer-events-none absolute right-5 top-5 text-white opacity-[0.035]"
          />

          <div className="relative">
            <div className="flex items-center gap-2">
              <UserRound
                size={17}
                className="text-amber-300"
              />

              <p className="text-xs font-black uppercase tracking-[.2em] text-amber-300">
                Personalization
              </p>
            </div>

            <h2 className="mt-3 text-2xl font-black">
              Edit Identity
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              Customize your name, avatar, banner, Boss Monster personality and dueling preferences. Achievement titles are managed separately above.
            </p>

            <div className="mt-6">
              <ProfileForm
                profile={
                  profile
                }
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}