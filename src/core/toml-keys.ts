/** One key segment as written on its line: `a`, `"b/c"`, or `'d'`. */
export type KeySegment = { start: number; end: number; key: string; quote: string };

/** One key or table header of a TOML file, where it is written. */
export type TomlKey = {
  /** `[table]`, `[[array]]`, a `key =` line, or a key inside an inline table `{ key = … }`. */
  kind: "table" | "array" | "key" | "inline";
  /** The full dotted path: the table it is under, then the key. */
  path: string[];
  /** The path as written on the line; for a key, without the table it is under. */
  segments: KeySegment[];
  /** 0-based index of the line in `source.split("\n")`; `line` is 1-based. */
  index: number;
  line: number;
};

/**
 * Every key and table header in a TOML file, in order, with where each is written: the one reader
 * dek.toml lint, `dek mv`, and `dek ref` share. It reads `[table]`, `[[array]]`, (dotted) keys, and
 * one-line inline tables, and steps over comments and multi-line strings.
 */
export function scanTomlKeys(source: string): TomlKey[] {
  const keys: TomlKey[] = [];
  let table: string[] = [];
  let multiline: string | undefined;
  for (const [index, line] of source.split("\n").entries()) {
    if (multiline) {
      if (line.includes(multiline)) {
        multiline = undefined;
      }
      continue;
    }
    const start = skipSpace(line, 0);
    const ch = line[start];
    if (ch === undefined || ch === "#") {
      continue;
    }
    if (ch === "[") {
      const array = line[start + 1] === "[";
      const path = readKeyPath(line, start + (array ? 2 : 1));
      if (!path || line[path.end] !== "]") {
        continue;
      }
      table = path.segments.map((segment) => segment.key);
      keys.push({
        kind: array ? "array" : "table",
        path: table,
        segments: path.segments,
        index,
        line: index + 1,
      });
      continue;
    }
    const path = readKeyPath(line, start);
    if (!path || line[path.end] !== "=") {
      continue;
    }
    const full = [...table, ...path.segments.map((segment) => segment.key)];
    keys.push({ kind: "key", path: full, segments: path.segments, index, line: index + 1 });
    const valueStart = skipSpace(line, path.end + 1);
    if (line[valueStart] === "{") {
      inlineKeys(line, valueStart, full, index, keys);
    }
    multiline = openMultilineString(line, valueStart);
  }
  return keys;
}

/** The keys of the inline table opening at `open`, nested ones too; returns the index past it. */
function inlineKeys(
  line: string,
  open: number,
  prefix: string[],
  index: number,
  keys: TomlKey[],
): number {
  let i = skipSpace(line, open + 1);
  while (i < line.length && line[i] !== "}") {
    const path = readKeyPath(line, i);
    if (!path || line[path.end] !== "=") {
      return line.length;
    }
    const full = [...prefix, ...path.segments.map((segment) => segment.key)];
    keys.push({ kind: "inline", path: full, segments: path.segments, index, line: index + 1 });
    const valueStart = skipSpace(line, path.end + 1);
    i = skipSpace(
      line,
      line[valueStart] === "{"
        ? inlineKeys(line, valueStart, full, index, keys)
        : skipValue(line, valueStart),
    );
    if (line[i] === ",") {
      i = skipSpace(line, i + 1);
    }
  }
  return i + 1;
}

/** The index past one value on a line: a string, an array or inline table, or a bare word. */
function skipValue(line: string, from: number): number {
  let depth = 0;
  let i = from;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"' || ch === "'") {
      i = skipString(line, i);
      continue;
    }
    if (ch === "[" || ch === "{") {
      depth++;
    } else if (ch === "]" || ch === "}") {
      if (depth === 0) {
        return i;
      }
      depth--;
    } else if ((ch === "," || ch === "#") && depth === 0) {
      return i;
    }
    i++;
  }
  return i;
}

/** The index past the string opening at `open`. */
function skipString(line: string, open: number): number {
  const quote = line[open];
  let j = open + 1;
  while (j < line.length && line[j] !== quote) {
    j += quote === '"' && line[j] === "\\" ? 2 : 1;
  }
  return j + 1;
}

/**
 * Renames the keys directly under one TOML table in place, keeping the rest
 * of the file byte for byte. It leaves values alone; a layout it does not
 * rewrite, such as an inline table, is left unchanged for the caller to
 * detect.
 */
export function renameTableKeys(
  source: string,
  table: string,
  rename: (key: string) => string | undefined,
): string {
  const lines = source.split("\n");
  for (const key of scanTomlKeys(source)) {
    if (key.path[0] !== table || key.path.length < 2) {
      continue;
    }
    // The segment naming the key under `table`: the second of the full path, wherever it is written.
    const at = key.segments.length - (key.path.length - 1);
    if (key.kind !== "inline" && at >= 0) {
      lines[key.index] = renameSegment(lines[key.index] ?? "", key.segments[at], rename);
    }
  }
  return lines.join("\n");
}

