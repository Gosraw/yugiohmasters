import Link from "next/link";

import {
  ArrowLeft,
  CheckCircle2,
  Coins,
  Crown,
  Home,
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
  SubmitButton,
} from "@/components/submit-button";

import {
  chooseBossPath,
  unlockBossPathSlot,
} from "@/app/actions/boss-routes";

export const dynamic =
  "force-dynamic";

// =========================================================
// BOSS PATH SELECT (task 142)
//
// Grid of all 20 routes for whichever slot the player is
// currently filling (?slot=1|2|3, linked from the Boss Hub).
// Slot 1 is always free; slots 2/3 show their locked DP cost.
// A route already chosen in another slot is shown but disabled.
// =========================================================

const SLOT_COST: Record<
  number,
  number | null
> = {
  1: null,
  2: 7000,
  3: 10000,
};

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
    slot === 1 ||
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
      "id,code,name,display_order,teaser_story,star_profile,target_power_grade"
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

  const cost =
    SLOT_COST[slot];

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
            title="Choose Your Boss Route"
            description={
              cost === null
                ? "Your first route is free. Pick the legend you want to become — you'll grind it through four evolution stages over the season."
                : `Unlocking this slot costs ${cost.toLocaleString()} DP, charged once. Stage 1 is granted immediately after.`
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
                  {duelPoints.toLocaleString()}
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

                  const disabled =
                    alreadyChosenElsewhere ||
                    !canAfford;

                  return (
                    <div
                      key={
                        route.id
                      }
                      className={`panel relative flex flex-col p-5 ${alreadyChosenElsewhere ? "opacity-50" : ""}`}
                    >
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
                        ) : (
                          <form
                            action={
                              slot ===
                              1
                                ? chooseBossPath
                                : unlockBossPathSlot
                            }
                          >
                            <input
                              type="hidden"
                              name="route_id"
                              value={
                                route.id
                              }
                            />

                            {slot !==
                              1 && (
                              <input
                                type="hidden"
                                name="route_slot"
                                value={
                                  slot
                                }
                              />
                            )}

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
                              {cost ===
                              null
                                ? "Choose This Route"
                                : `Unlock for ${cost.toLocaleString()} DP`}
                            </SubmitButton>
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
