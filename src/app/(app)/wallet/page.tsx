import Link from "next/link";

import {
  Coins,
  Crown,
  Gift,
  Package,
  Repeat2,
  Sparkles,
  Swords,
  Trophy,
  Undo2,
} from "lucide-react";

import type {
  LucideIcon,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  formatLeagueRelativeDay,
  formatNumber,
} from "@/lib/format-date";

import {
  PageHeader,
} from "@/components/page-header";

import {
  EmptyState,
} from "@/components/empty-state";

export const dynamic =
  "force-dynamic";

// =========================================================
// DP WALLET / TRANSACTION HISTORY
//
// The current balance was already shown on the dashboard/profile,
// but there was nowhere to see WHERE it came from - this reads the
// existing duel_point_transactions ledger (the one and only source
// of truth for DP - every legitimate mutation goes through
// _credit_duel_points, which always writes a row here, see
// 202608270900's column comment on profiles.duel_points) and lists
// it, newest first. No new ledger, no computed/estimated numbers -
// every row and the running balance_after both come straight from
// what the database already recorded at the time of the credit/debit.
// =========================================================

type TransactionRow = {
  id: string;
  amount: number;
  balance_after: number;
  reason: string;
  description: string | null;
  note: string | null;
  created_at: string;
  seq: number;
};

// Icon + short category per ledger reason. The WHY of every row is
// its `description` (written by the database for every credit and
// debit, see 202610120100_dp_ledger_descriptions_and_helpers.sql);
// the label below is only the small category line under it.
const REASON_META: Record<
  string,
  { icon: LucideIcon; label: string }
> = {
  match_reward: { icon: Swords, label: "Competition duel" },
  round_participation: { icon: Sparkles, label: "Round reward" },
  round_winner_bonus: { icon: Sparkles, label: "Round reward" },
  round_runner_up_bonus: { icon: Sparkles, label: "Round reward" },
  round_third_bonus: { icon: Sparkles, label: "Round reward" },
  round_reward_reversal: { icon: Undo2, label: "Round correction" },
  competition_reward: { icon: Trophy, label: "Competition reward" },
  competition_reward_reversal: { icon: Undo2, label: "Competition correction" },
  boss_route_stage_evolve: { icon: Crown, label: "Boss Path" },
  boss_route_unlock_slot: { icon: Crown, label: "Boss Path" },
  shop_purchase: { icon: Package, label: "Shop" },
  trade: { icon: Repeat2, label: "Trade" },
  achievement: { icon: Gift, label: "Perk" },
  // Practice duel DP wagers move DP between players rather than
  // granting it from the league. A lost stake has no second row:
  // the negative stake row itself is the loss.
  practice_wager_stake: { icon: Coins, label: "Wager stake" },
  practice_wager_win: { icon: Coins, label: "Wager won" },
  practice_wager_refund: { icon: Coins, label: "Wager refunded" },
};

function reasonMeta(reason: string) {
  if (REASON_META[reason]) {
    return REASON_META[reason];
  }

  if (reason.startsWith("match_reward_correction")) {
    return { icon: Undo2, label: "Duel correction" };
  }

  if (reason.startsWith("competition_reward_correction")) {
    return { icon: Trophy, label: "Competition correction" };
  }

  return {
    icon: Gift,
    label: reason
      .replace(/_/g, " ")
      .replace(/^./, (first) => first.toUpperCase()),
  };
}


export default async function WalletPage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const [
    profileResult,
    transactionsResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("duel_points")
      .eq("id", userId)
      .single(),
    supabase
      .from("duel_point_transactions")
      .select("id,amount,balance_after,reason,description,note,created_at,seq")
      .eq("profile_id", userId)
      // Rows written in one transaction share created_at (e.g. a
      // correction: reversal + new credit); seq is the insert order,
      // so balance_after always reads as a running balance.
      .order("created_at", { ascending: false })
      .order("seq", { ascending: false })
      .limit(100),
  ]);

  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }

  if (transactionsResult.error) {
    throw new Error(transactionsResult.error.message);
  }

  const balance = (profileResult.data as { duel_points: number }).duel_points;
  const transactions = (transactionsResult.data ?? []) as TransactionRow[];

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="DP Wallet"
        icon={<Coins size={12} />}
        title="Duel Points"
        description="Every credit and debit to your balance, most recent first."
        action={
          <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] px-4 py-2.5 text-right">
            <p className="text-[9px] font-black uppercase tracking-[.18em] text-amber-300/70">
              Balance
            </p>
            <p className="gold-text text-2xl font-black leading-tight">
              {formatNumber(balance)}
            </p>
          </div>
        }
      />

      <div className="mt-5">
        {transactions.length === 0 ? (
          <EmptyState
            icon={<Coins size={22} />}
            title="No transactions yet"
            description="Play your season round duels to start earning DP."
            action={
              <Link
                href="/play"
                className="primary-button inline-flex items-center gap-2 text-sm"
              >
                Go to Play
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            {transactions.map((row) => {
              const meta = reasonMeta(row.reason);
              const Icon = meta.icon;
              const description =
                row.description?.trim() ||
                row.note?.trim() ||
                meta.label;
              const positive = row.amount > 0;

              return (
                <li
                  key={row.id}
                  className="flex items-start gap-3 px-3.5 py-3"
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                      positive
                        ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-300"
                        : "border-red-300/20 bg-red-300/10 text-red-300"
                    }`}
                  >
                    <Icon size={14} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold leading-5 text-zinc-200">
                      {description}
                    </p>
                    <p className="text-[10px] text-zinc-600">
                      {meta.label} · {formatLeagueRelativeDay(row.created_at)}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className={`font-mono text-sm font-black ${
                        positive ? "text-emerald-300" : "text-red-300"
                      }`}
                    >
                      {positive ? "+" : ""}
                      {formatNumber(row.amount)}
                    </p>
                    <p className="text-[10px] text-zinc-600">
                      {formatNumber(row.balance_after)} bal.
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {transactions.length === 100 && (
        <p className="mt-3 text-center text-[10px] font-bold text-zinc-600">
          Showing your 100 most recent transactions.
        </p>
      )}
    </main>
  );
}
