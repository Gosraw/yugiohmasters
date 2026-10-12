import { expect } from "@playwright/test";

import { ACTIVE_RULES } from "../economy-rules";

import {
  cardCount,
  db,
  dpBalance,
  profileId,
  voucherCounts,
} from "./db";

// DP ledger assertions. The rule (CLAUDE.md): DP only ever changes
// through the duel_point_transactions ledger, so for every player
//   sum(duel_point_transactions.amount) == profiles.duel_points
// and every grant (reason + match / competition round) appears
// exactly once.

export type LedgerSnapshot = {
  balance: number;
  // DP from side systems (ACTIVE_RULES.extraRewardReasons) and the
  // balance without them - use coreBalance for exact economy checks.
  extraDp: number;
  coreBalance: number;
  txSum: number;
  txCount: number;
  cards: number;
  vouchers: Record<string, number>;
};

export async function ledgerSnapshot(username: string): Promise<LedgerSnapshot> {
  const id = await profileId(username);
  const [tx] = await db()`
    select coalesce(sum(amount), 0)::int as total,
           count(*)::int as n,
           coalesce(sum(amount) filter (where reason = any(${ACTIVE_RULES.extraRewardReasons})), 0)::int as extra
    from public.duel_point_transactions
    where profile_id = ${id}
  `;
  const balance = await dpBalance(username);

  return {
    balance,
    extraDp: tx.extra as number,
    coreBalance: balance - (tx.extra as number),
    txSum: tx.total as number,
    txCount: tx.n as number,
    cards: await cardCount(username),
    vouchers: await voucherCounts(username),
  };
}

export async function snapshotAll(usernames: readonly string[]) {
  const entries = await Promise.all(
    usernames.map(async (u) => [u, await ledgerSnapshot(u)] as const)
  );

  return Object.fromEntries(entries) as Record<string, LedgerSnapshot>;
}

// Strict invariant over the player's whole history.
export async function expectLedgerMatchesBalance(username: string) {
  const snap = await ledgerSnapshot(username);

  expect(
    snap.txSum,
    `${username}: sum of duel_point_transactions (${snap.txSum}) must equal profiles.duel_points (${snap.balance})`
  ).toBe(snap.balance);
}

// Invariant over a time window: whatever happened between two
// snapshots, the balance moved by exactly what the ledger recorded.
export function expectLedgerDeltaMatchesBalanceDelta(
  username: string,
  before: LedgerSnapshot,
  after: LedgerSnapshot
) {
  expect(
    after.txSum - before.txSum,
    `${username}: ledger delta must equal balance delta`
  ).toBe(after.balance - before.balance);
}

// No grant may be recorded twice: match rewards are unique per
// (reason, match), round rewards per (reason, competition, round).
export async function expectNoDuplicateGrants(username: string) {
  const id = await profileId(username);

  const matchDupes = await db()`
    select reason, match_id, count(*)::int as n
    from public.duel_point_transactions
    where profile_id = ${id} and match_id is not null
    group by reason, match_id
    having count(*) > 1
  `;

  const roundDupes = await db()`
    select reason,
           metadata->>'competition_id' as competition_id,
           metadata->>'logical_round_number' as round,
           count(*)::int as n
    from public.duel_point_transactions
    where profile_id = ${id}
      and metadata ? 'competition_id'
      and metadata ? 'logical_round_number'
    group by 1, 2, 3
    having count(*) > 1
  `;

  expect(matchDupes, `${username}: duplicate match grants`).toEqual([]);
  expect(roundDupes, `${username}: duplicate round grants`).toEqual([]);
}

export type ExpectedGrant = {
  reason: string;
  amount: number;
  matchId?: string;
  competitionId?: string;
  round?: number;
};

// Every expected grant must exist exactly once, with the exact amount.
export async function expectGrantsExactlyOnce(username: string, grants: ExpectedGrant[]) {
  const id = await profileId(username);

  for (const grant of grants) {
    const rows = await db()`
      select amount
      from public.duel_point_transactions
      where profile_id = ${id}
        and reason = ${grant.reason}
        and (${grant.matchId ?? null}::uuid is null or match_id = ${grant.matchId ?? null}::uuid)
        and (${grant.competitionId ?? null}::text is null
             or metadata->>'competition_id' = ${grant.competitionId ?? null}::text
             or match_id in (select m.id from public.matches m where m.competition_id::text = ${grant.competitionId ?? null}::text))
        and (${grant.round ?? null}::int is null or (metadata->>'logical_round_number')::int = ${grant.round ?? null}::int)
    `;

    const label = `${username}: ${grant.reason}${grant.matchId ? ` match ${grant.matchId.slice(0, 8)}` : ""}${grant.round ? ` round ${grant.round}` : ""}`;

    expect(rows.length, `${label} must be granted exactly once`).toBe(1);
    expect(Number(rows[0].amount), `${label} amount`).toBe(grant.amount);
  }
}

// DP a player got from ONE competition (its match rewards, round
// rewards, corrections and reversals), side systems excluded. Exact
// even while other people use the same test database.
export async function competitionDp(username: string, competitionId: string): Promise<number> {
  const id = await profileId(username);
  const [row] = await db()`
    select coalesce(sum(t.amount), 0)::int as total
    from public.duel_point_transactions t
    where t.profile_id = ${id}
      and not (t.reason = any(${ACTIVE_RULES.extraRewardReasons}))
      and (
        t.metadata->>'competition_id' = ${competitionId}
        or t.match_id in (select m.id from public.matches m where m.competition_id = ${competitionId})
      )
  `;

  return row.total as number;
}
