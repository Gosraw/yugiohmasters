import Image from "next/image";
import Link from "next/link";

import {
  ArrowLeft,
  CheckCircle2,
  Coins,
  Crown,
  Home,
  Lock,
  Sparkles,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  PageHeader,
} from "@/components/page-header";

import {
  EmptyState,
} from "@/components/empty-state";

import {
  ConfirmSubmitButton,
} from "@/components/confirm-submit-button";

import {
  SubmitButton,
} from "@/components/submit-button";

import {
  unlockBossPathSlot,
} from "@/app/actions/boss-routes";

import {
  BossPathWheel,
} from "@/components/boss-path-wheel";

import {
  getFreeRouteIds,
  loadWheelRoutes,
} from "@/lib/boss-wheel";

import {
  getBossSlotPrices,
  getRouteStagePrices,
} from "@/lib/boss-prices";

import {
  BOSS_ARENA_FALLBACK,
  getBossArenaImage,
} from "@/lib/boss-arena";

export const dynamic =
  "force-dynamic";

// =========================================================
// BOSS PATH SELECT (task 142, 2.0 wheel)
//
// ?slot=1 (the onboarding gate sends new players here): the Boss
// Path WHEEL. The first route is not chosen - the player spins and
// the server (spin_boss_path_wheel, 202610301400) hands out a
// random route nobody in the league holds yet. Once a player has a
// slot-1 route this page shows that route instead of the wheel.
//
// ?slot=2|3 (linked from the Boss Hub): grid of all active routes
// with the slot's DP price. Still a free choice, but only among
// routes nobody in the league holds yet (the database refuses the
// others too). Every route card also lists what its evolutions cost
// - Boss evolution is DP only in 2.0, and all prices come from the
// database (see src/lib/boss-prices.ts), never from constants here.
// =========================================================

type StarProfile = {
  startStrength?: number;
  growth?: number;
  bossPower?: number;
  synergy?: number;
  flexibility?: number;
};

type BossRoute = {
  id: string;
  code: string;
  name: string;
  display_order: number;
  teaser_story: string;
  how_it_plays: string | null;
  star_profile: StarProfile;
  target_power_grade: string;
};

const STAR_LABELS: Array<{
  key: keyof StarProfile;
  label: string;
}> = [
  {
    key: "startStrength",
    label: "Start",
  },
  {
    key: "growth",
    label: "Growth",
  },
  {
    key: "bossPower",
    label: "Boss",
  },
  {
    key: "synergy",
    label: "Synergy",
  },
  {
    key: "flexibility",
    label: "Flex",
  },
];

function StarBar({
  value,
}: {
  value: number;
}) {
  return (
    <div className="flex gap-[3px]">
      {[1, 2, 3, 4, 5].map(
        (n) => (
          <span
            key={n}
            className={`h-1.5 w-3 rounded-sm ${
              n <= value
                ? "bg-amber-300"
                : "bg-white/[0.08]"
            }`}
          />
        )
      )}
    </div>
  );
}

