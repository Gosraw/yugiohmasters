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
  ConfirmSubmitButton,
} from "@/components/confirm-submit-button";

import {
  evolveBossStage,
} from "@/app/actions/boss-routes";

import {
  getBossArenaImage,
} from "@/lib/boss-arena";

import {
  BossEvolutionCinematic,
} from "@/components/boss-evolution-cinematic";

export const dynamic =
  "force-dynamic";

// =========================================================
// BOSS PATH EVOLUTION DETAIL (task 142)
//
// The full 4-stage evolution chain for one chosen Boss Path.
//
// 2.0: evolution is DP ONLY (docs/V2_PLAN.md - the Boss
// achievement questions are gone, see migration 202610120130).
// Every stage shows its price straight from
// boss_route_stages.dp_cost_to_reach, the exact number
// evolve_boss_stage charges.
//
// MYSTERY RULE: what stays hidden until a stage is actually
// reached is its REWARD - the evolution monster's name and its
// permanent support cards - preserving the surprise the route's
// teaser_story is written to protect. Prices are never hidden: a
// player can't save toward a goal they can't see.
// =========================================================

type BossRoute = {
  id: string;
  code: string;
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
  image_url:
    | string
    | null;
};

type GrantRow = {
  stage_id: string;
  card_catalog_id: string;
  is_route_exclusive: boolean;
  quantity: number;
};

export default async function BossPathDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{
    pathId: string;
  }>;
  searchParams: Promise<{
    evolved?: string;
  }>;
}) {
  const {
    pathId,
  } = await params;

  const {
    evolved,
  } = await searchParams;

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
        "id,code,name,teaser_story,star_profile,target_power_grade"
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

  const {
    data: grantsData,
    error: grantsError,
  } =
    stageIds.length > 0
      ? await supabase
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
      : {
          data: [] as GrantRow[],
          error: null,
        };

  if (grantsError) {
    throw new Error(
      grantsError.message
    );
  }

  const grants =
    (grantsData ??
      []) as GrantRow[];

  let cardNameMap = new Map<
    string,
    string
  >();

  let cardImageMap = new Map<
    string,
    string | null
  >();

  // Evolution monsters + the support cards each unlocked stage
  // grants (the grant names used to be missing here, so every
  // support card showed as "Unknown Card").
  const namedCardIds = [
    ...new Set([
      ...cardIds,
      ...grants.map(
        (grant) =>
          grant.card_catalog_id
      ),
    ]),
  ];

  if (namedCardIds.length > 0) {
    const {
      data: cardsData,
      error: cardsError,
    } = await supabase
      .from("card_catalog")
      .select("id,name,image_url")
      .in("id", namedCardIds);

    if (cardsError) {
      throw new Error(
        cardsError.message
      );
    }

    const cardRows =
      (cardsData ??
        []) as CardRow[];

    cardNameMap = new Map(
      cardRows.map((card) => [
        card.id,
        card.name,
      ])
    );

    cardImageMap = new Map(
      cardRows.map((card) => [
        card.id,
        card.image_url,
      ])
    );
  }

  // The evolution moment: only for the owner, only right after
  // the evolve action redirected here, and only when the stage
  // in the URL is the one actually reached.
  const evolvedStage =
    Number(evolved);

  const evolvedTo =
    isOwner &&
    evolvedStage ===
      path.current_stage
      ? stages.find(
          (stage) =>
            stage.stage_number ===
            evolvedStage
        )
      : undefined;

  const evolvedFrom =
    evolvedTo
      ? stages.find(
          (stage) =>
            stage.stage_number ===
            evolvedStage - 1
        )
      : undefined;

  function stageCard(
    stage: StageRow
  ) {
    return {
      name:
        cardNameMap.get(
          stage.evolution_card_catalog_id
        ) ?? "Unknown Card",
      imageUrl:
        cardImageMap.get(
          stage.evolution_card_catalog_id
        ) ?? null,
    };
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

  const canAffordNext =
    nextStage?.dp_cost_to_reach !=
      null &&
    ownerDp >=
      nextStage.dp_cost_to_reach;

  const canEvolve =
    isOwner &&
    Boolean(nextStage) &&
    canAffordNext;

  const dpToMasterTotal =
    stages
      .filter(
        (stage) =>
          stage.stage_number >
          path.current_stage
      )
      .reduce(
        (total, stage) =>
          total +
          (stage.dp_cost_to_reach ?? 0),
        0
      );

  return (
    <main className="relative min-h-screen overflow-hidden pb-28">
      {evolvedTo && (
        <BossEvolutionCinematic
          key={evolvedTo.id}
          arenaImage={getBossArenaImage(
            route.code
          )}
          stageNumber={
            evolvedTo.stage_number
          }
          oldCard={
            evolvedFrom
              ? stageCard(
                  evolvedFrom
                )
              : null
          }
          newCard={stageCard(
            evolvedTo
          )}
        />
      )}

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[640px] [mask-image:linear-gradient(180deg,#000_45%,transparent)]">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-cover bg-top opacity-60"
            style={{
              backgroundImage: `url(${getBossArenaImage(route.code)})`,
            }}
          />

          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/60 to-black/80" />
        </div>

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

        {!mastered &&
          dpToMasterTotal > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] px-4 py-3">
              <p className="text-xs font-bold text-zinc-300">
                Evolution is paid with Duel Points only.
              </p>

              <p className="inline-flex items-center gap-1.5 text-xs font-black text-amber-200">
                <Coins
                  size={13}
                />
                {dpToMasterTotal.toLocaleString()} DP to Stage 4
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

                    {stage?.dp_cost_to_reach !=
                      null && (
                      <span className="ml-auto inline-flex items-center gap-1.5 text-sm font-black text-zinc-400">
                        <Coins
                          size={
                            13
                          }
                        />
                        {stage.dp_cost_to_reach.toLocaleString()}{" "}
                        DP
                      </span>
                    )}
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

              // isNext: the price and the evolve button are
              // shown, not the reward - see MYSTERY RULE above.
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
                    ??? — revealed when you
                    evolve
                  </p>

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

                      <ConfirmSubmitButton
                        confirmMessage={`Evolve to Stage ${stageNumber}${stage?.dp_cost_to_reach != null ? ` for ${stage.dp_cost_to_reach.toLocaleString()} DP` : ""}? This spends your Duel Points and can't be undone.`}
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
                      </ConfirmSubmitButton>

                      {!canAffordNext &&
                        stage?.dp_cost_to_reach != null && (
                          <p className="mt-2 text-xs text-zinc-400">
                            You need{" "}
                            {(
                              stage.dp_cost_to_reach -
                              ownerDp
                            ).toLocaleString()}{" "}
                            more DP. Season round duels earn DP.
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
