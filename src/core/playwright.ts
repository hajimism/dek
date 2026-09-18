import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { DekError } from "./error.ts";
import { moduleFilePath } from "./path.ts";

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
  contrasts: Array<{ slug: string; step: string; ratio: number }>;
  screenshotPath?: string;
  pdfPath?: string;
};

export type PlaywrightRunner = (request: VisualRequest) => Promise<VisualResponse | null>;

const requirePlaywright = createRequire(import.meta.url);
const SPAWN_TIMEOUT_MS = 15_000;

export function playwrightResolved(): boolean {
  const bin = process.env.DEK_PLAYWRIGHT;
  if (bin) {
    return bin.endsWith(".ts") || existsSync(bin);
  }
  try {
    requirePlaywright.resolve("playwright");
    return true;
  } catch {
    return false;
  }
}

export async function defaultPlaywrightRunner(
  request: VisualRequest,
): Promise<VisualResponse | null> {
  if (!playwrightResolved()) {
    return null;
  }
  const bin = process.env.DEK_PLAYWRIGHT;
  if (bin) {
    const cmd = bin.endsWith(".ts") ? ["bun", "--no-install", bin] : [bin];
    return spawnRunner(cmd, request);
  }
  return spawnRunner(["bun", "--no-install", workerPath()], request);
}

function workerPath(): string {
  return moduleFilePath(new URL("./playwright-worker.ts", import.meta.url));
}

async function spawnRunner(cmd: string[], request: VisualRequest): Promise<VisualResponse | null> {
  try {
    const proc = Bun.spawn(cmd, {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = new Response(proc.stdout).text();
    const stderr = new Response(proc.stderr).text();
    proc.stdin.write(JSON.stringify(request));
    await proc.stdin.end();
    const timeout = setTimeout(() => proc.kill(), SPAWN_TIMEOUT_MS);
    try {
      const [out, err, exitCode] = await Promise.all([stdout, stderr, proc.exited]);
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
    } finally {
      clearTimeout(timeout);
    }
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
