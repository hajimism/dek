/**
 * The one way dek steps through CSS text, as the CSS tokenizer reads it: strings, comments, and
 * an unquoted `url()` are opaque, CR, FF, and CRLF are newlines as LF is, and a newline ends an
 * unclosed string. Every scanner in css.ts, css-transform.ts, and theme-excerpt.ts is built on
 * these, so none of them can disagree about where a string or a block ends. Nothing is rewritten
 * before it is read, so every index still points into the text as written.
 */

/** A newline as CSS preprocesses its input: LF, CR, or FF; CRLF is one, read at its CR. */
function isNewline(ch: string | undefined): boolean {
  return ch === "\n" || ch === "\r" || ch === "\f";
}

function isWhitespace(ch: string | undefined): boolean {
  return ch === " " || ch === "\t" || isNewline(ch);
}

/** The index just past the whitespace at `i`, taking CRLF whole. */
function whitespaceEnd(source: string, i: number, end: number): number {
  return Math.min(source[i] === "\r" && source[i + 1] === "\n" ? i + 2 : i + 1, end);
}

function skipWhitespace(source: string, i: number, end: number): number {
  let j = i;
  while (j < end && isWhitespace(source[j])) {
    j++;
  }
  return j;
}

/** Whether a `\` at `i` escapes what follows: anything but a newline, the end included. */
function startsEscape(source: string, i: number, end: number): boolean {
  return source[i] === "\\" && (i + 1 >= end || !isNewline(source[i + 1]));
}

const HEX_RE = /[0-9a-fA-F]/;

/** The index just past the escape at `i`: one code point, or up to six hex digits and a space. */
function consumeEscape(source: string, i: number, end: number): number {
  let j = i + 1;
  if (j >= end || !HEX_RE.test(source[j] ?? "")) {
    return Math.min(j + 1, end);
  }
  while (j < end && j < i + 7 && HEX_RE.test(source[j] ?? "")) {
    j++;
  }
  return j < end && isWhitespace(source[j]) ? whitespaceEnd(source, j, end) : j;
}

