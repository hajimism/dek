/**
 * Text contrast measured from pixels. The page is drawn four ways: as shown,
 * with every glyph transparent, and with every glyph filled white and black.
 * White minus black is where glyphs cover, whatever their color and whatever
 * sits above them; within that, the shown pixel is the text as the audience
 * sees it and the bare pixel is what it sits on. Gradients, images, glows,
 * opacity, blend modes, and colors no parser reads are all measured as drawn.
 *
 * A text's shadow can set it off, as a halo does, but does not hide it: where
 * a text casts one, the page is drawn once more with no shadows, and each
 * pixel reads against its shadow or what is behind it, whichever it stands out
 * from. An offset shadow is decoration; a glow is what the text is read on.
 *
 * The pure functions below run in Node for tests and in the page as source,
 * so each references nothing outside this file.
 */
import type { Box } from "./slide-measure.ts";

export type Rgb = [number, number, number];

/** RGBA bytes, row by row, as `ImageData` holds them. */
export type Pixels = { width: number; height: number; data: ArrayLike<number> };

export type TextLayers = {
  /** The page as the audience sees it. */
  shown: Pixels;
  /** Every glyph transparent: what the text sits on. */
  bare: Pixels;
  /** The bare layer with no text casting a shadow; drawn only when some text casts one. */
  shadowless?: Pixels;
  /** Every glyph filled white. */
  white: Pixels;
  /** Every glyph filled black. */
  black: Pixels;
};

/** The layers the page is redrawn as; `shown` needs no change. */
type TextLayer = Exclude<keyof TextLayers, "shown">;

type TextContrast = {
  ratio: number;
  /** The text's color at the pixel that reads worst. */
  fg: Rgb;
  /** What that pixel sits on. */
  bg: Rgb;
};

function relativeLuminance([r, g, b]: Rgb): number {
  const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const [hi, lo] = first > second ? [first, second] : [second, first];
  return (hi + 0.05) / (lo + 0.05);
}

type TextSample = {
  fontSize?: number;
  fontWeight?: number;
};

/** WCAG large text: 24px (18pt) regular, or 18.66px (14pt) bold. */
const LARGE_TEXT_PX = 24;
const LARGE_BOLD_TEXT_PX = 18.66;
const BOLD_WEIGHT = 700;

function isLargeText(sample: TextSample): boolean {
  if (sample.fontSize === undefined) {
    return false;
  }
  if (sample.fontSize >= LARGE_TEXT_PX) {
    return true;
  }
  return sample.fontSize >= LARGE_BOLD_TEXT_PX && (sample.fontWeight ?? 400) >= BOLD_WEIGHT;
}

/** 3:1 for large text, 4.5:1 otherwise. Unknown size falls back to 4.5:1. */
export function contrastThreshold(sample: TextSample): 3 | 4.5 {
  return isLargeText(sample) ? 3 : 4.5;
}

export function parseCssRgb(color: string): Rgb | undefined {
  const match = color.match(/rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)/i);
  if (!match) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** One text to measure. */
type TextBoxes = {
  /** The line boxes of its own text. */
  rects: Box[];
  /** The boxes of other texts that cross them. */
  overlaps?: Box[];
  /** Its opacity with every ancestor's multiplied in; 1 when left out. */
  opacity?: number;
};

/**
 * The contrast of one text, or undefined when none of its glyphs shows.
 *
 * Only the pixels its glyphs cover most are read, and each is taken back to
 * the color a glyph covering the whole pixel would draw: the blend is undone
 * by the coverage the masks show, less the text's own opacity, which the
 * audience does see. A solid color measures exactly, and a hyphen too thin to
 * cover any pixel still reads at its own color. The ratio is the one all but
 * the worst 2% of those pixels reach: a gradient is judged by the part that
 * reads worst, a stray pixel does not decide the verdict.
 *
 * The masks cannot tell one text's glyphs from another's, so pixels inside
 * `overlaps` are read only when nothing else is.
 */
