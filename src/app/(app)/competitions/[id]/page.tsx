import Link from "next/link";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Coins,
  Crown,
  Flame,
  Gift,
  Home,
  Medal,
  Play,
  Plus,
  ShieldCheck,
  Swords,
  Ticket,
  Trophy,
  UserMinus,
  Users,
} from "lucide-react";

import {
  notFound,
} from "next/navigation";

import {
  addCompetitionPlayer,
  addCompetitionPlayerV2,
  detectCompetitionTiebreaksV2,
  distributeCompetitionRewards,
  distributeCompetitionRewardsV2,
  finalizeCompetitionV2,
  finalizeRoundRobinCompetition,
  removeCompetitionPlayer,
  removeCompetitionPlayerV2,
  startCompetition,
  startCompetitionTiebreak,
  startCompetitionV2,
} from "@/app/actions/competitions";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  SubmitButton,
} from "@/components/submit-button";

import {
  ConfirmSubmitButton,
} from "@/components/confirm-submit-button";

import {
  CompetitionMatchResultFormV2,
} from "@/components/competition-match-result-form-v2";

import {
  voucherLabel,
} from "@/lib/match-settlement-summary";

export const dynamic =
  "force-dynamic";

// =========================================================
// TYPES
// =========================================================

type Competition = {
  id: string;
  league_id: string;

  name: string;

  competition_type:
    | "round_robin"
    | "tournament";

  status:
    | "draft"
    | "active"
    | "completed"
    | "cancelled";

  starts_at:
    | string
    | null;

  completed_at:
    | string
    | null;

  rewards_distributed_at:
    | string
    | null;

  meetings_per_pairing:
    | number
    | null;

  match_format:
    | "single_duel"
    | "best_of_3"
    | null;

  total_rounds:
    | number
    | null;

  current_round:
    | number
    | null;
};

type LeagueMember = {
  profile_id: string;
  role: string;
};

type Profile = {
  id: string;

  username:
    | string
    | null;

  duelist_name: string;
};

type CompetitionPlayer = {
  profile_id: string;
};

type RewardRule = {
  placement: number;

  duel_points: number;

  voucher_type:
    | string
    | null;

  voucher_quantity:
    number;
};

type Standing = {
  profile_id: string;

  wins: number;
  losses: number;
  draws: number;
  played: number;
  points: number;
};

type FinalResult = {
  profile_id: string;

  placement: number;

  wins: number;
  losses: number;
  draws: number;

  points: number;
};

type CompetitionMatch = {
  id: string;

  player_one_id: string;
  player_two_id: string;

  status: string;

  winner_id:
    | string
    | null;

  result:
    | string
    | null;

  completed_at:
    | string
    | null;

  round_number:
    | number
    | null;

  meeting_number:
    | number
    | null;

  match_format:
    | "single_duel"
    | "best_of_3";

  player_one_duel_wins: number;
  player_two_duel_wins: number;

  // Track 3 (2026-08-27): set only for a deciding/sudden-death match
  // spawned by start_competition_tiebreak - these are excluded from
  // the normal round-grouped display below and rendered inside the
  // Tiebreak panel instead.
  tiebreak_id:
    | string
    | null;
};

// Track 3 (2026-08-27): one row per full tie (2 or 3 players sharing
// an identical points/head-to-head/duel-differential/duel-wins
// tuple) detected by detect_and_create_competition_tiebreaks - see
// 202608271000_competition_tiebreaks.sql for the full state machine.
type CompetitionTiebreak = {
  id: string;

  tied_profile_ids: string[];

  tie_size: number;

  status:
    | "pending"
    | "in_progress"
    | "resolved";

  streak_holder_id:
    | string
    | null;

  streak_count: number;

  resolved_order:
    | string[]
    | null;
};

type CompetitionRewardGrant = {
  profile_id: string;
  placement: number;
  duel_points_granted: number;
  voucher_type: string | null;
  voucher_quantity: number;
};

