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
  TOMB_GAME,
} from "@/lib/games/tomb-engine";

import {
  TombHub,
} from "@/components/games/tomb-hub";

// =========================================================
// TOMB BLOCKS (2.0 mini game)
//
// A Block Blast-style placement puzzle. Loading this page also
// settles any finished day / week (pays the leaderboard winners
// exactly once), so no cron is needed.
// =========================================================

export const metadata: Metadata = {
  title: "Tomb Blocks",
};

export default async function TombPage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const data =
    await loadMiniGamePageData(
      supabase,
      userId,
      TOMB_GAME
    );

  return (
    <TombHub
      data={data}
      userId={userId}
    />
  );
}
