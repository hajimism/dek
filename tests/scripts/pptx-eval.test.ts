import { describe, expect, test } from "bun:test";
import type { SlideCensus } from "../../evals/pptx/census.ts";
import type { LineFinding } from "../../evals/pptx/compare.ts";
import { readPackage, readZip } from "../../evals/pptx/package.ts";
import { magnified } from "../../evals/pptx/quicklook.ts";
import { type DeckReport, markdown, slideReport, summarize } from "../../evals/pptx/report.ts";
import { type PptxLayer, type PptxRun, pptxPackage } from "../../src/core/pptx-package.ts";
import { zipFiles } from "../../src/core/zip.ts";

// The PPTX eval without a browser or a renderer: what it reads from a file, how it counts what
// can be edited, and how it prepares the copy Quick Look draws. Its measuring in Chromium and in
// Quick Look runs only by hand, with scripts/pptx-eval.ts.

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Another picture: one byte more, so the file holds it apart from the first.
const ICON = new Uint8Array([...PNG, 0x01]);

const run = (text: string, over: Partial<PptxRun> = {}): PptxRun => ({
  text,
  size: 24,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: [0, 0, 0],
  alpha: 1,
  letterSpacing: 0,
  font: "Menlo",
  ...over,
});

const layers: PptxLayer[] = [
  { kind: "text", x: 80, y: 40, width: 300, height: 30, lineHeight: 30, runs: [run("見出し")] },
  {
    kind: "shape",
    x: 80,
    y: 120,
    width: 400,
    height: 200,
    radius: 8,
    fill: { color: [255, 255, 255], alpha: 1 },
    text: {
      inset: { left: 16, top: 16, right: 16, bottom: 16 },
      wrap: true,
      paragraphs: [
        {
          align: "left",
          lineHeight: 36,
          spaceBefore: 0,
          marginLeft: 0,
          marginRight: 0,
          indent: 0,
          runs: [run("一行目\n二行目")],
        },
      ],
    },
    layers: [
      { kind: "picture", x: 100, y: 240, width: 40, height: 40, description: "An icon", png: ICON },
    ],
  },
  {
    kind: "rule",
    x1: 80,
    y1: 400,
    x2: 480,
    y2: 400,
    width: 2,
    paint: { color: [0, 0, 0], alpha: 1 },
  },
];

const file = () =>
  pptxPackage({
    title: "Talk",
    lang: "ja",
    size: { width: 1280, height: 720 },
    slides: [{ picture: PNG, description: "", layers, notes: "話すこと" }],
  });

describe("reading a file back", () => {
  test("a stored archive gives each file's bytes, and a broken one says which", () => {
    const bytes = zipFiles([{ path: "a/b.txt", data: new TextEncoder().encode("hello") }]);
    expect(new TextDecoder().decode(readZip(bytes).get("a/b.txt"))).toBe("hello");
    const broken = bytes.slice();
    broken[30 + "a/b.txt".length] = 0x48;
    expect(() => readZip(broken)).toThrow("a/b.txt fails its CRC");
  });

  test("a slide's text, shapes, pictures, and what is left as a picture are counted", () => {
    const { facts } = readPackage(file());
    expect(facts.problems).toEqual([]);
    expect(facts.size).toEqual({ width: 1280, height: 720 });
    expect(facts.core).toEqual({ title: true, creator: false, created: false });
    const [slide] = facts.slides;
    expect(slide?.bodies).toEqual([
      { wrap: false, paragraphs: [{ ink: "見出し", lines: 1, runs: 1, bullet: false }] },
      { wrap: true, paragraphs: [{ ink: "一行目二行目", lines: 2, runs: 2, bullet: false }] },
    ]);
    // The card and the rule are shapes; a text box is not one.
    expect(slide?.shapes).toBe(2);
    expect(slide?.pictures).toBe(1);
    expect(slide?.described).toBe(1);
    expect(slide?.groups).toBe(1);
    expect(slide?.rasters).toEqual(["ppt/media/image1.png"]);
    expect(slide?.notes).toBe(true);
    expect(slide?.fields).toEqual([]);
  });

  test("a part the file points at and does not hold is a problem", () => {
    const whole = readZip(file());
    whole.delete("ppt/media/image1.png");
    const { facts } = readPackage(zipFiles([...whole].map(([path, data]) => ({ path, data }))));
    expect(facts.problems).toEqual([
      "ppt/slides/_rels/slide1.xml.rels points at ../media/image1.png, which is not in the file",
    ]);
  });
});

describe("the copy Quick Look draws", () => {
  test("every length is multiplied, and shares, angles, and colors are not", () => {
    const xml =
      '<a:xfrm><a:off x="100" y="-200"/><a:ext cx="300" cy="400"/></a:xfrm><a:ln w="9525">' +
      '<a:bodyPr lIns="10" tIns="20" rIns="30" bIns="40"><a:pPr marL="5" indent="-5">' +
      '<a:lnSpc><a:spcPts val="1200"/></a:lnSpc><a:rPr lang="ja" sz="1050" spc="-42" dirty="0">' +
      '<a:srgbClr val="112233"><a:alpha val="50000"/></a:srgbClr><a:gd name="adj" fmla="val 25000"/>' +
      '<a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">';
    expect(magnified(xml, 4)).toBe(
      '<a:xfrm><a:off x="400" y="-800"/><a:ext cx="1200" cy="1600"/></a:xfrm><a:ln w="38100">' +
        '<a:bodyPr lIns="40" tIns="80" rIns="120" bIns="160"><a:pPr marL="20" indent="-20">' +
        '<a:lnSpc><a:spcPts val="4800"/></a:lnSpc><a:rPr lang="ja" sz="4200" spc="-168" dirty="0">' +
        '<a:srgbClr val="112233"><a:alpha val="50000"/></a:srgbClr><a:gd name="adj" fmla="val 25000"/>' +
        '<a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">',
    );
  });

  test("a slide dekc pptx wrote is magnified whole", () => {
    const xml = new TextDecoder().decode(readZip(file()).get("ppt/slides/slide1.xml"));
    const large = magnified(xml, 2);
    expect(large).toContain('<a:off x="1524000" y="762000"/>');
    expect(large).toContain('sz="3600"');
  });

  test("a length written in a form it does not know stops it", () => {
    expect(() => magnified('<a:off y="1" x="2"/>')).toThrow("teach magnified()");
    expect(() => magnified('<a:tab sz="1200"/>')).toThrow("teach magnified()");
  });
});

