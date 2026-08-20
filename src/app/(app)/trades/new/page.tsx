import Link from "next/link";
import {
  ArrowLeft,
  Home,
  Repeat2,
  UserRound,
} from "lucide-react";

import { requireUser } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

type LeagueMember = {
  profile_id: string;
};

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
};

function playerName(
  profile: Profile
) {
  return (
    profile.display_name ??
    profile.username ??
    "Unknown Player"
  );
}

export default async function NewTradePage() {
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

  // ======================================================
  // OTHER LEAGUE MEMBERS
  // ======================================================

  const {
    data: memberData,
    error: memberError,
  } = await supabase
    .from("league_members")
    .select("profile_id")
    .eq(
      "league_id",
      membership.league_id
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
    (memberData ?? []) as LeagueMember[];

  const profileIds =
    members.map(
      (member) =>
        member.profile_id
    );

  let profiles: Profile[] =
    [];

  if (
    profileIds.length > 0
  ) {
    const {
      data: profileData,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select(
        "id,username,display_name"
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
      (profileData ?? []) as Profile[];
  }

  profiles.sort(
    (a, b) =>
      playerName(a).localeCompare(
        playerName(b)
      )
  );

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* NAVIGATION */}

      <nav className="flex flex-wrap items-center gap-3">
        <Link
          href="/trades"
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300 transition-all hover:-translate-x-0.5 hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-200 active:scale-95"
        >
          <ArrowLeft size={17} />
          Back to Trades
        </Link>

        <Link
          href="/"
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-sm font-bold text-zinc-400 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-100 active:scale-95"
        >
          <Home size={16} />
          Home
        </Link>
      </nav>

      {/* HEADER */}

      <header className="mt-6">
        <p className="text-xs font-black tracking-[.28em] text-amber-300">
          NEW TRADE
        </p>

        <h1 className="gold-text mt-2 text-4xl font-black">
          Choose Trade Partner
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Kies een speler uit je league. Daarna bouwen we samen een trade met
          echte fysieke kaarten uit jullie Collections.
        </p>
      </header>

      {/* INFO */}

      <section className="panel mt-6 p-5">
        <div className="flex items-start gap-3">
          <Repeat2
            size={22}
            className="mt-0.5 shrink-0 text-amber-300"
          />

          <div>
            <p className="font-black text-zinc-200">
              How trading works
            </p>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Je kiest eerst een trade partner. Daarna selecteer je kaarten die
              jij aanbiedt en kaarten die je van de andere speler wilt
              ontvangen. Zodra je de trade verstuurt, worden alle betrokken
              kaarten tijdelijk gelockt totdat de trade wordt geaccepteerd,
              geweigerd of geannuleerd.
            </p>
          </div>
        </div>
      </section>

      {/* PLAYERS */}

      <section className="mt-8">
        <div className="flex items-center gap-2">
          <UserRound
            size={18}
            className="text-amber-300"
          />

          <div>
            <p className="text-xs font-black tracking-[.2em] text-zinc-500">
              LEAGUE PLAYERS
            </p>

            <h2 className="mt-1 text-2xl font-black">
              Choose Player
            </h2>
          </div>
        </div>

        {profiles.length === 0 ? (
          <div className="panel mt-4 p-8 text-center">
            <UserRound
              size={36}
              className="mx-auto text-zinc-600"
            />

            <h3 className="mt-3 text-lg font-black">
              No trade partners found
            </h3>

            <p className="mt-2 text-sm text-zinc-500">
              Er zijn nog geen andere spelers in deze league.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map(
              (profile) => (
                <Link
                  key={profile.id}
                  href={`/trades/new/${profile.id}`}
                  className="panel group block cursor-pointer p-5 transition-all duration-150 hover:-translate-y-1 hover:border-amber-300/25 active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-black transition group-hover:text-amber-200">
                        {playerName(
                          profile
                        )}
                      </p>

                      {profile.username && (
                        <p className="mt-1 text-sm text-zinc-500">
                          @{profile.username}
                        </p>
                      )}
                    </div>

                    <Repeat2
                      size={22}
                      className="shrink-0 text-amber-300"
                    />
                  </div>

                  <p className="mt-5 text-sm font-black text-amber-300 transition group-hover:text-amber-200">
                    Start Trade →
                  </p>
                </Link>
              )
            )}
          </div>
        )}
      </section>
    </main>
  );
}