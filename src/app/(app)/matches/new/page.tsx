import Link from "next/link";

import {
  ArrowLeft,
  Swords,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  fetchAllPages,
  fetchInBatches,
} from "@/lib/supabase/paginate";

import {
  getPrimaryBossIdentities,
} from "@/lib/boss-identity";

import {
  MatchRecordForm,
  type RecordOpponent,
  type WagerCardOption,
} from "@/components/match-record-form";

export const dynamic =
  "force-dynamic";

// =========================================================
// RECORD A PRACTICE DUEL (2.0: tap the winner)
//
// docs/V2_PLAN.md, "Duels & competition": practice duels are
// recorded on ONE screen - pick the opponent, tap the winner. The
// opponent then confirms with one tap (it shows up under "Waiting on
// you" on Home). Practice duels give no DP in 2.0, so there are no
// reward labels here; season (competition) duels are recorded on the
// season's "This Round" screen instead.
//
// A DP or card wager is an optional add-on behind "Add a wager". A
// wager still needs the existing challenge -> accept (both stakes
// escrowed) flow BEFORE the duel, so that path sends a challenge
// instead of recording a result.
// =========================================================

type Profile = {
  id: string;
  username: string | null;
  duelist_name: string | null;
};

type CardInstance = {
  id: string;
  card_catalog_id: string;
  copy_number: number;
};

type CatalogCard = {
  id: string;
  name: string;
  game_rarity: string | null;
};

function playerName(
  profile: Profile
) {
  return (
    profile.duelist_name ??
    profile.username ??
    "Duelist"
  );
}

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
      <main className="mx-auto max-w-xl px-4 py-8">
        <div className="panel p-6 text-sm font-bold text-zinc-300">
          You are not in a league yet.
        </div>
      </main>
    );
  }

  const leagueId =
    membership.league_id as string;

  const [
    currentProfileResult,
    activeDeckResult,
    memberResult,
    instances,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("duel_points")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("decks")
      .select("id")
      .eq("league_id", leagueId)
      .eq("owner_id", userId)
      .eq("status", "ready")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("league_members")
      .select("profile_id")
      .eq("league_id", leagueId)
      .neq("profile_id", userId),
    fetchAllPages<CardInstance>(
      (from, to) =>
        supabase
          .from("card_instances")
          .select("id,card_catalog_id,copy_number")
          .eq("current_owner_id", userId)
          .eq("locked", false)
          .order("id", { ascending: true })
          .range(from, to)
    ),
  ]);

  if (memberResult.error) {
    throw new Error(
      memberResult.error.message
    );
  }

  const opponentIds = (
    (memberResult.data ?? []) as { profile_id: string }[]
  ).map(
    (row) => row.profile_id
  );

  const [
    profileResult,
    bossMap,
  ] = await Promise.all([
    opponentIds.length > 0
      ? supabase
          .from("profiles")
          .select("id,username,duelist_name")
          .in("id", opponentIds)
      : Promise.resolve({
          data: [] as Profile[],
          error: null,
        }),
    getPrimaryBossIdentities(
      supabase,
      opponentIds
    ),
  ]);

  if (profileResult.error) {
    throw new Error(
      profileResult.error.message
    );
  }

  const opponents: RecordOpponent[] = (
    (profileResult.data ?? []) as Profile[]
  )
    .map(
      (profile) => ({
        id: profile.id,
        name: playerName(profile),
        bossName:
          bossMap.get(profile.id)?.name ??
          null,
      })
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name)
    );

  const catalogIds = [
    ...new Set(
      instances.map(
        (instance) =>
          instance.card_catalog_id
      )
    ),
  ];

  const catalogCards =
    await fetchInBatches<string, CatalogCard>(
      catalogIds,
      (batch, from, to) =>
        supabase
          .from("card_catalog")
          .select("id,name,game_rarity")
          .in("id", batch)
          .order("id", { ascending: true })
          .range(from, to)
    );

  const cardMap = new Map(
    catalogCards.map(
      (card) => [
        card.id,
        card,
      ]
    )
  );

  const wagerCards: WagerCardOption[] = instances
    .flatMap(
      (instance) => {
        const card =
          cardMap.get(
            instance.card_catalog_id
          );

        if (!card) {
          return [];
        }

        return [
          {
            instanceId: instance.id,
            label: `${card.name} · Copy #${instance.copy_number}${card.game_rarity ? ` · ${card.game_rarity}` : ""}`,
            sortKey: card.name,
          },
        ];
      }
    )
    .sort(
      (a, b) =>
        a.sortKey.localeCompare(b.sortKey)
    );

  const preselected =
    opponents.some(
      (opponent) => opponent.id === preselectedOpponentId
    )
      ? preselectedOpponentId ?? null
      : opponents.length === 1
        ? opponents[0].id
        : null;

  return (
    <main className="mx-auto max-w-xl px-4 py-5">
      <nav className="flex items-center justify-between gap-3">
        <Link
          href="/play"
          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs font-bold text-amber-300 transition-colors hover:border-amber-300/40"
        >
          <ArrowLeft
            size={14}
          />
          Play
        </Link>

        <Link
          href="/matches"
          className="text-xs font-bold text-zinc-500 transition-colors hover:text-zinc-300"
        >
          Duel history
        </Link>
      </nav>

      <header className="mt-4">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.22em] text-amber-300">
          <Swords
            size={12}
          />
          Practice duel
        </p>

        <h1 className="font-display gold-text mt-1 text-3xl font-black">
          Who won?
        </h1>

        <p className="mt-1 text-sm text-zinc-400">
          Pick your opponent and tap the winner. They confirm it with one tap. Practice duels don&apos;t change the season standings.
        </p>
      </header>

      {opponents.length === 0 ? (
        <section className="panel mt-5 p-5 text-sm text-zinc-400">
          There are no other duelists in your league yet.
        </section>
      ) : (
        <MatchRecordForm
          currentUserId={userId}
          opponents={opponents}
          preselectedOpponentId={preselected}
          duelPoints={
            (currentProfileResult.data?.duel_points as number | undefined) ??
            0
          }
          hasActiveDeck={Boolean(
            activeDeckResult.data
          )}
          wagerCards={wagerCards}
        />
      )}
    </main>
  );
}
