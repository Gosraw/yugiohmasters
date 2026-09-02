import type {
  requireUser,
} from "@/lib/supabase/queries";

// =========================================================
// SHARED BOSS IDENTITY LOOKUP
//
// Season 1 audit finding: profiles.boss_monster_option_id /
// boss_monster_options is the OLD pre-Boss-Route concept (a single
// cosmetic monster picked once via the now-unreachable /onboarding
// flow, never evolving). It is not kept in sync once a player has
// chosen a real Boss Route, and - because the mandatory Season 1
// onboarding gate in src/lib/supabase/proxy.ts sends every new
// player through /boss/select instead of /onboarding - it is never
// even set for a Season 1 player unless they separately visit
// /profile's still-live "Choose Boss Monster" picker. The result,
// before this fix: a player who has clearly already chosen and is
// actively progressing a Boss Route (public.player_boss_paths) was
// shown as "Unbound" / "Identity Not Yet Chosen" on every surface
// except Home, which was fixed earlier in the Season 1 audit to read
// player_boss_paths (route_slot = 1) + the route's current-stage
// evolution card directly - see src/app/(app)/page.tsx's own
// "AUDIT FIX (Season 1 audit, Home boss identity item)" comment.
//
// This helper is that exact same lookup, factored out so every
// other player-facing surface (matches, league, trades, profile)
// shows the same, correct, currently-evolving Boss identity instead
// of independently re-deriving it or falling back to the stale
// cosmetic field. It is read-only and RLS-safe for any league
// member's profileId, not just the caller's own - see
// player_boss_paths_read_league in
// supabase/migrations/202609011600_boss_route_schema.sql ("all
// three friends can see each other's Boss Path progress").
//
// This deliberately does NOT touch profiles.boss_monster_option_id
// or boss_monster_options - that legacy concept and its /profile
// picker are left in place (out of scope for this audit pass), this
// helper simply stops other pages from trusting it for "does this
// player have a Boss identity yet".
// =========================================================

type SupabaseClient =
  Awaited<
    ReturnType<typeof requireUser>
  >["supabase"];

export type BossIdentity = {
  cardId: string;
  name: string;
  imageUrl: string | null;
  routeName: string | null;
  currentStage: number;
  subtitle: string;
};

/**
 * Resolves a single player's current Season 1 Boss identity
 * (route_slot = 1) for display purposes. Returns null if the player
 * has not yet chosen a Boss Route, or if the route/stage/card data
 * cannot be resolved (mirrors Home's own null-handling - callers
 * should treat null the same way they treat "no boss_monster_option_id"
 * today, e.g. falling back to an "Unbound" label).
 */
export async function getPrimaryBossIdentity(
  supabase: SupabaseClient,
  profileId: string,
): Promise<BossIdentity | null> {
  const identities = await getPrimaryBossIdentities(supabase, [profileId]);
  return identities.get(profileId) ?? null;
}

/**
 * Batched version of getPrimaryBossIdentity for pages that render a
 * roster of players at once (League, Matches lists). Runs one query
 * per table rather than one round-trip per player.
 */
export async function getPrimaryBossIdentities(
  supabase: SupabaseClient,
  profileIds: string[],
): Promise<Map<string, BossIdentity>> {
  const result = new Map<string, BossIdentity>();

  const uniqueIds = [...new Set(profileIds)].filter(Boolean);
  if (uniqueIds.length === 0) {
    return result;
  }

  const { data: bossPaths, error: bossPathsError } = await supabase
    .from("player_boss_paths")
    .select("profile_id,route_id,current_stage")
    .in("profile_id", uniqueIds)
    .eq("route_slot", 1);

  if (bossPathsError || !bossPaths || bossPaths.length === 0) {
    return result;
  }

  const routeIds = [...new Set(bossPaths.map((p) => p.route_id))];

  const [{ data: routes }, { data: stages }] = await Promise.all([
    supabase
      .from("boss_routes")
      .select("id,name")
      .in("id", routeIds),
    supabase
      .from("boss_route_stages")
      .select("route_id,stage_number,evolution_card_catalog_id")
      .in("route_id", routeIds),
  ]);

  const routeNameById = new Map(
    (routes ?? []).map((r) => [r.id as string, r.name as string]),
  );

  const stageKey = (routeId: string, stageNumber: number) => `${routeId}::${stageNumber}`;

  const stageByKey = new Map(
    (stages ?? []).map((s) => [
      stageKey(s.route_id as string, s.stage_number as number),
      s.evolution_card_catalog_id as string | null,
    ]),
  );

  const cardIds = [
    ...new Set(
      bossPaths
        .map((p) => stageByKey.get(stageKey(p.route_id, p.current_stage)))
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (cardIds.length === 0) {
    return result;
  }

  const { data: cards } = await supabase
    .from("card_catalog")
    .select("id,name,image_url")
    .in("id", cardIds);

  const cardById = new Map(
    (cards ?? []).map((c) => [c.id as string, c]),
  );

  for (const path of bossPaths) {
    const cardId = stageByKey.get(stageKey(path.route_id, path.current_stage));
    if (!cardId) continue;

    const card = cardById.get(cardId);
    if (!card) continue;

    const routeName = routeNameById.get(path.route_id) ?? null;
    const subtitle = routeName
      ? `${routeName} · Stage ${path.current_stage} of 4`
      : `Stage ${path.current_stage} of 4`;

    result.set(path.profile_id as string, {
      cardId: card.id,
      name: card.name,
      imageUrl: card.image_url ?? null,
      routeName,
      currentStage: path.current_stage,
      subtitle,
    });
  }

  return result;
}
