import {
  expect,
  type Page,
} from "@playwright/test";

// Drives the real Shop page: buy a pack with DP ("Open") or redeem a
// pack voucher ("Use Voucher"), then go through the opening reveal.

function packForm(page: Page, packCode: string, withVoucher: boolean) {
  const base = `form:has(input[name="pack_code"][value="${packCode}"])`;

  return page.locator(
    withVoucher
      ? `${base}:has(input[name="voucher_id"])`
      : `${base}:not(:has(input[name="voucher_id"]))`
  ).first();
}

async function submitAndReveal(page: Page, form: ReturnType<typeof packForm>) {
  await form.scrollIntoViewIfNeeded();
  await form.getByRole("button").click();
  await expect(page).toHaveURL(/\/shop\/opening\/[0-9a-f-]{36}/, { timeout: 60_000 });

  const openingId = page.url().match(/\/shop\/opening\/([0-9a-f-]{36})/)?.[1] ?? "";

  // The reveal animation: skip straight to the result.
  const revealAll = page.getByRole("button", { name: /Reveal all/i });

  if (await revealAll.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await revealAll.click();
  }

  return openingId;
}

export async function buyPackWithDp(page: Page, packCode: string) {
  await page.goto("/shop");

  return submitAndReveal(page, packForm(page, packCode, false));
}

export async function openPackWithVoucher(page: Page, packCode: string) {
  await page.goto("/shop");

  return submitAndReveal(page, packForm(page, packCode, true));
}
