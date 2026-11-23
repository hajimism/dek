import { describe, expect } from "bun:test";
import { join } from "node:path";
import { playwrightResolved } from "../../src/core/playwright.ts";
import type { DevServer } from "../../src/server/dev.ts";
import { serialBrowserTest, sharedBrowser } from "../helpers/browser.ts";
import { writeEdit } from "../helpers/fs.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";
import { withDevServer } from "../helpers/server.ts";
import { WAIT_MS } from "../helpers/wait.ts";

// The two ends of the dev line together, in a real Chromium: the server as `dekc serve` starts
// it, and the page it serves. Each end has its own tests against a stand-in for the other; these
// are the only ones in which a file saved on disk reaches a page that is open.
const skip = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
const browserTest = serialBrowserTest(skip);
const withBrowser = sharedBrowser();

/** The part of Playwright's page these tests drive; dek's own typing covers only what dek calls. */
type Page = {
  goto(url: string): Promise<unknown>;
  evaluate<T, A = unknown>(fn: (arg: A) => T | Promise<T>, arg?: A): Promise<T>;
  waitForFunction<A>(
    fn: (arg: A) => boolean,
    arg: A,
    options: { timeout: number },
  ): Promise<unknown>;
  keyboard: { press(key: string): Promise<void> };
  context(): { close(): Promise<void> };
};

const slide = (title: string) =>
  slideDocument(`<section class="slide"><h2>${title}</h2></section>`);

const script = (...slugs: string[]) =>
  `---\ntitle: Talk\n---\n\n${slugs.map((slug) => `## ${slug}\n\nWhat is said on ${slug}.\n`).join("\n")}`;

/** A deck of two slides on a running dev server, and its folder. */
async function withServedDeck(fn: (server: DevServer, deckDir: string) => Promise<void>) {
  await withTempProject(
    {
      decks: [
        {
          name: "talk",
          script: script("intro", "next"),
          slides: { intro: slide("intro"), next: slide("next") },
          theme: ".slide { --probe: rgb(1, 2, 3); }\n",
        },
      ],
    },
    async (root) => {
      await withDevServer({ cwd: root }, (server) => fn(server, join(root, "decks", "talk")));
    },
  );
}

/** A page that has not loaded again still has what was put on its window. */
const KEPT = "dekTestKept";

/**
 * The deck's page with its player started, in a browser context of its own, so that nothing but
 * the server joins two of them, and marked so that a load of the page shows.
 */
async function openDeck(server: DevServer): Promise<Page> {
  const context = await withBrowser((browser) => browser.newContext());
  const page = (await context.newPage()) as unknown as Page;
  await page.goto(`${server.url.replace(/\/$/, "")}/decks/talk/`);
  await page.waitForFunction(() => typeof window.dekLive === "function", undefined, {
    timeout: WAIT_MS,
  });
  await page.evaluate((key) => {
    (window as unknown as Record<string, boolean>)[key] = true;
  }, KEPT);
  return page;
}

const kept = (page: Page): Promise<boolean> =>
  page.evaluate((key) => (window as unknown as Record<string, boolean>)[key] === true, KEPT);

/** The headings of the slides under `within`: the stage, or the rail, which draws each again. */
const titles = (page: Page, within = "#deck"): Promise<string[]> =>
  page.evaluate(
    (selector) =>
      [...document.querySelectorAll(`${selector} .slide h2`)].map(
        (heading) => heading.textContent ?? "",
      ),
    within,
  );

const hash = (page: Page): Promise<string> => page.evaluate(() => location.hash);

describe("a file saved while the deck's page is open", () => {
  browserTest("a slide shows as saved, on the page as it was", async () => {
    await withServedDeck(async (server, deckDir) => {
      const page = await openDeck(server);
      try {
        await writeEdit(join(deckDir, "slides", "intro.html"), slide("intro, said better"));
        await page.waitForFunction(
          () => document.querySelector("#deck .slide h2")?.textContent === "intro, said better",
          undefined,
          { timeout: WAIT_MS },
        );
        expect(await titles(page)).toEqual(["intro, said better", "next"]);
        expect(await titles(page, "#dek-rail")).toEqual(["intro, said better", "next"]);
        expect(await kept(page)).toBe(true);
      } finally {
        await page.context().close();
      }
    });
  });

  browserTest("theme.css restyles the page as it was", async () => {
    await withServedDeck(async (server, deckDir) => {
      const page = await openDeck(server);
      try {
        await writeEdit(join(deckDir, "theme.css"), ".slide { --probe: rgb(4, 5, 6); }\n");
        await page.waitForFunction(
          (token) => {
            const first = document.querySelector("#deck .slide");
            return (
              first !== null && getComputedStyle(first).getPropertyValue("--probe").trim() === token
            );
          },
          "rgb(4, 5, 6)",
          { timeout: WAIT_MS },
        );
        expect(await kept(page)).toBe(true);
      } finally {
        await page.context().close();
      }
    });
  });

  browserTest("script.md loads the page again, with the slides it now has", async () => {
    await withServedDeck(async (server, deckDir) => {
      const page = await openDeck(server);
      try {
        await writeEdit(join(deckDir, "slides", "last.html"), slide("last"));
        await writeEdit(join(deckDir, "script.md"), script("intro", "next", "last"));
        await page.waitForFunction(
          () => document.querySelectorAll("#deck .slide h2").length === 3,
          undefined,
          { timeout: WAIT_MS },
        );
        expect(await titles(page)).toEqual(["intro", "next", "last"]);
        expect(await kept(page)).toBe(false);
      } finally {
        await page.context().close();
      }
    });
  });
});

describe("two browsers on the same deck", () => {
  browserTest("a move in one reaches the other, and a page opened later starts there", async () => {
    await withServedDeck(async (server) => {
      const one = await openDeck(server);
      const other = await openDeck(server);
      try {
        expect(await hash(other)).toBe("#intro");
        await one.keyboard.press("ArrowRight");
        await other.waitForFunction((at) => location.hash === at, "#next", { timeout: WAIT_MS });
        expect(await hash(one)).toBe("#next");

        const late = await openDeck(server);
        try {
          await late.waitForFunction((at) => location.hash === at, "#next", { timeout: WAIT_MS });
        } finally {
          await late.context().close();
        }
      } finally {
        await one.context().close();
        await other.context().close();
      }
    });
  });
});
