"use client";

import Link from "next/link";

import {
  Compass,
  Home,
  Layers3,
  LibraryBig,
  ShoppingBag,
  Swords,
  UserRound,
} from "lucide-react";

import {
  usePathname,
} from "next/navigation";

// Kept deliberately short - one-handed, thumb-reachable core
// actions only. League standing, Trades, Competitions and
// Achievements moved to /explore: still one tap away, but no
// longer competing for space in the primary bar. See explore
// page.tsx for where they now live.
const items = [
  {
    href: "/",
    label: "HOME",
    icon: Home,
  },
  {
    href: "/cards/collection",
    label: "CARDS",
    icon: LibraryBig,
  },
  {
    href: "/decks",
    label: "DECKS",
    icon: Layers3,
  },
  {
    href: "/matches",
    label: "DUELS",
    icon: Swords,
  },
  {
    href: "/shop",
    label: "SHOP",
    icon: ShoppingBag,
  },
  {
    href: "/explore",
    label: "MORE",
    icon: Compass,
  },
  {
    href: "/profile",
    label: "PROFILE",
    icon: UserRound,
  },
] as const;

function isActiveRoute(
  pathname: string,
  href: string
) {
  if (href === "/") {
    return pathname === "/";
  }

  return (
    pathname === href ||
    pathname.startsWith(
      `${href}/`
    )
  );
}

export function BottomNav({
  attentionCount = 0,
}: {
  attentionCount?: number;
}) {
  const pathname =
    usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#090b10]/95 pb-[max(.55rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-15px_50px_rgba(0,0,0,.35)] backdrop-blur-xl">
      {/* Mobile fix (2026-08-30): this used to be min-w-max +
          overflow-x-auto with a 74px min-width per item - 7 items
          at 74px (plus gaps/padding) needs ~560px, so on a
          375-430px phone the primary nav itself required a
          horizontal swipe and PROFILE/MORE sat off-screen. Each
          item is now flex-1 so all 7 always fit one row on any
          phone width, no nav-bar scrolling required. */}
      <div className="mx-auto max-w-4xl px-1">
        <div className="flex items-center justify-between gap-0.5">
          {items.map(
            ({
              href,
              label,
              icon: Icon,
            }) => {
              const active =
                isActiveRoute(
                  pathname,
                  href
                );

              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={
                    active
                      ? "page"
                      : undefined
                  }
                  className={`group relative flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 transition-all duration-150 active:scale-[0.93] ${
                    active
                      ? "bg-amber-300/[0.08] text-amber-200"
                      : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  <span
                    className={`absolute -top-2 h-[2px] rounded-full bg-amber-300 transition-all ${
                      active
                        ? "w-7 opacity-100 shadow-[0_0_10px_rgba(252,211,77,.45)]"
                        : "w-0 opacity-0"
                    }`}
                  />

                  <div
                    className={`relative flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150 ${
                      active
                        ? "bg-amber-300/[0.08]"
                        : "group-hover:bg-white/[0.04]"
                    }`}
                  >
                    <Icon
                      size={18}
                      strokeWidth={
                        active
                          ? 2.2
                          : 1.8
                      }
                      className="transition-transform duration-150 group-hover:scale-105"
                    />

                    {href === "/" && attentionCount > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full border border-[#090b10] bg-red-500 px-1 text-[9px] font-black text-white">
                        {attentionCount > 9 ? "9+" : attentionCount}
                      </span>
                    )}
                  </div>

                  {/* Mobile fix (2026-09-01): PROFILE (7 chars) is the
                      longest label in this bar - at the old 9px size
                      with .08em tracking it slightly exceeded each
                      item's available width on a 375px phone with no
                      whitespace-nowrap guard, so it silently wrapped
                      onto two lines and broke the row's vertical
                      alignment with its six siblings. Tighter tracking
                      + a hair smaller size brings every label
                      (including PROFILE) under its column's width, and
                      whitespace-nowrap is now a hard guarantee against
                      wrapping on any narrower phone too. */}
                  <span
                    className={`whitespace-nowrap text-[8px] font-black tracking-[.02em] ${
                      active
                        ? "text-amber-200"
                        : ""
                    }`}
                  >
                    {label}
                  </span>
                </Link>
              );
            }
          )}
        </div>
      </div>
    </nav>
  );
}