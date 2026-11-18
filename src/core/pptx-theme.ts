import type {
  PptxFill,
  PptxLayer,
  PptxPaint,
  PptxRun,
  PptxTheme,
  PptxThemeFont,
} from "./pptx-package.ts";
import { drawnScriptOf } from "./pptx-type.ts";

// What of a slide's look becomes PowerPoint's own rather than its picture's, from the computed
// values a page reports: the deck's theme, from the tokens most slides have, and a slide's
// background, when PowerPoint paints it as the browser did. Nothing here touches a page.

/** What one slide says of the deck's theme: its color tokens, and the fonts its font tokens are. */
export type PptxPageTheme = {
  colors: PptxTheme["colors"];
  fonts: Partial<Record<"title" | "body", PptxThemeFont>>;
};

/**
 * The deck's theme: each token as most slides have it, the first slide's on a tie, so a slide
 * that sets a token of its own keeps it to itself. Fonts only when both font tokens are known.
 * A font token is a family, and a theme's font is what a run that follows it is drawn in: so
 * each is named by the face most of the characters set in its token were drawn in, Latin and
 * East Asian each by their own, as the runs of `slides` name them (ADR 100). Where both tokens
 * are one family, the title's font is the face of the slides' titles and the body's that of
 * everything else, as a theme's two fonts are.
 */
export function deckTheme<I>(
  pages: PptxPageTheme[],
  slides: ReadonlyArray<ReadonlyArray<PptxLayer<I>>> = [],
): PptxTheme {
  const colors: PptxTheme["colors"] = {};
  for (const token of ["fg", "bg", "muted", "accent"] as const) {
    const color = mostOf(
      pages.map((page) => page.colors[token]),
      (color) => color.join(),
    );
    if (color) {
      colors[token] = color;
    }
  }
  const title = mostOf(
    pages.map((page) => page.fonts.title),
    (font) => font.family,
  );
  const body = mostOf(
    pages.map((page) => page.fonts.body),
    (font) => font.family,
  );
  if (!title || !body) {
    return { colors };
  }
  const set = slides.flatMap((layers) => [...runsOf(layers)]);
  const oneFamily = title.family === body.family;
  return {
    colors,
    fonts: {
      title: facesOf(
        title,
        set.filter((each) => each.run.family === title.family && (each.title || !oneFamily)),
      ),
      body: facesOf(
        body,
        set.filter((each) => each.run.family === body.family && !(each.title && oneFamily)),
      ),
    },
  };
}

/** Every run of text among some layers, and whether it is of the slide's title. */
function* runsOf<I>(
  layers: ReadonlyArray<PptxLayer<I>>,
): Generator<{ run: PptxRun; title: boolean }> {
  for (const layer of layers) {
    if (layer.kind === "text") {
      for (const run of layer.runs) {
        yield { run, title: false };
      }
    } else if (layer.kind === "prose" || layer.kind === "shape") {
      for (const paragraph of layer.text?.paragraphs ?? []) {
        for (const run of paragraph.runs) {
          yield { run, title: layer.kind === "prose" && layer.title === true };
        }
      }
      if (layer.kind === "shape") {
        yield* runsOf(layer.layers);
      }
    }
  }
}

/**
 * A token's font with the faces most of the characters of `runs` name, a script at a time. For
 * a script none of them holds: the other script's face where the page found one family for both,
 * and what the page said of the token otherwise.
 */