export function measureTextContrast(
  layers: TextLayers,
  { rects, overlaps = [], opacity = 1 }: TextBoxes,
): TextContrast | undefined {
  // One step of an 8-bit channel.
  const COVERAGE_SLACK = 1 / 255;
  const WORST_SHARE = 0.02;
  // Fully transparent text draws nothing; any glyph pixel under it belongs to another text.
  if (opacity <= 0) {
    return undefined;
  }
  const { shown, bare, shadowless, white, black } = layers;
  const behind = shadowless ? [bare, shadowless] : [bare];
  const at = (image: Pixels, i: number): Rgb => [
    image.data[i] ?? 0,
    image.data[i + 1] ?? 0,
    image.data[i + 2] ?? 0,
  ];
  const inside = (x: number, y: number, box: Box): boolean =>
    x >= box.left && x < box.right && y >= box.top && y < box.bottom;
  const covered: Array<{ i: number; coverage: number; shared: boolean }> = [];
  for (const rect of rects) {
    const top = Math.max(0, Math.floor(rect.top));
    const bottom = Math.min(shown.height, Math.ceil(rect.bottom));
    const left = Math.max(0, Math.floor(rect.left));
    const right = Math.min(shown.width, Math.ceil(rect.right));
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const i = (y * shown.width + x) * 4;
        const [wr, wg, wb] = at(white, i);
        const [kr, kg, kb] = at(black, i);
        const coverage = (wr - kr + wg - kg + wb - kb) / (3 * 255);
        if (coverage > 0) {
          const shared = overlaps.some((box) => inside(x + 0.5, y + 0.5, box));
          covered.push({ i, coverage, shared });
        }
      }
    }
  }
  const own = covered.filter((pixel) => !pixel.shared);
  const read = own.length > 0 ? own : covered;
  let most = 0;
  for (const pixel of read) {
    most = Math.max(most, pixel.coverage);
  }
  const samples = read
    .filter((pixel) => pixel.coverage >= most - COVERAGE_SLACK)
    .map(({ i, coverage }) => {
      // The glyph was drawn over its shadow, so the blend is undone against the bare layer.
      const under = at(bare, i);
      const [r, g, b] = at(shown, i);
      // The blend a glyph covering the whole pixel would make, at the text's own opacity.
      const whole = Math.min(1, opacity) / coverage;
      const unblend = (drawn: number, below: number): number =>
        Math.round(Math.min(255, Math.max(0, below + (drawn - below) * whole)));
      const fg: Rgb = [unblend(r, under[0]), unblend(g, under[1]), unblend(b, under[2])];
      return behind
        .map((layer) => {
          const bg = at(layer, i);
          return { ratio: contrastRatio(fg, bg), fg, bg };
        })
        .reduce((best, reading) => (reading.ratio > best.ratio ? reading : best));
    })
    .sort((a, b) => a.ratio - b.ratio);
  return samples[Math.floor(samples.length * WORST_SHARE)];
}

/**
 * The stylesheet that redraws the page as one layer. Transitions stop so the
 * change lands at once. SVG text is filled rather than text-filled, so its fill
 * changes with the layer, and its stroke goes. A pseudo-element keeps its own fill, since what it
 * draws is decoration and belongs to the background in every layer, unless it
 * was marked as drawing text (`PseudoText`), which is measured as text is.
 *
 * The white and black layers only find where glyphs are, so text is drawn unblended there: a
 * blend mode would scale white and black by what is under them. The other layers keep it.
 */
export function textLayerCss(layer: TextLayer): string {
  const glyphless = layer === "bare" || layer === "shadowless";
  const fill = glyphless ? "transparent" : { white: "#fff", black: "#000" }[layer];
  const clipped = glyphless ? "\n[data-dek-clip-text] { background: none !important; }" : "";
  const unblended = glyphless ? "" : "\n[data-dek-blend] { mix-blend-mode: normal !important; }";
  const unshadowed =
    layer === "shadowless" ? "\n*, *::before, *::after { text-shadow: none !important; }" : "";
  return `*, *::before, *::after { transition: none !important; }
* { -webkit-text-fill-color: ${fill} !important; }
*::before, *::after { -webkit-text-fill-color: initial !important; }
[data-dek-text-before]::before, [data-dek-text-after]::after { -webkit-text-fill-color: ${fill} !important; }
svg text, svg tspan, svg textPath { fill: ${fill} !important; stroke: transparent !important; }${clipped}${unblended}${unshadowed}`;
}

