// =========================================================
// MINI GAMES ON/OFF SWITCH
//
// 2.0 launches WITHOUT mini games (owner decision 2026-10-30).
// All the game code stays; this one flag hides every entry point:
//   - the "Mini Games" card on the Play hub
//   - the /games/* routes (src/app/(app)/games/layout.tsx sends
//     visitors to Home while this is false)
//   - the "Mini games" reward section on the admin config page
//
// To bring them back later:
//   1. set MINI_GAMES_ENABLED = true below;
//   2. undo the database side of
//      supabase/migrations/202610301100_hide_mini_games.sql in a
//      new migration (set mini_game_catalog.active back to true for
//      the games you want, and grant execute on
//      settle_mini_game_period(text, text) to authenticated again).
// =========================================================

export const MINI_GAMES_ENABLED: boolean = false;
