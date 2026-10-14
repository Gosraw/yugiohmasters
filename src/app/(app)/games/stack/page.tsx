import type {
  Metadata,
} from "next";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  loadMiniGamePageData,
} from "@/lib/games/mini-game-data";

import {
  STACK_GAME,
} from "@/lib/games/stack-engine";

import {
  StackHub,
} from "@/components/games/stack-hub";

// =========================================================
// PYRAMID STACK (2.0 mini game)
//
// A Stack-style one-tap tower game. Loading this page also
// settles any finished day / week (pays the leaderboard winners
// exactly once), so no cron is needed.
// =========================================================

export const metadata: Metadata = {
  title: "Pyramid Stack",
};

export default async function StackPage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const data =
    await loadMiniGamePageData(
      supabase,
      userId,
      STACK_GAME
    );

  return (
    <StackHub
      data={data}
      userId={userId}
    />
  );
}
