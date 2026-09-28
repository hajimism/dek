import type { Box, MeasuredElement } from "./slide-measure.ts";

export type Edge = "top" | "right" | "bottom" | "left";

export const EDGES: Edge[] = ["top", "right", "bottom", "left"];

export type Overflow = {
  box: string;
  text?: string;
  /** Pixels past each edge it crosses. */
  by: Partial<Record<Edge, number>>;
  origin?: OverflowOrigin;
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
  element: Pick<MeasuredElement, "rect"> & { opacity?: number; decorative?: boolean },
): boolean {
  return (
    (element.opacity ?? 1) >= 0.01 &&
    element.decorative !== true &&
    Object.keys(overflowAmounts(slide, element.rect)).length > 0
  );
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
    }
  >,
): LocatedOverflow[] {
  // An invisible element, such as a beat before it shows, overflows nothing anyone sees, and
  // decoration, such as a glow, may bleed off the slide as it likes.
  const amounts = elements.map((element) =>
    (element.opacity ?? 1) < 0.01 || element.decorative === true
      ? {}
      : overflowAmounts(slide, element.rect),
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
