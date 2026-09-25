import { describe, expect, test } from "bun:test";
import {
  measureTextContrast,
  type Pixels,
  type Rgb,
  type TextLayers,
  textContrastScript,
  textLayerCss,
  withOverlaps,
} from "../../src/core/text-contrast.ts";
import { contrastRatio } from "../../src/core/visual.ts";

const WIDTH = 10;
const HEIGHT = 1;

/** A 10×1 image, one color per pixel. */
function pixels(colors: Rgb[]): Pixels {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  colors.forEach(([r, g, b], i) => {
    data.set([r, g, b, 255], i * 4);
  });
  return { width: WIDTH, height: HEIGHT, data };
}

const fill = (color: Rgb): Rgb[] => Array.from({ length: WIDTH }, () => color);
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const DARK: Rgb = [17, 17, 17];
const GREY: Rgb = [68, 68, 68];
const line = [{ left: 0, top: 0, right: WIDTH, bottom: HEIGHT }];

/** Glyphs cover `covered` pixels fully, the rest not at all. */
function glyphs(covered: boolean[]): Pick<TextLayers, "white" | "black"> {
  return {
    white: pixels(covered.map((on) => (on ? WHITE : DARK))),
    black: pixels(covered.map((on) => (on ? BLACK : DARK))),
  };
}

describe("measureTextContrast", () => {
  test("compares the glyphs as shown with what they sit on", () => {
    const covered = [false, true, true, true, false, true, true, false, false, false];
    const measured = measureTextContrast(
      {
        shown: pixels(covered.map((on) => (on ? GREY : DARK))),
        bare: pixels(fill(DARK)),
        ...glyphs(covered),
      },
      { rects: line },
    );
    expect(measured).toEqual({ ratio: contrastRatio(GREY, DARK), fg: GREY, bg: DARK });
  });

  test("judges text over a gradient by the part of it that reads worst", () => {
    const covered = fill(WHITE).map(() => true);
    const ramp = Array.from({ length: WIDTH }, (_, i): Rgb => {
      const v = Math.round((i / (WIDTH - 1)) * 255);
      return [v, v, v];
    });
    const measured = measureTextContrast(
      { shown: pixels(fill(WHITE)), bare: pixels(ramp), ...glyphs(covered) },
      { rects: line },
    );
    expect(measured?.bg).toEqual(WHITE);
    expect(measured?.ratio).toBe(1);
  });

  test("leaves out pixels that something drawn above the text covers", () => {
    // A violet rule struck through the word: it looks the same whatever color the glyphs are.
    const VIOLET: Rgb = [161, 0, 255];
    const covered = fill(WHITE).map((_, i) => i !== 4);
    const white = pixels(covered.map((on) => (on ? WHITE : VIOLET)));
    const black = pixels(covered.map((on) => (on ? BLACK : VIOLET)));
    const measured = measureTextContrast(
      {
        shown: pixels(covered.map((on) => (on ? WHITE : VIOLET))),
        bare: pixels(covered.map((on) => (on ? DARK : VIOLET))),
        white,
        black,
      },
      { rects: line },
    );
    expect(measured).toEqual({ ratio: contrastRatio(WHITE, DARK), fg: WHITE, bg: DARK });
  });

  test("measures faded text as it is drawn", () => {
    // At 40% opacity, white glyphs over black move only 40% of the way.
    const faded: Rgb = [102, 102, 102];
    const measured = measureTextContrast(
      {
        shown: pixels(fill(faded)),
        bare: pixels(fill(BLACK)),
        white: pixels(fill(faded)),
        black: pixels(fill(BLACK)),
      },
      { rects: line, opacity: 0.4 },
    );
    expect(measured).toEqual({ ratio: contrastRatio(faded, BLACK), fg: faded, bg: BLACK });
  });

  test("reads a glyph too thin to cover a whole pixel at its full color", () => {
    // A hyphen covers 60% of each pixel it touches; the text is GREY, not the blend.
    const blend = (color: Rgb, under: Rgb, a: number): Rgb =>
      color.map((c, i) => Math.round((under[i] ?? 0) + (c - (under[i] ?? 0)) * a)) as Rgb;
    const measured = measureTextContrast(
      {
        shown: pixels(fill(blend(GREY, DARK, 0.6))),
        bare: pixels(fill(DARK)),
        white: pixels(fill(blend(WHITE, DARK, 0.6))),
        black: pixels(fill(blend(BLACK, DARK, 0.6))),
      },
      { rects: line },
    );
    // Within one step per channel: the layers themselves are rounded to 8 bits.
    expect(measured?.fg.map((c, i) => Math.abs(c - (GREY[i] ?? 0)) <= 1)).toEqual([
      true,
      true,
      true,
    ]);
    expect(measured?.ratio).toBeCloseTo(contrastRatio(GREY, DARK), 1);
  });

  test("finds text drawn in its background's own color", () => {
    const covered = fill(WHITE).map((_, i) => i % 2 === 0);
    const measured = measureTextContrast(
      { shown: pixels(fill(DARK)), bare: pixels(fill(DARK)), ...glyphs(covered) },
      { rects: line },
    );
    expect(measured?.ratio).toBe(1);
  });

  test("leaves out where another text overlaps, unless nothing else is left", () => {
    // The first half is another element's violet glyph, which the masks cannot tell apart.
    const VIOLET: Rgb = [161, 0, 255];
    const layers = {
      shown: pixels(fill(WHITE).map((c, i) => (i < 5 ? VIOLET : c))),
      bare: pixels(fill(DARK)),
      ...glyphs(fill(WHITE).map(() => true)),
    };
    const theirs = [{ left: 0, top: 0, right: 5, bottom: HEIGHT }];
    expect(measureTextContrast(layers, { rects: line, overlaps: theirs })?.fg).toEqual(WHITE);
    expect(measureTextContrast(layers, { rects: theirs, overlaps: line })?.fg).toEqual(VIOLET);
  });

  test("returns nothing for fully transparent text stacked on another text", () => {
    // A hidden beat's text in the same cell as the shown one: the glyphs under it are the other's.
    const layers = {
      shown: pixels(fill(WHITE)),
      bare: pixels(fill(DARK)),
      ...glyphs(fill(WHITE).map(() => true)),
    };
    expect(
      measureTextContrast(layers, { rects: line, overlaps: line, opacity: 0 }),
    ).toBeUndefined();
    expect(measureTextContrast(layers, { rects: line, overlaps: line })?.fg).toEqual(WHITE);
  });

  test("returns nothing when no glyph is drawn", () => {
    const measured = measureTextContrast(
      {
        shown: pixels(fill(DARK)),
        bare: pixels(fill(DARK)),
        ...glyphs(fill(DARK).map(() => false)),
      },
      { rects: line },
    );
    expect(measured).toBeUndefined();
  });

  test("reads only inside the text's own boxes, clipped to the image", () => {
    const covered = fill(WHITE).map(() => true);
    const shown = pixels(fill(WHITE).map((c, i) => (i < 5 ? GREY : c)));
    const measured = measureTextContrast(
      { shown, bare: pixels(fill(DARK)), ...glyphs(covered) },
      { rects: [{ left: -3, top: -1, right: 5, bottom: 4 }] },
    );
    expect(measured?.fg).toEqual(GREY);
  });
});

