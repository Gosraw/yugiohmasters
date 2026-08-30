import type {
  requireUser,
} from "@/lib/supabase/queries";

import {
  profileName,
  type StatsProfile,
} from "@/lib/league-stats";

type SupabaseClient =
  Awaited<
    ReturnType<typeof requireUser>
  >["supabase"];

// =========================================================
// POST-MATCH SETTLEMENT SUMMARY
//
// After submit_competition_match_result_v2 / submit_competition_
// tiebreak_match_result run, they may (idempotently, exactly once)
// have also settled round rewards and/or auto-finalized + paid out
// the competition - see 202608301500_round_reward_settlement_and_
// auto_finalize.sql. The RPC itself returns void, so this module
// re-reads what actually happened afterward and shapes it into a
// single object the post-match UI can render ("MATCH COMPLETE" /
// "ROUND COMPLETE" / "COMPETITION COMPLETE"), without ever trusting
// the frontend to compute or invent a reward - every number here is
// read back from the tables the settlement functions themselves
// wrote to, scoped to rows created at/after `settledFrom` so a
// summary only ever shows what THIS call actually granted, not
// older history.
// =========================================================

// Shared voucher-type -> display-label map. Single source of truth
// so every place that shows a voucher (this module's consumers,
// plus the competition-completion reward breakdown) uses the same
// wording instead of re-declaring the map per component.
export const VOUCHER_LABEL: Record<string, string> = {
  normal_pack: "Standard Pack",
  premium_pack: "Premium Pack",
  deluxe_pack: "Deluxe Pack",
  special_pack: "Special Pack",
};

export function voucherLabel(voucherType: string) {
  return VOUCHER_LABEL[voucherType] ?? voucherType;
}

export type DpAward = {
  profileId: string;
  profileName: string;
  amount: number;
};

export type VoucherAward = {
  profileId: string;
  profileName: string;
  voucherType: string;
  voucherQuantity: number;
};

export type RoundRewardAward = {
  profileId: string;
  profileName: string;
  role: "participation" | "round_winner";
  duelPoints: number;
  voucherType: string | null;
  voucherQuantity: number;
};

export type CompetitionRewardAward = {
  profileId: string;
  profileName: string;
  placement: number;
  duelPoints: number;
  voucherType: string | null;
  voucherQuantity: number;
};

export type MatchSettlementSummary = {
  matchId: string;
  competitionId: string;
  competitionName: string;
  playerOneId: string;
  playerTwoId: string;
  playerOneName: string;
  playerTwoName: string;
  playerOneWins: number;
  playerTwoWins: number;
  winnerId: string | null;
  winnerName: string | null;
  matchDp: DpAward[];
  roundNumber: number | null;
  roundMatchesCompleted: number;
  roundMatchesTotal: number;
  roundJustCompleted: boolean;
  roundRewards: RoundRewardAward[];
  competitionJustCompleted: boolean;
  competitionRewards: CompetitionRewardAward[];
  championId: string | null;
  championName: string | null;
};

