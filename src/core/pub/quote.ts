/**
 * Where a passage a comment on dek.pub quotes is in script.md now. A reader quotes the article,
 * Markdown rendered as text, so the passage is looked for in the source as text: emphasis and code
 * marks, brackets, a link's address, and HTML comments left out, and every run of white space,
 * a line break included, read as one space. The quote is read the same way. Among several places,
 * the one whose text before and after matches the quote's prefix and suffix wins.
 */

/** Characters that mark Markdown up rather than say anything, dropped on both sides. */
const MARKS = new Set(["*", "_", "`", "~", "[", "]"]);

type Projection = { text: string; at: number[] };

/** `source`'s text as a reader sees it, and where each of its characters is in `source`. */
function project(source: string): Projection {
  let text = "";
  const at: number[] = [];
  let space = false;
  let i = 0;
  while (i < source.length) {
    if (source.startsWith("<!--", i)) {
      const end = source.indexOf("-->", i + 4);
      i = end < 0 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("](", i)) {
      const end = source.indexOf(")", i + 2);
      i = end < 0 ? source.length : end + 1;
      continue;
    }
    const char = source[i] ?? "";
    if (char === "!" && source[i + 1] === "[") {
      i += 1;
      continue;
    }
    if (MARKS.has(char)) {
      i += 1;
      continue;
    }
    if (/\s/.test(char)) {
      space = text !== "";
      i += 1;
      continue;
    }
    if (space) {
      text += " ";
      at.push(i);
      space = false;
    }
    text += char;
    at.push(i);
    i += 1;
  }
  return { text, at };
}

function normalize(text: string): string {
  return project(text).text;
}

export type QuotePlace = { line: number; column: number };

/**
 * The line and column, 1-based in UTF-16 units, where `quote` starts in `source` between lines
 * `from` and `to` (both 1-based, inclusive), or undefined when it is not there.
 */
export function locateQuote(
  source: string,
  target: { quote: string; prefix: string; suffix: string },
  range: { from: number; to: number },
): QuotePlace | undefined {
  const lines = source.split("\n");
  const start = lines.slice(0, range.from - 1).reduce((sum, line) => sum + line.length + 1, 0);
  const end = lines.slice(0, range.to).reduce((sum, line) => sum + line.length + 1, 0);
  const { text, at } = project(source.slice(start, end));
  const quote = normalize(target.quote);
  if (quote === "") {
    return undefined;
  }
  const prefix = normalize(target.prefix);
  const suffix = normalize(target.suffix);
  let best: { index: number; score: number } | undefined;
  for (let index = text.indexOf(quote); index >= 0; index = text.indexOf(quote, index + 1)) {
    const before = text.slice(0, index).trimEnd();
    const after = text.slice(index + quote.length).trimStart();
    const score =
      (prefix !== "" && before.endsWith(prefix.trimEnd()) ? 1 : 0) +
      (suffix !== "" && after.startsWith(suffix.trimStart()) ? 1 : 0);
    if (best === undefined || score > best.score) {
      best = { index, score };
    }
  }
  if (best === undefined) {
    return undefined;
  }
  const offset = start + (at[best.index] ?? 0);
  const head = source.slice(0, offset);
  const line = head.split("\n").length;
  return { line, column: offset - (head.lastIndexOf("\n") + 1) + 1 };
}
