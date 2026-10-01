import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cacheDir, deckProjectRoot } from "./path.ts";
import type { PageAction, PagesResponse, VisualPage } from "./playwright.ts";
import {
  isCachedFile,
  outputDir,
  readSourceIfExists,
  removeInside,
  writeInside,
} from "./safe-fs.ts";

/** What measuring one page found: its overflows, its texts' contrast, and what its draw threw. */
export type PageFindings = Required<PagesResponse>;

/**
 * The code that decides what a page's findings are. A change to any of it can change them, so
 * its source is part of every key, and a cache written by another dekc is never read.
 */
const MEASURERS = [
  "playwright-visual.ts",
  "slide-measure.ts",
  "text-contrast.ts",
  "fill.ts",
  "overflow.ts",
  "pseudo-text.ts",
  "finish-beat.ts",
  "visual-cache.ts",
];

let measurerFingerprint: string | undefined;

function measurers(): string {
  measurerFingerprint ??= createHash("sha256")
    .update(MEASURERS.map((name) => readFileSync(join(import.meta.dir, name), "utf8")).join("\0"))
    .digest("hex");
  return measurerFingerprint;
}

/**
 * The findings of each page `--visual` measured, under `.cache/visual`, named by a hash of all
 * that decides them: the page's HTML, which holds its theme, CSS, script, and assets, the
 * viewport, the checks asked for, and the code that measures. A page whose name is on disk is not
 * measured again. Like every cache, it can be deleted: the next run measures everything.
 */
export type VisualCache = {
  key(page: VisualPage): string;
  read(key: string): PageFindings | undefined;
  write(key: string, findings: PageFindings): void;
  /** Removes every entry but `keep`, after a run that measured the whole deck. */
  prune(keep: Set<string>): void;
};

export function visualCache(
  deckDir: string,
  request: { viewport: { width: number; height: number }; actions: PageAction[] },
): VisualCache {
  const root = deckProjectRoot(deckDir);
  const dir = cacheDir(deckDir, "visual");
  const pathOf = (key: string): string => join(dir, `${key}.json`);
  const context = JSON.stringify({ measurers: measurers(), ...request });
  return {
    key: (page) =>
      createHash("sha256")
        .update(context)
        .update("\0")
        .update(JSON.stringify([page.slug, page.step, page.html]))
        .digest("hex")
        .slice(0, 32),
    read: (key) => {
      const path = pathOf(key);
      if (!isCachedFile(path)) {
        return undefined;
      }
      try {
        return JSON.parse(readSourceIfExists(path, root) ?? "") as PageFindings;
      } catch {
        return undefined;
      }
    },
    write: (key, findings) => {
      outputDir(dir, root);
      writeInside(pathOf(key), JSON.stringify(findings), root);
    },
    prune: (keep) => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        if (name.endsWith(".json") && !keep.has(name.slice(0, -".json".length))) {
          removeInside(join(dir, name), root);
        }
      }
    },
  };
}
