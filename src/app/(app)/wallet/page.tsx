import Link from "next/link";

import {
  Coins,
  Gift,
  Package,
  Repeat2,
  Sparkles,
  Swords,
  Trophy,
} from "lucide-react";

import type {
  LucideIcon,
} from "lucide-react";

import {
  requireUser,
} from "@/lib/supabase/queries";

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

type TransactionReason =
  | "match_reward"
  | "round_participation"
  | "round_winner_bonus"
  | "competition_reward"
  | "shop_purchase"
  | "trade"
  | string;

type TransactionRow = {
  id: string;
  amount: number;
  balance_after: number;
  reason: TransactionReason;
  note: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const REASON_META: Record<
  string,
  { icon: LucideIcon; label: string }
> = {
  match_reward: { icon: Swords, label: "Duel result" },
  round_participation: { icon: Sparkles, label: "Round participation" },
  round_winner_bonus: { icon: Sparkles, label: "Round winner bonus" },
  competition_reward: { icon: Trophy, label: "Competition reward" },
  shop_purchase: { icon: Package, label: "Shop purchase" },
  trade: { icon: Repeat2, label: "Trade" },
};

function reasonMeta(reason: string) {
  if (REASON_META[reason]) {
    return REASON_META[reason];
  }

  if (reason.startsWith("match_reward_correction")) {
    return { icon: Swords, label: "Duel result correction" };
  }

  if (reason.startsWith("competition_reward_correction")) {
    return { icon: Trophy, label: "Competition reward correction" };
  }

  return { icon: Gift, label: reason.replace(/_/g, " ") };
}

function detailFor(row: TransactionRow) {
  const meta = row.metadata ?? {};

  if (row.reason === "match_reward" && typeof meta.result === "string") {
    return `Official Duel · ${meta.result}`;
  }

  if (
    (row.reason === "round_participation" ||
      row.reason === "round_winner_bonus") &&
    typeof meta.round_number === "number"
  ) {
    return `Round ${meta.round_number}`;
  }

  if (
    row.reason === "competition_reward" &&
    typeof meta.placement === "number"
  ) {
    const suffixes = ["th", "st", "nd", "rd"];
    const v = meta.placement % 100;
    const suffix = suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0];
    return `${meta.placement}${suffix} place`;
  }

  return row.note ?? null;
}

function formatRelativeDate(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return "Today";
  }

  if (diffDays === 1) {
    return "Yesterday";
  }

  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
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
      .select("id,amount,balance_after,reason,note,metadata,created_at")
      .eq("profile_id", userId)
      .order("created_at", { ascending: false })
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
              {balance.toLocaleString()}
            </p>
          </div>
        }
      />

      <div className="mt-5">
        {transactions.length === 0 ? (
          <EmptyState
            icon={<Coins size={22} />}
            title="No transactions yet"
            description="Play a League Duel or complete a round to start earning DP."
            action={
              <Link
                href="/matches/new"
                className="primary-button inline-flex items-center gap-2 text-sm"
              >
                Enter a result
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            {transactions.map((row) => {
              const meta = reasonMeta(row.reason);
              const Icon = meta.icon;
              const detail = detailFor(row);
              const positive = row.amount > 0;

              return (
                <li
                  key={row.id}
                  className="flex items-center gap-3 px-3.5 py-2.5"
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
                    <p className="truncate text-xs font-bold text-zinc-200">
                      {meta.label}
                      {detail && (
                        <span className="ml-1.5 font-normal text-zinc-500">
                          {detail}
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-zinc-600">
                      {formatRelativeDate(row.created_at)}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className={`font-mono text-sm font-black ${
                        positive ? "text-emerald-300" : "text-red-300"
                      }`}
                    >
                      {positive ? "+" : ""}
                      {row.amount.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-zinc-600">
                      {row.balance_after.toLocaleString()} bal.
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
