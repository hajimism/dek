import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Diagnostic } from "./diagnostic.ts";
import { DekError } from "./error.ts";
import { loadSlideSources, renderSlideHtml } from "./html.ts";
import { cacheDir } from "./path.ts";
import {
  defaultPlaywrightRunner,
  type Edge,
  type PlaywrightRunner,
  playwrightResolved,
  type VisualPage,
  type VisualResponse,
} from "./playwright.ts";
import { asResolvedDeck, type ResolvedDeck } from "./resolve.ts";
import { pruneStaleShots, shotFileName } from "./shot.ts";
import { logicalSize } from "./size.ts";
import type { Box, MeasuredElement } from "./slide-measure.ts";
import { stepKey } from "./step.ts";

export type { Box } from "./slide-measure.ts";

export type Rgb = [number, number, number];

const EDGES: Edge[] = ["top", "right", "bottom", "left"];

export type Overflow = {
  box: string;
  text?: string;
  by: Partial<Record<Edge, number>>;
};

function overflowAmounts(slide: Box, rect: Box): Partial<Record<Edge, number>> {
  if (rect.right <= rect.left || rect.bottom <= rect.top) {
    return {};
  }
  const past: Record<Edge, number> = {
    top: slide.top - rect.top,
    right: rect.right - slide.right,
    bottom: rect.bottom - slide.bottom,
    left: slide.left - rect.left,
  };
  const by: Partial<Record<Edge, number>> = {};
  for (const edge of EDGES) {
    // Sub-pixel layout rounding is not an overflow anyone can see.
    if (past[edge] >= 1) {
      by[edge] = Math.round(past[edge]);
    }
  }
  return by;
}

/**
 * The elements that cross an edge of the slide, each reported only for the
 * edges its parent stays inside: a list that runs off the bottom is one
 * finding, not one per item.
 */
export function findOverflows(
  slide: Box,
  elements: Array<Pick<MeasuredElement, "box" | "parent" | "rect" | "text">>,
): Overflow[] {
  const amounts = elements.map((element) => overflowAmounts(slide, element.rect));
  const found: Overflow[] = [];
  elements.forEach((element, index) => {
    const parent = amounts[element.parent] ?? {};
    const by: Partial<Record<Edge, number>> = {};
    for (const edge of EDGES) {
      const amount = amounts[index]?.[edge];
      if (amount !== undefined && parent[edge] === undefined) {
        by[edge] = amount;
      }
    }
    if (Object.keys(by).length > 0) {
      found.push({ box: element.box, ...(element.text ? { text: element.text } : {}), by });
    }
  });
  return found;
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
  // A broken slide script is DEK016's to report; keep checking the slide without it.
  const sources = loadSlideSources(deck, { strict: false });
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
          step: stepKey(section.beats, beatIndex),
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

const SNIPPET_CHARS = 24;
const HORIZONTAL_HINT = "shorten it, or let it wrap with overflow-wrap: anywhere in";
const VERTICAL_HINT = "cut or split the content, or lower the size tokens";

function describeTarget(box: string | undefined, text: string | undefined): string {
  if (!box) {
    return "";
  }
  if (!text) {
    return `${box} `;
  }
  const chars = [...text];
  const snippet =
    chars.length > SNIPPET_CHARS ? `${chars.slice(0, SNIPPET_CHARS).join("")}…` : text;
  return `${box} "${snippet}" `;
}

function atSteps(steps: string[]): string {
  return steps.length === 1 ? `at step ${steps[0]}` : `at steps ${steps.join(", ")}`;
}

function toHex(color: string | undefined): string | undefined {
  const rgb = color === undefined ? undefined : parseCssRgb(color);
  return (
    rgb && `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`
  );
}

/** Groups findings that differ only by step, keeping the first-seen order. */
function groupBySteps<T>(items: T[], key: (item: T) => string, step: (item: T) => string) {
  const groups = new Map<string, { items: T[]; steps: string[] }>();
  for (const item of items) {
    const id = key(item);
    const group = groups.get(id) ?? { items: [], steps: [] };
    group.items.push(item);
    const value = step(item) || "1";
    if (!group.steps.includes(value)) {
      group.steps.push(value);
    }
    groups.set(id, group);
  }
  return [...groups.values()];
}

function visualDiagnostics(response: VisualResponse, fallbackPath: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const pathOf = (slug: string): string =>
    slug ? join(dirname(fallbackPath), `${slug}.html`) : fallbackPath;

  const overflowGroups = groupBySteps(
    response.overflows,
    (o) => [o.slug, o.box, o.text ?? "", EDGES.filter((edge) => o.by?.[edge]).join()].join("\0"),
    (o) => o.step,
  );
  for (const { items, steps } of overflowGroups) {
    const [first] = items;
    if (!first) {
      continue;
    }
    const edges = EDGES.filter((edge) => first.by?.[edge] !== undefined);
    const where =
      edges.length === 0
        ? "overflows the slide"
        : `overflows ${edges
            .map((edge) => {
              const px = Math.max(...items.map((item) => item.by?.[edge] ?? 0));
              return `the ${edge} edge by ${px}px`;
            })
            .join(" and ")}`;
    const hints = [
      ...(edges.some((edge) => edge === "left" || edge === "right")
        ? [`${HORIZONTAL_HINT} slides/${first.slug}.css`]
        : []),
      ...(edges.some((edge) => edge === "top" || edge === "bottom") ? [VERTICAL_HINT] : []),
    ];
    const target =
      edges.length === 0 && !first.text ? "content " : describeTarget(first.box, first.text);
    diagnostics.push({
      id: "DEK030",
      message: `${target}${where} ${atSteps(steps)}`,
      path: pathOf(first.slug),
      ...(first.slug ? { slug: first.slug } : {}),
      ...(hints.length > 0 ? { hint: hints.join("; ") } : {}),
    });
  }

  const failing = response.contrasts.filter((sample) => sample.ratio < contrastThreshold(sample));
  const contrastGroups = groupBySteps(
    failing,
    (c) =>
      [c.slug, c.box ?? "", c.text ?? "", Math.round(c.ratio * 10), contrastThreshold(c)].join(
        "\0",
      ),
    (c) => c.step,
  );
  for (const { items, steps } of contrastGroups) {
    const [first] = items;
    if (!first) {
      continue;
    }
    const threshold = contrastThreshold(first);
    const ratio = Math.round(first.ratio * 10) / 10;
    const size = threshold === 3 ? " (large text)" : "";
    const fg = toHex(first.fg);
    const bg = toHex(first.bg);
    const colors = fg && bg ? ` (${fg} on ${bg})` : "";
    const message = first.box
      ? `${describeTarget(first.box, first.text)}has contrast ${ratio}${colors}, below ${threshold}:1${size} ${atSteps(steps)}`
      : `contrast ${ratio} is below ${threshold}:1${size} ${atSteps(steps)}`;
    diagnostics.push({
      id: "DEK031",
      message,
      path: pathOf(first.slug),
      ...(first.slug ? { slug: first.slug } : {}),
      hint: `raise the contrast of its color against the background to ${threshold}:1`,
    });
  }
  return diagnostics;
}
