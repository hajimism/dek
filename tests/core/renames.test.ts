import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readRenames, recordRename, renamesPath } from "../../src/core/renames.ts";
import { withTempDir } from "../helpers/fs.ts";

describe("renames", () => {
  test("records each rename by deck, oldest first", async () => {
    await withTempDir(async (root) => {
      expect(readRenames(root, "talk")).toEqual([]);
      recordRename(root, "talk", "intro", "opening", new Date("2026-11-12T00:00:00Z"));
      recordRename(root, "talk", "opening", "hello", new Date("2026-11-12T01:00:00Z"));
      recordRename(root, "other", "a", "b", new Date("2026-11-12T02:00:00Z"));
      expect(readRenames(root, "talk")).toEqual([
        { from: "intro", to: "opening", at: "2026-11-12T00:00:00.000Z" },
        { from: "opening", to: "hello", at: "2026-11-12T01:00:00.000Z" },
      ]);
      expect(JSON.parse(readFileSync(renamesPath(root), "utf8")).version).toBe(1);
    });
  });

  test("says how to recover from a file that does not read", async () => {
    await withTempDir(async (root) => {
      mkdirSync(join(root, ".dek"));
      writeFileSync(renamesPath(root), "{");
      expect(() => readRenames(root, "talk")).toThrow(".dek/renames.json does not read");
    });
  });
});
