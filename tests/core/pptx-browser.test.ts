import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import type { Browser } from "playwright";
import {
  importPlaywright,
  type PlaywrightRunner,
  playwrightResolved,
  type VisualRequest,
} from "../../src/core/playwright.ts";
import { runVisualRequest } from "../../src/core/playwright-visual.ts";
import { pptxDeck } from "../../src/core/pptx.ts";
import type { PptxTextBox } from "../../src/core/pptx-package.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { withTempProject } from "../helpers/project.ts";
import { readZip } from "../helpers/zip.ts";

// A PPTX in a real Chromium: where the text is laid out, line by line, and the picture without it.
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

/** The worker's work in one shared browser, recording what each slide's text came back as. */
const seen: Array<{ slug: string; boxes: PptxTextBox[]; description: string }> = [];
const runner: PlaywrightRunner = async (request: VisualRequest) => {
  if (!browser) {
    throw new Error("no browser");
  }
  const response = await runVisualRequest(browser, request);
  if (request.kind === "pptx") {
    seen.push(...(response as { slides: typeof seen }).slides);
  }
  return response;
};

const script = `---
title: Handout
lang: ja
---

## cover

最初の段落です。

> 舞台の指示。

### more {#more}

次の段落です。
`;

const theme = `.slide { position: relative; width: 1280px; height: 720px; font-family: sans-serif; color: rgb(20 20 20); background: rgb(250 250 250); }
.slide h2 { position: absolute; left: 80px; top: 80px; width: 520px; margin: 0; font-size: 64px; line-height: 1.2; }
.slide .lede { position: absolute; left: 80px; top: 320px; width: 1000px; margin: 0; font-size: 28px; }
.slide .chip { padding: 0 24px; background: rgb(220 220 255); }
.slide .faint { opacity: 0.5; }
.slide .turned { position: absolute; left: 900px; top: 80px; transform: rotate(-10deg); }
.slide .big { position: absolute; left: 80px; top: 500px; transform: scale(2); transform-origin: 0 0; font-size: 20px; }
.slide .upper { text-transform: uppercase; }
.slide::after { content: "01"; position: absolute; right: 40px; bottom: 30px; }
`;

const cover = `<section class="slide">
  <h2>台本から、発表まで書き切る道具</h2>
  <p class="lede">dek は　<span class="chip">台本</span> を先に書く。<b>太字</b>と<span class="faint">薄い字</span>と<span class="upper">loud</span>。</p>
  <p class="turned">回った字</p>
  <p class="big">倍の字</p>
  <svg viewBox="0 0 100 20" aria-label="a sketch"><text x="0" y="15">図の字</text></svg>
  <p aria-hidden="true">飾りの字</p>
  <img src="assets/a.png" alt="a photo of the venue">
</section>
`;

