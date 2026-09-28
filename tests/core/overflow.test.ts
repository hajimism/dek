import { describe, expect, test } from "bun:test";
import { findOverflows } from "../../src/core/overflow.ts";

describe("findOverflows", () => {
  const slideBox = { left: 0, top: 0, right: 1280, bottom: 720 };
  const el = (box: string, rect: [number, number, number, number], parent = -1, text?: string) => ({
    box,
    parent,
    rect: { left: rect[0], top: rect[1], right: rect[2], bottom: rect[3] },
    ...(text ? { text } : {}),
  });

  test("reports the outermost element that overflows an edge, not every child", () => {
    const found = findOverflows(slideBox, [
      el("ul", [80, 150, 1200, 900], -1, "時間がかかる"),
      el("li", [110, 150, 1200, 190], 0, "時間がかかる"),
      el("li", [110, 860, 1200, 900], 0, "さらに追加"),
    ]);
    expect(found).toEqual([{ box: "ul", text: "時間がかかる", by: { bottom: 180 }, element: 0 }]);
  });

  test("reports a child only for the edges its parent stays inside", () => {
    const found = findOverflows(slideBox, [
      el("ul", [80, 150, 1200, 900]),
      el("li", [110, 860, 1692, 900], 0, "https://example.com"),
    ]);
    expect(found).toEqual([
      { box: "ul", by: { bottom: 180 }, element: 0 },
      { box: "li", text: "https://example.com", by: { right: 412 }, element: 1 },
    ]);
  });

  test("ignores an element the page draws invisible, as a beat is before it shows", () => {
    expect(
      findOverflows(slideBox, [{ ...el("p", [80, 600, 1200, 728], -1, "later"), opacity: 0 }]),
    ).toEqual([]);
  });

  // aria-hidden says an element is decoration, and a glow that bleeds off the slide is one.
  test("ignores decoration: an element marked aria-hidden, and what it holds", () => {
    expect(
      findOverflows(slideBox, [
        { ...el("div.glow", [-200, -200, 600, 400]), decorative: true },
        { ...el("span", [-100, -100, 100, 100], 0), decorative: true },
      ]),
    ).toEqual([]);
  });

  test("ignores empty boxes and sub-pixel rounding", () => {
    expect(
      findOverflows(slideBox, [el("span", [2000, 0, 2000, 0]), el("p", [80, 64, 1280.4, 719])]),
    ).toEqual([]);
  });
});
