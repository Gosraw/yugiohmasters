import {
  expect,
  test,
} from "@playwright/test";

import {
  ACTIVE_RULES,
  draftTotal,
} from "./economy-rules";
import { login } from "./helpers/auth";
import {
  cardCountsBySource,
  closeDb,
  db,
  dpBalance,
  hasBossPath,
  isOnboarded,
  profileId,
  welcomeVoucherCounts,
} from "./helpers/db";
import { expectLedgerMatchesBalance } from "./helpers/ledger";
import { claimWelcomePacks } from "./helpers/seed";
import { openPackWithVoucher } from "./helpers/shop";
import { FRESH_USER } from "./helpers/users";

// Onboarding bot: a brand-new player (fardin, left untouched by
// global-setup) goes through the real phone UI:
//   Boss Path select -> Initial Draft (all 64 picks) -> welcome packs
//   -> Home
// and the database must show exactly what the rules promise.

const PACK_FOR_VOUCHER: Record<string, string> = {
  normal_pack: "normal",
  premium_pack: "premium",
  deluxe_pack: "deluxe",
};

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await closeDb();
});

// The onboarding gate in src/lib/supabase/proxy.ts (run by
// src/proxy.ts) sends a new player to Boss Path select first.
// (Was a fixme while proxy.ts sat in the repo root, where Next.js 16
// never ran it - fixed in deefb21.)
test("the onboarding gate sends a new player to Boss Path select, then the draft", async ({ page }) => {
  test.skip(await isOnboarded(FRESH_USER), `${FRESH_USER} is already onboarded`);

  await login(page, FRESH_USER);
  // Right after login (a Server Action redirect) and on any next page.
  await expect(page).toHaveURL(/\/boss\/select/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/boss\/select/);
});

test("a new player completes onboarding through the real UI", async ({ page }) => {
  test.setTimeout(15 * 60_000);

  test.skip(
    await isOnboarded(FRESH_USER),
    `${FRESH_USER} is already onboarded - run the suite with a DB reset (no E2E_SKIP_RESET)`
  );

  // Every draft pick / draft start asks "are you sure?" - say yes.
  page.on("dialog", (dialog) => dialog.accept());

  await login(page, FRESH_USER);

  // ---- 1. Boss Path select ----
  // (Opened directly with slot=1; the gate test above checks the
  // redirect itself.)
  if (!(await hasBossPath(FRESH_USER))) {
    await page.goto("/boss/select?slot=1");

    const chooseRoute = page.getByRole("button", { name: "Choose This Route" });

    await expect(chooseRoute.first()).toBeVisible();
    // Third route: bossg and samo were seeded with routes 1 and 2.
    await chooseRoute.nth(2).click();
    await expect(page).toHaveURL(/\/boss\/[0-9a-f-]{36}/, { timeout: 60_000 });
  }

  expect(await hasBossPath(FRESH_USER), "Boss Path chosen").toBe(true);

  // ---- 2. Initial Draft ----
  await page.goto("/draft");

  await page.getByRole("button", { name: "Start Initial Draft" }).click();
  await page.getByRole("button", { name: "Reveal Next 3 Cards" }).click();

  const total = draftTotal();

  const offerInput = page.locator('form:has(input[name="option_id"]) input[name="offer_id"]').first();
  let staleScreens = 0;

  for (let pick = 1; pick <= total; pick += 1) {
    const offerId = await offerInput.inputValue();

    await page.getByRole("button", { name: "Choose", exact: true }).first().click();

    if (pick === total) {
      break;
    }

    // A new offer (different offer id) on screen + footer progress
    // "N / 64" confirm the pick landed before the next tap.
    const moved = await expect(offerInput)
      .not.toHaveValue(offerId, { timeout: 15_000 })
      .then(() => true, () => false);

    if (!moved) {
      // Seen only while other people's code edits trigger a dev-server
      // Fast Refresh mid-action: the pick is saved but the screen
      // keeps the old cards. Do what a player would - reload - and
      // record it, so it can't hide a real problem.
      staleScreens += 1;
      test.info().annotations.push({
        type: "stale-draft-screen",
        description: `pick ${pick}: screen did not refresh after Choose; reloaded`,
      });
      // (A late action response can abort the first navigation.)
      await page.goto("/draft").catch(() => page.goto("/draft"));
      await expect(offerInput).not.toHaveValue(offerId, { timeout: 30_000 });
    }

    await expect(page.getByText(`${pick} / ${total}`, { exact: true })).toBeVisible();
  }

  expect(staleScreens, "draft screen went stale too often (see annotations)").toBeLessThanOrEqual(3);

  await expect(page.getByText(/INITIAL DRAFT COMPLETE|YOUR DRAFT IS COMPLETE|Your collection is ready/i).first()).toBeVisible({ timeout: 60_000 });

  // ---- 3. Home ----
  await page.goto("/");
  await expect(page).toHaveURL(/:\d+\/$/);

  // ---- DB: the draft is exactly 60 + 2 + 2, one card each ----
  const id = await profileId(FRESH_USER);
  const cards = await cardCountsBySource(FRESH_USER);

  expect(cards.draft, "draft cards").toBe(total);

  const [draft] = await db()`
    select main_picks_completed::int as main, fusion_picks_completed::int as fusion, xyz_picks_completed::int as xyz, status::text as status
    from public.draft_players where profile_id = ${id}
  `;

  expect(draft).toEqual({
    main: ACTIVE_RULES.initialDraft.mainPicks,
    fusion: ACTIVE_RULES.initialDraft.fusionPicks,
    xyz: ACTIVE_RULES.initialDraft.xyzPicks,
    status: "completed",
  });

  // The draft can't be started a second time.
  await page.goto("/draft");
  await expect(page.getByRole("button", { name: "Start Initial Draft" })).toHaveCount(0);

  // Onboarding itself costs and grants no DP (no draft / boss / welcome
  // ledger rows; 2.0 side rewards like a weekly goal may still fire).
  const [onboardingDp] = await db()`
    select count(*)::int as n from public.duel_point_transactions
    where profile_id = ${id} and reason ~* '(draft|boss|welcome|onboard)'
  `;

  expect(onboardingDp.n, "DP rows from onboarding").toBe(0);
  await expectLedgerMatchesBalance(FRESH_USER);
});

