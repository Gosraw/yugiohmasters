import Link from "next/link";

import {
  HomeCard,
} from "@/components/home-card";

import type {
  AttentionItem,
} from "@/lib/attention-items";

// =========================================================
// HOME: WAITING ON YOU card (2.0)
//
// Renders the shared attention items (src/lib/attention-items.ts:
// duel challenges, results to confirm, trade offers, the card
// vote) as rows with a gold pill. Same list the /attention page
// and the nav badge use, so they always agree.
// =========================================================

const ACTION_LABEL: Record<AttentionItem["kind"], string> = {
  challenge: "Answer",
  confirm: "Confirm",
  trade: "Review",
  vote: "Vote",
  dispute: "Decide",
};

const MAX_ROWS = 4;

export function HomeWaitingOnYou({
  items,
}: {
  items: AttentionItem[];
}) {
  const visible =
    items.slice(
      0,
      MAX_ROWS
    );

  const hidden =
    items.length -
    visible.length;

  return (
    <HomeCard
      title="Waiting on you"
      aside={
        items.length > 0
          ? `${items.length}`
          : null
      }
      href={
        items.length > 0
          ? "/attention"
          : undefined
      }
      hrefLabel={
        items.length > 0
          ? "View all"
          : undefined
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nothing right now. You&apos;re all caught up.
        </p>
      ) : (
        <ul className="-mx-1">
          {visible.map(
            (item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-1 py-1.5 transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-zinc-100">
                      {item.label}
                    </span>

                    <span className="block truncate text-[11px] text-zinc-500">
                      {item.hint}
                    </span>
                  </span>

                  <span className="shrink-0 rounded-full border border-[rgb(242_196_90/.5)] bg-[rgb(242_196_90/.16)] px-2.5 py-1 text-[11px] font-bold text-gold-bright">
                    {ACTION_LABEL[item.kind] ?? "Open"}
                  </span>
                </Link>
              </li>
            )
          )}

          {hidden > 0 ? (
            <li className="px-1 pt-1 text-[11px] text-zinc-500">
              +{hidden} more
            </li>
          ) : null}
        </ul>
      )}
    </HomeCard>
  );
}
