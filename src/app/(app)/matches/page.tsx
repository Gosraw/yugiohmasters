import Link from "next/link";

import {
  redirect,
} from "next/navigation";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Crown,
  History,
  Home,
  Send,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  UserRound,
  XCircle,
  Zap,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  formatLeagueDateTime,
  formatNumber,
} from "@/lib/format-date";

import {
  getPrimaryBossIdentities,
  type BossIdentity,
} from "@/lib/boss-identity";

export const dynamic =
  "force-dynamic";

// =========================================================
// TYPES
// =========================================================

type MatchStatus =
  | "pending"
  | "accepted"
  | "result_submitted"
  | "disputed"
  | "completed"
  | "cancelled"
  | "declined";

type MatchType =
  | "league"
  | "practice";

type WagerType =
  | "none"
  | "dp"
  | "card";

type WagerStatus =
  | "none"
  | "proposed"
  | "funded"
  | "settled"
  | "released";

type Match = {
  id: string;

  player_one_id: string;
  player_two_id: string;

  status: MatchStatus;

  match_type: MatchType;

  wager_type: WagerType;
  wager_dp_amount: number;
  wager_status: WagerStatus;

  result: string | null;
  winner_id: string | null;

  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;

  result_submitted_by:
    | string
    | null;

  result_submitted_at:
    | string
    | null;

  disputed_by:
    | string
    | null;

  disputed_at:
    | string
    | null;

  player_one_deck_id:
    | string
    | null;

  player_two_deck_id:
    | string
    | null;

  competition_id:
    | string
    | null;
};

type Profile = {
  id: string;
  username: string | null;
  duelist_name: string;
  custom_title: string | null;
};

type Deck = {
  id: string;
  name: string;
};

type MatchCardProps = {
  match: Match;
  userId: string;

  profiles: Map<
    string,
    Profile
  >;

  bosses: Map<
    string,
    BossIdentity
  >;

  decks: Map<
    string,
    Deck
  >;

  accent:
    | "amber"
    | "cyan"
    | "violet"
    | "orange"
    | "zinc";
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
    "Unknown Duelist"
  );
}

function formatDate(
  value:
    | string
    | null
) {
  return formatLeagueDateTime(
    value
  );
}

function MatchStatusBadge({
  status,
}: {
  status: MatchStatus;
}) {
  if (
    status ===
    "accepted"
  ) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-200">
        <Swords size={10} />
        Ready
      </span>
    );
  }

  if (
    status ===
    "result_submitted"
  ) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-violet-300/30 bg-violet-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-violet-200">
        <Clock3 size={10} />
        Confirmation
      </span>
    );
  }

  if (
    status ===
    "disputed"
  ) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-orange-400/30 bg-orange-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-orange-200">
        <AlertTriangle
          size={10}
        />
        Disputed
      </span>
    );
  }

  if (
    status ===
    "completed"
  ) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-200">
        <CheckCircle2
          size={10}
        />
        Completed
      </span>
    );
  }

  if (
    status ===
    "cancelled"
  ) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-zinc-400">
        <XCircle size={10} />
        Cancelled
      </span>
    );
  }

  if (
    status ===
    "declined"
  ) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-400/30 bg-red-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-red-200">
        <XCircle size={10} />
        Declined
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-amber-200">
      <Clock3 size={10} />
      Pending
    </span>
  );
}

function MatchTypeBadge({
  type,
  isSeasonDuel,
}: {
  type: MatchType;
  isSeasonDuel: boolean;
}) {
  if (
    type ===
    "practice"
  ) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-violet-300/20 bg-violet-300/[0.07] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-violet-200">
        <Sparkles size={10} />
        Practice
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/20 bg-amber-300/[0.07] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-amber-200">
      <Trophy size={10} />
      {isSeasonDuel
        ? "Season"
        : "League"}
    </span>
  );
}

function WagerBadge({
  match,
}: {
  match: Match;
}) {
  if (
    match.match_type !==
      "practice" ||
    match.wager_type ===
      "none"
  ) {
    return null;
  }

  if (
    match.wager_type ===
    "dp"
  ) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-200">
        <Zap size={10} />

        {match.wager_dp_amount} DP Wager
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-300/20 bg-red-300/[0.06] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-red-200">
      <Crown size={10} />
      Card Wager
    </span>
  );
}

