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
  STRIKE_GAME,
} from "@/lib/games/strike-engine";

import {
  StrikeHub,
} from "@/components/games/strike-hub";

// =========================================================
// MILLENNIUM STRIKE (2.0 mini game)
//
// A Knife Hit-style one-tap game: throw cards into a turning
// Millennium wheel. Loading this page also settles any finished
// day / week (pays the leaderboard winners exactly once), so no
// cron is needed.
// =========================================================

export const metadata: Metadata = {
  title: "Millennium Strike",
};

export default async function StrikePage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const data =
    await loadMiniGamePageData(
      supabase,
      userId,
      STRIKE_GAME
    );

  return (
    <StrikeHub
      data={data}
      userId={userId}
    />
  );
}
