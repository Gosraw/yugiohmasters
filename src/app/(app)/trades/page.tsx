import Link from "next/link";

import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  Home,
  History,
  LockKeyhole,
  MessageSquareText,
  Plus,
  Repeat2,
  Send,
  Shuffle,
  Sparkles,
  UserRound,
  XCircle,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  getPrimaryBossIdentities,
  type BossIdentity,
} from "@/lib/boss-identity";

export const dynamic =
  "force-dynamic";

// =========================================================
// TYPES
// =========================================================

type TradeStatus =
  | "draft"
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled";

type Trade = {
  id: string;

  sender_id: string;
  receiver_id: string;

  status: TradeStatus;

  message:
    | string
    | null;

  created_at: string;

  submitted_at:
    | string
    | null;

  completed_at:
    | string
    | null;

  parent_trade_id:
    | string
    | null;

  superseded_by:
    | string
    | null;

  expires_at:
    | string
    | null;

  auto_expired: boolean;
};

type Profile = {
  id: string;

  username:
    | string
    | null;

  duelist_name: string;

  custom_title:
    | string
    | null;

};

type TradeCardProps = {
  trade: Trade;

  userId: string;

  profiles: Map<
    string,
    Profile
  >;

  bosses: Map<
    string,
    BossIdentity
  >;
};

// =========================================================
// HELPERS
// =========================================================

function playerName(
  profile:
    | Profile
    | undefined
) {
  return (
    profile?.duelist_name ??
    profile?.username ??
    "Unknown Duelist"
  );
}

function formatDate(
  value:
    | string
    | null
) {
  if (!value) {
    return "—";
  }

  return new Date(
    value
  ).toLocaleString(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

// P1A: 24h server-enforced trade expiry - purely a display
// helper, the actual enforcement lives in accept_trade() and
// expire_stale_trades() (see 202609012300_trade_offer_expiry.sql).
function formatExpiry(
  expiresAt: string | null
): string | null {
  if (!expiresAt) {
    return null;
  }

  const msRemaining =
    new Date(expiresAt).getTime() - Date.now();

  if (msRemaining <= 0) {
    return "Expiring...";
  }

  const hoursRemaining = Math.floor(
    msRemaining / (1000 * 60 * 60)
  );

  if (hoursRemaining >= 1) {
    return `Expires in ${hoursRemaining}h`;
  }

  const minutesRemaining = Math.max(
    1,
    Math.floor(msRemaining / (1000 * 60))
  );

  return `Expires in ${minutesRemaining}m`;
}

function TradeStatusBadge({
  status,
  countered,
  autoExpired,
}: {
  status: TradeStatus;
  countered?: boolean;
  autoExpired?: boolean;
}) {
  if (
    status ===
      "declined" &&
    autoExpired
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-400/30 bg-orange-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-orange-200">
        <Clock3
          size={10}
        />

        Expired
      </span>
    );
  }

  if (
    status ===
      "declined" &&
    countered
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-violet-200">
        <Shuffle
          size={10}
        />

        Countered
      </span>
    );
  }

  if (
    status ===
    "pending"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-amber-200">
        <Clock3
          size={10}
        />

        Pending
      </span>
    );
  }

  if (
    status ===
    "accepted"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-200">
        <CheckCircle2
          size={10}
        />

        Completed
      </span>
    );
  }

  if (
    status ===
    "declined"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-red-200">
        <XCircle
          size={10}
        />

        Declined
      </span>
    );
  }

  if (
    status ===
    "cancelled"
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-zinc-400">
        <XCircle
          size={10}
        />

        Cancelled
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-200">
      <Sparkles
        size={10}
      />

      Draft
    </span>
  );
}

function bossName(
  profile:
    | Profile
    | undefined,
  bosses: Map<
    string,
    BossIdentity
  >
) {
  if (!profile) {
    return "Unbound";
  }

  return (
    bosses.get(profile.id)
      ?.name ?? "Unbound"
  );
}

// =========================================================
// TRADE CARD
// =========================================================

