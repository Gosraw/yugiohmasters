import Image from "next/image";
import Link from "next/link";

import {
  ArrowLeft,
  Award,
  BookOpen,
  CheckCircle2,
  Coins,
  Crown,
  Flame,
  Gift,
  Home,
  LockKeyhole,
  LogOut,
  Medal,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  UserRound,
  Vote,
  Zap,
} from "lucide-react";

import {
  logout,
} from "@/app/actions/auth";

import {
  chooseBossMonster,
  equipAchievementTitle,
  unequipAchievementTitle,
} from "@/app/actions/profile";

import type {
  LucideIcon,
} from "lucide-react";

import {
  ProfileForm,
} from "@/components/profile-form";

import {
  ConfirmSubmitButton,
} from "@/components/confirm-submit-button";

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
  getPrimaryBossIdentity,
} from "@/lib/boss-identity";

import {
  getPendingCardVoteCount,
} from "@/lib/attention-items";

import {
  InstallAppCard,
} from "@/components/install-app-card";

import {
  SoundToggle,
} from "@/components/sound-toggle";

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
// PROFILE HUB LINKS
//
// 2.0 menu: Profile is the home for Boss Path, wallet, perks
// and Stats (rivalries + records + achievements). These used
// to live on the old /explore "More" page.
// =========================================================

type ProfileHubLink = {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
};

