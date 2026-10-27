import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  renameTableKeys,
  scanTomlKeys,
  setTableKey,
  type TomlKey,
} from "../../src/core/toml-keys.ts";
import { propertyTest } from "../helpers/fc.ts";

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

  test("steps over an array or an inline table written over several lines", () => {
    const source = [
      "arr = [ # [not.a.table]",
      "  [1],",
      '  "]", # ]',
      '  { a = "[x]" },',
      "]",
      "k = 1",
      "voice = {",
      "  speed = 1,",
      "  sped = { x = [",
      "    2,",
      "  ] },",
      "}",
      "[t]",
      "z = 1",
    ].join("\n");
    expect(scan(source)).toEqual([
      ["key", "arr", 1],
      ["key", "k", 6],
      ["key", "voice", 7],
      ["inline", "voice.speed", 8],
      ["inline", "voice.sped", 9],
      ["inline", "voice.sped.x", 9],
      ["table", "t", 13],
      ["key", "t.z", 14],
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

/**
 * A key as generated: the characters it holds before it is made unique, and how it may be
 * written. `any` holds only what a bare key may, so each time it is written it may be bare or
 * quoted either way, as one key may be written differently on two lines.
 */
type Name = { quote: "any" | "basic" | "literal"; base: string };

/** A key and its value, or a dotted group of keys under one name: `a.b = 1` and `a.c = 2`. */
type Entry =
  | { kind: "value"; name: Name; value: Value }
  | { kind: "group"; name: Name; entries: Entry[] };

type Value =
  | { kind: "scalar"; text: string }
  /** An inline table, one key to a line where `spread` says so. */
  | { kind: "inline"; entries: Entry[]; spread?: boolean }
  /** A multi-line string, which holds lines that read as headers, keys, and comments. */
  | { kind: "multiline"; quote: '"""' | "'''"; lines: string[] }
  /** An array one item to a line, with items and comments that read as headers and keys. */
  | { kind: "array"; items: string[]; trailing: boolean };

/** A `[table]`, or each of an `[[array]]`'s tables, and the tables under it. */
type TableNode = {
  name: Name;
  array: boolean;
  entries: Entry[][];
  children: TableNode[];
  /** A table with tables under it may go unwritten, made only by their headers. */
  written: boolean;
  /** Written after the tables under it, as `[a.b]` before `[a]`. */
  after: boolean;
};

type TomlPlan = {
  root: Entry[];
  tables: TableNode[];
  /** Choices taken in turn wherever the document can be written more than one way. */
  turns: number[];
  crlf: boolean;
};

const nameArb: fc.Arbitrary<Name> = fc.oneof(
  fc
    .array(fc.constantFrom("a", "Z", "0", "_", "-"), { maxLength: 3 })
    .map((chars): Name => ({ quote: "any", base: chars.join("") })),
  fc
    .array(fc.constantFrom("a", " ", ".", "=", "#", "[", "]", "{", "}", ",", "é", "'"), {
      maxLength: 4,
    })
    .map((chars): Name => ({ quote: "basic", base: chars.join("") })),
  fc
    .array(fc.constantFrom("a", " ", ".", "=", "#", "]", "}", '"', "\\", "é"), { maxLength: 4 })
    .map((chars): Name => ({ quote: "literal", base: chars.join("") })),
);

const scalar = fc.constantFrom(
  "1",
  "-2",
  "3.5",
  "true",
  '"s"',
  '"a = [b] # c"',
  '"q\\"x } y"',
  "'lit \\ # {'",
  '"{ x = 1 }"',
  "[1, 2]",
  '["a]", "b,", "}"]',
  "[[1], [2]]",
  "1979-05-27",
);

const multiline = fc
  .tuple(
    fc.constantFrom('"""' as const, "'''" as const),
    fc.array(
      fc.constantFrom(
        "[fake]",
        "x = 1",
        "# not a comment",
        "[[arr]]",
        "  y.z = { a = 1 }",
        "",
        "plain",
      ),
      { maxLength: 3 },
    ),
  )
  .map(([quote, lines]): Value => ({ kind: "multiline", quote, lines }));

const spreadArray = fc
  .tuple(
    fc.array(
      fc.constantFrom(
        "[1]",
        '"]"',
        '"[x] = 1"',
        "[ [2], 3 ]",
        "'[t]'",
        '"""\n]\n[t]\n"""',
        "# [not.a.table]",
      ),
      { maxLength: 4 },
    ),
    fc.boolean(),
  )
  .map(([items, trailing]): Value => ({ kind: "array", items, trailing }));

/**
 * Entries `depth` groups or inline tables deep. A value over several lines, a multi-line string,
 * an array, or an inline table, only where `lines` allows.
 */
function entries(depth: number, lines: boolean): fc.Arbitrary<Entry[]> {
  const value: fc.Arbitrary<Value> = fc.oneof(
    { weight: 4, arbitrary: scalar.map((text): Value => ({ kind: "scalar", text })) },
    ...(lines ? [multiline, spreadArray] : []),
    ...(depth > 0
      ? [
          fc.tuple(entries(depth - 1, false), fc.boolean()).map(
            ([inner, spread]): Value => ({
              kind: "inline",
              entries: inner,
              spread: lines && spread,
            }),
          ),
        ]
      : []),
  );
  return fc.array(
    fc.oneof(
      {
        weight: 3,
        arbitrary: fc.record({ kind: fc.constant("value" as const), name: nameArb, value }),
      },
      ...(depth > 0
        ? [
            fc.record({
              kind: fc.constant("group" as const),
              name: nameArb,
              entries: entries(depth - 1, lines).filter((inner) => inner.length > 0),
            }),
          ]
        : []),
    ),
    { maxLength: 3 },
  );
}

function tableNode(depth: number): fc.Arbitrary<TableNode> {
  return fc
    .record({
      name: nameArb,
      array: fc.boolean(),
      entries: fc.array(entries(1, true), { minLength: 1, maxLength: 2 }),
      children:
        depth > 0 ? fc.array(tableNode(depth - 1), { maxLength: 2 }) : fc.constant<TableNode[]>([]),
      written: fc.boolean(),
      after: fc.boolean(),
    })
    .map((node) => ({
      ...node,
      // One table where only an array has many; one that goes unwritten holds no keys.
      entries: node.array ? node.entries : node.entries.slice(0, 1),
      written: node.array || node.written || node.children.length === 0,
    }));
}

const tomlPlan: fc.Arbitrary<TomlPlan> = fc.record({
  root: entries(1, true),
  tables: fc.array(tableNode(2), { maxLength: 3 }),
  turns: fc.array(fc.nat(11), { minLength: 1, maxLength: 8 }),
  crlf: fc.boolean(),
});

/** A key as scanTomlKeys reports it: its kind, full path, line, and its segments as written. */
type ExpectedKey = { kind: TomlKey["kind"]; path: string[]; line: number; written: string[] };

/**
 * The document written out, and every key and header in it as scanTomlKeys must report them.
 * Every key is made unique by a number after it, so the document is valid TOML whatever it holds.
 */
function writeToml(plan: TomlPlan): { source: string; keys: ExpectedKey[] } {
  const lines: string[] = [];
  const keys: ExpectedKey[] = [];
  const unique = new Map<Name, string>();
  let turn = 0;
  const next = () => plan.turns[turn++ % plan.turns.length] ?? 0;
  const keyOf = (name: Name) => {
    let key = unique.get(name);
    if (key === undefined) {
      key = `${name.base}${unique.size}`;
      unique.set(name, key);
    }
    return key;
  };
  const segment = (name: Name) => {
    const key = keyOf(name);
    const quote = name.quote === "any" ? ["", "", '"', "'"][next() % 4] : name.quote;
    return quote === "basic" || quote === '"'
      ? `"${key}"`
      : quote === "literal" || quote === "'"
        ? `'${key}'`
        : key;
  };
  const dot = () => [".", " . ", ".\t"][next() % 3] ?? ".";
  const space = () => ["", " ", "\t", "  "][next() % 4] ?? "";
  const comment = () => (next() % 4 === 0 ? ` # [x] = "y" '''` : "");

  /** A key's segments as written, from its group names down to its own. */
  const writePath = (names: Name[]) => {
    const written = names.map(segment);
    return { written, text: written.join(dot()) };
  };

  const writeInline = (inner: Entry[], prefix: string[], groups: Name[], line: number): string => {
    const parts = flatten(inner, groups).map(({ names, value }) => {
      const { written, text } = writePath(names);
      const path = [...prefix, ...names.map(keyOf)];
      keys.push({ kind: "inline", path, line, written });
      return `${text}${space()}=${space()}${valueText(value, path, line)}`;
    });
    return parts.length === 0 ? `{${space()}}` : `{ ${parts.join(`,${space()}`)} }`;
  };

  /** A value on its line, or what opens it; inline tables' keys recorded as they are written. */
  const valueText = (value: Value, path: string[], line: number): string =>
    value.kind === "scalar"
      ? value.text
      : value.kind === "inline"
        ? value.spread
          ? "{"
          : writeInline(value.entries, path, [], line)
        : value.kind === "multiline"
          ? value.quote
          : "[";

  /** The lines after the first of a value written over several, inline tables' keys recorded. */
  const valueLines = (value: Value, path: string[]): string[] => {
    const out: string[] = [];
    if (value.kind === "multiline") {
      out.push(...value.lines, `${value.quote}${comment()}`);
    } else if (value.kind === "array") {
      value.items.forEach((item, at) => {
        const last = at === value.items.length - 1 && !value.trailing;
        const comma = item.startsWith("#") || last ? "" : ",";
        out.push(...`  ${item}${comma}${comment()}`.split("\n"));
      });
      out.push(`]${comment()}`);
    } else if (value.kind === "inline" && value.spread) {
      const parts = flatten(value.entries, []);
      parts.forEach(({ names, value: inner }, at) => {
        if (next() % 4 === 0) {
          out.push("  # [not.a.table] = 1");
        }
        const line = lines.length + out.length + 2;
        const { written, text } = writePath(names);
        const keyPath = [...path, ...names.map(keyOf)];
        keys.push({ kind: "inline", path: keyPath, line, written });
        const comma = at === parts.length - 1 ? "" : ",";
        const valueAt = valueText(inner, keyPath, line);
        out.push(`  ${text}${space()}=${space()}${valueAt}${comma}${comment()}`);
      });
      out.push(`}${comment()}`);
    }
    return out;
  };

  const writeEntries = (list: Entry[], table: string[]) => {
    for (const { names, value } of flatten(list, [])) {
      maybeComment();
      const line = lines.length + 1;
      const { written, text } = writePath(names);
      const path = [...table, ...names.map(keyOf)];
      keys.push({ kind: "key", path, line, written });
      const head = `${space()}${text}${space()}=${space()}`;
      const rest = valueText(value, path, line);
      const spread =
        value.kind === "multiline" ||
        value.kind === "array" ||
        (value.kind === "inline" && value.spread === true);
      if (spread) {
        // What opens the value ends the line; its content and what closes it follow.
        const opened = `${head}${rest}${value.kind === "multiline" ? "" : comment()}`;
        const rest2 = valueLines(value, path);
        lines.push(opened, ...rest2);
      } else {
        lines.push(`${head}${rest}${comment()}`);
      }
    }
  };

  const maybeComment = () => {
    const choice = next() % 6;
    if (choice === 0) {
      lines.push("# [not.a.table]");
    } else if (choice === 1) {
      lines.push("");
    }
  };

  const writeHeader = (node: TableNode, path: Name[], instance: number) => {
    maybeComment();
    const { written, text } = writePath(path);
    const [open, close] = node.array ? ["[[", "]]"] : ["[", "]"];
    keys.push({
      kind: node.array ? "array" : "table",
      path: path.map(keyOf),
      line: lines.length + 1,
      written,
    });
    lines.push(`${space()}${open}${space()}${text}${space()}${close}${comment()}`);
    writeEntries(node.entries[instance] ?? [], path.map(keyOf));
  };

  const writeTable = (node: TableNode, parent: Name[]) => {
    const path = [...parent, node.name];
    const children = () => {
      for (const child of node.children) {
        writeTable(child, path);
      }
    };
    if (node.array) {
      for (const instance of node.entries.keys()) {
        writeHeader(node, path, instance);
      }
      children();
    } else if (node.after) {
      children();
      if (node.written) {
        writeHeader(node, path, 0);
      }
    } else {
      if (node.written) {
        writeHeader(node, path, 0);
      }
      children();
    }
  };

  writeEntries(plan.root, []);
  for (const node of plan.tables) {
    writeTable(node, []);
  }
  return { source: lines.join(plan.crlf ? "\r\n" : "\n"), keys };
}

/** Each key's value with the names of the groups it is under, in the order they are written. */
function flatten(list: Entry[], groups: Name[]): Array<{ names: Name[]; value: Value }> {
  return list.flatMap((entry) =>
    entry.kind === "value"
      ? [{ names: [...groups, entry.name], value: entry.value }]
      : flatten(entry.entries, [...groups, entry.name]),
  );
}

/** Every key path in what Bun.TOML.parse read, tables in an array of tables walked into. */
function parsedPaths(value: unknown, prefix: string[] = []): string[][] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([key, inner]) => {
    const path = [...prefix, key];
    const tables =
      Array.isArray(inner) && inner.length > 0 && inner.every((item) => isTable(item))
        ? inner
        : [inner];
    return [path, ...tables.flatMap((table) => parsedPaths(table, path))];
  });
}

function isTable(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The paths and every path they pass through, as one sorted list. */
function withPrefixes(paths: string[][]): string[] {
  const all = new Set(
    paths.flatMap((path) => path.map((_, at) => JSON.stringify(path.slice(0, at + 1)))),
  );
  return [...all].sort();
}

describe("scanTomlKeys over generated documents", () => {
  // In a document of tables, arrays of tables, dotted and quoted keys, inline tables, comments,
  // multi-line strings, and arrays and inline tables written over several lines, every key and
  // header is reported once, on its line, with its full path and its segments as written, and
  // nothing inside a string, an array, or a comment is.
  propertyTest(
    "reports every key and header where it is written",
    fc.property(tomlPlan, (plan) => {
      const { source, keys } = writeToml(plan);
      const lines = source.split("\n");
      expect(
        scanTomlKeys(source).map((key) => ({
          kind: key.kind,
          path: key.path,
          line: key.line,
          written: key.segments.map((at) => (lines[key.index] ?? "").slice(at.start, at.end)),
        })),
      ).toEqual(keys);
    }),
  );

  // The full key paths it reports, and the tables they pass through, are the ones Bun's own
  // TOML parser reads from the same text.
  propertyTest(
    "reports the key paths Bun.TOML.parse reads",
    fc.property(tomlPlan, (plan) => {
      const { source } = writeToml(plan);
      expect(withPrefixes(scanTomlKeys(source).map((key) => key.path))).toEqual(
        withPrefixes(parsedPaths(Bun.TOML.parse(source))),
      );
    }),
  );
});