function TradeCard({
  trade,
  userId,
  profiles,
  bosses,
}: TradeCardProps) {
  const isSender =
    trade.sender_id ===
    userId;

  const partnerId =
    isSender
      ? trade.receiver_id
      : trade.sender_id;

  const partner =
    profiles.get(
      partnerId
    );

  const me =
    profiles.get(
      userId
    );

  const date =
    trade.completed_at ??
    trade.submitted_at ??
    trade.created_at;

  return (
    <Link
      href={`/trades/${trade.id}`}
      className="panel group block cursor-pointer overflow-hidden p-5 transition-all duration-150 hover:-translate-y-1 hover:border-amber-300/20 active:scale-[0.99]"
    >
      {/* HEADER */}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TradeStatusBadge
            status={
              trade.status
            }
            countered={Boolean(
              trade.superseded_by
            )}
            autoExpired={
              trade.auto_expired
            }
          />

          <span
            className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${
              isSender
                ? "border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-200"
                : "border-violet-300/20 bg-violet-300/[0.06] text-violet-200"
            }`}
          >
            {isSender
              ? "Outgoing"
              : "Incoming"}
          </span>
        </div>

        <p className="text-[9px] font-bold text-zinc-600">
          {formatDate(
            date
          )}
        </p>
      </div>

      {/* PLAYERS */}

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {/* YOU */}

        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[.16em] text-zinc-600">
            You
          </p>

          <p className="mt-1 truncate text-sm font-black text-zinc-100">
            {playerName(
              me
            )}
          </p>

          <p className="mt-1 truncate text-[10px] font-bold text-violet-300">
            {bossName(
              me,
              bosses
            )}
          </p>
        </div>

        {/* TRADE ICON */}

        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-300/15 bg-amber-300/[0.05]">
          <Repeat2
            size={17}
            className="text-amber-300 transition-transform duration-200 group-hover:rotate-180"
          />
        </div>

        {/* PARTNER */}

        <div className="min-w-0 text-right">
          <p className="text-[9px] font-black uppercase tracking-[.16em] text-zinc-600">
            Trade Partner
          </p>

          <p className="mt-1 truncate text-sm font-black text-zinc-100">
            {playerName(
              partner
            )}
          </p>

          <p className="mt-1 truncate text-[10px] font-bold text-violet-300">
            {bossName(
              partner,
              bosses
            )}
          </p>
        </div>
      </div>

      {/* MESSAGE */}

      {trade.message && (
        <div className="mt-5 flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <MessageSquareText
            size={14}
            className="mt-0.5 shrink-0 text-zinc-600"
          />

          <p className="line-clamp-2 text-xs leading-5 text-zinc-500">
            {trade.message}
          </p>
        </div>
      )}

      {/* FOOTER */}

      <div className="mt-5 flex items-center justify-between border-t border-white/[0.05] pt-4">
        <p className="text-[10px] text-zinc-600">
          {trade.status ===
          "draft"
            ? "Build your offer"
            : trade.status ===
                "pending"
              ? `${
                  isSender
                    ? "Waiting for response"
                    : "Your response required"
                } · ${formatExpiry(trade.expires_at) ?? ""}`
              : trade.status ===
                  "accepted"
                ? "Ownership transferred"
                : "Trade closed"}
        </p>

        <span className="text-xs font-black text-amber-300 transition group-hover:text-amber-200">
          Open Trade →
        </span>
      </div>
    </Link>
  );
}

// =========================================================
// PAGE
// =========================================================

export default async function TradesPage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  // ======================================================
  // LEAGUE
  // ======================================================

  const {
    data: membership,
    error:
      membershipError,
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
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="panel p-6">
          Geen league gevonden.
        </div>
      </main>
    );
  }

  const leagueId =
    membership.league_id;

  // P1A: lazily sweep stale trade offers past their 24h expiry
  // into 'declined' + auto_expired = true, so this list reflects
  // expiry promptly rather than waiting for someone to try (and
  // fail) to accept one. Best-effort - a failure here should
  // never block the page from loading.
  await supabase.rpc("expire_stale_trades");

  // ======================================================
  // TRADES
  // ======================================================

  const {
    data: tradeData,
    error: tradeError,
  } = await supabase
    .from("trades")
    .select(
      `
        id,
        sender_id,
        receiver_id,
        status,
        message,
        created_at,
        submitted_at,
        completed_at,
        parent_trade_id,
        superseded_by,
        expires_at,
        auto_expired
      `
    )
    .eq(
      "league_id",
      leagueId
    )
    .or(
      `sender_id.eq.${userId},receiver_id.eq.${userId}`
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    );

  if (tradeError) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="panel p-6">
          <p className="font-bold text-red-300">
            Trades konden niet worden geladen.
          </p>

          <p className="mt-2 text-sm text-zinc-500">
            {
              tradeError.message
            }
          </p>
        </div>
      </main>
    );
  }

  const trades =
    (tradeData ??
      []) as Trade[];

  // ======================================================
  // PROFILES
  // ======================================================

  const profileIds = [
    ...new Set([
      userId,

      ...trades.flatMap(
        (trade) => [
          trade.sender_id,
          trade.receiver_id,
        ]
      ),
    ]),
  ];

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
          custom_title
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

  const profileMap =
    new Map(
      profiles.map(
        (profile) => [
          profile.id,
          profile,
        ]
      )
    );

  // ======================================================
  // BOSS IDENTITIES
  //
  // AUDIT FIX (Season 1 audit, legacy schema-assumption item): this
  // used to join through profiles.boss_monster_option_id ->
  // boss_monster_options, the OLD pre-Boss-Route cosmetic concept
  // that is never set for a Season 1 player (the mandatory
  // onboarding gate sends new players through /boss/select, not the
  // old /onboarding flow that used to write this field) - every
  // trade card showed "Unbound" for a player who has clearly
  // already chosen and is actively progressing a real Boss Route.
  // See src/lib/boss-identity.ts for the shared, corrected lookup
  // (player_boss_paths route_slot 1 -> current-stage evolution
  // card), the same source Home already uses.
  // ======================================================

  const bossMap =
    await getPrimaryBossIdentities(
      supabase,
      profileIds
    );

  // ======================================================
  // GROUPS
  // ======================================================

  const drafts =
    trades.filter(
      (trade) =>
        trade.status ===
          "draft" &&
        trade.sender_id ===
          userId
    );

  const incoming =
    trades.filter(
      (trade) =>
        trade.status ===
          "pending" &&
        trade.receiver_id ===
          userId
    );

  const outgoing =
    trades.filter(
      (trade) =>
        trade.status ===
          "pending" &&
        trade.sender_id ===
          userId
    );

  const history =
    trades.filter(
      (trade) =>
        trade.status ===
          "accepted" ||
        trade.status ===
          "declined" ||
        trade.status ===
          "cancelled"
    );

  const completed =
    trades.filter(
      (trade) =>
        trade.status ===
        "accepted"
    ).length;

  const attentionCount =
    incoming.length;

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* BACKGROUND */}

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-cyan-400/[0.045] blur-[150px]" />

        <div className="absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-violet-500/[0.05] blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ==================================================
            NAVIGATION
        ================================================== */}

        <nav className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300 transition-all hover:border-amber-300/40 hover:bg-amber-300/10 active:scale-95"
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

        {/* ==================================================
            HERO
        ================================================== */}

        <header className="arena-frame relative mt-6 overflow-hidden rounded-[28px] border border-cyan-300/10 bg-gradient-to-br from-white/[0.045] via-black/45 to-black/70 p-6 shadow-[0_30px_100px_rgba(0,0,0,.45)] sm:p-8">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-cyan-400/[0.05] blur-[100px]" />

            <div className="absolute bottom-[-120px] left-[20%] h-64 w-64 rounded-full bg-violet-500/[0.05] blur-[100px]" />
          </div>

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-cyan-200">
                <Repeat2
                  size={12}
                />

                Trade Hub
              </div>

              <h1 className="gold-text mt-5 text-4xl font-black sm:text-5xl">
                Trades
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                Negotiate physical card exchanges with your rivals. Every trade uses real card copies from your Collection.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/trades/new"
                  className="primary-button inline-flex cursor-pointer items-center justify-center gap-2 transition-all active:scale-[0.97]"
                >
                  <Plus
                    size={17}
                  />

                  New Trade
                </Link>

                <Link
                  href="/cards/collection"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-black text-zinc-300 transition hover:border-cyan-300/20 hover:text-cyan-200"
                >
                  <Sparkles
                    size={16}
                  />

                  My Collection
                </Link>

                <Link
                  href="/trades/binder"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-black text-zinc-300 transition hover:border-emerald-300/20 hover:text-emerald-200"
                >
                  <BookOpen
                    size={16}
                  />

                  Trade Binders
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-300/15 bg-black/30 p-5">
              <p className="text-[9px] font-black uppercase tracking-[.18em] text-zinc-600">
                Requires Attention
              </p>

              <p
                className={`mt-2 text-4xl font-black ${
                  attentionCount >
                  0
                    ? "text-amber-200"
                    : "text-zinc-500"
                }`}
              >
                {
                  attentionCount
                }
              </p>

              <p className="mt-1 text-xs text-zinc-600">
                incoming trade
                {attentionCount ===
                1
                  ? ""
                  : "s"}
              </p>
            </div>
          </div>
        </header>

        {/* ==================================================
            STATS
        ================================================== */}

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="panel p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Drafts
            </p>

            <p className="mt-1 text-2xl font-black text-cyan-200">
              {drafts.length}
            </p>
          </div>

          <div className="panel p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Incoming
            </p>

            <p className="mt-1 text-2xl font-black text-amber-200">
              {incoming.length}
            </p>
          </div>

          <div className="panel p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Outgoing
            </p>

            <p className="mt-1 text-2xl font-black text-violet-200">
              {outgoing.length}
            </p>
          </div>

          <div className="panel p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Completed
            </p>

            <p className="mt-1 text-2xl font-black text-emerald-200">
              {completed}
            </p>
          </div>
        </section>

        {/* ==================================================
            INCOMING
        ================================================== */}

        <section className="mt-8">
          <div className="flex items-center gap-3">
            <UserRound
              size={18}
              className="text-amber-300"
            />

            <div>
              <p className="text-[9px] font-black uppercase tracking-[.2em] text-amber-300">
                Incoming Offers
              </p>

              <h2 className="mt-1 text-2xl font-black">
                Your Decision
              </h2>
            </div>
          </div>

          {incoming.length ===
          0 ? (
            <div className="panel mt-4 flex flex-col items-center gap-3 p-6 text-center">
              <p className="font-black text-zinc-300">
                No deals on the table.
              </p>

              <Link
                href="/trades/new"
                className="primary-button inline-flex items-center gap-2 px-4 py-2 text-xs"
              >
                Start Trade
              </Link>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {incoming.map(
                (trade) => (
                  <TradeCard
                    key={
                      trade.id
                    }
                    trade={
                      trade
                    }
                    userId={
                      userId
                    }
                    profiles={
                      profileMap
                    }
                    bosses={
                      bossMap
                    }
                  />
                )
              )}
            </div>
          )}
        </section>

        {/* ==================================================
            DRAFTS
        ================================================== */}

        {drafts.length >
          0 && (
          <section className="mt-8">
            <div className="flex items-center gap-3">
              <Sparkles
                size={18}
                className="text-cyan-300"
              />

              <div>
                <p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-300">
                  Work in Progress
                </p>

                <h2 className="mt-1 text-2xl font-black">
                  Draft Trades
                </h2>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {drafts.map(
                (trade) => (
                  <TradeCard
                    key={
                      trade.id
                    }
                    trade={
                      trade
                    }
                    userId={
                      userId
                    }
                    profiles={
                      profileMap
                    }
                    bosses={
                      bossMap
                    }
                  />
                )
              )}
            </div>
          </section>
        )}

        {/* ==================================================
            OUTGOING
        ================================================== */}

        {outgoing.length >
          0 && (
          <section className="mt-8">
            <div className="flex items-center gap-3">
              <Send
                size={18}
                className="text-violet-300"
              />

              <div>
                <p className="text-[9px] font-black uppercase tracking-[.2em] text-violet-300">
                  Sent Offers
                </p>

                <h2 className="mt-1 text-2xl font-black">
                  Awaiting Response
                </h2>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {outgoing.map(
                (trade) => (
                  <TradeCard
                    key={
                      trade.id
                    }
                    trade={
                      trade
                    }
                    userId={
                      userId
                    }
                    profiles={
                      profileMap
                    }
                    bosses={
                      bossMap
                    }
                  />
                )
              )}
            </div>
          </section>
        )}

        {/* ==================================================
            HISTORY
        ================================================== */}

        <section className="mt-10 border-t border-white/[0.05] pt-8">
          <div className="flex items-center gap-3">
            <History
              size={18}
              className="text-zinc-500"
            />

            <div>
              <p className="text-[9px] font-black uppercase tracking-[.2em] text-zinc-600">
                Trade History
              </p>

              <h2 className="mt-1 text-2xl font-black text-zinc-300">
                Previous Trades
              </h2>
            </div>
          </div>

          {history.length ===
          0 ? (
            <div className="panel mt-4 p-6">
              <p className="text-sm text-zinc-600">
                No deals finalized yet - the trade block is open for business.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {history.map(
                (trade) => (
                  <TradeCard
                    key={
                      trade.id
                    }
                    trade={
                      trade
                    }
                    userId={
                      userId
                    }
                    profiles={
                      profileMap
                    }
                    bosses={
                      bossMap
                    }
                  />
                )
              )}
            </div>
          )}
        </section>

        {/* ==================================================
            SAFETY
        ================================================== */}

        <section className="panel mt-8 p-5">
          <div className="flex items-start gap-3">
            <LockKeyhole
              size={18}
              className="mt-0.5 shrink-0 text-cyan-300"
            />

            <div>
              <p className="font-black">
                Physical Card Ownership
              </p>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Trade offers use specific physical card copies, but nothing gets reserved just by offering it - the same card can sit in a deck, be marked For Trade, and be offered in several pending trades at once. Ownership only actually changes hands the moment someone accepts, and it&apos;s re-checked live at that exact moment - so if a card was already traded away elsewhere, the accept fails cleanly instead of doing a partial trade.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}