import { type DeckPaths, deckPaths } from "./deck-paths.ts";
import { type Diagnostic, diag } from "./diagnostic.ts";
import { EDGES, type Edge } from "./overflow.ts";
import { renderPdfHtml } from "./pdf.ts";
import {
  askPlaywright,
  type FillFinding,
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
import { type PageFindings, visualCache } from "./visual-cache.ts";

export type VisualDeckOptions = {
  slug?: string;
  runner?: PlaywrightRunner;
  screenshot?: boolean;
};

export type VisualDeckResult = {
  diagnostics: Diagnostic[];
  screenshotPath?: string;
  /** How much of the frame each slide measured fills at its last beat, as its shot shows it. */
  fills: FillFinding[];
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
  const { pages, stills, scripted } = visualPages(deck, options);

  if (pages.length === 0) {
    return { diagnostics: [], fills: [] };
  }

  const actions: PageAction[] = ["overflow", "contrast", "fill", "breaks", "alignment"];
  const viewport = logicalSize(deck.deck.ratio);
  const cache = visualCache(deck.dir, { viewport, actions });
  const keyed = pages.map((page) => {
    const key = cache.key(page);
    return { page, key, found: cache.read(key) };
  });
  // A page is measured again only when its findings are not kept, or it still owes its shot.
  const toMeasure = keyed.filter(({ page, found }) => !found || page.screenshotPath);
  const response =
    toMeasure.length === 0
      ? NOTHING_FOUND
      : await askPlaywright(
          { kind: "pages", viewport, actions, pages: toMeasure.map(({ page }) => page) },
          options.runner,
        );
  if (response === null) {
    return null;
  }
  const fresh = findingsByPage(response);
  for (const { page, key } of toMeasure) {
    cache.write(key, fresh.get(pageId(page)) ?? NOTHING_FOUND);
  }
  const whole = scripted ? await wholeDeckDraws(deck, viewport, options.runner) : undefined;
  if (whole === null) {
    return null;
  }
  if (!options.slug) {
    cache.prune(new Set([...keyed.map(({ key }) => key), ...(whole ? [whole.key] : [])]));
  }
  for (const shot of stills) {
    shot.entry.commit();
  }
  // In the pages' order; a finding that names no page asked for is reported all the same.
  const asked = new Set(keyed.map(({ page }) => pageId(page)));
  // Each slide's pages run from its arrival to its last beat, so the last one kept is its last.
  const lastSteps = new Map(pages.map((page) => [page.slug, page.step]));
  const all = [
    ...keyed.map(({ page, found }) => fresh.get(pageId(page)) ?? found ?? NOTHING_FOUND),
    ...[...fresh].flatMap(([id, found]) => (asked.has(id) ? [] : [found])),
    {
      ...NOTHING_FOUND,
      drawErrors: (whole?.drawErrors ?? []).filter(
        (error) => !options.slug || error.slug === options.slug,
      ),
    },
  ];
  return {
    diagnostics: visualDiagnostics(
      {
        overflows: all.flatMap((page) => page.overflows),
        contrasts: all.flatMap((page) => page.contrasts),
        drawErrors: all.flatMap((page) => page.drawErrors),
        collisions: all.flatMap((page) => page.collisions ?? []),
        lineBreaks: all.flatMap((page) => page.lineBreaks ?? []),
        misalignments: all.flatMap((page) => page.misalignments ?? []),
      },
      deck.dir,
    ),
    ...(stills[0] ? { screenshotPath: stills[0].screenshotPath } : {}),
    fills: all
      .flatMap((page) => page.fills)
      .filter((fill) => lastSteps.get(fill.slug) === fill.step),
  };
}

/** A page's findings before any is found, each list its own to push to. */
function noFindings(): PageFindings {
  return {
    overflows: [],
    contrasts: [],
    drawErrors: [],
    collisions: [],
    fills: [],
    lineBreaks: [],
    misalignments: [],
  };
}

const NOTHING_FOUND: PageFindings = noFindings();

/** A page's findings name its slide and step, which no two pages of one run share. */
function pageId(page: { slug: string; step: string }): string {
  return `${page.slug}\0${page.step}`;
}

/** A response split back into its pages' findings. */
function findingsByPage(response: PagesResponse): Map<string, PageFindings> {
  const pages = new Map<string, PageFindings>();
  const of = (finding: { slug: string; step: string }): PageFindings => {
    const id = pageId(finding);
    const found = pages.get(id) ?? noFindings();
    pages.set(id, found);
    return found;
  };
  for (const finding of response.overflows) {
    of(finding).overflows.push(finding);
  }
  for (const finding of response.contrasts) {
    of(finding).contrasts.push(finding);
  }
  for (const finding of response.drawErrors ?? []) {
    of(finding).drawErrors.push(finding);
  }
  for (const finding of response.collisions ?? []) {
    of(finding).collisions.push(finding);
  }
  for (const finding of response.fills ?? []) {
    of(finding).fills.push(finding);
  }
  for (const finding of response.lineBreaks ?? []) {
    of(finding).lineBreaks.push(finding);
  }
  for (const finding of response.misalignments ?? []) {
    of(finding).misalignments.push(finding);
  }
  return pages;
}

/** Every beat of each section with a slide, the last one as a still shot with `screenshot`. */
function visualPages(
  deck: ResolvedDeck["deck"],
  options: VisualDeckOptions,
): { pages: VisualPage[]; stills: Still[]; scripted: boolean } {
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
        // The same still `dekc shot` takes of the slide, and taken only when it is not on disk.
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
  const scripted = sources.scripts.some((entry) => !("problem" in entry));
  return { pages, stills, scripted };
}

/**
 * What the slides' draws do with every slide on one page, as in the built deck: only there does a
 * draw that finds its elements through the document reach another slide. The page is drawn for
 * its draws alone, and kept like any page by what it renders. Null when Playwright is missing.
 */
async function wholeDeckDraws(
  deck: ResolvedDeck["deck"],
  viewport: { width: number; height: number },
  runner: PlaywrightRunner | undefined,
): Promise<{ key: string; drawErrors: PageFindings["drawErrors"] } | null> {
  const cache = visualCache(deck.dir, { viewport, actions: [] });
  const page: VisualPage = { html: renderPdfHtml(deck, { strict: false }), slug: "*", step: "*" };
  const key = cache.key(page);
  const kept = cache.read(key);
  if (kept) {
    return { key, drawErrors: kept.drawErrors };
  }
  const response = await askPlaywright(
    { kind: "pages", viewport, actions: [], pages: [page] },
    runner,
  );
  if (response === null) {
    return null;
  }
  const drawErrors = response.drawErrors ?? [];
  cache.write(key, { ...NOTHING_FOUND, drawErrors });
  return { key, drawErrors };
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
 * Text only the slide's CSS shows was never measured on the theme alone, so both are named.
 */
function contrastHint(sample: ContrastSample, threshold: number): string {
  const { origin, slug } = sample;
  const own = `slides/${slug}.css`;
  if (sample.onlyWithSlideCss) {
    return `without ${own} it does not show, so dek cannot tell whether theme.css alone draws it below ${threshold}:1: fix the pair in ${own}, or in theme.css if the colors are the theme's`;
  }
  switch (origin) {
    case "theme":
      return `theme.css alone draws it below ${threshold}:1: fix the pair in theme.css, where one change reaches every slide that uses it`;
    case "slide":
      return `${own} brings it below ${threshold}:1, which theme.css alone does not: raise its contrast in ${own}`;
    case "script": {
      // What draw sets inline wins over every stylesheet, so the fix is in the script.
      const script = `slides/${slug}.ts`;
      return `${script} draws it below ${threshold}:1, and a color draw sets inline wins over any stylesheet: raise the contrast of the color it sets in ${script}`;
    }
    case undefined:
      return `raise the contrast of its color against the background to ${threshold}:1`;
  }
}

/**
 * The file to change: the one the origin names, or the slide itself when it is not known. Text
 * only the slide's CSS shows goes to that CSS, which the hint names first.
 */
function contrastPath(
  { origin, slug, onlyWithSlideCss }: ContrastSample,
  paths: DeckPaths,
): string {
  if (onlyWithSlideCss) {
    return paths.slide(slug, ".css");
  }
  switch (origin) {
    case "theme":
      return paths.theme;
    case "slide":
      return paths.slide(slug, ".css");
    case "script":
      return paths.slide(slug, ".ts");
    case undefined:
      return paths.slide(slug, ".html");
  }
}

function visualDiagnostics(response: PagesResponse, deckDir: string): Diagnostic[] {
  const paths = deckPaths(deckDir);
  const failing = response.contrasts.filter((sample) => sample.ratio < contrastThreshold(sample));
  return [
    ...groupBySteps(response.overflows, overflowKey).map((group) =>
      overflowDiagnostic(group, paths),
    ),
    ...groupBySteps(failing, contrastKey).map((group) => contrastDiagnostic(group, paths)),
    ...groupBySteps(response.drawErrors ?? [], drawErrorKey).map((group) =>
      drawErrorDiagnostic(group, deckDir),
    ),
    ...groupBySteps(response.collisions ?? [], collisionKey).map((group) =>
      collisionDiagnostic(group, paths),
    ),
    ...groupBySteps(response.lineBreaks ?? [], lineBreakKey).map((group) =>
      lineBreakDiagnostic(group, paths),
    ),
    ...groupBySteps(response.misalignments ?? [], misalignmentKey).map((group) =>
      misalignmentDiagnostic(group, paths),
    ),
  ];
}

type MisalignmentSample = NonNullable<PagesResponse["misalignments"]>[number];

function misalignmentKey(m: MisalignmentSample): string {
  return [m.slug, m.box, m.text ?? "", m.other, m.otherText ?? "", m.edge, m.of].join("\0");
}

/** How the message names an edge two items share. */
const EDGE_NAMES: Record<MisalignmentSample["edge"], string> = {
  top: "tops",
  middle: "middles",
  bottom: "bottoms",
  left: "left edges",
  center: "centers",
  right: "right edges",
};

/**
 * Two items that nearly line up and do not. The fix depends on the edge: a start lines up with
 * the same space before it, an end with one size, a middle with one way of centering, and text in
 * cards that line up with one padding.
 */
function misalignmentDiagnostic(
  { first, items, steps }: StepGroup<MisalignmentSample>,
  paths: DeckPaths,
): Diagnostic {
  // By the most they miss at any step, so the fix covers the worst beat.
  const by = Math.max(...items.map((item) => item.by));
  const pair = `${describeTarget(first.box, first.text)}and ${describeTarget(first.other, first.otherText).trimEnd()}`;
  const where =
    first.of === "text"
      ? `almost start their text ${first.edge === "left" ? "at one left edge" : "on one line"}`
      : `almost line up at their ${EDGE_NAMES[first.edge]}`;
  const css = `slides/${first.slug}.css`;
  const both = `${first.box} and ${first.other}`;
  const why = "an edge a few pixels off reads as a mistake, not a choice";
  const hint =
    first.of === "text"
      ? `give ${both} the same padding in ${css}, so their text starts on one line`
      : first.edge === "top" || first.edge === "left"
        ? `line ${first.box} up with ${first.other} in ${css}, with the same margin, padding, or alignment: ${why}`
        : first.edge === "bottom" || first.edge === "right"
          ? `give ${both} one ${first.edge === "bottom" ? "height" : "width"} in ${css}, with align-items: stretch or the same size: ${why}`
          : `center ${both} on one line in ${css}, with align-items: center or the same margins: ${why}`;
  return diag("DEK036", {
    message: `${pair} ${where}, ${by}px apart, ${atSteps(steps)}`,
    path: paths.slide(first.slug, ".html"),
    slug: first.slug,
    hint,
    data: {
      box: first.box,
      ...(first.text ? { text: first.text } : {}),
      other: first.other,
      ...(first.otherText ? { otherText: first.otherText } : {}),
      edge: first.edge,
      of: first.of,
      by,
      steps,
    },
  });
}

type LineBreakSample = NonNullable<PagesResponse["lineBreaks"]>[number];

function lineBreakKey(b: LineBreakSample): string {
  return [b.slug, b.box, b.text ?? "", b.kind, ...b.lines].join("\0");
}

/** Where a line ends: the end of one line and the start of the next, as far as either reads. */
function breakAt(lines: string[], phrased: string[]): string {
  const differs = lines.findIndex((line, at) => line !== phrased[at]);
  const at = Math.max(0, Math.min(differs, lines.length - 2));
  const end = [...(lines[at] ?? "")];
  const start = [...(lines[at + 1] ?? "")];
  const half = SNIPPET_CHARS / 2;
  const before = end.length > half ? `…${end.slice(-half).join("")}` : end.join("");
  const after = start.length > half ? `${start.slice(0, half).join("")}…` : start.join("");
  return `${before} / ${after}`;
}

/**
 * A line break the audience trips over. One inside a phrase is fixed where Japanese is told to
 * break by phrase: on `.slide` in theme.css, for every slide, unless a rule takes it away from
 * this text. A remnant on a last line is the text's own to fix, or the theme's text-wrap.
 */
function lineBreakDiagnostic(
  { first, steps }: StepGroup<LineBreakSample>,
  paths: DeckPaths,
): Diagnostic {
  const target = describeTarget(first.box, first.text);
  const css = `slides/${first.slug}.css`;
  const yourself = "break the line yourself with <br>";
  const common = {
    slug: first.slug,
    data: {
      kind: first.kind,
      box: first.box,
      ...(first.text ? { text: first.text } : {}),
      lines: first.lines,
      ...(first.kind === "split" ? { phrased: first.phrased } : { tail: first.tail }),
      steps,
    },
  };
  if (first.kind === "split") {
    const theme = first.wordBreak !== "auto-phrase";
    return diag("DEK035", {
      message: `${target}breaks a line inside a phrase, at "${breakAt(first.lines, first.phrased)}", ${atSteps(steps)}`,
      path: theme ? paths.theme : paths.slide(first.slug, ".html"),
      hint: theme
        ? `add word-break: auto-phrase to .slide in theme.css, so Japanese breaks between phrases on every slide; or ${yourself} where its sense breaks`
        : `a rule gives it word-break: normal where .slide breaks by phrase: remove it from ${css} or theme.css, or ${yourself} where its sense breaks`,
      ...common,
    });
  }
  const evened = first.textWrap === "pretty" || first.textWrap === "balance";
  return diag("DEK035", {
    message: `${target}leaves "${first.tail}" alone on its last line ${atSteps(steps)}`,
    path: paths.slide(first.slug, ".html"),
    hint: evened
      ? `reword it so its last line holds more, or ${yourself} earlier`
      : `even out its lines with text-wrap: pretty, or balance for a heading, in ${css} or for every slide in theme.css; or reword it, or ${yourself}`,
    ...common,
  });
}

type CollisionSample = NonNullable<PagesResponse["collisions"]>[number];

function collisionKey(c: CollisionSample): string {
  return [c.slug, c.box, c.text ?? "", c.other, c.otherText ?? ""].join("\0");
}

/** Two texts drawn over each other, which neither reads through. */
function collisionDiagnostic(
  { first, steps }: StepGroup<CollisionSample>,
  paths: DeckPaths,
): Diagnostic {
  const css = `slides/${first.slug}.css`;
  const drawn = [first.box, first.other].some((box) => box.includes("::"));
  return diag("DEK033", {
    message: `${describeTarget(first.box, first.text)}and ${describeTarget(first.other, first.otherText)}are drawn over each other ${atSteps(steps)}`,
    path: paths.slide(first.slug, ".html"),
    slug: first.slug,
    hint: drawn
      ? `keep the slide's content clear of what theme.css draws there, a folio or a running head: move it, or give it room in ${css}`
      : `move one of them, or give the layout room for both, in ${css}`,
    data: {
      box: first.box,
      ...(first.text ? { text: first.text } : {}),
      other: first.other,
      ...(first.otherText ? { otherText: first.otherText } : {}),
      steps,
    },
  });
}

type DrawErrorSample = NonNullable<PagesResponse["drawErrors"]>[number];

function drawErrorKey(error: DrawErrorSample): string {
  return [error.slug, error.kind, error.message].join("\0");
}

/**
 * A draw that misbehaves on a still page, which every shot, the PDF, and every measurement is:
 * one that throws leaves the slide as if it never ran, one that reaches outside its slide changes
 * another in the built deck, and one that keeps state draws something a seek cannot replay.
 */
function drawErrorDiagnostic(
  { first, steps }: StepGroup<DrawErrorSample>,
  deckDir: string,
): Diagnostic {
  const script = `slides/${first.slug}.ts`;
  const where = atSteps(steps);
  const { message, hint } = {
    throw: {
      message: `draw threw ${first.message} at the end of ${where.replace(/^at /, "")}`,
      hint: `make draw in ${script} draw the end of every beat without throwing; until then every still, shot, and PDF shows the slide as if draw never ran`,
    },
    reach: {
      message: `draw ${first.message} at the end of ${where.replace(/^at /, "")}`,
      hint: `find elements from the slide draw is given in ${script}, and change nothing else: the built deck holds every slide`,
    },
    seek: {
      message: `draw ${first.message} ${where}`,
      hint: `draw from t alone in ${script}: work every value out from t and set everything you touch on every call, with nothing kept between calls`,
    },
  }[first.kind ?? "throw"];
  return diag("DEK032", {
    message,
    path: deckPaths(deckDir).slide(first.slug, ".ts"),
    slug: first.slug,
    hint,
    data: { kind: first.kind ?? "throw", message: first.message, steps },
  });
}

type OverflowSample = PagesResponse["overflows"][number];
type ContrastSample = PagesResponse["contrasts"][number];

function crossedEdges(overflow: OverflowSample): Edge[] {
  return EDGES.filter((edge) => overflow.by[edge] !== undefined);
}

function overflowKey(o: OverflowSample): string {
  return [o.slug, o.box, o.text ?? "", crossedEdges(o).join(), o.origin ?? "", o.clip ?? ""].join(
    "\0",
  );
}

/** The ratio as reported, to one decimal: samples that round alike are one finding. */
function shownRatio(sample: ContrastSample): number {
  return Math.round(sample.ratio * 10) / 10;
}

function contrastKey(c: ContrastSample): string {
  return [
    c.slug,
    c.box,
    c.text ?? "",
    shownRatio(c),
    contrastThreshold(c),
    c.origin ?? "",
    c.onlyWithSlideCss ?? "",
  ].join("\0");
}

function overflowWhere(amounts: Partial<Record<Edge, number>>): string {
  const edges = Object.entries(amounts);
  if (edges.length === 0) {
    return "overflows the slide";
  }
  return `overflows ${edges.map(([edge, px]) => `the ${edge} edge by ${px}px`).join(" and ")}`;
}

/**
 * What to do about an overflow, where its cause is. A script or a stylesheet that puts the
 * element past the edge is fixed where it does; content too big for the slide is cut, split, or
 * sized down on the slide. An element with no text may be decoration meant to bleed.
 */
function overflowHint(first: OverflowSample, edges: Edge[]): string | undefined {
  const css = `slides/${first.slug}.css`;
  if (first.clip !== undefined && first.origin !== "script") {
    return `let ${first.clip} grow to fit it in ${css}, or cut the text: ${first.clip} hides what does not fit`;
  }
  const hints =
    first.origin === "script"
      ? [
          `draw in slides/${first.slug}.ts moves or sizes it past the edge: keep what it draws inside the slide at every beat`,
        ]
      : first.origin === "slide"
        ? [
            `${css} puts it past the edge, which the theme alone does not: fix its position or size in ${css}`,
          ]
        : [
            ...(edges.some((edge) => edge === "left" || edge === "right")
              ? [`${HORIZONTAL_HINT} ${css}`]
              : []),
            ...(edges.some((edge) => edge === "top" || edge === "bottom")
              ? [`${VERTICAL_HINT} ${css}`]
              : []),
          ];
  if (!first.text && hints.length > 0) {
    hints.push('if it is decoration meant to bleed off the slide, mark it aria-hidden="true"');
  }
  return hints.length > 0 ? hints.join("; ") : undefined;
}

/** The file to change for an overflow: the script or stylesheet that caused it, else the slide. */
function overflowPath(first: OverflowSample, paths: DeckPaths): string {
  const ext = first.origin === "script" ? ".ts" : first.origin === "slide" ? ".css" : ".html";
  return paths.slide(first.slug, ext);
}

function overflowDiagnostic(
  { first, items, steps }: StepGroup<OverflowSample>,
  paths: DeckPaths,
): Diagnostic {
  const edges = crossedEdges(first);
  // Each edge by the most it overflows at any step, so the fix covers the worst beat.
  const amounts = Object.fromEntries(
    edges.map((edge) => [edge, Math.max(...items.map((item) => item.by[edge] ?? 0))]),
  );
  const target =
    edges.length === 0 && !first.text ? "content " : describeTarget(first.box, first.text);
  const hint = overflowHint(first, edges);
  const where =
    first.clip === undefined
      ? overflowWhere(amounts)
      : `is cut off by ${first.clip} ${Object.entries(amounts)
          .map(([edge, px]) => `past its ${edge} edge by ${px}px`)
          .join(" and ")}`;
  return diag("DEK030", {
    message: `${target}${where} ${atSteps(steps)}`,
    path: overflowPath(first, paths),
    slug: first.slug,
    ...(hint ? { hint } : {}),
    data: {
      box: first.box,
      ...(first.text ? { text: first.text } : {}),
      edges: amounts,
      ...(first.origin ? { origin: first.origin } : {}),
      ...(first.clip ? { clip: first.clip } : {}),
      steps,
    },
  });
}

function contrastDiagnostic(
  { first, steps }: StepGroup<ContrastSample>,
  paths: DeckPaths,
): Diagnostic {
  const threshold = contrastThreshold(first);
  const ratio = shownRatio(first);
  const size = threshold === 3 ? " (large text)" : "";
  const fg = toHex(first.fg);
  const bg = toHex(first.bg);
  const colors = fg && bg ? ` (${fg} on ${bg})` : "";
  return diag("DEK031", {
    message: `${describeTarget(first.box, first.text)}has contrast ${ratio}${colors}, below ${threshold}:1${size} ${atSteps(steps)}`,
    path: contrastPath(first, paths),
    slug: first.slug,
    hint: contrastHint(first, threshold),
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