/** The index just past the string that opens at `start`, or the newline that cuts it short. */
export function consumeString(source: string, start: number, end = source.length): number {
  const quote = source[start];
  let i = start + 1;
  while (i < end) {
    const ch = source[i];
    if (ch === "\\") {
      // A `\` before a newline carries the string on to the next line.
      i = startsEscape(source, i, end)
        ? consumeEscape(source, i, end)
        : whitespaceEnd(source, i + 1, end);
      continue;
    }
    if (ch === quote) {
      return i + 1;
    }
    if (isNewline(ch)) {
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

const NAME_RE = /[-\w\u0080-\uffff]/;

/** A code point of a name: a letter, a digit, `-`, `_`, non-ASCII, or NUL, which CSS reads as U+FFFD. */
function isNameChar(ch: string | undefined): boolean {
  return ch === "\0" || NAME_RE.test(ch ?? "");
}

/** The index just past the name at `i`: letters, digits, `-`, `_`, non-ASCII, and escapes. */
function consumeName(source: string, i: number, end: number): number {
  let j = i;
  while (j < end) {
    if (startsEscape(source, j, end)) {
      j = consumeEscape(source, j, end);
    } else if (isNameChar(source[j])) {
      j++;
    } else {
      break;
    }
  }
  return j;
}

/** Whether a name reads `url` once its escapes are resolved, as `URL` or `u\72l` does. */
function isUrlName(name: string): boolean {
  const read = name.includes("\\")
    ? name.replace(/\\(?:([0-9a-fA-F]{1,6})(?:\r\n|[ \t\n\r\f])?|([\s\S]))/g, (_, hex, ch) => {
        const code = hex === undefined ? -1 : Number.parseInt(hex, 16);
        return code < 0 ? ch : code > 0x10ffff ? "\ufffd" : String.fromCodePoint(code);
      })
    : name;
  return read.toLowerCase() === "url";
}

function isNonPrintable(ch: string): boolean {
  const code = ch.charCodeAt(0);
  // NUL is no control character here: CSS reads it as U+FFFD.
  return (
    (code >= 0x01 && code <= 0x08) ||
    code === 0x0b ||
    (code >= 0x0e && code <= 0x1f) ||
    code === 0x7f
  );
}

/**
 * The index just past an unquoted `url()` whose address starts at `start`, after its `(`; none
 * when the address is quoted, which makes it a function holding a string. A broken one, with a
 * space, a quote, a `(`, or a control character in its address, still runs to its `)`.
 */
function consumeUrl(source: string, start: number, end: number): number | undefined {
  let i = skipWhitespace(source, start, end);
  if (i < end && (source[i] === '"' || source[i] === "'")) {
    return undefined;
  }
  let broken = false;
  while (i < end) {
    const ch = source[i] ?? "";
    if (ch === ")") {
      return i + 1;
    }
    if (startsEscape(source, i, end)) {
      i = consumeEscape(source, i, end);
      continue;
    }
    if (!broken && isWhitespace(ch)) {
      i = skipWhitespace(source, i, end);
      broken = i < end && source[i] !== ")";
      continue;
    }
    broken ||= ch === '"' || ch === "'" || ch === "(" || ch === "\\" || isNonPrintable(ch);
    i++;
  }
  return end;
}

/**
 * The index just past the token that starts at `i`, as far as dek tells tokens apart: a string,
 * a comment, an unquoted `url()`, or a name with its escapes, so the `url` of `myurl(` or
 * `10url(` opens nothing. Any other code point is a token of its own. A `\` before a newline,
 * which escapes nothing, takes the newline with it, so no rewrite can make an escape of the two.
 */
export function consumeToken(source: string, i: number, end = source.length): number {
  const ch = source[i];
  if (ch === '"' || ch === "'") {
    return consumeString(source, i, end);
  }
  if (isCommentStart(source, i)) {
    return consumeComment(source, i, end);
  }
  if (ch === "\\" && !startsEscape(source, i, end)) {
    return whitespaceEnd(source, i + 1, end);
  }
  if (!startsEscape(source, i, end) && !isNameChar(ch)) {
    return i + 1;
  }
  const nameEnd = consumeName(source, i, end);
  // `#url(` is a hash and `@url(` an at-rule's name, not a url().
  const url =
    nameEnd < end &&
    source[nameEnd] === "(" &&
    source[i - 1] !== "#" &&
    source[i - 1] !== "@" &&
    isUrlName(source.slice(i, nameEnd));
  return (url && consumeUrl(source, nameEnd + 1, end)) || nameEnd;
}

/**
 * The first index from `start` whose character is one of `stops` outside strings, comments,
 * `url()`s, and `()`/`[]`; `end` when there is none. An opening brace counts only when `{` is a
 * stop. Stops are punctuation, which no name holds.
 */
export function scanTopLevel(source: string, start: number, end: number, stops: string): number {
  let depth = 0;
  let i = start;
  while (i < end) {
    const ch = source[i] ?? "";
    if (depth === 0 && stops.includes(ch)) {
      return i;
    }
    if (ch === "(" || ch === "[") {
      depth++;
    } else if ((ch === ")" || ch === "]") && depth > 0) {
      depth--;
    }
    i = consumeToken(source, i, end);
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

/** The text with each comment removed, strings and `url()`s kept byte for byte. */
export function stripComments(source: string): string {
  return replaceOpaque(source, { comment: () => "" });
}

/**
 * The text with each string and comment blanked to spaces, newlines kept, so only CSS syntax is
 * left and every offset still points where it did. A `url()` is left as written.
 */
export function blankStringsAndComments(source: string): string {
  const blank = (text: string) => text.replace(/[^\n\r\f]/g, " ");
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
    const next = consumeToken(source, i);
    const ch = source[i];
    const replacer =
      ch === '"' || ch === "'"
        ? replace.string
        : isCommentStart(source, i)
          ? replace.comment
          : undefined;
    if (replacer) {
      out += source.slice(from, i) + replacer(source.slice(i, next));
      from = next;
    }
    i = next;
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

/** Each whole identifier in a value outside strings and comments, with where it starts. */
export function cssIdents(value: string): Array<{ ident: string; start: number }> {
  const bare = blankStringsAndComments(value);
  return [...bare.matchAll(/-?[_a-zA-Z\u0080-\uffff][-\w\u0080-\uffff]*/g)].map((match) => ({
    ident: match[0],
    start: match.index,
  }));
}
