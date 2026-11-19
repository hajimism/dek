import { describe, expect, test } from "bun:test";
import {
  hexOf,
  layersFromJson,
  layersToJson,
  pptxJsonSchema,
  rgbOf,
} from "../../src/core/pptx-json.ts";
import type { PptxLayer, PptxParagraph, PptxRun } from "../../src/core/pptx-package.ts";

// deck.pptx.json is what `dekc pptx` would write, as JSON: written out and read back it is the
// same deck, and a layer written by hand needs say only what it sets.

const run = (text: string, extra: Partial<PptxRun> = {}): PptxRun => ({
  text,
  size: 24,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: [15, 23, 42],
  alpha: 1,
  letterSpacing: 0,
  ...extra,
});

const png = new Uint8Array([1, 2, 3]);

const paragraph = (text: string): PptxParagraph => ({
  align: "left",
  lineHeight: 28,
  spaceBefore: 0,
  marginLeft: 0,
  marginRight: 0,
  indent: 0,
  runs: [run(text, { size: 20 })],
});

const layers: PptxLayer[] = [
  { kind: "text", x: 10, y: 20, width: 100, height: 30, lineHeight: 28.8, runs: [run("一行")] },
  {
    kind: "prose",
    x: 72,
    y: 72,
    width: 600,
    height: 80,
    title: true,
    text: {
      inset: { left: 0, top: 0, right: 0, bottom: 0 },
      wrap: true,
      paragraphs: [
        {
          align: "left",
          lineHeight: 32,
          spaceBefore: 0,
          marginLeft: 0,
          marginRight: 0,
          indent: 0,
          runs: [run("見出し", { bold: true, font: "Hiragino Sans W6" })],
        },
      ],
    },
  },
  {
    kind: "shape",
    x: 0,
    y: 200,
    width: 300,
    height: 100,
    fill: { color: [79, 70, 229], alpha: 0.5 },
    outline: { width: 1, paint: { color: [226, 232, 240], alpha: 1 }, dash: "dash" },
    shadow: { x: 0, y: 2, blur: 6, paint: { color: [15, 23, 42], alpha: 0.12 } },
    rotate: -0.8,
    radius: 12,
    layers: [{ kind: "picture", x: 10, y: 210, width: 50, height: 50, description: "icon", png }],
  },
  {
    kind: "shape",
    x: 400,
    y: 200,
    width: 80,
    height: 80,
    radius: 0,
    geometry: "ellipse",
    text: {
      inset: { left: 0, top: 0, right: 0, bottom: 0 },
      wrap: true,
      paragraphs: [
        {
          align: "center",
          lineHeight: 24,
          spaceBefore: 0,
          marginLeft: 0,
          marginRight: 0,
          indent: 0,
          runs: [run("ok", { highlight: [254, 243, 199] })],
        },
      ],
    },
    layers: [],
  },
  {
    kind: "table",
    x: 40,
    y: 440,
    columns: [120, 200, 160],
    rows: [
      {
        height: 32,
        cells: [
          {
            columnSpan: 2,
            rowSpan: 1,
            fill: { color: [241, 245, 249], alpha: 1 },
            borders: { bottom: { width: 1, paint: { color: [226, 232, 240], alpha: 1 } } },
            inset: { left: 8, top: 4, right: 8, bottom: 4 },
            anchor: "middle",
            paragraphs: [paragraph("見出し")],
          },
          {
            columnSpan: 1,
            rowSpan: 2,
            borders: { left: { width: 2, paint: { color: [0, 0, 0], alpha: 1 }, dash: "dot" } },
            inset: { left: 0, top: 0, right: 0, bottom: 0 },
            anchor: "bottom",
            paragraphs: [paragraph("42 行")],
          },
        ],
      },
      {
        height: 28,
        cells: [
          {
            columnSpan: 1,
            rowSpan: 1,
            borders: {},
            inset: { left: 0, top: 0, right: 0, bottom: 0 },
            anchor: "top",
            paragraphs: [],
          },
          {
            columnSpan: 1,
            rowSpan: 1,
            borders: {},
            inset: { left: 0, top: 0, right: 0, bottom: 0 },
            anchor: "top",
            paragraphs: [paragraph("slides/timing.html")],
          },
        ],
      },
    ],
  },
  {
    kind: "rule",
    x1: 0,
    y1: 400,
    x2: 1280,
    y2: 400,
    width: 2,
    paint: { color: [0, 0, 0], alpha: 1 },
  },
];

