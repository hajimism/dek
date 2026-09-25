import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { DekError } from "./error.ts";
import { resolvePackageFromAncestors } from "./optional.ts";
import { moduleFilePath } from "./path.ts";
import { runJsonWorker, workerCommand } from "./spawn.ts";
import type { Position } from "./step.ts";

export type VisualPage = {
  html: string;
  slug?: string;
  step?: string;
  screenshotPath?: string;
};

/** Freeze the view transition from `from` to `to` at `at` (0..1) and screenshot it. */
export type MorphRequest = {
  from: Position;
  to: Position;
  at: number;
};

export type VisualRequest = {
  viewport: { width: number; height: number };
  actions: Array<"overflow" | "contrast" | "screenshot" | "pdf" | "morph">;
  pages: VisualPage[];
  pdfPath?: string;
  morph?: MorphRequest;
};

export type Edge = "top" | "right" | "bottom" | "left";

export type VisualResponse = {
  overflows: Array<{
    slug: string;
    step: string;
    box: string;
    text?: string;
    /** Pixels past each edge; missing from older workers. */
    by?: Partial<Record<Edge, number>>;
  }>;
  contrasts: Array<{
    slug: string;
    step: string;
    ratio: number;
    box?: string;
    text?: string;
    /** Computed colors as CSS rgb(); missing from older workers. */
    fg?: string;
    bg?: string;
    /** Computed font-size in px; missing from older workers. */
    fontSize?: number;
    /** Computed font-weight as a number; missing from older workers. */
    fontWeight?: number;
  }>;
  screenshotPath?: string;
  pdfPath?: string;
};

export type PlaywrightRunner = (request: VisualRequest) => Promise<VisualResponse | null>;

export type SpawnTimeoutOptions = {
  /** Covers the whole worker run; see `runJsonWorker`. */
  timeoutMs?: number;
};

const requirePlaywright = createRequire(import.meta.url);

export function resolvePlaywrightModule(): string | undefined {
  try {
    return requirePlaywright.resolve("playwright");
  } catch {
    return resolvePackageFromAncestors("playwright", process.cwd());
  }
}

export function playwrightResolved(): boolean {
  const bin = process.env.DEK_PLAYWRIGHT;
  if (bin) {
    return bin.endsWith(".ts") || existsSync(bin);
  }
  return resolvePlaywrightModule() !== undefined;
}

/** The module comes first; `playwright install` alone only fetches browsers. */
export const PLAYWRIGHT_INSTALL = "bun add -d playwright && bunx playwright install chromium";

export function playwrightMissingError(): DekError {
  return new DekError("Playwright is not installed", { hint: PLAYWRIGHT_INSTALL });
}

export async function importPlaywright(): Promise<typeof import("playwright")> {
  const spec = resolvePlaywrightModule();
  if (!spec) {
    throw new Error("playwright not found");
  }
  return import(pathToFileURL(spec).href) as Promise<typeof import("playwright")>;
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
  return runJsonWorker(cmd, request, parseVisualResponse, {
    label: "Playwright worker failed",
    hint: `${PLAYWRIGHT_INSTALL} or check DEK_PLAYWRIGHT`,
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  });
}

export function parseVisualResponse(text: string | null): VisualResponse | null {
  if (!text?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as VisualResponse;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.overflows)) {
      return null;
    }
    return {
      overflows: parsed.overflows,
      contrasts: Array.isArray(parsed.contrasts) ? parsed.contrasts : [],
      ...(parsed.screenshotPath ? { screenshotPath: parsed.screenshotPath } : {}),
      ...(parsed.pdfPath ? { pdfPath: parsed.pdfPath } : {}),
    };
  } catch {
    return null;
  }
}
