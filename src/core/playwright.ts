import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { Browser } from "playwright";
import type { AlignedEdge, Misalignment } from "./alignment.ts";
import { DekError } from "./error.ts";
import type { Fill } from "./fill.ts";
import type { LineBreakKind } from "./line-break.ts";
import { type Collision, EDGES, type Overflow } from "./overflow.ts";
import { moduleFilePath } from "./path.ts";
import type { PptxFill, PptxLayer, PptxTextBox } from "./pptx-package.ts";
import type { PptxPageTheme } from "./pptx-theme.ts";
import { chromiumFailure, launchFailure, runDrawingWorker, type SandboxMode } from "./sandbox.ts";
import type { MotionBeat, SheetSpec } from "./sheet.ts";
import { exitWorker, readWorkerRequest, workerCommand } from "./spawn.ts";
import type { Position } from "./step.ts";

/** One slide page to measure; a page that names a `screenshotPath` is shot there too. */
export type VisualPage = {
  html: string;
  slug: string;
  step: string;
  screenshotPath?: string;
};

/** Freeze the view transition from `from` to `to` at `at` (0..1) and screenshot it. */
export type MorphSpec = {
  from: Position;
  to: Position;
  at: number;
};

/**
 * Capture a slide's beats as they move: for each, the go that begins it, frozen at `fractions`
 * of how long that go runs, then its settled end. The page is the video document.
 */
export type MotionSpec = {
  /** Where the talk stands before the first beat; none when the deck starts there. */
  from?: Position;
  beats: Array<{ position: Position; label: string }>;
  fractions: number[];
  /** Where the frames and the sheets go. */
  dir: string;
  title: string;
};

/** What to measure on each page; a screenshot is asked for by the page's `screenshotPath`. */
export type PageAction = "overflow" | "contrast" | "fill" | "breaks" | "alignment";

type Viewport = { width: number; height: number };

/** Each page measured as `actions` asks and shot where it says, then `sheets` drawn from disk. */
export type PagesRequest = {
  kind: "pages";
  viewport: Viewport;
  actions: PageAction[];
  pages: VisualPage[];
  /** Contact sheets to draw once the pages are done, from images on disk. */
  sheets?: SheetSpec[];
};

/**
 * One page printed to `pdfPath`, a PDF page per slide: each slide a picture at twice its size,
 * with its text laid over it, unseen, to select and search.
 */
export type PdfRequest = {
  kind: "pdf";
  viewport: Viewport;
  html: string;
  pdfPath: string;
};

/** One frame of a move between slides, in the video document `html`. */
export type MorphRequest = {
  kind: "morph";
  viewport: Viewport;
  html: string;
  screenshotPath: string;
  morph: MorphSpec;
};

/** A slide's beats in motion, in the video document `html`. */
export type MotionRequest = {
  kind: "motion";
  viewport: Viewport;
  html: string;
  motion: MotionSpec;
};

/**
 * Each slide's still page drawn for a PPTX, at twice its size: its text, boxes, and pictures
 * measured, each picture drawn alone beside `screenshotPath`, then the page shot without what
 * is laid over it, to `screenshotPath`.
 */
export type PptxRequest = {
  kind: "pptx";
  viewport: Viewport;
  pages: Array<{ html: string; slug: string; screenshotPath: string }>;
};

/** A picture on its way to the package: the PNG the worker wrote, and the SVG it read. */
export type PptxPictureFile = { png: string; svg?: string };

/** Each page's layers, in the order of the request's pages, with the font each run was drawn in. */
export type PptxResponse = {
  slides: Array<{
    slug: string;
    description: string;
    layers: PptxLayer<PptxPictureFile>[];
    /** Whether anything is left in the slide's picture; false for nothing. */
    picture?: boolean;
    /** The slide's background, when PowerPoint paints it. */
    background?: PptxFill;
    /** What the slide says of the deck's theme. */
    theme?: PptxPageTheme;
  }>;
};

