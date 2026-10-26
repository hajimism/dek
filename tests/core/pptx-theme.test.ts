import { describe, expect, test } from "bun:test";
import { deckTheme, slideBackground } from "../../src/core/pptx-theme.ts";

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
});
