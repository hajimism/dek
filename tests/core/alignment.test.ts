import { describe, expect, test } from "bun:test";
import { type AlignedElement, findMisalignments } from "../../src/core/alignment.ts";

/** An element at `left, top`, `width` by `height`, a child of `parent` (-1 is the slide). */
function el(
  box: string,
  [left, top, width, height]: [number, number, number, number],
  extra: Partial<AlignedElement> = {},
): AlignedElement {
  return {
    box,
    parent: -1,
    rect: { left, top, right: left + width, bottom: top + height },
    textRects: [],
    opacity: 1,
    decorative: false,
    inline: false,
    tilted: false,
    paints: false,
    picture: false,
    fontSize: 24,
    ...extra,
  };
}

/** A line of text at `left, top`, `width` by `height`, its baseline `baseline` below its top. */
const line = (
  [left, top, width, height]: [number, number, number, number],
  baseline: number,
): Pick<AlignedElement, "textRects" | "baseline"> => ({
  textRects: [{ left, top, right: left + width, bottom: top + height }],
  baseline: top + baseline,
});

/** A card that paints its box, with nothing inside it of its own. */
const frame = (at: [number, number, number, number]) => el("div.card", at, { paints: true });

/** A card with a line of text inset 24px from its top left. */
const card = ([left, top, width, height]: [number, number, number, number]) =>
  el("div.card", [left, top, width, height], {
    paints: true,
    ...line([left + 24, top + 24, 120, 28], 22),
  });

