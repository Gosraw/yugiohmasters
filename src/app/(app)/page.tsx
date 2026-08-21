import Link from "next/link";

import type {
  CSSProperties,
} from "react";

import {
  AlertCircle,
  ArrowRight,
  Bell,
  Crown,
  Flame,
  Layers3,
  LibraryBig,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  UserRound,
  Zap,
} from "lucide-react";

import {
  SamoRivalIntro,
} from "@/components/samo-rival-intro";

import {
  BossMonsterCompanion,
} from "@/components/boss-monster-companion";

import {
  getCurrentProfile,
  requireUser,
} from "@/lib/supabase/queries";

import {
  computeAttentionItems,
} from "@/lib/attention-items";

export const dynamic =
  "force-dynamic";

type Profile = {
  id: string;
  username: string | null;
  duelist_name: string;
  boss_monster_option_id: string | null;
  duel_points: number;
  boss_personality:
    | "sarcastic"
    | "arrogant"
    | "ruthless"
    | "honorable"
    | "chaotic"
    | "supportive"
    | null;
};

type BossMonsterOption = {
  id: string;
  name: string;
  subtitle: string | null;
  image_url: string | null;
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

type Match = {
  id: string;

  status:
    | "pending"
    | "accepted"
    | "result_submitted"
    | "disputed"
    | "completed"
    | "cancelled"
    | "declined";

  winner_id:
    | string
    | null;

  player_one_id: string;
  player_two_id: string;

  result_submitted_by:
    | string
    | null;
};

type Trade = {
  id: string;

  status:
    | "draft"
    | "pending"
    | "accepted"
    | "declined"
    | "cancelled";

  sender_id: string;
  receiver_id: string;
};

function displayName(
  profile: Profile
) {
  return (
    profile.duelist_name ??
    profile.username ??
    "Duelist"
  );
}

export default async function DashboardPage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const profile =
    (await getCurrentProfile()) as Profile;

  // ======================================================
  // BOSS MONSTER
  // ======================================================

  let bossMonster:
    BossMonsterOption | null =
    null;

  if (
    profile.boss_monster_option_id
  ) {
    const {
      data: bossData,
      error: bossError,
    } = await supabase
      .from("boss_monster_options")
      .select(
        "id,name,subtitle,image_url"
      )
      .eq(
        "id",
        profile.boss_monster_option_id
      )
      .eq(
        "active",
        true
      )
      .maybeSingle();

    if (bossError) {
      throw new Error(
        bossError.message
      );
    }

    bossMonster =
      bossData as BossMonsterOption | null;
  }

  // ======================================================
  // LEAGUE
  // ======================================================

  const {
    data: membership,
  } = await supabase
    .from("league_members")
    .select(
      "league_id"
    )
    .eq(
      "profile_id",
      userId
    )
    .limit(1)
    .maybeSingle();

  const leagueId =
    membership?.league_id ??
    null;

  // ======================================================
  // ACTIVE DECK
  // ======================================================

  let activeDeck:
    Deck | null =
    null;

  if (leagueId) {
    const {
      data: deckData,
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
        "is_active",
        true
      )
      .limit(1)
      .maybeSingle();

    activeDeck =
      deckData as Deck | null;
  }

  // ======================================================
  // MATCHES
  // ======================================================

  let matches:
    Match[] =
    [];

  if (leagueId) {
    const {
      data: matchData,
    } = await supabase
      .from("matches")
      .select(
        "id,status,winner_id,player_one_id,player_two_id,result_submitted_by"
      )
      .eq(
        "league_id",
        leagueId
      )
      .or(
        `player_one_id.eq.${userId},player_two_id.eq.${userId}`
      );

    matches =
      (matchData ?? []) as Match[];
  }

  const completedMatches =
    matches.filter(
      (match) =>
        match.status ===
        "completed"
    );

  const wins =
    completedMatches.filter(
      (match) =>
        match.winner_id ===
        userId
    ).length;

  const losses =
    completedMatches.filter(
      (match) =>
        match.winner_id !==
          null &&
        match.winner_id !==
          userId
    ).length;

  const activeMatches =
    matches.filter(
      (match) =>
        match.status ===
          "pending" ||
        match.status ===
          "accepted" ||
        match.status ===
          "result_submitted"
    ).length;

  // ======================================================
  // TRADES
  // ======================================================

  let trades:
    Trade[] =
    [];

  if (leagueId) {
    const {
      data: tradeData,
    } = await supabase
      .from("trades")
      .select(
        "id,status,sender_id,receiver_id"
      )
      .eq(
        "league_id",
        leagueId
      )
      .or(
        `sender_id.eq.${userId},receiver_id.eq.${userId}`
      );

    trades =
      (tradeData ?? []) as Trade[];
  }

  const pendingTrades =
    trades.filter(
      (trade) =>
        trade.status ===
        "pending"
    ).length;

  // ======================================================
  // NEEDS YOUR ATTENTION
  //
  // Shared with the /attention page and the bottom nav badge
  // via src/lib/attention-items.ts, so they always agree.
  // ======================================================

  const actionItems = computeAttentionItems(
    matches,
    trades,
    userId
  );

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="relative min-h-screen overflow-hidden"> <SamoRivalIntro
  username={
    profile.username
  }
/>
      {/* BACKGROUND */}

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-amber-400/[0.07] blur-[150px]" />

        <div className="absolute -right-40 top-20 h-[480px] w-[480px] rounded-full bg-violet-500/[0.07] blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        {/* ==================================================
            TOP
        ================================================== */}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[.3em] text-amber-300">
              DUELIST CIRCLE
            </p>

            <p className="mt-1 text-sm text-zinc-500">
              Private League Arena
            </p>
          </div>

          <Link
            href="/profile"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-black text-zinc-300 transition-all hover:-translate-y-0.5 hover:border-amber-300/25 hover:bg-white/[0.06] hover:text-amber-200 active:scale-[0.97]"
          >
            <UserRound size={16} />

            {displayName(profile)}
          </Link>
        </div>

        {/* ==================================================
            HERO
        ================================================== */}

        <section className="arena-frame relative mt-6 overflow-hidden rounded-[28px] border border-amber-300/15 bg-gradient-to-br from-white/[0.045] via-black/45 to-black/70 shadow-[0_30px_100px_rgba(0,0,0,.45)]">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-amber-400/[0.06] blur-[120px]" />

            <div className="absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-violet-500/[0.07] blur-[130px]" />

            <div
              className="spell-glow -bottom-20 right-[8%] h-72 w-72"
              style={{
                "--glow-color":
                  "rgba(139, 92, 246, .28)",
              } as CSSProperties}
            />
          </div>

          <div className="relative grid lg:grid-cols-[1.08fr_.92fr]">
            {/* LEFT */}

            <div className="relative z-10 flex min-h-[390px] flex-col justify-center p-6 sm:p-8 lg:p-10">
              <div className="energy-line inline-flex w-fit items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-amber-200">
                <Crown size={12} />
                Duelist Hub
              </div>

              <h1 className="mt-5 text-4xl font-black tracking-tight text-zinc-100 sm:text-5xl lg:text-6xl">
                Welcome back,

                <span className="gold-text block">
                  {displayName(
                    profile
                  )}
                </span>
              </h1>

              <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">
                Build your deck, challenge rivals, trade cards and rise through the league.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/matches/new"
                  className="primary-button inline-flex cursor-pointer items-center justify-center gap-2 transition-all hover:-translate-y-0.5 active:scale-[0.97]"
                >
                  <Swords size={17} />
                  Challenge Player
                </Link>

                <Link
                  href="/decks"
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-black text-zinc-300 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:text-white active:scale-[0.97]"
                >
                  <Layers3 size={17} />
                  Manage Decks
                </Link>

                <Link
                  href="/duel-companion"
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-black text-zinc-300 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:text-white active:scale-[0.97]"
                >
                  <Zap size={17} />
                  Duel Companion
                </Link>
              </div>
            </div>

            {/* BOSS MONSTER */}

            <div className="relative min-h-[390px] border-t border-white/[0.05] bg-black/[0.10] p-5 sm:p-6 lg:border-l lg:border-t-0">
              <BossMonsterCompanion
                bossName={
                  bossMonster?.name ??
                  null
                }
                bossSubtitle={
                  bossMonster?.subtitle ??
                  null
                }
                bossImageUrl={
                  bossMonster?.image_url ??
                  null
                }
                personality={
  profile.boss_personality
}
                wins={wins}
                losses={losses}
                activeMatches={
                  activeMatches
                }
                pendingTrades={
                  pendingTrades
                }
                hasActiveDeck={Boolean(
                  activeDeck
                )}
              />
            </div>
          </div>
        </section>

        {/* ==================================================
            NEEDS YOUR ATTENTION
        ================================================== */}

        {actionItems.length >
          0 && (
          <section className="mt-6 overflow-hidden rounded-2xl border border-amber-300/20 bg-amber-300/[0.035] p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bell
                  size={17}
                  className="text-amber-300"
                />

                <p className="text-xs font-black tracking-[.2em] text-amber-300">
                  NEEDS YOUR ATTENTION
                </p>
              </div>

              <Link
                href="/attention"
                className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-amber-300/70 transition hover:text-amber-200"
              >
                View all
              </Link>
            </div>

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {actionItems.map(
                (item) => (
                  <Link
                    key={
                      item.id
                    }
                    href={
                      item.href
                    }
                    className="group flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-amber-300/25 hover:bg-black/30 active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-3">
                      <AlertCircle
                        size={16}
                        className="shrink-0 text-amber-300"
                      />

                      <div>
                        <p className="text-sm font-black text-zinc-200 group-hover:text-amber-100">
                          {
                            item.label
                          }
                        </p>

                        <p className="text-xs text-zinc-500">
                          {
                            item.hint
                          }
                        </p>
                      </div>
                    </div>

                    <ArrowRight
                      size={15}
                      className="shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-amber-300"
                    />
                  </Link>
                )
              )}
            </div>
          </section>
        )}

 {/* ==================================================
    DUELIST PROGRESSION
================================================== */}

