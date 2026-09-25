import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "playwright";
import { renderDeckHtml } from "../../src/core/document.ts";
import { renderPdfHtml } from "../../src/core/pdf.ts";
import { importPlaywright, playwrightResolved } from "../../src/core/playwright.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { playerScript } from "../../src/runtime/player.ts";
import { chartScript } from "../helpers/chart-deck.ts";
import { slideDocument } from "../helpers/html.ts";
import { writeProject } from "../helpers/project.ts";

// The player in a real Chromium: print media, the accessibility tree, and view transitions are
// what happy-dom does not have. Run from sample/, where playwright is installed.
const skip = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
const browserTest = test.serial.skipIf(skip);

/** The part of Playwright's page these tests drive; dek's own typing covers only what dek calls. */
type Page = {
  goto(url: string): Promise<unknown>;
  route(url: string, handler: (route: Route) => unknown): Promise<void>;
  routeWebSocket(url: RegExp, handler: () => void): Promise<void>;
  setContent(html: string, options?: { waitUntil?: string }): Promise<void>;
  emulateMedia(options: { media: "print" | "screen" }): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
  waitForFunction(
    fn: () => boolean,
    arg: undefined,
    options: { timeout: number },
  ): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  keyboard: { press(key: string, options?: { delay?: number }): Promise<void> };
  getByRole(role: string, options?: { name?: string }): Locator;
  on(event: "pageerror", listener: (error: Error) => void): void;
  close(): Promise<void>;
};
type Route = { fulfill(response: { contentType: string; body: string }): Promise<void> };
type Locator = {
  count(): Promise<number>;
  locator(selector: string): Locator;
  allTextContents(): Promise<string[]>;
};