/** What the Playwright worker is asked; the kind says which payload comes with it. */
export type VisualRequest = PagesRequest | PdfRequest | MorphRequest | MotionRequest | PptxRequest;

type OverflowFinding = Overflow & { slug: string; step: string };

export type ContrastFinding = {
  slug: string;
  step: string;
  ratio: number;
  box: string;
  text?: string;
  /** Computed colors as CSS rgb(). */
  fg: string;
  bg: string;
  /** Computed font-size in px. */
  fontSize: number;
  /** Computed font-weight as a number. */
  fontWeight: number;
  /**
   * For text below its threshold, which stylesheet draws it so: "theme" when it stays below
   * with the slide's own CSS taken away, "slide" when that CSS brings it there. Absent when the
   * text passes, or shows no glyph without the slide's CSS. Absent too when it shows none with the
   * slide script's draw undone and clears without the slide's CSS: either may have drawn it so.
   */
  origin?: ContrastOrigin;
  /**
   * For text below its threshold that shows with the slide's own CSS and no glyph without it: the
   * theme alone was never measured, so either stylesheet may hold its colors.
   */
  onlyWithSlideCss?: true;
};

export type ContrastOrigin = "theme" | "slide" | "script";

/**
 * A slide's draw that misbehaved as a still page drew it at the end of a beat: it threw, changed
 * the page outside its slide, or drew the end differently after drawing the start.
 */
type DrawErrorFinding = {
  slug: string;
  step: string;
  t: number;
  kind: "throw" | "reach" | "seek";
  message: string;
};

/** Two texts drawn over each other on one page. */
type CollisionFinding = Collision & { slug: string; step: string };

/** How much of the frame one page fills, and where. */
export type FillFinding = Fill & { slug: string; step: string };

/**
 * A line break that reads wrong on one page, with what decides where the fix goes: the slide's own
 * `word-break` and the text's `text-wrap`, as the page computes them.
 */
type LineBreakFinding = {
  slug: string;
  step: string;
  box: string;
  text?: string;
  lines: string[];
  wordBreak: string;
  textWrap: string;
} & LineBreakKind;

/** Two items on one page that nearly line up and do not, each named as the page shows it. */
type MisalignmentFinding = Omit<Misalignment, "element" | "other"> & {
  slug: string;
  step: string;
  box: string;
  text?: string;
  other: string;
  otherText?: string;
};

export type PagesResponse = {
  overflows: OverflowFinding[];
  contrasts: ContrastFinding[];
  /** Absent from a runner that has none to report. */
  drawErrors?: DrawErrorFinding[];
  /** Absent from a runner that has none to report. */
  collisions?: CollisionFinding[];
  /** One for each page, when `fill` was asked for; absent from a runner that has none. */
  fills?: FillFinding[];
  /** Absent from a runner that has none to report. */
  lineBreaks?: LineBreakFinding[];
  /** Absent from a runner that has none to report. */
  misalignments?: MisalignmentFinding[];
};

export type MotionResponse = {
  /** The frames of each beat the request asked for, in its order. */
  motion: MotionBeat[];
  /** The contact sheets that tile them, in order. */
  sheets: string[];
};

/** A morph frame or a PDF is on disk where the request named it; the answer only says it is done. */
export type DoneResponse = Record<string, never>;

type VisualResponses = {
  pages: PagesResponse;
  pdf: DoneResponse;
  morph: DoneResponse;
  motion: MotionResponse;
  pptx: PptxResponse;
};

/** The answer to a request of `R`'s kind. */
export type ResponseTo<R extends VisualRequest> = VisualResponses[R["kind"]];

export type VisualResponse = VisualResponses[VisualRequest["kind"]];

/** Answers a request, or null when Playwright is not installed. */
export type PlaywrightRunner = (request: VisualRequest) => Promise<VisualResponse | null>;

type SpawnTimeoutOptions = {
  /** Covers the whole worker run; see `runJsonWorker`. */
  timeoutMs?: number;
};

