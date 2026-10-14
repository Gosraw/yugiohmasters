import {
  Axe,
  Blocks,
  Grid2x2,
  Layers,
  Mountain,
  Spade,
  Swords,
  Target,
  type LucideIcon,
} from "lucide-react";

// =========================================================
// MINI GAME REGISTRY (2.0)
//
// The /games hub (and admin labels) list games from here, so a
// new game only adds ONE entry below (plus its catalog row via
// register_mini_game() in a migration, see
// supabase/migrations/202610142000_mini_game_catalog.sql).
//
// `id` is the database game key (game_runs.game /
// mini_game_catalog.game). Order here is the order on the hub.
// =========================================================

export type MiniGameEntry = {
  id: string;
  title: string;
  /** One short line for the /games menu (fits one line on a phone). */
  tagline: string;
  href: string;
  icon: LucideIcon;
  /** "Daily Climb", "Daily Stack": the one-attempt challenge's name. */
  dailyName: string;
  /** Hub card shows today's attempt + leader (needs a readable score). */
  showDailyStatus: boolean;
  /** Score as shown on the hub ("1,234 m", "37 blocks"). */
  formatScore: (score: number) => string;
};

const count = (
  score: number
) => score.toLocaleString("en-US");

export const MINI_GAMES: MiniGameEntry[] = [
  {
    id: "pyramid_climb",
    title: "Pyramid Climb",
    tagline: "Bounce your Boss to the top.",
    href: "/games/climber",
    icon: Mountain,
    dailyName: "Daily Climb",
    showDailyStatus: true,
    formatScore: (score) => `${count(score)} m`,
  },
  {
    id: "pyramid_stack",
    title: "Pyramid Stack",
    tagline: "Tap, drop, stack it high.",
    href: "/games/stack",
    icon: Layers,
    dailyName: "Daily Stack",
    showDailyStatus: true,
    formatScore: (score) => `${count(score)} ${score === 1 ? "block" : "blocks"}`,
  },
  {
    id: "millennium_strike",
    title: "Millennium Strike",
    tagline: "Throw cards. Don't clash.",
    href: "/games/strike",
    icon: Target,
    dailyName: "Daily Strike",
    showDailyStatus: true,
    formatScore: (score) => `${count(score)} pts`,
  },
  {
    id: "obelisk_rush",
    title: "Obelisk Rush",
    tagline: "Chop fast. Dodge blades.",
    href: "/games/obelisk",
    icon: Axe,
    dailyName: "Daily Rush",
    showDailyStatus: true,
    formatScore: (score) => `${count(score)} pts`,
  },
  {
    id: "merge_ra",
    title: "Merge of Ra",
    tagline: "Slide, merge, summon Ra.",
    href: "/games/merge",
    icon: Grid2x2,
    dailyName: "Daily Merge",
    showDailyStatus: true,
    formatScore: (score) => `${count(score)} pts`,
  },
  {
    id: "tomb_blocks",
    title: "Tomb Blocks",
    tagline: "Fit the blocks. Clear the lines.",
    href: "/games/tomb",
    icon: Blocks,
    dailyName: "Daily Tomb",
    showDailyStatus: true,
    formatScore: (score) => `${count(score)} pts`,
  },
  {
    id: "giza_peaks",
    title: "Giza Peaks",
    tagline: "Chain cards. Clear the peaks.",
    href: "/games/peaks",
    icon: Spade,
    dailyName: "Daily Peaks",
    showDailyStatus: true,
    formatScore: (score) => `${count(score)} pts`,
  },
  {
    id: "auto_battler",
    title: "Shadow Arena",
    tagline: "Beat 20 Boss waves.",
    href: "/games/autobattler",
    icon: Swords,
    dailyName: "Daily Arena",
    showDailyStatus: false,
    formatScore: (score) => count(score),
  },
];

export function miniGameById(
  id: string
) {
  return MINI_GAMES.find(
    (game) => game.id === id
  ) ?? null;
}

export function miniGameTitle(
  id: string
) {
  return miniGameById(id)?.title ?? id;
}
