import { describe, expect, test } from "bun:test";
import { measureFill } from "../../src/core/fill.ts";
import type { Box, MeasuredElement } from "../../src/core/slide-measure.ts";

// Twice as wide as tall, so a mixed-up width and height shows.
const FRAME: Box = { left: 0, top: 0, right: 200, bottom: 100 };
const none = Array.from({ length: 10 }, () => 0);

/** An element with nothing to read or look at; each test gives it what it is about. */
function element(fields: Partial<MeasuredElement>): MeasuredElement {
  return {
    box: "div",
    parent: -1,
    rect: { left: 0, top: 0, right: 0, bottom: 0 },
    ownText: false,
    textRects: [],
    opacity: 1,
    fontSize: 16,
    fontWeight: 400,
    decorative: false,
    picture: false,
    paints: false,
    ...fields,
  };
}

/** Text whose one line is `line`. */
const text = (line: Box, fields: Partial<MeasuredElement> = {}): MeasuredElement =>
  element({ box: "p", rect: line, ownText: true, text: "words", textRects: [line], ...fields });

describe("measureFill", () => {
  test("finds nothing on an empty slide", () => {
    expect(measureFill(FRAME, [])).toEqual({ coverage: 0, rows: none, columns: none });
  });

  test("measures a line of text across the top tenth", () => {
    const fill = measureFill(FRAME, [text({ left: 0, top: 0, right: 200, bottom: 10 })]);
    expect(fill).toEqual({
      coverage: 0.1,
      box: { left: 0, top: 0, right: 1, bottom: 0.1 },
      rows: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      columns: Array.from({ length: 10 }, () => 0.1),
    });
  });

  test("counts a picture's whole box", () => {
    const fill = measureFill(FRAME, [
      element({ box: "img", picture: true, rect: { left: 0, top: 0, right: 100, bottom: 100 } }),
    ]);
    expect(fill.coverage).toBe(0.5);
    expect(fill.columns).toEqual([1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
    expect(fill.box).toEqual({ left: 0, top: 0, right: 0.5, bottom: 1 });
  });

  // A painted box that holds nothing is a mark the audience looks at: a chart's bar, a swatch.
  test("counts a painted box that holds nothing, as a chart's bar", () => {
    const bar = element({
      box: "div.bar",
      paints: true,
      rect: { left: 0, top: 50, right: 200, bottom: 60 },
    });
    expect(measureFill(FRAME, [bar]).rows).toEqual([0, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
  });

  // A card is as full as what it holds: one whose words sit in its top half leaves the rest empty.
  test("counts a painted box that holds something by what it holds", () => {
    const card = element({
      box: "div.card",
      paints: true,
      rect: { left: 0, top: 0, right: 200, bottom: 100 },
    });
    const words = text({ left: 0, top: 0, right: 200, bottom: 20 }, { parent: 0 });
    expect(measureFill(FRAME, [card, words]).rows).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  test("reads a text's lines, not the box it is laid out in", () => {
    const line = { left: 0, top: 0, right: 40, bottom: 10 };
    const fill = measureFill(FRAME, [
      element({
        box: "p",
        ownText: true,
        rect: { left: 0, top: 0, right: 200, bottom: 100 },
        textRects: [line],
      }),
    ]);
    expect(fill.coverage).toBe(0.02);
    expect(fill.box).toEqual({ left: 0, top: 0, right: 0.2, bottom: 0.1 });
  });

  test("leaves out decoration and what the beat has not shown yet", () => {
    const whole = { left: 0, top: 0, right: 200, bottom: 100 };
    const fill = measureFill(FRAME, [
      text(whole, { decorative: true }),
      text(whole, { opacity: 0 }),
      element({ picture: true, rect: whole, decorative: true }),
    ]);
    expect(fill).toEqual({ coverage: 0, rows: none, columns: none });
  });

  test("counts what overlaps once", () => {
    const line = { left: 0, top: 0, right: 200, bottom: 10 };
    expect(measureFill(FRAME, [text(line), text(line)]).coverage).toBe(0.1);
  });

  test("reads only what the frame and a clipping ancestor leave visible", () => {
    const fill = measureFill(FRAME, [
      text({ left: 150, top: 90, right: 300, bottom: 120 }),
      text(
        { left: 0, top: 0, right: 200, bottom: 50 },
        {
          clip: {
            box: "div.window",
            rect: { left: 0, top: 0, right: 50, bottom: 30 },
            intended: false,
          },
        },
      ),
    ]);
    // 50 × 10 inside the frame, and 50 × 30 inside the window: a tenth of 200 × 100.
    expect(fill.box).toEqual({ left: 0, top: 0, right: 1, bottom: 1 });
    expect(fill.coverage).toBe(0.1);
  });

  test("measures against the frame, wherever it sits on the page", () => {
    const frame = { left: 100, top: 50, right: 300, bottom: 150 };
    const fill = measureFill(frame, [text({ left: 100, top: 140, right: 300, bottom: 150 })]);
    expect(fill.rows).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(fill.box).toEqual({ left: 0, top: 0.9, right: 1, bottom: 1 });
  });

  test("rounds each share to two places", () => {
    const fill = measureFill(FRAME, [text({ left: 0, top: 0, right: 200, bottom: 33.4 })]);
    expect(fill.coverage).toBe(0.33);
    expect(fill.box?.bottom).toBe(0.33);
  });
});
