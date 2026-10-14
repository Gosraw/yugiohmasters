import {
  Layers,
  Mountain,
  Swords,
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
    tagline: "Bounce your Boss up the Millennium pyramid.",
    href: "/games/climber",
    icon: Mountain,
    dailyName: "Daily Climb",
    showDailyStatus: true,
    formatScore: (score) => `${count(score)} m`,
  },
  {
    id: "pyramid_stack",
    title: "Pyramid Stack",
    tagline: "Drop sandstone blocks, one tap each. Perfect drops keep the tower wide.",
    href: "/games/stack",
    icon: Layers,
    dailyName: "Daily Stack",
    showDailyStatus: true,
    formatScore: (score) => `${count(score)} ${score === 1 ? "block" : "blocks"}`,
  },
  {
    id: "auto_battler",
    title: "Shadow Arena",
    tagline: "Auto battler: build a team from a shared shop and take on 20 Boss waves.",
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
