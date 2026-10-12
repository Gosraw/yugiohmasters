import Link from "next/link";

import {
  SamoRivalIntro,
} from "@/components/samo-rival-intro";

import {
  HomeWeeklyGoals,
} from "@/components/home-weekly-goals";

import {
  HomeIntroFlag,
} from "@/components/home-intro-flag";

import {
  HomeWaitingOnYou,
} from "@/components/home-waiting-on-you";

import {
  HomeThisRound,
  type HomeRoundState,
} from "@/components/home-this-round";

import {
  SeasonPathMini,
} from "@/components/season-path-mini";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  getLeagueIdForUser,
} from "@/lib/league-stats";

import {
  cardVoteAttentionItem,
  computeAttentionItems,
  getPendingCardVoteCount,
} from "@/lib/attention-items";

import {
  duelsPerRound,
  getActiveSeasonCompetition,
  logicalRoundFor,
  scheduleRoundsPerCycle,
  totalLogicalRounds,
} from "@/lib/competitions/season";

import {
  seasonWeekLabel,
} from "@/lib/weekly-goals";

import {
  getSeasonOverview,
} from "@/app/actions/season";

export const dynamic =
  "force-dynamic";

// =========================================================
// HOME (2.0)
//
// docs/V2_PLAN.md "Simplicity & navigation": Home = weekly goals,
// "waiting on you", the current round. Nothing else. Layout is the
// provisional Night Temple design (docs/design/v2-style-options.html,
// option B): brand + DP, "Season 2 · Week N", "Welcome back, <name>",
// Weekly goals, Waiting on you, This round, and a Season Path mini
// bar linking to /season.
//
// getSeasonOverview() also REFRESHES the player's weekly goals and
// Season Path (pays anything newly completed, idempotent), so it
// runs before the balance is read.
// =========================================================

type ProfileRow = {
  id: string;
  username: string | null;
  duelist_name: string | null;
  duel_points: number | null;
};

type AttentionMatchRow = {
  id: string;
  status: string;
  player_one_id: string;
  player_two_id: string;
  result_submitted_by: string | null;
  competition_id: string | null;
};

type AttentionTradeRow = {
  id: string;
  status: string;
  sender_id: string;
  receiver_id: string;
};

type RoundMatchRow = {
  id: string;
  player_one_id: string;
  player_two_id: string;
  status: string;
  round_number: number | null;
};

function nameOf(
  profile: Pick<ProfileRow, "duelist_name" | "username"> | null | undefined
) {
  return (
    profile?.duelist_name ??
    profile?.username ??
    "Duelist"
  );
}

type SupabaseClient =
  Awaited<
    ReturnType<typeof requireUser>
  >["supabase"];

// The player's place in the season's current round.
async function loadThisRound(
  supabase: SupabaseClient,
  userId: string,
  leagueId: string,
  myName: string
): Promise<HomeRoundState> {
  const season =
    await getActiveSeasonCompetition(
      supabase,
      leagueId
    );

  if (!season) {
    return {
      state: "none",
    };
  }

  const {
    count: playerCountRaw,
  } = await supabase
    .from("competition_players")
    .select(
      "profile_id",
      {
        count: "exact",
        head: true,
      }
    )
    .eq(
      "competition_id",
      season.id
    );

  const playerCount =
    playerCountRaw ?? 0;

  if (!season.current_round || playerCount < 2) {
    return {
      state: "finished",
      competitionId: season.id,
      competitionName: season.name,
    };
  }

  const round =
    logicalRoundFor(
      season.current_round,
      playerCount
    );

  const cycle =
    scheduleRoundsPerCycle(
      playerCount
    );

  const blockStart =
    (round - 1) * cycle + 1;

  const blockEnd =
    round * cycle;

  const {
    data: matchData,
    error: matchError,
  } = await supabase
    .from("matches")
    .select(
      "id,player_one_id,player_two_id,status,round_number"
    )
    .eq(
      "competition_id",
      season.id
    )
    .is(
      "tiebreak_id",
      null
    )
    .gte(
      "round_number",
      blockStart
    )
    .lte(
      "round_number",
      blockEnd
    )
    .order(
      "round_number",
      {
        ascending: true,
      }
    )
    .order(
      "id",
      {
        ascending: true,
      }
    );

  if (matchError) {
    throw new Error(
      matchError.message
    );
  }

  const roundMatches =
    (matchData ?? []) as RoundMatchRow[];

  const duelsPlayed =
    roundMatches.filter(
      (match) =>
        match.status ===
        "completed"
    ).length;

  const myOpen =
    roundMatches.find(
      (match) =>
        match.status !== "completed" &&
        (match.player_one_id === userId ||
          match.player_two_id === userId)
    ) ?? null;

  let opponentName: string | null =
    null;

  if (myOpen) {
    const opponentId =
      myOpen.player_one_id === userId
        ? myOpen.player_two_id
        : myOpen.player_one_id;

    const {
      data: opponent,
    } = await supabase
      .from("profiles")
      .select(
        "duelist_name,username"
      )
      .eq(
        "id",
        opponentId
      )
      .maybeSingle();

    opponentName =
      nameOf(
        opponent as ProfileRow | null
      );
  }

  return {
    state: myOpen
      ? "play"
      : "waiting",
    competitionId: season.id,
    round,
    totalRounds:
      totalLogicalRounds(
        season.total_rounds,
        playerCount
      ),
    myName,
    opponentName,
    duelsPlayed,
    duelsInRound:
      roundMatches.length ||
      duelsPerRound(
        playerCount
      ),
  };
}

