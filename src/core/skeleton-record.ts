import { createHash } from "node:crypto";
import { join } from "node:path";
import { deckProjectRoot } from "./path.ts";
import { readSourceIfExists, writeInside } from "./safe-fs.ts";

/**
 * Which slides are still dekc's own: the skeletons dekc wrote that nobody has touched since, kept as
 * hashes of their bytes in `.cache/skeletons`. The shape of a skeleton proves nothing, since an
 * author who retypes its heading keeps the shape; only the bytes dekc wrote do.
 *
 * The record is a cache, and anyone may delete it. Without it, a slide that is exactly the
 * skeleton dekc would write now is still provably dekc's, and every other slide is the author's, so
 * a lost record costs refreshes, never edits.
 */
export type SkeletonRecord = {
  /** Whether `html` is dekc's: what it wrote before, or byte for byte what it would write now. */
  owns(html: string, now: string | undefined): boolean;
  /** Notes `html` as dekc's for the next run; what is not kept is forgotten on `save`. */
  keep(html: string): void;
  /** Writes what was kept, when that differs from what was read. */
  save(): void;
};

export function skeletonRecord(deckDir: string): SkeletonRecord {
  const root = deckProjectRoot(deckDir);
  const path = join(deckDir, ".cache", "skeletons");
  const source = readSourceIfExists(path, root);
  const written = new Set(source?.split("\n").filter((line) => HASH_RE.test(line)));
  const kept = new Set<string>();
  return {
    owns: (html, now) => html === now || written.has(hashOf(html)),
    keep: (html) => {
      kept.add(hashOf(html));
    },
    save: () => {
      const next = [...kept]
        .sort()
        .map((hash) => `${hash}\n`)
        .join("");
      if (next !== (source ?? "")) {
        writeInside(path, next, root);
      }
    },
  };
}

const HASH_RE = /^[0-9a-f]{64}$/;

function hashOf(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}
