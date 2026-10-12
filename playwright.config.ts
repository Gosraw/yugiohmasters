import {
  defineConfig,
  devices,
} from "@playwright/test";

// Test bots for the LOCAL devstack only (see tests/e2e/README.md).
// The app must run via scripts/devstack/dev.mjs, which points it at
// the local gateway on 127.0.0.1:54321 - never at production.

const BASE_URL =
  process.env.E2E_BASE_URL ??
  "http://localhost:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",

  // The bots share one database and one 3-player league, so specs
  // run one after another, in file-name order.
  fullyParallel: false,
  workers: 1,
  retries: 0,

  // next dev compiles each route on first visit - be patient.
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },

  outputDir: ".devstack/e2e-results",
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: ".devstack/e2e-report",
        open: "never",
      },
    ],
  ],

  use: {
    baseURL: BASE_URL,
    // Disk on the dev Mac is tight: no traces/videos, a screenshot
    // only when a test fails.
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
    navigationTimeout: 60_000,
    actionTimeout: 30_000,
  },

  projects: [
    {
      name: "mobile",
      use: {
        // iPhone 13 viewport / touch / user agent, but on Chromium
        // (the only browser installed for the bots).
        ...devices["iPhone 13"],
        browserName: "chromium",
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
      },
      // Onboarding can only happen once per player; it runs on the
      // phone viewport only.
      testIgnore: /onboarding\.spec\.ts/,
    },
  ],

  webServer: {
    command: "node scripts/devstack/dev.mjs 3100",
    url: `${BASE_URL}/login`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
