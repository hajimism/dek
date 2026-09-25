import { describe, expect, test } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveBinFromAncestors, walkUp } from "../../src/core/optional.ts";
import { withTempDir } from "../helpers/fs.ts";

describe("walkUp", () => {
  test("visits the start directory then parents until a hit", async () => {
    await withTempDir(async (dir) => {
      const nested = join(dir, "a", "b");
      const visited: string[] = [];
      const hit = walkUp(nested, (current) => {
        visited.push(current);
        return current === dir ? "found" : undefined;
      });
      expect(hit).toBe("found");
      expect(visited[0]).toBe(nested);
      expect(visited.at(-1)).toBe(dir);
    });
  });

  test("returns undefined when nothing matches", async () => {
    await withTempDir(async (dir) => {
      expect(walkUp(join(dir, "nested"), () => undefined)).toBeUndefined();
    });
  });
});

describe("resolveBinFromAncestors", () => {
  test("finds node_modules/.bin from an ancestor", async () => {
    await withTempDir(async (dir) => {
      const binDir = join(dir, "node_modules", ".bin");
      await mkdir(binDir, { recursive: true });
      const rumdl = join(binDir, "rumdl");
      await writeFile(rumdl, "#!/bin/sh\necho ok\n");
      await chmod(rumdl, 0o755);
      const nested = join(dir, "decks", "why-dek");
      await mkdir(nested, { recursive: true });
      expect(resolveBinFromAncestors("rumdl", nested)).toBe(rumdl);
    });
  });
});
