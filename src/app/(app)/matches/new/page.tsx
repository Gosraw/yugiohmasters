import Link from "next/link";

import {
  ArrowLeft,
  Coins,
  Crown,
  Home,
  Layers3,
  LockKeyhole,
  Send,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  UserRound,
  Zap,
} from "lucide-react";

import {
  createMatchChallenge,
} from "@/app/actions/matches";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  SubmitButton,
} from "@/components/submit-button";

export const dynamic =
  "force-dynamic";

// =========================================================
// TYPES
// =========================================================

type LeagueMember = {
  profile_id: string;
};

type Profile = {
  id: string;
  username: string | null;
  duelist_name: string;
  custom_title: string | null;
  boss_monster_option_id:
    | string
    | null;
};

type BossMonster = {
  id: string;
  name: string;
};

type Deck = {
  id: string;
  name: string;

  status:
    | "draft"
    | "ready"
    | "archived";

  is_active: boolean;
};

type CardInstance = {
  id: string;
  card_catalog_id: string;
  copy_number: number;
  locked: boolean;
};

type CatalogCard = {
  id: string;
  name: string;
  game_rarity: string | null;
};

// =========================================================
// HELPERS
// =========================================================

function playerName(
  profile: Profile
) {
  return (
    profile.duelist_name ??
    profile.username ??
    "Unknown Duelist"
  );
}

