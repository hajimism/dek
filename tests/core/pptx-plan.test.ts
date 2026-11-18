import { describe, expect, test } from "bun:test";
import type { PptxLayer, PptxShape } from "../../src/core/pptx-package.ts";
import {
  type PptxBlockText,
  type PptxMeasuredRun,
  type PptxPageFacts,
  type PptxPaintNode,
  planPptxLayers,
  pptxPageFacts,
} from "../../src/core/pptx-plan.ts";
import type { Box } from "../../src/core/slide-measure.ts";

// What becomes of a slide's boxes, pictures, and text, decided from what the page measured:
// no browser here, only the measurements a slide would give.

const GRAY = { color: [240, 240, 240] as [number, number, number], alpha: 1 };
const BLACK = { color: [0, 0, 0] as [number, number, number], alpha: 1 };

const rect = (left: number, top: number, right: number, bottom: number): Box => ({
  left,
  top,
  right,
  bottom,
});

const run = (text: string, owner: number, size = 20): PptxMeasuredRun => ({
  text,
  size,
  use: 0,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: [20, 20, 20],
  alpha: 1,
  letterSpacing: 0,
  owner,
});

/** A line of text as the page measures it: its glyphs' box, in the block that sets it. */
const line = (block: number, owner: number, text: string, x: number, y: number, width = 200) => ({
  x,
  y,
  width,
  height: 26,
  lineHeight: 26,
  block,
  runs: [run(text, owner)],
});

/** A block's text, set at 32px a line, its content box as given. */
const block = (node: number, text: string, content: Box, more: Partial<PptxBlockText> = {}) => ({
  node,
  runs: [run(text, node)],
  align: "left" as const,
  lineHeight: 32,
  content,
  textIndent: 0,
  ...more,
});

const card = (content: Box, outer: Box, more: Partial<PptxPaintNode> = {}): PptxPaintNode => ({
  parent: -1,
  key: [0, 0],
  rect: outer,
  paint: { kind: "shape", content, fill: GRAY, radius: 8 },
  ...more,
});

const facts = (more: Partial<PptxPageFacts>): PptxPageFacts => ({
  nodes: [],
  drawn: [],
  markers: [],
  boxes: [],
  blocks: [],
  described: [],
  ...more,
});

/**
 * A card at 100,100 to 500,400, padded 20, holding a heading (node 1) on one line at 36px a
 * line, and a paragraph (node 2) on two lines at 32px a line, 14px below it.
 */
function plainCard(): PptxPageFacts {
  const content = rect(120, 120, 480, 380);
  return facts({
    nodes: [
      card(content, rect(100, 100, 500, 400)),
      { parent: 0, key: [0, 0, 0, 1], rect: rect(120, 120, 480, 156) },
      { parent: 0, key: [0, 0, 0, 2], rect: rect(120, 170, 480, 234) },
    ],
    boxes: [
      { ...line(1, 1, "見出し", 120, 121), height: 34, lineHeight: 34 },
      line(2, 2, "本文の一行目と", 120, 173),
      line(2, 2, "二行目", 120, 205),
    ],
    blocks: [
      block(1, "見出し", rect(120, 120, 480, 156), { lineHeight: 36 }),
      block(2, "本文の一行目と二行目", rect(120, 170, 480, 234)),
    ],
  });
}

const shapes = (layers: PptxLayer<{ node: number }>[]) =>
  layers.filter((layer): layer is PptxShape<{ node: number }> => layer.kind === "shape");

