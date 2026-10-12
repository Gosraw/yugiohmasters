import type {
  Metadata,
} from "next";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  loadClimberPageData,
} from "@/lib/games/climber-data";

import {
  ClimberHub,
} from "@/components/games/climber-hub";

// =========================================================
// PYRAMID CLIMB (2.0 mini game)
//
// docs/V2_PLAN.md, "Mini games": a Doodle-Jump-style climber.
// Loading this page also settles any finished day / week (pays
// the leaderboard winners exactly once), so no cron is needed.
// =========================================================

export const metadata: Metadata = {
  title: "Pyramid Climb",
};

export default async function ClimberPage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const data =
    await loadClimberPageData(
      supabase,
      userId
    );

  return (
    <ClimberHub
      data={data}
      userId={userId}
    />
  );
}
