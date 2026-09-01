import Link from "next/link";

import {
  notFound,
} from "next/navigation";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Coins,
  Crown,
  Home,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  XCircle,
  Zap,
} from "lucide-react";

import {
  acceptMatchChallenge,
  cancelMatchChallenge,
  completeMatch,
  confirmMatchResult,
  declineMatchChallenge,
  disputeMatchResult,
  resolveDisputedMatch,
} from "@/app/actions/matches";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  SubmitButton,
} from "@/components/submit-button";

import {
  ConfirmSubmitButton,
} from "@/components/confirm-submit-button";

export const dynamic =
  "force-dynamic";

// =========================================================
// TYPES
// =========================================================

type MatchStatus =
  | "pending"
  | "accepted"
  | "result_submitted"
  | "completed"
  | "disputed"
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
  league_id: string;

  competition_id:
    | string
    | null;

  created_by: string;

  player_one_id: string;
  player_two_id: string;

  player_one_deck_id:
    | string
    | null;

  player_two_deck_id:
    | string
    | null;

  status: MatchStatus;

  match_type: MatchType;

  wager_type: WagerType;

  wager_dp_amount: number;

  wager_status: WagerStatus;

  result:
    | "player_one_win"
    | "player_two_win"
    | "draw"
    | null;

  winner_id:
    | string
    | null;

  notes:
    | string
    | null;

  created_at: string;

  accepted_at:
    | string
    | null;

  completed_at:
    | string
    | null;

  result_submitted_by:
    | string
    | null;

  result_submitted_at:
    | string
    | null;

  result_confirmed_by:
    | string
    | null;

  result_confirmed_at:
    | string
    | null;

  disputed_by:
    | string
    | null;

  disputed_at:
    | string
    | null;

  dispute_reason:
    | string
    | null;
};

type Profile = {
  id: string;

  username:
    | string
    | null;

  duelist_name: string;

  custom_title:
    | string
    | null;

  boss_monster_option_id:
    | string
    | null;

  duel_points: number;
};

type BossMonster = {
  id: string;
  name: string;
};

type Deck = {
  id: string;
  name: string;
};

type DpEscrow = {
  profile_id: string;
  amount: number;

  status:
    | "funded"
    | "won"
    | "refunded";
};

type WagerCard = {
  id: string;
  owner_id: string;
  card_instance_id: string;

  status:
    | "locked"
    | "won"
    | "returned";
};

type CardInstance = {
  id: string;
  card_catalog_id: string;
  copy_number: number;
  locked: boolean;
};

type CatalogCard = {
  id: string;
  name: string;
  game_rarity: string | null;
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
  if (!value) {
    return "—";
  }

  return new Date(
    value
  ).toLocaleString(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

function StatusBadge({
  status,
}: {
  status: MatchStatus;
}) {
  if (
    status ===
    "accepted"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-200">
        <Swords size={12} />
        Ready to Duel
      </span>
    );
  }

  if (
    status ===
    "result_submitted"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/30 bg-violet-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-violet-200">
        <Clock3 size={12} />
        Awaiting Confirmation
      </span>
    );
  }

  if (
    status ===
    "completed"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-200">
        <CheckCircle2
          size={12}
        />
        Completed
      </span>
    );
  }

  if (
    status ===
    "disputed"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-400/30 bg-orange-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-orange-200">
        <AlertTriangle
          size={12}
        />
        Disputed
      </span>
    );
  }

  if (
    status ===
    "cancelled"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-500/30 bg-zinc-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-400">
        <XCircle size={12} />
        Cancelled
      </span>
    );
  }

  if (
    status ===
    "declined"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-200">
        <XCircle size={12} />
        Declined
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-200">
      <Clock3 size={12} />
      Pending
    </span>
  );
}

function MatchTypeBadge({
  matchType,
}: {
  matchType: MatchType;
}) {
  if (
    matchType ===
    "practice"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/25 bg-violet-300/[0.07] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-violet-200">
        <Sparkles
          size={12}
        />
        Practice Duel
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-300/[0.07] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-200">
      <Trophy size={12} />
      League Duel
    </span>
  );
}

