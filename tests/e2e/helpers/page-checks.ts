import {
  expect,
  type Page,
} from "@playwright/test";

// Console errors that come from the dev tooling itself, not the app.
const DEV_NOISE = [
  /Download the React DevTools/i,
  /\[HMR\]/i,
  /\[Fast Refresh\]/i,
  /webpack-hmr|turbopack-hmr|_next\/webpack-hmr/i,
];

export type ConsoleCollector = {
  errors: string[];
  reset: () => void;
};

// Collects console.error output and uncaught page exceptions.
export function collectConsoleErrors(page: Page): ConsoleCollector {
  const errors: string[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    const text = message.text();

    if (DEV_NOISE.some((pattern) => pattern.test(text))) {
      return;
    }

    errors.push(`console.error: ${text}`);
  });

  page.on("pageerror", (error) => {
    errors.push(`page error: ${error.message}`);
  });

  return {
    errors,
    reset: () => {
      errors.length = 0;
    },
  };
}

// Text the app's error boundaries / not-found page render.
const ERROR_TEXT = [
  /Something went wrong/i,
  /Application error/i,
  /Unhandled Runtime Error/i,
  /This page could not be found/i,
  // src/app/not-found.tsx
  /This card isn.t in anyone.s deck/i,
  /Internal Server Error/i,
];

export async function expectNoErrorBoundary(page: Page, route: string) {
  const body = await page.locator("body").innerText();

  for (const pattern of ERROR_TEXT) {
    expect(body, `${route}: page shows error text ${pattern}`).not.toMatch(pattern);
  }

  // Next.js dev error overlay (a <nextjs-portal> with a dialog inside).
  const overlay = await page.locator("nextjs-portal [role=dialog], [data-nextjs-dialog]").count();

  expect(overlay, `${route}: Next.js error overlay is open`).toBe(0);
}

export async function expectNoHorizontalOverflow(page: Page, route: string) {
  const { scrollWidth, innerWidth, culprits } = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    const width = window.innerWidth;

    // Name a few elements sticking out on the right, to make a
    // failure actionable.
    const wide = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((el) => el.getBoundingClientRect().right > width + 1)
      .slice(0, 5)
      .map((el) => {
        const cls = typeof el.className === "string" ? el.className.slice(0, 80) : "";

        return `<${el.tagName.toLowerCase()} class="${cls}"> right=${Math.round(el.getBoundingClientRect().right)}`;
      });

    return {
      scrollWidth: root.scrollWidth,
      innerWidth: width,
      culprits: wide,
    };
  });

  expect(
    scrollWidth,
    `${route}: page is wider than the screen (${scrollWidth} > ${innerWidth}). Wide elements: ${culprits.join(" | ")}`
  ).toBeLessThanOrEqual(innerWidth);
}
