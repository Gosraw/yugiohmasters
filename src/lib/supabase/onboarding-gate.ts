import type { SupabaseClient } from "@supabase/supabase-js";

// Where a signed-in player still has to go before the normal app:
// Boss Path select (route slot 1) first, then the Initial Draft.
// null = onboarding done. Shared by the proxy (every request) and
// the login/signup actions: a Server Action redirect renders its
// target page in the same response without running the proxy, so
// the actions must pick the right first page themselves.
export async function onboardingRedirectPath(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: bossPath } = await supabase
    .from("player_boss_paths")
    .select("id")
    .eq("profile_id", userId)
    .eq("route_slot", 1)
    .limit(1)
    .maybeSingle();

  if (!bossPath) {
    return "/boss/select?slot=1";
  }

  const { data: completedDraft } = await supabase
    .from("draft_players")
    .select("id")
    .eq("profile_id", userId)
    .eq("status", "completed")
    .limit(1)
    .maybeSingle();

  if (!completedDraft) {
    return "/draft";
  }

  return null;
}
