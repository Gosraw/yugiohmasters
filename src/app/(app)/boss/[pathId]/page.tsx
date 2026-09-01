import Link from "next/link";

import {
  notFound,
} from "next/navigation";

import {
  ArrowLeft,
  CheckCircle2,
  Coins,
  Crown,
  Home,
  Lock,
  Sparkles,
  Swords,
  Trophy,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  PageHeader,
} from "@/components/page-header";

import {
  SubmitButton,
} from "@/components/submit-button";

import {
  evolveBossStage,
} from "@/app/actions/boss-routes";

export const dynamic =
  "force-dynamic";

// =========================================================
// BOSS PATH EVOLUTION DETAIL (task 142)
//
// The full 4-stage evolution chain for one chosen Boss Path.
//
// MYSTERY RULE (a deliberate product decision, documented here
// since the spec only says "mystery/silhouette states for
// locked future stages" without spelling out exactly how much
// to hide): the very next stage's ACHIEVEMENT REQUIREMENTS are
// always shown with live progress, because a player can't grind
// toward a goal they can't see. What stays hidden until a stage
// is actually reached is its REWARD - the evolution monster's
// name and its permanent support cards. Anything beyond the
// next stage is a full silhouette: no requirements, no reward,
// just "???" and a lock, preserving the nostalgia-surprise the
// route's teaser_story is written to protect.
// =========================================================

type BossRoute = {
  id: string;
  name: string;
  teaser_story: string;
  star_profile: Record<
    string,
    number
  >;
  target_power_grade: string;
};

type PlayerBossPath = {
  id: string;
  profile_id: string;
  league_id: string;
  route_slot: number;
  route_id: string;
  current_stage: number;
  mastered_at:
    | string
    | null;
  chosen_at: string;
};

type StageRow = {
  id: string;
  stage_number: number;
  evolution_card_catalog_id: string;
  dp_cost_to_reach:
    | number
    | null;
};

type CardRow = {
  id: string;
  name: string;
};

type GrantRow = {
  stage_id: string;
  card_catalog_id: string;
  is_route_exclusive: boolean;
  quantity: number;
};

type RequirementRow = {
  event_id: string;
  target_count: number;
};

type EventRow = {
  id: string;
  event_key: string;
  label: string;
  description:
    | string
    | null;
  is_finishing_blow: boolean;
};

