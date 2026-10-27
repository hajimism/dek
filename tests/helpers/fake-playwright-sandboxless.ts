#!/usr/bin/env bun
// Stands in for the Playwright worker where Chromium's sandbox cannot start, as in a container
// running as root: dek's own worker loop, around a Chromium whose launch with the sandbox fails as
// Playwright says it does, and whose launch without one draws as fake-playwright.ts does.
// DEK_FAKE_LAUNCH=zygote fails the first launch in words dek does not know; =missing fails both
// launches for want of Chromium; =both fails the first for the sandbox and the second for that.
import type { Browser } from "playwright";
import type { VisualRequest } from "../../src/core/playwright.ts";
import { runPlaywrightWorker } from "../../src/core/playwright.ts";
import { CHROMIUM_MISSING, SANDBOX_FAILED, ZYGOTE_FAILED } from "./sandbox.ts";

const FAILURES: Record<string, [string, string?]> = {
  sandbox: [SANDBOX_FAILED],
  zygote: [ZYGOTE_FAILED],
  missing: [CHROMIUM_MISSING, CHROMIUM_MISSING],
  both: [SANDBOX_FAILED, CHROMIUM_MISSING],
};
const [sandboxed, unsandboxed] = FAILURES[process.env.DEK_FAKE_LAUNCH ?? "sandbox"] ?? [];

const browser = { close: async () => {} } as unknown as Browser;
const chromium = {
  launch: async (options?: { chromiumSandbox?: boolean }): Promise<Browser> => {
    const failure = options?.chromiumSandbox ? sandboxed : unsandboxed;
    if (failure !== undefined) {
      throw new Error(failure);
    }
    return browser;
  },
};

await runPlaywrightWorker(async (_browser, request: VisualRequest) => {
  for (const page of "pages" in request ? request.pages : []) {
    if ("screenshotPath" in page && page.screenshotPath) {
      await Bun.write(page.screenshotPath, "");
    }
  }
  return request.kind === "pages" ? { overflows: [], contrasts: [] } : {};
}, chromium);
