import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Diagnostic } from "./diagnostic.ts";
import { DekError } from "./error.ts";
import { loadSlideSources, renderSlideHtml } from "./html.ts";
import { cacheDir } from "./path.ts";
import {
  defaultPlaywrightRunner,
  type PlaywrightRunner,
  playwrightResolved,
  type VisualPage,
  type VisualResponse,
} from "./playwright.ts";
import { asResolvedDeck, type ResolvedDeck } from "./resolve.ts";
import { pruneStaleShots, shotFileName } from "./shot.ts";
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

export type TextSample = {
  fontSize?: number;
  fontWeight?: number;
};

/** WCAG large text: 24px (18pt) regular, or 18.66px (14pt) bold. */
export const LARGE_TEXT_PX = 24;
export const LARGE_BOLD_TEXT_PX = 18.66;
export const BOLD_WEIGHT = 700;

export function isLargeText(sample: TextSample): boolean {
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

export type VisualDeckOptions = {
  slug?: string;
  runner?: PlaywrightRunner;
  screenshot?: boolean;
};

export type VisualDeckResult = {
  diagnostics: Diagnostic[];
  screenshotPath?: string;
};

export async function lintVisualDeck(
  dir: string,
  options?: VisualDeckOptions,
): Promise<Diagnostic[] | null>;
export async function lintVisualDeck(
  source: ResolvedDeck,
  options?: VisualDeckOptions,
): Promise<Diagnostic[] | null>;
export async function lintVisualDeck(
  input: string | ResolvedDeck,
  options: VisualDeckOptions = {},
): Promise<Diagnostic[] | null> {
  const result = await visualDeck(input, options);
  return result ? result.diagnostics : null;
}

export async function runVisualDeck(
  dir: string,
  options?: VisualDeckOptions,
): Promise<VisualDeckResult | null>;
export async function runVisualDeck(
  source: ResolvedDeck,
  options?: VisualDeckOptions,
): Promise<VisualDeckResult | null>;
export async function runVisualDeck(
  input: string | ResolvedDeck,
  options: VisualDeckOptions = {},
): Promise<VisualDeckResult | null> {
  return visualDeck(input, options);
}

async function visualDeck(
  input: string | ResolvedDeck,
  options: VisualDeckOptions,
): Promise<VisualDeckResult | null> {
  const runner = options.runner ?? defaultPlaywrightRunner;
  if (runner === defaultPlaywrightRunner && !playwrightResolved()) {
    return null;
  }

  const { deck } = asResolvedDeck(input);
  const sources = loadSlideSources(deck);
  const diagnostics: Diagnostic[] = [];
  const pages: Array<VisualPage & { path: string }> = [];
  const size = logicalSize(deck.deck.ratio);
  const shotDir = options.screenshot ? cacheDir(deck.dir, "shots") : undefined;
  if (shotDir) {
    mkdirSync(shotDir, { recursive: true });
  }

  for (const section of deck.deck.sections) {
    if (options.slug && section.slug !== options.slug) {
      continue;
    }
    const slidePath = join(deck.dir, "slides", `${section.slug}.html`);
    const beatCount = Math.max(section.beats.length, 1);
    const last = beatCount - 1;
    for (let beatIndex = 0; beatIndex < beatCount; beatIndex++) {
      try {
        const html = renderSlideHtml(deck, section.slug, beatIndex, sources);
        let screenshotPath: string | undefined;
        if (shotDir && beatIndex === last) {
          const filename = shotFileName(section.slug, undefined, html);
          pruneStaleShots(shotDir, section.slug, undefined, filename);
          screenshotPath = join(shotDir, filename);
        }
        pages.push({
          html,
          slug: section.slug,
          step: section.beats[beatIndex]?.id ?? String(beatIndex + 1),
          path: slidePath,
          ...(screenshotPath ? { screenshotPath } : {}),
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
    return { diagnostics };
  }

  const actions: Array<"overflow" | "contrast" | "screenshot"> = ["overflow", "contrast"];
  if (options.screenshot) {
    actions.push("screenshot");
  }
  const response = await runner({
    viewport: size,
    actions,
    pages: pages.map((page) => ({
      html: page.html,
      slug: page.slug,
      step: page.step,
      ...(page.screenshotPath ? { screenshotPath: page.screenshotPath } : {}),
    })),
  });
  if (response === null) {
    return null;
  }
  diagnostics.push(...visualDiagnostics(response, pages[0]?.path ?? deck.dir));
  return {
    diagnostics,
    screenshotPath: pages.find((page) => page.screenshotPath)?.screenshotPath,
  };
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
    const threshold = contrastThreshold(contrast);
    if (contrast.ratio >= threshold) {
      continue;
    }
    const ratio = Math.round(contrast.ratio * 10) / 10;
    const size = threshold === 3 ? " (large text)" : "";
    diagnostics.push({
      id: "DEK031",
      message: `contrast ${ratio} is below ${threshold}:1${size} at step ${contrast.step || "1"}`,
      path: contrast.slug ? join(dirname(fallbackPath), `${contrast.slug}.html`) : fallbackPath,
    });
  }
  return diagnostics;
}
