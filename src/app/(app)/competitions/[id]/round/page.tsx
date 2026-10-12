import Link from "next/link";

import {
  notFound,
} from "next/navigation";

import {
  ArrowLeft,
  Coins,
  Crown,
  Gift,
  Medal,
  Trophy,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  fetchAllPages,
} from "@/lib/supabase/paginate";

import {
  logicalRoundFor,
  totalLogicalRounds,
} from "@/lib/competitions/season";

import {
  voucherLabel,
} from "@/lib/match-settlement-summary";

import {
  RoundPlayFlow,
  type RoundPairing,
} from "@/components/round-play-flow";

export const dynamic =
  "force-dynamic";

// =========================================================
// THIS ROUND (2.0 season competition)
//
// docs/V2_PLAN.md, "Duels & competition": one long season
// competition; a "This round" screen shows who plays whom with
// winner buttons and the standings below. Rounds are played on
// different days (~3 a week), so nothing here is tied to one
// evening: the page always opens on the first season round that
// still has a duel without a result (competitions.current_round is
// the lowest open SCHEDULE round, converted to the season round the
// same way _settle_round_cycle does - src/lib/competitions/season.ts).
//
// Either player of a duel (or the admin) records it by tapping the
// winner (submit_competition_match_result_v2, migration
// 202610120600). Match DP, round rewards and the reward pop-up all
// come from the database; this page only reads them back.
// =========================================================

type CompetitionRow = {
  id: string;
  league_id: string;
  name: string;
  status: string;
  current_round: number | null;
  total_rounds: number | null;
  match_format: "single_duel" | "best_of_3";
  meetings_per_pairing: number | null;
};

type MatchRow = {
  id: string;
  player_one_id: string;
  player_two_id: string;
  status: string;
  winner_id: string | null;
  round_number: number | null;
  tiebreak_id: string | null;
  player_one_duel_wins: number;
  player_two_duel_wins: number;
};

type ProfileRow = {
  id: string;
  username: string | null;
  duelist_name: string | null;
};

type StandingRow = {
  profile_id: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  placement: number;
};

type RoundRuleRow = {
  role: string;
  duel_points: number;
  voucher_type: string | null;
  voucher_quantity: number;
};

type GrantRow = {
  profile_id: string;
  reward_role: string;
  round_number: number;
};

type EconomyRow = {
  match_win_dp: number;
  match_loss_dp: number;
  round_participation_dp: number;
  round_participation_voucher_type: string | null;
  round_participation_voucher_quantity: number;
  round_first_dp: number;
  round_first_voucher_type: string | null;
  round_first_voucher_quantity: number;
  round_second_dp: number;
  round_third_dp: number;
};

const ROLE_ORDER = [
  "round_winner",
  "round_runner_up",
  "round_third",
  "participation",
];

const ROLE_LABEL: Record<string, string> = {
  round_winner: "1st",
  round_runner_up: "2nd",
  round_third: "3rd",
  participation: "Everyone",
};

function displayName(
  profile: ProfileRow | undefined
) {
  return (
    profile?.duelist_name ??
    profile?.username ??
    "Duelist"
  );
}

function rewardText(
  rule: RoundRuleRow
) {
  const parts: string[] = [];

  if (rule.duel_points > 0) {
    parts.push(
      `${rule.duel_points.toLocaleString()} DP`
    );
  }

  if (rule.voucher_type && rule.voucher_quantity > 0) {
    parts.push(
      `${rule.voucher_quantity > 1 ? `${rule.voucher_quantity}× ` : ""}${voucherLabel(rule.voucher_type)}`
    );
  }

  return parts.join(" + ") || "—";
}

