import {
  expect,
  test,
} from "@playwright/test";

import { ACTIVE_RULES } from "./economy-rules";
import { login } from "./helpers/auth";
import {
  closeDb,
  creditDp,
  db,
  dpBalance,
  profileId,
} from "./helpers/db";
import {
  expectLedgerDeltaMatchesBalanceDelta,
  ledgerSnapshot,
} from "./helpers/ledger";
import { ensureOnboarded } from "./helpers/seed";
import { buyPackWithDp } from "./helpers/shop";
import { USERNAMES } from "./helpers/users";

// Shop bot: buys one Normal pack with Duel Points through the real
// Shop page and opens it. The card count must go up by exactly the
// pack size and the DP balance down by exactly the price, once.

const BUYER = "samo";
const PACK = ACTIVE_RULES.shop.normalPack;

test.describe.configure({ mode: "serial" });

let before: Awaited<ReturnType<typeof ledgerSnapshot>>;
let purchasesBefore = 0;
let boughtAfter: Date;

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await ensureOnboarded(USERNAMES);
});

test.afterAll(async () => {
  await closeDb();
});

async function purchaseCount(): Promise<number> {
  const id = await profileId(BUYER);
  const [row] = await db()`
    select count(*)::int as n
    from public.shop_purchases sp
    join public.shop_pack_types t on t.id = sp.pack_type_id
    where sp.profile_id = ${id} and t.code = ${PACK.code} and sp.used_voucher_id is null
  `;

  return row.n as number;
}

test("the Normal pack costs and contains what the rules say", async () => {
  const [pack] = await db()`
    select price_dp::int as price, cards_per_pack::int as cards, active
    from public.shop_pack_types where code = ${PACK.code}
  `;

  expect(pack).toEqual({
    price: PACK.priceDp,
    cards: PACK.cards,
    active: true,
  });
});

test("buying a Normal pack with DP: +pack size cards, -price DP, exactly once", async ({ page }) => {
  // Test setup: make sure the bot can afford it (granted through
  // _credit_duel_points, so the ledger stays consistent).
  const balance = await dpBalance(BUYER);

  if (balance < PACK.priceDp) {
    await creditDp(BUYER, PACK.priceDp - balance, "e2e shop bot pocket money");
  }

  before = await ledgerSnapshot(BUYER);
  purchasesBefore = await purchaseCount();
  boughtAfter = (await db()`select clock_timestamp() as t`)[0].t as Date;

  await login(page, BUYER);
  const openingId = await buyPackWithDp(page, PACK.code);

  // The opening shows the pulled cards.
  const [opening] = await db()`
    select count(*)::int as pulls
    from public.shop_pack_pulls where opening_id = ${openingId}
  `;

  expect(opening.pulls, "cards in this opening").toBe(PACK.cards);

  // Refreshing the opening page must not buy again.
  await page.reload();
  await page.goto("/shop");

  const after = await ledgerSnapshot(BUYER);

  expect(after.cards - before.cards, "new cards").toBe(PACK.cards);
  const id = await profileId(BUYER);
  const [spent] = await db()`
    select coalesce(sum(sp.dp_spent), 0)::int as dp
    from public.shop_purchases sp
    where sp.profile_id = ${id} and sp.created_at >= ${boughtAfter}
  `;

  expect(spent.dp, "DP spent in the shop").toBe(PACK.priceDp);
  expect(await purchaseCount(), "one purchase recorded").toBe(purchasesBefore + 1);
});

// Was a live bug: purchase_shop_pack / purchase_shop_rotation_card
// take DP straight off profiles.duel_points without a
// duel_point_transactions row, so the Wallet never showed shop
// spending. Fixed on v2 by
// 202610120140_shop_singles_boss_route_exclusion.sql (AFTER INSERT
// trigger on shop_purchases); this bot keeps it fixed.
test("the DP ledger records the pack purchase exactly once", async () => {
  const after = await ledgerSnapshot(BUYER);

  expectLedgerDeltaMatchesBalanceDelta(BUYER, before, after);

  const id = await profileId(BUYER);
  const rows = await db()`
    select amount from public.duel_point_transactions
    where profile_id = ${id} and reason = 'shop_purchase' and amount = ${-PACK.priceDp}
      and created_at >= ${boughtAfter}
  `;

  expect(rows).toHaveLength(1);
});