type RunnerOptions = SpawnTimeoutOptions & {
  /** The pages hold a ref's deck: Chromium's sandbox only, unless the user accepted otherwise. */
  ref?: boolean;
};

const requireFromDek = createRequire(import.meta.url);

export function resolvePlaywrightModule(): string | undefined {
  // From dek's own install only: a repository someone else wrote can commit a node_modules.
  try {
    return requireFromDek.resolve("playwright");
  } catch {
    return undefined;
  }
}

export function playwrightResolved(): boolean {
  const bin = process.env.DEK_PLAYWRIGHT;
  if (bin) {
    return bin.endsWith(".ts") || existsSync(bin);
  }
  return resolvePlaywrightModule() !== undefined;
}

/** Whether `runner` can answer: a runner given is taken at its word, the default needs Playwright. */
export function playwrightReady(runner?: PlaywrightRunner): boolean {
  return runner !== undefined || playwrightResolved();
}

/** The module comes first; `playwright install` alone only fetches browsers. */
export const PLAYWRIGHT_INSTALL = "bun add -d playwright && bunx playwright install chromium";

export function playwrightMissingError(): DekError {
  return new DekError("Playwright is not installed", { hint: PLAYWRIGHT_INSTALL });
}

/**
 * `runner`'s answer to `request`, typed by the request's kind; null when Playwright is not
 * installed. The runner answers the kind it was asked, so the cast only names what that is.
 */
export function askPlaywright<R extends VisualRequest>(
  request: R,
  runner: PlaywrightRunner = defaultPlaywrightRunner,
): Promise<ResponseTo<R> | null> {
  return runner(request) as Promise<ResponseTo<R> | null>;
}

/** As `askPlaywright`, where no Playwright is an error that says how to install it. */
export async function requirePlaywright<R extends VisualRequest>(
  request: R,
  runner?: PlaywrightRunner,
): Promise<ResponseTo<R>> {
  const response = await askPlaywright(request, runner);
  if (response === null) {
    throw playwrightMissingError();
  }
  return response;
}

export async function importPlaywright(): Promise<typeof import("playwright")> {
  const spec = resolvePlaywrightModule();
  if (!spec) {
    throw new Error("playwright not found");
  }
  return import(pathToFileURL(spec).href) as Promise<typeof import("playwright")>;
}

/** Playwright's Chromium, or what stands in for it in tests. */
type Chromium = typeof import("playwright").chromium;

/**
 * A Playwright worker's whole life: load Playwright, read the request, launch Chromium, answer
 * with what `handle` returns, and close the browser. Any failure exits with its reason on stderr.
 * Where Chromium's sandbox did not start, the answer says why in `unsandboxed`, and is only that
 * when the request's `sandbox` required it, or with why Chromium did not start without it either
 * in `failed`. `chromium` stands in for Playwright's in tests.
 */
export async function runPlaywrightWorker<Request, Response>(
  handle: (browser: Browser, request: Request) => Promise<Response>,
  chromium?: Chromium,
): Promise<void> {
  let launcher: Chromium;
  try {
    launcher = chromium ?? (await importPlaywright()).chromium;
  } catch {
    exitWorker(`playwright not found; ${PLAYWRIGHT_INSTALL}`);
  }
  const request = await readWorkerRequest<Request & { sandbox?: unknown }>();
  try {
    // Anything but "preferred", or nothing, requires the sandbox.
    const sandbox = request.sandbox === "preferred" ? "preferred" : "required";
    const launched = await launchChromium(launcher, sandbox);
    if (!launched.browser) {
      const { browser: _none, ...said } = launched;
      process.stdout.write(`${JSON.stringify(said)}\n`);
      return;
    }
    const { browser, unsandboxed } = launched;
    try {
      const response = await handle(browser, request);
      const answer = unsandboxed === undefined ? response : { ...response, unsandboxed };
      process.stdout.write(`${JSON.stringify(answer)}\n`);
    } finally {
      await browser.close();
    }
  } catch (error) {
    // The parent's hint keeps the start of stderr, and Playwright's opens with a command line.
    exitWorker(chromiumFailure(error) ?? error);
  }
}

