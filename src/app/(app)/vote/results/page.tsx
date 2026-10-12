import Link from "next/link";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Crown,
  Scale,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  getLeagueIdForUser,
} from "@/lib/league-stats";

import {
  setVoteTiebreak,
} from "@/app/actions/vote";

import {
  EmptyState,
} from "@/components/empty-state";

import {
  SubmitButton,
} from "@/components/submit-button";

import {
  type VoteValue,
  verdictBadgeClass,
  verdictLabel,
  voteOptions,
  voteShortLabel,
} from "@/components/vote-labels";

import {
  loadVoteItems,
  loadVoteResults,
  type VoteResultRow,
} from "../_lib/load";

// =========================================================
// CARD VOTE RESULTS
//
// Counts and outcome per card, from get_vote_results() (see
// supabase/migrations/202610120500_card_votes.sql): majority
// wins; on a tie the league admin's tie-break counts, else the
// admin's own vote, else it stays "tied". The admin gets
// tie-break buttons on every tied card.
// =========================================================

export const dynamic =
  "force-dynamic";

const DECIDED_LABEL: Record<VoteResultRow["decided_by"], string> = {
  no_votes: "No votes yet",
  majority: "Majority",
  owner_tiebreak: "Owner tie-break",
  owner_vote: "Tie: owner's vote",
  tied: "Tied: owner decides",
};

type ResultWithCard = VoteResultRow & {
  cardName: string;
};

export default async function VoteResultsPage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const leagueId =
    await getLeagueIdForUser(
      supabase,
      userId
    );

  if (!leagueId) {
    return (
      <Shell>
        <EmptyState
          icon={
            <BarChart3
              size={24}
            />
          }
          title="No league yet"
        />
      </Shell>
    );
  }

  const [results, items, membership] =
    await Promise.all([
      loadVoteResults(
        supabase,
        leagueId
      ),
      loadVoteItems(
        supabase,
        leagueId
      ),
      supabase
        .from("league_members")
        .select("role")
        .eq("league_id", leagueId)
        .eq("profile_id", userId)
        .maybeSingle(),
    ]);

  const isAdmin =
    membership.data?.role === "admin";

  const names =
    new Map(
      items.map(
        (item) => [
          item.id,
          item.card?.name ?? "Unknown card",
        ]
      )
    );

  const rows: ResultWithCard[] =
    results.map(
      (row) => ({
        ...row,
        cardName:
          names.get(row.item_id) ?? "Unknown card",
      })
    );

  if (rows.length === 0) {
    return (
      <Shell>
        <EmptyState
          icon={
            <BarChart3
              size={24}
            />
          }
          title="No vote open right now"
        />
      </Shell>
    );
  }

  const decided =
    rows.filter(
      (row) => row.outcome
    );

  const changes =
    decided.filter(
      (row) => row.outcome !== "agree"
    );

  const ties =
    rows.filter(
      (row) => row.decided_by === "tied"
    );

  const memberCount =
    rows[0]?.member_count ?? 0;

  const everyoneVoted =
    rows.filter(
      (row) => row.total_votes >= memberCount
    ).length;

  const lists: {
    key: string;
    title: string;
    rows: ResultWithCard[];
  }[] = [];

  for (const row of rows) {
    const last =
      lists[lists.length - 1];

    if (last && last.key === row.list_key) {
      last.rows.push(row);
    } else {
      lists.push({
        key: row.list_key,
        title: row.list_title,
        rows: [row],
      });
    }
  }

  return (
    <Shell>
      {/* SUMMARY */}

      <section className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat
          label="Cards"
          value={rows.length}
        />

        <Stat
          label="Everyone voted"
          value={everyoneVoted}
        />

        <Stat
          label="Changes"
          value={changes.length}
        />

        <Stat
          label="Ties"
          value={ties.length}
        />
      </section>

      {/* TIES FOR THE OWNER */}

      {ties.length > 0 && (
        <section className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-300/[0.04] p-4">
          <div className="flex items-center gap-2">
            <Scale
              size={16}
              className="text-amber-300"
            />

            <h2 className="text-xs font-black uppercase tracking-[.18em] text-amber-300">
              Ties: the owner decides
            </h2>
          </div>

          <ul className="mt-3 grid gap-2">
            {ties.map(
              (row) => (
                <ResultRow
                  key={
                    row.item_id
                  }
                  row={row}
                  isAdmin={isAdmin}
                />
              )
            )}
          </ul>
        </section>
      )}

      {/* CHANGES */}

      {changes.length > 0 && (
        <section className="panel mt-5 p-4">
          <h2 className="text-xs font-black uppercase tracking-[.18em] text-amber-300">
            What the vote changes
          </h2>

          <ul className="mt-3 grid gap-2">
            {changes.map(
              (row) => (
                <ResultRow
                  key={
                    row.item_id
                  }
                  row={row}
                  isAdmin={isAdmin}
                />
              )
            )}
          </ul>
        </section>
      )}

      {/* EVERY LIST */}

      <section className="mt-5 grid gap-2.5">
        {lists.map(
          (list) => (
            <details
              key={
                list.key
              }
              className="panel group p-4"
            >
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3">
                <span className="font-display text-base font-bold text-amber-50">
                  {
                    list.title
                  }
                </span>

                <span className="shrink-0 text-xs text-zinc-500">
                  {list.rows.filter((row) => row.outcome).length} / {list.rows.length} decided
                </span>
              </summary>

              <ul className="mt-3 grid gap-2">
                {list.rows.map(
                  (row) => (
                    <ResultRow
                      key={
                        row.item_id
                      }
                      row={row}
                      isAdmin={isAdmin}
                    />
                  )
                )}
              </ul>
            </details>
          )
        )}
      </section>
    </Shell>
  );
}