describe("planPptxLayers", () => {
  test("makes a plain card a shape, its text the shape's in paragraphs set where they were", () => {
    const plan = planPptxLayers(plainCard());
    expect(plan.lifted.shapes).toEqual([0]);
    const [shape] = shapes(plan.layers);
    expect(plan.layers).toHaveLength(1);
    expect(shape).toMatchObject({
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      fill: GRAY,
      radius: 8,
      layers: [],
    });
    expect(shape?.text?.wrap).toBe(true);
    // The heading's line box starts at the content box, so the text sits from its top; text
    // that wraps is given a pixel and a half of the padding past its lines' ends.
    expect(shape?.text?.inset).toEqual({ left: 20, top: 20, right: 18.5, bottom: 20 });
    // The paragraph is broken where the browser broke it.
    expect(
      shape?.text?.paragraphs.map((p) => [p.lineHeight, p.spaceBefore, p.runs[0]?.text]),
    ).toEqual([
      [36, 0, "見出し"],
      [32, 14, "本文の一行目と\n二行目"],
    ]);
  });

  test("breaks a paragraph where the browser broke it, after the space, and a <br> only once", () => {
    const page = plainCard();
    page.boxes[1] = line(2, 2, "one two", 120, 173);
    page.boxes[2] = line(2, 2, "three", 120, 205);
    page.blocks[1] = block(2, "one two three", rect(120, 170, 480, 234));
    expect(shapes(planPptxLayers(page).layers)[0]?.text?.paragraphs[1]?.runs[0]?.text).toBe(
      "one two \nthree",
    );
    page.blocks[1] = block(2, "one two\nthree", rect(120, 170, 480, 234));
    expect(shapes(planPptxLayers(page).layers)[0]?.text?.paragraphs[1]?.runs[0]?.text).toBe(
      "one two\nthree",
    );
  });

  test("wraps a text only where every line has room, and gives one that does not the padding", () => {
    const tight = plainCard();
    // The paragraph's first line fills the content box, and the card has no padding past it to
    // give: PowerPoint would break the line again.
    tight.nodes[0] = card(rect(120, 120, 500, 380), rect(100, 100, 500, 400));
    tight.blocks[1] = block(2, "本文の一行目と二行目", rect(120, 170, 500, 234));
    tight.boxes[1] = line(2, 2, "本文の一行目と", 120, 173, 380);
    const text = shapes(planPptxLayers(tight).layers)[0]?.text;
    expect(text?.wrap).toBe(false);
    expect(text?.inset.right).toBe(0);
    // With padding to give, the same line fits, and the text wraps.
    const padded = plainCard();
    padded.boxes[1] = line(2, 2, "本文の一行目と", 120, 173, 360);
    expect(shapes(planPptxLayers(padded).layers)[0]?.text?.wrap).toBe(true);

    // A text all on one line wraps only with room to spare: a chip drawn to its text does not.
    const chip = (width: number) =>
      facts({
        nodes: [card(rect(112, 100, 168, 140), rect(100, 100, 180, 140))],
        boxes: [line(0, 0, "タグ", 112, 107, width)],
        blocks: [block(0, "タグ", rect(112, 100, 168, 140))],
      });
    expect(shapes(planPptxLayers(chip(56)).layers)[0]?.text?.wrap).toBe(false);
    expect(shapes(planPptxLayers(chip(40)).layers)[0]?.text?.wrap).toBe(true);
  });

  test("sets text that starts above its shape, or off its margin, out of the shape's own", () => {
    const above = plainCard();
    // A label set over the card's top edge: an inset cannot start it there.
    above.boxes[0] = { ...line(1, 1, "見出し", 120, 81), height: 34, lineHeight: 34 };
    above.blocks[0] = block(1, "見出し", rect(120, 80, 480, 116), { lineHeight: 36 });
    const [lifted] = shapes(planPptxLayers(above).layers);
    expect(lifted?.text).toBeUndefined();
    expect(lifted?.layers.map((layer) => layer.kind)).toEqual(["prose", "prose"]);

    const moved = plainCard();
    // A line the browser started after something else: a paragraph would start it at its margin.
    moved.boxes[1] = line(2, 2, "本文の一行目と", 160, 173);
    const [held] = shapes(planPptxLayers(moved).layers);
    expect(held?.text).toBeUndefined();
    expect(held?.layers.map((layer) => layer.kind)).toEqual(["prose", "text", "text"]);
  });

  test("keeps a box that would cover something left in the picture, and the text beside it in lines", () => {
    const page = plainCard();
    // A highlight with a gradient inside the paragraph stays drawn.
    page.nodes.push({
      parent: 2,
      key: [0, 0, 0, 2, 0, 3],
      rect: rect(120, 173, 200, 199),
      paint: { kind: "drawn", extent: rect(120, 173, 200, 199) },
    });
    const plan = planPptxLayers(page);
    expect(plan.lifted.shapes).toEqual([]);
    // The heading is a text box of its own; the paragraph the highlight is set in stays in lines.
    expect(plan.layers.map((layer) => layer.kind)).toEqual(["prose", "text", "text"]);
  });

  test("keeps a box that something drawn later covers, and not one drawn over something earlier", () => {
    const over = plainCard();
    // A pseudo-element of the slide, positioned, which paints after the cards in the flow.
    over.drawn.push({ within: -1, key: [1, 99], extent: rect(450, 350, 600, 450) });
    expect(planPptxLayers(over).lifted.shapes).toEqual([]);

    const under = plainCard();
    // One at z-index -1, beneath everything.
    under.drawn.push({ within: -1, key: [-1, 99], extent: rect(450, 350, 600, 450) });
    expect(planPptxLayers(under).lifted.shapes).toEqual([0]);

    const apart = plainCard();
    apart.drawn.push({ within: -1, key: [1, 99], extent: rect(600, 350, 700, 450) });
    expect(planPptxLayers(apart).lifted.shapes).toEqual([0]);
  });

  test("keeps what holds a picture something drawn covers, and the picture, until nothing changes", () => {
    const page = plainCard();
    page.nodes.push({
      parent: 0,
      key: [0, 0, 0, 3],
      rect: rect(400, 120, 440, 160),
      paint: { kind: "picture", description: "an icon" },
    });
    // Text left in the picture, a rotated label, over the icon: the icon stays, so the card does.
    page.drawn.push({ within: 0, key: [0, 0, 0, 4], extent: rect(420, 130, 470, 150) });
    const plan = planPptxLayers(page);
    expect(plan.lifted).toEqual({ shapes: [], pictures: [], markers: [] });
  });

  test("groups a shape with its picture and the shape inside it, in the order they were painted", () => {
    const page = plainCard();
    page.nodes.push(
      {
        parent: 0,
        key: [0, 0, 0, 4],
        rect: rect(300, 300, 380, 340),
        paint: { kind: "shape", content: rect(312, 300, 368, 340), fill: BLACK, radius: 16 },
      },
      {
        parent: 0,
        key: [0, 0, 0, 3],
        rect: rect(400, 300, 440, 340),
        paint: { kind: "picture", description: "an icon" },
      },
    );
    page.boxes.push(line(3, 3, "タグ", 316, 307, 48));
    page.blocks.push(block(3, "タグ", rect(312, 300, 368, 340)));
    const plan = planPptxLayers(page);
    const [shape] = shapes(plan.layers);
    expect(shape?.layers.map((layer) => layer.kind)).toEqual(["picture", "shape"]);
    expect(shape?.layers[0]).toMatchObject({ kind: "picture", node: 4, description: "an icon" });
    const chip = shape?.layers[1];
    // One line, centered in its box with room to spare, set from where its line box starts.
    expect(chip?.kind === "shape" && chip.text).toMatchObject({
      wrap: true,
      inset: { left: 12, top: 4, right: 12, bottom: 0 },
    });
    expect(plan.lifted.pictures).toEqual([4]);
    expect(plan.lifted.shapes).toEqual([0, 3]);
  });

  test("leaves the text of a shape that does not read as a column in line boxes, in its group", () => {
    const page = plainCard();
    // The second line holds two pieces set apart, as a chip's padding sets them.
    page.boxes.push(line(2, 2, "離れた字", 380, 205, 60));
    page.blocks[1] = block(2, "本文の一行目と二行目離れた字", rect(120, 170, 480, 234));
    const plan = planPptxLayers(page);
    const [shape] = shapes(plan.layers);
    expect(shape?.text).toBeUndefined();
    // The heading is still plain lines, a text box of its own; the paragraph is line by line.
    expect(shape?.layers.map((layer) => layer.kind)).toEqual(["prose", "text", "text", "text"]);
  });

  test("leaves a shape's text in lines when the page's runs say other than its lines", () => {
    const page = plainCard();
    page.blocks[1] = block(2, "違う字", rect(120, 170, 480, 234));
    const [shape] = shapes(planPptxLayers(page).layers);
    expect(shape?.text).toBeUndefined();
  });

  test("sets a shape's text from the top, where it starts, however the box placed it", () => {
    const page = plainCard();
    const [atFoot] = page.nodes;
    if (atFoot?.paint?.kind !== "shape") {
      throw new Error("no card");
    }
    // The text, from 120 to 234, set at the foot of a content box from 0: it starts 140 down.
    atFoot.paint.content = rect(120, 0, 480, 234);
    atFoot.rect = rect(100, -20, 500, 254);
    const [foot] = shapes(planPptxLayers(page).layers);
    expect(foot?.text?.inset).toEqual({ left: 20, top: 140, right: 18.5, bottom: 20 });
  });

  test("aligns a line as it sits in its block, centered or flush right though the CSS says left", () => {
    const page = plainCard();
    // The heading's one line, 84px wide, centered in its 360px content box; the paragraph's
    // two lines flush right.
    page.boxes[0] = { ...line(1, 1, "見出し", 258, 121, 84), height: 34, lineHeight: 34 };
    page.boxes[1] = line(2, 2, "本文の一行目と", 280, 173);
    page.boxes[2] = line(2, 2, "二行目", 380, 205, 100);
    const paragraphs = shapes(planPptxLayers(page).layers)[0]?.text?.paragraphs;
    expect(paragraphs?.map((p) => p.align)).toEqual(["center", "right"]);
    expect(planPptxLayers(plainCard()).layers[0]).toMatchObject({
      text: { paragraphs: [{ align: "left" }, { align: "left" }] },
    });
  });

  test("sets a list marker PowerPoint has as the paragraph's bullet, hung where it was drawn", () => {
    const page = plainCard();
    page.nodes[2] = { ...page.nodes[2], rect: rect(144, 170, 480, 234) } as PptxPaintNode;
    page.blocks[1] = block(2, "本文の一行目と二行目", rect(144, 170, 480, 234));
    page.boxes[1] = line(2, 2, "本文の一行目と", 144, 173);
    page.boxes[2] = line(2, 2, "二行目", 144, 205);
    page.markers.push({
      node: 2,
      key: [0, 0, 0, 2, 0, 2.1],
      extent: rect(126, 173, 138, 199),
      bullet: { char: "•" },
    });
    const plan = planPptxLayers(page);
    expect(plan.lifted.markers).toEqual([2]);
    const paragraph = shapes(plan.layers)[0]?.text?.paragraphs[1];
    expect(paragraph).toMatchObject({ marginLeft: 24, indent: -18, bullet: { char: "•" } });
  });

  test("numbers a list from the first item of each run of numbered paragraphs", () => {
    const page = plainCard();
    page.markers.push(
      {
        node: 1,
        key: [0, 0, 0, 1, 0, 1.1],
        extent: rect(104, 121, 116, 147),
        bullet: { ordinal: 3 },
      },
      {
        node: 2,
        key: [0, 0, 0, 2, 0, 2.1],
        extent: rect(104, 173, 116, 199),
        bullet: { ordinal: 4 },
      },
    );
    const paragraphs = shapes(planPptxLayers(page).layers)[0]?.text?.paragraphs;
    expect(paragraphs?.map((p) => p.bullet)).toEqual([{ startAt: 3 }, { startAt: 3 }]);
  });

  test("keeps the box of a list whose marker is left in the picture", () => {
    const page = plainCard();
    // Two pieces on one line: the text is not a column, so the marker is not a bullet.
    page.boxes.push(line(2, 2, "離れた字", 380, 205, 60));
    page.blocks[1] = block(2, "本文の一行目と二行目離れた字", rect(120, 170, 480, 234));
    page.markers.push({
      node: 2,
      key: [0, 0, 0, 2, 0, 2.1],
      extent: rect(104, 173, 116, 199),
      bullet: { char: "•" },
    });
    const plan = planPptxLayers(page);
    expect(plan.lifted).toEqual({ shapes: [], pictures: [], markers: [] });
  });

  test("draws a border that differs per side as lines, and a box with only those as only lines", () => {
    const side = { width: 2, paint: BLACK };
    const page = facts({
      nodes: [
        {
          parent: -1,
          key: [0, 0],
          rect: rect(100, 100, 500, 140),
          paint: {
            kind: "shape",
            content: rect(100, 100, 500, 138),
            radius: 0,
            sides: { bottom: side },
          },
        },
        {
          parent: -1,
          key: [0, 1],
          rect: rect(100, 140, 500, 180),
          paint: {
            kind: "shape",
            content: rect(102, 140, 500, 178),
            radius: 0,
            fill: GRAY,
            sides: { bottom: side, left: side },
          },
        },
      ],
    });
    const plan = planPptxLayers(page);
    expect(plan.layers.map((layer) => layer.kind)).toEqual(["rule", "shape"]);
    expect(plan.layers[0]).toEqual({
      kind: "rule",
      x1: 100,
      y1: 139,
      x2: 500,
      y2: 139,
      width: 2,
      paint: BLACK,
    });
    const [filled] = shapes(plan.layers);
    expect(filled?.layers).toEqual([
      { kind: "rule", x1: 100, y1: 179, x2: 500, y2: 179, width: 2, paint: BLACK },
      { kind: "rule", x1: 101, y1: 140, x2: 101, y2: 180, width: 2, paint: BLACK },
    ]);
  });

  test("describes the slide's picture by what stays in it, and each picture by its own", () => {
    const page = plainCard();
    page.nodes.push({
      parent: 0,
      key: [0, 0, 0, 3],
      rect: rect(400, 300, 440, 340),
      paint: { kind: "picture", description: "an icon" },
    });
    page.described.push({ node: 3, text: "an icon" }, { node: -1, text: "the venue" });
    expect(planPptxLayers(page).description).toBe("the venue");
  });

  test("lays text out of any shape over the shapes it was painted after", () => {
    const page = plainCard();
    page.nodes.push({ parent: -1, key: [1, 9], rect: rect(150, 380, 300, 420) });
    page.boxes.push(line(3, 3, "上の字", 150, 385));
    page.blocks.push(block(3, "上の字", rect(150, 380, 300, 420)));
    const plan = planPptxLayers(page);
    expect(plan.layers.map((layer) => layer.kind)).toEqual(["shape", "prose"]);
  });

  test("lays the text of a line over a highlight in it, in the shape that holds both", () => {
    const page = plainCard();
    page.nodes.push({
      parent: 2,
      key: [0, 0, 0, 2, 0, 3],
      rect: rect(180, 173, 260, 199),
      paint: { kind: "shape", content: rect(180, 173, 260, 199), fill: BLACK, radius: 0 },
      flow: "inline",
    });
    page.boxes[1] = {
      ...line(2, 2, "", 120, 173),
      runs: [run("本文の", 2), run("一行目", 3), run("と", 2)],
    };
    const plan = planPptxLayers(page);
    const inner = shapes(plan.layers)[0]?.layers ?? [];
    const highlight = inner.findIndex((layer) => layer.kind === "shape");
    const words = inner.findIndex(
      (layer) => layer.kind === "text" && layer.runs.some((each) => each.text === "一行目"),
    );
    expect(highlight).toBeGreaterThanOrEqual(0);
    expect(words).toBeGreaterThan(highlight);
  });

  test("keeps in the picture what a negative z-index puts beneath, and what it is in", () => {
    const apart = plainCard();
    apart.nodes.push({
      parent: -1,
      key: [-1, 3],
      rect: rect(600, 100, 700, 200),
      paint: { kind: "shape", content: rect(600, 100, 700, 200), fill: BLACK, radius: 0 },
    });
    expect(planPptxLayers(apart).lifted.shapes).toEqual([0]);

    const inside = plainCard();
    inside.nodes.push({
      parent: 0,
      key: [0, 0, -1, 3],
      rect: rect(300, 300, 400, 380),
      paint: { kind: "shape", content: rect(300, 300, 400, 380), fill: BLACK, radius: 0 },
    });
    expect(planPptxLayers(inside).lifted.shapes).toEqual([]);
  });

  test("keeps the later of two shapes laid over in an order the browser may not paint them in", () => {
    const box = (left: number, right: number) => ({
      kind: "shape" as const,
      content: rect(left, 100, right, 300),
      fill: GRAY,
      radius: 0,
    });
    // A badge positioned in the first card, over the second: positioned, it paints after both.
    const page = facts({
      nodes: [
        { parent: -1, key: [0, 0], rect: rect(100, 100, 300, 300), paint: box(100, 300) },
        { parent: 0, key: [0, 0, 1, 1], rect: rect(280, 100, 340, 140), paint: box(280, 340) },
        { parent: -1, key: [0, 2], rect: rect(300, 100, 500, 300), paint: box(300, 500) },
      ],
    });
    expect(planPptxLayers(page).lifted.shapes).toEqual([0, 1]);
  });

  test("paints a block's text after the backgrounds of the blocks around it, as CSS does", () => {
    const page = facts({
      nodes: [
        { parent: -1, key: [0, 0], rect: rect(100, 100, 300, 130) },
        {
          parent: -1,
          key: [0, 1],
          rect: rect(100, 120, 300, 300),
          paint: { kind: "shape", content: rect(100, 120, 300, 300), fill: GRAY, radius: 0 },
        },
      ],
      boxes: [line(0, 0, "はみ出す字", 100, 112)],
      blocks: [block(0, "はみ出す字", rect(100, 100, 300, 130))],
    });
    // Text that runs into the next block is painted over its background, so it is laid over it.
    const plan = planPptxLayers(page);
    expect(plan.lifted.shapes).toEqual([1]);
    expect(plan.layers.map((layer) => layer.kind)).toEqual(["shape", "prose"]);

    // The same text with a shadow stays drawn, over the block: the block stays too.
    page.drawn.push({ within: 0, key: [0, 0, 0, 0.5], extent: rect(100, 108, 300, 142) });
    expect(planPptxLayers(page).lifted.shapes).toEqual([]);
  });

  test("paints a picture after the backgrounds of the blocks around it, block-level or not", () => {
    const page = facts({
      nodes: [
        {
          parent: -1,
          key: [0, 0],
          rect: rect(100, 100, 300, 200),
          paint: { kind: "picture", description: "a photo" },
          flow: "inline",
        },
        {
          parent: -1,
          key: [0, 1],
          rect: rect(100, 180, 300, 300),
          paint: { kind: "shape", content: rect(100, 180, 300, 300), fill: GRAY, radius: 0 },
        },
      ],
    });
    expect(planPptxLayers(page).layers.map((layer) => layer.kind)).toEqual(["shape", "picture"]);
  });

  test("sets two lists numbered apart each in a text box, which one text would number as one", () => {
    const page = plainCard();
    page.markers.push(
      {
        node: 1,
        key: [0, 0, 0, 1, 0, 1.1],
        extent: rect(104, 121, 116, 147),
        bullet: { ordinal: 1 },
      },
      {
        node: 2,
        key: [0, 0, 0, 2, 0, 2.1],
        extent: rect(104, 173, 116, 199),
        bullet: { ordinal: 1 },
      },
    );
    const plan = planPptxLayers(page);
    expect(plan.lifted).toEqual({ shapes: [0], pictures: [], markers: [1, 2] });
    const [shape] = shapes(plan.layers);
    expect(shape?.text).toBeUndefined();
    expect(
      shape?.layers.map((layer) => layer.kind === "prose" && layer.text.paragraphs[0]?.bullet),
    ).toEqual([{ startAt: 1 }, { startAt: 1 }]);
  });

  test("sets a block no shape takes in a text box as wide as the block, on the slide", () => {
    const free = (more: Partial<PptxBlockText> = {}, x = 100, size?: PptxPageFacts["size"]) =>
      facts({
        nodes: [{ parent: -1, key: [0, 0], rect: rect(100, 100, 500, 132) }],
        boxes: [line(0, 0, "本文", x, 103)],
        blocks: [block(0, "本文", rect(100, 100, 500, 132), more)],
        ...(size ? { size } : {}),
      });
    // Its line box starts where the glyphs, centered in a 32px line, put it; it wraps, and is
    // a pixel and a half wider on the side its lines end on.
    expect(planPptxLayers(free()).layers).toMatchObject([
      {
        kind: "prose",
        x: 100,
        y: 100,
        width: 401.5,
        height: 32,
        text: { wrap: true, inset: { left: 0, top: 0, right: 0, bottom: 0 } },
      },
    ]);
    // Centered text grows on both sides, by its box and by no margin; right-aligned on the left.
    expect(planPptxLayers(free({ align: "center" }, 200)).layers).toMatchObject([
      { x: 98.5, width: 403, text: { paragraphs: [{ marginLeft: 0, marginRight: 0 }] } },
    ]);
    expect(planPptxLayers(free({ align: "right" }, 300)).layers).toMatchObject([
      { x: 98.5, width: 401.5 },
    ]);
    // Never past the slide's edge.
    expect(planPptxLayers(free({}, 100, { width: 501, height: 720 })).layers).toMatchObject([
      { x: 100, width: 401 },
    ]);
    // A line whose first character's ink a feature moved left starts that much earlier.
    const led = free();
    led.boxes[0] = { ...line(0, 0, "「本文", 100, 103), shift: -10 };
    led.blocks[0] = block(0, "「本文", rect(100, 100, 500, 132));
    expect(planPptxLayers(led).layers).toMatchObject([{ x: 90, width: 411.5 }]);
  });

  test("sets a list no shape takes in one text box, an item a paragraph with its bullet", () => {
    const item = (node: number, top: number): PptxPaintNode => ({
      parent: -1,
      key: [0, node],
      rect: rect(124, top, 500, top + 32),
    });
    const page = facts({
      nodes: [item(0, 100), item(1, 132)],
      boxes: [line(0, 0, "一つ目", 124, 103), line(1, 1, "二つ目", 124, 135)],
      blocks: [
        block(0, "一つ目", rect(124, 100, 500, 132), { list: 9 }),
        block(1, "二つ目", rect(124, 132, 500, 164), { list: 9 }),
      ],
      markers: [0, 1].map((node) => ({
        node,
        key: [0, node, 0, node + 0.1],
        extent: rect(104, 103 + node * 32, 116, 129 + node * 32),
        bullet: { char: "•" },
      })),
    });
    const plan = planPptxLayers(page);
    expect(plan.lifted.markers).toEqual([0, 1]);
    expect(plan.layers).toHaveLength(1);
    // The box starts where the bullets hang, and each item is hung from its margin.
    expect(plan.layers[0]).toMatchObject({
      kind: "prose",
      x: 104,
      text: {
        paragraphs: [
          { marginLeft: 20, indent: -20, bullet: { char: "•" }, runs: [{ text: "一つ目" }] },
          { marginLeft: 20, indent: -20, bullet: { char: "•" }, runs: [{ text: "二つ目" }] },
        ],
      },
    });
  });

  test("makes the slide's highest heading its title, the first of them, and none in a shape", () => {
    const heading = (node: number, top: number, level: number) => ({
      node: { parent: -1, key: [0, node], rect: rect(100, top, 500, top + 32) } as PptxPaintNode,
      box: line(node, node, `見出し${node}`, 100, top + 3),
      block: block(node, `見出し${node}`, rect(100, top, 500, top + 32), { heading: level }),
    });
    const parts = [heading(0, 100, 3), heading(1, 140, 2), heading(2, 180, 2)];
    const plan = planPptxLayers(
      facts({
        nodes: parts.map((part) => part.node),
        boxes: parts.map((part) => part.box),
        blocks: parts.map((part) => part.block),
      }),
    );
    expect(plan.layers.map((layer) => layer.kind === "prose" && layer.title === true)).toEqual([
      false,
      true,
      false,
    ]);

    // The card's heading is in the card's group, where PowerPoint keeps no title.
    const carded = plainCard();
    carded.boxes[0] = { ...line(1, 1, "見出し", 120, 81), height: 34, lineHeight: 34 };
    carded.blocks[0] = block(1, "見出し", rect(120, 80, 480, 116), { lineHeight: 36, heading: 2 });
    const [group] = shapes(planPptxLayers(carded).layers);
    expect(group?.layers.some((layer) => layer.kind === "prose" && layer.title)).toBe(false);
  });

  test("leaves in lines text that is not where its alignment would put it", () => {
    // A label whose style centers it, set after a dot the two side by side: its one line ends
    // at the far edge of its 400px content box, and a paragraph would center it.
    const set = (align: "center" | "right", x: number) =>
      planPptxLayers(
        facts({
          nodes: [{ parent: -1, key: [0, 0], rect: rect(100, 100, 500, 132) } as PptxPaintNode],
          boxes: [line(0, 0, "ラベル", x, 103)],
          blocks: [block(0, "ラベル", rect(100, 100, 500, 132), { align })],
        }),
      ).layers.map((layer) => layer.kind);
    expect(set("center", 300)).toEqual(["text"]);
    // Centered where centering puts it, and flush right where that does: a text box each.
    expect(set("center", 200)).toEqual(["prose"]);
    expect(set("right", 300)).toEqual(["prose"]);
    expect(set("right", 200)).toEqual(["text"]);
  });

  test("lets go of a box under a pseudo-element that draws only text the file carries", () => {
    const page = plainCard();
    const place = (bare: boolean, pseudos: string[]) =>
      pptxPageFacts(
        {
          origin: { left: 0, top: 0 },
          nodes: page.nodes,
          pseudos: [{ host: 0, pseudo: "after", key: [0, 0, 1, 2.75], reach: 0, bare }],
          described: [],
        },
        { boxes: page.boxes, blocks: page.blocks, drawn: [], uses: [], pseudos },
        new Map([["0::after", rect(440, 340, 480, 370)]]),
      );
    // Its text is a text box now: nothing of it is left in the picture for the card to cover.
    expect(planPptxLayers(place(true, ["0::after"])).lifted.shapes).toEqual([0]);
    // One whose text stayed drawn, or that draws a box of its own, still keeps the card.
    expect(planPptxLayers(place(true, [])).lifted.shapes).toEqual([]);
    expect(planPptxLayers(place(false, ["0::after"])).lifted.shapes).toEqual([]);
  });

  test("writes no margin below zero: what starts left of the content box moves the inset", () => {
    const page = plainCard();
    // The paragraph a pixel's noise out of the card's content box, on both sides.
    page.blocks[1] = block(2, "本文の一行目と二行目", rect(119.1, 170, 480.9, 234));
    const text = shapes(planPptxLayers(page).layers)[0]?.text;
    expect(text?.paragraphs.map((p) => [p.marginLeft, p.marginRight])).toEqual([
      [expect.closeTo(0.9, 5), 0],
      [0, 0],
    ]);
    expect(text?.inset.left).toBeCloseTo(19.1, 5);
  });

  test("leaves a block's text in lines when its lines are set farther apart than its pitch", () => {
    const page = plainCard();
    page.boxes[2] = line(2, 2, "二行目", 120, 215);
    expect(shapes(planPptxLayers(page).layers)[0]?.text).toBeUndefined();
  });

  test("takes a pseudo-element Chromium does not place to draw anywhere in its element", () => {
    const page = plainCard();
    const facts = pptxPageFacts(
      {
        origin: { left: 0, top: 0 },
        nodes: page.nodes,
        pseudos: [{ host: 0, pseudo: "after", key: [0, 0, 1, 2.75], reach: 0 }],
        described: [],
      },
      { boxes: page.boxes, blocks: page.blocks, drawn: [], uses: [], pseudos: [] },
      new Map(),
    );
    expect(planPptxLayers(facts).lifted.shapes).toEqual([]);
  });

  test("keeps a box a hairline left in the picture crosses", () => {
    const page = plainCard();
    page.drawn.push({ within: -1, key: [1, 99], extent: rect(300, 250, 300.4, 450) });
    expect(planPptxLayers(page).lifted.shapes).toEqual([]);
  });

  test("lays a picture over as far as its outline reaches, and keeps it for what that covers", () => {
    const icon = (extent: Box): PptxPaintNode => ({
      parent: -1,
      key: [0, 0],
      rect: rect(100, 100, 140, 140),
      paint: { kind: "picture", description: "an icon", extent },
    });
    const framed = facts({ nodes: [icon(rect(96, 96, 144, 144))] });
    expect(planPptxLayers(framed).layers).toEqual([
      { kind: "picture", x: 96, y: 96, width: 48, height: 48, description: "an icon", node: 0 },
    ]);
    framed.drawn.push({ within: -1, key: [1, 9], extent: rect(141, 100, 160, 120) });
    expect(planPptxLayers(framed).lifted.pictures).toEqual([]);
  });

  test("takes the slide's background out of its picture, unless something is laid out under it", () => {
    const fill = { kind: "solid" as const, paint: BLACK };
    const plain = plainCard();
    plain.slide = { background: fill, stacking: false };
    expect(planPptxLayers(plain).background).toEqual(fill);

    // Something a negative z-index puts beneath the slide's own paint, which hides it.
    const under = plainCard();
    under.slide = { background: fill, stacking: false };
    under.drawn.push({ within: -1, key: [-1, 9], extent: rect(0, 0, 50, 50) });
    expect(planPptxLayers(under).background).toBeUndefined();
    // In a slide that is a stacking context of its own, it paints over the background.
    under.slide.stacking = true;
    expect(planPptxLayers(under).background).toEqual(fill);
  });

  test("reads the slide's background from what the page computed, when the slide is plain", () => {
    const paint = (plain: boolean) => ({
      origin: { left: 0, top: 0 },
      nodes: [],
      pseudos: [],
      described: [],
      slide: { paint: BLACK, image: "none", plain, stacking: true, width: 1280, height: 720 },
    });
    const texts = { boxes: [], blocks: [], drawn: [], uses: [], pseudos: [] };
    expect(pptxPageFacts(paint(true), texts, new Map()).slide).toEqual({
      background: { kind: "solid", paint: BLACK },
      stacking: true,
    });
    expect(pptxPageFacts(paint(false), texts, new Map()).slide?.background).toBeUndefined();
  });
});
