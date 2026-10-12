import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  expect,
  type Browser,
  type Page,
} from "@playwright/test";

import { passwordFor } from "./users";

// Logs in through the real login form (username + password), exactly
// like a player would on their phone.
export async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByPlaceholder("duelist_name").fill(username);
  await page.locator('input[name="password"]').fill(passwordFor(username));
  await page.getByRole("button", { name: "Enter the arena" }).click();
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 60_000 });
}

// Logs in once through the real form and saves the session cookies,
// so many short tests can reuse it via test.use({ storageState }).
export function storageStatePath(username: string) {
  return path.resolve(__dirname, `../../../.devstack/e2e-auth/${username}.json`);
}

export async function saveLogin(browser: Browser, baseURL: string, username: string) {
  // Explicit empty state: inside a test, Playwright would otherwise
  // apply the describe's (not yet existing) storageState file here.
  const context = await browser.newContext({
    baseURL,
    storageState: {
      cookies: [],
      origins: [],
    },
  });
  const page = await context.newPage();

  await login(page, username);
  await mkdir(path.dirname(storageStatePath(username)), { recursive: true });
  await context.storageState({ path: storageStatePath(username) });
  await context.close();
}