// =========================================================
// PAGE
// =========================================================

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{
    opponent?: string;
  }>;
}) {
  const {
    opponent: preselectedOpponentId,
  } = await searchParams;

  const {
    supabase,
    userId,
  } = await requireUser();

  // ======================================================
  // LEAGUE
  // ======================================================

  const {
    data: membership,
    error: membershipError,
  } = await supabase
    .from(
      "league_members"
    )
    .select(
      "league_id"
    )
    .eq(
      "profile_id",
      userId
    )
    .limit(1)
    .maybeSingle();

  if (
    membershipError ||
    !membership
  ) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="panel p-6">
          Geen league gevonden.
        </div>
      </main>
    );
  }

  const leagueId =
    membership.league_id;

  // ======================================================
  // CURRENT PROFILE + DP
  // ======================================================

  const {
    data: currentProfile,
    error: currentProfileError,
  } = await supabase
    .from("profiles")
    .select(
      `
        id,
        username,
        duelist_name,
        custom_title,
        boss_monster_option_id,
        duel_points
      `
    )
    .eq(
      "id",
      userId
    )
    .maybeSingle();

  if (
    currentProfileError ||
    !currentProfile
  ) {
    throw new Error(
      "Profiel kon niet worden geladen."
    );
  }

  const duelPoints =
    currentProfile.duel_points ??
    0;

  // ======================================================
  // ACTIVE READY DECK
  // ======================================================

  const {
    data: activeDeckData,
    error: activeDeckError,
  } = await supabase
    .from("decks")
    .select(
      "id,name,status,is_active"
    )
    .eq(
      "league_id",
      leagueId
    )
    .eq(
      "owner_id",
      userId
    )
    .eq(
      "status",
      "ready"
    )
    .eq(
      "is_active",
      true
    )
    .limit(1)
    .maybeSingle();

  if (activeDeckError) {
    throw new Error(
      activeDeckError.message
    );
  }

  const activeDeck =
    activeDeckData as
      | Deck
      | null;

  // ======================================================
  // OTHER LEAGUE MEMBERS
  // ======================================================

  const {
    data: memberData,
    error: memberError,
  } = await supabase
    .from(
      "league_members"
    )
    .select(
      "profile_id"
    )
    .eq(
      "league_id",
      leagueId
    )
    .neq(
      "profile_id",
      userId
    );

  if (memberError) {
    throw new Error(
      memberError.message
    );
  }

  const members =
    (memberData ??
      []) as LeagueMember[];

  const profileIds =
    members.map(
      (member) =>
        member.profile_id
    );

  let profiles:
    Profile[] =
    [];

  if (
    profileIds.length >
    0
  ) {
    const {
      data: profileData,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select(
        `
          id,
          username,
          duelist_name,
          custom_title,
          boss_monster_option_id
        `
      )
      .in(
        "id",
        profileIds
      );

    if (profileError) {
      throw new Error(
        profileError.message
      );
    }

    profiles =
      (profileData ??
        []) as Profile[];
  }

  profiles.sort(
    (
      a,
      b
    ) =>
      playerName(
        a
      ).localeCompare(
        playerName(b)
      )
  );

  // ======================================================
  // BOSS MONSTERS
  // ======================================================

  const bossIds = [
    ...new Set(
      [
        currentProfile
          .boss_monster_option_id,

        ...profiles.map(
          (profile) =>
            profile
              .boss_monster_option_id
        ),
      ].filter(
        (
          value
        ): value is string =>
          Boolean(value)
      )
    ),
  ];

  let bosses:
    BossMonster[] =
    [];

  if (
    bossIds.length >
    0
  ) {
    const {
      data: bossData,
      error: bossError,
    } = await supabase
      .from(
        "boss_monster_options"
      )
      .select(
        "id,name"
      )
      .in(
        "id",
        bossIds
      );

    if (bossError) {
      throw new Error(
        bossError.message
      );
    }

    bosses =
      (bossData ??
        []) as BossMonster[];
  }

  const bossMap =
    new Map(
      bosses.map(
        (boss) => [
          boss.id,
          boss,
        ]
      )
    );

  const myBoss =
    currentProfile
      .boss_monster_option_id
      ? bossMap.get(
          currentProfile
            .boss_monster_option_id
        ) ?? null
      : null;

  // ======================================================
  // AVAILABLE CARD INSTANCES FOR WAGER
  // ======================================================

  const {
    data: instanceData,
    error: instanceError,
  } = await supabase
    .from(
      "card_instances"
    )
    .select(
      `
        id,
        card_catalog_id,
        copy_number,
        locked
      `
    )
    .eq(
      "current_owner_id",
      userId
    )
    .eq(
      "locked",
      false
    )
    .order(
      "copy_number",
      {
        ascending: true,
      }
    );

  if (instanceError) {
    throw new Error(
      instanceError.message
    );
  }

  const instances =
    (instanceData ??
      []) as CardInstance[];

  const catalogIds = [
    ...new Set(
      instances.map(
        (instance) =>
          instance.card_catalog_id
      )
    ),
  ];

  let catalogCards:
    CatalogCard[] =
    [];

  if (
    catalogIds.length >
    0
  ) {
    const {
      data: catalogData,
      error: catalogError,
    } = await supabase
      .from(
        "card_catalog"
      )
      .select(
        "id,name,game_rarity"
      )
      .in(
        "id",
        catalogIds
      );

    if (catalogError) {
      throw new Error(
        catalogError.message
      );
    }

    catalogCards =
      (catalogData ??
        []) as CatalogCard[];
  }

  const cardMap =
    new Map(
      catalogCards.map(
        (card) => [
          card.id,
          card,
        ]
      )
    );

  const wagerCards =
    instances
      .map(
        (instance) => {
          const card =
            cardMap.get(
              instance
                .card_catalog_id
            );

          if (!card) {
            return null;
          }

          return {
            instance,
            card,
          };
        }
      )
      .filter(
        (
          entry
        ): entry is {
          instance: CardInstance;
          card: CatalogCard;
        } =>
          Boolean(entry)
      )
      .sort(
        (
          a,
          b
        ) =>
          a.card.name.localeCompare(
            b.card.name
          )
      );

  // ======================================================
  // NO ACTIVE DECK
  // ======================================================

  if (!activeDeck) {
    return (
      <main className="relative min-h-screen overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-amber-400/[0.05] blur-[150px]" />

          <div className="absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-violet-500/[0.05] blur-[160px]" />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 py-6 sm:px-6">
          <nav>
            <Link
              href="/matches"
              className="inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300"
            >
              <ArrowLeft
                size={17}
              />

              Back to Duels
            </Link>
          </nav>

          <section className="panel mt-6 p-8 text-center">
            <Layers3
              size={36}
              className="mx-auto text-zinc-600"
            />

            <h1 className="mt-4 text-2xl font-black">
              No Active Ready Deck
            </h1>

            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-zinc-500">
              You need an Active Ready Deck before you can challenge another duelist.
            </p>

            <Link
              href="/decks"
              className="primary-button mt-6 inline-flex items-center gap-2"
            >
              <Layers3
                size={17}
              />

              Go to Decks
            </Link>
          </section>
        </div>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* BACKGROUND */}

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-amber-400/[0.05] blur-[150px]" />

        <div className="absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-violet-500/[0.06] blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ==================================================
            NAV
        ================================================== */}

        <nav className="flex flex-wrap items-center gap-3">
          <Link
            href="/matches"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300 transition-all hover:-translate-x-0.5 hover:border-amber-300/40 hover:bg-amber-300/10 active:scale-95"
          >
            <ArrowLeft
              size={17}
            />

            Back to Duels
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

        {/* ==================================================
            HERO
        ================================================== */}

        <header className="arena-frame relative mt-6 overflow-hidden rounded-[28px] border border-red-300/10 bg-gradient-to-br from-white/[0.045] via-black/45 to-black/75 p-6 shadow-[0_30px_100px_rgba(0,0,0,.45)] sm:p-8">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-red-500/[0.06] blur-[100px]" />

            <div className="absolute bottom-[-100px] left-[25%] h-64 w-64 rounded-full bg-violet-500/[0.05] blur-[100px]" />
          </div>

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-red-300/20 bg-red-300/[0.06] px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-red-200">
                <Swords
                  size={12}
                />

                Challenge Arena
              </div>

              <h1 className="gold-text mt-5 text-4xl font-black sm:text-5xl">
                Issue a Challenge
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                Choose your rival, decide whether the duel is official or practice, and raise the stakes if you dare.
              </p>
            </div>

            <div className="grid min-w-[260px] gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-xl border border-cyan-300/15 bg-black/30 p-4">
                <div className="flex items-center gap-2">
                  <Zap
                    size={14}
                    className="text-cyan-300"
                  />

                  <p className="text-[9px] font-black uppercase tracking-[.18em] text-cyan-300">
                    Available DP
                  </p>
                </div>

                <p className="mt-2 text-2xl font-black text-cyan-100">
                  {duelPoints}
                </p>
              </div>

              <div className="rounded-xl border border-violet-300/15 bg-black/30 p-4">
                <p className="text-[9px] font-black uppercase tracking-[.18em] text-violet-300">
                  Boss Monster
                </p>

                <p className="mt-2 truncate text-sm font-black text-zinc-200">
                  {myBoss?.name ??
                    "Unbound"}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* ==================================================
            ACTIVE DECK
        ================================================== */}

        <section className="panel mt-5 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05]">
              <ShieldCheck
                size={19}
                className="text-cyan-300"
              />
            </div>

            <div>
              <p className="text-[9px] font-black uppercase tracking-[.18em] text-zinc-600">
                Active Battle Deck
              </p>

              <p className="mt-1 font-black text-cyan-100">
                {activeDeck.name}
              </p>
            </div>
          </div>

          <span className="w-fit rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-200">
            Battle Ready
          </span>
        </section>

        {/* ==================================================
            CHALLENGE FORM
        ================================================== */}

        <form
          action={
            createMatchChallenge
          }
          className="mt-6 space-y-6"
        >
          {/* ================================================
              1. OPPONENT
          ================================================ */}

          <section className="panel p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-300/15 bg-amber-300/[0.05]">
                <UserRound
                  size={17}
                  className="text-amber-300"
                />
              </div>

              <div>
                <p className="text-[9px] font-black uppercase tracking-[.18em] text-amber-300">
                  Step 1
                </p>

                <h2 className="mt-1 text-xl font-black">
                  Choose Your Rival
                </h2>
              </div>
            </div>

            {profiles.length ===
            0 ? (
              <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 text-sm text-zinc-500">
                No other duelists are available in your league.
              </div>
            ) : (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {profiles.map(
                  (profile) => {
                    const boss =
                      profile
                        .boss_monster_option_id
                        ? bossMap.get(
                            profile
                              .boss_monster_option_id
                          )
                        : null;

                    return (
                      <label
                        key={
                          profile.id
                        }
                        className="group relative cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="opponent_id"
                          value={
                            profile.id
                          }
                          defaultChecked={
                            profile.id ===
                            preselectedOpponentId
                          }
                          required
                          className="peer sr-only"
                        />

                        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-all group-hover:border-amber-300/20 peer-checked:border-amber-300/40 peer-checked:bg-amber-300/[0.06] peer-checked:shadow-[0_0_30px_rgba(252,211,77,.05)]">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-lg font-black text-zinc-100">
                                {playerName(
                                  profile
                                )}
                              </p>

                              <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-zinc-600">
                                {profile.custom_title ??
                                  "League Duelist"}
                              </p>
                            </div>

                            <UserRound
                              size={20}
                              className="text-zinc-600 transition group-hover:text-amber-300"
                            />
                          </div>

                          <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/[0.05] bg-black/20 p-3">
                            <Sparkles
                              size={14}
                              className="text-violet-300"
                            />

                            <div>
                              <p className="text-[8px] font-black uppercase tracking-wider text-zinc-600">
                                Boss Monster
                              </p>

                              <p className="mt-1 text-xs font-black text-violet-200">
                                {boss?.name ??
                                  "Unbound"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </label>
                    );
                  }
                )}
              </div>
            )}
          </section>

          {/* ================================================
              2. DUEL TYPE
          ================================================ */}

          <section className="panel p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-300/15 bg-red-300/[0.05]">
                <Swords
                  size={17}
                  className="text-red-300"
                />
              </div>

              <div>
                <p className="text-[9px] font-black uppercase tracking-[.18em] text-red-300">
                  Step 2
                </p>

                <h2 className="mt-1 text-xl font-black">
                  Choose Duel Type
                </h2>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {/* LEAGUE */}

              <label className="group cursor-pointer">
                <input
                  type="radio"
                  name="match_type"
                  value="league"
                  defaultChecked
                  className="peer sr-only"
                />

                <div className="h-full rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-all group-hover:border-amber-300/20 peer-checked:border-amber-300/40 peer-checked:bg-amber-300/[0.055]">
                  <div className="flex items-center gap-3">
                    <Trophy
                      size={22}
                      className="text-amber-300"
                    />

                    <div>
                      <p className="text-lg font-black text-amber-100">
                        League Duel
                      </p>

                      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-amber-300/60">
                        Official Competition
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-zinc-500">
                    Counts toward League Ranking. No wagers are allowed.
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-2.5 py-1 text-[9px] font-black text-emerald-200">
                      WIN +100 DP
                    </span>

                    <span className="rounded-full border border-zinc-500/20 bg-zinc-500/[0.05] px-2.5 py-1 text-[9px] font-black text-zinc-300">
                      DRAW +75 DP
                    </span>

                    <span className="rounded-full border border-red-400/20 bg-red-400/[0.05] px-2.5 py-1 text-[9px] font-black text-red-200">
                      LOSS +50 DP
                    </span>
                  </div>
                </div>
              </label>

              {/* PRACTICE */}

              <label className="group cursor-pointer">
                <input
                  type="radio"
                  name="match_type"
                  value="practice"
                  className="peer sr-only"
                />

                <div className="h-full rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-all group-hover:border-violet-300/20 peer-checked:border-violet-300/40 peer-checked:bg-violet-300/[0.055]">
                  <div className="flex items-center gap-3">
                    <Sparkles
                      size={22}
                      className="text-violet-300"
                    />

                    <div>
                      <p className="text-lg font-black text-violet-100">
                        Practice Duel
                      </p>

                      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-violet-300/60">
                        Friendly Battle
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-zinc-500">
                    No League Ranking impact and no automatic DP rewards. Optional stakes are allowed.
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-2.5 py-1 text-[9px] font-black text-cyan-200">
                      DP WAGER
                    </span>

                    <span className="rounded-full border border-red-300/20 bg-red-300/[0.05] px-2.5 py-1 text-[9px] font-black text-red-200">
                      CARD WAGER
                    </span>
                  </div>
                </div>
              </label>
            </div>
          </section>

          {/* ================================================
              3. PRACTICE WAGER
          ================================================ */}

          <section className="panel p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-300/15 bg-violet-300/[0.05]">
                <Crown
                  size={17}
                  className="text-violet-300"
                />
              </div>

              <div>
                <p className="text-[9px] font-black uppercase tracking-[.18em] text-violet-300">
                  Step 3
                </p>

                <h2 className="mt-1 text-xl font-black">
                  Practice Wager
                </h2>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-amber-300/10 bg-amber-300/[0.025] p-4">
              <p className="text-xs leading-5 text-zinc-500">
                League Duels automatically ignore these wager options. Wagers only apply when you selected a Practice Duel.
              </p>
            </div>

            {/* WAGER TYPE */}

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {/* NONE */}

              <label className="group cursor-pointer">
                <input
                  type="radio"
                  name="wager_type"
                  value="none"
                  defaultChecked
                  className="peer sr-only"
                />

                <div className="h-full rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-all group-hover:border-white/20 peer-checked:border-zinc-300/25 peer-checked:bg-white/[0.05]">
                  <ShieldCheck
                    size={18}
                    className="text-zinc-400"
                  />

                  <p className="mt-3 font-black">
                    No Wager
                  </p>

                  <p className="mt-1 text-xs leading-5 text-zinc-600">
                    Just duel for fun.
                  </p>
                </div>
              </label>

              {/* DP */}

              <label className="group cursor-pointer">
                <input
                  type="radio"
                  name="wager_type"
                  value="dp"
                  className="peer sr-only"
                />

                <div className="h-full rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-all group-hover:border-cyan-300/20 peer-checked:border-cyan-300/35 peer-checked:bg-cyan-300/[0.05]">
                  <Coins
                    size={18}
                    className="text-cyan-300"
                  />

                  <p className="mt-3 font-black text-cyan-100">
                    DP Wager
                  </p>

                  <p className="mt-1 text-xs leading-5 text-zinc-600">
                    Both players stake the same amount.
                  </p>
                </div>
              </label>

              {/* CARD */}

              <label className="group cursor-pointer">
                <input
                  type="radio"
                  name="wager_type"
                  value="card"
                  className="peer sr-only"
                />

                <div className="h-full rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-all group-hover:border-red-300/20 peer-checked:border-red-300/35 peer-checked:bg-red-300/[0.04]">
                  <LockKeyhole
                    size={18}
                    className="text-red-300"
                  />

                  <p className="mt-3 font-black text-red-100">
                    Card Wager
                  </p>

                  <p className="mt-1 text-xs leading-5 text-zinc-600">
                    Put a physical card copy on the line.
                  </p>
                </div>
              </label>
            </div>

            {/* DP AMOUNT */}

            <div className="mt-5 rounded-xl border border-cyan-300/10 bg-cyan-300/[0.025] p-4">
              <label>
                <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-cyan-300">
                  <Zap
                    size={13}
                  />

                  DP Stake Per Player
                </span>

                <input
                  type="number"
                  name="wager_dp_amount"
                  min={1}
                  max={
                    duelPoints
                  }
                  defaultValue={25}
                  className="field mt-3 w-full"
                />

                <p className="mt-2 text-xs text-zinc-600">
                  You currently have{" "}
                  <span className="font-black text-cyan-300">
                    {duelPoints} DP
                  </span>
                  . This amount is only used when DP Wager is selected.
                </p>
              </label>
            </div>

            {/* CARD INSTANCE */}

            <div className="mt-4 rounded-xl border border-red-300/10 bg-red-300/[0.02] p-4">
              <label>
                <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-red-300">
                  <LockKeyhole
                    size={13}
                  />

                  Physical Card Copy
                </span>

                <select
                  name="card_instance_id"
                  defaultValue=""
                  className="field mt-3 w-full"
                >
                  <option value="">
                    Select a card copy...
                  </option>

                  {wagerCards.map(
                    ({
                      instance,
                      card,
                    }) => (
                      <option
                        key={
                          instance.id
                        }
                        value={
                          instance.id
                        }
                      >
                        {card.name}
                        {" · Copy #"}
                        {
                          instance.copy_number
                        }
                        {card.game_rarity
                          ? ` · ${card.game_rarity}`
                          : ""}
                      </option>
                    )
                  )}
                </select>

                {wagerCards.length ===
                0 ? (
                  <p className="mt-2 text-xs text-red-300/70">
                    You currently have no unlocked physical card copies available for wagering.
                  </p>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-zinc-600">
                    The selected physical copy is locked immediately after the challenge is created. It cannot be traded or used in another wager until this duel is resolved.
                  </p>
                )}
              </label>
            </div>
          </section>

          {/* ================================================
              FINAL WARNING / SUBMIT
          ================================================ */}

          <section className="relative overflow-hidden rounded-2xl border border-red-300/15 bg-gradient-to-r from-red-500/[0.035] via-black/20 to-violet-500/[0.035] p-6">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-red-500/[0.05] blur-3xl" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Swords
                    size={18}
                    className="text-red-300"
                  />

                  <p className="font-black text-zinc-100">
                    Ready to challenge?
                  </p>
                </div>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                  Your opponent still needs to accept the duel. Practice wagers are not settled until the final result has been confirmed.
                </p>
              </div>

              <SubmitButton
                disabled={
                  profiles.length ===
                  0
                }
                pendingLabel="Sending challenge..."
                className="primary-button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 px-6 transition-all hover:-translate-y-0.5 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send
                  size={17}
                />

                Issue Challenge
              </SubmitButton>
            </div>
          </section>
        </form>
      </div>
    </main>
  );
}