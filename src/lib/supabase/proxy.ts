import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "./env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = getSupabasePublicEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, responseHeaders) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(responseHeaders).forEach(([header, value]) => response.headers.set(header, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const pathname = request.nextUrl.pathname;
  const publicPath =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/auth/") ||
    pathname === "/offline";

  if (!data?.claims && !publicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (data?.claims && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // =========================================================
  // MANDATORY SEASON 1 ONBOARDING GATE (Season 1 launch-flow item 3/4)
  //
  // Runs on every authenticated request (this proxy already covers
  // the whole app per its matcher below) so it is a persistent,
  // DB-state-driven gate rather than a one-time client redirect: a
  // player who closes the browser mid-onboarding and logs back in
  // lands back on exactly the right step, because the state is
  // recomputed from the database on every request, never cached
  // client-side.
  //
  // Required order (per the launch-flow spec): pick a Boss Route
  // (public.player_boss_paths, via the existing choose_boss_path RPC
  // on /boss/select) before the Initial Draft (public.draft_players,
  // via the existing draft system reachable at /draft) before normal
  // league pages. /profile stays reachable throughout (logout lives
  // there and is explicitly allowed to remain available); /api/*
  // routes are never redirected since a redirect response would
  // break a fetch() call rather than send a player anywhere.
  //
  // League membership is a silent prerequisite of choose_boss_path
  // (it raises 'Current user is not a league member' without one)
  // that nothing currently creates except a page-load side effect of
  // the OLD cosmetic /onboarding flow (bootstrap_private_league()).
  // This gate calls that same existing, idempotent, advisory-locked
  // RPC directly so a brand new player reaches Boss Path selection
  // without ever needing to visit that unrelated page.
  // =========================================================

  const publicOnboardingPath = publicPath || pathname.startsWith("/api/");

  const onboardingExemptPath =
    pathname.startsWith("/boss") ||
    pathname.startsWith("/draft") ||
    pathname.startsWith("/profile");

  if (data?.claims && !publicOnboardingPath && !onboardingExemptPath) {
    const userId = data.claims.sub as string;

    const { data: membership } = await supabase
      .from("league_members")
      .select("league_id")
      .eq("profile_id", userId)
      .limit(1)
      .maybeSingle();

    let leagueId: string | null = membership?.league_id ?? null;

    if (!leagueId) {
      const { data: bootstrappedLeagueId } = await supabase.rpc(
        "bootstrap_private_league",
      );
      leagueId = (bootstrappedLeagueId as string | null) ?? null;
    }

    // If league bootstrap itself failed (e.g. the private league is
    // already full at 3 members), fall through and let the page
    // render normally rather than redirect-looping on a state this
    // gate cannot resolve.
    if (leagueId) {
      const { data: bossPath } = await supabase
        .from("player_boss_paths")
        .select("id")
        .eq("profile_id", userId)
        .eq("route_slot", 1)
        .limit(1)
        .maybeSingle();

      if (!bossPath) {
        const url = request.nextUrl.clone();
        url.pathname = "/boss/select";
        url.searchParams.set("slot", "1");
        return NextResponse.redirect(url);
      }

      const { data: completedDraft } = await supabase
        .from("draft_players")
        .select("id")
        .eq("profile_id", userId)
        .eq("status", "completed")
        .limit(1)
        .maybeSingle();

      if (!completedDraft) {
        const url = request.nextUrl.clone();
        url.pathname = "/draft";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}
