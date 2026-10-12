import Link from "next/link";

import {
  Compass,
  Home,
} from "lucide-react";

// =========================================================
// APP 404 (inside the app shell, bottom nav stays)
//
// Shown when a page under (app) calls notFound() - a trade, duel,
// deck, card, competition, Boss Route or player that doesn't exist
// (or that this player isn't allowed to see). A direct page load of
// a missing id gets a real 404 status from src/proxy.ts; a tap
// inside the app streams this screen.
// =========================================================

export default function AppNotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="panel w-full max-w-md p-6 text-center sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/[0.06]">
          <Compass
            size={24}
            className="text-amber-300"
          />
        </div>

        <p className="mt-5 text-xs font-black tracking-[.3em] text-amber-300">
          404
        </p>

        <h1 className="mt-1 text-xl font-black text-zinc-100">
          Nothing here
        </h1>

        <p className="mt-2 text-sm leading-6 text-zinc-500">
          This page doesn&apos;t exist, was removed, or isn&apos;t yours to see.
        </p>

        <Link
          href="/"
          className="primary-button mt-6 inline-flex items-center gap-2"
        >
          <Home
            size={15}
          />
          Back to Home
        </Link>
      </div>
    </main>
  );
}
