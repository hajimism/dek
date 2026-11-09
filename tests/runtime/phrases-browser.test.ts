import { describe, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "playwright";
import { phraseBoundaries } from "../../src/core/budoux/parser.ts";
import { renderDeckHtml } from "../../src/core/document.ts";
import { importPlaywright, playwrightResolved } from "../../src/core/playwright.ts";
import { playerScript } from "../../src/runtime/player.ts";
import { serialBrowserTest } from "../helpers/browser.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

// WebKit, as Safari draws a built deck: it has no `word-break: auto-phrase`. CI installs only
// Chromium, so this runs where `bunx playwright install webkit` has been run.
const playwright =
  playwrightResolved() && !process.env.DEK_PLAYWRIGHT ? await importPlaywright() : undefined;
const skip = !playwright || !existsSync(playwright.webkit.executablePath());
const browserTest = serialBrowserTest(skip);

const paragraphs = [
  "直すときに開くのは同じ名前の数ファイルだけなので、差分がそのまま読め、書き間違えても崩れるのはその一枚だけです。",
  "台本を保存すると、見出しごとに骨格ができます。見出しがタイトルに、ビートが箇条書きになります。",
  "デッキの外にあるものは、何も参照しない。ディレクトリごとコピーすれば、何年後に開いても同じように描画されます。",
];

const deck = {
  name: "demo",
  script: `---
title: デモ
lang: ja
---

## intro

台本を先に書く。
`,
  slides: {
    intro: slideDocument(`<section class="slide">
  ${paragraphs.map((text, i) => `<p id="p${i}" style="width: ${11 + i * 3}em">${text}</p>`).join("\n  ")}
</section>`),
  },
};

/** Where each paragraph's lines start after its first, as offsets into its text. */
function lineStarts(): number[][] {
  return [...document.querySelectorAll("#deck p[id]")].map((p) => {
    const starts: number[] = [];
    let at = 0;
    let bottom = Number.NEGATIVE_INFINITY;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      for (let i = 0; i < node.data.length; i++, at++) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          continue;
        }
        if (rect.top >= bottom - 1) {
          if (bottom !== Number.NEGATIVE_INFINITY) {
            starts.push(at);
          }
          bottom = rect.bottom;
        } else {
          bottom = Math.max(bottom, rect.bottom);
        }
      }
    }
    return starts;
  });
}

/** The lines that start inside a phrase, as BudouX finds the phrases, each shown at its break. */
function insidePhrase(starts: number[][]): string[] {
  return starts.flatMap((each, i) => {
    const text = paragraphs[i] ?? "";
    const boundaries = new Set(phraseBoundaries(text));
    return each
      .filter((at) => !boundaries.has(at))
      .map((at) => `${text.slice(Math.max(0, at - 4), at)}／${text.slice(at, at + 4)}`);
  });
}

describe("a built Japanese deck in WebKit", () => {
  browserTest("breaks every line between phrases, where it would break inside one", async () => {
    await withTempProject({ decks: [deck] }, async (root) => {
      const html = renderDeckHtml(join(root, "decks", "demo"), {
        playerScript: await playerScript(),
        target: { kind: "build" },
      });
      const browser: Browser = await (playwright as NonNullable<typeof playwright>).webkit.launch();
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        expect(await page.evaluate(() => CSS.supports("word-break", "auto-phrase"))).toBe(false);

        // The deck as it was before the build added anything: WebKit drops auto-phrase, breaks
        // between any two characters, and so inside phrases.
        await page.setContent(html.replaceAll(/data-dek-phrases="[^"]*"/g, ""));
        await page.evaluate(() => {
          const style = document.createElement("style");
          style.textContent = ".slide, .slide * { word-break: normal !important; }";
          document.head.append(style);
        });
        expect(insidePhrase(await page.evaluate(lineStarts)).length).toBeGreaterThan(0);

        // The player breaks the slides as it starts, which the load event waits for.
        await page.setContent(html, { waitUntil: "load" });
        expect(await page.evaluate(() => document.querySelectorAll("#deck wbr").length)).toBe(
          paragraphs.flatMap(phraseBoundaries).length,
        );
        const starts = await page.evaluate(lineStarts);
        expect(starts.flat().length).toBeGreaterThan(paragraphs.length);
        expect(insidePhrase(starts)).toEqual([]);
      } finally {
        await browser.close();
      }
    });
  });
});