type CompetitionRoundRewardGrant = {
  profile_id: string;
  round_number: number;
  reward_role: "participation" | "round_winner";
  duel_points_granted: number;
  voucher_type: string | null;
  voucher_quantity: number;
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

function placementLabel(
  placement: number
) {
  if (placement === 1) {
    return "Champion";
  }

  if (placement === 2) {
    return "Runner-up";
  }

  if (placement === 3) {
    return "Third Place";
  }

  return `#${placement}`;
}

function placementIcon(
  placement: number
) {
  if (placement === 1) {
    return (
      <Crown
        size={18}
        className="text-amber-300"
      />
    );
  }

  if (
    placement === 2 ||
    placement === 3
  ) {
    return (
      <Medal
        size={18}
        className={
          placement === 2
            ? "text-zinc-300"
            : "text-orange-300"
        }
      />
    );
  }

  return (
    <ShieldCheck
      size={17}
      className="text-zinc-600"
    />
  );
}

// =========================================================
// PAGE
// =========================================================

export default async function CompetitionDetailPage({
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
  // COMPETITION
  // ======================================================

  const {
    data: competitionData,
    error: competitionError,
  } = await supabase
    .from("competitions")
    .select(
      `
        id,
        league_id,
        name,
        competition_type,
        status,
        starts_at,
        completed_at,
        rewards_distributed_at,
        meetings_per_pairing,
        match_format,
        total_rounds,
        current_round
      `
    )
    .eq(
      "id",
      id
    )
    .maybeSingle();

  if (
    competitionError ||
    !competitionData
  ) {
    notFound();
  }

  const competition =
    competitionData as Competition;

  const isV2 =
    competition.meetings_per_pairing !==
    null;

  // ======================================================
  // PARALLEL READS
  //
  // Membership, league members, competition players, reward
  // rules, standings, final results and linked matches only
  // ever depend on the competition loaded above - never on
  // each other - so fetch them together instead of one at a
  // time. Standings/final results are conditional on the
  // competition status, so those two resolve to an empty
  // result inline instead of skipping the Promise.all slot.
  // ======================================================

  const wantsStandings =
    competition.status ===
      "active" &&
    (competition.competition_type ===
      "round_robin" ||
      isV2);

  const wantsFinalResults =
    competition.status ===
    "completed";

  const [
    {
      data: membership,
      error: membershipError,
    },
    {
      data: memberData,
      error: memberError,
    },
    {
      data: competitionPlayerData,
      error: competitionPlayerError,
    },
    {
      data: rewardData,
      error: rewardError,
    },
    {
      data: standingsData,
      error: standingsError,
    },
    {
      data: finalResultData,
      error: finalResultError,
    },
    {
      data: matchData,
      error: matchError,
    },
    {
      data: tiebreakData,
      error: tiebreakError,
    },
    {
      data: rewardGrantData,
      error: rewardGrantError,
    },
    {
      data: roundRewardGrantData,
      error: roundRewardGrantError,
    },
  ] = await Promise.all([
    supabase
      .from(
        "league_members"
      )
      .select(
        "profile_id,role"
      )
      .eq(
        "league_id",
        competition.league_id
      )
      .eq(
        "profile_id",
        userId
      )
      .maybeSingle(),

    supabase
      .from(
        "league_members"
      )
      .select(
        "profile_id,role"
      )
      .eq(
        "league_id",
        competition.league_id
      ),

    supabase
      .from(
        "competition_players"
      )
      .select(
        "profile_id"
      )
      .eq(
        "competition_id",
        competition.id
      ),

    supabase
      .from(
        "competition_reward_rules"
      )
      .select(
        `
          placement,
          duel_points,
          voucher_type,
          voucher_quantity
        `
      )
      .eq(
        "competition_id",
        competition.id
      )
      .order(
        "placement",
        {
          ascending:
            true,
        }
      ),

    wantsStandings
      ? supabase.rpc(
          isV2
            ? "get_competition_standings_v2"
            : "get_competition_standings",
          {
            target_competition_id:
              competition.id,
          }
        )
      : Promise.resolve({
          data: [] as Standing[],
          error: null,
        }),

    wantsFinalResults
      ? supabase
          .from(
            "competition_results"
          )
          .select(
            `
              profile_id,
              placement,
              wins,
              losses,
              draws,
              points
            `
          )
          .eq(
            "competition_id",
            competition.id
          )
          .order(
            "placement",
            {
              ascending:
                true,
            }
          )
      : Promise.resolve({
          data: [] as FinalResult[],
          error: null,
        }),

    supabase
      .from("matches")
      .select(
        `
          id,
          player_one_id,
          player_two_id,
          status,
          winner_id,
          result,
          completed_at,
          round_number,
          meeting_number,
          match_format,
          player_one_duel_wins,
          player_two_duel_wins,
          tiebreak_id
        `
      )
      .eq(
        "competition_id",
        competition.id
      )
      .order(
        "round_number",
        {
          ascending:
            true,
        }
      ),

    // Track 3 (2026-08-27): V1 has no tiebreak concept at all, so
    // this stays a resolved empty array for V1 rather than querying -
    // same pattern as the standings/final-results slots above.
    isV2
      ? supabase
          .from(
            "competition_tiebreaks"
          )
          .select(
            `
              id,
              tied_profile_ids,
              tie_size,
              status,
              streak_holder_id,
              streak_count,
              resolved_order
            `
          )
          .eq(
            "competition_id",
            competition.id
          )
      : Promise.resolve({
          data: [] as CompetitionTiebreak[],
          error: null,
        }),

    // Actual granted placement rewards (not the configured rules -
    // rewardData above is the rule table, this is what really got
    // paid out) so Final Results can show real DP/voucher amounts
    // instead of only a generic "rewards distributed" banner.
    wantsFinalResults
      ? supabase
          .from(
            "competition_reward_grants"
          )
          .select(
            "profile_id,placement,duel_points_granted,voucher_type,voucher_quantity"
          )
          .eq(
            "competition_id",
            competition.id
          )
          .eq(
            "status",
            "granted"
          )
      : Promise.resolve({
          data: [] as CompetitionRewardGrant[],
          error: null,
        }),

    // Round-level rewards (participation + round-winner) granted so
    // far, V2 round-robin only - settled automatically as each
    // round completes, independent of overall competition status.
    isV2
      ? supabase
          .from(
            "competition_round_reward_grants"
          )
          .select(
            "profile_id,round_number,reward_role,duel_points_granted,voucher_type,voucher_quantity"
          )
          .eq(
            "competition_id",
            competition.id
          )
          .eq(
            "status",
            "granted"
          )
      : Promise.resolve({
          data: [] as CompetitionRoundRewardGrant[],
          error: null,
        }),
  ]);

  if (
    membershipError ||
    !membership
  ) {
    notFound();
  }

  const isAdmin =
    String(
      membership.role
    ) === "admin";

  if (memberError) {
    throw new Error(
      memberError.message
    );
  }

  const leagueMembers =
    (memberData ??
      []) as LeagueMember[];

  const memberIds =
    leagueMembers.map(
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
    memberIds.length >
    0
  ) {
    const {
      data: profileData,
      error: profileError,
    } = await supabase
      .from(
        "profiles"
      )
      .select(
        "id,username,duelist_name"
      )
      .in(
        "id",
        memberIds
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

  if (
    competitionPlayerError
  ) {
    throw new Error(
      competitionPlayerError.message
    );
  }

  const competitionPlayers =
    (competitionPlayerData ??
      []) as CompetitionPlayer[];

  const competitionPlayerIds =
    new Set(
      competitionPlayers.map(
        (player) =>
          player.profile_id
      )
    );

  const availablePlayers =
    profiles
      .filter(
        (profile) =>
          !competitionPlayerIds.has(
            profile.id
          )
      )
      .sort(
        (a, b) =>
          playerName(
            a
          ).localeCompare(
            playerName(b)
          )
      );

  const participatingProfiles =
    competitionPlayers
      .map(
        (player) =>
          profileMap.get(
            player.profile_id
          )
      )
      .filter(
        (
          profile
        ): profile is Profile =>
          Boolean(
            profile
          )
      )
      .sort(
        (a, b) =>
          playerName(
            a
          ).localeCompare(
            playerName(b)
          )
      );

  // ======================================================
  // REWARD RULES
  // ======================================================

  if (rewardError) {
    throw new Error(
      rewardError.message
    );
  }

  const rewardRules =
    (rewardData ??
      []) as RewardRule[];

  // ======================================================
  // LIVE STANDINGS
  // ======================================================

  if (standingsError) {
    throw new Error(
      standingsError.message
    );
  }

  const standings =
    (standingsData ??
      []) as Standing[];

  // ======================================================
  // FINAL RESULTS
  // ======================================================

  if (finalResultError) {
    throw new Error(
      finalResultError.message
    );
  }

  const finalResults =
    (finalResultData ??
      []) as FinalResult[];

  // ======================================================
  // LINKED MATCHES
  // ======================================================

  if (matchError) {
    throw new Error(
      matchError.message
    );
  }

  const matches =
    (matchData ??
      []) as CompetitionMatch[];

  const completedMatches =
    matches.filter(
      (match) =>
        match.status ===
        "completed"
    );

  const openMatches =
    matches.filter(
      (match) =>
        match.status !==
        "completed"
    );

  // ======================================================
  // TIEBREAKS (Track 3, 2026-08-27)
  // ======================================================

  if (tiebreakError) {
    throw new Error(
      tiebreakError.message
    );
  }

  const tiebreaks =
    (tiebreakData ??
      []) as CompetitionTiebreak[];

  // ======================================================
  // REWARD GRANTS (actual amounts paid, not the rule config)
  // ======================================================

  if (rewardGrantError) {
    throw new Error(
      rewardGrantError.message
    );
  }

  if (roundRewardGrantError) {
    throw new Error(
      roundRewardGrantError.message
    );
  }

  const rewardGrants =
    (rewardGrantData ??
      []) as CompetitionRewardGrant[];

  const roundRewardGrants =
    (roundRewardGrantData ??
      []) as CompetitionRoundRewardGrant[];

  type ProfileRewardTotal = {
    dpTotal: number;
    vouchers: Map<string, number>;
  };

  function addVoucher(
    totals: ProfileRewardTotal,
    voucherType: string | null,
    voucherQuantity: number
  ) {
    if (!voucherType || voucherQuantity <= 0) {
      return;
    }
    totals.vouchers.set(
      voucherType,
      (totals.vouchers.get(voucherType) ?? 0) +
        voucherQuantity
    );
  }

  const rewardTotalsByProfile = new Map<
    string,
    ProfileRewardTotal
  >();

  function totalsFor(profileId: string) {
    let totals =
      rewardTotalsByProfile.get(profileId);
    if (!totals) {
      totals = { dpTotal: 0, vouchers: new Map() };
      rewardTotalsByProfile.set(profileId, totals);
    }
    return totals;
  }

  for (const grant of rewardGrants) {
    const totals = totalsFor(grant.profile_id);
    totals.dpTotal += grant.duel_points_granted;
    addVoucher(
      totals,
      grant.voucher_type,
      grant.voucher_quantity
    );
  }

  for (const grant of roundRewardGrants) {
    const totals = totalsFor(grant.profile_id);
    totals.dpTotal += grant.duel_points_granted;
    addVoucher(
      totals,
      grant.voucher_type,
      grant.voucher_quantity
    );
  }

  const roundRewardCountByRound = new Map<
    number,
    number
  >();

  for (const grant of roundRewardGrants) {
    roundRewardCountByRound.set(
      grant.round_number,
      (roundRewardCountByRound.get(
        grant.round_number
      ) ?? 0) + 1
    );
  }

  const unresolvedTiebreaks =
    tiebreaks.filter(
      (tiebreak) =>
        tiebreak.status !==
        "resolved"
    );

  function tiebreakOpenMatch(
    tiebreak: CompetitionTiebreak
  ) {
    return matches.find(
      (match) =>
        match.tiebreak_id ===
          tiebreak.id &&
        match.status !==
          "completed"
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* NAV */}

      <nav className="flex flex-wrap items-center gap-3">
        <Link
          href="/competitions"
          className="inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300 transition hover:bg-amber-300/10"
        >
          <ArrowLeft
            size={17}
          />

          Competitions
        </Link>

        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-sm font-bold text-zinc-400 transition hover:text-zinc-100"
        >
          <Home
            size={16}
          />

          Home
        </Link>
      </nav>

      {/* HERO */}

      <section className="panel relative mt-6 overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-amber-400/[0.06] blur-[100px]" />

        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-violet-300/20 bg-violet-300/[0.05] px-3 py-1 text-[9px] font-black uppercase tracking-wider text-violet-200">
              {competition.competition_type ===
              "tournament"
                ? "Tournament"
                : "Round Robin"}
            </span>

            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[9px] font-black uppercase tracking-wider text-zinc-400">
              {
                competition.status
              }
            </span>
          </div>

          <h1 className="gold-text mt-5 text-4xl font-black sm:text-5xl">
            {
              competition.name
            }
          </h1>

          <div className="mt-4 flex flex-wrap gap-5 text-sm text-zinc-500">
            <span>
              {
                participatingProfiles.length
              }{" "}
              duelists
            </span>

            <span>
              Started{" "}
              {formatDate(
                competition.starts_at
              )}
            </span>

            <span>
              {
                completedMatches.length
              }{" "}
              completed matches
            </span>
          </div>
        </div>
      </section>

      {/* REWARDS */}

      <section className="mt-5 grid gap-3 md:grid-cols-3">
        {rewardRules.map(
          (reward) => (
            <div
              key={
                reward.placement
              }
              className="panel p-5"
            >
              <div className="flex items-center gap-2">
                {placementIcon(
                  reward.placement
                )}

                <p className="font-black">
                  {placementLabel(
                    reward.placement
                  )}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {reward.duel_points >
                  0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-300/[0.05] px-3 py-1 text-xs font-black text-cyan-200">
                    <Coins
                      size={12}
                    />

                    {
                      reward.duel_points
                    }{" "}
                    DP
                  </span>
                )}

                {reward.voucher_type &&
                  reward.voucher_quantity >
                    0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/20 bg-violet-300/[0.05] px-3 py-1 text-xs font-black uppercase text-violet-200">
                      <Ticket
                        size={12}
                      />

                      {
                        reward.voucher_type
                      }{" "}
                      voucher
                    </span>
                  )}
              </div>
            </div>
          )
        )}
      </section>

      {/* DRAFT MANAGEMENT */}

      {competition.status ===
        "draft" && (
        <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_.8fr]">
          <div className="panel p-6">
            <div className="flex items-center gap-2">
              <Users
                size={18}
                className="text-cyan-300"
              />

              <h2 className="text-xl font-black">
                Duelists
              </h2>
            </div>

            {participatingProfiles.length ===
            0 ? (
              <p className="mt-4 text-sm text-zinc-500">
                No players added yet.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {participatingProfiles.map(
                  (profile) => (
                    <div
                      key={
                        profile.id
                      }
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"
                    >
                      <p className="font-black text-zinc-200">
                        {playerName(
                          profile
                        )}
                      </p>

                      {isAdmin && (
                        <form
                          action={
                            isV2
                              ? removeCompetitionPlayerV2
                              : removeCompetitionPlayer
                          }
                        >
                          <input
                            type="hidden"
                            name="competition_id"
                            value={
                              competition.id
                            }
                          />

                          <input
                            type="hidden"
                            name="profile_id"
                            value={
                              profile.id
                            }
                          />

                          <ConfirmSubmitButton
                            confirmMessage="Remove this player from the competition?"
                            pendingLabel="Removing..."
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300/15 px-2.5 py-1.5 text-[10px] font-black text-red-300 transition hover:bg-red-300/[0.05]"
                          >
                            <UserMinus
                              size={12}
                            />

                            Remove
                          </ConfirmSubmitButton>
                        </form>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="panel p-6">
              <div className="flex items-center gap-2">
                <Plus
                  size={17}
                  className="text-amber-300"
                />

                <h2 className="text-xl font-black">
                  Add Duelist
                </h2>
              </div>

              {availablePlayers.length ===
              0 ? (
                <p className="mt-4 text-sm text-zinc-500">
                  Every league member is already participating.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {availablePlayers.map(
                    (profile) => (
                      <form
                        key={
                          profile.id
                        }
                        action={
                          isV2
                            ? addCompetitionPlayerV2
                            : addCompetitionPlayer
                        }
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"
                      >
                        <input
                          type="hidden"
                          name="competition_id"
                          value={
                            competition.id
                          }
                        />

                        <input
                          type="hidden"
                          name="profile_id"
                          value={
                            profile.id
                          }
                        />

                        <p className="font-black text-zinc-300">
                          {playerName(
                            profile
                          )}
                        </p>

                        <SubmitButton
                          pendingLabel="Adding..."
                          className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.05] px-3 py-1.5 text-[10px] font-black text-cyan-200"
                        >
                          Add
                        </SubmitButton>
                      </form>
                    )
                  )}
                </div>
              )}

              {participatingProfiles.length >=
                2 && (
                <form
                  action={
                    isV2
                      ? startCompetitionV2
                      : startCompetition
                  }
                  className="mt-5 border-t border-white/[0.06] pt-5"
                >
                  <input
                    type="hidden"
                    name="competition_id"
                    value={
                      competition.id
                    }
                  />

                  <ConfirmSubmitButton
                    confirmMessage={
                      isV2
                        ? "Generate the round-robin schedule and start the competition? Once started, no more duelists can be added."
                        : "Start the competition? Once started, no more duelists can be added."
                    }
                    pendingLabel="Starting..."
                    className="primary-button inline-flex w-full items-center justify-center gap-2"
                  >
                    <Play
                      size={15}
                    />

                    {isV2
                      ? "Generate Matches & Start"
                      : "Start Competition"}
                  </ConfirmSubmitButton>
                </form>
              )}
            </div>
          )}
        </section>
      )}

      {/* LIVE STANDINGS */}

      {competition.status ===
        "active" &&
        (competition.competition_type ===
          "round_robin" ||
          isV2) && (
          <section className="panel mt-6 overflow-hidden">
            <div className="border-b border-white/[0.06] p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Trophy
                    size={18}
                    className="text-amber-300"
                  />

                  <h2 className="text-xl font-black">
                    Live Standings
                  </h2>
                </div>

                {isV2 &&
                  competition.total_rounds &&
                  competition.current_round && (
                    <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-200">
                      Round {competition.current_round} of{" "}
                      {competition.total_rounds}
                    </span>
                  )}
              </div>

              <p className="mt-1 text-xs text-zinc-600">
                Win = 3 points · Draw = 1 · Loss = 0
                {isV2 &&
                  " · Ties: head-to-head, then duel differential, then duel wins"}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px]">
                <thead>
                  <tr className="border-b border-white/[0.05] text-left text-[9px] font-black uppercase tracking-wider text-zinc-600">
                    <th className="px-5 py-3">
                      #
                    </th>

                    <th className="px-5 py-3">
                      Duelist
                    </th>

                    <th className="px-5 py-3 text-center">
                      P
                    </th>

                    <th className="px-5 py-3 text-center">
                      W
                    </th>

                    <th className="px-5 py-3 text-center">
                      D
                    </th>

                    <th className="px-5 py-3 text-center">
                      L
                    </th>

                    <th className="px-5 py-3 text-right">
                      PTS
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {standings.map(
                    (
                      standing,
                      index
                    ) => (
                      <tr
                        key={
                          standing.profile_id
                        }
                        className="border-b border-white/[0.04] last:border-0"
                      >
                        <td className="px-5 py-4 font-black text-zinc-500">
                          {
                            index + 1
                          }
                        </td>

                        <td className="px-5 py-4 font-black text-zinc-200">
                          {playerName(
                            profileMap.get(
                              standing.profile_id
                            )
                          )}
                        </td>

                        <td className="px-5 py-4 text-center text-zinc-400">
                          {
                            standing.played
                          }
                        </td>

                        <td className="px-5 py-4 text-center font-black text-emerald-200">
                          {
                            standing.wins
                          }
                        </td>

                        <td className="px-5 py-4 text-center text-zinc-400">
                          {
                            standing.draws
                          }
                        </td>

                        <td className="px-5 py-4 text-center font-black text-red-200">
                          {
                            standing.losses
                          }
                        </td>

                        <td className="px-5 py-4 text-right text-xl font-black text-amber-200">
                          {
                            standing.points
                          }
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

      {/* TIEBREAKS (Track 3, 2026-08-27)
          Only ever populated for V2 competitions. A full tie (2 or 3
          players sharing an identical points/head-to-head/duel-
          differential/duel-wins line) has to be resolved with a real
          deciding match before the competition can be finalized -
          finalize_competition_v2 raises otherwise. This panel is the
          only place an admin can see that state and drive it. */}

      {isV2 &&
        tiebreaks.length >
          0 && (
          <section className="panel mt-6 overflow-hidden border-amber-300/20">
            <div className="border-b border-white/[0.06] p-5">
              <div className="flex items-center gap-2">
                <Flame
                  size={18}
                  className="text-amber-300"
                />

                <h2 className="text-xl font-black">
                  Tiebreaks
                </h2>
              </div>

              <p className="mt-1 text-xs text-zinc-600">
                {unresolvedTiebreaks.length >
                0
                  ? "The competition cannot be finalized until every tiebreak below is resolved."
                  : "All tiebreaks are resolved - final placement reflects the deciding match results."}
              </p>
            </div>

            <div className="divide-y divide-white/[0.05]">
              {tiebreaks.map(
                (tiebreak) => {
                  const openMatch =
                    tiebreakOpenMatch(
                      tiebreak
                    );

                  const tiedNames =
                    tiebreak.tied_profile_ids.map(
                      (profileId) =>
                        playerName(
                          profileMap.get(
                            profileId
                          )
                        )
                    );

                  return (
                    <div
                      key={
                        tiebreak.id
                      }
                      className="p-5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {tiebreak.status !==
                          "resolved" && (
                          <AlertTriangle
                            size={15}
                            className="text-amber-300"
                          />
                        )}

                        <p className="font-black text-zinc-200">
                          {tiedNames.join(
                            " · "
                          )}
                        </p>

                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                          {tiebreak.tie_size}-way tie
                        </span>

                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                          {tiebreak.status ===
                          "resolved"
                            ? "Resolved"
                            : tiebreak.status ===
                              "in_progress"
                            ? "In progress"
                            : "Awaiting deciding match"}
                        </span>
                      </div>

                      {tiebreak.tie_size ===
                        3 &&
                        tiebreak.status !==
                          "resolved" &&
                        tiebreak.streak_holder_id && (
                          <p className="mt-2 text-xs text-zinc-500">
                            Sudden death: {playerName(
                              profileMap.get(
                                tiebreak.streak_holder_id
                              )
                            )}{" "}
                            has {
                              tiebreak.streak_count
                            }{" "}
                            consecutive win
                            {tiebreak.streak_count ===
                            1
                              ? ""
                              : "s"}{" "}
                            - one more resolves the tie.
                          </p>
                        )}

                      {tiebreak.status ===
                        "resolved" &&
                        tiebreak.resolved_order && (
                          <p className="mt-2 text-xs text-zinc-500">
                            Final order:{" "}
                            {tiebreak.resolved_order
                              .map(
                                (profileId) =>
                                  playerName(
                                    profileMap.get(
                                      profileId
                                    )
                                  )
                              )
                              .join(
                                " > "
                              )}
                          </p>
                        )}

                      {isAdmin &&
                        tiebreak.status !==
                          "resolved" &&
                        openMatch && (
                          <div className="mt-3">
                            <p className="text-xs font-black text-cyan-200">
                              Deciding match: {playerName(
                                profileMap.get(
                                  openMatch.player_one_id
                                )
                              )}{" "}
                              vs{" "}
                              {playerName(
                                profileMap.get(
                                  openMatch.player_two_id
                                )
                              )}
                            </p>

                            <CompetitionMatchResultFormV2
                              matchId={
                                openMatch.id
                              }
                              competitionId={
                                competition.id
                              }
                              matchFormat={
                                openMatch.match_format
                              }
                              playerOneLabel={playerName(
                                profileMap.get(
                                  openMatch.player_one_id
                                )
                              )}
                              playerTwoLabel={playerName(
                                profileMap.get(
                                  openMatch.player_two_id
                                )
                              )}
                              mode="tiebreak"
                            />
                          </div>
                        )}

                      {isAdmin &&
                        tiebreak.status !==
                          "resolved" &&
                        !openMatch && (
                          <form
                            action={
                              startCompetitionTiebreak
                            }
                            className="mt-3"
                          >
                            <input
                              type="hidden"
                              name="tiebreak_id"
                              value={
                                tiebreak.id
                              }
                            />

                            <input
                              type="hidden"
                              name="competition_id"
                              value={
                                competition.id
                              }
                            />

                            <SubmitButton
                              pendingLabel="Starting..."
                              className="inline-flex items-center gap-2 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs font-black text-amber-200"
                            >
                              <Swords
                                size={13}
                              />

                              Start Deciding Match
                            </SubmitButton>
                          </form>
                        )}
                    </div>
                  );
                }
              )}
            </div>
          </section>
        )}

      {/* MATCHES - V1 (flat list, unchanged) */}

      {competition.status !==
        "draft" &&
        !isV2 && (
        <section className="mt-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-300">
                Competition Duels
              </p>

              <h2 className="mt-1 text-2xl font-black">
                Matches
              </h2>
            </div>

            <span className="text-xs font-black text-zinc-600">
              {
                completedMatches.length
              }{" "}
              completed ·{" "}
              {
                openMatches.length
              }{" "}
              open
            </span>
          </div>

          {matches.length ===
          0 ? (
            <div className="panel mt-4 p-6">
              <div className="flex items-start gap-3">
                <Swords
                  size={18}
                  className="mt-0.5 text-amber-300"
                />

                <div>
                  <p className="font-black">
                    No competition matches linked yet
                  </p>

                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    The competition exists, but we have not built automatic round-robin scheduling yet. That is the next step.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {matches.map(
                (match) => (
                  <Link
                    key={
                      match.id
                    }
                    href={`/matches/${match.id}`}
                    className="panel p-4 transition hover:border-amber-300/20"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-black">
                        {playerName(
                          profileMap.get(
                            match.player_one_id
                          )
                        )}{" "}
                        vs{" "}
                        {playerName(
                          profileMap.get(
                            match.player_two_id
                          )
                        )}
                      </p>

                      {match.status ===
                      "completed" ? (
                        <CheckCircle2
                          size={16}
                          className="text-emerald-300"
                        />
                      ) : (
                        <Clock3
                          size={16}
                          className="text-cyan-300"
                        />
                      )}
                    </div>
                  </Link>
                )
              )}
            </div>
          )}
        </section>
      )}

      {/* MATCHES - V2 (round-grouped, mobile-first cards, inline result entry) */}

      {isV2 &&
        competition.status !==
          "draft" &&
        (() => {
          const roundGroups = new Map<
            number,
            CompetitionMatch[]
          >();

          for (const match of matches) {
            // Tiebreak deciders (Track 3) have no round_number and
            // are rendered in their own panel below, not grouped in
            // with the regular round-robin schedule.
            if (match.tiebreak_id) {
              continue;
            }

            const roundKey =
              match.round_number ?? 0;

            const existing =
              roundGroups.get(roundKey) ?? [];

            existing.push(match);
            roundGroups.set(roundKey, existing);
          }

          const sortedRounds = Array.from(
            roundGroups.keys()
          ).sort((a, b) => a - b);

          const currentRoundNumber =
            competition.current_round;

          function matchLabel(
            match: CompetitionMatch
          ) {
            return `${playerName(
              profileMap.get(match.player_one_id)
            )} vs ${playerName(
              profileMap.get(match.player_two_id)
            )}`;
          }

          function MatchCard({
            match,
            allowCorrect,
          }: {
            match: CompetitionMatch;
            allowCorrect: boolean;
          }) {
            return (
              <div
                key={match.id}
                className="panel p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p
                    className="min-w-0 truncate font-black"
                    title={matchLabel(match)}
                  >
                    {matchLabel(match)}
                  </p>

                  {match.status === "completed" ? (
                    <CheckCircle2
                      size={16}
                      className="shrink-0 text-emerald-300"
                    />
                  ) : (
                    <Clock3
                      size={16}
                      className="shrink-0 text-cyan-300"
                    />
                  )}
                </div>

                {match.status === "completed" && (
                  <p className="mt-2 text-xs font-black text-zinc-400">
                    {match.match_format === "best_of_3"
                      ? `${match.player_one_duel_wins}-${match.player_two_duel_wins}`
                      : match.winner_id ===
                        match.player_one_id
                      ? `${playerName(
                          profileMap.get(match.player_one_id)
                        )} won`
                      : `${playerName(
                          profileMap.get(match.player_two_id)
                        )} won`}
                  </p>
                )}

                {isAdmin &&
                  match.status !== "completed" && (
                    <CompetitionMatchResultFormV2
                      matchId={match.id}
                      competitionId={competition.id}
                      matchFormat={match.match_format}
                      playerOneLabel={playerName(
                        profileMap.get(match.player_one_id)
                      )}
                      playerTwoLabel={playerName(
                        profileMap.get(match.player_two_id)
                      )}
                      mode="submit"
                    />
                  )}

                {isAdmin &&
                  allowCorrect &&
                  match.status === "completed" && (
                    <div className="mt-3">
                      <CompetitionMatchResultFormV2
                        matchId={match.id}
                        competitionId={competition.id}
                        matchFormat={match.match_format}
                        playerOneLabel={playerName(
                          profileMap.get(match.player_one_id)
                        )}
                        playerTwoLabel={playerName(
                          profileMap.get(match.player_two_id)
                        )}
                        mode="correct"
                      />
                    </div>
                  )}
              </div>
            );
          }

          return (
            <section className="mt-6 space-y-6">
              {sortedRounds.map((roundNumber) => {
                const roundMatches =
                  roundGroups.get(roundNumber) ?? [];

                const isCurrent =
                  roundNumber === currentRoundNumber;

                const isCompleted = roundMatches.every(
                  (match) => match.status === "completed"
                );

                const roundRewardCount =
                  roundRewardCountByRound.get(
                    roundNumber
                  ) ?? 0;

                return (
                  <div key={roundNumber}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-300">
                        {isCurrent
                          ? "Current Round"
                          : isCompleted
                          ? "Completed"
                          : "Upcoming"}
                      </p>

                      <span className="text-xs font-black text-zinc-600">
                        Round {roundNumber} of{" "}
                        {competition.total_rounds}
                      </span>

                      {isCompleted &&
                        roundRewardCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-black text-emerald-200">
                            <Gift size={10} />
                            Rewards granted
                          </span>
                        )}
                    </div>

                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      {roundMatches.map((match) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          allowCorrect={isCompleted}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })()}

      {/* FINAL RESULTS */}

      {competition.status ===
        "completed" && (
        <section className="panel mt-6 p-6">
          <div className="flex items-center gap-2">
            <Trophy
              size={20}
              className="text-amber-300"
            />

            <h2 className="text-2xl font-black">
              Final Results
            </h2>
          </div>

          <div className="mt-5 space-y-3">
            {finalResults.map(
              (result) => (
                <div
                  key={
                    result.profile_id
                  }
                  className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    {placementIcon(
                      result.placement
                    )}

                    <div>
                      <p className="font-black text-zinc-100">
                        {playerName(
                          profileMap.get(
                            result.profile_id
                          )
                        )}
                      </p>

                      <p className="mt-1 text-xs text-zinc-600">
                        {placementLabel(
                          result.placement
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <div className="flex gap-4 text-xs font-black">
                      <span className="text-emerald-200">
                        {
                          result.wins
                        }{" "}
                        W
                      </span>

                      <span className="text-zinc-400">
                        {
                          result.draws
                        }{" "}
                        D
                      </span>

                      <span className="text-red-200">
                        {
                          result.losses
                        }{" "}
                        L
                      </span>

                      <span className="text-amber-200">
                        {
                          result.points
                        }{" "}
                        PTS
                      </span>
                    </div>

                    {(() => {
                      const totals =
                        rewardTotalsByProfile.get(
                          result.profile_id
                        );

                      if (!totals) {
                        return null;
                      }

                      const voucherEntries = Array.from(
                        totals.vouchers.entries()
                      );

                      if (
                        totals.dpTotal === 0 &&
                        voucherEntries.length === 0
                      ) {
                        return null;
                      }

                      return (
                        <div className="flex flex-wrap items-center justify-end gap-1.5 text-[10px] font-bold">
                          {totals.dpTotal > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-amber-200">
                              <Coins size={10} />+
                              {totals.dpTotal} DP
                            </span>
                          )}

                          {voucherEntries.map(
                            ([voucherType, quantity]) => (
                              <span
                                key={voucherType}
                                className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-cyan-200"
                              >
                                <Ticket size={10} />
                                {quantity}×{" "}
                                {voucherLabel(
                                  voucherType
                                )}
                              </span>
                            )
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )
            )}
          </div>

          <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-zinc-600">
            Rewards shown reflect duel points and vouchers actually
            granted so far (placement + round rewards) - redeem
            vouchers from the Shop.
          </p>
        </section>
      )}

      {/* ADMIN COMPLETION */}

      {isAdmin &&
        (competition.competition_type ===
          "round_robin" ||
          isV2) &&
        competition.status ===
          "active" && (
          <section className="panel mt-6 p-6">
            <h2 className="font-black">
              Finish Competition
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Finalization freezes the standings. Every linked competition match must be completed first.
              {isV2 &&
                " Any full tie for placement also needs its deciding match(es) played first - finalizing will refuse otherwise."}
            </p>

            {isV2 && (
              <form
                action={
                  detectCompetitionTiebreaksV2
                }
                className="mt-4"
              >
                <input
                  type="hidden"
                  name="competition_id"
                  value={
                    competition.id
                  }
                />

                <SubmitButton
                  pendingLabel="Checking..."
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-black text-zinc-300"
                >
                  <Flame
                    size={13}
                  />

                  Check for Ties
                </SubmitButton>
              </form>
            )}

            <form
              action={
                isV2
                  ? finalizeCompetitionV2
                  : finalizeRoundRobinCompetition
              }
              className="mt-4"
            >
              <input
                type="hidden"
                name="competition_id"
                value={
                  competition.id
                }
              />

              <ConfirmSubmitButton
                confirmMessage="Finalize the competition? This freezes the standings."
                pendingLabel="Finalizing..."
                className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-2.5 text-sm font-black text-amber-200"
              >
                Finalize Competition
              </ConfirmSubmitButton>
            </form>
          </section>
        )}

      {/* REWARD DISTRIBUTION */}

      {/* FIXED (2026-08-27): this section used to disappear forever
          once rewards_distributed_at was set, even if the underlying
          RPC had granted nothing (empty competition_reward_rules -
          see distribute_competition_rewards_v2's own fix header in
          202608270930_competition_reward_and_match_dp_fixes.sql) -
          there was no way for an admin to ever retry. The RPC is
          idempotent (skips any profile that already has a 'granted'
          row), so it is always safe to show and re-run this, whether
          or not a previous attempt already ran. */}
      {isAdmin &&
        competition.status ===
          "completed" && (
          <section className="relative mt-6 overflow-hidden rounded-2xl border border-violet-300/20 bg-violet-300/[0.035] p-6">
            <Gift
              size={42}
              className="pointer-events-none absolute right-5 top-5 text-violet-200 opacity-[0.08]"
            />

            <h2 className="text-xl font-black text-violet-100">
              Championship Rewards
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              {competition.rewards_distributed_at
                ? "Distribute again to grant rewards to anyone who doesn't have one yet (e.g. after a result correction changed their placement). Anyone already rewarded is left untouched."
                : "Distribute the configured DP and pack vouchers. Safe to run more than once - already-rewarded players are never double-granted."}
            </p>

            <form
              action={
                isV2
                  ? distributeCompetitionRewardsV2
                  : distributeCompetitionRewards
              }
              className="mt-4"
            >
              <input
                type="hidden"
                name="competition_id"
                value={
                  competition.id
                }
              />

              <ConfirmSubmitButton
                confirmMessage="Distribute rewards now? Already-rewarded players are never double-granted."
                pendingLabel="Distributing..."
                className="primary-button inline-flex items-center gap-2"
              >
                <Gift
                  size={15}
                />

                {competition.rewards_distributed_at
                  ? "Distribute Remaining Rewards"
                  : "Distribute Rewards"}
              </ConfirmSubmitButton>
            </form>
          </section>
        )}

      {competition.rewards_distributed_at && (
        <section className="mt-6 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.035] p-5">
          <div className="flex items-center gap-3">
            <CheckCircle2
              size={18}
              className="text-emerald-300"
            />

            <div>
              <p className="font-black text-emerald-100">
                Rewards distributed
              </p>

              <p className="mt-1 text-xs text-zinc-600">
                DP and vouchers have been credited to the final standings. Check each player&apos;s duel point history for the exact amounts.
              </p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}