/**
 * Chromium with its sandbox, or without it and why; or none: where the sandbox was required, or
 * where Chromium did not start without it either.
 */
type Launched =
  | { browser: Browser; unsandboxed?: string }
  | { browser?: never; unsandboxed: string; failed?: string };

/**
 * Headless Chromium with its sandbox, which Playwright leaves off by default: slide scripts run in
 * it, a ref's included. When that launch fails, as in a container running as root, it launches
 * again without one only when `sandbox` is "preferred", and says why in Chromium's words, whether
 * or not they name the sandbox; when that fails too, it says both.
 */
export async function launchChromium(chromium: Chromium, sandbox: SandboxMode): Promise<Launched> {
  let first: unknown;
  try {
    return { browser: await chromium.launch({ headless: true, chromiumSandbox: true }) };
  } catch (error) {
    first = error;
  }
  const unsandboxed = launchFailure(first);
  if (sandbox !== "preferred") {
    return { unsandboxed };
  }
  try {
    return { browser: await chromium.launch({ headless: true }), unsandboxed };
  } catch (second) {
    return { unsandboxed, failed: launchFailure(second) };
  }
}

export async function defaultPlaywrightRunner(
  request: VisualRequest,
  options: RunnerOptions = {},
): Promise<VisualResponse | null> {
  if (!playwrightResolved()) {
    return null;
  }
  return spawnRunner(workerCommand(process.env.DEK_PLAYWRIGHT || workerPath()), request, options);
}

/**
 * The default runner for a ref's pages: someone else's slide scripts, which Chromium runs only in
 * its sandbox unless the user set DEK_ALLOW_UNSANDBOXED=1 (ADR 29).
 */
export function refPlaywrightRunner(request: VisualRequest): Promise<VisualResponse | null> {
  return defaultPlaywrightRunner(request, { ref: true });
}

function workerPath(): string {
  return moduleFilePath(new URL("./playwright-worker.ts", import.meta.url));
}

function spawnRunner(
  cmd: string[],
  request: VisualRequest,
  options: RunnerOptions,
): Promise<VisualResponse> {
  return runDrawingWorker(cmd, request, (text) => parseVisualResponse(text, request.kind), {
    label: "Playwright worker failed",
    hint: `${PLAYWRIGHT_INSTALL} or check DEK_PLAYWRIGHT`,
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.ref ? { ref: true } : {}),
  });
}

/** One parser per kind; each keeps what its kind answers with, or rejects the whole answer. */
const RESPONSE_PARSERS: {
  [K in keyof VisualResponses]: (fields: Record<string, unknown>) => VisualResponses[K] | null;
} = {
  pages: ({
    overflows,
    contrasts,
    drawErrors = [],
    collisions = [],
    fills = [],
    lineBreaks = [],
    misalignments = [],
  }) =>
    isArrayOf(overflows, isOverflowFinding) &&
    isArrayOf(contrasts, isContrastFinding) &&
    isArrayOf(drawErrors, isDrawErrorFinding) &&
    isArrayOf(collisions, isCollisionFinding) &&
    isArrayOf(fills, isFillFinding) &&
    isArrayOf(lineBreaks, isLineBreakFinding) &&
    isArrayOf(misalignments, isMisalignmentFinding)
      ? { overflows, contrasts, drawErrors, collisions, fills, lineBreaks, misalignments }
      : null,
  pdf: () => ({}),
  morph: () => ({}),
  motion: ({ motion, sheets }) =>
    isArrayOf(motion, isMotionBeat) && isArrayOf(sheets, isString) ? { motion, sheets } : null,
  pptx: ({ slides }) => (isArrayOf(slides, isPptxSlide) ? { slides } : null),
};