<section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
  {/* WINS */}

  <div className="panel relative min-h-[112px] overflow-hidden p-5">
    <Trophy
      size={42}
      className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-white opacity-[0.045]"
    />

    <p className="relative text-xs font-black uppercase tracking-wider text-zinc-500">
      Wins
    </p>

    <p className="relative mt-2 text-3xl font-black text-emerald-200">
      {wins}
    </p>
  </div>

  {/* LOSSES */}

  <div className="panel relative min-h-[112px] overflow-hidden p-5">
    <Flame
      size={42}
      className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-white opacity-[0.045]"
    />

    <p className="relative text-xs font-black uppercase tracking-wider text-zinc-500">
      Losses
    </p>

    <p className="relative mt-2 text-3xl font-black text-red-200">
      {losses}
    </p>
  </div>

  {/* ACTIVE DUELS */}

  <div className="panel relative min-h-[112px] overflow-hidden p-5">
    <Swords
      size={42}
      className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-white opacity-[0.045]"
    />

    <p className="relative text-xs font-black uppercase tracking-wider text-zinc-500">
      Active Duels
    </p>

    <p className="relative mt-2 text-3xl font-black text-cyan-200">
      {activeMatches}
    </p>
  </div>

  {/* TRADES */}

  <div className="panel relative min-h-[112px] overflow-hidden p-5">
    <Repeat2
      size={42}
      className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-white opacity-[0.045]"
    />

    <p className="relative text-xs font-black uppercase tracking-wider text-zinc-500">
      Pending Trades
    </p>

    <p className="relative mt-2 text-3xl font-black text-amber-200">
      {pendingTrades}
    </p>
  </div>

  {/* DUEL POINTS */}

  <Link
    href="/matches"
    className="panel group relative min-h-[112px] overflow-hidden p-5 transition-all hover:-translate-y-1 hover:border-cyan-300/25"
  >
    <Zap
      size={44}
      className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-cyan-300 opacity-[0.07]"
    />

    <p className="relative text-xs font-black uppercase tracking-wider text-cyan-300">
      Duel Points
    </p>

    <p className="relative mt-2 text-3xl font-black text-cyan-100">
      {profile.duel_points ?? 0}
    </p>

    <p className="relative mt-1 text-[9px] font-black uppercase tracking-wider text-zinc-600">
      DP Balance
    </p>
  </Link>
