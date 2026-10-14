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
  PEAKS_GAME,
} from "@/lib/games/peaks-engine";

import {
  PeaksHub,
} from "@/components/games/peaks-hub";

// =========================================================
// GIZA PEAKS (2.0 mini game)
//
// A TriPeaks solitaire strategy game. Loading this page also
// settles any finished day / week (pays the leaderboard winners
// exactly once), so no cron is needed.
// =========================================================

export const metadata: Metadata = {
  title: "Giza Peaks",
};

export default async function PeaksPage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const data =
    await loadMiniGamePageData(
      supabase,
      userId,
      PEAKS_GAME
    );

  return (
    <PeaksHub
      data={data}
      userId={userId}
    />
  );
}
