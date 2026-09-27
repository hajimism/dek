import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { Browser } from "playwright";
import { DekError } from "./error.ts";
import { EDGES, type Overflow } from "./overflow.ts";
import { moduleFilePath } from "./path.ts";
import type { MotionBeat, SheetSpec } from "./sheet.ts";
import { exitWorker, readWorkerRequest, runJsonWorker, workerCommand } from "./spawn.ts";
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
export type PageAction = "overflow" | "contrast";

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

/** One page printed to `pdfPath`, a PDF page per slide. */
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

/** What the Playwright worker is asked; the kind says which payload comes with it. */
export type VisualRequest = PagesRequest | PdfRequest | MorphRequest | MotionRequest;

type OverflowFinding = Overflow & { slug: string; step: string };

type ContrastFinding = {
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
};

export type PagesResponse = {
  overflows: OverflowFinding[];
  contrasts: ContrastFinding[];
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

/**
 * A Playwright worker's whole life: load Playwright, read the request, launch Chromium, answer
 * with what `handle` returns, and close the browser. Any failure exits with its reason on stderr.
 */
export async function runPlaywrightWorker<Request, Response>(
  handle: (browser: Browser, request: Request) => Promise<Response>,
): Promise<void> {
  let playwright: Awaited<ReturnType<typeof importPlaywright>>;
  try {
    playwright = await importPlaywright();
  } catch {
    exitWorker(`playwright not found; ${PLAYWRIGHT_INSTALL}`);
  }
  const request = await readWorkerRequest<Request>();
  try {
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const response = await handle(browser, request);
      process.stdout.write(`${JSON.stringify(response)}\n`);
    } finally {
      await browser.close();
    }
  } catch (error) {
    exitWorker(error);
  }
}

export async function defaultPlaywrightRunner(
  request: VisualRequest,
  options: SpawnTimeoutOptions = {},
): Promise<VisualResponse | null> {
  if (!playwrightResolved()) {
    return null;
  }
  return spawnRunner(workerCommand(process.env.DEK_PLAYWRIGHT || workerPath()), request, options);
}

function workerPath(): string {
  return moduleFilePath(new URL("./playwright-worker.ts", import.meta.url));
}

function spawnRunner(
  cmd: string[],
  request: VisualRequest,
  options: SpawnTimeoutOptions,
): Promise<VisualResponse> {
  return runJsonWorker(cmd, request, (text) => parseVisualResponse(text, request.kind), {
    label: "Playwright worker failed",
    hint: `${PLAYWRIGHT_INSTALL} or check DEK_PLAYWRIGHT`,
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  });
}

/** One parser per kind; each keeps what its kind answers with, or rejects the whole answer. */
const RESPONSE_PARSERS: {
  [K in keyof VisualResponses]: (fields: Record<string, unknown>) => VisualResponses[K] | null;
} = {
  pages: ({ overflows, contrasts }) =>
    isArrayOf(overflows, isOverflowFinding) && isArrayOf(contrasts, isContrastFinding)
      ? { overflows, contrasts }
      : null,
  pdf: () => ({}),
  morph: () => ({}),
  motion: ({ motion, sheets }) =>
    isArrayOf(motion, isMotionBeat) && isArrayOf(sheets, isString) ? { motion, sheets } : null,
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
    )
  );
}

function isContrastFinding(value: unknown): value is ContrastFinding {
  if (!isFinding(value)) {
    return false;
  }
  const { ratio, fg, bg, fontSize, fontWeight } = value;
  return (
    isNumber(ratio) && isString(fg) && isString(bg) && isNumber(fontSize) && isNumber(fontWeight)
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
