import {
  Swords,
} from "lucide-react";

// =========================================================
// APP-WIDE LOADING STATE
//
// Next.js shows this automatically the instant you navigate
// to any page under (app), while that page's server-side data
// is still being fetched — so a tap always gets an immediate
// visual response instead of a blank white gap.
// =========================================================

export default function AppLoading() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="flex flex-col items-center gap-4">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-amber-300/15 border-t-amber-300" />

          <Swords
            size={22}
            className="text-amber-300"
          />
        </div>

        <p className="text-xs font-black uppercase tracking-[.25em] text-zinc-600">
          Loading
        </p>
      </div>
    </main>
  );
}
