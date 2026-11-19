import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { z } from "zod";
import { capturePptx, type PptxOptions } from "./pptx.ts";
import {
  backgroundToJson,
  hexOf,
  layersToJson,
  type PptxJson,
  type PptxPictureRef,
  pptxJsonSchema,
  themeToJson,
} from "./pptx-json.ts";
import type { PptxLayer, PptxRun } from "./pptx-package.ts";
import type {
  PptxSpecPart,
  SpecPageNode,
  SpecPagePiece,
  SpecPageRun,
  SpecPageShadow,
  SpecPageText,
} from "./pptx-spec-page.ts";
import { asResolvedDeck, type ResolvedDeck } from "./resolve.ts";
import { outputDir, removeInside, writeInside } from "./safe-fs.ts";

// What `dekc pptx spec` writes for an agent that builds a deck again as a PowerPoint file of its
// own: the file `dekc pptx` would write, as JSON to edit and write again with `dekc pptx --from`,
// and beside it what each slide is made of, as the browser drew it, and its parts drawn alone.

/** Where the spec is written, in the deck's folder. */
export const PPTX_SPEC_DIR = join(".cache", "pptx");
export const PPTX_SPEC_FILE = "spec.json";
const PPTX_START_FILE = "deck.pptx.json";
/** The JSON Schema of deck.pptx.json, for an editor and an agent to read its fields from. */
const PPTX_SCHEMA_FILE = "deck.pptx.schema.json";

/**
 * A run of an element's text: its color as `#rrggbb`, its font as the theme's token where it is
 * one (`font-body` and the like) and its `font-family` where not, and what is set only when set.
 */
type PptxSpecRun = {
  text: string;
  size: number;
  weight?: number;
  italic?: true;
  underline?: true;
  strike?: true;
  color: string;
  font: string;
  /** The faces the browser drew it in, as `dekc pptx` names them, for a run's `font` and `ea`. */
  face?: { latin: string; ea?: string };
  letterSpacing?: number;
  background?: string;
  code?: true;
  link?: string;
};

/** An element of a slide as the browser drew it, in the slide's pixels, colors as `#rrggbb`. */
export type PptxSpecNode = {
  tag: string;
  class?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  border?: { width: number; color: string; style?: "dashed" | "dotted" };
  sides?: Record<string, { width: number; color: string; style?: "dashed" | "dotted" }>;
  radius?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  outline?: { width: number; color: string; offset: number };
  /** Each of its shadows, the first drawn on top, its color as `#rrggbbaa` where it is see-through. */
  shadow?: SpecPageShadow[];
  opacity?: number;
  rotate?: number;
  heading?: number;
  decoration?: true;
  alt?: string;
  /** What a shape cannot draw of it: a picture, or paint such as a clip-path or a gradient. */
  picture?: SpecPageNode["picture"];
  /** Why a shape cannot draw it, for `picture: "drawn"`: `gradient`, `::before`, and the like. */
  drawn?: string[];
  /** A box in its block's line, such as a chip: its text is in the block's text too. */
  inline?: true;
  /**
   * It drawn alone, by its path from the deck's folder: a picture whole, and paint a shape
   * cannot draw without the elements and text inside it.
   */
  part?: string;
  /** An image's source, as the slide's HTML has it. */
  src?: string;
  /**
   * Its text: all of it in `content`, each run where they are set differently, and in `pieces`
   * each stretch of a line as the browser placed it.
   */
  text?: Omit<SpecPageText, "runs" | "pre" | "pieces"> & {
    pre?: true;
    content: string;
    runs: PptxSpecRun[];
    pieces?: SpecPagePiece[];
  };
  children?: PptxSpecNode[];
};

type PptxSpecSlide = {
  /** 1 for the first slide. */
  index: number;
  slug: string;
  /** The `##` heading in script.md. */
  title: string;
  layout?: string;
  /** The script, as `dekc pptx` puts it in the slide's notes. */
  notes: string;
  /** The slide as the browser drew it, at twice its size, from the deck's folder. */
  shot: string;
  outline?: PptxSpecNode;
};

export type PptxSpec = {
  /** What the deck's script, slides, and theme were when this was written. */
  source: string;
  deck: { title: string; lang: string; size: { width: number; height: number } };
  /** The deck's custom properties that are colors, and its `--font-*` ones, on its first slide. */
  tokens: { colors: Record<string, string>; fonts: Record<string, string> };
  slides: PptxSpecSlide[];
};

