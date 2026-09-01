import Link from "next/link";

import {
  ArrowLeft,
  Swords,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  CompetitionTonightFlow,
  type TonightBossPath,
  type TonightMatch,
  type TonightProfile,
} from "@/components/competition-tonight-flow";

export const dynamic =
  "force-dynamic";

// =========================================================
// "TONIGHT" GAME-NIGHT FLOW (task 146 / P0B)
//
// A single linear screen for playing an entire competition night
// without ever leaving this page: current match front and center,
// [START MATCH], record the winner (reusing the existing V2 result
// form), answer Boss Progress Y/N questions (reusing the existing
// confirm_boss_achievement_event opponent-confirmation system), see
// the match/round reward summary (reusing MatchResultSummary - it
// already covers Match Complete + Round Complete + Competition
// Complete tiers), then move to the next match. For this league's
// 3-player round robin every round is exactly one match (the third
// player sits out on a bye each round), so "match complete" and
// "round complete" are the same moment - no separate interstitial
// page is needed, MatchResultSummary already renders both tiers
// together.
//
// This page only fetches data; all the interactive step sequencing
// lives in the client component below it.
// =========================================================

export default async function CompetitionTonightPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: competitionId } = await params;

  const {
    supabase,
  } = await requireUser();

  const {
    data: competition,
    error: competitionError,
  } = await supabase
    .from("competitions")
    .select(
      "id,league_id,name,status,current_round,total_rounds,match_format"
    )
    .eq("id", competitionId)
    .maybeSingle();

  if (competitionError || !competition) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="panel p-6">
          <p className="font-black text-red-300">
            Competition not found.
          </p>
        </div>
      </main>
    );
  }

  const {
    data: matchRows,
    error: matchesError,
  } = await supabase
    .from("matches")
    .select(
      "id,player_one_id,player_two_id,status,winner_id,round_number,meeting_number,match_format,player_one_duel_wins,player_two_duel_wins"
    )
    .eq("competition_id", competitionId)
    .order("round_number", { ascending: true });

  if (matchesError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="panel p-6">
          <p className="font-black text-red-300">
            Matches could not be loaded.
          </p>
          <p className="mt-2 text-sm text-zinc-500">{matchesError.message}</p>
        </div>
      </main>
    );
  }

  const matches = (matchRows ?? []) as TonightMatch[];

  const playerIds = Array.from(
    new Set(
      matches.flatMap((m) => [m.player_one_id, m.player_two_id])
    )
  );

  const [
    profilesResult,
    bossPathsResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,username,duelist_name")
      .in("id", playerIds),
    supabase
      .from("player_boss_paths")
      .select("id,profile_id,route_id,current_stage")
      .in("profile_id", playerIds)
      .eq("league_id", competition.league_id)
      .eq("route_slot", 1),
  ]);

  const profiles = (profilesResult.data ?? []) as TonightProfile[];

  const bossPathRows = (bossPathsResult.data ?? []) as {
    id: string;
    profile_id: string;
    route_id: string;
    current_stage: number;
  }[];

  const routeIds = Array.from(
    new Set(bossPathRows.map((row) => row.route_id))
  );

  const [
    routesResult,
    eventsResult,
  ] = await Promise.all([
    routeIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from("boss_routes")
          .select("id,name")
          .in("id", routeIds),
    routeIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from("boss_route_achievement_events")
          .select("id,route_id,event_key,label,description,is_finishing_blow")
          .in("route_id", routeIds),
  ]);

  const routeNameById = new Map(
    ((routesResult.data ?? []) as { id: string; name: string }[]).map(
      (route) => [route.id, route.name]
    )
  );

  const eventsByRoute = new Map<
    string,
    {
      id: string;
      event_key: string;
      label: string;
      description: string | null;
      is_finishing_blow: boolean;
    }[]
  >();

  for (const event of (eventsResult.data ?? []) as {
    id: string;
    route_id: string;
    event_key: string;
    label: string;
    description: string | null;
    is_finishing_blow: boolean;
  }[]) {
    const list = eventsByRoute.get(event.route_id) ?? [];
    list.push(event);
    eventsByRoute.set(event.route_id, list);
  }

  const bossPaths: TonightBossPath[] = bossPathRows.map((row) => ({
    id: row.id,
    profileId: row.profile_id,
    routeName: routeNameById.get(row.route_id) ?? "Boss Route",
    currentStage: row.current_stage,
    events: (eventsByRoute.get(row.route_id) ?? [])
      .slice()
      .sort((a, b) =>
        a.is_finishing_blow === b.is_finishing_blow
          ? a.label.localeCompare(b.label)
          : a.is_finishing_blow
            ? 1
            : -1
      )
      .map((event) => ({
        id: event.id,
        label: event.label,
        description: event.description,
        isFinishingBlow: event.is_finishing_blow,
      })),
  }));

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <Link
        href={`/competitions/${competitionId}`}
        className="inline-flex items-center gap-1.5 text-[11px] font-black text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft size={12} />
        Full competition view
      </Link>

      <div className="mt-3 flex items-center gap-2">
        <Swords size={18} className="text-amber-300" />
        <h1 className="text-lg font-black text-white">
          {competition.name}
        </h1>
      </div>

      <CompetitionTonightFlow
        competitionId={competition.id}
        matchFormat={
          competition.match_format as "single_duel" | "best_of_3"
        }
        currentRound={competition.current_round}
        totalRounds={competition.total_rounds}
        matches={matches}
        profiles={profiles}
        bossPaths={bossPaths}
      />
    </main>
  );
}
