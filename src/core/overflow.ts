import type { Box, MeasuredElement } from "./slide-measure.ts";

export type Edge = "top" | "right" | "bottom" | "left";

export const EDGES: Edge[] = ["top", "right", "bottom", "left"];

export type Overflow = {
  box: string;
  text?: string;
  /** Pixels past each edge it crosses. */
  by: Partial<Record<Edge, number>>;
};

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
  elements: Array<Pick<MeasuredElement, "box" | "parent" | "rect" | "text"> & { opacity?: number }>,
): Overflow[] {
  // An invisible element, such as a beat before it shows, overflows nothing anyone sees.
  const amounts = elements.map((element) =>
    (element.opacity ?? 1) < 0.01 ? {} : overflowAmounts(slide, element.rect),
  );
  const found: Overflow[] = [];
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
      found.push({ box: element.box, ...(element.text ? { text: element.text } : {}), by });
    }
  });
  return found;
}
