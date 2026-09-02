import type {
  requireUser,
} from "@/lib/supabase/queries";

import {
  computeRivalSummaries,
  currentStreak,
  getCompletedLeagueMatches,
  getLeagueIdForUser,
  getLeagueProfiles,
  involvesPlayer,
  profileName,
  resultFor,
} from "@/lib/league-stats";

import {
  getAttentionItems,
} from "@/lib/attention-items";

import {
  getPrimaryBossIdentity,
} from "@/lib/boss-identity";

type SupabaseClient =
  Awaited<
    ReturnType<typeof requireUser>
  >["supabase"];

// =========================================================
// BOSS CONTEXT
//
// This is the ONLY thing that ever reaches the AI model. It is
// a small, deliberately-shaped snapshot built server-side from
// data the requesting player is already allowed to see (their
// own profile, their league's matches/standings, their own
// deck/collection). The AI never sees raw table rows, never
// gets database credentials, and never generates or runs SQL -
// it only ever receives this plain object as text.
// =========================================================

export type BossContext = {
  duelistName: string;
  bossName: string | null;
  bossPersonality: string | null;
  duelPoints: number;

  league: {
    memberCount: number;
    rank: number | null;
    wins: number;
    losses: number;
    draws: number;
    streak: {
      type: "W" | "L" | "D" | null;
      count: number;
    };
  } | null;

  activeDeck: {
    name: string;
    mainCount: number;
    extraCount: number;
  } | null;

  pendingActions: {
    label: string;
    hint: string;
  }[];

  topRival: {
    name: string;
    wins: number;
    losses: number;
    draws: number;
  } | null;

  recentPulls: {
    name: string;
    rarity: string | null;
  }[];
};

const MAX_RECENT_PULLS = 5;

export async function buildBossContext(
  supabase: SupabaseClient,
  userId: string
): Promise<BossContext> {
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "duelist_name,duel_points,boss_personality"
    )
    .eq("id", userId)
    .single();

  const duelistName =
    profile?.duelist_name ?? "Duelist";

  const duelPoints =
    profile?.duel_points ?? 0;

  const bossPersonality =
    profile?.boss_personality ?? null;

  // AUDIT FIX (Season 1 audit, legacy schema-assumption item): this
  // used to join through profiles.boss_monster_option_id ->
  // boss_monster_options, the OLD pre-Boss-Route cosmetic concept
  // that is never set for a Season 1 player (the mandatory
  // onboarding gate sends new players through /boss/select, not the
  // old /onboarding flow that used to write this field) - the AI
  // companion would greet an actively-progressing player as if they
  // had no Boss identity at all. See src/lib/boss-identity.ts for
  // the shared, corrected lookup (player_boss_paths route_slot 1 ->
  // current-stage evolution card), the same source Home already
  // uses.
  const bossIdentity =
    await getPrimaryBossIdentity(
      supabase,
      userId
    );

  const bossName: string | null =
    bossIdentity?.name ?? null;

  const leagueId =
    await getLeagueIdForUser(
      supabase,
      userId
    );

  let league: BossContext["league"] = null;
  let topRival: BossContext["topRival"] = null;
  let pendingActions: BossContext["pendingActions"] = [];

  if (leagueId) {
    const [profiles, matches, attentionItems] = await Promise.all([
      getLeagueProfiles(supabase, leagueId),
      getCompletedLeagueMatches(supabase, leagueId),
      getAttentionItems(supabase, userId, leagueId),
    ]);

    pendingActions = attentionItems
      .slice(0, 4)
      .map((item) => ({
        label: item.label,
        hint: item.hint,
      }));

    const playerMatches = matches.filter((match) =>
      involvesPlayer(match, userId)
    );

    let wins = 0;
    let losses = 0;
    let draws = 0;

    for (const match of playerMatches) {
      const outcome = resultFor(match, userId);
      if (outcome === "W") wins += 1;
      else if (outcome === "L") losses += 1;
      else draws += 1;
    }

    // Rank = 1-indexed position when the league is sorted by win
    // count (a simple, honest standing - no hidden rating math).
    const winsByPlayer = new Map<string, number>();
    for (const p of profiles) {
      const theirMatches = matches.filter((m) =>
        involvesPlayer(m, p.id)
      );
      const theirWins = theirMatches.filter(
        (m) => resultFor(m, p.id) === "W"
      ).length;
      winsByPlayer.set(p.id, theirWins);
    }

    const ranked = [...winsByPlayer.entries()].sort(
      (a, b) => b[1] - a[1]
    );
    const rankIndex = ranked.findIndex(([id]) => id === userId);

    league = {
      memberCount: profiles.length,
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      wins,
      losses,
      draws,
      streak: currentStreak(playerMatches, userId),
    };

    const rivals = computeRivalSummaries(matches, userId);
    const profileMap = new Map(
      profiles.map((p) => [p.id, p])
    );

    if (rivals.length > 0) {
      const top = rivals[0];
      topRival = {
        name: profileName(profileMap.get(top.opponentId)),
        wins: top.wins,
        losses: top.losses,
        draws: top.draws,
      };
    }
  }

  // ---------------------------------------------------------
  // ACTIVE DECK
  // ---------------------------------------------------------

  let activeDeck: BossContext["activeDeck"] = null;

  const { data: deck } = await supabase
    .from("decks")
    .select("id,name")
    .eq("owner_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (deck) {
    const { data: deckCards } = await supabase
      .from("deck_cards")
      .select("section")
      .eq("deck_id", deck.id);

    const rows = deckCards ?? [];
    activeDeck = {
      name: deck.name,
      mainCount: rows.filter((r: { section: string }) => r.section === "main")
        .length,
      extraCount: rows.filter(
        (r: { section: string }) => r.section === "extra"
      ).length,
    };
  }

  // ---------------------------------------------------------
  // RECENT PULLS
  // ---------------------------------------------------------

  let recentPulls: BossContext["recentPulls"] = [];

  const { data: recentInstances } = await supabase
    .from("card_instances")
    .select("card_catalog_id,acquired_at")
    .eq("current_owner_id", userId)
    .order("acquired_at", { ascending: false })
    .limit(MAX_RECENT_PULLS);

  if (recentInstances && recentInstances.length > 0) {
    const catalogIds = [
      ...new Set(
        recentInstances.map(
          (row: { card_catalog_id: string }) => row.card_catalog_id
        )
      ),
    ];

    const { data: catalogRows } = await supabase
      .from("card_catalog")
      .select("id,name,game_rarity")
      .in("id", catalogIds);

    const catalogMap = new Map(
      (catalogRows ?? []).map(
        (row: { id: string; name: string; game_rarity: string | null }) => [
          row.id,
          row,
        ]
      )
    );

    recentPulls = recentInstances
      .map((row: { card_catalog_id: string }) => {
        const card = catalogMap.get(row.card_catalog_id);
        if (!card) return null;
        return {
          name: card.name,
          rarity: card.game_rarity,
        };
      })
      .filter(
        (value: { name: string; rarity: string | null } | null): value is {
          name: string;
          rarity: string | null;
        } => Boolean(value)
      );
  }

  return {
    duelistName,
    bossName,
    bossPersonality,
    duelPoints,
    league,
    activeDeck,
    pendingActions,
    topRival,
    recentPulls,
  };
}

