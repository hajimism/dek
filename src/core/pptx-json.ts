import { z } from "zod";
import {
  PPTX_GEOMETRIES,
  type PptxDeck,
  type PptxFill,
  type PptxGeometry,
  type PptxLayer,
  type PptxPaint,
  type PptxParagraph,
  type PptxRun,
  type PptxShapeText,
  type PptxSlide,
  type PptxTheme,
} from "./pptx-package.ts";

// A PPTX as a file an agent edits: what `dekc pptx` would write, in JSON, for `dekc pptx --from`
// to write it again as edited. Sizes are the slide's own pixels, as the browser laid it out; a
// color is `#rrggbb`; a picture is a file, by its path from the deck's folder. What is left out
// takes its default, so a layer written by hand says only what it sets.

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "a color is #rrggbb")
  .describe("#rrggbb");
const unit = z.number().min(0).max(1);
const length = z.number().finite();

const paintJson = z.strictObject({ color: hex, alpha: unit.optional() });

const fillJson = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("solid"), paint: paintJson }),
  z.strictObject({
    kind: z.literal("linear"),
    angle: length,
    stops: z.array(z.strictObject({ at: unit, paint: paintJson })).min(2),
  }),
]);

const runJson = z.strictObject({
  text: z.string(),
  size: z.number().positive().describe("px"),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
  color: hex,
  alpha: unit.optional(),
  letterSpacing: length.optional(),
  font: z.string().optional().describe("the face; the theme's font when left out"),
  ea: z.string().optional().describe("the face for East Asian characters"),
  family: z.string().optional().describe("the font-family, to find it among the theme's fonts"),
  highlight: hex.optional().describe("a color marked behind the run"),
});

const paragraphJson = z.strictObject({
  align: z.enum(["left", "center", "right", "justify"]).optional(),
  lineHeight: z
    .number()
    .positive()
    .optional()
    .describe("px; 1.2 times the first run's size when left out"),
  spaceBefore: length.optional(),
  marginLeft: length.optional(),
  marginRight: length.optional(),
  indent: length.optional(),
  bullet: z
    .union([
      z.strictObject({ char: z.string().min(1) }),
      z.strictObject({ startAt: z.number().int() }),
    ])
    .optional(),
  runs: z.array(runJson).min(1),
});

const shapeTextJson = z.strictObject({
  inset: z.strictObject({ left: length, top: length, right: length, bottom: length }).optional(),
  wrap: z.boolean().optional().describe("whether PowerPoint wraps it; true when left out"),
  paragraphs: z.array(paragraphJson).min(1),
});

const rect = { x: length, y: length, width: length.nonnegative(), height: length.nonnegative() };

type LayerJson =
  | {
      kind: "text";
      x: number;
      y: number;
      width: number;
      height: number;
      lineHeight?: number;
      runs: z.infer<typeof runJson>[];
    }
  | {
      kind: "prose";
      x: number;
      y: number;
      width: number;
      height: number;
      title?: boolean;
      text: z.infer<typeof shapeTextJson>;
    }
  | {
      kind: "shape";
      x: number;
      y: number;
      width: number;
      height: number;
      fill?: z.infer<typeof paintJson>;
      outline?: { width: number; paint: z.infer<typeof paintJson> };
      radius?: number;
      geometry?: PptxGeometry;
      text?: z.infer<typeof shapeTextJson>;
      layers?: LayerJson[];
    }
  | {
      kind: "rule";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      width: number;
      paint: z.infer<typeof paintJson>;
    }
  | {
      kind: "picture";
      x: number;
      y: number;
      width: number;
      height: number;
      description?: string;
      file: string;
      svg?: string;
    };

const layerJson: z.ZodType<LayerJson> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("text"),
      ...rect,
      lineHeight: z.number().positive().optional(),
      runs: z.array(runJson).min(1),
    }),
    z.strictObject({
      kind: z.literal("prose"),
      ...rect,
      title: z.boolean().optional().describe("the slide's title: PowerPoint's title placeholder"),
      text: shapeTextJson,
    }),
    z.strictObject({
      kind: z.literal("shape"),
      ...rect,
      fill: paintJson.optional(),
      outline: z.strictObject({ width: z.number().positive(), paint: paintJson }).optional(),
      radius: length.nonnegative().optional(),
      geometry: z
        .enum(PPTX_GEOMETRIES)
        .optional()
        .describe("one of PowerPoint's own shapes in place of a rectangle"),
      text: shapeTextJson.optional(),
      layers: z.array(layerJson).optional(),
    }),
    z.strictObject({
      kind: z.literal("rule"),
      x1: length,
      y1: length,
      x2: length,
      y2: length,
      width: z.number().positive(),
      paint: paintJson,
    }),
    z.strictObject({
      kind: z.literal("picture"),
      ...rect,
      description: z.string().optional(),
      file: z.string().min(1).describe("a PNG or JPEG, from the deck's folder"),
      svg: z.string().min(1).optional().describe("an SVG of the same, from the deck's folder"),
    }),
  ]),
);

