import Link from "next/link";

import {
  Bell,
  CheckCircle2,
  Repeat2,
  Swords,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  getAttentionItems,
} from "@/lib/attention-items";

import {
  getLeagueIdForUser,
} from "@/lib/league-stats";

import {
  EmptyState,
} from "@/components/empty-state";

export const dynamic = "force-dynamic";

const KIND_ICON = {
  challenge: Swords,
  confirm: CheckCircle2,
  trade: Repeat2,
};

export default async function AttentionPage() {
  const { supabase, userId } = await requireUser();

  const leagueId = await getLeagueIdForUser(supabase, userId);
  const items = await getAttentionItems(supabase, userId, leagueId);

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-amber-400/[0.06] blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-amber-200">
          <Bell size={12} />
          Attention Center
        </div>

        <h1 className="gold-text mt-4 text-3xl font-black sm:text-4xl">
          Waiting On You
        </h1>

        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          Everything in the league where you need to take the next step.
        </p>

        {items.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={<CheckCircle2 size={22} />}
              title="You're all caught up"
              description="No challenges, confirmations or trade offers are waiting on you."
            />
          </div>
        ) : (
          <div className="mt-8 space-y-2">
            {items.map((item) => {
              const Icon = KIND_ICON[item.kind];

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="panel group flex cursor-pointer items-center gap-4 p-4 transition-all hover:-translate-y-0.5 hover:border-amber-300/25"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/[0.06] text-amber-300">
                    <Icon size={17} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-zinc-100 group-hover:text-amber-200">
                      {item.label}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {item.hint}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
