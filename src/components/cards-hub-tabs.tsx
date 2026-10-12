import Link from "next/link";

import {
  Layers3,
  LibraryBig,
  Repeat2,
} from "lucide-react";

// =========================================================
// CARDS HUB TABS
//
// 2.0 menu: the bottom nav has a single "Cards" tab, so
// Collection, Decks and Trades are joined by this segmented
// control at the top of each of those three pages.
// =========================================================

export type CardsHubTab =
  | "collection"
  | "decks"
  | "trades";

const TABS = [
  {
    id: "collection",
    href: "/cards/collection",
    label: "Collection",
    icon: LibraryBig,
  },
  {
    id: "decks",
    href: "/decks",
    label: "Decks",
    icon: Layers3,
  },
  {
    id: "trades",
    href: "/trades",
    label: "Trades",
    icon: Repeat2,
  },
] as const;

export function CardsHubTabs({
  active,
  className = "",
}: {
  active: CardsHubTab;
  className?: string;
}) {
  return (
    <nav
      aria-label="Cards"
      className={`grid w-full max-w-md grid-cols-3 gap-1 rounded-2xl border border-amber-300/20 bg-[rgb(8_12_32/.75)] p-1 shadow-[inset_0_1px_0_rgba(255,216,110,.06)] ${className}`}
    >
      {TABS.map(
        (tab) => {
          const Icon =
            tab.icon;

          const isActive =
            tab.id === active;

          return (
            <Link
              key={
                tab.id
              }
              href={
                tab.href
              }
              aria-current={
                isActive
                  ? "page"
                  : undefined
              }
              className={`flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-bold transition-colors motion-reduce:transition-none ${
                isActive
                  ? "border border-amber-300/45 bg-amber-300/[0.12] text-amber-200 shadow-[0_0_18px_rgba(242,196,90,.18)]"
                  : "border border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
              }`}
            >
              <Icon
                size={16}
                className="shrink-0"
              />

              <span className="truncate">
                {
                  tab.label
                }
              </span>
            </Link>
          );
        }
      )}
    </nav>
  );
}
