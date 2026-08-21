import type {
  requireUser,
} from "@/lib/supabase/queries";

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
  kind: "challenge" | "confirm" | "trade";
};

type AttentionMatch = {
  id: string;
  status: string;
  player_one_id: string;
  player_two_id: string;
  result_submitted_by: string | null;
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
  userId: string
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const match of matches) {
    if (match.status === "pending" && match.player_two_id === userId) {
      items.push({
        id: `match-accept-${match.id}`,
        href: `/matches/${match.id}`,
        label: "Duel challenge waiting",
        hint: "Accept or decline it.",
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
        hint: "Check it and confirm or dispute.",
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
      .select("id,status,player_one_id,player_two_id,result_submitted_by")
      .eq("league_id", leagueId)
      .or(`player_one_id.eq.${userId},player_two_id.eq.${userId}`),
    supabase
      .from("trades")
      .select("id,status,sender_id,receiver_id")
      .eq("league_id", leagueId)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`),
  ]);

  return computeAttentionItems(
    (matchData ?? []) as AttentionMatch[],
    (tradeData ?? []) as AttentionTrade[],
    userId
  );
}
