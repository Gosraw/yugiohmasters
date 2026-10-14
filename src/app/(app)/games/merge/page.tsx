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
  MERGE_GAME,
} from "@/lib/games/merge-engine";

import {
  MergeHub,
} from "@/components/games/merge-hub";

// =========================================================
// MERGE OF RA (2.0 mini game)
//
// A 2048-style strategy game with Millennium tiles. Loading this
// page also settles any finished day / week (pays the leaderboard
// winners exactly once), so no cron is needed.
// =========================================================

export const metadata: Metadata = {
  title: "Merge of Ra",
};

export default async function MergePage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const data =
    await loadMiniGamePageData(
      supabase,
      userId,
      MERGE_GAME
    );

  return (
    <MergeHub
      data={data}
      userId={userId}
    />
  );
}
