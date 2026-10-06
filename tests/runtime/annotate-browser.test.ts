import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "playwright";
import {
  AnnotationOp,
  applyAnnotationOp,
  clearAnnotations,
  listAnnotations,
} from "../../src/core/annotations.ts";
import { renderDeckHtml } from "../../src/core/document.ts";
import { importPlaywright, playwrightResolved } from "../../src/core/playwright.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { annotateScript, playerScript } from "../../src/runtime/player.ts";
import { slideDocument } from "../helpers/html.ts";
import { writeProject } from "../helpers/project.ts";

// Annotate mode in a real Chromium: hit testing, shadow DOM retargeting, and the clipboard are
// what happy-dom does not have.
const skip = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
const browserTest = test.serial.skipIf(skip);

/** The part of Playwright's page these tests drive. */
type Page = {
  goto(url: string): Promise<unknown>;
  route(url: string, handler: (route: Route) => unknown): Promise<void>;
  routeWebSocket(url: RegExp, handler: () => void): Promise<void>;
  evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
  waitForFunction(
    fn: () => boolean,
    arg: undefined,
    options: { timeout: number },
  ): Promise<unknown>;
  mouse: { move(x: number, y: number): Promise<void>; click(x: number, y: number): Promise<void> };
  keyboard: {
    press(key: string): Promise<void>;
    type(text: string): Promise<void>;
    down(key: string): Promise<void>;
    up(key: string): Promise<void>;
  };
  on(event: "pageerror", listener: (error: Error) => void): void;
  close(): Promise<void>;
};
type Route = {
  request(): { postData(): string | null };
  fulfill(response: { status?: number; contentType: string; body: string }): Promise<void>;
};

const script = `---
title: Plan
lang: en
---

## plan

### later {#later}

two
`;

// Laid out by hand on a 1280×720 slide, so a test knows where each thing is.
const planHtml = slideDocument(`<section class="slide">
  <div class="lane" style="position: absolute; left: 100px; top: 100px; width: 600px; height: 300px; background: #eee">
    <div class="chevron" style="position: absolute; left: 20px; top: 20px; width: 200px; height: 40px">設計</div>
    <div class="next" style="position: absolute; left: 20px; top: 70px; width: 200px; height: 40px">試作</div>
    <div class="arrow" style="position: absolute; left: 400px; top: 20px; width: 4px; height: 200px; background: pink; pointer-events: none"></div>
    <div class="later" data-step="later" style="position: absolute; left: 20px; top: 120px; width: 200px; height: 40px">later</div>
  </div>
  <svg style="position: absolute; left: 800px; top: 100px; width: 200px; height: 200px" viewBox="0 0 200 200"><line x1="0" y1="100" x2="200" y2="100" stroke="black" stroke-width="1"/></svg>
</section>`);

const theme = `.slide { position: relative; width: 1280px; height: 720px; }
.slide.is-current [data-step] { opacity: 0; }
.slide.is-current [data-step].is-shown { opacity: 1; }
`;

let root = "";
let browser: Browser | undefined;

beforeAll(async () => {
  if (skip) {
    return;
  }
  root = realpathSync(await mkdtemp(join(tmpdir(), "dek-")));
  await writeProject(root, {
    decks: [{ name: "plan", script, theme, slides: { plan: planHtml } }],
  });
  const playwright = await importPlaywright();
  browser = await playwright.chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  if (root) {
    await rm(root, { recursive: true, force: true });
  }
});

/** The dev server's page for the speaker, served over plain HTTP as the LAN address is. */
async function openDevPage(): Promise<{ page: Page; errors: Error[] }> {
  const html = renderDeckHtml(join(root, "decks", "plan"), {
    playerScript: await playerScript(),
    target: {
      kind: "dev",
      mode: "player",
      includeNotes: true,
      liveReloadScript: "",
      annotateScript: await annotateScript(),
    },
  });
  if (!browser) {
    throw new Error("no browser");
  }
  const page = (await browser.newPage({
    viewport: { width: 1280, height: 720 },
  })) as unknown as Page;
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await page.route("http://deck.test/", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  // The dev server's notes, answered from the project's file as its route answers them.
  const deck = resolveDeck(join(root, "decks", "plan")).deck;
  clearAnnotations(root, deck);
  await page.route("http://deck.test/annotations", (route) => {
    const sent = route.request().postData();
    const op = sent ? AnnotationOp.parse(JSON.parse(sent)) : undefined;
    const done = op
      ? applyAnnotationOp(root, deck, op)
      : { annotations: listAnnotations(root, deck) };
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, ...done }),
    });
  });
  await page.routeWebSocket(/.*/, () => undefined);
  await page.goto("http://deck.test/#plan");
  await page.keyboard.press("a");
  return { page, errors };
}

/** Where a point on the slide, in its own pixels, is in the window. */
function onScreen(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([sx, sy]) => {
      const deck = document.getElementById("deck") as HTMLElement;
      const rect = deck.getBoundingClientRect();
      const scale = rect.width / deck.offsetWidth;
      return { x: rect.left + sx * scale, y: rect.top + sy * scale };
    },
    [x, y] as const,
  );
}

async function clickSlide(page: Page, x: number, y: number): Promise<void> {
  const at = await onScreen(page, x, y);
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
}

/** Every element the popup offers for the last click, in full, and the one it picked. */
async function choices(page: Page): Promise<{ all: string[]; chosen: string }> {
  return page.evaluate(() => {
    const buttons = [
      ...(document
        .getElementById("dek-annotate")
        ?.shadowRoot?.querySelectorAll("[data-part=choices] button") ?? []),
    ];
    return {
      all: buttons.map((button) => button.getAttribute("title") ?? ""),
      chosen:
        buttons
          .find((button) => button.getAttribute("aria-pressed") === "true")
          ?.getAttribute("title") ?? "",
    };
  }, undefined);
}

