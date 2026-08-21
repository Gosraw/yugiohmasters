import Link from "next/link";

import {
  Gift,
  Repeat2,
  Rss,
  Sparkles,
  Swords,
  Trophy,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  getLeagueIdForUser,
  getLeagueProfiles,
  profileName,
} from "@/lib/league-stats";

export const dynamic = "force-dynamic";

// =========================================================
// FEED ITEM
//
// Every item here is built from data the app already knows
// automatically - completed duel results, card pulls/drafts,
// accepted trades and competition placements. Nothing requires
// extra input during a physical duel.
// =========================================================

type FeedItem = {
  id: string;
  at: string;
  icon: "duel" | "pull" | "draft" | "trade" | "trophy";
  text: string;
  href?: string;
};

function timeAgo(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const ICONS = {
  duel: Swords,
  pull: Gift,
  draft: Sparkles,
  trade: Repeat2,
  trophy: Trophy,
};

const ICON_TONE = {
  duel: "border-red-300/25 bg-red-300/10 text-red-200",
  pull: "border-amber-300/25 bg-amber-300/10 text-amber-200",
  draft: "border-cyan-300/25 bg-cyan-300/10 text-cyan-200",
  trade: "border-violet-300/25 bg-violet-300/10 text-violet-200",
  trophy: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
};

export default async function ActivityFeedPage() {
  const { supabase, userId } = await requireUser();

  const leagueId = await getLeagueIdForUser(supabase, userId);

  if (!leagueId) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="panel p-6 text-center text-zinc-500">
          No league found.
        </div>
      </main>
    );
  }

  const profiles = await getLeagueProfiles(supabase, leagueId);
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const name = (id: string | null | undefined) =>
    profileName(profileMap.get(id ?? ""));

  const items: FeedItem[] = [];

  // =======================================================
  // DUELS
  // =======================================================

  const { data: matchData } = await supabase
    .from("matches")
    .select(
      "id,player_one_id,player_two_id,winner_id,result,match_type,completed_at"
    )
    .eq("league_id", leagueId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(25);

  for (const match of (matchData ?? []) as {
    id: string;
    player_one_id: string;
    player_two_id: string;
    winner_id: string | null;
    result: string | null;
    match_type: string;
    completed_at: string | null;
  }[]) {
    if (!match.completed_at) continue;

    const isDraw = match.result === "draw" || !match.winner_id;
    const loserId =
      match.winner_id === match.player_one_id
        ? match.player_two_id
        : match.player_one_id;

    items.push({
      id: `match-${match.id}`,
      at: match.completed_at,
      icon: "duel",
      href: `/matches/${match.id}`,
      text: isDraw
        ? `${name(match.player_one_id)} and ${name(match.player_two_id)} drew a ${match.match_type} duel`
        : `${name(match.winner_id)} defeated ${name(loserId)} in a ${match.match_type} duel`,
    });
  }

  // =======================================================
  // PACK PULLS + DRAFTS
  // =======================================================

  const { data: instanceData } = await supabase
    .from("card_instances")
    .select(
      "id,card_catalog_id,original_owner_id,original_acquisition_type,acquired_at"
    )
    .eq("league_id", leagueId)
    .in("original_acquisition_type", ["shop", "draft"])
    .order("acquired_at", { ascending: false })
    .limit(25);

  const instances = (instanceData ?? []) as {
    id: string;
    card_catalog_id: string;
    original_owner_id: string;
    original_acquisition_type: string;
    acquired_at: string;
  }[];

  const catalogIds = [...new Set(instances.map((row) => row.card_catalog_id))];

  let catalogMap = new Map<string, { name: string; game_rarity: string | null }>();

  if (catalogIds.length > 0) {
    const { data: catalogData } = await supabase
      .from("card_catalog")
      .select("id,name,game_rarity")
      .in("id", catalogIds);

    catalogMap = new Map(
      ((catalogData ?? []) as {
        id: string;
        name: string;
        game_rarity: string | null;
      }[]).map((row) => [row.id, { name: row.name, game_rarity: row.game_rarity }])
    );
  }

  for (const instance of instances) {
    const card = catalogMap.get(instance.card_catalog_id);
    if (!card) continue;

    if (instance.original_acquisition_type === "shop") {
      items.push({
        id: `pull-${instance.id}`,
        at: instance.acquired_at,
        icon: "pull",
        href: `/cards/${instance.card_catalog_id}`,
        text: `${name(instance.original_owner_id)} pulled ${card.name}${
          card.game_rarity ? ` (${card.game_rarity})` : ""
        }`,
      });
    } else {
      items.push({
        id: `draft-${instance.id}`,
        at: instance.acquired_at,
        icon: "draft",
        href: `/cards/${instance.card_catalog_id}`,
        text: `${name(instance.original_owner_id)} drafted ${card.name}`,
      });
    }
  }

  // =======================================================
  // TRADES
  // =======================================================

  try {
    const { data: tradeData, error: tradeError } = await supabase
      .from("trade_activity")
      .select("id,sender_id,receiver_id,completed_at")
      .eq("league_id", leagueId)
      .order("completed_at", { ascending: false })
      .limit(20);

    if (!tradeError) {
      for (const trade of (tradeData ?? []) as {
        id: string;
        sender_id: string;
        receiver_id: string;
        completed_at: string | null;
      }[]) {
        if (!trade.completed_at) continue;

        items.push({
          id: `trade-${trade.id}`,
          at: trade.completed_at,
          icon: "trade",
          href: `/trades/${trade.id}`,
          text: `${name(trade.sender_id)} and ${name(trade.receiver_id)} completed a trade`,
        });
      }
    }
  } catch {
    // trade_activity view not applied to this database yet
  }

  // =======================================================
  // COMPETITION WINS
  // =======================================================

  const { data: completedCompetitions } = await supabase
    .from("competitions")
    .select("id,name,completed_at")
    .eq("league_id", leagueId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(15);

  const competitions = (completedCompetitions ?? []) as {
    id: string;
    name: string;
    completed_at: string | null;
  }[];

  if (competitions.length > 0) {
    const { data: resultsData } = await supabase
      .from("competition_results")
      .select("competition_id,profile_id,placement")
      .in(
        "competition_id",
        competitions.map((competition) => competition.id)
      )
      .eq("placement", 1);

    const competitionMap = new Map(
      competitions.map((competition) => [competition.id, competition])
    );

    for (const result of (resultsData ?? []) as {
      competition_id: string;
      profile_id: string;
      placement: number;
    }[]) {
      const competition = competitionMap.get(result.competition_id);
      if (!competition || !competition.completed_at) continue;

      items.push({
        id: `competition-${result.competition_id}-${result.profile_id}`,
        at: competition.completed_at,
        icon: "trophy",
        href: `/competitions/${result.competition_id}`,
        text: `${name(result.profile_id)} won ${competition.name}`,
      });
    }
  }

  // =======================================================
  // MERGE + SORT
  // =======================================================

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const feed = items.slice(0, 40);

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-violet-500/[0.06] blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-violet-200">
          <Rss size={12} />
          League Activity
        </div>

        <h1 className="gold-text mt-4 text-3xl font-black sm:text-4xl">
          What&apos;s Happening
        </h1>

        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          Every duel result, pack pull, trade and competition win in your
          league, in one feed.
        </p>

        {feed.length === 0 ? (
          <div className="panel mt-8 p-8 text-center text-zinc-500">
            The league has been quiet. Play a duel to get the feed going.
          </div>
        ) : (
          <div className="mt-8 space-y-2">
            {feed.map((item) => {
              const Icon = ICONS[item.icon];
              const content = (
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${ICON_TONE[item.icon]}`}
                  >
                    <Icon size={15} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-zinc-200">
                      {item.text}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-600">
                      {timeAgo(item.at)}
                    </p>
                  </div>
                </div>
              );

              return item.href ? (
                <Link
                  key={item.id}
                  href={item.href}
                  className="panel block cursor-pointer p-4 transition-all hover:-translate-y-0.5 hover:border-amber-300/20"
                >
                  {content}
                </Link>
              ) : (
                <div key={item.id} className="panel p-4">
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
