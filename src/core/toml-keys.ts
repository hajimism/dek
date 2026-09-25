/**
 * Renames the keys directly under one TOML table in place, keeping the rest
 * of the file byte for byte. It reads table headers and (dotted) keys, skips
 * comments and multi-line strings, and leaves values alone; a layout it does
 * not read, such as an inline table, is left unchanged for the caller to
 * detect.
 */
export function renameTableKeys(
  source: string,
  table: string,
  rename: (key: string) => string | undefined,
): string {
  const lines = source.split("\n");
  let current: string[] = [];
  let multiline: string | undefined;
  for (const [index, line] of lines.entries()) {
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
      const open = line[start + 1] === "[" ? start + 2 : start + 1;
      const path = readKeyPath(line, open);
      if (!path || line[path.end] !== "]") {
        continue;
      }
      current = path.segments.map((segment) => segment.key);
      lines[index] = renameSegment(line, path.segments, 1, table, rename);
      continue;
    }
    const path = readKeyPath(line, start);
    if (!path || line[path.end] !== "=") {
      continue;
    }
    const full = [...current, ...path.segments.map((segment) => segment.key)];
    if (full[0] === table && current.length <= 1) {
      lines[index] = renameSegment(line, path.segments, 1 - current.length, table, rename, full);
    }
    multiline = openMultilineString(line, skipSpace(line, path.end + 1));
  }
  return lines.join("\n");
}

type KeySegment = { start: number; end: number; key: string; quote: string };

function renameSegment(
  line: string,
  segments: KeySegment[],
  at: number,
  table: string,
  rename: (key: string) => string | undefined,
  full = segments.map((segment) => segment.key),
): string {
  const segment = segments[at];
  if (!segment || full[0] !== table) {
    return line;
  }
  const next = rename(segment.key);
  if (next === undefined || next === segment.key) {
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
  let header: number | undefined;
  let end = lines.length;
  const keys: number[] = [];
  let found: number | undefined;
  let current: string[] = [];
  let multiline: string | undefined;
  for (const [index, line] of lines.entries()) {
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
      const open = line[start + 1] === "[" ? start + 2 : start + 1;
      const path = readKeyPath(line, open);
      current = path ? path.segments.map((segment) => segment.key) : [];
      if (header !== undefined && end === lines.length) {
        end = index;
      }
      if (open === start + 1 && current.length === 1 && current[0] === table) {
        header = index;
      }
      continue;
    }
    const path = readKeyPath(line, start);
    if (!path || line[path.end] !== "=") {
      continue;
    }
    if (header !== undefined && end === lines.length && current[0] === table) {
      keys.push(index);
      if (path.segments.length === 1 && path.segments[0]?.key === key) {
        found = index;
      }
    }
    multiline = openMultilineString(line, skipSpace(line, path.end + 1));
  }

  const entry = `${JSON.stringify(key)} = ${JSON.stringify(value)}`;
  if (value !== undefined) {
    if (found !== undefined) {
      lines[found] = replaceStringValue(lines[found] ?? "", entry);
      return lines.join("\n");
    }
    if (header !== undefined) {
      lines.splice((keys.at(-1) ?? header) + 1, 0, entry);
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
