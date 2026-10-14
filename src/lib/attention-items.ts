import type {
  requireUser,
} from "@/lib/supabase/queries";

import {
  describeProposal,
  loadProposalsWaitingOn,
  proposalHref,
  proposalKindLabel,
} from "@/lib/match-proposals";

// =========================================================
// ATTENTION CENTER
//
// One shared, reusable place that answers: "is there anything
// in the league waiting on ME right now?" Used by the Home
// dashboard's "Needs Your Attention" panel, the dedicated
// /attention page, and the bottom nav badge - so all three
// always agree with each other.
// =========================================================

type SupabaseClient =
  Awaited<
    ReturnType<typeof requireUser>
  >["supabase"];

export type AttentionItem = {
  id: string;
  href: string;
  label: string;
  hint: string;
  kind:
    | "challenge"
    | "confirm"
    | "trade"
    | "vote"
    | "dispute"
    | "proposal"
    | "finalize";
};

type AttentionMatch = {
  id: string;
  status: string;
  player_one_id: string;
  player_two_id: string;
  result_submitted_by: string | null;
  // Optional so callers that don't select it keep compiling; when
  // present, scheduled season duels are not "challenges" (they're
  // played from the round screen, not accepted one by one), but a
  // season result the opponent sent still needs MY confirmation
  // (202610121800_season_result_confirmation).
  competition_id?: string | null;
};

type AttentionTrade = {
  id: string;
  status: string;
  sender_id: string;
  receiver_id: string;
};

/**
 * Pure version for pages that already fetched their own matches
 * and trades (e.g. Home) - avoids a second round-trip query.
 */
export function computeAttentionItems(
  matches: AttentionMatch[],
  trades: AttentionTrade[],
  userId: string,
  // Optional profile id -> display name, so a hint can name the
  // opponent ("Samo sent a result") instead of "Your opponent".
  names?: Map<string, string>
): AttentionItem[] {
  const items: AttentionItem[] = [];

  const opponentName = (
    match: AttentionMatch
  ) =>
    names?.get(
      match.player_one_id === userId
        ? match.player_two_id
        : match.player_one_id
    ) ?? "Your opponent";

  for (const match of matches) {
    if (match.competition_id) {
      if (
        match.status === "result_submitted" &&
        match.result_submitted_by !== userId
      ) {
        items.push({
          id: `match-confirm-${match.id}`,
          href: `/competitions/${match.competition_id}/round`,
          label: "Confirm your season duel result",
          hint: `${opponentName(match)} sent a result - confirm or dispute it.`,
          kind: "confirm",
        });
      }

      // A disputed season duel blocks its round. The players can
      // settle it themselves (one sends the right winner, the other
      // confirms); a league admin who is NOT in the duel can also
      // decide. An admin can never referee their own duel, so this
      // is the only nudge they get for it.
      if (match.status === "disputed") {
        items.push({
          id: `match-disputed-${match.id}`,
          href: `/competitions/${match.competition_id}/round`,
          label: "Season duel disputed",
          hint: "Agree on the winner: tap it again and let your opponent confirm.",
          kind: "dispute",
        });
      }

      continue;
    }

    if (match.status === "pending" && match.player_two_id === userId) {
      items.push({
        id: `match-accept-${match.id}`,
        href: `/matches/${match.id}`,
        label: "Duel challenge waiting",
        hint: `${opponentName(match)} challenged you - accept or decline it.`,
        kind: "challenge",
      });
    }

    if (
      match.status === "result_submitted" &&
      match.result_submitted_by !== userId
    ) {
      items.push({
        id: `match-confirm-${match.id}`,
        href: `/matches/${match.id}`,
        label: "Duel result to confirm",
        hint: `${opponentName(match)} sent a result - check it and confirm or dispute.`,
        kind: "confirm",
      });
    }
  }

  for (const trade of trades) {
    if (trade.status === "pending" && trade.receiver_id === userId) {
      items.push({
        id: `trade-${trade.id}`,
        href: `/trades/${trade.id}`,
        label: "Trade offer waiting",
        hint: "Review and respond.",
        kind: "trade",
      });
    }
  }

  return items;
}

/**
 * Fetching version for places that don't already have matches
 * and trades loaded (the bottom nav badge, the /attention page).
 */