describe("withOverlaps", () => {
  test("pairs each text with the boxes of other texts that cross it", () => {
    const word = { left: 0, top: 0, right: 100, bottom: 40 };
    const fallen = { left: 80, top: 30, right: 110, bottom: 60 };
    const apart = { left: 200, top: 0, right: 300, bottom: 40 };
    expect(
      withOverlaps([{ rects: [word] }, { rects: [fallen], opacity: 0.5 }, { rects: [apart] }]),
    ).toEqual([
      { rects: [word], overlaps: [fallen] },
      { rects: [fallen], opacity: 0.5, overlaps: [word] },
      { rects: [apart], overlaps: [] },
    ]);
  });
});

describe("textLayerCss", () => {
  test("fills every glyph with one color and stops transitions, leaving pseudo-elements alone", () => {
    const css = textLayerCss("white");
    expect(css).toContain("-webkit-text-fill-color: #fff !important");
    expect(css).toContain("transition: none !important");
    expect(css).toMatch(/::before,\s*\*::after\s*\{\s*-webkit-text-fill-color: initial !important/);
  });

  test("the bare layer also drops backgrounds that are clipped to the text", () => {
    expect(textLayerCss("bare")).toContain("-webkit-text-fill-color: transparent !important");
    expect(textLayerCss("bare")).toContain("[data-dek-clip-text] { background: none !important; }");
    expect(textLayerCss("black")).not.toContain("data-dek-clip-text");
  });
});

describe("textContrastScript", () => {
  test("defines the in-page sampler from self-contained source", () => {
    const scope: { __dekTextContrast?: unknown } = {};
    new Function("window", textContrastScript())(scope);
    expect(typeof scope.__dekTextContrast).toBe("function");
  });
});
