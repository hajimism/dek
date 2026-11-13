import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readRenames, recordRename, renameRecord, renamesPath } from "../../src/core/renames.ts";
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

  test("appends to the file as it is when the record is written, and takes back only its own entry", async () => {
    await withTempDir(async (root) => {
      const at = new Date("2026-11-12T00:00:00Z");
      const record = renameRecord(root, "talk", "intro", "opening", { now: at });
      // Another dekc mv, on another deck, records between this one's plan and its write.
      recordRename(root, "other", "a", "b", at);
      record.apply();
      expect(readRenames(root, "talk")).toEqual([
        { from: "intro", to: "opening", at: at.toISOString() },
      ]);
      expect(readRenames(root, "other")).toEqual([{ from: "a", to: "b", at: at.toISOString() }]);
      recordRename(root, "talk", "opening", "hello", at);
      record.undo();
      expect(readRenames(root, "talk")).toEqual([
        { from: "opening", to: "hello", at: at.toISOString() },
      ]);
      expect(readRenames(root, "other")).toHaveLength(1);
    });
  });

  test("removes the file its undo leaves empty, when there was none before", async () => {
    await withTempDir(async (root) => {
      const record = renameRecord(root, "talk", "intro", "opening");
      record.apply();
      expect(existsSync(renamesPath(root))).toBe(true);
      record.undo();
      expect(existsSync(renamesPath(root))).toBe(false);
    });
  });

  test("records a rename once when asked to, if the deck's last entry is that rename", async () => {
    await withTempDir(async (root) => {
      const at = new Date("2026-11-12T00:00:00Z");
      renameRecord(root, "talk", "intro", "opening", { now: at, once: true }).apply();
      renameRecord(root, "talk", "intro", "opening", { now: at, once: true }).apply();
      renameRecord(root, "other", "intro", "opening", { now: at, once: true }).apply();
      expect(readRenames(root, "talk")).toHaveLength(1);
      expect(readRenames(root, "other")).toHaveLength(1);
    });
  });
});
