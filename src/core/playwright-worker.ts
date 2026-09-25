#!/usr/bin/env bun
import { importPlaywright, PLAYWRIGHT_INSTALL, type VisualRequest } from "./playwright.ts";
import { runVisualRequest } from "./playwright-visual.ts";
import { exitWorker, readWorkerRequest } from "./spawn.ts";

let playwright: Awaited<ReturnType<typeof importPlaywright>>;
try {
  playwright = await importPlaywright();
} catch {
  exitWorker(`playwright not found; ${PLAYWRIGHT_INSTALL}`);
}

const request = await readWorkerRequest<VisualRequest>();

try {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const response = await runVisualRequest(browser, request);
    process.stdout.write(`${JSON.stringify(response)}\n`);
  } finally {
    await browser.close();
  }
} catch (error) {
  exitWorker(error);
}