function facesOf(font: PptxThemeFont, runs: Array<{ run: PptxRun }>): PptxThemeFont {
  const counts = { latin: new Map<string, number>(), eastAsian: new Map<string, number>() };
  for (const { run } of runs) {
    for (const char of run.text) {
      const script = drawnScriptOf(char);
      const face =
        script === "latin" ? run.font : script === "eastAsian" ? (run.ea ?? run.font) : undefined;
      if ((script === "latin" || script === "eastAsian") && face !== undefined) {
        counts[script].set(face, (counts[script].get(face) ?? 0) + 1);
      }
    }
  }
  const most = (faces: Map<string, number>): string | undefined =>
    [...faces].reduce<[string, number] | undefined>(
      (best, each) => (best === undefined || each[1] > best[1] ? each : best),
      undefined,
    )?.[0];
  const latin = most(counts.latin);
  const ea = most(counts.eastAsian);
  // Where one family draws both scripts, the face of the one the text held is the other's too:
  // what is typed into such text is then set in the face beside it.
  const shared = font.latin === font.ea ? (latin ?? ea) : undefined;
  return {
    family: font.family,
    latin: latin ?? shared ?? font.latin,
    ea: ea ?? shared ?? font.ea,
  };
}

/** The value most of `values` are, by `key`; the first of them on a tie. */
function mostOf<T>(values: Array<T | undefined>, key: (value: T) => string): T | undefined {
  const counts = new Map<string, { value: T; count: number }>();
  for (const value of values) {
    if (value !== undefined) {
      const seen = counts.get(key(value)) ?? { value, count: 0 };
      seen.count += 1;
      counts.set(key(value), seen);
    }
  }
  let most: { value: T; count: number } | undefined;
  for (const seen of counts.values()) {
    if (!most || seen.count > most.count) {
      most = seen;
    }
  }
  return most?.value;
}

/**
 * A slide's background as PowerPoint paints it, from its computed `background-color` and
 * `background-image`: one opaque color, or one linear gradient along an axis whose stops are
 * opaque sRGB colors at lengths CSS and DrawingML place alike. None for anything else, which
 * stays in the slide's picture: an image, a radial or repeating gradient, a diagonal, a hint,
 * a color space other than sRGB, a stop the page shows through, a second layer.
 */
export function slideBackground(
  background: { paint: PptxPaint; image: string },
  size: { width: number; height: number },
): PptxFill | undefined {
  const image = background.image.trim();
  if (image === "none") {
    return background.paint.alpha === 1 ? { kind: "solid", paint: background.paint } : undefined;
  }
  const layers = splitTopLevel(image);
  const gradient = layers.length === 1 ? /^linear-gradient\((.*)\)$/s.exec(image)?.[1] : undefined;
  if (gradient === undefined) {
    return undefined;
  }
  const args = splitTopLevel(gradient);
  const first = args[0] ?? "";
  const direction = cssAngle(first);
  if (/\bin\s/.test(first) || (direction === undefined && !colorOf(first))) {
    return undefined;
  }
  // CSS's 0deg points up and turns clockwise; DrawingML's 0 points right, and turns so too.
  const css = direction ?? 180;
  const turned = ((css % 360) + 360) % 360;
  if (Math.abs(turned / 90 - Math.round(turned / 90)) > 1e-6) {
    return undefined;
  }
  const along = Math.round(turned / 90) % 2 === 0 ? size.height : size.width;
  const stops = placeStops(direction === undefined ? args : args.slice(1), along);
  if (!stops || stops.length < 2 || stops.some((stop) => stop.at < 0 || stop.at > 1)) {
    return undefined;
  }
  return { kind: "linear", angle: (Math.round(turned) + 270) % 360, stops };
}

/**
 * Whether a slide's picture is kept on nothing, the color under its background's pictures
 * PowerPoint's, given the picture's bytes shot on the color and on nothing: not where that makes
 * it more than a tenth larger, past the 8 kB an alpha channel costs a picture with little in
 * it. A soft picture, a glow or a wash, packs up to several times worse on nothing than on its
 * color, and a larger file is not worth a color no one sees but through it (ADR 102).
 */
export function colorLeavesPicture(onColor: number, onNothing: number): boolean {
  return onNothing <= onColor * 1.1 + 8192;
}