const themeFontJson = z.strictObject({ family: z.string(), latin: z.string(), ea: z.string() });

export const pptxJsonSchema = z.strictObject({
  $schema: z.string().optional(),
  title: z.string(),
  lang: z.string(),
  size: z.strictObject({ width: z.number().positive(), height: z.number().positive() }),
  theme: z
    .strictObject({
      colors: z.strictObject({
        fg: hex.optional(),
        bg: hex.optional(),
        muted: hex.optional(),
        accent: hex.optional(),
      }),
      fonts: z.strictObject({ title: themeFontJson, body: themeFontJson }).optional(),
    })
    .optional(),
  slides: z.array(
    z.strictObject({
      slug: z.string().describe("the section it is, by its id in script.md"),
      picture: z
        .string()
        .optional()
        .describe("a picture under everything, the size of the slide; none for none"),
      background: fillJson.optional(),
      backdrop: z
        .string()
        .optional()
        .describe("a picture as the slide's background, for decoration nobody edits"),
      description: z
        .string()
        .optional()
        .describe("what the slide's picture shows, for a screen reader"),
      notes: z.string().optional(),
      layers: z.array(layerJson),
    }),
  ),
});

export type PptxJson = z.infer<typeof pptxJsonSchema>;
export type PptxJsonSlide = PptxJson["slides"][number];
export type PptxJsonLayer = LayerJson;

type Rgb = [number, number, number];