export async function getAttentionItems(
  supabase: SupabaseClient,
  userId: string,
  leagueId: string | null
): Promise<AttentionItem[]> {
  if (!leagueId) return [];

  const [{ data: matchData }, { data: tradeData }] = await Promise.all([
    supabase
      .from("matches")
      .select("id,status,player_one_id,player_two_id,result_submitted_by,competition_id")
      .eq("league_id", leagueId)
      .in("status", ["pending", "result_submitted", "disputed"])
      .or(`player_one_id.eq.${userId},player_two_id.eq.${userId}`),
    supabase
      .from("trades")
      .select("id,status,sender_id,receiver_id")
      .eq("league_id", leagueId)
      .eq("status", "pending")
      .eq("receiver_id", userId),
  ]);

  const [pendingVotes, leagueItems, names] = await Promise.all([
    getPendingCardVoteCount(supabase, userId, leagueId),
    getLeagueAttentionItems(supabase, userId, leagueId),
    getLeagueNames(supabase, leagueId),
  ]);

  const items = computeAttentionItems(
    (matchData ?? []) as AttentionMatch[],
    (tradeData ?? []) as AttentionTrade[],
    userId,
    names
  );

  const voteItem = cardVoteAttentionItem(pendingVotes);

  return [
    ...leagueItems,
    ...items,
    ...(voteItem ? [voteItem] : []),
  ];
}

// =========================================================
// LEAGUE NAMES
//
// Display names of every league member (a private league has a
// handful), for hints that name the other player. Never throws.
// =========================================================

