"use server";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  voucherLabel,
} from "@/lib/match-settlement-summary";

// =========================================================
// RECENT REWARDS (2.0 reward pop-up)
//
// docs/V2_PLAN.md, Rewards: "Reward pop-up at the moment it
// happens". The pop-up (src/components/reward-popup.tsx) asks this
// action, on every page change, for the DP credits and pack vouchers
// the player received after the last one they already saw. It only
// READS the ledger the reward RPCs wrote (duel_point_transactions +
// reward_vouchers, both RLS-limited to the player's own rows) - it
// never computes or grants anything itself.
//
// Rows written in the same database transaction share one
// created_at (e.g. the last duel of a round: match DP + round
// participation + placement + vouchers), so they are grouped into a
// single "moment" and shown as one pop-up.
// =========================================================

// Credits that are not really a reward (money moving between
// players, or your own stake coming back).
const NOT_A_REWARD = new Set([
  "trade",
  "practice_wager_refund",
]);

const LOOKBACK_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;

const FIRST_VISIT_WINDOW_MS = 15 * 60 * 1000;

const GROUP_WINDOW_MS = 3000;

export type RewardMoment = {
  key: string;
  at: string;
  ids: string[];
  dp: number;
  packs: {
    label: string;
    quantity: number;
  }[];
  lines: string[];
};

export type RecentRewards = {
  now: string;
  latestAt: string | null;
  moments: RewardMoment[];
};

type LedgerRow = {
  id: string;
  amount: number;
  reason: string;
  description: string | null;
  created_at: string;
};

type VoucherRow = {
  id: string;
  voucher_type: string;
  quantity: number;
  note: string | null;
  source_type: string | null;
  created_at: string;
};

type RewardItem = {
  id: string;
  at: string;
  time: number;
  dp: number;
  pack: {
    label: string;
    quantity: number;
  } | null;
  line: string | null;
};

function voucherLine(
  row: VoucherRow
) {
  if (row.note && row.note.trim()) {
    return row.note.trim();
  }

  if (row.source_type === "competition_reward") {
    return "Competition reward";
  }

  if (row.source_type === "round_reward") {
    return "Round reward";
  }

  return null;
}

export async function getRecentRewards(
  since: string | null
): Promise<RecentRewards> {
  const {
    supabase,
    userId,
  } = await requireUser();

  const nowMs = Date.now();

  const floorIso = new Date(
    nowMs -
      (since
        ? LOOKBACK_LIMIT_MS
        : FIRST_VISIT_WINDOW_MS)
  ).toISOString();

  // A stored marker older than the look-back window (or garbage) is
  // clamped, so a player back from holiday never gets a wall of
  // pop-ups.
  const sinceIso =
    since &&
    !Number.isNaN(
      Date.parse(since)
    ) &&
    Date.parse(since) >
      Date.parse(floorIso)
      ? since
      : floorIso;

  const [
    ledgerResult,
    voucherResult,
  ] = await Promise.all([
    supabase
      .from("duel_point_transactions")
      .select("id,amount,reason,description,created_at")
      .eq("profile_id", userId)
      .gt("amount", 0)
      .gt("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(40),
    supabase
      .from("reward_vouchers")
      .select("id,voucher_type,quantity,note,source_type,created_at")
      .eq("profile_id", userId)
      .gt("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(20),
  ]);

  if (ledgerResult.error) {
    throw new Error(
      ledgerResult.error.message
    );
  }

  if (voucherResult.error) {
    throw new Error(
      voucherResult.error.message
    );
  }

  const ledger =
    (ledgerResult.data ?? []) as LedgerRow[];

  const vouchers =
    (voucherResult.data ?? []) as VoucherRow[];

  const items: RewardItem[] = [];

  let latestAt: string | null = null;

  for (const row of ledger) {
    if (!latestAt || Date.parse(row.created_at) > Date.parse(latestAt)) {
      latestAt = row.created_at;
    }

    if (NOT_A_REWARD.has(row.reason)) {
      continue;
    }

    items.push({
      id: row.id,
      at: row.created_at,
      time: Date.parse(row.created_at),
      dp: row.amount,
      pack: null,
      line: row.description,
    });
  }

  for (const row of vouchers) {
    if (!latestAt || Date.parse(row.created_at) > Date.parse(latestAt)) {
      latestAt = row.created_at;
    }

    items.push({
      id: row.id,
      at: row.created_at,
      time: Date.parse(row.created_at),
      dp: 0,
      pack: {
        label: voucherLabel(row.voucher_type),
        quantity: row.quantity,
      },
      line: voucherLine(row),
    });
  }

  items.sort(
    (a, b) => a.time - b.time
  );

  const moments: RewardMoment[] = [];

  let groupStart = Number.NEGATIVE_INFINITY;

  for (const item of items) {
    let moment =
      moments[moments.length - 1];

    if (
      !moment ||
      item.time - groupStart > GROUP_WINDOW_MS
    ) {
      groupStart = item.time;

      moment = {
        key: item.id,
        at: item.at,
        ids: [],
        dp: 0,
        packs: [],
        lines: [],
      };

      moments.push(moment);
    }

    moment.ids.push(item.id);
    moment.at = item.at;
    moment.dp += item.dp;

    if (item.pack) {
      const existing = moment.packs.find(
        (pack) => pack.label === item.pack?.label
      );

      if (existing) {
        existing.quantity += item.pack.quantity;
      } else {
        moment.packs.push({
          ...item.pack,
        });
      }
    }

    if (item.line && !moment.lines.includes(item.line)) {
      moment.lines.push(item.line);
    }
  }

  return {
    now: new Date(nowMs).toISOString(),
    latestAt,
    moments,
  };
}