function Shell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-amber-400/[0.06] blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <Link
          href="/vote"
          className="flex min-h-10 w-fit items-center gap-1.5 text-sm font-bold text-zinc-400 transition hover:text-amber-200"
        >
          <ArrowLeft
            size={15}
          />
          Back to voting
        </Link>

        <h1 className="gold-text mt-3 text-3xl font-black sm:text-4xl">
          Vote results
        </h1>

        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          The most votes wins. On a tie the league owner decides.
        </p>

        {children}
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="panel p-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
        {label}
      </p>

      <p className="mt-1 text-2xl font-black text-zinc-100">
        {value}
      </p>
    </div>
  );
}

function ResultRow({
  row,
  isAdmin,
}: {
  row: ResultWithCard;
  isAdmin: boolean;
}) {
  const showTiebreak =
    isAdmin &&
    (row.decided_by === "tied" ||
      row.decided_by === "owner_vote" ||
      row.decided_by === "owner_tiebreak");

  const counts: [VoteValue, number][] = [
    ["agree", row.agree_count],
    ["too_strong", row.too_strong_count],
    ["too_weak", row.too_weak_count],
  ];

  return (
    <li
      className="rounded-xl border border-white/5 bg-black/20 p-3"
      data-testid="vote-result-row"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-black text-zinc-100">
          {
            row.cardName
          }
        </p>

        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
          {
            DECIDED_LABEL[row.decided_by]
          }
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span
          className={`rounded-full border px-2 py-0.5 font-bold ${verdictBadgeClass(row.proposed_verdict)}`}
        >
          {verdictLabel(
            row.proposed_verdict
          )}
        </span>

        {row.resolved_verdict &&
          row.resolved_verdict !== row.proposed_verdict && (
            <>
              <ArrowRight
                size={13}
                className="text-zinc-500"
              />

              <span
                className={`rounded-full border px-2 py-0.5 font-bold ${verdictBadgeClass(row.resolved_verdict)}`}
              >
                {verdictLabel(
                  row.resolved_verdict
                )}
              </span>
            </>
          )}
      </div>

      <p
        className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400"
        data-testid="vote-result-counts"
      >
        {counts.map(
          ([vote, count]) => (
            <span
              key={
                vote
              }
              className={
                row.outcome === vote
                  ? "font-bold text-amber-100"
                  : undefined
              }
            >
              {voteShortLabel(
                vote
              )}: {count}
            </span>
          )
        )}

        <span className="text-zinc-600">
          ({row.total_votes}/{row.member_count} voted
          {row.my_vote
            ? `, you: ${voteShortLabel(row.my_vote)}`
            : ""}
          )
        </span>
      </p>

      {showTiebreak && (
        <div className="mt-3 border-t border-white/5 pt-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300/80">
            <Crown
              size={12}
            />
            Owner tie-break
            {row.tiebreak_vote
              ? `: ${voteShortLabel(row.tiebreak_vote)}`
              : ""}
          </p>

          <div className="mt-2 flex flex-wrap gap-2">
            {voteOptions(
              row.proposed_verdict
            ).map(
              (vote) => (
                <form
                  key={
                    vote
                  }
                  action={
                    setVoteTiebreak
                  }
                >
                  <input
                    type="hidden"
                    name="item_id"
                    value={
                      row.item_id
                    }
                  />

                  <input
                    type="hidden"
                    name="vote"
                    value={vote}
                  />

                  <SubmitButton
                    pendingLabel="Saving..."
                    className={`min-h-10 rounded-xl border px-3 text-xs font-bold transition ${
                      row.tiebreak_vote === vote
                        ? "border-amber-300/70 bg-amber-300/15 text-amber-100"
                        : "border-white/10 text-zinc-300 hover:border-amber-300/40"
                    }`}
                  >
                    {voteShortLabel(
                      vote
                    )}
                  </SubmitButton>
                </form>
              )
            )}

            {row.tiebreak_vote && (
              <form
                action={
                  setVoteTiebreak
                }
              >
                <input
                  type="hidden"
                  name="item_id"
                  value={
                    row.item_id
                  }
                />

                <input
                  type="hidden"
                  name="vote"
                  value="clear"
                />

                <SubmitButton
                  pendingLabel="Clearing..."
                  className="min-h-10 rounded-xl border border-white/10 px-3 text-xs font-bold text-zinc-500 transition hover:text-zinc-300"
                >
                  Clear
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
