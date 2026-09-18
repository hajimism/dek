import { dirname, join } from "node:path";
import type { Diagnostic } from "./diagnostic.ts";
import { DekError } from "./error.ts";
import {
  defaultPlaywrightRunner,
  type PlaywrightRunner,
  playwrightResolved,
  type VisualResponse,
} from "./playwright.ts";
import { type ProjectDeck, resolveDeck } from "./resolve.ts";
import { logicalSize } from "./size.ts";

export type Box = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type Rgb = [number, number, number];

export function overflowsSlide(slide: Box, child: Box): boolean {
  return (
    child.left < slide.left ||
    child.top < slide.top ||
    child.right > slide.right ||
    child.bottom > slide.bottom
  );
}

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

export function parseCssRgb(color: string): Rgb | undefined {
  const match = color.match(/rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)/i);
  if (!match) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export async function lintVisualDeck(
  dir: string,
  options: { slug?: string; runner?: PlaywrightRunner; deck?: ProjectDeck } = {},
): Promise<Diagnostic[] | null> {
  const runner = options.runner ?? defaultPlaywrightRunner;
  if (runner === defaultPlaywrightRunner && !playwrightResolved()) {
    return null;
  }

  const deck = options.deck ?? resolveDeck(dir).deck;
  const { renderSlideHtml } = await import("./html.ts");
  const diagnostics: Diagnostic[] = [];
  const pages: Array<{ html: string; slug: string; step: string; path: string }> = [];
  const size = logicalSize(deck.deck.ratio);

  for (const section of deck.deck.sections) {
    if (options.slug && section.slug !== options.slug) {
      continue;
    }
    const slidePath = join(deck.dir, "slides", `${section.slug}.html`);
    const beatCount = Math.max(section.beats.length, 1);
    for (let beatIndex = 0; beatIndex < beatCount; beatIndex++) {
      try {
        const html = renderSlideHtml(deck, section.slug, beatIndex);
        pages.push({
          html,
          slug: section.slug,
          step: section.beats[beatIndex]?.id ?? String(beatIndex + 1),
          path: slidePath,
        });
      } catch (error) {
        if (error instanceof DekError) {
          diagnostics.push({
            id: "DEK001",
            message: error.message,
            path: error.path ?? slidePath,
          });
          continue;
        }
        throw error;
      }
    }
  }

  if (pages.length === 0) {
    return diagnostics.length > 0 ? diagnostics : [];
  }

  const response = await runner({
    viewport: size,
    actions: ["overflow", "contrast"],
    pages: pages.map((page) => ({ html: page.html, slug: page.slug, step: page.step })),
  });
  if (response === null) {
    return null;
  }
  diagnostics.push(...visualDiagnostics(response, pages[0]?.path ?? deck.dir));
  return diagnostics;
}

function visualDiagnostics(response: VisualResponse, fallbackPath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const overflow of response.overflows) {
    diagnostics.push({
      id: "DEK030",
      message: `content overflows the slide at step ${overflow.step || "1"}`,
      path: overflow.slug ? join(dirname(fallbackPath), `${overflow.slug}.html`) : fallbackPath,
    });
  }
  for (const contrast of response.contrasts) {
    if (contrast.ratio >= 4.5) {
      continue;
    }
    const ratio = Math.round(contrast.ratio * 10) / 10;
    diagnostics.push({
      id: "DEK031",
      message: `contrast ${ratio} is below 4.5:1 at step ${contrast.step || "1"}`,
      path: contrast.slug ? join(dirname(fallbackPath), `${contrast.slug}.html`) : fallbackPath,
    });
  }
  return diagnostics;
}
