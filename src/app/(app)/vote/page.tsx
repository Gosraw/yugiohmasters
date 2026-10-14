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
  type VoteItemRow,
} from "./_lib/load";

// =========================================================
// CARD VOTE
//
// The whole group votes on the proposed card ranking: per Boss
// route, every Legendary, the Secret Rare border cases and the
// proposed forbidden / 1-per-deck list. Majority wins, the
// league owner breaks ties (see /vote/results). The items are
// seeded per league by
// supabase/manual_deploy/20261012_live_vote_and_hotfix.sql.
// =========================================================

export const dynamic =
  "force-dynamic";

function cardTypeLine(
  card: VoteItemRow["card"]
): string | null {
  if (!card) return null;

  const parts = [
    card.attribute,
    card.race,
    card.card_type,
  ].filter(
    (part): part is string =>
      Boolean(part)
  );

  return parts.length
    ? parts.join(" · ")
    : null;
}

function cardStatsLine(
  card: VoteItemRow["card"]
): string | null {
  if (!card?.card_type?.includes("Monster")) {
    return null;
  }

  const atk =
    card.atk ?? "?";

  if (card.link_rating) {
    return `Link-${card.link_rating} · ATK ${atk}`;
  }

  const level =
    card.rank
      ? `Rank ${card.rank}`
      : card.level
        ? `Level ${card.level}`
        : null;

  return [
    level,
    `ATK ${atk}`,
    `DEF ${card.def ?? "?"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

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
          cardTypeLine(
            row.card
          ),
        stats:
          cardStatsLine(
            row.card
          ),
        description:
          row.card?.description?.trim() || null,
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
          href="/"
          className="flex min-h-10 w-fit items-center gap-1.5 text-sm font-bold text-zinc-400 transition hover:text-amber-200"
        >
          <ArrowLeft
            size={15}
          />
          Home
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
          more common. To let a forbidden card in, pick the rarity it
          should get. The majority wins; the league owner breaks ties.
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
