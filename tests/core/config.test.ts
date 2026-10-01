import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_CONFIG, loadConfig, parseDekcToml } from "../../src/core/config.ts";
import { unknownFrontmatterKeys } from "../../src/core/config-keys.ts";
import { DekcError } from "../../src/core/error.ts";
import { withTempDir } from "../helpers/fs.ts";

describe("parseDekcToml", () => {
  test("returns defaults for comments-only input", () => {
    expect(parseDekcToml("# dekc project\n")).toEqual(DEFAULT_CONFIG);
  });

  test("reads the three known keys", () => {
    expect(
      parseDekcToml(`
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
    expect(parseDekcToml("max_classes = 8\nunknown = 1\n")).toEqual({
      maxClasses: 8,
      cjkPerMinute: DEFAULT_CONFIG.cjkPerMinute,
      latinPerMinute: DEFAULT_CONFIG.latinPerMinute,
    });
  });

  test("throws DekcError for invalid TOML", () => {
    expect(() => parseDekcToml("max_classes = [")).toThrow(DekcError);
  });

  test("names the bad key when dekc.toml has a wrong type", () => {
    expect(() => parseDekcToml('max_classes = "many"')).toThrow(/^max_classes: /);
  });
});

describe("[refs]", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";

  test("reads each ref name and the sha it is pinned to", () => {
    expect(parseDekcToml(`[refs]\n"hajimism/dekc/why-dekc" = "${sha}"\n`).refs).toEqual({
      "hajimism/dekc/why-dekc": sha,
    });
  });

  test("rejects a key that is not owner/repo/deck", () => {
    expect(() => parseDekcToml(`[refs]\n"why-dekc" = "${sha}"\n`)).toThrow("owner/repo/deck");
  });

  test("rejects a value that is not a full sha", () => {
    expect(() => parseDekcToml(`[refs]\n"hajimism/dekc/why-dekc" = "main"\n`)).toThrow(
      "40-character",
    );
  });
});

describe("url", () => {
  test("reads the URL dist/ is served from, ending it with a slash", () => {
    expect(parseDekcToml('url = "https://example.com/talks"\n').url).toBe(
      "https://example.com/talks/",
    );
    expect(parseDekcToml('url = "https://example.com/talks/"\n').url).toBe(
      "https://example.com/talks/",
    );
  });

  test("rejects a URL that is not absolute http(s)", () => {
    expect(() => parseDekcToml('url = "/talks/"\n')).toThrow(/^url: /);
    expect(() => parseDekcToml('url = "ftp://example.com/"\n')).toThrow(/^url: /);
  });
});

describe("loadConfig", () => {
  test("returns defaults when the file is missing", () => {
    expect(loadConfig("/tmp/dekc-missing-config.toml")).toEqual(DEFAULT_CONFIG);
  });

  test("reads dekc.toml from disk", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "dekc.toml");
      await writeFile(path, "cjk_per_minute = 200\n");
      expect(loadConfig(path)).toEqual({
        maxClasses: DEFAULT_CONFIG.maxClasses,
        cjkPerMinute: 200,
        latinPerMinute: DEFAULT_CONFIG.latinPerMinute,
      });
    });
  });
});

describe("parseDekcToml errors", () => {
  // The parser's wording and whether it reports a line change between Bun versions, so only
  // what dekc adds is pinned: the prefix, no class name or parser banner, and the line when given.
  test("names a TOML syntax error in the parser's words, without its class name or banner", () => {
    try {
      parseDekcToml("max_classes = 40\nlatin_per_minute =\n", "/p/dekc.toml");
      throw new Error("expected parseDekcToml to fail");
    } catch (error) {
      const { message, line } = error as DekcError;
      expect(message).toMatch(/^invalid dekc\.toml: \S/);
      expect(message).not.toMatch(/BuildMessage|SyntaxError|TOML Parse error/);
      expect(line === undefined || line === 2).toBe(true);
    }
  });
});

describe("unknownFrontmatterKeys", () => {
  // The schema decides what is unknown, as it does for dekc.toml; the lines only say where.
  test("judges a quoted key by the schema, and finds its line", () => {
    expect(unknownFrontmatterKeys('title: Demo\n"venue": Tokyo\n', 2)).toEqual([
      { key: "venue", line: 3 },
    ]);
  });

  test("reads every key the schema knows as known", () => {
    expect(unknownFrontmatterKeys("title: Demo\nratio: 4:3\nlang: en\n", 2)).toEqual([]);
  });
});
