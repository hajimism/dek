import { createHash } from "node:crypto";
// biome-ignore lint/style/noRestrictedImports: rmSync, which prunes old entries by name in the folder outputDir returned, and takes a link, not its target.
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { escapeRegExp } from "./escape.ts";
import { cacheDir, deckProjectRoot } from "./path.ts";
import type { ProjectDeck } from "./resolve.ts";
import { isCachedFile, outputDir } from "./safe-fs.ts";
import type { Section } from "./schema.ts";
import { lastStop, stepKey } from "./step.ts";

/**
 * Every capture dek caches lives under `.cache/shots`, named by what it is and a hash of what it
 * shows. The parts of a name are joined with "~", which no slug, beat id or number can contain,
 * so no two captures share a name, and pruning one never reaches another.
 */
const SEPARATOR = "~";
const HASH = "[0-9a-f]{8}";

/** A cached file: where it goes, whether it is already there, and `commit` once it is written. */
export type CacheEntry = {
  path: string;
  cached: boolean;
  /** Removes the older runs of the same capture; call it only once this one is on disk. */
  commit(): void;
};

/** A cached folder of files, such as a set of contact sheets. */
type CacheBundle = {
  dir: string;
  /** The project the folder is in, for what a capture writes inside it. */
  root: string;
  commit(): void;
};

/** The deck a capture is of: its folder, and for a ref, where its cache is instead. */
type ShotDeck = Pick<ProjectDeck, "dir" | "cache">;

/**
 * `.cache/shots`, made if missing, where it really is, and the project it is in; a link out of
 * the project is an error. A ref's shots go in the cache of the project that reads it.
 */
function shotsDir(deck: ShotDeck): { dir: string; root: string } {
  const root = deck.cache?.root ?? deckProjectRoot(deck.dir);
  const dir = deck.cache ? join(deck.cache.dir, "shots") : cacheDir(deck.dir, "shots");
  return { dir: outputDir(dir, root), root };
}

function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 8);
}

/**
 * `<part>~<part>.<hash>.png`, where the hash covers what the page renders (theme, slide, shown
 * steps, inlined assets). A changed rendering gets a new path, so nothing that caches by path can
 * show a stale image.
 */
export function shotName(parts: string[], content: string): string {
  return `${parts.join(SEPARATOR)}.${contentHash(content)}.png`;
}

/**
 * The still of `section` at `beatIndex`. It is named by the beat's own key, so `--step hook`,
 * `--step 2` and a still at the last beat, `dekc build`'s link preview included, are one file.
 */
export function stillEntry(
  deck: ShotDeck,
  section: Section,
  beatIndex: number,
  html: string,
): CacheEntry {
  const step = stepKey(section.beats, beatIndex);
  // Names from before "~": `<slug>` for the last beat, `<slug>-<step>` for one asked for.
  const legacy = [
    ...(beatIndex === lastStop(section.beats) ? [section.slug] : []),
    `${section.slug}-${step}`,
    `${section.slug}-${beatIndex}`,
  ];
  return fileEntry(deck, [section.slug, step], html, legacy);
}

/** The frame `at` of the move from `from` into `to`. */
export function morphEntry(
  deck: ShotDeck,
  from: string,
  to: string,
  at: number,
  html: string,
): CacheEntry {
  return fileEntry(deck, [from, to, String(at)], `${at}\0${html}`, [`${from}-to-${to}-${at}`]);
}

/**
 * `.cache/shots/<kind>/<parts>.<hash>`, a folder a capture fills. Each set of parts keeps one
 * folder, so runs of different captures neither evict nor race each other.
 */
export function bundleEntry(
  deck: ShotDeck,
  kind: "sheets" | "motion",
  parts: string[],
  content: string,
): CacheBundle {
  const shots = shotsDir(deck);
  const { root } = shots;
  const parent = outputDir(join(shots.dir, kind), root);
  const base = parts.join(SEPARATOR);
  const name = base ? `${base}.${contentHash(content)}` : contentHash(content);
  const pattern = new RegExp(`^${base ? `${escapeRegExp(base)}\\.` : ""}${HASH}$`);
  return {
    dir: outputDir(join(parent, name), root),
    root,
    commit: () => prune(parent, [pattern], name, { recursive: true }),
  };
}

function fileEntry(deck: ShotDeck, parts: string[], content: string, legacy: string[]): CacheEntry {
  const { dir } = shotsDir(deck);
  const name = shotName(parts, content);
  const path = join(dir, name);
  const patterns = [
    new RegExp(`^${escapeRegExp(parts.join(SEPARATOR))}\\.${HASH}\\.png$`),
    ...legacy.map((base) => new RegExp(`^${escapeRegExp(base)}(?:\\.${HASH})?\\.png$`)),
  ];
  return {
    path,
    cached: isCachedFile(path),
    commit: () => prune(dir, patterns, name),
  };
}

/** Removes the entries of `dir` that a pattern names, all but `keep`. */
function prune(
  dir: string,
  patterns: RegExp[],
  keep: string,
  options: { recursive?: boolean } = {},
): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (name !== keep && patterns.some((pattern) => pattern.test(name))) {
      rmSync(join(dir, name), { force: true, recursive: options.recursive === true });
    }
  }
}
