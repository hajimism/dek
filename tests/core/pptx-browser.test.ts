import { describe, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { compareInPage } from "../../evals/pptx/compare.ts";
import {
  type PlaywrightRunner,
  type PptxPictureFile,
  type PptxResponse,
  playwrightResolved,
  type VisualRequest,
} from "../../src/core/playwright.ts";
import { runVisualRequest } from "../../src/core/playwright-visual.ts";
import { pptxDeck } from "../../src/core/pptx.ts";
import type { PptxLayer, PptxProse, PptxTextBox } from "../../src/core/pptx-package.ts";
import { measurePptxPaintInPage, PPTX_PSEUDO_ATTR } from "../../src/core/pptx-paint.ts";
import {
  measurePptxGlyphsInPage,
  measurePptxPlainLinesInPage,
  measurePptxTextsInPage,
} from "../../src/core/pptx-text.ts";
import { pptxTypeRequests, scriptOf, setPptxTexts } from "../../src/core/pptx-type.ts";
import { pseudoTextPieces } from "../../src/core/pseudo-text.ts";
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

/** Every text box of a block's, those in shapes' groups included, in order. */
function proseLayers(layers: PptxLayer<PptxPictureFile>[]): PptxProse[] {
  return layers.flatMap((layer) =>
    layer.kind === "prose" ? [layer] : layer.kind === "shape" ? proseLayers(layer.layers) : [],
  );
}

/** What a text box of a block's says, its paragraphs joined by a line break. */
function said(prose: PptxProse | undefined): string {
  return (prose?.text.paragraphs ?? [])
    .map((paragraph) => paragraph.runs.map((run) => run.text).join(""))
    .join("\n");
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

// What the slide says, the star its pseudo-element writes included.
const SHAPED_TEXT =
  "見出し本文は一行に収まらないほど長いので、二行目に折り返す。一つ目二つ目ここに蛍光ペンの字がある。星が描かれる箱。★業務設計○移行△dek は台本を先に書く。";

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
    // As the worker measures it: what the pseudo-elements write is text too.
    const paint = await page.evaluate(measurePptxPaintInPage);
    const keys = new Map(paint.pseudos.map((each) => [`${each.host}::${each.pseudo}`, each.key]));
    const pieces = (await pseudoTextPieces(page, PPTX_PSEUDO_ATTR)).flatMap((piece) => {
      const key = keys.get(`${piece.host}::${piece.pseudo}`);
      return key ? [{ ...piece, key }] : [];
    });
    const { boxes } = await page.evaluate(measurePptxTextsInPage, pieces);
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

          // The heading wraps in the browser: it is one text box, the slide's title, broken
          // where the browser broke it.
          const proses = proseLayers(slide?.layers ?? []);
          const heading = proses.find((prose) => prose.title);
          expect(said(heading).replace(/\n/g, "")).toBe("台本から、発表まで書き切る道具");
          expect(said(heading)).toContain("\n");
          expect(heading?.text.paragraphs[0]?.runs[0]?.size).toBe(64);

          // A chip's padding sets it apart; an ideographic space is kept as written.
          expect(lines).toContain("dek は　");
          expect(lines).toContain("台本");
          const rest = (slide?.boxes ?? []).find((box) =>
            box.runs.some((run) => run.text === "太字"),
          );
          const joined = (runs: PptxTextBox["runs"] | undefined) =>
            (runs ?? []).map((run) => run.text).join("");
          expect(joined(rest?.runs)).toBe("を先に書く。太字と薄い字とLOUD。");
          expect(joined(rest?.runs.filter((run) => run.bold))).toBe("太字");
          expect(joined(rest?.runs.filter((run) => run.alpha === 0.5))).toBe("薄い字");
          expect(rest?.runs.every((run) => typeof run.font === "string" && run.font !== "")).toBe(
            true,
          );

          // A uniform scale sets the size as drawn; a rotation, SVG, and decoration stay drawn.
          const all = [...lines, ...proses.map(said)];
          expect(
            proses.find((prose) => said(prose) === "倍の字")?.text.paragraphs[0]?.runs[0]?.size,
          ).toBe(40);
          for (const pictured of ["回った字", "図の字", "飾りの字"]) {
            expect(all.join("|")).not.toContain(pictured);
          }
          // What the slide's `::after` writes, a folio, is text too.
          expect(lines).toContain("01");

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
          const paragraphs = card?.text?.paragraphs.map((p) =>
            p.runs.map((run) => run.text).join(""),
          );
          expect(paragraphs?.map((text) => text.replace(/\n/g, ""))).toEqual([
            "見出し",
            "本文は一行に収まらないほど長いので、二行目に折り返す。",
            "一つ目",
            "二つ目",
          ]);
          // The paragraph the browser wrapped is broken where it broke it, and nowhere else.
          expect(paragraphs?.map((text) => text.split("\n").length)).toEqual([1, 2, 1, 1]);
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

          // A card with a gradient highlight inside stays drawn. One a pseudo-element only
          // writes in is a shape: what it writes is text, laid over it.
          expect(shapes.find((shape) => shape.x === 560)).toBeUndefined();
          expect(shapes.find((shape) => shape.x === 900)).toMatchObject({
            fill: { color: [255, 240, 230], alpha: 1 },
          });
          expect(
            textLayers(layers).map((box) => box.runs.map((run) => run.text).join("")),
          ).toContain("★");
          expect(proseLayers(layers).map(said)).toContain("ここに蛍光ペンの字がある。");

          // A grid of cells is a shape a cell, each one line where the cell set it.
          const cells = shapes.filter((shape) => shape.y >= 420 && shape.x < 500);
          expect(cells).toHaveLength(4);
          for (const cell of cells) {
            // A cell with room past its one line wraps what is typed into it.
            expect(cell.text?.wrap).toBe(true);
            // Centered top to bottom by the flexbox: 64px of cell, a line box of 30px or so.
            expect(cell.text?.inset.top).toBeGreaterThan(14);
          }
          expect(cells.map((cell) => cell.text?.paragraphs[0]?.align)).toEqual([
            "left",
            "center",
            "left",
            "center",
          ]);
          expect(
            cells.map((cell) => cell.text?.paragraphs[0]?.runs.map((run) => run.text).join("")),
          ).toEqual(["業務設計", "○", "移行", "△"]);

          // A chip is a shape of its own; the image a picture with its alternative text.
          const chip = allLayers(layers).find(
            (layer) =>
              layer.kind === "shape" &&
              layer.text?.paragraphs[0]?.runs.map((run) => run.text).join("") === "台本",
          );
          expect(chip?.kind === "shape" && chip.radius).toBeGreaterThan(0);
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

  browserTest(
    "sets a block a text box: a code block's lines, a heading the title, a list, a folio",
    async () => {
      const typedScript = `---
title: Typed
lang: ja
---

## code

コード。

## list

リスト。
`;
      const typedTheme = `.slide { position: relative; width: 1280px; height: 720px; font-family: sans-serif; color: rgb(20 20 20); background: rgb(250 250 250); counter-reset: n 7; }
.slide h2 { position: absolute; left: 80px; top: 60px; margin: 0; font-size: 40px; line-height: 52px; }
.slide pre { position: absolute; left: 80px; top: 160px; width: 600px; margin: 0; font-size: 20px; line-height: 32px; white-space: pre-wrap; }
.slide .words { position: absolute; left: 80px; top: 400px; width: 600px; margin: 0; font-size: 24px; line-height: 36px; }
.slide ul { position: absolute; left: 80px; top: 160px; width: 600px; margin: 0; padding-left: 28px; font-size: 24px; line-height: 36px; }
.slide::after { content: counter(n, decimal-leading-zero) " / 12"; position: absolute; right: 60px; bottom: 40px; font-size: 18px; }
`;
      // Each line of the code ends in a text node that is a line break and nothing else.
      const code = `<section class="slide">
  <h2>コードの行</h2>
<pre><span>$ run</span>
<span>{</span>
<span>"ok"</span>: true
<span>}</span></pre>
  <p class="words"><b>Bold</b> <i>Italic</i></p>
</section>
`;
      const list = `<section class="slide">
  <h2>リストは一つ</h2>
  <ul><li>一つ目</li><li>二つ目</li><li>三つ目</li></ul>
</section>
`;
      await withTempProject(
        {
          decks: [
            { name: "typed", script: typedScript, theme: typedTheme, slides: { code, list } },
          ],
        },
        async (root) => {
          seen.length = 0;
          const { outPath } = await pptxDeck(join(root, "decks", "typed"), { runner });
          const [first, second] = seen;
          const texts = proseLayers(first?.layers ?? []).map(said);
          // The breaks `white-space` keeps are in the text, and so is the space between two
          // elements set side by side.
          expect(texts).toContain('$ run\n{\n"ok": true\n}');
          expect(texts).toContain("Bold Italic");
          // The heading is the slide's title; what `::after` writes is text, its counter counted.
          expect(said(proseLayers(first?.layers ?? []).find((prose) => prose.title))).toBe(
            "コードの行",
          );
          for (const slide of [first, second]) {
            expect(slide?.boxes.map((box) => box.runs.map((run) => run.text).join(""))).toContain(
              "07 / 12",
            );
          }
          // A list is one text box, an item a paragraph, its markers PowerPoint's bullets.
          const items = proseLayers(second?.layers ?? []).find((prose) =>
            said(prose).startsWith("一つ目"),
          );
          expect(said(items)).toBe("一つ目\n二つ目\n三つ目");
          expect(items?.text.paragraphs.map((paragraph) => paragraph.bullet)).toEqual([
            { char: "•" },
            { char: "•" },
            { char: "•" },
          ]);

          const files = readZip(readFileSync(outPath));
          const slide1 = new TextDecoder().decode(files.get("ppt/slides/slide1.xml"));
          expect(slide1).toContain('<p:ph type="title"/>');
          expect(slide1.match(/<a:br>/g)).toHaveLength(3);
          expect(new TextDecoder().decode(files.get("ppt/slides/_rels/slide1.xml.rels"))).toContain(
            "slideLayout2.xml",
          );
          // Nothing of the folio or the bullets is left for the picture to draw: none is kept.
          expect(first?.picture).toBe(false);
          expect(second?.picture).toBe(false);
        },
      );
    },
  );

  browserTest(
    "names the face that drew a run's Latin and the one that drew its East Asian text",
    async () => {
      const stack = 'Menlo, "DejaVu Sans Mono", "Courier New", monospace';
      const facedTheme = `.slide { position: relative; width: 1280px; height: 720px; color: rgb(20 20 20); background: rgb(250 250 250); }
.slide .mixed { position: absolute; left: 80px; top: 80px; margin: 0; font-family: ${stack}; font-size: 32px; line-height: 48px; }
`;
      const faced = `<section class="slide"><p class="mixed">code 台本</p></section>\n`;
      // What Chromium draws each script in, asked on a page of its own, apart from the exporter.
      const drawn = await withBrowser(async (browser) => {
        const page = await browser.newPage();
        try {
          await page.setContent(
            `<!doctype html><html lang="ja"><body style='font-family: ${stack}'><span id="latin">code</span><span id="east">台本</span></body></html>`,
            { waitUntil: "load" },
          );
          const cdp = await page.context().newCDPSession(page);
          await cdp.send("DOM.enable");
          await cdp.send("CSS.enable");
          const { root } = (await cdp.send("DOM.getDocument", { depth: -1 })) as {
            root: { nodeId: number };
          };
          const face = async (selector: string) => {
            const { nodeId } = (await cdp.send("DOM.querySelector", {
              nodeId: root.nodeId,
              selector,
            })) as { nodeId: number };
            const { fonts } = (await cdp.send("CSS.getPlatformFontsForNode", { nodeId })) as {
              fonts: Array<{ familyName: string; glyphCount: number }>;
            };
            return [...fonts].sort((a, b) => b.glyphCount - a.glyphCount)[0]?.familyName;
          };
          return { latin: await face("#latin"), eastAsian: await face("#east") };
        } finally {
          await page.close();
        }
      });
      await withTempProject(
        { decks: [{ name: "faced", script, theme: facedTheme, slides: { cover: faced } }] },
        async (root) => {
          seen.length = 0;
          await pptxDeck(join(root, "decks", "faced"), { runner });
          const runs = [
            ...(seen[0]?.boxes ?? []).flatMap((box) => box.runs),
            ...proseLayers(seen[0]?.layers ?? []).flatMap((prose) =>
              prose.text.paragraphs.flatMap((paragraph) => paragraph.runs),
            ),
          ];
          expect(runs.map((run) => run.text).join("")).toBe("code 台本");
          // Whatever fonts this machine has: the run's Latin face is the one that drew "code",
          // and its East Asian face the one that drew "台本", the same one named once.
          for (const run of runs) {
            expect(run.font).toBe(drawn.latin);
            expect(run.ea ?? run.font).toBe(drawn.eastAsian);
          }
          expect(typeof drawn.latin).toBe("string");
        },
      );
    },
  );

  browserTest(
    "sets text where the browser drew it when it is set again plainly, spaced as written",
    async () => {
      const lines = [
        "「台本」から、（発表）まで。ト・リ",
        "覚える書き方は三つだけです。",
        "dek は、喋る台本を先に書き、そこから組み立てる道具です。",
        "（かっこ）で始まる行と、「かぎ」。それに・なかぐろ：コロン！？",
        "Markdown で書く Type AV To WA 1,234.56",
      ];
      // Whatever sans-serif the machine has: with `palt` where the font has it, and with the
      // punctuation the browser trims where two marks meet and the pairs it kerns where not.
      const html = `<!doctype html><html lang="ja"><head><style>body { margin: 0; background: #fff; } .slide { position: relative; width: 1280px; height: 720px; font-family: sans-serif; font-size: 36px; font-feature-settings: "palt"; color: #000; } p { position: absolute; left: 40px; margin: 0; white-space: nowrap; line-height: 60px; }</style></head><body><div id="deck"><section class="slide">${lines
        .map(
          (text, at) =>
            `<p style="top: ${20 + at * 90}px;${at % 2 ? " font-weight: 700;" : ""}">${text}</p>`,
        )
        .join("")}</section></div></body></html>`;
      const blank = '<!doctype html><html><body style="margin: 0; background: #fff"></body></html>';
      const asHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const url = (png: Uint8Array) =>
        `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
      const found = await withBrowser(async (browser) => {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 720 },
          deviceScaleFactor: 2,
        });
        try {
          const page = await context.newPage();
          await page.setContent(html, { waitUntil: "load" });
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          const full = await page.screenshot({});
          // Measuring takes the text out of the page: the next shot is the slide without it.
          const measured = await page.evaluate(measurePptxTextsInPage);
          const bare = await page.screenshot({});
          const requests = pptxTypeRequests(measured);
          const set = setPptxTexts(measured, {
            faces: new Map(),
            glyphs: await page.evaluate(measurePptxGlyphsInPage, requests.glyphs),
            lines: await page.evaluate(measurePptxPlainLinesInPage, requests.lines),
          });
          // The file's text as a renderer sets it: no feature of the text's own, each run at
          // its written spacing, Latin kerned and East Asian text not, each box where it starts.
          const pieces = (text: string) =>
            [...text].reduce<Array<{ text: string; eastAsian: boolean }>>((all, char) => {
              const eastAsian = scriptOf(char) === "eastAsian";
              const last = all.at(-1);
              if (last && last.eastAsian === eastAsian) {
                last.text += char;
              } else {
                all.push({ text: char, eastAsian });
              }
              return all;
            }, []);
          const model = `<!doctype html><html lang="ja"><head><style>body { margin: 0; background: #fff; } div { position: absolute; white-space: pre; font-family: sans-serif; font-feature-settings: normal; font-variant: normal; text-spacing-trim: space-all; color: #000; }</style></head><body>${set.boxes
            .map(
              (box) =>
                `<div style="left: ${box.x + (box.shift ?? 0)}px; top: ${box.y}px; line-height: ${box.height}px;">${box.runs
                  .map((run) =>
                    pieces(run.text)
                      .map(
                        (piece) =>
                          `<span style="font-size: ${run.size}px; font-weight: ${run.bold ? 700 : 400}; letter-spacing: ${run.letterSpacing}px; font-kerning: ${piece.eastAsian ? "none" : "auto"};">${asHtml(piece.text)}</span>`,
                      )
                      .join(""),
                  )
                  .join("")}</div>`,
            )
            .join("")}</body></html>`;
          const again = await context.newPage();
          await again.setContent(model, { waitUntil: "load" });
          const drawn = await again.screenshot({});
          await again.setContent(blank, { waitUntil: "load" });
          const empty = await again.screenshot({});
          return await again.evaluate(compareInPage, {
            width: 1280,
            height: 720,
            scale: 2,
            browser: { full: url(full), bare: url(bare) },
            renderer: { full: url(drawn), bare: url(empty) },
            lines: measured.boxes.map((box) => ({
              left: box.x,
              top: box.y,
              right: box.x + box.width,
              bottom: box.y + box.height,
            })),
          });
        } finally {
          await context.close();
        }
      });
      expect(found.lines).toHaveLength(lines.length);
      for (const [at, line] of found.lines.entries()) {
        expect({ line: lines[at], native: line.native }).toEqual({ line: lines[at], native: true });
        expect(Math.abs(line.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(line.right)).toBeLessThanOrEqual(1);
        expect(line.match).toBeGreaterThanOrEqual(0.97);
      }
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
          for (const box of [...slide.boxes, ...proseLayers(slide.layers)]) {
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
