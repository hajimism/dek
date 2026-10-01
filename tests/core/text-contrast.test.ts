import { describe, expect, test } from "bun:test";
import {
  contrastRatio,
  contrastThreshold,
  measurePageTextContrasts,
  measureTextContrast,
  type Pixels,
  parseCssRgb,
  type Rgb,
  type TextLayers,
  textContrastScript,
  textLayerCss,
  withOverlaps,
} from "../../src/core/text-contrast.ts";

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

describe("measureTextContrast opacity", () => {
  const solid = {
    shown: pixels(fill(GREY)),
    bare: pixels(fill(DARK)),
    ...glyphs(fill(WHITE).map(() => true)),
  };

  test.each([
    [1, GREY],
    [1.5, GREY],
    [undefined, GREY],
  ] as const)("reads text at opacity %p as drawn, never brighter", (opacity, fg) => {
    const measured = measureTextContrast(solid, {
      rects: line,
      ...(opacity === undefined ? {} : { opacity }),
    });
    expect(measured?.fg).toEqual([...fg]);
  });

  test.each([0, -0.5])("returns nothing for text at opacity %p", (opacity) => {
    expect(measureTextContrast(solid, { rects: line, opacity })).toBeUndefined();
  });
});

describe("measureTextContrast and text shadows", () => {
  const YELLOW: Rgb = [255, 216, 74];
  const PINK: Rgb = [255, 77, 148];
  const BLUE: Rgb = [33, 72, 214];
  const covered = fill(WHITE).map(() => true);

  test("reads a glyph over its own offset shadow against what is behind the shadow", () => {
    // Yellow on blue, a pink shadow cast down and right: half the glyph sits on the shadow.
    const measured = measureTextContrast(
      {
        shown: pixels(fill(YELLOW)),
        bare: pixels(fill(BLUE).map((c, i) => (i < 5 ? PINK : c))),
        shadowless: pixels(fill(BLUE)),
        ...glyphs(covered),
      },
      { rects: line },
    );
    expect(measured).toEqual({ ratio: contrastRatio(YELLOW, BLUE), fg: YELLOW, bg: BLUE });
  });

  test("still reads text against the halo that sets it off", () => {
    // White on white, set off by a dark glow: without the glow there is nothing to read.
    const measured = measureTextContrast(
      {
        shown: pixels(fill(WHITE)),
        bare: pixels(fill(DARK)),
        shadowless: pixels(fill(WHITE)),
        ...glyphs(covered),
      },
      { rects: line },
    );
    expect(measured).toEqual({ ratio: contrastRatio(WHITE, DARK), fg: WHITE, bg: DARK });
  });

  test("fails text that reads against neither its shadow nor what is behind it", () => {
    const measured = measureTextContrast(
      {
        shown: pixels(fill(GREY)),
        bare: pixels(fill(GREY)),
        shadowless: pixels(fill(DARK)),
        ...glyphs(covered),
      },
      { rects: line },
    );
    expect(measured?.ratio).toBeCloseTo(contrastRatio(GREY, DARK), 5);
  });

  test("undoes a thin glyph's blend against what it was drawn over, its shadow included", () => {
    // A hyphen covers 60% of each pixel, over a pink shadow on a dark slide: the text is GREY.
    const blend = (color: Rgb, under: Rgb, a: number): Rgb =>
      color.map((c, i) => Math.round(c * a + (under[i] ?? 0) * (1 - a))) as Rgb;
    const measured = measureTextContrast(
      {
        shown: pixels(fill(blend(GREY, PINK, 0.6))),
        bare: pixels(fill(PINK)),
        shadowless: pixels(fill(DARK)),
        white: pixels(fill(blend(WHITE, PINK, 0.6))),
        black: pixels(fill(blend(BLACK, PINK, 0.6))),
      },
      { rects: line },
    );
    // Within one step of an 8-bit channel: the pixels were rounded when the blend was drawn.
    const off = (measured?.fg ?? WHITE).map((c, i) => Math.abs(c - (GREY[i] ?? 0)));
    expect(Math.max(...off)).toBeLessThanOrEqual(1);
  });
});

type Call = { screenshot: true } | { evaluate: unknown } | { script: string };

/**
 * A page that records what it is asked, answers the sampler with `answer`, and the marking of the
 * page (the one call that passes nothing) with `marks`.
 */
