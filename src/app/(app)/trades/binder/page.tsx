import Link from "next/link";

import {
  ArrowLeft,
  BookOpen,
  Home,
  Tag,
  UserRound,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

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
  duelist_name: string | null;
};

type CardInstanceRow = {
  current_owner_id: string;
};

function playerName(
  profile: Profile | undefined
) {
  return (
    profile?.duelist_name ??
    profile?.username ??
    "Unknown Player"
  );
}

// =========================================================
// PAGE
//
// League-wide "who has cards up for trade" overview - lets a
// player quickly see e.g. "Gossie - 6 cards for trade" instead
// of having to open every league member's collection one by one
// to find a good trade partner.
// =========================================================

export default async function TradeBinderPage() {
  const {
    supabase,
    userId,
  } = await requireUser();

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
  // LEAGUE MEMBERS
  // ======================================================

  const {
    data: memberData,
    error: memberError,
  } = await supabase
    .from("league_members")
    .select("profile_id")
    .eq("league_id", leagueId);

  if (memberError) {
    throw new Error(
      memberError.message
    );
  }

  const members =
    (memberData ?? []) as LeagueMember[];

  const profileIds =
    members.map(
      (member) => member.profile_id
    );

  let profiles: Profile[] = [];

  if (profileIds.length > 0) {
    const {
      data: profileData,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select("id,username,duelist_name")
      .in("id", profileIds);

    if (profileError) {
      throw new Error(
        profileError.message
      );
    }

    profiles =
      (profileData ?? []) as Profile[];
  }

  const profileMap = new Map(
    profiles.map((profile) => [
      profile.id,
      profile,
    ])
  );

  // ======================================================
  // FOR-TRADE CARD COUNTS PER OWNER
  //
  // A single query across the whole league, counted in JS -
  // cheaper than fetching every member's full collection just
  // to find out how many of their cards are up for trade.
  // ======================================================

  const {
    data: instanceData,
    error: instanceError,
  } = await supabase
    .from("card_instances")
    .select("current_owner_id")
    .eq("league_id", leagueId)
    .eq("for_trade", true)
    .eq("locked", false);

  if (instanceError) {
    throw new Error(
      `Trade binders konden niet worden geladen: ${instanceError.message}`
    );
  }

  const instances =
    (instanceData ?? []) as CardInstanceRow[];

  const forTradeCounts = new Map<
    string,
    number
  >();

  for (const instance of instances) {
    forTradeCounts.set(
      instance.current_owner_id,
      (forTradeCounts.get(
        instance.current_owner_id
      ) ?? 0) + 1
    );
  }

  const binders = profileIds
    .map((profileId) => ({
      profileId,
      profile: profileMap.get(profileId),
      count: forTradeCounts.get(profileId) ?? 0,
    }))
    .filter(
      (entry) => entry.profileId !== userId
    )
    .sort((a, b) => b.count - a.count);

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      {/* NAV */}

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
          TRADE BINDER
        </p>

        <h1 className="gold-text mt-2 text-4xl font-black">
          Who&apos;s Trading?
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          League members who have marked physical copies as available for
          trade. Open a binder to see exactly which cards, then start a
          trade offer directly from there.
        </p>
      </header>

      {/* BINDERS */}

      <section className="mt-8">
        {binders.length === 0 ? (
          <div className="panel p-8 text-center">
            <BookOpen
              size={36}
              className="mx-auto text-zinc-600"
            />

            <h3 className="mt-3 text-lg font-black">
              No other league members yet
            </h3>

            <p className="mt-2 text-sm text-zinc-500">
              Once you have league mates, their trade binders will show up
              here.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {binders.map((entry) => (
              <Link
                key={entry.profileId}
                href={`/trades/binder/${entry.profileId}`}
                className={`panel group block cursor-pointer p-5 transition-all duration-150 hover:-translate-y-1 active:scale-[0.99] ${
                  entry.count > 0
                    ? "hover:border-emerald-300/30"
                    : "hover:border-amber-300/25"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <UserRound
                        size={15}
                        className="text-amber-300"
                      />

                      <p className="text-lg font-black transition group-hover:text-amber-200">
                        {playerName(entry.profile)}
                      </p>
                    </div>

                    {entry.profile?.username && (
                      <p className="mt-1 text-sm text-zinc-500">
                        @{entry.profile.username}
                      </p>
                    )}
                  </div>

                  <Tag
                    size={20}
                    className={
                      entry.count > 0
                        ? "shrink-0 text-emerald-300"
                        : "shrink-0 text-zinc-600"
                    }
                  />
                </div>

                <p
                  className={`mt-5 text-sm font-black ${
                    entry.count > 0
                      ? "text-emerald-300 group-hover:text-emerald-200"
                      : "text-zinc-600"
                  }`}
                >
                  {entry.count > 0
                    ? `${entry.count} card${
                        entry.count === 1 ? "" : "s"
                      } for trade →`
                    : "Nothing marked for trade"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
