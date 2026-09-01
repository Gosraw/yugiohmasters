import Link from "next/link";

import {
  ArrowLeft,
  Award,
  Ban,
  CheckCircle2,
  ChefHat,
  Clock3,
  Coins,
  Crown,
  Hammer,
  Home,
  Repeat2,
  Rocket,
  ShieldCheck,
  Soup,
  Sparkles,
  Truck,
  UserRound,
  Utensils,
  XCircle,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  requestAchievementClaim,
  approveAchievementClaim,
  rejectAchievementClaim,
} from "@/app/actions/achievements";

import {
  SubmitButton,
} from "@/components/submit-button";

import {
  ConfirmSubmitButton,
} from "@/components/confirm-submit-button";

export const dynamic =
  "force-dynamic";

// =========================================================
// PAY-TO-WIN v1 - REAL-LIFE ACHIEVEMENTS (P1C)
//
// Honor-system board: do a real-life chore or treat, claim it,
// and get another duelist to approve it before it pays out in
// Duel Points. No photos, no receipts - the only "proof" is a
// friend's word. All enforcement (the weekly/one-time cap,
// "not yourself", idempotent approve/reject, THE CREATOR being
// BossG-only) lives in the RPCs from
// 202609012400_p2w_achievements.sql - this page only reflects
// that state back, plus a client-side mirror of the cap so the
// CLAIM button doesn't invite a claim the server would reject
// anyway.
// =========================================================

// ---------------------------------------------------------
// TYPES
// ---------------------------------------------------------

type Cadence = "weekly" | "one_time";

type Achievement = {
  id: string;
  key: string;
  title: string;
  description: string;
  dp_value: number;
  cadence: Cadence;
  eligible_duelist_name: string | null;
  sort_order: number;
};

type ClaimStatus =
  | "pending"
  | "approved"
  | "rejected";

type Claim = {
  id: string;
  achievement_id: string;
  claimant_id: string;
  period_key: string;
  status: ClaimStatus;
  approver_id: string | null;
  created_at: string;
  decided_at: string | null;
};

type Profile = {
  id: string;
  username: string | null;
  duelist_name: string;
};

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------

function playerName(
  profile: Profile | undefined
) {
  return (
    profile?.duelist_name ??
    profile?.username ??
    "Unknown Duelist"
  );
}

function formatDate(value: string) {
  return new Date(
    value
  ).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
    }
  );
}

// Mirrors the Postgres side exactly: to_char(date_trunc('week',
// now()), 'IYYY-"W"IW') is the ISO-8601 week-of-year (Monday
// start), zero-padded to 2 digits, prefixed with the ISO year.
// This is a *display* mirror only - request_achievement_claim()
// computes its own period_key server-side and is the only copy
// that actually matters; if this ever drifted from Postgres the
// worst case is a stale CLAIM button, never a bad payout.
function isoWeekKey(date: Date): string {
  const target = new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    )
  );

  const dayNum =
    (target.getUTCDay() + 6) % 7;

  target.setUTCDate(
    target.getUTCDate() -
      dayNum +
      3
  );

  const isoYear =
    target.getUTCFullYear();

  const jan4 = new Date(
    Date.UTC(isoYear, 0, 4)
  );

  const jan4DayNum =
    (jan4.getUTCDay() + 6) % 7;

  const week1Monday = new Date(
    jan4
  );

  week1Monday.setUTCDate(
    jan4.getUTCDate() -
      jan4DayNum
  );

  const diffDays = Math.round(
    (target.getTime() -
      week1Monday.getTime()) /
      86400000
  );

  const weekNum =
    Math.floor(diffDays / 7) + 1;

  return `${isoYear}-W${String(
    weekNum
  ).padStart(2, "0")}`;
}

function periodKeyFor(
  achievement: Achievement,
  now: Date
): string {
  return achievement.cadence ===
    "weekly"
    ? isoWeekKey(now)
    : "once";
}

const ACHIEVEMENT_ICONS: Record<
  string,
  LucideIcon
> = {
  the_cleaning_phase: Sparkles,
  snack_phase: Soup,
  home_cooked_advantage: ChefHat,
  fast_food_tech: Utensils,
  delivery_from_another_dimension:
    Truck,
  fine_dining_summon: Crown,
  the_creator: Hammer,
};

// ---------------------------------------------------------
// PAGE
// ---------------------------------------------------------