// claim_welcome_packs() is called by the proxy on the first request
// after onboarding.
test("the 3 welcome packs are granted automatically, exactly once", async ({ page }) => {
  await login(page, FRESH_USER);
  await page.goto("/");
  await page.goto("/shop");

  expect(await welcomeVoucherCounts(FRESH_USER)).toEqual(ACTIVE_RULES.welcomePack.vouchers);
});

test("the new player opens the three welcome packs in the Shop", async ({ page }) => {
  test.setTimeout(5 * 60_000);

  const id = await profileId(FRESH_USER);

  // The proxy already granted them; calling the same RPC twice more
  // as the player must not grant anything extra.
  claimWelcomePacks(FRESH_USER);
  claimWelcomePacks(FRESH_USER);

  const [welcome] = await db()`
    select count(*)::int as n from public.season1_welcome_bonus_claims where profile_id = ${id}
  `;

  expect(welcome.n, "welcome bonus claimed once").toBe(1);

  const vouchers = await welcomeVoucherCounts(FRESH_USER);

  test.skip(
    Object.keys(vouchers).length === 0,
    `${FRESH_USER} has no welcome vouchers left (already opened)`
  );

  expect(vouchers, "welcome vouchers (granted once even though claimed twice)").toEqual(ACTIVE_RULES.welcomePack.vouchers);

  const before = await cardCountsBySource(FRESH_USER);
  const dpBefore = await dpBalance(FRESH_USER);

  await login(page, FRESH_USER);

  const [packSizes] = await db()`
    select jsonb_object_agg(code, cards_per_pack) as sizes from public.shop_pack_types
  `;

  let expectedNewCards = 0;

  for (const [voucherType, quantity] of Object.entries(vouchers)) {
    const packCode = PACK_FOR_VOUCHER[voucherType];

    for (let i = 0; i < quantity; i += 1) {
      await openPackWithVoucher(page, packCode);
      expectedNewCards += Number(packSizes.sizes[packCode]);
    }
  }

  const after = await cardCountsBySource(FRESH_USER);

  expect((after.shop ?? 0) - (before.shop ?? 0), "cards from welcome packs").toBe(expectedNewCards);
  expect(await welcomeVoucherCounts(FRESH_USER), "all welcome vouchers used").toEqual({});

  // Vouchers are free: no DP spent.
  expect(await dpBalance(FRESH_USER)).toBeGreaterThanOrEqual(dpBefore);
  await expectLedgerMatchesBalance(FRESH_USER);

  await page.goto("/");
  await expect(page).toHaveURL(/:\d+\/$/);
});
