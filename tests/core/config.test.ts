import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_CONFIG, loadConfig, parseDekToml } from "../../src/core/config.ts";
import { DekError } from "../../src/core/error.ts";
import { withTempDir } from "../helpers/fs.ts";

describe("parseDekToml", () => {
  test("returns defaults for comments-only input", () => {
    expect(parseDekToml("# dek project\n")).toEqual(DEFAULT_CONFIG);
  });

  test("reads the three known keys", () => {
    expect(
      parseDekToml(`
max_classes = 12
cjk_per_minute = 250
latin_per_minute = 100
`),
    ).toEqual({
      maxClasses: 12,
      cjkPerMinute: 250,
      latinPerMinute: 100,
    });
  });

  test("ignores unknown keys and fills missing ones from defaults", () => {
    expect(parseDekToml("max_classes = 8\nunknown = 1\n")).toEqual({
      maxClasses: 8,
      cjkPerMinute: DEFAULT_CONFIG.cjkPerMinute,
      latinPerMinute: DEFAULT_CONFIG.latinPerMinute,
    });
  });

  test("throws DekError for invalid TOML", () => {
    expect(() => parseDekToml("max_classes = [")).toThrow(DekError);
  });

  test("names the bad key when dek.toml has a wrong type", () => {
    expect(() => parseDekToml('max_classes = "many"')).toThrow(/^max_classes: /);
  });
});

describe("loadConfig", () => {
  test("returns defaults when the file is missing", () => {
    expect(loadConfig("/tmp/dek-missing-config.toml")).toEqual(DEFAULT_CONFIG);
  });

  test("reads dek.toml from disk", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "dek.toml");
      await writeFile(path, "cjk_per_minute = 200\n");
      expect(loadConfig(path)).toEqual({
        maxClasses: DEFAULT_CONFIG.maxClasses,
        cjkPerMinute: 200,
        latinPerMinute: DEFAULT_CONFIG.latinPerMinute,
      });
    });
  });
});