export default async function BossPathDetailPage({
  params,
}: {
  params: Promise<{
    pathId: string;
  }>;
}) {
  const {
    pathId,
  } = await params;

  const {
    supabase,
    userId,
  } = await requireUser();

  const {
    data: pathData,
    error: pathError,
  } = await supabase
    .from(
      "player_boss_paths"
    )
    .select(
      "id,profile_id,league_id,route_slot,route_id,current_stage,mastered_at,chosen_at"
    )
    .eq("id", pathId)
    .maybeSingle();

  if (
    pathError ||
    !pathData
  ) {
    notFound();
  }

  const path =
    pathData as PlayerBossPath;

  const {
    data: membership,
    error: membershipError,
  } = await supabase
    .from(
      "league_members"
    )
    .select("profile_id")
    .eq(
      "league_id",
      path.league_id
    )
    .eq(
      "profile_id",
      userId
    )
    .maybeSingle();

  if (membershipError) {
    throw new Error(
      membershipError.message
    );
  }

  if (!membership) {
    notFound();
  }

  const isOwner =
    path.profile_id ===
    userId;

  const [
    {
      data: routeData,
      error: routeError,
    },
    {
      data: ownerData,
      error: ownerError,
    },
    {
      data: stagesData,
      error: stagesError,
    },
  ] = await Promise.all([
    supabase
      .from("boss_routes")
      .select(
        "id,name,teaser_story,star_profile,target_power_grade"
      )
      .eq(
        "id",
        path.route_id
      )
      .maybeSingle(),
    supabase
      .from("profiles")
      .select(
        "duelist_name,username,duel_points"
      )
      .eq(
        "id",
        path.profile_id
      )
      .maybeSingle(),
    supabase
      .from(
        "boss_route_stages"
      )
      .select(
        "id,stage_number,evolution_card_catalog_id,dp_cost_to_reach"
      )
      .eq(
        "route_id",
        path.route_id
      )
      .order(
        "stage_number",
        {
          ascending: true,
        }
      ),
  ]);

  if (
    routeError ||
    !routeData
  ) {
    throw new Error(
      routeError?.message ??
        "Boss Route not found."
    );
  }

  if (ownerError) {
    throw new Error(
      ownerError.message
    );
  }

  if (stagesError) {
    throw new Error(
      stagesError.message
    );
  }

  const route =
    routeData as BossRoute;

  const stages =
    (stagesData ??
      []) as StageRow[];

  const stageIds = stages.map(
    (stage) => stage.id
  );

  const cardIds = [
    ...new Set(
      stages.map(
        (stage) =>
          stage.evolution_card_catalog_id
      )
    ),
  ];

  const nextStage = stages.find(
    (stage) =>
      stage.stage_number ===
      path.current_stage + 1
  );

  const [
    {
      data: grantsData,
      error: grantsError,
    },
    {
      data: requirementsData,
      error: requirementsError,
    },
    {
      data: eventsData,
      error: eventsError,
    },
    {
      data: progressData,
      error: progressError,
    },
  ] = await Promise.all([
    stageIds.length > 0
      ? supabase
          .from(
            "boss_route_stage_grants"
          )
          .select(
            "stage_id,card_catalog_id,is_route_exclusive,quantity"
          )
          .in(
            "stage_id",
            stageIds
          )
      : Promise.resolve({
          data: [] as GrantRow[],
          error: null,
        }),
    nextStage
      ? supabase
          .from(
            "boss_route_achievement_requirements"
          )
          .select(
            "event_id,target_count"
          )
          .eq(
            "target_stage_id",
            nextStage.id
          )
      : Promise.resolve({
          data: [] as RequirementRow[],
          error: null,
        }),
    supabase
      .from(
        "boss_route_achievement_events"
      )
      .select(
        "id,event_key,label,description,is_finishing_blow"
      )
      .eq(
        "route_id",
        path.route_id
      ),
    supabase
      .from(
        "player_boss_achievement_events"
      )
      .select("event_id")
      .eq(
        "player_boss_path_id",
        path.id
      ),
  ]);

  if (grantsError) {
    throw new Error(
      grantsError.message
    );
  }

  if (requirementsError) {
    throw new Error(
      requirementsError.message
    );
  }

  if (eventsError) {
    throw new Error(
      eventsError.message
    );
  }

  if (progressError) {
    throw new Error(
      progressError.message
    );
  }

  const grants =
    (grantsData ??
      []) as GrantRow[];

  const requirements =
    (requirementsData ??
      []) as RequirementRow[];

  const events = new Map(
    (
      (eventsData ??
        []) as EventRow[]
    ).map((event) => [
      event.id,
      event,
    ])
  );

  const progressCounts =
    new Map<
      string,
      number
    >();

  for (const row of (progressData ??
    []) as Array<{
    event_id: string;
  }>) {
    progressCounts.set(
      row.event_id,
      (progressCounts.get(
        row.event_id
      ) ?? 0) + 1
    );
  }

  let cardNameMap = new Map<
    string,
    string
  >();

  if (cardIds.length > 0) {
    const {
      data: cardsData,
      error: cardsError,
    } = await supabase
      .from("card_catalog")
      .select("id,name")
      .in("id", cardIds);

    if (cardsError) {
      throw new Error(
        cardsError.message
      );
    }

    cardNameMap = new Map(
      (
        (cardsData ??
          []) as CardRow[]
      ).map((card) => [
        card.id,
        card.name,
      ])
    );
  }

  const ownerName =
    ownerData?.duelist_name ??
    ownerData?.username ??
    "Unknown Duelist";

  const ownerDp =
    ownerData?.duel_points ??
    0;

  const mastered = Boolean(
    path.mastered_at
  );

  const requirementsMet =
    requirements.length ===
      0 ||
    requirements.every(
      (req) =>
        (progressCounts.get(
          req.event_id
        ) ?? 0) >=
        req.target_count
    );

  const canAffordNext =
    nextStage?.dp_cost_to_reach !=
      null &&
    ownerDp >=
      nextStage.dp_cost_to_reach;

  const canEvolve =
    isOwner &&
    Boolean(nextStage) &&
    requirementsMet &&
    canAffordNext;

  return (
    <main className="relative min-h-screen overflow-hidden pb-28">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-amber-400/[0.06] blur-[150px]" />

        <div className="absolute -right-40 top-40 h-[460px] w-[460px] rounded-full bg-violet-500/[0.045] blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <nav className="flex flex-wrap items-center gap-3">
          <Link
            href="/boss"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300 transition-all hover:-translate-x-0.5 hover:border-amber-300/40 hover:bg-amber-300/10 active:scale-95"
          >
            <ArrowLeft
              size={17}
            />
            Boss Hub
          </Link>

          <Link
            href="/"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-sm font-bold text-zinc-400 transition-all hover:border-white/20 hover:text-zinc-100"
          >
            <Home
              size={16}
            />
            Home
          </Link>
        </nav>

        <div className="mt-4">
          <PageHeader
            eyebrow={
              isOwner
                ? "Your Boss Path"
                : `${ownerName}'s Boss Path`
            }
            icon={
              <Crown
                size={13}
              />
            }
            title={route.name}
            description={
              route.teaser_story
            }
            action={
              <div className="flex flex-col items-end gap-2">
                <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-200">
                  Power{" "}
                  {
                    route.target_power_grade
                  }
                </span>

                {isOwner && (
                  <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-right">
                    <p className="text-[9px] font-black uppercase tracking-wider text-amber-300/70">
                      Your DP
                    </p>

                    <p className="flex items-center justify-end gap-1.5 text-lg font-black text-amber-200">
                      <Coins
                        size={
                          14
                        }
                      />
                      {ownerDp.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            }
          />
        </div>

        {mastered && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/[0.08] p-4">
            <Trophy
              size={22}
              className="text-amber-300"
            />

            <p className="text-sm font-black text-amber-200">
              This path has been mastered — every stage
              complete.
            </p>
          </div>
        )}

        <div className="mt-6 space-y-4 sm:mt-8">
          {[1, 2, 3, 4].map(
            (stageNumber) => {
              const stage =
                stages.find(
                  (s) =>
                    s.stage_number ===
                    stageNumber
                );

              const unlocked =
                stageNumber <=
                path.current_stage;

              const isNext =
                stageNumber ===
                path.current_stage +
                  1;

              const isFullyLocked =
                !unlocked &&
                !isNext;

              if (
                isFullyLocked
              ) {
                return (
                  <div
                    key={
                      stageNumber
                    }
                    className="panel flex items-center gap-4 border-dashed p-5 opacity-60"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-600">
                      <Lock
                        size={
                          18
                        }
                      />
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
                        Stage{" "}
                        {
                          stageNumber
                        }
                      </p>

                      <p className="mt-0.5 text-lg font-black tracking-wide text-zinc-500">
                        ???
                      </p>
                    </div>
                  </div>
                );
              }

              if (
                unlocked &&
                stage
              ) {
                const stageGrants =
                  grants.filter(
                    (
                      grant
                    ) =>
                      grant.stage_id ===
                      stage.id
                  );

                return (
                  <div
                    key={
                      stageNumber
                    }
                    className="panel relative overflow-hidden p-5 sm:p-6"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-200">
                        <CheckCircle2
                          size={
                            11
                          }
                        />
                        Stage{" "}
                        {
                          stageNumber
                        }{" "}
                        Unlocked
                      </span>

                      {stageNumber ===
                        4 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-amber-200">
                          <Trophy
                            size={
                              11
                            }
                          />
                          Final
                          Boss
                        </span>
                      )}
                    </div>

                    <h3 className="gold-text mt-3 text-xl font-black">
                      {cardNameMap.get(
                        stage.evolution_card_catalog_id
                      ) ??
                        "Unknown Card"}
                    </h3>

                    {stageGrants.length >
                      0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {stageGrants.map(
                          (
                            grant
                          ) => (
                            <span
                              key={
                                grant.card_catalog_id
                              }
                              className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                                grant.is_route_exclusive
                                  ? "border-violet-300/30 bg-violet-300/10 text-violet-200"
                                  : "border-white/10 bg-white/[0.03] text-zinc-400"
                              }`}
                            >
                              {cardNameMap.get(
                                grant.card_catalog_id
                              ) ??
                                "Unknown Card"}
                              {grant.quantity >
                                1 &&
                                ` ×${grant.quantity}`}
                            </span>
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              }

              // isNext (stage not yet unlocked, but stage
              // requirements + DP cost are shown, not the
              // reward — see MYSTERY RULE above.
              return (
                <div
                  key={
                    stageNumber
                  }
                  className="panel relative overflow-hidden border-amber-300/25 p-5 sm:p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-amber-200">
                      <Sparkles
                        size={
                          11
                        }
                      />
                      Stage{" "}
                      {
                        stageNumber
                      }{" "}
                      — Next
                      Evolution
                    </span>

                    {stage?.dp_cost_to_reach !=
                      null && (
                      <span className="inline-flex items-center gap-1.5 text-sm font-black text-amber-200">
                        <Coins
                          size={
                            14
                          }
                        />
                        {stage.dp_cost_to_reach.toLocaleString()}{" "}
                        DP
                      </span>
                    )}
                  </div>

                  <p className="mt-3 text-lg font-black tracking-wide text-zinc-500">
                    ??? — reward revealed on
                    evolution
                  </p>

                  {requirements.length >
                    0 && (
                    <div className="mt-4 space-y-3">
                      {requirements.map(
                        (
                          req
                        ) => {
                          const event =
                            events.get(
                              req.event_id
                            );

                          const count =
                            progressCounts.get(
                              req.event_id
                            ) ??
                            0;

                          const pct =
                            Math.min(
                              100,
                              Math.round(
                                (count /
                                  req.target_count) *
                                  100
                              )
                            );

                          const met =
                            count >=
                            req.target_count;

                          return (
                            <div
                              key={
                                req.event_id
                              }
                            >
                              <div className="flex items-center justify-between text-xs">
                                <span
                                  className={`inline-flex items-center gap-1.5 font-bold ${met ? "text-emerald-300" : "text-zinc-400"}`}
                                >
                                  {event?.is_finishing_blow && (
                                    <Trophy
                                      size={
                                        12
                                      }
                                      className="text-amber-400"
                                    />
                                  )}
                                  {event?.label ??
                                    "Achievement"}
                                </span>

                                <span
                                  className={`font-black ${met ? "text-emerald-300" : "text-zinc-500"}`}
                                >
                                  {Math.min(
                                    count,
                                    req.target_count
                                  )}
                                  /
                                  {
                                    req.target_count
                                  }
                                </span>
                              </div>

                              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                                <div
                                  className={`h-full rounded-full ${met ? "bg-emerald-400" : "bg-gradient-to-r from-amber-500 to-amber-300"}`}
                                  style={{
                                    width: `${pct}%`,
                                  }}
                                />
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  )}

                  {isOwner && (
                    <form
                      action={
                        evolveBossStage
                      }
                      className="mt-5"
                    >
                      <input
                        type="hidden"
                        name="player_boss_path_id"
                        value={
                          path.id
                        }
                      />

                      <input
                        type="hidden"
                        name="stage_number"
                        value={
                          stageNumber
                        }
                      />

                      <SubmitButton
                        pendingLabel="Evolving..."
                        disabled={
                          !canEvolve
                        }
                        className="primary-button inline-flex w-full items-center justify-center gap-2 text-sm sm:w-auto"
                      >
                        <Swords
                          size={
                            15
                          }
                        />
                        Evolve to Stage{" "}
                        {
                          stageNumber
                        }
                      </SubmitButton>

                      {!requirementsMet && (
                        <p className="mt-2 text-xs text-zinc-600">
                          Complete the
                          achievements above
                          to unlock evolution.
                        </p>
                      )}

                      {requirementsMet &&
                        !canAffordNext && (
                          <p className="mt-2 text-xs text-red-300">
                            Not enough Duel
                            Points yet.
                          </p>
                        )}
                    </form>
                  )}
                </div>
              );
            }
          )}
        </div>
      </div>
    </main>
  );
}
