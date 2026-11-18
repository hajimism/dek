import { describe, expect, test } from "bun:test";
import {
  hexOf,
  layersFromJson,
  layersToJson,
  pptxJsonSchema,
  rgbOf,
} from "../../src/core/pptx-json.ts";
import type { PptxLayer, PptxRun } from "../../src/core/pptx-package.ts";

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
    outline: { width: 1, paint: { color: [226, 232, 240], alpha: 1 } },
    radius: 12,
    layers: [{ kind: "picture", x: 10, y: 210, width: 50, height: 50, description: "icon", png }],
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
});