async function newPage(): Promise<Page> {
  if (!browser) {
    throw new Error("no browser");
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  return page as unknown as Page;
}

const extra = ["three", "four", "five", "six", "seven"];

const script = `---
title: Demo
lang: en
---

## cover

hello

## chart

### base {#base}

first

### growth {#growth}

second

${extra.map((slug) => `## ${slug}\n\n${slug}\n`).join("\n")}`;

let root = "";
let deckDir = "";
let browser: Browser | undefined;

beforeAll(async () => {
  if (skip) {
    return;
  }
  root = realpathSync(await mkdtemp(join(tmpdir(), "dek-")));
  await writeProject(root, {
    decks: [
      {
        name: "demo",
        script,
        slides: {
          // The default theme lays two-col out as a grid; print must keep it.
          cover: slideDocument(`<section class="slide" data-layout="two-col">
  <div class="col"><h2 class="slide-title">cover</h2></div>
  <div class="col"><a href="https://example.com/">a link on the slide</a></div>
</section>`),
          chart: slideDocument(
            `<section class="slide" data-layout="default"><h2>chart</h2><p class="bar"></p></section>`,
          ),
          ...Object.fromEntries(
            extra.map((slug) => [
              slug,
              slideDocument(`<section class="slide"><h2>${slug}</h2></section>`),
            ]),
          ),
        },
      },
    ],
  });
  deckDir = join(root, "decks", "demo");
  await writeFile(join(deckDir, "slides", "chart.ts"), chartScript);
  const playwright = await importPlaywright();
  browser = await playwright.chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  if (root) {
    await rm(root, { recursive: true, force: true });
  }
});

async function openPlayer(hash = ""): Promise<Page> {
  const html = await renderDeckHtml(deckDir, {
    mode: "player",
    inlineAssets: true,
    playerScript: await playerScript(),
  });
  const page = await newPage();
  // A real URL, so the hash picks the opening slide as a built file's would.
  await page.route("http://deck.test/", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  // No server behind it: the player must not try the WebSocket.
  await page.routeWebSocket(/.*/, () => undefined);
  await page.goto(`http://deck.test/${hash}`);
  return page;
}

const coverDisplay = (page: Page): Promise<string> =>
  page.evaluate(
    () =>
      getComputedStyle(document.querySelector('#deck > .slide[data-slug="cover"]') as Element)
        .display,
  );

const bar = (page: Page): Promise<string | null | undefined> =>
  page.evaluate(
    () => document.querySelector('#deck > .slide[data-slug="chart"] .bar')?.textContent,
  );

describe("printing the player", () => {
  browserTest("keeps each slide in its theme's layout", async () => {
    const page = await openPlayer();
    try {
      expect(await coverDisplay(page)).toBe("grid");
      await page.emulateMedia({ media: "print" });
      expect(await coverDisplay(page)).toBe("grid");
      const shown = await page.evaluate(
        () =>
          [...document.querySelectorAll("#deck > .slide")].filter(
            (el) => getComputedStyle(el).display !== "none",
          ).length,
      );
      expect(shown).toBe(2 + extra.length);
    } finally {
      await page.close();
    }
  });

  browserTest(
    "draws every slide's script at its last beat, then the stage's beat again",
    async () => {
      const page = await openPlayer("#chart");
      try {
        expect(await bar(page)).toBe("0:base:0");
        await page.emulateMedia({ media: "print" });
        await page.waitForFunction(
          () =>
            document.querySelector('#deck > .slide[data-slug="chart"] .bar')?.textContent ===
            "1:growth:40",
          undefined,
          { timeout: 2000 },
        );
        await page.emulateMedia({ media: "screen" });
        await page.waitForFunction(
          () =>
            document.querySelector('#deck > .slide[data-slug="chart"] .bar')?.textContent ===
            "0:base:0",
          undefined,
          { timeout: 2000 },
        );
      } finally {
        await page.close();
      }
    },
  );
});

describe("printing with dek pdf", () => {
  browserTest("keeps each slide in its theme's layout", async () => {
    const page = await newPage();
    try {
      await page.setContent(renderPdfHtml(resolveDeck(deckDir).deck), { waitUntil: "load" });
      await page.emulateMedia({ media: "print" });
      expect(await coverDisplay(page)).toBe("grid");
    } finally {
      await page.close();
    }
  });
});

describe("the player's accessibility", () => {
  browserTest("offers the stage as the main landmark and one heading: the slide's", async () => {
    const page = await openPlayer();
    try {
      expect(await page.getByRole("main").count()).toBe(1);
      expect(await page.getByRole("main").locator("#deck").count()).toBe(1);
      expect(await page.getByRole("heading").allTextContents()).toEqual(["cover"]);
      // Each rail link keeps its own name while the copy inside it stays silent.
      expect(await page.getByRole("link", { name: "2. chart" }).count()).toBe(1);
    } finally {
      await page.close();
    }
  });

  browserTest(
    "tabs through the rail's links, not the copies inside them, to the slide",
    async () => {
      const page = await openPlayer();
      try {
        // From the first rail link, Tab should meet the others and then the slide, nothing between.
        await page.evaluate(() => document.querySelector<HTMLElement>(".dek-thumb")?.focus());
        const stops: string[] = [];
        for (let i = 0; i < 2 + extra.length; i++) {
          await page.keyboard.press("Tab");
          stops.push(
            await page.evaluate(() => {
              const el = document.activeElement;
              return el?.closest("#deck") ? "slide" : (el?.getAttribute("aria-label") ?? "?");
            }),
          );
        }
        expect(stops).toEqual([
          ...["chart", ...extra].map((title, i) => `${i + 2}. ${title}`),
          "slide",
        ]);
      } finally {
        await page.close();
      }
    },
  );
});

describe("rapid moves", () => {
  browserTest("skip transitions without an unhandled rejection", async () => {
    const page = await openPlayer();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press("PageDown", { delay: 0 });
      }
      await page.waitForFunction(() => location.hash === "#seven", undefined, { timeout: 3000 });
      await page.waitForTimeout(500);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  });
});
