"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  getLeagueIdForUser,
} from "@/lib/league-stats";

import {
  getOrRefreshDashboardCoachInsights,
} from "@/lib/ai/dashboard-coach";

// =========================================================
// DASHBOARD COACH - explicit refresh action
//
// The ONLY way a player can force a Dashboard Coach recompute
// outside of an actual fingerprint change - a plain server action,
// no AI call (getOrRefreshDashboardCoachInsights never calls an AI
// provider, see dashboard-coach.ts), just re-runs the same
// deterministic analysis and re-caches it. auth.uid() (via
// requireUser()) determines whose insights are refreshed - the
// client can never pass a profile_id to affect another player's
// cached row, and RLS on dashboard_coach_insights would reject a
// write for any other profile_id regardless.
// =========================================================

export async function refreshDashboardCoach(): Promise<void> {
  const {
    supabase,
    userId,
  } = await requireUser();

  const leagueId = await getLeagueIdForUser(supabase, userId);
  if (!leagueId) {
    return;
  }

  const { data: deckData } = await supabase
    .from("decks")
    .select("id")
    .eq("league_id", leagueId)
    .eq("owner_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  await getOrRefreshDashboardCoachInsights(
    supabase,
    userId,
    leagueId,
    deckData?.id ?? null,
    true
  );

  revalidatePath("/");
}
