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
  const lines = source.split("\n");
  const keys: TomlKey[] = [];
  let table: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const header = readHeader(line);
    if (header) {
      table = names(header.segments);
      keys.push(keyAt(header.kind, table, header.segments, index));
      continue;
    }
    // Blank lines, comments, and anything else that is not `key = value` fail here.
    const assignment = readAssignment(line, 0);
    if (!assignment) {
      continue;
    }
    const path = [...table, ...names(assignment.segments)];
    keys.push(keyAt("key", path, assignment.segments, index));
    if (line[assignment.value] === "{") {
      inlineKeys(line, assignment.value, path, index, keys);
    }
    index = valueLastLine(lines, index, assignment.value);
  }
  return keys;
}

function keyAt(
  kind: TomlKey["kind"],
  path: string[],
  segments: KeySegment[],
  index: number,
): TomlKey {
  return { kind, path, segments, index, line: index + 1 };
}

function names(segments: KeySegment[]): string[] {
  return segments.map((segment) => segment.key);
}

/** A `[table]` or `[[array]]` header line. */
function readHeader(line: string): { kind: "table" | "array"; segments: KeySegment[] } | undefined {
  const open = skipSpace(line, 0);
  if (line[open] !== "[") {
    return undefined;
  }
  const kind = line[open + 1] === "[" ? "array" : "table";
  const path = readKeyPath(line, open + (kind === "array" ? 2 : 1));
  return path && line[path.end] === "]" ? { kind, segments: path.segments } : undefined;
}

/** A `key =` from `from`; `value` is where its value starts. */
function readAssignment(
  line: string,
  from: number,
): { segments: KeySegment[]; value: number } | undefined {
  const path = readKeyPath(line, from);
  if (!path || line[path.end] !== "=") {
    return undefined;
  }
  return { segments: path.segments, value: skipSpace(line, path.end + 1) };
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
    const assignment = readAssignment(line, i);
    if (!assignment) {
      return line.length;
    }
    const path = [...prefix, ...names(assignment.segments)];
    keys.push(keyAt("inline", path, assignment.segments, index));
    const { value } = assignment;
    i = skipSpace(
      line,
      line[value] === "{" ? inlineKeys(line, value, path, index, keys) : skipValue(line, value),
    );
    if (line[i] === ",") {
      i = skipSpace(line, i + 1);
    }
  }
  return i + 1;
}

const NESTING: Record<string, number> = { "[": 1, "{": 1, "]": -1, "}": -1 };
const VALUE_ENDS = new Set([",", "#", "]", "}"]);

/** The index past one value on a line: a string, an array or inline table, or a bare word. */
function skipValue(line: string, from: number): number {
  let depth = 0;
  let i = from;
  while (i < line.length) {
    const ch = line[i] ?? "";
    if (depth === 0 && VALUE_ENDS.has(ch)) {
      return i;
    }
    depth += NESTING[ch] ?? 0;
    i = isQuote(ch) ? skipString(line, i) : i + 1;
  }
  return i;
}

/**
 * The line the value starting at `start` ends on: its own, unless it opens a multi-line string it
 * does not close there. An unclosed one runs to the end of the file.
 */
function valueLastLine(lines: string[], index: number, start: number): number {
  const line = lines[index] ?? "";
  const delimiter = tripleQuote(line, start);
  if (!delimiter || line.includes(delimiter, start + 3)) {
    return index;
  }
  const close = lines.findIndex((next, i) => i > index && next.includes(delimiter));
  return close === -1 ? lines.length - 1 : close;
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
  const quote = line[i] ?? "";
  if (isQuote(quote)) {
    const end = skipString(line, i);
    return end > line.length
      ? undefined
      : { start: i, end, key: line.slice(i + 1, end - 1), quote };
  }
  const bare = /^[A-Za-z0-9_-]+/.exec(line.slice(i));
  return bare ? { start: i, end: i + bare[0].length, key: bare[0], quote: "" } : undefined;
}

/** The index past the string opening at `open`; past the end of the line when it does not close. */
function skipString(line: string, open: number): number {
  const quote = line[open];
  let j = open + 1;
  while (j < line.length && line[j] !== quote) {
    j += quote === '"' && line[j] === "\\" ? 2 : 1;
  }
  return j + 1;
}