export async function buildMatchSettlementSummary(
  supabase: SupabaseClient,
  params: {
    matchId: string;
    competitionId: string;
    settledFrom: string;
  }
): Promise<MatchSettlementSummary> {
  const {
    matchId,
    competitionId,
    settledFrom,
  } = params;

  const [
    matchResult,
    competitionResult,
  ] = await Promise.all([
    supabase
      .from("matches")
      .select(
        "id,competition_id,player_one_id,player_two_id,winner_id,player_one_duel_wins,player_two_duel_wins,round_number"
      )
      .eq("id", matchId)
      .single(),
    supabase
      .from("competitions")
      .select("id,name,status")
      .eq("id", competitionId)
      .single(),
  ]);

  if (matchResult.error) {
    throw new Error(matchResult.error.message);
  }

  if (competitionResult.error) {
    throw new Error(competitionResult.error.message);
  }

  const match = matchResult.data as {
    id: string;
    competition_id: string;
    player_one_id: string;
    player_two_id: string;
    winner_id: string | null;
    player_one_duel_wins: number;
    player_two_duel_wins: number;
    round_number: number | null;
  };

  const competition = competitionResult.data as {
    id: string;
    name: string;
    status: string;
  };

  const roundNumber = match.round_number;

  const [
    profilesResult,
    matchDpResult,
    roundMatchesResult,
    roundGrantsResult,
    competitionGrantsResult,
    championResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,username,duelist_name,custom_title")
      .in("id", [match.player_one_id, match.player_two_id]),
    supabase
      .from("duel_point_transactions")
      .select("profile_id,amount,reason")
      .eq("match_id", matchId)
      .eq("reason", "match_reward"),
    roundNumber === null
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("matches")
          .select("id,status")
          .eq("competition_id", competitionId)
          .eq("round_number", roundNumber),
    roundNumber === null
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("competition_round_reward_grants")
          .select(
            "profile_id,reward_role,duel_points_granted,voucher_type,voucher_quantity,granted_at"
          )
          .eq("competition_id", competitionId)
          .eq("round_number", roundNumber)
          .eq("status", "granted")
          .gte("granted_at", settledFrom),
    supabase
      .from("competition_reward_grants")
      .select(
        "profile_id,placement,duel_points_granted,voucher_type,voucher_quantity,granted_at"
      )
      .eq("competition_id", competitionId)
      .eq("status", "granted")
      .gte("granted_at", settledFrom),
    supabase
      .from("competition_results")
      .select("profile_id,placement")
      .eq("competition_id", competitionId)
      .eq("placement", 1)
      .maybeSingle(),
  ]);

  if (profilesResult.error) {
    throw new Error(profilesResult.error.message);
  }

  const profiles = (profilesResult.data ?? []) as StatsProfile[];
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

  const nameFor = (profileId: string) =>
    profileName(profileMap.get(profileId));

  const matchDp: DpAward[] = (matchDpResult.data ?? []).map(
    (row: { profile_id: string; amount: number }) => ({
      profileId: row.profile_id,
      profileName: nameFor(row.profile_id),
      amount: row.amount,
    })
  );

  const roundMatches = (roundMatchesResult.data ?? []) as {
    id: string;
    status: string;
  }[];
  const roundMatchesTotal = roundMatches.length;
  const roundMatchesCompleted = roundMatches.filter(
    (m) => m.status === "completed"
  ).length;
  const roundJustCompleted =
    roundNumber !== null &&
    roundMatchesTotal > 0 &&
    roundMatchesCompleted === roundMatchesTotal;

  const roundRewards: RoundRewardAward[] = (roundGrantsResult.data ?? []).map(
    (row: {
      profile_id: string;
      reward_role: "participation" | "round_winner";
      duel_points_granted: number;
      voucher_type: string | null;
      voucher_quantity: number;
    }) => ({
      profileId: row.profile_id,
      profileName: nameFor(row.profile_id),
      role: row.reward_role,
      duelPoints: row.duel_points_granted,
      voucherType: row.voucher_type,
      voucherQuantity: row.voucher_quantity,
    })
  );

  const competitionRewards: CompetitionRewardAward[] = (
    competitionGrantsResult.data ?? []
  ).map(
    (row: {
      profile_id: string;
      placement: number;
      duel_points_granted: number;
      voucher_type: string | null;
      voucher_quantity: number;
    }) => ({
      profileId: row.profile_id,
      profileName: nameFor(row.profile_id),
      placement: row.placement,
      duelPoints: row.duel_points_granted,
      voucherType: row.voucher_type,
      voucherQuantity: row.voucher_quantity,
    })
  );

  const competitionJustCompleted =
    competition.status === "completed" && competitionRewards.length > 0;

  const championRow = championResult.data as {
    profile_id: string;
    placement: number;
  } | null;

  return {
    matchId: match.id,
    competitionId: competition.id,
    competitionName: competition.name,
    playerOneId: match.player_one_id,
    playerTwoId: match.player_two_id,
    playerOneName: nameFor(match.player_one_id),
    playerTwoName: nameFor(match.player_two_id),
    playerOneWins: match.player_one_duel_wins,
    playerTwoWins: match.player_two_duel_wins,
    winnerId: match.winner_id,
    winnerName: match.winner_id ? nameFor(match.winner_id) : null,
    matchDp,
    roundNumber,
    roundMatchesCompleted,
    roundMatchesTotal,
    roundJustCompleted,
    roundRewards,
    competitionJustCompleted,
    competitionRewards,
    championId: championRow?.profile_id ?? null,
    championName: championRow ? nameFor(championRow.profile_id) : null,
  };
}
