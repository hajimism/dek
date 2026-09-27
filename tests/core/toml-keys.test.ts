import { describe, expect, test } from "bun:test";
import { renameTableKeys, scanTomlKeys, setTableKey } from "../../src/core/toml-keys.ts";

const SHA = "a".repeat(40);

describe("setTableKey", () => {
  test("adds a table at the end when there is none, keeping the rest byte for byte", () => {
    expect(setTableKey("# dek project\nmax_classes = 40\n", "refs", "o/r/d", SHA)).toBe(
      `# dek project\nmax_classes = 40\n\n[refs]\n"o/r/d" = "${SHA}"\n`,
    );
    expect(setTableKey("", "refs", "o/r/d", SHA)).toBe(`[refs]\n"o/r/d" = "${SHA}"\n`);
    expect(setTableKey("max_classes = 40", "refs", "o/r/d", SHA)).toBe(
      `max_classes = 40\n\n[refs]\n"o/r/d" = "${SHA}"\n`,
    );
  });

  test("adds a key after the table's last key, before the next table", () => {
    const source = `[refs]\n"a/b/c" = "x" # house deck\n\n[voice]\nspeaker = "s"\n`;
    expect(setTableKey(source, "refs", "o/r/d", SHA)).toBe(
      `[refs]\n"a/b/c" = "x" # house deck\n"o/r/d" = "${SHA}"\n\n[voice]\nspeaker = "s"\n`,
    );
  });

  test("replaces only the value of an existing key", () => {
    const source = `[refs]\n  "o/r/d" = "old"   # pinned for the talk\n`;
    expect(setTableKey(source, "refs", "o/r/d", SHA)).toBe(
      `[refs]\n  "o/r/d" = "${SHA}"   # pinned for the talk\n`,
    );
  });

  test("removes a key, and the table once it holds no keys", () => {
    const two = `max = 1\n\n[refs]\n"a/b/c" = "x"\n"o/r/d" = "y"\n`;
    expect(setTableKey(two, "refs", "o/r/d", undefined)).toBe(`max = 1\n\n[refs]\n"a/b/c" = "x"\n`);
    const one = `max = 1\n\n[refs]\n"o/r/d" = "y"\n\n[voice]\nspeaker = "s"\n`;
    expect(setTableKey(one, "refs", "o/r/d", undefined)).toBe(
      `max = 1\n\n[voice]\nspeaker = "s"\n`,
    );
  });

  test("removing a key that is not there changes nothing", () => {
    expect(setTableKey("max = 1\n", "refs", "o/r/d", undefined)).toBe("max = 1\n");
  });
});

describe("scanTomlKeys", () => {
  test("reads headers, dotted and quoted keys, and inline tables, each on its line", () => {
    const source = `# c
url = "https://x/" # c
voice = { speaker = "a", opts = { fast = true }, list = [1, { no = 1 }] }
[beats]
"intro/hook" = 1
a.b = 2
note = """
fake = 1
"""
[[items]]
x = 1
`;
    expect(scanTomlKeys(source).map((key) => [key.kind, key.path.join("."), key.line])).toEqual([
      ["key", "url", 2],
      ["key", "voice", 3],
      ["inline", "voice.speaker", 3],
      ["inline", "voice.opts", 3],
      ["inline", "voice.opts.fast", 3],
      ["inline", "voice.list", 3],
      ["table", "beats", 4],
      ["key", "beats.intro/hook", 5],
      ["key", "beats.a.b", 6],
      ["key", "beats.note", 7],
      ["array", "items", 10],
      ["key", "items.x", 11],
    ]);
  });
});

describe("renameTableKeys", () => {
  const rename = (key: string) => (key === "old" ? "new" : undefined);

  test("renames a key under the table, in a header, and as a dotted key", () => {
    expect(renameTableKeys('[beats]\nold = 1\n"old" = 2\n', "beats", rename)).toBe(
      '[beats]\nnew = 1\n"new" = 2\n',
    );
    expect(renameTableKeys("beats.old = 2\n[beats.old]\nx = 1\n", "beats", rename)).toBe(
      "beats.new = 2\n[beats.new]\nx = 1\n",
    );
  });

  test("leaves an inline table as written, for the caller to detect", () => {
    const source = "beats = { old = 1 }\n";
    expect(renameTableKeys(source, "beats", rename)).toBe(source);
  });
});
