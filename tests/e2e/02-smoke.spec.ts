import {
  expect,
  test,
} from "@playwright/test";

import {
  login,
  saveLogin,
  storageStatePath,
} from "./helpers/auth";
import { closeDb } from "./helpers/db";
import {
  collectConsoleErrors,
  expectNoErrorBoundary,
  expectNoHorizontalOverflow,
} from "./helpers/page-checks";
import { USERNAMES } from "./helpers/users";
import { ensureOnboarded } from "./helpers/seed";

// Smoke bot: every player logs in and opens every main screen. A
// screen fails if it shows an error, logs a console error, or (on the
// phone) is wider than the screen.

const ROUTES = [
  "/",
  "/play",
  "/cards/collection",
  "/decks",
  "/trades",
  "/shop",
  "/profile",
  "/boss",
  "/wallet",
  "/competitions",
  "/matches",
  "/league",
  "/achievements",
  "/records",
  "/rivalries",
  "/perks",
  "/duel-companion",
];

test.beforeAll(async () => {
  test.setTimeout(300_000);

  // Normally onboarding.spec already walked fardin through the UI;
  // when this spec runs on its own, onboard whoever isn't yet.
  await ensureOnboarded(USERNAMES);
  await closeDb();
});

for (const username of USERNAMES) {
  test.describe(`${username} logs in`, () => {
    test.use({
      storageState: {
        cookies: [],
        origins: [],
      },
    });

    test(`${username} logs in through the form and lands on Home`, async ({ page }) => {
      await login(page, username);
      await expect(page).toHaveURL(/:\d+\/$/);
    });
  });

  test.describe(`${username} visits every screen`, () => {
    test.use({
      storageState: storageStatePath(username),
    });

    test.beforeAll(async ({ browser }, testInfo) => {
      await saveLogin(browser, String(testInfo.project.use.baseURL), username);
    });

    for (const route of ROUTES) {
      test(`${username} ${route}`, async ({ page }, testInfo) => {
        const consoleErrors = collectConsoleErrors(page);
        const response = await page.goto(route);

        expect(response?.status(), `${route} HTTP status`).toBeLessThan(400);
        await page.waitForLoadState("networkidle").catch(() => {});

        // Not bounced to login / onboarding.
        expect(new URL(page.url()).pathname, `${route} redirected`).toBe(route);

        await expectNoErrorBoundary(page, route);

        if (testInfo.project.name === "mobile") {
          await expectNoHorizontalOverflow(page, route);
        }

        expect(consoleErrors.errors, `${route} console errors`).toEqual([]);
      });
    }
  });
}