/**
 * Runs in the page: marks text whose background is clipped to its glyphs, so the bare layer can
 * take that background away with the glyphs, and each element that blends text into what is under
 * it, so the masks can draw it unblended. Says whether any text casts a shadow.
 */
function markTextLayers(): { shadowed: boolean } {
  let shadowed = false;
  for (const el of document.querySelectorAll("*")) {
    const style = getComputedStyle(el);
    if (style.backgroundClip === "text") {
      el.setAttribute("data-dek-clip-text", "");
    }
    if (style.mixBlendMode !== "normal" && el.textContent?.trim()) {
      el.setAttribute("data-dek-blend", "");
    }
    shadowed ||= [style, getComputedStyle(el, "::before"), getComputedStyle(el, "::after")].some(
      (drawn) => drawn.textShadow !== "none",
    );
  }
  return { shadowed };
}

/** Each layer as a base64 PNG; the shadowless one only when it was drawn. */
type EncodedLayers = { [layer in keyof TextLayers]: string };

type SamplerInput = { layers: EncodedLayers; texts: TextBoxes[] };

/** Each text, with the boxes of every other text that crosses one of its own. */
export function withOverlaps(texts: TextBoxes[]): TextBoxes[] {
  const crosses = (a: Box, b: Box): boolean =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  return texts.map((text, index) => ({
    ...text,
    overlaps: texts.flatMap((other, at) =>
      at === index
        ? []
        : other.rects.filter((box) => text.rects.some((rect) => crosses(rect, box))),
    ),
  }));
}

/** Runs in the page, with `measureTextContrast` in scope: decodes the layers and measures each text. */
async function sampleTextContrasts({
  layers,
  texts,
}: SamplerInput): Promise<Array<TextContrast | null>> {
  const decode = async (base64: string): Promise<Pixels> => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("no 2d context");
    }
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  };
  const decoded: TextLayers = {
    shown: await decode(layers.shown),
    bare: await decode(layers.bare),
    ...(layers.shadowless ? { shadowless: await decode(layers.shadowless) } : {}),
    white: await decode(layers.white),
    black: await decode(layers.black),
  };
  return texts.map((text) => measureTextContrast(decoded, text) ?? null);
}

/** Defines `window.__dekTextContrast`, the in-page sampler, from this file's own source. */
export function textContrastScript(): string {
  return `window.__dekTextContrast = (function () {
${relativeLuminance}
${contrastRatio}
${measureTextContrast}
return ${sampleTextContrasts};
})();
`;
}

type LayerPage = {
  screenshot(options: { type: "png" }): Promise<Uint8Array>;
  evaluate<T, A>(fn: (arg: A) => T | Promise<T>, arg?: A): Promise<T>;
  addScriptTag(options: { content: string }): Promise<unknown>;
};

/**
 * Draws the page as each layer, measures each text, and takes the layer's
 * stylesheet away again, so the page renders as shown for whatever runs next.
 * Entries are null for text none of whose glyphs shows.
 */
export async function measurePageTextContrasts(
  page: LayerPage,
  texts: TextBoxes[],
): Promise<Array<TextContrast | null>> {
  if (texts.length === 0) {
    return [];
  }
  const { shot, setLayer } = layerDrawer(page);
  const shown = await shot();
  const { shadowed } = await page.evaluate(markTextLayers);
  const layers = { shown } as EncodedLayers;
  const drawn = (["bare", "shadowless", "white", "black"] as const).filter(
    (layer) => shadowed || layer !== "shadowless",
  );
  for (const layer of drawn) {
    await setLayer(textLayerCss(layer));
    layers[layer] = await shot();
  }
  await setLayer(null);
  await page.addScriptTag({ content: textContrastScript() });
  return page.evaluate(
    (input) =>
      (
        window as unknown as {
          __dekTextContrast: (arg: SamplerInput) => Promise<Array<TextContrast | null>>;
        }
      ).__dekTextContrast(input),
    { layers, texts: withOverlaps(texts) },
  );
}

