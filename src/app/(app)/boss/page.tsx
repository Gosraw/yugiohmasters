import Link from "next/link";

import {
  ArrowLeft,
  Coins,
  Compass,
  Crown,
  Home,
  Lock,
  Sparkles,
  Sword,
  Trophy,
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
  getBossSlotPrices,
  getRouteStagePrices,
} from "@/lib/boss-prices";

import {
  getBossArenaImage,
} from "@/lib/boss-arena";

export const dynamic =
  "force-dynamic";

// =========================================================
// BOSS HUB (task 142)
//
// The flagship landing screen for the Boss Route system: one
// card per route slot (1st free; slot 2/3 prices come from
// league_economy_defaults, see src/lib/boss-prices.ts).
// A chosen slot shows current stage progress at a glance; an
// empty slot shows what it costs and links to Boss Path
// Select to fill it. Full evolution-chain detail (the actual
// cards, DP evolution prices, evolve action) lives on the
// per-path screen at /boss/[pathId] - this page is the overview.
// =========================================================

type BossRoute = {
  id: string;
  code: string;
  name: string;
  teaser_story: string;
  target_power_grade: string;
};

type PlayerBossPath = {
  id: string;
  route_slot: number;
  route_id: string;
  current_stage: number;
  mastered_at: string | null;
  chosen_at: string;
};

