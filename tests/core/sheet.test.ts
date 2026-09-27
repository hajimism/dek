import { describe, expect, test } from "bun:test";
import {
  type MotionBeat,
  motionSheets,
  overviewSheets,
  SHEET_MAX_EDGE,
  SHEET_MAX_PIXELS,
  type SheetCell,
  type SheetSpec,
  sheetHtml,
  sheetLayout,
} from "../../src/core/sheet.ts";

const wide = { width: 1280, height: 720 };
const dir = "/cache/sheets/abc";

const cells = (count: number): SheetCell[] =>
  Array.from({ length: count }, (_, i) => ({
    image: `/shots/s${i + 1}.png`,
    label: `${i + 1} s${i + 1}`,
  }));

/** A sheet a vision model reads as drawn: no edge past the limit, no more pixels than it keeps. */
function fitsVision(spec: SheetSpec): boolean {
  const { size } = sheetLayout(spec);
  return (
    size.width <= SHEET_MAX_EDGE &&
    size.height <= SHEET_MAX_EDGE &&
    size.width * size.height <= SHEET_MAX_PIXELS
  );
}

describe("overviewSheets", () => {
  test("puts a talk-sized deck on one sheet, within what a vision model keeps", () => {
    const sheets = overviewSheets(cells(14), { slide: wide, title: "demo", dir });
    expect(sheets).toHaveLength(1);
    expect(fitsVision(sheets[0] as SheetSpec)).toBe(true);
    expect(sheets[0]?.rows.flatMap((row) => row.cells)).toEqual(cells(14));
    expect(sheets[0]?.path).toBe(`${dir}/sheet-1.png`);
    expect(sheets[0]?.title).toBe("demo · slides 1–14 of 14");
  });

  test("draws the tiles as large as one sheet allows, at the slide's ratio", () => {
    for (const count of [1, 3, 8, 14, 20]) {
      const [sheet] = overviewSheets(cells(count), { slide: wide, title: "demo", dir });
      if (!sheet) {
        throw new Error("no sheet");
      }
      expect(Math.abs(sheet.tile.height / sheet.tile.width - 720 / 1280)).toBeLessThan(0.01);
      // One column fewer means larger tiles, and those no longer fit.
      if (sheet.columns > 1) {
        const larger = overviewSheets(cells(count), {
          slide: wide,
          title: "demo",
          dir,
          columns: sheet.columns - 1,
        });
        expect(larger.length > 1 || !fitsVision(larger[0] as SheetSpec)).toBe(true);
      }
    }
  });

  test("never draws a tile larger than the slide", () => {
    const [sheet] = overviewSheets(cells(1), { slide: wide, title: "demo", dir });
    expect(sheet?.tile.width).toBeLessThanOrEqual(1280);
  });

  test("goes on to more sheets for a long deck, in order, each within the budget", () => {
    const sheets = overviewSheets(cells(60), { slide: wide, title: "demo", dir });
    expect(sheets.length).toBeGreaterThan(1);
    expect(sheets.every(fitsVision)).toBe(true);
    expect(sheets.flatMap((sheet) => sheet.rows.flatMap((row) => row.cells))).toEqual(cells(60));
    expect(sheets.map((sheet) => sheet.path)).toEqual(
      sheets.map((_, i) => `${dir}/sheet-${i + 1}.png`),
    );
    const perSheet = sheets[0]?.rows.flatMap((row) => row.cells).length ?? 0;
    expect(sheets[1]?.title).toBe(`demo · slides ${perSheet + 1}–${perSheet * 2} of 60`);
  });

  test("keeps 4:3 slides at their ratio too", () => {
    const sheet = overviewSheets(cells(12), {
      slide: { width: 960, height: 720 },
      title: "demo",
      dir,
    })[0] as SheetSpec;
    expect(sheet.tile.height / sheet.tile.width).toBeCloseTo(0.75, 2);
    expect(fitsVision(sheet)).toBe(true);
  });

  test("makes no sheet for no slides", () => {
    expect(overviewSheets([], { slide: wide, title: "demo", dir })).toEqual([]);
  });
});

describe("motionSheets", () => {
  const moving = (label: string): MotionBeat => ({
    label,
    frames: [
      { ms: 0, path: `/f/${label}-0.png` },
      { ms: 300, path: `/f/${label}-300.png` },
      { ms: 600, path: `/f/${label}-600.png` },
      { ms: 900, path: `/f/${label}-900.png` },
      { ms: 1200, path: `/f/${label}-end.png`, end: true },
    ],
  });

  test("gives each beat a row, its frames captioned with their moment", () => {
    const [sheet] = motionSheets([moving("beat 1 · slides")], {
      slide: wide,
      title: "timing · motion",
      dir,
    });
    expect(sheet?.rows).toEqual([
      {
        label: "beat 1 · slides",
        cells: [
          { image: "/f/beat 1 · slides-0.png", label: "0 ms" },
          { image: "/f/beat 1 · slides-300.png", label: "300 ms" },
          { image: "/f/beat 1 · slides-600.png", label: "600 ms" },
          { image: "/f/beat 1 · slides-900.png", label: "900 ms" },
          { image: "/f/beat 1 · slides-end.png", label: "end · 1200 ms" },
        ],
      },
    ]);
    expect(sheet?.title).toBe("timing · motion");
    expect(fitsVision(sheet as SheetSpec)).toBe(true);
  });

  test("says so for a beat that does not move", () => {
    const [sheet] = motionSheets(
      [moving("beat 1"), { label: "beat 2", frames: [{ ms: 0, path: "/f/2.png", end: true }] }],
      { slide: wide, title: "timing · motion", dir },
    );
    expect(sheet?.rows[1]?.cells).toEqual([{ image: "/f/2.png", label: "no motion" }]);
  });

  test("goes on to more sheets when the beats do not fit on one, numbering them", () => {
    const beats = Array.from({ length: 8 }, (_, i) => moving(`beat ${i + 1}`));
    const sheets = motionSheets(beats, { slide: wide, title: "timing · motion", dir });
    expect(sheets.length).toBeGreaterThan(1);
    expect(sheets.every(fitsVision)).toBe(true);
    expect(sheets.flatMap((sheet) => sheet.rows.map((row) => row.label))).toEqual(
      beats.map((beat) => beat.label),
    );
    expect(sheets[0]?.title).toBe(`timing · motion · 1/${sheets.length}`);
  });
});

describe("sheetLayout and sheetHtml", () => {
  const spec = motionSheets(
    [
      {
        label: "beat 1 <b>",
        frames: [
          { ms: 0, path: "/f/a.png" },
          { ms: 400, path: "/f/b.png", end: true },
        ],
      },
    ],
    { slide: wide, title: "t & m", dir },
  )[0] as SheetSpec;

  test("places every box inside the sheet, and no two images on top of each other", () => {
    const { size, boxes } = sheetLayout(spec);
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
    }
    const images = boxes.filter((box) => box.kind === "image");
    expect(images).toHaveLength(2);
    const [a, b] = images;
    expect((a?.x ?? 0) + (a?.width ?? 0)).toBeLessThanOrEqual(b?.x ?? 0);
  });

  test("draws the page at the layout's size, with text escaped and images from src", () => {
    const html = sheetHtml(spec, (image) => `data:image/png;base64,${image.length}`);
    const { size } = sheetLayout(spec);
    expect(html).toContain(`width:${size.width}px;height:${size.height}px`);
    expect(html).toContain("t &amp; m");
    expect(html).toContain("beat 1 &lt;b&gt;");
    expect(html).toContain('src="data:image/png;base64,8"');
    expect(html).not.toContain("<b>");
  });
});