export default async function HomePage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  // Refresh first: it may credit DP the balance below must include.
  const overview =
    await getSeasonOverview();

  const [
    profileResult,
    leagueId,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id,username,duelist_name,duel_points"
      )
      .eq(
        "id",
        userId
      )
      .maybeSingle(),
    getLeagueIdForUser(
      supabase,
      userId
    ),
  ]);

  if (profileResult.error) {
    throw new Error(
      profileResult.error.message
    );
  }

  const profile =
    profileResult.data as ProfileRow | null;

  const myName =
    nameOf(
      profile
    );

  // ======================================================
  // WAITING ON YOU (shared with /attention + the nav badge).
  // Only open matches/trades are needed, so the queries stay
  // small no matter how long the league history gets.
  // ======================================================

  const [
    matchResult,
    tradeResult,
    pendingVotes,
    thisRound,
  ] = await Promise.all([
    leagueId
      ? supabase
          .from("matches")
          .select(
            "id,status,player_one_id,player_two_id,result_submitted_by,competition_id"
          )
          .eq(
            "league_id",
            leagueId
          )
          .in(
            "status",
            ["pending", "result_submitted"]
          )
          .or(
            `player_one_id.eq.${userId},player_two_id.eq.${userId}`
          )
      : Promise.resolve({
          data: [] as AttentionMatchRow[],
          error: null,
        }),
    leagueId
      ? supabase
          .from("trades")
          .select(
            "id,status,sender_id,receiver_id"
          )
          .eq(
            "league_id",
            leagueId
          )
          .eq(
            "status",
            "pending"
          )
          .eq(
            "receiver_id",
            userId
          )
      : Promise.resolve({
          data: [] as AttentionTradeRow[],
          error: null,
        }),
    getPendingCardVoteCount(
      supabase,
      userId,
      leagueId
    ),
    leagueId
      ? loadThisRound(
          supabase,
          userId,
          leagueId,
          myName
        )
      : Promise.resolve<HomeRoundState>({
          state: "none",
        }),
  ]);

  const attentionItems =
    computeAttentionItems(
      (matchResult.data ?? []) as AttentionMatchRow[],
      (tradeResult.data ?? []) as AttentionTradeRow[],
      userId
    );

  const voteItem =
    cardVoteAttentionItem(
      pendingVotes
    );

  if (voteItem) {
    attentionItems.push(
      voteItem
    );
  }

  return (
    <main className="relative mx-auto w-full max-w-xl px-4 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))]">
      {/* Business rule: the Samo rival easter egg stays (it is a
          full-screen overlay that only ever shows for samo). */}
      <SamoRivalIntro
        username={
          profile?.username
        }
      />

      {/* HEADER: brand + DP */}

      <header className="flex items-center justify-between gap-3">
        <p className="font-display text-[15px] font-black tracking-[.14em] text-gold [text-shadow:0_0_14px_rgb(242_196_90/.6)]">
          DUELIST CIRCLE
        </p>

        <Link
          href="/wallet"
          aria-label={`${(profile?.duel_points ?? 0).toLocaleString("en-US")} Duel Points - open wallet`}
          className="inline-flex min-h-9 items-center rounded-full border border-[rgb(242_196_90/.45)] bg-[rgb(242_196_90/.14)] px-3 text-[13px] font-bold tabular-nums text-gold transition-colors hover:bg-[rgb(242_196_90/.22)] active:scale-95"
        >
          {(profile?.duel_points ?? 0).toLocaleString("en-US")} DP
        </Link>
      </header>

      {/* GREETING */}

      <div className="mt-5">
        <p className="text-xs uppercase tracking-[.12em] text-zinc-300/80">
          {seasonWeekLabel(
            overview.season
          )}
        </p>

        <h1 className="mt-0.5 text-[24px] font-bold leading-tight text-[#f6e3b0]">
          Welcome back, {myName}
        </h1>
      </div>

      <HomeIntroFlag />

      <div className="dc-stagger mt-4 space-y-2.5">
        <HomeWeeklyGoals
          weekly={overview.weekly}
        />

        <HomeWaitingOnYou
          items={attentionItems}
        />

        <HomeThisRound
          round={thisRound}
        />

        <SeasonPathMini
          xp={overview.path.xp}
          tiers={overview.path.tiers}
        />
      </div>
    </main>
  );
}