/** The worker's JSON as the answer to a `kind` request, or null when it is not one. */
export function parseVisualResponse<K extends VisualRequest["kind"]>(
  text: string,
  kind: K,
): VisualResponses[K] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return RESPONSE_PARSERS[kind](parsed as Record<string, unknown>);
}

function isArrayOf<T>(value: unknown, isItem: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(isItem);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFinding(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const { slug, step, box, text } = value as Record<string, unknown>;
  return (
    isString(slug) && isString(step) && isString(box) && (text === undefined || isString(text))
  );
}

function isCollisionFinding(value: unknown): value is CollisionFinding {
  if (!isFinding(value)) {
    return false;
  }
  const { other, otherText } = value;
  return isString(other) && (otherText === undefined || isString(otherText));
}

function isFillFinding(value: unknown): value is FillFinding {
  if (!value || typeof value !== "object") {
    return false;
  }
  const { slug, step, coverage, box, rows, columns } = value as Record<string, unknown>;
  const isBox = (found: unknown): boolean =>
    found !== null &&
    typeof found === "object" &&
    ["left", "top", "right", "bottom"].every((side) =>
      isNumber((found as Record<string, unknown>)[side]),
    );
  return (
    isString(slug) &&
    isString(step) &&
    isNumber(coverage) &&
    (box === undefined || isBox(box)) &&
    isArrayOf(rows, isNumber) &&
    isArrayOf(columns, isNumber)
  );
}

function isLineBreakFinding(value: unknown): value is LineBreakFinding {
  if (!isFinding(value)) {
    return false;
  }
  const { kind, lines, phrased, tail, wordBreak, textWrap } = value;
  return (
    isArrayOf(lines, isString) &&
    isString(wordBreak) &&
    isString(textWrap) &&
    ((kind === "split" && isArrayOf(phrased, isString)) || (kind === "short" && isString(tail)))
  );
}

const ALIGNED_EDGES: ReadonlySet<unknown> = new Set<AlignedEdge>([
  "top",
  "middle",
  "bottom",
  "left",
  "center",
  "right",
]);

function isMisalignmentFinding(value: unknown): value is MisalignmentFinding {
  // Both name two elements by their boxes and their texts, as a collision does.
  if (!isCollisionFinding(value)) {
    return false;
  }
  const { edge, of, by } = value as Record<string, unknown>;
  return ALIGNED_EDGES.has(edge) && (of === "box" || of === "text") && isNumber(by);
}

function isDrawErrorFinding(value: unknown): value is DrawErrorFinding {
  if (!value || typeof value !== "object") {
    return false;
  }
  const { slug, step, t, kind, message } = value as Record<string, unknown>;
  return (
    isString(slug) &&
    isString(step) &&
    isNumber(t) &&
    (kind === "throw" || kind === "reach" || kind === "seek") &&
    isString(message)
  );
}

function isOverflowFinding(value: unknown): value is OverflowFinding {
  if (!isFinding(value)) {
    return false;
  }
  const { by } = value;
  return (
    Boolean(by) &&
    typeof by === "object" &&
    Object.entries(by as object).every(
      ([edge, px]) => (EDGES as string[]).includes(edge) && isNumber(px),
    ) &&
    (value.origin === undefined ||
      value.origin === "script" ||
      value.origin === "slide" ||
      value.origin === "content") &&
    (value.clip === undefined || isString(value.clip))
  );
}

function isContrastFinding(value: unknown): value is ContrastFinding {
  if (!isFinding(value)) {
    return false;
  }
  const { ratio, fg, bg, fontSize, fontWeight, origin, onlyWithSlideCss } = value;
  return (
    isNumber(ratio) &&
    isString(fg) &&
    isString(bg) &&
    isNumber(fontSize) &&
    isNumber(fontWeight) &&
    (origin === undefined || origin === "theme" || origin === "slide" || origin === "script") &&
    (onlyWithSlideCss === undefined || onlyWithSlideCss === true)
  );
}

function isPptxSlide(value: unknown): value is PptxResponse["slides"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }
  const { slug, description, layers, picture, background, theme } = value as Record<
    string,
    unknown
  >;
  return (
    isString(slug) &&
    isString(description) &&
    isArrayOf(layers, isPptxLayer) &&
    (picture === undefined || typeof picture === "boolean") &&
    (background === undefined || isFill(background)) &&
    (theme === undefined || (Boolean(theme) && typeof theme === "object"))
  );
}

