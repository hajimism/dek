import { deckPaths } from "./deck-paths.ts";
import { type Diagnostic, diag } from "./diagnostic.ts";
import { EDGES, type Edge } from "./overflow.ts";
import {
  askPlaywright,
  type ContrastOrigin,
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
  const { pages, stills } = visualPages(deck, options);

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

/** Every beat of each section with a slide, the last one as a still shot with `screenshot`. */
function visualPages(
  deck: ResolvedDeck["deck"],
  options: VisualDeckOptions,
): { pages: VisualPage[]; stills: Still[] } {
  // A broken slide script is DEK016's to report; keep checking the slide without it.
  const sources = loadSlideSources(deck, { strict: false });
  const pages: VisualPage[] = [];
  const stills: Still[] = [];
  // A missing file or section is lint's to report (DEK001, DEK007); there is nothing to render.
  const sections = deck.deck.sections.filter(
    (section) =>
      (!options.slug || section.slug === options.slug) && sources.slides.has(section.slug),
  );
  for (const section of sections) {
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
  return { pages, stills };
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

type StepGroup<T> = { first: T; items: T[]; steps: string[] };

/** Groups findings that differ only by step, keeping the first-seen order. */
function groupBySteps<T extends { step: string }>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, StepGroup<T>>();
  for (const item of items) {
    const id = key(item);
    const group = groups.get(id);
    if (!group) {
      groups.set(id, { first: item, items: [item], steps: [item.step] });
      continue;
    }
    group.items.push(item);
    if (!group.steps.includes(item.step)) {
      group.steps.push(item.step);
    }
  }
  return [...groups.values()];
}

/**
 * Where to fix low contrast. Text the theme alone draws too faint is fixed once in theme.css
 * for every slide that uses the pair; a slide that fixed it in its own CSS would leave the rest.
 */
function contrastHint(origin: ContrastOrigin | undefined, threshold: number, slug: string): string {
  const own = `slides/${slug}.css`;
  switch (origin) {
    case "theme":
      return `theme.css alone draws it below ${threshold}:1: fix the pair in theme.css, where one change reaches every slide that uses it`;
    case "slide":
      return `${own} brings it below ${threshold}:1, which theme.css alone does not: raise its contrast in ${own}`;
    case undefined:
      return `raise the contrast of its color against the background to ${threshold}:1`;
  }
}

type PathOf = (slug: string) => string;

function visualDiagnostics(response: PagesResponse, deckDir: string): Diagnostic[] {
  const pathOf: PathOf = (slug) => deckPaths(deckDir).slide(slug, ".html");
  const failing = response.contrasts.filter((sample) => sample.ratio < contrastThreshold(sample));
  return [
    ...groupBySteps(response.overflows, overflowKey).map((group) =>
      overflowDiagnostic(group, pathOf),
    ),
    ...groupBySteps(failing, contrastKey).map((group) => contrastDiagnostic(group, pathOf)),
  ];
}

type OverflowSample = PagesResponse["overflows"][number];
type ContrastSample = PagesResponse["contrasts"][number];

function crossedEdges(overflow: OverflowSample): Edge[] {
  return EDGES.filter((edge) => overflow.by[edge] !== undefined);
}

function overflowKey(o: OverflowSample): string {
  return [o.slug, o.box, o.text ?? "", crossedEdges(o).join()].join("\0");
}

/** The ratio as reported, to one decimal: samples that round alike are one finding. */
function shownRatio(sample: ContrastSample): number {
  return Math.round(sample.ratio * 10) / 10;
}

function contrastKey(c: ContrastSample): string {
  return [c.slug, c.box, c.text ?? "", shownRatio(c), contrastThreshold(c), c.origin ?? ""].join(
    "\0",
  );
}

function overflowWhere(amounts: Partial<Record<Edge, number>>): string {
  const edges = Object.entries(amounts);
  if (edges.length === 0) {
    return "overflows the slide";
  }
  return `overflows ${edges.map(([edge, px]) => `the ${edge} edge by ${px}px`).join(" and ")}`;
}

function overflowHint(edges: Edge[], slug: string): string | undefined {
  const css = `slides/${slug}.css`;
  const hints = [
    ...(edges.some((edge) => edge === "left" || edge === "right")
      ? [`${HORIZONTAL_HINT} ${css}`]
      : []),
    ...(edges.some((edge) => edge === "top" || edge === "bottom")
      ? [`${VERTICAL_HINT} ${css}`]
      : []),
  ];
  return hints.length > 0 ? hints.join("; ") : undefined;
}

function overflowDiagnostic(
  { first, items, steps }: StepGroup<OverflowSample>,
  pathOf: PathOf,
): Diagnostic {
  const edges = crossedEdges(first);
  // Each edge by the most it overflows at any step, so the fix covers the worst beat.
  const amounts = Object.fromEntries(
    edges.map((edge) => [edge, Math.max(...items.map((item) => item.by[edge] ?? 0))]),
  );
  const target =
    edges.length === 0 && !first.text ? "content " : describeTarget(first.box, first.text);
  const hint = overflowHint(edges, first.slug);
  return diag("DEK030", {
    message: `${target}${overflowWhere(amounts)} ${atSteps(steps)}`,
    path: pathOf(first.slug),
    slug: first.slug,
    ...(hint ? { hint } : {}),
    data: {
      box: first.box,
      ...(first.text ? { text: first.text } : {}),
      edges: amounts,
      steps,
    },
  });
}

function contrastDiagnostic(
  { first, steps }: StepGroup<ContrastSample>,
  pathOf: PathOf,
): Diagnostic {
  const threshold = contrastThreshold(first);
  const ratio = shownRatio(first);
  const size = threshold === 3 ? " (large text)" : "";
  const fg = toHex(first.fg);
  const bg = toHex(first.bg);
  const colors = fg && bg ? ` (${fg} on ${bg})` : "";
  return diag("DEK031", {
    message: `${describeTarget(first.box, first.text)}has contrast ${ratio}${colors}, below ${threshold}:1${size} ${atSteps(steps)}`,
    path: pathOf(first.slug),
    slug: first.slug,
    hint: contrastHint(first.origin, threshold, first.slug),
    data: {
      box: first.box,
      ...(first.text ? { text: first.text } : {}),
      ratio,
      threshold,
      ...(fg && bg ? { fg, bg } : {}),
      ...(first.origin ? { origin: first.origin } : {}),
      steps,
    },
  });
}
