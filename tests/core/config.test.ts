import { describe, expect, test } from "bun:test";
import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig, parseDekToml } from "../../src/core/config.ts";
import { unknownFrontmatterKeys } from "../../src/core/config-keys.ts";
import { DekError } from "../../src/core/error.ts";
import { withTempDir } from "../helpers/fs.ts";

describe("parseDekToml", () => {
  test("reads nothing from comments-only input", () => {
    expect(parseDekToml("# dek project\n")).toEqual({});
  });

  // A deck reads these from its own frontmatter; dek.toml holds them for `dekc new` to copy.
  test("reads the deck settings as the seed for a new deck", () => {
    expect(
      parseDekToml(`
max_classes = 12
cjk_per_minute = 250
latin_per_minute = 100
`),
    ).toEqual({
      seed: { max_classes: 12, cjk_per_minute: 250, latin_per_minute: 100 },
    });
  });

  test("ignores unknown keys and seeds only the settings it sets", () => {
    expect(parseDekToml("max_classes = 8\nunknown = 1\n")).toEqual({ seed: { max_classes: 8 } });
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

  test("pins a pack's ref to a 64-character sha256, and refuses each pin where the other belongs", () => {
    const digest = "ab".repeat(32);
    expect(parseDekToml(`[refs]\n"file/talk" = "${digest}"\n`).refs).toEqual({
      "file/talk": digest,
    });
    expect(() => parseDekToml(`[refs]\n"file/talk" = "${sha}"\n`)).toThrow("64-character");
    expect(() => parseDekToml(`[refs]\n"hajimism/dek/why-dek" = "${digest}"\n`)).toThrow(
      "40-character",
    );
  });
});

describe("[pack]", () => {
  test("reads the license a pack is handed over under", () => {
    expect(parseDekToml('[pack]\nlicense = "CC0-1.0"\n').pack).toEqual({ license: "CC0-1.0" });
    expect(parseDekToml('[pack]\nlicense = "CC-BY-4.0"\n').pack).toEqual({ license: "CC-BY-4.0" });
    expect(parseDekToml("# no pack\n").pack).toBeUndefined();
  });

  test("refuses a license dek has no text for, and names the ones it has", () => {
    expect(() => parseDekToml('[pack]\nlicense = "MIT"\n')).toThrow(
      /CC0-1\.0.*CC-BY-4\.0.*LICENSE/,
    );
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
  test("reads nothing when the file is missing", () => {
    expect(loadConfig("/tmp/dek-missing-config.toml")).toEqual({});
  });

  test("reads dek.toml from disk", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "dek.toml");
      await writeFile(path, "cjk_per_minute = 200\n");
      expect(loadConfig(path)).toEqual({ seed: { cjk_per_minute: 200 } });
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

describe("unknownFrontmatterKeys", () => {
  // The schema decides what is unknown, as it does for dek.toml; the lines only say where.
  test("judges a quoted key by the schema, and finds its line", () => {
    expect(unknownFrontmatterKeys('title: Demo\n"venue": Tokyo\n', 2)).toEqual([
      { key: "venue", line: 3 },
    ]);
  });

  test("reads every key the schema knows as known", () => {
    expect(unknownFrontmatterKeys("title: Demo\nratio: 4:3\nlang: en\n", 2)).toEqual([]);
    expect(
      unknownFrontmatterKeys(
        "title: Demo\nmax_classes: 30\ncjk_per_minute: 280\nlatin_per_minute: 120\n",
        2,
      ),
    ).toEqual([]);
  });
});

describe("loadConfig", () => {
  test("refuses a dek.toml that links out of the project", async () => {
    await withTempDir(async (outside) => {
      await writeFile(join(outside, "dek.toml"), 'url = "https://example.com/"\n');
      await withTempDir(async (root) => {
        await symlink(join(outside, "dek.toml"), join(root, "dek.toml"));
        expect(() => loadConfig(join(root, "dek.toml"))).toThrow(
          expect.objectContaining({
            message: "dek.toml leads outside the project",
            hint: expect.stringContaining("copy the file instead"),
          }),
        );
      });
    });
  });
});
