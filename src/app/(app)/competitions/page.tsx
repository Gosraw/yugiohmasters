import Link from "next/link";

import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Crown,
  Home,
  Medal,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  Users,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  CompetitionCreateFormV2,
} from "@/components/competition-create-form-v2";

import {
  quickStartTonightCompetition,
} from "@/app/actions/competitions";

import {
  SubmitButton,
} from "@/components/submit-button";

export const dynamic =
  "force-dynamic";

// =========================================================
// TYPES
// =========================================================

type Competition = {
  id: string;

  name: string;

  competition_type:
    | "round_robin"
    | "tournament";

  status:
    | "draft"
    | "active"
    | "completed"
    | "cancelled";

  starts_at:
    | string
    | null;

  completed_at:
    | string
    | null;

  rewards_distributed_at:
    | string
    | null;

  created_at: string;
};

type CompetitionPlayer = {
  competition_id: string;
  profile_id: string;
};

// =========================================================
// HELPERS
// =========================================================

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
  ).toLocaleDateString(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

function statusStyle(
  status:
    Competition["status"]
) {
  if (
    status === "active"
  ) {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  }

  if (
    status ===
    "completed"
  ) {
    return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  }

  if (
    status ===
    "cancelled"
  ) {
    return "border-red-400/25 bg-red-400/10 text-red-200";
  }

  return "border-cyan-300/25 bg-cyan-300/10 text-cyan-200";
}

// =========================================================
// PAGE
// =========================================================

export default async function CompetitionsPage() {
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
      "league_id,role"
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
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="panel p-6">
          <p className="font-black text-red-300">
            League niet gevonden.
          </p>
        </div>
      </main>
    );
  }

  const isAdmin =
    String(
      membership.role
    ) === "admin";

  // ======================================================
  // LEAGUE MEMBERS (for the V2 create form's player picker)
  // ======================================================

  let memberOptions: {
    profileId: string;
    label: string;
  }[] = [];

  if (isAdmin) {
    const {
      data: memberRows,
    } = await supabase
      .from("league_members")
      .select("profile_id")
      .eq("league_id", membership.league_id);

    const memberIds = (
      memberRows ?? []
    ).map((row) => row.profile_id as string);

    if (memberIds.length > 0) {
      const {
        data: memberProfiles,
      } = await supabase
        .from("profiles")
        .select("id,username,duelist_name")
        .in("id", memberIds);

      memberOptions = (
        memberProfiles ?? []
      )
        .map((profile) => ({
          profileId: profile.id as string,
          label:
            (profile.duelist_name as string) ??
            (profile.username as string) ??
            "Duelist",
        }))
        .sort((a, b) =>
          a.label.localeCompare(b.label)
        );
    }
  }

  // ======================================================
  // COMPETITIONS
  // ======================================================

  const {
    data: competitionData,
    error: competitionError,
  } = await supabase
    .from(
      "competitions"
    )
    .select(
      "id,name,competition_type,status,starts_at,completed_at,rewards_distributed_at,created_at"
    )
    .eq(
      "league_id",
      membership.league_id
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    );

  if (competitionError) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="panel p-6">
          <p className="font-black text-red-300">
            Competitions konden niet worden geladen.
          </p>

          <p className="mt-2 text-sm text-zinc-500">
            {
              competitionError.message
            }
          </p>
        </div>
      </main>
    );
  }

  const competitions =
    (competitionData ??
      []) as Competition[];

  // ======================================================
  // PLAYER COUNTS
  // ======================================================

  const competitionIds =
    competitions.map(
      (competition) =>
        competition.id
    );

  let competitionPlayers:
    CompetitionPlayer[] =
    [];

  if (
    competitionIds.length >
    0
  ) {
    const {
      data,
      error,
    } = await supabase
      .from(
        "competition_players"
      )
      .select(
        "competition_id,profile_id"
      )
      .in(
        "competition_id",
        competitionIds
      );

    if (error) {
      throw new Error(
        error.message
      );
    }

    competitionPlayers =
      (data ??
        []) as CompetitionPlayer[];
  }

  const playerCountMap =
    new Map<
      string,
      number
    >();

  for (
    const player
    of competitionPlayers
  ) {
    playerCountMap.set(
      player.competition_id,
      (
        playerCountMap.get(
          player.competition_id
        ) ?? 0
      ) + 1
    );
  }

  // ======================================================
  // GROUPS
  // ======================================================

  const active =
    competitions.filter(
      (competition) =>
        competition.status ===
        "active"
    );

  const drafts =
    competitions.filter(
      (competition) =>
        competition.status ===
        "draft"
    );

  const completed =
    competitions.filter(
      (competition) =>
        competition.status ===
        "completed"
    );

  const tournaments =
    competitions.filter(
      (competition) =>
        competition
          .competition_type ===
        "tournament"
    ).length;

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* NAV */}

      <nav className="flex flex-wrap items-center gap-3">
        <Link
          href="/league"
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300 transition hover:border-amber-300/40 hover:bg-amber-300/10"
        >
          <ArrowLeft
            size={17}
          />

          League
        </Link>

        <Link
          href="/"
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-sm font-bold text-zinc-400 transition hover:border-white/20 hover:text-zinc-100"
        >
          <Home
            size={16}
          />

          Home
        </Link>
      </nav>

      {/* HERO */}

      <section className="panel relative mt-6 overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-amber-400/[0.06] blur-[100px]" />

        <div className="pointer-events-none absolute bottom-[-120px] left-[25%] h-72 w-72 rounded-full bg-violet-500/[0.05] blur-[100px]" />

        <div className="relative grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.2em] text-amber-200">
              <Crown
                size={12}
              />

              Duelist Circuit
            </div>

            <h1 className="gold-text mt-5 text-4xl font-black sm:text-5xl">
              Competitions
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
              Organize league competitions and tournaments around your real-world duels. Results are recorded here after the duel has been played physically or externally.
            </p>
          </div>

          <div className="flex h-28 w-28 items-center justify-center rounded-3xl border border-amber-300/15 bg-amber-300/[0.04]">
            <Trophy
              size={48}
              className="text-amber-300"
            />
          </div>
        </div>
      </section>

      {/* STATS */}

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
            Active
          </p>

          <p className="mt-2 text-3xl font-black text-emerald-200">
            {
              active.length
            }
          </p>
        </div>

        <div className="panel p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
            Drafts
          </p>

          <p className="mt-2 text-3xl font-black text-cyan-200">
            {
              drafts.length
            }
          </p>
        </div>

        <div className="panel p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
            Completed
          </p>

          <p className="mt-2 text-3xl font-black text-amber-200">
            {
              completed.length
            }
          </p>
        </div>

        <div className="panel p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
            Tournaments
          </p>

          <p className="mt-2 text-3xl font-black text-violet-200">
            {
              tournaments
            }
          </p>
        </div>
      </section>

      {/* QUICK START TONIGHT */}

      {isAdmin && (
        <section className="panel relative mt-6 overflow-hidden border-cyan-300/20 bg-cyan-300/[0.03] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Play size={17} className="text-cyan-300" />

                <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-300">
                  Game Night
                </p>
              </div>

              <h2 className="mt-3 text-2xl font-black">
                Start Tonight&apos;s Competition
              </h2>

              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
                One tap: every league member is entered, everyone plays everyone 3 times, and the schedule is generated automatically. Opens straight into the linear game-night flow.
              </p>
            </div>

            <form action={quickStartTonightCompetition}>
              <input
                type="hidden"
                name="league_id"
                value={membership.league_id}
              />

              <SubmitButton
                pendingLabel="Starting..."
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-3 text-sm font-black text-cyan-200"
              >
                <Play size={16} />
                Start Competition
              </SubmitButton>
            </form>
          </div>
        </section>
      )}

      {/* CREATE */}

      {isAdmin && (
        <section className="panel relative mt-6 overflow-hidden p-6">
          <Sparkles
            size={44}
            className="pointer-events-none absolute right-5 top-5 text-white opacity-[0.035]"
          />

          <div className="relative">
            <div className="flex items-center gap-2">
              <Plus
                size={17}
                className="text-amber-300"
              />

              <p className="text-xs font-black uppercase tracking-[.2em] text-amber-300">
                Admin
              </p>
            </div>

            <h2 className="mt-3 text-2xl font-black">
              Create Competition
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Configure the pairing schedule and match format, then preview the total matches before creating anything.
            </p>

            <CompetitionCreateFormV2
              leagueId={membership.league_id}
              members={memberOptions}
            />
          </div>
        </section>
      )}

      {/* COMPETITIONS */}

      <section className="mt-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[.2em] text-zinc-500">
              Duelist Circuit
            </p>

            <h2 className="mt-2 text-2xl font-black">
              Events
            </h2>
          </div>

          <span className="text-xs font-bold text-zinc-600">
            {
              competitions.length
            }{" "}
            total
          </span>
        </div>

        {competitions.length ===
        0 ? (
          <div className="panel mt-5 p-8 text-center">
            <Trophy
              size={34}
              className="mx-auto text-zinc-700"
            />

            <h3 className="mt-4 text-lg font-black text-zinc-300">
              No competitions yet
            </h3>

            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-500">
              Create the first competition to start tracking standings, tournament results and championship rewards.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {competitions.map(
              (
                competition
              ) => {
                const playerCount =
                  playerCountMap.get(
                    competition.id
                  ) ?? 0;

                const isTournament =
                  competition
                    .competition_type ===
                  "tournament";

                return (
                  <div
                    key={
                      competition.id
                    }
                    className="relative"
                  >
                  <Link
                    href={`/competitions/${competition.id}`}
                    className="panel group relative overflow-hidden p-5 transition-all hover:-translate-y-1 hover:border-amber-300/20"
                  >
                    <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-amber-400/[0.035] blur-3xl" />

                    <div className="relative">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.025]">
                            {isTournament ? (
                              <Medal
                                size={21}
                                className="text-violet-300"
                              />
                            ) : (
                              <ShieldCheck
                                size={21}
                                className="text-cyan-300"
                              />
                            )}
                          </div>

                          <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
                              {isTournament
                                ? "Tournament"
                                : "Round Robin"}
                            </p>

                            <h3 className="mt-1 text-lg font-black transition group-hover:text-amber-200">
                              {
                                competition.name
                              }
                            </h3>
                          </div>
                        </div>

                        <span
                          className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${statusStyle(
                            competition.status
                          )}`}
                        >
                          {
                            competition.status
                          }
                        </span>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-white/7 bg-white/[0.02] p-3">
                          <div className="flex items-center gap-2 text-zinc-600">
                            <Users
                              size={13}
                            />

                            <span className="text-[9px] font-black uppercase tracking-wider">
                              Duelists
                            </span>
                          </div>

                          <p className="mt-2 font-black text-zinc-200">
                            {
                              playerCount
                            }
                          </p>
                        </div>

                        <div className="rounded-xl border border-white/7 bg-white/[0.02] p-3">
                          <div className="flex items-center gap-2 text-zinc-600">
                            <CalendarDays
                              size={13}
                            />

                            <span className="text-[9px] font-black uppercase tracking-wider">
                              Started
                            </span>
                          </div>

                          <p className="mt-2 text-xs font-black text-zinc-300">
                            {formatDate(
                              competition.starts_at
                            )}
                          </p>
                        </div>
                      </div>

                      {competition.rewards_distributed_at && (
                        <div className="mt-3 inline-flex items-center gap-2 text-xs font-black text-emerald-300">
                          <Trophy
                            size={13}
                          />

                          Rewards distributed
                        </div>
                      )}

                      <div className="mt-5 flex items-center justify-end gap-2 border-t border-white/5 pt-4 text-sm font-black text-amber-300">
                        Open Competition

                        <ArrowRight
                          size={15}
                          className="transition-transform group-hover:translate-x-1"
                        />
                      </div>
                    </div>
                  </Link>

                  {competition.status === "active" && (
                    <Link
                      href={`/competitions/${competition.id}/tonight`}
                      className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2.5 text-xs font-black text-cyan-200 transition hover:border-cyan-300/40"
                    >
                      <Play size={13} />
                      Play Tonight
                    </Link>
                  )}
                  </div>
                );
              }
            )}
          </div>
        )}
      </section>

      {/* PHILOSOPHY */}

      <section className="panel mt-7 p-5">
        <div className="flex items-start gap-3">
          <Swords
            size={20}
            className="mt-0.5 shrink-0 text-amber-300"
          />

          <div>
            <p className="font-black text-zinc-200">
              Real duels. Digital competition.
            </p>

            <p className="mt-1 text-sm leading-6 text-zinc-500">
              Duelist Circle does not simulate the Yu-Gi-Oh! duel. Players duel physically or in an external application, then use the existing match system to submit and confirm the result.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}