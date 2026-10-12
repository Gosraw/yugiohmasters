import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "./env";
import { onboardingRedirectPath } from "./onboarding-gate";
import { isMissingDetailPage } from "./missing-detail";
import {
  ONBOARDED_COOKIE,
  ONBOARDED_MAX_AGE,
  buildOnboardedCookieValue,
  getCurrentSeasonNumber,
} from "@/lib/onboarded-cookie";

// A redirect that keeps any auth cookies Supabase just refreshed.
function redirectWithCookies(
  request: NextRequest,
  response: NextResponse,
  target: string,
) {
  const [targetPathname, targetQuery] = target.split("?");
  const url = request.nextUrl.clone();
  url.pathname = targetPathname;
  url.search = targetQuery ? `?${targetQuery}` : "";

  const redirect = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));

  return redirect;
}

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
  // recomputed from the database until onboarding is complete (only
  // then is a short-lived "onboarded" cookie set, see below).
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

  const publicOnboardingPath =
    publicPath || pathname.startsWith("/api/") || pathname === "/league-full";

  // Normal "let the page render" exit. A full page load of a detail
  // page whose id doesn't exist gets the 404 page with a REAL 404
  // status here (see missing-detail.ts for why the page can't).
  const finish = async () => {
    if (
      data?.claims &&
      !publicOnboardingPath &&
      (await isMissingDetailPage(request, supabase, data.claims.sub as string))
    ) {
      const notFoundUrl = request.nextUrl.clone();
      notFoundUrl.pathname = "/__not-found";
      notFoundUrl.search = "";

      const notFound = NextResponse.rewrite(notFoundUrl, { status: 404 });
      response.cookies.getAll().forEach((cookie) => notFound.cookies.set(cookie));

      return notFound;
    }

    return response;
  };

  const onboardingExemptPath =
    pathname.startsWith("/boss") ||
    pathname.startsWith("/draft") ||
    pathname.startsWith("/profile");

  // AUDIT FIX (comprehensive Season 1 audit pass): league-membership
  // bootstrap used to live INSIDE the "!onboardingExemptPath" branch
  // below, which means it never ran at all for a request whose very
  // first hit landed on /boss*, /draft*, or /profile* (a bookmark, a
  // deep link, a prefetch, or simply the browser's very first request
  // after signup racing ahead of a redirect). Those three paths are
  // exactly the pages a mid-onboarding player is expected to be on,
  // so this was the actual reachable path to the observed "fresh
  // player has league_id = null" incident, not the theoretical
  // "private league already has 3 members" exception. Membership is
  // now ensured for EVERY authenticated, non-public, non-api request
  // regardless of which page it's for; only the stage-redirect
  // decision below still skips the exempt pages.
  if (data?.claims && !publicOnboardingPath) {
    const userId = data.claims.sub as string;

    // PERFORMANCE (2026-10-12): once a player is a league member and
    // fully onboarded, a short-lived cookie bound to their user id
    // skips the membership / welcome-pack / gate queries (~150 ms on
    // every request before). It only skips UX redirects - every
    // rule still lives in the database - and it expires after
    // ONBOARDED_MAX_AGE. Its value also carries the league id and
    // season number; (app)/layout.tsx clears it as soon as those no
    // longer match (season reset), so the gate re-runs right away.
    if (request.cookies.get(ONBOARDED_COOKIE)?.value?.startsWith(`${userId}:`)) {
      return finish();
    }

    const { data: membership } = await supabase
      .from("league_members")
      .select("league_id")
      .eq("profile_id", userId)
      .limit(1)
      .maybeSingle();

    let leagueId: string | null = membership?.league_id ?? null;

    if (!leagueId) {
      const { data: bootstrappedLeagueId, error: bootstrapError } = await supabase.rpc(
        "bootstrap_private_league",
      );

      // The private league holds 3 players. A 4th account (signup
      // checks capacity first, but e.g. a race or an older account)
      // gets one clear page instead of a half-rendered app.
      if (bootstrapError?.message?.includes("private league is full")) {
        return redirectWithCookies(request, response, "/league-full");
      }

      leagueId = (bootstrappedLeagueId as string | null) ?? null;
    }

    // Unknown bootstrap failure: render normally rather than
    // redirect-loop on a state this gate cannot resolve.
    if (!leagueId) {
      return finish();
    }

    // Welcome bonus vouchers - claim_welcome_packs() is idempotent
    // (a claims table is the guard). It now runs only while the
    // onboarded cookie is missing (at most once per
    // ONBOARDED_MAX_AGE), not on every request. Errors are ignored:
    // a hiccup here must never block a page.
    await supabase.rpc("claim_welcome_packs");

    const gatePath = await onboardingRedirectPath(supabase, userId);

    if (gatePath) {
      if (!onboardingExemptPath) {
        return redirectWithCookies(request, response, gatePath);
      }

      return finish();
    }

    const seasonNumber = await getCurrentSeasonNumber(supabase);

    response.cookies.set(ONBOARDED_COOKIE, buildOnboardedCookieValue(userId, leagueId, seasonNumber), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ONBOARDED_MAX_AGE,
    });
  }

  return finish();
}
