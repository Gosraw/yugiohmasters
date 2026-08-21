"use client";

import Link from "next/link";

import {
  Award,
  Compass,
  Home,
  Layers3,
  LibraryBig,
  Medal,
  Repeat2,
  ShoppingBag,
  Swords,
  Trophy,
  UserRound,
} from "lucide-react";

import {
  usePathname,
} from "next/navigation";

const items = [
  {
    href: "/",
    label: "HOME",
    icon: Home,
  },
  {
    href: "/league",
    label: "LEAGUE",
    icon: Trophy,
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
    href: "/trades",
    label: "TRADES",
    icon: Repeat2,
  },
  {
    href: "/competitions",
    label: "COMPETE",
    icon: Medal,
  },
  {
    href: "/achievements",
    label: "AWARDS",
    icon: Award,
  },
  {
    href: "/explore",
    label: "EXPLORE",
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
      <div className="mx-auto max-w-4xl overflow-x-auto px-2">
        <div className="flex min-w-max items-center justify-center gap-1">
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
                  className={`group relative flex min-w-[74px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 transition-all duration-150 active:scale-[0.93] ${
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

                  <span
                    className={`text-[9px] font-black tracking-[.08em] ${
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