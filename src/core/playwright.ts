import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { DekError } from "./error.ts";
import { resolvePackageFromAncestors } from "./optional.ts";
import { moduleFilePath } from "./path.ts";
import { awaitPiped } from "./spawn.ts";

export type VisualPage = {
  html: string;
  slug?: string;
  step?: string;
  screenshotPath?: string;
};

export type VisualRequest = {
  viewport: { width: number; height: number };
  actions: Array<"overflow" | "contrast" | "screenshot" | "pdf">;
  pages: VisualPage[];
  pdfPath?: string;
};

export type VisualResponse = {
  overflows: Array<{ slug: string; step: string; box: string }>;
  contrasts: Array<{
    slug: string;
    step: string;
    ratio: number;
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
  timeoutMs?: number;
};

const requirePlaywright = createRequire(import.meta.url);
const SPAWN_TIMEOUT_MS = 15_000;

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

export function playwrightMissingError(): DekError {
  return new DekError("Playwright is not installed", { hint: "bunx playwright install" });
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
  const bin = process.env.DEK_PLAYWRIGHT;
  if (bin) {
    const cmd = bin.endsWith(".ts") ? ["bun", "--no-install", bin] : [bin];
    return spawnRunner(cmd, request, options);
  }
  return spawnRunner(["bun", "--no-install", workerPath()], request, options);
}

function workerPath(): string {
  return moduleFilePath(new URL("./playwright-worker.ts", import.meta.url));
}

async function spawnRunner(
  cmd: string[],
  request: VisualRequest,
  options: SpawnTimeoutOptions = {},
): Promise<VisualResponse | null> {
  try {
    const proc = Bun.spawn(cmd, {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    const piped = awaitPiped(proc);
    const timeout = setTimeout(() => proc.kill(), options.timeoutMs ?? SPAWN_TIMEOUT_MS);
    try {
      proc.stdin.write(JSON.stringify(request));
      await proc.stdin.end();
    } finally {
      clearTimeout(timeout);
    }
    const { stdout: out, stderr: err, exitCode } = await piped;
    if (exitCode !== 0) {
      throw new DekError("Playwright worker failed", {
        hint: err.trim().slice(0, 200) || "bunx playwright install or check DEK_PLAYWRIGHT",
      });
    }
    const parsed = parseVisualResponse(out);
    if (!parsed) {
      throw new DekError("Playwright worker failed", {
        hint: "worker returned invalid JSON",
      });
    }
    return parsed;
  } catch (error) {
    if (error instanceof DekError) {
      throw error;
    }
    throw new DekError("Playwright worker failed", {
      hint: "bunx playwright install or check DEK_PLAYWRIGHT",
      cause: error,
    });
  }
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