describe("pptxDeck in a browser", () => {
  browserTest(
    "lays each line of HTML text back where it was, and leaves the rest in the picture",
    async () => {
      await withTempProject(
        {
          decks: [
            { name: "handout", script, theme, slides: { cover }, assets: { "a.png": "png" } },
          ],
        },
        async (root) => {
          seen.length = 0;
          const dir = join(root, "decks", "handout");
          const { outPath } = await pptxDeck(dir, { runner });
          const [slide] = seen;
          const lines = (slide?.boxes ?? []).map((box) => box.runs.map((run) => run.text).join(""));

          // The heading wraps in the browser; each of its lines is a box of its own.
          const heading = (slide?.boxes ?? []).filter((box) => box.runs[0]?.size === 64);
          expect(heading.length).toBeGreaterThan(1);
          expect(heading.map((box) => box.runs.map((run) => run.text).join("")).join("")).toBe(
            "台本から、発表まで書き切る道具",
          );
          expect(heading[1]?.y).toBeGreaterThan(heading[0]?.y ?? 0);

          // A chip's padding sets it apart; an ideographic space is kept as written.
          expect(lines).toContain("dek は　");
          expect(lines).toContain("台本");
          const rest = (slide?.boxes ?? []).find((box) =>
            box.runs.some((run) => run.text === "太字"),
          );
          expect(rest?.runs.map((run) => run.text)).toEqual([
            "を先に書く。",
            "太字",
            "と",
            "薄い字",
            "と",
            "LOUD",
            "。",
          ]);
          expect(rest?.runs.find((run) => run.text === "太字")?.bold).toBe(true);
          expect(rest?.runs.find((run) => run.text === "薄い字")?.alpha).toBe(0.5);
          expect(rest?.runs.every((run) => typeof run.font === "string" && run.font !== "")).toBe(
            true,
          );

          // A uniform scale sets the size as drawn; a rotation, SVG, decoration, and a folio stay drawn.
          expect(
            (slide?.boxes ?? []).find((box) => box.runs[0]?.text === "倍の字")?.runs[0]?.size,
          ).toBe(40);
          for (const pictured of ["回った字", "図の字", "飾りの字", "01"]) {
            expect(lines.join("|")).not.toContain(pictured);
          }

          for (const box of slide?.boxes ?? []) {
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.y).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(1280);
            expect(box.y + box.height).toBeLessThanOrEqual(720);
          }
          expect(slide?.description).toBe("a sketch / a photo of the venue");

          const files = readZip(readFileSync(outPath));
          const png = files.get("ppt/media/image1.png") ?? new Uint8Array();
          expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
          // Drawn at twice the slide's size.
          const view = new DataView(png.buffer, png.byteOffset);
          expect([view.getUint32(16), view.getUint32(20)]).toEqual([2560, 1440]);
          const notes = new TextDecoder().decode(files.get("ppt/notesSlides/notesSlide1.xml"));
          expect(notes).toContain("最初の段落です。");
          expect(notes).toContain("舞台の指示。");
          expect(notes).toContain("次の段落です。");
        },
      );
    },
  );

  browserTest("leaves the stage directions out of the notes of a file built --public", async () => {
    await withTempProject(
      {
        decks: [{ name: "handout", script, theme, slides: { cover }, assets: { "a.png": "png" } }],
      },
      async (root) => {
        const { outPath } = await pptxDeck(join(root, "decks", "handout"), {
          runner,
          public: true,
        });
        const notes = new TextDecoder().decode(
          readZip(readFileSync(outPath)).get("ppt/notesSlides/notesSlide1.xml"),
        );
        expect(notes).toContain("最初の段落です。");
        expect(notes).not.toContain("舞台の指示。");
      },
    );
  });

  // What CI keeps checking without PowerPoint: on every sample slide, the boxes carry the
  // slide's HTML text, each character once, and stay inside the frame.
  browserTest(
    "carries every sample slide's text once, inside the frame",
    async () => {
      const samples = join(import.meta.dir, "..", "..", "sample", "decks");
      const parser = new new Window().DOMParser();
      for (const name of readdirSync(samples)) {
        seen.length = 0;
        const { deck } = resolveDeck(join(samples, name));
        const { outPath } = await pptxDeck(join(samples, name), { runner });
        const files = readZip(readFileSync(outPath));
        expect(seen).toHaveLength(deck.deck.sections.length);
        for (const [index, slide] of seen.entries()) {
          for (const box of slide.boxes) {
            expect({
              slide: slide.slug,
              inside:
                box.x >= -1 &&
                box.y >= -1 &&
                box.x + box.width <= 1281 &&
                box.y + box.height <= 721,
            }).toEqual({ slide: slide.slug, inside: true });
          }
          const xml = new TextDecoder().decode(files.get(`ppt/slides/slide${index + 1}.xml`));
          const doc = parser.parseFromString(xml, "application/xml");
          expect(doc.querySelector("parsererror")).toBeNull();
          const written = [...doc.getElementsByTagName("a:t")].map((t) => t.textContent).join("");
          const measured = slide.boxes.flatMap((box) => box.runs.map((run) => run.text)).join("");
          expect(written).toBe(measured);
        }
      }
      // 42 slides drawn at twice their size; a CI runner is slower than a laptop.
    },
    120_000,
  );
});
