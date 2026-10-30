import {
  redirect,
} from "next/navigation";

import {
  MINI_GAMES_ENABLED,
} from "@/lib/games/flag";

// =========================================================
// MINI GAMES GATE
//
// While mini games are switched off (src/lib/games/flag.ts),
// every /games/* page sends the visitor to Home. The pages
// themselves stay untouched so they come back with the flag.
// =========================================================

export default function GamesLayout(
  {
    children,
  }: {
    children: React.ReactNode;
  }
) {
  if (!MINI_GAMES_ENABLED) {
    redirect(
      "/"
    );
  }

  return children;
}
