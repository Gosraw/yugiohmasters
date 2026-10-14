import type {
  requireUser,
} from "@/lib/supabase/queries";

// =========================================================
// RESULT PROPOSALS (202610152010)
//
// A league admin who PLAYS in a duel cannot overrule it. Their
// correction (season duel), tiebreak result or dispute resolution
// (practice duel) is stored in public.match_result_proposals and only
// counts once the opponent (respond_by) accepts it. This file reads
// the open ones and turns them into plain words; the panel that
// shows them is src/components/match-proposal-panel.tsx.
// =========================================================

type SupabaseClient =
  Awaited<
    ReturnType<typeof requireUser>
  >["supabase"];

export type ProposalKind =
  | "competition_correction"
  | "tiebreak_result"
  | "practice_resolution";

export type OpenProposal = {
  id: string;
  match_id: string;
  competition_id: string | null;
  kind: ProposalKind;
  proposed_by: string;
  respond_by: string;
  player_one_duel_wins: number | null;
  player_two_duel_wins: number | null;
  proposed_result:
    | "player_one_win"
    | "player_two_win"
    | "draw"
    | null;
  reason: string | null;
  created_at: string;
  match: {
    player_one_id: string;
    player_two_id: string;
    match_format: string | null;
  } | null;
};

const PROPOSAL_SELECT =
  "id,match_id,competition_id,kind,proposed_by,respond_by,player_one_duel_wins,player_two_duel_wins,proposed_result,reason,created_at,match:matches(player_one_id,player_two_id,match_format)";

function normalize(
  rows: unknown
): OpenProposal[] {
  return ((rows ?? []) as (Omit<OpenProposal, "match"> & {
    match:
      | OpenProposal["match"]
      | OpenProposal["match"][];
  })[]).map(
    (row) => ({
      ...row,
      match: Array.isArray(row.match)
        ? row.match[0] ?? null
        : row.match,
    })
  );
}

/**
 * Open (pending) proposals for one competition or one duel. Never
 * throws: a failed read just shows nothing.
 */
export async function loadOpenProposals(
  supabase: SupabaseClient,
  filter:
    | { competitionId: string }
    | { matchId: string }
): Promise<OpenProposal[]> {
  let query = supabase
    .from("match_result_proposals")
    .select(PROPOSAL_SELECT)
    .eq(
      "status",
      "pending"
    );

  query =
    "competitionId" in filter
      ? query.eq(
          "competition_id",
          filter.competitionId
        )
      : query.eq(
          "match_id",
          filter.matchId
        );

  const {
    data,
    error,
  } = await query
    .order(
      "created_at",
      {
        ascending: true,
      }
    )
    .limit(20);

  if (error) {
    return [];
  }

  return normalize(
    data
  );
}

/**
 * Proposals waiting for THIS player's answer, league-wide.
 */
export async function loadProposalsWaitingOn(
  supabase: SupabaseClient,
  userId: string,
  leagueId: string
): Promise<OpenProposal[]> {
  const {
    data,
    error,
  } = await supabase
    .from("match_result_proposals")
    .select(PROPOSAL_SELECT)
    .eq(
      "league_id",
      leagueId
    )
    .eq(
      "respond_by",
      userId
    )
    .eq(
      "status",
      "pending"
    )
    .order(
      "created_at",
      {
        ascending: true,
      }
    )
    .limit(20);

  if (error) {
    return [];
  }

  return normalize(
    data
  );
}

export function proposalKindLabel(
  kind: ProposalKind
) {
  switch (kind) {
    case "competition_correction":
      return "Result correction";
    case "tiebreak_result":
      return "Tiebreak result";
    default:
      return "Dispute decision";
  }
}

/**
 * "Samo won 2-1", "Draw", ... - what the proposal would set.
 */
export function describeProposal(
  proposal: OpenProposal,
  nameOf: (profileId: string) => string
) {
  const match =
    proposal.match;

  if (!match) {
    return "a new result";
  }

  if (proposal.kind === "practice_resolution") {
    if (proposal.proposed_result === "draw") {
      return "a draw";
    }

    return `${nameOf(
      proposal.proposed_result === "player_one_win"
        ? match.player_one_id
        : match.player_two_id
    )} won`;
  }

  const one =
    proposal.player_one_duel_wins ?? 0;

  const two =
    proposal.player_two_duel_wins ?? 0;

  const winner =
    one > two
      ? match.player_one_id
      : match.player_two_id;

  const score =
    match.match_format === "best_of_3"
      ? ` ${Math.max(one, two)}-${Math.min(one, two)}`
      : "";

  return `${nameOf(
    winner
  )} won${score}`;
}

/**
 * Where the opponent answers it: the round screen for a season
 * duel (it lists the competition's open proposals), else the duel.
 */
export function proposalHref(
  proposal: Pick<OpenProposal, "competition_id" | "match_id">
) {
  return proposal.competition_id
    ? `/competitions/${proposal.competition_id}/round`
    : `/matches/${proposal.match_id}`;
}