// Renders the context as compact plain-text lines for the AI
// prompt - kept short on purpose (see boss-companion.ts) so a
// single question never sends a large payload.
export function formatBossContext(
  context: BossContext
): string {
  const lines: string[] = [];

  lines.push(`Duelist: ${context.duelistName}`);
  lines.push(`Duel Points: ${context.duelPoints}`);

  if (context.league) {
    const l = context.league;
    lines.push(
      `League standing: rank ${l.rank ?? "?"} of ${l.memberCount}, record ${l.wins}-${l.losses}${
        l.draws > 0 ? `-${l.draws}` : ""
      }`
    );
    if (l.streak.type && l.streak.count > 1) {
      lines.push(
        `Current streak: ${l.streak.count} ${
          l.streak.type === "W" ? "wins" : l.streak.type === "L" ? "losses" : "draws"
        } in a row`
      );
    }
  } else {
    lines.push("League standing: not in a league yet");
  }

  if (context.activeDeck) {
    lines.push(
      `Active deck: "${context.activeDeck.name}" (${context.activeDeck.mainCount} Main / ${context.activeDeck.extraCount} Extra)`
    );
  } else {
    lines.push("Active deck: none set");
  }

  if (context.pendingActions.length > 0) {
    lines.push(
      `Pending actions: ${context.pendingActions
        .map((a) => a.label)
        .join("; ")}`
    );
  } else {
    lines.push("Pending actions: none");
  }

  if (context.topRival) {
    const r = context.topRival;
    lines.push(
      `Top rival: ${r.name} (record vs them: ${r.wins}-${r.losses}${
        r.draws > 0 ? `-${r.draws}` : ""
      })`
    );
  }

  if (context.recentPulls.length > 0) {
    lines.push(
      `Recent card pulls: ${context.recentPulls
        .map((p) => `${p.name}${p.rarity ? ` (${p.rarity})` : ""}`)
        .join(", ")}`
    );
  }

  return lines.join("\n");
}
