import type {
  requireUser,
} from "@/lib/supabase/queries";

import type {
  VoteValue,
} from "@/components/vote-labels";

// =========================================================
// CARD VOTE - data loading for /vote and /vote/results.
//
// Supabase returns at most 1,000 rows per request, so every list
// read here pages through with .range() (the vote has ~400
// items today, but the 1000-row cap already bit this app once).
// =========================================================

type SupabaseClient =
  Awaited<
    ReturnType<typeof requireUser>
  >["supabase"];

const PAGE = 1000;

export type VoteItemRow = {
  id: string;
  list_key: string;
  list_title: string;
  list_order: number;
  sort_order: number;
  proposed_verdict: string;
  context: string;
  card: {
    name: string;
    image_url: string | null;
    image_url_small: string | null;
    card_type: string | null;
  } | null;
};

export async function loadVoteItems(
  supabase: SupabaseClient,
  leagueId: string
): Promise<VoteItemRow[]> {
  const rows: VoteItemRow[] = [];

  for (let from = 0; ; from += PAGE) {
    const {
      data,
      error,
    } = await supabase
      .from("card_vote_items")
      .select(
        "id,list_key,list_title,list_order,sort_order,proposed_verdict,context,card:card_catalog(name,image_url,image_url_small,card_type)"
      )
      .eq("league_id", leagueId)
      .order("list_order")
      .order("sort_order")
      .range(from, from + PAGE - 1);

    if (error) {
      throw new Error(error.message);
    }

    rows.push(
      ...((data ?? []) as unknown as VoteItemRow[])
    );

    if (!data || data.length < PAGE) {
      return rows;
    }
  }
}

export async function loadMyVotes(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<string, VoteValue>> {
  const votes: Record<string, VoteValue> = {};

  for (let from = 0; ; from += PAGE) {
    const {
      data,
      error,
    } = await supabase
      .from("card_votes")
      .select("item_id,vote")
      .eq("profile_id", userId)
      .order("item_id")
      .range(from, from + PAGE - 1);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of data ?? []) {
      votes[row.item_id as string] =
        row.vote as VoteValue;
    }

    if (!data || data.length < PAGE) {
      return votes;
    }
  }
}

export type VoteResultRow = {
  item_id: string;
  list_key: string;
  list_title: string;
  list_order: number;
  sort_order: number;
  card_catalog_id: string;
  proposed_verdict: string;
  agree_count: number;
  too_strong_count: number;
  too_weak_count: number;
  total_votes: number;
  member_count: number;
  my_vote: VoteValue | null;
  tiebreak_vote: VoteValue | null;
  outcome: VoteValue | null;
  decided_by:
    | "no_votes"
    | "majority"
    | "owner_tiebreak"
    | "owner_vote"
    | "tied";
  resolved_verdict: string | null;
};

export async function loadVoteResults(
  supabase: SupabaseClient,
  leagueId: string
): Promise<VoteResultRow[]> {
  const rows: VoteResultRow[] = [];

  for (let from = 0; ; from += PAGE) {
    const {
      data,
      error,
    } = await supabase
      .rpc(
        "get_vote_results",
        {
          target_league: leagueId,
        }
      )
      .range(from, from + PAGE - 1);

    if (error) {
      throw new Error(error.message);
    }

    rows.push(
      ...((data ?? []) as VoteResultRow[])
    );

    if (!data || data.length < PAGE) {
      return rows;
    }
  }
}
