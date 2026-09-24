/**
 * Text contrast measured from pixels. The page is drawn four ways: as shown,
 * with every glyph transparent, and with every glyph filled white and black.
 * White minus black is where glyphs cover, whatever their color and whatever
 * sits above them; within that, the shown pixel is the text as the audience
 * sees it and the bare pixel is what it sits on. Gradients, images, glows,
 * opacity, and colors no parser reads are all measured as drawn.
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
  /** Every glyph filled white. */
  white: Pixels;
  /** Every glyph filled black. */
  black: Pixels;
};

/** The layers the page is redrawn as; `shown` needs no change. */
export type TextLayer = Exclude<keyof TextLayers, "shown">;

export type TextContrast = {
  ratio: number;
  /** The text's color at the pixel that reads worst. */
  fg: Rgb;
  /** What that pixel sits on. */
  bg: Rgb;
};

export function relativeLuminance([r, g, b]: Rgb): number {
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

/** One text to measure. */
export type TextBoxes = {
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
  const { shown, bare, white, black } = layers;
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
      const bg = at(bare, i);
      const [r, g, b] = at(shown, i);
      // The blend a glyph covering the whole pixel would make, at the text's own opacity.
      const whole = Math.min(1, opacity) / coverage;
      const unblend = (drawn: number, under: number): number =>
        Math.round(Math.min(255, Math.max(0, under + (drawn - under) * whole)));
      const fg: Rgb = [unblend(r, bg[0]), unblend(g, bg[1]), unblend(b, bg[2])];
      return { ratio: contrastRatio(fg, bg), fg, bg };
    })
    .sort((a, b) => a.ratio - b.ratio);
  return samples[Math.floor(samples.length * WORST_SHARE)];
}

/**
 * The stylesheet that redraws the page as one layer. Transitions stop so the
 * change lands at once; pseudo-elements keep their own fill, since what they
 * draw is decoration and belongs to the background in every layer.
 */
export function textLayerCss(layer: TextLayer): string {
  const fill = { bare: "transparent", white: "#fff", black: "#000" }[layer];
  const clipped = layer === "bare" ? "\n[data-dek-clip-text] { background: none !important; }" : "";
  return `*, *::before, *::after { transition: none !important; }
* { -webkit-text-fill-color: ${fill} !important; }
*::before, *::after { -webkit-text-fill-color: initial !important; }${clipped}`;
}

/**
 * Runs in the page: marks text whose background is clipped to its glyphs, so
 * the bare layer can take that background away with the glyphs.
 */
export function markClippedText(): void {
  for (const el of document.querySelectorAll("*")) {
    if (getComputedStyle(el).backgroundClip === "text") {
      el.setAttribute("data-dek-clip-text", "");
    }
  }
}

type SamplerInput = { layers: Record<keyof TextLayers, string>; texts: TextBoxes[] };

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
  const shot = async (): Promise<string> =>
    Buffer.from(await page.screenshot({ type: "png" })).toString("base64");
  // null takes the layer away again.
  const setLayer = (css: string | null): Promise<void> =>
    page.evaluate((text) => {
      let style = document.getElementById("dek-text-layer");
      if (text === null) {
        style?.remove();
        return;
      }
      if (!style) {
        style = document.createElement("style");
        style.id = "dek-text-layer";
        document.head.append(style);
      }
      style.textContent = text;
    }, css);
  const shown = await shot();
  await page.evaluate(markClippedText);
  const layers = { shown } as Record<keyof TextLayers, string>;
  for (const layer of ["bare", "white", "black"] as const) {
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