function accentBorder(
  accent:
    MatchCardProps["accent"]
) {
  switch (accent) {
    case "cyan":
      return "hover:border-cyan-300/25";

    case "violet":
      return "hover:border-violet-300/25";

    case "orange":
      return "hover:border-orange-300/25";

    case "zinc":
      return "hover:border-white/20";

    case "amber":
    default:
      return "hover:border-amber-300/25";
  }
}

// =========================================================
// MATCH CARD
// =========================================================

function MatchCard({
  match,
  userId,
  profiles,
  bosses,
  decks,
  accent,
}: MatchCardProps) {
  const opponentId =
    match.player_one_id ===
    userId
      ? match.player_two_id
      : match.player_one_id;

  const me =
    profiles.get(
      userId
    );

  const opponent =
    profiles.get(
      opponentId
    );

  const myDeckId =
    match.player_one_id ===
    userId
      ? match.player_one_deck_id
      : match.player_two_deck_id;

  const opponentDeckId =
    match.player_one_id ===
    userId
      ? match.player_two_deck_id
      : match.player_one_deck_id;

  const myBoss =
    me
      ? bosses.get(me.id)
      : undefined;

  const opponentBoss =
    opponent
      ? bosses.get(opponent.id)
      : undefined;

  let resultText:
    | string
    | null =
    null;

  if (
    match.status ===
    "completed"
  ) {
    if (
      match.result ===
      "draw"
    ) {
      resultText = "DRAW";
    } else if (
      match.winner_id ===
      userId
    ) {
      resultText = "VICTORY";
    } else if (
      match.winner_id
    ) {
      resultText = "DEFEAT";
    }
  }

  return (
    <Link
      href={`/matches/${match.id}`}
      className={`panel group block cursor-pointer overflow-hidden p-5 transition-all hover:-translate-y-1 active:scale-[0.99] ${accentBorder(
        accent
      )}`}
    >
      {/* BADGES */}

      <div className="flex flex-wrap items-center gap-2">
        <MatchStatusBadge
          status={
            match.status
          }
        />

        <MatchTypeBadge
          type={
            match.match_type
          }
          isSeasonDuel={
            match.competition_id !==
            null
          }
        />

        <WagerBadge
          match={
            match
          }
        />
      </div>

      {/* VS */}

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {/* ME */}

        <div className="min-w-0">
          <p className="truncate text-sm font-black text-zinc-100">
            {playerName(me)}
          </p>

          <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-violet-300">
            {myBoss?.name ??
              "Unbound"}
          </p>
        </div>

        {/* VS */}

        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/30">
          <span className="text-[10px] font-black tracking-widest text-amber-300">
            VS
          </span>
        </div>

        {/* OPPONENT */}

        <div className="min-w-0 text-right">
          <p className="truncate text-sm font-black text-zinc-100">
            {playerName(
              opponent
            )}
          </p>

          <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-violet-300">
            {opponentBoss?.name ??
              "Unbound"}
          </p>
        </div>
      </div>

      {/* DECKS */}

      {(myDeckId ||
        opponentDeckId) && (
        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Your Deck
            </p>

            <p className="mt-1 truncate text-xs font-bold text-zinc-300">
              {myDeckId
                ? decks.get(
                    myDeckId
                  )?.name ??
                  "Unknown"
                : "—"}
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-right">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Rival Deck
            </p>

            <p className="mt-1 truncate text-xs font-bold text-zinc-300">
              {opponentDeckId
                ? decks.get(
                    opponentDeckId
                  )?.name ??
                  "Unknown"
                : "—"}
            </p>
          </div>
        </div>
      )}

      {/* RESULT */}

      {resultText && (
        <div
          className={`mt-4 rounded-xl border p-3 text-center text-sm font-black tracking-[.16em] ${
            resultText ===
            "VICTORY"
              ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200"
              : resultText ===
                  "DEFEAT"
                ? "border-red-400/20 bg-red-400/[0.06] text-red-200"
                : "border-zinc-500/20 bg-zinc-500/[0.05] text-zinc-300"
          }`}
        >
          {resultText}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-white/[0.05] pt-3">
        <p className="text-[10px] text-zinc-600">
          {formatDate(
            match.completed_at ??
              match.created_at
          )}
        </p>

        <span className="text-xs font-black text-amber-300 transition group-hover:text-amber-200">
          Open Duel →
        </span>
      </div>
    </Link>
  );
}

// =========================================================
// PAGE
// =========================================================

const HISTORY_PAGE_SIZE = 20;

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{
    history?: string;
  }>;
}) {
  const {
    supabase,
    userId,
  } = await requireUser();

  const {
    history: historyParam,
  } = await searchParams;

  const historyPage =
    Math.max(
      1,
      Number.parseInt(
        historyParam ?? "1",
        10
      ) || 1
    );

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
          You are not in a league yet.
        </div>
      </main>
    );
  }

  // ======================================================
  // CURRENT PLAYER DP
  // ======================================================

  const {
    data: currentProfile,
  } = await supabase
    .from("profiles")
    .select(
      "duel_points"
    )
    .eq(
      "id",
      userId
    )
    .maybeSingle();

  const duelPoints =
    currentProfile?.duel_points ??
    0;

  // ======================================================
  // MATCHES
  // ======================================================

  // Open duels (small: only what still needs a step) and one page
  // of history, instead of every duel ever. Scheduled season duels
  // are played from the This Round screen, so they are only counted
  // here, not listed as challenges.
  const MATCH_COLUMNS =
      `
        id,
        player_one_id,
        player_two_id,
        status,
        match_type,
        wager_type,
        wager_dp_amount,
        wager_status,
        result,
        winner_id,
        created_at,
        accepted_at,
        completed_at,
        result_submitted_by,
        result_submitted_at,
        disputed_by,
        disputed_at,
        player_one_deck_id,
        player_two_deck_id,
        competition_id
      `;

  const historyFrom =
    (historyPage - 1) *
    HISTORY_PAGE_SIZE;

  const [
    openResult,
    historyResult,
    seasonCountResult,
    practiceCountResult,
    openWagerResult,
  ] = await Promise.all([
    supabase
      .from("matches")
      .select(
        MATCH_COLUMNS
      )
      .eq(
        "league_id",
        membership.league_id
      )
      .in(
        "status",
        [
          "pending",
          "accepted",
          "result_submitted",
          "disputed",
        ]
      )
      .or(
        `player_one_id.eq.${userId},player_two_id.eq.${userId}`
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(200),
    supabase
      .from("matches")
      .select(
        MATCH_COLUMNS,
        {
          count: "exact",
        }
      )
      .eq(
        "league_id",
        membership.league_id
      )
      .in(
        "status",
        [
          "completed",
          "cancelled",
          "declined",
        ]
      )
      .or(
        `player_one_id.eq.${userId},player_two_id.eq.${userId}`
      )
      // Played time first; cancelled/declined (never played) last.
      .order(
        "completed_at",
        {
          ascending: false,
          nullsFirst: false,
        }
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .range(
        historyFrom,
        historyFrom +
          HISTORY_PAGE_SIZE -
          1
      ),
    supabase
      .from("matches")
      .select(
        "id",
        {
          count: "exact",
          head: true,
        }
      )
      .eq(
        "league_id",
        membership.league_id
      )
      .eq(
        "match_type",
        "league"
      )
      .eq(
        "status",
        "completed"
      )
      .or(
        `player_one_id.eq.${userId},player_two_id.eq.${userId}`
      ),
    supabase
      .from("matches")
      .select(
        "id",
        {
          count: "exact",
          head: true,
        }
      )
      .eq(
        "league_id",
        membership.league_id
      )
      .eq(
        "match_type",
        "practice"
      )
      .eq(
        "status",
        "completed"
      )
      .or(
        `player_one_id.eq.${userId},player_two_id.eq.${userId}`
      ),
    supabase
      .from("matches")
      .select(
        "id",
        {
          count: "exact",
          head: true,
        }
      )
      .eq(
        "league_id",
        membership.league_id
      )
      .eq(
        "match_type",
        "practice"
      )
      .neq(
        "wager_type",
        "none"
      )
      .in(
        "wager_status",
        [
          "proposed",
          "funded",
        ]
      )
      .or(
        `player_one_id.eq.${userId},player_two_id.eq.${userId}`
      ),
  ]);

  // A history page past the end (old link, fewer duels now):
  // back to the first page instead of an error.
  if (
    historyResult.error &&
    historyPage > 1 &&
    historyResult.status === 416
  ) {
    redirect("/matches");
  }

  const matchError =
    openResult.error ??
    historyResult.error;

  if (matchError) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="panel p-6">
          <p className="font-bold text-red-300">
            Duels could not be loaded.
          </p>

          <p className="mt-2 text-sm text-zinc-500">
            {
              matchError.message
            }
          </p>
        </div>
      </main>
    );
  }

  const openMatches =
    (openResult.data ??
      []) as Match[];

  const history =
    (historyResult.data ??
      []) as Match[];

  const historyTotal =
    historyResult.count ??
    history.length;

  const historyPages =
    Math.max(
      1,
      Math.ceil(
        historyTotal /
          HISTORY_PAGE_SIZE
      )
    );

  const matches = [
    ...openMatches,
    ...history,
  ];

  // ======================================================
  // PROFILES
  // ======================================================

  const profileIds = [
    ...new Set(
      matches.flatMap(
        (match) => [
          match.player_one_id,
          match.player_two_id,
        ]
      )
    ),
  ];

  if (
    !profileIds.includes(
      userId
    )
  ) {
    profileIds.push(
      userId
    );
  }

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
          custom_title
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
  // BOSS IDENTITIES
  //
  // AUDIT FIX (Season 1 audit, legacy schema-assumption item): this
  // used to join through profiles.boss_monster_option_id ->
  // boss_monster_options, the OLD pre-Boss-Route cosmetic concept
  // that is never set for a Season 1 player (the mandatory
  // onboarding gate sends new players through /boss/select, not the
  // old /onboarding flow that used to write this field) - every
  // match card showed "Unbound" for a player who has clearly
  // already chosen and is actively progressing a real Boss Route.
  // See src/lib/boss-identity.ts for the shared, corrected lookup
  // (player_boss_paths route_slot 1 -> current-stage evolution
  // card), the same source Home already uses.
  // ======================================================

  const bossMap =
    await getPrimaryBossIdentities(
      supabase,
      profileIds
    );

  // ======================================================
  // DECKS
  // ======================================================

  const deckIds = [
    ...new Set(
      matches
        .flatMap(
          (match) => [
            match.player_one_deck_id,
            match.player_two_deck_id,
          ]
        )
        .filter(
          (
            value
          ): value is string =>
            Boolean(value)
        )
    ),
  ];

  let decks:
    Deck[] =
    [];

  if (
    deckIds.length >
    0
  ) {
    const {
      data: deckData,
      error: deckError,
    } = await supabase
      .from("decks")
      .select(
        "id,name"
      )
      .in(
        "id",
        deckIds
      );

    if (deckError) {
      throw new Error(
        deckError.message
      );
    }

    decks =
      (deckData ??
        []) as Deck[];
  }

  const deckMap =
    new Map(
      decks.map(
        (deck) => [
          deck.id,
          deck,
        ]
      )
    );

  // ======================================================
  // GROUPS
  // ======================================================

  // Ad-hoc duels only: scheduled season duels are not challenges.
  const adHocOpen =
    openMatches.filter(
      (match) =>
        match.competition_id ===
        null
    );

  const incoming =
    adHocOpen.filter(
      (match) =>
        match.status ===
          "pending" &&
        match.player_two_id ===
          userId
    );

  const outgoing =
    adHocOpen.filter(
      (match) =>
        match.status ===
          "pending" &&
        match.player_one_id ===
          userId
    );

  const active =
    adHocOpen.filter(
      (match) =>
        match.status ===
        "accepted"
    );

  const confirmation =
    openMatches.filter(
      (match) =>
        match.status ===
        "result_submitted"
    );

  const disputed =
    openMatches.filter(
      (match) =>
        match.status ===
        "disputed"
    );

  const scheduledSeasonDuels =
    openMatches.filter(
      (match) =>
        match.competition_id !==
          null &&
        (match.status ===
          "pending" ||
          match.status ===
            "accepted")
    );

  const seasonCompetitionId =
    scheduledSeasonDuels[0]
      ?.competition_id ??
    null;

  const leagueMatches =
    seasonCountResult.count ??
    0;

  const practiceMatches =
    practiceCountResult.count ??
    0;

  const openWagers =
    openWagerResult.count ??
    0;

  // ======================================================
  // SEASON DUEL DP (2.0): league_economy_defaults, the same
  // rates the database pays out. Ad-hoc duels earn nothing.
  // ======================================================

  const {
    data: economy,
  } = await supabase
    .from(
      "league_economy_defaults"
    )
    .select(
      "match_win_dp,match_loss_dp"
    )
    .eq(
      "id",
      true
    )
    .maybeSingle();

  const seasonDp =
    economy
      ? {
          win: economy.match_win_dp as number,
          loss: economy.match_loss_dp as number,
        }
      : null;

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* BACKGROUND */}

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-amber-400/[0.05] blur-[150px]" />

        <div className="absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-violet-500/[0.05] blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* NAV */}

        <nav className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300 transition-all hover:-translate-x-0.5 hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-200 active:scale-95"
          >
            <ArrowLeft
              size={17}
            />

            Back
          </Link>

          <Link
            href="/"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-sm font-bold text-zinc-400 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-100 active:scale-95"
          >
            <Home
              size={16}
            />

            Home
          </Link>
        </nav>

        {/* HERO */}

        <header className="arena-frame relative mt-6 overflow-hidden rounded-[28px] border border-amber-300/15 bg-gradient-to-br from-white/[0.045] via-black/45 to-black/70 p-6 shadow-[0_30px_100px_rgba(0,0,0,.45)] sm:p-8">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-red-500/[0.05] blur-[100px]" />

            <div className="absolute bottom-[-120px] left-[20%] h-64 w-64 rounded-full bg-violet-500/[0.05] blur-[100px]" />
          </div>

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-red-300/20 bg-red-300/[0.06] px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-red-200">
                <Swords
                  size={12}
                />

                Duel Arena
              </div>

              <h1 className="gold-text mt-5 text-4xl font-black sm:text-5xl">
                Duels
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                Season duels count for the standings and earn DP. Practice duels are just for fun, with an optional wager.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/matches/new"
                  className="primary-button inline-flex cursor-pointer items-center justify-center gap-2 transition-all active:scale-[0.97]"
                >
                  <Send
                    size={17}
                  />

                  Record a Duel
                </Link>

                <Link
                  href="/league"
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-black text-zinc-300 transition-all hover:border-amber-300/25 hover:text-amber-200"
                >
                  <Trophy
                    size={16}
                  />

                  League Table
                </Link>
              </div>
            </div>

            {/* DP WALLET */}

            <div className="min-w-[200px] rounded-2xl border border-cyan-300/15 bg-black/30 p-5">
              <div className="flex items-center gap-2">
                <Zap
                  size={16}
                  className="text-cyan-300"
                />

                <p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-300">
                  Duel Points
                </p>
              </div>

              <p className="mt-2 text-4xl font-black text-cyan-100">
                {formatNumber(
                  duelPoints
                )}
              </p>

              <p className="mt-1 text-xs text-zinc-600">
                Available DP
              </p>
            </div>
          </div>
        </header>

        {/* RULE CARDS (2.0) */}

        <section className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <Trophy
                size={18}
                className="text-amber-300"
              />

              <h2 className="font-black text-amber-200">
                Season Duel
              </h2>
            </div>

            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Part of the season competition: counts for the standings, earns Duel Points, and a finished round pays out round rewards. Record it on the This Round screen under Play.
            </p>

            {seasonDp && (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1 text-[10px] font-black text-emerald-200">
                  WIN +{seasonDp.win} DP
                </span>

                <span className="rounded-full border border-zinc-500/20 bg-zinc-500/[0.05] px-3 py-1 text-[10px] font-black text-zinc-300">
                  LOSS +{seasonDp.loss} DP
                </span>
              </div>
            )}
          </div>

          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <Sparkles
                size={18}
                className="text-violet-300"
              />

              <h2 className="font-black text-violet-200">
                Practice Duel
              </h2>
            </div>

            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Just for fun: no standings and no DP. Tap the winner, your opponent confirms. Optionally play for a DP or card wager.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1 text-[10px] font-black text-cyan-200">
                DP WAGER
              </span>

              <span className="rounded-full border border-red-300/20 bg-red-300/[0.05] px-3 py-1 text-[10px] font-black text-red-200">
                CARD WAGER
              </span>
            </div>
          </div>
        </section>

        {/* STATS */}

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="panel p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
              Incoming
            </p>

            <p className="mt-1 text-2xl font-black text-amber-200">
              {incoming.length}
            </p>
          </div>

          <div className="panel p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
              Active
            </p>

            <p className="mt-1 text-2xl font-black text-cyan-200">
              {active.length}
            </p>
          </div>

          <div className="panel p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
              Season Played
            </p>

            <p className="mt-1 text-2xl font-black">
              {leagueMatches}
            </p>
          </div>

          <div className="panel p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
              Practice Played
            </p>

            <p className="mt-1 text-2xl font-black text-violet-200">
              {practiceMatches}
            </p>
          </div>

          <div className="panel p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
              Open Wagers
            </p>

            <p className="mt-1 text-2xl font-black text-red-200">
              {openWagers}
            </p>
          </div>
        </section>

        {/* SEASON DUELS (2.0): scheduled, played on This Round */}

        {scheduledSeasonDuels.length >
          0 && (
          <Link
            href={
              seasonCompetitionId
                ? `/competitions/${seasonCompetitionId}/round`
                : "/play"
            }
            className="panel group mt-8 flex cursor-pointer items-center justify-between gap-4 p-5 transition-all hover:-translate-y-0.5 hover:border-amber-300/25"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Trophy
                size={20}
                className="shrink-0 text-amber-300"
              />

              <div className="min-w-0">
                <p className="text-xs font-black tracking-[.2em] text-amber-300">
                  SEASON DUELS
                </p>

                <p className="mt-1 text-sm text-zinc-400">
                  {scheduledSeasonDuels.length === 1
                    ? "1 season duel is scheduled for you."
                    : `${scheduledSeasonDuels.length} season duels are scheduled for you.`}{" "}
                  Tap the winners on the This Round screen.
                </p>
              </div>
            </div>

            <span className="shrink-0 text-xs font-black text-amber-300 transition group-hover:text-amber-200">
              This Round →
            </span>
          </Link>
        )}

        {/* INCOMING */}

        <section className="mt-8">
          <div className="flex items-center gap-2">
            <UserRound
              size={18}
              className="text-amber-300"
            />

            <div>
              <p className="text-xs font-black tracking-[.2em] text-amber-300">
                INCOMING
              </p>

              <h2 className="mt-1 text-2xl font-black">
                Challenges Awaiting You
              </h2>
            </div>
          </div>

          {incoming.length ===
          0 ? (
            <div className="panel mt-4 p-6 text-sm text-zinc-500">
              No one has called you out yet.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {incoming.map(
                (match) => (
                  <MatchCard
                    key={
                      match.id
                    }
                    match={
                      match
                    }
                    userId={
                      userId
                    }
                    profiles={
                      profileMap
                    }
                    bosses={
                      bossMap
                    }
                    decks={
                      deckMap
                    }
                    accent="amber"
                  />
                )
              )}
            </div>
          )}
        </section>

        {/* OUTGOING */}

        {outgoing.length >
          0 && (
          <section className="mt-8">
            <p className="text-xs font-black tracking-[.2em] text-zinc-500">
              SENT CHALLENGES
            </p>

            <h2 className="mt-1 text-2xl font-black">
              Awaiting Response
            </h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {outgoing.map(
                (match) => (
                  <MatchCard
                    key={
                      match.id
                    }
                    match={
                      match
                    }
                    userId={
                      userId
                    }
                    profiles={
                      profileMap
                    }
                    bosses={
                      bossMap
                    }
                    decks={
                      deckMap
                    }
                    accent="zinc"
                  />
                )
              )}
            </div>
          </section>
        )}

        {/* ACTIVE */}

        <section className="mt-8">
          <div className="flex items-center gap-2">
            <Swords
              size={18}
              className="text-cyan-300"
            />

            <div>
              <p className="text-xs font-black tracking-[.2em] text-cyan-300">
                ACTIVE DUELS
              </p>

              <h2 className="mt-1 text-2xl font-black">
                Ready to Duel
              </h2>
            </div>
          </div>

          {active.length ===
          0 ? (
            <div className="panel mt-4 flex flex-col items-center gap-3 p-6 text-center">
              <p className="text-sm text-zinc-500">
                Your arena is quiet.
              </p>

              <Link
                href="/matches/new"
                className="primary-button inline-flex items-center gap-2 px-4 py-2 text-xs"
              >
                Record a Duel
              </Link>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {active.map(
                (match) => (
                  <MatchCard
                    key={
                      match.id
                    }
                    match={
                      match
                    }
                    userId={
                      userId
                    }
                    profiles={
                      profileMap
                    }
                    bosses={
                      bossMap
                    }
                    decks={
                      deckMap
                    }
                    accent="cyan"
                  />
                )
              )}
            </div>
          )}
        </section>

        {/* CONFIRMATION */}

        {confirmation.length >
          0 && (
          <section className="mt-8">
            <div className="flex items-center gap-2">
              <Clock3
                size={18}
                className="text-violet-300"
              />

              <div>
                <p className="text-xs font-black tracking-[.2em] text-violet-300">
                  RESULT CONFIRMATION
                </p>

                <h2 className="mt-1 text-2xl font-black">
                  Confirmation Required
                </h2>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {confirmation.map(
                (match) => (
                  <MatchCard
                    key={
                      match.id
                    }
                    match={
                      match
                    }
                    userId={
                      userId
                    }
                    profiles={
                      profileMap
                    }
                    bosses={
                      bossMap
                    }
                    decks={
                      deckMap
                    }
                    accent="violet"
                  />
                )
              )}
            </div>
          </section>
        )}

        {/* DISPUTED */}

        {disputed.length >
          0 && (
          <section className="mt-8">
            <div className="flex items-center gap-2">
              <AlertTriangle
                size={18}
                className="text-orange-300"
              />

              <div>
                <p className="text-xs font-black tracking-[.2em] text-orange-300">
                  DISPUTED
                </p>

                <h2 className="mt-1 text-2xl font-black">
                  Admin Review
                </h2>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {disputed.map(
                (match) => (
                  <MatchCard
                    key={
                      match.id
                    }
                    match={
                      match
                    }
                    userId={
                      userId
                    }
                    profiles={
                      profileMap
                    }
                    bosses={
                      bossMap
                    }
                    decks={
                      deckMap
                    }
                    accent="orange"
                  />
                )
              )}
            </div>
          </section>
        )}

        {/* HISTORY */}

        <section className="mt-10 border-t border-white/[0.05] pt-8">
          <div className="flex items-center gap-2">
            <History
              size={18}
              className="text-zinc-500"
            />

            <div>
              <p className="text-xs font-black tracking-[.2em] text-zinc-600">
                DUEL HISTORY
              </p>

              <h2 className="mt-1 text-2xl font-black text-zinc-300">
                Previous Duels
              </h2>
            </div>
          </div>

          {history.length ===
          0 ? (
            <div className="panel mt-4 p-6 text-sm text-zinc-500">
              Nothing recorded yet - your legend starts with duel one.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {history.map(
                (match) => (
                  <MatchCard
                    key={
                      match.id
                    }
                    match={
                      match
                    }
                    userId={
                      userId
                    }
                    profiles={
                      profileMap
                    }
                    bosses={
                      bossMap
                    }
                    decks={
                      deckMap
                    }
                    accent="zinc"
                  />
                )
              )}
            </div>
          )}

          {historyPages > 1 && (
            <nav
              aria-label="Duel history pages"
              className="mt-5 flex items-center justify-between gap-3"
            >
              {historyPage > 1 ? (
                <Link
                  href={
                    historyPage === 2
                      ? "/matches"
                      : `/matches?history=${historyPage - 1}`
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-black text-zinc-300 transition hover:border-amber-300/25 hover:text-amber-200"
                >
                  ← Newer
                </Link>
              ) : (
                <span />
              )}

              <p className="text-xs font-bold text-zinc-600">
                Page {historyPage} of{" "}
                {historyPages}
              </p>

              {historyPage < historyPages ? (
                <Link
                  href={`/matches?history=${historyPage + 1}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-black text-zinc-300 transition hover:border-amber-300/25 hover:text-amber-200"
                >
                  Older →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </section>

        {/* SYSTEM INFO */}

        <section className="panel mt-8 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck
              size={18}
              className="mt-0.5 shrink-0 text-cyan-300"
            />

            <div>
              <p className="font-black">
                Duel Integrity
              </p>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Competitive results affect League Ranking. Practice wagers stay locked until the duel result is confirmed. Disputed wagers remain locked until the match is resolved.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}