/**
 * Shots of the page and a stylesheet to redraw it with. `setLayer(null)` takes the layer away
 * again: the glyphs go back first, with transitions still off, so they do not fade back from the
 * last layer's fill in whatever is drawn next.
 */
function layerDrawer(page: LayerPage) {
  const shot = async (): Promise<string> =>
    Buffer.from(await page.screenshot({ type: "png" })).toString("base64");
  const setLayer = (css: string | null): Promise<void> =>
    page.evaluate((text) => {
      let style = document.getElementById("dek-text-layer");
      if (text === null) {
        if (style) {
          style.textContent = "*, *::before, *::after { transition: none !important; }";
          // Reading layout applies the change now, while transitions are still off.
          void document.body.offsetWidth;
          style.remove();
        }
        return;
      }
      if (!style) {
        style = document.createElement("style");
        style.id = "dek-text-layer";
        document.head.append(style);
      }
      style.textContent = text;
    }, css);
  return { shot, setLayer };
}

/** One pseudo-element's text, by the mark on its host, and the box Chromium lays it out in. */
type PseudoGlyphs = { host: string; pseudo: "before" | "after"; rect: Box };

/**
 * The box each pseudo-element's glyphs cover, which can be far smaller than the box it is laid out
 * in: a running head is often a full-width block holding a few words. Each is drawn alone, every
 * other glyph transparent, in white and in black; where the two differ inside its box is where its
 * glyphs are. Undefined for one none of whose glyphs shows.
 */
export async function measurePseudoGlyphBoxes(
  page: LayerPage,
  targets: PseudoGlyphs[],
): Promise<Array<Box | undefined>> {
  if (targets.length === 0) {
    return [];
  }
  const { shot, setLayer } = layerDrawer(page);
  const alone = ({ host, pseudo }: PseudoGlyphs, fill: string): string =>
    `*, *::before, *::after { transition: none !important; -webkit-text-fill-color: transparent !important; }
svg text, svg tspan, svg textPath { fill: transparent !important; stroke: transparent !important; }
[data-dek-text="${host}"][data-dek-text-${pseudo}]::${pseudo} { -webkit-text-fill-color: ${fill} !important; }`;
  const pairs: Array<{ white: string; black: string; rect: Box }> = [];
  for (const target of targets) {
    await setLayer(alone(target, "#fff"));
    const white = await shot();
    await setLayer(alone(target, "#000"));
    pairs.push({ white, black: await shot(), rect: target.rect });
  }
  await setLayer(null);
  const found = await page.evaluate(async (input) => {
    const decode = async (base64: string) => {
      const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("no 2d context");
      }
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, bitmap.width, bitmap.height);
    };
    const boxes: Array<Box | null> = [];
    for (const { white, black, rect } of input) {
      const [w, k] = [await decode(white), await decode(black)];
      let box: Box | null = null;
      const top = Math.max(0, Math.floor(rect.top));
      const bottom = Math.min(w.height, Math.ceil(rect.bottom));
      const left = Math.max(0, Math.floor(rect.left));
      const right = Math.min(w.width, Math.ceil(rect.right));
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          const i = (y * w.width + x) * 4;
          const differs =
            (w.data[i] ?? 0) !== (k.data[i] ?? 0) ||
            (w.data[i + 1] ?? 0) !== (k.data[i + 1] ?? 0) ||
            (w.data[i + 2] ?? 0) !== (k.data[i + 2] ?? 0);
          if (differs) {
            box = box
              ? {
                  left: Math.min(box.left, x),
                  top: Math.min(box.top, y),
                  right: Math.max(box.right, x + 1),
                  bottom: Math.max(box.bottom, y + 1),
                }
              : { left: x, top: y, right: x + 1, bottom: y + 1 };
          }
        }
      }
      boxes.push(box);
    }
    return boxes;
  }, pairs);
  return found.map((box) => box ?? undefined);
}
