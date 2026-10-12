"use client";

import Link from "next/link";

import {
  Home,
  LibraryBig,
  ShoppingBag,
  Swords,
  UserRound,
} from "lucide-react";

import type {
  LucideIcon,
} from "lucide-react";

import {
  usePathname,
} from "next/navigation";

// =========================================================
// BOTTOM NAV (2.0)
//
// Exactly five hubs: Home · Play · Cards · Shop · Profile
// (docs/V2_PLAN.md, "Simplicity & navigation"). Every other
// screen lives inside one of these hubs, so `matches` lists
// the route prefixes that light up each tab - e.g. a deck
// page keeps "Cards" active, a rivalry page keeps "Profile"
// active.
// =========================================================

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  matches: readonly string[];
};

const items: readonly NavItem[] = [
  {
    href: "/",
    label: "Home",
    icon: Home,
    matches: [
      "/attention",
      "/season",
    ],
  },
  {
    href: "/play",
    label: "Play",
    icon: Swords,
    matches: [
      "/play",
      "/matches",
      "/competitions",
      "/duel-companion",
      "/league",
    ],
  },
  {
    href: "/cards/collection",
    label: "Cards",
    icon: LibraryBig,
    matches: [
      "/cards",
      "/decks",
      "/trades",
    ],
  },
  {
    href: "/shop",
    label: "Shop",
    icon: ShoppingBag,
    matches: [
      "/shop",
    ],
  },
  {
    href: "/profile",
    label: "Profile",
    icon: UserRound,
    matches: [
      "/profile",
      "/boss",
      "/wallet",
      "/perks",
      "/achievements",
      "/records",
      "/rivalries",
      "/stats",
    ],
  },
];

function matchesPrefix(
  pathname: string,
  prefix: string
) {
  return (
    pathname === prefix ||
    pathname.startsWith(
      `${prefix}/`
    )
  );
}

function isActiveItem(
  pathname: string,
  item: NavItem
) {
  if (
    item.href === "/" &&
    pathname === "/"
  ) {
    return true;
  }

  return item.matches.some(
    (prefix) =>
      matchesPrefix(
        pathname,
        prefix
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

  const activeIndex =
    items.findIndex(
      (item) =>
        isActiveItem(
          pathname,
          item
        )
    );

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[rgb(242_196_90/.25)] bg-[rgb(6_9_22/.92)] pb-[max(.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-18px_50px_rgba(2,4,14,.55)] backdrop-blur-xl"
    >
      {/* Faint gold hairline glow along the top edge */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgb(255_216_110/.55)] to-transparent" />

      <div className="mx-auto max-w-xl px-2">
        <div className="relative grid grid-cols-5">
          {/* One shared active bar that glides between tabs
              (CSS transform transition; during a tab view
              transition it is its own named layer, see
              .dc-nav-indicator in globals.css). */}
          <span
            aria-hidden="true"
            className="dc-nav-indicator pointer-events-none absolute -top-1.5 left-0 flex w-1/5 justify-center"
            style={{
              transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`,
              opacity:
                activeIndex < 0
                  ? 0
                  : 1,
            }}
          >
            <span className="h-[2px] w-8 rounded-full bg-[#ffd86e] shadow-[0_0_12px_rgba(255,207,94,.75)]" />
          </span>

          {items.map(
            (item) => {
              const Icon =
                item.icon;

              const active =
                isActiveItem(
                  pathname,
                  item
                );

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  transitionTypes={[
                    "nav-tab",
                  ]}
                  aria-current={
                    active
                      ? "page"
                      : undefined
                  }
                  className={`group relative flex min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1 pb-1 pt-2 transition-colors duration-150 active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100 ${
                    active
                      ? "text-[#f2c45a]"
                      : "text-[#8f93a8] hover:text-[#ece6d6]"
                  }`}
                >
                  <span className="relative flex h-7 w-7 items-center justify-center">
                    <Icon
                      size={21}
                      strokeWidth={
                        active
                          ? 2.2
                          : 1.8
                      }
                      className={
                        active
                          ? "drop-shadow-[0_0_8px_rgba(242,196,90,.55)]"
                          : ""
                      }
                    />

                    {item.href === "/" && attentionCount > 0 && (
                      <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full border border-[#060916] bg-red-500 px-1 text-[9px] font-black text-white">
                        {attentionCount > 9 ? "9+" : attentionCount}
                      </span>
                    )}
                  </span>

                  <span className="whitespace-nowrap text-[11px] font-semibold tracking-[.02em]">
                    {item.label}
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