describe("deck.pptx.json", () => {
  test("layers written out and read back are the same layers", () => {
    const json = layersToJson(layers, () => ({ file: "pictures/1-1.png" }));
    const back = layersFromJson(
      json,
      (path) => (path === "pictures/1-1.png" ? png : new Uint8Array()),
      () => "",
    );
    expect(back).toEqual(layers);
  });

  test("what a layer leaves out takes its default", () => {
    const [prose] = layersFromJson(
      [
        {
          kind: "prose",
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          text: { paragraphs: [{ runs: [{ text: "a", size: 20, color: "#000000" }] }] },
        },
      ],
      () => png,
      () => "",
    );
    expect(prose).toMatchObject({
      text: {
        wrap: true,
        inset: { left: 0, top: 0, right: 0, bottom: 0 },
        paragraphs: [{ align: "left", lineHeight: 24, runs: [{ bold: false, alpha: 1 }] }],
      },
    });
  });

  test("a color is #rrggbb, and a field the shape does not have is refused", () => {
    expect(rgbOf(hexOf([1, 2, 255]))).toEqual([1, 2, 255]);
    const base = { title: "t", lang: "ja", size: { width: 1280, height: 720 } };
    const slide = (layer: unknown) => ({ ...base, slides: [{ slug: "a", layers: [layer] }] });
    const rule = { kind: "rule", x1: 0, y1: 0, x2: 1, y2: 0, width: 1 };
    expect(pptxJsonSchema.safeParse(slide({ ...rule, paint: { color: "#123456" } })).success).toBe(
      true,
    );
    expect(pptxJsonSchema.safeParse(slide({ ...rule, paint: { color: "red" } })).success).toBe(
      false,
    );
    expect(
      pptxJsonSchema.safeParse(slide({ ...rule, paint: { color: "#123456" }, dashed: true }))
        .success,
    ).toBe(false);
  });

  test("a color may carry its alpha as #rrggbbaa, as spec.json writes a see-through one", () => {
    const [shape] = layersFromJson(
      [
        {
          kind: "shape",
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          fill: { color: "#0f172a40" },
          text: {
            paragraphs: [{ runs: [{ text: "a", size: 20, color: "#00000080", alpha: 0.5 }] }],
          },
        },
      ],
      () => png,
      () => "",
    );
    expect(shape).toMatchObject({
      fill: { color: [15, 23, 42], alpha: 64 / 255 },
      text: { paragraphs: [{ runs: [{ color: [0, 0, 0], alpha: (0.5 * 128) / 255 }] }] },
    });
  });

  test("a table's cells say only what they set: one column and row, no borders, top, no insets", () => {
    const [table] = layersFromJson(
      [
        {
          kind: "table",
          x: 0,
          y: 0,
          columns: [100, 100],
          rows: [
            {
              height: 30,
              cells: [{ paragraphs: [{ runs: [{ text: "a", size: 20, color: "#000000" }] }] }, {}],
            },
          ],
        },
      ],
      () => png,
      () => "",
    );
    expect(table).toMatchObject({
      kind: "table",
      rows: [
        {
          cells: [
            {
              columnSpan: 1,
              rowSpan: 1,
              borders: {},
              inset: { left: 0, top: 0, right: 0, bottom: 0 },
              anchor: "top",
              paragraphs: [{ align: "left", runs: [{ text: "a" }] }],
            },
            { paragraphs: [] },
          ],
        },
      ],
    });
  });

  test("a table's cells must fill its grid, each row's from the left past what spans into it", () => {
    const base = { title: "t", lang: "ja", size: { width: 1280, height: 720 } };
    const parse = (rows: unknown, columns = [100, 100]) =>
      pptxJsonSchema.safeParse({
        ...base,
        slides: [{ slug: "a", layers: [{ kind: "table", x: 0, y: 0, columns, rows }] }],
      });
    // A cell two rows high leaves its column taken in the row below.
    expect(
      parse([
        { height: 30, cells: [{ rowSpan: 2 }, {}] },
        { height: 30, cells: [{}] },
      ]).success,
    ).toBe(true);
    expect(
      parse([
        { height: 30, cells: [{ columnSpan: 2 }] },
        { height: 30, cells: [] },
      ]).success,
    ).toBe(false);
    const short = parse([{ height: 30, cells: [{}] }]);
    expect(short.success).toBe(false);
    expect(JSON.stringify(short.error?.issues)).toContain("row 1 has 1 of 2 columns");
    const over = parse([
      { height: 30, cells: [{ rowSpan: 2 }, {}] },
      { height: 30, cells: [{}, {}] },
    ]);
    expect(JSON.stringify(over.error?.issues)).toContain("row 2 has a cell past its last column");
    const below = parse([{ height: 30, cells: [{ rowSpan: 2 }, {}] }]);
    expect(JSON.stringify(below.error?.issues)).toContain("past the table's last row");
  });
});
