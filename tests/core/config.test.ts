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

describe("[refs]", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";

  test("reads each ref name and the sha it is pinned to", () => {
    expect(parseDekToml(`[refs]\n"hajimism/dek/why-dek" = "${sha}"\n`).refs).toEqual({
      "hajimism/dek/why-dek": sha,
    });
  });

  test("rejects a key that is not owner/repo/deck", () => {
    expect(() => parseDekToml(`[refs]\n"why-dek" = "${sha}"\n`)).toThrow("owner/repo/deck");
  });

  test("rejects a value that is not a full sha", () => {
    expect(() => parseDekToml(`[refs]\n"hajimism/dek/why-dek" = "main"\n`)).toThrow("40-character");
  });
});

describe("url", () => {
  test("reads the URL dist/ is served from, ending it with a slash", () => {
    expect(parseDekToml('url = "https://example.com/talks"\n').url).toBe(
      "https://example.com/talks/",
    );
    expect(parseDekToml('url = "https://example.com/talks/"\n').url).toBe(
      "https://example.com/talks/",
    );
  });

  test("rejects a URL that is not absolute http(s)", () => {
    expect(() => parseDekToml('url = "/talks/"\n')).toThrow(/^url: /);
    expect(() => parseDekToml('url = "ftp://example.com/"\n')).toThrow(/^url: /);
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

describe("parseDekToml errors", () => {
  // The parser's wording and whether it reports a line change between Bun versions, so only
  // what dek adds is pinned: the prefix, no class name or parser banner, and the line when given.
  test("names a TOML syntax error in the parser's words, without its class name or banner", () => {
    try {
      parseDekToml("max_classes = 40\nlatin_per_minute =\n", "/p/dek.toml");
      throw new Error("expected parseDekToml to fail");
    } catch (error) {
      const { message, line } = error as DekError;
      expect(message).toMatch(/^invalid dek\.toml: \S/);
      expect(message).not.toMatch(/BuildMessage|SyntaxError|TOML Parse error/);
      expect(line === undefined || line === 2).toBe(true);
    }
  });
});
