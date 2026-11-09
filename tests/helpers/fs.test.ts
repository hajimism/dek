import { describe, expect, test } from "bun:test";
import { closeSync, fstatSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withTempDir, writeEdit } from "./fs.ts";

describe("writeEdit", () => {
  // A watcher that scans in the middle of an edit must see the old file or the edited one, never a
  // third state; one that did would count the edit twice.
  test("shows the new text only with its final mtime", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "intro.html");
      writeFileSync(path, "old\n");
      // Text and mtime come through one descriptor, so they belong to the same file.
      const sample = () => {
        const fd = openSync(path, "r");
        try {
          return { text: readFileSync(fd, "utf8"), mtime: fstatSync(fd).mtimeMs };
        } finally {
          closeSync(fd);
        }
      };
      const before = sample();
      const seen: ReturnType<typeof sample>[] = [];
      let done = false;
      const editing = writeEdit(path, "new\n").finally(() => {
        done = true;
      });
      while (!done) {
        seen.push(sample());
        await new Promise((resolve) => setImmediate(resolve));
      }
      await editing;
      const after = sample();
      expect(after.text).toBe("new\n");
      expect(after.mtime - before.mtime).toBeGreaterThanOrEqual(9_000);
      expect(
        seen.filter((state) => state.mtime !== before.mtime && state.mtime !== after.mtime),
      ).toEqual([]);
      expect(
        seen.filter((state) => state.text !== (state.mtime === after.mtime ? after : before).text),
      ).toEqual([]);
    });
  });
});
