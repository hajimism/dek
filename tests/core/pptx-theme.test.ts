import { describe, expect, test } from "bun:test";
import type { PptxLayer, PptxParagraph, PptxRun } from "../../src/core/pptx-package.ts";
import { colorLeavesPicture, deckTheme, slideBackground } from "../../src/core/pptx-theme.ts";

// What becomes of a slide's background and the deck's theme, decided from the computed values
// a page reports: no browser here.

const SIZE = { width: 1280, height: 720 };
const INK = { color: [17, 17, 17] as [number, number, number], alpha: 1 };
const paint = (r: number, g: number, b: number) => ({
  color: [r, g, b] as [number, number, number],
  alpha: 1,
});

describe("slideBackground", () => {
  test("is the color of a slide painted one opaque color", () => {
    expect(slideBackground({ paint: INK, image: "none" }, SIZE)).toEqual({
      kind: "solid",
      paint: INK,
    });
    // A color the page shows through is not PowerPoint's to paint.
    expect(slideBackground({ paint: { ...INK, alpha: 0.5 }, image: "none" }, SIZE)).toBeUndefined();
  });

  test("is a linear gradient along an axis, its angle DrawingML's, down by default", () => {
    const linear = (image: string) => slideBackground({ paint: INK, image }, SIZE);
    expect(linear("linear-gradient(rgb(17, 17, 17), rgb(0, 51, 102))")).toEqual({
      kind: "linear",
      angle: 90,
      stops: [
        { at: 0, paint: paint(17, 17, 17) },
        { at: 1, paint: paint(0, 51, 102) },
      ],
    });
    expect(linear("linear-gradient(to right, rgb(1, 2, 3), rgb(4, 5, 6))")?.kind).toBe("linear");
    const angles = [
      "to top",
      "to right",
      "to bottom",
      "to left",
      "0deg",
      "90deg",
      "180deg",
      "270deg",
      "0.5turn",
    ].map((direction) => {
      const fill = linear(`linear-gradient(${direction}, rgb(1, 2, 3), rgb(4, 5, 6))`);
      return fill?.kind === "linear" ? fill.angle : undefined;
    });
    expect(angles).toEqual([270, 0, 90, 180, 270, 0, 90, 180, 90]);
  });

  test("places the stops as CSS does: missing ones spread out, pixels along the axis", () => {
    const fill = slideBackground(
      {
        paint: INK,
        image:
          "linear-gradient(to right, rgb(1, 1, 1), rgb(2, 2, 2), rgb(3, 3, 3) 640px, rgb(4, 4, 4) 25%, rgb(5, 5, 5) 80% 90%, rgb(6, 6, 6))",
      },
      SIZE,
    );
    expect(
      fill?.kind === "linear" && fill.stops.map((stop) => [stop.at, stop.paint.color[0]]),
    ).toEqual([
      [0, 1],
      [0.25, 2],
      [0.5, 3],
      // A stop before the one ahead of it is moved up to it.
      [0.5, 4],
      [0.8, 5],
      [0.9, 5],
      [1, 6],
    ]);
  });

  test("stays in the picture for anything PowerPoint's gradient would not draw the same", () => {
    for (const image of [
      'url("a.png")',
      "radial-gradient(rgb(1, 2, 3), rgb(4, 5, 6))",
      "repeating-linear-gradient(rgb(1, 2, 3), rgb(4, 5, 6) 10px)",
      "linear-gradient(45deg, rgb(1, 2, 3), rgb(4, 5, 6))",
      "linear-gradient(to right bottom, rgb(1, 2, 3), rgb(4, 5, 6))",
      "linear-gradient(in oklab, rgb(1, 2, 3), rgb(4, 5, 6))",
      "linear-gradient(rgb(1, 2, 3), 30%, rgb(4, 5, 6))",
      "linear-gradient(rgba(1, 2, 3, 0.5), rgb(4, 5, 6))",
      "linear-gradient(oklch(0.5 0.1 200), rgb(4, 5, 6))",
      "linear-gradient(rgb(1, 2, 3) 2em, rgb(4, 5, 6))",
      "linear-gradient(rgb(1, 2, 3) -10%, rgb(4, 5, 6))",
      "linear-gradient(rgb(1, 2, 3), rgb(4, 5, 6)), linear-gradient(rgb(1, 2, 3), rgb(4, 5, 6))",
      "linear-gradient(rgb(1, 2, 3))",
    ]) {
      expect({ image, fill: slideBackground({ paint: INK, image }, SIZE) }).toEqual({
        image,
        fill: undefined,
      });
    }
  });
});

describe("colorLeavesPicture", () => {
  test("keeps the color in a picture that would pack much worse without it", () => {
    // Two rules on nothing: an alpha channel's worth more than on their paper.
    expect(colorLeavesPicture(14_304, 18_015)).toBe(true);
    // A glow over the whole slide: three times the bytes on nothing.
    expect(colorLeavesPicture(560_000, 1_700_000)).toBe(false);
    // Half again as large and 8 kB is the most it may grow by.
    expect(colorLeavesPicture(100_000, 158_192)).toBe(true);
    expect(colorLeavesPicture(100_000, 158_193)).toBe(false);
  });
});