export type PptxSpecResult = {
  /** spec.json: what each slide is made of. */
  spec: string;
  /** deck.pptx.json: the file `dekc pptx` would write, to edit and pass to `--from`. */
  start: string;
  slides: number;
  parts: number;
};

/**
 * Writes `.cache/pptx/` in the deck's folder, over what was there: spec.json, deck.pptx.json,
 * each slide's shot, the pictures deck.pptx.json names, and the parts spec.json names.
 */
export async function pptxSpecDeck(
  input: string | ResolvedDeck,
  options: PptxOptions = {},
): Promise<PptxSpecResult> {
  const { project, deck } = asResolvedDeck(input);
  const dir = join(deck.dir, PPTX_SPEC_DIR);
  removeInside(dir, project.root, { recursive: true });
  const shots = outputDir(join(dir, "shots"), project.root);
  const parts = outputDir(join(dir, "parts"), project.root);
  const pictures = outputDir(join(dir, "pictures"), project.root);
  const captured = await capturePptx({ project, deck }, pictures, {
    ...options,
    spec: { shots, parts },
  });
  const fromDeck = (path: string) => relative(deck.dir, path).split("\\").join("/");
  const { sections } = captured.deck;
  const start: PptxJson = {
    // From the deck's folder, where the edited copy is kept.
    $schema: `./${PPTX_SPEC_DIR.split("\\").join("/")}/${PPTX_SCHEMA_FILE}`,
    title: captured.deck.title,
    lang: captured.deck.lang,
    size: captured.size,
    ...(captured.theme ? { theme: themeToJson(captured.theme) } : {}),
    slides: captured.answer.slides.map((slide, index) => {
      const picture = captured.pictures[index];
      const background = backgroundToJson(slide.background);
      return {
        slug: slide.slug,
        ...(picture === undefined ? {} : { picture: fromDeck(picture) }),
        ...(background ? { background } : {}),
        description: slide.description || (sections[index]?.title ?? slide.slug),
        notes: captured.scripts[index]?.script ?? "",
        layers: layersToJson(slide.layers, ({ png, svg }): PptxPictureRef => {
          if (svg === undefined) {
            return { file: fromDeck(png) };
          }
          const path = png.replace(/\.png$/, ".svg");
          writeInside(path, svg, project.root);
          return { file: fromDeck(png), svg: fromDeck(path) };
        }),
      };
    }),
  };
  let partCount = 0;
  const first = captured.answer.slides.find((slide) => slide.outline)?.outline;
  const spec: PptxSpec = {
    source: deckSourceHash(deck.dir),
    deck: { title: captured.deck.title, lang: captured.deck.lang, size: captured.size },
    tokens: {
      colors: Object.fromEntries(
        Object.entries(first?.colors ?? {}).map(([name, color]) => [name, hexOfCss(color)]),
      ),
      fonts: first?.fonts ?? {},
    },
    slides: captured.answer.slides.map((slide, index) => {
      const section = sections[index];
      const partOf = new Map(
        (slide.parts ?? []).map((part) => [partKey(part), fromDeck(part.png)]),
      );
      partCount += partOf.size;
      return {
        index: index + 1,
        slug: slide.slug,
        title: section?.title ?? slide.slug,
        ...(slide.outline?.layout ? { layout: slide.outline.layout } : {}),
        notes: captured.scripts[index]?.script ?? "",
        shot: fromDeck(join(shots, `${index + 1}-${slide.slug}.png`)),
        ...(slide.outline
          ? {
              outline: specNode(
                slide.outline.slide,
                partOf,
                slide.outline.fonts,
                facesOf(slide.layers),
              ),
            }
          : {}),
      };
    }),
  };
  writeInside(
    join(dir, PPTX_SCHEMA_FILE),
    `${JSON.stringify(z.toJSONSchema(pptxJsonSchema, { io: "input" }), null, 2)}\n`,
    project.root,
  );
  const specPath = join(dir, PPTX_SPEC_FILE);
  const startPath = join(dir, PPTX_START_FILE);
  writeInside(specPath, `${JSON.stringify(spec, null, 2)}\n`, project.root);
  writeInside(startPath, `${JSON.stringify(start, null, 2)}\n`, project.root);
  return {
    spec: specPath,
    start: startPath,
    slides: spec.slides.length,
    parts: partCount,
  };
}

const round = (value: number): number => Math.round(value * 100) / 100;