// =========================================================
// PAGE
// =========================================================

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const {
    id,
  } = await params;

  const {
    supabase,
    userId,
  } = await requireUser();

  // ======================================================
  // MATCH
  // ======================================================

  const {
    data: matchData,
    error: matchError,
  } = await supabase
    .from("matches")
    .select(
      `
        id,
        league_id,
        competition_id,
        created_by,
        player_one_id,
        player_two_id,
        player_one_deck_id,
        player_two_deck_id,
        status,
        match_type,
        wager_type,
        wager_dp_amount,
        wager_status,
        result,
        winner_id,
        notes,
        created_at,
        accepted_at,
        completed_at,
        result_submitted_by,
        result_submitted_at,
        result_confirmed_by,
        result_confirmed_at,
        disputed_by,
        disputed_at,
        dispute_reason
      `
    )
    .eq(
      "id",
      id
    )
    .maybeSingle();

  if (
    matchError ||
    !matchData
  ) {
    notFound();
  }

  const match =
    matchData as Match;

      // ======================================================
  // COMPETITION
  // ======================================================

  let competition:
    {
      id: string;
      name: string;
      competition_type: string;
    }
    | null =
    null;

  if (
    match.competition_id
  ) {
    const {
      data:
        competitionData,

      error:
        competitionError,
    } = await supabase
      .from(
        "competitions"
      )
      .select(
        "id,name,competition_type"
      )
      .eq(
        "id",
        match.competition_id
      )
      .maybeSingle();

    if (
      competitionError
    ) {
      throw new Error(
        competitionError.message
      );
    }

    competition =
      competitionData;
  }

  // ======================================================
  // MEMBERSHIP / ADMIN
  // ======================================================

  const {
    data: currentMembership,
    error:
      currentMembershipError,
  } = await supabase
    .from(
      "league_members"
    )
    .select("role")
    .eq(
      "league_id",
      match.league_id
    )
    .eq(
      "profile_id",
      userId
    )
    .maybeSingle();

  if (
    currentMembershipError
  ) {
    throw new Error(
      currentMembershipError.message
    );
  }

  const isLeagueAdmin =
    currentMembership?.role ===
    "admin";

  const isPlayerOne =
    match.player_one_id ===
    userId;

  const isPlayerTwo =
    match.player_two_id ===
    userId;

  const isParticipant =
    isPlayerOne ||
    isPlayerTwo;

  if (
    !isParticipant &&
    !isLeagueAdmin
  ) {
    notFound();
  }

  // ======================================================
  // PROFILES
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
        custom_title,
        boss_monster_option_id,
        duel_points
      `
    )
    .in(
      "id",
      [
        match.player_one_id,
        match.player_two_id,
      ]
    );

  if (profileError) {
    throw new Error(
      profileError.message
    );
  }

  const profiles =
    (profileData ??
      []) as Profile[];

  const profileMap =
    new Map(
      profiles.map(
        (profile) => [
          profile.id,
          profile,
        ]
      )
    );

  const playerOne =
    profileMap.get(
      match.player_one_id
    );

  const playerTwo =
    profileMap.get(
      match.player_two_id
    );

  const currentProfile =
    profileMap.get(
      userId
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

  let bosses:
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
        "id,name"
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

    bosses =
      (bossData ??
        []) as BossMonster[];
  }

  const bossMap =
    new Map(
      bosses.map(
        (boss) => [
          boss.id,
          boss,
        ]
      )
    );

  const playerOneBoss =
    playerOne
      ?.boss_monster_option_id
      ? bossMap.get(
          playerOne
            .boss_monster_option_id
        )
      : undefined;

  const playerTwoBoss =
    playerTwo
      ?.boss_monster_option_id
      ? bossMap.get(
          playerTwo
            .boss_monster_option_id
        )
      : undefined;

  // ======================================================
  // DECKS
  // ======================================================

  const deckIds = [
    match.player_one_deck_id,
    match.player_two_deck_id,
  ].filter(
    (
      value
    ): value is string =>
      Boolean(value)
  );

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
  // DP ESCROW
  // ======================================================

  let dpEscrows:
    DpEscrow[] =
    [];

  if (
    match.match_type ===
      "practice" &&
    match.wager_type ===
      "dp"
  ) {
    const {
      data: escrowData,
      error: escrowError,
    } = await supabase
      .from(
        "match_dp_escrows"
      )
      .select(
        "profile_id,amount,status"
      )
      .eq(
        "match_id",
        match.id
      );

    if (escrowError) {
      throw new Error(
        escrowError.message
      );
    }

    dpEscrows =
      (escrowData ??
        []) as DpEscrow[];
  }

  const playerOneEscrow =
    dpEscrows.find(
      (row) =>
        row.profile_id ===
        match.player_one_id
    );

  const playerTwoEscrow =
    dpEscrows.find(
      (row) =>
        row.profile_id ===
        match.player_two_id
    );

  // ======================================================
  // CARD WAGER
  // ======================================================

  let wagerRows:
    WagerCard[] =
    [];

  if (
    match.match_type ===
      "practice" &&
    match.wager_type ===
      "card"
  ) {
    const {
      data: wagerData,
      error: wagerError,
    } = await supabase
      .from(
        "match_wager_cards"
      )
      .select(
        `
          id,
          owner_id,
          card_instance_id,
          status
        `
      )
      .eq(
        "match_id",
        match.id
      );

    if (wagerError) {
      throw new Error(
        wagerError.message
      );
    }

    wagerRows =
      (wagerData ??
        []) as WagerCard[];
  }

  const wagerInstanceIds =
    wagerRows.map(
      (row) =>
        row.card_instance_id
    );

  let wagerInstances:
    CardInstance[] =
    [];

  if (
    wagerInstanceIds.length >
    0
  ) {
    const {
      data: instanceData,
      error: instanceError,
    } = await supabase
      .from(
        "card_instances"
      )
      .select(
        `
          id,
          card_catalog_id,
          copy_number,
          locked
        `
      )
      .in(
        "id",
        wagerInstanceIds
      );

    if (instanceError) {
      throw new Error(
        instanceError.message
      );
    }

    wagerInstances =
      (instanceData ??
        []) as CardInstance[];
  }

  // ======================================================
  // AVAILABLE CARDS FOR INCOMING CARD WAGER
  // ======================================================

  let availableInstances:
    CardInstance[] =
    [];

  if (
    isPlayerTwo &&
    match.status ===
      "pending" &&
    match.match_type ===
      "practice" &&
    match.wager_type ===
      "card"
  ) {
    const {
      data: availableData,
      error: availableError,
    } = await supabase
      .from(
        "card_instances"
      )
      .select(
        `
          id,
          card_catalog_id,
          copy_number,
          locked
        `
      )
      .eq(
        "current_owner_id",
        userId
      )
      .eq(
        "locked",
        false
      )
      .order(
        "copy_number",
        {
          ascending: true,
        }
      );

    if (availableError) {
      throw new Error(
        availableError.message
      );
    }

    availableInstances =
      (availableData ??
        []) as CardInstance[];
  }

  const allCatalogIds = [
    ...new Set(
      [
        ...wagerInstances,
        ...availableInstances,
      ].map(
        (instance) =>
          instance
            .card_catalog_id
      )
    ),
  ];

  let catalogCards:
    CatalogCard[] =
    [];

  if (
    allCatalogIds.length >
    0
  ) {
    const {
      data: catalogData,
      error: catalogError,
    } = await supabase
      .from("card_catalog")
      .select(
        "id,name,game_rarity"
      )
      .in(
        "id",
        allCatalogIds
      );

    if (catalogError) {
      throw new Error(
        catalogError.message
      );
    }

    catalogCards =
      (catalogData ??
        []) as CatalogCard[];
  }

  const catalogMap =
    new Map(
      catalogCards.map(
        (card) => [
          card.id,
          card,
        ]
      )
    );

  const instanceMap =
    new Map(
      wagerInstances.map(
        (instance) => [
          instance.id,
          instance,
        ]
      )
    );

  const playerOneWager =
    wagerRows.find(
      (row) =>
        row.owner_id ===
        match.player_one_id
    );

  const playerTwoWager =
    wagerRows.find(
      (row) =>
        row.owner_id ===
        match.player_two_id
    );

  function wagerCardName(
    wager:
      | WagerCard
      | undefined
  ) {
    if (!wager) {
      return "Not yet staked";
    }

    const instance =
      instanceMap.get(
        wager.card_instance_id
      );

    if (!instance) {
      return "Unknown card";
    }

    const card =
      catalogMap.get(
        instance.card_catalog_id
      );

    if (!card) {
      return "Unknown card";
    }

    return `${card.name} · Copy #${instance.copy_number}`;
  }

  const selectableCards =
    availableInstances
      .map(
        (instance) => {
          const card =
            catalogMap.get(
              instance
                .card_catalog_id
            );

          if (!card) {
            return null;
          }

          return {
            instance,
            card,
          };
        }
      )
      .filter(
        (
          value
        ): value is {
          instance: CardInstance;
          card: CatalogCard;
        } =>
          Boolean(value)
      )
      .sort(
        (
          a,
          b
        ) =>
          a.card.name.localeCompare(
            b.card.name
          )
      );

  // ======================================================
  // RESULT HELPERS
  // ======================================================

  let resultText =
    "No result";

  if (
    match.result ===
    "draw"
  ) {
    resultText =
      "Draw";
  } else if (
    match.winner_id
  ) {
    resultText =
      `${playerName(
        profileMap.get(
          match.winner_id
        )
      )} won`;
  }

  const didCurrentUserSubmit =
    match.result_submitted_by ===
    userId;

  const canConfirm =
    isParticipant &&
    match.status ===
      "result_submitted" &&
    !didCurrentUserSubmit;

  const insufficientDp =
    match.match_type ===
      "practice" &&
    match.wager_type ===
      "dp" &&
    (currentProfile
      ?.duel_points ??
      0) <
      match.wager_dp_amount &&
    !playerTwoEscrow;

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* BACKGROUND */}

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-amber-400/[0.05] blur-[150px]" />

        <div className="absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-red-500/[0.045] blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ==================================================
            NAVIGATION
        ================================================== */}

        <nav className="flex flex-wrap items-center gap-3">
          <Link
            href="/matches"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300 transition-all hover:-translate-x-0.5 hover:border-amber-300/40 hover:bg-amber-300/10 active:scale-95"
          >
            <ArrowLeft
              size={17}
            />

            Back to Duels
          </Link>

          <Link
            href="/"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-sm font-bold text-zinc-400 transition-all hover:border-white/20 hover:text-zinc-100"
          >
            <Home size={16} />

            Home
          </Link>

          {competition && (
            <Link
              href={`/competitions/${competition.id}`}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-violet-300/20 bg-violet-300/[0.05] px-3 py-2 text-sm font-bold text-violet-300 transition-all hover:border-violet-300/40 hover:bg-violet-300/10 hover:text-violet-200"
            >
              <Trophy
                size={16}
              />

              Competition
            </Link>
          )}
        </nav>

        {/* ==================================================
            DUEL HERO
        ================================================== */}

        <header className="arena-frame relative mt-4 overflow-hidden rounded-[28px] border border-red-300/10 bg-gradient-to-br from-white/[0.045] via-black/50 to-black/75 p-5 shadow-[0_30px_100px_rgba(0,0,0,.45)] sm:mt-6 sm:p-8">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-red-500/[0.05] blur-[100px]" />

            <div className="absolute left-[15%] top-1/2 h-56 w-56 -translate-y-1/2 rounded-full bg-violet-500/[0.05] blur-[110px]" />

            <div className="absolute right-[15%] top-1/2 h-56 w-56 -translate-y-1/2 rounded-full bg-cyan-500/[0.05] blur-[110px]" />
          </div>

          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                status={
                  match.status
                }
              />

              <MatchTypeBadge
                matchType={
                  match.match_type
                }
              />
                            {competition && (
                <Link
                  href={`/competitions/${competition.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/25 bg-violet-300/[0.07] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-violet-200 transition hover:bg-violet-300/[0.12]"
                >
                  <Trophy
                    size={11}
                  />

                  Official Competition Duel
                </Link>
              )}

              {match.wager_type !==
                "none" && (
                <span className="energy-line inline-flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-200">
                  <Crown
                    size={11}
                  />

                  Wager Active
                </span>
              )}
            </div>

                       <p className="mt-4 text-center text-[10px] font-black uppercase tracking-[.3em] text-zinc-600 sm:mt-6">
              {competition
                ? competition.name
                : "Duel Arena"}
            </p>

            <div className="mt-4 grid items-center gap-4 sm:mt-6 sm:gap-6 md:grid-cols-[1fr_auto_1fr]">
              {/* PLAYER ONE */}

              <div className="text-center md:text-right">
                <p className="text-3xl font-black leading-tight break-words sm:text-4xl">
                  {playerName(
                    playerOne
                  )}
                </p>

                <p className="mt-1.5 text-xs font-black uppercase tracking-[.15em] text-zinc-600">
                  {playerOne
                    ?.custom_title ??
                    "League Duelist"}
                </p>

                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-300/[0.05] px-3 py-1.5 text-[10px] font-black text-violet-200">
                  <Sparkles
                    size={11}
                  />

                  {playerOneBoss
                    ?.name ??
                    "Unbound"}
                </div>
              </div>

              {/* VS */}

              <div className="relative mx-auto flex h-16 w-16 items-center justify-center sm:h-20 sm:w-20">
                <div className="pointer-events-none absolute inset-0 animate-pulse rounded-full bg-red-500/[0.12] blur-xl" />

                <div className="corner-cut relative flex h-full w-full items-center justify-center border border-red-300/25 bg-black/60 shadow-[0_0_35px_rgba(248,113,113,.15)]">
                  <span className="versus-mark text-xl tracking-[.05em]">
                    VS
                  </span>
                </div>
              </div>

              {/* PLAYER TWO */}

              <div className="text-center md:text-left">
                <p className="text-3xl font-black leading-tight break-words sm:text-4xl">
                  {playerName(
                    playerTwo
                  )}
                </p>

                <p className="mt-1.5 text-xs font-black uppercase tracking-[.15em] text-zinc-600">
                  {playerTwo
                    ?.custom_title ??
                    "League Duelist"}
                </p>

                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-300/[0.05] px-3 py-1.5 text-[10px] font-black text-violet-200">
                  <Sparkles
                    size={11}
                  />

                  {playerTwoBoss
                    ?.name ??
                    "Unbound"}
                </div>
              </div>
            </div>

            <div className="duel-divider mx-auto mt-4 max-w-xs sm:mt-6" />

            <p className="mt-4 text-center text-xs text-zinc-600">
              Created{" "}
              {formatDate(
                match.created_at
              )}
            </p>
          </div>
        </header>

        {/* ==================================================
            DECKS
        ================================================== */}

        <section className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="panel p-4">
            <p className="text-[9px] font-black uppercase tracking-[.18em] text-zinc-600">
              {
                playerName(
                  playerOne
                )
              }
              &apos;s Deck
            </p>

            <p className="mt-2 break-words font-black text-cyan-100">
              {match.player_one_deck_id
                ? deckMap.get(
                    match
                      .player_one_deck_id
                  )?.name ??
                  "Unknown Deck"
                : "Waiting for deck"}
            </p>
          </div>

          <div className="panel p-4 md:text-right">
            <p className="text-[9px] font-black uppercase tracking-[.18em] text-zinc-600">
              {
                playerName(
                  playerTwo
                )
              }
              &apos;s Deck
            </p>

            <p className="mt-2 break-words font-black text-cyan-100">
              {match.player_two_deck_id
                ? deckMap.get(
                    match
                      .player_two_deck_id
                  )?.name ??
                  "Unknown Deck"
                : "Waiting for deck"}
            </p>
          </div>
        </section>

        {/* ==================================================
            LEAGUE REWARD
        ================================================== */}

        {match.match_type ===
          "league" && (
          <section className="panel mt-5 p-5">
            <div className="flex items-center gap-2">
              <Trophy
                size={18}
                className="text-amber-300"
              />

              <h2 className="font-black text-amber-200">
                Official League Duel
              </h2>
            </div>

            <p className="mt-2 text-sm leading-6 text-zinc-500">
              This duel affects the League Ranking and awards Duel Points after the result is confirmed.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1 text-[10px] font-black text-emerald-200">
                WIN +100 DP
              </span>

              <span className="rounded-full border border-zinc-500/20 bg-zinc-500/[0.05] px-3 py-1 text-[10px] font-black text-zinc-300">
                DRAW +75 DP
              </span>

              <span className="rounded-full border border-red-400/20 bg-red-400/[0.05] px-3 py-1 text-[10px] font-black text-red-200">
                LOSS +50 DP
              </span>
            </div>
          </section>
        )}

        {/* ==================================================
            PRACTICE WAGER
        ================================================== */}

        {match.match_type ===
          "practice" && (
          <section className="relative mt-5 overflow-hidden rounded-2xl border border-violet-300/15 bg-violet-300/[0.025] p-5">
            <div className="flex items-center gap-2">
              <Crown
                size={18}
                className="text-violet-300"
              />

              <div>
                <p className="text-[9px] font-black uppercase tracking-[.18em] text-violet-300">
                  Practice Duel
                </p>

                <h2 className="mt-1 text-xl font-black">
                  Stakes
                </h2>
              </div>
            </div>

            {match.wager_type ===
              "none" && (
              <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-4">
                <p className="font-black text-zinc-300">
                  No Wager
                </p>

                <p className="mt-1 text-sm text-zinc-600">
                  No ranking impact. No automatic DP reward. Just duel.
                </p>
              </div>
            )}

            {/* DP WAGER */}

            {match.wager_type ===
              "dp" && (
              <>
                <div className="mt-4 flex items-center gap-2">
                  <Coins
                    size={17}
                    className="text-cyan-300"
                  />

                  <p className="font-black text-cyan-100">
                    {
                      match.wager_dp_amount
                    }{" "}
                    DP per player
                  </p>
                </div>

                <p className="mt-1 text-sm text-zinc-600">
                  Winner receives{" "}
                  {match.wager_dp_amount *
                    2}{" "}
                  DP from the wager pool.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                    <p className="text-xs font-black">
                      {playerName(
                        playerOne
                      )}
                    </p>

                    <p
                      className={`mt-2 text-xs font-black uppercase ${
                        playerOneEscrow
                          ? "text-emerald-300"
                          : "text-amber-300"
                      }`}
                    >
                      {playerOneEscrow
                        ? `${playerOneEscrow.amount} DP funded`
                        : "Waiting for stake"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                    <p className="text-xs font-black">
                      {playerName(
                        playerTwo
                      )}
                    </p>

                    <p
                      className={`mt-2 text-xs font-black uppercase ${
                        playerTwoEscrow
                          ? "text-emerald-300"
                          : "text-amber-300"
                      }`}
                    >
                      {playerTwoEscrow
                        ? `${playerTwoEscrow.amount} DP funded`
                        : "Waiting for stake"}
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* CARD WAGER */}

            {match.wager_type ===
              "card" && (
              <>
                <div className="mt-4 flex items-center gap-2">
                  <LockKeyhole
                    size={17}
                    className="text-red-300"
                  />

                  <p className="font-black text-red-100">
                    Physical Card Wager
                  </p>
                </div>

                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  The winner receives both wagered physical card copies after the result is confirmed.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                    <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
                      {
                        playerName(
                          playerOne
                        )
                      }{" "}
                      stakes
                    </p>

                    <p className="mt-2 font-black text-red-100">
                      {wagerCardName(
                        playerOneWager
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                    <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
                      {
                        playerName(
                          playerTwo
                        )
                      }{" "}
                      stakes
                    </p>

                    <p className="mt-2 font-black text-red-100">
                      {wagerCardName(
                        playerTwoWager
                      )}
                    </p>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {/* ==================================================
            PENDING CHALLENGE
        ================================================== */}

        {match.status ===
          "pending" && (
          <section className="panel mt-4 p-4 sm:mt-6 sm:p-6">
            {isPlayerTwo ? (
              <>
                <div className="flex items-center gap-2">
                  <Swords
                    size={19}
                    className="text-amber-300"
                  />

                  <h2 className="text-xl font-black">
                    Challenge Received
                  </h2>
                </div>

                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Review the duel conditions before accepting.
                </p>

                {/* DP ACCEPT */}

                {match.match_type ===
                  "practice" &&
                match.wager_type ===
                  "dp" ? (
                  <div className="mt-5">
                    <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.03] p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs font-black uppercase tracking-wider text-cyan-300">
                            Required Stake
                          </p>

                          <p className="mt-1 text-2xl font-black text-cyan-100">
                            {
                              match.wager_dp_amount
                            }{" "}
                            DP
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
                            Your Balance
                          </p>

                          <p className="mt-1 text-lg font-black">
                            {currentProfile
                              ?.duel_points ??
                              0}{" "}
                            DP
                          </p>
                        </div>
                      </div>

                      {insufficientDp && (
                        <p className="mt-3 text-sm font-bold text-red-300">
                          You do not have enough DP to accept this wager.
                        </p>
                      )}
                    </div>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                      <form
                        action={
                          acceptMatchChallenge
                        }
                        className="w-full sm:w-auto"
                      >
                        <input
                          type="hidden"
                          name="match_id"
                          value={
                            match.id
                          }
                        />

                        <SubmitButton
                          disabled={
                            insufficientDp
                          }
                          pendingLabel="Accepting..."
                          className="primary-button inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                        >
                          <Zap
                            size={16}
                          />

                          Stake{" "}
                          {
                            match.wager_dp_amount
                          }{" "}
                          DP & Accept
                        </SubmitButton>
                      </form>

                      <form
                        action={
                          declineMatchChallenge
                        }
                        className="w-full sm:w-auto"
                      >
                        <input
                          type="hidden"
                          name="match_id"
                          value={
                            match.id
                          }
                        />

                        <ConfirmSubmitButton
                          confirmMessage="Decline this challenge?"
                          pendingLabel="Declining..."
                          className="w-full rounded-xl border border-red-400/20 px-4 py-3 text-sm font-black text-red-300 sm:w-auto"
                        >
                          Decline
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </div>
                ) : match.match_type ===
                    "practice" &&
                  match.wager_type ===
                    "card" ? (
                  /* CARD ACCEPT */

                  <form
                    action={
                      acceptMatchChallenge
                    }
                    className="mt-5"
                  >
                    <input
                      type="hidden"
                      name="match_id"
                      value={
                        match.id
                      }
                    />

                    <label>
                      <span className="text-xs font-black uppercase tracking-wider text-red-300">
                        Choose Your Wager Card
                      </span>

                      <select
                        name="card_instance_id"
                        required
                        defaultValue=""
                        className="field mt-3 w-full"
                      >
                        <option value="">
                          Select physical copy...
                        </option>

                        {selectableCards.map(
                          ({
                            instance,
                            card,
                          }) => (
                            <option
                              key={
                                instance.id
                              }
                              value={
                                instance.id
                              }
                            >
                              {
                                card.name
                              }
                              {" · Copy #"}
                              {
                                instance.copy_number
                              }
                              {card.game_rarity
                                ? ` · ${card.game_rarity}`
                                : ""}
                            </option>
                          )
                        )}
                      </select>
                    </label>

                    {selectableCards.length ===
                      0 && (
                      <p className="mt-3 text-sm font-bold text-red-300">
                        You have no unlocked physical card copies available.
                      </p>
                    )}

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                      <SubmitButton
                        disabled={
                          selectableCards.length ===
                          0
                        }
                        pendingLabel="Accepting..."
                        className="primary-button inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                      >
                        <LockKeyhole
                          size={16}
                        />

                        Wager Card & Accept
                      </SubmitButton>

                      <ConfirmSubmitButton
                        confirmMessage="Decline this challenge?"
                        formAction={
                          declineMatchChallenge
                        }
                        formNoValidate
                        pendingLabel="Declining..."
                        className="w-full rounded-xl border border-red-400/20 px-4 py-3 text-sm font-black text-red-300 sm:w-auto"
                      >
                        Decline
                      </ConfirmSubmitButton>
                    </div>
                  </form>
                ) : (
                  /* NORMAL ACCEPT */

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <form
                      action={
                        acceptMatchChallenge
                      }
                      className="w-full sm:w-auto"
                    >
                      <input
                        type="hidden"
                        name="match_id"
                        value={
                          match.id
                        }
                      />

                      <SubmitButton
                        pendingLabel="Accepting..."
                        className="primary-button inline-flex w-full items-center justify-center gap-2 sm:w-auto"
                      >
                        <CheckCircle2
                          size={16}
                        />

                        Accept Duel
                      </SubmitButton>
                    </form>

                    <form
                      action={
                        declineMatchChallenge
                      }
                      className="w-full sm:w-auto"
                    >
                      <input
                        type="hidden"
                        name="match_id"
                        value={
                          match.id
                        }
                      />

                      <ConfirmSubmitButton
                        confirmMessage="Decline this challenge?"
                        pendingLabel="Declining..."
                        className="w-full rounded-xl border border-red-400/20 px-4 py-3 text-sm font-black text-red-300 sm:w-auto"
                      >
                        Decline
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                )}
              </>
            ) : isPlayerOne ? (
              <>
                <div className="flex items-center gap-2">
                  <Clock3
                    size={19}
                    className="text-amber-300"
                  />

                  <h2 className="text-xl font-black">
                    Waiting for Rival
                  </h2>
                </div>

                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Your challenge has been sent. The rival must accept the duel
                  {match.wager_type !==
                  "none"
                    ? " and match the wager"
                    : ""}
                  .
                </p>

                <form
                  action={
                    cancelMatchChallenge
                  }
                  className="mt-5"
                >
                  <input
                    type="hidden"
                    name="match_id"
                    value={
                      match.id
                    }
                  />

                  <ConfirmSubmitButton
                    confirmMessage="Cancel this challenge?"
                    pendingLabel="Cancelling..."
                    className="rounded-xl border border-red-400/20 px-4 py-3 text-sm font-black text-red-300"
                  >
                    Cancel Challenge
                  </ConfirmSubmitButton>
                </form>
              </>
            ) : null}
          </section>
        )}

        {/* ==================================================
            ACCEPTED — SUBMIT RESULT
        ================================================== */}

        {match.status ===
          "accepted" &&
          isParticipant && (
          <section className="panel mt-4 p-4 sm:mt-6 sm:p-6">
            <div className="flex items-center gap-2">
              <Swords
                size={19}
                className="text-cyan-300"
              />

              <h2 className="text-xl font-black">
                Report Duel Result
              </h2>
            </div>

            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Play the duel in person. When finished, one player submits the result and the other confirms it.
            </p>

            <form
              action={
                completeMatch
              }
              className="mt-4 space-y-3 sm:mt-5 sm:space-y-4"
            >
              <input
                type="hidden"
                name="match_id"
                value={
                  match.id
                }
              />

              <label className="block">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Result
                </span>

                <select
                  name="result"
                  required
                  defaultValue=""
                  className="field mt-2 w-full"
                >
                  <option value="">
                    Select result...
                  </option>

                  <option value="player_one_win">
                    {playerName(
                      playerOne
                    )}{" "}
                    wins
                  </option>

                  <option value="player_two_win">
                    {playerName(
                      playerTwo
                    )}{" "}
                    wins
                  </option>

                  <option value="draw">
                    Draw
                  </option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Notes
                </span>

                <textarea
                  name="notes"
                  rows={3}
                  maxLength={1000}
                  placeholder="Optional duel notes..."
                  className="field mt-2 w-full resize-y"
                />
              </label>

              <SubmitButton
                pendingLabel="Submitting..."
                className="primary-button inline-flex items-center gap-2"
              >
                <CheckCircle2
                  size={16}
                />

                Submit Result
              </SubmitButton>
            </form>
          </section>
        )}

        {/* ==================================================
            RESULT SUBMITTED
        ================================================== */}

        {match.status ===
          "result_submitted" && (
          <section className="panel mt-4 p-4 sm:mt-6 sm:p-6">
            <div className="flex items-center gap-2">
              <Clock3
                size={19}
                className="text-violet-300"
              />

              <h2 className="text-xl font-black">
                Result Awaiting Confirmation
              </h2>
            </div>

            <div className="mt-4 rounded-xl border border-violet-300/15 bg-violet-300/[0.03] p-4">
              <p className="text-xs font-black uppercase tracking-wider text-zinc-600">
                Submitted Result
              </p>

              <p className="mt-2 text-xl font-black text-violet-100">
                {resultText}
              </p>

              <p className="mt-2 text-xs text-zinc-600">
                Submitted{" "}
                {formatDate(
                  match.result_submitted_at
                )}
              </p>
            </div>

            {didCurrentUserSubmit ? (
              <p className="mt-4 text-sm text-zinc-500">
                Waiting for the other duelist to confirm the result.
              </p>
            ) : canConfirm ? (
              <div className="mt-4 space-y-4 sm:mt-5 sm:space-y-5">
                <form
                  action={
                    confirmMatchResult
                  }
                >
                  <input
                    type="hidden"
                    name="match_id"
                    value={
                      match.id
                    }
                  />

                  <SubmitButton
                    pendingLabel="Confirming..."
                    className="primary-button inline-flex items-center gap-2"
                  >
                    <CheckCircle2
                      size={16}
                    />

                    Confirm Result
                  </SubmitButton>
                </form>

                <form
                  action={
                    disputeMatchResult
                  }
                  className="rounded-xl border border-orange-300/15 bg-orange-300/[0.025] p-4"
                >
                  <input
                    type="hidden"
                    name="match_id"
                    value={
                      match.id
                    }
                  />

                  <label>
                    <span className="text-xs font-black uppercase tracking-wider text-orange-300">
                      Something wrong?
                    </span>

                    <textarea
                      name="reason"
                      maxLength={1000}
                      rows={3}
                      placeholder="Explain why the result is incorrect..."
                      className="field mt-2 w-full resize-y"
                    />
                  </label>

                  <SubmitButton
                    pendingLabel="Disputing..."
                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-orange-300/20 px-4 py-3 text-sm font-black text-orange-200"
                  >
                    <AlertTriangle
                      size={15}
                    />

                    Dispute Result
                  </SubmitButton>
                </form>
              </div>
            ) : null}
          </section>
        )}

        {/* ==================================================
            DISPUTED
        ================================================== */}

        {match.status ===
          "disputed" && (
          <section className="relative mt-4 overflow-hidden rounded-2xl border border-orange-300/20 bg-orange-300/[0.025] p-4 sm:mt-6 sm:p-6">
            <div className="flex items-center gap-2">
              <AlertTriangle
                size={20}
                className="text-orange-300"
              />

              <h2 className="text-xl font-black text-orange-100">
                Result Disputed
              </h2>
            </div>

            <p className="mt-2 text-sm leading-6 text-zinc-500">
              DP rewards and wagers remain locked until a league admin resolves the duel.
            </p>

            {match.dispute_reason && (
              <div className="mt-4 rounded-xl border border-orange-300/10 bg-black/20 p-4">
                <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
                  Reason
                </p>

                <p className="mt-2 whitespace-pre-line text-sm text-zinc-300">
                  {
                    match.dispute_reason
                  }
                </p>
              </div>
            )}

            {isLeagueAdmin && (
              <form
                action={
                  resolveDisputedMatch
                }
                className="mt-4 space-y-3 border-t border-orange-300/10 pt-4 sm:mt-6 sm:space-y-4 sm:pt-5"
              >
                <input
                  type="hidden"
                  name="match_id"
                  value={
                    match.id
                  }
                />

                <div>
                  <p className="text-xs font-black uppercase tracking-[.16em] text-orange-300">
                    Admin Resolution
                  </p>

                  <p className="mt-1 text-sm text-zinc-600">
                    Choose the final official result.
                  </p>
                </div>

                <select
                  name="result"
                  required
                  defaultValue=""
                  className="field w-full"
                >
                  <option value="">
                    Final result...
                  </option>

                  <option value="player_one_win">
                    {playerName(
                      playerOne
                    )}{" "}
                    wins
                  </option>

                  <option value="player_two_win">
                    {playerName(
                      playerTwo
                    )}{" "}
                    wins
                  </option>

                  <option value="draw">
                    Draw
                  </option>
                </select>

                <textarea
                  name="admin_notes"
                  maxLength={1000}
                  rows={3}
                  placeholder="Admin notes..."
                  className="field w-full resize-y"
                />

                <ConfirmSubmitButton
                  confirmMessage="Lock in this final result?"
                  pendingLabel="Resolving..."
                  className="primary-button inline-flex items-center gap-2"
                >
                  <ShieldCheck
                    size={16}
                  />

                  Resolve Duel
                </ConfirmSubmitButton>
              </form>
            )}
          </section>
        )}

        {/* ==================================================
            COMPLETED
        ================================================== */}

        {match.status ===
          "completed" && (
          <section className="relative mt-4 overflow-hidden rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.025] p-4 sm:mt-6 sm:p-6 text-center">
            <Trophy
              size={28}
              className="mx-auto text-amber-300"
            />

            <p className="mt-4 text-[10px] font-black uppercase tracking-[.22em] text-emerald-300">
              Final Result
            </p>

            <h2 className="mt-2 text-3xl font-black">
              {resultText}
            </h2>

            {match.match_type ===
            "league" ? (
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-500">
                League Ranking and Duel Point rewards are awarded after the confirmed result.
              </p>
            ) : match.wager_type !==
              "none" ? (
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-500">
                Practice Duel complete. The wager has been settled according to the final result.
              </p>
            ) : (
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-500">
                Practice Duel complete. No ranking points or automatic DP were awarded.
              </p>
            )}

            <p className="mt-4 text-xs text-zinc-600">
              Completed{" "}
              {formatDate(
                match.completed_at
              )}
            </p>
          </section>
        )}

        {/* ==================================================
            CANCELLED / DECLINED
        ================================================== */}

        {(match.status ===
          "cancelled" ||
          match.status ===
            "declined") && (
          <section className="panel mt-4 p-4 sm:mt-6 sm:p-6">
            <XCircle
              size={24}
              className="text-zinc-500"
            />

            <h2 className="mt-3 text-xl font-black">
              Duel{" "}
              {match.status ===
              "cancelled"
                ? "Cancelled"
                : "Declined"}
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-500">
              This duel will not affect the League Ranking. Any practice wager is returned to its original owner.
            </p>
          </section>
        )}

        {/* ==================================================
            NOTES / TIMELINE
        ================================================== */}

        <section className="panel mt-6 p-5">
          <div className="flex items-center gap-2">
            <Clock3
              size={16}
              className="text-zinc-500"
            />

            <p className="text-xs font-black uppercase tracking-[.16em] text-zinc-500">
              Duel Timeline
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-[9px] font-black uppercase text-zinc-600">
                Created
              </p>

              <p className="mt-1 text-xs text-zinc-400">
                {formatDate(
                  match.created_at
                )}
              </p>
            </div>

            <div>
              <p className="text-[9px] font-black uppercase text-zinc-600">
                Accepted
              </p>

              <p className="mt-1 text-xs text-zinc-400">
                {formatDate(
                  match.accepted_at
                )}
              </p>
            </div>

            <div>
              <p className="text-[9px] font-black uppercase text-zinc-600">
                Result Submitted
              </p>

              <p className="mt-1 text-xs text-zinc-400">
                {formatDate(
                  match.result_submitted_at
                )}
              </p>
            </div>

            <div>
              <p className="text-[9px] font-black uppercase text-zinc-600">
                Completed
              </p>

              <p className="mt-1 text-xs text-zinc-400">
                {formatDate(
                  match.completed_at
                )}
              </p>
            </div>
          </div>

          {match.notes && (
            <div className="mt-5 border-t border-white/[0.06] pt-4">
              <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
                Duel Notes
              </p>

              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-400">
                {match.notes}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}