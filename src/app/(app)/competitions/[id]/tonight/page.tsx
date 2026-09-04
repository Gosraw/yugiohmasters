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

export default async function CompetitionTonightPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: competitionId } = await params;

  const {
    supabase,
    userId,
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

  const [profilesResult, bossPathsResult] = await Promise.all([
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

  const [routesResult, stagesResult] = await Promise.all([
    routeIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from("boss_routes")
          .select("id,name")
          .in("id", routeIds),
    routeIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from("boss_route_stages")
          .select("id,route_id,stage_number")
          .in("route_id", routeIds),
  ]);

  const routeNameById = new Map(
    ((routesResult.data ?? []) as { id: string; name: string }[]).map(
      (route) => [route.id, route.name]
    )
  );

  const stageIdByRouteAndNumber = new Map(
    ((stagesResult.data ?? []) as {
      id: string;
      route_id: string;
      stage_number: number;
    }[]).map((stage) => [
      `${stage.route_id}:${stage.stage_number}`,
      stage.id,
    ])
  );

  const nextStageIds = Array.from(
    new Set(
      bossPathRows
        .map((row) =>
          stageIdByRouteAndNumber.get(
            `${row.route_id}:${row.current_stage + 1}`
          )
        )
        .filter((id): id is string => Boolean(id))
    )
  );

  const requirementsResult =
    nextStageIds.length === 0
      ? { data: [] }
      : await supabase
          .from("boss_route_achievement_requirements")
          .select("target_stage_id,event_id")
          .in("target_stage_id", nextStageIds);

  const requiredEventIdsByStageId = new Map<string, Set<string>>();

  for (const requirement of (requirementsResult.data ?? []) as {
    target_stage_id: string;
    event_id: string;
  }[]) {
    const ids = requiredEventIdsByStageId.get(requirement.target_stage_id) ?? new Set<string>();
    ids.add(requirement.event_id);
    requiredEventIdsByStageId.set(requirement.target_stage_id, ids);
  }

  const requiredEventIds = Array.from(
    new Set(
      Array.from(requiredEventIdsByStageId.values()).flatMap((ids) =>
        Array.from(ids)
      )
    )
  );

  const eventsResult =
    requiredEventIds.length === 0
      ? { data: [] }
      : await supabase
          .from("boss_route_achievement_events")
          .select("id,route_id,event_key,label,description,is_finishing_blow")
          .in("id", requiredEventIds);

  const eventById = new Map(
    ((eventsResult.data ?? []) as {
      id: string;
      route_id: string;
      event_key: string;
      label: string;
      description: string | null;
      is_finishing_blow: boolean;
    }[]).map((event) => [event.id, event])
  );

  const bossPaths: TonightBossPath[] = bossPathRows.map((row) => {
    const nextStageId = stageIdByRouteAndNumber.get(
      `${row.route_id}:${row.current_stage + 1}`
    );

    const eventIds = nextStageId
      ? Array.from(requiredEventIdsByStageId.get(nextStageId) ?? [])
      : [];

    return {
      id: row.id,
      profileId: row.profile_id,
      routeName: routeNameById.get(row.route_id) ?? "Boss Route",
      currentStage: row.current_stage,
      events: eventIds
        .map((eventId) => eventById.get(eventId))
        .filter((event): event is NonNullable<typeof event> => Boolean(event))
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
    };
  });

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
        currentUserId={userId}
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