/** A part's key: its node's index, and its pseudo-element's name where it is one's. */
const partKey = ({ node, pseudo }: Omit<PptxSpecPart, "png">): string =>
  pseudo ? `${node}::${pseudo}` : String(node);

/** A computed CSS color as `#rrggbb`, with its alpha as two more digits below 1. */
function hexOfCss(color: string): string {
  const match =
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(
      color.trim(),
    );
  if (!match) {
    return color;
  }
  const rgb = hexOf([Number(match[1]), Number(match[2]), Number(match[3])]);
  const raw = match[4];
  const alpha =
    raw === undefined ? 1 : raw.endsWith("%") ? Number.parseFloat(raw) / 100 : Number(raw);
  return alpha < 1
    ? `${rgb}${Math.round(alpha * 255)
        .toString(16)
        .padStart(2, "0")}`
    : rgb;
}

/** The faces a run was drawn in, found among the runs `dekc pptx` set on the same slide. */
type FaceOf = (run: Omit<SpecPageRun, "text"> & { text: string }) => PptxSpecRun["face"];

function facesOf<I>(layers: PptxLayer<I>[]): FaceOf {
  const runs: PptxRun[] = [];
  const walk = (each: PptxLayer<I>[]) => {
    for (const layer of each) {
      if (layer.kind === "text") {
        runs.push(...layer.runs);
      } else if (layer.kind === "prose") {
        runs.push(...layer.text.paragraphs.flatMap((paragraph) => paragraph.runs));
      } else if (layer.kind === "shape") {
        runs.push(...(layer.text?.paragraphs.flatMap((paragraph) => paragraph.runs) ?? []));
        walk(layer.layers);
      }
    }
  };
  walk(layers);
  const drawn = runs.filter((run) => run.font !== undefined && run.text.trim() !== "");
  return (run) => {
    const text = run.text.replace(/\s+/g, "");
    const found = drawn.find((each) => {
      const ink = each.text.replace(/\s+/g, "");
      return (
        Math.abs(each.size - run.size) < 0.5 &&
        each.bold === run.weight >= 600 &&
        (each.family === undefined || sameFamily(each.family, run.family)) &&
        ink !== "" &&
        (text.includes(ink) || ink.includes(text))
      );
    });
    return found?.font === undefined
      ? undefined
      : { latin: found.font, ...(found.ea && found.ea !== found.font ? { ea: found.ea } : {}) };
  };
}

