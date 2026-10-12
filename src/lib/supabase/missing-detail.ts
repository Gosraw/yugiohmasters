import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

// =========================================================
// REAL 404 STATUS FOR MISSING DETAIL PAGES
//
// Detail pages (/trades/<id>, /matches/<id>, ...) call notFound()
// for an id that doesn't exist, but (app)/loading.tsx makes every
// page stream, and a streamed response has already committed to
// HTTP 200 (see node_modules/next/dist/docs, loading.md "Status
// codes"). So the proxy checks these few routes BEFORE streaming
// starts - only for full page loads (typed URL, refresh, shared
// link), never for in-app taps or prefetches, so normal navigation
// costs nothing extra. Row visibility uses the player's own session
// (RLS), so "can't see it" = "doesn't exist" exactly like the page.
// =========================================================

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DetailCheck = {
  table: string;
  column: string;
  ownerColumn?: string;
  // The page refuses the player's own id (no rivalry with yourself).
  notSelf?: boolean;
};

// pattern -> check; reserved sub-routes (new, binder, select, ...)
// are excluded by the patterns themselves.
const DETAIL_ROUTES: [RegExp, DetailCheck][] = [
  [/^\/trades\/binder\/([^/]+)$/, { table: "league_members", column: "profile_id" }],
  [/^\/trades\/(?!new$|binder$)([^/]+)$/, { table: "trades", column: "id" }],
  [/^\/matches\/(?!new$)([^/]+)$/, { table: "matches", column: "id" }],
  [/^\/decks\/(?!new$)([^/]+)$/, { table: "decks", column: "id", ownerColumn: "owner_id" }],
  [/^\/cards\/(?!collection$|legacy$)([^/]+)$/, { table: "card_catalog", column: "id" }],
  [/^\/competitions\/([^/]+)$/, { table: "competitions", column: "id" }],
  [/^\/boss\/(?!select$)([^/]+)$/, { table: "player_boss_paths", column: "id" }],
  [/^\/rivalries\/([^/]+)$/, { table: "league_members", column: "profile_id", notSelf: true }],
];

function isDocumentRequest(request: NextRequest) {
  return (
    request.method === "GET" &&
    !request.headers.has("rsc") &&
    !request.headers.has("next-action") &&
    (request.headers.get("sec-fetch-dest") === "document" ||
      (request.headers.get("accept") ?? "").includes("text/html"))
  );
}

// true = this page load is for a detail id that certainly doesn't
// exist (for this player). Any lookup error -> false (let the page
// decide), so a DB hiccup never turns into a wrong 404.
export async function isMissingDetailPage(
  request: NextRequest,
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  if (!isDocumentRequest(request)) {
    return false;
  }

  const pathname = request.nextUrl.pathname;

  for (const [pattern, check] of DETAIL_ROUTES) {
    const match = pattern.exec(pathname);

    if (!match) {
      continue;
    }

    let id: string;

    try {
      id = decodeURIComponent(match[1]);
    } catch {
      return true;
    }

    if (!UUID_RE.test(id) || (check.notSelf && id === userId)) {
      return true;
    }

    let query = supabase
      .from(check.table)
      .select(check.column)
      .eq(check.column, id);

    if (check.ownerColumn) {
      query = query.eq(check.ownerColumn, userId);
    }

    const { data, error } = await query.limit(1);

    if (error) {
      return false;
    }

    return (data ?? []).length === 0;
  }

  return false;
}
