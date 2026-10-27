import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, readdirSync, realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { Browser } from "playwright";
import {
  importPlaywright,
  type PlaywrightRunner,
  playwrightResolved,
} from "../../src/core/playwright.ts";
import { runVisualRequest } from "../../src/core/playwright-visual.ts";
import { lintVisualDeck } from "../../src/core/visual.ts";

// What `dekc lint --visual` measures on the sample decks, in a real Chromium: the docs site shows
// them and users copy them, so they pass the rules a shot decides too. sample.test.ts holds them
// to the rest of lint.
const skip = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
const browserTest = test.serial.skipIf(skip);

const sample = join(import.meta.dir, "..", "..", "sample");
/** What a run leaves in sample/, which a copy measured from cold does without. */
const LEFT_OUT = new Set(["node_modules", ".cache", "dist", "refs"]);

let browser: Browser | undefined;
/** A copy of sample/: the visual cache is written next to each deck, never into the checkout. */
let project: string | undefined;

beforeAll(async () => {
  if (!skip) {
    browser = await (await importPlaywright()).chromium.launch({ headless: true });
    project = realpathSync(await mkdtemp(join(tmpdir(), "dek-sample-")));
    cpSync(sample, project, { recursive: true, filter: (path) => !LEFT_OUT.has(basename(path)) });
  }
});

afterAll(async () => {
  await browser?.close();
  if (project) {
    await rm(project, { recursive: true, force: true });
  }
});

/** The worker's work in one shared browser, so the decks do not each launch their own. */
const runner: PlaywrightRunner = (request) => {
  if (!browser) {
    throw new Error("no browser");
  }
  return runVisualRequest(browser, request);
};

describe("the sample decks in Chromium", () => {
  for (const deck of readdirSync(join(sample, "decks"))) {
    // Errors only: a warning leaves lint passing, and where a line breaks follows the fonts installed.
    browserTest(
      `${deck} passes lint --visual`,
      async () => {
        if (!project) {
          throw new Error("no copy of sample/");
        }
        const diagnostics = await lintVisualDeck(join(project, "decks", deck), { runner });
        expect(diagnostics?.filter((found) => found.severity === "error")).toEqual([]);
      },
      // A deck's every beat, measured cold; a CI runner is slower than a laptop.
      120_000,
    );
  }
});
