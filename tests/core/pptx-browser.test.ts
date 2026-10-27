import { describe, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import {
  type PlaywrightRunner,
  type PptxPictureFile,
  type PptxResponse,
  playwrightResolved,
  type VisualRequest,
} from "../../src/core/playwright.ts";
import { runVisualRequest } from "../../src/core/playwright-visual.ts";
import { pptxDeck } from "../../src/core/pptx.ts";
import type { PptxLayer, PptxTextBox } from "../../src/core/pptx-package.ts";
import { measurePptxTextsInPage } from "../../src/core/pptx-text.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { logicalSize } from "../../src/core/size.ts";
import { lastStop } from "../../src/core/step.ts";
import { loadSlideSources, renderSlideHtml } from "../../src/core/still-page.ts";
import { serialBrowserTest, sharedBrowser } from "../helpers/browser.ts";
import { withTempProject } from "../helpers/project.ts";
import { readZip } from "../helpers/zip.ts";

// A PPTX in a real Chromium: where the text is laid out, line by line, and the picture without it.
const skip = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
const browserTest = serialBrowserTest(skip);
const withBrowser = sharedBrowser();

type Seen = PptxResponse["slides"][number] & { boxes: PptxTextBox[] };

/** Every text layer, those in shapes' groups included, in order. */
function textLayers(layers: PptxLayer<PptxPictureFile>[]): PptxTextBox[] {
  return layers.flatMap((layer) =>
    layer.kind === "text" ? [layer] : layer.kind === "shape" ? textLayers(layer.layers) : [],
  );
}

/** The worker's work in one shared browser, recording what each slide came back as. */
const seen: Seen[] = [];
const runner: PlaywrightRunner = async (request: VisualRequest) => {
  const response = await withBrowser((browser) => runVisualRequest(browser, request));
  if (request.kind === "pptx") {
    seen.push(
      ...(response as PptxResponse).slides.map((slide) => ({
        ...slide,
        boxes: textLayers(slide.layers),
      })),
    );
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

const shapedScript = `---
title: Shaped
lang: ja
---

## cards

カードの台本。
`;

const shapedTheme = `.slide { position: relative; width: 1280px; height: 720px; font-family: sans-serif; color: rgb(20 20 20); background: rgb(250 250 250); }
.slide .card { position: absolute; left: 80px; top: 80px; width: 400px; padding: 24px; background: rgb(240 240 240); border: 2px solid rgb(200 200 200); border-radius: 12px; }
.slide .card h3 { margin: 8px 0 0; font-size: 28px; line-height: 36px; }
.slide .card p { margin: 12px 0 0; font-size: 20px; line-height: 32px; }
.slide .card ul { margin: 8px 0 0; padding-left: 24px; font-size: 20px; line-height: 32px; }
.slide .icon { display: block; width: 40px; height: 40px; color: rgb(26 127 55); }
.slide .marked { position: absolute; left: 560px; top: 80px; width: 280px; padding: 16px; background: rgb(230 240 255); font-size: 20px; }
.slide .hi { background: linear-gradient(transparent 50%, rgb(255 230 0) 50%); }
.slide .covered { position: absolute; left: 900px; top: 80px; width: 280px; padding: 16px; background: rgb(255 240 230); font-size: 20px; }
.slide .covered::after { content: "★"; position: absolute; right: 8px; top: 8px; }
.slide .grid { position: absolute; left: 80px; top: 420px; display: grid; grid-template-columns: 200px 120px; gap: 4px; }
.slide .grid > div { box-sizing: border-box; height: 64px; display: flex; align-items: center; padding: 0 16px; background: rgb(235 235 235); font-size: 20px; }
.slide .grid > .mark { justify-content: center; }
.slide .lede { position: absolute; left: 560px; top: 420px; margin: 0; font-size: 24px; }
.slide .chip { display: inline-block; padding: 4px 12px; border-radius: 999px; background: rgb(20 20 20); color: rgb(255 255 255); }
.slide .venue { position: absolute; left: 560px; top: 520px; width: 120px; height: 80px; }
`;

const shapedSlide = `<section class="slide">
  <div class="card">
    <svg class="icon" viewBox="0 0 10 10" aria-label="a check mark"><path d="M1 5 L4 8 L9 2" fill="currentColor"/></svg>
    <h3>見出し</h3>
    <p>本文は一行に収まらないほど長いので、二行目に折り返す。</p>
    <ul><li>一つ目</li><li>二つ目</li></ul>
  </div>
  <p class="marked">ここに<span class="hi">蛍光ペンの字</span>がある。</p>
  <p class="covered">星が描かれる箱。</p>
  <div class="grid"><div>業務設計</div><div class="mark">○</div><div>移行</div><div class="mark">△</div></div>
  <p class="lede">dek は <span class="chip">台本</span> を先に書く。</p>
  <img class="venue" src="assets/venue.svg" alt="the venue">
</section>
`;

const SHAPED_TEXT =
  "見出し本文は一行に収まらないほど長いので、二行目に折り返す。一つ目二つ目ここに蛍光ペンの字がある。星が描かれる箱。業務設計○移行△dek は台本を先に書く。";

const VENUE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 8"><rect width="12" height="8" fill="#5b9bd5"/></svg>';

const edgeTheme = `.slide { position: relative; width: 1280px; height: 720px; font-family: sans-serif; color: rgb(20 20 20); background: rgb(250 250 250); }
.slide .fading { position: absolute; left: 40px; top: 40px; width: 200px; height: 80px; background: rgb(255 10 10); transition: background-color 3s linear, border-color 3s linear; }
.slide .away { position: absolute; left: 1400px; top: 40px; width: 120px; height: 80px; }
.slide .half { position: absolute; left: -60px; top: 160px; width: 120px; height: 80px; }
.slide .framed { position: absolute; left: 1000px; top: 600px; width: 120px; height: 80px; outline: 4px solid rgb(0 0 255); }
.slide .holder { position: absolute; left: 300px; top: 40px; width: 200px; height: 80px; background: rgb(200 230 200); }
.slide .turned { position: absolute; left: 560px; top: 40px; width: 200px; height: 80px; background: rgb(200 200 230); rotate: 30deg; }
.slide .oval { position: absolute; left: 820px; top: 40px; width: 200px; height: 100px; background: rgb(230 200 200); border-radius: 50%; }
.slide .note { position: absolute; left: 40px; top: 300px; width: 520px; padding: 16px; background: rgb(240 240 240); font-size: 20px; line-height: 32px; }
.slide .note p { margin: 0; }
.slide .note mark { background: rgb(255 230 0); color: inherit; }
.slide .lines { position: absolute; left: 640px; top: 300px; width: 400px; padding: 16px; background: rgb(240 240 240); font-size: 20px; line-height: 32px; }
.slide .lines p { margin: 0; white-space: pre-line; }
.slide svg { position: absolute; top: 500px; width: 60px; height: 60px; }
.slide .bare { left: 40px; color: rgb(26 127 55); }
.slide .padded { left: 140px; padding: 10px; }
.slide .moved { left: 240px; }
.slide .moved circle { transform: scale(0.5); }
.slide .ground { left: 340px; background: rgb(255 250 200); }
`;

const edgeSlide = `<section class="slide">
  <div class="fading"></div>
  <img class="away" src="assets/venue.svg" alt="away">
  <img class="half" src="assets/venue.svg" alt="half">
  <img class="framed" src="assets/venue.svg" alt="framed">
  <div class="holder"><x-badge>影の中</x-badge></div>
  <div class="turned"></div>
  <div class="oval"></div>
  <div class="note"><p>Use <mark>npm install</mark> to start and keep going.</p></div>
  <div class="lines"><p>一行目
二行目
三行目</p></div>
  <svg class="bare" viewBox="0 0 10 10" aria-label="bare" onload="alert(1)"><script>alert(2)</script><circle cx="5" cy="5" r="4" fill="currentColor" onclick="alert(3)"/></svg>
  <svg class="padded" viewBox="0 0 10 10" aria-label="padded"><circle cx="5" cy="5" r="4"/></svg>
  <svg class="moved" viewBox="0 0 10 10" aria-label="moved"><circle cx="5" cy="5" r="4"/></svg>
  <svg class="ground" viewBox="0 0 10 10" aria-label="ground"><circle cx="5" cy="5" r="4"/></svg>
</section>
`;

const themedScript = `---
title: Themed
lang: ja
---

## cover

表紙。

## fade

背景の移り変わり。
`;

const themedTheme = `.slide { --fg: rgb(20 20 20); --bg: rgb(250 248 240); --muted: rgb(225 225 215); --accent: rgb(200 60 0); --font-title: sans-serif; --font-body: serif; position: relative; width: 1280px; height: 720px; margin: 0; padding: 0; background: var(--bg); color: var(--fg); font-family: var(--font-body); }
.slide h2 { position: absolute; left: 80px; top: 60px; margin: 0; font-family: var(--font-title); font-size: 48px; line-height: 60px; }
.slide .card { position: absolute; left: 80px; top: 200px; width: 400px; padding: 24px; background: var(--muted); border-radius: 12px; }
.slide .card p { margin: 0; font-size: 24px; line-height: 36px; }
.slide.fade { background: linear-gradient(to right, rgb(250 248 240), rgb(200 220 255)); }
.slide .drawn { position: absolute; left: 600px; top: 200px; width: 200px; height: 100px; background: linear-gradient(rgb(255 0 0), rgb(0 0 255)); }
`;

const themedCover = `<section class="slide">
  <h2>テーマの色</h2>
  <div class="card"><p>カードの字。</p></div>
</section>
`;

const themedFade = `<section class="slide fade">
  <h2>移り変わる地</h2>
  <div class="drawn"></div>
</section>
`;

/** The color of a pixel of a PNG, as the browser decodes it. */
async function pixel(png: Uint8Array, x: number, y: number): Promise<number[]> {
  const page = await withBrowser((browser) => browser.newPage());
  try {
    return await page.evaluate(
      async ({ src, x, y }) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const paint = canvas.getContext("2d");
        paint?.drawImage(image, 0, 0);
        return [...(paint?.getImageData(x, y, 1, 1).data ?? [])];
      },
      { src: `data:image/png;base64,${Buffer.from(png).toString("base64")}`, x, y },
    );
  } finally {
    await page.close();
  }
}

/** Every layer, those in shapes' groups included, in the order written. */
function allLayers(layers: PptxLayer<PptxPictureFile>[]): PptxLayer<PptxPictureFile>[] {
  return layers.flatMap((layer) =>
    layer.kind === "shape" ? [layer, ...allLayers(layer.layers)] : [layer],
  );
}

/**
 * The characters a slide's page measures, line by line, as the text a file must carry: drawn
 * on a page of its own, apart from what the file makes of it, sorted.
 */
async function measuredInk(html: string, size: { width: number; height: number }): Promise<string> {
  const page = await withBrowser((browser) => browser.newPage());
  try {
    await page.setViewportSize(size);
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const { boxes } = await page.evaluate(measurePptxTextsInPage);
    return [...ink(boxes.flatMap((box) => box.runs.map((run) => run.text)).join(""))]
      .sort()
      .join("");
  } finally {
    await page.close();
  }
}

/** Text without its white space. */
function ink(text: string): string {
  return text.replace(/\s+/g, "");
}

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
          // The photo is a picture of its own, with its alternative text; the slide's says the rest.
          expect(slide?.description).toBe("a sketch");
          expect(
            slide?.layers.find(
              (layer) => layer.kind === "picture" && layer.description === "a photo of the venue",
            ),
          ).toBeDefined();

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

  browserTest(
    "lays plain boxes, pictures, and their text over the picture with --shapes",
    async () => {
      await withTempProject(
        {
          decks: [
            {
              name: "shaped",
              script: shapedScript,
              theme: shapedTheme,
              slides: { cards: shapedSlide },
              assets: { "venue.svg": VENUE },
            },
          ],
        },
        async (root) => {
          seen.length = 0;
          const { outPath } = await pptxDeck(join(root, "decks", "shaped"), { runner });
          const [slide] = seen;
          const layers = slide?.layers ?? [];
          const shapes = layers.filter((layer) => layer.kind === "shape");

          // A plain card is a shape, its icon a picture in its group, its text the shape's.
          const card = shapes.find((shape) => shape.x === 80 && shape.y === 80);
          expect(card).toMatchObject({
            width: 452,
            fill: { color: [240, 240, 240], alpha: 1 },
            outline: { width: 2, paint: { color: [200, 200, 200], alpha: 1 } },
            radius: 12,
          });
          expect(card?.text?.paragraphs.map((p) => p.runs.map((run) => run.text).join(""))).toEqual(
            [
              "見出し",
              "本文は一行に収まらないほど長いので、二行目に折り返す。",
              "一つ目",
              "二つ目",
            ],
          );
          expect(card?.text?.paragraphs.map((p) => p.bullet)).toEqual([
            undefined,
            undefined,
            { char: "•" },
            { char: "•" },
          ]);
          expect(card?.text?.wrap).toBe(true);
          const icon = card?.layers.find((layer) => layer.kind === "picture");
          expect(icon).toMatchObject({ width: 40, height: 40, description: "a check mark" });
          // The theme's currentColor is written into the SVG as the color it was.
          expect(icon?.kind === "picture" && icon.svg).toContain('fill="rgb(26, 127, 55)"');
          expect(icon?.kind === "picture" && icon.svg).not.toContain("class=");

          // A card with a gradient highlight inside, and one a pseudo-element draws in, stay drawn.
          expect(shapes.find((shape) => shape.x === 560)).toBeUndefined();
          expect(shapes.find((shape) => shape.x === 900)).toBeUndefined();
          expect(slide?.boxes.map((box) => box.runs.map((run) => run.text).join(""))).toContain(
            "ここに蛍光ペンの字がある。",
          );

          // A grid of cells is a shape a cell, each one line where the cell set it.
          const cells = shapes.filter((shape) => shape.y >= 420 && shape.x < 500);
          expect(cells).toHaveLength(4);
          for (const cell of cells) {
            expect(cell.text?.wrap).toBe(false);
            // Centered top to bottom by the flexbox: 64px of cell, a line box of 30px or so.
            expect(cell.text?.inset.top).toBeGreaterThan(14);
          }
          expect(cells.map((cell) => cell.text?.paragraphs[0]?.align)).toEqual([
            "left",
            "center",
            "left",
            "center",
          ]);
          expect(cells.map((cell) => cell.text?.paragraphs[0]?.runs[0]?.text)).toEqual([
            "業務設計",
            "○",
            "移行",
            "△",
          ]);

          // A chip is a shape of its own; the image a picture with its alternative text.
          const chip = shapes.find((shape) => shape.text?.paragraphs[0]?.runs[0]?.text === "台本");
          expect(chip?.radius).toBeGreaterThan(0);
          const venue = layers.find((layer) => layer.kind === "picture");
          expect(venue).toMatchObject({ description: "the venue" });
          expect(slide?.description).not.toContain("the venue");

          // The icon drawn alone on a transparent ground, at twice its size: an RGBA PNG.
          const files = readZip(readFileSync(outPath));
          const media = [...files.keys()].filter((name) =>
            /^ppt\/media\/image\d+\.png$/.test(name),
          );
          expect(media.length).toBe(3);
          expect([...files.keys()].filter((name) => name.endsWith(".svg"))).toHaveLength(1);
          const parser = new new Window().DOMParser();
          const read = (name: string) =>
            parser.parseFromString(new TextDecoder().decode(files.get(name)), "application/xml");
          const doc = read("ppt/slides/slide1.xml");
          expect(doc.querySelector("parsererror")).toBeNull();
          const checked = [...doc.getElementsByTagName("p:pic")].find(
            (pic) =>
              pic.getElementsByTagName("p:cNvPr")[0]?.getAttribute("descr") === "a check mark",
          );
          const embed = checked?.getElementsByTagName("a:blip")[0]?.getAttribute("r:embed");
          const target = [
            ...read("ppt/slides/_rels/slide1.xml.rels").getElementsByTagName("Relationship"),
          ]
            .find((rel) => rel.getAttribute("Id") === embed)
            ?.getAttribute("Target");
          const png = files.get(`ppt/media/${target?.split("/").pop()}`) ?? new Uint8Array();
          const view = new DataView(png.buffer, png.byteOffset);
          expect([view.getUint32(16), view.getUint32(20), png[25]]).toEqual([80, 80, 6]);

          // The text written is the text the slide shows, each character once.
          const written = [...doc.getElementsByTagName("a:t")].map((t) => t.textContent).join("");
          expect([...ink(written)].sort()).toEqual([...ink(SHAPED_TEXT)].sort());
        },
      );
    },
  );

  browserTest(
    "keeps in the picture what --shapes cannot lay over as the browser drew it, and takes out what it lays",
    async () => {
      await withTempProject(
        {
          decks: [
            {
              name: "edges",
              script: shapedScript,
              theme: edgeTheme,
              slides: { cards: edgeSlide },
              assets: { "venue.svg": VENUE },
            },
          ],
        },
        async (root) => {
          seen.length = 0;
          const { outPath } = await pptxDeck(join(root, "decks", "edges"), { runner });
          const [slide] = seen;
          const layers = allLayers(slide?.layers ?? []);
          const shapes = layers.filter((layer) => layer.kind === "shape");
          const pictures = layers.filter((layer) => layer.kind === "picture");
          const at = (x: number, y: number) =>
            shapes.find((shape) => Math.abs(shape.x - x) < 1 && Math.abs(shape.y - y) < 1);

          // A box with a transition is a shape, and taken out of the picture at once, not
          // halfway through fading: with the slide's background PowerPoint's, nothing is there.
          expect(at(40, 40)).toMatchObject({ fill: { color: [255, 10, 10] } });
          expect(slide?.background).toEqual({
            kind: "solid",
            paint: { color: [250, 250, 250], alpha: 1 },
          });
          const files = readZip(readFileSync(outPath));
          const picture = files.get("ppt/media/image1.png") ?? new Uint8Array();
          expect(await pixel(picture, 2 * 50, 2 * 50)).toEqual([0, 0, 0, 0]);

          // A picture the slide cuts stays drawn; one with an outline is a picture with it.
          const described = pictures.map((layer) => layer.kind === "picture" && layer.description);
          expect(described).not.toContain("away");
          expect(described).not.toContain("half");
          expect(
            pictures.find((layer) => layer.kind === "picture" && layer.description === "framed"),
          ).toMatchObject({ x: 996, y: 596, width: 128, height: 88 });

          // What a custom element may draw in its shadow root, a rotation, and an ellipse stay drawn.
          expect(at(300, 40)).toBeUndefined();
          expect(shapes.find((shape) => shape.y === 40 && shape.x > 500)).toBeUndefined();

          // The text over a highlight in its line is laid over the highlight.
          const note = at(40, 300);
          const inNote = note?.kind === "shape" ? note.layers : [];
          const mark = inNote.findIndex((layer) => layer.kind === "shape");
          const words = inNote.findIndex(
            (layer) =>
              layer.kind === "text" && layer.runs.some((run) => run.text === "npm install"),
          );
          expect(mark).toBeGreaterThanOrEqual(0);
          expect(words).toBeGreaterThan(mark);

          // `pre-line` keeps each newline as a break in the shape's paragraph.
          const lines = at(640, 300);
          expect(
            lines?.kind === "shape" &&
              lines.text?.paragraphs.map((p) => p.runs.map((run) => run.text).join("")),
          ).toEqual(["一行目\n二行目\n三行目"]);

          // An SVG file carries nothing that runs, and only what its attributes can say.
          const svg = (name: string) => {
            const found = pictures.find(
              (layer) => layer.kind === "picture" && layer.description === name,
            );
            return found?.kind === "picture" ? found.svg : "missing";
          };
          expect(svg("bare")).toContain('fill="rgb(26, 127, 55)"');
          expect(svg("bare")).not.toMatch(/script|onload|onclick|data-dek-pptx/);
          expect(svg("padded")).toBeUndefined();
          expect(svg("moved")).toBeUndefined();
          expect(svg("ground")).toContain('fill="rgb(255, 250, 200)"');
        },
      );
    },
  );

  browserTest(
    "makes the deck's tokens PowerPoint's theme, and its backgrounds PowerPoint's, with --shapes",
    async () => {
      await withTempProject(
        {
          decks: [
            {
              name: "themed",
              script: themedScript,
              theme: themedTheme,
              slides: { cover: themedCover, fade: themedFade },
            },
          ],
        },
        async (root) => {
          seen.length = 0;
          const { outPath } = await pptxDeck(join(root, "decks", "themed"), { runner });
          const files = readZip(readFileSync(outPath));
          const parser = new new Window().DOMParser();
          const read = (name: string) =>
            parser.parseFromString(new TextDecoder().decode(files.get(name)), "application/xml");

          // The theme's slots are the tokens; its fonts the faces the font tokens drew in.
          const theme = read("ppt/theme/theme1.xml");
          const slot = (name: string) =>
            theme
              .getElementsByTagName(name)[0]
              ?.getElementsByTagName("a:srgbClr")[0]
              ?.getAttribute("val");
          expect(["a:dk1", "a:lt1", "a:dk2", "a:accent1"].map(slot)).toEqual([
            "141414",
            "FAF8F0",
            "E1E1D7",
            "C83C00",
          ]);
          for (const font of ["a:majorFont", "a:minorFont"]) {
            const latin = theme.getElementsByTagName(font)[0]?.getElementsByTagName("a:latin")[0];
            expect(latin?.getAttribute("typeface")).not.toBe("");
          }

          // The cover: everything is laid over, on the theme's background: no picture is left.
          const cover = read("ppt/slides/slide1.xml");
          expect(cover.getElementsByTagName("p:bg")).toHaveLength(0);
          expect(
            [...cover.getElementsByTagName("p:cNvPr")].map((el) => el.getAttribute("name")),
          ).not.toContain("Slide");
          expect(files.has("ppt/media/image1.png")).toBe(false);
          const card = [...cover.getElementsByTagName("p:sp")].find(
            (sp) => sp.getElementsByTagName("a:prstGeom")[0]?.getAttribute("prst") === "roundRect",
          );
          expect(
            card
              ?.getElementsByTagName("p:spPr")[0]
              ?.getElementsByTagName("a:schemeClr")[0]
              ?.getAttribute("val"),
          ).toBe("tx2");
          const faces = [...cover.getElementsByTagName("a:rPr")].map((rPr) =>
            rPr.getElementsByTagName("a:latin")[0]?.getAttribute("typeface"),
          );
          expect(faces).toContain("+mj-lt");
          expect(faces).toContain("+mn-lt");
          expect(
            cover
              .getElementsByTagName("a:rPr")[0]
              ?.getElementsByTagName("a:schemeClr")[0]
              ?.getAttribute("val"),
          ).toBe("tx1");

          // The fade: its gradient is the slide's background; what stays drawn is in a picture
          // on nothing.
          const fade = read("ppt/slides/slide2.xml");
          const gradient = fade
            .getElementsByTagName("p:bg")[0]
            ?.getElementsByTagName("a:gradFill")[0];
          expect(gradient?.getElementsByTagName("a:lin")[0]?.getAttribute("ang")).toBe("0");
          expect(
            gradient
              ?.getElementsByTagName("a:gs")[0]
              ?.getElementsByTagName("a:schemeClr")[0]
              ?.getAttribute("val"),
          ).toBe("bg1");
          const picture = files.get("ppt/media/image2.png") ?? new Uint8Array();
          expect(picture[25]).toBe(6);
          expect((await pixel(picture, 2 * 40, 2 * 400))[3]).toBe(0);
          expect((await pixel(picture, 2 * 700, 2 * 250))[3]).toBe(255);
          // The background's colors are PowerPoint's now, not the picture's.
          expect(seen[1]?.background?.kind).toBe("linear");
        },
      );
    },
  );

  // What CI keeps checking without PowerPoint: on every sample slide, the file carries the text
  // the page measures, line by line, each character once, in shapes' paragraphs or in text boxes
  // inside the frame.
  browserTest(
    "carries every sample slide's text once, its text boxes inside the frame",
    async () => {
      const samples = join(import.meta.dir, "..", "..", "sample", "decks");
      const parser = new new Window().DOMParser();
      for (const name of readdirSync(samples)) {
        seen.length = 0;
        const resolved = resolveDeck(join(samples, name));
        const { outPath } = await pptxDeck(join(samples, name), { runner });
        const files = readZip(readFileSync(outPath));
        const sources = loadSlideSources(resolved.deck, { strict: true });
        expect(seen).toHaveLength(resolved.deck.deck.sections.length);
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
          const section = resolved.deck.deck.sections[index];
          const measured = await measuredInk(
            renderSlideHtml(sources, slide.slug, lastStop(section?.beats ?? [])),
            logicalSize(resolved.deck.deck.ratio),
          );
          const xml = new TextDecoder().decode(files.get(`ppt/slides/slide${index + 1}.xml`));
          const doc = parser.parseFromString(xml, "application/xml");
          expect(doc.querySelector("parsererror")).toBeNull();
          const written = [...doc.getElementsByTagName("a:t")].map((t) => t.textContent).join("");
          expect({ slide: slide.slug, text: [...ink(written)].sort().join("") }).toEqual({
            slide: slide.slug,
            text: measured,
          });
        }
      }
      // 42 slides drawn at twice their size; a CI runner is slower than a laptop.
    },
    240_000,
  );
});