function renameSegment(
  line: string,
  segment: KeySegment | undefined,
  rename: (key: string) => string | undefined,
): string {
  const next = segment && rename(segment.key);
  if (!segment || next === undefined || next === segment.key) {
    return line;
  }
  return `${line.slice(0, segment.start)}${segment.quote}${next}${segment.quote}${line.slice(segment.end)}`;
}

/** Reads `a . "b" . 'c'` from `from`; `end` is the first non-space after it. */
function readKeyPath(
  line: string,
  from: number,
): { segments: KeySegment[]; end: number } | undefined {
  const segments: KeySegment[] = [];
  let i = skipSpace(line, from);
  for (;;) {
    const segment = readKeySegment(line, i);
    if (!segment) {
      return undefined;
    }
    segments.push(segment);
    i = skipSpace(line, segment.end);
    if (line[i] !== ".") {
      return { segments, end: i };
    }
    i = skipSpace(line, i + 1);
  }
}

/**
 * One key segment. A quoted key with an escape keeps its raw text as `key`,
 * so it matches nothing a caller renames.
 */
function readKeySegment(line: string, i: number): KeySegment | undefined {
  const quote = line[i];
  if (quote === '"' || quote === "'") {
    let j = i + 1;
    while (j < line.length && line[j] !== quote) {
      j += quote === '"' && line[j] === "\\" ? 2 : 1;
    }
    if (j >= line.length) {
      return undefined;
    }
    return { start: i, end: j + 1, key: line.slice(i + 1, j), quote };
  }
  const bare = /^[A-Za-z0-9_-]+/.exec(line.slice(i));
  return bare ? { start: i, end: i + bare[0].length, key: bare[0], quote: "" } : undefined;
}

/** The delimiter of a multi-line string the value opens and does not close on this line. */
function openMultilineString(line: string, valueStart: number): string | undefined {
  const delimiter = line.slice(valueStart, valueStart + 3);
  if (delimiter !== '"""' && delimiter !== "'''") {
    return undefined;
  }
  return line.includes(delimiter, valueStart + 3) ? undefined : delimiter;
}

function skipSpace(line: string, i: number): number {
  let j = i;
  while (line[j] === " " || line[j] === "\t") {
    j++;
  }
  return j;
}

/**
 * Sets one string key directly under a TOML table, or removes it when `value`
 * is undefined, keeping every other line byte for byte. A missing table is
 * added at the end; a table left with no keys and nothing but blank lines is
 * removed.
 */
export function setTableKey(
  source: string,
  table: string,
  key: string,
  value: string | undefined,
): string {
  const lines = source.split("\n");
  const scanned = scanTomlKeys(source);
  const header = scanned.find(
    (entry) => entry.kind === "table" && entry.path.length === 1 && entry.path[0] === table,
  )?.index;
  const end =
    header === undefined
      ? lines.length
      : (scanned.find(
          (entry) => entry.kind !== "key" && entry.kind !== "inline" && entry.index > header,
        )?.index ?? lines.length);
  const keys = scanned.filter(
    (entry) =>
      header !== undefined && entry.kind === "key" && entry.index > header && entry.index < end,
  );
  const found = keys.find(
    (entry) => entry.segments.length === 1 && entry.segments[0]?.key === key,
  )?.index;

  const entry = `${JSON.stringify(key)} = ${JSON.stringify(value)}`;
  if (value !== undefined) {
    if (found !== undefined) {
      lines[found] = replaceStringValue(lines[found] ?? "", entry);
      return lines.join("\n");
    }
    if (header !== undefined) {
      lines.splice((keys.at(-1)?.index ?? header) + 1, 0, entry);
      return lines.join("\n");
    }
    const body = source.replace(/\n+$/, "");
    return `${body}${body ? "\n\n" : ""}[${table}]\n${entry}\n`;
  }

  if (found === undefined || header === undefined) {
    return source;
  }
  const rest = lines.slice(header + 1, end).filter((_, offset) => header + 1 + offset !== found);
  if (keys.length > 1 || rest.some((line) => line.trim() !== "")) {
    lines.splice(found, 1);
    return lines.join("\n");
  }
  const last = end === lines.length;
  lines.splice(header, end - header);
  const joined = lines.join("\n");
  return last ? `${joined.replace(/\n+$/, "")}\n` : joined;
}

/** `line` with its value replaced by the one in `entry`, keeping indent and a trailing comment. */
function replaceStringValue(line: string, entry: string): string {
  const eq = line.indexOf("=");
  const valueStart = skipSpace(line, eq + 1);
  let valueEnd = valueStart;
  const quote = line[valueStart];
  if (quote === '"' || quote === "'") {
    valueEnd = valueStart + 1;
    while (valueEnd < line.length && line[valueEnd] !== quote) {
      valueEnd += quote === '"' && line[valueEnd] === "\\" ? 2 : 1;
    }
    valueEnd++;
  } else {
    const comment = line.indexOf("#", valueStart);
    valueEnd = comment === -1 ? line.length : comment;
    while (valueEnd > valueStart && /\s/.test(line[valueEnd - 1] ?? "")) {
      valueEnd--;
    }
  }
  const value = entry.slice(entry.indexOf("=") + 1).trim();
  return `${line.slice(0, valueStart)}${value}${line.slice(valueEnd)}`;
}