function recordingPage(answer: unknown, marks: unknown = { shadowed: false }) {
  const calls: Call[] = [];
  let shots = 0;
  const page = {
    calls,
    screenshot: async () => {
      calls.push({ screenshot: true });
      return new TextEncoder().encode(`shot-${++shots}`);
    },
    evaluate: async <T, A>(_fn: (arg: A) => T | Promise<T>, arg?: A): Promise<T> => {
      calls.push({ evaluate: arg });
      if (arg === undefined) {
        return marks as T;
      }
      return (arg && typeof arg === "object" && "layers" in arg ? answer : undefined) as T;
    },
    addScriptTag: async ({ content }: { content: string }) => {
      calls.push({ script: content });
    },
  };
  return page;
}

const base64 = (text: string): string => Buffer.from(text).toString("base64");

describe("measurePageTextContrasts", () => {
  test("touches nothing on the page when there is no text to measure", async () => {
    const page = recordingPage([]);
    expect(await measurePageTextContrasts(page, [])).toEqual([]);
    expect(page.calls).toEqual([]);
  });

  test("shoots the page as shown, then each layer, and takes the layer away before sampling", async () => {
    const measured = [{ ratio: 7, fg: WHITE, bg: DARK }, null];
    const page = recordingPage(measured);
    const texts = [
      { rects: [{ left: 0, top: 0, right: 10, bottom: 10 }] },
      { rects: [{ left: 5, top: 5, right: 20, bottom: 20 }], opacity: 0.5 },
    ];
    expect(await measurePageTextContrasts(page, texts)).toEqual(measured);
    const [shown, mark, ...rest] = page.calls;
    expect(shown).toEqual({ screenshot: true });
    expect(mark).toEqual({ evaluate: undefined });
    expect(rest.slice(0, 6)).toEqual([
      { evaluate: textLayerCss("bare") },
      { screenshot: true },
      { evaluate: textLayerCss("white") },
      { screenshot: true },
      { evaluate: textLayerCss("black") },
      { screenshot: true },
    ]);
    expect(rest.slice(6)).toEqual([
      { evaluate: null },
      { script: textContrastScript() },
      {
        evaluate: {
          layers: {
            shown: base64("shot-1"),
            bare: base64("shot-2"),
            white: base64("shot-3"),
            black: base64("shot-4"),
          },
          texts: withOverlaps(texts),
        },
      },
    ]);
  });

  test("shoots the shadowless layer too when some text casts a shadow", async () => {
    const page = recordingPage([null], { shadowed: true });
    const texts = [{ rects: [{ left: 0, top: 0, right: 10, bottom: 10 }] }];
    await measurePageTextContrasts(page, texts);
    expect(page.calls.slice(2, 10)).toEqual([
      { evaluate: textLayerCss("bare") },
      { screenshot: true },
      { evaluate: textLayerCss("shadowless") },
      { screenshot: true },
      { evaluate: textLayerCss("white") },
      { screenshot: true },
      { evaluate: textLayerCss("black") },
      { screenshot: true },
    ]);
    expect(page.calls.at(-1)).toEqual({
      evaluate: {
        layers: {
          shown: base64("shot-1"),
          bare: base64("shot-2"),
          shadowless: base64("shot-3"),
          white: base64("shot-4"),
          black: base64("shot-5"),
        },
        texts: withOverlaps(texts),
      },
    });
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
    expect(textLayerCss("bare")).toContain(
      "[data-dekc-clip-text] { background: none !important; }",
    );
    expect(textLayerCss("black")).not.toContain("data-dekc-clip-text");
  });

  test("the shadowless layer is the bare layer with no text casting a shadow", () => {
    const css = textLayerCss("shadowless");
    expect(css).toContain(textLayerCss("bare"));
    expect(css).toMatch(/\*::after\s*\{\s*text-shadow: none !important/);
    expect(textLayerCss("bare")).not.toContain("text-shadow");
  });

  // The masks only find where glyphs are; a blend mode would scale white and black by what is
  // under them. The shown and bare layers keep it, so the text is read as the audience sees it.
  test("the white and black layers draw text unblended, the others as shown", () => {
    const unblended = "[data-dekc-blend] { mix-blend-mode: normal !important; }";
    expect(textLayerCss("white")).toContain(unblended);
    expect(textLayerCss("black")).toContain(unblended);
    expect(textLayerCss("bare")).not.toContain("data-dekc-blend");
    expect(textLayerCss("shadowless")).not.toContain("data-dekc-blend");
  });
});

describe("textContrastScript", () => {
  test("defines the in-page sampler from self-contained source", () => {
    const scope: { __dekcTextContrast?: unknown } = {};
    new Function("window", textContrastScript())(scope);
    expect(typeof scope.__dekcTextContrast).toBe("function");
  });
});

describe("parseCssRgb", () => {
  test("parses comma and space separated rgb()", () => {
    expect(parseCssRgb("rgb(245, 245, 245)")).toEqual([245, 245, 245]);
    expect(parseCssRgb("rgb(245 245 245)")).toEqual([245, 245, 245]);
    expect(parseCssRgb("rgba(17, 17, 17, 1)")).toEqual([17, 17, 17]);
  });

  test("skips oklch and other non-rgb colors", () => {
    expect(parseCssRgb("oklch(0.7 0.1 120)")).toBeUndefined();
  });

  test.each([
    ["RGB(1, 2, 3)", [1, 2, 3]],
    ["rgb(12.5, 0, 255)", [12.5, 0, 255]],
    ["rgb(1 2 3 / 50%)", [1, 2, 3]],
    ["rgba(1,2,3,0.5)", [1, 2, 3]],
    ["  rgb(  1 ,2 , 3 )", [1, 2, 3]],
  ] as const)("reads the channels of %p and drops its alpha", (color, rgb) => {
    expect(parseCssRgb(color)).toEqual([...rgb]);
  });

  test.each(["", "#fff", "transparent", "hsl(0 0% 50%)", "rgb(10%, 20%, 30%)", "rgb(1, 2)"])(
    "reads nothing from %p",
    (color) => {
      expect(parseCssRgb(color)).toBeUndefined();
    },
  );
});

describe("contrastRatio", () => {
  test("is high for light text on a dark background", () => {
    expect(contrastRatio([245, 245, 245], [17, 17, 17])).toBeGreaterThan(4.5);
  });

  test("is below 4.5 for gray text on white", () => {
    expect(contrastRatio([119, 119, 119], [255, 255, 255])).toBeLessThan(4.5);
  });

  const grey = (v: number): Rgb => [v, v, v];
  test.each([
    ["black on white", BLACK, WHITE, 21],
    ["white on black", WHITE, BLACK, 21],
    ["a color on itself", GREY, GREY, 1],
    ["#767676 on white", grey(0x76), WHITE, 4.54],
    ["#777777 on white", grey(0x77), WHITE, 4.48],
    ["#949494 on white", grey(0x94), WHITE, 3.03],
    ["#959595 on white", grey(0x95), WHITE, 2.995],
    ["#0a0a0a on black, in the linear part of the curve", grey(10), BLACK, 1.06],
  ] as const)("is %s ≈ %d", (_name, fg, bg, ratio) => {
    expect(contrastRatio([...fg], [...bg])).toBeCloseTo(ratio, 2);
  });

  test("puts the WCAG greys on either side of 4.5:1 and 3:1", () => {
    expect(contrastRatio(grey(0x76), WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(grey(0x77), WHITE)).toBeLessThan(4.5);
    expect(contrastRatio(grey(0x94), WHITE)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(grey(0x95), WHITE)).toBeLessThan(3);
  });
});

describe("contrastThreshold", () => {
  test("uses 3:1 for WCAG large text and 4.5:1 otherwise", () => {
    expect(contrastThreshold({ fontSize: 24, fontWeight: 400 })).toBe(3);
    expect(contrastThreshold({ fontSize: 18.66, fontWeight: 700 })).toBe(3);
    expect(contrastThreshold({ fontSize: 18, fontWeight: 700 })).toBe(4.5);
    expect(contrastThreshold({ fontSize: 23.9, fontWeight: 400 })).toBe(4.5);
    expect(contrastThreshold({ fontSize: 24 })).toBe(3);
  });

  test.each([
    [{ fontSize: 18.65, fontWeight: 700 }, 4.5],
    [{ fontSize: 18.66, fontWeight: 800 }, 3],
    [{ fontSize: 18.66, fontWeight: 600 }, 4.5],
    [{ fontSize: 20 }, 4.5],
    [{ fontSize: 0 }, 4.5],
    [{ fontSize: 96, fontWeight: 100 }, 3],
  ] as const)("asks %j for %d:1", (sample, threshold) => {
    expect(contrastThreshold(sample)).toBe(threshold);
  });

  test("falls back to 4.5:1 when the runner did not report a size", () => {
    expect(contrastThreshold({})).toBe(4.5);
    expect(contrastThreshold({ fontWeight: 700 })).toBe(4.5);
  });
});
