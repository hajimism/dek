import { randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { DekError } from "./error.ts";
import { isInside } from "./path.ts";

/**
 * Where `path` really lives, when dek may follow it there, else undefined. A path with no link
 * in it is taken as written. A link must stay inside `root`, keep its name's extension, and not
 * lead into a hidden file or folder: a cloned repository can commit `theme.css -> ../../.env`
 * or `.dek/schema.json -> ~/.zshrc`, and dek must neither publish the one nor overwrite the
 * other. The part of `path` that does not exist yet is judged as written.
 */
export function followInside(path: string, root: string): string | undefined {
  const wanted = resolve(path);
  if (!isInside(wanted, root)) {
    return undefined;
  }
  const realRoot = realpathSync(root);
  const asWritten = join(realRoot, relative(resolve(root), wanted));
  const real = realOf(wanted);
  if (real === asWritten) {
    return real;
  }
  const rel = relative(realRoot, real);
  if (
    !isInside(real, realRoot) ||
    rel.split(sep).some((segment) => segment.startsWith(".")) ||
    extname(real) !== extname(wanted)
  ) {
    return undefined;
  }
  return real;
}

/** The deepest part of `path` that exists, with its links resolved, then the rest as written. */
function realOf(path: string): string {
  const rest: string[] = [];
  let head = path;
  for (;;) {
    try {
      return join(realpathSync(head), ...rest);
    } catch {
      const up = dirname(head);
      if (up === head) {
        return path;
      }
      rest.unshift(basename(head));
      head = up;
    }
  }
}

function refused(path: string, root: string): DekError {
  return new DekError(`${relative(root, path) || path} leads outside the project`, {
    path,
    hint: "dek follows a symlink only to a file of the same kind inside the project and outside hidden folders; copy the file instead",
  });
}

/** Like `followInside`, but a path dek may not follow is an error that says why. */
export function requireInside(path: string, root: string): string {
  const real = followInside(path, root);
  if (real === undefined) {
    throw refused(path, root);
  }
  return real;
}

/** A source file's text, or nothing when there is no such file; a link out is an error. */
export function readSourceIfExists(path: string, root: string): string | undefined {
  const real = requireInside(path, root);
  return existsSync(real) ? readFileSync(real, "utf8") : undefined;
}

/** A folder dek writes into, made if missing; a link out of `root` on the way is an error. */
export function outputDir(path: string, root: string): string {
  const real = requireInside(path, root);
  mkdirSync(real, { recursive: true });
  // Making the folders may have followed a dangling link to a folder; look again.
  if (followInside(path, root) !== real) {
    throw refused(path, root);
  }
  return real;
}

/**
 * Where a writer that opens `path` itself, such as Chromium or ffmpeg, may write it: the folders
 * exist, and nothing at the path is a link it would follow. A link that stays inside comes back
 * resolved; a dangling one, which would create its file wherever it points, is removed.
 */
export function outputPath(path: string, root: string): string {
  outputDir(dirname(path), root);
  const real = requireInside(path, root);
  try {
    if (lstatSync(real).isSymbolicLink()) {
      unlinkSync(real);
    }
  } catch {
    /* nothing there yet */
  }
  return real;
}

/**
 * True when a cache entry dek wrote is there: a plain file. A link in its place is not dek's and
 * is removed, so neither a build publishes what it points at nor a new entry is written through it.
 */
export function isCachedFile(path: string): boolean {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      unlinkSync(path);
      return false;
    }
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Write `data` to `path` inside `root`: to a fresh file beside it, then renamed into place, so a
 * reader never sees half a file and a link in the way is replaced rather than written through.
 */
export function writeInside(
  path: string,
  data: string | NodeJS.ArrayBufferView,
  root: string,
  options: { mode?: number } = {},
): void {
  replaceFile(outputPath(path, root), data, options);
}

/**
 * Write `data` as a new file at `path`, in a folder already known to be inside the project: a
 * link at `path`, such as one planted at a cache entry's predictable name, is replaced, never
 * written through.
 */
export function replaceFile(
  path: string,
  data: string | NodeJS.ArrayBufferView,
  options: { mode?: number } = {},
): void {
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID().slice(0, 8)}.tmp`);
  writeFileSync(temp, data, {
    flag: "wx",
    ...(options.mode !== undefined ? { mode: options.mode } : {}),
  });
  try {
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

/** Remove every link directly in `dir`, a folder of dek's own output that a writer fills by name. */
export function dropLinks(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      unlinkSync(join(dir, entry.name));
    }
  }
}

/**
 * Remove `path` inside `root`. A link is removed itself, never what it points at; a path whose
 * folders lead out of `root` is refused, so no link can aim a delete at a file elsewhere.
 */
export function removeInside(
  path: string,
  root: string,
  options: { recursive?: boolean } = {},
): void {
  let isLink = false;
  try {
    isLink = lstatSync(path).isSymbolicLink();
  } catch {
    return;
  }
  const parent = requireInside(dirname(path), root);
  const target = isLink ? join(parent, basename(path)) : requireInside(path, root);
  rmSync(target, { force: true, recursive: options.recursive === true });
}