/** A node of the page's walk as spec.json has it, its pseudo-elements as nodes in it. */
function specNode(
  node: SpecPageNode,
  parts: ReadonlyMap<string, string>,
  fonts: Readonly<Record<string, string>> = {},
  faceOf: FaceOf = () => undefined,
): PptxSpecNode {
  const part = parts.get(partKey({ node: node.index }));
  const mark = (pseudo: "before" | "after"): PptxSpecNode[] =>
    (node.marks ?? []).flatMap((each): PptxSpecNode[] => {
      if (each.pseudo !== pseudo || !each.rect || (!each.text && !each.paint)) {
        return [];
      }
      const { paint } = each;
      const own = parts.get(partKey({ node: node.index, pseudo }));
      return [
        {
          tag: `::${pseudo}`,
          ...box(each.rect),
          ...(paint?.fill ? { fill: hexOfCss(paint.fill) } : {}),
          ...(paint?.border ? { border: borderOf(paint.border) } : {}),
          ...(paint?.radius ? { radius: round(paint.radius) } : {}),
          ...(paint?.rotate === undefined ? {} : { rotate: paint.rotate }),
          ...(node.decoration ? { decoration: true as const } : {}),
          ...(paint?.drawn ? { picture: "drawn" as const, drawn: paint.drawn } : {}),
          ...(own ? { part: own } : {}),
          ...(each.text
            ? {
                text: {
                  align: "left",
                  lines: each.lines ?? 1,
                  content: each.text,
                  lineHeight: Number.isFinite(each.lineHeight) ? round(each.lineHeight) : 0,
                  runs: [specRun({ ...each.run, text: each.text }, fonts, faceOf)],
                },
              }
            : {}),
        },
      ];
    });
  const children = [
    ...mark("before"),
    ...node.children.map((child) => specNode(child, parts, fonts, faceOf)),
    ...mark("after"),
  ];
  return {
    tag: node.tag,
    ...(node.classes.length > 0 ? { class: node.classes.join(" ") } : {}),
    ...box(node.rect),
    ...(node.fill ? { fill: hexOfCss(node.fill) } : {}),
    ...(node.border ? { border: borderOf(node.border) } : {}),
    ...(node.sides
      ? {
          sides: Object.fromEntries(
            Object.entries(node.sides).map(([side, each]) => [side, borderOf(each)]),
          ),
        }
      : {}),
    ...(node.radius ? { radius: round(node.radius) } : {}),
    ...(node.padding ? { padding: node.padding } : {}),
    ...(node.outline ? { outline: { ...node.outline, color: hexOfCss(node.outline.color) } } : {}),
    ...(node.shadow
      ? {
          shadow: node.shadow.map((each) => ({
            ...each,
            x: round(each.x),
            y: round(each.y),
            blur: round(each.blur),
            spread: round(each.spread),
            color: hexOfCss(each.color),
          })),
        }
      : {}),
    ...(node.opacity === undefined ? {} : { opacity: node.opacity }),
    ...(node.rotate === undefined ? {} : { rotate: node.rotate }),
    ...(node.heading ? { heading: node.heading } : {}),
    ...(node.decoration ? { decoration: true as const } : {}),
    ...(node.alt ? { alt: node.alt } : {}),
    ...(node.picture ? { picture: node.picture } : {}),
    ...(node.drawn ? { drawn: node.drawn } : {}),
    ...(node.inline ? { inline: true as const } : {}),
    ...(part ? { part } : {}),
    ...(node.src ? { src: node.src } : {}),
    ...(node.text
      ? {
          text: {
            align: node.text.align,
            lines: node.text.lines,
            ...(node.text.pre ? { pre: true as const } : {}),
            content: node.text.runs.map((run) => run.text).join(""),
            lineHeight: Number.isFinite(node.text.lineHeight) ? round(node.text.lineHeight) : 0,
            ...(node.text.widen ? { widen: node.text.widen } : {}),
            runs: node.text.runs.map((run) => specRun(run, fonts, faceOf)),
            ...(node.text.pieces.length > 0
              ? {
                  pieces: node.text.pieces.map((piece) => ({ text: piece.text, ...box(piece) })),
                }
              : {}),
          },
        }
      : {}),
    ...(children.length > 0 ? { children } : {}),
  };
}

function box(rect: { x: number; y: number; width: number; height: number }) {
  return {
    x: round(rect.x),
    y: round(rect.y),
    width: round(rect.width),
    height: round(rect.height),
  };
}

function borderOf(border: { width: number; color: string; style?: "dashed" | "dotted" }) {
  return { ...border, color: hexOfCss(border.color) };
}

const sameFamily = (a: string, b: string): boolean =>
  a.replace(/["'\s]/g, "").toLowerCase() === b.replace(/["'\s]/g, "").toLowerCase();

function specRun(
  run: SpecPageRun,
  fonts: Readonly<Record<string, string>>,
  faceOf: FaceOf,
): PptxSpecRun {
  const token = Object.entries(fonts).find(([, family]) => sameFamily(family, run.family))?.[0];
  const face = faceOf(run);
  return {
    text: run.text,
    size: round(run.size),
    ...(run.weight === 400 ? {} : { weight: run.weight }),
    ...(run.italic ? { italic: true as const } : {}),
    ...(run.underline ? { underline: true as const } : {}),
    ...(run.strike ? { strike: true as const } : {}),
    color: hexOfCss(run.color),
    font: token ?? run.family,
    ...(face ? { face } : {}),
    ...(run.letterSpacing ? { letterSpacing: round(run.letterSpacing) } : {}),
    ...(run.background ? { background: hexOfCss(run.background) } : {}),
    ...(run.code ? { code: true as const } : {}),
    ...(run.link ? { link: run.link } : {}),
  };
}

/** What the deck is made of, as `dekc pptx spec` saw it: its script, slides, and theme. */
export function deckSourceHash(deckDir: string): string {
  const hash = createHash("sha256");
  const add = (path: string) => {
    if (existsSync(path)) {
      hash.update(relative(deckDir, path)).update("\0").update(readFileSync(path)).update("\0");
    }
  };
  add(join(deckDir, "script.md"));
  add(join(deckDir, "theme.css"));
  const slides = join(deckDir, "slides");
  if (existsSync(slides)) {
    for (const name of readdirSync(slides).sort()) {
      add(join(slides, name));
    }
  }
  return hash.digest("hex").slice(0, 16);
}
