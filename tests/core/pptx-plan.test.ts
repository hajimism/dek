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
  test("lays only the text over the picture without --shapes, line by line, in order", () => {
    const page = plainCard();
    const plan = planPptxLayers(page, { shapes: false });
    expect(plan.layers.map((layer) => layer.kind)).toEqual(["text", "text", "text"]);
    expect(plan.lifted).toEqual({ shapes: [], pictures: [], markers: [] });
    const [first] = plan.layers;
    expect(first?.kind === "text" && first.runs[0]?.text).toBe("見出し");
  });

  test("makes a plain card a shape, its text the shape's in paragraphs set where they were", () => {
    const plan = planPptxLayers(plainCard(), { shapes: true });
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
    // The heading's line box starts at the content box, so the text sits from its top.
    expect(shape?.text?.inset).toEqual({ left: 20, top: 20, right: 20, bottom: 20 });
    expect(
      shape?.text?.paragraphs.map((p) => [p.lineHeight, p.spaceBefore, p.runs[0]?.text]),
    ).toEqual([
      [36, 0, "見出し"],
      [32, 14, "本文の一行目と二行目"],
    ]);
  });

  test("keeps a box that would cover something left in the picture, and its text line by line", () => {
    const page = plainCard();
    // A highlight with a gradient inside the paragraph stays drawn.
    page.nodes.push({
      parent: 2,
      key: [0, 0, 0, 2, 0, 3],
      rect: rect(120, 173, 200, 199),
      paint: { kind: "drawn", extent: rect(120, 173, 200, 199) },
    });
    const plan = planPptxLayers(page, { shapes: true });
    expect(plan.lifted.shapes).toEqual([]);
    expect(plan.layers.map((layer) => layer.kind)).toEqual(["text", "text", "text"]);
  });

  test("keeps a box that something drawn later covers, and not one drawn over something earlier", () => {
    const over = plainCard();
    // A pseudo-element of the slide, positioned, which paints after the cards in the flow.
    over.drawn.push({ within: -1, key: [1, 99], extent: rect(450, 350, 600, 450) });
    expect(planPptxLayers(over, { shapes: true }).lifted.shapes).toEqual([]);

    const under = plainCard();
    // One at z-index -1, beneath everything.
    under.drawn.push({ within: -1, key: [-1, 99], extent: rect(450, 350, 600, 450) });
    expect(planPptxLayers(under, { shapes: true }).lifted.shapes).toEqual([0]);

    const apart = plainCard();
    apart.drawn.push({ within: -1, key: [1, 99], extent: rect(600, 350, 700, 450) });
    expect(planPptxLayers(apart, { shapes: true }).lifted.shapes).toEqual([0]);
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
    const plan = planPptxLayers(page, { shapes: true });
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
    const plan = planPptxLayers(page, { shapes: true });
    const [shape] = shapes(plan.layers);
    expect(shape?.layers.map((layer) => layer.kind)).toEqual(["picture", "shape"]);
    expect(shape?.layers[0]).toMatchObject({ kind: "picture", node: 4, description: "an icon" });
    const chip = shape?.layers[1];
    // One line, centered in its box: kept on one line, set from where its line box starts.
    expect(chip?.kind === "shape" && chip.text).toMatchObject({
      wrap: false,
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
    const plan = planPptxLayers(page, { shapes: true });
    const [shape] = shapes(plan.layers);
    expect(shape?.text).toBeUndefined();
    expect(shape?.layers.map((layer) => layer.kind)).toEqual(["text", "text", "text", "text"]);
  });

  test("leaves a shape's text in lines when the page's runs say other than its lines", () => {
    const page = plainCard();
    page.blocks[1] = block(2, "違う字", rect(120, 170, 480, 234));
    const [shape] = shapes(planPptxLayers(page, { shapes: true }).layers);
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
    const [foot] = shapes(planPptxLayers(page, { shapes: true }).layers);
    expect(foot?.text?.inset).toEqual({ left: 20, top: 140, right: 20, bottom: 20 });
  });

  test("aligns a line as it sits in its block, centered or flush right though the CSS says left", () => {
    const page = plainCard();
    // The heading's one line, 84px wide, centered in its 360px content box; the paragraph's
    // two lines flush right.
    page.boxes[0] = { ...line(1, 1, "見出し", 258, 121, 84), height: 34, lineHeight: 34 };
    page.boxes[1] = line(2, 2, "本文の一行目と", 280, 173);
    page.boxes[2] = line(2, 2, "二行目", 380, 205, 100);
    const paragraphs = shapes(planPptxLayers(page, { shapes: true }).layers)[0]?.text?.paragraphs;
    expect(paragraphs?.map((p) => p.align)).toEqual(["center", "right"]);
    expect(planPptxLayers(plainCard(), { shapes: true }).layers[0]).toMatchObject({
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
    const plan = planPptxLayers(page, { shapes: true });
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
    const paragraphs = shapes(planPptxLayers(page, { shapes: true }).layers)[0]?.text?.paragraphs;
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
    const plan = planPptxLayers(page, { shapes: true });
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
    const plan = planPptxLayers(page, { shapes: true });
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
    expect(planPptxLayers(page, { shapes: true }).description).toBe("the venue");
    expect(planPptxLayers(page, { shapes: false }).description).toBe("an icon / the venue");
  });

  test("lays text out of any shape over the shapes it was painted after", () => {
    const page = plainCard();
    page.nodes.push({ parent: -1, key: [1, 9], rect: rect(150, 380, 300, 420) });
    page.boxes.push(line(3, 3, "上の字", 150, 385));
    page.blocks.push(block(3, "上の字", rect(150, 380, 300, 420)));
    const plan = planPptxLayers(page, { shapes: true });
    expect(plan.layers.map((layer) => layer.kind)).toEqual(["shape", "text"]);
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
    const plan = planPptxLayers(page, { shapes: true });
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
    expect(planPptxLayers(apart, { shapes: true }).lifted.shapes).toEqual([0]);

    const inside = plainCard();
    inside.nodes.push({
      parent: 0,
      key: [0, 0, -1, 3],
      rect: rect(300, 300, 400, 380),
      paint: { kind: "shape", content: rect(300, 300, 400, 380), fill: BLACK, radius: 0 },
    });
    expect(planPptxLayers(inside, { shapes: true }).lifted.shapes).toEqual([]);
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
    expect(planPptxLayers(page, { shapes: true }).lifted.shapes).toEqual([0, 1]);
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
    const plan = planPptxLayers(page, { shapes: true });
    expect(plan.lifted.shapes).toEqual([1]);
    expect(plan.layers.map((layer) => layer.kind)).toEqual(["shape", "text"]);

    // The same text with a shadow stays drawn, over the block: the block stays too.
    page.drawn.push({ within: 0, key: [0, 0, 0, 0.5], extent: rect(100, 108, 300, 142) });
    expect(planPptxLayers(page, { shapes: true }).lifted.shapes).toEqual([]);
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
    expect(planPptxLayers(page, { shapes: true }).layers.map((layer) => layer.kind)).toEqual([
      "shape",
      "picture",
    ]);
  });

  test("keeps the box of two lists numbered apart, which PowerPoint would number as one", () => {
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
    expect(planPptxLayers(page, { shapes: true }).lifted).toEqual({
      shapes: [],
      pictures: [],
      markers: [],
    });
  });

  test("writes no margin below zero: what starts left of the content box moves the inset", () => {
    const page = plainCard();
    // The paragraph a pixel's noise out of the card's content box, on both sides.
    page.blocks[1] = block(2, "本文の一行目と二行目", rect(119.1, 170, 480.9, 234));
    const text = shapes(planPptxLayers(page, { shapes: true }).layers)[0]?.text;
    expect(text?.paragraphs.map((p) => [p.marginLeft, p.marginRight])).toEqual([
      [expect.closeTo(0.9, 5), 0],
      [0, 0],
    ]);
    expect(text?.inset.left).toBeCloseTo(19.1, 5);
  });

  test("leaves a block's text in lines when its lines are set farther apart than its pitch", () => {
    const page = plainCard();
    page.boxes[2] = line(2, 2, "二行目", 120, 215);
    expect(shapes(planPptxLayers(page, { shapes: true }).layers)[0]?.text).toBeUndefined();
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
      { boxes: page.boxes, blocks: page.blocks, drawn: [] },
      new Map(),
    );
    expect(planPptxLayers(facts, { shapes: true }).lifted.shapes).toEqual([]);
  });

  test("keeps a box a hairline left in the picture crosses", () => {
    const page = plainCard();
    page.drawn.push({ within: -1, key: [1, 99], extent: rect(300, 250, 300.4, 450) });
    expect(planPptxLayers(page, { shapes: true }).lifted.shapes).toEqual([]);
  });

  test("lays a picture over as far as its outline reaches, and keeps it for what that covers", () => {
    const icon = (extent: Box): PptxPaintNode => ({
      parent: -1,
      key: [0, 0],
      rect: rect(100, 100, 140, 140),
      paint: { kind: "picture", description: "an icon", extent },
    });
    const framed = facts({ nodes: [icon(rect(96, 96, 144, 144))] });
    expect(planPptxLayers(framed, { shapes: true }).layers).toEqual([
      { kind: "picture", x: 96, y: 96, width: 48, height: 48, description: "an icon", node: 0 },
    ]);
    framed.drawn.push({ within: -1, key: [1, 9], extent: rect(141, 100, 160, 120) });
    expect(planPptxLayers(framed, { shapes: true }).lifted.pictures).toEqual([]);
  });
});
