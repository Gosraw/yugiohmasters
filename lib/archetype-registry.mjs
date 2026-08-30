// =========================================================
// ARCHETYPE REGISTRY - READ API
//
// getArchetype(client, codeOrName) is the one function the app is meant to
// call: `getArchetype(supabase, "Blue-Eyes")` returns everything section 12
// of the Archetype Registry brief asked for (name, description, health,
// card count, core cards, support cards, bosses, Fusion monsters, Xyz
// monsters, recommended package, progression bosses, and gap information)
// as one plain object, ready for deckbuilding/starter-deck/reward-pool UI.
//
// ARCHITECTURE (same lesson as lib/format-eligibility.mjs's header)
// This module does NOT construct its own Supabase client - that pattern
// exits the process immediately when env vars are absent, which makes a
// module unsafe to import from a test file or any context that hasn't
// already set up a client. Instead getArchetype() takes an already-built
// client as its first argument (dependency injection), and the pure
// shaping logic (shapeArchetype) needs no client or network access at all
// - it can be, and is, unit-tested directly with plain fixture objects
// (see lib/archetype-registry.regression.test.mjs).
//
// DATA SOURCE
// Reads live public.archetype_registry / public.archetype_cards /
// public.card_catalog (schema: supabase/migrations/
// 202608301300_archetype_registry_schema.sql; seed data generated from
// data/archetype-registry.mjs by scripts/generate-archetype-registry-
// migration.mjs into supabase/migrations/202608301400_seed_archetype_
// registry.sql). This module has no offline fallback - if the tables are
// empty (seed migration not yet applied), getArchetype() returns null.
// =========================================================

const CARD_SELECT =
  "role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes, card_catalog:card_catalog_id (id, name, card_type, game_rarity, archetype)";

/**
 * Pure shaping function: takes the raw archetype_registry row and the
 * joined archetype_cards+card_catalog rows for it, and returns the
 * app-ready object shape. No I/O, no client - fully unit-testable.
 *
 * @param {object} archetypeRow - a row from public.archetype_registry
 * @param {Array<object>} cardRows - rows from public.archetype_cards, each
 *   with a nested `card_catalog` object (as CARD_SELECT's join shape
 *   produces, or an equivalent plain-object fixture in tests)
 */
export function shapeArchetype(archetypeRow, cardRows) {
  if (!archetypeRow) return null;

  const cards = (cardRows ?? []).map((row) => {
    const cc = row.card_catalog ?? {};
    return {
      id: cc.id ?? null,
      name: cc.name ?? null,
      cardType: cc.card_type ?? null,
      gameRarity: cc.game_rarity ?? null,
      role: row.role,
      extraDeckKind: row.extra_deck_kind ?? null,
      summonDifficulty: row.summon_difficulty ?? null,
      packageTier: row.package_tier ?? null,
      bossStage: row.boss_stage ?? null,
      needsReview: !!row.needs_review,
      notes: row.notes ?? null,
    };
  });

  const byRole = (role) => cards.filter((c) => c.role === role);
  const byTier = (tier) => cards.filter((c) => c.packageTier === tier);
  const bosses = byRole("BOSS");

  const bossStageMap = { EARLY: null, MID: null, LATE: null, SIGNATURE: null };
  for (const c of cards) {
    if (c.bossStage && bossStageMap[c.bossStage] !== undefined) bossStageMap[c.bossStage] = c.name;
  }

  return {
    code: archetypeRow.code,
    name: archetypeRow.name,
    description: archetypeRow.description ?? null,
    health: archetypeRow.overall_health,
    profile: {
      nostalgiaRelevance: archetypeRow.nostalgia_relevance,
      consistency: archetypeRow.consistency,
      removal: archetypeRow.removal,
      defense: archetypeRow.defense,
      recovery: archetypeRow.recovery,
      bossPower: archetypeRow.boss_power,
      summoningSpeed: archetypeRow.summoning_speed,
      overallHealth: archetypeRow.overall_health,
      deckReality: archetypeRow.deck_reality,
    },
    cardCount: cards.length,
    cards: {
      core: byRole("CORE"),
      support: byRole("SUPPORT"),
      boss: bosses,
      utility: byRole("UTILITY"),
      niche: byRole("NICHE"),
      avoid: byRole("AVOID"),
    },
    bosses: {
      fusion: bosses.filter((c) => c.extraDeckKind === "FUSION"),
      xyz: bosses.filter((c) => c.extraDeckKind === "XYZ"),
      mainDeck: bosses.filter((c) => !c.extraDeckKind),
    },
    packages: {
      essential: byTier("ESSENTIAL"),
      recommended: byTier("RECOMMENDED"),
      expansion: byTier("EXPANSION"),
    },
    bossProgression: {
      early: bossStageMap.EARLY,
      mid: bossStageMap.MID,
      late: bossStageMap.LATE,
      signature: bossStageMap.SIGNATURE,
    },
    gaps: archetypeRow.gaps ?? [],
    needsReviewCount: cards.filter((c) => c.needsReview).length,
    notes: archetypeRow.notes ?? null,
  };
}

/**
 * Fetches one archetype (by `code` or exact `name`) and returns the
 * app-ready shape from shapeArchetype(), or null if not found.
 *
 * @param {object} client - a Supabase client (or any object exposing the
 *   same `.from(table).select(...)` query-builder interface) - never
 *   constructed by this module, always passed in by the caller.
 * @param {string} codeOrName - e.g. "blue_eyes" or "Blue-Eyes"
 */
export async function getArchetype(client, codeOrName) {
  const { data: archetypeRow, error: archErr } = await client
    .from("archetype_registry")
    .select("*")
    .or(`code.eq.${codeOrName},name.eq.${codeOrName}`)
    .maybeSingle();

  if (archErr) throw archErr;
  if (!archetypeRow) return null;

  const { data: cardRows, error: cardsErr } = await client
    .from("archetype_cards")
    .select(CARD_SELECT)
    .eq("archetype_id", archetypeRow.id);

  if (cardsErr) throw cardsErr;

  return shapeArchetype(archetypeRow, cardRows ?? []);
}

/**
 * Fetches every archetype's app-ready shape in registry priority_rank
 * order (nulls last). Two round trips regardless of archetype count -
 * useful for a "choose your archetype" overview screen.
 *
 * @param {object} client - see getArchetype()
 */
export async function listArchetypes(client) {
  const { data: archetypeRows, error: archErr } = await client
    .from("archetype_registry")
    .select("*")
    .order("priority_rank", { ascending: true, nullsFirst: false });

  if (archErr) throw archErr;
  if (!archetypeRows?.length) return [];

  const { data: allCardRows, error: cardsErr } = await client
    .from("archetype_cards")
    .select(`archetype_id, ${CARD_SELECT}`)
    .in(
      "archetype_id",
      archetypeRows.map((a) => a.id)
    );

  if (cardsErr) throw cardsErr;

  const cardsByArchetype = new Map();
  for (const row of allCardRows ?? []) {
    if (!cardsByArchetype.has(row.archetype_id)) cardsByArchetype.set(row.archetype_id, []);
    cardsByArchetype.get(row.archetype_id).push(row);
  }

  return archetypeRows.map((row) => shapeArchetype(row, cardsByArchetype.get(row.id) ?? []));
}