/** What the view's element at `selector` holds and whether it shows; a click on it when asked. */
function inView(
  page: Page,
  selector: string,
  click = false,
): Promise<{ value: string; hidden: boolean } | undefined> {
  return page.evaluate(
    ([at, press]) => {
      const el = document.getElementById("dek-annotate")?.shadowRoot?.querySelector(at);
      if (!(el instanceof HTMLElement)) {
        return undefined;
      }
      if (press) {
        el.click();
      }
      return {
        value: el instanceof HTMLTextAreaElement ? el.value : "",
        hidden: el.hasAttribute("hidden"),
      };
    },
    [selector, click] as const,
  );
}

describe("annotate mode in a browser", () => {
  browserTest("picks a decorative arrow that takes no pointer", async () => {
    const { page, errors } = await openDevPage();
    try {
      await clickSlide(page, 100 + 400 + 2, 100 + 100);
      expect((await choices(page)).chosen).toStartWith("div.arrow :");
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  browserTest("passes over a step not shown yet, to what is behind it", async () => {
    const { page } = await openDevPage();
    try {
      await clickSlide(page, 100 + 20 + 100, 100 + 120 + 20);
      const found = await choices(page);
      expect(found.all.some((choice) => choice.startsWith("div.later"))).toBe(false);
      expect(found.chosen).toStartWith("div.lane ");
    } finally {
      await page.close();
    }
  });

  browserTest("finds a one-pixel line from beside it", async () => {
    const { page } = await openDevPage();
    try {
      await clickSlide(page, 900, 100 + 100 + 3);
      expect((await choices(page)).chosen).toStartWith("line :");
    } finally {
      await page.close();
    }
  });

  browserTest("adds an element the popup lies over, with Cmd held", async () => {
    const { page } = await openDevPage();
    try {
      await clickSlide(page, 100 + 20 + 100, 100 + 20 + 20);
      // The popup opens under the chevron, over the box right under it.
      const next = await onScreen(page, 100 + 20 + 100, 100 + 70 + 20);
      const over = await page.evaluate(
        ([x, y]) => {
          const popup = document
            .getElementById("dek-annotate")
            ?.shadowRoot?.querySelector("[data-part=popup]") as HTMLElement;
          const rect = popup.getBoundingClientRect();
          return x > rect.left && x < rect.right && y > rect.top && y < rect.bottom;
        },
        [next.x, next.y] as const,
      );
      expect(over).toBe(true);
      await page.keyboard.down("Meta");
      await page.mouse.click(next.x, next.y);
      await page.keyboard.up("Meta");
      const picked = await page.evaluate(
        () =>
          [
            ...(document
              .getElementById("dek-annotate")
              ?.shadowRoot?.querySelectorAll("[data-part=picked] li") ?? []),
          ].map((item) => item.textContent ?? ""),
        undefined,
      );
      expect(picked.map((label) => label.split(" ")[0])).toEqual(["div.chevron", "div.next"]);
    } finally {
      await page.close();
    }
  });

  browserTest("keeps every key typed into the note out of the deck", async () => {
    const { page } = await openDevPage();
    try {
      await clickSlide(page, 100 + 20 + 100, 100 + 20 + 20);
      await page.keyboard.type("a s p f");
      await page.keyboard.press("ArrowRight");
      const state = await page.evaluate(
        () => ({
          hash: location.hash,
          presenter: document.body.classList.contains("is-presenter"),
        }),
        undefined,
      );
      expect(state).toEqual({ hash: "#plan", presenter: false });
      expect((await inView(page, "textarea"))?.value).toBe("a s p f");
    } finally {
      await page.close();
    }
  });

  browserTest("notes a place on the slide by its point, and copies by hand over HTTP", async () => {
    const { page } = await openDevPage();
    try {
      await clickSlide(page, 1100, 600);
      expect((await choices(page)).all).toEqual(["section.slide :8"]);
      await page.keyboard.type("ここに矢印");
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () =>
          document
            .getElementById("dek-annotate")
            ?.shadowRoot?.querySelector("[data-part=marker]") !== null,
        undefined,
        { timeout: 5_000 },
      );
      // Its pin's tip is on the place clicked, not on a corner of the slide.
      const at = await onScreen(page, 1100, 600);
      const tip = await page.evaluate(() => {
        const pin = document
          .getElementById("dek-annotate")
          ?.shadowRoot?.querySelector("[data-part=marker]") as HTMLElement;
        const rect = pin.getBoundingClientRect();
        return { x: rect.left, y: rect.bottom };
      }, undefined);
      expect(Math.abs(tip.x - at.x)).toBeLessThan(4);
      expect(Math.abs(tip.y - at.y)).toBeLessThan(4);
      await inView(page, "[data-part=copy]", true);
      await page.waitForFunction(
        () =>
          document
            .getElementById("dek-annotate")
            ?.shadowRoot?.querySelector("[data-part=manual]")
            ?.hasAttribute("hidden") === false,
        undefined,
        { timeout: 5_000 },
      );
      const text = (await inView(page, "[data-part=manual]"))?.value;
      expect(text).toMatch(
        /1\. section\.slide at decks\/plan\/slides\/plan\.html:8:3 \(point 1(099|100|101),(599|600|601)\)\n {3}> ここに矢印/,
      );
    } finally {
      await page.close();
    }
  });
});
