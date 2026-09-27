import { deckPaths } from "./deck-paths.ts";
import { type Diagnostic, diag } from "./diagnostic.ts";
import { EDGES } from "./overflow.ts";
import {
  askPlaywright,
  type PageAction,
  type PagesResponse,
  type PlaywrightRunner,
  playwrightReady,
  type VisualPage,
} from "./playwright.ts";
import { asResolvedDeck, type ResolvedDeck } from "./resolve.ts";
import { type Still, still, stillPage } from "./shot/still.ts";
import { logicalSize } from "./size.ts";
import { lastStop, stepKey } from "./step.ts";
import { loadSlideSources, renderSlideHtml } from "./still-page.ts";
import { contrastThreshold, parseCssRgb } from "./text-contrast.ts";

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

/**
 * Every beat of every slide measured in one browser run, and with `screenshot` each slide's
 * still shot in the same run. Null when Playwright is not installed.
 */
async function visualDeck(
  input: string | ResolvedDeck,
  options: VisualDeckOptions,
): Promise<VisualDeckResult | null> {
  // Every page is measured in a browser, so without one there is nothing to render or cache.
  if (!playwrightReady(options.runner)) {
    return null;
  }
  const { deck } = asResolvedDeck(input);
  // A broken slide script is DEK016's to report; keep checking the slide without it.
  const sources = loadSlideSources(deck, { strict: false });
  const pages: VisualPage[] = [];
  const stills: Still[] = [];

  for (const section of deck.deck.sections) {
    if (options.slug && section.slug !== options.slug) {
      continue;
    }
    // A missing file or section is lint's to report (DEK001, DEK007); there is nothing to render.
    if (!sources.slides.has(section.slug)) {
      continue;
    }
    const last = lastStop(section.beats);
    for (let beatIndex = 0; beatIndex <= last; beatIndex++) {
      if (options.screenshot && beatIndex === last) {
        // The same still `dek shot` takes of the slide, and taken only when it is not on disk.
        const shot = still(deck, section, beatIndex, sources);
        stills.push(shot);
        pages.push(stillPage(shot));
      } else {
        pages.push({
          html: renderSlideHtml(sources, section.slug, beatIndex),
          slug: section.slug,
          step: stepKey(section.beats, beatIndex),
        });
      }
    }
  }

  if (pages.length === 0) {
    return { diagnostics: [] };
  }

  const actions: PageAction[] = ["overflow", "contrast"];
  const response = await askPlaywright(
    { kind: "pages", viewport: logicalSize(deck.deck.ratio), actions, pages },
    options.runner,
  );
  if (response === null) {
    return null;
  }
  for (const shot of stills) {
    shot.entry.commit();
  }
  return {
    diagnostics: visualDiagnostics(response, deck.dir),
    ...(stills[0] ? { screenshotPath: stills[0].screenshotPath } : {}),
  };
}

const SNIPPET_CHARS = 24;
const HORIZONTAL_HINT = "shorten it, or let it wrap with overflow-wrap: anywhere in";
// Changing a size token would move every slide; the fix belongs to this one.
const VERTICAL_HINT = "cut it, split it across beats or slides, or give it a smaller size in";

function describeTarget(box: string, text: string | undefined): string {
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

function toHex(color: string): string | undefined {
  const rgb = parseCssRgb(color);
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
    const value = step(item);
    if (!group.steps.includes(value)) {
      group.steps.push(value);
    }
    groups.set(id, group);
  }
  return [...groups.values()];
}

function visualDiagnostics(response: PagesResponse, deckDir: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const pathOf = (slug: string): string => deckPaths(deckDir).slide(slug, ".html");

  const overflowGroups = groupBySteps(
    response.overflows,
    (o) => [o.slug, o.box, o.text ?? "", EDGES.filter((edge) => o.by[edge]).join()].join("\0"),
    (o) => o.step,
  );
  for (const { items, steps } of overflowGroups) {
    const [first] = items;
    if (!first) {
      continue;
    }
    const edges = EDGES.filter((edge) => first.by[edge] !== undefined);
    const where =
      edges.length === 0
        ? "overflows the slide"
        : `overflows ${edges
            .map((edge) => {
              const px = Math.max(...items.map((item) => item.by[edge] ?? 0));
              return `the ${edge} edge by ${px}px`;
            })
            .join(" and ")}`;
    const hints = [
      ...(edges.some((edge) => edge === "left" || edge === "right")
        ? [`${HORIZONTAL_HINT} slides/${first.slug}.css`]
        : []),
      ...(edges.some((edge) => edge === "top" || edge === "bottom")
        ? [`${VERTICAL_HINT} slides/${first.slug}.css`]
        : []),
    ];
    const target =
      edges.length === 0 && !first.text ? "content " : describeTarget(first.box, first.text);
    const amounts = Object.fromEntries(
      edges.map((edge) => [edge, Math.max(...items.map((item) => item.by[edge] ?? 0))]),
    );
    diagnostics.push(
      diag("DEK030", {
        message: `${target}${where} ${atSteps(steps)}`,
        path: pathOf(first.slug),
        slug: first.slug,
        ...(hints.length > 0 ? { hint: hints.join("; ") } : {}),
        data: {
          box: first.box,
          ...(first.text ? { text: first.text } : {}),
          edges: amounts,
          steps,
        },
      }),
    );
  }

  const failing = response.contrasts.filter((sample) => sample.ratio < contrastThreshold(sample));
  const contrastGroups = groupBySteps(
    failing,
    (c) => [c.slug, c.box, c.text ?? "", Math.round(c.ratio * 10), contrastThreshold(c)].join("\0"),
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
    diagnostics.push(
      diag("DEK031", {
        message: `${describeTarget(first.box, first.text)}has contrast ${ratio}${colors}, below ${threshold}:1${size} ${atSteps(steps)}`,
        path: pathOf(first.slug),
        slug: first.slug,
        hint: `raise the contrast of its color against the background to ${threshold}:1`,
        data: {
          box: first.box,
          ...(first.text ? { text: first.text } : {}),
          ratio,
          threshold,
          ...(fg && bg ? { fg, bg } : {}),
          steps,
        },
      }),
    );
  }
  return diagnostics;
}
