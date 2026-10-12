import Link from "next/link";

import {
  ChevronRight,
} from "lucide-react";

import type {
  ReactNode,
} from "react";

// =========================================================
// HOME CARD (2.0, Night Temple option B)
//
// The glassy lapis card with a gold hairline and a small gold
// uppercase heading ("WEEKLY GOALS · 2 / 3") from the provisional
// Home design. `href` adds a quiet chevron link in the heading row.
// =========================================================

export function HomeCard({
  title,
  aside,
  href,
  hrefLabel,
  children,
  className = "",
}: {
  title: ReactNode;
  aside?: ReactNode;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-[rgb(242_196_90/.28)] bg-[rgb(14_20_44/.7)] px-4 py-3.5 shadow-[0_18px_50px_rgb(2_4_14/.45)] backdrop-blur-[10px] ${className}`}
    >
      <div className="flex min-h-6 items-center justify-between gap-3">
        <h2 className="font-sans text-[11px] font-bold uppercase tracking-[.14em] text-gold">
          {title}
        </h2>

        {aside || href ? (
          <div className="flex shrink-0 items-center gap-2 text-[11px] text-zinc-500">
            {aside}

            {href ? (
              <Link
                href={href}
                aria-label={hrefLabel}
                className="-mr-1.5 inline-flex h-8 min-w-8 items-center justify-center gap-0.5 rounded-lg px-1.5 font-semibold text-gold/80 transition-colors hover:text-gold-bright active:scale-95"
              >
                {hrefLabel ? (
                  <span className="sr-only sm:not-sr-only">
                    {hrefLabel}
                  </span>
                ) : null}

                <ChevronRight
                  size={16}
                />
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-2">
        {children}
      </div>
    </section>
  );
}