const PROFILE_HUB_GROUPS: {
  title: string;
  links: ProfileHubLink[];
}[] = [
  {
    title: "Your Path",
    links: [
      {
        href: "/boss",
        label: "Boss Path",
        hint: "Evolve your signature monster",
        icon: Crown,
      },
      {
        href: "/wallet",
        label: "DP Wallet",
        hint: "Every Duel Point in and out",
        icon: Coins,
      },
      {
        href: "/perks",
        label: "Perks",
        hint: "Real-life deals worth DP",
        icon: Gift,
      },
    ],
  },
  {
    title: "Stats",
    links: [
      {
        href: "/rivalries",
        label: "Rivalries",
        hint: "Head-to-head records",
        icon: Swords,
      },
      {
        href: "/records",
        label: "Records",
        hint: "League bragging rights",
        icon: BookOpen,
      },
      {
        href: "/achievements",
        label: "Achievements",
        hint: "Badges and milestones",
        icon: Award,
      },
    ],
  },
];

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
  // PARALLEL LOADS (perf, 2026-10-12)
  //
  // These queries don't depend on each other, so they run at the
  // same time instead of one after another (was ~11 sequential
  // round trips, 2-5 s). The league-scoped ones start right after
  // the membership lookup below.
  // ======================================================

  const [
    profileResult,
    titlesResult,
    membershipResult,
    bossOptionsResult,
    bossRouteIdentityResult,
    collectionResult,
  ] = await Promise.all([
    supabase
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
      .maybeSingle(),
    supabase
      .from(
        "profile_titles"
      )
      .select(
        "id,title,season_number"
      )
      .eq(
        "profile_id",
        userId
      )
      .order(
        "granted_at",
        {
          ascending: true,
        }
      ),
    supabase
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
      .maybeSingle(),
    supabase
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
      ),
    getPrimaryBossIdentity(
      supabase,
      userId
    ),
    supabase
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
      ),
  ]);

  // ======================================================
  // PROFILE
  // ======================================================

  const {
    data: profileData,
    error: profileError,
  } = profileResult;

  if (
    profileError ||
    !profileData
  ) {
    throw new Error(
      "Could not load your profile."
    );
  }

  const profile =
    profileData as Profile;

  // Permanent titles (Season Path final tier, mini game wins, later
  // season champion) - public.profile_titles.
  const {
    data: titleRows,
  } = titlesResult;

  const earnedTitles =
    (titleRows ?? []) as {
      id: string;
      title: string;
      season_number: number | null;
    }[];

  // ======================================================
  // LEAGUE
  // ======================================================

  const {
    data: membership,
    error: membershipError,
  } = membershipResult;

  if (
    membershipError ||
    !membership
  ) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="panel p-6">
          No league found.
        </div>
      </main>
    );
  }

  const leagueId =
    membership.league_id;

  const [
    pendingCardVotes,
    matchResult,
    leagueProfiles,
    tradeResult,
    deckResult,
  ] = await Promise.all([
    getPendingCardVoteCount(
      supabase,
      userId,
      leagueId
    ),
    supabase
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
      ),
    getLeagueProfiles(
      supabase,
      leagueId
    ),
    supabase
      .from("trades")
      .select("status")
      .eq(
        "league_id",
        leagueId
      )
      .or(
        `sender_id.eq.${userId},receiver_id.eq.${userId}`
      ),
    supabase
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
      ),
  ]);

  // 2.0 card pool vote (/vote): pendingCardVotes, loaded above.

  // ======================================================
  // BOSS MONSTERS
  // ======================================================

  const {
    data: bossOptionsData,
    error: bossOptionsError,
  } = bossOptionsResult;

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

  // AUDIT FIX (Season 1 audit, legacy schema-assumption item): the
  // "boss" resolved above is the OLD pre-Boss-Route cosmetic pick
  // (profiles.boss_monster_option_id / boss_monster_options), which
  // the mandatory Season 1 onboarding gate never sets for a new
  // player (it sends them through /boss/select instead of the old
  // /onboarding flow that used to write this field). It is kept
  // below as a separate, clearly-labeled cosmetic flavor pick - see
  // src/lib/boss-identity.ts for why it must not be conflated with
  // a player's real, currently-evolving Boss Route identity, which
  // this second lookup resolves the same way Home does.
  const bossRouteIdentity =
    bossRouteIdentityResult;

  // ======================================================
  // MATCHES
  // ======================================================

  const {
    data: matchData,
    error: matchError,
  } = matchResult;

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
  } = tradeResult;

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
  } = collectionResult;

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
  } = deckResult;

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

        <section className="arena-frame relative mt-6 overflow-hidden rounded-[28px] border border-amber-300/15 bg-gradient-to-br from-white/[0.045] via-black/45 to-black/75 shadow-[0_30px_100px_rgba(0,0,0,.45)]">
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

              {earnedTitles.length > 0 && (
                <ul
                  aria-label="Earned titles"
                  className="mt-3 flex flex-wrap gap-2"
                >
                  {earnedTitles.map(
                    (earned) => (
                      <li
                        key={earned.id}
                        data-testid="earned-title"
                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[11px] font-black tracking-wide text-amber-100"
                      >
                        <Medal
                          size={12}
                          className="text-amber-300"
                        />

                        {earned.title}

                        {earned.season_number !== null && (
                          <span className="text-[10px] font-bold text-amber-200/60">
                            S
                            {
                              earned.season_number
                            }
                          </span>
                        )}
                      </li>
                    )
                  )}
                </ul>
              )}

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
            PROFILE HUB - Boss Path, wallet, perks and Stats
        ================================================== */}

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          {PROFILE_HUB_GROUPS.map(
            (group) => (
              <nav
                key={
                  group.title
                }
                aria-label={
                  group.title
                }
                className="panel p-4"
              >
                <h2 className="text-xs font-bold uppercase tracking-[.18em] text-amber-300">
                  {
                    group.title
                  }
                </h2>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {group.links.map(
                    (link) => {
                      const Icon =
                        link.icon;

                      return (
                        <Link
                          key={
                            link.href
                          }
                          href={
                            link.href
                          }
                          className="group flex min-w-0 cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-amber-300/10 bg-white/[0.025] px-2 py-3 text-center transition-all hover:-translate-y-0.5 hover:border-amber-300/35 hover:bg-amber-300/[0.06] active:scale-[0.97] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                        >
                          <Icon
                            size={20}
                            className="text-amber-300 transition-transform group-hover:scale-110 motion-reduce:transition-none"
                          />

                          <span className="w-full truncate text-xs font-black text-zinc-100">
                            {
                              link.label
                            }
                          </span>

                          <span className="hidden text-[11px] leading-4 text-zinc-500 sm:block">
                            {
                              link.hint
                            }
                          </span>
                        </Link>
                      );
                    }
                  )}
                </div>
              </nav>
            )
          )}
        </section>

        {/* ==================================================
            CARD VOTE (2.0 card pool vote)
        ================================================== */}

        <Link
          href="/vote"
          className="panel group mt-4 flex min-h-16 items-center gap-3.5 p-4 transition-all hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/[0.07] text-amber-300">
            <Vote
              size={18}
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-bold text-amber-100">
              Card Vote
            </p>

            <p className="text-xs text-zinc-500">
              {pendingCardVotes > 0
                ? `${pendingCardVotes} card${pendingCardVotes === 1 ? "" : "s"} waiting for your vote`
                : "Rate the card pool and see the results"}
            </p>
          </div>

          {pendingCardVotes > 0 && (
            <span className="shrink-0 rounded-full border border-amber-300/40 bg-amber-300/15 px-2.5 py-1 text-xs font-black text-amber-100">
              {
                pendingCardVotes
              }
            </span>
          )}
        </Link>

        {/* ==================================================
            BOSS ROUTE (Season 1 - the real, currently-evolving
            identity; see src/lib/boss-identity.ts)
        ================================================== */}

        <section className="panel relative mt-6 overflow-hidden p-6">
          <div className="pointer-events-none absolute right-[-60px] top-[-60px] h-56 w-56 rounded-full bg-amber-400/[0.07] blur-3xl" />

          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Crown
                  size={17}
                  className="text-amber-300"
                />

                <p className="text-xs font-black uppercase tracking-[.2em] text-amber-300">
                  Boss Route
                </p>
              </div>

              <h2 className="mt-3 text-2xl font-black">
                {bossRouteIdentity?.name ??
                  "No Boss Route chosen yet"}
              </h2>

              {bossRouteIdentity?.subtitle && (
                <p className="mt-1 text-xs font-bold uppercase tracking-wider text-zinc-600">
                  {bossRouteIdentity.subtitle}
                </p>
              )}
            </div>

            <Link
              href="/boss"
              className="inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-2 text-sm font-bold text-amber-300 transition-all hover:border-amber-300/40 hover:bg-amber-300/10 active:scale-95"
            >
              {bossRouteIdentity
                ? "View Boss Route"
                : "Choose Boss Route"}
            </Link>
          </div>
        </section>

        {/* ==================================================
            BOSS MONSTER (COSMETIC) - the OLD pre-Boss-Route pick,
            unrelated to Season 1 progression above. Kept as-is,
            out of scope for this audit pass.
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
                  Boss Monster (Cosmetic)
                </p>
              </div>

              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                A calling card only - separate from your Boss Route above
              </p>

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

            {bossOptions.length ===
              0 && (
              <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm text-zinc-500">
                No cosmetic Boss Monsters are available right now. Your real Boss Route above is not affected.
              </div>
            )}

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

        <div className="mt-6">
          <SoundToggle />
        </div>

        <div className="mt-6">
          <InstallAppCard />
        </div>

        {/* ==================================================
            LOG OUT
        ================================================== */}

        <section className="panel mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-zinc-100">
              Log out
            </p>

            <p className="mt-1 text-xs text-zinc-500">
              Sign out on this device. Your cards, DP and progress stay safe.
            </p>
          </div>

          <form
            action={
              logout
            }
          >
            <ConfirmSubmitButton
              confirmMessage="Log out of Duelist Circle on this device?"
              pendingLabel="Logging out..."
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-300/25 bg-red-300/[0.06] px-5 py-2.5 text-sm font-black text-red-200 transition-colors hover:bg-red-300/[0.12] sm:w-auto"
            >
              <LogOut
                size={16}
              />
              Log out
            </ConfirmSubmitButton>
          </form>
        </section>
      </div>
    </main>
  );
}