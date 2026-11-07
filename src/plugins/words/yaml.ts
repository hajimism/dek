/**
 * The YAML words.yaml is written in: block mappings and sequences of plain words as keys, and
 * scalars that are plain, single-quoted, or double-quoted, `[]`, or `{}`. Anything else is refused
 * with its line. A copy of dek-study's reader, since an official plugin shares no code (ADR 34).
 */

/** YAML this reader does not read, and the line it starts on. */
export class YamlError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
  }
}

type Line = { indent: number; text: string; line: number };

/** The value, and the line each mapping in it starts on. */
export function parseYaml(source: string): {
  value: unknown;
  lineOf: (mapping: object) => number | undefined;
} {
  const lines = toLines(source);
  const starts = new WeakMap<object, number>();
  const lineOf = (mapping: object) => starts.get(mapping);
  const first = lines[0];
  if (first === undefined) {
    return { value: null, lineOf };
  }
  const [value, next] = block(lines, 0, first.indent, starts);
  const extra = lines[next];
  if (extra !== undefined) {
    throw new YamlError("this line is indented less than the lines before it", extra.line);
  }
  return { value, lineOf };
}

function toLines(source: string): Line[] {
  // A byte order mark, as Notepad on Windows saves, is no part of the first line.
  return source
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .flatMap((raw, index): Line[] => {
      const line = index + 1;
      const text = withoutComment(raw);
      if (text.trim() === "") {
        return [];
      }
      const indent = text.length - text.trimStart().length;
      if (/^\s*\t/.test(text) || text.slice(0, indent).includes("\t")) {
        throw new YamlError("indent with spaces, not tabs", line);
      }
      return [{ indent, text: text.trim(), line }];
    });
}

/**
 * The line up to a `#` that starts a comment: at the start, or after a space, outside quotes. A
 * quote opens a quoted value only where a value starts, so `don't` in a plain value opens none.
 */
function withoutComment(raw: string): string {
  let quote: string | undefined;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (quote === '"' && char === "\\") {
      i += 1;
    } else if (quote === "'" && char === "'" && raw[i + 1] === "'") {
      i += 1;
    } else if (quote !== undefined) {
      if (char === quote) {
        quote = undefined;
      }
    } else if ((char === '"' || char === "'") && VALUE_START.test(raw.slice(0, i))) {
      quote = char;
    } else if (char === "#" && (i === 0 || /\s/.test(raw[i - 1] ?? ""))) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

/** What comes before a value: the line's start, a key's colon, or an item's dash. */
const VALUE_START = /(?:^|:|(?:^|\s)-)\s*$/;

const ITEM = /^-(?:\s+(.*))?$/;
const KEY = /^([A-Za-z0-9_-]+)\s*:(?:\s+(.*))?$/;

function block(
  lines: Line[],
  start: number,
  indent: number,
  starts: WeakMap<object, number>,
): [unknown, number] {
  const line = lines[start] as Line;
  return ITEM.test(line.text)
    ? sequence(lines, start, indent, starts)
    : mapping(lines, start, indent, starts);
}

function sequence(
  lines: Line[],
  start: number,
  indent: number,
  starts: WeakMap<object, number>,
): [unknown[], number] {
  const items: unknown[] = [];
  let i = start;
  for (let line = lines[i]; line?.indent === indent; line = lines[i]) {
    const match = line.text.match(ITEM);
    if (!match) {
      break;
    }
    const rest = match[1];
    if (rest === undefined) {
      // `-` alone: the item is the block below it.
      const below = lines[i + 1];
      if (below !== undefined && below.indent > indent) {
        const [value, next] = block(lines, i + 1, below.indent, starts);
        items.push(value);
        i = next;
      } else {
        items.push(null);
        i += 1;
      }
    } else if (KEY.test(rest)) {
      // `- key: value` starts a mapping whose keys line up after the dash.
      const column = indent + (line.text.length - rest.length);
      const shifted = [...lines];
      shifted[i] = { indent: column, text: rest, line: line.line };
      const [value, next] = mapping(shifted, i, column, starts);
      items.push(value);
      i = next;
    } else {
      items.push(scalar(rest, line.line));
      i += 1;
    }
  }
  return [items, i];
}

function mapping(
  lines: Line[],
  start: number,
  indent: number,
  starts: WeakMap<object, number>,
): [Record<string, unknown>, number] {
  const result: Record<string, unknown> = {};
  starts.set(result, (lines[start] as Line).line);
  let i = start;
  for (let line = lines[i]; line?.indent === indent; line = lines[i]) {
    const match = line.text.match(KEY);
    if (!match) {
      throw new YamlError("expected `key: value`", line.line);
    }
    const key = match[1] as string;
    if (Object.hasOwn(result, key)) {
      throw new YamlError(`\`${key}\` is written twice`, line.line);
    }
    const rest = match[2];
    const below = lines[i + 1];
    if (rest !== undefined) {
      result[key] = scalar(rest, line.line);
      i += 1;
    } else if (below !== undefined && below.indent > indent) {
      [result[key], i] = block(lines, i + 1, below.indent, starts);
    } else if (below !== undefined && below.indent === indent && ITEM.test(below.text)) {
      // A sequence may sit at its key's own indent.
      [result[key], i] = sequence(lines, i + 1, indent, starts);
    } else {
      result[key] = null;
      i += 1;
    }
  }
  const deeper = lines[i];
  if (deeper !== undefined && deeper.indent > indent) {
    throw new YamlError("this line is indented more than the lines before it", deeper.line);
  }
  return [result, i];
}

function scalar(text: string, line: number): unknown {
  if (text.startsWith('"')) {
    return quoted(text, line, /^"((?:[^"\\]|\\.)*)"$/, (inner) => JSON.parse(`"${inner}"`));
  }
  if (text.startsWith("'")) {
    return quoted(text, line, /^'((?:[^']|'')*)'$/, (inner) => inner.replaceAll("''", "'"));
  }
  if (text === "[]") {
    return [];
  }
  if (text === "{}") {
    return {};
  }
  if (/^[[{&*!|>%@`]/.test(text)) {
    throw new YamlError(`dek-words reads no YAML that starts a value with ${text[0]}`, line);
  }
  if (/^-?\d+$/.test(text)) {
    return Number(text);
  }
  if (text === "null" || text === "~") {
    return null;
  }
  if (text === "true" || text === "false") {
    return text === "true";
  }
  return text;
}

function quoted(
  text: string,
  line: number,
  pattern: RegExp,
  read: (inner: string) => string,
): string {
  const inner = text.match(pattern)?.[1];
  if (inner === undefined) {
    throw new YamlError("a quoted value must end with its quote on the same line", line);
  }
  try {
    return read(inner);
  } catch {
    throw new YamlError("a double-quoted value has an escape dek-words does not read", line);
  }
}
