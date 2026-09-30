import type { Box, MeasuredElement } from "./slide-measure.ts";

/**
 * How much of the frame a slide fills, and where: what an agent otherwise opens a screenshot to
 * see, as numbers. What fills a slide is what the audience reads or looks at: each text's lines,
 * each picture's box, and each painted box that holds nothing, as a chart's bar or a swatch is. A
 * painted box that holds something, a card or a window, is as full as what it holds, so one whose
 * words sit in its top half leaves the rest empty. Decoration counts like the rest: aria-hidden
 * tells lint and screen readers to pass it by, and the audience still sees it take its place.
 * Text a pseudo-element draws fills nothing (a folio sits in a corner of every slide), nor does
 * anything the beat has not shown yet. Every share is of the frame, from 0 to 1, to two places.
 */
export type Fill = {
  /** The share of the frame the content covers, overlaps counted once. */
  coverage: number;
  /** The smallest box holding all of it, as shares of the frame's width and height. */
  box?: Box;
  /** The share of each tenth of the frame, top to bottom, the content covers. */
  rows: number[];
  /** The same, left to right. */
  columns: number[];
};

const BANDS = 10;

const share = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) / 100 : 0;

export function measureFill(frame: Box, elements: MeasuredElement[]): Fill {
  const width = Math.max(0, Math.round(frame.right - frame.left));
  const height = Math.max(0, Math.round(frame.bottom - frame.top));
  // One cell a pixel, so what overlaps is counted once.
  const covered = new Uint8Array(width * height);
  let extent: Box | undefined;
  const holding = new Set(elements.map((element) => element.parent));
  for (const [index, element] of elements.entries()) {
    if (element.opacity <= 0) {
      continue;
    }
    const seen = element.clip?.rect;
    const mark = element.picture || (element.paints && !holding.has(index));
    for (const rect of [...(mark ? [element.rect] : []), ...element.textRects]) {
      const left = Math.max(rect.left, frame.left, seen?.left ?? -Infinity);
      const top = Math.max(rect.top, frame.top, seen?.top ?? -Infinity);
      const right = Math.min(rect.right, frame.right, seen?.right ?? Infinity);
      const bottom = Math.min(rect.bottom, frame.bottom, seen?.bottom ?? Infinity);
      if (right <= left || bottom <= top) {
        continue;
      }
      extent = extent
        ? {
            left: Math.min(extent.left, left),
            top: Math.min(extent.top, top),
            right: Math.max(extent.right, right),
            bottom: Math.max(extent.bottom, bottom),
          }
        : { left, top, right, bottom };
      const [x0, x1] = [Math.round(left - frame.left), Math.round(right - frame.left)];
      const [y0, y1] = [Math.round(top - frame.top), Math.round(bottom - frame.top)];
      for (let y = y0; y < y1; y++) {
        covered.fill(1, y * width + x0, y * width + x1);
      }
    }
  }
  const rows = new Array<number>(height).fill(0);
  const columns = new Array<number>(width).fill(0);
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (covered[y * width + x]) {
        rows[y] = (rows[y] ?? 0) + 1;
        columns[x] = (columns[x] ?? 0) + 1;
        total++;
      }
    }
  }
  /** Each tenth of `lines`, as the share of it `across` cells deep that is covered. */
  const bands = (lines: number[], across: number): number[] =>
    Array.from({ length: BANDS }, (_, band) => {
      const from = Math.round((band * lines.length) / BANDS);
      const to = Math.round(((band + 1) * lines.length) / BANDS);
      const sum = lines.slice(from, to).reduce((a, b) => a + b, 0);
      return share(sum, (to - from) * across);
    });
  return {
    coverage: share(total, width * height),
    ...(extent
      ? {
          box: {
            left: share(extent.left - frame.left, width),
            top: share(extent.top - frame.top, height),
            right: share(extent.right - frame.left, width),
            bottom: share(extent.bottom - frame.top, height),
          },
        }
      : {}),
    rows: bands(rows, width),
    columns: bands(columns, height),
  };
}