export default async function CompetitionRoundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const {
    id: competitionId,
  } = await params;

  const {
    supabase,
    userId,
  } = await requireUser();

  const {
    data: competitionData,
    error: competitionError,
  } = await supabase
    .from("competitions")
    .select(
      "id,league_id,name,status,current_round,total_rounds,match_format,meetings_per_pairing"
    )
    .eq(
      "id",
      competitionId
    )
    .maybeSingle();

  if (competitionError) {
    throw new Error(
      competitionError.message
    );
  }

  if (!competitionData) {
    notFound();
  }

  const competition =
    competitionData as CompetitionRow;

  const [
    membershipResult,
    playersResult,
    matches,
    standingsResult,
    rulesResult,
    economyResult,
    grantsResult,
  ] = await Promise.all([
    supabase
      .from("league_members")
      .select("role")
      .eq("league_id", competition.league_id)
      .eq("profile_id", userId)
      .maybeSingle(),
    supabase
      .from("competition_players")
      .select("profile_id")
      .eq("competition_id", competitionId),
    fetchAllPages<MatchRow>(
      (from, to) =>
        supabase
          .from("matches")
          .select(
            "id,player_one_id,player_two_id,status,winner_id,round_number,tiebreak_id,player_one_duel_wins,player_two_duel_wins"
          )
          .eq("competition_id", competitionId)
          .order("round_number", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, to)
    ),
    supabase.rpc(
      "get_competition_standings_v2",
      {
        target_competition_id:
          competitionId,
      }
    ),
    supabase
      .from("competition_round_reward_rules")
      .select("role,duel_points,voucher_type,voucher_quantity")
      .eq("competition_id", competitionId),
    supabase
      .from("league_economy_defaults")
      .select(
        "match_win_dp,match_loss_dp,round_participation_dp,round_participation_voucher_type,round_participation_voucher_quantity,round_first_dp,round_first_voucher_type,round_first_voucher_quantity,round_second_dp,round_third_dp"
      )
      .eq("id", true)
      .maybeSingle(),
    supabase
      .from("competition_round_reward_grants")
      .select("profile_id,reward_role,round_number")
      .eq("competition_id", competitionId)
      .eq("status", "granted")
      .neq("reward_role", "participation")
      .order("round_number", { ascending: false })
      .limit(3),
  ]);

  if (!membershipResult.data) {
    notFound();
  }

  const isAdmin =
    membershipResult.data.role === "admin";

  const playerIds = (
    (playersResult.data ?? []) as { profile_id: string }[]
  ).map(
    (row) => row.profile_id
  );

  const playerCount =
    playerIds.length;

  const {
    data: profileData,
  } =
    playerIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id,username,duelist_name")
          .in("id", playerIds)
      : {
          data: [] as ProfileRow[],
        };

  const profileMap = new Map(
    ((profileData ?? []) as ProfileRow[]).map(
      (profile) => [
        profile.id,
        profile,
      ]
    )
  );

  const economy =
    (economyResult.data ?? null) as EconomyRow | null;

  // Round prize table: the competition's own rules, or (before the
  // first round settles and installs them) the league defaults that
  // _install_default_round_rewards will copy in.
  const storedRules =
    (rulesResult.data ?? []) as RoundRuleRow[];

  const roundRules: RoundRuleRow[] =
    storedRules.length > 0
      ? storedRules
      : economy
        ? [
            {
              role: "round_winner",
              duel_points: economy.round_first_dp,
              voucher_type: economy.round_first_voucher_type,
              voucher_quantity: economy.round_first_voucher_quantity,
            },
            {
              role: "round_runner_up",
              duel_points: economy.round_second_dp,
              voucher_type: null,
              voucher_quantity: 0,
            },
            {
              role: "round_third",
              duel_points: economy.round_third_dp,
              voucher_type: null,
              voucher_quantity: 0,
            },
            {
              role: "participation",
              duel_points: economy.round_participation_dp,
              voucher_type: economy.round_participation_voucher_type,
              voucher_quantity: economy.round_participation_voucher_quantity,
            },
          ]
        : [];

  roundRules.sort(
    (a, b) =>
      ROLE_ORDER.indexOf(a.role) -
      ROLE_ORDER.indexOf(b.role)
  );

  const visibleRoundRules = roundRules.filter(
    (rule) =>
      ROLE_ORDER.includes(rule.role) &&
      (rule.role !== "round_third" || playerCount >= 3)
  );

  // ------------------------------------------------------
  // The season round on screen
  // ------------------------------------------------------

  const scheduleMatches = matches.filter(
    (match) =>
      !match.tiebreak_id &&
      match.round_number !== null
  );

  const seasonRounds =
    totalLogicalRounds(
      competition.total_rounds,
      playerCount
    );

  const currentSeasonRound =
    competition.current_round !== null
      ? logicalRoundFor(
          competition.current_round,
          playerCount
        )
      : null;

  const roundMatches =
    currentSeasonRound === null
      ? []
      : scheduleMatches.filter(
          (match) =>
            logicalRoundFor(
              match.round_number ?? 1,
              playerCount
            ) === currentSeasonRound
        );

  const pairings: RoundPairing[] = roundMatches.map(
    (match) => ({
      id: match.id,
      playerOne: {
        id: match.player_one_id,
        name: displayName(
          profileMap.get(match.player_one_id)
        ),
      },
      playerTwo: {
        id: match.player_two_id,
        name: displayName(
          profileMap.get(match.player_two_id)
        ),
      },
      status:
        match.status === "completed"
          ? "completed"
          : "open",
      winnerId: match.winner_id,
      canSubmit:
        competition.status === "active" &&
        (isAdmin ||
          match.player_one_id === userId ||
          match.player_two_id === userId),
    })
  );

  const completedSeasonRounds =
    currentSeasonRound === null
      ? seasonRounds
      : currentSeasonRound - 1;

  // Most recent settled round's placements (1st/2nd/3rd).
  const grants =
    (grantsResult.data ?? []) as GrantRow[];

  const lastSettledRound =
    grants[0]?.round_number ?? null;

  const lastRoundPlacements =
    lastSettledRound === null
      ? []
      : grants
          .filter(
            (grant) =>
              grant.round_number === lastSettledRound
          )
          .sort(
            (a, b) =>
              ROLE_ORDER.indexOf(a.reward_role) -
              ROLE_ORDER.indexOf(b.reward_role)
          );

  const standings = (
    (standingsResult.data ?? []) as StandingRow[]
  )
    .slice()
    .sort(
      (a, b) =>
        a.placement - b.placement
    );

  const seasonFinished =
    competition.status === "completed" ||
    (competition.status === "active" &&
      currentSeasonRound === null);

  return (
    <main className="mx-auto max-w-xl px-4 py-5">
      <nav className="flex items-center justify-between gap-3">
        <Link
          href="/play"
          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs font-bold text-amber-300 transition-colors hover:border-amber-300/40"
        >
          <ArrowLeft
            size={14}
          />
          Play
        </Link>

        <Link
          href={`/competitions/${competition.id}`}
          className="text-xs font-bold text-zinc-500 transition-colors hover:text-zinc-300"
        >
          Full schedule
        </Link>
      </nav>

      <header className="mt-4">
        <p className="text-[10px] font-black uppercase tracking-[.22em] text-amber-300">
          {competition.name}
        </p>

        <h1 className="font-display gold-text mt-1 text-3xl font-black">
          {seasonFinished
            ? "Season complete"
            : currentSeasonRound !== null
              ? `Round ${currentSeasonRound}`
              : "This Round"}
        </h1>

        {seasonRounds > 0 && (
          <p className="mt-1 text-xs font-bold text-zinc-500">
            {completedSeasonRounds} of {seasonRounds} rounds played
          </p>
        )}
      </header>

      {competition.status === "draft" ? (
        <section className="panel mt-5 p-5 text-center">
          <p className="font-black text-zinc-200">
            This competition has not started yet.
          </p>

          <p className="mt-1 text-sm text-zinc-500">
            The admin starts it from the full competition page.
          </p>
        </section>
      ) : seasonFinished ? (
        <section className="panel mt-5 p-5 text-center">
          <Trophy
            size={30}
            className="mx-auto text-amber-300"
          />

          <p className="mt-3 font-black text-zinc-100">
            Every duel of this competition has a result.
          </p>

          <p className="mt-1 text-sm text-zinc-500">
            {competition.status === "completed"
              ? "Final placements and rewards are on the competition page."
              : isAdmin
                ? "Finalize it (and play any tiebreak) on the competition page."
                : "The admin will finalize it on the competition page."}
          </p>

          <Link
            href={`/competitions/${competition.id}`}
            className="primary-button mt-4 inline-flex items-center gap-2 text-sm"
          >
            <Trophy
              size={15}
            />
            Final results
          </Link>
        </section>
      ) : (
        <RoundPlayFlow
          competitionId={competition.id}
          roundNumber={currentSeasonRound ?? 1}
          matchFormat={competition.match_format}
          pairings={pairings}
          currentUserId={userId}
        />
      )}

      {/* PRIZES */}

      <section className="mt-5 grid gap-2.5">
        {economy && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-xs">
            <span className="inline-flex items-center gap-1.5 font-black text-zinc-300">
              <Coins
                size={13}
                className="text-amber-300"
              />
              Every duel
            </span>

            <span className="font-bold text-emerald-300">
              Win +{economy.match_win_dp} DP
            </span>

            <span className="font-bold text-zinc-400">
              Loss +{economy.match_loss_dp} DP
            </span>
          </div>
        )}

        {visibleRoundRules.length > 0 && (
          <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] px-4 py-3">
            <p className="inline-flex items-center gap-1.5 text-xs font-black text-amber-200">
              <Gift
                size={13}
              />
              When the round is complete
            </p>

            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {visibleRoundRules.map(
                (rule) => (
                  <div
                    key={rule.role}
                    className="contents"
                  >
                    <dt className="font-black text-zinc-500">
                      {ROLE_LABEL[rule.role]}
                    </dt>

                    <dd className="font-bold text-zinc-200">
                      {rewardText(rule)}
                    </dd>
                  </div>
                )
              )}
            </dl>
          </div>
        )}
      </section>

      {/* LAST ROUND */}

      {lastRoundPlacements.length > 0 && (
        <section className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-zinc-500">
            Round {lastSettledRound} result
          </p>

          <ol className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {lastRoundPlacements.map(
              (grant) => (
                <li
                  key={`${grant.profile_id}-${grant.reward_role}`}
                  className="inline-flex items-center gap-1.5 font-bold text-zinc-200"
                >
                  <span className="text-xs font-black text-amber-300">
                    {ROLE_LABEL[grant.reward_role]}
                  </span>
                  {displayName(
                    profileMap.get(grant.profile_id)
                  )}
                </li>
              )
            )}
          </ol>
        </section>
      )}

      {/* SEASON STANDINGS */}

      <section className="panel mt-5 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
          <h2 className="font-display inline-flex items-center gap-2 text-lg font-bold text-zinc-100">
            <Crown
              size={16}
              className="text-amber-300"
            />
            Season standings
          </h2>

          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
            Win = 3 pts
          </span>
        </div>

        {standings.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-zinc-500">
            Standings appear after the first result.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] font-black uppercase tracking-wider text-zinc-600">
                <th className="py-2 pl-4 text-left">
                  #
                </th>
                <th className="py-2 text-left">
                  Duelist
                </th>
                <th className="py-2 text-right">
                  W
                </th>
                <th className="py-2 text-right">
                  L
                </th>
                <th className="py-2 pr-4 text-right">
                  Pts
                </th>
              </tr>
            </thead>

            <tbody>
              {standings.map(
                (row) => {
                  const isMe =
                    row.profile_id === userId;

                  return (
                    <tr
                      key={row.profile_id}
                      className={`border-b border-white/[0.04] last:border-0 ${
                        isMe
                          ? "bg-amber-300/[0.06]"
                          : ""
                      }`}
                    >
                      <td className="py-2.5 pl-4 font-black text-zinc-400">
                        {row.placement === 1 &&
                        row.played > 0 ? (
                          <Medal
                            size={15}
                            className="text-amber-300"
                            aria-label="1st"
                          />
                        ) : (
                          row.placement
                        )}
                      </td>

                      <td
                        className={`py-2.5 font-black ${
                          isMe
                            ? "text-amber-100"
                            : "text-zinc-200"
                        }`}
                      >
                        {displayName(
                          profileMap.get(row.profile_id)
                        )}
                        {isMe && (
                          <span className="ml-1.5 text-[10px] font-bold text-amber-300/70">
                            you
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 text-right tabular-nums text-zinc-300">
                        {row.wins}
                      </td>

                      <td className="py-2.5 text-right tabular-nums text-zinc-500">
                        {row.losses}
                      </td>

                      <td className="py-2.5 pr-4 text-right font-black tabular-nums text-amber-200">
                        {row.points}
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
