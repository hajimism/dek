import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export function moduleFilePath(url: string | URL): string {
  return fileURLToPath(url);
}

export function isInside(filePath: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(filePath));
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

/** The project a deck belongs to: decks live at `<root>/decks/<name>`. */
export function deckProjectRoot(deckDir: string): string {
  return resolve(deckDir, "..", "..");
}

export const DECK_NAME_HINT =
  'use a plain name like 2026-10-talk: no "/" or "\\", no control characters, no leading "-"';

export function isDeckName(name: string): boolean {
  return (
    name.length > 0 &&
    !name.includes("/") &&
    !name.includes("\\") &&
    name !== "." &&
    name !== ".." &&
    // A leading "-" reads as a flag to every tool the name is passed to.
    !name.startsWith("-") &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: a control in a name is the problem.
    !/[\x00-\x1f\x7f]/.test(name)
  );
}

export type DistOptions = {
  rootDist?: boolean;
};

export function distDir(
  project: { root: string },
  deck: { dir: string },
  options?: DistOptions,
): string {
  return options?.rootDist ? join(project.root, "dist") : join(deck.dir, "dist");
}

export function distFile(
  project: { root: string },
  deck: { dir: string; name: string },
  ext: string,
  options?: DistOptions,
): string {
  return join(distDir(project, deck, options), `${deck.name}.${ext}`);
}

export function cacheDir(deckDir: string, kind: "voice" | "video" | "shots"): string {
  return join(deckDir, ".cache", kind);
}
