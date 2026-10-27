import { afterAll, test } from "bun:test";
import type { Browser } from "playwright";
import { importPlaywright } from "../../src/core/playwright.ts";

/**
 * How long a test that drives Chromium may take. A loaded machine (a parallel run, CI) stretches
 * a page's second into tens of seconds, and the preload's default timeout reaches only the first
 * test file, so the rest would run under Bun's 5s.
 */
export const BROWSER_TEST_MS = 60_000;

/**
 * How many browser tests Bun has timed out. Each timeout killed the browser then running: Bun
 * kills every process still running when a test times out (its zombie killer).
 */
let timeouts = 0;
/** The browser test that started last. */
let last: { finished: boolean } | undefined;

/**
 * A test that drives Chromium, unless `skip`: one at a time, since concurrent page sets would
 * crowd the machine, and with the time Chromium takes on a loaded one.
 */
export function serialBrowserTest(skip: boolean) {
  const serial = test.serial.skipIf(skip);
  return (name: string, fn: () => Promise<void>, timeoutMs = BROWSER_TEST_MS) =>
    serial(
      name,
      async () => {
        // One at a time, so the last one still running as this one starts was timed out.
        if (last && !last.finished) {
          timeouts++;
        }
        const run = { finished: false };
        last = run;
        try {
          await fn();
        } finally {
          run.finished = true;
        }
      },
      timeoutMs,
    );
}

/** What this helper needs of a browser beyond dek's own typing of Playwright. */
type Watched = Browser & { on(event: "disconnected", listener: () => void): void };

/**
 * One Chromium for a file's tests, launched on first use and again once it is gone, and closed
 * after the file. What it returns runs `use` on that browser.
 *
 * A browser launched before a browser test timed out was killed with it, though it can still
 * answer for a few milliseconds into the next test, so the next test launches a new one: a slow
 * test fails alone, not with every test after it.
 */
export function sharedBrowser(): <T>(use: (browser: Browser) => Promise<T>) => Promise<T> {
  let launched: { browser: Promise<Browser>; timeouts: number } | undefined;

  const current = (): Promise<Browser> => {
    if (launched && launched.timeouts !== timeouts) {
      const killed = launched.browser;
      launched = undefined;
      killed.then((browser) => browser.close()).catch(() => {});
    }
    if (!launched) {
      const launching = {
        browser: importPlaywright().then((playwright) =>
          playwright.chromium.launch({ headless: true }),
        ),
        timeouts,
      };
      launching.browser.then(
        (browser) =>
          (browser as Watched).on("disconnected", () => {
            if (launched === launching) {
              launched = undefined;
            }
          }),
        // A launch that failed is tried again by the next test.
        () => {
          if (launched === launching) {
            launched = undefined;
          }
        },
      );
      launched = launching;
    }
    return launched.browser;
  };

  afterAll(async () => {
    const browser = await launched?.browser.catch(() => undefined);
    await browser?.close();
  });

  return async (use) => use(await current());
}
