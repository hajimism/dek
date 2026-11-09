import { describe, expect } from "bun:test";
import { join } from "node:path";
import type { Browser } from "playwright";
import { phraseBoundaries } from "../../src/core/budoux/parser.ts";
import { renderDeckHtml } from "../../src/core/document.ts";
import { importPlaywright, playwrightResolved } from "../../src/core/playwright.ts";
import { playerScript } from "../../src/runtime/player.ts";
import { serialBrowserTest } from "../helpers/browser.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

// Markup Chromium's parser rebuilds, read by the build's tokens and the page's tree: where the two
// read a run differently, the page finds no phrases for it, rather than the wrong ones.
const skip = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
const browserTest = serialBrowserTest(skip);

const paragraph = "台本を先に書いてから画面を組み立てる";
const cell = "見出しごとに骨格ができます";
// Text inside a table but outside its cells moves out in front of the table, where it joins the
// text before it into one run the build never saw.
const slideHtml = `<section class="slide">
<p>${paragraph}</p>
<div>前置きの文を<table><tbody>台本を先に書いてから<tr><td>${cell}</td></tr></tbody></table></div>
</section>`;

describe("a slide whose markup the parser rebuilds", () => {
  browserTest(
    "breaks the runs it reads as the build did, and leaves the others alone",
    async () => {
      await withTempProject(
        {
          decks: [
            {
              name: "demo",
              script: "---\ntitle: デモ\nlang: ja\n---\n\n## intro\n\n台本を先に書く。\n",
              slides: { intro: slideDocument(slideHtml) },
            },
          ],
        },
        async (root) => {
          const html = renderDeckHtml(join(root, "decks", "demo"), {
            playerScript: await playerScript(),
            target: { kind: "build" },
          }).replace("<head>", "<head><script>CSS.supports = () => false;</script>");
          const browser: Browser = await (await importPlaywright()).chromium.launch();
          try {
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: "load" });
            const read = await page.evaluate(() => {
              const slide = document.querySelector("#deck .slide") as Element;
              const div = slide.querySelector("div") as Element;
              const before = [...div.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE);
              return {
                paragraph: slide.querySelectorAll("p wbr").length,
                cell: slide.querySelectorAll("td wbr").length,
                moved: before.map((node) => node.textContent).join(""),
                movedBreaks: [...div.children].filter((el) => el.localName === "wbr").length,
              };
            });
            expect(read.moved).toBe("前置きの文を台本を先に書いてから");
            expect(read.movedBreaks).toBe(0);
            expect(read.paragraph).toBe(phraseBoundaries(paragraph).length);
            expect(read.cell).toBe(phraseBoundaries(cell).length);
          } finally {
            await browser.close();
          }
        },
      );
    },
  );
});
