import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import type { Browser } from "playwright";
import {
  keepOnlyTextInPage,
  PDF_SLIDES,
  PDF_TEXT_CSS,
  setSlidePictureInPage,
} from "../../src/core/pdf-text.ts";
import { importPlaywright, playwrightResolved } from "../../src/core/playwright.ts";
import { runVisualRequest } from "../../src/core/playwright-visual.ts";

// A PDF in a real Chromium: each slide a picture, with its text laid over it, unseen.
const skip = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
const browserTest = test.serial.skipIf(skip);

let browser: Browser | undefined;

beforeAll(async () => {
  if (!skip) {
    browser = await (await importPlaywright()).chromium.launch({ headless: true });
  }
});

afterAll(async () => {
  await browser?.close();
});

/** What Apple's viewers draw as flat boxes when Chromium prints it: a blur and a clip to text. */
const slides = `<div id="deck">
  <section class="slide" style="background:#fff">
    <div style="margin:40px;padding:20px;width:300px;background:#fff;box-shadow:0 12px 32px rgba(70,0,115,.5)">Shadowed</div>
    <h2 style="font-size:64px;background:linear-gradient(90deg,#7500c0,#006ead);-webkit-background-clip:text;background-clip:text;color:transparent">Gradient</h2>
    <p style="filter:drop-shadow(0 4px 8px #000)">Filtered</p>
  </section>
  <section class="slide" style="background:#fff"><p>Second</p></section>
</div>`;

/** Every stream of a PDF, inflated where Chromium compressed it. */
function pdfStreams(bytes: Buffer): { dict: string; data: Buffer }[] {
  const text = bytes.toString("latin1");
  const streams: { dict: string; data: Buffer }[] = [];
  for (const match of text.matchAll(/<<((?:(?!>>\s*stream)[\s\S])*)>>\s*stream\r?\n/g)) {
    const start = (match.index ?? 0) + match[0].length;
    const end = text.indexOf("endstream", start);
    const dict = match[1] ?? "";
    const raw = bytes.subarray(start, end);
    streams.push({ dict, data: dict.includes("/FlateDecode") ? inflateSync(raw) : raw });
  }
  return streams;
}

describe("dekc pdf in Chromium", () => {
  browserTest("prints each slide as one picture, with its text and no soft mask", async () => {
    if (!browser) {
      throw new Error("no browser");
    }
    const dir = await mkdtemp(join(tmpdir(), "dek-pdf-"));
    try {
      const pdfPath = join(dir, "demo.pdf");
      const response = await runVisualRequest(browser, {
        kind: "pdf",
        viewport: { width: 1280, height: 720 },
        html: `<html><head><style>@page { size: 1280px 720px; margin: 0 } body { margin: 0 } .slide { width: 1280px; height: 720px; break-after: page; overflow: hidden }</style></head><body>${slides}</body></html>`,
        pdfPath,
      });
      expect(response).toEqual({});
      const bytes = readFileSync(pdfPath);
      const text = bytes.toString("latin1");
      expect(text.startsWith("%PDF-")).toBe(true);

      // One picture a page, drawn at twice the slide's size, and nothing else rasterized.
      const images = [...text.matchAll(/\/Subtype \/Image[\s\S]*?\/Width (\d+)\s*\/Height (\d+)/g)];
      expect(images.map((image) => `${image[1]}x${image[2]}`)).toEqual(["2560x1440", "2560x1440"]);
      // The blur and the clip to text are in the pictures, not soft masks a viewer may draw wrong.
      expect(text).not.toMatch(/\/S \/(Luminosity|Alpha)/);
      // The text is still text: drawn, and drawn unseen.
      const drawn = pdfStreams(bytes)
        .filter(({ dict }) => !dict.includes("/Subtype /Image"))
        .map(({ data }) => data.toString("latin1"))
        .join("\n");
      expect(drawn).toContain("Tj");
      expect(text).toMatch(/\/ca 0\b/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  browserTest("lays the text where it was laid out, and paints nothing else", async () => {
    if (!browser) {
      throw new Error("no browser");
    }
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    try {
      const page = await context.newPage();
      await page.setContent(`<html><head><style>
  #deck .slide .loud { color: red !important; }
  .slide { width: 1280px; height: 720px; border: 4px solid #000; }
</style></head><body style="margin:0"><div id="deck"><section class="slide">
  <div data-k="glass" style="margin:100px;height:200px;backdrop-filter:blur(8px)">
    <p data-k="pinned" style="position:absolute;top:20px;left:30px;margin:0">Pinned</p>
  </div>
  <p class="loud" data-k="loud">Loud</p>
  <img data-k="img" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
</section></div></body></html>`);
      const style = (selector: string) =>
        page.evaluate((selector) => {
          const el = document.querySelector(selector);
          if (!el) {
            throw new Error(`no ${selector}`);
          }
          const { left, top } = el.getBoundingClientRect();
          const { backdropFilter, color, opacity, borderTopColor, backgroundImage } =
            getComputedStyle(el);
          return { left, top, backdropFilter, color, opacity, borderTopColor, backgroundImage };
        }, selector);
      const pinned = await style('[data-k="pinned"]');
      await page.evaluate(keepOnlyTextInPage, { selector: PDF_SLIDES, css: PDF_TEXT_CSS });
      await page.evaluate(setSlidePictureInPage, {
        selector: PDF_SLIDES,
        index: 0,
        picture: "iVBORw0KGgo=",
      });
      // The backdrop filter that made its box the pinned text's containing block is gone, not the box.
      expect(await style('[data-k="pinned"]')).toMatchObject({
        left: pinned.left,
        top: pinned.top,
      });
      const slide = await style(".slide");
      expect({
        glass: (await style('[data-k="glass"]')).backdropFilter,
        loud: (await style('[data-k="loud"]')).color,
        img: (await style('[data-k="img"]')).opacity,
        border: slide.borderTopColor,
        picture: slide.backgroundImage.startsWith('url("data:image/png;base64,'),
      }).toEqual({
        glass: "none",
        loud: "rgba(0, 0, 0, 0)",
        img: "0",
        border: "rgba(0, 0, 0, 0)",
        picture: true,
      });
    } finally {
      await context.close();
    }
  });
});