</section>

{/* ==================================================
    PROGRESSION + ACTIVE DECK
================================================== */}

<section className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
  {/* ACTIVE DECK */}

  <div className="panel relative overflow-hidden p-6">
    <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-cyan-400/[0.04] blur-3xl" />

    <div className="relative">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black tracking-[.2em] text-cyan-300">
            ACTIVE DECK
          </p>

          <h2 className="mt-2 text-2xl font-black">
            Battle Ready
          </h2>
        </div>

        <ShieldCheck
          size={24}
          className="text-cyan-300"
        />
      </div>

      {activeDeck ? (
        <div className="mt-5">
          <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.03] p-5">
            <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
              Current Deck
            </p>

            <p className="mt-2 text-xl font-black text-cyan-100">
              {activeDeck.name}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase text-emerald-200">
                Ready
              </span>

              <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase text-cyan-200">
                Active
              </span>
            </div>
          </div>

          <Link
            href={`/decks/${activeDeck.id}`}
            className="mt-4 inline-flex items-center gap-2 text-sm font-black text-cyan-300 transition hover:text-cyan-200"
          >
            Open Active Deck
            <ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-5">
          <p className="font-black text-zinc-300">
            No Active Deck
          </p>

          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Build a deck, mark it Ready and set it as Active before challenging players.
          </p>

          <Link
            href="/decks"
            className="mt-4 inline-flex items-center gap-2 text-sm font-black text-amber-300 transition hover:text-amber-200"
          >
            Go to Decks
            <ArrowRight size={15} />
          </Link>
        </div>
      )}
    </div>
  </div>

  {/* DUELIST PROGRESSION */}

  <div className="panel relative overflow-hidden p-6">
    <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-400/[0.05] blur-3xl" />

    <div className="relative">
      <div className="flex items-center gap-2">
        <Sparkles
          size={17}
          className="text-amber-300"
        />

        <p className="text-xs font-black tracking-[.2em] text-amber-300">
          DUELIST PROGRESSION
        </p>
      </div>

      <h2 className="mt-3 text-2xl font-black">
        Build Your Legacy
      </h2>

      <p className="mt-2 text-sm leading-6 text-zinc-500">
        League victories, rivalries, collecting, deck building, trades and wagers all shape your duelist legacy.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {/* DP */}

        <div className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.025] p-4">
          <p className="text-[9px] font-black uppercase tracking-wider text-cyan-300">
            Duel Points
          </p>

          <p className="mt-2 text-2xl font-black text-cyan-100">
            {profile.duel_points ?? 0}
          </p>

          <p className="mt-1 text-[9px] text-zinc-600">
            Earned in League Duels
          </p>
        </div>

        {/* IDENTITY */}

        <div className="rounded-xl border border-violet-300/10 bg-violet-300/[0.025] p-4">
          <p className="text-[9px] font-black uppercase tracking-wider text-violet-300">
            Boss Monster
          </p>

          <p className="mt-2 truncate font-black text-violet-100">
            {bossMonster?.name ??
              "Unbound"}
          </p>

          <p className="mt-1 text-[9px] text-zinc-600">
            Duelist Companion
          </p>
        </div>
      </div>

      {/* ACHIEVEMENTS CTA */}

      <Link
        href="/achievements"
        className="group mt-4 block rounded-2xl border border-amber-300/15 bg-gradient-to-r from-amber-300/[0.045] to-violet-300/[0.035] p-4 transition-all hover:-translate-y-0.5 hover:border-amber-300/30"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[.18em] text-amber-300">
              Achievements
            </p>

            <p className="mt-1 font-black text-zinc-200">
              Open Trophy Cabinet
            </p>

            <p className="mt-1 text-xs text-zinc-600">
              Track milestones, streaks and collection goals.
            </p>
          </div>

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/15 bg-amber-300/[0.05]">
            <Trophy
              size={18}
              className="text-amber-300 transition-transform group-hover:scale-110"
            />
          </div>
        </div>
      </Link>

      {/* PROFILE */}

      <Link
        href="/profile"
        className="mt-4 inline-flex items-center gap-2 text-sm font-black text-violet-300 transition hover:text-violet-200"
      >
        Customize Duelist Identity
        <ArrowRight size={15} />
      </Link>
    </div>
  </div>
