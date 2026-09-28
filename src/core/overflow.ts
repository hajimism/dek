import type { Box, MeasuredElement } from "./slide-measure.ts";

export type Edge = "top" | "right" | "bottom" | "left";

export const EDGES: Edge[] = ["top", "right", "bottom", "left"];

export type Overflow = {
  box: string;
  text?: string;
  /** Pixels past each edge it crosses. */
  by: Partial<Record<Edge, number>>;
  origin?: OverflowOrigin;
  /** The ancestor that cuts the text off, when the edge is that ancestor's and not the frame's. */
  clip?: string;
};

/** An overflow as measured: with the index of its element, which finds it again in a second measure. */
type LocatedOverflow = Overflow & { element: number };

/**
 * What put an overflow past the edge, found by taking the page apart: the slide script's draw,
 * the slide's own CSS, or neither, which leaves the content itself too big for the theme.
 */
export type OverflowOrigin = "script" | "slide" | "content";

/** Whether `element` crosses an edge of the slide at all, whatever its parent does. */
export function crossesEdge(
  slide: Box,
  element: Pick<MeasuredElement, "rect"> & {
    opacity?: number;
    decorative?: boolean;
    clip?: MeasuredElement["clip"];
  },
): boolean {
  return (
    (element.opacity ?? 1) >= 0.01 &&
    element.decorative !== true &&
    Object.keys(overflowAmounts(slide, visibleRect(element))).length > 0
  );
}

/** An element's box, less what an ancestor inside the slide cuts off. */
function visibleRect({ rect, clip }: Pick<MeasuredElement, "rect" | "clip">): Box {
  return clip
    ? {
        left: Math.max(rect.left, clip.rect.left),
        top: Math.max(rect.top, clip.rect.top),
        right: Math.min(rect.right, clip.rect.right),
        bottom: Math.min(rect.bottom, clip.rect.bottom),
      }
    : rect;
}

function overflowAmounts(slide: Box, rect: Box): Partial<Record<Edge, number>> {
  if (rect.right <= rect.left || rect.bottom <= rect.top) {
    return {};
  }
  const past: Record<Edge, number> = {
    top: slide.top - rect.top,
    right: rect.right - slide.right,
    bottom: rect.bottom - slide.bottom,
    left: slide.left - rect.left,
  };
  const by: Partial<Record<Edge, number>> = {};
  for (const edge of EDGES) {
    // Sub-pixel layout rounding is not an overflow anyone can see.
    if (past[edge] >= 1) {
      by[edge] = Math.round(past[edge]);
    }
  }
  return by;
}

/**
 * The elements that cross an edge of the slide, each reported only for the
 * edges its parent stays inside: a list that runs off the bottom is one
 * finding, not one per item.
 */
export function findOverflows(
  slide: Box,
  elements: Array<
    Pick<MeasuredElement, "box" | "parent" | "rect" | "text"> & {
      opacity?: number;
      decorative?: boolean;
      clip?: MeasuredElement["clip"];
    }
  >,
): LocatedOverflow[] {
  // An invisible element, such as a beat before it shows, overflows nothing anyone sees, and
  // decoration, such as a glow, may bleed off the slide as it likes. What an ancestor inside the
  // slide cuts off is not past the frame; findClippedText says when that is text.
  const amounts = elements.map((element) =>
    (element.opacity ?? 1) < 0.01 || element.decorative === true
      ? {}
      : overflowAmounts(slide, visibleRect(element)),
  );
  const found: LocatedOverflow[] = [];
  elements.forEach((element, index) => {
    const parent = amounts[element.parent] ?? {};
    const by: Partial<Record<Edge, number>> = {};
    for (const edge of EDGES) {
      const amount = amounts[index]?.[edge];
      if (amount !== undefined && parent[edge] === undefined) {
        by[edge] = amount;
      }
    }
    if (Object.keys(by).length > 0) {
      found.push({
        box: element.box,
        ...(element.text ? { text: element.text } : {}),
        by,
        element: index,
      });
    }
  });
  return found;
}

/**
 * The texts an ancestor inside the slide cuts off, with `overflow: hidden` or the like: each by how
 * far its lines run past what the ancestor shows. A truncation the author asked for, an ellipsis
 * or a line clamp, is left alone, and so are decoration and text nobody sees.
 */
export function findClippedText(
  elements: Array<
    Pick<MeasuredElement, "box" | "text" | "textRects" | "opacity" | "decorative" | "clip">
  >,
): LocatedOverflow[] {
  return elements.flatMap((element, index) => {
    const { clip } = element;
    if (!clip || clip.intended || element.decorative || element.opacity < 0.01) {
      return [];
    }
    const lines = element.textRects.filter(
      (rect) => rect.right > rect.left && rect.bottom > rect.top,
    );
    if (lines.length === 0) {
      return [];
    }
    const text = {
      left: Math.min(...lines.map((rect) => rect.left)),
      top: Math.min(...lines.map((rect) => rect.top)),
      right: Math.max(...lines.map((rect) => rect.right)),
      bottom: Math.max(...lines.map((rect) => rect.bottom)),
    };
    const by = overflowAmounts(clip.rect, text);
    return Object.keys(by).length === 0
      ? []
      : [
          {
            box: element.box,
            ...(element.text ? { text: element.text } : {}),
            by,
            clip: clip.box,
            element: index,
          },
        ];
  });
}

/** One text as the page draws it, for finding which texts are drawn over which. */
type TextBox = { rects: Box[]; opacity: number };

/**
 * The pairs of texts whose lines are drawn over each other, a folio or running head a
 * pseudo-element draws included, first in the page first. Lines that only touch, as the words of
 * one sentence set in two elements do, are not a collision: the lines must cross by a few pixels
 * each way and share a fifth of the smaller one.
 */
export function findCollisions<T extends TextBox>(texts: T[]): Array<[T, T]> {
  const MIN_CROSS = 4;
  const MIN_SHARE = 0.2;
  const area = (rect: Box): number => (rect.right - rect.left) * (rect.bottom - rect.top);
  const crosses = (a: Box, b: Box): boolean => {
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return (
      width >= MIN_CROSS &&
      height >= MIN_CROSS &&
      width * height >= MIN_SHARE * Math.min(area(a), area(b))
    );
  };
  const shown = texts.filter((text) => text.opacity >= 0.01 && text.rects.length > 0);
  const found: Array<[T, T]> = [];
  for (const [at, one] of shown.entries()) {
    for (const other of shown.slice(at + 1)) {
      if (one.rects.some((a) => other.rects.some((b) => crosses(a, b)))) {
        found.push([one, other]);
      }
    }
  }
  return found;
}

/** Two texts drawn over each other: the one first in the page, and the one it collides with. */
export type Collision = { box: string; text?: string; other: string; otherText?: string };