export default async function PerksPage() {
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
    .from("league_members")
    .select("league_id")
    .eq("profile_id", userId)
    .limit(1)
    .maybeSingle();

  if (
    membershipError ||
    !membership
  ) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="panel p-6">
          No league found.
        </div>
      </main>
    );
  }

  const leagueId =
    membership.league_id;

  // ======================================================
  // ACHIEVEMENTS
  // ======================================================

  const {
    data: achievementData,
    error: achievementError,
  } = await supabase
    .from("achievements")
    .select(
      `
        id,
        key,
        title,
        description,
        dp_value,
        cadence,
        eligible_duelist_name,
        sort_order
      `
    )
    .eq("active", true)
    .order("sort_order", {
      ascending: true,
    });

  if (achievementError) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="panel p-6">
          <p className="font-bold text-red-300">
            Achievements could not be loaded.
          </p>

          <p className="mt-2 text-sm text-zinc-500">
            {achievementError.message}
          </p>
        </div>
      </main>
    );
  }

  const achievements =
    (achievementData ??
      []) as Achievement[];

  // ======================================================
  // CLAIMS
  // ======================================================

  const {
    data: claimData,
    error: claimError,
  } = await supabase
    .from("achievement_claims")
    .select(
      `
        id,
        achievement_id,
        claimant_id,
        period_key,
        status,
        approver_id,
        created_at,
        decided_at
      `
    )
    .eq("league_id", leagueId)
    .order("created_at", {
      ascending: false,
    });

  if (claimError) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="panel p-6">
          <p className="font-bold text-red-300">
            Claims could not be loaded.
          </p>

          <p className="mt-2 text-sm text-zinc-500">
            {claimError.message}
          </p>
        </div>
      </main>
    );
  }

  const claims =
    (claimData ??
      []) as Claim[];

  // ======================================================
  // PROFILES
  // ======================================================

  const profileIds = [
    ...new Set([
      userId,
      ...claims.map(
        (claim) =>
          claim.claimant_id
      ),
      ...claims
        .map(
          (claim) =>
            claim.approver_id
        )
        .filter(
          (
            value
          ): value is string =>
            Boolean(value)
        ),
    ]),
  ];

  const {
    data: profileData,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select(
      "id,username,duelist_name"
    )
    .in("id", profileIds);

  if (profileError) {
    throw new Error(
      profileError.message
    );
  }

  const profiles =
    (profileData ??
      []) as Profile[];

  const profileMap = new Map(
    profiles.map((profile) => [
      profile.id,
      profile,
    ])
  );

  const myProfile =
    profileMap.get(userId);

  // ======================================================
  // DERIVED STATE
  // ======================================================

  const now = new Date();

  const pendingClaims =
    claims.filter(
      (claim) =>
        claim.status ===
        "pending"
    );

  const pendingForOthers =
    pendingClaims.filter(
      (claim) =>
        claim.claimant_id !==
        userId
    );

  const pendingOfMine =
    pendingClaims.filter(
      (claim) =>
        claim.claimant_id ===
        userId
    );

  const decidedClaims =
    claims
      .filter(
        (claim) =>
          claim.status !==
          "pending"
      )
      .slice(0, 15);

  const achievementMap = new Map(
    achievements.map(
      (achievement) => [
        achievement.id,
        achievement,
      ]
    )
  );

  type CardState =
    | {
        kind: "claimable";
      }
    | {
        kind: "pending";
      }
    | {
        kind: "already_claimed";
      }
    | {
        kind: "ineligible";
      };

  function stateFor(
    achievement: Achievement
  ): CardState {
    if (
      achievement.eligible_duelist_name &&
      achievement.eligible_duelist_name.toLowerCase() !==
        (
          myProfile?.duelist_name ??
          ""
        ).toLowerCase()
    ) {
      return {
        kind: "ineligible",
      };
    }

    const hasPending =
      claims.some(
        (claim) =>
          claim.achievement_id ===
            achievement.id &&
          claim.claimant_id ===
            userId &&
          claim.status ===
            "pending"
      );

    if (hasPending) {
      return {
        kind: "pending",
      };
    }

    const currentPeriodKey =
      periodKeyFor(
        achievement,
        now
      );

    const alreadyClaimed =
      claims.some(
        (claim) =>
          claim.achievement_id ===
            achievement.id &&
          claim.claimant_id ===
            userId &&
          claim.status ===
            "approved" &&
          claim.period_key ===
            currentPeriodKey
      );

    if (alreadyClaimed) {
      return {
        kind: "already_claimed",
      };
    }

    return {
      kind: "claimable",
    };
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* BACKGROUND */}

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-emerald-400/[0.045] blur-[150px]" />

        <div className="absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-amber-400/[0.05] blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ==================================================
            NAVIGATION
        ================================================== */}

        <nav className="flex flex-wrap items-center gap-3">
          <Link
            href="/explore"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300 transition-all hover:border-amber-300/40 hover:bg-amber-300/10 active:scale-95"
          >
            <ArrowLeft size={17} />
            Back
          </Link>

          <Link
            href="/"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-sm font-bold text-zinc-400 transition-all hover:border-white/20 hover:text-zinc-100"
          >
            <Home size={16} />
            Home
          </Link>
        </nav>

        {/* ==================================================
            HERO
        ================================================== */}

        <header className="arena-frame relative mt-6 overflow-hidden rounded-[28px] border border-emerald-300/10 bg-gradient-to-br from-white/[0.045] via-black/45 to-black/70 p-6 shadow-[0_30px_100px_rgba(0,0,0,.45)] sm:p-8">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-400/[0.05] blur-[100px]" />

            <div className="absolute bottom-[-120px] left-[20%] h-64 w-64 rounded-full bg-amber-500/[0.05] blur-[100px]" />
          </div>

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-emerald-200">
              <Coins size={12} />
              Pay-To-Win
            </div>

            <h1 className="gold-text mt-5 text-4xl font-black sm:text-5xl">
              Real-Life Achievements
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
              Turn real chores and treats into real Duel Points. No photos, no receipts - a claim is only as good as another duelist being willing to approve it. Max one paid-out claim per achievement per week (once, for one-time achievements), and you can never approve your own claim.
            </p>
          </div>
        </header>

        {/* ==================================================
            ACHIEVEMENTS GRID
        ================================================== */}

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-lg font-black text-zinc-200">
            <Award
              size={18}
              className="text-emerald-300"
            />
            Claim an Achievement
          </h2>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {achievements.map(
              (achievement) => {
                const state =
                  stateFor(
                    achievement
                  );

                const Icon =
                  ACHIEVEMENT_ICONS[
                    achievement
                      .key
                  ] ?? Award;

                return (
                  <div
                    key={
                      achievement.id
                    }
                    className={`panel flex flex-col gap-3 p-5 ${
                      state.kind ===
                      "ineligible"
                        ? "opacity-50"
                        : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-300">
                        <Icon
                          size={
                            18
                          }
                        />
                      </div>

                      <div className="flex flex-col items-end gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[11px] font-black text-amber-200">
                          <Coins
                            size={
                              11
                            }
                          />
                          {
                            achievement.dp_value
                          }{" "}
                          DP
                        </span>

                        <span className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
                          {achievement.cadence ===
                          "weekly"
                            ? "Weekly"
                            : "One-Time"}
                        </span>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-black uppercase tracking-wide text-zinc-100">
                        {
                          achievement.title
                        }
                      </p>

                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        {
                          achievement.description
                        }
                      </p>
                    </div>

                    <div className="mt-auto pt-1">
                      {state.kind ===
                        "ineligible" && (
                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-black text-zinc-500">
                          <Ban
                            size={
                              12
                            }
                          />
                          {
                            achievement.eligible_duelist_name
                          }{" "}
                          only
                        </div>
                      )}

                      {state.kind ===
                        "pending" && (
                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/25 bg-amber-300/[0.06] px-3 py-1.5 text-xs font-black text-amber-200">
                          <Clock3
                            size={
                              12
                            }
                          />
                          Pending approval
                        </div>
                      )}

                      {state.kind ===
                        "already_claimed" && (
                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/25 bg-emerald-300/[0.06] px-3 py-1.5 text-xs font-black text-emerald-200">
                          <CheckCircle2
                            size={
                              12
                            }
                          />
                          {achievement.cadence ===
                          "weekly"
                            ? "Claimed this week"
                            : "Already claimed"}
                        </div>
                      )}

                      {state.kind ===
                        "claimable" && (
                        <form
                          action={
                            requestAchievementClaim
                          }
                        >
                          <input
                            type="hidden"
                            name="achievement_key"
                            value={
                              achievement.key
                            }
                          />

                          <input
                            type="hidden"
                            name="return_to"
                            value="/perks"
                          />

                          <SubmitButton
                            pendingLabel="Claiming..."
                            className="primary-button inline-flex w-full cursor-pointer items-center justify-center gap-2 transition-all active:scale-[0.97]"
                          >
                            <Rocket
                              size={
                                14
                              }
                            />
                            Claim
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </section>

        {/* ==================================================
            PENDING APPROVALS (FROM OTHERS)
        ================================================== */}

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-lg font-black text-zinc-200">
            <ShieldCheck
              size={18}
              className="text-cyan-300"
            />
            Waiting On Your Approval
          </h2>

          {pendingForOthers.length ===
          0 ? (
            <div className="panel mt-4 p-5 text-sm text-zinc-500">
              No claims from other duelists are waiting on you right now.
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {pendingForOthers.map(
                (claim) => {
                  const achievement =
                    achievementMap.get(
                      claim.achievement_id
                    );

                  return (
                    <div
                      key={
                        claim.id
                      }
                      className="panel flex flex-wrap items-center justify-between gap-4 p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-300">
                          <UserRound
                            size={
                              17
                            }
                          />
                        </div>

                        <div>
                          <p className="text-sm font-black text-zinc-100">
                            {playerName(
                              profileMap.get(
                                claim.claimant_id
                              )
                            )}{" "}
                            <span className="text-zinc-500">
                              claims
                            </span>{" "}
                            {achievement?.title ??
                              "an achievement"}
                          </p>

                          <p className="mt-0.5 text-xs text-zinc-600">
                            {achievement
                              ? `${achievement.dp_value} DP`
                              : ""}{" "}
                            · Submitted{" "}
                            {formatDate(
                              claim.created_at
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <form
                          action={
                            approveAchievementClaim
                          }
                        >
                          <input
                            type="hidden"
                            name="claim_id"
                            value={
                              claim.id
                            }
                          />

                          <input
                            type="hidden"
                            name="return_to"
                            value="/perks"
                          />

                          <SubmitButton
                            pendingLabel="Approving..."
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-black text-emerald-200 transition-all hover:-translate-y-0.5 hover:bg-emerald-400/20 active:scale-[0.97]"
                          >
                            <CheckCircle2
                              size={
                                13
                              }
                            />
                            Approve
                          </SubmitButton>
                        </form>

                        <form
                          action={
                            rejectAchievementClaim
                          }
                        >
                          <input
                            type="hidden"
                            name="claim_id"
                            value={
                              claim.id
                            }
                          />

                          <input
                            type="hidden"
                            name="return_to"
                            value="/perks"
                          />

                          <ConfirmSubmitButton
                            confirmMessage="Reject this claim?"
                            pendingLabel="Rejecting..."
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-xs font-black text-red-200 transition-all hover:-translate-y-0.5 hover:bg-red-400/20 active:scale-[0.97]"
                          >
                            <XCircle
                              size={
                                13
                              }
                            />
                            Reject
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </section>

        {/* ==================================================
            YOUR PENDING CLAIMS
        ================================================== */}

        {pendingOfMine.length >
          0 && (
          <section className="mt-8">
            <h2 className="flex items-center gap-2 text-lg font-black text-zinc-200">
              <Clock3
                size={18}
                className="text-amber-300"
              />
              Your Pending Claims
            </h2>

            <div className="mt-4 flex flex-col gap-2">
              {pendingOfMine.map(
                (claim) => {
                  const achievement =
                    achievementMap.get(
                      claim.achievement_id
                    );

                  return (
                    <div
                      key={
                        claim.id
                      }
                      className="panel flex items-center justify-between gap-3 p-4 text-sm"
                    >
                      <span className="font-bold text-zinc-200">
                        {achievement?.title ??
                          "Achievement"}
                      </span>

                      <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                        Waiting for another duelist
                      </span>
                    </div>
                  );
                }
              )}
            </div>
          </section>
        )}

        {/* ==================================================
            RECENT DECISIONS
        ================================================== */}

        {decidedClaims.length >
          0 && (
          <section className="mt-8 pb-4">
            <h2 className="flex items-center gap-2 text-lg font-black text-zinc-200">
              <Repeat2
                size={18}
                className="text-zinc-500"
              />
              Recent Claim History
            </h2>

            <div className="panel mt-4 divide-y divide-white/5">
              {decidedClaims.map(
                (claim) => {
                  const achievement =
                    achievementMap.get(
                      claim.achievement_id
                    );

                  return (
                    <div
                      key={
                        claim.id
                      }
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                    >
                      <span className="text-zinc-300">
                        {playerName(
                          profileMap.get(
                            claim.claimant_id
                          )
                        )}{" "}
                        ·{" "}
                        {achievement?.title ??
                          "Achievement"}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider ${
                          claim.status ===
                          "approved"
                            ? "text-emerald-300"
                            : "text-red-300"
                        }`}
                      >
                        {claim.status ===
                        "approved" ? (
                          <CheckCircle2
                            size={
                              12
                            }
                          />
                        ) : (
                          <XCircle
                            size={
                              12
                            }
                          />
                        )}
                        {claim.status ===
                        "approved"
                          ? `Approved by ${playerName(
                              profileMap.get(
                                claim.approver_id ??
                                  ""
                              )
                            )}`
                          : `Rejected by ${playerName(
                              profileMap.get(
                                claim.approver_id ??
                                  ""
                              )
                            )}`}
                      </span>
                    </div>
                  );
                }
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