describe("the report", () => {
  const census: SlideCensus = {
    lines: [
      {
        left: 80,
        top: 40,
        right: 180,
        bottom: 70,
        chars: 3,
        kind: "html",
        eastAsian: true,
        other: false,
      },
      {
        left: 96,
        top: 136,
        right: 196,
        bottom: 172,
        chars: 3,
        kind: "html",
        eastAsian: true,
        other: false,
      },
      {
        left: 96,
        top: 172,
        right: 196,
        bottom: 208,
        chars: 3,
        kind: "html",
        eastAsian: true,
        other: false,
      },
      {
        left: 1100,
        top: 20,
        right: 1200,
        bottom: 40,
        chars: 4,
        kind: "pseudo",
        eastAsian: false,
        other: true,
      },
      {
        left: 0,
        top: 700,
        right: 50,
        bottom: 710,
        chars: 2,
        kind: "decoration",
        eastAsian: false,
        other: true,
      },
    ],
    blocks: [
      { ink: "見出し", lines: 1 },
      { ink: "一行目二行目", lines: 2 },
      { ink: "01/18", lines: 1 },
    ],
    chars: { html: 9, pseudo: 5, decoration: 2 },
    links: 1,
    heading: true,
  };
  const found = (over: Partial<LineFinding> = {}): LineFinding => ({
    native: true,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    match: 1,
    spill: 0,
    ...over,
  });

  test("a block is whole when one paragraph carries it, and wraps when its box does", () => {
    const [slide] = readPackage(file()).facts.slides;
    if (!slide) {
      throw new Error("no slide");
    }
    const report = slideReport("cover", census, slide, {
      coverage: 1,
      lines: [
        found({ right: 8 }),
        found({ right: -20, spill: 0.3 }),
        found({ right: 0.5 }),
        found({ native: false }),
        found(),
      ],
      difference: 3,
      differing: 0.01,
    });
    expect(report.text).toEqual({
      shown: 14,
      pseudo: 5,
      decoration: 2,
      native: 9,
      whole: 9,
      wrapping: 6,
      bodies: 2,
      runs: 3,
    });
    expect(report.title).toBe(false);
    expect(report.links).toEqual({ shown: 1, kept: 0 });
    // Decoration is not a line to measure; a line that ends early over ink of its own was rewrapped.
    expect(report.render?.lines.map((line) => line.cause)).toEqual([
      "east-asian",
      "rewrapped",
      undefined,
      undefined,
    ]);
    expect(report.render?.lines.map((line) => line.native)).toEqual([true, true, true, false]);

    const deck: DeckReport = {
      deck: "talk",
      exportMs: 1500,
      bytes: 2_000_000,
      xmlBytes: 100,
      mediaBytes: 200,
      core: { title: true, creator: false, created: false },
      problems: [],
      slides: [report],
    };
    const summary = summarize([deck], "talk");
    expect(summary).toMatchObject({
      slides: 1,
      megabytes: 2,
      native: 0.643,
      whole: 0.643,
      wrapping: 0.429,
      // 6 characters wrap, 3 more are whole, none are in pieces, of 14 shown.
      editability: 0.579,
      runsPerChar: 0.333,
      titled: 0,
      numbered: 0,
      links: 0,
      rasterSlides: 1,
    });
    expect(summary.render).toMatchObject({
      lines: 4,
      native: 3,
      drifted: 2,
      causes: { rewrapped: 1, mixed: 0, "east-asian": 1, other: 0 },
      driftMax: 20,
    });
    const text = markdown({
      startedAt: "2026-11-18T00:00:00.000Z",
      renderer: "Quick Look",
      decks: [deck],
    });
    expect(text).toContain("| talk | 1 | 2 | 1.5 | 64.3% | 64.3% | 42.9% | 0.579 | 0.333 |");
    expect(text).toContain("| cover | 14 | 9 | 9 | 6 | 2 | 3 |");
  });

  test("with no renderer, nothing is said of lines", () => {
    const [slide] = readPackage(file()).facts.slides;
    if (!slide) {
      throw new Error("no slide");
    }
    const report = slideReport("cover", census, slide, { coverage: 0 });
    expect(report.render).toBeUndefined();
    const deck: DeckReport = {
      deck: "talk",
      exportMs: 0,
      bytes: 0,
      xmlBytes: 0,
      mediaBytes: 0,
      core: { title: true, creator: false, created: false },
      problems: [],
      slides: [report],
    };
    expect(summarize([deck], "talk").render).toBeUndefined();
    expect(markdown({ startedAt: "", renderer: null, decks: [deck] })).toContain(
      "Renderer: none, so no line was measured.",
    );
  });
});