function isQuote(ch: string | undefined): boolean {
  return ch === '"' || ch === "'";
}

/** The `"""` or `'''` opening a multi-line string at `at`, if one does. */
function tripleQuote(line: string, at: number): string | undefined {
  const delimiter = line.slice(at, at + 3);
  return delimiter === '"""' || delimiter === "'''" ? delimiter : undefined;
}

function skipSpace(line: string, i: number): number {
  let j = i;
  while (line[j] === " " || line[j] === "\t") {
    j++;
  }
  return j;
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

/** Where a `[table]` is: its header line, the line of the next header, and the keys between. */
type Section = { header: number; end: number; keys: TomlKey[] };

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
  const section = findSection(scanTomlKeys(source), table, lines.length);
  const entry = `${JSON.stringify(key)} = ${JSON.stringify(value)}`;
  if (!section) {
    return value === undefined ? source : appendTable(source, table, entry);
  }
  const found = section.keys.find(
    (scanned) => scanned.segments.length === 1 && scanned.segments[0]?.key === key,
  )?.index;
  if (value === undefined) {
    return found === undefined ? source : removeKey(lines, section, found);
  }
  if (found === undefined) {
    const last = section.keys.at(-1);
    const after = last ? valueSpan(lines, last.index).last : section.header;
    lines.splice(after + 1, 0, entry);
  } else {
    replaceValue(lines, found, JSON.stringify(value));
  }
  return lines.join("\n");
}

function findSection(scanned: TomlKey[], table: string, lineCount: number): Section | undefined {
  const header = scanned.find(
    (entry) => entry.kind === "table" && entry.path.length === 1 && entry.path[0] === table,
  )?.index;
  if (header === undefined) {
    return undefined;
  }
  const end =
    scanned.find(
      (entry) => (entry.kind === "table" || entry.kind === "array") && entry.index > header,
    )?.index ?? lineCount;
  const keys = scanned.filter(
    (entry) => entry.kind === "key" && entry.index > header && entry.index < end,
  );
  return { header, end, keys };
}

function appendTable(source: string, table: string, entry: string): string {
  const body = source.replace(/\n+$/, "");
  return `${body}${body ? "\n\n" : ""}[${table}]\n${entry}\n`;
}

/** Removes the key on line `found`, and its table too when nothing but blank lines would remain. */
function removeKey(lines: string[], section: Section, found: number): string {
  const { header, end } = section;
  const { last } = valueSpan(lines, found);
  const rest = [...lines.slice(header + 1, found), ...lines.slice(last + 1, end)];
  if (rest.some((line) => line.trim() !== "")) {
    lines.splice(found, last - found + 1);
    return lines.join("\n");
  }
  const atEnd = end === lines.length;
  lines.splice(header, end - header);
  const joined = lines.join("\n");
  return atEnd ? `${joined.replace(/\n+$/, "")}\n` : joined;
}

/** Where the value of the key on line `index` starts, and the line it ends on. */
function valueSpan(lines: string[], index: number): { start: number; last: number } {
  const line = lines[index] ?? "";
  const start = readAssignment(line, 0)?.value ?? line.length;
  return { start, last: valueLastLine(lines, index, start) };
}

/** Replaces the value of the key on line `index`, keeping its indent and a trailing comment. */
function replaceValue(lines: string[], index: number, value: string): void {
  const { start, last } = valueSpan(lines, index);
  // A multi-line value collapses onto its first line.
  const text = lines.slice(index, last + 1).join("\n");
  const replaced = `${text.slice(0, start)}${value}${text.slice(valueEnd(text, start))}`;
  lines.splice(index, last - index + 1, replaced);
}

/** The index past the value at `start`: a whole string, or a bare value up to its comment. */
function valueEnd(text: string, start: number): number {
  const delimiter = tripleQuote(text, start);
  if (delimiter) {
    const close = text.indexOf(delimiter, start + 3);
    return close === -1 ? text.length : close + 3;
  }
  if (isQuote(text[start])) {
    return skipString(text, start);
  }
  const comment = text.indexOf("#", start);
  return start + text.slice(start, comment === -1 ? text.length : comment).trimEnd().length;
}
