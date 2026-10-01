import { describe, expect, test } from "bun:test";
import { copyFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekcError } from "../../src/core/error.ts";
import { pdfDeck, renderPdfHtml } from "../../src/core/pdf.ts";
import type { PlaywrightRunner, VisualRequest } from "../../src/core/playwright.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { slideDocument, slidePlaces } from "../helpers/html.ts";
import { assetFixturesDir } from "../helpers/paths.ts";
import { withTempProject } from "../helpers/project.ts";
import { writeRequested } from "../helpers/visual.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="assets/pixel.png" alt="">
</section>`);

const architectureHtml = slideDocument(`<section class="slide" data-layout="default">
  <h2 class="slide-title">architecture</h2>
  <ul>
    <li data-step="script-parent">script.md が親</li>
    <li data-step="slides-hang">スライドがぶら下がる</li>
  </ul>
</section>`);

describe("renderPdfHtml", () => {
  test("numbers every page in script order, against the deck's count", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

hello

## architecture

body
`,
            slides: { intro: introHtml, architecture: architectureHtml },
          },
        ],
      },
      async (root) => {
        const { deck } = resolveDeck(join(root, "decks", "demo"));
        expect(slidePlaces(renderPdfHtml(deck))).toEqual([
          { slug: "intro", number: 1, count: 2 },
          { slug: "architecture", number: 2, count: 2 },
        ]);
      },
    );
  });

  test("uses lang from frontmatter on the document shell", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
lang: en
---

## intro

hello
`,
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const { deck } = resolveDeck(join(root, "decks", "demo"));
        const html = renderPdfHtml(deck);
        expect(html).toContain('<html lang="en">');
        expect(html).not.toContain('<html lang="ja">');
      },
    );
  });

  test("takes the document shell's lang from the script when frontmatter has none", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const { deck } = resolveDeck(join(root, "decks", "demo"));
        expect(renderPdfHtml(deck)).toContain('<html lang="en">');
      },
    );
  });
});

describe("pdfDeck", () => {
  test("renders every slide at the last beat into one print HTML and writes dist/<deck>.pdf", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: ".slide { width: 1280px; }\n",
            script: `---
title: Demo
---

## intro

hello

## architecture

### script-parent

first

### slides-hang

second
`,
            slides: { intro: introHtml, architecture: architectureHtml },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await copyFile(join(assetFixturesDir, "pixel.png"), join(deckDir, "assets", "pixel.png"));

        const calls: VisualRequest[] = [];
        const runner: PlaywrightRunner = async (request) => {
          calls.push(request);
          await writeRequested(request, "%PDF-1.4\n");
          return {};
        };

        const result = await pdfDeck(deckDir, { runner });
        expect(result.outPath).toBe(join(root, "decks", "demo", "dist", "demo.pdf"));
        expect(calls).toHaveLength(1);
        const [request] = calls;
        expect(request).toMatchObject({ kind: "pdf", pdfPath: result.outPath });

        const html = request?.kind === "pdf" ? request.html : "";
        expect(html).toContain('data-slug="intro"');
        expect(html).toContain('data-slug="architecture"');
        expect(html.indexOf('data-slug="intro"')).toBeLessThan(
          html.indexOf('data-slug="architecture"'),
        );
        expect(html).toMatch(
          /data-step="slides-hang"[^>]*is-shown|is-shown[^>]*data-step="slides-hang"/,
        );
        expect(html).toContain("data:image/png;base64,");
        expect(html).toContain("@page");
        // The browser's default body margin would push the first slide over its page.
        expect(html).toContain("html, body { margin: 0;");
        expect(html).toContain("#deck > .slide:not(:last-child) { break-after: page; }");
        expect(html).not.toContain("dekc-presenter");
        expect(html).not.toContain("startViewTransition");
        expect(html).not.toContain("BroadcastChannel");

        expect(await Bun.file(result.outPath).exists()).toBe(true);
      },
    );
  });

  test("fails with a playwright install hint when the runner is missing", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        try {
          await pdfDeck(join(root, "decks", "demo"), { runner: async () => null });
          throw new Error("expected pdfDeck to fail");
        } catch (error) {
          expect(error).toBeInstanceOf(DekcError);
          expect((error as DekcError).message).toContain("Playwright is not installed");
          expect((error as DekcError).hint).toContain("playwright install");
        }
      },
    );
  });

  test("writes a parsed deck without re-reading script.md", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const resolved = resolveDeck(join(root, "decks", "demo"));
        await writeFile(join(root, "decks", "demo", "script.md"), "this is not a deck\n");
        const runner: PlaywrightRunner = async (request) => {
          await writeRequested(request);
          return {};
        };
        await expect(pdfDeck(resolved.deck.dir, { runner })).rejects.toThrow(DekcError);
        const result = await pdfDeck(resolved, { runner });
        expect(result.outPath).toBe(join(root, "decks", "demo", "dist", "demo.pdf"));
      },
    );
  });
});
