import { afterAll, beforeAll, expect } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderDeckHtml } from "../../../src/core/document.ts";
import { playwrightResolved } from "../../../src/core/playwright.ts";
import { MANIFEST } from "../../../src/plugins/study/manifest.ts";
import { playerScript, pluginPageScripts } from "../../../src/runtime/player.ts";
import { serialBrowserTest, sharedBrowser } from "../../helpers/browser.ts";
import { writeProject } from "../../helpers/project.ts";

// dek-study's sheet in a real Chromium: where a sticker lands, and the pointer resting on it, are
// what happy-dom cannot measure.
const skip = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
const browserTest = serialBrowserTest(skip);
const withBrowser = sharedBrowser();

type Page = {
  goto(url: string): Promise<unknown>;
  route(url: string, handler: (route: Route) => unknown): Promise<void>;
  routeWebSocket(url: RegExp, handler: () => void): Promise<void>;
  evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
  waitForTimeout(ms: number): Promise<void>;
  keyboard: { press(key: string): Promise<void> };
  mouse: { move(x: number, y: number): Promise<void> };
  close(): Promise<void>;
};
type Route = { fulfill(response: { contentType: string; body: string }): Promise<void> };
type Box = { left: number; top: number; right: number; bottom: number };

const script = `---
title: 入門
lang: ja
---

## fallacy

計画錯誤
`;

const slide = `<section class="slide"><h1>計画錯誤</h1><p>楽観的に見積もる傾向に、<strong>外部</strong>視点で対抗する</p></section>`;

const study = `version: 1
stickers:
  - id: s1
    slide: fallacy
    quote: 外部視点
`;

let root = "";
let deckDir = "";

beforeAll(async () => {
  root = realpathSync(await mkdtemp(join(tmpdir(), "dek-study-browser-")));
  await writeProject(root, { decks: [{ name: "intro", script, slides: { fallacy: slide } }] });
  deckDir = join(root, "decks", "intro");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function openDeck(): Promise<Page> {
  const html = renderDeckHtml(deckDir, {
    playerScript: await playerScript(),
    target: { kind: "build" },
    plugins: [
      {
        name: "study",
        keys: [...(MANIFEST.page.keys ?? [])],
        script: (await pluginPageScripts()).study as string,
        data: { "study.yaml": { text: study, version: "1" } },
      },
    ],
  });
  const page = (await withBrowser((browser) =>
    browser.newPage({ viewport: { width: 1280, height: 720 } }),
  )) as unknown as Page;
  await page.route("http://deck.test/", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.routeWebSocket(/.*/, () => undefined);
  await page.goto("http://deck.test/");
  return page;
}

/** The sticker's box and the hidden words' box, in the window, and whether the word shows through. */
const measure = (page: Page) =>
  page.evaluate(() => {
    const layer = document.querySelector<HTMLElement>('.dek-plugin-layer[data-slug="fallacy"]');
    const stickers = [...(layer?.shadowRoot?.querySelectorAll<HTMLElement>(".sticker") ?? [])];
    const sticker = stickers[0];
    const p = document.querySelector('#deck > .slide[data-slug="fallacy"] p') as Element;
    const range = document.createRange();
    const strong = p.querySelector("strong")?.firstChild as Text;
    const after = strong.parentElement?.nextSibling as Text;
    range.setStart(strong, 0);
    range.setEnd(after, 2);
    const box = (rect: DOMRect | undefined): Box | null =>
      rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null;
    return {
      pieces: stickers.length,
      sticker: box(sticker?.getBoundingClientRect()),
      words: box(range.getBoundingClientRect()),
      peek: sticker?.classList.contains("peek") ?? false,
      // The sticker's paper, as an alpha: 1 hides the words, 0 lets them all show.
      paper: sticker
        ? Number(getComputedStyle(sticker).backgroundColor.split(",")[3]?.replace(")", "") ?? 1)
        : null,
      shown: sticker
        ? getComputedStyle(sticker.parentElement as Element).display !== "none"
        : false,
    };
  }, undefined);

browserTest("the sheet covers a sticker's words, and the pointer peels it away", async () => {
  const page = await openDeck();
  try {
    // Off until `r`: a reader who only reads is not in its way.
    expect((await measure(page)).sticker).toBeNull();
    await page.keyboard.press("r");
    const on = await measure(page);
    expect(on.shown).toBe(true);
    // One piece over words that cross an element: a range gives a box for each text node.
    expect(on.pieces).toBe(1);
    const sticker = on.sticker as Box;
    const words = on.words as Box;
    // The sticker covers the words, across the element boundary inside them.
    expect(sticker.left).toBeLessThanOrEqual(words.left);
    expect(sticker.top).toBeLessThanOrEqual(words.top);
    expect(sticker.right).toBeGreaterThanOrEqual(words.right);
    expect(sticker.bottom).toBeGreaterThanOrEqual(words.bottom);

    await page.mouse.move(sticker.left - 40, sticker.top - 40);
    await page.mouse.move((sticker.left + sticker.right) / 2, (sticker.top + sticker.bottom) / 2);
    // No wait: the sticker starts to fade at once, and is gone a moment later.
    expect((await measure(page)).peek).toBe(true);
    await page.waitForTimeout(300);
    expect((await measure(page)).paper).toBe(0);
    await page.mouse.move(5, 5);
    expect((await measure(page)).peek).toBe(false);
    await page.waitForTimeout(300);
    expect((await measure(page)).paper).toBe(1);

    await page.keyboard.press("r");
    expect((await measure(page)).sticker).toBeNull();
  } finally {
    await page.close();
  }
});
