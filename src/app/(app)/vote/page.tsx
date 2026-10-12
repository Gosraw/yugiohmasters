import Link from "next/link";

import {
  ArrowLeft,
  Vote,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  getLeagueIdForUser,
} from "@/lib/league-stats";

import {
  EmptyState,
} from "@/components/empty-state";

import {
  VoteDeck,
  type VoteDeckItem,
} from "@/components/vote-deck";

import {
  loadMyVotes,
  loadVoteItems,
} from "./_lib/load";

// =========================================================
// CARD VOTE (2.0 card pool vote - "stem-scherm")
//
// docs/V2_PLAN.md, "Card pool & ranking": the whole group votes
// on the proposed card ranking - per Boss theme, every
// Legendary, the Secret Rare border cases and the proposed
// forbidden / 1-per-deck list. Majority wins, the owner breaks
// ties (see /vote/results). Items are seeded per league by
// scripts/cardpool/seed-vote-items.mjs.
// =========================================================

export const dynamic =
  "force-dynamic";

export default async function VotePage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const leagueId =
    await getLeagueIdForUser(
      supabase,
      userId
    );

  const [rows, myVotes] =
    leagueId
      ? await Promise.all([
          loadVoteItems(
            supabase,
            leagueId
          ),
          loadMyVotes(
            supabase,
            userId
          ),
        ])
      : [[], {}];

  const items: VoteDeckItem[] =
    rows.map(
      (row) => ({
        id: row.id,
        listKey: row.list_key,
        listTitle: row.list_title,
        cardName:
          row.card?.name ?? "Unknown card",
        imageUrl:
          row.card?.image_url ??
          row.card?.image_url_small ??
          null,
        cardType:
          row.card?.card_type ?? null,
        verdict: row.proposed_verdict,
        context: row.context,
      })
    );

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-amber-400/[0.06] blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <Link
          href="/profile"
          className="flex min-h-10 w-fit items-center gap-1.5 text-sm font-bold text-zinc-400 transition hover:text-amber-200"
        >
          <ArrowLeft
            size={15}
          />
          Profile
        </Link>

        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-amber-200">
          <Vote
            size={12}
          />
          Card Vote
        </div>

        <h1 className="gold-text mt-4 text-3xl font-black sm:text-4xl">
          Rate the card pool
        </h1>

        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          For every card: does the proposed rarity or ban feel right?
          Too strong makes it rarer (or bans it), too weak makes it
          more common. The majority wins; the league owner breaks ties.
        </p>

        {items.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={
                <Vote
                  size={24}
                />
              }
              title="No vote open right now"
              description="When the league opens a card vote, the cards show up here."
            />
          </div>
        ) : (
          <VoteDeck
            items={items}
            initialVotes={
              myVotes
            }
          />
        )}
      </div>
    </main>
  );
}
