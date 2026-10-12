import type {
  Metadata,
} from "next";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  loadArenaPageData,
} from "@/lib/games/autobattler/data";

import {
  ArenaHub,
} from "@/components/games/autobattler/arena-hub";

// =========================================================
// SHADOW ARENA (2.0 mini game: auto battler)
//
// docs/V2_PLAN.md, "Mini games": a Battlegrounds-like auto
// battler vs computer Bosses. Loading this page also settles any
// finished day / week (pays the leaderboard winners exactly
// once through the shared mini game rewards), so no cron.
// =========================================================

export const metadata: Metadata = {
  title: "Shadow Arena",
};

export default async function ShadowArenaPage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const data =
    await loadArenaPageData(
      supabase,
      userId
    );

  return (
    <ArenaHub
      data={data}
    />
  );
}