/** A gradient's direction in CSS degrees, or none when the argument is not one. */
function cssAngle(arg: string): number | undefined {
  const sides: Record<string, number> = { top: 0, right: 90, bottom: 180, left: 270 };
  const side = /^to\s+(top|right|bottom|left)$/.exec(arg)?.[1];
  if (side !== undefined) {
    return sides[side];
  }
  const angle = /^(-?[\d.]+)(deg|turn|rad|grad)$/.exec(arg);
  if (!angle) {
    return undefined;
  }
  const per: Record<string, number> = { deg: 1, turn: 360, rad: 180 / Math.PI, grad: 0.9 };
  return Number(angle[1]) * (per[angle[2] ?? "deg"] ?? 1);
}

/**
 * The stops at 0..1 along the gradient, as CSS places them: the first at the start and the
 * last at the end unless placed, one behind another moved up to it, and the unplaced spread
 * evenly between their neighbors. None when a stop is not an opaque color, or a hint or a
 * length is there that DrawingML has no place for.
 */
function placeStops(
  args: string[],
  along: number,
): Array<{ at: number; paint: PptxPaint }> | undefined {
  const stops: Array<{ at: number | undefined; paint: PptxPaint }> = [];
  for (const arg of args) {
    const color = colorOf(arg);
    if (!color) {
      return undefined;
    }
    const lengths = arg.slice(color.written.length).trim().split(/\s+/).filter(Boolean);
    if (lengths.length > 2 || color.paint.alpha !== 1) {
      return undefined;
    }
    const at = lengths.map((length) => lengthAt(length, along));
    if (at.some((each) => each === undefined)) {
      return undefined;
    }
    if (at.length === 0) {
      stops.push({ at: undefined, paint: color.paint });
    }
    for (const each of at) {
      stops.push({ at: each, paint: color.paint });
    }
  }
  const [head, tail] = [stops[0], stops.at(-1)];
  if (head && head.at === undefined) {
    head.at = 0;
  }
  if (tail && tail.at === undefined) {
    tail.at = 1;
  }
  let furthest = Number.NEGATIVE_INFINITY;
  for (const stop of stops) {
    if (stop.at !== undefined) {
      stop.at = Math.max(stop.at, furthest);
      furthest = stop.at;
    }
  }
  for (let index = 0; index < stops.length; index++) {
    if (stops[index]?.at !== undefined) {
      continue;
    }
    const from = index - 1;
    let to = index;
    while (stops[to]?.at === undefined) {
      to++;
    }
    const start = stops[from]?.at ?? 0;
    const end = stops[to]?.at ?? 1;
    for (let gap = index; gap < to; gap++) {
      const stop = stops[gap];
      if (stop) {
        stop.at = start + ((end - start) * (gap - from)) / (to - from);
      }
    }
  }
  return stops.map((stop) => ({ at: stop.at ?? 0, paint: stop.paint }));
}

function lengthAt(length: string, along: number): number | undefined {
  const value = /^(-?[\d.]+)(%|px)$/.exec(length);
  if (!value) {
    return undefined;
  }
  const number = Number(value[1]);
  return value[2] === "%" ? number / 100 : along > 0 ? number / along : undefined;
}

/** A stop's color as Chromium writes an sRGB one, `rgb()` or `rgba()`, and what it took. */
function colorOf(arg: string): { paint: PptxPaint; written: string } | undefined {
  const match =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(arg);
  if (!match) {
    return undefined;
  }
  const [written, r = "0", g = "0", b = "0", a = "1"] = match;
  const alpha = a.endsWith("%") ? Number(a.slice(0, -1)) / 100 : Number(a);
  const channel = (value: string) => Math.max(0, Math.min(255, Math.round(Number(value))));
  return {
    paint: { color: [channel(r), channel(g), channel(b)], alpha },
    written,
  };
}

/** The arguments of a function, split at the commas outside any parentheses. */
function splitTopLevel(text: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth--;
    } else if (char === "," && depth === 0) {
      args.push(text.slice(start, at).trim());
      start = at + 1;
    }
  }
  args.push(text.slice(start).trim());
  return args;
}