export default async function BossPathSelectPage({
  searchParams,
}: {
  searchParams: Promise<{
    slot?: string;
  }>;
}) {
  const {
    slot: slotParam,
  } = await searchParams;

  const slot =
    Number(slotParam) === 2
      ? 2
      : Number(slotParam) === 3
        ? 3
        : 1;

  const {
    supabase,
    userId,
  } = await requireUser();

  if (slot === 1) {
    return (
      <BossPathWheelPage
        supabase={
          supabase
        }
        userId={
          userId
        }
      />
    );
  }

  const {
    data: profileData,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select(
      "duel_points"
    )
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(
      profileError.message
    );
  }

  const duelPoints =
    profileData?.duel_points ??
    0;

  const {
    data: existingPathsData,
    error: existingPathsError,
  } = await supabase
    .from(
      "player_boss_paths"
    )
    .select(
      "route_slot,route_id"
    )
    .eq(
      "profile_id",
      userId
    );

  if (existingPathsError) {
    throw new Error(
      existingPathsError.message
    );
  }

  const existingPaths =
    existingPathsData ??
    [];

  const chosenRouteIds =
    new Set(
      existingPaths.map(
        (path) =>
          path.route_id
      )
    );

  const slotAlreadyFilled =
    existingPaths.some(
      (path) =>
        path.route_slot ===
        slot
    );

  const prerequisiteMet =
    existingPaths.some(
      (path) =>
        path.route_slot ===
        slot - 1
    );

  const {
    data: routesData,
    error: routesError,
  } = await supabase
    .from("boss_routes")
    .select(
      "id,code,name,display_order,teaser_story,how_it_plays,star_profile,target_power_grade"
    )
    .eq(
      "is_active",
      true
    )
    .order(
      "display_order",
      {
        ascending: true,
      }
    );

  if (routesError) {
    throw new Error(
      routesError.message
    );
  }

  const routes =
    (routesData ??
      []) as BossRoute[];

  const [
    slotPrices,
    stagePrices,
    freeRouteIds,
  ] = await Promise.all([
    getBossSlotPrices(
      supabase
    ),
    getRouteStagePrices(
      supabase,
      routes.map(
        (route) => route.id
      )
    ),
    getFreeRouteIds(
      supabase
    ),
  ]);

  // Every route at most once per league (202610301400).
  const freeRoutes =
    new Set(
      freeRouteIds
    );

  const cost =
    slotPrices[slot];

  const canAfford =
    cost === null ||
    duelPoints >= cost;

  return (
    <main className="relative min-h-screen overflow-hidden pb-28">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-amber-400/[0.06] blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
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
            eyebrow={`Slot ${slot}`}
            icon={
              <Crown
                size={13}
              />
            }
            title="Choose Your Next Boss Route"
            description={
              cost === null
                ? "This slot has no price configured yet."
                : `Unlocking this slot costs ${cost.toLocaleString("en-US")} DP, charged once. Stage 1 is granted immediately after. Every route belongs to one duelist only, so routes others already hold are locked.`
            }
            action={
              <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-2.5 text-right">
                <p className="text-[9px] font-black uppercase tracking-wider text-amber-300/70">
                  Duel Points
                </p>

                <p className="flex items-center justify-end gap-1.5 text-xl font-black text-amber-200">
                  <Coins
                    size={16}
                  />
                  {duelPoints.toLocaleString("en-US")}
                </p>
              </div>
            }
          />
        </div>

        {slotAlreadyFilled && (
          <div className="mt-6">
            <EmptyState
              icon={
                <CheckCircle2
                  size={22}
                />
              }
              title={`Slot ${slot} is already filled`}
              description="Head back to the Boss Hub to view that path's evolution chain."
              action={
                <Link
                  href="/boss"
                  className="primary-button inline-flex items-center gap-2 text-sm"
                >
                  Go to Boss Hub
                </Link>
              }
            />
          </div>
        )}

        {!slotAlreadyFilled &&
          !prerequisiteMet && (
            <div className="mt-6">
              <EmptyState
                icon={
                  <Crown
                    size={22}
                  />
                }
                title={`Unlock Slot ${slot - 1} first`}
                description="Boss Route slots unlock in order — finish choosing the previous one before this one opens up."
                action={
                  <Link
                    href="/boss"
                    className="primary-button inline-flex items-center gap-2 text-sm"
                  >
                    Go to Boss Hub
                  </Link>
                }
              />
            </div>
          )}

        {!slotAlreadyFilled &&
          prerequisiteMet && (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 sm:grid-cols-2 xl:grid-cols-3">
              {routes.map(
                (route) => {
                  const alreadyChosenElsewhere =
                    chosenRouteIds.has(
                      route.id
                    );

                  const takenInLeague =
                    !alreadyChosenElsewhere &&
                    !freeRoutes.has(
                      route.id
                    );

                  const disabled =
                    alreadyChosenElsewhere ||
                    takenInLeague ||
                    !canAfford;

                  return (
                    <div
                      key={
                        route.id
                      }
                      className={`panel relative flex flex-col overflow-hidden p-5 ${alreadyChosenElsewhere || takenInLeague ? "opacity-50" : ""}`}
                    >
                      {/* next/image lazy-loads: only the arenas on
                          screen are downloaded, not all 14 at once. */}
                      <div
                        aria-hidden="true"
                        className="relative -mx-5 -mt-5 mb-4 h-28 overflow-hidden [mask-image:linear-gradient(180deg,#000_55%,transparent)]"
                      >
                        <Image
                          src={getBossArenaImage(
                            route.code
                          )}
                          alt=""
                          fill
                          loading="lazy"
                          sizes="(min-width: 1280px) 400px, (min-width: 640px) 50vw, 100vw"
                          className="object-cover object-center"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
                          Route{" "}
                          {
                            route.display_order
                          }
                        </span>

                        <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-200">
                          {
                            route.target_power_grade
                          }
                        </span>
                      </div>

                      <h2 className="gold-text mt-3 text-lg font-black leading-snug">
                        {
                          route.name
                        }
                      </h2>

                      <p className="mt-2 line-clamp-4 text-xs leading-5 text-zinc-500">
                        {
                          route.teaser_story
                        }
                      </p>

                      {route.how_it_plays && (
                        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5">
                          <p className="text-[9px] font-black uppercase tracking-wider text-amber-300/80">
                            How it plays
                          </p>

                          <p className="mt-1 text-xs leading-5 text-zinc-300">
                            {
                              route.how_it_plays
                            }
                          </p>
                        </div>
                      )}

                      <div className="mt-4 space-y-1.5">
                        {STAR_LABELS.map(
                          (
                            star
                          ) => (
                            <div
                              key={
                                star.key
                              }
                              className="flex items-center justify-between gap-3"
                            >
                              <span className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
                                {
                                  star.label
                                }
                              </span>

                              <StarBar
                                value={
                                  route
                                    .star_profile?.[
                                    star
                                      .key
                                  ] ??
                                  0
                                }
                              />
                            </div>
                          )
                        )}
                      </div>

                      {(() => {
                        const routePrices =
                          stagePrices.get(
                            route.id
                          );

                        if (!routePrices || routePrices.size === 0) {
                          return null;
                        }

                        return (
                          <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2.5">
                            <p className="text-[9px] font-black uppercase tracking-wider text-amber-300/80">
                              Evolution cost
                            </p>

                            <div className="mt-1.5 grid grid-cols-3 gap-2">
                              {[2, 3, 4].map(
                                (stageNumber) => (
                                  <div
                                    key={
                                      stageNumber
                                    }
                                  >
                                    <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
                                      Stage {stageNumber}
                                    </p>

                                    <p className="text-xs font-black text-zinc-200">
                                      {routePrices.has(stageNumber)
                                        ? `${routePrices.get(stageNumber)?.toLocaleString("en-US")} DP`
                                        : "—"}
                                    </p>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      <div className="mt-5">
                        {alreadyChosenElsewhere ? (
                          <span className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-black uppercase tracking-wider text-zinc-500">
                            <CheckCircle2
                              size={
                                14
                              }
                            />
                            Already Chosen
                          </span>
                        ) : takenInLeague ? (
                          <span className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-black uppercase tracking-wider text-zinc-500">
                            <Lock
                              size={
                                14
                              }
                            />
                            Taken in your league
                          </span>
                        ) : (
                          <form
                            action={
                              unlockBossPathSlot
                            }
                          >
                            <input
                              type="hidden"
                              name="route_id"
                              value={
                                route.id
                              }
                            />

                            <input
                              type="hidden"
                              name="route_slot"
                              value={
                                slot
                              }
                            />

                            {cost ===
                            null ? (
                              <SubmitButton
                                pendingLabel="Choosing..."
                                disabled={
                                  disabled
                                }
                                className="primary-button inline-flex w-full items-center justify-center gap-2 text-sm"
                              >
                                <Sparkles
                                  size={
                                    15
                                  }
                                />
                                Choose This Route
                              </SubmitButton>
                            ) : (
                              <ConfirmSubmitButton
                                confirmMessage={`Unlock ${route.name} as Boss Route slot ${slot} for ${cost.toLocaleString("en-US")} DP? This spends your Duel Points and can't be undone.`}
                                pendingLabel="Unlocking..."
                                disabled={
                                  disabled
                                }
                                className="primary-button inline-flex w-full items-center justify-center gap-2 text-sm"
                              >
                                <Sparkles
                                  size={
                                    15
                                  }
                                />
                                {`Unlock for ${cost.toLocaleString("en-US")} DP`}
                              </ConfirmSubmitButton>
                            )}
                          </form>
                        )}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
      </div>
    </main>
  );
}

// =========================================================
// SLOT 1: THE BOSS PATH WHEEL
// =========================================================

type SupabaseClient =
  Awaited<
    ReturnType<typeof requireUser>
  >["supabase"];

async function BossPathWheelPage({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}) {
  const [
    {
      data: slotOneData,
      error: slotOneError,
    },
    {
      data: completedDraft,
    },
  ] = await Promise.all([
    supabase
      .from(
        "player_boss_paths"
      )
      .select(
        "id,route_id"
      )
      .eq(
        "profile_id",
        userId
      )
      .eq(
        "route_slot",
        1
      )
      .maybeSingle(),
    supabase
      .from(
        "draft_players"
      )
      .select("id")
      .eq(
        "profile_id",
        userId
      )
      .eq(
        "status",
        "completed"
      )
      .limit(1)
      .maybeSingle(),
  ]);

  if (slotOneError) {
    throw new Error(
      slotOneError.message
    );
  }

  const slotOne =
    slotOneData as {
      id: string;
      route_id: string;
    } | null;

  let assigned: {
    pathId: string;
    route: Awaited<
      ReturnType<typeof loadWheelRoutes>
    >[number];
  } | null = null;

  let wheelRoutes: Awaited<
    ReturnType<typeof loadWheelRoutes>
  > = [];

  if (slotOne) {
    const [
      route,
    ] = await loadWheelRoutes(
      supabase,
      [
        slotOne.route_id,
      ]
    );

    if (route) {
      assigned = {
        pathId:
          slotOne.id,
        route,
      };
    }
  } else {
    wheelRoutes =
      await loadWheelRoutes(
        supabase,
        await getFreeRouteIds(
          supabase
        )
      );
  }

  return (
    <main className="relative min-h-screen overflow-hidden pb-28">
      <div className="pointer-events-none absolute inset-0">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[560px] bg-cover bg-top opacity-35 [mask-image:linear-gradient(180deg,#000_35%,transparent)]"
          style={{
            backgroundImage: `url(${BOSS_ARENA_FALLBACK})`,
          }}
        />

        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-amber-400/[0.07] blur-[150px]" />

        <div className="absolute -right-40 top-60 h-[460px] w-[460px] rounded-full bg-violet-500/[0.05] blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="text-center">
          <p className="hud-label inline-flex items-center gap-1.5 text-amber-300/85">
            <Crown
              size={11}
            />
            {assigned
              ? "Your first Boss Path"
              : "Step 1 of 2 · Free"}
          </p>

          <h1 className="gold-text mt-2 text-2xl font-black sm:text-4xl">
            {assigned
              ? "The wheel has spoken"
              : "Spin for Your Boss Path"}
          </h1>

          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-400 sm:mt-3">
            {assigned
              ? "This is the legend you grow into this season, through four evolution stages."
              : "Fate picks your first Boss Path. One spin, and it is yours for the season."}
          </p>
        </div>

        <div className="mt-4 sm:mt-8">
          <BossPathWheel
            routes={
              wheelRoutes
            }
            assigned={
              assigned
            }
            draftDone={Boolean(
              completedDraft
            )}
          />
        </div>
      </div>
    </main>
  );
}
