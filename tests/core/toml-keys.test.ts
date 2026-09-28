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

describe("scanTomlKeys edge cases", () => {
  const scan = (source: string) =>
    scanTomlKeys(source).map((key) => [key.kind, key.path.join("."), key.line]);

  test("skips blank, comment, and malformed lines", () => {
    expect(scan('\n\t# c\n[open\nno equals\n"unterminated = 1\n= 1\nok=1\r\n')).toEqual([
      ["key", "ok", 7],
    ]);
  });

  test("reads headers with spaces, quotes, tabs, and trailing comments", () => {
    const keys = scanTomlKeys(`[ a . "b.c" . 'd' ] # c\n\t[[ list ]]\n`);
    expect(keys.map((key) => [key.kind, key.path])).toEqual([
      ["table", ["a", "b.c", "d"]],
      ["array", ["list"]],
    ]);
    expect(keys[0]?.segments).toEqual([
      { start: 2, end: 3, key: "a", quote: "" },
      { start: 6, end: 11, key: "b.c", quote: '"' },
      { start: 14, end: 17, key: "d", quote: "'" },
    ]);
  });

  test("keeps a basic key's escapes raw and treats a literal key's backslash as text", () => {
    const keys = scanTomlKeys(`"a\\"b" = 1\n'c\\' = 2\n`);
    expect(keys.map((key) => key.segments[0]?.key)).toEqual(['a\\"b', "c\\"]);
  });

  test("steps over literal and basic multi-line strings, but not ones closed on their line", () => {
    const source = `a = '''\nb = 1\n'''\nc = """x"""\nd = 1\ne = """\nf = 1`;
    expect(scan(source)).toEqual([
      ["key", "a", 1],
      ["key", "c", 4],
      ["key", "d", 5],
      ["key", "e", 6],
    ]);
  });

  test("reads inline keys past strings holding separators, and stops at a malformed one", () => {
    expect(
      scan(
        `t = { a = "x, }", 'b' = [1, "]"], c.d = 'y' , e = 1 } # c\nu = { f = 1, !g = 2, h = 3 }`,
      ),
    ).toEqual([
      ["key", "t", 1],
      ["inline", "t.a", 1],
      ["inline", "t.b", 1],
      ["inline", "t.c.d", 1],
      ["inline", "t.e", 1],
      ["key", "u", 2],
      ["inline", "u.f", 2],
    ]);
  });

  test("reads an empty inline table and one left open at the end of its line", () => {
    expect(scan("t = {}\nu = { a = 1\nb = 2")).toEqual([
      ["key", "t", 1],
      ["key", "u", 2],
      ["inline", "u.a", 2],
      ["key", "b", 3],
    ]);
  });
});

describe("renameTableKeys edge cases", () => {
  const rename = (key: string) => (key === "old" ? "new" : undefined);

  test("renames only the segment right under the table, keeping quotes and the rest", () => {
    expect(renameTableKeys("[beats]\n'old'.old = 1\n[beats.old.old]\n", "beats", rename)).toBe(
      "[beats]\n'new'.old = 1\n[beats.new.old]\n",
    );
  });

  test("leaves other tables and the table's own header alone", () => {
    const source = "[old]\nold = 1\n[beats]\n";
    expect(renameTableKeys(source, "beats", rename)).toBe(source);
  });
});

describe("setTableKey edge cases", () => {
  test("replaces a bare or literal value, keeping a trailing comment", () => {
    expect(setTableKey("[refs]\na = 1   # c\nb = 'x'#c\n", "refs", "a", "v")).toBe(
      "[refs]\na = \"v\"   # c\nb = 'x'#c\n",
    );
    expect(setTableKey("[refs]\nb = 'x'#c\n", "refs", "b", "v")).toBe('[refs]\nb = "v"#c\n');
  });

  test("adds right after the header of a table with no keys", () => {
    expect(setTableKey("[refs]\n\n[voice]\n", "refs", "a", "v")).toBe(
      '[refs]\n"a" = "v"\n\n[voice]\n',
    );
  });

  test("ignores dotted keys, keys of other tables, and a nested table's header", () => {
    const source = "a = 1\n[refs.a]\n[refs]\nx.a = 1\n";
    expect(setTableKey(source, "refs", "a", "v")).toBe(`${source}"a" = "v"\n`);
  });

  test("keeps a table holding only a comment besides the removed key", () => {
    const source = "[refs]\n# keep\na = 1\n";
    expect(setTableKey(source, "refs", "a", undefined)).toBe("[refs]\n# keep\n");
  });

  test("removes the last table and trims the file to one final newline", () => {
    expect(setTableKey("max = 1\n\n[refs]\na = 1\n\n\n", "refs", "a", undefined)).toBe("max = 1\n");
  });
});

describe("setTableKey around quoted keys and multi-line values", () => {
  test("replaces the value of a key whose quoted name holds an equals sign", () => {
    expect(setTableKey('[refs]\n"a=b"="old"  # c\n', "refs", "a=b", "new")).toBe(
      '[refs]\n"a=b"="new"  # c\n',
    );
  });

  test("replaces a triple-quoted value whole, on one line or many", () => {
    expect(setTableKey('[refs]\na = """x""" # c\n', "refs", "a", "v")).toBe(
      '[refs]\na = "v" # c\n',
    );
    expect(setTableKey("[refs]\na = '''\nx\n''' # c\nb = 1\n", "refs", "a", "v")).toBe(
      '[refs]\na = "v" # c\nb = 1\n',
    );
  });

  test("adds after a multi-line value, not inside it", () => {
    expect(setTableKey('[refs]\na = """\nx\n"""\n', "refs", "b", "v")).toBe(
      '[refs]\na = """\nx\n"""\n"b" = "v"\n',
    );
  });

  test("removes every line of a multi-line value", () => {
    expect(setTableKey('[refs]\na = """\nx\n"""\nb = 1\n', "refs", "a", undefined)).toBe(
      "[refs]\nb = 1\n",
    );
  });
});