export async function getLeagueNames(
  supabase: SupabaseClient,
  leagueId: string | null
): Promise<Map<string, string>> {
  if (!leagueId) return new Map();

  const { data: memberData, error: memberError } = await supabase
    .from("league_members")
    .select("profile_id")
    .eq("league_id", leagueId);

  if (memberError || !memberData || memberData.length === 0) {
    return new Map();
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id,duelist_name,username")
    .in(
      "id",
      (memberData as { profile_id: string }[]).map((row) => row.profile_id)
    );

  return new Map(
    ((profileData ?? []) as {
      id: string;
      duelist_name: string | null;
      username: string | null;
    }[]).map((profile) => [
      profile.id,
      profile.duelist_name ?? profile.username ?? "Duelist",
    ])
  );
}

// =========================================================
// LEAGUE-WIDE ITEMS
//
// Everything that is not "my own open duel / trade": disputed duels
// an admin has to decide, a season that is ready to finalize (admin),
// and result changes an admin proposed for a duel they play in that
// wait for MY answer (202610152010). Shared by Home, /attention and
// the nav badge.
// =========================================================

export async function getLeagueAttentionItems(
  supabase: SupabaseClient,
  userId: string,
  leagueId: string | null
): Promise<AttentionItem[]> {
  if (!leagueId) return [];

  const [disputeItems, finalizeItems, proposalItems] = await Promise.all([
    getDisputedDuelAttentionItems(supabase, userId, leagueId),
    getSeasonFinalizeAttentionItems(supabase, userId, leagueId),
    getProposalAttentionItems(supabase, userId, leagueId),
  ]);

  return [
    ...proposalItems,
    ...disputeItems,
    ...finalizeItems,
  ];
}

// =========================================================
// RESULT PROPOSALS WAITING FOR MY ANSWER (202610152010)
// =========================================================

export async function getProposalAttentionItems(
  supabase: SupabaseClient,
  userId: string,
  leagueId: string | null
): Promise<AttentionItem[]> {
  if (!leagueId) return [];

  const proposals = await loadProposalsWaitingOn(supabase, userId, leagueId);

  if (proposals.length === 0) return [];

  const names = await getLeagueNames(supabase, leagueId);
  const nameOf = (id: string) => names.get(id) ?? "Duelist";

  return proposals.map((proposal) => ({
    id: `match-proposal-${proposal.id}`,
    href: proposalHref(proposal),
    label: `${proposalKindLabel(proposal.kind)} to accept`,
    hint: `${nameOf(proposal.proposed_by)} wants to change your duel: ${describeProposal(
      proposal,
      nameOf
    )}. Accept or reject it.`,
    kind: "proposal",
  }));
}

// =========================================================
// SEASON READY TO FINALIZE (league admins only)
//
// finalize_competition_v2 needs a league admin. When a non-admin
// confirms the last duel, the automatic finalize quietly waits - so
// the admin gets a nudge with a link to the Finalize button. Never
// throws.
// =========================================================

export async function getSeasonFinalizeAttentionItems(
  supabase: SupabaseClient,
  userId: string,
  leagueId: string | null
): Promise<AttentionItem[]> {
  if (!leagueId) return [];

  const { data: membership, error: membershipError } = await supabase
    .from("league_members")
    .select("role")
    .eq("league_id", leagueId)
    .eq("profile_id", userId)
    .maybeSingle();

  if (membershipError || membership?.role !== "admin") return [];

  const { data: competitions, error } = await supabase
    .from("competitions")
    .select("id,name,is_season")
    .eq("league_id", leagueId)
    .eq("status", "active")
    .not("meetings_per_pairing", "is", null)
    .limit(5);

  if (error || !competitions || competitions.length === 0) return [];

  const items: AttentionItem[] = [];

  for (const competition of competitions as {
    id: string;
    name: string;
    is_season: boolean | null;
  }[]) {
    const [{ count: openCount }, { count: totalCount }] = await Promise.all([
      supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("competition_id", competition.id)
        .neq("status", "completed"),
      supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("competition_id", competition.id),
    ]);

    if ((totalCount ?? 0) > 0 && (openCount ?? 1) === 0) {
      items.push({
        id: `season-finalize-${competition.id}`,
        href: `/competitions/${competition.id}#finalize`,
        label: competition.is_season
          ? "Season ready to finalize"
          : "Competition ready to finalize",
        hint: `Every duel of ${competition.name} has a result. Finalize it to hand out the final rewards.`,
        kind: "finalize",
      });
    }
  }

  return items;
}

// =========================================================
// DISPUTED DUELS (league admins only)
//
// A disputed duel stays stuck until a league admin picks the right
// result, so every admin sees each disputed duel in the league as
// "waiting on you". Never throws: a failed read just shows nothing.
// =========================================================

export async function getDisputedDuelAttentionItems(
  supabase: SupabaseClient,
  userId: string,
  leagueId: string | null
): Promise<AttentionItem[]> {
  if (!leagueId) return [];

  const { data: membership, error: membershipError } = await supabase
    .from("league_members")
    .select("role")
    .eq("league_id", leagueId)
    .eq("profile_id", userId)
    .maybeSingle();

  if (membershipError || membership?.role !== "admin") return [];

  const { data, error } = await supabase
    .from("matches")
    .select("id,player_one_id,player_two_id,competition_id")
    .eq("league_id", leagueId)
    .eq("status", "disputed")
    .order("disputed_at", { ascending: true })
    .limit(20);

  if (error || !data || data.length === 0) return [];

  // An admin who plays in a disputed SEASON duel is not its referee
  // (202610121800_season_result_confirmation): their own "Season
  // duel disputed" item comes from computeAttentionItems instead.
  const rows = (data as {
    id: string;
    player_one_id: string;
    player_two_id: string;
    competition_id: string | null;
  }[]).filter(
    (row) =>
      !row.competition_id ||
      (row.player_one_id !== userId && row.player_two_id !== userId)
  );

  if (rows.length === 0) return [];

  const ids = [
    ...new Set(rows.flatMap((row) => [row.player_one_id, row.player_two_id])),
  ];

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id,duelist_name,username")
    .in("id", ids);

  const names = new Map(
    ((profileData ?? []) as {
      id: string;
      duelist_name: string | null;
      username: string | null;
    }[]).map((profile) => [
      profile.id,
      profile.duelist_name ?? profile.username ?? "Duelist",
    ])
  );

  return rows.map((row) => ({
    id: `match-dispute-${row.id}`,
    // A season duel is decided on its round screen (the referee's
    // winner buttons); a practice duel on its own match page.
    href: row.competition_id
      ? `/competitions/${row.competition_id}/round`
      : `/matches/${row.id}`,
    label: "Duel disputed — needs a decision",
    hint: `${names.get(row.player_one_id) ?? "Duelist"} vs ${
      names.get(row.player_two_id) ?? "Duelist"
    }: open it and pick the right result.`,
    kind: "dispute",
  }));
}

// =========================================================
// CARD VOTE (2.0 card pool vote, /vote)
//
// "Cards still waiting for your vote" = the league's vote items
// minus the ones you already voted on. Never throws: if the vote
// tables are missing or a read fails, the vote just doesn't show
// up as waiting.
// =========================================================

export async function getPendingCardVoteCount(
  supabase: SupabaseClient,
  userId: string,
  leagueId: string | null
): Promise<number> {
  if (!leagueId) return 0;

  const [items, mine] = await Promise.all([
    supabase
      .from("card_vote_items")
      .select("id", { count: "exact", head: true })
      .eq("league_id", leagueId),
    supabase
      .from("card_votes")
      .select("item_id,card_vote_items!inner(league_id)", {
        count: "exact",
        head: true,
      })
      .eq("profile_id", userId)
      .eq("card_vote_items.league_id", leagueId),
  ]);

  if (items.error || mine.error) return 0;

  return Math.max(0, (items.count ?? 0) - (mine.count ?? 0));
}

export function cardVoteAttentionItem(
  pendingVotes: number
): AttentionItem | null {
  if (pendingVotes <= 0) return null;

  return {
    id: "card-vote",
    href: "/vote",
    label: "Card vote waiting",
    hint: `${pendingVotes} card${pendingVotes === 1 ? "" : "s"} still need your vote.`,
    kind: "vote",
  };
}
