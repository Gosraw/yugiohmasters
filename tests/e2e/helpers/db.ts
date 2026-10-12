import postgres from "postgres";

// Direct access to the LOCAL devstack database for test setup and
// assertions. Hard-wired to 127.0.0.1 - there is deliberately no way
// to point this at another host.

export const DB_URL = "postgres://postgres@127.0.0.1:54322/postgres";

let client: postgres.Sql | null = null;

export function db(): postgres.Sql {
  if (!client) {
    // Every count/sum below is cast to ::int so it arrives as a JS
    // number rather than a bigint string.
    client = postgres(DB_URL, {
      max: 2,
      onnotice: () => {},
    });
  }

  return client;
}

export async function closeDb() {
  if (client) {
    await client.end();
    client = null;
  }
}

export async function profileId(username: string): Promise<string> {
  const [row] = await db()`select id from public.profiles where username = ${username}`;

  if (!row) {
    throw new Error(`No profile for ${username}`);
  }

  return row.id as string;
}

export async function leagueIdOf(username: string): Promise<string> {
  const [row] = await db()`
    select lm.league_id
    from public.league_members lm
    join public.profiles p on p.id = lm.profile_id
    where p.username = ${username}
  `;

  if (!row) {
    throw new Error(`${username} is not a league member`);
  }

  return row.league_id as string;
}

// profiles.duel_points is the one real DP balance (wallets.duel_points
// is a leftover from phase 1 and is never written by the economy).
export async function dpBalance(username: string): Promise<number> {
  const [row] = await db()`select duel_points from public.profiles where username = ${username}`;

  return Number(row.duel_points);
}

export async function cardCount(username: string): Promise<number> {
  const [row] = await db()`
    select count(*)::int as n
    from public.card_instances ci
    join public.profiles p on p.id = ci.current_owner_id
    where p.username = ${username}
  `;

  return row.n as number;
}

export async function cardCountsBySource(username: string): Promise<Record<string, number>> {
  const rows = await db()`
    select ci.original_acquisition_type::text as source, count(*)::int as n
    from public.card_instances ci
    join public.profiles p on p.id = ci.current_owner_id
    where p.username = ${username}
    group by 1
  `;

  return Object.fromEntries(rows.map((r) => [r.source as string, r.n as number]));
}

// Unredeemed vouchers by type (a redeemed voucher row is deleted or
// its quantity decremented by purchase_shop_pack).
export async function voucherCounts(username: string): Promise<Record<string, number>> {
  const rows = await db()`
    select v.voucher_type, sum(v.quantity)::int as n
    from public.reward_vouchers v
    join public.profiles p on p.id = v.profile_id
    where p.username = ${username}
    group by 1
  `;

  return Object.fromEntries(rows.map((r) => [r.voucher_type as string, r.n as number]));
}

export async function draftStatus(username: string): Promise<string | null> {
  const [row] = await db()`
    select dp.status
    from public.draft_players dp
    join public.profiles p on p.id = dp.profile_id
    where p.username = ${username}
    order by dp.status
    limit 1
  `;

  return (row?.status as string | undefined) ?? null;
}

export async function hasBossPath(username: string): Promise<boolean> {
  const [row] = await db()`
    select 1
    from public.player_boss_paths bp
    join public.profiles p on p.id = bp.profile_id
    where p.username = ${username} and bp.route_slot = 1
  `;

  return Boolean(row);
}

export async function isOnboarded(username: string): Promise<boolean> {
  return (await hasBossPath(username)) && (await draftStatus(username)) === "completed";
}

// Grants DP the only legitimate way (_credit_duel_points writes the
// ledger row too). Test setup only - e.g. so a bot can afford a pack.
export async function creditDp(username: string, amount: number, note: string) {
  const id = await profileId(username);

  await db()`select public._credit_duel_points(${id}::uuid, ${amount}::int, 'e2e_test_grant', null, ${note}, '{"source":"e2e-test-bot"}'::jsonb)`;
}

// Unredeemed Season-1 welcome vouchers only (other systems, e.g. the
// 2.0 Season Path, hand out pack vouchers too).
export async function welcomeVoucherCounts(username: string): Promise<Record<string, number>> {
  const rows = await db()`
    select v.voucher_type, sum(v.quantity)::int as n
    from public.reward_vouchers v
    join public.profiles p on p.id = v.profile_id
    where p.username = ${username} and v.source_type = 'season1_welcome_bonus'
    group by 1
  `;

  return Object.fromEntries(rows.map((r) => [r.voucher_type as string, r.n as number]));
}
