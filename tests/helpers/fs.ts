import { realpathSync } from "node:fs";
import { mkdtemp, rename, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = realpathSync(await mkdtemp(join(tmpdir(), "dek-")));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Write `text` to `path` as an edit a watcher sees exactly once. Linux stamps a file's mtime from
 * a clock that ticks every few milliseconds, so a write right after another can keep its mtime, and
 * a watcher that compares mtimes sees no edit; this one moves the mtime ten seconds ahead. Writing
 * and then stamping `path` would show a watcher two mtimes, so the text is written and stamped
 * beside it, under a name no watcher reads, and renamed over it, which keeps the mtime.
 */
export async function writeEdit(path: string, text: string): Promise<void> {
  const draft = `${path}.tmp`;
  await writeFile(draft, text);
  const later = new Date(Date.now() + 10_000);
  await utimes(draft, later, later);
  await rename(draft, path);
}
