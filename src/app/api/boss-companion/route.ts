import {
  NextResponse,
} from "next/server";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  buildBossContext,
} from "@/lib/ai/boss-context";

import {
  askBossCompanion,
  isRateLimited,
} from "@/lib/ai/boss-companion";

export const dynamic =
  "force-dynamic";

// =========================================================
// POST /api/boss-companion
//
// Body: { question: string }
//
// Auth is required (requireUser() redirects unauthenticated
// requests - for an API route that means it throws, which
// Next.js turns into a redirect response; a browser fetch()
// from a signed-in session never hits that path). The player
// can only ever get answers built from their own, server-built
// BossContext - never raw table access, never another player's
// private data, never a client-supplied SQL/query of any kind.
// =========================================================

export async function POST(
  request: Request
) {
  const {
    supabase,
    userId,
  } = await requireUser();

  if (isRateLimited(userId)) {
    return NextResponse.json(
      {
        error:
          "Slow down a little - give it a few seconds between questions.",
      },
      { status: 429 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 }
    );
  }

  const question =
    typeof body === "object" &&
    body !== null &&
    "question" in body &&
    typeof (body as { question: unknown }).question === "string"
      ? (body as { question: string }).question
      : "";

  if (!question.trim()) {
    return NextResponse.json(
      { error: "Ask your Boss Monster something first." },
      { status: 400 }
    );
  }

  if (question.length > 500) {
    return NextResponse.json(
      { error: "That question is too long." },
      { status: 400 }
    );
  }

  const context =
    await buildBossContext(
      supabase,
      userId
    );

  const result =
    await askBossCompanion(
      context,
      question
    );

  return NextResponse.json(result);
}