describe("findMisalignments", () => {
  test("finds nothing where items side by side share a top, or items stacked a left edge", () => {
    expect(
      findMisalignments([
        el("h2", [64, 64, 600, 60]),
        el("p", [64, 140, 400, 30]),
        el("img", [700, 140, 300, 200], { picture: true }),
      ]),
    ).toEqual([]);
  });

  test("finds items side by side whose tops miss each other by a few pixels", () => {
    expect(findMisalignments([card([64, 200, 300, 200]), card([400, 203, 300, 197])])).toEqual([
      { element: 1, other: 0, edge: "top", of: "box", by: 3 },
    ]);
  });

  test("finds items stacked whose left edges miss each other by a few pixels", () => {
    expect(findMisalignments([el("h2", [64, 64, 600, 60]), el("ul", [68, 140, 600, 200])])).toEqual(
      [{ element: 1, other: 0, edge: "left", of: "box", by: 4 }],
    );
  });

  test("leaves edges far enough apart to be a choice, and a pixel or less, alone", () => {
    expect(
      findMisalignments([el("h2", [64, 64, 600, 60]), el("blockquote", [104, 140, 560, 60])]),
    ).toEqual([]);
    expect(findMisalignments([el("h2", [64, 64, 600, 60]), el("p", [65, 140, 600, 60])])).toEqual(
      [],
    );
  });

  test("names the one off the line the others share", () => {
    const found = findMisalignments([
      card([64, 200, 300, 200]),
      card([400, 205, 300, 195]),
      card([736, 200, 300, 200]),
    ]);
    expect(found).toEqual([{ element: 1, other: 0, edge: "top", of: "box", by: 5 }]);
  });

  test("finds a row of cards one of which is a little shorter, but not text of another size", () => {
    expect(findMisalignments([card([64, 200, 300, 200]), card([400, 200, 300, 196])])).toEqual([
      { element: 1, other: 0, edge: "bottom", of: "box", by: 4 },
    ]);
    expect(findMisalignments([el("h3", [64, 200, 300, 40]), el("p", [400, 200, 300, 36])])).toEqual(
      [],
    );
  });

  test("finds text side by side whose tops miss each other where their bottoms meet, but not bars", () => {
    const column = (left: number, top: number) =>
      el("div.col", [left, top, 300, 400 - top], line([left, top, 200, 28], 22));
    expect(findMisalignments([column(64, 200), column(400, 205)])).toEqual([
      { element: 1, other: 0, edge: "top", of: "box", by: 5 },
    ]);
    const bar = (left: number, top: number) =>
      el("div.bar", [left, top, 40, 400 - top], { paints: true });
    expect(findMisalignments([bar(64, 200), bar(120, 205)])).toEqual([]);
  });

  test("leaves tags set flush right alone, however wide their words make them", () => {
    expect(findMisalignments([card([1000, 200, 200, 40]), card([1006, 260, 194, 40])])).toEqual([]);
  });

  test("finds text that starts a few pixels apart in cards stacked, unless it is centered", () => {
    const lane = (top: number, [left, width]: [number, number]) =>
      el("p.lane", [64, top, 200, 60], { paints: true, ...line([left, top + 16, width, 28], 22) });
    expect(findMisalignments([lane(200, [88, 96]), lane(280, [92, 48])])).toEqual([
      { element: 1, other: 0, edge: "left", of: "text", by: 4 },
    ]);
    expect(findMisalignments([lane(200, [116, 96]), lane(280, [120, 88])])).toEqual([]);
  });

  test("holds only items of one kind to one size, as a pill beside a panel is not", () => {
    expect(
      findMisalignments([
        el("p.pill", [64, 200, 120, 36], { paints: true }),
        el("div.panel", [200, 200, 300, 40], { paints: true }),
      ]),
    ).toEqual([]);
  });

  test("leaves items centered on one line alone, whatever their sizes", () => {
    expect(
      findMisalignments([
        el("img.icon", [64, 202, 40, 40], { picture: true }),
        el("p", [120, 200, 400, 44]),
      ]),
    ).toEqual([]);
  });

  test("leaves items that share a baseline alone, as a number and its unit do", () => {
    // Their bottoms are 4px apart, which on their own would read as a miss.
    const stat = el("span.stat", [64, 200, 120, 70], line([64, 200, 120, 70], 58));
    const unit = (baseline: number) =>
      el("span.unit", [200, 236, 80, 30], line([200, 236, 80, 30], baseline));
    expect(findMisalignments([stat, unit(22)])).toEqual([]);
    expect(findMisalignments([stat, unit(25)])).toEqual([
      { element: 1, other: 0, edge: "bottom", of: "box", by: 4 },
    ]);
  });

  test("finds text that starts a few pixels apart in cards that line up", () => {
    const found = findMisalignments([
      frame([64, 200, 300, 200]),
      el("h3", [88, 224, 252, 30], { parent: 0, ...line([88, 226, 112, 28], 22) }),
      frame([400, 200, 300, 200]),
      el("h3", [420, 220, 260, 30], { parent: 2, ...line([420, 222, 110, 28], 22) }),
    ]);
    expect(found).toEqual([{ element: 2, other: 0, edge: "top", of: "text", by: 4 }]);
  });

  test("names a card off the row once, not again for the text that moved with it", () => {
    const found = findMisalignments([
      frame([64, 200, 300, 200]),
      el("h3", [88, 224, 252, 30], { parent: 0, ...line([88, 226, 112, 28], 22) }),
      frame([400, 203, 300, 197]),
      el("h3", [424, 227, 252, 30], { parent: 2, ...line([424, 229, 106, 28], 22) }),
    ]);
    expect(found).toEqual([{ element: 2, other: 0, edge: "top", of: "box", by: 3 }]);
  });

  test("compares items stacked beside one item as the stack they form", () => {
    // A swatch, with its name above its value beside it, the two centered against it.
    expect(
      findMisalignments([
        el("span.chip", [64, 200, 60, 60], { paints: true }),
        el("span.name", [140, 208, 100, 20]),
        el("span.value", [140, 232, 100, 20]),
      ]),
    ).toEqual([]);
  });

  test("compares a row under a heading as the row it forms, named by the item at the edge", () => {
    expect(
      findMisalignments([
        el("h2", [64, 64, 1000, 60], line([64, 70, 400, 48], 38)),
        card([68, 160, 360, 300]),
        card([460, 160, 360, 300]),
        card([852, 160, 360, 300]),
      ]),
    ).toEqual([{ element: 1, other: 0, edge: "left", of: "box", by: 4 }]);
  });

  test("leaves what the audience does not see as a box out: inline text, decoration, a beat not yet shown, a drawing's parts, a tilted window", () => {
    expect(
      findMisalignments([
        el("p", [64, 64, 600, 30]),
        el("strong", [66, 64, 60, 32], { inline: true }),
        el("div.glow", [67, 100, 600, 200], { decorative: true }),
        el("li", [69, 320, 600, 30], { opacity: 0 }),
        el("svg", [64, 400, 600, 200], { picture: true }),
        el("rect", [66, 400, 100, 50], { parent: 4 }),
        el("rect", [200, 403, 100, 50], { parent: 4 }),
        el("figure.window", [67, 620, 600, 60], { tilted: true }),
      ]),
    ).toEqual([]);
  });

  test("compares only items in one parent, side by side or stacked", () => {
    expect(
      findMisalignments([
        el("div.left", [64, 100, 500, 500]),
        el("p", [66, 120, 400, 30], { parent: 0 }),
        el("div.right", [600, 103, 500, 500]),
        el("p.diagonal", [1000, 700, 50, 10]),
      ]),
    ).toEqual([{ element: 2, other: 0, edge: "top", of: "box", by: 3 }]);
  });
});