export default async function BossHubPage() {
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
    data: pathsData,
    error: pathsError,
  } = await supabase
    .from(
      "player_boss_paths"
    )
    .select(
      "id,route_slot,route_id,current_stage,mastered_at,chosen_at"
    )
    .eq(
      "profile_id",
      userId
    )
    .order(
      "route_slot",
      {
        ascending: true,
      }
    );

  if (pathsError) {
    throw new Error(
      pathsError.message
    );
  }

  const paths =
    (pathsData ??
      []) as PlayerBossPath[];

  const routeIds = paths.map(
    (path) => path.route_id
  );

  let routeMap = new Map<
    string,
    BossRoute
  >();

  if (routeIds.length > 0) {
    const {
      data: routesData,
      error: routesError,
    } = await supabase
      .from("boss_routes")
      .select(
        "id,code,name,teaser_story,target_power_grade"
      )
      .in(
        "id",
        routeIds
      );

    if (routesError) {
      throw new Error(
        routesError.message
      );
    }

    routeMap = new Map(
      (
        (routesData ??
          []) as BossRoute[]
      ).map((route) => [
        route.id,
        route,
      ])
    );
  }

  const [
    slotPrices,
    stagePrices,
  ] = await Promise.all([
    getBossSlotPrices(
      supabase
    ),
    getRouteStagePrices(
      supabase,
      routeIds
    ),
  ]);

  const pathBySlot = new Map(
    paths.map((path) => [
      path.route_slot,
      path,
    ])
  );

  const slots: Array<
    1 | 2 | 3
  > = [1, 2, 3];

  return (
    <main className="relative min-h-screen overflow-hidden pb-28">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-amber-400/[0.06] blur-[150px]" />

        <div className="absolute -right-40 top-32 h-[460px] w-[460px] rounded-full bg-red-500/[0.05] blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <nav className="flex flex-wrap items-center gap-3">
          <Link
            href="/profile"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300 transition-all hover:-translate-x-0.5 hover:border-amber-300/40 hover:bg-amber-300/10 active:scale-95"
          >
            <ArrowLeft
              size={17}
            />

            Back
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
            eyebrow="Boss Route"
            icon={
              <Crown
                size={13}
              />
            }
            title="Boss Path"
            description="Three routes, three legends. Choose a signature monster, grind it through four evolution stages, and become the boss your friends have to prepare for."
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

        <div className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 md:grid-cols-3">
          {slots.map((slot) => {
            const path =
              pathBySlot.get(
                slot
              );

            const route =
              path
                ? routeMap.get(
                    path.route_id
                  )
                : undefined;

            if (path && route) {
              const mastered =
                Boolean(
                  path.mastered_at
                );

              const nextPrice =
                path.current_stage < 4
                  ? stagePrices
                      .get(path.route_id)
                      ?.get(
                        path.current_stage + 1
                      ) ?? null
                  : null;

              return (
                <Link
                  key={slot}
                  href={`/boss/${path.id}`}
                  className="panel group relative flex flex-col overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:border-amber-300/25"
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-45 transition-opacity duration-500 group-hover:opacity-60"
                    style={{
                      backgroundImage: `url(${getBossArenaImage(route.code)})`,
                    }}
                  />

                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-black/70 to-black/90"
                  />

                  <div className="relative flex items-center justify-between">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-zinc-500">
                      Slot {slot}
                    </span>

                    {mastered ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-amber-200">
                        <Trophy
                          size={11}
                        />
                        Mastered
                      </span>
                    ) : (
                      <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-200">
                        {
                          route.target_power_grade
                        }
                      </span>
                    )}
                  </div>

                  <h2 className="gold-text relative mt-4 text-xl font-black leading-snug">
                    {route.name}
                  </h2>

                  <p className="relative mt-2 line-clamp-3 text-xs leading-5 text-zinc-400">
                    {
                      route.teaser_story
                    }
                  </p>

                  <div className="relative mt-5">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-zinc-500">
                      <span>
                        Stage{" "}
                        {
                          path.current_stage
                        }{" "}
                        of 4
                      </span>

                      <span className="text-amber-300">
                        {Math.round(
                          (path.current_stage /
                            4) *
                            100
                        )}
                        %
                      </span>
                    </div>

                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
                        style={{
                          width: `${(path.current_stage / 4) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  {!mastered &&
                    nextPrice != null && (
                      <p
                        className={`relative mt-4 inline-flex items-center gap-1.5 text-xs font-black ${
                          duelPoints >= nextPrice
                            ? "text-emerald-300"
                            : "text-zinc-400"
                        }`}
                      >
                        <Coins
                          size={13}
                        />
                        Stage{" "}
                        {path.current_stage + 1}:{" "}
                        {nextPrice.toLocaleString("en-US")} DP
                        {duelPoints >= nextPrice
                          ? " — ready to evolve"
                          : ""}
                      </p>
                    )}

                  <span className="relative mt-4 inline-flex items-center gap-1.5 text-sm font-black text-amber-300 group-hover:text-amber-200">
                    <Sword
                      size={14}
                    />
                    {mastered
                      ? "View evolution chain"
                      : "Continue path"}
                  </span>
                </Link>
              );
            }

            const cost =
              slotPrices[slot];

            const prerequisiteMet =
              slot === 1 ||
              pathBySlot.has(
                (slot -
                  1) as
                  | 1
                  | 2
              );

            const canAfford =
              cost === null ||
              duelPoints >=
                cost;

            return (
              <div
                key={slot}
                className="panel relative flex flex-col items-center justify-center gap-3 border-dashed p-6 text-center"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-500">
                  {prerequisiteMet ? (
                    <Sparkles
                      size={20}
                    />
                  ) : (
                    <Lock
                      size={20}
                    />
                  )}
                </div>

                <p className="text-sm font-black uppercase tracking-wider text-zinc-400">
                  Slot {slot}
                </p>

                {prerequisiteMet ? (
                  <>
                    <p className="text-xs text-zinc-600">
                      {cost ===
                      null
                        ? "Free — your first Boss Route"
                        : `Unlock for ${cost.toLocaleString("en-US")} DP`}
                    </p>

                    <Link
                      href={`/boss/select?slot=${slot}`}
                      className={`primary-button mt-1 inline-flex items-center gap-2 text-sm ${!canAfford ? "pointer-events-none opacity-55" : ""}`}
                    >
                      <Crown
                        size={15}
                      />
                      {cost ===
                      null
                        ? "Choose Route"
                        : "Unlock Slot"}
                    </Link>

                    {!canAfford && (
                      <p className="text-[10px] font-black uppercase tracking-wider text-red-300">
                        Not enough DP yet
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-zinc-600">
                    Unlock Slot{" "}
                    {slot - 1}{" "}
                    first
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {paths.length ===
          0 && (
          <div className="mt-8">
            <EmptyState
              icon={
                <Compass
                  size={22}
                />
              }
              title="No Boss Route chosen yet"
              description="Pick your first route above — it's free, and Stage 1 is granted the moment you choose it."
            />
          </div>
        )}
      </div>
    </main>
  );
}