export function hexOf([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

export function rgbOf(color: string): Rgb {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Two decimals are a hundredth of a pixel: closer than any renderer places anything. */
const round = (value: number): number => Math.round(value * 100) / 100;

function paintToJson({ color, alpha }: PptxPaint): z.infer<typeof paintJson> {
  return alpha < 1 ? { color: hexOf(color), alpha: round(alpha) } : { color: hexOf(color) };
}

function paintFromJson({ color, alpha }: z.infer<typeof paintJson>): PptxPaint {
  return { color: rgbOf(color), alpha: alpha ?? 1 };
}

function fillToJson(fill: PptxFill): z.infer<typeof fillJson> {
  return fill.kind === "solid"
    ? { kind: "solid", paint: paintToJson(fill.paint) }
    : {
        kind: "linear",
        angle: round(fill.angle),
        stops: fill.stops.map((stop) => ({ at: round(stop.at), paint: paintToJson(stop.paint) })),
      };
}

function fillFromJson(fill: z.infer<typeof fillJson>): PptxFill {
  return fill.kind === "solid"
    ? { kind: "solid", paint: paintFromJson(fill.paint) }
    : {
        kind: "linear",
        angle: fill.angle,
        stops: fill.stops.map((stop) => ({ at: stop.at, paint: paintFromJson(stop.paint) })),
      };
}

function runToJson(run: PptxRun): z.infer<typeof runJson> {
  return {
    text: run.text,
    size: round(run.size),
    ...(run.bold ? { bold: true } : {}),
    ...(run.italic ? { italic: true } : {}),
    ...(run.underline ? { underline: true } : {}),
    ...(run.strike ? { strike: true } : {}),
    color: hexOf(run.color),
    ...(run.alpha < 1 ? { alpha: round(run.alpha) } : {}),
    ...(run.letterSpacing !== 0 ? { letterSpacing: round(run.letterSpacing) } : {}),
    ...(run.font === undefined ? {} : { font: run.font }),
    ...(run.ea === undefined ? {} : { ea: run.ea }),
    ...(run.family === undefined ? {} : { family: run.family }),
    ...(run.highlight === undefined ? {} : { highlight: hexOf(run.highlight) }),
  };
}

function runFromJson(run: z.infer<typeof runJson>): PptxRun {
  return {
    text: run.text,
    size: run.size,
    bold: run.bold ?? false,
    italic: run.italic ?? false,
    underline: run.underline ?? false,
    strike: run.strike ?? false,
    color: rgbOf(run.color),
    alpha: run.alpha ?? 1,
    letterSpacing: run.letterSpacing ?? 0,
    ...(run.font === undefined ? {} : { font: run.font }),
    ...(run.ea === undefined ? {} : { ea: run.ea }),
    ...(run.family === undefined ? {} : { family: run.family }),
    ...(run.highlight === undefined ? {} : { highlight: rgbOf(run.highlight) }),
  };
}

function paragraphToJson(paragraph: PptxParagraph): z.infer<typeof paragraphJson> {
  return {
    ...(paragraph.align === "left" ? {} : { align: paragraph.align }),
    lineHeight: round(paragraph.lineHeight),
    ...(paragraph.spaceBefore ? { spaceBefore: round(paragraph.spaceBefore) } : {}),
    ...(paragraph.marginLeft ? { marginLeft: round(paragraph.marginLeft) } : {}),
    ...(paragraph.marginRight ? { marginRight: round(paragraph.marginRight) } : {}),
    ...(paragraph.indent ? { indent: round(paragraph.indent) } : {}),
    ...(paragraph.bullet ? { bullet: paragraph.bullet } : {}),
    runs: paragraph.runs.map(runToJson),
  };
}

function paragraphFromJson(paragraph: z.infer<typeof paragraphJson>): PptxParagraph {
  const runs = paragraph.runs.map(runFromJson);
  return {
    align: paragraph.align ?? "left",
    lineHeight: paragraph.lineHeight ?? (runs[0]?.size ?? 16) * 1.2,
    spaceBefore: paragraph.spaceBefore ?? 0,
    marginLeft: paragraph.marginLeft ?? 0,
    marginRight: paragraph.marginRight ?? 0,
    indent: paragraph.indent ?? 0,
    ...(paragraph.bullet ? { bullet: paragraph.bullet } : {}),
    runs,
  };
}

const NO_INSET = { left: 0, top: 0, right: 0, bottom: 0 };

function shapeTextToJson(text: PptxShapeText): z.infer<typeof shapeTextJson> {
  const inset = Object.values(text.inset).some((side) => side !== 0)
    ? {
        left: round(text.inset.left),
        top: round(text.inset.top),
        right: round(text.inset.right),
        bottom: round(text.inset.bottom),
      }
    : undefined;
  return {
    ...(inset ? { inset } : {}),
    ...(text.wrap ? {} : { wrap: false }),
    paragraphs: text.paragraphs.map(paragraphToJson),
  };
}

function shapeTextFromJson(text: z.infer<typeof shapeTextJson>): PptxShapeText {
  return {
    inset: text.inset ?? NO_INSET,
    wrap: text.wrap ?? true,
    paragraphs: text.paragraphs.map(paragraphFromJson),
  };
}

const rectToJson = (layer: { x: number; y: number; width: number; height: number }) => ({
  x: round(layer.x),
  y: round(layer.y),
  width: round(layer.width),
  height: round(layer.height),
});

/** A picture's files, by their paths from the deck's folder. */
export type PptxPictureRef = { file: string; svg?: string };

/** Layers as JSON, each picture by the files `refOf` names for it. */
export function layersToJson<I>(
  layers: PptxLayer<I>[],
  refOf: (picture: I) => PptxPictureRef,
): PptxJsonLayer[] {
  return layers.map((layer): PptxJsonLayer => {
    switch (layer.kind) {
      case "text":
        return {
          kind: "text",
          ...rectToJson(layer),
          lineHeight: round(layer.lineHeight),
          runs: layer.runs.map(runToJson),
        };
      case "prose":
        return {
          kind: "prose",
          ...rectToJson(layer),
          ...(layer.title ? { title: true } : {}),
          text: shapeTextToJson(layer.text),
        };
      case "shape":
        return {
          kind: "shape",
          ...rectToJson(layer),
          ...(layer.fill ? { fill: paintToJson(layer.fill) } : {}),
          ...(layer.outline
            ? {
                outline: {
                  width: round(layer.outline.width),
                  paint: paintToJson(layer.outline.paint),
                },
              }
            : {}),
          ...(layer.radius ? { radius: round(layer.radius) } : {}),
          ...(layer.geometry ? { geometry: layer.geometry } : {}),
          ...(layer.text ? { text: shapeTextToJson(layer.text) } : {}),
          ...(layer.layers.length > 0 ? { layers: layersToJson(layer.layers, refOf) } : {}),
        };
      case "rule":
        return {
          kind: "rule",
          x1: round(layer.x1),
          y1: round(layer.y1),
          x2: round(layer.x2),
          y2: round(layer.y2),
          width: round(layer.width),
          paint: paintToJson(layer.paint),
        };
      case "picture": {
        const { kind: _kind, x, y, width, height, description, ...image } = layer;
        return {
          kind: "picture",
          ...rectToJson({ x, y, width, height }),
          ...(description ? { description } : {}),
          ...refOf(image as unknown as I),
        };
      }
      default: {
        const unknown: never = layer;
        throw new Error(`unknown layer ${JSON.stringify(unknown)}`);
      }
    }
  });
}

/** Layers from JSON, each picture's files read by `read`. */
export function layersFromJson(
  layers: PptxJsonLayer[],
  read: (path: string) => Uint8Array,
  readText: (path: string) => string,
): PptxLayer[] {
  return layers.map((layer): PptxLayer => {
    switch (layer.kind) {
      case "text":
        return {
          kind: "text",
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          runs: layer.runs.map(runFromJson),
          lineHeight: layer.lineHeight ?? (layer.runs[0]?.size ?? 16) * 1.2,
        };
      case "prose":
        return {
          kind: "prose",
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          text: shapeTextFromJson(layer.text),
          ...(layer.title ? { title: true } : {}),
        };
      case "shape":
        return {
          kind: "shape",
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          ...(layer.fill ? { fill: paintFromJson(layer.fill) } : {}),
          ...(layer.outline
            ? { outline: { width: layer.outline.width, paint: paintFromJson(layer.outline.paint) } }
            : {}),
          radius: layer.radius ?? 0,
          ...(layer.geometry ? { geometry: layer.geometry } : {}),
          ...(layer.text ? { text: shapeTextFromJson(layer.text) } : {}),
          layers: layersFromJson(layer.layers ?? [], read, readText),
        };
      case "rule":
        return { ...layer, paint: paintFromJson(layer.paint) };
      case "picture":
        return {
          kind: "picture",
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          description: layer.description ?? "",
          png: read(layer.file),
          ...(layer.svg === undefined ? {} : { svg: readText(layer.svg) }),
        };
      default: {
        const unknown: never = layer;
        throw new Error(`unknown layer ${JSON.stringify(unknown)}`);
      }
    }
  });
}

export function themeToJson(theme: PptxTheme | undefined): PptxJson["theme"] {
  if (!theme) {
    return undefined;
  }
  const colors: NonNullable<PptxJson["theme"]>["colors"] = {};
  for (const [token, color] of Object.entries(theme.colors) as Array<[keyof typeof colors, Rgb]>) {
    colors[token] = hexOf(color);
  }
  return { colors, ...(theme.fonts ? { fonts: theme.fonts } : {}) };
}

function themeFromJson(theme: PptxJson["theme"]): PptxTheme | undefined {
  if (!theme) {
    return undefined;
  }
  const colors: PptxTheme["colors"] = {};
  for (const [token, color] of Object.entries(theme.colors) as Array<
    [keyof PptxTheme["colors"], string | undefined]
  >) {
    if (color) {
      colors[token] = rgbOf(color);
    }
  }
  return { colors, ...(theme.fonts ? { fonts: theme.fonts } : {}) };
}

export function backgroundToJson(fill: PptxFill | undefined): PptxJsonSlide["background"] {
  return fill ? fillToJson(fill) : undefined;
}

/** The deck the JSON says, its pictures read from the files it names. */
export function pptxFromJson(
  json: PptxJson,
  read: (path: string) => Uint8Array,
  readText: (path: string) => string,
): PptxDeck {
  const theme = themeFromJson(json.theme);
  return {
    title: json.title,
    lang: json.lang,
    size: json.size,
    ...(theme ? { theme } : {}),
    slides: json.slides.map(
      (slide): PptxSlide => ({
        ...(slide.picture ? { picture: read(slide.picture) } : {}),
        ...(slide.backdrop ? { backdrop: read(slide.backdrop) } : {}),
        ...(slide.background ? { background: fillFromJson(slide.background) } : {}),
        description: slide.description ?? "",
        layers: layersFromJson(slide.layers, read, readText),
        notes: slide.notes ?? "",
      }),
    ),
  };
}

/** Every file the JSON names, with where it is named, to check before anything is read. */
export function pptxJsonFiles(json: PptxJson): Array<{ path: string; where: string }> {
  const files: Array<{ path: string; where: string }> = [];
  const walk = (layers: PptxJsonLayer[], where: string) => {
    layers.forEach((layer, index) => {
      const at = `${where}.layers[${index}]`;
      if (layer.kind === "picture") {
        files.push({ path: layer.file, where: `${at}.file` });
        if (layer.svg) {
          files.push({ path: layer.svg, where: `${at}.svg` });
        }
      } else if (layer.kind === "shape" && layer.layers) {
        walk(layer.layers, at);
      }
    });
  };
  json.slides.forEach((slide, index) => {
    const where = `slides[${index}]`;
    if (slide.picture) {
      files.push({ path: slide.picture, where: `${where}.picture` });
    }
    if (slide.backdrop) {
      files.push({ path: slide.backdrop, where: `${where}.backdrop` });
    }
    walk(slide.layers, where);
  });
  return files;
}