function isFill(value: unknown): value is PptxFill {
  if (!value || typeof value !== "object") {
    return false;
  }
  const fill = value as Record<string, unknown>;
  return fill.kind === "solid"
    ? isPaint(fill.paint)
    : fill.kind === "linear" &&
        isNumber(fill.angle) &&
        isArrayOf(
          fill.stops,
          (stop: unknown): stop is object =>
            Boolean(stop) &&
            typeof stop === "object" &&
            isNumber((stop as Record<string, unknown>).at) &&
            isPaint((stop as Record<string, unknown>).paint),
        );
}

function isPptxLayer(value: unknown): value is PptxLayer<PptxPictureFile> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const layer = value as Record<string, unknown>;
  const at = ["x", "y", "width", "height"].every((key) => isNumber(layer[key]));
  switch (layer.kind) {
    case "text":
      return isPptxBox(layer);
    case "rule":
      return (
        ["x1", "y1", "x2", "y2", "width"].every((key) => isNumber(layer[key])) &&
        isPaint(layer.paint)
      );
    case "picture":
      return (
        at &&
        isString(layer.png) &&
        isString(layer.description) &&
        (layer.svg === undefined || isString(layer.svg))
      );
    case "shape":
      return (
        at &&
        isNumber(layer.radius) &&
        (layer.fill === undefined || isPaint(layer.fill)) &&
        isArrayOf(layer.layers, isPptxLayer) &&
        (layer.text === undefined || isShapeText(layer.text))
      );
    default:
      return false;
  }
}

function isPaint(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const { color, alpha } = value as Record<string, unknown>;
  return isArrayOf(color, isNumber) && isNumber(alpha);
}

function isShapeText(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const { inset, paragraphs } = value as Record<string, unknown>;
  return (
    Boolean(inset) &&
    typeof inset === "object" &&
    isArrayOf(paragraphs, (paragraph: unknown): paragraph is object => {
      if (!paragraph || typeof paragraph !== "object") {
        return false;
      }
      const { runs, lineHeight } = paragraph as Record<string, unknown>;
      return isNumber(lineHeight) && isArrayOf(runs, isPptxRun);
    })
  );
}

function isPptxBox(value: unknown): value is PptxTextBox {
  if (!value || typeof value !== "object") {
    return false;
  }
  const box = value as Record<string, unknown>;
  return (
    ["x", "y", "width", "height", "lineHeight"].every((key) => isNumber(box[key])) &&
    isArrayOf(box.runs, isPptxRun)
  );
}

function isPptxRun(run: unknown): run is PptxTextBox["runs"][number] {
  if (!run || typeof run !== "object") {
    return false;
  }
  const { text, size, alpha, letterSpacing, color, font } = run as Record<string, unknown>;
  return (
    isString(text) &&
    isNumber(size) &&
    isNumber(alpha) &&
    isNumber(letterSpacing) &&
    isArrayOf(color, isNumber) &&
    (font === undefined || isString(font))
  );
}

function isMotionBeat(value: unknown): value is MotionBeat {
  if (!value || typeof value !== "object") {
    return false;
  }
  const { label, frames } = value as { label?: unknown; frames?: unknown };
  return (
    isString(label) &&
    Array.isArray(frames) &&
    frames.every((frame: unknown) => {
      const { ms, path, end } = (frame ?? {}) as { ms?: unknown; path?: unknown; end?: unknown };
      return isNumber(ms) && isString(path) && (end === undefined || end === true);
    })
  );
}
