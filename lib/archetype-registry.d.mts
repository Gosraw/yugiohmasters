// Type declarations for archetype-registry.mjs - see that file's header
// for why this stays a plain .mjs module (dependency-injected Supabase
// client, no top-level client construction) rather than native .ts.

export type ArchetypeRole = "CORE" | "SUPPORT" | "BOSS" | "UTILITY" | "NICHE" | "AVOID";
export type ExtraDeckKind = "FUSION" | "XYZ" | null;
export type SummonDifficulty = "EASY" | "MODERATE" | "HARD" | "VERY_HARD" | null;
export type PackageTier = "ESSENTIAL" | "RECOMMENDED" | "EXPANSION" | null;
export type BossStage = "EARLY" | "MID" | "LATE" | "SIGNATURE" | null;
export type LevelLMH = "LOW" | "MEDIUM" | "HIGH";
export type SummoningSpeed = "SLOW" | "MEDIUM" | "FAST";
export type OverallHealth = "TOO_WEAK" | "WEAK" | "HEALTHY" | "STRONG" | "TOO_STRONG";
export type DeckReality = "FULL_DECK" | "ENGINE_PLUS_GENERIC" | "THIN_THEME";

export type ArchetypeCardRow = {
  role: ArchetypeRole;
  extra_deck_kind?: ExtraDeckKind;
  summon_difficulty?: SummonDifficulty;
  package_tier?: PackageTier;
  boss_stage?: BossStage;
  needs_review?: boolean | null;
  notes?: string | null;
  card_catalog: {
    id: string;
    name: string;
    card_type: string | null;
    game_rarity?: string | null;
    archetype?: string | null;
  };
};

export type ArchetypeRegistryRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priority_rank: number | null;
  nostalgia_relevance: LevelLMH;
  consistency: LevelLMH;
  removal: LevelLMH;
  defense: LevelLMH;
  recovery: LevelLMH;
  boss_power: LevelLMH;
  summoning_speed: SummoningSpeed;
  overall_health: OverallHealth;
  deck_reality: DeckReality;
  gaps: Array<{ category: string; description: string }>;
  notes: string | null;
};

export type ShapedCard = {
  id: string | null;
  name: string | null;
  cardType: string | null;
  gameRarity: string | null;
  role: ArchetypeRole;
  extraDeckKind: ExtraDeckKind;
  summonDifficulty: SummonDifficulty;
  packageTier: PackageTier;
  bossStage: BossStage;
  needsReview: boolean;
  notes: string | null;
};

export type ShapedArchetype = {
  code: string;
  name: string;
  description: string | null;
  health: OverallHealth;
  profile: {
    nostalgiaRelevance: LevelLMH;
    consistency: LevelLMH;
    removal: LevelLMH;
    defense: LevelLMH;
    recovery: LevelLMH;
    bossPower: LevelLMH;
    summoningSpeed: SummoningSpeed;
    overallHealth: OverallHealth;
    deckReality: DeckReality;
  };
  cardCount: number;
  cards: {
    core: ShapedCard[];
    support: ShapedCard[];
    boss: ShapedCard[];
    utility: ShapedCard[];
    niche: ShapedCard[];
    avoid: ShapedCard[];
  };
  bosses: {
    fusion: ShapedCard[];
    xyz: ShapedCard[];
    mainDeck: ShapedCard[];
  };
  packages: {
    essential: ShapedCard[];
    recommended: ShapedCard[];
    expansion: ShapedCard[];
  };
  bossProgression: {
    early: string | null;
    mid: string | null;
    late: string | null;
    signature: string | null;
  };
  gaps: Array<{ category: string; description: string }>;
  needsReviewCount: number;
  notes: string | null;
};

export interface SupabaseLikeClient {
  from(table: string): any;
}

export function shapeArchetype(
  archetypeRow: ArchetypeRegistryRow | null,
  cardRows: ArchetypeCardRow[]
): ShapedArchetype | null;

export function getArchetype(
  client: SupabaseLikeClient,
  codeOrName: string
): Promise<ShapedArchetype | null>;

export function listArchetypes(client: SupabaseLikeClient): Promise<ShapedArchetype[]>;