</section>

         {/* ==================================================
            QUICK ACTIONS
        ================================================== */}

        <section className="mt-7">
          <p className="text-xs font-black tracking-[.22em] text-zinc-500">
            QUICK ACTIONS
          </p>

          <h2 className="mt-1 text-2xl font-black">
            Enter the Arena
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* COLLECTION */}

            <Link
              href="/cards/collection"
              className="panel group cursor-pointer p-5 transition-all hover:-translate-y-1 hover:border-amber-300/25 active:scale-[0.99]"
            >
              <LibraryBig
                size={24}
                className="text-amber-300 transition-transform group-hover:scale-110"
              />

              <h3 className="mt-4 text-lg font-black transition group-hover:text-amber-200">
                Collection
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Browse every physical card you own.
              </p>
            </Link>

            {/* DECKS */}

            <Link
              href="/decks"
              className="panel group cursor-pointer p-5 transition-all hover:-translate-y-1 hover:border-cyan-300/25 active:scale-[0.99]"
            >
              <Layers3
                size={24}
                className="text-cyan-300 transition-transform group-hover:scale-110"
              />

              <h3 className="mt-4 text-lg font-black transition group-hover:text-cyan-200">
                Decks
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Build and manage your battle decks.
              </p>
            </Link>

            {/* DUELS */}

            <Link
              href="/matches"
              className="panel group cursor-pointer p-5 transition-all hover:-translate-y-1 hover:border-red-300/25 active:scale-[0.99]"
            >
              <Swords
                size={24}
                className="text-red-300 transition-transform group-hover:scale-110"
              />

              <h3 className="mt-4 text-lg font-black transition group-hover:text-red-200">
                Duels
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Challenge rivals and record duel results.
              </p>
            </Link>

            {/* TRADES */}

            <Link
              href="/trades"
              className="panel group cursor-pointer p-5 transition-all hover:-translate-y-1 hover:border-violet-300/25 active:scale-[0.99]"
            >
              <Repeat2
                size={24}
                className="text-violet-300 transition-transform group-hover:scale-110"
              />

              <h3 className="mt-4 text-lg font-black transition group-hover:text-violet-200">
                Trades
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Exchange cards with league members.
              </p>
            </Link>

            {/* LEAGUE */}

            <Link
              href="/league"
              className="panel group cursor-pointer p-5 transition-all hover:-translate-y-1 hover:border-emerald-300/25 active:scale-[0.99]"
            >
              <ShieldCheck
                size={24}
                className="text-emerald-300 transition-transform group-hover:scale-110"
              />

              <h3 className="mt-4 text-lg font-black transition group-hover:text-emerald-200">
                League
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                View rankings, rivalries and league standings.
              </p>
            </Link>

            {/* COMPETITIONS */}

            <Link
              href="/competitions"
              className="panel group cursor-pointer p-5 transition-all hover:-translate-y-1 hover:border-orange-300/25 active:scale-[0.99]"
            >
              <Trophy
                size={24}
                className="text-orange-300 transition-transform group-hover:scale-110"
              />

              <h3 className="mt-4 text-lg font-black transition group-hover:text-orange-200">
                Competitions
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Join official competitions and track live standings.
              </p>
            </Link>

            {/* SHOP */}

            <Link
              href="/shop"
              className="panel group cursor-pointer p-5 transition-all hover:-translate-y-1 hover:border-amber-300/25 active:scale-[0.99]"
            >
              <Sparkles
                size={24}
                className="text-amber-300 transition-transform group-hover:scale-110"
              />

              <h3 className="mt-4 text-lg font-black transition group-hover:text-amber-200">
                Shop
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Spend Duel Points on packs and rotating cards.
              </p>
            </Link>

            {/* PROFILE */}

            <Link
              href="/profile"
              className="panel group cursor-pointer p-5 transition-all hover:-translate-y-1 hover:border-violet-300/25 active:scale-[0.99]"
            >
              <Crown
                size={24}
                className="text-violet-300 transition-transform group-hover:scale-110"
              />

              <h3 className="mt-4 text-lg font-black transition group-hover:text-violet-200">
                Profile
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Customize your duelist identity and Boss Monster.
              </p>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}