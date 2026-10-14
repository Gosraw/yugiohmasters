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
  OBELISK_GAME,
} from "@/lib/games/obelisk-engine";

import {
  ObeliskHub,
} from "@/components/games/obelisk-hub";

// =========================================================
// OBELISK RUSH (2.0 mini game)
//
// A Timberman-style left / right tapper. Loading this page also
// settles any finished day / week (pays the leaderboard winners
// exactly once), so no cron is needed.
// =========================================================

export const metadata: Metadata = {
  title: "Obelisk Rush",
};

export default async function ObeliskPage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const data =
    await loadMiniGamePageData(
      supabase,
      userId,
      OBELISK_GAME
    );

  return (
    <ObeliskHub
      data={data}
      userId={userId}
    />
  );
}
