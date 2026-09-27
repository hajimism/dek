/**
 * The one way dek steps through CSS text: strings and comments are opaque, and a newline ends an
 * unclosed string, as the CSS tokenizer reads it. Every scanner in css.ts and lint/tokens.ts is built on
 * these, so none of them can disagree about where a string or a block ends.
 */

/** The index just past the string that opens at `start`, or the newline that cuts it short. */
export function consumeString(source: string, start: number, end = source.length): number {
  const quote = source[start];
  let i = start + 1;
  while (i < end) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) {
      return i + 1;
    }
    if (ch === "\n") {
      return i;
    }
    i++;
  }
  return end;
}

/** The index just past the comment that opens at `start`; an unclosed one runs to the end. */
export function consumeComment(source: string, start: number, end = source.length): number {
  const close = source.indexOf("*/", start + 2);
  return close === -1 || close + 2 > end ? end : close + 2;
}

function isCommentStart(source: string, i: number): boolean {
  return source[i] === "/" && source[i + 1] === "*";
}

/**
 * The first index from `start` whose character is one of `stops` outside strings, comments, and
 * `()`/`[]`; `end` when there is none. An opening brace counts only when `{` is a stop.
 */
export function scanTopLevel(source: string, start: number, end: number, stops: string): number {
  let depth = 0;
  let i = start;
  while (i < end) {
    const ch = source[i] ?? "";
    if (ch === '"' || ch === "'") {
      i = consumeString(source, i, end);
      continue;
    }
    if (isCommentStart(source, i)) {
      i = consumeComment(source, i, end);
      continue;
    }
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (depth === 0 && stops.includes(ch)) {
      return i;
    }
    if (ch === "(" || ch === "[") {
      depth++;
    } else if ((ch === ")" || ch === "]") && depth > 0) {
      depth--;
    }
    i++;
  }
  return end;
}

/** The index of the `}` that closes the block opening at `open`, or `end` when it never closes. */
export function matchBrace(source: string, open: number, end = source.length): number {
  let depth = 0;
  let i = open;
  while (i < end) {
    i = scanTopLevel(source, i, end, "{}");
    if (source[i] === "{") {
      depth++;
    } else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
    i++;
  }
  return end;
}

/** The text with each comment removed, strings kept byte for byte. */
export function stripComments(source: string): string {
  return replaceOpaque(source, { comment: () => "" });
}

/**
 * The text with each string and comment blanked to spaces, newlines kept, so only CSS syntax is
 * left and every offset still points where it did.
 */
export function blankStringsAndComments(source: string): string {
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
  return replaceOpaque(source, { comment: blank, string: blank });
}

function replaceOpaque(
  source: string,
  replace: { comment?: (text: string) => string; string?: (text: string) => string },
): string {
  let out = "";
  let from = 0;
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      const end = consumeString(source, i);
      if (replace.string) {
        out += source.slice(from, i) + replace.string(source.slice(i, end));
        from = end;
      }
      i = end;
      continue;
    }
    if (isCommentStart(source, i)) {
      const end = consumeComment(source, i);
      if (replace.comment) {
        out += source.slice(from, i) + replace.comment(source.slice(i, end));
        from = end;
      }
      i = end;
      continue;
    }
    i += ch === "\\" ? 2 : 1;
  }
  return out + source.slice(from);
}

/** Splits on top-level commas only, leaving `:is(.a, .b)` or `var(--a, b)` whole. */
export function splitTopLevel(text: string, separator = ","): string[] {
  const parts: string[] = [];
  let start = 0;
  for (;;) {
    const at = scanTopLevel(text, start, text.length, separator);
    parts.push(text.slice(start, at));
    if (at >= text.length) {
      return parts;
    }
    start = at + 1;
  }
}

/** One function call in a value, such as `var(--a, b)`: its name, its span, and what is inside. */
export type CssFunction = { name: string; start: number; end: number; args: string };

const IDENT_CHAR_RE = /[-\w]/;

/**
 * The function calls in a value, outer before inner, strings and comments skipped. A name counts
 * only whole, so `somevar(` is not `var(`; an unclosed call runs to the end.
 */
export function cssFunctions(value: string, offset = 0): CssFunction[] {
  const found: CssFunction[] = [];
  let i = 0;
  while (i < value.length) {
    const open = scanTopLevel(value, i, value.length, "(");
    if (open >= value.length) {
      break;
    }
    let nameStart = open;
    while (nameStart > i && IDENT_CHAR_RE.test(value[nameStart - 1] ?? "")) {
      nameStart--;
    }
    const close = scanTopLevel(value, open + 1, value.length, ")");
    const args = value.slice(open + 1, close);
    found.push({
      name: value.slice(nameStart, open).toLowerCase(),
      start: offset + nameStart,
      end: offset + Math.min(close + 1, value.length),
      args,
    });
    found.push(...cssFunctions(args, offset + open + 1));
    i = close + 1;
  }
  return found;
}

/** Each whole identifier in a value outside strings and comments, with where it starts. */
export function cssIdents(value: string): Array<{ ident: string; start: number }> {
  const bare = blankStringsAndComments(value);
  return [...bare.matchAll(/-?[_a-zA-Z\u0080-\uffff][-\w\u0080-\uffff]*/g)].map((match) => ({
    ident: match[0],
    start: match.index,
  }));
}