describe("deckTheme", () => {
  const FONT = { family: "sans-serif", latin: "Helvetica", ea: "Hiragino Sans" };
  const TITLE = { family: '"Futura", sans-serif', latin: "Futura", ea: "Hiragino Sans" };

  test("takes each token as most slides have it, the first on a tie", () => {
    const theme = deckTheme([
      { colors: { fg: [1, 1, 1], bg: [9, 9, 9] }, fonts: { title: TITLE, body: FONT } },
      // A slide that sets its own background.
      { colors: { fg: [1, 1, 1], bg: [200, 0, 0] }, fonts: { title: TITLE, body: FONT } },
      {
        colors: { fg: [1, 1, 1], bg: [9, 9, 9], accent: [5, 5, 5] },
        fonts: { title: TITLE, body: FONT },
      },
      { colors: { fg: [2, 2, 2], accent: [6, 6, 6] }, fonts: { title: FONT, body: FONT } },
    ]);
    expect(theme).toEqual({
      colors: { fg: [1, 1, 1], bg: [9, 9, 9], accent: [5, 5, 5] },
      fonts: { title: TITLE, body: FONT },
    });
  });

  test("names no fonts unless both font tokens are known", () => {
    expect(deckTheme([{ colors: {}, fonts: { body: FONT } }])).toEqual({ colors: {} });
    expect(deckTheme([])).toEqual({ colors: {} });
  });

  describe("with the text the slides set", () => {
    const run = (text: string, more: Partial<PptxRun>): PptxRun => ({
      text,
      size: 20,
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      color: [0, 0, 0],
      alpha: 1,
      letterSpacing: 0,
      ...more,
    });
    const paragraph = (runs: PptxRun[]): PptxParagraph => ({
      align: "left",
      lineHeight: 30,
      spaceBefore: 0,
      marginLeft: 0,
      marginRight: 0,
      indent: 0,
      runs,
    });
    const AT = { x: 0, y: 0, width: 100, height: 30 };
    const text = (runs: PptxRun[]): PptxLayer => ({ kind: "text", ...AT, lineHeight: 30, runs });
    const prose = (runs: PptxRun[], title = false): PptxLayer => ({
      kind: "prose",
      ...AT,
      text: {
        inset: { left: 0, top: 0, right: 0, bottom: 0 },
        wrap: true,
        paragraphs: [paragraph(runs)],
      },
      ...(title ? { title } : {}),
    });
    const SANS = '"Hiragino Sans", sans-serif';
    const page = (title: string, body: string, titleLatin = "Hiragino Sans") => ({
      colors: {},
      fonts: {
        title: { family: title, latin: titleLatin, ea: "Hiragino Sans" },
        body: { family: body, latin: "Hiragino Sans", ea: "Hiragino Sans" },
      },
    });

    test("names each token's font by the face most of its characters were drawn in, a script at a time", () => {
      const mono = "Menlo, monospace";
      const theme = deckTheme(
        [page(mono, SANS, "Menlo")],
        [
          [
            prose([
              run("本文の字が、いちばん多い。", { family: SANS, font: "Hiragino Sans W4" }),
              run("太字", { family: SANS, font: "Hiragino Sans W7", bold: true }),
              run("Latin words", { family: SANS, font: "Helvetica Neue", ea: "Hiragino Sans W4" }),
            ]),
            text([run("code", { family: mono, font: "Menlo" })]),
            // A character named alone is set in no token.
            text([run("—", { font: "Apple Symbols" })]),
          ],
        ],
      );
      expect(theme.fonts).toEqual({
        // No East Asian character was set in the title's token, and another family draws
        // them: the page's own answer stands.
        title: { family: mono, latin: "Menlo", ea: "Hiragino Sans" },
        body: { family: SANS, latin: "Helvetica Neue", ea: "Hiragino Sans W4" },
      });
    });

    test("where both tokens are one family, takes the titles' face for the title's font", () => {
      const theme = deckTheme(
        [page(SANS, SANS)],
        [
          [
            prose(
              [run("見出し Title", { family: SANS, font: "Hiragino Sans W7", bold: true })],
              true,
            ),
            {
              kind: "shape",
              ...AT,
              radius: 0,
              text: {
                inset: { left: 0, top: 0, right: 0, bottom: 0 },
                wrap: true,
                paragraphs: [
                  paragraph([
                    run("図形の中の本文 text", { family: SANS, font: "Hiragino Sans W4" }),
                  ]),
                ],
              },
              layers: [
                text([run("ラベル label", { family: SANS, font: "Hiragino Sans W6", bold: true })]),
              ],
            },
          ],
          [prose([run("本文 body text", { family: SANS, font: "Hiragino Sans W4" })])],
        ],
      );
      expect(theme.fonts).toEqual({
        title: { family: SANS, latin: "Hiragino Sans W7", ea: "Hiragino Sans W7" },
        body: { family: SANS, latin: "Hiragino Sans W4", ea: "Hiragino Sans W4" },
      });
    });

    test("takes the one face for both scripts where one family draws both and the text held one", () => {
      const theme = deckTheme(
        [page(SANS, SANS)],
        [
          [
            prose([run("日本語だけの見出し", { family: SANS, font: "Hiragino Sans W7" })], true),
            prose([run("Latin only", { family: SANS, font: "Hiragino Sans W4" })]),
          ],
        ],
      );
      expect(theme.fonts).toEqual({
        title: { family: SANS, latin: "Hiragino Sans W7", ea: "Hiragino Sans W7" },
        body: { family: SANS, latin: "Hiragino Sans W4", ea: "Hiragino Sans W4" },
      });
    });

    test("keeps what the pages said where no text was set in a token", () => {
      expect(deckTheme([page(SANS, SANS)], [[]]).fonts).toEqual({
        title: { family: SANS, latin: "Hiragino Sans", ea: "Hiragino Sans" },
        body: { family: SANS, latin: "Hiragino Sans", ea: "Hiragino Sans" },
      });
    });
  });
});
